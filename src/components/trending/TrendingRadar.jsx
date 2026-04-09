import { useMemo, useState, useEffect, useRef, useCallback } from 'react';
import { Sound } from '../../lib/sounds';

if (typeof document !== 'undefined' && !document.getElementById('radar-css')) {
  const s = document.createElement('style');
  s.id = 'radar-css';
  s.textContent = `
    @keyframes radar-sweep{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
    @keyframes radar-ping{0%,100%{opacity:.4;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
    @keyframes radar-fade{0%{opacity:0;transform:scale(.8)}100%{opacity:1;transform:scale(1)}}
    @keyframes radar-line-fade{0%{opacity:.5}100%{opacity:0}}
    @keyframes radar-boot{0%{transform:scale(0);opacity:0}60%{transform:scale(1.04);opacity:1}100%{transform:scale(1);opacity:1}}
    @keyframes radar-ring-expand{0%{transform:scale(0);opacity:0}70%{opacity:.6}100%{transform:scale(1);opacity:1}}
    @keyframes radar-blip-drop{0%{opacity:0;transform:translateY(-20px) scale(0)}60%{opacity:1;transform:translateY(2px) scale(1.05)}100%{transform:translateY(0) scale(1);opacity:1}}
    @keyframes radar-detect{0%{box-shadow:0 0 6px rgba(229,57,53,.4)}30%{box-shadow:0 0 24px rgba(229,57,53,1),0 0 48px rgba(229,57,53,.4)}100%{box-shadow:0 0 6px rgba(229,57,53,.4)}}
    @keyframes radar-ripple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(3);opacity:0}}
    @keyframes radar-scanline{0%{opacity:0;transform:scaleX(0)}50%{opacity:.4}100%{opacity:0;transform:scaleX(1)}}

    /* Inline mini radar */
    .radar{position:relative;width:100%;height:220px;overflow:hidden;background:radial-gradient(circle at 50% 110%,rgba(229,57,53,.06) 0%,transparent 60%);border-bottom:.5px solid var(--g1)}
    .radar-disc{position:absolute;bottom:-110px;left:50%;transform:translateX(-50%);width:340px;height:340px;border-radius:50%;border:1px solid var(--g1)}

    /* Full-screen radar */
    .radar-full{position:relative;width:100%;min-height:calc(100vh - 140px);overflow:hidden;background:var(--bg)}
    .radar-full .rf-header{padding:16px 20px;display:flex;align-items:center;gap:8px;border-bottom:.5px solid var(--g1)}
    .radar-full .rf-title{font-size:20px;font-weight:800;color:var(--t1)}
    .radar-full .rf-sub{font-size:12px;color:var(--t3);padding:0 20px;margin-top:8px}
    .radar-full .rf-disc-wrap{position:relative;width:100%;height:360px;display:flex;align-items:center;justify-content:center;margin-top:10px}
    .radar-full .rf-disc{position:relative;width:320px;height:320px;border-radius:50%;border:1px solid var(--g1)}
    .radar-full .rf-ring1{position:absolute;inset:40px;border-radius:50%;border:1px solid var(--g1);opacity:.5}
    .radar-full .rf-ring2{position:absolute;inset:80px;border-radius:50%;border:1px solid var(--g1);opacity:.3}
    .radar-full .rf-ring3{position:absolute;inset:120px;border-radius:50%;border:1px solid var(--g1);opacity:.15}
    .radar-full .rf-cross-h{position:absolute;top:50%;left:0;right:0;height:1px;background:var(--g1);opacity:.25}
    .radar-full .rf-cross-v{position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--g1);opacity:.25}
    .radar-full .rf-diag1{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(45deg,transparent 49.5%,var(--g1) 49.5%,var(--g1) 50.5%,transparent 50.5%);opacity:.15}
    .radar-full .rf-diag2{position:absolute;top:0;left:0;right:0;bottom:0;background:linear-gradient(-45deg,transparent 49.5%,var(--g1) 49.5%,var(--g1) 50.5%,transparent 50.5%);opacity:.15}
    .radar-full .rf-sweep{position:absolute;inset:0;border-radius:50%;animation:radar-sweep 3.5s linear infinite;transform-origin:center}
    .radar-full .rf-sweep::after{content:'';position:absolute;top:0;left:50%;width:50%;height:50%;transform-origin:bottom left;background:conic-gradient(from 0deg,transparent 0deg,rgba(229,57,53,.3) 25deg,transparent 50deg)}
    .radar-full .rf-center{position:absolute;top:50%;left:50%;width:8px;height:8px;border-radius:50%;background:#E53935;transform:translate(-50%,-50%);box-shadow:0 0 12px rgba(229,57,53,.7),0 0 24px rgba(229,57,53,.3)}
    .radar-full .rf-blip{position:absolute;cursor:pointer;text-align:center;animation:radar-fade .5s ease both;transition:all .2s}
    .radar-full .rf-blip:active{transform:scale(.92)}
    .rf-dot{width:10px;height:10px;border-radius:50%;background:#E53935;margin:0 auto 5px;box-shadow:0 0 8px rgba(229,57,53,.5);transition:transform .2s}
    .rf-dot.hot{width:14px;height:14px;animation:radar-ping 2s ease infinite;box-shadow:0 0 14px rgba(229,57,53,.8)}
    .rf-label{font-size:13px;font-weight:800;color:var(--t1);white-space:nowrap}
    .rf-count{font-size:10px;color:var(--t3);font-weight:600}
    .rf-blip.on .rf-label{color:#E53935}
    .rf-blip.on .rf-dot{background:#E53935;box-shadow:0 0 18px rgba(229,57,53,.9)}

    /* Trending list below radar */
    .rf-list{padding:0 20px 20px}
    .rf-list-title{font-size:11px;font-weight:700;color:var(--t4);letter-spacing:1.5px;padding:16px 0 10px}
    .rf-item{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:.5px solid var(--g1);cursor:pointer;transition:opacity .15s}
    .rf-item:active{opacity:.5}
    .rf-rank{width:24px;height:24px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;flex-shrink:0}
    .rf-rank.top{background:#E53935;color:#fff}
    .rf-rank.mid{background:var(--g1);color:var(--t2)}
    .rf-item-word{flex:1;font-size:15px;font-weight:700;color:var(--t1)}
    .rf-item-count{font-size:12px;color:var(--t3);font-weight:600}
    .rf-item-bar{width:60px;height:4px;border-radius:2px;background:var(--g1);overflow:hidden;flex-shrink:0}
    .rf-item-fill{height:100%;border-radius:2px;background:#E53935;transition:width .3s}

    /* Mini radar reused classes */
    .radar-ring1{position:absolute;inset:45px;border-radius:50%;border:1px solid var(--g1);opacity:.6}
    .radar-ring2{position:absolute;inset:90px;border-radius:50%;border:1px solid var(--g1);opacity:.3}
    .radar-cross-h{position:absolute;top:50%;left:0;right:0;height:1px;background:var(--g1);opacity:.3}
    .radar-cross-v{position:absolute;left:50%;top:0;bottom:0;width:1px;background:var(--g1);opacity:.3}
    .radar-sweep{position:absolute;inset:0;border-radius:50%;animation:radar-sweep 4s linear infinite;transform-origin:center}
    .radar-sweep::after{content:'';position:absolute;top:0;left:50%;width:50%;height:50%;transform-origin:bottom left;background:conic-gradient(from 0deg,transparent 0deg,rgba(229,57,53,.25) 30deg,transparent 60deg)}
    .radar-center{position:absolute;top:50%;left:50%;width:6px;height:6px;border-radius:50%;background:#E53935;transform:translate(-50%,-50%);box-shadow:0 0 8px rgba(229,57,53,.6)}
    .radar-blip{position:absolute;cursor:pointer;text-align:center;animation:radar-fade .5s ease both;transition:all .2s}
    .rb-dot{width:8px;height:8px;border-radius:50%;background:#E53935;margin:0 auto 4px;box-shadow:0 0 6px rgba(229,57,53,.5);transition:transform .2s}
    .rb-dot.hot{width:10px;height:10px;animation:radar-ping 2s ease infinite;box-shadow:0 0 10px rgba(229,57,53,.7)}
    .rb-label{font-size:11px;font-weight:700;color:var(--t1);white-space:nowrap}
    .rb-count{font-size:9px;color:var(--t3);font-weight:500}
    .radar-blip.on .rb-label{color:#E53935}
    .radar-title{position:absolute;top:12px;right:20px;display:flex;align-items:center;gap:6px;z-index:2}
    .radar-title-txt{font-size:13px;font-weight:800;color:var(--t1)}
    .radar-title-dot{width:6px;height:6px;border-radius:50%;background:#E53935;animation:radar-ping 2s ease infinite}
  `;
  document.head.appendChild(s);
}

