import { useState, useEffect, useRef, useCallback } from "react";
import { useNews } from "./lib/useNews";

// ═══════════════════════════════════════════
// DATA
// ═══════════════════════════════════════════

const SOURCES = [
  { n:"الجزيرة", i:"ج" }, { n:"العربية", i:"ع" }, { n:"BBC عربي", i:"B" },
  { n:"سكاي نيوز", i:"S" }, { n:"رويترز", i:"R" }, { n:"CNBC عربية", i:"C" },
  { n:"فرانس ٢٤", i:"F" }, { n:"دويتشه فيله", i:"D" },
];

const FEED = [
  { id:1, s:SOURCES[0], t:"٣ د", tag:"عاجل", brk:true, bg:"linear-gradient(135deg,#1a1a2e,#0f3460)", title:"قمة الرياض تختتم بإعلان تاريخي — خارطة طريق اقتصادية جديدة للشرق الأوسط", body:"القادة يتوافقون على إنشاء صندوق إقليمي بقيمة ١٠٠ مليار دولار لدعم التحول الرقمي والتكامل الاقتصادي في المنطقة", lk:"12.4K", cm:"2.1K", sh:"5.8K" },
  { id:2, s:SOURCES[1], t:"١٥ د", tag:"حصري", bg:"linear-gradient(135deg,#2d3436,#636e72,#b2bec3)", title:"حوار خاص مع رئيس أرامكو: ٥٠ مليار دولار للطاقة المتجددة", body:"في مقابلة حصرية يكشف الرئيس التنفيذي عن خطط الشركة لقيادة التحول في قطاع الطاقة", lk:"8.7K", cm:"1.3K", sh:"3.2K" },
  { id:3, s:SOURCES[4], t:"٢٨ د", title:"الدولار يتراجع أمام سلة العملات الرئيسية بعد بيانات التوظيف الأمريكية", body:"شهدت الأسواق تحركات لافتة مع صدور تقرير الوظائف الذي جاء دون التوقعات، مما عزز التكهنات بخفض أسعار الفائدة في الاجتماع المقبل للاحتياطي الفيدرالي", lk:"3.2K", cm:"891", sh:"1.5K" },
  { id:4, s:SOURCES[2], t:"٤٥ د", tag:"فيديو", vid:true, bg:"linear-gradient(135deg,#0c0c0c,#1a1a2e,#2d3436,#0c0c0c)", title:"لحظة إطلاق أول قمر صناعي عربي مشترك من قاعدة الإمارات الفضائية", lk:"31.5K", cm:"4.2K", sh:"18.3K" },
  { id:5, s:SOURCES[5], t:"١ س", tag:"تحليل", bg:"linear-gradient(135deg,#434343,#000)", title:"كيف يُعيد الذكاء الاصطناعي تشكيل صناعة الإعلام العربي؟", body:"تحليل معمّق لتأثير التقنيات الحديثة على غرف الأخبار وصناعة المحتوى", lk:"4.9K", cm:"723", sh:"2.1K" },
  { id:6, s:SOURCES[3], t:"٢ س", bg:"linear-gradient(135deg,#3d3d3d,#575757,#8e8e8e)", title:"محادثات جنيف تحقق اختراقاً دبلوماسياً بشأن الملف النووي", body:"مصادر مطلعة تكشف عن تفاصيل الاتفاق الذي وصفه المبعوث الأممي بأنه خطوة تاريخية", lk:"7.8K", cm:"2.9K", sh:"4.4K" },
  { id:7, s:SOURCES[6], t:"٣ س", tag:"رأي", title:"لماذا يحتاج العالم العربي إلى ثورة في صناعة النشر الرقمي؟", body:"الفجوة بين المحتوى العربي والعالمي تتسع يوماً بعد يوم. المشكلة ليست في غياب المواهب بل في البنية التحتية الرقمية وثقافة الاستثمار في المحتوى", lk:"2.1K", cm:"345", sh:"987" },
  { id:8, s:SOURCES[0], t:"٤ س", tag:"تقرير", bg:"linear-gradient(135deg,#141e30,#243b55)", title:"المدن الذكية في الخليج — رحلة داخل نيوم ومدينة المستقبل", body:"أين وصلت المشاريع الكبرى وما التحديات الحقيقية التي تواجهها على أرض الواقع", lk:"3.3K", cm:"512", sh:"1.8K" },
];

// ═══════════════════════════════════════════
// ICONS (thin, elegant, 1.2px stroke)
// ═══════════════════════════════════════════

