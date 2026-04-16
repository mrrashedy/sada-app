// Cloudflare Pages Function — /api/feeds
// Production architecture: KV-backed stale-while-revalidate feed cache
// RSS aggregation runs at most once per 2 minutes; all other requests read from KV

// ─── Source Registry ───
//
// ⚠️  KEEP IN SYNC WITH src/data/sources.js → SOURCES array.
// Adding a source here makes the backend fetch it, but the UI source-strip
// pulls names/logos from the client file. A backend-only addition will pull
// items but render with placeholder styling and won't appear as a chip in
// the strip. The client logs a console.warn on drift — see useNews.js.

const SOURCES = {
  // Tier 1: Flagship Arabic broadcasters
  // Al Jazeera Arabic: the UUID-based Arc CMS feed was retired by AJ and the
  // endpoint now refuses connections. We run two independent paths:
  //   1) rss.app scraper of aljazeera.net (30 items, updates continuously)
  //   2) Google News site-search (50 items, broad indexing)
  // Both are fetched in parallel and deduplicated by title downstream.
  aljazeera:       { name: "الجزيرة", initial: "ج", tier: 1, feeds: [
    "https://rss.app/feeds/wEloTC9ifcfo3wu5.xml",
    "https://news.google.com/rss/search?q=site%3Aaljazeera.net&hl=ar&gl=SA&ceid=SA%3Aar",
  ] },
  // @AJABreaking — Al Jazeera Arabic Breaking News alerts (عاجل).
  // X/Twitter RSS bridges are unreliable; we use a targeted Google News
  // query for عاجل stories from aljazeera.net as the closest equivalent.
  // الجزيرة عاجل — direct breaking-news Twitter feed (@AJABreaking) via rss.app.
  // Replaces the Google News proxy (5-15min lag) with near-real-time breaking
  // updates. GN proxy kept as fallback so the source survives if rss.app errors.
  aja_breaking:    { name: "الجزيرة عاجل", initial: "عاجل", tier: 1, feeds: [
    "https://rss.app/feeds/1e7195HOC6i8FptT.xml",
    "https://news.google.com/rss/search?q=عاجل+site%3Aaljazeera.net&hl=ar&gl=SA&ceid=SA%3Aar",
  ] },
  // aljazeera.com direct RSS times out from CF Workers. Google News proxy.
  aljazeera_en:    { name: "الجزيرة EN", initial: "ج", tier: 3, lang: "en", feeds: ["https://news.google.com/rss/search?q=site%3Aaljazeera.com&hl=en&gl=US&ceid=US:en"] },
  bbc:             { name: "BBC عربي", initial: "B", tier: 1, feeds: ["https://feeds.bbci.co.uk/arabic/rss.xml","https://feeds.bbci.co.uk/arabic/middleeast/rss.xml","https://feeds.bbci.co.uk/arabic/worldnews/rss.xml"] },
  skynews:         { name: "سكاي نيوز", initial: "S", tier: 1, feeds: ["https://www.skynewsarabia.com/rss.xml","https://www.skynewsarabia.com/rss/middle-east.xml","https://www.skynewsarabia.com/rss/world.xml"] },
  // france24 direct RSS (/ar/rss) now returns 403. Google News site-search
  // (50 fresh items) is the working alternative.
  france24:        { name: "فرانس ٢٤", initial: "F", tier: 1, feeds: ["https://news.google.com/rss/search?q=site%3Afrance24.com%2Far&hl=ar&gl=SA&ceid=SA:ar"] },
  // dw: rss.dw.com no longer responds reliably. Google News proxy is stable.
  dw:              { name: "دويتشه فيله", initial: "D", tier: 1, feeds: ["https://news.google.com/rss/search?q=site%3Adw.com%2Far&hl=ar&gl=SA&ceid=SA:ar"] },
  cnn_ar:          { name: "CNN عربية", initial: "C", tier: 1, feeds: ["https://arabic.cnn.com/api/v1/rss/rss.xml"] },
  cnn_biz_ar:      { name: "CNN اقتصاد", initial: "C$", tier: 1, feeds: ["https://news.google.com/rss/search?q=site%3Acnnbusinessarabic.com&hl=ar&gl=SA&ceid=SA:ar"] },
  // Monte Carlo Doualiya — direct feed is podcast-only. Google News proxy for articles.
  mc_doualiya:     { name: "مونت كارلو", initial: "MC", tier: 1, feeds: ["https://news.google.com/rss/search?q=site%3Amc-doualiya.com&hl=ar&gl=SA&ceid=SA:ar"] },
  // independent_ar direct feed intermittent. Google News proxy is reliable.
  independent_ar:  { name: "إندبندنت عربية", initial: "إ", tier: 1, feeds: ["https://news.google.com/rss/search?q=site%3Aindependentarabia.com&hl=ar&gl=SA&ceid=SA:ar"] },
  aawsat:          { name: "الشرق الأوسط", initial: "ش", tier: 1, feeds: ["https://aawsat.com/feed","https://news.google.com/rss/search?q=site%3Aaawsat.com&hl=ar&gl=SA&ceid=SA:ar"] },
  // alhurra.com direct feed returns 200 but empty from CF Workers. Add GN fallback.
  alhurra:         { name: "الحرة", initial: "ح", tier: 1, feeds: ["https://alhurra.com/feed","https://news.google.com/rss/search?q=site%3Aalhurra.com&hl=ar&gl=SA&ceid=SA:ar"] },
  // Tier 1 additions
  rt_ar:           { name: "روسيا اليوم", initial: "RT", tier: 1, feeds: ["https://arabic.rt.com/rss/"] },
  // alarabiya /.mrss/ar.xml now 403s. Google News proxy (50 fresh items).
  alarabiya:       { name: "العربية", initial: "ع", tier: 1, feeds: ["https://news.google.com/rss/search?q=site%3Aalarabiya.net&hl=ar&gl=SA&ceid=SA:ar"] },
  // العربية عاجل — dedicated Twitter (@AlArabiya_Brk) breaking-news channel,
  // sister to the main alarabiya entry. Higher cadence, shorter items.
  alarabiya_brk:   { name: "العربية عاجل", initial: "عاع", tier: 1, feeds: ["https://rss.app/feeds/feM5F3Gmr2JJ6xfN.xml"] },
  // التلفزيون العربي - عاجل — Al-Araby TV's dedicated Telegram breaking-news
  // channel (@AlarabyTvBrk). Levant-focused, high cadence, used as the live
  // wire when conflict events break in Gaza/Lebanon/Syria.
  alaraby_tv_brk:  { name: "العربي عاجل", initial: "عت", tier: 1, feeds: ["https://rss.app/feeds/FDjA0ZXmIBmXKXIZ.xml"] },
  asharq_news:     { name: "الشرق الإخبارية", initial: "شر", tier: 1, feeds: ["https://asharq.com/rss.xml"] },
  // تميم بن حمد — H.H. Sheikh Tamim, Emir of Qatar, official Twitter
  // (@TamimBinHamad). Primary source for Qatari foreign policy positions —
  // statements appear here before they hit any wire service. Tier 1 official.
  tamim_qatar:     { name: "تميم بن حمد", initial: "تم", tier: 1, feeds: ["https://rss.app/feeds/F7A4BGt96lZBHqdJ.xml"] },

  // Wire services + aggregators (Arabic Google News topics give broad coverage)
  gnews_world:     { name: "أخبار Google عالمي", initial: "GN", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/WORLD?hl=ar&gl=SA&ceid=SA:ar"] },
  gnews_tech:      { name: "أخبار Google تقنية", initial: "GT", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=ar&gl=SA&ceid=SA:ar"] },
  gnews_health:    { name: "أخبار Google صحة", initial: "GH", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/HEALTH?hl=ar&gl=SA&ceid=SA:ar"] },
  gnews_science:   { name: "أخبار Google علوم", initial: "GS", tier: 2, feeds: ["https://news.google.com/rss/headlines/section/topic/SCIENCE?hl=ar&gl=SA&ceid=SA:ar"] },

  // Tier 2: Regional newspapers
  // Al Araby Al Jadeed: direct RSS is dead but Google News still indexes the
  // alaraby.co.uk domain with 50 fresh Arabic items.
  alaraby:   { name: "العربي الجديد", initial: "ع", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Aalaraby.co.uk&hl=ar&gl=SA&ceid=SA:ar"] },
  // المصري اليوم — direct /rss/rssfeed endpoint is stale (~14h lag — the
  // server-cached feed only refreshes a few times a day). rss.app scrapes
  // /section/index/3 ("أخبار" section) and stays current within minutes.
  // Promoted to Tier 1 (Egypt's largest independent daily). Direct feed
  // kept as fallback.
  almasry:   { name: "المصري اليوم", initial: "م", tier: 1, feeds: ["https://rss.app/feeds/WRngmPq6X4bpxAgE.xml","https://www.almasryalyoum.com/rss/rssfeed"] },
  // بوابة الشروق — major Egyptian daily, owned by Dar Al-Shorouk. Broad
  // coverage (politics, economy, sports, culture, opinion). Tier 1 alongside
  // المصري اليوم / الأهرام / اليوم السابع. Fed via rss.app (no working direct
  // RSS endpoint at shorouknews.com).
  shorouk_eg:{ name: "بوابة الشروق", initial: "شو", tier: 1, feeds: ["https://rss.app/feeds/7gfsFNiXaVeo4E7g.xml"] },
  // masrawy direct RSS works from public networks but the response from CF Workers' edge
  // contains 0 items (likely datacenter IPs blocked). Google News proxy is the fallback.
  masrawy:   { name: "مصراوي", initial: "مص", tier: 1, feeds: ["https://www.masrawy.com/rss/feed/25/%D8%A3%D8%AE%D8%A8%D8%A7%D8%B1","https://news.google.com/rss/search?q=site%3Amasrawy.com&hl=ar&gl=SA&ceid=SA:ar"] },
  ahram_en:  { name: "الأهرام EN", initial: "AH", tier: 1, lang: "en", feeds: ["https://news.google.com/rss/search?q=site%3Aenglish.ahram.org.eg&hl=en&gl=US&ceid=US:en"] },
  // youm7 direct feeds redirect (www ↔ m) and currently return 0 items from
  // Cloudflare Workers despite working from regular browsers. Both section
  // feeds (97 = main, 203 = politics) kept as primary; Google News added as
  // fallback so this Tier 1 source actually surfaces in the feed.
  youm7:     { name: "اليوم السابع", initial: "٧", tier: 1, feeds: ["https://www.youm7.com/RSS/SectionRss?SectionID=97","https://www.youm7.com/RSS/SectionRss?SectionID=203","https://news.google.com/rss/search?q=site%3Ayoum7.com&hl=ar&gl=SA&ceid=SA:ar"] },
  // egyptindependent.com returns 200 but 0 items from CF Workers. Add GN fallback.
  egypt_ind: { name: "Egypt Independent", initial: "EI", tier: 2, lang: "en", feeds: ["https://www.egyptindependent.com/feed/","https://news.google.com/rss/search?q=site%3Aegyptindependent.com&hl=en&gl=US&ceid=US:en"] },
  okaz:      { name: "عكاظ", initial: "ك", tier: 2, feeds: ["https://www.okaz.com.sa/rssFeed/0"] },
  alsumaria: { name: "السومرية", initial: "سم", tier: 2, feeds: ["https://www.alsumaria.tv/Rss/iraq-latest-news/ar"] },
  // alkhaleej.ae returns 200 but 0 items from CF Workers. Add GN fallback.
  alkhaleej: { name: "الخليج", initial: "خ", tier: 2, feeds: ["https://www.alkhaleej.ae/section/1110/rss.xml","https://news.google.com/rss/search?q=site%3Aalkhaleej.ae&hl=ar&gl=SA&ceid=SA:ar"] },
  // 24.ae direct RSS 403s. Google News proxy works.
  uae24:     { name: "24 الإمارات", initial: "٢", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3A24.ae&hl=ar&gl=SA&ceid=SA:ar"] },
  alsharq:   { name: "الشرق", initial: "ق", tier: 2, feeds: ["https://al-sharq.com/rss/latestNews"] },
  // alyaum.com returns 200 but 0 items from CF Workers. Add GN fallback.
  alyaum:    { name: "اليوم", initial: "ل", tier: 2, feeds: ["https://www.alyaum.com/rssFeed/1005","https://news.google.com/rss/search?q=site%3Aalyaum.com&hl=ar&gl=SA&ceid=SA:ar"] },
  // alquds.co.uk direct feed socket-closes. Google News proxy works.
  alquds:    { name: "القدس العربي", initial: "ق", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Aalquds.co.uk&hl=ar&gl=SA&ceid=SA:ar"] },
  // (noonpost removed — outlet dormant, Google News index newest item is Jan 2019)

  // Tier 2: Levant — Lebanon, Syria, Jordan, Palestine
  annahar:    { name: "النهار", initial: "نه", tier: 2, feeds: ["https://www.annahar.com/arabic/rss-feed"] },
  // lbcgroup.tv direct feed 403s from CF Workers. Google News proxy.
  lbci:       { name: "إل بي سي آي", initial: "LB", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Albcgroup.tv&hl=ar&gl=SA&ceid=SA:ar"] },
  roya:       { name: "رؤيا", initial: "ر", tier: 2, feeds: ["https://royanews.tv/rss"] },
  // almamlakatv.com direct feed 403s. Google News proxy works.
  almamlaka:  { name: "المملكة", initial: "مم", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Aalmamlakatv.com&hl=ar&gl=SA&ceid=SA:ar"] },
  sana:       { name: "سانا", initial: "س", tier: 2, feeds: ["https://sana.sy/feed/"] },
  // alghad.com direct feed 403s. Google News proxy works.
  alghad:     { name: "الغد", initial: "غ", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Aalghad.com&hl=ar&gl=SA&ceid=SA:ar"] },
  // Tier 2: additional Levant — high-priority Arabic outlets
  almayadeen:  { name: "الميادين", initial: "مي", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Aalmayadeen.net&hl=ar&gl=SA&ceid=SA:ar"] },
  alakhbar_lb: { name: "الأخبار اللبنانية", initial: "أخ", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Aal-akhbar.com&hl=ar&gl=SA&ceid=SA:ar"] },
  daraj:       { name: "درج", initial: "در", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Adaraj.media&hl=ar&gl=SA&ceid=SA:ar"] },
  // Quds Hebrew Translations — real-time Arabic translation of Israeli/Hebrew
  // media (Channel 12, Haaretz, Yedioth, Channel 15, etc.). Unique angle: lets
  // Arabic readers see what Israeli press is saying about MENA in near-real-time.
  // Source is the Telegram channel @Qudsn_hebrew, fed via rss.app.
  qudsn_heb:   { name: "ترجمات عبرية", initial: "عب", tier: 2, feeds: ["https://rss.app/feeds/ZkMAVoRAYNluzgla.xml"] },
  // Ne3raf نعرف — analytical YouTube channel covering international relations
  // (politics, geopolitics, military, economy). Long-form, slower cadence than
  // breaking-news sources but useful for context. Tier 2 individual outlet.
  ne3raf:      { name: "نعرف", initial: "نع", tier: 2, feeds: ["https://rss.app/feeds/AlXKMtH7eonzL7mh.xml"] },
  // زيد بنيامين — independent journalist covering US-MENA affairs and Gulf
  // politics from Washington (@ZaidBenjamin5). Distinctive analytical voice,
  // ex-Al Jazeera Washington bureau. Tier 2 individual journalist.
  zaid_benjamin:{ name: "زيد بنيامين", initial: "زب", tier: 2, feeds: ["https://rss.app/feeds/s8DAMAxUyWWe8AeX.xml"] },
  // Tier 2: additional Egypt & Gulf flagships
  // الأهرام — Egypt's flagship daily (founded 1875, most-circulated). Upgraded
  // from Google News proxy to direct rss.app feed (~1min lag instead of 5-15min)
  // and promoted to Tier 1. GN proxy kept as fallback in case rss.app feed dies.
  ahram:       { name: "الأهرام", initial: "هر", tier: 1, feeds: ["https://rss.app/feeds/gXGjA0WaERLJ5Sot.xml","https://news.google.com/rss/search?q=site%3Agate.ahram.org.eg&hl=ar&gl=SA&ceid=SA:ar"] },
  // مدى مصر — direct rss.app feed (~1min lag) replaces the Google News proxy
  // (5-15min lag). Independent Egyptian investigative outlet, distinctive voice.
  mada_masr:   { name: "مدى مصر", initial: "مد", tier: 2, feeds: ["https://rss.app/feeds/vxVIdRoKKQKFk1hj.xml","https://news.google.com/rss/search?q=site%3Amadamasr.com&hl=ar&gl=SA&ceid=SA:ar"] },
  alain_ar:    { name: "العين الإخبارية", initial: "عن", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Aal-ain.com&hl=ar&gl=SA&ceid=SA:ar"] },

  // Tier 2: North Africa (Maghreb) — Morocco, Algeria, Tunisia
  hespress:    { name: "هسبريس", initial: "هـ", tier: 2, feeds: ["https://www.hespress.com/feed"] },
  le360_ar:    { name: "لو 360", initial: "360", tier: 2, feeds: ["https://ar.le360.ma/arc/outboundfeeds/rss/?outputType=xml"] },
  // snrtnews.com direct feed 403s. Google News proxy works.
  snrt:        { name: "الأولى المغربية", initial: "SN", tier: 2, feeds: ["https://news.google.com/rss/search?q=site%3Asnrtnews.com&hl=ar&gl=SA&ceid=SA:ar"] },
  echorouk:    { name: "الشروق الجزائرية", initial: "شج", tier: 2, feeds: ["https://www.echoroukonline.com/feed"] },
  elkhabar:    { name: "الخبر", initial: "خب", tier: 2, feeds: ["https://www.elkhabar.com/feed"] },
  ennahar_dz:  { name: "النهار الجزائرية", initial: "نج", tier: 2, feeds: ["https://www.ennaharonline.com/feed/"] },
  mosaiquefm:  { name: "موزاييك إف إم", initial: "MFM", tier: 2, feeds: ["https://www.mosaiquefm.net/ar/rss"] },

  // Tier 2: Sahel & Sudan
  // (libya_ahrar removed — outlet has not published since Jan 25 2025)
  sahara_media: { name: "صحراء ميديا", initial: "صح", tier: 2, feeds: ["https://saharamedias.net/feed/"] },
  // sudantribune.net returns 200 but 0 items from CF Workers. Add GN fallback.
  sudan_tribune: { name: "سودان تريبيون", initial: "ST", tier: 2, feeds: ["https://sudantribune.net/feed/","https://news.google.com/rss/search?q=site%3Asudantribune.net&hl=ar&gl=SA&ceid=SA:ar"] },
  // alsudaninews.com returns 200 but 0 items from CF Workers. Add GN fallback.
  alsudani:     { name: "السوداني", initial: "سد", tier: 2, feeds: ["https://alsudaninews.com/?feed=rss2","https://news.google.com/rss/search?q=site%3Aalsudaninews.com&hl=ar&gl=SA&ceid=SA:ar"] },

  // Reuters Arabic — direct rss.app scraper of reuters.com (25 fresh items,
  // updates continuously) + Google News fallback for breadth.
  reuters_ar:  { name: "رويترز", initial: "R", tier: 1, feeds: ["https://rss.app/feeds/QMxooeXFymYyJeYS.xml","https://news.google.com/rss/search?q=site%3Areuters.com&hl=ar&gl=SA&ceid=SA:ar"] },

  // Tier 3: English sources (served as-is — no translation)
  bbc_en:   { name: "BBC عالمي", initial: "BB", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/world/rss.xml"] },
  nyt:      { name: "نيويورك تايمز", initial: "NY", tier: 3, lang: "en", feeds: ["https://rss.nytimes.com/services/xml/rss/nyt/World.xml"] },
  fox:      { name: "فوكس نيوز", initial: "FX", tier: 3, lang: "en", feeds: ["https://moxie.foxnews.com/google-publisher/latest.xml"] },
  // bbci.co.uk tech feed returns 200 but 0 items from CF Workers. Add GN fallback.
  bbc_tech: { name: "BBC تقنية", initial: "BT", tier: 3, lang: "en", feeds: ["https://feeds.bbci.co.uk/news/technology/rss.xml","https://news.google.com/rss/search?q=site%3Abbc.com+technology&hl=en&gl=US&ceid=US:en"] },
  nbc:      { name: "NBC نيوز", initial: "NB", tier: 3, lang: "en", feeds: ["https://feeds.nbcnews.com/feeds/topstories"] },
  // NPR feed returns 200 but 0 items from CF Workers. Add GN fallback.
  npr:      { name: "NPR عالمي", initial: "NP", tier: 3, lang: "en", feeds: ["https://feeds.npr.org/1004/rss.xml","https://news.google.com/rss/search?q=site%3Anpr.org+world&hl=en&gl=US&ceid=US:en"] },
  abc_en:   { name: "ABC نيوز", initial: "AB", tier: 3, lang: "en", feeds: ["https://feeds.abcnews.com/abcnews/topstories"] },
  // skynews.com feed returns 200 but 0 items from CF Workers. Add GN fallback (news.sky.com).
  sky_en:   { name: "سكاي نيوز EN", initial: "SK", tier: 3, lang: "en", feeds: ["https://feeds.skynews.com/feeds/rss/world.xml","https://news.google.com/rss/search?q=site%3Anews.sky.com&hl=en&gl=US&ceid=US:en"] },

  // Tier 3: Gulf English-language press (served as-is — no translation)
  thenational:   { name: "ذا ناشيونال", initial: "TN", tier: 3, lang: "en", feeds: ["https://www.thenationalnews.com/arc/outboundfeeds/rss/?outputType=xml"] },
  gulfnews:      { name: "غلف نيوز", initial: "GU", tier: 3, lang: "en", feeds: ["https://gulfnews.com/api/v1/collections/latest-news.rss"] },
  // arabnews.com direct feed 403s from CF Workers. Google News proxy.
  arabnews:      { name: "عرب نيوز", initial: "AN", tier: 3, lang: "en", feeds: ["https://news.google.com/rss/search?q=site%3Aarabnews.com&hl=en&gl=US&ceid=US:en"] },
  // english.alarabiya.net direct feed 403s from CF Workers. Google News proxy.
  alarabiya_en:  { name: "العربية EN", initial: "عE", tier: 3, lang: "en", feeds: ["https://news.google.com/rss/search?q=site%3Aenglish.alarabiya.net&hl=en&gl=US&ceid=US:en"] },

  // Tier 3: Maghreb French-language press (auto-translated, M2M-100)
  hespress_fr:   { name: "هسبريس FR", initial: "HF", tier: 3, lang: "fr", feeds: ["https://fr.hespress.com/feed"] },
  le360_fr:      { name: "لو 360 FR", initial: "36F", tier: 3, lang: "fr", feeds: ["https://fr.le360.ma/arc/outboundfeeds/rss/?outputType=xml"] },

  // Tier 4: Additional real-time firehose sources — major Western broadcasters
  guardian_w:   { name: "الغارديان", initial: "G", tier: 3, lang: "en", feeds: ["https://www.theguardian.com/world/rss"] },
  // Reuters English wire — international breaking news. Served as-is in
  // English (no translation — the warm pipeline only translates French→English,
  // never touches English or Arabic items). Sister to reuters_ar which gets
  // Arabic content from Google News + a separate rss.app scraper.
  reuters_en:   { name: "رويترز EN", initial: "RE", tier: 3, lang: "en", feeds: ["https://rss.app/feeds/OfVnHSMzG81M03AF.xml"] },
  // washingtonpost.com direct feed 403s/timeouts from CF Workers. Google News proxy.
  wapo_world:   { name: "واشنطن بوست", initial: "WP", tier: 3, lang: "en", feeds: ["https://news.google.com/rss/search?q=site%3Awashingtonpost.com+world&hl=en&gl=US&ceid=US:en"] },
  bloomberg:    { name: "بلومبرغ", initial: "BL", tier: 3, lang: "en", feeds: ["https://feeds.bloomberg.com/politics/news.rss"] },
  // CNN direct RSS uses http:// which breaks on CF Workers (cert issue). Google News proxy.
  cnn_en:       { name: "CNN عالمي", initial: "CN", tier: 3, lang: "en", feeds: ["https://news.google.com/rss/search?q=site%3Acnn.com+world&hl=en&gl=US&ceid=US:en"] },

  // ── PHOTO-GRID-ONLY SOURCES ──────────────────────────────────────
  // Tagged `photoOnly: true` so they're excluded from the main /api/feeds
  // (news) aggregation and only appear in /api/feeds?kind=photos.
  // The photo grid is an independent feature like the radar.

  // English photo-rich sources (served as-is — culture/tech/science-leaning)
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
// Per-item tag cap removed — kept as a very large sentinel so the
// existing `categories.length >= MAX_CATEGORIES_PER_ITEM` checks still
// short-circuit on truly absurd inputs, but no longer trim normal feeds.
const MAX_CATEGORIES_PER_ITEM = 1000;

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

// ─── GDELT + HTML Homepage Scrapers (creative fallback for RSS-lagged flagships) ───
// Two independent paths run in parallel, each strong in different failure modes:
//
// 1) GDELT DOC API — Global Database of Events, Language, and Tone. Free
//    real-time news database maintained by a Georgetown/Google project.
//    Updates every 15 minutes, covers aljazeera.net/alarabiya.net/etc. across
//    100+ languages. Returns structured JSON — no HTML parsing needed.
//    https://api.gdeltproject.org/api/v2/doc/doc?query=domain:X&mode=ArtList&format=json
//
// 2) HTML homepage scraping — Fallback for when GDELT is rate-limited or
//    missing a source. Uses Cloudflare's native HTMLRewriter API to stream-
//    parse aljazeera.net HTML, extract article anchors with /YYYY/M/D/ URL
//    pattern, and timestamp them as "just published" (since the homepage IS
//    what readers see right now).
//
// Both paths are wrapped in Promise.allSettled — failures in one do not
// affect the other, and both results feed into the main sort pipeline.

// Tier-1 Arabic flagships polled on every aggregation. GDELT indexes most
// major publishers at ~15-minute latency and bypasses the 1-4h lag of RSS
// proxies. Items land tagged with the given sourceId so they merge cleanly
// into the same sort pipeline as RSS.
const FRESH_FLAGSHIPS = [
  { sourceId: 'aljazeera', gdeltDomain: 'aljazeera.net'     },
  { sourceId: 'alarabiya', gdeltDomain: 'alarabiya.net'     },
  { sourceId: 'bbc',       gdeltDomain: 'bbc.com/arabic'    },
  { sourceId: 'skynews',   gdeltDomain: 'skynewsarabia.com' },
];

async function fetchGdelt(domain) {
  try {
    const query = encodeURIComponent(`domain:${domain}`);
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${query}&mode=ArtList&format=json&maxrecords=15&sort=datedesc&timespan=6h`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SadaNews/3.0)' },
      signal: AbortSignal.timeout(10000),
      cf: { cacheTtl: 60, cacheEverything: true },
    });
    if (!res.ok) return [];
    const text = await res.text();
    // GDELT sometimes returns an HTML error page. Detect and skip.
    if (!text.trim().startsWith('{')) return [];
    let data;
    try { data = JSON.parse(text); } catch { return []; }
    const arts = Array.isArray(data?.articles) ? data.articles : [];
    return arts
      .filter(a => a.title && a.url)
      .map(a => {
        // GDELT seendate format: "20260414T213011Z" (compact ISO8601)
        let ts = Date.now();
        if (a.seendate && /^\d{8}T\d{6}Z$/.test(a.seendate)) {
          const s = a.seendate;
          const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(9,11)}:${s.slice(11,13)}:${s.slice(13,15)}Z`;
          ts = new Date(iso).getTime() || Date.now();
        }
        return {
          title: String(a.title).slice(0, 250),
          link: a.url,
          description: '',
          pubDate: new Date(ts).toUTCString(),
          image: a.socialimage || '',
          categories: [],
          timestamp: ts,
          isBreaking: /عاجل|breaking/i.test(a.title),
        };
      });
  } catch { return []; }
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

  // ─── GDELT freshness pass ──────────────────────────────────────────
  // RSS proxies (rss.app, Google News) lag tier-1 flagships by 1-4 hours.
  // GDELT's DOC API indexes the same publishers at ~15-min latency and
  // returns JSON with publication dates. Each flagship is tagged with its
  // canonical source metadata so items merge cleanly into the sort pipeline.
  if (kind !== 'photos') {
    const tagItems = (items, source, sourceId) => items.map(item => ({
      ...item,
      sourceId,
      sourceName: source.name,
      sourceInitial: source.initial,
      sourceTier: source.tier,
      lang: source.lang || 'ar',
    }));
    const freshFetches = FRESH_FLAGSHIPS
      .filter(fl => SOURCES[fl.sourceId])
      .map(async fl => {
        try { return tagItems(await fetchGdelt(fl.gdeltDomain), SOURCES[fl.sourceId], fl.sourceId); }
        catch { return []; }
      });
    const freshResults = await Promise.allSettled(freshFetches);
    freshResults.forEach(r => { if (r.status === 'fulfilled') allItems.push(...r.value); });
  }

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

  // Pure recency, no hierarchy. Per user request: no flagship boost, no
  // diversity floor, no per-source caps (including the RT hourly cap that
  // used to live here). Items appear strictly newest-first. The only
  // filters that survive are NOT hierarchy — they're data hygiene:
  //   • exact-title dedup (one publisher emitting the same string across
  //     category feeds collapses to one item)
  //   • Google News meta-titles already filtered above (preFiltered)
  //   • future-timestamp items dropped later in cleanFeed (broken pubDates
  //     would otherwise pin to position 0 forever)
  //
  // High-volume publishers (RT publishing ~100/hour, breaking-news Twitter
  // feeds, etc.) WILL dominate the top of the feed. That is the intended
  // behavior — you get exactly what was published most recently, period.

  const sortByTime = (a, b) => b.timestamp - a.timestamp;
  const allDeduped = [...preFiltered].sort(sortByTime);
  // Server-side mixed-pool ceiling. 5000 so the curated stream can hold
  // the full output of ~100 active sources × 20 items each.
  const LIMIT = 5000;
  const mixed = [];
  // Identical-title dedup only — no normalization.
  const normTitle = (t) => t || '';
  const seenTitles = new Set();

  for (const item of allDeduped) {
    if (mixed.length >= LIMIT) break;
    const tkey = normTitle(item.title);
    if (tkey && seenTitles.has(tkey)) continue; // drop duplicate headline
    mixed.push(item);
    if (tkey) seenTitles.add(tkey);
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

  // Per-query try/catch so one flaky table doesn't kill the whole layer.
  // 3s edge cache gives newly-created editor items a near-immediate feed
  // appearance without hammering Supabase on every request.
  const fetchTable = async (path) => {
    try {
      const r = await fetch(`${url}/rest/v1/${path}`, {
        headers,
        cf: { cacheTtl: 3, cacheEverything: true },
      });
      if (!r.ok) return [];
      return await r.json();
    } catch { return []; }
  };

  const [overrides, manualItems, radarRaw] = await Promise.all([
    fetchTable('article_overrides?select=*'),
    fetchTable('manual_feed_items?select=*&order=created_at.desc&limit=50'),
    fetchTable('radar_overrides?select=word,action,weight,expires_at'),
  ]);

  // Drop expired radar overrides server-side so the client never sees them.
  const now = Date.now();
  const radarOverrides = radarRaw.filter(o =>
    !o.expires_at || new Date(o.expires_at).getTime() > now
  );
  return { overrides, manualItems, radarOverrides };
}

// Defensive filter for manual items that slipped into Supabase before the
// URL scraper was hardened — bot-block pages, homepages, section landings.
// Keeps legacy garbage out of the feed without needing a DB cleanup pass.
const JUNK_TITLE_PATTERNS = [
  // Bot-block / Cloudflare challenge / error pages
  /^(unauthorized|request blocked|access denied|forbidden|just a moment|checking your browser|enable javascript|attention required|are you a (robot|human)|page not found|not found|404\b|500\b|error \d+)/i,
  /(cloudflare|cf-ray|\bddos\b|\bcaptcha\b)/i,
  // Generic site names / homepages
  /^(rt arabic|bbc arabic|bbc news|sky news arabia|sky news|cnn arabic|al jazeera|al arabiya|home|menu|login|sign in|الرئيسية|القائمة|تسجيل الدخول)$/i,
  // Section / program landings with a site-name suffix after a dash
  /\s[–\-]\s*(قناة|موقع|شبكة|برامج|tv|channel|network)\s/i,
  /شبكة\s+برامج/i,
];
function isJunkManualItem(m) {
  const title = String(m?.title || '').trim();
  if (!title || title.length < 15) return true;
  return JUNK_TITLE_PATTERNS.some(p => p.test(title));
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

  // Index overrides for O(1) lookup by article id (primary) or link (fallback).
  const byId = new Map();
  const byLink = new Map();
  for (const o of overrides) {
    if (o.article_id) byId.set(o.article_id, o);
    if (o.link) byLink.set(o.link, o);
  }

  // Walk the feed once: apply hide/rewrite/pin/feature and partition by pin.
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
    (ov?.pinned ? pinnedArticles : regularArticles).push(annotated);
  }

  // Filter out expired + junk manual items, then split by pin state.
  const now = Date.now();
  const visibleManual = manualItems.filter(m =>
    (!m.expires_at || new Date(m.expires_at).getTime() > now) &&
    !isJunkManualItem(m)
  );
  const pinnedManual = visibleManual.filter(m => m.pinned).map(formatManualItem);
  const flowManual   = visibleManual.filter(m => !m.pinned).map(formatManualItem);

  // Splice flow-manual items into regularArticles at their timestamp position
  // so unpinned editor items sit naturally alongside RSS items from the same
  // time window instead of being hoisted to the top.
  for (const m of flowManual) {
    const mTs = m.timestamp || 0;
    let idx = regularArticles.findIndex(a => (a.timestamp || 0) < mTs);
    if (idx === -1) idx = regularArticles.length;
    regularArticles.splice(idx, 0, m);
  }

  // Final order: pinned manual → pinned articles → regular (flow-mixed).
  return [...pinnedManual, ...pinnedArticles, ...regularArticles];
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
    // Default response limit raised to 5000 to match the new server-side
    // pool ceiling (LIMIT). Caller can still pass ?limit=N to truncate.
    const limit = parseInt(url.searchParams.get('limit')) || 5000;
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
    // its own subrequest budget; aggregation alone uses ~45 subreqs).
    //
    // Cache hardening: refuse to write thin aggregations. If half the feeds
    // timed out and we only got 300 items, that bad payload would sit in KV
    // for 600s and every request would serve dead content. The threshold
    // (600 items / kind-aware) is well below a healthy run (~1200 items for
    // news) but well above the catastrophe floor.
    const MIN_ITEMS = kind === 'photos' ? 100 : 600;
    if (feedCache && (data.feed?.length || 0) >= MIN_ITEMS) {
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
    // Cache hardening — same MIN_ITEMS floor as the foreground path. A failed
    // background refresh leaves the previous (good) cached snapshot in place
    // until the next refresh succeeds, instead of overwriting it with thin
    // partial data.
    const MIN_ITEMS = kind === 'photos' ? 100 : 600;
    if ((data.feed?.length || 0) < MIN_ITEMS) return;
    await Promise.all([
      feedCache.put(kvKeys.feed, JSON.stringify(data), { expirationTtl: 600 }),
      feedCache.put(kvKeys.meta, JSON.stringify({ ts: Date.now(), count: data.feed.length }), { expirationTtl: 600 }),
    ]);
  } catch {}
}
