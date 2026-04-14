// ─── Title-based trending NLP (server mirror of src/lib/trending.js) ───
//
// Arabic news aggregator trending extractor — operates on article TITLES,
// not categories. Implements stopword filtering, light stemming (strip ال +
// common suffixes), a curated bigram whitelist, alef normalization for
// spelling variants, adaptive time windows, and velocity detection.
//
// This file is a BYTE-FOR-BYTE MIRROR of src/lib/trending.js. The client
// bundle imports from src/, the Cloudflare Pages Function bundle imports
// from here. Keep the two files in sync when editing — the logic must be
// identical so the admin UI sees the same trending list the users see.
//
// Pure JS, no browser APIs. Safe to run in workers/edge runtimes.

// Stopwords — common Arabic words that aren't meaningful as topics
const STOP = new Set(
  ('في من على إلى عن مع هذا هذه ذلك تلك التي الذي الذين اللذين اللتين هو هي هم هن نحن أنا أنت أنتم ' +
  'أن كان كانت يكون تكون بين بعد قبل لم لا ما حتى كل عند أو ثم أي قد لن ليس إن إذا هل كيف لماذا ' +
  'يوم خلال ضد حول دون منذ عبر نحو فوق تحت أمام وراء أكثر أقل أول آخر ' +
  'ال و ب ل ف ك ذات لدى إلا أيضا كما لكن بل حيث إذ ومع ولا بعض مثل غير ' +
  'قال قالت يقول تقول أكد أكدت حذر أشار أعلن أعلنت كشف صرح أفاد وأكد وأضاف ' +
  'وفق بحسب نقلا حسب وفقا وبحسب ' +
  'عام سنة شهر اليوم الآن منذ الأربعاء الثلاثاء الاثنين الأحد السبت الخميس الجمعة ' +
  'جديد جديدة كبير كبيرة أكبر المزيد عدد عدة بشأن تجاه ضمن خاص عامة ' +
  'الأخبار أخبار خبر عاجل تحديث تقرير تقارير بيان مصدر مصادر ' +
  'يمكن يجب ينبغي سوف قام تم يتم ستكون سيكون ' +
  'ماذا لماذا كيف متى أين هناك هنا هؤلاء أولئك الذين التي ' +
  // Indefinite verbs and adverbs users flagged as noise on the radar
  'أشبه تحدث يتحدث تحدثوا تحدثت موجة بدء بدأ بدأت يبدأ يبدو ' +
  'نحو تجاه حاليا سابقا لاحقا أخيرا مؤخرا رغم بسبب').split(' ').filter(Boolean)
);

