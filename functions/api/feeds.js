// Cloudflare Pages Function — /api/feeds
// Production architecture: KV-backed stale-while-revalidate feed cache
// RSS aggregation runs at most once per 2 minutes; all other requests read from KV

// ─── Source Registry ───

const SOURCES = {
  // Tier 1: Flagship Arabic broadcasters
  // Al Jazeera Arabic: the UUID-based Arc CMS feed updates slowly (editor-
  // curated Story List, ~3h latency). We add a Google News site-search as
  // a fresh backup so aljazeera items always appear near the top of the feed.
  // Both URLs are fetched in parallel and merged/deduplicated by title.
  aljazeera:       { name: "الجزيرة", initial: "ج", tier: 1, feeds: [
    "https://www.aljazeera.net/aljazeerarss/a7c186be-1baa-4bd4-9d80-a84db769f779/73d0e1b4-532f-45ef-b135-bfdff8b8cab9",
    "https://news.google.com/rss/search?q=site%3Aaljazeera.net&hl=ar&gl=SA&ceid=SA%3Aar",
  ] },
  aljazeera_en:    { name: "الجزيرة EN", initial: "ج", tier: 3, lang: "en", feeds: ["https://www.aljazeera.com/xml/rss/all.xml"] },
  bbc:             { name: "BBC عربي", initial: "B", tier: 1, feeds: ["https://feeds.bbci.co.uk/arabic/rss.xml","https://feeds.bbci.co.uk/arabic/middleeast/rss.xml","https://feeds.bbci.co.uk/arabic/worldnews/rss.xml"] },
  skynews:         { name: "سكاي نيوز", initial: "S", tier: 1, feeds: ["https://www.skynewsarabia.com/rss.xml","https://www.skynewsarabia.com/rss/middle-east.xml","https://www.skynewsarabia.com/rss/world.xml"] },
  france24:        { name: "فرانس ٢٤", initial: "F", tier: 1, feeds: ["https://www.france24.com/ar/rss","https://www.france24.com/ar/الشرق-الأوسط/rss"] },
  dw:              { name: "دويتشه فيله", initial: "D", tier: 1, feeds: ["https://rss.dw.com/xml/rss-ar-all"] },
  cnn_ar:          { name: "CNN عربية", initial: "C", tier: 1, feeds: ["https://arabic.cnn.com/api/v1/rss/rss.xml"] },
  independent_ar:  { name: "إندبندنت عربية", initial: "إ", tier: 1, feeds: ["https://www.independentarabia.com/rss.xml"] },
  aawsat:          { name: "الشرق الأوسط", initial: "ش", tier: 1, feeds: ["https://aawsat.com/feed"] },
  alhurra:         { name: "الحرة", initial: "ح", tier: 1, feeds: ["https://alhurra.com/feed"] },
  // Tier 1 additions
  rt_ar:           { name: "روسيا اليوم", initial: "RT", tier: 1, feeds: ["https://arabic.rt.com/rss/"] },
  alarabiya:       { name: "العربية", initial: "ع", tier: 1, feeds: ["https://www.alarabiya.net/.mrss/ar.xml"] },
  asharq_news:     { name: "الشرق الإخبارية", initial: "شر", tier: 1, feeds: ["https://asharq.com/rss.xml"] },

  // Wire services + aggregators (Arabic Google News topics give broad coverage)
  gnews_world:     { name: "أخبار Google عالمي", initial: "GN", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/WORLD?hl=ar&gl=SA&ceid=SA:ar"] },
  gnews_tech:      { name: "أخبار Google تقنية", initial: "GT", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ar&gl=SA&ceid=SA:ar"] },
  gnews_health:    { name: "أخبار Google صحة", initial: "GH", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/HEALTH?hl=ar&gl=SA&ceid=SA:ar"] },
  gnews_science:   { name: "أخبار Google علوم", initial: "GS", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=ar&gl=SA&ceid=SA:ar"] },

  // Tier 2: Regional newspapers
  alaraby:   { name: "العربي الجديد", initial: "ع", tier: 2, feeds: ["https://www.alaraby.co.uk/rss"] },
  almasry:   { name: "المصري اليوم", initial: "م", tier: 2, feeds: ["https://www.almasryalyoum.com/rss/rssfeed"] },
  youm7:     { name: "اليوم السابع", initial: "٧", tier: 1, feeds: ["https://www.youm7.com/RSS/SectionRss?SectionID=97","https://www.youm7.com/RSS/SectionRss?SectionID=203"] },
  egypt_ind: { name: "Egypt Independent", initial: "EI", tier: 2, lang: "en", feeds: ["https://www.egyptindependent.com/feed/"] },
  okaz:      { name: "عكاظ", initial: "ك", tier: 2, feeds: ["https://www.okaz.com.sa/rssFeed/0"] },
  alsumaria: { name: "السومرية", initial: "سم", tier: 2, feeds: ["https://www.alsumaria.tv/Rss/iraq-latest-news/ar"] },
  alkhaleej: { name: "الخليج", initial: "خ", tier: 2, feeds: ["https://www.alkhaleej.ae/section/1110/rss.xml"] },
  uae24:     { name: "24 الإمارات", initial: "٢", tier: 2, feeds: ["https://24.ae/rss.aspx"] },
  alsharq:   { name: "الشرق", initial: "ق", tier: 2, feeds: ["https://al-sharq.com/rss/latestNews"] },
  alyaum:    { name: "اليوم", initial: "ل", tier: 2, feeds: ["https://www.alyaum.com/rssFeed/1005"] },
  alquds:    { name: "القدس العربي", initial: "ق", tier: 2, feeds: ["https://www.alquds.co.uk/feed/"] },
  noonpost:  { name: "نون بوست", initial: "ن", tier: 2, feeds: ["https://www.noonpost.com/feed/"] },

  // Tier 2: Levant — Lebanon, Syria, Jordan, Palestine
  annahar:    { name: "النهار", initial: "نه", tier: 2, feeds: ["https://www.annahar.com/arabic/rss-feed"] },
  lbci:       { name: "إل بي سي آي", initial: "LB", tier: 2, feeds: ["https://www.lbcgroup.tv/Rss/latest-news/ar"] },
  roya:       { name: "رؤيا", initial: "ر", tier: 2, feeds: ["https://royanews.tv/rss"] },
  almamlaka:  { name: "المملكة", initial: "مم", tier: 2, feeds: ["https://www.almamlakatv.com/rss.xml"] },
  sana:       { name: "سانا", initial: "س", tier: 2, feeds: ["https://sana.sy/feed/"] },
  alghad:     { name: "الغد", initial: "غ", tier: 2, feeds: ["https://alghad.com/rss"] },

  // Tier 2: North Africa (Maghreb) — Morocco, Algeria, Tunisia
  hespress:    { name: "هسبريس", initial: "هـ", tier: 2, feeds: ["https://www.hespress.com/feed"] },
  le360_ar:    { name: "لو 360", initial: "360", tier: 2, feeds: ["https://ar.le360.ma/arc/outboundfeeds/rss/?outputType=xml"] },
  snrt:        { name: "الأولى المغربية", initial: "SN", tier: 2, feeds: ["https://snrtnews.com/rss.xml"] },
  echorouk:    { name: "الشروق الجزائرية", initial: "شج", tier: 2, feeds: ["https://www.echoroukonline.com/feed"] },
  elkhabar:    { name: "الخبر", initial: "خب", tier: 2, feeds: ["https://www.elkhabar.com/feed"] },
  ennahar_dz:  { name: "النهار الجزائرية", initial: "نج", tier: 2, feeds: ["https://www.ennaharonline.com/feed/"] },
  mosaiquefm:  { name: "موزاييك إف إم", initial: "MFM", tier: 2, feeds: ["https://www.mosaiquefm.net/ar/rss"] },

  // Tier 2: Sahel & Sudan & Libya
  sahara_media: { name: "صحراء ميديا", initial: "صح", tier: 2, feeds: ["https://saharamedias.net/feed/"] },
  sudan_tribune: { name: "سودان تريبيون", initial: "ST", tier: 2, feeds: ["https://sudantribune.net/feed/"] },
  alsudani:     { name: "السوداني", initial: "سد", tier: 2, feeds: ["https://alsudaninews.com/?feed=rss2"] },
  libya_ahrar:  { name: "ليبيا الأحرار", initial: "LY", tier: 2, feeds: ["https://libyaalahrar.net/feed/"] },

  // Tier 3: English sources (auto-translated)
  bbc_en:   { name: "BBC عالمي", initial: "BB", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml"] },
  nyt:      { name: "نيويورك تايمز", initial: "NY", tier: 3, lang: "en", feeds: ["https://rss.nytimes.com/services/xml/rss/nyt/World.xml"] },
  fox:      { name: "فوكس نيوز", initial: "FX", tier: 3, lang: "en", feeds: ["https://moxie.foxnews.com/google-publisher/latest.xml"] },
  bbc_tech: { name: "BBC تقنية", initial: "BT", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/technology/rss.xml"] },
  nbc:      { name: "NBC نيوز", initial: "NB", tier: 3, lang: "en", feeds: ["https://feeds.nbcnews.com/feeds/topstories"] },
  npr:      { name: "NPR عالمي", initial: "NP", tier: 3, lang: "en", feeds: ["https://feeds.npr.org/1004/rss.xml"] },
  abc_en:   { name: "ABC نيوز", initial: "AB", tier: 3, lang: "en", feeds: ["https://feeds.abcnews.com/abcnews/topstories"] },
  sky_en:   { name: "سكاي نيوز EN", initial: "SK", tier: 3, lang: "en", feeds: ["https://feeds.skynews.com/feeds/rss/world.xml"] },

  // Tier 3: Gulf English-language press (auto-translated)
  thenational:   { name: "ذا ناشيونال", initial: "TN", tier: 3, lang: "en", feeds: ["https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml"] },
  gulfnews:      { name: "غلف نيوز", initial: "GU", tier: 3, lang: "en", feeds: ["https://gulfnews.com/api/v1/collections/latest-news.rss"] },
  arabnews:      { name: "عرب نيوز", initial: "AN", tier: 3, lang: "en", feeds: ["https://www.arabnews.com/rss.xml"] },
  alarabiya_en:  { name: "العربية EN", initial: "عE", tier: 3, lang: "en", feeds: ["https://english.alarabiya.net/rss/en_default.xml"] },

  // Tier 3: Maghreb French-language press (auto-translated, M2M-100)
  hespress_fr:   { name: "هسبريس FR", initial: "HF", tier: 3, lang: "fr", feeds: ["https://fr.hespress.com/feed"] },
  le360_fr:      { name: "لو 360 FR", initial: "36F", tier: 3, lang: "fr", feeds: ["https://fr.le360.ma/arc/outboundfeeds/rss/?outputType=xml"] },

  // Tier 4: Additional real-time firehose sources — major Western broadcasters
  guardian_w:   { name: "الغارديان", initial: "G", tier: 3, lang: "en", feeds: ["https://www.theguardian.com/world/rss"] },
  wapo_world:   { name: "واشنطن بوست", initial: "WP", tier: 3, lang: "en", feeds: ["https://feeds.washingtonpost.com/rss/world"] },
  bloomberg:    { name: "بلومبرغ", initial: "BL", tier: 3, lang: "en", feeds: ["https://feeds.bloomberg.com/politics/news.rss"] },
  cnn_en:       { name: "CNN عالمي", initial: "CN", tier: 3, lang: "en", feeds: ["http://rss.cnn.com/rss/edition_world.rss"] },

  // ── PHOTO-GRID-ONLY SOURCES ──────────────────────────────────────
  // Tagged `photoOnly: true` so they're excluded from the main /api/feeds
  // (news) aggregation and only appear in /api/feeds?kind=photos.
  // The photo grid is an independent feature like the radar.

  // English photo-rich sources (auto-translated, culture/tech/science-leaning)
  wired:        { name: "Wired", initial: "WD", tier: 3, lang: "en", photoOnly: true, feeds: ["https://www.wired.com/feed/rss"] },
  verge:        { name: "The Verge", initial: "VG", tier: 3, lang: "en", photoOnly: true, feeds: ["https://www.theverge.com/rss/index.xml"] },
  atlasobscura: { name: "Atlas Obscura", initial: "AO", tier: 3, lang: "en", photoOnly: true, feeds: ["https://www.atlasobscura.com/feeds/latest"] },
  smithsonian:  { name: "Smithsonian", initial: "SM", tier: 3, lang: "en", photoOnly: true, feeds: ["https://www.smithsonianmag.com/rss/latest_articles/"] },
  bbc_culture:  { name: "BBC Culture", initial: "BC", tier: 3, lang: "en", photoOnly: true, feeds: ["https://www.bbc.com/culture/feed.rss"] },
  arstechnica:  { name: "Ars Technica", initial: "AT", tier: 3, lang: "en", photoOnly: true, feeds: ["https://feeds.arstechnica.com/arstechnica/index"] },

  // French fine-art & photography magazines (auto-translated via M2M-100)
  beauxarts:      { name: "Beaux Arts", initial: "BA", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.beauxarts.com/feed/"] },
  connaissance:   { name: "Connaissance des Arts", initial: "CA", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.connaissancedesarts.com/feed/"] },
  jda:            { name: "Le Journal des Arts", initial: "JA", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.lejournaldesarts.fr/rss.xml"] },
  telerama_arts:  { name: "Télérama Arts", initial: "TR", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.telerama.fr/rss/arts-expositions.xml"] },
  tribune_art:    { name: "La Tribune de l'Art", initial: "TA", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.latribunedelart.com/spip.php?page=backend"] },
  artsper:        { name: "Artsper Magazine", initial: "AP", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://blog.artsper.com/fr/feed/"] },
  artpress:       { name: "ArtPress", initial: "AR", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.artpress.com/feed/"] },
  blind_mag:      { name: "Blind Magazine", initial: "BM", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.blind-magazine.com/fr/feed/"] },
  fisheye_mag:    { name: "Fisheye Magazine", initial: "FM", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://fisheyemagazine.fr/feed/"] },
  phototrend:     { name: "Phototrend", initial: "PT", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://phototrend.fr/feed/"] },
  lemonde_arts:   { name: "Le Monde Arts", initial: "LMa", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.lemonde.fr/arts/rss_full.xml"] },
  lemonde_photo:  { name: "Le Monde Photo", initial: "LMp", tier: 3, lang: "fr", photoOnly: true, feeds: ["https://www.lemonde.fr/photo/rss_full.xml"] },
};

// Helper: filter the SOURCES map by kind and return as entries.
// kind 'news'   → sources WITHOUT photoOnly (main feed)
// kind 'photos' → sources WITH photoOnly (photo grid)
function sourcesForKind(kind) {
  return Object.entries(SOURCES).filter(([, s]) => {
    const isPhoto = !!s.photoOnly;
    if (kind === 'photos') return isPhoto;
    if (kind === 'map') return false;        // map = NewsData API only, no RSS
    // 'news' and 'radar' both use all non-photo RSS sources
    return !isPhoto;
  });
}

// Per-kind source list for the client (name/initial/tier only)
function sourceListForKind(kind) {
  return sourcesForKind(kind).map(([id, s]) => ({
    id, name: s.name, initial: s.initial, tier: s.tier,
  }));
}

// Back-compat: the legacy SOURCE_LIST exported the full set (used by admin
// and debug tools). Keep it as the news list by default.
const SOURCE_LIST = sourceListForKind('news');

// ─── Utilities ───

const CACHE_TTL = 15;       // 15s — max staleness before forcing re-fetch (DO refresher warms it every 20s)
// Kind-specific KV keys so the news feed and photo feed never collide
const KV_KEYS = {
  news:   { feed: 'feed:latest',   meta: 'feed:meta'   },
  photos: { feed: 'photos:latest', meta: 'photos:meta' },
  map:    { feed: 'map:latest',    meta: 'map:meta'    },
  radar:  { feed: 'radar:latest',  meta: 'radar:meta'  },
};

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

// ─── Category Cleanup ───
// Category strings from RSS and NewsData come unvalidated and often include
// publisher-internal noise that is never a meaningful topic for users:
//   • WordPress default taxonomy leaks ("lifestyle", "awards and recognitions")
//     that 14+ Arab publishers emit on every article regardless of content
//   • Internal site codes and publisher names ("fnc", "Fox News")
//   • Content-type labels ("article", "news", "breaking", "top", "featured")
//   • URL-path slugs from the publisher CMS ("fox-news/us/economy")
//   • Generic placeholders ("آخر الاخبار", "منوعات", "الرئيسية", "home", "main")
// `عاجل` is the one string we keep as a category — it's used downstream as
// a breaking-news marker and is filtered out at display time.
const MAX_CATEGORIES_PER_ITEM = 5;

const JUNK_CATEGORIES = new Set([
  // English: content-type, publisher internals, placeholders
  'lifestyle', 'awards and recognitions', 'article', 'articles',
  'fnc', 'fox news', 'news', 'breaking', 'top', 'top stories',
  'featured', 'uncategorized', 'general', 'general news', 'home',
  'latest', 'latest news', 'headline', 'headlines', 'main',
  'misc', 'miscellaneous', 'others', 'other', 'all',
  'press release', 'press releases', 'pr', 'sponsored',
  // NewsData fixed-enum values that we drop when ai_tag is also present
  // (handled in fetchNewsDataForKind), but kept here as a safety net for RSS:
  'world', 'top news',
  // Arabic: generic placeholders (not real topics)
  'آخر الاخبار', 'آخر الأخبار', 'أخبار', 'الأخبار', 'اخبار',
  'منوعات', 'الرئيسية', 'الصفحة الرئيسية',
  'المزيد', 'متفرقات', 'عام', 'عاجل أخبار',
  'الأكثر قراءة', 'الأكثر مشاهدة', 'مقالات', 'مقال',
]);

const JUNK_CATEGORY_PATTERNS = [
  /^https?:/i,                  // full URLs leaked from publisher RSS
  /^\/?fox-news\//i,            // Fox URL-slug style categories
  /^\/[a-z]/i,                  // any leading-slash path
  /^[a-z][a-z0-9_-]+\/[a-z]/i,  // generic slash-separated slug (path-like)
];

function isJunkCategory(raw) {
  if (!raw) return true;
  const trimmed = String(raw).trim();
  if (trimmed.length < 2 || trimmed.length >= 30) return true;
  if (trimmed === 'عاجل') return false; // breaking-news marker, never junk
  const lower = trimmed.toLowerCase();
  if (JUNK_CATEGORIES.has(lower)) return true;
  if (JUNK_CATEGORY_PATTERNS.some(re => re.test(trimmed))) return true;
  return false;
}

// Decode an XML response, handling rare UTF-16 feeds (e.g. annahar.com) that
// don't advertise the correct charset. Sniffs the first 4 bytes for the
// `<?xml` pattern in UTF-16 LE/BE; falls back to UTF-8 (which res.text()
// would otherwise give us). The cost over plain res.text() is one extra
// allocation, only on the small RSS payload.
async function decodeXmlResponse(res) {
  const buf = await res.arrayBuffer();
  const b = new Uint8Array(buf);
  if (b.length >= 2 && b[0] === 0xff && b[1] === 0xfe) return new TextDecoder('utf-16le').decode(buf);
  if (b.length >= 2 && b[0] === 0xfe && b[1] === 0xff) return new TextDecoder('utf-16be').decode(buf);
  if (b.length >= 4 && b[0] === 0x3c && b[1] === 0x00 && b[2] === 0x3f && b[3] === 0x00) return new TextDecoder('utf-16le').decode(buf);
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x3c && b[2] === 0x00 && b[3] === 0x3f) return new TextDecoder('utf-16be').decode(buf);
  return new TextDecoder('utf-8').decode(buf);
}

function parseXML(xml) {
  const items = [];

  // Detect Atom feeds (The Verge, etc.) vs RSS feeds
  const isAtom = xml.includes('<feed') && xml.includes('xmlns="http://www.w3.org/2005/Atom"');
  const itemRegex = isAtom ? /<entry>([\s\S]*?)<\/entry>/g : /<item>([\s\S]*?)<\/item>/g;

  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const get = (tag) => {
      const m = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`));
      return m ? cleanText(m[1] || m[2] || '') : '';
    };
    const title = get('title');
    if (!title) continue;

    // Atom uses <link href="..."/>, RSS uses <link>...</link>
    let link = get('link');
    if (!link && isAtom) {
      const linkMatch = block.match(/<link[^>]+rel=["']alternate["'][^>]+href=["']([^"']+)["']/);
      if (linkMatch) link = linkMatch[1];
      if (!link) { const lm = block.match(/<link[^>]+href=["']([^"']+)["']/); if (lm) link = lm[1]; }
    }

    // Atom uses <content> or <summary>, RSS uses <description>
    const description = (get('description') || get('summary') || get('content')).replace(/https?:\/\/[^\s<>"']+/g, '').replace(/\s+/g, ' ').trim();

    // Atom uses <published> or <updated>, RSS uses <pubDate>
    const pubDate = get('pubDate') || get('published') || get('updated');

    let image = '';
    const mediaMatch = block.match(/url=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)/i);
    if (mediaMatch) image = mediaMatch[1];
    if (!image) { const enc = block.match(/<enclosure[^>]+url=["']([^"']+)/); if (enc) image = enc[1]; }
    // Atom thumbnail
    if (!image) { const thumb = block.match(/<media:thumbnail[^>]+url=["']([^"']+)/); if (thumb) image = thumb[1]; }
    if (!image) { const img = block.match(/<img[^>]+src=["']([^"']+\.(jpg|jpeg|png|webp)[^"']*)/i); if (img) image = img[1]; }

    const categories = [];
    const catRegex = /<category[^>]*(?:term=["']([^"']+)["'])?[^>]*>([\s\S]*?)<\/category>|<category[^>]+term=["']([^"']+)["'][^>]*\/>/g;
    let catMatch;
    while ((catMatch = catRegex.exec(block)) !== null) {
      if (categories.length >= MAX_CATEGORIES_PER_ITEM) break;
      const c = cleanText(catMatch[1] || catMatch[2] || catMatch[3] || '');
      if (!isJunkCategory(c) && !categories.includes(c)) categories.push(c);
    }

    const isBreaking = title.includes('عاجل') || title.includes('breaking') || title.toLowerCase().includes('urgent');
    if (isBreaking && !categories.includes('عاجل')) categories.unshift('عاجل');
    items.push({ title, link, description: description.slice(0, 800), pubDate, image, categories, timestamp: pubDate ? new Date(pubDate).getTime() : 0, isBreaking });
  }
  return items;
}

// ─── NewsData.io API Adapter ───
// Professional plan: 50,000 credits/month. Each API call = 1 credit.
// Three verticals call different language batches; throttled per-kind so
// the combined budget stays under 50k/month (~39k target).

const ND_LANG_MAP = {
  arabic: 'ar', english: 'en', french: 'fr', german: 'de', spanish: 'es',
  portuguese: 'pt', russian: 'ru', chinese: 'zh', japanese: 'ja', korean: 'ko',
  turkish: 'tr', hindi: 'hi', italian: 'it', dutch: 'nl', polish: 'pl',
  swedish: 'sv', danish: 'da', norwegian: 'no', indonesian: 'id', thai: 'th',
  vietnamese: 'vi', czech: 'cs', romanian: 'ro', greek: 'el', hungarian: 'hu',
  ar: 'ar', en: 'en', fr: 'fr', de: 'de', es: 'es', pt: 'pt',
  ru: 'ru', zh: 'zh', ja: 'ja', ko: 'ko', tr: 'tr', hi: 'hi',
};

// Per-kind NewsData batch configs
const ND_BATCHES = {
  news:  [{ language: 'ar', size: 50 }],                                          // 1 call
  map:   [{ language: 'en', size: 50 }, { language: 'fr,de,es,pt,ru,tr', size: 50 }, { language: 'zh,ja,ko,hi', size: 50 }],  // 3 calls
  radar: [{ language: 'ar', size: 50 }, { language: 'en', size: 30 }],             // 2 calls
};

// Throttle: minimum seconds between NewsData calls per kind.
// news=5min, map=10min, radar=5min → ~39k calls/month total.
const ND_THROTTLE_SEC = { news: 300, map: 600, radar: 300 };

function ndThrottleKey(kind) { return `nd_ts:${kind}`; }

async function fetchNewsDataForKind(env, feedCache, kind = 'news') {
  const apiKey = env?.NEWSDATA_API_KEY;
  if (!apiKey) return [];
  const batches = ND_BATCHES[kind];
  if (!batches) return [];

  // Rate control is handled by the cron worker's tick schedule:
  // news=every tick, map=every 4th, radar=every 4th (offset).
  // No additional throttle needed here.

  try {
    const allResults = [];
    const fetches = batches.map(async (batch) => {
      const params = new URLSearchParams({
        apikey: apiKey,
        language: batch.language,
        size: String(batch.size),
      });
      try {
        const res = await fetch(`https://newsdata.io/api/1/latest?${params}`, {
          signal: AbortSignal.timeout(12000),
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (data.status !== 'success' || !Array.isArray(data.results)) return [];
        return data.results;
      } catch { return []; }
    });

    const results = await Promise.allSettled(fetches);
    results.forEach(r => { if (r.status === 'fulfilled') allResults.push(...r.value); });

    return allResults
      .filter(a => a.title && a.link && !a.duplicate)
      .map(a => {
        const ts = a.pubDate ? new Date(a.pubDate).getTime() : Date.now();
        // Detect breaking BEFORE filtering junk, since a raw "breaking" tag
        // from the upstream is a signal even though we'll drop it from display.
        const rawApiCats = Array.isArray(a.category) ? a.category : [];
        const rawAiTags  = Array.isArray(a.ai_tag) ? a.ai_tag : [];
        const titleLower = (a.title || '').toLowerCase();
        const isBreaking =
          (a.title || '').includes('عاجل') ||
          titleLower.includes('breaking') ||
          [...rawApiCats, ...rawAiTags].some(c => (c || '').toLowerCase() === 'breaking');

        // Tag selection — NewsData ships TWO tag fields and they're VERY different:
        //
        //   - category[]: a fixed enum (business, sports, health, world, top, etc.)
        //     applied by keyword matching. Frequently misapplied — a war article
        //     gets tagged "lifestyle", a Strait of Hormuz piece gets "business".
        //
        //   - ai_tag[]: LLM-generated specific topics (e.g. "مضيق هرمز",
        //     "نادي الهلال السعودي"). Generally trustworthy when present.
        //
        // Strategy: if ai_tag is present, USE IT EXCLUSIVELY. The fixed enum
        // adds no signal once we have a specific topic. Fall back to category[]
        // only when ai_tag is empty.
        const aiTags  = rawAiTags.filter(c => !isJunkCategory(c));
        const apiCats = rawApiCats.filter(c => !isJunkCategory(c));
        const cats = (aiTags.length > 0 ? aiTags : apiCats).slice(0, MAX_CATEGORIES_PER_ITEM);
        if (isBreaking && !cats.includes('عاجل')) cats.unshift('عاجل');
        const body = (a.content || a.description || '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
        const itemLang = ND_LANG_MAP[a.language] || ND_LANG_MAP[(a.language || '').toLowerCase()] || 'en';
        return {
          title: (a.title || '').trim(),
          link: a.link,
          description: body.slice(0, 800),
          pubDate: a.pubDate || '',
          image: a.image_url || '',
          categories: cats,
          timestamp: ts,
          isBreaking,
          sourceId: `nd_${(a.source_id || 'unknown').replace(/[^a-z0-9_]/g, '')}`,
          sourceName: a.source_name || a.source_id || 'NewsData',
          sourceInitial: (a.source_name || 'N')[0],
          sourceTier: 2,
          lang: itemLang,
          sentiment: a.sentiment || null,
          country: Array.isArray(a.country) ? a.country : [],
        };
      });
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

// In-memory apply: given an index, translate matching items with zero
// subrequests. Translation target is English — Arabic and English items
// are passed through unchanged. Everything else (French, German, etc.)
// gets replaced with the English version from the index.
// Quality check: reject translations that are still dominated by non-Latin
// script, i.e. the translator passed through the source unchanged.
function isCleanEnglish(text) {
  if (!text) return false;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  const foreign = (text.match(/[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\u0400-\u04FF]/g) || []).length;
  return latin > 0 && (foreign / (latin + foreign)) < 0.15;
}

function applyTranslationIndex(items, index) {
  if (!index) return items;
  return items.map(item => {
    if (item.translated) return item;
    if (item.lang === 'ar' || item.lang === 'en') return item;
    const h = translationHash(item);
    const hit = index[h];
    if (!hit) return item;
    if (!isCleanEnglish(hit.t)) return item;
    // The item's effective language becomes English after translation.
    return { ...item, title: hit.t || item.title, description: hit.d || item.description, body: hit.t ? (hit.d || item.body) : item.body, lang: 'en', translated: true };
  });
}

// AI call. No KV write — caller updates the in-memory index and writes once.
// Target is always English. English items never reach here.
async function fetchTranslation(item, ai) {
  if (!ai) return null;
  const f = translationFields(item);
  if (f.lang === 'en') return null;
  const sourceLang = M2M_LANG[f.lang] || 'english';
  try {
    const titleRes = await ai.run('@cf/meta/m2m100-1.2b', { text: f.title, source_lang: sourceLang, target_lang: 'english' });
    const t = titleRes?.translated_text || f.title;
    let d = f.description || '';
    if (d) {
      try {
        const descRes = await ai.run('@cf/meta/m2m100-1.2b', { text: d, source_lang: sourceLang, target_lang: 'english' });
        d = descRes?.translated_text || d;
      } catch {}
    }
    return { t, d };
  } catch { return null; }
}

// Background pass: translate non-Arabic, non-English items not yet in the
// index. Reads index once, writes once → 2 KV subrequests regardless of count.
async function warmTranslations(items, ai, kv, limit = 40) {
  if (!ai || !kv) return;
  const index = await loadTranslationIndex(kv);
  const pending = [];
  for (const item of items) {
    const f = translationFields(item);
    if (f.lang === 'ar' || f.lang === 'en') continue;
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

async function aggregateFeeds(ai, translationKV, kind = 'news', env = null, feedCache = null) {
  const allItems = [];

  // Fetch sources for the requested kind — news feed and photo grid use
  // disjoint source pools (the `photoOnly: true` flag gates them).
  const fetches = sourcesForKind(kind).flatMap(([id, source]) => {
    return (source.feeds || []).map(async (feedUrl) => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12000);
        const res = await fetch(feedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SadaNews/3.0)', 'Accept': 'application/rss+xml, application/xml, text/xml, */*' },
          signal: controller.signal,
          cf: { cacheTtl: 15, cacheEverything: true },
        });
        clearTimeout(timeout);
        if (!res.ok) return [];
        const xml = await decodeXmlResponse(res);
        return parseXML(xml).map(item => ({
          ...item, sourceId: id, sourceName: source.name, sourceInitial: source.initial, sourceTier: source.tier, lang: source.lang || 'ar',
        }));
      } catch { return []; }
    });
  });

  const results = await Promise.allSettled(fetches);
  results.forEach(r => { if (r.status === 'fulfilled') allItems.push(...r.value); });

  // NewsData.io API — supplements RSS with 85,000+ sources.
  // Each vertical gets its own language batches and throttle cadence.
  if (kind !== 'photos') {
    try {
      const ndItems = await fetchNewsDataForKind(env, feedCache, kind);
      allItems.push(...ndItems);
    } catch {}
  }

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

  // Drop Google-News feed-meta items. When we hit news.google.com with a
  // `site:` query, Google sometimes returns the TARGET site's channel title
  // as a self-referential "article" — e.g. "الجزيرة نت: آخر أخبار اليوم حول
  // العالم - الجزيرة نت" with the link pointing back to the homepage. These
  // are never real articles and look terrible at the top of the feed.
  const isGoogleNewsChannelTitle = (item) => {
    const isGN = (item.link || '').includes('news.google.com');
    if (!isGN) return false;
    const t = (item.title || '').trim();
    // Common meta-title patterns (both Arabic and generic): "آخر أخبار اليوم",
    // "أحدث الأخبار", "أخبار اليوم", "Latest news", "Top stories", etc. If the
    // title is essentially the channel description, drop it.
    return /آخر\s*الأخبار|آخر\s*أخبار\s*اليوم|أخبار\s*اليوم|أحدث\s*الأخبار|Latest\s*news|Top\s*stories/i.test(t);
  };
  const preFiltered = allItems.filter(i => !isGoogleNewsChannelTitle(i));

  // No dedup — every source should surface its full set of items even when
  // multiple agencies cover the same story. Previously we deduped by title,
  // which dropped aljazeera copies whenever another source was fetched first.
  const sortByTime = (a, b) => b.timestamp - a.timestamp;

  // Timestamp sort with per-source cap — newest first, but no single source
  // can take more than MAX_PER_SOURCE consecutive items. This prevents RT (100+
  // items) from flooding the top while ensuring NewsData items appear naturally
  // alongside RSS content.
  const allDeduped = [...preFiltered].sort(sortByTime);
  const LIMIT = 1200;
  const MAX_PER_SOURCE = 3; // max items from same source before forcing variety
  const mixed = [];
  const srcCount = new Map(); // track consecutive items per source in recent window

  for (const item of allDeduped) {
    if (mixed.length >= LIMIT) break;
    const sid = item.sourceId;
    const recent = srcCount.get(sid) || 0;
    if (recent >= MAX_PER_SOURCE) {
      // Defer this item — will be picked up in the backfill pass
      continue;
    }
    mixed.push(item);
    srcCount.set(sid, recent + 1);
    // Reset other sources' counts every 20 items to allow them back in
    if (mixed.length % 20 === 0) {
      for (const [k] of srcCount) srcCount.set(k, Math.max(0, srcCount.get(k) - 1));
    }
  }
  // Backfill with remaining items sorted by time
  if (mixed.length < LIMIT) {
    const usedIds = new Set(mixed.map(m => m.title));
    for (const item of allDeduped) {
      if (mixed.length >= LIMIT) break;
      if (!usedIds.has(item.title)) mixed.push(item);
    }
  }

  // ── Flagship boost ─────────────────────────────────────────────────
  // Some tier-1 sources publish via editor-curated Story Lists (aljazeera's
  // Arc CMS feed, BBC Arabic) that update every few hours. Their freshest
  // items can be 2-3h old while tier-2 regional papers push fresh content
  // every minute — so the flagships fall below the fold under pure time sort.
  // We guarantee each flagship source has at least one item in the top
  // FLAGSHIP_WINDOW slots by splicing their newest (non-duplicate) item in
  // if missing. Stale items are acceptable because the user specifically
  // wants to see these flagships (they are the trust anchors of the feed).
  if (kind !== 'photos') {
    const FLAGSHIP_SOURCES = ['aljazeera', 'alarabiya', 'bbc', 'asharq_news', 'skynews', 'aawsat'];
    const FLAGSHIP_WINDOW = 12;
    const FLAGSHIP_INSERT_POS = 4;
    for (const flagshipId of FLAGSHIP_SOURCES) {
      // Already present in the visible window → nothing to do.
      if (mixed.slice(0, FLAGSHIP_WINDOW).some(x => x.sourceId === flagshipId)) continue;
      // Find newest item from this flagship anywhere in allDeduped.
      const item = allDeduped.find(x => x.sourceId === flagshipId);
      if (!item) continue;
      // Remove any later copy of it so we don't duplicate.
      const existingIdx = mixed.findIndex(x => x.title === item.title);
      if (existingIdx >= 0) mixed.splice(existingIdx, 1);
      // Splice into the visible window. Using a fixed slot keeps ordering
      // predictable across refreshes so the UI doesn't jitter.
      mixed.splice(Math.min(FLAGSHIP_INSERT_POS, mixed.length), 0, item);
    }
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
    _futureTs: !!(item.timestamp && item.timestamp > Date.now()),
    isBreaking: item.isBreaking,
    translated: item.translated || false,
    lang: item.lang || 'ar',
    source: { id: item.sourceId, name: item.sourceName, initial: item.sourceInitial, tier: item.sourceTier },
  }));

  // Drop items with future timestamps — broken RSS pubDate data (e.g. RT Arabic
  // sometimes publishes dates hours ahead). These would otherwise pin at the top.
  const cleanFeed = feed.filter(f => !f._futureTs);

  // Extract breaking articles for alerts
  const breaking = cleanFeed.filter(f => f.isBreaking).slice(0, 20);

  // Trending is computed on the client from article titles (src/lib/trending.js
  // extractTrending) — it does Arabic NLP: stopwords, stemming, bigram whitelist,
  // velocity detection, clustering. The server no longer duplicates a weaker
  // category-frequency version here. Admin curation of the radar still writes
  // to `radar_overrides` and is applied per-request via fetchAdminLayer.

  return { feed: cleanFeed, breaking, stats: { total: cleanFeed.length, translated: cleanFeed.filter(f => f.translated).length, sources: Object.keys(SOURCES).length } };
}

// ─── Admin Curation Layer (applied per-request, not baked into KV cache) ───
// Reads `article_overrides`, `manual_feed_items`, and `radar_overrides` from
// Supabase via the public anon key (all three have public-read RLS policies).
// Failures are silent — feed always returns even if Supabase is unreachable.
//   • article_overrides  → hide / rewrite / pin / feature individual articles
//   • manual_feed_items  → editor-authored items injected into the feed
//   • radar_overrides    → pin / hide / add trending topics on the client radar
//     (passed through to the client; the client applies them on top of its
//      title-based NLP trending)

async function fetchAdminLayer(env) {
  const url = env?.SUPABASE_URL;
  const key = env?.SUPABASE_ANON_KEY;
  if (!url || !key) return null;

  const headers = { apikey: key, authorization: `Bearer ${key}` };
  try {
    const [overridesRes, manualRes, radarRes] = await Promise.all([
      fetch(`${url}/rest/v1/article_overrides?select=*`, { headers, cf: { cacheTtl: 10, cacheEverything: true } }),
      fetch(`${url}/rest/v1/manual_feed_items?select=*&order=created_at.desc&limit=50`, { headers, cf: { cacheTtl: 10, cacheEverything: true } }),
      fetch(`${url}/rest/v1/radar_overrides?select=word,action,weight,expires_at`, { headers, cf: { cacheTtl: 10, cacheEverything: true } }),
    ]);
    if (!overridesRes.ok || !manualRes.ok) return null;
    const [overrides, manualItems, radarRaw] = await Promise.all([
      overridesRes.json(),
      manualRes.json(),
      radarRes.ok ? radarRes.json() : Promise.resolve([]),
    ]);
    // Drop expired radar overrides at the server so the client never sees them
    const now = Date.now();
    const radarOverrides = (radarRaw || []).filter(o =>
      !o.expires_at || new Date(o.expires_at).getTime() > now
    );
    return { overrides, manualItems, radarOverrides };
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
    sources: data.sources || SOURCE_LIST,
    feed: curatedFeed.slice(0, limit),
    breaking,
    radarOverrides: layer?.radarOverrides || [],
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

    // Resolve kind. The photo grid is an independent feature, so it uses its
    // own disjoint source pool and its own KV cache keys.
    const VALID_KINDS = ['news', 'photos', 'map', 'radar'];
    const kind = VALID_KINDS.includes(url.searchParams.get('kind')) ? url.searchParams.get('kind') : 'news';
    const kvKeys = KV_KEYS[kind];

    // Admin curation layer only applies to the news feed, not the photo grid.
    const layerPromise = kind === 'news' ? fetchAdminLayer(env) : Promise.resolve(null);
    const indexPromise = loadTranslationIndex(translationKV);

    // Per-kind source list — the client uses this to render the stories strip
    // for the news feed, or to show "source" attribution on photos.
    const sourceList = sourceListForKind(kind);

    // 1. Try KV cache first
    if (feedCache && !forceRefresh) {
      const [cachedFeed, cachedMeta, layer, index] = await Promise.all([
        feedCache.get(kvKeys.feed, 'json'),
        feedCache.get(kvKeys.meta, 'json'),
        layerPromise,
        indexPromise,
      ]);

      if (cachedFeed && cachedMeta) {
        const age = Math.floor((Date.now() - cachedMeta.ts) / 1000);
        const isFresh = age < CACHE_TTL;

        // Apply translation index at read time — any item cached in the index
        // gets its Arabic title, untranslated items pass through.
        const translatedData = { ...cachedFeed, sources: sourceList, feed: applyTranslationIndex(cachedFeed.feed, index) };
        const payload = buildPayload(translatedData, layer, limit, {
          age, fresh: isFresh, aggregatedAt: cachedMeta.ts,
        });
        const response = new Response(JSON.stringify(payload), {
          headers: { ...CORS, 'Cache-Control': isFresh ? 'public, s-maxage=10' : 'public, s-maxage=3, stale-while-revalidate=60' },
        });

        // If stale, trigger background re-aggregation (non-blocking)
        if (!isFresh) {
          context.waitUntil(refreshCache(ai, translationKV, feedCache, kind, env));
        }

        return response;
      }
    }

    // 2. No cache — aggregate fresh (first request or KV not configured)
    const data = await aggregateFeeds(ai, translationKV, kind, env, feedCache);
    data.sources = sourceList;

    // Store in KV (no warming here — /api/warm handles it separately with
    // its own subrequest budget; aggregation alone uses ~45 subreqs)
    if (feedCache) {
      context.waitUntil(Promise.all([
        feedCache.put(kvKeys.feed, JSON.stringify(data), { expirationTtl: 600 }),
        feedCache.put(kvKeys.meta, JSON.stringify({ ts: Date.now(), count: data.feed.length }), { expirationTtl: 600 }),
      ]));
    }

    const [layer, index] = await Promise.all([layerPromise, indexPromise]);
    const translatedData = { ...data, feed: applyTranslationIndex(data.feed, index) };
    const payload = buildPayload(translatedData, layer, limit, { age: 0, fresh: true, aggregatedAt: Date.now() });
    return new Response(JSON.stringify(payload), {
      headers: { ...CORS, 'Cache-Control': 'public, s-maxage=10, stale-while-revalidate=60' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: e.message }), { status: 500, headers: CORS });
  }
}

// Background re-aggregation (runs via waitUntil, doesn't block response).
// Translation warming is handled by the separate /api/warm endpoint, so
// this path only does aggregation + KV write.
async function refreshCache(ai, translationKV, feedCache, kind = 'news', env = null) {
  try {
    const data = await aggregateFeeds(ai, translationKV, kind, env, feedCache);
    const kvKeys = KV_KEYS[kind];
    await Promise.all([
      feedCache.put(kvKeys.feed, JSON.stringify(data), { expirationTtl: 600 }),
      feedCache.put(kvKeys.meta, JSON.stringify({ ts: Date.now(), count: data.feed.length }), { expirationTtl: 600 }),
    ]);
  } catch {}
}
