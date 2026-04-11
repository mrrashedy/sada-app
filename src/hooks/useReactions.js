import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, getUserReactions, getReactionCounts, addReaction, removeReaction } from '../lib/supabase';

/**
 * Batch-fetches reaction counts + user's own reactions for visible articles.
 * Avoids N+1 by querying all article IDs at once.
 */
export function useReactions(articleIds, userId) {
  const [counts, setCounts] = useState({}); // { articleId: { like: 0, insightful: 0, ... } }
  const [userReactions, setUserReactions] = useState({}); // { articleId: Set(['like', ...]) }
  const fetchedRef = useRef(new Set());

  useEffect(() => {
    if (!articleIds.length) return;
    // Only fetch IDs we haven't fetched yet
    const newIds = articleIds.filter(id => !fetchedRef.current.has(id));
    if (newIds.length === 0) return;
    newIds.forEach(id => fetchedRef.current.add(id));

    // Fetch counts
    getReactionCounts(newIds).then(data => {
      setCounts(prev => {
        const next = { ...prev };
        data.forEach(d => {
          next[d.article_id] = {
            like: d.like_count || 0,
            insightful: d.insightful_count || 0,
            important: d.important_count || 0,
            misleading: d.misleading_count || 0,
            comment: d.comment_count || 0,
          };
        });
        return next;
      });
    }).catch(() => {});

    // Fetch user's reactions
    if (userId) {
      getUserReactions(userId, newIds).then(data => {
        setUserReactions(prev => {
          const next = { ...prev };
          data.forEach(d => {
            if (!next[d.article_id]) next[d.article_id] = new Set();
            next[d.article_id].add(d.reaction_type);
          });
          return next;
        });
      }).catch(() => {});
    }
  }, [articleIds.join(','), userId]);

  const toggleReaction = useCallback(async (articleId, type = 'like') => {
    if (!userId || !supabase) return false; // not logged in

    const current = userReactions[articleId] || new Set();
    const has = current.has(type);

    // Optimistic update
    setUserReactions(prev => {
      const next = { ...prev };
      const set = new Set(prev[articleId] || []);
      has ? set.delete(type) : set.add(type);
      next[articleId] = set;
      return next;
    });
    setCounts(prev => {
      const next = { ...prev };
      const c = next[articleId] || { like: 0, insightful: 0, important: 0, misleading: 0, comment: 0 };
      next[articleId] = { ...c, [type]: Math.max(0, (c[type] || 0) + (has ? -1 : 1)) };
      return next;
    });

    // Persist
    try {
      if (has) await removeReaction(userId, articleId, type);
      else await addReaction(userId, articleId, type);
    } catch {
      // Rollback on failure
      setUserReactions(prev => {
        const next = { ...prev };
        const set = new Set(prev[articleId] || []);
        has ? set.add(type) : set.delete(type);
        next[articleId] = set;
        return next;
      });
    }
    return true; // was logged in
  }, [userId, userReactions]);

  const incrementCommentCount = useCallback((articleId, delta = 1) => {
    setCounts(prev => {
      const next = { ...prev };
      const c = next[articleId] || { like: 0, insightful: 0, important: 0, misleading: 0, comment: 0 };
      next[articleId] = { ...c, comment: Math.max(0, (c.comment || 0) + delta) };
      return next;
    });
  }, []);

  return { counts, userReactions, toggleReaction, incrementCommentCount };
}