// Indefinite stems — ambiguous as topics on their own ("which president?",
// "which negotiations?", "which international?"). Only surfaced as part of a
// bigram ("الرئيس ترامب", "محادثات السلام", "القانون الدولي"), never solo.
// Stored as stems so the stemmer-produced `base` can match them directly.
// When a word here appears inside a KNOWN_BIGRAMS phrase, it's fine.
const GENERIC_ROLES = new Set([
  // Role nouns ("which president?")
  'رئيس',   // رئيس / الرئيس
  'وزير',   // وزير / الوزير
  'حكوم',   // حكومة / الحكومة (stemmer drops ة)
  'مسؤول',  // مسؤول / المسؤول
  'قائد',   // قائد / القائد
  'ناطق',   // ناطق / الناطق
  'سفير',   // سفير / السفير
  'متحدث',  // متحدث / المتحدث
  'زعيم',   // زعيم / الزعيم
  'أمير',   // أمير / الأمير
  'ملك',    // ملك / الملك (too generic alone)
  'نائب',   // نائب / النائب
  'سلطان',  // سلطان / السلطان
  'جنرال',
  'محلل',   // محلل / المحلل
  'خبير',   // خبير / الخبير
  // Abstract action/process nouns ("which negotiations?")
  'محادث',  // محادثات / المحادثات (stemmer drops ات → محادث)
  'مفاوض',  // مفاوضات / المفاوضات
  'اجتماع', // اجتماع / اجتماعات / الاجتماع
  'قمة',    // قمة / القمة (too ambiguous alone)
  'جلس',    // جلسة / الجلسة (stemmer drops ة)
  'مؤتمر',  // مؤتمر / المؤتمر
  'تصريح',  // تصريح / تصريحات
  'بيان',   // بيان / بيانات
  'تقرير',  // تقرير / تقارير
  'خطاب',   // خطاب / خطابات
  'قرار',   // قرار / قرارات
  'اتفاق',  // اتفاق / اتفاقية (needs "اتفاق سلام" etc.)
  'تحقيق',  // تحقيق / تحقيقات
  'محاكم',  // محاكمة / المحاكمة
  'قضاء',   // القضاء / قضاء (too generic alone)
  'بدء',    // بدء — generic verb/noun "begin"
  'مجلس',   // مجلس / المجلس — too ambiguous alone (أي مجلس؟)
  'تعاون',  // تعاون / التعاون (which cooperation?)
  'خيال',   // خيال / الخيال — fragment of "بالخيال" or similar
  'علمي',   // العلمي / علمية — adjective
  // Adjectives that are ambiguous on their own ("the international [what?]")
  'دولي',   // الدولي / دولية → "القانون الدولي" is fine
  'أمريك',  // الأمريكي / الأمريكية (stemmer drops ي)
  'أمريكي', // after ية-strip only drops to أمريكي
  'إقليم',  // الإقليمي / الإقليمية (stems to إقليم)
  'عالم',   // العالمي / العالمية (ambiguous — "كأس العالم" captured as bigram)
  'وطني',
  'محلي',   // المحلي / المحلية
]);

// Strip Arabic prefixes:
//   Preposition + definite article: بال، كال، فال، وال (3 letters)
//   Contracted ل+ال: لل (2 letters)
//   Single conjunctions: و، ف (1 letter)
// Catches constructions like "بالخيال" → "خيال", "للبحث" → "بحث",
// "ولبنان" → "لبنان". Length guards keep short words intact.
function stripPrefix(w) {
  if (w.length <= 3) return w;
  // 3-letter prefixes: بال، كال، فال، وال. Need ≥6 char word so the
  // remainder is ≥3 chars.
  if (w.length >= 6 && /^(بال|كال|فال|وال)/.test(w)) {
    return w.slice(3);
  }
  // 2-letter prefix: لل (ل + ال contracted). Need ≥5 char word.
  if (w.length >= 5 && w.startsWith('لل')) {
    return w.slice(2);
  }
  // 1-letter conjunctions: و، ف
  if ((w[0] === 'و' || w[0] === 'ف') && w.length > 3) {
    const rest = w.slice(1);
    if (rest.length >= 3) return rest;
  }
  return w;
}

// Light stemmer for merging variants: strip ال prefix + common suffixes
function stem(w) {
  let s = stripPrefix(w);
  // Strip definite article ال
  if (s.startsWith('ال') && s.length > 4) s = s.slice(2);
  // Strip nisba/plural suffixes for grouping
  if (s.length > 5 && s.endsWith('ية')) return s.slice(0, -2);
  if (s.length > 5 && s.endsWith('ات')) return s.slice(0, -2);
  if (s.length > 5 && s.endsWith('ون')) return s.slice(0, -2);
  if (s.length > 5 && s.endsWith('ين')) return s.slice(0, -2);
  if (s.length > 4 && s.endsWith('ة')) return s.slice(0, -1);
  return s;
}

// Clean a word: remove non-Arabic chars, strip diacritics
function clean(w) {
  return w
    .replace(/[\u064B-\u065F\u0670]/g, '') // strip tashkeel
    .replace(/[\u060C\u061B\u061F\u0640]/g, '') // strip ،؛؟ـ
    .replace(/[^\u0621-\u063A\u0641-\u064A\u0671-\u06D3\u0750-\u077F]/g, '') // only Arabic letters
    .trim();
}

