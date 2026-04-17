// useNews hook — fetches from /api/feeds, refreshes every 15s with cache-busting
// The `kind` parameter selects which backend pool to read:
//   'news'   → the main Arabic news feed (default)
//   'photos' → the photo-grid-only sources (art, fashion, photography magazines)
// Each kind has its own KV cache on the server and its own polling instance
// on the client — they never share state.
import { useState, useEffect, useCallback, useRef } from 'react';
import { SOURCES } from '../data/sources';

const API_URL = '/api/feeds';

// One-shot drift detector — logs a clear console warning if the API knows
// about source IDs that the client's hardcoded src/data/sources.js doesn't.
// This was the root cause of "I added a source and don't see it" — the
// backend SOURCES const in functions/api/feeds.js and the client SOURCES
// array in src/data/sources.js have to stay in sync, but nothing enforced
// it. Now drift surfaces immediately in the dev tools console.
let _driftChecked = false;
function checkSourceDrift(apiSources) {
  if (_driftChecked || !Array.isArray(apiSources)) return;
  _driftChecked = true;
  const clientIds = new Set(SOURCES.map(s => s.id));
  const missing = apiSources.filter(s => s.id && !clientIds.has(s.id));
  if (missing.length === 0) return;
  // eslint-disable-next-line no-console
  console.warn(
    `[sources-drift] API exposes ${missing.length} source(s) the client doesn't know:\n` +
      missing.map(m => `  · ${m.id} — ${m.name || ''}`).join('\n') +
      `\nAdd them to src/data/sources.js so they appear in the source strip.`
  );
}

// No sample data — this is a production app

