// Filter the news feed down to items suitable for the Photo Grid view.
//
// Architecture: three named dictionaries, each organized by theme bucket with
// `ar` + `en` sub-arrays. Flattened into runtime sets once at module load.
//   INCLUDE   — item must match at least one of these (or be on the source
//               whitelist) to qualify as a candidate.
//   EXCLUDE   — hard drop. Any match and the item is thrown out regardless
//               of what's in INCLUDE/PRIORITY.
//   PRIORITY  — ordering signal. Matches boost the score; higher-score items
//               rise to the top of the grid.
//
// Pure functions — no React, no fetches, fully testable.

// ─── Source whitelist ─────────────────────────────────────────────
// These sources are 100% suitable for the photo grid — no keyword check
// needed (their content is curated art/culture/tech/science by default).
const WHITELIST_SOURCES = new Set([
  // Photo/culture English sources
  'wired',
  'verge',
  'atlasobscura',
  'smithsonian',
  'bbc_culture',
  'arstechnica',
  'bbc_tech',
  // French fine-art / photography magazines (auto-translated)
  'beauxarts',
  'connaissance',
  'jda',
  'telerama_arts',
  'tribune_art',
  'artsper',
  'artpress',
  'blind_mag',
  'fisheye_mag',
  'phototrend',
  'lemonde_arts',
  'lemonde_photo',
]);

// ─── INCLUDE dictionary ───────────────────────────────────────────
// At least one of these must match (OR the source must be whitelisted)
// for the item to qualify as a candidate.
const INCLUDE = {
  culture: {
    ar: ['ثقافة','فن','فنون','سينما','موسيقى','مسرح','أدب','مهرجان','معرض','متحف','رواية','كتاب','فيلم'],
    en: ['culture','art','music','film','cinema','museum','exhibit','festival','book','novel','theater'],
  },
  tech: {
    ar: ['تقنية','تكنولوجيا','ذكاء اصطناعي','روبوت','فضاء','اختراع','هاتف','تطبيق','إنترنت','رقمي'],
    en: ['tech','ai','robot','space','science','discovery','invention','startup','gadget','algorithm'],
  },
  medical: {
    ar: ['طب','صحة','علاج','لقاح','بحث طبي','اكتشاف','علماء'],
    en: ['medical','health','vaccine','cure','breakthrough','therapy','research','clinical'],
  },
  good_news: {
    ar: ['إنجاز','جائزة','احتفال','فوز','نجاح','إغاثة','تطوع','افتتاح','ابتكار','ملهم','ابتسامة','فرح','سعادة','إبداع','مبدع','مبتكر'],
    en: ['award','win','rescue','celebration','volunteer','heroic','historic','restored','reopens','inspiring','feel-good','feelgood','smile','smiles','joy','happiness'],
  },
  fun_cool: {
    ar: ['مذهل','رائع','جميل','مدهش','ممتع','ساحر','فريد','نادر','استثنائي','غرائب','عجائب','طرائف','طريف','مبهر','ساحرة','جميلة','جمالية'],
    en: ['amazing','incredible','stunning','beautiful','gorgeous','fun','cool','quirky','whimsical','delightful','joyful','uplifting','wonder','wonderful','marvelous','dazzling','spectacular','extraordinary','rare','unique','charming','magical','enchanting','curious','curiosity','oddity','curios'],
  },
};

