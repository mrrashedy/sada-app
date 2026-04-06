// Cloudflare Pages Function — /api/feeds
// Auto-deploys as /api/feeds on Cloudflare Pages

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
};

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
    // Decode HTML entities first
    rawDesc = rawDesc
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/&#\d+;/g, ' ').replace(/&[a-z]+;/g, ' ');
    // Strip all HTML tags and URLs
    const description = rawDesc
      .replace(/<[^>]*>/g, ' ')
      .replace(/https?:\/\/[^\s<>"']+/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const pubDate = get('pubDate');

    // Image extraction — try multiple sources
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

    // Categories
    const categories = [];
    const catRegex = /<category[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/category>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(block)) !== null) {
      const cat = catMatch[1].trim();
      if (cat && cat.length < 30) categories.push(cat);
    }

    // Breaking news detection
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

  // CORS preflight
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
    const limit = parseInt(url.searchParams.get('limit')) || 50;
    // Tier filter: 1 = flagship only, 2 = all, default = all
    const tier = parseInt(url.searchParams.get('tier')) || 2;

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
                'User-Agent': 'Mozilla/5.0 (compatible; SadaNews/2.5; +https://sada-app.pages.dev)',
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
              timeAgo: timeAgo(item.pubDate),
            }));
          } catch (e) {
            return [];
          }
        });
      });

    const results = await Promise.allSettled(fetches);
    results.forEach(r => { if (r.status === 'fulfilled') allItems.push(...r.value); });

    // Sort: breaking first, then by recency
    allItems.sort((a, b) => {
      if (a.isBreaking && !b.isBreaking) return -1;
      if (!a.isBreaking && b.isBreaking) return 1;
      return b.timestamp - a.timestamp;
    });

    // Deduplicate by title similarity
    const seen = new Set();
    const deduped = allItems.filter(item => {
      const key = item.title.slice(0, 30).trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const feed = deduped.slice(0, limit).map((item, i) => ({
      id: `${item.sourceId}-${i}-${item.timestamp}`,
      title: item.title,
      body: item.description,
      link: item.link,
      image: item.image,
      categories: item.categories,
      time: item.timeAgo,
      isBreaking: item.isBreaking,
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

    return new Response(JSON.stringify({
      ok: true,
      count: feed.length,
      sources: sourceList,
      feed,
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
