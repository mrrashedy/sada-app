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
import { scoreByTopics, isOpinionOrSentimental, isDeepInvestigative } from './lib/filters';
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
import { Onboarding } from './components/onboarding/Onboarding';
import { TrendingRadar, RadarView } from './components/trending/TrendingRadar';
import { BreakingTicker } from './components/feed/BreakingTicker';

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

  const [obDone, setObDone] = useState(() => { try { return localStorage.getItem('sada-ob-done')==='1'; } catch { return false; } });
  const [userPrefs, setUserPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('sada-prefs')||'{}'); } catch { return {}; } });
  const [nav, setNav]           = useState('home');
  const [feedTab, setFeedTab]   = useState('now');
  const [article, setArticle]   = useState(null);
  const [srch, setSrch]         = useState(false);
  const [notifs, setNotifs]     = useState(false);
  const [seenTs, setSeenTs]     = useState(() => { try { return parseInt(localStorage.getItem('sada-seen-ts'))||0; } catch { return 0; } });
  const [sources, setSources]   = useState({});
  const [activeSource, setActiveSource] = useState(null);
  const [newCount, setNewCount] = useState(0);
  const prevLen                 = useRef(0);
  const contentRef              = useRef(null);

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
  const { feed:liveFeed, loading, isLive, refresh } = useNews();
  useEffect(() => { if(liveFeed.length>prevLen.current && prevLen.current>0){ setNewCount(liveFeed.length-prevLen.current); Sound.notify(); setTimeout(()=>setNewCount(0),4000); } prevLen.current=liveFeed.length; }, [liveFeed.length]);

  // Pull-to-refresh & infinite scroll
  const { pullY, refreshing, refreshMsg, onTouchStart, onTouchMove, onTouchEnd, PULL_THRESHOLD } = usePullToRefresh(contentRef, refresh);
  const { visibleCount, onScroll } = useInfiniteScroll(20, 15, 200, feedTab);

  // Transform API data → feed items with tags
  const allFeed = liveFeed.map((item,i) => {
    const text = ((item.title||'')+' '+(item.body||'')).toLowerCase();
    const detectedTopics = TOPICS.filter(t =>
      (TOPIC_KEYWORDS[t.id]||[]).some(kw => text.includes(kw))
    ).slice(0,2).map(t => t.label);
    const apiCats = (item.categories||[]).filter(c => c && c !== 'عاجل');
    const allTags = [...new Set([...apiCats, ...detectedTopics])].slice(0,4);

    return {
      id: item.id||`i-${i}`, s: { n:item.source?.name||'مصدر', i:item.source?.initial||'؟' },
      t: item.time||'الآن', pubTs: item.timestamp || (Date.now() - i*60000),
      title: item.title,
      body: (item.body||'').replace(/https?:\/\/\S+/g,'').replace(/&[a-z#0-9]+;/g,' ').replace(/\s+/g,' ').trim().slice(0,300)||null,
      realImg: item.image||null, link: item.link,
      tag: item.categories?.[0]||null, tags: allTags,
      brk: item.categories?.[0]==='عاجل'||!!item.title?.includes('عاجل'),
    };
  });

  // Trending topics — recalculate every 10 minutes
  const trendBucket = Math.floor(Date.now() / 600000);
  const trending = useMemo(() => extractTrending(allFeed), [trendBucket]);

  // Filter by enabled sources
  const sourcedFeed = allFeed.filter(item => { const idx=SOURCES.findIndex(s=>s.n===item.s?.n); return idx===-1||sources[idx]!==false; });
  const userTopics = userPrefs.topics||[];

  // Build display feed based on active tab — each tab shows genuinely different content
  const displayFeed = useMemo(() => {
    let pool = [...sourcedFeed].sort((a,b) => (b.pubTs||0) - (a.pubTs||0));
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
    if(feedTab==='context'){
      return pool.filter(item => isDeepInvestigative(item));
    }
    return pool;
  }, [feedTab, sourcedFeed, userTopics.join(','), activeSource, interests]);

  // Reactions — batch fetch for visible articles
  const visibleIds = useMemo(() => displayFeed.slice(0, visibleCount).map(f => f.id), [displayFeed, visibleCount]);
  const { counts: reactionCounts, userReactions, toggleReaction } = useReactions(visibleIds, auth.user?.id);
  const handleToggleReaction = useCallback((articleId, type) => {
    toggleReaction(articleId, type).then(wasLoggedIn => {
      if (!wasLoggedIn) setShowAuth(true);
    });
  }, [toggleReaction]);
  const handleComment = useCallback((item) => { setCommentArticle(item); }, []);

  // Navigation
  const navItems = [
    { id:'home', label:'الرئيسية', icon:f=>I.home(f) },
    { id:'radar',label:'رادار',    icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.radar(f)}<span style={{position:'absolute',top:0,right:-1,width:9,height:9,borderRadius:'50%',background:'#E53935',border:'2px solid var(--bg)'}}/></span> },
    { id:'map',  label:'خريطة',    icon:f=><span style={{position:'relative',display:'inline-flex'}}>{I.map(f)}<span style={{position:'absolute',top:0,right:-1,width:9,height:9,borderRadius:'50%',background:'var(--bl)',border:'2px solid var(--bg)'}}/></span> },
    { id:'saved',label:'المحفوظات',icon:f=>I.saved(f)},
    { id:'settings',label:'الإعدادات',icon:()=>auth.isLoggedIn?<div style={{width:22,height:22,borderRadius:'50%',background:'var(--rd)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:10,fontWeight:800,color:'#fff'}}>{(auth.profile?.display_name||'?')[0]}</div>:I.user()},
  ];

  const resetOnboarding = () => { try { localStorage.removeItem('sada-ob-done'); localStorage.removeItem('sada-prefs'); } catch {} setObDone(false); setUserPrefs({}); };

  if(!obDone) return <Onboarding onDone={(prefs)=>{ setUserPrefs(prefs); setObDone(true); }}/>;

  return (
    <div className="app">
      {/* Header */}
      {nav!=='radar'&&<div className="hdr">
        <div className="logo"><span className="logo-icon">غ</span>غرفة الأخبار</div>
        <div className="hdr-r">
          <button className="ib" onClick={()=>{Sound.tap();setSrch(true);}}>{I.search()}</button>
          <button className={`ib ${loading?'spinning':''}`} onClick={()=>{Sound.refresh();refresh();}}>{I.globe()}</button>
          <button className={`ib ${allFeed.some(f=>f.pubTs>seenTs)?'ndot':''}`} onClick={()=>{Sound.tap();setNotifs(true); const now=Date.now(); setSeenTs(now); try{localStorage.setItem('sada-seen-ts',String(now));}catch{}; }}>{I.bell()}</button>
        </div>
      </div>}

      {/* Tabs */}
      {nav==='home'&&(<div className="tabs">{[{id:'now',l:'هنا والآن'},{id:'important',l:'مهم'},{id:'context',l:'سياق'}].map(t=>(<button key={t.id} className={`tab ${feedTab===t.id?'on':''}`} onClick={()=>{Sound.tap();setFeedTab(t.id);setActiveSource(null);}}>{t.l}</button>))}</div>)}
      {nav!=='home'&&nav!=='radar'&&(<div style={{ padding:'0 20px 12px',fontSize:20,fontWeight:800,color:'var(--bk)',borderBottom:'.5px solid var(--g1)' }}>{nav==='saved'&&'المحفوظات'}{nav==='settings'&&'الإعدادات'}{nav==='map'&&'خريطة الأخبار'}</div>)}

      {/* Main content */}
      <div className="content" ref={contentRef} onScroll={onScroll}
        onTouchStart={nav==='home'?onTouchStart:undefined}
        onTouchMove={nav==='home'?onTouchMove:undefined}
        onTouchEnd={nav==='home'?onTouchEnd:undefined}>

        {nav==='home'&&(<>
          {/* Pull-to-refresh */}
          {pullY>0&&(<div className="pull-indicator" style={{ height:pullY, opacity:pullY/PULL_THRESHOLD }}>
            {refreshing ? <><div className="spinner"/> جاري التحديث…</> : pullY>=PULL_THRESHOLD ? '↓ أفلت للتحديث' : '↓ اسحب للتحديث'}
          </div>)}
          {refreshMsg&&(<div style={{ position:'sticky',top:0,zIndex:50,background:refreshMsg.includes('جديد')?'#0A0A0A':'var(--f1)',color:refreshMsg.includes('جديد')?'#fff':'var(--t3)',fontSize:12,fontWeight:700,textAlign:'center',padding:'9px',transition:'all .3s' }}>✓ {refreshMsg}</div>)}

          {/* New articles banner */}
          {newCount>0&&(<div onClick={()=>{Sound.notify();setNewCount(0);contentRef.current?.scrollTo({top:0,behavior:'smooth'});}} style={{ position:'sticky',top:0,zIndex:50,background:'#0A0A0A',color:'#fff',fontSize:12,fontWeight:700,textAlign:'center',padding:'9px',cursor:'pointer' }}>↑ {newCount} خبر جديد</div>)}

          {/* Live indicator */}
          {isLive&&(<div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'5px 0',fontSize:11,color:'var(--t4)' }}><div style={{ width:5,height:5,borderRadius:'50%',background:'var(--gn)' }}/>أخبار مباشرة · {allFeed.length} خبر</div>)}

          {/* Breaking news ticker */}
          <BreakingTicker feed={allFeed} onOpen={setArticle}/>

          {/* Source stories */}
          <div className="stories">{SOURCES.map((s,i)=>(<div className="story" key={i} onClick={()=>{Sound.tap();setActiveSource(prev=>prev===s.n?null:s.n);contentRef.current?.scrollTo({top:0,behavior:'smooth'});}}><div className={`s-ring ${activeSource===s.n?'':'seen'}`}><div className="s-av">{s.i}</div></div><div className="s-nm">{s.n}</div></div>))}</div>
          {activeSource&&(<div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 20px',background:'var(--f1)',borderBottom:'.5px solid var(--g1)' }}><span style={{ fontSize:13,fontWeight:700,color:'var(--t1)' }}>أخبار {activeSource}</span><button onClick={()=>setActiveSource(null)} style={{ fontSize:12,fontWeight:600,color:'var(--t3)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>عرض الكل ✕</button></div>)}


          {/* Tab-specific headers */}
          {feedTab==='important'&&userTopics.length>0&&(<div className="topic-bar"><span style={{ fontSize:11,color:'var(--t4)',fontWeight:700,whiteSpace:'nowrap',flexShrink:0 }}>يُصفَّح حسب:</span>{userTopics.map(id=>{ const t=TOPICS.find(x=>x.id===id); return t?<span key={id} className="topic-pill on">{t.icon} {t.label}</span>:null; })}</div>)}
          {feedTab==='important'&&userTopics.length===0&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)',display:'flex',justifyContent:'space-between',alignItems:'center' }}><span>لم تختر اهتمامات بعد — يُرتَّب حسب التفاعل</span><button onClick={resetOnboarding} style={{ fontSize:11,fontWeight:700,color:'var(--bk)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>اضبط ▸</button></div>)}
          {feedTab==='context'&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)' }}>تحقيقات · تحليلات · تقارير معمّقة</div>)}

          {/* Feed */}
          {loading&&!refreshing&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>جاري تحميل الأخبار…</div>}
          {!loading&&displayFeed.length===0&&feedTab==='important'&&userTopics.length===0&&Object.keys(interests).length===0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>اضغط "يهمني" على الأخبار لتعليم التطبيق ما يهمك</div>}
          {!loading&&displayFeed.length===0&&feedTab==='important'&&userTopics.length>0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار تطابق اهتماماتك حالياً</div>}
          {!loading&&displayFeed.length===0&&feedTab==='context'&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد تحليلات أو تقارير حالياً</div>}
          {!loading&&displayFeed.length===0&&feedTab==='now'&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار عاجلة حالياً</div>}
          {!loading&&displayFeed.slice(0,visibleCount).map((item,i)=>(<Post key={item.id} item={item} delay={i<20?i*.04:0} onOpen={setArticle} onSave={toggleSave} isSaved={savedIds.has(item.id)} onInterest={toggleInterest} isInterested={interestedIds.has(item.id)} showImg={i%4!==3} reactionCounts={reactionCounts[item.id]} userReactions={userReactions[item.id]} onToggleReaction={handleToggleReaction} commentCount={reactionCounts[item.id]?.comment||0} onComment={handleComment}/>))}
          {!loading&&visibleCount<displayFeed.length&&(<div className="load-more"><div className="spinner" style={{ width:18,height:18,border:'2px solid var(--g2)',borderTopColor:'var(--t3)',borderRadius:'50%',animation:'spin .6s linear infinite',margin:'0 auto' }}/></div>)}
          <div style={{ height:20 }}/>
        </>)}

        {nav==='radar'   && <RadarView trending={trending} allFeed={allFeed} onOpenArticle={setArticle} onClose={()=>{Sound.close();setNav('home');}}/>}
        {nav==='map'     && <NewsMap onClose={()=>setNav('home')} liveFeed={allFeed}/>}
        {nav==='saved'   && <BookmarksView savedIds={savedIds} onOpen={setArticle} allFeed={allFeed}/>}
        {nav==='settings'&& <SettingsView sources={sources} toggleSource={toggleSource} userPrefs={userPrefs} onResetOnboarding={resetOnboarding} theme={theme} toggleTheme={toggleTheme} auth={auth} onOpenAuth={()=>setShowAuth(true)} onOpenProfile={()=>setShowProfile(true)}/>}
      </div>

      {/* Bottom nav */}
      {nav!=='radar'&&<div className="bnav">{navItems.map(item=>(<button key={item.id} className={`bnav-item ${nav===item.id?'on':''}`} onClick={()=>{Sound.tap();setNav(item.id);}}>{item.icon(nav===item.id)}<span>{item.label}</span></button>))}</div>}

      {/* Overlays */}
      {article&&<ArticleDetail article={article} onClose={()=>{Sound.close();setArticle(null);}} onSave={toggleSave} isSaved={savedIds.has(article.id)} reactionCounts={reactionCounts[article.id]} userReactions={userReactions[article.id]} onToggleReaction={handleToggleReaction} commentCount={reactionCounts[article.id]?.comment||0} onComment={handleComment} relatedArticles={allFeed}/>}
      {srch&&<SearchView onClose={()=>{Sound.close();setSrch(false);}} feed={allFeed} onOpen={setArticle} onOpenProfile={id=>{ setSrch(false); setProfileUserId(id); }}/>}
      {notifs&&<NotificationPanel allFeed={allFeed} onClose={()=>{Sound.close();setNotifs(false);}} onOpen={setArticle}/>}
      {commentArticle&&<CommentSheet articleId={commentArticle.id} onClose={()=>setCommentArticle(null)} onOpenAuth={()=>setShowAuth(true)}/>}
      {profileUserId&&<UserProfile userId={profileUserId} onClose={()=>setProfileUserId(null)} onOpenAuth={()=>setShowAuth(true)}/>}
      {showAuth&&<AuthModal onClose={()=>setShowAuth(false)} onSuccess={()=>setShowAuth(false)}/>}
      {showProfile&&<ProfileSetup onClose={()=>setShowProfile(false)}/>}
    </div>
  );
}