// Known bigrams — common meaningful two-word phrases in Arabic news.
// Spelling variants (آ vs أ vs ا) are handled automatically by alef
// normalization at lookup time, so list each phrase only once.
const KNOWN_BIGRAMS = new Set([
  'إطلاق النار', 'وقف إطلاق', 'الأمم المتحدة', 'مجلس الأمن',
  'حقوق الإنسان', 'الشرق الأوسط', 'البيت الأبيض', 'قطاع غزة',
  'الضفة الغربية', 'حزب الله', 'الحرس الثوري', 'الذكاء الاصطناعي',
  'تغير المناخ', 'دوري أبطال', 'كأس العالم', 'مضيق هرمز',
  'البحر الأحمر', 'الخليج العربي', 'جامعة الدول', 'صندوق النقد',
  'البنك الدولي', 'منظمة التحرير', 'السلطة الفلسطينية', 'الجامعة العربية',
  'رئيس الوزراء', 'وزير الخارجية', 'الأمين العام', 'محكمة العدل',
  'الطاقة النووية', 'أسعار النفط', 'سوق الأسهم', 'الاتحاد الأوروبي',
  'الولايات المتحدة', 'المملكة المتحدة', 'كوريا الشمالية', 'كوريا الجنوبية',
  'السعودية العربية', 'الإمارات العربية',
  // Compound capital/city names that would otherwise fragment
  'إسلام آباد', 'أبو ظبي', 'نيو دلهي',
  'هونغ كونغ', 'أديس أبابا', 'سان فرانسيسكو', 'لوس أنجلوس',
  // Wars, incidents & military ops
  'حرب أوكرانيا', 'حرب غزة', 'الجيش الإسرائيلي', 'الدفاع المدني',
  'عملية عسكرية', 'غارة جوية', 'تبادل أسرى', 'قمة الناتو',
  'قمة الأمم', 'اتفاق سلام', 'مفاوضات السلام', 'محادثات السلام',
  'هجوم مسلح', 'انفجار ضخم', 'تفجير انتحاري', 'قصف مدفعي',
  'اغتيال قائد', 'تفجير سيارة', 'هجوم صاروخي', 'إطلاق صاروخ',
  'حرب أهلية', 'عقوبات اقتصادية', 'احتجاجات حاشدة', 'مظاهرات عارمة',
  // Places — cities, regions, neighborhoods that commonly appear together
  'خان يونس', 'دير البلح', 'القدس الشرقية', 'القدس المحتلة',
  'مدينة غزة', 'جنوب لبنان', 'شمال سوريا', 'شرق أوكرانيا',
  'شمال غزة', 'جنوب غزة', 'جبل لبنان', 'وادي الأردن',
  'بحر العرب', 'البحر المتوسط', 'البحر الأسود',
  // Natural disasters / crises
  'زلزال ضخم', 'موجة حر', 'فيضانات عارمة', 'كارثة طبيعية',
  'حرائق غابات', 'إعصار استوائي',
  // Economy & tech
  'اتفاقية تجارية', 'أسعار الذهب', 'سعر الفائدة', 'عملات مشفرة',
  'رقائق إلكترونية', 'الأقمار الصناعية',
]);

// Normalize alef variants for matching: آ، أ، إ، ٱ → ا.
// Arabic news sources spell place names like "إسلام آباد" and "إسلام أباد"
// inconsistently — collapse them so both forms hit the same bigram entry.
function normalizeAlef(s) {
  return s.replace(/[آأإٱ]/g, 'ا');
}

// Pre-compute the normalized → canonical lookup so the bigram pass can do
// a single Map.get instead of trying every spelling variant.
const KNOWN_BIGRAMS_NORM = new Map();
for (const phrase of KNOWN_BIGRAMS) {
  KNOWN_BIGRAMS_NORM.set(normalizeAlef(phrase), phrase);
}

// Time-decay weighting — articles older than ~15 min contribute less.
// At 15 min, weight = ~0.37; at 30 min, ~0.14; at 60 min, ~0.02.
function recencyWeight(ageMin) {
  return Math.exp(-ageMin / 15);
}

// Velocity weight — same as recency but with a sharper falloff for the "rising"
// signal. We compare last 30 min vs prior 90 min mention rate.
function inWindow(ageMin, max) { return ageMin <= max; }

