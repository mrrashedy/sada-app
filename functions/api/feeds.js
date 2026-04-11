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

  // Tier 2: API aggregators (JSON APIs, no RSS feeds)
  gdelt:     { name: "GDELT", initial: "GD", tier: 2, api: 'gdelt' },

  // Tier 3: English sources (auto-translated)
  bbc_en:   { name: "BBC عالمي", initial: "BB", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml"] },
  nyt:      { name: "نيويورك تايمز", initial: "NY", tier: 3, lang: "en", feeds: ["https://rss.nytimes.com/services/xml/rss/nyt/World.xml"] },
  fox:      { name: "فوكس نيوز", initial: "FX", tier: 3, lang: "en", feeds: ["https://moxie.foxnews.com/google-publisher/latest.xml"] },
  bbc_tech: { name: "BBC تقنية", initial: "BT", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/technology/rss.xml"] },
  nbc:      { name: "NBC نيوز", initial: "NB", tier: 3, lang: "en", feeds: ["https://feeds.nbcnews.com/feeds/topstories"] },
  npr:      { name: "NPR عالمي", initial: "NP", tier: 3, lang: "en", feeds: ["https://feeds.npr.org/1004/rss.xml"] },
  abc_en:   { name: "ABC نيوز", initial: "AB", tier: 3, lang: "en", feeds: ["https://feeds.abcnews.com/abcnews/topstories"] },
  sky_en:   { name: "سكاي نيوز EN", initial: "SK", tier: 3, lang: "en", feeds: ["https://feeds.skynews.com/feeds/rss/world.xml"] },

  // Tier 4: Additional real-time firehose sources — major Western broadcasters
  guardian_w:   { name: "الغارديان", initial: "G", tier: 3, lang: "en", feeds: ["https://www.theguardian.com/world/rss"] },
  wapo_world:   { name: "واشنطن بوست", initial: "WP", tier: 3, lang: "en", feeds: ["https://feeds.washingtonpost.com/rss/world"] },
  haaretz:      { name: "هآرتس", initial: "H", tier: 3, lang: "en", feeds: ["https://www.haaretz.com/cmlink/1.628752"] },
  jpost:        { name: "Jerusalem Post", initial: "JP", tier: 3, lang: "en", feeds: ["https://www.jpost.com/rss/rssfeedsfrontpage.aspx"] },
  bloomberg:    { name: "بلومبرغ", initial: "BL", tier: 3, lang: "en", feeds: ["https://feeds.bloomberg.com/politics/news.rss"] },
  cnn_en:       { name: "CNN عالمي", initial: "CN", tier: 3, lang: "en", feeds: ["http://rss.cnn.com/rss/edition_world.rss"] },
};

const SOURCE_LIST = Object.entries(SOURCES).map(([id, s]) => ({
  id, name: s.name, initial: s.initial, tier: s.tier,
}));

// ─── Utilities ───

const CACHE_TTL = 30;       // 30s — max staleness before forcing re-fetch (DO refresher warms it every 20s)
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

// ─── JSON API Adapter: GDELT Project ───
// GDELT Doc 2.0 API — free, key-less. Fetches world news in all non-Arabic
// languages; the translation pipeline below converts them to Arabic.

function normalizeItem({ id, source, title, description, link, image, pubDate, lang, categories = [] }) {
  const ts = pubDate ? new Date(pubDate).getTime() : Date.now();
  const isBreaking = /عاجل|breaking|urgent/i.test(title);
  const cats = [...categories];
  if (isBreaking && !cats.includes('عاجل')) cats.unshift('عاجل');
  return {
    title: cleanText(title || ''),
    link: link || '',
    description: cleanText(description || '').slice(0, 800),
    pubDate: pubDate || new Date().toISOString(),
    image: image || '',
    categories: cats,
    timestamp: ts,
    isBreaking,
    sourceId: id,
    sourceName: source.name,
    sourceInitial: source.initial,
    sourceTier: source.tier,
    lang: lang || 'en',
  };
}

// GDELT seendate is YYYYMMDDTHHMMSSZ (no separators) — convert to ISO 8601.
function gdeltDate(s) {
  if (!s || s.length < 15) return '';
  return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`;
}

async function fetchGdelt(id, source) {
  // Top 10 world languages M2M-100 handles well — everything EXCEPT Arabic.
  // GDELT requires parens around OR'd terms.
  // maxrecords tuned to stay within the Workers AI translation budget per cycle.
  const LANGS = ['english', 'french', 'german', 'spanish', 'portuguese', 'italian', 'russian', 'chinese', 'japanese', 'turkish'];
  const q = `(${LANGS.map(l => `sourcelang:${l}`).join(' OR ')})`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(q)}&maxrecords=30&sort=DateDesc&timespan=24h&mode=ArtList&format=json`;

  // GDELT returns full language names — map back to 2-letter codes for M2M_LANG
  const NAME_TO_CODE = {
    english: 'en', french: 'fr', german: 'de', spanish: 'es',
    portuguese: 'pt', italian: 'it', russian: 'ru', chinese: 'zh',
    japanese: 'ja', turkish: 'tr', arabic: 'ar',
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SadaNews/3.0)' },
      signal: controller.signal,
      cf: { cacheTtl: 120, cacheEverything: true },
    });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    const articles = Array.isArray(data.articles) ? data.articles : [];
    return articles
      .map(a => normalizeItem({
        id, source,
        title: a.title || '',
        description: '',  // GDELT Doc 2.0 provides no excerpt
        link: a.url || '',
        image: a.socialimage || '',
        pubDate: gdeltDate(a.seendate),
        lang: NAME_TO_CODE[(a.language || '').toLowerCase()] || 'en',
        categories: [],
      }))
      .filter(item => item.title && item.link && item.lang !== 'ar');
  } catch { return []; }
}

