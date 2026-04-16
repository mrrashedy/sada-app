// useDepth hook — reads the Basira depth vertical directly from Supabase.
//
// Architecture (Option B): Basira runs headless in GitHub Actions,
// writes to Supabase (`depth_sources`, `depth_documents`, `depth_analyses`),
// and Sada reads the flattened `depth_feed` view directly via the anon
// key. No Python server, no tunnel, no VITE_BASIRA_URL. The only runtime
// dependency is the Supabase project that Sada already uses for auth +
// bookmarks — so there's nothing new to deploy on the frontend side.
//
// The hook keeps the same public surface as before (items, status, reason,
// refresh, etc.) so DepthFeed.jsx and DepthPost.jsx don't need to change.
// Only the data-loading internals are different.
//
// Status model:
//   loading  → first fetch in progress, no prior data
//   ok       → we have at least one item
//   empty    → Supabase responded with zero rows
//   offline  → the Supabase client isn't configured (missing env vars)
//   error    → Supabase returned an error (RLS, network, schema drift)

import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from './supabase';

// Polling cadence. Analytical content trickles in once an hour via the
// GitHub Actions cron, so 5 min of polling is already generous. We also
// refresh on tab-visibility changes for the "come back to the tab" case.
const POLL_INTERVAL_MS = 5 * 60 * 1000;

// Extract a host from a URL string for the source logo fallback. Returns
// empty string on parse failure so the component's favicon fetch just
// quietly skips.
function hostOf(url) {
  if (!url) return '';
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

// Map a depth_feed row (flattened view over documents + sources + analyses)
// into the shape DepthPost expects. DepthPost reads flat fields
// (item.title, item.category, item.analytical_conclusion, item.key_quotes,
// item.s.{n,logo,domain}, etc.) so most of this is pass-through with a few
// derived fields bolted on.
function mapFeedRow(row) {
  const domain = hostOf(row.source_url);
  const pubTs = row.published_at
    ? Date.parse(row.published_at)
    : row.fetched_at
      ? Date.parse(row.fetched_at)
      : Date.now();

  return {
    // Identity + routing
    id: String(row.id),
    canonical_url: row.canonical_url,
    link: row.canonical_url,

    // Content
    title: row.title,
    title_ar: row.title_ar,
    body: row.body,
    abstract: row.abstract,
    brief: row.abstract,
    language: row.language,
    document_type: row.document_type,
    pubTs,

    // Source metadata (DepthPost reads item.category / item.priority flat,
    // AND item.s.{n,logo,domain} for the header chip).
    category: row.category,
    priority: row.priority,
    s: {
      n: row.source_name || 'unknown',
      logo: null,
      domain,
    },

    // Analysis scaffolding — every field is nullable because the minimal
    // prompt only fills analytical_conclusion + key_quotes, and pending
    // docs have no analysis row at all.
    analytical_conclusion: row.analytical_conclusion,
    core_argument: row.core_argument,
    supporting_logic: row.supporting_logic,
    analytical_frame: row.analytical_frame,
    tensions: row.tensions,
    if_correct_then: row.if_correct_then,
    thesis: row.thesis,
    key_points: row.key_points,
    frameworks: row.frameworks,
    regions: row.regions,
    topics: row.topics,
    tags: row.topics,
    actors: row.actors,
    assumptions: row.assumptions,
    key_quotes: row.key_quotes,
    ar_summary: row.ar_summary,
    en_summary: row.en_summary,
    analysis_status: row.analysis_status,
  };
}

export function useDepth({ limit = 60, category, priority } = {}) {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState('loading');
  const [reason, setReason] = useState(null);
  const [lastFetchedAt, setLastFetchedAt] = useState(null);
  const [totalCount, setTotalCount] = useState(null);
  const mountedRef = useRef(true);

  const fetchDepth = useCallback(async (silent = false) => {
    if (!supabase) {
      setStatus('offline');
      setReason('supabase_not_configured');
      return;
    }
    if (!silent) setStatus(prev => (prev === 'ok' ? 'ok' : 'loading'));

    try {
      let query = supabase
        .from('depth_feed')
        .select('*', { count: 'exact' })
        // Only show docs the analyst has actually processed. Newly-ingested
        // docs without an analytical_conclusion are still in the analysis
        // queue (the worker drains ~200/run) — surfacing them as blank
        // cards looks broken. Filtering here means the user always sees
        // populated cards, even if the very newest doc is still pending.
        .not('analytical_conclusion', 'is', null)
        .order('published_at', { ascending: false, nullsFirst: false })
        .limit(limit);

      if (category) query = query.eq('category', category);
      if (priority) query = query.eq('priority', priority);

      const { data, error, count } = await query;
      if (!mountedRef.current) return;

      if (error) {
        console.warn('[useDepth] supabase error:', error.message);
        setStatus('error');
        setReason(error.message || 'supabase_error');
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      setTotalCount(typeof count === 'number' ? count : rows.length);

      if (rows.length === 0) {
        setItems([]);
        setStatus('empty');
        setReason(count === 0 ? 'no_documents_yet' : 'no_matches');
      } else {
        setItems(rows.map(mapFeedRow));
        setStatus('ok');
        setReason(null);
      }
      setLastFetchedAt(Date.now());
    } catch (e) {
      if (!mountedRef.current) return;
      console.warn('[useDepth] fetch failed:', e.message);
      setStatus('offline');
      setReason(e.message || 'network_error');
    }
  }, [limit, category, priority]);

  useEffect(() => {
    mountedRef.current = true;
    fetchDepth(false);
    const interval = setInterval(() => fetchDepth(true), POLL_INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') fetchDepth(true);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mountedRef.current = false;
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchDepth]);

  return {
    items,
    status,
    reason,
    totalCount,
    lastFetchedAt,
    // Retained for backwards compatibility with any UI that logged this;
    // no longer used for the actual fetch.
    basiraUrl: 'supabase://depth_feed',
    refresh: () => fetchDepth(false),
  };
}