function placeMini(topics) {
  const count = topics.length;
  const cx = 170, cy = 170;
  const maxR = 145, minR = 60;
  const maxCount = topics[0]?.count || 1;
  return topics.map((t, i) => {
    const angle = -170 + (i / (count - 1 || 1)) * 140;
    const rad = (angle * Math.PI) / 180;
    const ratio = t.count / maxCount;
    const r = maxR - ratio * (maxR - minR);
    return { ...t, x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), hot: ratio > 0.7 };
  });
}

function placeFull(topics) {
  const count = topics.length;
  const cx = 160, cy = 160;
  const maxR = 140, minR = 45;
  const maxCount = topics[0]?.count || 1;
  return topics.map((t, i) => {
    const angle = -200 + (i / (count - 1 || 1)) * 220;
    const rad = (angle * Math.PI) / 180;
    const ratio = t.count / maxCount;
    const r = maxR - ratio * (maxR - minR);
    return { ...t, x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), hot: ratio > 0.6 };
  });
}

// Mini inline radar (for home feed)
export function TrendingRadar({ trending, trendFilter, setTrendFilter }) {
  const placed = useMemo(() => placeMini(trending.slice(0, 10)), [trending]);
  if (!trending.length) return null;
  return (
    <div className="radar">
      <div className="radar-title">
        <div className="radar-title-dot"/>
        <span className="radar-title-txt">الأكثر رواجاً</span>
      </div>
      <div className="radar-disc">
        <div className="radar-ring1"/><div className="radar-ring2"/>
        <div className="radar-cross-h"/><div className="radar-cross-v"/>
        <div className="radar-sweep"/><div className="radar-center"/>
        {placed.map((t, i) => (
          <div key={t.word} className={`radar-blip ${trendFilter === t.word ? 'on' : ''}`}
            style={{ left: t.x - 20, top: t.y - 24, width: 40, animationDelay: `${i * 0.1}s` }}
            onClick={() => { Sound.tap(); setTrendFilter(prev => prev === t.word ? null : t.word); }}>
            <div className={`rb-dot ${t.hot ? 'hot' : ''}`}/>
            <div className="rb-label">{t.word}</div>
            <div className="rb-count">{t.count}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function placeBig(topics) {
  const count = topics.length;
  const cx = 185, cy = 185;
  const maxR = 165, minR = 40;
  const maxCount = topics[0]?.count || 1;
  return topics.map((t, i) => {
    const angle = -250 + (i / (count - 1 || 1)) * 320;
    const rad = (angle * Math.PI) / 180;
    const ratio = t.count / maxCount;
    const r = maxR - ratio * (maxR - minR);
    return { ...t, x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad), hot: ratio > 0.5, ratio };
  });
}

// Full-screen radar view (own nav tab)
export function RadarView({ trending, allFeed, onOpenArticle, onClose }) {
  const [filter, setFilter] = useState(null);
  const [booted, setBooted] = useState(false);
  const [activeBlip, setActiveBlip] = useState(-1);
  const [ripple, setRipple] = useState(null);
  const intervalRef = useRef(null);
  const placed = useMemo(() => placeBig(trending.slice(0, 14)), [trending]);
  const placedRef = useRef(placed);
  useEffect(() => { placedRef.current = placed; }, [placed]);

  const filtered = filter ? allFeed.filter(item => (item.title || '').includes(filter)) : [];

  // Boot sequence — entrance animation + sound
  useEffect(() => {
    Sound.radarOpen();
    const t = setTimeout(() => setBooted(true), 100);
    return () => clearTimeout(t);
  }, []);

  // Periodic blip highlights + ambient sounds
  useEffect(() => {
    if (!placed.length) return;
    let scanCount = 0;

    intervalRef.current = setInterval(() => {
      const cur = placedRef.current;
      if (!cur.length) return;
      const idx = Math.floor(Math.random() * cur.length);
      setActiveBlip(idx);
      Sound.radarBlip();

      // Ripple effect at the blip's position
      const p = cur[idx];
      if (p) setRipple({ x: p.x, y: p.y, id: Date.now() });

      setTimeout(() => setActiveBlip(-1), 800);
      setTimeout(() => setRipple(null), 1000);

      // Every 3rd cycle, play a scan sweep
      scanCount++;
      if (scanCount % 3 === 0) {
        setTimeout(() => Sound.radarScan(), 400);
      }
    }, 4000 + Math.random() * 3000);

    return () => clearInterval(intervalRef.current);
  }, [placed]);

  return (
    <div style={{ background:'#080810', minHeight:'100%', fontFamily:'var(--ft)', direction:'rtl' }}>
      {/* Header */}
      <div style={{
        padding:'16px 20px 8px', display:'flex', alignItems:'center', gap:8,
        opacity: booted ? 1 : 0, transition:'opacity .6s ease .2s',
      }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:8 }}>
          <div style={{ width:8, height:8, borderRadius:'50%', background:'#E53935', animation:'radar-ping 2s ease infinite', boxShadow:'0 0 8px rgba(229,57,53,.6)' }}/>
          <span style={{ fontSize:20, fontWeight:800, color:'#fff' }}>رادار الأخبار</span>
        </div>
        {onClose && <button onClick={onClose} style={{ background:'rgba(255,255,255,.08)', border:'none', borderRadius:'50%', width:32, height:32, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.6)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>}
      </div>
      <div style={{
        padding:'0 20px 12px', fontSize:12, color:'rgba(255,255,255,.35)',
        opacity: booted ? 1 : 0, transition:'opacity .6s ease .4s',
      }}>
        تحديث كل ١٠ دقائق · {allFeed.length} خبر · {trending.length} موضوع
      </div>

      {/* Big radar disc */}
      <div style={{ position:'relative', width:'100%', height:400, display:'flex', alignItems:'center', justifyContent:'center' }}>
        {/* Glow behind disc */}
        <div style={{
          position:'absolute', width:300, height:300, borderRadius:'50%',
          background:'radial-gradient(circle, rgba(229,57,53,.08) 0%, transparent 70%)',
          pointerEvents:'none',
          animation: booted ? 'radar-boot .8s cubic-bezier(.34,1.56,.64,1) both' : 'none',
        }}/>

        <div style={{
          position:'relative', width:370, height:370, borderRadius:'50%',
          border:'1px solid rgba(255,255,255,.08)',
          animation: booted ? 'radar-boot .7s cubic-bezier(.34,1.56,.64,1) both' : 'none',
        }}>
          {/* Rings — staggered expansion */}
          <div style={{ position:'absolute', inset:50, borderRadius:'50%', border:'1px solid rgba(255,255,255,.06)', animation: booted ? 'radar-ring-expand .6s ease .3s both' : 'none' }}/>
          <div style={{ position:'absolute', inset:100, borderRadius:'50%', border:'1px solid rgba(255,255,255,.04)', animation: booted ? 'radar-ring-expand .6s ease .45s both' : 'none' }}/>
          <div style={{ position:'absolute', inset:145, borderRadius:'50%', border:'1px solid rgba(255,255,255,.03)', animation: booted ? 'radar-ring-expand .6s ease .6s both' : 'none' }}/>
          {/* Cross */}
          <div style={{ position:'absolute', top:'50%', left:0, right:0, height:1, background:'rgba(255,255,255,.05)', animation: booted ? 'radar-scanline .5s ease .5s both' : 'none' }}/>
          <div style={{ position:'absolute', left:'50%', top:0, bottom:0, width:1, background:'rgba(255,255,255,.05)', animation: booted ? 'radar-scanline .5s ease .55s both' : 'none' }}/>
          {/* Diagonals */}
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(45deg,transparent 49.5%,rgba(255,255,255,.03) 49.5%,rgba(255,255,255,.03) 50.5%,transparent 50.5%)', opacity: booted ? 1 : 0, transition:'opacity .5s ease .6s' }}/>
          <div style={{ position:'absolute', inset:0, background:'linear-gradient(-45deg,transparent 49.5%,rgba(255,255,255,.03) 49.5%,rgba(255,255,255,.03) 50.5%,transparent 50.5%)', opacity: booted ? 1 : 0, transition:'opacity .5s ease .65s' }}/>
          {/* Sweep — delayed start */}
          <div className="rf-sweep" style={{ opacity: booted ? 1 : 0, transition:'opacity .3s ease .7s' }}/>
          {/* Center */}
          <div style={{
            position:'absolute', top:'50%', left:'50%', width:10, height:10, borderRadius:'50%',
            background:'#E53935', transform:'translate(-50%,-50%)',
            boxShadow:'0 0 16px rgba(229,57,53,.8), 0 0 40px rgba(229,57,53,.3)',
            animation: booted ? 'radar-boot .5s cubic-bezier(.34,1.56,.64,1) .2s both' : 'none',
          }}/>

          {/* Ripple effect on random blip detection */}
          {ripple && (
            <div key={ripple.id} style={{
              position:'absolute', left:ripple.x, top:ripple.y,
              width:20, height:20, borderRadius:'50%',
              border:'1.5px solid rgba(229,57,53,.5)',
              animation:'radar-ripple .8s ease-out forwards',
              pointerEvents:'none',
            }}/>
          )}

          {/* Blips — staggered drop-in */}
          {placed.map((t, i) => {
            const isDetected = activeBlip === i;
            return (
              <div key={t.word}
                style={{
                  position:'absolute', left:t.x-28, top:t.y-28, width:56, textAlign:'center',
                  cursor:'pointer',
                  animation: booted ? `radar-blip-drop .5s cubic-bezier(.34,1.56,.64,1) ${0.8 + i*0.08}s both` : 'none',
                  transition:'transform .2s',
                  transform: isDetected ? 'scale(1.15)' : 'scale(1)',
                }}
                onClick={() => { Sound.tap(); setFilter(prev => prev === t.word ? null : t.word); }}>
                {/* Dot */}
                <div style={{
                  width: t.hot ? 14 : 10,
                  height: t.hot ? 14 : 10,
                  borderRadius: '50%',
                  background: filter === t.word ? '#ff4444' : '#E53935',
                  margin: '0 auto 4px',
                  boxShadow: isDetected
                    ? '0 0 24px rgba(229,57,53,1), 0 0 48px rgba(229,57,53,.5)'
                    : filter === t.word
                      ? '0 0 20px rgba(229,57,53,1), 0 0 40px rgba(229,57,53,.5)'
                      : t.hot ? '0 0 12px rgba(229,57,53,.7)' : '0 0 6px rgba(229,57,53,.4)',
                  animation: isDetected ? 'radar-detect .8s ease' : t.hot ? 'radar-ping 2s ease infinite' : 'none',
                  transition:'box-shadow .3s',
                }}/>
                {/* Label */}
                <div style={{
                  fontSize: t.hot ? 14 : 12,
                  fontWeight: 800,
                  color: isDetected ? '#ff6659' : filter === t.word ? '#E53935' : '#fff',
                  whiteSpace: 'nowrap',
                  textShadow: isDetected ? '0 0 12px rgba(229,57,53,.6)' : '0 1px 6px rgba(0,0,0,.8)',
                  transition:'color .3s, text-shadow .3s',
                }}>{t.word}</div>
                {/* Count */}
                <div style={{ fontSize:10, color: isDetected ? 'rgba(229,57,53,.7)' : 'rgba(255,255,255,.4)', fontWeight:600, transition:'color .3s' }}>{t.count}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Filter label */}
      {filter && (
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 20px', borderTop:'1px solid rgba(255,255,255,.06)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:'#E53935' }}/>
            <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{filter}</span>
            <span style={{ fontSize:12, color:'rgba(255,255,255,.35)' }}>· {filtered.length} خبر</span>
          </div>
          <button onClick={() => setFilter(null)} style={{ background:'rgba(255,255,255,.06)', border:'none', borderRadius:16, padding:'5px 14px', fontSize:11, fontWeight:600, color:'rgba(255,255,255,.5)', cursor:'pointer', fontFamily:'var(--ft)' }}>مسح</button>
        </div>
      )}

      {/* Filtered articles */}
      {filter && filtered.slice(0, 12).map(item => (
        <div key={item.id}
          onClick={() => { Sound.open(); onOpenArticle(item); }}
          style={{ padding:'14px 20px', borderBottom:'1px solid rgba(255,255,255,.04)', cursor:'pointer', transition:'background .15s' }}>
          <div style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,.9)', lineHeight:1.7, marginBottom:4 }}>{item.title}</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,.3)' }}>{item.s?.n} · {item.t}</div>
        </div>
      ))}

      {/* Empty state when no filter */}
      {!filter && (
        <div style={{ textAlign:'center', padding:'20px', color:'rgba(255,255,255,.2)', fontSize:12, opacity: booted ? 1 : 0, transition:'opacity .5s ease 1.5s' }}>
          اضغط على أي موضوع لعرض الأخبار المتعلقة
        </div>
      )}
    </div>
  );
}