// ─── EXCLUDE dictionary ───────────────────────────────────────────
// Hard drops — any match excludes the item even if INCLUDE/PRIORITY matched.
const EXCLUDE = {
  violence: {
    ar: ['حرب','قصف','قتل','شهيد','اغتيال','انفجار','هجوم','تفجير','جثة','مجزرة','إرهاب','غارة','عدوان','قصفت','إصابة','ضحايا','عملية عسكرية','مسلّح','جريح','قنبلة','صاروخ','إطلاق نار','مصاب','مقتل'],
    en: ['war','killed','dead','death','attack','strike','bomb','missile','massacre','wounded','casualty','airstrike','raid','troops','militant','hostage','gunman','shooting','violence','injured','died','fatal','crash','disaster','earthquake','flood','victims','crisis','collapse'],
  },
  sad: {
    ar: ['حزن','حداد','عزاء','جنازة','وفاة','نعي','موت','رحيل','فقيد','مأساة','نكبة','كارثة','مصاب','محنة','فاجعة','مواساة','تعزية'],
    en: ['sad','sadness','grief','mourning','funeral','tragedy','tragic','obituary','deceased','passed away','condolences','bereavement','heartbreak','loss','memorial','vigil','eulogy','crying','weep','devastating','somber'],
  },
  politics: {
    ar: ['سياسة','سياسية','انتخابات','انتخاب','تصويت','استفتاء','برلمان','مجلس النواب','حكومة','حزب','أحزاب','تشريع','دستور','حكم','نظام','سلطة','معارضة','تحالف','رئاسة','رئاسية','سفير','عقوبات','مفاوضات','دبلوماسية','مؤتمر','قمة','بيان','تصريح','احتجاج','مظاهرة','اعتصام'],
    en: ['politics','political','election','vote','ballot','poll','senate','senator','congress','congressman','congresswoman','parliament','parliamentary','presidential','presidency','cabinet','minister','ministry','governor','coalition','diplomat','diplomacy','embassy','sanction','sanctions','treaty','summit','protest','rally','campaign','party','democrat','democrats','republican','republicans','liberal','conservative'],
  },
  heads_of_state: {
    ar: ['رئيس','الرئيس','ملك','أمير','وزير','الوزير','نائب الرئيس','زعيم','ترامب','بايدن','بوتين','نتنياهو','أردوغان','ماكرون','زيلينسكي','بن سلمان','السيسي','ولي العهد'],
    en: ['president','trump','biden','putin','netanyahu','erdogan','macron','zelensky','xi jinping','modi','meloni','starmer','scholz'],
  },
  sports: {
    ar: ['كرة القدم','كرة قدم','الدوري','دوري','الأهلي','النصر','الاتحاد','برشلونة','ريال مدريد','ليفربول','تشلسي','مانشستر','بايرن','يوفنتوس','ميلان','مباراة','لاعب','لاعبون','مدرب','بطولة','كأس','هدف','أهداف','الفيفا','الأولمبياد','تدريب','منتخب','الفريق','كرة السلة','كرة الطائرة','تنس','سباق','رياضي','رياضة عالمية','رياضة سعودية','دوري أبطال'],
    en: ['football','soccer','match','matchday','league','premier league','laliga','bundesliga','serie a','champions league','goal','striker','midfielder','defender','forward','coach','manager','referee','champion','trophy','cup','fifa','uefa','tournament','playoff','playoffs','ronaldo','messi','mbappe','haaland','salah','neymar','basketball','nba','nfl','mlb','tennis','golf','athlete','athletes','athletic','olympic','olympics','f1','formula 1'],
  },
  military: {
    ar: ['عسكري','عسكرية','الجيش','القوات','قواته','قوات','البحرية','الأسطول','سفن حربية','سفن عسكرية','مدمرة','حاملة طائرات','غواصة','طيران حربي','مناورات','درون','مسيّرة','مسيرة','قاعدة عسكرية','فرقاطة','دبابات','صواريخ','دفاع جوي','ضربة','استهداف','تستهدف','يستهدف','استهدفت','انتشار عسكري','ردع'],
    en: ['military','army','armed forces','armed','navy','naval','warship','warships','destroyer','aircraft carrier','submarine','fighter jet','drone','drones','airbase','base','missile','missiles','frigate','tank','tanks','defense','defence','strike','airstrikes','warplane','warplanes','deployment','deterrence'],
  },
  regional_tensions: {
    ar: ['مضيق','مضيق هرمز','هرمز','باب المندب','خليج عدن','البحر الأحمر','أزمة','توتر','توترات','تهديد','تهديدات','تصعيد','مواجهة','نزاع','صراع','احتكاك','تحذير','يحذر','تحذر','حذرت','حذّر','يدين','تدين','إدانة','استنكار'],
    en: ['tensions','tension','threat','threats','warn','warns','warning','warned','condemns','condemn','condemnation','escalation','escalate','conflict','clash','clashes','standoff','confrontation','dispute','provocation','retaliation','retaliate','crisis','brinkmanship'],
  },
  regional_actors: {
    ar: ['إيران','الحرس الثوري','طهران','إسرائيل','غزة','قطاع غزة','لبنان','حزب الله','سوريا','اليمن','الحوثيون','الحوثي','العراق','ليبيا','السودان','الصحراء','كييف','موسكو','أوكرانيا','بوتين','زيلينسكي'],
    en: ['iran','iranian','irgc','tehran','israel','israeli','gaza','lebanon','hezbollah','syria','syrian','yemen','houthi','houthis','iraq','libya','sudan','ukraine','ukrainian','russia','russian','moscow','kyiv'],
  },
};

