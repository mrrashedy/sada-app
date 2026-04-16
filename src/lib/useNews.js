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

// Default poll dropped from 15000 → 6000ms. Requests are cached server-side
// (KV TTL 15s, cron warms every ~45s), so polling at 6s feels live without
// adding meaningful load — most requests are cache HITs that return in ~50ms.
export function useNews(sources = [], kind = 'news', pollInterval = 6000) {
  // X-style buffered feed:
  //   • `feed` (displayed) — what the user actually sees. Stable. Never moves
  //     under the user's finger. The only way new items enter is via flushPending().
  //   • `pendingFeed` — items the server has returned but we haven't shown yet.
  //     Accumulates silently between user actions.
  //   • `pendingCount` — exposed as a banner number ('5 new posts ↑').
  //
  // On poll: any server item NOT already in displayed `feed` and NOT already in
  // `pendingFeed` is appended to `pendingFeed`. Items in displayed `feed` are
  // never touched (no reorder, no in-place updates). Items the server has dropped
  // remain in displayed feed until they fall off the 500-item cap naturally.
  //
  // First load is special — there's nothing to "preserve," so we drop the entire
  // server response straight into the displayed feed, no pending pile.
  const [feed, setFeed] = useState([]);
  const [pendingFeed, setPendingFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [serverBreaking, setServerBreaking] = useState([]);
  // Admin pin/hide/add decisions for the trending radar — applied client-side
  // on top of extractTrending() output in App.jsx.
  const [radarOverrides, setRadarOverrides] = useState([]);
  const [cacheAge, setCacheAge] = useState(null);
  const abortRef = useRef(null);
  // Refs hold the latest state for the fetch closure to read without recreating
  // the callback on every state change (which would recreate the interval).
  const feedRef = useRef([]);
  const pendingRef = useRef([]);
  feedRef.current = feed;
  pendingRef.current = pendingFeed;

  // flushPending — merges all pending items into the displayed feed by
  // TIMESTAMP (not arrival order). Critical: pending items aren't necessarily
  // newer than displayed by timestamp — e.g. Google News may surface a
  // 10-hour-old article we hadn't seen, which is "new to us" but old in time.
  // Prepending such items would put 10h-old content at position 0 after a
  // refresh, which is what the user reported. Time-merge keeps the displayed
  // feed in true reverse-chronological order across the merge.
  const flushPending = useCallback(() => {
    setFeed(prev => {
      const prevIds = new Set(prev.map(p => p.id));
      const fresh = pendingRef.current.filter(p => !prevIds.has(p.id));
      if (fresh.length === 0) return prev;
      const merged = [...fresh, ...prev];
      merged.sort((a, b) => (b.pubTs || b.timestamp || 0) - (a.pubTs || a.timestamp || 0));
      return merged.slice(0, 500);
    });
    setPendingFeed([]);
  }, []);

  const fetchNews = useCallback(async (silent = false, forceRefresh = false) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    const startTime = Date.now();
    // User-visible refreshes get a minimum loading duration so the radar
    // spectrum animation is actually observable. The DO keeps the cache warm,
    // so the network round-trip is typically ~150ms — too fast to see.
    const MIN_LOADING_MS = 1500;

    if (!silent) setLoading(true);
    setError(null);

    // Helper that holds setLoading(false) until min duration has elapsed
    // (visible refreshes only). Silent polls bypass this.
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
        limit: '1200',
        t: silent ? Math.floor(Date.now() / 15000) : Date.now(),
      });
      // User-initiated refreshes send ?refresh=1 to force server re-aggregation.
      // Silent polls read from the KV cache (warmed by the cron worker every 20s).
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
        let newCount = 0;
        const displayedIds = new Set(feedRef.current.map(f => f.id));
        const isFirstLoad = feedRef.current.length === 0;

        if (isFirstLoad) {
          // First load — nothing to preserve, drop the whole response in.
          setFeed(data.feed.slice(0, 500));
          setPendingFeed([]);
        } else {
          // Subsequent polls — pending is ONLY items NEWER (by timestamp)
          // than what we already showed. Without this threshold, pending
          // would immediately fill with items 501-1200 that the server
          // returned but we never displayed (the feed slices at 500), so
          // the user would see '↑ 500 خبر جديد' on the second poll even
          // though nothing genuinely new had arrived.
          const ts = (item) => item.pubTs || item.timestamp || 0;
          const newestDisplayedTs = feedRef.current.reduce(
            (max, f) => Math.max(max, ts(f)), 0
          );
          const pendingIds = new Set(pendingRef.current.map(p => p.id));
          const fresh = data.feed.filter(
            f => ts(f) > newestDisplayedTs &&
                 !displayedIds.has(f.id) &&
                 !pendingIds.has(f.id)
          );
          if (fresh.length > 0) {
            setPendingFeed(prev => {
              const prevIds = new Set(prev.map(p => p.id));
              const dedupedFresh = fresh.filter(f => !prevIds.has(f.id));
              return [...dedupedFresh, ...prev].slice(0, 500);
            });
          }
          newCount = fresh.length;
        }
        setIsLive(true);

        // Server-side breaking list (from KV cache) + admin radar overrides
        // (fetched live from Supabase per-request, not cached in KV).
        if (data.breaking) setServerBreaking(data.breaking);
        if (Array.isArray(data.radarOverrides)) setRadarOverrides(data.radarOverrides);
        if (data._cache) setCacheAge(data._cache.age);

        await finishLoading();
        return newCount;
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
  }, [sources.join(','), kind]);

  useEffect(() => {
    fetchNews(false);

    // Poll at the specified interval. Main feed: 15s. Map/radar: 30s.
    const interval = setInterval(() => fetchNews(true), pollInterval);

    // Refresh when tab becomes visible
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

  // Manual refresh — explicit user action (button tap, pull-to-refresh).
  // Always flushes pending into the displayed feed FIRST, then triggers a
  // visible re-fetch. Returns the new-item count from the fetch (the pill
  // is a separate signal showing pending items between refreshes).
  const refresh = useCallback(async () => {
    flushPending();
    return fetchNews(false, true);
  }, [flushPending, fetchNews]);

  return {
    feed, loading, error, isLive,
    serverBreaking, radarOverrides, cacheAge,
    pendingCount: pendingFeed.length,
    flushPending,
    refresh,
    silentRefresh: () => fetchNews(true, false),
  };
}