// X-style stream engine.
//
// Three buffers:
//   • feed (displayed)  — what the user sees. Mutates ONLY on explicit events:
//                          first load, isAtTop poll, flushPending(), refresh().
//                          Never mutates silently while the user is scrolled.
//   • hiddenBuffer       — items fetched from the server but not yet shown.
//                          Accumulates while the user is scrolled, flushed on
//                          explicit user action OR auto-flushed when they
//                          return to the top.
//   • (server response)  — used per-poll for diff against displayed + hidden.
//
// The caller (App.jsx) provides isAtTopRef — a ref whose .current is true when
// the user is within ~120px of the top of the feed scroll container. We pass
// it as a ref (not a value) so the polling closure always sees the latest
// scroll state without recreating the interval.
//
// Backend awareness: ZERO. The /api/feeds endpoint just returns the latest
// items by recency. All buffering, scroll-position decisions, threshold logic,
// pill behavior, and ack semantics live entirely in this hook + App.jsx.
export function useNews(sources = [], kind = 'news', pollInterval = 6000, isAtTopRef = null) {
  const [feed, setFeed] = useState([]);
  const [hiddenBuffer, setHiddenBuffer] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [serverBreaking, setServerBreaking] = useState([]);
  const [radarOverrides, setRadarOverrides] = useState([]);
  const [cacheAge, setCacheAge] = useState(null);
  const [lastFetchAt, setLastFetchAt] = useState(null);
  const abortRef = useRef(null);

  // Refs mirror state so the fetch closure (created once, called by setInterval)
  // can read the latest values without being recreated on every state change.
  const feedRef = useRef([]);
  const hiddenRef = useRef([]);
  feedRef.current = feed;
  hiddenRef.current = hiddenBuffer;

  // Constants
  // FEED_CAP raised from 500 → 3000 so all 80 active sources have items in
  // the displayed pool. Without this, the source-strip filter is empty for
  // ~50 low-volume sources (Reuters, Mada Masr, Al-Akhbar, BBC EN, etc.).
  // Rendering perf is unaffected — useInfiniteScroll paginates the visible
  // window to ~20 nodes at a time; the in-state array just holds objects.
  const FEED_CAP = 3000;
  const HIDDEN_CAP = 1000;
  const ts = (item) => item.pubTs || item.timestamp || 0;

  // mergeByTime — pure helper. Combines two arrays of items, dedupes by id,
  // sorts newest-first by timestamp, slices to cap.
  const mergeByTime = (a, b, cap = FEED_CAP) => {
    const seen = new Set();
    const out = [];
    for (const item of [...a, ...b]) {
      if (seen.has(item.id)) continue;
      seen.add(item.id);
      out.push(item);
    }
    out.sort((x, y) => ts(y) - ts(x));
    return out.slice(0, cap);
  };

  // flushPending — move every item from hiddenBuffer into the displayed feed
  // (merge by timestamp so anything older than the feed top lands in its real
  // chronological position). Clear the buffer.
  const flushPending = useCallback(() => {
    if (hiddenRef.current.length === 0) return;
    setFeed(prev => mergeByTime(hiddenRef.current, prev));
    setHiddenBuffer([]);
  }, []);

  // ackNewItems — clear the buffer without merging. Used when the user is at
  // the top and the items are already visible (or about to be) — we just zero
  // the count so the pill doesn't fire spuriously when they scroll away.
  const ackNewItems = useCallback(() => setHiddenBuffer([]), []);

  const fetchNews = useCallback(async (silent = false, forceRefresh = false) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const startTime = Date.now();
    const MIN_LOADING_MS = 1500;

    if (!silent) setLoading(true);
    setError(null);

    const finishLoading = async () => {
      if (silent) { setLoading(false); return; }
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise(r => setTimeout(r, MIN_LOADING_MS - elapsed));
      }
      setLoading(false);
    };

    try {
      const params = new URLSearchParams({
        // Request the full server pool (5000) instead of the previous 1200.
        // Reason: at 1200, the response only contains items from the ~30
        // highest-volume sources (RT, breaking-news Twitter feeds, big
        // Egyptian dailies). The other ~50 sources (Reuters, Mada Masr,
        // Al-Akhbar, Sana, Al-Mayadeen, BBC EN, etc.) get sliced off
        // because their freshest items are older than the 1200th most
        // recent. Source-strip filter taps for those sources returned
        // empty pools — what the user reported as 'these news agency
        // were pulling content when I press them' (yesterday) being
        // broken now. Pulling 5000 covers all 80 active sources in one
        // request (~600KB instead of ~200KB; perfectly fine for cached
        // CF edge response).
        limit: '5000',
        t: silent ? Math.floor(Date.now() / 15000) : Date.now(),
      });
      if (forceRefresh) params.set('refresh', '1');
      if (kind && kind !== 'news') params.set('kind', kind);
      if (sources.length > 0) params.set('sources', sources.join(','));

      const res = await fetch(`${API_URL}?${params}`, {
        signal: abortRef.current.signal,
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      checkSourceDrift(data.sources);
      if (data.ok && Array.isArray(data.feed) && data.feed.length > 0) {
        const isFirstLoad = feedRef.current.length === 0;
        const displayedIds = new Set(feedRef.current.map(p => p.id));
        const hiddenIds = new Set(hiddenRef.current.map(p => p.id));
        // Items the server returned that we haven't shown OR buffered yet.
        const fresh = data.feed.filter(
          f => !displayedIds.has(f.id) && !hiddenIds.has(f.id)
        );

        if (isFirstLoad) {
          // First load — drop the entire response into displayed (capped).
          // The hidden buffer stays empty; nothing to surface yet.
          setFeed(data.feed.slice(0, FEED_CAP));
        } else if (forceRefresh) {
          // Explicit refresh (button / pull-to-refresh) — merge everything
          // straight into displayed regardless of scroll position. The user
          // explicitly asked to see the latest.
          if (fresh.length > 0) {
            setFeed(prev => mergeByTime(fresh, prev));
          }
          setHiddenBuffer([]);
        } else {
          // Silent poll — scroll position decides.
          const atTop = isAtTopRef ? !!isAtTopRef.current : true;
          if (atTop) {
            // User is at the top — auto-merge new items into displayed.
            // They see them appear naturally. Empty the hidden buffer too
            // (anything that was buffered between scroll events promotes now).
            if (fresh.length > 0 || hiddenRef.current.length > 0) {
              const merged = mergeByTime(
                [...fresh, ...hiddenRef.current],
                feedRef.current
              );
              setFeed(merged);
              setHiddenBuffer([]);
            }
          } else if (fresh.length > 0) {
            // User is scrolled — buffer silently. The displayed feed does
            // NOT mutate. The pill (in App.jsx) appears at >= 5 items.
            setHiddenBuffer(prev => mergeByTime(fresh, prev, HIDDEN_CAP));
          }
        }

        setIsLive(true);
        setLastFetchAt(Date.now());

        if (data.breaking) setServerBreaking(data.breaking);
        if (Array.isArray(data.radarOverrides)) setRadarOverrides(data.radarOverrides);
        if (data._cache) setCacheAge(data._cache.age);

        await finishLoading();
        return fresh.length;
      } else {
        throw new Error('Empty feed');
      }
    } catch (e) {
      if (e.name === 'AbortError') return 0;
      console.warn('[useNews] fetch failed:', e.message);
      setIsLive(false);
      setError(e.message);
    }

    await finishLoading();
    return 0;
  }, [sources.join(','), kind, isAtTopRef]);

  useEffect(() => {
    fetchNews(false);
    const interval = setInterval(() => fetchNews(true), pollInterval);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchNews(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetchNews]);

  // Manual refresh — explicit user action. Always force-fetches and merges
  // straight into displayed (the per-poll scroll-position branch is bypassed
  // by passing forceRefresh=true to fetchNews).
  const refresh = useCallback(async () => {
    return fetchNews(false, true);
  }, [fetchNews]);

  return {
    feed, loading, error, isLive,
    serverBreaking, radarOverrides, cacheAge,
    pendingCount: hiddenBuffer.length,
    flushPending,
    ackNewItems,
    lastFetchAt,
    refresh,
    silentRefresh: () => fetchNews(true, false),
  };
}
