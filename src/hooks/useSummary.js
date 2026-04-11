import { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useSummary() {
  const [summaries, setSummaries] = useState({}); // { articleId: { text, loading, error } }

  const fetchSummary = useCallback(async (articleId, title, body) => {
    if (summaries[articleId]?.text) return; // already have it

    setSummaries(prev => ({ ...prev, [articleId]: { text: null, loading: true, error: null } }));

    try {
      // /api/summarize requires a Supabase JWT. Anonymous users see a
      // "sign in to read summary" prompt instead. The JWT is obtained from
      // the active Supabase session if any.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setSummaries(prev => ({
          ...prev,
          [articleId]: { text: null, loading: false, error: 'sign_in_required' },
        }));
        return;
      }

      const res = await fetch('/api/summarize', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
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
