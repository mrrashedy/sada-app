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

export function useNews(sources = [], kind = 'news', pollInterval = 15000) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [serverBreaking, setServerBreaking] = useState([]);
  // Admin pin/hide/add decisions for the trending radar — applied client-side
  // on top of extractTrending() output in App.jsx.
  const [radarOverrides, setRadarOverrides] = useState([]);
  const [cacheAge, setCacheAge] = useState(null);
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
        let newCount = 0;
        setFeed(prev => {
          const oldIds = new Set(prev.map(f => f.id));
          newCount = data.feed.filter(f => !oldIds.has(f.id)).length;
          // Mark genuinely new items (not in previous set) so the UI can animate them
          const tagged = data.feed.map(f => oldIds.has(f.id) ? f : { ...f, _new: true });
          const newIds = new Set(data.feed.map(f => f.id));
          const kept = prev.filter(p => !newIds.has(p.id));
          return [...tagged, ...kept].slice(0, 500);
        });
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

  return {
    feed, loading, error, isLive,
    serverBreaking, radarOverrides, cacheAge,
    refresh: () => fetchNews(false, true),
    silentRefresh: () => fetchNews(true, false),
  };
}
