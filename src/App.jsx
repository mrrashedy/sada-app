import { useState, useEffect, useRef, useCallback, useMemo, useLayoutEffect } from "react";
import './styles/global.css';

// Data
import { SOURCES } from './data/sources';
import { TOPICS, TOPIC_KEYWORDS } from './data/topics';

// Hooks
import { useNews } from './lib/useNews';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';
import { useReactions } from './hooks/useReactions';

// Lib
import { scoreByTopics, isOpinionOrSentimental, isDeepInvestigative } from './lib/filters';
import { detectFlags } from './lib/countryFlags';
import { Sound } from './lib/sounds';
import { extractTrending } from './lib/trending';
import { shareArticle } from './lib/shareCard';

// Auth
import { useAuth } from './context/AuthContext';
import { AuthModal } from './components/auth/AuthModal';
import { ProfileSetup } from './components/auth/ProfileSetup';

// Social
import { CommentSheet } from './components/social/CommentSheet';
import { UserProfile } from './components/social/UserProfile';

// Components
import { I } from './components/shared/Icons';
import { Post } from './components/feed/Post';
import { ArticleDetail } from './components/article/ArticleDetail';
import { SearchView } from './components/search/SearchView';
import { BookmarksView } from './components/bookmarks/BookmarksView';
import { SettingsView } from './components/settings/SettingsView';
import { NewsMap } from './components/map/NewsMap';
import { NotificationPanel } from './components/notifications/NotificationPanel';
import { TrendingRadar, RadarView } from './components/trending/TrendingRadar';
import { BreakingTicker } from './components/feed/BreakingTicker';
import { AdminPanel } from './components/admin/AdminPanel';
import { DepthFeed } from './components/depth/DepthFeed';
import { DepthDetail } from './components/depth/DepthDetail';
import { ClusterDemo } from './components/experimental/ClusterDemo';
import { reorderWithClusters } from './lib/clusters';

