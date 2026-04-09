// useNews hook — fetches from /api/feeds, refreshes every 45s with cache-busting
import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = '/api/feeds';

// No sample data — this is a production app

export function useNews(sources = []) {
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

    if (!silent) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: '500',
        t: silent ? Math.floor(Date.now() / 15000) : Date.now(),
      });
      if (sources.length > 0) params.set('sources', sources.join(','));

      const res = await fetch(`${API_URL}?${params}`, {
        signal: abortRef.current.signal,
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.ok && Array.isArray(data.feed) && data.feed.length > 0) {
        let newCount = 0;
        setFeed(prev => {
          const oldIds = new Set(prev.map(f => f.id));
          newCount = data.feed.filter(f => !oldIds.has(f.id)).length;
          const newIds = new Set(data.feed.map(f => f.id));
          const kept = prev.filter(p => !newIds.has(p.id));
          return [...data.feed, ...kept].slice(0, 500);
        });
        setIsLive(true);
        setLoading(false);

        // Server-side trending + breaking (from KV cache)
        if (data.trending) setServerTrending(data.trending);
        if (data.breaking) setServerBreaking(data.breaking);
        if (data._cache) setCacheAge(data._cache.age);

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

    setLoading(false);
    return 0;
  }, [sources.join(',')]);

  useEffect(() => {
    fetchNews(false);

    // Poll every 60 seconds (server handles caching, so we can be less aggressive)
    const interval = setInterval(() => fetchNews(true), 60000);

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
