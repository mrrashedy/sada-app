export function liveTimeAgo(ts) {
  if (!ts) return 'الآن';
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'الآن';
  if (secs < 60) return `منذ ${secs} ث`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `منذ ${mins} د`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `منذ ${hours} س`;
  return `منذ ${Math.floor(hours / 24)} ي`;
}
