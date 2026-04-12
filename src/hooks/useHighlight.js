// useHighlight hook — fetches AI-extracted key phrases for an article and
// caches them in a module-level Map so reopening the same article is instant.
//
// Usage:
//   const { phrases, loading } = useHighlight(article.id, article.title, article.body);
//
// The returned `phrases` is always an array (empty while loading or on error).
// Wrap each phrase with <mark> via the `highlightText` helper inside
// ArticleDetail.jsx.

import { useEffect, useState, useRef } from 'react';

// In-memory cache across component mounts (cleared on page reload)
const cache = new Map();   // articleId → string[] (phrases)

export function useHighlight(articleId, title, body) {
  const [phrases, setPhrases] = useState(() => cache.get(articleId) || []);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);

  useEffect(() => {
    // Reset on article change
    if (!articleId) { setPhrases([]); return; }

    // Body too short → nothing to highlight
    if (!body || body.length < 80) {
      setPhrases([]);
      return;
    }

    // Cache hit → use it immediately, skip network
    if (cache.has(articleId)) {
      setPhrases(cache.get(articleId));
      return;
    }

    // Cancel any in-flight fetch from a previous article
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();

    setLoading(true);
    fetch('/api/highlight', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ articleId, title, body }),
      signal: abortRef.current.signal,
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!data?.ok) { setPhrases([]); cache.set(articleId, []); return; }
        const list = Array.isArray(data.phrases) ? data.phrases : [];
        setPhrases(list);
        cache.set(articleId, list);
      })
      .catch(e => {
        if (e.name !== 'AbortError') {
          setPhrases([]);
          cache.set(articleId, []);
        }
      })
      .finally(() => setLoading(false));

    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [articleId, title, body]);

  return { phrases, loading };
}
