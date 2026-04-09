// Cloudflare Pages Function — /api/feeds
// Production architecture: KV-backed stale-while-revalidate feed cache
// RSS aggregation runs at most once per 2 minutes; all other requests read from KV

// ─── Source Registry ───

const SOURCES = {
  // Tier 1: Flagship Arabic broadcasters
  aljazeera:       { name: "الجزيرة", initial: "ج", tier: 1, feeds: ["https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9"] },
  aljazeera_en:    { name: "الجزيرة EN", initial: "ج", tier: 3, lang: "en", feeds: ["https://www.aljazeera.com/xml/rss/all.xml"] },
  bbc:             { name: "BBC عربي", initial: "B", tier: 1, feeds: ["https://feeds.bbci.co.uk/arabic/rss.xml","https://feeds.bbci.co.uk/arabic/middleeast/rss.xml","https://feeds.bbci.co.uk/arabic/worldnews/rss.xml"] },
  skynews:         { name: "سكاي نيوز", initial: "S", tier: 1, feeds: ["https://www.skynewsarabia.com/rss.xml","https://www.skynewsarabia.com/rss/middle-east.xml","https://www.skynewsarabia.com/rss/world.xml"] },
  france24:        { name: "فرانس ٢٤", initial: "F", tier: 1, feeds: ["https://www.france24.com/ar/rss","https://www.france24.com/ar/الشرق-الأوسط/rss"] },
  dw:              { name: "دويتشه فيله", initial: "D", tier: 1, feeds: ["https://rss.dw.com/xml/rss-ar-all"] },
  cnn_ar:          { name: "CNN عربية", initial: "C", tier: 1, feeds: ["https://arabic.cnn.com/api/v1/rss/rss.xml"] },
  independent_ar:  { name: "إندبندنت عربية", initial: "إ", tier: 1, feeds: ["https://www.independentarabia.com/rss.xml"] },
  aawsat:          { name: "الشرق الأوسط", initial: "ش", tier: 1, feeds: ["https://aawsat.com/feed"] },
  alhurra:         { name: "الحرة", initial: "ح", tier: 1, feeds: ["https://www.alhurra.com/rss"] },

  // Tier 2: Regional newspapers
  alaraby:   { name: "العربي الجديد", initial: "ع", tier: 2, feeds: ["https://www.alaraby.co.uk/rss"] },
  almasry:   { name: "المصري اليوم", initial: "م", tier: 2, feeds: ["https://www.almasryalyoum.com/rss/rssfeed"] },
  okaz:      { name: "عكاظ", initial: "ك", tier: 2, feeds: ["https://www.okaz.com.sa/rssFeed/0"] },
  alsumaria: { name: "السومرية", initial: "سم", tier: 2, feeds: ["https://www.alsumaria.tv/Rss/iraq-latest-news/ar"] },
  alkhaleej: { name: "الخليج", initial: "خ", tier: 2, feeds: ["https://www.alkhaleej.ae/section/1110/rss.xml"] },
  uae24:     { name: "24 الإمارات", initial: "٢", tier: 2, feeds: ["https://24.ae/rss.aspx"] },
  alsharq:   { name: "الشرق", initial: "ق", tier: 2, feeds: ["https://al-sharq.com/rss/latestNews"] },
  dohanews:  { name: "دوحة نيوز", initial: "ه", tier: 2, feeds: ["https://dohanews.co/feed/"] },
  arabnews:  { name: "Arab News", initial: "A", tier: 2, feeds: ["https://www.arabnews.com/rss.xml"] },
  alyaum:    { name: "اليوم", initial: "ل", tier: 2, feeds: ["https://www.alyaum.com/rssFeed/1005"] },
  alquds:    { name: "القدس العربي", initial: "ق", tier: 2, feeds: ["https://www.alquds.co.uk/feed/"] },
  noonpost:  { name: "نون بوست", initial: "ن", tier: 2, feeds: ["https://www.noonpost.com/rss"] },
  lusail:    { name: "لوسيل", initial: "لس", tier: 2, feeds: ["https://lusailnews.net/feed"] },

  // Tier 3: English sources (auto-translated)
  bbc_en:   { name: "BBC عالمي", initial: "BB", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml"] },
  nyt:      { name: "نيويورك تايمز", initial: "NY", tier: 3, lang: "en", feeds: ["https://rss.nytimes.com/services/xml/rss/nyt/World.xml"] },
  fox:      { name: "فوكس نيوز", initial: "FX", tier: 3, lang: "en", feeds: ["https://moxie.foxnews.com/google-publisher/latest.xml"] },
  bbc_tech: { name: "BBC تقنية", initial: "BT", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/technology/rss.xml"] },
  nbc:      { name: "NBC نيوز", initial: "NB", tier: 3, lang: "en", feeds: ["https://feeds.nbcnews.com/feeds/topstories"] },
  npr:      { name: "NPR عالمي", initial: "NP", tier: 3, lang: "en", feeds: ["https://feeds.npr.org/1004/rss.xml"] },
  abc_en:   { name: "ABC نيوز", initial: "AB", tier: 3, lang: "en", feeds: ["https://feeds.abcnews.com/abcnews/topstories"] },
  sky_en:   { name: "سكاي نيوز EN", initial: "SK", tier: 3, lang: "en", feeds: ["https://feeds.skynews.com/feeds/rss/world.xml"] },
};

const SOURCE_LIST = Object.entries(SOURCES).map(([id, s]) => ({
  id, name: s.name, initial: s.initial, tier: s.tier,
}));

// ─── Utilities ───

const CACHE_TTL = 120;      // 2 minutes — max staleness before re-fetch
const KV_KEY_FEED = 'feed:latest';
const KV_KEY_META = 'feed:meta';

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = ((h << 5) - h) + str.charCodeAt(i); h |= 0; }
  return (h >>> 0).toString(36);
}