// Adaptive window: try the smallest window first; if we don't get enough
// topics, expand. This guarantees the radar is always as fresh as possible
// while never being empty.
function _extractWithWindow(feed, limit, now, MAX_AGE_MIN) {
  const NOW_WINDOW = 10;     // last 10 minutes — rising signal
  const BEFORE_WINDOW = 60;  // 10–60 minutes ago — comparison baseline

  const items = feed
    .map(item => {
      const ts = item.pubTs || item.timestamp || 0;
      const ageMin = ts ? Math.max(0, (now - ts) / 60000) : MAX_AGE_MIN + 1;
      return { title: item.title || '', ageMin, weight: recencyWeight(ageMin) };
    })
    .filter(it => it.ageMin <= MAX_AGE_MIN);

  if (!items.length) return { results: [], itemCount: 0 };
  return { results: _runExtraction(items, limit, NOW_WINDOW, BEFORE_WINDOW), itemCount: items.length };
}

export function extractTrending(feed, limit = 24, opts = {}) {
  const now = opts.now || Date.now();
  // Adaptive: start at 30 min, expand if not enough topics surface.
  const windows = opts.windows || [30, 60, 90, 180, 360];
  const minTopics = opts.minTopics || 8;

  for (const w of windows) {
    const { results } = _extractWithWindow(feed, limit, now, w);
    if (results.length >= minTopics || w === windows[windows.length - 1]) {
      return results;
    }
  }
  return [];
}

