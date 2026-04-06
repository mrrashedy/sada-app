// Cloudflare Pages Function — /api/feeds
// Auto-deploys as /api/feeds on Cloudflare Pages
// English sources are auto-translated to Arabic via Workers AI + KV cache

const SOURCES = {
  // ── Tier 1: Flagship Arabic broadcasters ──
  aljazeera: {
    name: "الجزيرة", initial: "ج", tier: 1,
    feeds: [
      "https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9",
      "https://www.aljazeera.com/xml/rss/all.xml"
    ]
  },
  bbc: {
    name: "BBC عربي", initial: "B", tier: 1,
    feeds: ["https://feeds.bbci.co.uk/arabic/rss.xml"]
  },
  skynews: {
    name: "سكاي نيوز", initial: "S", tier: 1,
    feeds: ["https://www.skynewsarabia.com/rss.xml"]
  },
  france24: {
    name: "فرانس ٢٤", initial: "F", tier: 1,
    feeds: ["https://www.france24.com/ar/rss"]
  },
  dw: {
    name: "دويتشه فيله", initial: "D", tier: 1,
    feeds: ["https://rss.dw.com/xml/rss-ar-all"]
  },
  cnn_ar: {
    name: "CNN عربية", initial: "C", tier: 1,
    feeds: ["https://arabic.cnn.com/api/v1/rss/rss.xml"]
  },
  independent_ar: {
    name: "إندبندنت عربية", initial: "إ", tier: 1,
    feeds: ["https://www.independentarabia.com/rss.xml"]
  },
  aawsat: {
    name: "الشرق الأوسط", initial: "ش", tier: 1,
    feeds: ["https://aawsat.com/feed"]
  },
  alhurra: {
    name: "الحرة", initial: "ح", tier: 1,
    feeds: ["https://www.alhurra.com/rss"]
  },

  // ── Tier 2: Major regional newspapers ──
  alaraby: {
    name: "العربي الجديد", initial: "ع", tier: 2,
    feeds: ["https://www.alaraby.co.uk/rss"]
  },
  almasry: {
    name: "المصري اليوم", initial: "م", tier: 2,
    feeds: ["https://www.almasryalyoum.com/rss/rssfeed"]
  },
  okaz: {
    name: "عكاظ", initial: "ك", tier: 2,
    feeds: ["https://www.okaz.com.sa/rssFeed/0"]
  },
  alsumaria: {
    name: "السومرية", initial: "سم", tier: 2,
    feeds: ["https://www.alsumaria.tv/Rss/iraq-latest-news/ar"]
  },
  alkhaleej: {
    name: "الخليج", initial: "خ", tier: 2,
    feeds: ["https://www.alkhaleej.ae/section/1110/rss.xml"]
  },
  uae24: {
    name: "24 الإمارات", initial: "٢", tier: 2,
    feeds: ["https://24.ae/rss.aspx"]
  },
  alsharq: {
    name: "الشرق", initial: "ق", tier: 2,
    feeds: ["https://al-sharq.com/rss/latestNews"]
  },
  dohanews: {
    name: "دوحة نيوز", initial: "ه", tier: 2,
    feeds: ["https://dohanews.co/feed/"]
  },
  arabnews: {
    name: "Arab News", initial: "A", tier: 2,
    feeds: ["https://www.arabnews.com/rss.xml"]
  },
  alyaum: {
    name: "اليوم", initial: "ل", tier: 2,
    feeds: ["https://www.alyaum.com/rssFeed/1005"]
  },
  alquds: {
    name: "القدس العربي", initial: "ق", tier: 2,
    feeds: ["https://www.alquds.co.uk/feed/"]
  },
  noonpost: {
    name: "نون بوست", initial: "ن", tier: 2,
    feeds: ["https://www.noonpost.com/rss"]
  },
  lusail: {
    name: "لوسيل", initial: "لس", tier: 2,
    feeds: ["https://lusailnews.net/feed"]
  },

  // ── Tier 3: English sources (auto-translated → native Arabic) ──
  bbc_en: {
    name: "BBC عالمي", initial: "BB", tier: 3, lang: "en",
    feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml"]
  },
  nyt: {
    name: "نيويورك تايمز", initial: "NY", tier: 3, lang: "en",
    feeds: ["https://rss.nytimes.com/services/xml/rss/nyt/World.xml"]
  },
  fox: {
    name: "فوكس نيوز", initial: "FX", tier: 3, lang: "en",
    feeds: ["https://moxie.foxnews.com/google-publisher/latest.xml"]
  },
  bbc_tech: {
    name: "BBC تقنية", initial: "BT", tier: 3, lang: "en",
    feeds: ["https://feeds.bbci.co.uk/news/technology/rss.xml"]
  },
  nbc: {
    name: "NBC نيوز", initial: "NB", tier: 3, lang: "en",
    feeds: ["https://feeds.nbcnews.com/feeds/topstories"]
  },
  npr: {
    name: "NPR عالمي", initial: "NP", tier: 3, lang: "en",
    feeds: ["https://feeds.npr.org/1004/rss.xml"]
  },
  abc_en: {
    name: "ABC نيوز", initial: "AB", tier: 3, lang: "en",
    feeds: ["https://feeds.abcnews.com/abcnews/topstories"]
  },
  sky_en: {
    name: "سكاي نيوز EN", initial: "SK", tier: 3, lang: "en",
    feeds: ["https://feeds.skynews.com/feeds/rss/world.xml"]
  },
};

