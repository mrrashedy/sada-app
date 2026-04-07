import { useState, useEffect } from 'react';

export function useTick(intervalMs = 1000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setTick(v => v + 1), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
}