// ─── PRIORITY dictionary ──────────────────────────────────────────
// Items matching these get boosted in the score. Higher match count = higher
// ranking in the photo grid. Focus: art / women / daring / magazine-covers.
const PRIORITY = {
  art_painting: {
    ar: ['فن','رسم','لوحة','فنان','فنانة','رسام','رسامة','معرض','متحف','بينالي','منحوتة','نحت','تمثال','معاصر','تجريدي','تكعيبي','كلاسيكي','مرسم','ستوديو','تصوير','تركيب'],
    en: ['art','painting','paint','painter','artist','canvas','exhibit','exhibition','gallery','museum','biennial','biennale','sculpture','sculptor','sculptural','contemporary','abstract','expressionist','cubist','surreal','surrealist','installation','mural','portrait','muse','atelier','studio','retrospective','artwork','masterpiece','opening','vernissage'],
  },
  women_celebrity: {
    ar: ['امرأة','نساء','سيدة','نجمة','ممثلة','مغنية','عارضة','إعلامية','ملكة جمال','بطلة','رائدة','أزياء','موضة','جمال','أناقة','إطلالة','سجادة حمراء','أيقونة','أسطورة'],
    en: ['woman','women','she','actress','singer','model','supermodel','starlet','icon','iconic','celebrity','star','fashion','couture','designer','runway','diva','pioneer','queen','heiress','feminist'],
  },
  daring_avant_garde: {
    ar: ['جريء','جريئة','جرأة','تمرد','ثورية','ثائرة','قوية','تحرر','حرية','جدل','مثير','صادم','طليعي'],
    en: ['daring','bold','brave','provocative','rebel','rebellious','avant-garde','avantgarde','experimental','controversial','fearless','radical','subversive','edgy','expressive','raw','unflinching','nude','naked','scandal','taboo','erotic','sensual'],
  },
  architecture: {
    ar: ['عمارة','معماري','هندسة معمارية','تصميم داخلي','ديكور','فيلا','منزل','مسكن','هندسة','معمار'],
    en: ['architecture','architectural','architect','interior','interiors','decor','villa','minimalist','brutalist','modernist','mid-century','midcentury','renovation','restoration','apartment','loft'],
  },
  magazine_cover_terms: {
    ar: ['غلاف','مجلة','عدد'],
    en: ['cover','magazine','issue','editorial','photoshoot','photo shoot','shoot','spread'],
  },
  fashion_magazines: {
    ar: ['فوغ','هاربرز بازار','نيويوركر','تايم','ناشيونال جيوغرافيك','ايل','إيل','كوزموبوليتان'],
    en: ['vogue','prima','gq','grazia','harper','bazaar','hello fashion','elle','cosmopolitan','tatler','new yorker','rolling stone','vanity fair'],
  },
  contemporary_art_magazines: {
    ar: [],
    en: ['artforum','frieze','art in america','artnews','artreview','the art newspaper','art newspaper','juxtapoz','aperture','whitehot','arts to hearts'],
  },
  architecture_magazines: {
    ar: [],
    en: ['architectural digest','ark journal','dwell','elle decor','mountain living','residential design'],
  },
};

// ─── Runtime flatten ──────────────────────────────────────────────
// Collapse each dictionary into a single flat array for fast includes() checks.
function flatten(dict) {
  const out = [];
  for (const bucket of Object.values(dict)) {
    if (bucket.ar) out.push(...bucket.ar);
    if (bucket.en) out.push(...bucket.en);
  }
  return out;
}

const INCLUDE_KEYWORDS  = flatten(INCLUDE);
const EXCLUDE_KEYWORDS  = flatten(EXCLUDE);
const PRIORITY_KEYWORDS = flatten(PRIORITY);

// ─── Core logic ───────────────────────────────────────────────────

function lowerHaystack(item) {
  return `${item.title || ''} ${(item.categories || []).join(' ')}`.toLowerCase();
}

function matchesAny(haystack, list) {
  return list.some(k => haystack.includes(k));
}

function countMatches(haystack, list) {
  let n = 0;
  for (const k of list) if (haystack.includes(k)) n++;
  return n;
}

export function pickPhotos(feed) {
  if (!Array.isArray(feed)) return [];
  const seen = new Set();
  const out = [];

  for (const item of feed) {
    if (!item || !item.image) continue;

    // Dedup by image URL (strip query params)
    const key = item.image.split('?')[0];
    if (seen.has(key)) continue;

    const haystack = lowerHaystack(item);

    // 1. Hard excludes — drop regardless of what else matches
    if (matchesAny(haystack, EXCLUDE_KEYWORDS)) continue;

    // 2. Must qualify via whitelist source OR an INCLUDE keyword
    const sid = item.source?.id;
    const inWhitelist = sid && WHITELIST_SOURCES.has(sid);
    const matchedTopic = inWhitelist || matchesAny(haystack, INCLUDE_KEYWORDS);
    if (!matchedTopic) continue;

    seen.add(key);
    out.push(item);
  }

  // Pure recency sort — newest first. The filter stage already ensures the
  // pool is on-topic (art/fashion/photo magazines + keyword match). Sorting by
  // priority here would "pin" a few high-scoring items at the top forever;
  // sorting by timestamp means fresh items always float up naturally and old
  // ones push down, which is the feed behavior the user expects.
  out.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

  return out;
}

// Exports for testing / admin UI / debugging
export const PHOTO_FILTER_DICTS = { INCLUDE, EXCLUDE, PRIORITY, WHITELIST_SOURCES };
