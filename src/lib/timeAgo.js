export function liveTimeAgo(ts) {
  if (!ts) return 'الآن';
  const diff = Date.now() - ts;
  const secs = Math.floor(diff / 1000);
  if (secs < 5) return 'الآن';
  if (secs < 60) return `منذ 0:${String(secs).padStart(2,'0')}`;
  const mins = Math.floor(secs / 60);
  const remSecs = secs % 60;
  if (mins < 60) return `منذ ${mins}:${String(remSecs).padStart(2,'0')}`;
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;
  if (hours < 24) return `منذ ${hours}:${String(remMins).padStart(2,'0')}:${String(remSecs).padStart(2,'0')}`;
  return `منذ ${Math.floor(hours / 24)} ي`;
}