// ── Identify English sources ──
const EN_SOURCE_IDS = new Set(
  Object.entries(SOURCES).filter(([, v]) => v.lang === 'en').map(([k]) => k)
);

// ── Simple hash for KV cache keys ──
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h) + str.charCodeAt(i);
    h |= 0;
  }
  return (h >>> 0).toString(36);
}

// ── KV-cached translation: translate once, serve forever ──
async function translateItem(item, ai, kv) {
  const cacheKey = `t:${item.sourceId}:${hash(item.title)}`;

  // 1. Check KV cache first
  if (kv) {
    try {
      const cached = await kv.get(cacheKey, 'json');
      if (cached) {
        return { ...item, title: cached.t, description: cached.d, translated: true };
      }
    } catch {}
  }

  // 2. No cache hit — translate via Workers AI
  if (!ai) return { ...item, _err: 'no_ai_binding' };

  try {
    const titleRes = await ai.run('@cf/meta/m2m100-1.2b', {
      text: item.title,
      source_lang: 'english',
      target_lang: 'arabic',
    });

    let translatedDesc = item.description;
    if (item.description) {
      try {
        const descRes = await ai.run('@cf/meta/m2m100-1.2b', {
          text: item.description,
          source_lang: 'english',
          target_lang: 'arabic',
        });
        translatedDesc = descRes.translated_text || item.description;
      } catch {}
    }

    const translatedTitle = titleRes.translated_text || item.title;

    // 3. Store in KV for 24 hours so next request is instant
    if (kv) {
      try {
        await kv.put(cacheKey, JSON.stringify({ t: translatedTitle, d: translatedDesc }), {
          expirationTtl: 86400,
        });
      } catch {}
    }

    return {
      ...item,
      title: translatedTitle,
      description: translatedDesc,
      translated: true,
    };
  } catch (err) {
    return { ...item, _err: err.message || 'translate_fail' };
  }
}

