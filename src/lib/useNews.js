// useNews hook — fetches from /api/feeds, refreshes every 45s with cache-busting
import { useState, useEffect, useCallback, useRef } from 'react';

const API_URL = '/api/feeds';

// Sample data fallback when API is unavailable (local dev)
const SAMPLE_FEED = [
  { id:"s1", source:{id:"aljazeera",name:"الجزيرة",initial:"ج"}, time:"منذ ٣ د", title:"قمة الرياض تختتم بإعلان تاريخي — خارطة طريق اقتصادية جديدة للشرق الأوسط", body:"القادة يتوافقون على إنشاء صندوق إقليمي بقيمة ١٠٠ مليار دولار لدعم التحول الرقمي والتكامل الاقتصادي في المنطقة", categories:["سياسة"], image:"", link:"#" },
  { id:"s2", source:{id:"bbc",name:"BBC عربي",initial:"B"}, time:"منذ ١٥ د", title:"حوار خاص مع رئيس أرامكو: ٥٠ مليار دولار للطاقة المتجددة", body:"في مقابلة حصرية يكشف الرئيس التنفيذي عن خطط الشركة لقيادة التحول في قطاع الطاقة", categories:["اقتصاد"], image:"", link:"#" },
  { id:"s3", source:{id:"skynews",name:"سكاي نيوز",initial:"S"}, time:"منذ ٤٥ د", title:"محادثات جنيف تحقق اختراقاً دبلوماسياً بشأن الملف النووي", body:"مصادر مطلعة تكشف عن تفاصيل الاتفاق الذي وصفه المبعوث الأممي بأنه خطوة تاريخية", categories:["سياسة"], image:"", link:"#" },
];

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
      // Only use fallback if we have no data at all
      if (feed.length === 0) {
        setFeed(SAMPLE_FEED);
      }
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
