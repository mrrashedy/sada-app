import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import './styles/global.css';

// Data
import { SOURCES } from './data/sources';
import { TOPICS, TOPIC_KEYWORDS } from './data/topics';

// Hooks
import { useNews } from './lib/useNews';
import { usePullToRefresh } from './hooks/usePullToRefresh';
import { useInfiniteScroll } from './hooks/useInfiniteScroll';

// Lib
import { scoreByTopics, isOpinionOrSentimental, CONTEXT_TAGS } from './lib/filters';

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

export default function Sada() {
  const [obDone, setObDone] = useState(() => { try { return localStorage.getItem('sada-ob-done')==='1'; } catch { return false; } });
  const [userPrefs, setUserPrefs] = useState(() => { try { return JSON.parse(localStorage.getItem('sada-prefs')||'{}'); } catch { return {}; } });
  const [nav, setNav]           = useState('home');
  const [feedTab, setFeedTab]   = useState('now');
  const [article, setArticle]   = useState(null);
  const [srch, setSrch]         = useState(false);
  const [notifs, setNotifs]     = useState(false);
  const [seenTs, setSeenTs]     = useState(() => { try { return parseInt(localStorage.getItem('sada-seen-ts'))||0; } catch { return 0; } });
  const [sources, setSources]   = useState({});
  const [newCount, setNewCount] = useState(0);
  const prevLen                 = useRef(0);
  const contentRef              = useRef(null);

  // Bookmarks
  const [savedIds, setSavedIds] = useState(() => { try { const s=localStorage.getItem('sada-bookmarks'); return s?new Set(JSON.parse(s)):new Set(); } catch { return new Set(); } });
  const toggleSave = useCallback(id => { setSavedIds(prev => { const next=new Set(prev); next.has(id)?next.delete(id):next.add(id); try { localStorage.setItem('sada-bookmarks',JSON.stringify([...next])); } catch {} return next; }); }, []);

  // Source toggles
  useEffect(() => { try { const s=localStorage.getItem('sada-sources'); if(s) setSources(JSON.parse(s)); } catch {} }, []);
  const toggleSource = useCallback(i => { setSources(prev => { const next={...prev,[i]:prev[i]===false?true:false}; try { localStorage.setItem('sada-sources',JSON.stringify(next)); } catch {} return next; }); }, []);

  // Live feed
  const { feed:liveFeed, loading, isLive, refresh } = useNews();
  useEffect(() => { if(liveFeed.length>prevLen.current && prevLen.current>0){ setNewCount(liveFeed.length-prevLen.current); setTimeout(()=>setNewCount(0),4000); } prevLen.current=liveFeed.length; }, [liveFeed.length]);

  // Pull-to-refresh & infinite scroll
  const { pullY, refreshing, onTouchStart, onTouchMove, onTouchEnd, PULL_THRESHOLD } = usePullToRefresh(contentRef, refresh);
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

  // Filter by enabled sources
  const sourcedFeed = allFeed.filter(item => { const idx=SOURCES.findIndex(s=>s.n===item.s?.n); return idx===-1||sources[idx]!==false; });
  const userTopics = userPrefs.topics||[];

  // Build display feed based on active tab
  const displayFeed = useMemo(() => {
    const byTime = [...sourcedFeed].sort((a,b) => (b.pubTs||0) - (a.pubTs||0));
    if(feedTab==='now') return byTime.filter(item => !isOpinionOrSentimental(item));
    if(feedTab==='context'){
      const ctx = byTime.filter(item=>item.tag&&CONTEXT_TAGS.includes(item.tag));
      return ctx.length>0 ? ctx : byTime;
    }
    if(userTopics.length>0){
      const scored = byTime.map(item=>({...item,_score:scoreByTopics(item,userTopics)})).sort((a,b)=>b._score-a._score||(b.pubTs||0)-(a.pubTs||0));
      return scored.some(i=>i._score>0)?scored:byTime;
    }
    return byTime;
  }, [feedTab, sourcedFeed, userTopics.join(',')]);

  // Navigation
  const navItems = [
    { id:'home', label:'الرئيسية', icon:f=>I.home(f) },
    { id:'map',  label:'خريطة',    icon:f=>I.map(f)  },
    { id:'saved',label:'المحفوظات',icon:f=>I.saved(f)},
    { id:'settings',label:'الإعدادات',icon:()=>I.user()},
  ];

  const resetOnboarding = () => { try { localStorage.removeItem('sada-ob-done'); localStorage.removeItem('sada-prefs'); } catch {} setObDone(false); setUserPrefs({}); };

  if(!obDone) return <Onboarding onDone={(prefs)=>{ setUserPrefs(prefs); setObDone(true); }}/>;

  return (
    <div className="app">
      {/* Header */}
      <div className="hdr">
        <div className="logo">صَدى</div>
        <div className="hdr-r">
          <button className="ib" onClick={()=>setSrch(true)}>{I.search()}</button>
          <button className={`ib ${loading?'spinning':''}`} onClick={refresh}>{I.globe()}</button>
          <button className={`ib ${allFeed.some(f=>f.pubTs>seenTs)?'ndot':''}`} onClick={()=>{ setNotifs(true); const now=Date.now(); setSeenTs(now); try{localStorage.setItem('sada-seen-ts',String(now));}catch{}; }}>{I.bell()}</button>
        </div>
      </div>

      {/* Tabs */}
      {nav==='home'&&(<div className="tabs">{[{id:'now',l:'هنا والآن'},{id:'important',l:'مهم'},{id:'context',l:'سياق'}].map(t=>(<button key={t.id} className={`tab ${feedTab===t.id?'on':''}`} onClick={()=>setFeedTab(t.id)}>{t.l}</button>))}</div>)}
      {nav!=='home'&&(<div style={{ padding:'0 20px 12px',fontSize:20,fontWeight:800,color:'var(--bk)',borderBottom:'.5px solid var(--g1)' }}>{nav==='saved'&&'المحفوظات'}{nav==='settings'&&'الإعدادات'}{nav==='map'&&'خريطة الأخبار'}</div>)}

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

          {/* New articles banner */}
          {newCount>0&&(<div onClick={()=>{setNewCount(0);contentRef.current?.scrollTo({top:0,behavior:'smooth'});}} style={{ position:'sticky',top:0,zIndex:50,background:'#0A0A0A',color:'#fff',fontSize:12,fontWeight:700,textAlign:'center',padding:'9px',cursor:'pointer' }}>↑ {newCount} خبر جديد</div>)}

          {/* Live indicator */}
          {isLive&&(<div style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:6,padding:'8px 0',fontSize:11,color:'var(--t4)' }}><div style={{ width:5,height:5,borderRadius:'50%',background:'#4CAF50' }}/>أخبار مباشرة · {allFeed.length} خبر</div>)}

          {/* Source stories */}
          <div className="stories">{SOURCES.map((s,i)=>(<div className="story" key={i} onClick={()=>{setSources(prev=>({...prev,[i]:prev[i]===true?undefined:true}));setFeedTab('important');}}><div className={`s-ring ${sources[i]===true?'':'seen'}`}><div className="s-av">{s.i}</div></div><div className="s-nm">{s.n}</div></div>))}</div>

          {/* Tab-specific headers */}
          {feedTab==='important'&&userTopics.length>0&&(<div className="topic-bar"><span style={{ fontSize:11,color:'var(--t4)',fontWeight:700,whiteSpace:'nowrap',flexShrink:0 }}>يُصفَّح حسب:</span>{userTopics.map(id=>{ const t=TOPICS.find(x=>x.id===id); return t?<span key={id} className="topic-pill on">{t.icon} {t.label}</span>:null; })}</div>)}
          {feedTab==='important'&&userTopics.length===0&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)',display:'flex',justifyContent:'space-between',alignItems:'center' }}><span>لم تختر اهتمامات بعد — يُرتَّب حسب التفاعل</span><button onClick={resetOnboarding} style={{ fontSize:11,fontWeight:700,color:'var(--bk)',background:'none',border:'none',cursor:'pointer',fontFamily:'var(--ft)' }}>اضبط ▸</button></div>)}
          {feedTab==='context'&&(<div style={{ padding:'10px 20px',background:'var(--f1)',fontSize:12,color:'var(--t3)',borderBottom:'.5px solid var(--g1)' }}>تحليلات ومقالات رأي وتقارير معمّقة</div>)}

          {/* Feed */}
          {loading&&!refreshing&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>جاري تحميل الأخبار…</div>}
          {!loading&&displayFeed.length===0&&<div style={{ padding:'40px 20px',textAlign:'center',color:'var(--t4)',fontSize:13 }}>لا توجد أخبار في هذا التصنيف</div>}
          {!loading&&displayFeed.slice(0,visibleCount).map((item,i)=>(<Post key={item.id} item={item} delay={i<20?i*.04:0} onOpen={setArticle} onSave={toggleSave} isSaved={savedIds.has(item.id)} showImg={i%3===0}/>))}
          {!loading&&visibleCount<displayFeed.length&&(<div className="load-more"><div className="spinner" style={{ width:18,height:18,border:'2px solid var(--g2)',borderTopColor:'var(--t3)',borderRadius:'50%',animation:'spin .6s linear infinite',margin:'0 auto' }}/></div>)}
          <div style={{ height:20 }}/>
        </>)}

        {nav==='map'     && <NewsMap onClose={()=>setNav('home')} liveFeed={allFeed}/>}
        {nav==='saved'   && <BookmarksView savedIds={savedIds} onOpen={setArticle} allFeed={allFeed}/>}
        {nav==='settings'&& <SettingsView sources={sources} toggleSource={toggleSource} userPrefs={userPrefs} onResetOnboarding={resetOnboarding}/>}
      </div>

      {/* Bottom nav */}
      <div className="bnav">{navItems.map(item=>(<button key={item.id} className={`bnav-item ${nav===item.id?'on':''}`} onClick={()=>setNav(item.id)}>{item.icon(nav===item.id)}<span>{item.label}</span></button>))}</div>

      {/* Overlays */}
      {article&&<ArticleDetail article={article} onClose={()=>setArticle(null)} onSave={toggleSave} isSaved={savedIds.has(article.id)}/>}
      {srch&&<SearchView onClose={()=>setSrch(false)} feed={allFeed} onOpen={setArticle}/>}
      {notifs&&<NotificationPanel allFeed={allFeed} onClose={()=>setNotifs(false)} onOpen={setArticle}/>}
    </div>
  );
}
