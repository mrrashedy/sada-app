import { TOPIC_KEYWORDS } from '../data/topics';

export const CONTEXT_TAGS = ['تحليل','رأي','تقرير','حصري','ملف'];
export const OPINION_TAGS = ['آراء','رأي','زوايا','مقال رأي','opinion','تعليق','عمود'];
export const SENTIMENTAL_WORDS = ['زواج','عقد قران','أفراح','يحتفلون','زفاف','خطوبة','تهنئة','عزاء','وفاة صاحب'];

export function isOpinionOrSentimental(item) {
  const cats = [item.tag, ...(item.tags || [])].filter(Boolean);
  if (cats.some(c => OPINION_TAGS.includes(c))) return true;
  const text = ((item.title || '') + ' ' + (item.body || '')).toLowerCase();
  if (SENTIMENTAL_WORDS.some(w => text.includes(w))) return true;
  return false;
}

export function scoreByTopics(item, topicIds) {
  if (!topicIds || topicIds.length === 0) return 0;
  const text = ((item.title || '') + ' ' + (item.body || '') + ' ' + (item.tag || '')).toLowerCase();
  return topicIds.flatMap(id => TOPIC_KEYWORDS[id] || []).filter(kw => text.includes(kw)).length;
}
