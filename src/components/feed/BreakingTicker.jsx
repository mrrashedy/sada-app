import { useMemo } from 'react';
import { Sound } from '../../lib/sounds';

export function BreakingTicker({ feed, onOpen }) {
  const breaking = useMemo(() => {
    const cutoff = Date.now() - 6 * 3600000; // last 6 hours
    return feed
      .filter(item => item.brk && item.pubTs > cutoff)
      .slice(0, 10);
  }, [feed]);

  if (breaking.length === 0) return null;

  // Duplicate items for seamless infinite scroll
  const items = [...breaking, ...breaking];

  return (
    <div className="ticker">
      <div className="ticker-track">
        {items.map((item, i) => (
          <div
            key={`${item.id}-${i}`}
            className="ticker-item"
            onClick={() => { Sound.open(); onOpen(item); }}
          >
            <span className="ticker-dot" />
            <span className="ticker-label">عاجل</span>
            <span>{item.title}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
