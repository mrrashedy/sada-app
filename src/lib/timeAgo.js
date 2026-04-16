// Natural Arabic relative-time formatter for feed item timestamps.
//
// Previously this exported a stopwatch-style format (`منذ 36:34` = 36 min
// 34 sec ago) which user found confusing — that pattern is appropriate
// for a live ticker but not for a news card. News readers expect natural
// language: "منذ X دقيقة / ساعة / يوم".
//
// Buckets:
//   < 5 sec      → الآن
//   < 60 sec     → منذ ثوانٍ
//   < 60 min     → منذ X د        (e.g. "منذ 36 د")
//   < 24 hours   → منذ X س        (e.g. "منذ 3 س")
//   < 7 days     → منذ X ي        (e.g. "منذ 2 ي")
//   ≥ 7 days    → منذ X أ        (e.g. "منذ 3 أ" — weeks)
export function liveTimeAgo(ts) {
  if (!ts) return 'الآن';
  const diff = Date.now() - ts;
  if (diff < 0) return 'الآن'; // future timestamps — broken pubDate, treat as fresh
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'الآن';
  if (secs < 60) return 'منذ ثوانٍ';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `منذ ${days} ي`;
  return `منذ ${Math.floor(days / 7)} أ`;
}
