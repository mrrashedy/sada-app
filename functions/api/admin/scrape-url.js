// /api/admin/scrape-url
//
// Auto-extract metadata (title, description, image) from an arbitrary news
// article URL. Used by the ManualFeedEditor "paste URL → auto-fill form"
// flow: editors paste an article URL, the server fetches the page and
// returns structured metadata they can then publish as a manual_feed_item.
//
// GET /api/admin/scrape-url?url=https%3A%2F%2Fexample.com%2Farticle
//
// Extraction order (highest fidelity first):
//   1) JSON-LD  NewsArticle / Article / BlogPosting schema
//   2) Open Graph meta tags (og:title, og:description, og:image)
//   3) Twitter Card meta tags (twitter:title, twitter:description, twitter:image)
//   4) HTML fallbacks (<title>, <meta name="description">, first <img>)
//
// Requires admin auth.

import { requireAdmin } from '../../_lib/admin.js';
import { jsonResponse, corsPreflight } from '../../_lib/auth.js';

export async function onRequest(context) {
  const { request } = context;
  if (request.method === 'OPTIONS') return corsPreflight();

  const guard = await requireAdmin(context);
  if (!guard.ok) return guard.response;

  const u = new URL(request.url);
  const target = u.searchParams.get('url');
  if (!target) {
    return jsonResponse({ ok: false, error: 'missing_url' }, { status: 400 });
  }

  // Basic sanity check: must be http/https
  let targetUrl;
  try {
    targetUrl = new URL(target);
    if (!/^https?:$/.test(targetUrl.protocol)) throw new Error('invalid_protocol');
  } catch {
    return jsonResponse({ ok: false, error: 'invalid_url' }, { status: 400 });
  }

  try {
    const meta = await scrapeUrl(targetUrl.toString());
    return jsonResponse({ ok: true, ...meta });
  } catch (e) {
    return jsonResponse({ ok: false, error: e.message || 'scrape_failed' }, { status: 502 });
  }
}

