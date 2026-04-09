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
  'ماذا لماذا كيف متى أين هناك هنا هؤلاء أولئك الذين التي').split(' ').filter(Boolean)
);

// Strip Arabic prefixes: و، ف
function stripPrefix(w) {
  if (w.length <= 3) return w;
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

// Known bigrams — common meaningful two-word phrases in Arabic news
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
]);

export function extractTrending(feed, limit = 12) {
  const bigramFreq = {};
  const unigramFreq = {};
  const bigramWords = new Set(); // track words consumed by bigrams

  const titles = feed.map(item => item.title || '');

  // Pass 1: Extract bigrams
  titles.forEach(title => {
    const words = title.split(/\s+/).map(clean).filter(w => w.length >= 2);
    for (let i = 0; i < words.length - 1; i++) {
      const pair = words[i] + ' ' + words[i + 1];
      // Check exact known bigrams
      if (KNOWN_BIGRAMS.has(pair)) {
        bigramFreq[pair] = (bigramFreq[pair] || 0) + 1;
        bigramWords.add(words[i]);
        bigramWords.add(words[i + 1]);
        continue;
      }
      // Check with prefix stripping
      const stripped = stripPrefix(words[i]) + ' ' + words[i + 1];
      if (KNOWN_BIGRAMS.has(stripped)) {
        bigramFreq[stripped] = (bigramFreq[stripped] || 0) + 1;
        bigramWords.add(words[i]);
        bigramWords.add(words[i + 1]);
        continue;
      }
    }

    // Also detect repeated natural bigrams (appear 3+ times)
    for (let i = 0; i < words.length - 1; i++) {
      const w1 = words[i], w2 = words[i + 1];
      if (STOP.has(w1) || STOP.has(w2) || w1.length < 3 || w2.length < 3) continue;
      const pair = w1 + ' ' + w2;
      if (!KNOWN_BIGRAMS.has(pair)) {
        bigramFreq[pair] = (bigramFreq[pair] || 0) + 1;
      }
    }
  });

  // Filter bigrams: known ones need 2+, discovered ones need 3+
  const validBigrams = {};
  for (const [phrase, count] of Object.entries(bigramFreq)) {
    const minCount = KNOWN_BIGRAMS.has(phrase) ? 2 : 3;
    if (count >= minCount) {
      validBigrams[phrase] = count;
      phrase.split(' ').forEach(w => bigramWords.add(w));
    }
  }

  // Pass 2: Extract unigrams, merging variants via light stemming
  const normalized = {}; // map stemmed form → canonical form
  titles.forEach(title => {
    const words = title.split(/\s+/).map(clean).filter(w => w.length >= 3);
    const seen = new Set(); // dedupe within same title
    words.forEach(w => {
      if (STOP.has(w)) return;
      const base = stem(w);
      if (STOP.has(base) || base.length < 3) return;
      if (seen.has(base)) return;
      seen.add(base);

      // Use the most common form as canonical
      if (!normalized[base]) normalized[base] = {};
      normalized[base][w] = (normalized[base][w] || 0) + 1;
      unigramFreq[base] = (unigramFreq[base] || 0) + 1;
    });
  });

  // Pick canonical form for each base
  const canonical = {};
  for (const [base, forms] of Object.entries(normalized)) {
    canonical[base] = Object.entries(forms).sort((a, b) => b[1] - a[1])[0][0];
  }

  // Build results: bigrams first, then unigrams not already covered
  const results = [];

  // Add bigrams
  for (const [phrase, count] of Object.entries(validBigrams)) {
    results.push({ word: phrase, count });
  }

  // Add unigrams, skipping words that are part of a strong bigram
  for (const [base, count] of Object.entries(unigramFreq)) {
    if (count < 2) continue;
    const form = canonical[base];
    // Skip if this word is a component of a qualifying bigram with similar or higher count
    const inBigram = Object.entries(validBigrams).some(([phrase, bCount]) => {
      const parts = phrase.split(' ');
      const stemParts = parts.map(stem);
      return (parts.includes(base) || parts.includes(form) || stemParts.includes(base)) && bCount >= count * 0.4;
    });
    if (inBigram) continue;
    results.push({ word: form, count });
  }

  // Sort by count, dedupe overlaps, return top N
  results.sort((a, b) => b.count - a.count);

  // Remove near-duplicates: if a unigram is substring of a bigram already in top results
  const final = [];
  const taken = new Set();
  for (const r of results) {
    if (final.length >= limit) break;
    const words = r.word.split(' ');
    // Check if this single word is already covered by a bigram in final
    if (words.length === 1) {
      const covered = final.some(f =>
        f.word.split(' ').length > 1 && f.word.includes(r.word)
      );
      if (covered) continue;
    }
    // Check if this bigram's words overlap too much with another bigram
    if (words.length > 1) {
      const overlap = final.some(f => {
        if (f.word.split(' ').length === 1) return false;
        const fWords = f.word.split(' ');
        return words.some(w => fWords.includes(w));
      });
      if (overlap) continue;
    }
    final.push(r);
    taken.add(r.word);
  }

  return final;
}
