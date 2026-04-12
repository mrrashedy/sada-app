import { useState, useRef, useCallback } from 'react';

const PULL_THRESHOLD = 80;

export function usePullToRefresh(contentRef, refreshFn) {
  const [pulling, setPulling] = useState(false);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState(null);
  const touchStartY = useRef(0);

  const onTouchStart = useCallback(e => {
    if (contentRef.current && contentRef.current.scrollTop === 0) {
      touchStartY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, [contentRef]);

  const onTouchMove = useCallback(e => {
    if (!pulling) return;
    const dy = e.touches[0].clientY - touchStartY.current;
    if (dy > 0) { setPullY(Math.min(dy * 0.5, 120)); }
    else { setPulling(false); setPullY(0); }
  }, [pulling]);

  const onTouchEnd = useCallback(async () => {
    if (pullY >= PULL_THRESHOLD && !refreshing) {
      setRefreshing(true);
      setPullY(50);
      let count = 0;
      try { count = (await refreshFn()) || 0; } catch {}
      setRefreshing(false); setPullY(0); setPulling(false);
      if (count > 0) {
        setRefreshMsg(`${count} خبر جديد`);
      } else {
        setRefreshMsg('أخبارك محدّثة');
      }
      setTimeout(() => setRefreshMsg(null), 2500);
    } else {
      setPullY(0); setPulling(false);
    }
  }, [pullY, refreshing, refreshFn]);

  return { pulling, pullY, refreshing, refreshMsg, setRefreshMsg, onTouchStart, onTouchMove, onTouchEnd, PULL_THRESHOLD };
}