// ─── Translation (KV-indexed, single-blob for subrequest efficiency) ───
// M2M-100 2-letter code → full name (the model expects full names like 'french')
const M2M_LANG = {
  en: 'english', fr: 'french', de: 'german', es: 'spanish',
  pt: 'portuguese', it: 'italian', ru: 'russian', zh: 'chinese',
  ja: 'japanese', tr: 'turkish', ko: 'korean', hi: 'hindi', nl: 'dutch',
};

// We store ALL translations in a single KV key as a JSON map: { hash: {t, d} }.
// This keeps the hot-path subrequest count at 1 regardless of feed size.
// Cloudflare Pages Bundled plan caps at 50 subrequests per invocation, so
// individual per-item KV gets (previously ~100/request) would blow the budget
// and silently fail the tail of the loop. One blob read dodges that entirely.
const TRANSLATIONS_INDEX_KEY = 'translations:index';

function translationFields(item) {
  return {
    sourceId: item.sourceId || item.source?.id || '?',
    title: item.title || '',
    description: item.description ?? item.body ?? '',
    lang: item.lang || 'en',
    translated: !!item.translated,
  };
}

function translationHash(item) {
  const f = translationFields(item);
  return `${f.sourceId}:${hash(f.title)}`;
}

async function loadTranslationIndex(kv) {
  if (!kv) return {};
  try {
    return (await kv.get(TRANSLATIONS_INDEX_KEY, 'json')) || {};
  } catch { return {}; }
}

async function saveTranslationIndex(kv, index) {
  if (!kv) return;
  try {
    await kv.put(TRANSLATIONS_INDEX_KEY, JSON.stringify(index), { expirationTtl: 604800 }); // 7 days
  } catch {}
}

// In-memory apply: given an index, translate matching items with zero subrequests.
function applyTranslationIndex(items, index) {
  if (!index) return items;
  return items.map(item => {
    if (item.translated) return item;
    if (item.lang === 'ar') return item;
    const h = translationHash(item);
    const hit = index[h];
    if (!hit) return item;
    return { ...item, title: hit.t || item.title, description: hit.d || item.description, body: hit.t ? (hit.d || item.body) : item.body, translated: true };
  });
}

// AI call. No KV write — caller updates the in-memory index and writes once.
async function fetchTranslation(item, ai) {
  if (!ai) return null;
  const f = translationFields(item);
  const sourceLang = M2M_LANG[f.lang] || 'english';
  try {
    const titleRes = await ai.run('@cf/meta/m2m100-1.2b', { text: f.title, source_lang: sourceLang, target_lang: 'arabic' });
    const t = titleRes?.translated_text || f.title;
    let d = f.description || '';
    if (d) {
      try {
        const descRes = await ai.run('@cf/meta/m2m100-1.2b', { text: d, source_lang: sourceLang, target_lang: 'arabic' });
        d = descRes?.translated_text || d;
      } catch {}
    }
    return { t, d };
  } catch { return null; }
}

