import { useState, useCallback } from 'react';

export function useSummary() {
  const [summaries, setSummaries] = useState({}); // { articleId: { text, loading, error } }

  const fetchSummary = useCallback(async (articleId, title, body) => {
    if (summaries[articleId]?.text) return; // already have it

    setSummaries(prev => ({ ...prev, [articleId]: { text: null, loading: true, error: null } }));

    try {
      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ articleId, title, body }),
      });
      const data = await res.json();
      if (data.ok && data.summary) {
        setSummaries(prev => ({ ...prev, [articleId]: { text: data.summary, loading: false, error: null } }));
      } else {
        setSummaries(prev => ({ ...prev, [articleId]: { text: null, loading: false, error: data.error || 'فشل التلخيص' } }));
      }
    } catch (e) {
      setSummaries(prev => ({ ...prev, [articleId]: { text: null, loading: false, error: e.message } }));
    }
  }, [summaries]);

  return { summaries, fetchSummary };
}
