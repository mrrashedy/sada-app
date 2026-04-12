// useNews hook — fetches from /api/feeds, refreshes every 15s with cache-busting
// The `kind` parameter selects which backend pool to read:
//   'news'   → the main Arabic news feed (default)
//   'photos' → the photo-grid-only sources (art, fashion, photography magazines)
// Each kind has its own KV cache on the server and its own polling instance
// on the client — they never share state.
import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = '/api/feeds';

// No sample data — this is a production app

export function useNews(sources = [], kind = 'news') {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const [serverTrending, setServerTrending] = useState([]);
  const [serverBreaking, setServerBreaking] = useState([]);
  const [cacheAge, setCacheAge] = useState(null);
  const abortRef = useRef(null);

  const fetchNews = useCallback(async (silent = false) => {
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
        limit: '500',
        t: silent ? Math.floor(Date.now() / 15000) : Date.now(),
      });
      // Don't pass ?refresh=1 — that blocks for 5-15s while the server
      // re-aggregates 40+ RSS feeds. Instead, the cron-worker warms the KV
      // every minute, so reading the cache is always near-fresh and instant.
      if (kind && kind !== 'news') params.set('kind', kind);
      if (sources.length > 0) params.set('sources', sources.join(','));

      const res = await fetch(`${API_URL}?${params}`, {
        signal: abortRef.current.signal,
        cache: 'no-store',
        headers: { 'cache-control': 'no-cache' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
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

        // Server-side trending + breaking (from KV cache)
        if (data.trending) setServerTrending(data.trending);
        if (data.breaking) setServerBreaking(data.breaking);
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

    // Poll every 15s — matches the server's 15s KV TTL + 10s CDN s-maxage,
    // so silent polls pick up new items within ~25s of them hitting the edge.
    const interval = setInterval(() => fetchNews(true), 15000);

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
    serverTrending, serverBreaking, cacheAge,
    refresh: () => fetchNews(false),
    silentRefresh: () => fetchNews(true),
  };
}