// Background pass: translate non-Arabic items not yet in the index.
// Reads index once, writes once → 2 KV subrequests total regardless of count.
async function warmTranslations(items, ai, kv, limit = 40) {
  if (!ai || !kv) return;
  const index = await loadTranslationIndex(kv);
  const pending = [];
  for (const item of items) {
    const f = translationFields(item);
    if (f.lang === 'ar') continue;
    if (f.translated) continue;
    const h = translationHash(item);
    if (index[h]) continue;
    pending.push({ item, h });
    if (pending.length >= limit) break;
  }
  if (pending.length === 0) return;
  // Batch in 8-wide chunks
  for (let b = 0; b < pending.length; b += 8) {
    const chunk = pending.slice(b, b + 8);
    const results = await Promise.allSettled(chunk.map(({ item }) => fetchTranslation(item, ai)));
    results.forEach((r, j) => {
      if (r.status === 'fulfilled' && r.value) {
        index[chunk[j].h] = r.value;
      }
    });
  }
  await saveTranslationIndex(kv, index);
}

// ─── Core Aggregation Pipeline ───
// This is the expensive operation — fetches all RSS, translates, deduplicates, interleaves

async function aggregateFeeds(ai, translationKV) {
  const allItems = [];

  // Fetch all sources in parallel — dispatch by source type (RSS vs JSON API)
  const fetches = Object.entries(SOURCES).flatMap(([id, source]) => {
    if (source.api === 'gdelt') return [fetchGdelt(id, source)];
    // RSS sources (existing path)
    return (source.feeds || []).map(async (feedUrl) => {
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
    });
  });

  const results = await Promise.allSettled(fetches);
  results.forEach(r => { if (r.status === 'fulfilled') allItems.push(...r.value); });

  // Note: translation index is applied at READ time (in onRequest / buildPayload)
  // rather than here, so any feed snapshot benefits from the growing index
  // without needing re-aggregation. This also saves a subrequest in the hot path.

  // Split pools: Arabic-native vs any-non-Arabic items.
  // We keep non-Arabic items whether or not translation succeeded — on a busy
  // cycle where translation exceeds the CPU budget, the item stays in its
  // original language (with the `translated: false` flag so the client can
  // render a hint). Future cycles will fill the KV cache and pick up the miss.
  const arabic = allItems.filter(i => i.lang === 'ar');
  const nonArabic = allItems.filter(i => i.lang && i.lang !== 'ar');

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

  // Non-Arabic pool: round-robin by source so GDELT and every English source
  // get fair representation (pure time-sort lets the freshest-updating source
  // monopolize the non-Ar budget and pushes out slower sources like GDELT,
  // which buckets to 15-min intervals).
  const nonArByScore = dedup(nonArabic).sort(sortByTime);
  const nonArBySource = new Map();
  for (const item of nonArByScore) {
    if (!nonArBySource.has(item.sourceId)) nonArBySource.set(item.sourceId, []);
    nonArBySource.get(item.sourceId).push(item);
  }
  const dedupNonAr = [];
  let anyLeft = true;
  while (anyLeft) {
    anyLeft = false;
    for (const list of nonArBySource.values()) {
      if (list.length > 0) {
        dedupNonAr.push(list.shift());
        anyLeft = true;
      }
    }
  }

  // Interleave: 3 tier1 : 1 tier2 : 1 translated-non-Arabic
  const tier1 = dedupAr.filter(i => i.sourceTier === 1);
  const tier2 = dedupAr.filter(i => i.sourceTier !== 1);
  const mixed = [];
  let t1 = 0, t2 = 0, ei = 0;
  const LIMIT = 500;
  while (mixed.length < LIMIT && (t1 < tier1.length || t2 < tier2.length || ei < dedupNonAr.length)) {
    for (let n = 0; n < 3 && t1 < tier1.length && mixed.length < LIMIT; n++) mixed.push(tier1[t1++]);
    if (t2 < tier2.length && mixed.length < LIMIT) mixed.push(tier2[t2++]);
    if (ei < dedupNonAr.length && mixed.length < LIMIT) mixed.push(dedupNonAr[ei++]);
  }
  while (mixed.length < LIMIT && t1 < tier1.length) mixed.push(tier1[t1++]);
  while (mixed.length < LIMIT && t2 < tier2.length) mixed.push(tier2[t2++]);
  while (mixed.length < LIMIT && ei < dedupNonAr.length) mixed.push(dedupNonAr[ei++]);

  // If no translated non-Arabic items, fill with Arabic only
  if (dedupNonAr.length === 0) {
    mixed.length = 0;
    mixed.push(...dedup(arabic).sort(sortByTime).slice(0, LIMIT));
  }

  // Format for client
  const feed = mixed.map((item, i) => ({
    id: `${item.sourceId}-${item.timestamp}-${(item.link||item.title||'').split('').reduce((h,c)=>(((h<<5)-h)+c.charCodeAt(0))|0,0).toString(36)}`,
    title: item.title,
    body: item.description,
    link: item.link,
    image: item.image,
    categories: item.categories,
    time: timeAgo(item.pubDate),
    timestamp: item.timestamp || 0,
    isBreaking: item.isBreaking,
    translated: item.translated || false,
    lang: item.lang || 'ar',
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

// ─── Admin Curation Layer (applied per-request, not baked into KV cache) ───
// Reads `article_overrides` and `manual_feed_items` from Supabase via the
// public anon key (both tables have public-read RLS policies). Failures are
// silent — feed always returns even if Supabase is unreachable.

async function fetchAdminLayer(env) {
  const url = env?.SUPABASE_URL;
  const key = env?.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const headers = { apikey: key, authorization: `Bearer ${key}` };
  try {
    const [overridesRes, manualRes] = await Promise.all([
      fetch(`${url}/rest/v1/article_overrides?select=*`, { headers, cf: { cacheTtl: 10, cacheEverything: true } }),
      fetch(`${url}/rest/v1/manual_feed_items?select=*&order=created_at.desc&limit=50`, { headers, cf: { cacheTtl: 10, cacheEverything: true } }),
    ]);
    if (!overridesRes.ok || !manualRes.ok) return null;
    const [overrides, manualItems] = await Promise.all([overridesRes.json(), manualRes.json()]);
    return { overrides, manualItems };
  } catch {
    return null;
  }
}

function formatManualItem(m) {
  const ts = m.created_at ? new Date(m.created_at).getTime() : Date.now();
  return {
    id: `manual-${m.id}`,
    title: m.title,
    body: m.body || '',
    link: m.link || '',
    image: m.image || '',
    categories: m.category ? [m.category] : [],
    time: timeAgo(m.created_at || new Date().toISOString()),
    timestamp: ts,
    isBreaking: !!m.is_breaking,
    translated: false,
    source: {
      id: 'manual',
      name: m.source_name || 'تحرير',
      initial: m.source_initial || 'ت',
      tier: 0,
    },
    manual: true,
    pinned: !!m.pinned,
    featured: false,
  };
}

function applyAdminLayer(feed, layer) {
  if (!layer) return feed;
  const { overrides = [], manualItems = [] } = layer;

  // Index overrides for O(1) lookup by article id (primary) and link (fallback)
  const byId = new Map();
  const byLink = new Map();
  for (const o of overrides) {
    if (o.article_id) byId.set(o.article_id, o);
    if (o.link) byLink.set(o.link, o);
  }

  // Apply hides / custom title / custom body / featured / pinned
  const pinnedArticles = [];
  const regularArticles = [];
  for (const item of feed) {
    const ov = byId.get(item.id) || (item.link && byLink.get(item.link)) || null;
    if (ov?.hidden) continue;
    const annotated = ov ? {
      ...item,
      title: ov.custom_title || item.title,
      body: ov.custom_body || item.body,
      featured: !!ov.featured,
      pinned: !!ov.pinned,
    } : item;
    if (ov?.pinned) pinnedArticles.push(annotated);
    else regularArticles.push(annotated);
  }

  // Filter expired manual items (defensive — RLS also enforces this)
  const now = Date.now();
  const visibleManual = manualItems.filter(m => !m.expires_at || new Date(m.expires_at).getTime() > now);
  const pinnedManual = visibleManual.filter(m => m.pinned).map(formatManualItem);
  const unpinnedManual = visibleManual.filter(m => !m.pinned).map(formatManualItem);

  // Final order: pinned manual → pinned articles → unpinned manual → regular articles
  return [
    ...pinnedManual,
    ...pinnedArticles,
    ...unpinnedManual,
    ...regularArticles,
  ];
}

function buildPayload(data, layer, limit, cacheMeta) {
  const curatedFeed = applyAdminLayer(data.feed, layer);
  // Recompute breaking from curated feed so manual is_breaking items + override hides are reflected
  const breaking = curatedFeed.filter(f => f.isBreaking).slice(0, 20);
  return {
    ok: true,
    count: Math.min(curatedFeed.length, limit),
    sources: SOURCE_LIST,
    feed: curatedFeed.slice(0, limit),
    breaking,
    trending: data.trending || [],
    _cache: cacheMeta,
  };
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

    // Fire admin-layer + translation-index fetches in parallel with KV / aggregation
    const layerPromise = fetchAdminLayer(env);
    const indexPromise = loadTranslationIndex(translationKV);

    // 1. Try KV cache first
    if (feedCache && !forceRefresh) {
      const [cachedFeed, cachedMeta, layer, index] = await Promise.all([
        feedCache.get(KV_KEY_FEED, 'json'),
        feedCache.get(KV_KEY_META, 'json'),
        layerPromise,
        indexPromise,
      ]);

      if (cachedFeed && cachedMeta) {
        const age = Math.floor((Date.now() - cachedMeta.ts) / 1000);
        const isFresh = age < CACHE_TTL;

        // Apply translation index at read time — any item cached in the index
        // gets its Arabic title, untranslated items pass through.
        const translatedData = { ...cachedFeed, feed: applyTranslationIndex(cachedFeed.feed, index) };
        const payload = buildPayload(translatedData, layer, limit, {
          age, fresh: isFresh, aggregatedAt: cachedMeta.ts,
        });
        const response = new Response(JSON.stringify(payload), {
          headers: { ...CORS, 'Cache-Control': isFresh ? 'public, s-maxage=30' : 'public, s-maxage=5, stale-while-revalidate=120' },
        });

        // If stale, trigger background re-aggregation (non-blocking)
        if (!isFresh) {
          context.waitUntil(refreshCache(ai, translationKV, feedCache));
        }

        return response;
      }
    }

    // 2. No cache — aggregate fresh (first request or KV not configured)
    const data = await aggregateFeeds(ai, translationKV);

    // Store in KV (no warming here — /api/warm handles it separately with
    // its own subrequest budget; aggregation alone uses ~45 subreqs)
    if (feedCache) {
      context.waitUntil(Promise.all([
        feedCache.put(KV_KEY_FEED, JSON.stringify(data), { expirationTtl: 600 }),
        feedCache.put(KV_KEY_META, JSON.stringify({ ts: Date.now(), count: data.feed.length }), { expirationTtl: 600 }),
      ]));
    }

    const [layer, index] = await Promise.all([layerPromise, indexPromise]);
    const translatedData = { ...data, feed: applyTranslationIndex(data.feed, index) };
    const payload = buildPayload(translatedData, layer, limit, { age: 0, fresh: true, aggregatedAt: Date.now() });
    return new Response(JSON.stringify(payload), {
      headers: { ...CORS, 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS });
  }
}

// Background re-aggregation (runs via waitUntil, doesn't block response).
// Translation warming is handled by the separate /api/warm endpoint, so
// this path only does aggregation + KV write.
async function refreshCache(ai, translationKV, feedCache) {
  try {
    const data = await aggregateFeeds(ai, translationKV);
    await Promise.all([
      feedCache.put(KV_KEY_FEED, JSON.stringify(data), { expirationTtl: 600 }),
      feedCache.put(KV_KEY_META, JSON.stringify({ ts: Date.now(), count: data.feed.length }), { expirationTtl: 600 }),
    ]);
  } catch {}
}
