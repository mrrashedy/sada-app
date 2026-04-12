// Photo Grid view — see the world only in photos.
//
// Displays a Pinterest-style bento-box masonry grid of curated photos
// (art / culture / fashion / photography magazines). Tapping a tile flips it
// to reveal title + source for 4 seconds, then auto-flips back. Every ~10s
// one tile fades out and is replaced with a fresh image from the next-up queue.
//
// Data source: self-fetches via useNews('photos') — an independent backend
// endpoint with its own source pool, KV cache, and polling cadence. The photo
// grid is a first-class feature like the radar, not a derived view of the
// main news feed.

import { useEffect, useState, useRef, useMemo } from 'react';
import { useNews } from '../../lib/useNews';
import { pickPhotos } from '../../lib/photoFilter';

const VISIBLE_COUNT = 100;         // tiles in the grid at once
const SWAP_INTERVAL_MS = 10_000;   // one tile fades-replaced every 10s
const FLIP_AUTOREVERT_MS = 4_000;  // tap → 4s → flip back

// Bento-box size pattern — deterministic, irregular, looped over the visible grid.
// Biased toward tall (1×2) portraits for a longer, more immersive grid.
// Per 15 slots: 3 large (2×2)  +  8 tall (1×2)  +  2 wide (2×1)  +  2 small (1×1)
const SIZE_PATTERN = [
  'large', 'tall', 'tall', 'small', 'tall',
  'wide',  'tall', 'large', 'tall', 'small',
  'tall',  'wide', 'tall',  'large','tall',
];
const tileSize = (idx) => SIZE_PATTERN[idx % SIZE_PATTERN.length];

export function PhotoGrid() {
  // Self-fetch from the independent photo pool. Does NOT share state with
  // the main news feed — its own useNews instance, own polling cycle.
  const { feed: photoFeed, loading } = useNews([], 'photos');
  const candidates = useMemo(() => pickPhotos(photoFeed || []), [photoFeed]);

  const [displayed, setDisplayed] = useState([]);
  const [flippedId, setFlippedId] = useState(null);
  const [fadingId, setFadingId] = useState(null);
  const flipTimerRef = useRef(null);
  const queueRef = useRef([]);
  const swapTimerRef = useRef(null);

  // (Re)hydrate when candidates change.
  // New items (not previously displayed) are PREPENDED so they appear at the
  // top and push older items down — like a normal news feed. Old items that
  // are still in candidates keep their relative order below.
  useEffect(() => {
    if (candidates.length === 0) {
      setDisplayed([]);
      queueRef.current = [];
      return;
    }
    setDisplayed(prev => {
      const prevIds = new Set(prev.map(p => p.id));
      const candIds = new Set(candidates.map(c => c.id));
      // Anything in candidates that isn't already displayed = new; prepend in
      // candidates' sort order (which pickPhotos already ranked by score).
      const newItems = candidates.filter(c => !prevIds.has(c.id));
      // Still-valid previously displayed items keep their original order below.
      const stillValid = prev.filter(p => candIds.has(p.id));
      const merged = [...newItems, ...stillValid].slice(0, VISIBLE_COUNT);
      // Queue = leftover candidates that didn't make the visible cut
      const mergedIds = new Set(merged.map(m => m.id));
      queueRef.current = candidates.filter(c => !mergedIds.has(c.id));
      return merged;
    });
  }, [candidates]);

  // Live-swap timer
  useEffect(() => {
    if (displayed.length === 0) return;
    swapTimerRef.current = setInterval(() => {
      // Refill queue from candidates if empty
      if (queueRef.current.length === 0) {
        const displayedIds = new Set(displayed.map(d => d.id));
        queueRef.current = candidates.filter(c => !displayedIds.has(c.id));
        if (queueRef.current.length === 0) return;
      }
      const idx = Math.floor(Math.random() * displayed.length);
      const next = queueRef.current.shift();
      const oldId = displayed[idx].id;
      setFadingId(oldId);
      setTimeout(() => {
        setDisplayed(prev => {
          const copy = [...prev];
          copy[idx] = next;
          return copy;
        });
        setFadingId(null);
      }, 350); // matches CSS fade duration
    }, SWAP_INTERVAL_MS);
    return () => {
      if (swapTimerRef.current) clearInterval(swapTimerRef.current);
    };
  }, [displayed, candidates]);

  // Cleanup any pending flip-revert timer on unmount
  useEffect(() => {
    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    };
  }, []);

  const handleTap = (id) => {
    setFlippedId(prev => (prev === id ? null : id));
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    flipTimerRef.current = setTimeout(() => setFlippedId(null), FLIP_AUTOREVERT_MS);
  };

  if (candidates.length === 0) {
    return (
      <div className="pgrid-empty">
        {loading ? 'جاري تحميل الصور…' : (<>لم نجد صورًا حالياً.<br />سيتم التحديث تلقائياً مع وصول محتوى جديد.</>)}
      </div>
    );
  }

  const handleOpen = (e, item) => {
    e.stopPropagation();          // don't let the click bubble to the card flip
    if (flipTimerRef.current) clearTimeout(flipTimerRef.current);
    setFlippedId(null);
    // Open the article directly on the news outlet's site in a new tab.
    if (item.link) {
      window.open(item.link, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className="pgrid">
      {displayed.map((item, idx) => (
        <div
          key={item.id}
          className={`pgrid-card size-${tileSize(idx)}${flippedId === item.id ? ' flipped' : ''}${fadingId === item.id ? ' fading' : ''}`}
          onClick={() => handleTap(item.id)}
        >
          <div className="pgrid-flip">
            <div className="pgrid-front">
              <img src={item.image} alt="" loading="lazy" />
            </div>
            <div className="pgrid-back">
              <div
                className="pgrid-back-title"
                onClick={(e) => handleOpen(e, item)}
                role="button"
                tabIndex={flippedId === item.id ? 0 : -1}
              >
                {item.title}
              </div>
              <div className="pgrid-back-meta">
                <span>{item.source?.name || ''}</span>
                {item.time && <><span>•</span><span>{item.time}</span></>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