function parseXML(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match;

  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? (m[1] || m[2] || '').trim() : '';
    };

    const title = get('title');
    const link = get('link');
    let rawDesc = get('description');
    rawDesc = rawDesc
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ');
    const description = rawDesc
      .replace(/<[^>]*>/g, ' ')
      .replace(/https?:\/\/[^\s<>"']+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const pubDate = get('pubDate');

    let image = '';
    const mediaMatch = block.match(/url=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)/i);
    if (mediaMatch) image = mediaMatch[1];
    if (!image) {
      const encMatch = block.match(/<enclosure[^>]+url=["']([^"']+)/);
      if (encMatch) image = encMatch[1];
    }
    if (!image) {
      const imgMatch = description.match(/https?:\/\/[^\s"'<>]+\.(jpg|jpeg|png|webp)/i);
      if (imgMatch) image = imgMatch[0];
    }

    const categories = [];
    const catRegex = /<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(block)) !== null) {
      const cat = catMatch[1].trim();
      if (cat && cat.length < 30) categories.push(cat);
    }

    const isBreaking = title && (
      title.includes('عاجل') ||
      title.includes('breaking') ||
      title.toLowerCase().includes('urgent')
    );
    if (isBreaking && !categories.includes('عاجل')) categories.unshift('عاجل');

    if (title) {
      items.push({
        title,
        link,
        description: description.slice(0, 220),
        pubDate,
        image,
        categories,
        timestamp: pubDate ? new Date(pubDate).getTime() : 0,
        isBreaking,
      });
    }
  }
  return items;
}

function timeAgo(date) {
  const now = Date.now();
  const diff = now - new Date(date).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'الآن';
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} ي`;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Access-Control-Allow-Headers': 'Content-Type'
      }
    });
  }

  try {
    const requestedSources = url.searchParams.get('sources')
      ? url.searchParams.get('sources').split(',')
      : Object.keys(SOURCES);
    const limit = parseInt(url.searchParams.get('limit')) || 80;
    const tier = parseInt(url.searchParams.get('tier')) || 3;

    // Bindings (set up in Cloudflare dashboard)
    const ai = context.env?.AI || null;
    const kv = context.env?.TRANSLATIONS || null;

    const allItems = [];

    const fetches = requestedSources
      .filter(id => SOURCES[id] && SOURCES[id].tier <= tier)
      .flatMap(id => {
        const source = SOURCES[id];
        return source.feeds.map(async (feedUrl) => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(feedUrl, {
              headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; SadaNews/2.6; +https://sada-app.pages.dev)',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*',
                'Cache-Control': 'no-cache',
              },
              signal: controller.signal,
              cf: { cacheTtl: 30, cacheEverything: false }
            });
            clearTimeout(timeout);
            if (!res.ok) return [];
            const xml = await res.text();
            return parseXML(xml).map(item => ({
              ...item,
              sourceId: id,
              sourceName: source.name,
              sourceInitial: source.initial,
              sourceTier: source.tier,
              lang: source.lang || 'ar',
              timeAgo: timeAgo(item.pubDate),
            }));
          } catch {
            return [];
          }
        });
      });

    const results = await Promise.allSettled(fetches);
    results.forEach(r => { if (r.status === 'fulfilled') allItems.push(...r.value); });

    // ── Translate English items ──
    const enIndices = [];
    for (let i = 0; i < allItems.length; i++) {
      if (allItems[i].lang === 'en') enIndices.push(i);
    }
    const debugErrors = [];
    let aiTestResult = null;

    // Quick AI smoke test
    if (ai && enIndices.length > 0) {
      try {
        const test = await ai.run('@cf/meta/m2m100-1.2b', {
          text: 'Hello world',
          source_lang: 'english',
          target_lang: 'arabic',
        });
        aiTestResult = test?.translated_text || JSON.stringify(test);
      } catch (e) {
        aiTestResult = 'ERROR: ' + (e.message || String(e));
      }
    }

    // Translate English items — first try just ONE to verify pipeline
    let singleTestResult = null;
    if (ai && aiTestResult && !aiTestResult.startsWith('ERROR') && enIndices.length > 0) {
      const firstIdx = enIndices[0];
      const firstItem = allItems[firstIdx];
      try {
        singleTestResult = { before: firstItem.title };
        const translated = await translateItem(firstItem, ai, kv);
        singleTestResult.after = translated.title;
        singleTestResult.translated = translated.translated;
        singleTestResult.err = translated._err || null;
        allItems[firstIdx] = translated;
      } catch (e) {
        singleTestResult.error = e.message;
      }

      // Now translate the rest (up to 14 more) in parallel batches of 5
      const remaining = enIndices.slice(1, 15);
      for (let batch = 0; batch < remaining.length; batch += 5) {
        const chunk = remaining.slice(batch, batch + 5);
        const results = await Promise.allSettled(
          chunk.map(idx => translateItem(allItems[idx], ai, kv))
        );
        results.forEach((r, j) => {
          if (r.status === 'fulfilled') {
            allItems[chunk[j]] = r.value;
            if (r.value._err) debugErrors.push({ src: r.value.sourceId, err: r.value._err });
          } else {
            debugErrors.push({ src: allItems[chunk[j]].sourceId, err: r.reason?.message });
          }
        });
      }
    }

    // Split into Arabic and translated English, sort each by recency
    const arabicItems = allItems.filter(i => i.lang !== 'en');
    const translatedEn = allItems.filter(i => i.lang === 'en' && i.translated);

    const sortByRecency = (a, b) => {
      if (a.isBreaking && !b.isBreaking) return -1;
      if (!a.isBreaking && b.isBreaking) return 1;
      return b.timestamp - a.timestamp;
    };
    arabicItems.sort(sortByRecency);
    translatedEn.sort(sortByRecency);

    // Deduplicate each pool
    const dedup = (items) => {
      const seen = new Set();
      return items.filter(item => {
        const key = item.title.slice(0, 30).trim();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };
    const dedupedAr = dedup(arabicItems);
    const dedupedEn = dedup(translatedEn);

    // Mix: ~70% Arabic, ~30% translated English, interleaved
    const mixed = [];
    let ai2 = 0, ei = 0;
    while (mixed.length < limit && (ai2 < dedupedAr.length || ei < dedupedEn.length)) {
      // Add 3 Arabic then 1 English (roughly 75/25 mix)
      for (let n = 0; n < 3 && ai2 < dedupedAr.length && mixed.length < limit; n++) {
        mixed.push(dedupedAr[ai2++]);
      }
      if (ei < dedupedEn.length && mixed.length < limit) {
        mixed.push(dedupedEn[ei++]);
      }
    }

    // If no translated English yet, fill entirely with Arabic
    if (dedupedEn.length === 0) {
      mixed.length = 0;
      mixed.push(...dedup(allItems.sort(sortByRecency)).slice(0, limit));
    }

    const feed = mixed.map((item, i) => ({
      id: `${item.sourceId}-${i}-${item.timestamp}`,
      title: item.title,
      body: item.description,
      link: item.link,
      image: item.image,
      categories: item.categories,
      time: item.timeAgo,
      timestamp: item.timestamp || 0,
      isBreaking: item.isBreaking,
      translated: item.translated || false,
      source: {
        id: item.sourceId,
        name: item.sourceName,
        initial: item.sourceInitial,
        tier: item.sourceTier,
      },
    }));

    const sourceList = requestedSources
      .filter(id => SOURCES[id] && SOURCES[id].tier <= tier)
      .map(id => ({
        id,
        name: SOURCES[id].name,
        initial: SOURCES[id].initial,
        tier: SOURCES[id].tier,
      }));

    // Clean up internal fields before sending
    feed.forEach(f => delete f._err);

    return new Response(JSON.stringify({
      ok: true,
      count: feed.length,
      sources: sourceList,
      feed,
      _debug: {
        hasAI: !!ai,
        hasKV: !!kv,
        aiType: ai ? typeof ai.run : 'n/a',
        aiTest: aiTestResult,
        translatedEnPool: dedupedEn.length,
        englishFetched: enIndices.length,
        translatedCount: feed.filter(f => f.translated).length,
        translationErrors: debugErrors,
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=300',
      }
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