// ─── Core scraper ─────────────────────────────────────────────────────
async function scrapeUrl(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  let res;
  try {
    res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ar,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
      cf: { cacheTtl: 60, cacheEverything: true },
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!res.ok) throw new Error(`http_${res.status}`);
  const html = await res.text();

  const result = {
    url,
    title: '',
    description: '',
    image: '',
    publishedAt: '',
    siteName: '',
    source: '', // which extraction path won
  };

  // ── 1) JSON-LD ────────────────────────────────────────────────────
  const ldBlocks = [];
  const ldRegex = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let ldMatch;
  while ((ldMatch = ldRegex.exec(html)) !== null) {
    try {
      ldBlocks.push(JSON.parse(ldMatch[1].trim()));
    } catch { /* malformed — skip */ }
  }

  const visit = (node) => {
    if (!node || typeof node !== 'object' || result.title) return;
    if (Array.isArray(node)) { node.forEach(visit); return; }
    const t = node['@type'];
    const isArticle = t === 'NewsArticle' || t === 'Article' || t === 'BlogPosting' ||
      (Array.isArray(t) && t.some(x => /Article|BlogPosting/.test(x)));
    if (isArticle) {
      result.title = String(node.headline || node.name || '').trim();
      result.description = String(node.description || '').trim();
      let img = '';
      if (typeof node.image === 'string') img = node.image;
      else if (Array.isArray(node.image)) img = (typeof node.image[0] === 'string' ? node.image[0] : node.image[0]?.url) || '';
      else if (node.image && typeof node.image === 'object') img = node.image.url || '';
      result.image = img;
      result.publishedAt = String(node.datePublished || node.dateModified || '').trim();
      if (node.publisher && typeof node.publisher === 'object') {
        result.siteName = String(node.publisher.name || '').trim();
      }
      if (result.title) result.source = 'jsonld';
    }
    if (node['@graph']) visit(node['@graph']);
    if (node.itemListElement) visit(node.itemListElement);
    if (node.item) visit(node.item);
  };
  ldBlocks.forEach(visit);

  // ── 2) Open Graph meta ────────────────────────────────────────────
  // og:type is the decisive signal: "article" (or "news_article") means
  // it's a real piece of content, anything else (website, profile, video,
  // blog, etc.) is a listing / program / homepage. When og:type is present
  // and is NOT article-like, we SKIP the OG title entirely so a later
  // strict validation step can reject the page. When og:type is missing
  // we accept OG data — many valid articles just don't set og:type.
  const ogType = metaContent(html, 'property', 'og:type');
  const ogLooksArticle = !ogType || /^(article|news_article)/i.test(ogType);
  const ogTitle = metaContent(html, 'property', 'og:title');
  const ogDesc = metaContent(html, 'property', 'og:description');
  const ogImage = metaContent(html, 'property', 'og:image');
  const ogSiteName = metaContent(html, 'property', 'og:site_name');
  const ogTime = metaContent(html, 'property', 'article:published_time');

  if (!result.title && ogTitle && ogLooksArticle) { result.title = ogTitle; result.source = result.source || 'og'; }
  if (!result.description && ogDesc) { result.description = ogDesc; }
  if (!result.image && ogImage) { result.image = ogImage; }
  if (!result.siteName && ogSiteName) { result.siteName = ogSiteName; }
  if (!result.publishedAt && ogTime) { result.publishedAt = ogTime; }

  // ── 3) Twitter Card meta ──────────────────────────────────────────
  const twTitle = metaContent(html, 'name', 'twitter:title');
  const twDesc = metaContent(html, 'name', 'twitter:description');
  const twImage = metaContent(html, 'name', 'twitter:image');
  if (!result.title && twTitle) { result.title = twTitle; result.source = result.source || 'twitter'; }
  if (!result.description && twDesc) { result.description = twDesc; }
  if (!result.image && twImage) { result.image = twImage; }

  // ── 4) HTML fallbacks (LAST RESORT — stricter acceptance) ────────
  // We intentionally do NOT promote a bare <title> tag to result.title
  // here, because that was producing junk: bot-block pages ("Unauthorized
  // Request Blocked"), homepage / program-index pages ("RT Arabic"), and
  // 404s all have <title> tags. Only the <meta name="description"> and
  // first <img> are used as fallbacks — and only as supplements to a
  // title that came from a structured source (JSON-LD / OG / Twitter).
  if (!result.description) {
    const dMatch = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if (dMatch) result.description = decodeEntities(dMatch[1]);
  }
  if (!result.image) {
    const imgMatch = html.match(/<img[^>]+src=["']([^"']+\.(?:jpg|jpeg|png|webp)[^"']*)["']/i);
    if (imgMatch) result.image = imgMatch[1];
  }

  // ── Cleanup ───────────────────────────────────────────────────────
  result.title = decodeEntities(result.title).replace(/\s+/g, ' ').trim().slice(0, 500);
  result.description = decodeEntities(result.description).replace(/\s+/g, ' ').trim().slice(0, 1200);
  result.siteName = decodeEntities(result.siteName).trim().slice(0, 100);

  // Resolve relative image URLs against the page URL
  if (result.image) {
    try { result.image = new URL(result.image, url).toString(); } catch { /* leave as-is */ }
  }

  // ── Validation — reject pages that don't look like real articles ───
  // Structured data (JSON-LD / OG / Twitter) is REQUIRED — if we only got
  // a title out of <title>, something is wrong (bot-block page, index page,
  // 404, homepage). We also reject titles that match known bot-block /
  // error page patterns even when they came from OG tags, because some
  // sites put the block-page title in og:title too.
  if (!result.title) throw new Error('no_metadata_found');
  if (!result.source || result.source === 'html_title') {
    throw new Error('no_structured_metadata');
  }
  if (isLikelyBlockPage(result.title)) {
    throw new Error('page_looks_like_block_or_error');
  }
  // Require title + at least one of (description, image) — a lone title
  // is almost always a homepage, index, or landing page, not an article.
  if (!result.description && !result.image) {
    throw new Error('insufficient_article_metadata');
  }
  return result;
}

// Reject pages where the title indicates a bot-block, Cloudflare challenge,
// access-denied wall, 404, or a page that is clearly not a single article.
// Applied after all extraction paths to catch cases where the block-page
// title was also written into og:title.
function isLikelyBlockPage(title) {
  if (!title) return true;
  const s = title.trim();
  if (s.length < 15) return true;
  const patterns = [
    /^unauthorized/i,
    /request blocked/i,
    /access denied/i,
    /forbidden/i,
    /just a moment/i,
    /checking your browser/i,
    /enable javascript/i,
    /attention required/i,
    /are you a (robot|human)/i,
    /^page not found/i,
    /^not found/i,
    /^404\b/,
    /^500\b/,
    /cloudflare/i,
    /cf-ray/i,
    /\bddos\b/i,
    /\bcaptcha\b/i,
  ];
  return patterns.some(p => p.test(s));
}

// ─── Helpers ──────────────────────────────────────────────────────────

// Extract a meta tag's content attribute by attribute-name / value pair.
// Handles both orderings: <meta property="..." content="..."> and
// <meta content="..." property="...">.
function metaContent(html, attrName, attrValue) {
  const escaped = attrValue.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  const patterns = [
    new RegExp(`<meta[^>]+${attrName}=["']${escaped}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attrName}=["']${escaped}["']`, 'i'),
  ];
  for (const p of patterns) {
    const m = html.match(p);
    if (m) return decodeEntities(m[1]);
  }
  return '';
}

function cleanText(s) {
  return decodeEntities(String(s || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim());
}

function decodeEntities(s) {
  if (!s) return '';
  return String(s)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => {
      try { return String.fromCharCode(parseInt(n, 10)); } catch { return ''; }
    })
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => {
      try { return String.fromCharCode(parseInt(n, 16)); } catch { return ''; }
    });
}
