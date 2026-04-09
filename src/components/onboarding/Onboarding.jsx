import { useState, useEffect } from 'react';
import { I } from '../shared/Icons';
import { SOURCES } from '../../data/sources';
import { TOPICS, REGIONS } from '../../data/topics';

const SPLASH_DOTS = Array.from({ length: 24 }, (_, i) => ({
  w: ((i * 13) % 3) + 1, l: (i * 37) % 100, t: (i * 53) % 100, o: (((i * 17) % 5) + 1) * 0.04,
}));

// ═══════════════════════════════════════════
// ONBOARDING SUB-COMPONENTS
// ═══════════════════════════════════════════

function ObSplash({ onNext }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), 80); return () => clearTimeout(t); }, []);
  return (
    <div className="ob" style={{ alignItems:'center', justifyContent:'center', textAlign:'center' }}>
      <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
        {SPLASH_DOTS.map((d,i) => <div key={i} style={{ position:'absolute', width:d.w+'px', height:d.w+'px', borderRadius:'50%', background:`rgba(255,255,255,${d.o})`, left:d.l+'%', top:d.t+'%' }}/>)}
      </div>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, transition:'all 1s cubic-bezier(.175,.885,.32,1.275)', opacity:vis?1:0, transform:vis?'scale(1)':'scale(0.8)' }}>
        <div style={{ width:64, height:64, background:'#fff', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', fontSize:32, fontWeight:900, color:'#000' }}>غ</div>
        <div style={{ fontSize:42, fontWeight:800, color:'#fff', letterSpacing:'-1px', animation:vis?'logoPulse 4s ease infinite':'none' }}>غرفة الأخبار</div>
      </div>
      <div style={{ fontSize:15, color:'rgba(255,255,255,.35)', marginTop:14, fontWeight:300, letterSpacing:'.5px', opacity:vis?1:0, transition:'opacity 1s ease .5s' }}>أخبار العالم، بنبضٍ عربي</div>
      <div style={{ marginTop:64, width:'100%', maxWidth:320, padding:'0 32px', opacity:vis?1:0, transform:vis?'translateY(0)':'translateY(24px)', transition:'all .8s ease 1s' }}>
        <button className="ob-btn" onClick={onNext}>ابدأ الآن</button>
        <div style={{ marginTop:20, fontSize:11, color:'rgba(255,255,255,.2)' }}>خطوتان فقط لتخصيص تجربتك</div>
      </div>
    </div>
  );
}

function ObSources({ sel, toggle, onNext }) {
  return (
    <div className="ob" style={{ padding:'44px 0 0' }}>
      <div className="ob-prog" style={{ marginBottom:32 }}>{[0,1,2].map(i=><div key={i} className={`ob-prog-dot ${i===0?'done':''}`}/>)}</div>
      <div style={{ padding:'0 24px', flex:1, overflow:'hidden', display:'flex', flexDirection:'column' }}>
        <div className="ob-title">اختر مصادرك</div>
        <div className="ob-sub">اختر ٣ مصادر أو أكثر — تظهر أخبارها أولاً في تغذيتك</div>
        <div style={{ flex:1, overflowY:'auto', marginBottom:16 }}>
          {SOURCES.map(s => { const on=sel.has(s.id); return (
            <button key={s.id} className={`ob-src ${on?'sel':''}`} onClick={() => toggle(s.id)}>
              <div className="ob-src-chk">{on && I.check()}</div>
              <div className="ob-src-name">{s.n}</div>
              <div className="ob-src-av">{s.i}</div>
            </button>
          );})}
        </div>
        <div style={{ padding:'12px 0 32px', flexShrink:0 }}>
          <button className="ob-btn" onClick={onNext} disabled={sel.size<3}>التالي ({sel.size} مختار)</button>
        </div>
      </div>
    </div>
  );
}

