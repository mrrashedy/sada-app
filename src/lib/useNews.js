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
  // Auto-updating feed. New items arrive automatically into the displayed
  // list — no pending buffer, no manual flush. The X-style buffered design
  // I tried earlier conflated two separate concerns:
  //   • Reducing flicker (UX) — solved by killing the .post / .post-new
  //     animations in styles/global.css.
  //   • Pausing updates (a behavior change the user did NOT ask for).
  // Reverted to auto-merge so the feed actually keeps populating as the
  // server returns fresh items. Flicker stays gone because animations are
  // off and React keys (item.id) keep DOM nodes stable across reorderings.
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [serverBreaking, setServerBreaking] = useState([]);
  const [radarOverrides, setRadarOverrides] = useState([]);
  const [cacheAge, setCacheAge] = useState(null);
  // newCount — items added in the most recent poll. Used by the live
  // indicator ('· N جديد') so the user sees activity per poll.
  const [newCount, setNewCount] = useState(0);
  // lastFetchAt — wall-clock ms of the last successful poll. The live
  // indicator's 'تحديث منذ X ث' label ticks off this.
  const [lastFetchAt, setLastFetchAt] = useState(null);
  const abortRef = useRef(null);

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
        // Auto-merge: every new item from the server goes straight into the
        // displayed feed by timestamp order. The pill is just a NOTIFICATION
        // that 5+ new items have piled up since the user last looked at the
        // top — it does NOT gate when items appear. User's clarification:
        // 'feed is to put them actually there, not store them until they get five.'
        const ts = (item) => item.pubTs || item.timestamp || 0;
        const prevIds = new Set(feed.map(p => p.id));
        const freshIds = data.feed.filter(f => !prevIds.has(f.id));
        const added = freshIds.length;
        if (added > 0) {
          setFeed(prev => {
            const _prevIds = new Set(prev.map(p => p.id));
            const fresh = data.feed.filter(f => !_prevIds.has(f.id));
            if (fresh.length === 0) return prev;
            // Merge by timestamp so late-arriving older items (Google News
            // discovering a 10h-old story) land at their actual chronological
            // position instead of getting pinned to the top.
            const merged = [...fresh, ...prev];
            merged.sort((a, b) => ts(b) - ts(a));
            return merged.slice(0, 500);
          });
        }
        setNewCount(prev => prev + added);
        setIsLive(true);
        setLastFetchAt(Date.now());

        // Server-side breaking list (from KV cache) + admin radar overrides
        // (fetched live from Supabase per-request, not cached in KV).
        if (data.breaking) setServerBreaking(data.breaking);
        if (Array.isArray(data.radarOverrides)) setRadarOverrides(data.radarOverrides);
        if (data._cache) setCacheAge(data._cache.age);

        await finishLoading();
        return added;
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

  // Manual refresh — explicit user action. Resets the new-items counter
  // (since the user is acknowledging them by refreshing) and triggers a
  // visible re-fetch.
  const refresh = useCallback(async () => {
    setNewCount(0);
    return fetchNews(false, true);
  }, [fetchNews]);

  // ackNewItems — caller (the pill onClick) can clear the new-items count
  // without forcing a re-fetch (items are already in the feed).
  const ackNewItems = useCallback(() => setNewCount(0), []);

  return {
    feed, loading, error, isLive,
    serverBreaking, radarOverrides, cacheAge,
    newCount,
    ackNewItems,
    lastFetchAt,
    refresh,
    silentRefresh: () => fetchNews(true, false),
  };
}
