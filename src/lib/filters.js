import { TOPIC_KEYWORDS } from '../data/topics';

export const CONTEXT_TAGS = ['تحليل','رأي','تقرير','حصري','ملف','تحقيق','دراسة','مقابلة'];
export const OPINION_TAGS = ['آراء','رأي','زوايا','مقال رأي','opinion','تعليق','عمود'];
export const SENTIMENTAL_WORDS = ['زواج','عقد قران','أفراح','يحتفلون','زفاف','خطوبة','تهنئة','عزاء','وفاة صاحب'];
const CONTEXT_KEYWORDS = ['تحليل','تقرير','لماذا','كيف يمكن','ما وراء','خلفية','قراءة في','نظرة على','دراسة','تحقيق','ملف خاص','رأي','مقابلة','حوار مع'];

export function isOpinionOrSentimental(item) {
  const cats = [item.tag, ...(item.tags || [])].filter(Boolean);
  if (cats.some(c => OPINION_TAGS.includes(c))) return true;
  const text = ((item.title || '') + ' ' + (item.body || '')).toLowerCase();
  if (SENTIMENTAL_WORDS.some(w => text.includes(w))) return true;
  return false;
}

export function isContextOrAnalysis(item) {
  const cats = [item.tag, ...(item.tags || [])].filter(Boolean);
  if (cats.some(c => CONTEXT_TAGS.includes(c) || OPINION_TAGS.includes(c))) return true;
  const text = ((item.title || '') + ' ' + (item.body || '')).toLowerCase();
  if (CONTEXT_KEYWORDS.some(kw => text.includes(kw))) return true;
  // Longer body text tends to be analysis/reports
  if ((item.body || '').length > 200) return true;
  return false;
}

export function scoreByTopics(item, topicIds) {
  if (!topicIds || topicIds.length === 0) return 0;
  const text = ((item.title || '') + ' ' + (item.body || '') + ' ' + (item.tag || '')).toLowerCase();
  return topicIds.flatMap(id => TOPIC_KEYWORDS[id] || []).filter(kw => text.includes(kw)).length;
}