export default function Sada() {
  // Experimental sandbox — isolated from main feed behavior
  if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('clusterdemo') === '1') {
    return <ClusterDemo/>;
  }
  const auth = useAuth();
  const [showAuth, setShowAuth] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [commentArticle, setCommentArticle] = useState(null);
  const [profileUserId, setProfileUserId] = useState(null);

  // Show profile setup after signup
  useEffect(() => { if (auth.needsSetup && auth.isLoggedIn) setShowProfile(true); }, [auth.needsSetup, auth.isLoggedIn]);

  const [theme, setTheme] = useState(() => { try { return localStorage.getItem('sada-theme')||'light'; } catch { return 'light'; } });
  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); try { localStorage.setItem('sada-theme', theme); } catch {} }, [theme]);
  const toggleTheme = useCallback(() => setTheme(p => p === 'dark' ? 'light' : 'dark'), []);

  // Onboarding is no longer a first-run gate — new users go straight to the
  // feed with sensible defaults. The sources/topics/regions picker lives in
  // SettingsView so users can personalise on their own time.
  const [userPrefs, setUserPrefs] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('sada-prefs') || 'null');
      if (stored) return stored;
    } catch {}
    const defaults = { topics: [], regions: ['gulf'], sources: ['aljazeera','alarabiya','bbc','asharq_news','skynews'] };
    try { localStorage.setItem('sada-prefs', JSON.stringify(defaults)); } catch {}
    return defaults;
  });
  const [nav, setNav]           = useState('home');
  const [feedTab, setFeedTab]   = useState('now');
  const [article, setArticle]   = useState(null);
  // Depth (Basira) documents open in their own detail surface because the
  // shape is totally different from news (analytical scaffold + summaries
  // instead of headline/image/reactions). Kept in its own state slot so
  // the two modals never collide.
  const [depthDoc, setDepthDoc] = useState(null);
  const [srch, setSrch]         = useState(false);
  const [notifs, setNotifs]     = useState(false);
  const [seenTs, setSeenTs]     = useState(() => { try { return parseInt(localStorage.getItem('sada-seen-ts'))||0; } catch { return 0; } });
  const [sources, setSources]   = useState({});
  const [activeSource, setActiveSource] = useState(null);
  // Source strip shows the first ~20 by default. User can expand to see all
  // ~80 via the trailing "+المزيد" pill. Keeps the strip a single calm row
  // instead of a wall of pills competing with the headline.
  const [showAllSources, setShowAllSources] = useState(false);
  // (newCount state removed — the pill now reads pendingCount directly
  // from useNews. See the X-style buffered-feed comment below.)
  // (prevLen / prevIds removed — useNews now owns the new-items detection
  // via its internal pendingFeed buffer. See the X-style comment block below.)
  const contentRef              = useRef(null);
  const lastScrollY             = useRef(0);
  const [barsHidden, setBarsHidden] = useState(false);
  // isAtTop — true when the user is within ~120px of the feed top.
  // Used in two places:
  //   1. As state — to gate the pill ('!isAtTop' in the JSX)
  //   2. As a ref — passed to useNews so its polling closure can read the
  //      latest scroll position WITHOUT recreating the interval. State alone
  //      isn't enough because closures over state get stale.
  const [isAtTop, setIsAtTop] = useState(true);
  const isAtTopRef = useRef(true);
  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const y = el.scrollTop;
    const delta = y - lastScrollY.current;
    if (delta > 8) setBarsHidden(true);       // scrolling down → hide
    else if (delta < -8) setBarsHidden(false); // scrolling up → show
    const atTop = y < 120;
    setIsAtTop(atTop);
    isAtTopRef.current = atTop;
    lastScrollY.current = y;
  }, []);

  // Bookmarks
  const [savedIds, setSavedIds] = useState(() => { try { const s=localStorage.getItem('sada-bookmarks'); return s?new Set(JSON.parse(s)):new Set(); } catch { return new Set(); } });
  const toggleSave = useCallback(id => { setSavedIds(prev => { const next=new Set(prev); next.has(id)?next.delete(id):next.add(id); try { localStorage.setItem('sada-bookmarks',JSON.stringify([...next])); } catch {} return next; }); }, []);

  // Learned interests — tags the user cares about, with weights
  const [interests, setInterests] = useState(() => { try { return JSON.parse(localStorage.getItem('sada-interests')||'{}'); } catch { return {}; } });
  const [interestedIds, setInterestedIds] = useState(() => { try { const s=localStorage.getItem('sada-interested'); return s?new Set(JSON.parse(s)):new Set(); } catch { return new Set(); } });
  // hiddenIds — items the user dismissed via the down-arrow (غير مهم).
  // They get filtered out of allFeed and never re-appear, even on refetch
  // (the filter runs after the API response is merged into displayed feed).
  // Persisted to localStorage so dismissals survive reload.
  const [hiddenIds, setHiddenIds] = useState(() => { try { const s=localStorage.getItem('sada-hidden'); return s?new Set(JSON.parse(s)):new Set(); } catch { return new Set(); } });
  const toggleHide = useCallback((item) => {
    setHiddenIds(prev => {
      const next = new Set(prev);
      next.add(item.id);
      try { localStorage.setItem('sada-hidden', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);
  const toggleInterest = useCallback((item) => {
    const id = item.id;
    setInterestedIds(prev => {
      const next = new Set(prev);
      const adding = !next.has(id);
      adding ? next.add(id) : next.delete(id);
      try { localStorage.setItem('sada-interested', JSON.stringify([...next])); } catch {}
      // Update tag weights
      setInterests(prevInt => {
        const tags = (item.tags||[]).concat(item.tag ? [item.tag] : []).filter(Boolean);
        const updated = { ...prevInt };
        tags.forEach(t => { updated[t] = (updated[t]||0) + (adding ? 1 : -1); if(updated[t]<=0) delete updated[t]; });
        try { localStorage.setItem('sada-interests', JSON.stringify(updated)); } catch {}
        return updated;
      });
      return next;
    });
  }, []);

  // Source toggles
  // Source toggle state is keyed by source ID (string), not array index.
  // Indexes shift whenever a source is added/removed from sources.js, which
  // silently re-mutes the wrong outlets — that bit users on 2026-04-17.
  // We migrate the legacy 'sada-sources' (index-keyed) into the new
  // 'sada-sources-v2' (id-keyed) on first load, then delete the legacy key.
  useEffect(() => {
    try {
      const v2 = localStorage.getItem('sada-sources-v2');
      if (v2) { setSources(JSON.parse(v2)); return; }
      const legacy = localStorage.getItem('sada-sources');
      if (legacy) {
        // Best-effort migration: if the index-keyed map matches the current
        // SOURCES array length, translate index → id; otherwise drop it
        // (indices have shifted and we cannot recover the original mapping).
        const obj = JSON.parse(legacy);
        const migrated = {};
        const keys = Object.keys(obj).map(k => parseInt(k, 10)).filter(k => !Number.isNaN(k));
        const maxIdx = keys.length ? Math.max(...keys) : -1;
        if (maxIdx < SOURCES.length) {
          for (const k of keys) {
            const sid = SOURCES[k]?.id;
            if (sid && obj[k] === false) migrated[sid] = false;
          }
        }
        setSources(migrated);
        localStorage.setItem('sada-sources-v2', JSON.stringify(migrated));
        localStorage.removeItem('sada-sources');
      }
    } catch {}
  }, []);
  const toggleSource = useCallback(id => {
    setSources(prev => {
      const next = { ...prev, [id]: prev[id] === false ? true : false };
      try { localStorage.setItem('sada-sources-v2', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // Live feed
  // Three independent feed hooks — each vertical has its own data pipeline.
  // radarOverrides (admin pin/hide/add decisions for the trending radar)
  // flow only through the `news` vertical response, since fetchAdminLayer
  // in functions/api/feeds.js only runs for kind=news. It's global state,
  // not per-vertical, so the news feed is a fine carrier.
  // Poll cadence stretched 6s → 12s on 2026-04-18 to relieve render pressure.
  // The KV cache TTL is 15s so polling faster than that is mostly wasted
  // bandwidth + render churn. Radar (30s) and map (30s) already slower.
  const { feed:liveFeed, loading, isLive, refresh, radarOverrides, pendingCount, flushPending, ackNewItems, lastFetchAt } = useNews([], 'news', 12000, isAtTopRef);
  const { feed:mapFeed } = useNews([], 'map', 30000);
  const { feed:radarFeed, refresh:radarRefresh } = useNews([], 'radar', 30000);
  // X-style buffered feed: useNews owns the new-items detector. It
  // accumulates new items into a `pendingFeed` buffer (exposed here as
  // `pendingCount`) instead of merging them into the displayed feed in
  // real-time. The displayed feed only updates when the user explicitly
  // calls `flushPending()` — via the floating pill, the refresh button,
  // or pull-to-refresh. This eliminates the "items shifting under your
  // finger" flicker and matches the X / Twitter pattern.

  // 1-second ticker — re-renders just enough to update the 'آخر تحديث: منذ X ث'
  // counter in the live indicator. Without this, during quiet periods (no new
  // items) the user sees no visible activity at all and assumes the feed has
  // stopped. The ticker is cheap: one setState per second, and only the live
  // indicator div recomputes from it (not the feed list).
  const [_tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // When the user scrolls back to the top of the feed, flush the hidden
  // buffer into the displayed feed so they immediately see whatever piled up
  // while they were scrolled. They went to the top because they want the
  // latest — give it to them without making them tap the pill. The polling
  // closure inside useNews will also auto-merge on subsequent silent polls
  // because isAtTopRef.current is now true; this just covers the gap between
  // 'reached top' and 'next poll fires.'
  useEffect(() => {
    if (isAtTop && pendingCount > 0) flushPending();
  }, [isAtTop, pendingCount, flushPending]);

  // Scroll anchoring — used only when the displayed feed mutates while the
  // user is scrolled. With the X-style buffered architecture, this only
  // happens on explicit flush (pill tap, refresh). The pill scrolls to top
  // anyway so anchor isn't critical there; we keep the effect as a safety
  // net for the rare paths that DO mutate while scrolled (e.g. items added
  // by tab-visibility refresh while user happens to be scrolled).
  //
  // Pattern: pin to the first visible post element by data-id. After the
  // mutation, find it again and compensate scrollTop by the offset delta.
  // Robust against items added above, removed below, or images loading
  // late. CSS overflow-anchor:auto handles the modern Chrome/Firefox path;
  // this JS layer covers Safari + edge cases.
  const anchorRef = useRef(null);
  useLayoutEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const saved = anchorRef.current;
    if (saved && el.scrollTop > 120) {
      const node = el.querySelector(`[data-id="${CSS.escape(saved.id)}"]`);
      if (node) {
        const containerTop = el.getBoundingClientRect().top;
        const newRelTop = node.getBoundingClientRect().top - containerTop;
        const delta = newRelTop - saved.top;
        if (Math.abs(delta) > 1) el.scrollTop = el.scrollTop + delta;
      }
    }
    const containerTop = el.getBoundingClientRect().top;
    const items = el.querySelectorAll('[data-id]');
    let next = null;
    for (const item of items) {
      const relTop = item.getBoundingClientRect().top - containerTop;
      if (relTop >= 0) { next = { id: item.dataset.id, top: relTop }; break; }
    }
    anchorRef.current = next;
  }, [liveFeed]);
  const secsSinceFetch = lastFetchAt ? Math.floor((Date.now() - lastFetchAt) / 1000) : null;
  const freshnessLabel = secsSinceFetch === null ? '' :
    secsSinceFetch < 5 ? 'الآن' :
    secsSinceFetch < 60 ? `منذ ${secsSinceFetch} ث` :
    `منذ ${Math.floor(secsSinceFetch / 60)} د`;

  // Bottom-nav indicator pulses — every 60s each indicator fires 3 quick blips
  // in sync with its CSS animation. Map is offset 30s from radar so the two
  // indicators alternate (you hear something every 30s instead of overlapping).
  // First sequence fires a few seconds after mount so the audio context has a
  // chance to unlock from a user interaction.
  useEffect(() => {
    const radarTriple = () => {
      try { Sound.radarBlip(); } catch {}
      setTimeout(() => { try { Sound.radarBlip(); } catch {} }, 1200);
      setTimeout(() => { try { Sound.radarBlip(); } catch {} }, 2400);
    };
    const mapTriple = () => {
      try { Sound.mapBlip(); } catch {}
      setTimeout(() => { try { Sound.mapBlip(); } catch {} }, 1200);
      setTimeout(() => { try { Sound.mapBlip(); } catch {} }, 2400);
    };
    const radarInitial = setTimeout(radarTriple, 3000);   // first radar at +3s
    const mapInitial   = setTimeout(mapTriple,  33000);   // first map  at +33s
    const radarInterval = setInterval(radarTriple, 60000);
    const mapInterval   = setInterval(mapTriple,  60000);
    return () => {
      clearTimeout(radarInitial); clearTimeout(mapInitial);
      clearInterval(radarInterval); clearInterval(mapInterval);
    };
  }, []);



  // Pull-to-refresh & infinite scroll
  // refreshMsg / setRefreshMsg removed from destructure — no UI consumes them
  // anymore (the post-refresh toast was deleted; the pill + live indicator
  // already convey freshness state).
  const { pullY, refreshing, onTouchStart, onTouchMove, onTouchEnd, PULL_THRESHOLD } = usePullToRefresh(contentRef, refresh);

  // Refresh button handler — silent. The pill + live indicator already
  // convey state (the previous toast was redundant noise per UI cleanup).
  const handleHeaderRefresh = useCallback(async () => {
    // Scroll to top first so the user sees the refresh land at item 0,
    // not somewhere mid-feed where they happened to be reading.
    contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      await refresh();
    } catch {}
  }, [refresh]);
  // Cap raised 200 → 1200: the API now serves up to 500 items per kind
  // and previously items 201+ were silently unreachable no matter how
  // far the user scrolled. 1200 leaves headroom for future API growth
  // without rendering everything up-front (initial slice still 20).
  const { visibleCount, onScroll } = useInfiniteScroll(20, 15, 1200, feedTab);

  // Shared transform: raw API items → client-side items with tags, flags, briefs
  const transformFeed = useCallback((rawFeed) => rawFeed.map((item, i) => {
    const text = ((item.title||'')+' '+(item.body||'')).toLowerCase();
    const detectedTopics = TOPICS.filter(t =>
      (TOPIC_KEYWORDS[t.id]||[]).some(kw => text.includes(kw))
    ).slice(0,2).map(t => t.label);
    const apiCats = (item.categories||[]).filter(c => c && c !== 'عاجل');
    const norm = s => s.toLowerCase().trim();
    const raw = [...apiCats, ...detectedTopics];
    const allTags = [];
    for (const t of raw) {
      if (!t) continue;
      const tn = norm(t);
      const dupIdx = allTags.findIndex(k => {
        const kn = norm(k);
        return kn === tn || kn.includes(tn) || tn.includes(kn);
      });
      if (dupIdx === -1) {
        allTags.push(t);
      } else if (t.length > allTags[dupIdx].length) {
        allTags[dupIdx] = t;
      }
      if (allTags.length >= 3) break;
    }
    const sid = item.source?.id;
    const srcMeta = sid ? SOURCES.find(x => x.id === sid) : null;
    return {
      id: item.id||`i-${i}`, s: { n:item.source?.name||'مصدر', i:item.source?.initial||'؟', id:sid, domain:srcMeta?.domain, logo:srcMeta?.logo, tier:item.source?.tier },
      t: item.time||'الآن', pubTs: item.timestamp || (Date.now() - i*60000),
      title: item.title,
      body: ((b) => { if (!b) return null; return b.replace(/https?:\/\/\S+/g,'').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim().slice(0,1800)||null; })(item.body),
      brief: ((b) => { if (!b) return null; b=b.replace(/https?:\/\/\S+/g,'').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim(); if (b.length<=180) return b||null; const sub=b.slice(0,180); const sent=Math.max(sub.lastIndexOf('. '),sub.lastIndexOf('، '),sub.lastIndexOf(', ')); if (sent>60) return b.slice(0,sent+1).trim()||null; return null; })(item.body),
      realImg: item.image||null, link: item.link,
      tag: item.categories?.[0]||null, tags: allTags,
      brk: item.categories?.[0]==='عاجل'||!!item.title?.includes('عاجل'),
      flags: detectFlags(`${item.title || ''} ${item.body || ''}`),
      _new: !!item._new,
    };
  }), []);

  // Transform all three feed pools.
  // Identity-stable memo: skip recomputation when the item-id set hasn't
  // changed. Without this, every poll allocated 800+ fresh objects and
  // cascaded a full re-render through sourcedFeed → displayFeed → list,
  // even when the API returned the same items. Added 2026-04-18 as part
  // of the slowness fix.
  const allFeedRef = useRef(null);
  const allFeedKeyRef = useRef('');
  const allFeed = useMemo(() => {
    const key = liveFeed.length + ':' + (liveFeed[0]?.id || '') + ':' + (liveFeed[liveFeed.length - 1]?.id || '');
    if (key === allFeedKeyRef.current && allFeedRef.current) return allFeedRef.current;
    const next = transformFeed(liveFeed);
    allFeedRef.current = next;
    allFeedKeyRef.current = key;
    return next;
  }, [liveFeed, transformFeed]);
  const mapItems = useMemo(() => transformFeed(mapFeed), [mapFeed, transformFeed]);
  const radarItems = useMemo(() => transformFeed(radarFeed), [radarFeed, transformFeed]);

  // Deep link: open shared article from ?article=ID
  const deepLinkHandled = useRef(false);
  useEffect(() => {
    if (deepLinkHandled.current || !allFeed.length) return;
    const params = new URLSearchParams(window.location.search);
    const articleId = params.get('article');
    if (articleId) {
      const found = allFeed.find(f => f.id === articleId);
      if (found) { deepLinkHandled.current = true; setArticle(found); window.history.replaceState({}, '', '/'); }
    }
  }, [allFeed]);

  // Trending topics — recalculate every minute (recency-aware extractor)
  const [trendTick, setTrendTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTrendTick(t => t + 1), 60000);
    return () => clearInterval(id);
  }, []);

  // Apply admin pin/hide/add decisions on top of a trending list.
  //   hide → drop the word entirely
  //   pin  → remove from wherever it sits, prepend at the front with pinned:true
  //   add  → append at the end if not already present
  // Idempotent — safe to call pre- and post-cluster. Pinned entries reuse
  // the organic count/score if the word was already in the list, otherwise
  // synthesize minimal fields from the override weight.
  const applyRadarOverrides = useCallback((list, overrides) => {
    if (!list) return [];
    if (!overrides?.length) return list;
    const hidden = new Set();
    const pinnedByWord = new Map();
    const addedByWord = new Map();
    for (const o of overrides) {
      if (o.action === 'hide') hidden.add(o.word);
      else if (o.action === 'pin') pinnedByWord.set(o.word, o);
      else if (o.action === 'add') addedByWord.set(o.word, o);
    }
    const afterHide = hidden.size ? list.filter(t => t.word && !hidden.has(t.word)) : list.slice();
    const organic = pinnedByWord.size ? afterHide.filter(t => !pinnedByWord.has(t.word)) : afterHide;
    const pinnedList = [];
    for (const [word, o] of pinnedByWord) {
      const existing = afterHide.find(t => t.word === word);
      pinnedList.push(existing
        ? { ...existing, pinned: true }
        : { word, count: o.weight || 5, score: o.weight || 5, velocity: 0, type: 'other', pinned: true, manual: true }
      );
    }
    const present = new Set([...pinnedList.map(t => t.word), ...organic.map(t => t.word)]);
    const addedList = [];
    for (const [word, o] of addedByWord) {
      if (present.has(word) || hidden.has(word)) continue;
      addedList.push({ word, count: o.weight || 5, score: o.weight || 5, velocity: 0, type: 'other', manual: true });
    }
    return [...pinnedList, ...organic, ...addedList];
  }, []);

  // Raw trending: pure rules pass, then admin overrides layered on top.
  // Shows immediately while the AI cluster step runs in the background.
  // Radar trending uses its own dedicated feed (70% Arab + 30% global)
  const rawTrending = useMemo(
    () => applyRadarOverrides(
      extractTrending(radarItems.length ? radarItems : allFeed),
      radarOverrides
    ),
    [trendTick, radarItems.length, allFeed.length, radarOverrides, applyRadarOverrides]
  );
  // Clustered trending: AI-merged version. Updates when /api/cluster returns.
  const [trending, setTrending] = useState([]);
  useEffect(() => {
    if (!rawTrending.length) { setTrending([]); return; }
    // Show raw immediately so the radar isn't blank while AI thinks
    setTrending(rawTrending);
    let cancelled = false;
    fetch('/api/cluster', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topics: rawTrending.map(t => t.word) })
    })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data || !Array.isArray(data.groups) || !data.groups.length) return;
        const wordToEntry = Object.fromEntries(rawTrending.map(t => [t.word, t]));
        // Type priority: persons first, then countries, then orgs/events/other
        const TYPE_RANK = { person: 0, country: 1, org: 2, event: 3, other: 4 };
        const merged = data.groups.map(group => {
          // Accept both { topics, type } and bare-array forms
          const topicWords = Array.isArray(group) ? group : (group.topics || []);
          const type = (group && group.type) || 'other';
          const entries = topicWords.map(w => wordToEntry[w]).filter(Boolean);
          if (!entries.length) return null;
          // Pick canonical: prefer noun forms (no ـية), then highest count
          entries.sort((a, b) => {
            const aAdj = a.word.endsWith('ية') ? 1 : 0;
            const bAdj = b.word.endsWith('ية') ? 1 : 0;
            if (aAdj !== bAdj) return aAdj - bAdj;
            return b.count - a.count;
          });
          const canonical = entries[0];
          return {
            word: canonical.word,
            count: entries.reduce((s, e) => s + e.count, 0),
            score: entries.reduce((s, e) => s + e.score, 0),
            velocity: Math.max(...entries.map(e => e.velocity || 0)),
            type,
            aliases: entries.length > 1 ? entries.map(e => e.word) : undefined,
          };
        }).filter(Boolean).sort((a, b) => {
          // Strict type tier first, then score within tier
          const ar = TYPE_RANK[a.type] ?? 4;
          const br = TYPE_RANK[b.type] ?? 4;
          if (ar !== br) return ar - br;
          return b.score - a.score;
        });
        // Re-apply admin overrides after clustering — the cluster step
        // reconstructs entries from scratch (dropping pinned flags) and may
        // absorb pinned words into type-tier groups, so we need to re-pull
        // them to the front and re-inject manual adds.
        setTrending(applyRadarOverrides(merged, radarOverrides));
      })
      .catch(() => {/* keep raw on failure */});
    return () => { cancelled = true; };
  }, [rawTrending, radarOverrides, applyRadarOverrides]);

  // Filter by enabled sources
  // Filter out: (a) sources the user muted, (b) individual items the user
  // dismissed via the down-arrow. Hidden items never re-appear, even after
  // the API re-merges them.
  const sourcedFeed = allFeed.filter(item => {
    if (hiddenIds.has(item.id)) return false;
    const sid = item.s?.id;
    return !sid || sources[sid] !== false;
  });
  const userTopics = userPrefs.topics||[];

  // Client-side flagship boost REMOVED per user request — pure recency only.
  // Previously this function (applyFlagshipBoost) splice-inserted AJ, Al
  // Arabiya, BBC, Asharq News, Sky News, and Aawsat into position 4 of the
  // feed if they weren't already in the top 12, even when their newest item
  // was hours older than the surrounding fresh content. That's why a 3h35m
  // BBC item was appearing above a 1h10m Al Arabiya item — the BBC item was
  // pinned. Removed entirely; flagships now compete on recency like every
  // other source. (The matching server-side flagship boost in feeds.js was
  // already removed in an earlier commit.)
  const applyFlagshipBoost = useCallback((pool) => pool, []);

  // Build display feed based on active tab — each tab shows genuinely different content
  const displayFeed = useMemo(() => {
    let pool = [...sourcedFeed].sort((a,b) => (b.pubTs||0) - (a.pubTs||0));
    pool = applyFlagshipBoost(pool);
    // Source filter overrides tab logic — show all articles from that source
    if(activeSource) return pool.filter(item => item.s?.n === activeSource);
    if(feedTab==='now'){
      return pool.filter(item => !isOpinionOrSentimental(item));
    }
    if(feedTab==='important'){
      const hasInterests = Object.keys(interests).length > 0;
      // Personalized path — score by topics + learned interests
      if(userTopics.length>0 || hasInterests){
        const scored = pool.map(item=>({...item,_score:scoreByTopics(item,userTopics,interests)})).filter(i=>i._score>0).sort((a,b)=>b._score-a._score||(b.pubTs||0)-(a.pubTs||0));
        if(scored.length>0) return scored;
        // fall through to the editorial default if scoring returned nothing
      }
      // Editorial default — when the user hasn't trained the engine yet
      // (or their picks produced zero matches), surface the universally
      // "important" slice: tier-1 flagships + analytical/investigative
      // pieces, sorted by recency. Anything is better than an empty tab
      // with a "tap يهمني on news" instruction the user hasn't seen yet.
      const importantPool = pool.filter(item =>
        item.s?.tier === 1 || isDeepInvestigative(item)
      );
      return importantPool.length > 0 ? importantPool : pool;
    }
    return pool;
  }, [feedTab, sourcedFeed, userTopics.join(','), activeSource, interests]);

  // Reactions — batch fetch for visible articles
  const visibleIds = useMemo(() => displayFeed.slice(0, visibleCount).map(f => f.id), [displayFeed, visibleCount]);
  const { counts: reactionCounts, userReactions, toggleReaction, incrementCommentCount } = useReactions(visibleIds, auth.user?.id);
  const handleToggleReaction = useCallback((articleId, type) => {
    toggleReaction(articleId, type).then(wasLoggedIn => {
      if (!wasLoggedIn) setShowAuth(true);
    });
  }, [toggleReaction]);
  const handleComment = useCallback((item) => { setCommentArticle(item); }, []);

  // Navigation — radar is the center button (index 2 of 5), styled bigger.
  // RTL flex order: index 0 = rightmost, index 4 = leftmost.
  // So map (index 1) sits visually to the right of radar, depth (index 3) to its left.
  // The 'depth' slot is where the photos feature used to live. It now opens
  // the Basira vertical — long-form analytical studies for deep readers.
  const navItems = [
    { id:'home', label:'الرئيسية', icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.home(f)}<span className="home-dot" style={{position:'absolute',top:-1,right:-2,width:9,height:9,borderRadius:'50%',background:'var(--or)',border:'2px solid var(--bg)'}}/></span> },
    { id:'map',  label:'خريطة',    icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.map(f)}<span className="map-dot" style={{position:'absolute',top:0,right:-1,width:9,height:9,borderRadius:'50%',background:'var(--bl)',border:'2px solid var(--bg)'}}/></span> },
    { id:'radar',label:'رادار',    center:true, icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.radar(f)}<span className="radar-dot" style={{position:'absolute',top:-1,right:-2,width:10,height:10,borderRadius:'50%',background:'var(--or)',border:'2px solid var(--bg)'}}/></span> },
    { id:'depth',label:'دراسات',   icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.depth(f)}<span className="depth-dot" style={{position:'absolute',top:-1,right:-2,width:9,height:9,borderRadius:'50%',background:'var(--t3)',border:'2px solid var(--bg)'}}/></span> },
    { id:'settings',label:'الإعدادات',icon:()=>auth.isLoggedIn?<div style={{width:22,height:22,borderRadius:'50%',background:'var(--rd)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#fff'}}>{(auth.profile?.display_name||'?')[0]}</div>:I.user()},
  ];

  const resetPrefs = () => {
    const defaults = { topics: [], regions: ['gulf'], sources: ['aljazeera','alarabiya','bbc','asharq_news','skynews'] };
    try { localStorage.setItem('sada-prefs', JSON.stringify(defaults)); } catch {}
    setUserPrefs(defaults);
  };
  const updatePrefs = (next) => {
    setUserPrefs(next);
    try { localStorage.setItem('sada-prefs', JSON.stringify(next)); } catch {}
  };

  return (
    <div className="app">
      {/* Header */}
      {nav!=='radar'&&nav!=='admin'&&nav!=='map'&&<div className={`hdr${barsHidden?' hdr-hide':''}`}>
        <div className="hdr-top">
          <div className="logo"><span className="logo-icon">غ</span>غرفة الأخبار</div>
          <div className="hdr-r">
            <button className="ib" onClick={()=>{Sound.tap();setSrch(true);}}>{I.search()}</button>
            <button className="ib" onClick={handleHeaderRefresh}>{I.globe()}</button>
            <button className={`ib ${allFeed.some(f=>f.pubTs>seenTs)?'ndot':''}`} onClick={()=>{Sound.tap();setNotifs(true); const now=Date.now(); setSeenTs(now); try{localStorage.setItem('sada-seen-ts',String(now));}catch{}; }}>{I.bell()}</button>
          </div>
        </div>
        {nav==='home'&&(<div className="tabs">{[{id:'now',l:'هنا والآن'},{id:'important',l:'مهم'}].map(t=>(<button key={t.id} className={`tab ${feedTab===t.id?'on':''}`} onClick={()=>{Sound.tap();setFeedTab(t.id);setActiveSource(null);}}>{t.l}</button>))}</div>)}
        {nav!=='home'&&nav!=='depth'&&(<div style={{ padding:'0 20px 12px',fontSize:20,fontWeight:800,color:'var(--bk)',borderBottom:'.5px solid var(--g1)' }}>{nav==='saved'&&'المحفوظات'}{nav==='settings'&&'الإعدادات'}{nav==='map'&&'خريطة الأخبار'}</div>)}
      </div>}

      {/* Main content */}
      <div className={`content${(nav==='radar'||nav==='map')?' content-full':''}`} ref={contentRef} onScroll={(e)=>{onScroll(e);handleScroll();}}
        onTouchStart={nav==='home'?onTouchStart:undefined}
        onTouchMove={nav==='home'?onTouchMove:undefined}
        onTouchEnd={nav==='home'?onTouchEnd:undefined}>

        {nav==='home'&&(<>
          {/* Refresh-act UI removed per design (pull-to-refresh indicator
              + post-refresh toast). The auto-poll in useNews keeps the
              feed fresh silently; the visual "refreshing…" theatre was
              misleading because the user couldn't tell when (or whether)
              new items had actually arrived. */}

          {/* Refresh pill removed per user — JSX deleted, but ALL the
              underlying logic is preserved untouched: useNews still
              tracks pendingCount + flushPending, App.jsx still auto-
              flushes when the user reaches the top, the live indicator
              still shows '· N جديد' for trickle updates, the refresh
              button + pull-to-refresh still call flushPending. Only the
              floating orange notification chip is gone. */}

          {/* Live indicator */}
          {isLive&&(
            <div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'5px 0',fontSize:11,color:'var(--t4)' }}>
              <div className="live-dot"/>
              <span>أخبار مباشرة</span>
              {freshnessLabel && <span style={{ opacity:.7 }}>· تحديث {freshnessLabel}</span>}
              {pendingCount>0 && pendingCount<5 && (
                <span style={{ opacity:.7 }}>· {pendingCount} جديد</span>
              )}
            </div>
          )}

          {/* Breaking news ticker — removed per design */}

          {/* Source stories */}
          <div className={`stories${activeSource?' stories-filtering':''}`}>{(() => {
            const allSources = SOURCES.filter(s => !s.photoOnly && !s.id?.startsWith('gnews_') && !s.hideFromStrip);
            // Always show the source the user has actively filtered to,
            // even if it's beyond the 20-pill cutoff — otherwise tapping
            // a source from the expanded view would seemingly disappear
            // when the strip collapses back.
            const visible = showAllSources
              ? allSources
              : (() => {
                  const head = allSources.slice(0, 20);
                  if (activeSource && !head.some(s => s.n === activeSource)) {
                    const extra = allSources.find(s => s.n === activeSource);
                    if (extra) head.push(extra);
                  }
                  return head;
                })();
            const hidden = allSources.length - visible.length;
            const pills = visible.map((s, i) => {
              const logoSrc = s.logo || (s.domain ? `https://www.google.com/s2/favicons?domain=${s.domain}&sz=128` : null);
              const isActive = activeSource === s.n;
              const isDim = activeSource && !isActive;
              return (
                <div className={`story${isActive?' s-active':''}${isDim?' s-dim':''}`} key={s.id || i}
                  onClick={() => { Sound.tap(); setActiveSource(prev => prev===s.n?null:s.n); contentRef.current?.scrollTo({top:0,behavior:'smooth'}); }}>
                  <div className={`s-ring ${isActive?'':'seen'}`}>
                    <div className="s-av">
                      {!logoSrc && <span className="s-av-letter">{s.i}</span>}
                      {logoSrc && <img className={`s-av-logo${s.logo?' s-av-logo-raw':''}${s.tint?' s-av-logo-'+s.tint:''}`} src={logoSrc} alt="" loading="lazy" onError={e=>{e.currentTarget.outerHTML='<span class="s-av-letter">'+s.i.replace(/[<>&"]/g,'')+'</span>';}}/>}
                    </div>
                  </div>
                  <div className="s-nm">{s.n}</div>
                </div>
              );
            });
            // "+المزيد" / "تقليص" toggle pill at the end of the strip.
            if (hidden > 0 || showAllSources) {
              pills.push(
                <div className="story" key="__more__" onClick={() => { Sound.tap(); setShowAllSources(v => !v); }}>
                  <div className="s-ring seen"><div className="s-av"><span className="s-av-letter" style={{ fontSize:11 }}>{showAllSources ? '−' : '+'}</span></div></div>
                  <div className="s-nm">{showAllSources ? 'تقليص' : `+${hidden}`}</div>
                </div>
              );
            }
            return pills;
          })()}</div>
          {activeSource&&(<div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',background:'var(--f1)',borderBottom:'.5px solid var(--g1)' }}><span style={{ fontSize:13,fontWeight:700,color:'var(--t1)' }}>أخبار {activeSource}</span><button onClick={()=>setActiveSource(null)} style={{ fontSize:12,fontWeight:600,color:'var(--t3)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>عرض الكل ✕</button></div>)}


          {/* Tab-specific headers */}
          {feedTab==='important'&&userTopics.length>0&&(<div className="topic-bar"><span style={{ fontSize:11,color:'var(--t4)',fontWeight:700,whiteSpace:'nowrap',flexShrink:0 }}>يُصفَّح حسب:</span>{userTopics.map(id=>{ const t=TOPICS.find(x=>x.id===id); return t?<span key={id} className="topic-pill on">{t.icon} {t.label}</span>:null; })}</div>)}
          {feedTab==='important'&&userTopics.length===0&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)',display:'flex',justifyContent:'space-between',alignItems:'center' }}><span>لم تختر اهتمامات بعد — يُرتَّب حسب التفاعل</span><button onClick={()=>setNav('settings')} style={{ fontSize:11,fontWeight:700,color:'var(--bk)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>اضبط ▸</button></div>)}

          {/* Feed */}
          {loading&&!refreshing&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>جاري تحميل الأخبار…</div>}
          {!loading&&displayFeed.length===0&&feedTab==='important'&&userTopics.length===0&&Object.keys(interests).length===0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>اضغط "يهمني" على الأخبار لتعليم التطبيق ما يهمك</div>}
          {!loading&&displayFeed.length===0&&feedTab==='important'&&userTopics.length>0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار تطابق اهتماماتك حالياً</div>}
          {!loading&&displayFeed.length===0&&feedTab==='now'&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار عاجلة حالياً</div>}
          {!loading&&(()=>{const raw=displayFeed.slice(0,visibleCount);const {items:slice,emgMap}=reorderWithClusters(raw);return slice.map((item,i)=>(<Post key={`${item.id}-${i}`} item={item} delay={i<20?i*.04:0} emg={emgMap.get(item.id)} onOpen={setArticle} onSave={toggleSave} isSaved={savedIds.has(item.id)} onInterest={toggleInterest} isInterested={interestedIds.has(item.id)} onHide={toggleHide} onSelectSource={(name)=>{Sound.tap();setActiveSource(prev=>prev===name?null:name);contentRef.current?.scrollTo({top:0,behavior:'smooth'});}} showImg={i>=4&&i%4!==3}/>));})()}
          {!loading&&visibleCount<displayFeed.length&&(<div className="load-more"><div className="spinner" style={{ width:18,height:18,border:'2px solid var(--g2)',borderTopColor:'var(--t3)',borderRadius:'50%',animation:'spin .6s linear infinite',margin:'0 auto' }}/></div>)}
          <div style={{ height:20 }}/>
        </>)}

        {nav==='radar'   && <RadarView trending={trending} allFeed={radarItems.length ? radarItems : allFeed} onOpenArticle={setArticle} onClose={()=>{Sound.close();setNav('home');}} onRefresh={radarRefresh || refresh} refreshing={loading}/>}
        {nav==='depth'   && <DepthFeed onOpen={setDepthDoc}/>}
        {nav==='map'     && <NewsMap onClose={()=>setNav('home')} liveFeed={allFeed}/>}
        {nav==='saved'   && <BookmarksView savedIds={savedIds} onOpen={setArticle} allFeed={allFeed}/>}
        {nav==='settings'&& <SettingsView sources={sources} toggleSource={toggleSource} userPrefs={userPrefs} onUpdatePrefs={updatePrefs} onResetPrefs={resetPrefs} theme={theme} toggleTheme={toggleTheme} auth={auth} onOpenAuth={()=>setShowAuth(true)} onOpenProfile={()=>setShowProfile(true)} onOpenAdmin={()=>setNav('admin')}/>}
        {nav==='admin'   && <AdminPanel onClose={()=>setNav('settings')}/>}
      </div>

      {/* Bottom nav */}
      {nav!=='radar'&&nav!=='admin'&&nav!=='map'&&<div className={`bnav${barsHidden?' bnav-hide':''}`}>{navItems.map(item=>(<button key={item.id} aria-label={item.label} className={`bnav-item ${item.center?'bnav-center':''} ${nav===item.id?'on':''}`} onClick={()=>{
        Sound.tap();
        // If user taps the same nav button they're already on (specifically
        // home → home), treat it as 'jump to top of this surface' — the
        // standard mobile pattern (Twitter, Instagram, etc.). Without this,
        // the tap is a silent no-op.
        if (nav === item.id) {
          if (item.id === 'home') {
            contentRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
            // If items piled up while scrolled, surface them now too.
            if (pendingCount > 0) flushPending();
          }
          return;
        }
        setNav(item.id);
      }}><span className="bnav-icon">{item.icon(false)}</span></button>))}</div>}

      {/* Overlays */}
      {article&&<ArticleDetail article={article} onClose={()=>{Sound.close();setArticle(null);}} onSave={toggleSave} isSaved={savedIds.has(article.id)} reactionCounts={reactionCounts[article.id]} userReactions={userReactions[article.id]} onToggleReaction={handleToggleReaction} commentCount={reactionCounts[article.id]?.comment||0} onComment={handleComment} onOpenRelated={(r)=>{setArticle(null);setTimeout(()=>setArticle(r),50);}} onOpenRadar={(tag)=>{setArticle(null);setNav('radar');}} relatedArticles={allFeed}/>}
      {depthDoc&&<DepthDetail doc={depthDoc} onClose={()=>{Sound.close();setDepthDoc(null);}}/>}
      {srch&&<SearchView onClose={()=>{Sound.close();setSrch(false);}} feed={allFeed} onOpen={setArticle} onOpenProfile={id=>{ setSrch(false); setProfileUserId(id); }}/>}
      {notifs&&<NotificationPanel allFeed={allFeed} onClose={()=>{Sound.close();setNotifs(false);}} onOpen={setArticle}/>}
      {commentArticle&&<CommentSheet articleId={commentArticle.id} onClose={()=>setCommentArticle(null)} onOpenAuth={()=>setShowAuth(true)} onCommentAdded={()=>incrementCommentCount(commentArticle.id)} onCommentRemoved={()=>incrementCommentCount(commentArticle.id,-1)}/>}
      {profileUserId&&<UserProfile userId={profileUserId} onClose={()=>setProfileUserId(null)} onOpenAuth={()=>setShowAuth(true)}/>}
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onSuccess={()=>setShowAuth(false)}/>}
      {showProfile&&<ProfileSetup onClose={()=>setShowProfile(false)}/>}
    </div>
  );
}
