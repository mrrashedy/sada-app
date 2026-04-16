import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { scoreByTopics, isOpinionOrSentimental } from './lib/filters';
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

export default function Sada() {
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
  const [newCount, setNewCount] = useState(0);
  const prevLen                 = useRef(0);
  const prevIds                 = useRef(new Set()); // tracks ids we've already shown — replaces broken length-based new-detection
  const contentRef              = useRef(null);
  const lastScrollY             = useRef(0);
  const [barsHidden, setBarsHidden] = useState(false);
  const handleScroll = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const y = el.scrollTop;
    const delta = y - lastScrollY.current;
    if (delta > 8) setBarsHidden(true);       // scrolling down → hide
    else if (delta < -8) setBarsHidden(false); // scrolling up → show
    lastScrollY.current = y;
  }, []);

  // Bookmarks
  const [savedIds, setSavedIds] = useState(() => { try { const s=localStorage.getItem('sada-bookmarks'); return s?new Set(JSON.parse(s)):new Set(); } catch { return new Set(); } });
  const toggleSave = useCallback(id => { setSavedIds(prev => { const next=new Set(prev); next.has(id)?next.delete(id):next.add(id); try { localStorage.setItem('sada-bookmarks',JSON.stringify([...next])); } catch {} return next; }); }, []);

  // Learned interests — tags the user cares about, with weights
  const [interests, setInterests] = useState(() => { try { return JSON.parse(localStorage.getItem('sada-interests')||'{}'); } catch { return {}; } });
  const [interestedIds, setInterestedIds] = useState(() => { try { const s=localStorage.getItem('sada-interested'); return s?new Set(JSON.parse(s)):new Set(); } catch { return new Set(); } });
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
  useEffect(() => { try { const s=localStorage.getItem('sada-sources'); if(s) setSources(JSON.parse(s)); } catch {} }, []);
  const toggleSource = useCallback(i => { setSources(prev => { const next={...prev,[i]:prev[i]===false?true:false}; try { localStorage.setItem('sada-sources',JSON.stringify(next)); } catch {} return next; }); }, []);

  // Live feed
  // Three independent feed hooks — each vertical has its own data pipeline.
  // radarOverrides (admin pin/hide/add decisions for the trending radar)
  // flow only through the `news` vertical response, since fetchAdminLayer
  // in functions/api/feeds.js only runs for kind=news. It's global state,
  // not per-vertical, so the news feed is a fine carrier.
  const { feed:liveFeed, loading, isLive, refresh, radarOverrides } = useNews([], 'news', 6000);
  const { feed:mapFeed } = useNews([], 'map', 30000);
  const { feed:radarFeed, refresh:radarRefresh } = useNews([], 'radar', 30000);
  // New-items detector — counts items with IDs we haven't shown before.
  // The previous length-based version was broken once the feed reached its
  // 500-item cap (length stops growing even as new items pour in), which is
  // why new items arrived silently with no pill / no notification ping —
  // the feed felt "dead" even when it was updating every 6 seconds.
  // Now we diff item IDs against a remembered set: anything new gets counted,
  // pills the floating "↑ N خبر جديد" banner, and pings the notify sound.
  useEffect(() => {
    if (liveFeed.length === 0) return;
    const currentIds = new Set(liveFeed.map(f => f.id));
    if (prevIds.current.size === 0) {
      // First load — just remember the IDs, don't count them as "new".
      prevIds.current = currentIds;
      prevLen.current = liveFeed.length;
      return;
    }
    let added = 0;
    for (const id of currentIds) if (!prevIds.current.has(id)) added++;
    if (added > 0) {
      setNewCount(prev => prev + added);
      Sound.notify();
      setTimeout(() => setNewCount(0), 8000);
    }
    prevIds.current = currentIds;
    prevLen.current = liveFeed.length;
  }, [liveFeed]);

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
  const { pullY, refreshing, refreshMsg, setRefreshMsg, onTouchStart, onTouchMove, onTouchEnd, PULL_THRESHOLD } = usePullToRefresh(contentRef, refresh);

  // Refresh button handler — shares the same toast banner as pull-to-refresh.
  // Plays the refresh sound, awaits the fetch's new-item count, then shows
  // "N خبر جديد" or "أخبارك محدّثة" for 2.5s.
  const handleHeaderRefresh = useCallback(async () => {
    Sound.refresh();
    try {
      const count = (await refresh()) || 0;
      setRefreshMsg(count > 0 ? `${count} خبر جديد` : 'أخبارك محدّثة');
    } catch {
      setRefreshMsg('تعذّر التحديث');
    }
    setTimeout(() => setRefreshMsg(null), 2500);
  }, [refresh, setRefreshMsg]);
  const { visibleCount, onScroll } = useInfiniteScroll(20, 15, 200, feedTab);

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
      id: item.id||`i-${i}`, s: { n:item.source?.name||'مصدر', i:item.source?.initial||'؟', id:sid, domain:srcMeta?.domain, logo:srcMeta?.logo },
      t: item.time||'الآن', pubTs: item.timestamp || (Date.now() - i*60000),
      title: item.title,
      body: ((b) => { if (!b) return null; return b.replace(/https?:\/\/\S+/g,'').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim().slice(0,800)||null; })(item.body),
      brief: ((b) => { if (!b) return null; b=b.replace(/https?:\/\/\S+/g,'').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim(); if (b.length<=180) return b||null; const sub=b.slice(0,180); const sent=Math.max(sub.lastIndexOf('. '),sub.lastIndexOf('。'),sub.lastIndexOf('؟ '),sub.lastIndexOf('! '),sub.lastIndexOf('.\n')); if (sent>60) return b.slice(0,sent+1).trim()||null; const word=sub.lastIndexOf(' '); return (word>60?b.slice(0,word):sub).trim()||null; })(item.body),
      realImg: item.image||null, link: item.link,
      tag: item.categories?.[0]||null, tags: allTags,
      brk: item.categories?.[0]==='عاجل'||!!item.title?.includes('عاجل'),
      flags: detectFlags(`${item.title || ''} ${item.body || ''}`),
      _new: !!item._new,
    };
  }), []);

  // Transform all three feed pools
  const allFeed = useMemo(() => transformFeed(liveFeed), [liveFeed, transformFeed]);
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
  const sourcedFeed = allFeed.filter(item => { const idx=SOURCES.findIndex(s=>s.n===item.s?.n); return idx===-1||sources[idx]!==false; });
  const userTopics = userPrefs.topics||[];

  // Flagship sources that update slowly (aljazeera's Arc CMS feed, BBC Arabic)
  // get outranked by fast-updating tier-2 regional papers under pure time sort
  // and disappear below the fold. We guarantee each flagship has at least one
  // item in the visible window (top 12) by splicing their newest item in at
  // slot 4 if missing. Stale items are acceptable — the user specifically
  // wants to see these trust-anchor sources.
  const applyFlagshipBoost = useCallback((pool) => {
    const FLAGSHIP_IDS = ['aljazeera','alarabiya','bbc','asharq_news','skynews','aawsat'];
    const WINDOW = 12;
    const INSERT_AT = 4;
    const result = pool.slice();
    for (const fid of FLAGSHIP_IDS) {
      if (result.slice(0, WINDOW).some(x => x.s?.id === fid)) continue;
      const idx = result.findIndex(x => x.s?.id === fid);
      if (idx < 0) continue;
      const [item] = result.splice(idx, 1);
      result.splice(Math.min(INSERT_AT, result.length), 0, item);
    }
    return result;
  }, []);

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
      if(userTopics.length===0 && !hasInterests) return [];
      return pool.map(item=>({...item,_score:scoreByTopics(item,userTopics,interests)})).filter(i=>i._score>0).sort((a,b)=>b._score-a._score||(b.pubTs||0)-(a.pubTs||0));
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
    { id:'home', label:'الرئيسية', icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.home(f)}<span className="home-dot" style={{position:'absolute',top:-1,right:-2,width:9,height:9,borderRadius:'50%',background:'#FF8C00',border:'2px solid var(--bg)'}}/></span> },
    { id:'map',  label:'خريطة',    icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.map(f)}<span className="map-dot" style={{position:'absolute',top:0,right:-1,width:9,height:9,borderRadius:'50%',background:'var(--bl)',border:'2px solid var(--bg)'}}/></span> },
    { id:'radar',label:'رادار',    center:true, icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.radar(f)}<span className="radar-dot" style={{position:'absolute',top:-1,right:-2,width:10,height:10,borderRadius:'50%',background:'#E53935',border:'2px solid var(--bg)'}}/></span> },
    { id:'depth',label:'دراسات',   icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.depth(f)}<span className="depth-dot" style={{position:'absolute',top:-1,right:-2,width:9,height:9,borderRadius:'50%',background:'#7E57C2',border:'2px solid var(--bg)'}}/></span> },
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
            <button className={`ib ${loading?'spinning':''}`} onClick={handleHeaderRefresh}>{I.globe()}</button>
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
          {/* Pull-to-refresh */}
          {pullY>0&&(<div className="pull-indicator" style={{ height:pullY, opacity:pullY/PULL_THRESHOLD }}>
            {refreshing ? <><div className="spinner"/> جاري التحديث…</> : pullY>=PULL_THRESHOLD ? '↓ أفلت للتحديث' : '↓ اسحب للتحديث'}
          </div>)}
          {refreshMsg&&(<div style={{ position:'sticky',top:0,zIndex:50,background:refreshMsg.includes('جديد')?'#0A0A0A':'var(--f1)',color:refreshMsg.includes('جديد')?'#fff':'var(--t3)',fontSize:12,fontWeight:700,textAlign:'center',padding:'9px',transition:'all .3s' }}>✓ {refreshMsg}</div>)}

          {/* New-articles sticky banner removed per design — newCount
              is still tracked internally so the notify ping fires on
              new items, but no in-feed prompt is shown. */}

          {/* Live indicator */}
          {isLive&&(<div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'5px 0',fontSize:11,color:'var(--t4)' }}><div className="live-dot"/>أخبار مباشرة · {allFeed.length} خبر</div>)}

          {/* Breaking news ticker — removed per design */}

          {/* Source stories */}
          <div className={`stories${activeSource?' stories-filtering':''}`}>{SOURCES.filter(s=>!s.photoOnly).map((s,i)=>{const logoSrc=s.logo||(s.domain?`https://www.google.com/s2/favicons?domain=${s.domain}&sz=128`:null);const isActive=activeSource===s.n;const isDim=activeSource&&!isActive;return(<div className={`story${isActive?' s-active':''}${isDim?' s-dim':''}`} key={i} onClick={()=>{Sound.tap();setActiveSource(prev=>prev===s.n?null:s.n);contentRef.current?.scrollTo({top:0,behavior:'smooth'});}}><div className={`s-ring ${isActive?'':'seen'}`}><div className="s-av">{!logoSrc&&<span className="s-av-letter">{s.i}</span>}{logoSrc&&<img className={`s-av-logo${s.logo?' s-av-logo-raw':''}${s.tint?' s-av-logo-'+s.tint:''}`} src={logoSrc} alt="" loading="lazy" onError={e=>{e.currentTarget.outerHTML='<span class="s-av-letter">'+s.i.replace(/[<>&"]/g,'')+'</span>';}}/>}</div></div><div className="s-nm">{s.n}</div></div>);})}</div>
          {activeSource&&(<div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',background:'var(--f1)',borderBottom:'.5px solid var(--g1)' }}><span style={{ fontSize:13,fontWeight:700,color:'var(--t1)' }}>أخبار {activeSource}</span><button onClick={()=>setActiveSource(null)} style={{ fontSize:12,fontWeight:600,color:'var(--t3)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>عرض الكل ✕</button></div>)}


          {/* Tab-specific headers */}
          {feedTab==='important'&&userTopics.length>0&&(<div className="topic-bar"><span style={{ fontSize:11,color:'var(--t4)',fontWeight:700,whiteSpace:'nowrap',flexShrink:0 }}>يُصفَّح حسب:</span>{userTopics.map(id=>{ const t=TOPICS.find(x=>x.id===id); return t?<span key={id} className="topic-pill on">{t.icon} {t.label}</span>:null; })}</div>)}
          {feedTab==='important'&&userTopics.length===0&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)',display:'flex',justifyContent:'space-between',alignItems:'center' }}><span>لم تختر اهتمامات بعد — يُرتَّب حسب التفاعل</span><button onClick={()=>setNav('settings')} style={{ fontSize:11,fontWeight:700,color:'var(--bk)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>اضبط ▸</button></div>)}

          {/* Feed */}
          {loading&&!refreshing&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>جاري تحميل الأخبار…</div>}
          {!loading&&displayFeed.length===0&&feedTab==='important'&&userTopics.length===0&&Object.keys(interests).length===0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>اضغط "يهمني" على الأخبار لتعليم التطبيق ما يهمك</div>}
          {!loading&&displayFeed.length===0&&feedTab==='important'&&userTopics.length>0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار تطابق اهتماماتك حالياً</div>}
          {!loading&&displayFeed.length===0&&feedTab==='now'&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار عاجلة حالياً</div>}
          {!loading&&displayFeed.slice(0,visibleCount).map((item,i)=>(<Post key={`${item.id}-${i}`} item={item} delay={i<20?i*.04:0} onOpen={setArticle} onSave={toggleSave} isSaved={savedIds.has(item.id)} onInterest={toggleInterest} isInterested={interestedIds.has(item.id)} showImg={i>=4&&i%4!==3} reactionCounts={reactionCounts[item.id]} userReactions={userReactions[item.id]} onToggleReaction={handleToggleReaction} commentCount={reactionCounts[item.id]?.comment||0} onComment={handleComment}/>))}
          {!loading&&visibleCount<displayFeed.length&&(<div className="load-more"><div className="spinner" style={{ width:18,height:18,border:'2px solid var(--g2)',borderTopColor:'var(--t3)',borderRadius:'50%',animation:'spin .6s linear infinite',margin:'0 auto' }}/></div>)}
          <div style={{ height:20 }}/>
        </>)}

        {nav==='radar'   && <RadarView trending={trending} allFeed={radarItems.length ? radarItems : allFeed} onOpenArticle={setArticle} onClose={()=>{Sound.close();setNav('home');}} onRefresh={radarRefresh || refresh} refreshing={loading}/>}
        {nav==='depth'   && <DepthFeed onOpen={setDepthDoc}/>}
        {nav==='map'     && <NewsMap onClose={()=>setNav('home')} liveFeed={mapItems.length ? mapItems : allFeed}/>}
        {nav==='saved'   && <BookmarksView savedIds={savedIds} onOpen={setArticle} allFeed={allFeed}/>}
        {nav==='settings'&& <SettingsView sources={sources} toggleSource={toggleSource} userPrefs={userPrefs} onUpdatePrefs={updatePrefs} onResetPrefs={resetPrefs} theme={theme} toggleTheme={toggleTheme} auth={auth} onOpenAuth={()=>setShowAuth(true)} onOpenProfile={()=>setShowProfile(true)} onOpenAdmin={()=>setNav('admin')}/>}
        {nav==='admin'   && <AdminPanel onClose={()=>setNav('settings')}/>}
      </div>

      {/* Bottom nav */}
      {nav!=='radar'&&nav!=='admin'&&nav!=='map'&&<div className={`bnav${barsHidden?' bnav-hide':''}`}>{navItems.map(item=>(<button key={item.id} aria-label={item.label} className={`bnav-item ${item.center?'bnav-center':''} ${nav===item.id?'on':''}`} onClick={()=>{Sound.tap();setNav(item.id);}}><span className="bnav-icon">{item.icon(nav===item.id)}</span></button>))}</div>}

      {/* Overlays */}
      {article&&<ArticleDetail article={article} onClose={()=>{Sound.close();setArticle(null);}} onSave={toggleSave} isSaved={savedIds.has(article.id)} reactionCounts={reactionCounts[article.id]} userReactions={userReactions[article.id]} onToggleReaction={handleToggleReaction} commentCount={reactionCounts[article.id]?.comment||0} onComment={handleComment} onOpenRelated={(r)=>{setArticle(null);setTimeout(()=>setArticle(r),50);}} relatedArticles={allFeed}/>}
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
