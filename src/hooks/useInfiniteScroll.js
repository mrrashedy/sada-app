import { useState, useCallback, useEffect } from 'react';

export function useInfiniteScroll(initialCount = 20, step = 15, max = 200, resetDep) {
  const [visibleCount, setVisibleCount] = useState(initialCount);

  const onScroll = useCallback(e => {
    const el = e.target;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 300) {
      setVisibleCount(prev => Math.min(prev + step, max));
    }
  }, [step, max]);

  useEffect(() => { setVisibleCount(initialCount); }, [resetDep, initialCount]);

  return { visibleCount, onScroll };
}