function ObTopics({ sel, toggle, onNext }) {
  return (
    <div className="ob" style={{ padding:'44px 24px 0' }}>
      <div className="ob-prog" style={{ padding:0, marginBottom:32 }}>{[0,1,2].map(i=><div key={i} className={`ob-prog-dot ${i<=1?'done':''}`}/>)}</div>
      <div className="ob-title">ما الذي يهمك؟</div>
      <div className="ob-sub">اختياراتك تُشكّل تبويب "مهم" في تغذيتك اليومية</div>
      <div style={{ flex:1, overflowY:'auto', marginBottom:16 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingBottom:20 }}>
          {TOPICS.map(t => (
            <button key={t.id} className={`ob-chip ${sel.has(t.id)?'sel':''}`} onClick={() => toggle(t.id)}>
              <span>{t.icon}</span>{t.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 0 32px', flexShrink:0 }}>
        <button className="ob-btn" onClick={onNext}>{sel.size>0?`التالي (${sel.size} مجالات)`:'التالي'}</button>
        <button className="ob-btn-sec" onClick={onNext}>تخطّ</button>
      </div>
    </div>
  );
}

function ObRegions({ sel, toggle, onNext }) {
  return (
    <div className="ob" style={{ padding:'44px 24px 0' }}>
      <div className="ob-prog" style={{ padding:0, marginBottom:32 }}>{[0,1,2].map(i=><div key={i} className="ob-prog-dot done"/>)}</div>
      <div className="ob-title">من أين تتابع؟</div>
      <div className="ob-sub">نرتّب الأخبار الإقليمية حسب اهتمامك الجغرافي</div>
      <div style={{ flex:1, overflowY:'auto', marginBottom:16 }}>
        <div style={{ display:'flex', flexWrap:'wrap', gap:10, paddingBottom:20 }}>
          {REGIONS.map(r => (
            <button key={r.id} className={`ob-chip ${sel.has(r.id)?'sel':''}`} onClick={() => toggle(r.id)}>
              <span>{r.flag}</span>{r.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ padding:'0 0 32px', flexShrink:0 }}>
        <button className="ob-btn" onClick={onNext}>إنشاء غرفتي الإخبارية</button>
        <button className="ob-btn-sec" onClick={onNext}>تخطّ</button>
      </div>
    </div>
  );
}

function ObReady({ selSources, selTopics, onDone }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t=setTimeout(()=>setVis(true),100); return ()=>clearTimeout(t); }, []);
  const topicLabels = [...selTopics].map(id=>TOPICS.find(t=>t.id===id)?.label).filter(Boolean).slice(0,3);
  return (
    <div className="ob" style={{ alignItems:'center', justifyContent:'center', textAlign:'center', padding:'0 32px' }}>
      <div style={{ opacity:vis?1:0, transform:vis?'scale(1)':'scale(0.9)', transition:'all .8s cubic-bezier(.175,.885,.32,1.275)' }}>
        <div style={{ fontSize:48, marginBottom:16 }}>✓</div>
        <div style={{ fontSize:28, fontWeight:800, color:'#fff', marginBottom:10 }}>غرفتك جاهزة</div>
        <div style={{ fontSize:14, color:'rgba(255,255,255,.35)', lineHeight:1.8, marginBottom:10 }}>{selSources.size} مصدر مختار</div>
        {topicLabels.length>0 && <div style={{ fontSize:13, color:'rgba(255,255,255,.25)', marginBottom:32 }}>يتابع: {topicLabels.join(' · ')}{selTopics.size>3?` +${selTopics.size-3}`:''}</div>}
        <button className="ob-btn" onClick={onDone} style={{ maxWidth:300 }}>ادخل إلى غرفة الأخبار</button>
        <div style={{ fontSize:11, color:'rgba(255,255,255,.2)', marginTop:16 }}>
          يمكنك إنشاء حساب لاحقاً من الإعدادات
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════

export function Onboarding({ onDone }) {
  const [step, setStep]             = useState(0);
  const [selSrcs, setSelSrcs]       = useState(() => new Set(['aljazeera','alarabiya','bbc']));
  const [selTopics, setSelTopics]   = useState(() => new Set());
  const [selRegions, setSelRegions] = useState(() => new Set(['gulf']));

  const toggleSrc = (id) => setSelSrcs(prev => {
    const n = new Set(prev); if (n.has(id) && n.size <= 3) return n;
    n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  const finish = () => {
    const prefs = { topics:[...selTopics], regions:[...selRegions], sources:[...selSrcs] };
    try { localStorage.setItem('sada-ob-done','1'); localStorage.setItem('sada-prefs',JSON.stringify(prefs)); } catch {}
    onDone(prefs);
  };

  return (
    <>
      {step===0 && <ObSplash onNext={()=>setStep(1)}/>}
      {step===1 && <ObSources sel={selSrcs} toggle={toggleSrc} onNext={()=>setStep(2)}/>}
      {step===2 && <ObTopics sel={selTopics} toggle={id=>setSelTopics(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;})} onNext={()=>setStep(3)}/>}
      {step===3 && <ObRegions sel={selRegions} toggle={id=>setSelRegions(p=>{const n=new Set(p);n.has(id)?n.delete(id):n.add(id);return n;})} onNext={()=>setStep(4)}/>}
      {step===4 && <ObReady selSources={selSrcs} selTopics={selTopics} onDone={finish}/>}
    </>
  );
}