const I = {
  heart: (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth={f?0:1.2}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>,
  bubble: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>,
  repeat: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 014-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 01-4 4H3"/></svg>,
  bookmark: (f) => <svg width="20" height="20" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth="1.2"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>,
  search: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>,
  globe: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>,
  home: (f) => <svg width="22" height="22" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth={f?0:1.2}><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/></svg>,
  map: (f) => <svg width="22" height="22" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth="1.2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><ellipse cx="12" cy="12" rx="4" ry="10"/></svg>,
  saved: (f) => <svg width="22" height="22" viewBox="0 0 24 24" fill={f?"currentColor":"none"} stroke="currentColor" strokeWidth="1.2"><path d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z"/></svg>,
  user: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>,
  close: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 6L6 18M6 6l12 12"/></svg>,
  more: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="5" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="12" cy="19" r="1.5"/></svg>,
  play: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>,
  back: () => <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>,
  share: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13"/></svg>,
  bell: () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0"/></svg>,
  check: () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>,
};

// ═══════════════════════════════════════════
// STYLES
// ═══════════════════════════════════════════

const css = `
*{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}
:root{--bg:#FFF;--f1:#FAFAFA;--g1:#F0F0F0;--g2:#E0E0E0;--t1:#0A0A0A;--t2:#444;--t3:#999;--t4:#C0C0C0;--bk:#000;--rd:#B71C1C;--ft:-apple-system,"SF Arabic","SF Pro Arabic",system-ui,sans-serif}
@keyframes fu{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@keyframes hp{0%{transform:scale(1)}40%{transform:scale(1.25)}100%{transform:scale(1)}}
@keyframes fi{from{opacity:0}to{opacity:1}}
@keyframes sl{from{transform:translateX(100%)}to{transform:translateX(0)}}
@keyframes cu{from{transform:translateY(100%)}to{transform:translateY(0)}}
html,body{background:#FFF;overflow:hidden;height:100%}
.app{max-width:430px;margin:0 auto;height:100vh;background:var(--bg);font-family:var(--ft);direction:rtl;display:flex;flex-direction:column;overflow:hidden;position:relative}

/* Status */
.sb{display:flex;justify-content:space-between;align-items:center;padding:6px 20px;font-size:12px;font-weight:600;flex-shrink:0}

/* Header */
.hdr{display:flex;justify-content:space-between;align-items:center;padding:2px 20px 10px;flex-shrink:0}
.logo{font-size:24px;font-weight:800;letter-spacing:-.5px}
.hdr-r{display:flex;gap:16px;align-items:center}
.ib{background:none;border:none;cursor:pointer;color:var(--t1);padding:2px;display:flex;align-items:center}
.ib:active{opacity:.35}
.ndot{position:relative}
.ndot::after{content:'';position:absolute;top:1px;right:1px;width:6px;height:6px;background:var(--rd);border-radius:50%;border:1.5px solid var(--bg)}

/* Tabs */
.tabs{display:flex;border-bottom:.5px solid var(--g1);flex-shrink:0}
.tab{flex:1;text-align:center;padding:11px 0;font-size:13px;font-weight:500;color:var(--t4);cursor:pointer;background:none;border:none;font-family:var(--ft);position:relative;transition:color .2s}
.tab.on{color:var(--bk);font-weight:700}
.tab.on::after{content:'';position:absolute;bottom:0;left:25%;right:25%;height:2px;background:var(--bk);border-radius:1px}

/* Stories */
.stories{display:flex;gap:14px;padding:14px 20px;overflow-x:auto;scrollbar-width:none;flex-shrink:0}
.stories::-webkit-scrollbar{display:none}
.story{display:flex;flex-direction:column;align-items:center;gap:5px;cursor:pointer;flex-shrink:0}
.s-ring{width:48px;height:48px;border-radius:50%;padding:2px;background:var(--bk)}
.s-ring.seen{background:var(--t4)}
.s-av{width:100%;height:100%;border-radius:50%;background:var(--bg);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:16px;color:var(--bk);border:2px solid var(--bg)}
.s-nm{font-size:10px;color:var(--t3);font-weight:500;max-width:50px;text-align:center;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Scrollable content */
.content{flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch}

/* Post */
.post{padding:18px 20px;border-bottom:.5px solid var(--g1);animation:fu .4s ease both}
.ph{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.pav{width:34px;height:34px;border-radius:50%;border:1px solid var(--g1);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:var(--t1);background:var(--bg);flex-shrink:0}
.pinfo{flex:1;min-width:0}
.pname{font-size:13px;font-weight:700;color:var(--t1)}
.ptime{font-size:11px;color:var(--t4);margin-right:6px}
.ptag{display:inline-block;font-size:10px;font-weight:600;color:var(--t3);border:1px solid var(--g1);padding:2px 9px;border-radius:3px;margin-bottom:8px;letter-spacing:.3px}
.ptag.brk{color:var(--rd);border-color:rgba(183,28,28,.15)}
.ptitle{font-size:16px;font-weight:700;line-height:1.7;color:var(--t1);margin-bottom:3px}
.pbody{font-size:13px;line-height:1.7;color:var(--t2)}
.pmore-t{color:var(--t4);font-weight:500;cursor:pointer}
.strap{margin-top:12px;border-radius:8px;overflow:hidden;position:relative;height:120px}
.strap-play{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:44px;height:44px;background:rgba(255,255,255,.12);border-radius:50%;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.15)}
.strap-dur{position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,.5);color:white;font-size:10px;font-weight:500;padding:2px 7px;border-radius:3px}
.pactions{display:flex;align-items:center;margin-top:12px}
.act{display:flex;align-items:center;gap:4px;flex:1;cursor:pointer;color:var(--t4);font-size:11px;background:none;border:none;font-family:var(--ft);transition:color .15s}
.act:active{opacity:.4}
.act.liked{color:var(--rd)}
.act.liked svg{animation:hp .3s ease}
.act.saved{color:var(--bk)}
.act:last-child{flex:0}

/* Bottom Nav */
.bnav{display:flex;border-top:.5px solid var(--g1);padding:8px 0 20px;background:var(--bg);flex-shrink:0}
.bnav-item{flex:1;display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;background:none;border:none;color:var(--t4);font-family:var(--ft);font-size:10px;font-weight:500;padding:4px 0;transition:color .2s}
.bnav-item.on{color:var(--bk)}

/* Article Detail */
.detail{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg);z-index:100;overflow-y:auto;animation:sl .3s cubic-bezier(.25,.46,.45,.94);direction:rtl;font-family:var(--ft)}
.det-hdr{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;position:sticky;top:0;background:var(--bg);z-index:10;border-bottom:.5px solid var(--g1)}
.det-strap{height:180px;border-radius:0}
.det-body{padding:20px 20px 80px}
.det-tag-row{display:flex;gap:8px;align-items:center;margin-bottom:12px}
.det-src{font-size:12px;font-weight:700;border:1px solid var(--g2);border-radius:20px;padding:4px 12px}
.det-meta{display:flex;gap:10px;font-size:12px;color:var(--t3);margin-bottom:16px;align-items:center}
.det-title{font-size:22px;font-weight:800;line-height:1.7;color:var(--bk);margin-bottom:10px}
.det-sub{font-size:14px;color:var(--t2);line-height:1.7;margin-bottom:20px;padding-bottom:20px;border-bottom:.5px solid var(--g1)}
.det-p{font-size:16px;line-height:2;color:var(--t2);margin-bottom:16px}
.det-stat{display:flex;align-items:center;gap:3px}

/* Search */
.srch{position:absolute;top:0;left:0;right:0;bottom:0;background:var(--bg);z-index:100;animation:fi .15s;padding:12px 20px;overflow-y:auto;direction:rtl;font-family:var(--ft)}
.srch-bar{display:flex;align-items:center;gap:10px;border-bottom:.5px solid var(--g1);padding-bottom:12px;margin-bottom:24px}
.srch-in{flex:1;background:none;border:none;font-family:var(--ft);font-size:16px;color:var(--t1);outline:none;direction:rtl}
.srch-in::placeholder{color:var(--t4);font-weight:300}
.srch-c{font-size:14px;font-weight:500;background:none;border:none;cursor:pointer;font-family:var(--ft);color:var(--t3)}
.srch-sec{font-size:11px;font-weight:700;color:var(--t4);letter-spacing:1.5px;margin-bottom:14px;margin-top:4px}
.srch-tags{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:28px}
.srch-tag{padding:8px 16px;border-radius:20px;border:.5px solid var(--g1);font-size:13px;font-weight:500;color:var(--t2);cursor:pointer;font-family:var(--ft);background:none;transition:all .2s}
.srch-tag:active{background:var(--bk);color:var(--bg);border-color:var(--bk)}

/* Map */
.mview{position:absolute;top:0;left:0;right:0;bottom:0;background:#050505;z-index:50;animation:fi .2s;font-family:var(--ft);direction:rtl;overflow:hidden}
@keyframes liveP{0%,100%{opacity:1}50%{opacity:.35}}
.msi{display:flex;align-items:center;gap:4px;font-size:10px;color:rgba(255,255,255,.35);background:rgba(5,5,5,.65);padding:5px 12px;border-radius:14px;backdrop-filter:blur(10px);font-family:var(--ft)}
.msd{width:5px;height:5px;border-radius:50%}
.mcard{position:absolute;bottom:0;left:0;right:0;max-width:430px;margin:0 auto;background:var(--bg);border-radius:20px 20px 0 0;z-index:1000;direction:rtl;font-family:var(--ft);max-height:55vh;display:flex;flex-direction:column;box-shadow:0 -4px 40px rgba(0,0,0,.6);animation:cu .35s cubic-bezier(.32,.72,.24,1)}
.mcard-h{width:36px;height:4px;background:var(--g2);border-radius:2px;margin:10px auto 0;flex-shrink:0}
.mcard-loc{display:flex;align-items:center;gap:6px}
.mcard-city{font-size:17px;font-weight:800;color:var(--t1)}
.mcard-reg{font-size:13px;color:var(--t4)}
.mcard-title{font-size:16px;font-weight:700;line-height:1.7;color:var(--t1);margin-bottom:8px}
.mcard-meta{display:flex;align-items:center;gap:8px;font-size:11px;color:var(--t4)}
.mcard-tag{display:inline-block;font-size:10px;font-weight:600;color:var(--t4);border:1px solid var(--g1);padding:1px 8px;border-radius:3px;margin-bottom:6px}
.mcard-tag.brk{color:var(--rd);border-color:rgba(183,28,28,.15)}
.mcard-btn{margin-top:14px;background:var(--bk);color:var(--bg);border:none;font-family:var(--ft);font-size:14px;font-weight:600;padding:12px;border-radius:24px;cursor:pointer;width:100%}
.mcard-btn:active{opacity:.7}

/* Bookmarks empty */
.empty{display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 40px;color:var(--t4);text-align:center;gap:12px}
.empty-icon{opacity:.3}
.empty-title{font-size:17px;font-weight:700;color:var(--t3)}
.empty-sub{font-size:13px;line-height:1.6}

/* Settings */
.set-sec{padding:20px;border-bottom:.5px solid var(--g1)}
.set-sec-title{font-size:11px;font-weight:700;color:var(--t4);letter-spacing:1.5px;margin-bottom:14px}
.set-row{display:flex;justify-content:space-between;align-items:center;padding:10px 0}
.set-name{font-size:14px;font-weight:500;color:var(--t1)}
.toggle{width:44px;height:26px;border-radius:13px;background:var(--g2);position:relative;cursor:pointer;border:none;transition:background .3s}
.toggle.on{background:var(--bk)}
.toggle::after{content:'';position:absolute;top:3px;right:3px;width:20px;height:20px;background:white;border-radius:50%;transition:transform .3s;box-shadow:0 1px 3px rgba(0,0,0,.15)}
.toggle.on::after{transform:translateX(-18px)}
`;

// ═══════════════════════════════════════════
// COMPONENTS
// ═══════════════════════════════════════════

function Post({ item, delay, onOpen, onSave, isSaved }) {
  const [liked, setLiked] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const needsTrunc = item.body && item.body.length > 100 && !expanded;

  return (
    <div className="post" style={{ animationDelay:`${delay}s` }}>
      <div className="ph">
        <div className="pav">{item.s.i}</div>
        <div className="pinfo">
          <span className="pname">{item.s.n}</span>
          <span className="ptime">{item.t}</span>
        </div>
        <button className="ib" style={{color:"var(--t4)"}}>{I.more()}</button>
      </div>
      {item.tag && <div className={`ptag ${item.brk?"brk":""}`}>{item.tag}</div>}
      <div className="ptitle" onClick={() => onOpen(item)} style={{cursor:"pointer"}}>{item.title}</div>
      {item.body && !needsTrunc && <div className="pbody">{item.body}</div>}
      {needsTrunc && <div className="pbody">{item.body.slice(0,100)}… <span className="pmore-t" onClick={()=>setExpanded(true)}>المزيد</span></div>}
      {(item.bg || item.realImg) && (
        <div className="strap" style={item.realImg ? {} : {background:item.bg}} onClick={() => onOpen(item)}>
          {item.realImg && <img src={item.realImg} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block",filter:"grayscale(100%) contrast(1.05)"}} onError={e=>{e.target.style.display="none"}} />}
          {item.vid && <><div className="strap-play">{I.play()}</div><div className="strap-dur">٢:٣٤</div></>}
        </div>
      )}
      <div className="pactions">
        <button className={`act ${liked?"liked":""}`} onClick={()=>setLiked(!liked)}>{I.heart(liked)} {item.lk}</button>
        <button className="act">{I.bubble()} {item.cm}</button>
        <button className="act">{I.repeat()} {item.sh}</button>
        <button className={`act ${isSaved?"saved":""}`} onClick={()=>onSave(item.id)}>{I.bookmark(isSaved)}</button>
      </div>
    </div>
  );
}

function ArticleDetail({ article, onClose, onSave, isSaved }) {
  return (
    <div className="detail">
      <div className="det-hdr">
        <button className="ib" onClick={onClose}>{I.back()}</button>
        <div style={{display:"flex",gap:14}}>
          <button className={`ib ${isSaved?"":"" }`} style={isSaved?{color:"var(--bk)"}:{}} onClick={()=>onSave(article.id)}>{I.bookmark(isSaved)}</button>
          <button className="ib">{I.share()}</button>
        </div>
      </div>
      {(article.bg || article.realImg) && (
        <div className="strap det-strap" style={article.realImg ? {} : {background:article.bg,borderRadius:0}}>
          {article.realImg && <img src={article.realImg} alt="" style={{width:"100%",height:"100%",objectFit:"cover",display:"block"}} onError={e=>{e.target.style.display="none"}} />}
        </div>
      )}
      <div className="det-body">
        <div className="det-tag-row">
          <span className="det-src">{article.s.n}</span>
          {article.tag && <div className={`ptag ${article.brk?"brk":""}`} style={{margin:0}}>{article.tag}</div>}
        </div>
        <div className="det-meta">
          <span>{article.t}</span>
          {article.lk && <span className="det-stat">{article.lk} تفاعل</span>}
        </div>
        <div className="det-title">{article.title}</div>
        {article.body && <div className="det-sub">{article.body}</div>}
        {article.link && article.link !== "#" && (
          <a href={article.link} target="_blank" rel="noopener noreferrer" style={{
            display:"block",background:"var(--bk)",color:"var(--bg)",textAlign:"center",
            padding:"12px",borderRadius:24,fontSize:14,fontWeight:600,textDecoration:"none",
            fontFamily:"var(--ft)",marginBottom:24
          }}>اقرأ من المصدر الأصلي</a>
        )}
        <p className="det-p">في تطور لافت يعكس التحولات المتسارعة في المنطقة، شهدت الأوساط الإقليمية والدولية اهتماماً واسعاً بهذا الحدث الذي يُعد من أبرز المحطات خلال العام الجاري. وقد أكد المراقبون أن هذه الخطوة تمثل نقلة نوعية.</p>
        <p className="det-p">وأشار الخبراء إلى أن التداعيات المترتبة ستكون بعيدة المدى، حيث من المتوقع أن تؤثر بشكل مباشر على مختلف القطاعات الاقتصادية والسياسية. كما لفتوا إلى ضرورة متابعة المستجدات عن كثب خلال الفترة المقبلة.</p>
        <p className="det-p">من جانبهم، رحّب عدد من المسؤولين بهذه المبادرة، معتبرين إياها خطوة إيجابية نحو تعزيز الاستقرار والتنمية المستدامة في المنطقة.</p>
      </div>
    </div>
  );
}

function SearchView({ onClose, feed = [], onOpen }) {
  const ref = useRef(null);
  const [query, setQuery] = useState("");
  useEffect(() => { ref.current?.focus(); }, []);
  
  const results = query.length > 1 
    ? feed.filter(item => 
        item.title?.includes(query) || 
        item.body?.includes(query) || 
        item.s?.n?.includes(query) ||
        item.tag?.includes(query)
      )
    : [];

  const tags = ["سياسة","اقتصاد","تقنية","رياضة","ثقافة","طاقة","ذكاء اصطناعي","مناخ","فضاء","صحة"];
  
  return (
    <div className="srch">
      <div className="srch-bar">
        {I.search()}
        <input ref={ref} className="srch-in" placeholder="ابحث في الأخبار..." value={query} onChange={e => setQuery(e.target.value)} />
        <button className="srch-c" onClick={onClose}>إلغاء</button>
      </div>

      {query.length > 1 && (
        <>
          <div className="srch-sec">{results.length > 0 ? `${results.length} نتيجة` : "لا توجد نتائج"}</div>
          {results.map((item, i) => (
            <div key={item.id} style={{padding:"14px 0",borderBottom:".5px solid var(--g1)",cursor:"pointer"}} onClick={() => { onOpen(item); onClose(); }}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                {item.tag && <div className={`ptag ${item.brk?"brk":""}`} style={{margin:0}}>{item.tag}</div>}
                <span style={{fontSize:12,fontWeight:700,color:"var(--t1)"}}>{item.s?.n}</span>
                <span style={{fontSize:11,color:"var(--t4)"}}>{item.t}</span>
              </div>
              <div style={{fontSize:15,fontWeight:700,lineHeight:1.7,color:"var(--t1)"}}>{item.title}</div>
            </div>
          ))}
        </>
      )}

      {query.length < 2 && (
        <>
          <div className="srch-sec">اكتشف</div>
          <div className="srch-tags">{tags.map((t,i) => <button key={i} className="srch-tag" onClick={() => setQuery(t)}>{t}</button>)}</div>
          <div className="srch-sec">مصادر مقترحة</div>
          {SOURCES.slice(0,5).map((s,i) => (
            <div key={i} style={{display:"flex",alignItems:"center",gap:12,padding:"12px 0",borderBottom:i<4?".5px solid var(--g1)":"none"}}>
              <div className="pav" style={{width:40,height:40,fontSize:15}}>{s.i}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:14,fontWeight:600,color:"var(--t1)"}}>{s.n}</div>
                <div style={{fontSize:11,color:"var(--t4)"}}>مصدر إخباري</div>
              </div>
              <button style={{fontSize:12,fontWeight:600,color:"var(--bk)",background:"none",border:"1px solid var(--g1)",borderRadius:20,padding:"5px 16px",cursor:"pointer",fontFamily:"var(--ft)"}}>متابعة</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}


function NewsMap({ onClose }) {
  const mapEl = useRef(null);
  const mapObj = useRef(null);
  const [sel, setSel] = useState(null);
  const [loaded, setLoaded] = useState(false);

  const MAP_SPOTS = [
    {id:1,lat:24.71,lng:46.68,city:"الرياض",country:"السعودية",heat:3,stories:[
      {title:"قمة الرياض تختتم بإعلان تاريخي — خارطة طريق اقتصادية جديدة",src:"الجزيرة",t:"٣ د",tag:"عاجل",lk:"12.4K"},
      {title:"ولي العهد يستقبل قادة ٢٠ دولة في قصر اليمامة",src:"العربية",t:"٣٠ د",lk:"8.1K"},
      {title:"إعلان تأسيس صندوق إقليمي بقيمة ١٠٠ مليار دولار",src:"CNBC عربية",t:"١ س",lk:"6.3K"},
    ]},
    {id:2,lat:25.20,lng:55.27,city:"دبي",country:"الإمارات",heat:3,stories:[
      {title:"إطلاق أول قمر صناعي عربي مشترك من قاعدة الإمارات",src:"BBC عربي",t:"٤٥ د",tag:"فيديو",lk:"31.5K"},
      {title:"المدن الذكية في الخليج — بين الطموح والواقع",src:"الجزيرة",t:"٤ س",tag:"تقرير",lk:"3.3K"},
    ]},
    {id:3,lat:30.04,lng:31.24,city:"القاهرة",country:"مصر",heat:2,stories:[
      {title:"مصر تعلن عن خطة استثمارية جديدة بقيمة ٣٠ مليار دولار",src:"العربية",t:"٥ س",lk:"4.2K"},
    ]},
    {id:4,lat:46.20,lng:6.14,city:"جنيف",country:"سويسرا",heat:2,stories:[
      {title:"محادثات جنيف تحقق اختراقاً دبلوماسياً بشأن الملف النووي",src:"سكاي نيوز",t:"٢ س",lk:"7.8K"},
    ]},
    {id:5,lat:38.91,lng:-77.04,city:"واشنطن",country:"أمريكا",heat:2,stories:[
      {title:"الدولار يتراجع أمام سلة العملات بعد بيانات التوظيف",src:"رويترز",t:"٢٨ د",lk:"3.2K"},
    ]},
    {id:6,lat:39.90,lng:116.41,city:"بكين",country:"الصين",heat:2,stories:[
      {title:"الصين تكشف عن سياسة تجارية جديدة تجاه دول الخليج",src:"رويترز",t:"٣ س",lk:"5.1K"},
    ]},
    {id:7,lat:51.51,lng:-0.13,city:"لندن",country:"بريطانيا",heat:1,stories:[
      {title:"بريطانيا تطلق صندوقاً استثمارياً مشتركاً مع دول الخليج",src:"BBC عربي",t:"٦ س",lk:"1.9K"},
    ]},
    {id:8,lat:33.89,lng:35.50,city:"بيروت",country:"لبنان",heat:1,stories:[
      {title:"لبنان يشهد تطورات سياسية جديدة مع تشكيل الحكومة",src:"الجزيرة",t:"٧ س",lk:"2.3K"},
    ]},
    {id:9,lat:21.42,lng:39.83,city:"مكة",country:"السعودية",heat:1,stories:[
      {title:"توسعة جديدة في المسجد الحرام تستوعب مليون مصلٍّ إضافي",src:"العربية",t:"١٠ س",lk:"9.7K"},
    ]},
    {id:10,lat:25.29,lng:51.53,city:"الدوحة",country:"قطر",heat:2,stories:[
      {title:"قطر توقّع اتفاقية غاز طبيعي مسال طويلة الأمد مع ألمانيا",src:"الجزيرة",t:"٥ س",lk:"4.5K"},
    ]},
    {id:11,lat:48.86,lng:2.35,city:"باريس",country:"فرنسا",heat:1,stories:[
      {title:"فرنسا تستضيف مؤتمراً دولياً حول مستقبل الطاقة النظيفة",src:"فرانس ٢٤",t:"٨ س",lk:"2.1K"},
    ]},
    {id:12,lat:35.68,lng:139.65,city:"طوكيو",country:"اليابان",heat:1,stories:[
      {title:"اليابان تعلن شراكة تقنية مع الإمارات في الذكاء الاصطناعي",src:"دويتشه فيله",t:"٩ س",lk:"1.8K"},
    ]},
  ];

  useEffect(() => {
    // Load Leaflet CSS
    if (!document.getElementById('lf-css')) {
      const lk = document.createElement('link');
      lk.id = 'lf-css'; lk.rel = 'stylesheet';
      lk.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
      document.head.appendChild(lk);
    }
    // Load Leaflet JS
    const boot = () => { if (window.L) return init(); const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js'; s.onload = init; document.head.appendChild(s); };
    const init = () => {
      if (mapObj.current || !mapEl.current) return;
      const L = window.L;
      // Marker styles
      if (!document.getElementById('lf-hs')) {
        const st = document.createElement('style'); st.id = 'lf-hs';
        st.textContent = `
          .leaflet-container{background:#050505!important}
          .leaflet-control-attribution,.leaflet-control-zoom{display:none!important}
          .hm{position:relative;display:flex;align-items:center;justify-content:center}
          .hm-dot{border-radius:50%;z-index:2;cursor:pointer;transition:transform .15s}
          .hm-r{position:absolute;top:50%;left:50%;border-radius:50%;pointer-events:none}
          .hm-r1{animation:hmR 2.8s ease-out infinite}
          .hm-r2{animation:hmR 2.8s ease-out infinite 1s}
          @keyframes hmR{0%{width:6px;height:6px;opacity:.6;transform:translate(-50%,-50%)}100%{width:50px;height:50px;opacity:0;transform:translate(-50%,-50%)}}
          .hm-lb{position:absolute;top:calc(100% + 3px);left:50%;transform:translateX(-50%);font-size:11px;font-weight:700;color:rgba(255,255,255,.4);white-space:nowrap;font-family:-apple-system,"SF Arabic",system-ui,sans-serif;pointer-events:none;text-shadow:0 1px 8px rgba(0,0,0,.9)}
          .hm-badge{position:absolute;top:-7px;right:-11px;background:rgba(255,255,255,.95);color:#050505;font-size:9px;font-weight:800;min-width:17px;height:17px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;z-index:3;pointer-events:none;font-family:system-ui;box-shadow:0 1px 4px rgba(0,0,0,.3)}
        `;
        document.head.appendChild(st);
      }
      const map = L.map(mapEl.current, { center:[28,42], zoom:3, minZoom:2, maxZoom:14, zoomControl:false, attributionControl:false, zoomSnap:0.5 });
      L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { subdomains:'abcd', maxZoom:19 }).addTo(map);

      MAP_SPOTS.forEach(h => {
        const sz = h.heat>=3?14:h.heat>=2?10:7;
        const clr = h.heat>=3?'#fff':h.heat>=2?'rgba(255,255,255,.6)':'rgba(255,255,255,.35)';
        const glow = h.heat>=3?'0 0 18px rgba(255,255,255,.5)':h.heat>=2?'0 0 10px rgba(255,255,255,.2)':'none';
        const icon = L.divIcon({
          className:'hm',
          html:`<div class="hm-r hm-r1" style="border:1.5px solid ${clr}"></div><div class="hm-r hm-r2" style="border:1px solid ${clr}"></div><div class="hm-dot" style="width:${sz}px;height:${sz}px;background:${clr};box-shadow:${glow}"></div>${h.stories.length>1?`<span class="hm-badge">${h.stories.length}</span>`:''}<span class="hm-lb">${h.city}</span>`,
          iconSize:[sz,sz], iconAnchor:[sz/2,sz/2],
        });
        L.marker([h.lat,h.lng],{icon}).addTo(map).on('click',()=>{
          setSel(prev=>prev?.id===h.id?null:h);
          map.flyTo([h.lat,h.lng],Math.max(map.getZoom(),6),{duration:0.8});
        });
      });

      map.on('click',()=>setSel(null));
      mapObj.current = map;
      setLoaded(true);
    };
    boot();
    return () => { if(mapObj.current){mapObj.current.remove();mapObj.current=null;} };
  }, []);

  const total = MAP_SPOTS.reduce((a,h) => a+h.stories.length, 0);

  return (
    <div className="mview">
      <div ref={mapEl} style={{width:"100%",height:"100%",position:"absolute",top:0,left:0}} />
      {!loaded && <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",color:"rgba(255,255,255,.25)",fontSize:13,zIndex:500}}>جاري تحميل الخريطة...</div>}

      {/* Header */}
      <div style={{position:"absolute",top:0,left:0,right:0,zIndex:1000,padding:"44px 20px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",background:"linear-gradient(rgba(5,5,5,.9) 40%,transparent)",pointerEvents:"none",direction:"rtl"}}>
        <div style={{display:"flex",alignItems:"baseline",pointerEvents:"all"}}>
          <span style={{fontSize:20,fontWeight:800,color:"rgba(255,255,255,.9)",letterSpacing:"-.5px"}}>خريطة صَدى</span>
          <span style={{fontSize:11,color:"rgba(255,255,255,.2)",marginRight:8}}>مباشر</span>
        </div>
        <button style={{pointerEvents:"all",background:"rgba(255,255,255,.08)",border:"none",cursor:"pointer",color:"rgba(255,255,255,.6)",display:"flex",padding:8,borderRadius:"50%",backdropFilter:"blur(10px)"}} onClick={onClose}>{I.close()}</button>
      </div>

      {/* Stats */}
      <div style={{position:"absolute",top:88,left:0,right:0,zIndex:1000,display:"flex",justifyContent:"center",gap:8,pointerEvents:"none",direction:"rtl"}}>
        <div className="msi"><div className="msd" style={{background:"#fff"}}/>{MAP_SPOTS.length} مواقع</div>
        <div className="msi"><div className="msd" style={{background:"rgba(255,255,255,.4)"}}/>{total} خبر</div>
        <div className="msi"><div className="msd" style={{background:"#C62828",animation:"liveP 1.5s infinite"}}/>مباشر</div>
      </div>

      {/* Bottom sheet */}
      {sel && (
        <div className="mcard" key={sel.id} onClick={e=>e.stopPropagation()}>
          <div className="mcard-h"/>
          <div style={{padding:"12px 20px 8px",borderBottom:".5px solid var(--g1)"}}>
            <div className="mcard-loc">
              <span className="mcard-city">{sel.city}</span>
              <span style={{width:3,height:3,background:"var(--t4)",borderRadius:"50%"}}/>
              <span className="mcard-reg">{sel.country}</span>
            </div>
            <div style={{fontSize:11,color:"var(--t4)",marginTop:3}}>{sel.stories.length} {sel.stories.length>1?"أخبار":"خبر"}</div>
          </div>
          <div style={{flex:1,overflowY:"auto",WebkitOverflowScrolling:"touch",maxHeight:"35vh"}}>
            {sel.stories.map((s,i) => (
              <div key={i} style={{padding:"14px 20px",borderBottom:i<sel.stories.length-1?".5px solid var(--g1)":"none",cursor:"pointer"}}>
                {s.tag && <div className={`mcard-tag ${s.tag==="عاجل"?"brk":""}`}>{s.tag}</div>}
                <div style={{fontSize:15,fontWeight:700,lineHeight:1.7,color:"var(--t1)",marginBottom:4}}>{s.title}</div>
                <div className="mcard-meta">
                  <span>{s.src}</span><span>·</span><span>{s.t}</span>
                  {s.lk&&<><span>·</span><span>{s.lk} تفاعل</span></>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BookmarksView({ savedIds, onOpen, allFeed = [] }) {
  const pool = allFeed.length > 0 ? allFeed : FEED;
  const saved = pool.filter(f => savedIds.has(f.id));
  if (saved.length === 0) return (
    <div className="empty">
      <div className="empty-icon">{I.bookmark(false)}</div>
      <div className="empty-title">لا توجد محفوظات</div>
      <div className="empty-sub">اضغط على أيقونة الحفظ في أي خبر لإضافته هنا</div>
    </div>
  );
  return saved.map((item,i) => (
    <div key={item.id} className="post" style={{animationDelay:`${i*.05}s`,cursor:"pointer"}} onClick={()=>onOpen(item)}>
      <div className="ph">
        <div className="pav">{item.s.i}</div>
        <div className="pinfo"><span className="pname">{item.s.n}</span><span className="ptime">{item.t}</span></div>
      </div>
      {item.tag&&<div className={`ptag ${item.brk?"brk":""}`}>{item.tag}</div>}
      <div className="ptitle">{item.title}</div>
      {item.body&&<div className="pbody" style={{WebkitLineClamp:2,display:"-webkit-box",WebkitBoxOrient:"vertical",overflow:"hidden"}}>{item.body}</div>}
    </div>
  ));
}

function SettingsView({ sources, toggleSource }) {
  return (
    <>
      <div className="set-sec">
        <div className="set-sec-title">المصادر</div>
        {SOURCES.map((s,i) => (
          <div className="set-row" key={i}>
            <div style={{display:"flex",alignItems:"center",gap:10}}>
              <div className="pav" style={{width:32,height:32,fontSize:12}}>{s.i}</div>
              <span className="set-name">{s.n}</span>
            </div>
            <button className={`toggle ${sources[i]!==false?"on":""}`} onClick={()=>toggleSource(i)}/>
          </div>
        ))}
      </div>
      <div className="set-sec">
        <div className="set-sec-title">التفضيلات</div>
        <div className="set-row"><span className="set-name">إشعارات الأخبار العاجلة</span><button className="toggle on"/></div>
        <div className="set-row"><span className="set-name">الوضع الداكن</span><button className="toggle"/></div>
        <div className="set-row"><span className="set-name">تشغيل الفيديو تلقائياً</span><button className="toggle"/></div>
      </div>
      <div className="set-sec">
        <div className="set-sec-title">الخوارزمية</div>
        <div style={{fontSize:13,color:"var(--t2)",lineHeight:1.8}}>
          يتعلم التطبيق تلقائياً من أنماط قراءتك ليقدم لك المحتوى الأكثر صلة باهتماماتك. كلما استخدمت التطبيق أكثر، أصبحت التوصيات أدق.
        </div>
      </div>
      <div style={{padding:20,textAlign:"center"}}>
        <div style={{fontSize:11,color:"var(--t4)",marginBottom:4}}>صَدى v1.0</div>
        <div style={{fontSize:11,color:"var(--t4)"}}>أخبار العالم في مكانٍ واحد</div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════

export default function Sada() {
  const [nav, setNav] = useState("home");
  const [feedTab, setFeedTab] = useState("foryou");
  const [article, setArticle] = useState(null);
  const [srch, setSrch] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [sources, setSources] = useState({});

  // ── Persistent Bookmarks (survives refresh) ──
  const [savedIds, setSavedIds] = useState(() => {
    try {
      const stored = localStorage.getItem('sada-bookmarks');
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch { return new Set(); }
  });

  const toggleSave = useCallback((id) => {
    setSavedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      // Persist to localStorage
      try { localStorage.setItem('sada-bookmarks', JSON.stringify([...next])); } catch {}
      return next;
    });
  }, []);

  // ── Persistent Source Preferences ──
  useEffect(() => {
    try {
      const stored = localStorage.getItem('sada-sources');
      if (stored) setSources(JSON.parse(stored));
    } catch {}
  }, []);

  const toggleSource = useCallback((i) => {
    setSources(prev => {
      const next = {...prev, [i]: prev[i] === false ? true : false};
      try { localStorage.setItem('sada-sources', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  // ── Real news data ──
  const { feed: liveFeed, loading, isLive, refresh } = useNews();
  const allFeed = liveFeed.length > 0 ? liveFeed.map((item, i) => ({
    id: item.id || `item-${i}`,
    s: { n: item.source?.name || "مصدر", i: item.source?.initial || "?" },
    t: item.time || "الآن",
    title: item.title,
    body: item.body,
    bg: item.image ? null : (i % 3 === 0 ? "linear-gradient(135deg,#1a1a2e,#0f3460)" : i % 3 === 1 ? "linear-gradient(135deg,#2d3436,#636e72)" : null),
    realImg: item.image || null,
    link: item.link,
    tag: item.categories?.[0] || null,
    brk: item.categories?.[0] === "عاجل",
    lk: `${Math.floor(Math.random()*15+1)}.${Math.floor(Math.random()*9)}K`,
    cm: `${Math.floor(Math.random()*3000)}`,
    sh: `${Math.floor(Math.random()*5+1)}.${Math.floor(Math.random()*9)}K`,
  })) : FEED;

  // ── Source Filtering ──
  const sourcedFeed = allFeed.filter(item => {
    const srcIdx = SOURCES.findIndex(s => s.n === item.s?.n);
    if (srcIdx === -1) return true; // unknown source, keep
    return sources[srcIdx] !== false; // only hide if explicitly disabled
  });

  // ── Tab Filtering ──
  const displayFeed = (() => {
    switch(feedTab) {
      case "breaking":
        return sourcedFeed.filter(item => item.brk || item.tag === "عاجل");
      case "trending":
        // Sort by engagement (parse the lk field)
        return [...sourcedFeed].sort((a, b) => {
          const parseK = (v) => { if (!v) return 0; const n = parseFloat(v); return v.includes('K') ? n * 1000 : n; };
          return parseK(b.lk) - parseK(a.lk);
        });
      case "following":
        // Show only from explicitly enabled sources (or all if none toggled)
        const hasFollowed = Object.values(sources).some(v => v === true);
        if (!hasFollowed) return sourcedFeed;
        return sourcedFeed.filter(item => {
          const srcIdx = SOURCES.findIndex(s => s.n === item.s?.n);
          return sources[srcIdx] === true;
        });
      default: // "foryou"
        return sourcedFeed;
    }
  })();

  // ── Pull to Refresh ──
  const handleRefresh = useCallback(() => {
    if (refresh) refresh();
  }, [refresh]);

  const navItems = [
    { id:"home", label:"الرئيسية", icon:(f)=>I.home(f) },
    { id:"map", label:"خريطة", icon:(f)=>I.map(f) },
    { id:"saved", label:"المحفوظات", icon:(f)=>I.saved(f) },
    { id:"settings", label:"الإعدادات", icon:()=>I.user() },
  ];

  return (
    <>
      <style>{css}</style>
      <div className="app">
        {/* Status bar */}
        <div className="sb">
          <span>٩:٤١</span>
          <div style={{display:"flex",gap:6,alignItems:"center"}}>
            <svg width="16" height="12" viewBox="0 0 16 12"><rect x="0" y="6" width="3" height="6" rx="1" fill="#111"/><rect x="4.5" y="4" width="3" height="8" rx="1" fill="#111"/><rect x="9" y="2" width="3" height="10" rx="1" fill="#111"/><rect x="13.5" y="0" width="3" height="12" rx="1" fill="#111" opacity=".3"/></svg>
            <svg width="25" height="12" viewBox="0 0 25 12"><rect x="0" y="1" width="22" height="10" rx="2" stroke="#111" strokeWidth="1" fill="none"/><rect x="23" y="4" width="2" height="4" rx="1" fill="#111" opacity=".4"/><rect x="1.5" y="2.5" width="16" height="7" rx="1" fill="#111"/></svg>
          </div>
        </div>

        {/* Header */}
        <div className="hdr">
          <div className="logo">صَدى</div>
          <div className="hdr-r">
            <button className="ib" onClick={()=>setSrch(true)}>{I.search()}</button>
            <button className="ib" onClick={handleRefresh} style={loading?{animation:"spin 1s linear infinite"}:{}}>{I.globe()}</button>
            <button className="ib ndot">{I.bell()}</button>
          </div>
        </div>

        {/* Feed tabs (only on home) */}
        {nav === "home" && (
          <div className="tabs">
            {[{id:"foryou",l:"لك"},{id:"following",l:"متابَع"},{id:"breaking",l:"عاجل"},{id:"trending",l:"رائج"}].map(t=>(
              <button key={t.id} className={`tab ${feedTab===t.id?"on":""}`} onClick={()=>setFeedTab(t.id)}>{t.l}</button>
            ))}
          </div>
        )}

        {/* Page title for non-home */}
        {nav !== "home" && (
          <div style={{padding:"0 20px 12px",fontSize:20,fontWeight:800,color:"var(--bk)",borderBottom:".5px solid var(--g1)"}}>
            {nav === "saved" && "المحفوظات"}
            {nav === "settings" && "الإعدادات"}
            {nav === "map" && "خريطة الأخبار"}
          </div>
        )}

        {/* Content */}
        <div className="content">
          {nav === "home" && (
            <>
              {isLive && (
                <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,padding:"8px 0",fontSize:11,color:"var(--t4)"}}>
                  <div style={{width:5,height:5,borderRadius:"50%",background:"#4CAF50"}}/>
                  أخبار مباشرة · {allFeed.length} خبر
                </div>
              )}
              <div className="stories">
                {SOURCES.map((s,i) => (
                  <div className="story" key={i} onClick={() => { setSources(prev => ({...prev, [i]: prev[i] === true ? undefined : true})); setFeedTab("following"); }}>
                    <div className={`s-ring ${sources[i]===true?"":"seen"}`}><div className="s-av">{s.i}</div></div>
                    <div className="s-nm">{s.n}</div>
                  </div>
                ))}
              </div>
              {loading && (
                <div style={{padding:"40px 20px",textAlign:"center",color:"var(--t4)",fontSize:13}}>
                  جاري تحميل الأخبار...
                </div>
              )}
              {!loading && displayFeed.length === 0 && (
                <div style={{padding:"40px 20px",textAlign:"center",color:"var(--t4)",fontSize:13}}>
                  لا توجد أخبار في هذا التصنيف
                </div>
              )}
              {!loading && displayFeed.map((item,i) => (
                <Post key={item.id} item={item} delay={i*.04} onOpen={setArticle} onSave={toggleSave} isSaved={savedIds.has(item.id)} />
              ))}
              <div style={{height:20}} />
            </>
          )}

          {nav === "map" && <NewsMap onClose={()=>setNav("home")} />}

          {nav === "saved" && <BookmarksView savedIds={savedIds} onOpen={setArticle} allFeed={allFeed} />}

          {nav === "settings" && <SettingsView sources={sources} toggleSource={toggleSource} />}
        </div>

        {/* Bottom Nav */}
        <div className="bnav">
          {navItems.map(item => (
            <button key={item.id} className={`bnav-item ${nav===item.id?"on":""}`} onClick={()=>{if(item.id==="map"){setMapOpen(true);setNav("map")}else{setNav(item.id);setMapOpen(false)}}}>
              {item.icon(nav === item.id)}
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Overlays */}
        {article && <ArticleDetail article={article} onClose={()=>setArticle(null)} onSave={toggleSave} isSaved={savedIds.has(article.id)} />}
        {srch && <SearchView onClose={()=>setSrch(false)} feed={allFeed} onOpen={setArticle} />}
      </div>
    </>
  );
}
