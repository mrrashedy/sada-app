import { useState, useCallback, useEffect } from 'react';
import { supabase, getComments } from '../lib/supabase';

export function useComments(articleId) {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!articleId) return;
    setLoading(true);
    try {
      const data = await getComments(articleId);
      setComments(data);
      setLoaded(true);
    } catch {}
    setLoading(false);
  }, [articleId]);

  // Real-time: subscribe to new comments on this article
  useEffect(() => {
    if (!supabase || !articleId) return;
    const channel = supabase
      .channel('comments-' + articleId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'comments',
        filter: `article_id=eq.${articleId}`,
      }, (payload) => {
        // Avoid duplicating optimistic comments
        setComments(prev => {
          if (prev.some(c => c.id === payload.new.id)) return prev;
          // Fetch with profile join
          supabase
            .from('comments')
            .select('*, profiles!comments_user_profiles_fk(display_name, username, avatar_url)')
            .eq('id', payload.new.id)
            .single()
            .then(({ data }) => {
              if (data) setComments(p => p.some(c => c.id === data.id) ? p : [...p, data]);
            });
          return prev;
        });
      })
      .on('postgres_changes', {
        event: 'DELETE',
        schema: 'public',
        table: 'comments',
        filter: `article_id=eq.${articleId}`,
      }, (payload) => {
        setComments(prev => prev.filter(c => c.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [articleId]);

  const add = useCallback(async (userId, body, parentId = null, profile = null) => {
    if (!articleId || !userId || !body.trim()) return null;

    // Optimistic: add a temporary comment so the UI feels instant. We replace
    // it with the server's row when the request resolves.
    const tempId = 'temp-' + Date.now();
    const tempComment = {
      id: tempId,
      user_id: userId,
      article_id: articleId,
      body: body.trim(),
      parent_id: parentId,
      created_at: new Date().toISOString(),
      profiles: profile || { display_name: 'أنت', username: null, avatar_url: null },
      _optimistic: true,
    };
    setComments(prev => [...prev, tempComment]);

    try {
      // Get a valid Supabase JWT to authenticate the user with /api/comments.
      // The endpoint runs moderation BEFORE inserting.
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) {
        setComments(prev => prev.filter(c => c.id !== tempId));
        return { error: 'sign_in_required' };
      }

      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ articleId, body: body.trim(), parentId }),
      });
      const data = await res.json();

      if (!res.ok || !data.ok) {
        // Remove optimistic and surface the rejection reason.
        setComments(prev => prev.filter(c => c.id !== tempId));
        return { error: data.error || 'submit_failed' };
      }

      // Replace optimistic with the real row (already includes profile join)
      setComments(prev => prev.map(c => c.id === tempId ? data.comment : c));
      return data.comment;
    } catch (e) {
      setComments(prev => prev.filter(c => c.id !== tempId));
      return { error: 'network_error' };
    }
  }, [articleId]);

  const remove = useCallback(async (commentId) => {
    const removed = comments.find(c => c.id === commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error('not_signed_in');
      const res = await fetch(`/api/comments?id=${encodeURIComponent(commentId)}`, {
        method: 'DELETE',
        headers: { authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('delete_failed');
    } catch {
      if (removed) setComments(prev => [...prev, removed]);
    }
  }, [comments]);

  return { comments, loading, loaded, load, add, remove };
}
