import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';

/**
 * A hook that reads from localStorage immediately and syncs with Supabase when logged in.
 * - Reads localStorage on mount (fast, offline-first)
 * - If userId is provided, fetches from Supabase and merges (cloud wins)
 * - On setValue, writes to both localStorage and Supabase (debounced)
 */
export function useCloudState(key, defaultValue, { userId, table, column } = {}) {
  const [value, setValueRaw] = useState(() => {
    try {
      const stored = localStorage.getItem(key);
      if (stored === null) return defaultValue;
      return JSON.parse(stored);
    } catch {
      return defaultValue;
    }
  });

  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => () => { mountedRef.current = false; }, []);

  // Sync from cloud on login
  useEffect(() => {
    if (!supabase || !userId || !table || !column) return;
    supabase.from(table).select(column).eq('user_id', userId).maybeSingle()
      .then(({ data }) => {
        if (data && data[column] !== undefined && data[column] !== null && mountedRef.current) {
          setValueRaw(data[column]);
          try { localStorage.setItem(key, JSON.stringify(data[column])); } catch {}
        }
      })
      .catch(() => {});
  }, [userId, table, column, key]);

  const setValue = useCallback((updater) => {
    setValueRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      // Write to localStorage immediately
      try { localStorage.setItem(key, JSON.stringify(next)); } catch {}
      // Debounced write to Supabase
      if (supabase && userId && table && column) {
        clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          supabase.from(table).upsert({ user_id: userId, [column]: next }).catch(() => {});
        }, 300);
      }
      return next;
    });
  }, [key, userId, table, column]);

  return [value, setValue];
}

/**
 * Simpler hook for Set-based state (bookmarks, interested IDs) stored in localStorage + cloud.
 */
export function useCloudSet(key, { userId, table, articleColumn } = {}) {
  const [set, setSetRaw] = useState(() => {
    try {
      const s = localStorage.getItem(key);
      return s ? new Set(JSON.parse(s)) : new Set();
    } catch {
      return new Set();
    }
  });

  const timerRef = useRef(null);

  // Sync from cloud on login (bookmarks table)
  useEffect(() => {
    if (!supabase || !userId || !table || !articleColumn) return;
    supabase.from(table).select(articleColumn).eq('user_id', userId)
      .then(({ data }) => {
        if (data && data.length > 0) {
          const cloudIds = new Set(data.map(d => d[articleColumn]));
          setSetRaw(prev => {
            const merged = new Set([...prev, ...cloudIds]);
            try { localStorage.setItem(key, JSON.stringify([...merged])); } catch {}
            return merged;
          });
        }
      })
      .catch(() => {});
  }, [userId, table, articleColumn, key]);

  const toggle = useCallback((id, articleData) => {
    setSetRaw(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      adding ? next.add(id) : next.delete(id);
      try { localStorage.setItem(key, JSON.stringify([...next])); } catch {}

      // Sync to cloud
      if (supabase && userId && table && articleColumn) {
        if (adding) {
          supabase.from(table).upsert({
            user_id: userId, [articleColumn]: id,
            ...(articleData ? { article_data: articleData } : {}),
          }).catch(() => {});
        } else {
          supabase.from(table).delete()
            .eq('user_id', userId).eq(articleColumn, id).catch(() => {});
        }
      }
      return next;
    });
  }, [key, userId, table, articleColumn]);

  return [set, toggle];
}
