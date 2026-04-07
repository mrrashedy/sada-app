import { useState, useRef, useCallback } from 'react';

const PULL_THRESHOLD = 80;

export function usePullToRefresh(contentRef, refreshFn) {
  const [pulling, setPulling] = useState(false);
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
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
      try { await refreshFn(); } catch {}
      setRefreshing(false); setPullY(0); setPulling(false);
      contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setPullY(0); setPulling(false);
    }
  }, [pullY, refreshing, refreshFn, contentRef]);

  return { pulling, pullY, refreshing, onTouchStart, onTouchMove, onTouchEnd, PULL_THRESHOLD };
}