function timeAgo(date) {
  const diff = Date.now() - new Date(date).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'الآن';
  if (secs < 60) return `منذ ${secs} ث`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} ي`;
}

// ─── RSS Parsing ───

function cleanText(str) {
  return str
    .replace(/<!\[CDATA\[/g, '').replace(/\]\]>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseXML(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? cleanText(m[1] || m[2] || '') : '';
    };
    const title = get('title');
    if (!title) continue;
    const link = get('link');
    const description = get('description').replace(/https?:\/\/[^\s<>"']+/g, '').replace(/\s+/g, ' ').trim();
    const pubDate = get('pubDate');
    let image = '';
    const mediaMatch = block.match(/url=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)/i);
    if (mediaMatch) image = mediaMatch[1];
    if (!image) { const enc = block.match(/<enclosure[^>]+url=["']([^"']+)/); if (enc) image = enc[1]; }
    const categories = [];
    const catRegex = /<category[^>]*>([\s\S]*?)<\/category>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(block)) !== null) { const c = cleanText(catMatch[1]); if (c && c.length < 30) categories.push(c); }
    const isBreaking = title.includes('عاجل') || title.includes('breaking') || title.toLowerCase().includes('urgent');
    if (isBreaking && !categories.includes('عاجل')) categories.unshift('عاجل');
    items.push({ title, link, description: description.slice(0, 800), pubDate, image, categories, timestamp: pubDate ? new Date(pubDate).getTime() : 0, isBreaking });
  }
  return items;
}

// ─── Translation (KV-cached) ───

async function translateItem(item, ai, kv) {
  const cacheKey = `t:${item.sourceId}:${hash(item.title)}`;
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json');
      if (cached) return { ...item, title: cached.t, description: cached.d, translated: true };
    } catch {}
  }
  if (!ai) return item;
  try {
    const titleRes = await ai.run('@cf/meta/m2m100-1.2b', { text: item.title, source_lang: 'english', target_lang: 'arabic' });
    let translatedDesc = item.description;
    if (item.description) {
      try {
        const descRes = await ai.run('@cf/meta/m2m100-1.2b', { text: item.description, source_lang: 'english', target_lang: 'arabic' });
        translatedDesc = descRes.translated_text || item.description;
      } catch {}
    }
    const translatedTitle = titleRes.translated_text || item.title;
    if (kv) {
      try { await kv.put(cacheKey, JSON.stringify({ t: translatedTitle, d: translatedDesc }), { expirationTtl: 86400 }); } catch {}
    }
    return { ...item, title: translatedTitle, description: translatedDesc, translated: true };
  } catch {
    return item;
  }
}

// ─── Core Aggregation Pipeline ───
// This is the expensive operation — fetches all RSS, translates, deduplicates, interleaves

async function aggregateFeeds(ai, translationKV) {
  const allItems = [];

  // Fetch all feeds in parallel
  const fetches = Object.entries(SOURCES).flatMap(([id, source]) =>
    source.feeds.map(async (feedUrl) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(feedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SadaNews/3.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
          signal: controller.signal,
          cf: { cacheTtl: 60, cacheEverything: true },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const xml = await res.text();
        return parseXML(xml).map(item => ({
          ...item, sourceId: id, sourceName: source.name, sourceInitial: source.initial, sourceTier: source.tier, lang: source.lang || 'ar',
        }));
      } catch { return []; }
    })
  );

  const results = await Promise.allSettled(fetches);
  results.forEach(r => { if (r.status === 'fulfilled') allItems.push(...r.value); });

  // Translate English items in batches of 8
  const enItems = allItems.filter(i => i.lang === 'en');
  for (let b = 0; b < enItems.length; b += 8) {
    const chunk = enItems.slice(b, b + 8);
    const translated = await Promise.allSettled(chunk.map(item => translateItem(item, ai, translationKV)));
    translated.forEach((r, j) => {
      if (r.status === 'fulfilled') {
        const idx = allItems.indexOf(chunk[j]);
        if (idx !== -1) allItems[idx] = r.value;
      }
    });
  }

  // Split pools
  const arabic = allItems.filter(i => i.lang !== 'en');
  const translatedEn = allItems.filter(i => i.lang === 'en' && i.translated);

  // Dedup
  const dedup = (items) => {
    const seen = new Set();
    return items.filter(item => {
      const key = item.title.slice(0, 50).trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  };
  const sortByTime = (a, b) => b.timestamp - a.timestamp;
  const dedupAr = dedup(arabic).sort(sortByTime);
  const dedupEn = dedup(translatedEn).sort(sortByTime);

  // Interleave: 3 tier1 : 1 tier2 : 1 translated-EN
  const tier1 = dedupAr.filter(i => i.sourceTier === 1);
  const tier2 = dedupAr.filter(i => i.sourceTier !== 1);
  const mixed = [];
  let t1 = 0, t2 = 0, ei = 0;
  const LIMIT = 500;
  while (mixed.length < LIMIT && (t1 < tier1.length || t2 < tier2.length || ei < dedupEn.length)) {
    for (let n = 0; n < 3 && t1 < tier1.length && mixed.length < LIMIT; n++) mixed.push(tier1[t1++]);
    if (t2 < tier2.length && mixed.length < LIMIT) mixed.push(tier2[t2++]);
    if (ei < dedupEn.length && mixed.length < LIMIT) mixed.push(dedupEn[ei++]);
  }
  while (mixed.length < LIMIT && t1 < tier1.length) mixed.push(tier1[t1++]);
  while (mixed.length < LIMIT && t2 < tier2.length) mixed.push(tier2[t2++]);
  while (mixed.length < LIMIT && ei < dedupEn.length) mixed.push(dedupEn[ei++]);

  // If no translated English, fill with Arabic only
  if (dedupEn.length === 0) {
    mixed.length = 0;
    mixed.push(...dedup(allItems.filter(i => i.lang !== 'en')).sort(sortByTime).slice(0, LIMIT));
  }

  // Format for client
  const feed = mixed.map((item, i) => ({
    id: `${item.sourceId}-${i}-${item.timestamp}`,
    title: item.title,
    body: item.description,
    link: item.link,
    image: item.image,
    categories: item.categories,
    time: timeAgo(item.pubDate),
    timestamp: item.timestamp || 0,
    isBreaking: item.isBreaking,
    translated: item.translated || false,
    source: { id: item.sourceId, name: item.sourceName, initial: item.sourceInitial, tier: item.sourceTier },
  }));

  // Extract breaking articles for alerts
  const breaking = feed.filter(f => f.isBreaking).slice(0, 20);

  // Extract trending (top tags by frequency)
  const tagFreq = {};
  feed.forEach(f => (f.categories || []).forEach(c => {
    if (c !== 'عاجل' && c.length < 20) tagFreq[c] = (tagFreq[c] || 0) + 1;
  }));
  const trending = Object.entries(tagFreq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tag, count]) => ({ tag, count }));

  return { feed, breaking, trending, stats: { total: feed.length, translated: feed.filter(f => f.translated).length, sources: Object.keys(SOURCES).length } };
}

// ─── Main Handler: KV-backed stale-while-revalidate ───

export async function onRequest(context) {
  const { request, env } = context;

  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Headers': 'Content-Type' } });
  }

  const CORS = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
  const feedCache = env?.FEED_CACHE || null;
  const ai = env?.AI || null;
  const translationKV = env?.TRANSLATIONS || null;

  try {
    const url = new URL(request.url);
    const limit = parseInt(url.searchParams.get('limit')) || 200;
    const forceRefresh = url.searchParams.has('refresh');

    // 1. Try KV cache first
    if (feedCache && !forceRefresh) {
      const [cachedFeed, cachedMeta] = await Promise.all([
        feedCache.get(KV_KEY_FEED, 'json'),
        feedCache.get(KV_KEY_META, 'json'),
      ]);

      if (cachedFeed && cachedMeta) {
        const age = Math.floor((Date.now() - cachedMeta.ts) / 1000);
        const isFresh = age < CACHE_TTL;

        // Return cached data (possibly stale)
        const response = new Response(JSON.stringify({
          ok: true,
          count: Math.min(cachedFeed.feed.length, limit),
          sources: SOURCE_LIST,
          feed: cachedFeed.feed.slice(0, limit),
          breaking: cachedFeed.breaking || [],
          trending: cachedFeed.trending || [],
          _cache: { age, fresh: isFresh, aggregatedAt: cachedMeta.ts },
        }), { headers: { ...CORS, 'Cache-Control': isFresh ? 'public, s-maxage=30' : 'public, s-maxage=5, stale-while-revalidate=120' } });

        // If stale, trigger background re-aggregation (non-blocking)
        if (!isFresh) {
          context.waitUntil(refreshCache(ai, translationKV, feedCache));
        }

        return response;
      }
    }

    // 2. No cache — aggregate fresh (first request or KV not configured)
    const data = await aggregateFeeds(ai, translationKV);

    // Store in KV for next request
    if (feedCache) {
      context.waitUntil(Promise.all([
        feedCache.put(KV_KEY_FEED, JSON.stringify(data), { expirationTtl: 600 }),
        feedCache.put(KV_KEY_META, JSON.stringify({ ts: Date.now(), count: data.feed.length }), { expirationTtl: 600 }),
      ]));
    }

    return new Response(JSON.stringify({
      ok: true,
      count: Math.min(data.feed.length, limit),
      sources: SOURCE_LIST,
      feed: data.feed.slice(0, limit),
      breaking: data.breaking || [],
      trending: data.trending || [],
      _cache: { age: 0, fresh: true, aggregatedAt: Date.now() },
    }), { headers: { ...CORS, 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' } });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS });
  }
}

// Background re-aggregation (runs via waitUntil, doesn't block response)
async function refreshCache(ai, translationKV, feedCache) {
  try {
    const data = await aggregateFeeds(ai, translationKV);
    await Promise.all([
      feedCache.put(KV_KEY_FEED, JSON.stringify(data), { expirationTtl: 600 }),
      feedCache.put(KV_KEY_META, JSON.stringify({ ts: Date.now(), count: data.feed.length }), { expirationTtl: 600 }),
    ]);
  } catch {}
}