function _runExtraction(items, limit, NOW_WINDOW, BEFORE_WINDOW) {
  const bigramFreq = {};       // weighted score
  const bigramRaw = {};        // raw count for display
  const bigramNow = {};        // raw count in NOW window
  const bigramBefore = {};     // raw count in BEFORE window
  const unigramFreq = {};
  const unigramRaw = {};
  const unigramNow = {};
  const unigramBefore = {};
  const bigramWords = new Set();

  // Pass 1: Extract bigrams
  items.forEach(it => {
    const w = it.weight;
    const isNow = inWindow(it.ageMin, NOW_WINDOW);
    const isBefore = !isNow && inWindow(it.ageMin, BEFORE_WINDOW);
    const words = it.title.split(/\s+/).map(clean).filter(x => x.length >= 2);

    for (let i = 0; i < words.length - 1; i++) {
      let pair = null;
      const rawPair = words[i] + ' ' + words[i + 1];
      if (KNOWN_BIGRAMS.has(rawPair)) {
        pair = rawPair;
      } else {
        // Try alef-normalized form: catches "إسلام أباد" → "إسلام آباد"
        const normPair = KNOWN_BIGRAMS_NORM.get(normalizeAlef(rawPair));
        if (normPair) {
          pair = normPair;
        } else {
          const stripped = stripPrefix(words[i]) + ' ' + words[i + 1];
          if (KNOWN_BIGRAMS.has(stripped)) {
            pair = stripped;
          } else {
            const normStripped = KNOWN_BIGRAMS_NORM.get(normalizeAlef(stripped));
            if (normStripped) pair = normStripped;
          }
        }
      }
      if (pair) {
        bigramFreq[pair] = (bigramFreq[pair] || 0) + w;
        bigramRaw[pair] = (bigramRaw[pair] || 0) + 1;
        if (isNow) bigramNow[pair] = (bigramNow[pair] || 0) + 1;
        if (isBefore) bigramBefore[pair] = (bigramBefore[pair] || 0) + 1;
        bigramWords.add(words[i]);
        bigramWords.add(words[i + 1]);
      }
    }

    // Also detect repeated natural bigrams (appear 3+ times, weighted)
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i], w2 = words[i + 1];
      if (STOP.has(w1) || STOP.has(w2) || w1.length < 3 || w2.length < 3) continue;
      const pair = w1 + ' ' + w2;
      if (!KNOWN_BIGRAMS.has(pair)) {
        bigramFreq[pair] = (bigramFreq[pair] || 0) + w;
        bigramRaw[pair] = (bigramRaw[pair] || 0) + 1;
        if (isNow) bigramNow[pair] = (bigramNow[pair] || 0) + 1;
        if (isBefore) bigramBefore[pair] = (bigramBefore[pair] || 0) + 1;
      }
    }
  });

  // Filter bigrams: known ones need raw 2+, discovered ones need raw 3+.
  // The 3+ threshold is intentionally low so discovered place/event pairs
  // surface quickly; quality is enforced by the guards below instead.
  //
  // Reject discovered bigrams where either word:
  //   - is a STOP word stem (catches "تحدث موجة", "أشبه بالخيال")
  //   - is a GENERIC_ROLES stem (so "رئيس الوزراء" only survives via the
  //     curated list, not as an ambiguous co-occurrence)
  //   - starts with a preposition cluster (بال، لل، كال، وال، فال) — a
  //     strong signal the word is grammatically tied to something else,
  //     not a standalone noun.
  const validBigrams = {};
  for (const [phrase, score] of Object.entries(bigramFreq)) {
    const raw = bigramRaw[phrase] || 0;
    const isKnown = KNOWN_BIGRAMS.has(phrase);
    const minCount = isKnown ? 2 : 3;
    if (raw < minCount) continue;
    if (!isKnown) {
      const [w1, w2] = phrase.split(' ');
      if (STOP.has(w1) || STOP.has(w2)) continue;
      const s1 = stem(w1), s2 = stem(w2);
      if (STOP.has(s1) || STOP.has(s2)) continue;
      if (GENERIC_ROLES.has(s1) || GENERIC_ROLES.has(s2)) continue;
      // Preposition-prefixed words are sentence-connectives, not nouns
      if (/^(بال|لل|كال|وال|فال)/.test(w1) || /^(بال|لل|كال|وال|فال)/.test(w2)) continue;
    }
    validBigrams[phrase] = score;
    phrase.split(' ').forEach(w => bigramWords.add(w));
  }

  // Pass 2: Extract unigrams (weighted)
  const normalized = {};
  items.forEach(it => {
    const w = it.weight;
    const isNow = inWindow(it.ageMin, NOW_WINDOW);
    const isBefore = !isNow && inWindow(it.ageMin, BEFORE_WINDOW);
    const words = it.title.split(/\s+/).map(clean).filter(x => x.length >= 3);
    const seen = new Set();
    words.forEach(word => {
      if (STOP.has(word)) return;
      const base = stem(word);
      if (STOP.has(base) || base.length < 3) return;
      if (seen.has(base)) return;
      seen.add(base);

      if (!normalized[base]) normalized[base] = {};
      normalized[base][word] = (normalized[base][word] || 0) + 1;
      unigramFreq[base] = (unigramFreq[base] || 0) + w;
      unigramRaw[base] = (unigramRaw[base] || 0) + 1;
      if (isNow) unigramNow[base] = (unigramNow[base] || 0) + 1;
      if (isBefore) unigramBefore[base] = (unigramBefore[base] || 0) + 1;
    });
  });

  const canonical = {};
  for (const [base, forms] of Object.entries(normalized)) {
    // Rule: prefer noun forms over adjective forms (ـية suffix), with two
    // guards. Picks "إيران" over "الإيرانية" — but NOT "سعود" over "السعودية",
    // because "سعود" alone is a person-name fragment, not the country.
    //
    // Guard 1 (length): only prefer the bare form if it's at least 5 chars.
    //   إيران (5) ✓, إسرائيل (7) ✓, لبنان (5) ✓, but سعود (4) ✗.
    // Guard 2 (frequency): only prefer the bare form if it appears at least
    //   half as often as the ـية form. Catches cases where the bare stem is
    //   a coincidental match from a different word.
    // Guard 3 (و/ف prefix): prefer forms WITHOUT a و/ف conjunction prefix
    //   over those with one, regardless of frequency — so "ولبنان" loses to
    //   "لبنان" if both appear in the feed. Words like "واشنطن" (Washington,
    //   where و is part of the root) are unaffected because they stem to a
    //   different base ("اشنطن") and have no "اشنطن" competitor form.
    const sorted = Object.entries(forms).sort((a, b) => {
      const aAdj = a[0].endsWith('ية') ? 1 : 0;
      const bAdj = b[0].endsWith('ية') ? 1 : 0;
      if (aAdj !== bAdj) {
        const nonAdj = aAdj === 0 ? a : b;
        const adjForm = aAdj === 1 ? a : b;
        const longEnough = nonAdj[0].length >= 5;
        const frequentEnough = nonAdj[1] * 2 >= adjForm[1];
        if (longEnough && frequentEnough) {
          return aAdj - bAdj; // prefer non-adj
        }
        return aAdj === 1 ? -1 : 1; // prefer adj
      }
      // Prefer non-prefixed form when it exists
      const aPref = /^[وف]/.test(a[0]) ? 1 : 0;
      const bPref = /^[وف]/.test(b[0]) ? 1 : 0;
      if (aPref !== bPref) return aPref - bPref;
      return b[1] - a[1];
    });
    // The sort above already prefers non-و/ف forms when both exist in the
    // bucket, so "ولبنان" loses to "لبنان". No extra post-processing: if the
    // only variant is و-prefixed (e.g. "واشنطن" with no competing "اشنطن"
    // form), we keep it as-is — stripping would incorrectly split a proper
    // name where the و is part of the transliteration, not a conjunction.
    canonical[base] = sorted[0][0];
  }

  // Velocity helper — rate per minute "now" vs "before"
  function velocity(nowCount, beforeCount) {
    const nowRate = nowCount / NOW_WINDOW;
    const beforeRate = beforeCount / (BEFORE_WINDOW - NOW_WINDOW);
    if (beforeRate === 0 && nowRate > 0) return 999; // brand new
    if (beforeRate === 0) return 0;
    return nowRate / beforeRate;
  }

  // Build results
  const results = [];
  for (const [phrase, score] of Object.entries(validBigrams)) {
    const raw = bigramRaw[phrase] || 0;
    const v = velocity(bigramNow[phrase] || 0, bigramBefore[phrase] || 0);
    results.push({ word: phrase, count: raw, score, velocity: v });
  }
  for (const [base, score] of Object.entries(unigramFreq)) {
    const raw = unigramRaw[base] || 0;
    // Rule: unigram must appear in at least 3 articles (was 2). Filters one-off junk.
    if (raw < 3) continue;
    // Rule: suppress indefinite role words ("رئيس", "وزير", "حكومة", …) when
    // they appear alone. They're ambiguous as standalone topics ("which
    // president?") and are still allowed inside bigrams like "الرئيس ترامب" or
    // "وزير الخارجية", which surface via the bigram pass.
    if (GENERIC_ROLES.has(base)) continue;
    const form = canonical[base];
    // Rule: if the unigram's stem appears in ANY valid bigram, suppress it.
    // Catches fragments like "الله" when "حزب الله" exists, regardless of relative score.
    const inBigram = Object.entries(validBigrams).some(([phrase]) => {
      const parts = phrase.split(' ');
      const stemParts = parts.map(stem);
      return parts.includes(base) || parts.includes(form) || stemParts.includes(base);
    });
    if (inBigram) continue;
    const v = velocity(unigramNow[base] || 0, unigramBefore[base] || 0);
    results.push({ word: form, count: raw, score, velocity: v });
  }

  // Sort by weighted score (recency-aware) instead of raw count
  results.sort((a, b) => b.score - a.score);

  // Dedupe overlaps
  const final = [];
  for (const r of results) {
    if (final.length >= limit) break;
    const words = r.word.split(' ');
    if (words.length === 1) {
      const covered = final.some(f =>
        f.word.split(' ').length > 1 && f.word.includes(r.word)
      );
      if (covered) continue;
    }
    if (words.length > 1) {
      const overlap = final.some(f => {
        if (f.word.split(' ').length === 1) return false;
        const fWords = f.word.split(' ');
        return words.some(w => fWords.includes(w));
      });
      if (overlap) continue;
    }
    final.push(r);
  }

  return final;
}
