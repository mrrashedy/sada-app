// Cloudflare Pages middleware — runs on every request, including static assets.
//
// Two jobs:
//
//  1. Open Graph injection for shared article URLs.
//     When someone shares `https://101n.app/?article=ID` on WhatsApp/Twitter,
//     the social crawler fetches the URL and reads og:* meta tags. The React
//     SPA shell has only generic tags, so the preview is blank. We rewrite
//     the index.html response on the fly to inject article-specific tags.
//
//     The article is looked up from the FEED_CACHE KV (already kept hot by
//     the cron-worker), so this adds <5ms to the request.
//
//  2. Security headers on all responses (defense-in-depth).
//
// Both behaviors short-circuit cleanly if FEED_CACHE isn't bound or the
// response isn't HTML.

const SECURITY_HEADERS = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'geolocation=(), camera=(), microphone=(), interest-cohort=()',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
};

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Pass /api/* through untouched — those endpoints set their own headers.
  if (url.pathname.startsWith('/api/')) {
    return next();
  }

  const response = await next();

  // Only operate on HTML responses (the SPA shell)
  const ct = response.headers.get('content-type') || '';
  if (!ct.includes('text/html')) {
    return applySecurityHeaders(response);
  }

  const articleId = url.searchParams.get('article');

  // Plain navigation, no article = just security headers
  if (!articleId || !env?.FEED_CACHE) {
    return applySecurityHeaders(response);
  }

  // Look up the article in the warm KV cache
  let article = null;
  try {
    const cached = await env.FEED_CACHE.get('feed:latest', 'json');
    article = cached?.feed?.find(a => a.id === articleId);
  } catch {
    // KV miss is fine — we'll just serve the SPA shell as-is
  }

  if (!article) {
    return applySecurityHeaders(response);
  }

  const html = await response.text();
  const rewritten = injectOgTags(html, article, url.toString());

  return applySecurityHeaders(
    new Response(rewritten, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    }),
  );
}

function injectOgTags(html, article, fullUrl) {
  const title = escapeHtml(article.title || 'غرفة الأخبار');
  const desc = escapeHtml(
    (article.description || article.summary || '').replace(/<[^>]+>/g, '').slice(0, 200),
  );
  const image = escapeHtml(article.image || article.thumbnail || 'https://101n.app/og-default.png');
  const sourceName = escapeHtml(article.source?.name || 'غرفة الأخبار');
  const articleUrl = escapeHtml(fullUrl);

  const meta = `
    <meta property="og:title" content="${title}">
    <meta property="og:description" content="${desc}">
    <meta property="og:image" content="${image}">
    <meta property="og:url" content="${articleUrl}">
    <meta property="og:type" content="article">
    <meta property="og:locale" content="ar_AR">
    <meta property="og:site_name" content="غرفة الأخبار">
    <meta property="article:author" content="${sourceName}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${title}">
    <meta name="twitter:description" content="${desc}">
    <meta name="twitter:image" content="${image}">
    <link rel="canonical" href="${articleUrl}">
  `;

  // Strip any existing og:* tags (the SPA's defaults) before injecting,
  // otherwise crawlers may pick the wrong one.
  const cleaned = html
    .replace(/<meta[^>]+(?:property|name)=["'](?:og:|twitter:|article:)[^>]*>\s*/gi, '')
    .replace('</head>', meta + '\n</head>');

  return cleaned;
}

function escapeHtml(s = '') {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
