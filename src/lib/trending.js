const STOP = new Set('في من على إلى عن مع هذا هذه ذلك تلك التي الذي هو هي أن كان بين بعد قبل لم لا ما حتى كل عند أو ثم أي قد لن ليس إن إذا هل كيف لماذا يوم بعد خلال ضد حول دون منذ عبر نحو فوق تحت أمام وراء أكثر أقل أول آخر ال و ب ل ف ك'.split(' '));

export function extractTrending(feed, limit = 12) {
  const freq = {};
  feed.forEach(item => {
    const words = (item.title || '').split(/\s+/);
    words.forEach(w => {
      const clean = w.replace(/[^\u0600-\u06FF\u0750-\u077F]/g, '');
      if (clean.length < 3 || STOP.has(clean)) return;
      freq[clean] = (freq[clean] || 0) + 1;
    });
  });
  return Object.entries(freq)
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count }));
}
