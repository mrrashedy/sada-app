import { useState, useCallback, useEffect } from 'react';
import { supabase, getComments, addComment, deleteComment } from '../lib/supabase';

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
            .select('*, profiles:user_id(display_name, username, avatar_url)')
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

    // Optimistic: add a temporary comment
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
      const real = await addComment(userId, articleId, body.trim(), parentId);
      if (real) {
        setComments(prev => prev.map(c => c.id === tempId ? real : c));
        // Background moderation — non-blocking
        fetch('/api/moderate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: body.trim(), commentId: real.id }),
        }).catch(() => {});
        return real;
      }
    } catch {
      // Remove optimistic on failure
      setComments(prev => prev.filter(c => c.id !== tempId));
    }
    return null;
  }, [articleId]);

  const remove = useCallback(async (commentId) => {
    const removed = comments.find(c => c.id === commentId);
    setComments(prev => prev.filter(c => c.id !== commentId));
    try {
      await deleteComment(commentId);
    } catch {
      if (removed) setComments(prev => [...prev, removed]);
    }
  }, [comments]);

  return { comments, loading, loaded, load, add, remove };
}
