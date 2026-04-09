import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useActivity(userId) {
  const [items, setItems] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!supabase || !userId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('activity')
        .select('*, actor:actor_id(display_name, username, avatar_url)')
        .eq('target_owner_id', userId)
        .order('created_at', { ascending: false })
        .limit(50);
      setItems(data || []);
      setUnreadCount((data || []).filter(a => !a.read).length);
    } catch {}
    setLoading(false);
  }, [userId]);

  // Realtime subscription for new activity
  useEffect(() => {
    if (!supabase || !userId) return;
    load();

    const channel = supabase
      .channel('activity-' + userId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'activity',
        filter: `target_owner_id=eq.${userId}`,
      }, (payload) => {
        // Fetch the full record with actor profile
        supabase
          .from('activity')
          .select('*, actor:actor_id(display_name, username, avatar_url)')
          .eq('id', payload.new.id)
          .single()
          .then(({ data }) => {
            if (data) {
              setItems(prev => [data, ...prev]);
              setUnreadCount(prev => prev + 1);
            }
          });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId, load]);

  const markAllRead = useCallback(async () => {
    if (!supabase || !userId) return;
    setUnreadCount(0);
    setItems(prev => prev.map(a => ({ ...a, read: true })));
    await supabase
      .from('activity')
      .update({ read: true })
      .eq('target_owner_id', userId)
      .eq('read', false)
      .catch(() => {});
  }, [userId]);

  return { items, unreadCount, loading, load, markAllRead };
}
