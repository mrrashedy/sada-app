import { TOPIC_KEYWORDS } from '../data/topics';

// Deep / analysis tags
export const INVESTIGATION_TAGS = ['تحليل','حصري','ملف','تحقيق','تحقيقات','استقصاء','ملفات','دراسة','مقابلة'];
// Opinion / essay tags — filtered OUT
export const OPINION_TAGS = ['آراء','رأي','زوايا','مقال رأي','opinion','تعليق','عمود','مقالات','كتاب','أعمدة'];
export const SENTIMENTAL_WORDS = ['زواج','عقد قران','أفراح','يحتفلون','زفاف','خطوبة','تهنئة','عزاء','وفاة صاحب'];
// Phrases and patterns signaling analysis — NOT single generic words
const INVESTIGATION_KEYWORDS = ['تحليل','تقرير خاص','ملف خاص','تحقيق','قراءة في','نظرة على','ما وراء','مصادر مطلعة','حوار مع','مقابلة','لماذا','كيف يمكن','ماذا يعني','القصة الكاملة','كواليس','خلفية'];

export function isOpinionOrSentimental(item) {
  const cats = [item.tag, ...(item.tags || [])].filter(Boolean);
  if (cats.some(c => OPINION_TAGS.includes(c))) return true;
  const text = ((item.title || '') + ' ' + (item.body || '')).toLowerCase();
  if (SENTIMENTAL_WORDS.some(w => text.includes(w))) return true;
  return false;
}

export function isDeepInvestigative(item) {
  // Must NOT be opinion/essay
  if (isOpinionOrSentimental(item)) return false;
  const cats = [item.tag, ...(item.tags || [])].filter(Boolean);
  if (cats.some(c => OPINION_TAGS.includes(c))) return false;
  // Check for analysis/investigative tags
  if (cats.some(c => INVESTIGATION_TAGS.includes(c))) return true;
  const title = item.title || '';
  const body = item.body || '';
  const text = title + ' ' + body;
  // Check for analysis keywords/phrases in body or title
  if (INVESTIGATION_KEYWORDS.some(kw => text.includes(kw))) return true;
  // Question-style titles that seek to explain (why/how/what behind the news)
  if (/^(لماذا|كيف|هل|ما الذي|ماذا يعني|ما وراء|ما سر)/.test(title.trim())) return true;
  return false;
}

export function scoreByTopics(item, topicIds) {
  if (!topicIds || topicIds.length === 0) return 0;
  const allTags = [item.tag, ...(item.tags || [])].filter(Boolean).join(' ');
  const text = ((item.title || '') + ' ' + (item.body || '') + ' ' + allTags).toLowerCase();
  return topicIds.flatMap(id => TOPIC_KEYWORDS[id] || []).filter(kw => text.includes(kw)).length;
}
