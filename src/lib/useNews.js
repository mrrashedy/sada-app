// useNews hook — fetches from /api/feeds, refreshes every 45s with cache-busting
import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = '/api/feeds';

// No sample data — this is a production app

export function useNews(sources = []) {
  const [feed, setFeed] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isLive, setIsLive] = useState(false);
  const abortRef = useRef(null);

  const fetchNews = useCallback(async (silent = false) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    if (!silent) setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        limit: '80',
        t: Math.floor(Date.now() / 30000), // cache-bust every 30s
      });
      if (sources.length > 0) params.set('sources', sources.join(','));

      const res = await fetch(`${API_URL}?${params}`, {
        signal: abortRef.current.signal,
        headers: { 'Cache-Control': 'no-cache' },
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.ok && Array.isArray(data.feed) && data.feed.length > 0) {
        setFeed(prev => {
          // Merge: new items replace old, keep up to 120
          const newIds = new Set(data.feed.map(f => f.id));
          const kept = prev.filter(p => !newIds.has(p.id));
          return [...data.feed, ...kept].slice(0, 120);
        });
        setIsLive(true);
      } else {
        throw new Error('Empty feed');
      }
    } catch (e) {
      if (e.name === 'AbortError') return;
      console.warn('[useNews] fetch failed:', e.message);
      // No fallback — show empty state if API fails
      setIsLive(false);
      setError(e.message);
    }

    setLoading(false);
  }, [sources.join(',')]);

  useEffect(() => {
    fetchNews(false);

    // Refresh every 45 seconds
    const interval = setInterval(() => fetchNews(true), 45000);

    // Also refresh when tab becomes visible
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

  return { feed, loading, error, isLive, refresh: () => fetchNews(false) };
}
