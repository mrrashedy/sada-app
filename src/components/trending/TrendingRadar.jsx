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
    @keyframes radar-detect-phos{0%{box-shadow:0 0 8px rgba(77,255,136,.5)}30%{box-shadow:0 0 28px rgba(160,255,200,1),0 0 56px rgba(77,255,136,.7),0 0 80px rgba(77,255,136,.3)}100%{box-shadow:0 0 8px rgba(77,255,136,.5)}}
    @keyframes radar-ripple{0%{transform:translate(-50%,-50%) scale(0);opacity:.6}100%{transform:translate(-50%,-50%) scale(3);opacity:0}}
    @keyframes radar-ripple-phos{0%{transform:translate(-50%,-50%) scale(0);opacity:.8}100%{transform:translate(-50%,-50%) scale(3);opacity:0}}
    @keyframes radar-scanline{0%{opacity:0;transform:scaleX(0)}50%{opacity:.4}100%{opacity:0;transform:scaleX(1)}}
    @keyframes radar-vscan{0%{top:-2%;opacity:0}10%{opacity:.4}90%{opacity:.4}100%{top:102%;opacity:0}}
    @keyframes radar-flicker{0%,100%{opacity:1}50%{opacity:.97}}
    @keyframes spectrum-scale{0%,100%{transform:scaleY(.12);opacity:.35}35%{transform:scaleY(.85);opacity:.95}55%{transform:scaleY(.4);opacity:.6}}
    @keyframes spectrum-fade{0%{opacity:0}100%{opacity:1}}
    @keyframes radar-sweep-rotate{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
    @keyframes radar-sweep-dissolve{0%{opacity:0}18%{opacity:1}82%{opacity:1}100%{opacity:0}}
    @keyframes halo-pulse{0%,100%{opacity:.6;transform:scale(1)}50%{opacity:1;transform:scale(1.04)}}

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
          // Key includes index because trending tags can collide (same word
          // surfaces from multiple sources before dedupe).
          <div key={`${t.word}-${i}`} className={`radar-blip ${trendFilter === t.word ? 'on' : ''}`}
            style={{ left: t.x - 20, top: t.y - 24, width: 40, animationDelay: `${i * 0.1}s` }}
            onClick={() => { Sound.tap(); setTrendFilter(prev => prev === t.word ? null : t.word); }}>
            <div className={`rb-dot ${t.hot ? 'hot' : ''}`}/>
            <div className="rb-label">{t.word}</div>
            <div className="rb-count">{t.count}{t.velocity >= 2 ? ' ↑' : ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function placeBig(topics, size = 360) {
  const cx = size / 2, cy = size / 2;
  // Cap so labels don't fight for space.
  const list = topics.slice(0, 9);
  const maxCount = list[0]?.count || 1;

  // Three concentric rings — innermost holds the hottest topics. We drop the
  // very-inner ring entirely; at tiny radii the circumference is too short to
  // hold labels without collisions, and the disc center stays clear for the
  // central red dot. Listed outer → inner so ring index 0 = outermost.
  const ringRadii = [0.76, 0.52, 0.30].map(p => p * size / 2);
  const ringCount = ringRadii.length;
  // Per-ring rotational offsets, chosen so dots on adjacent rings never fall
  // on the same radial spoke. With even per-ring spacing this guarantees a
  // mathematically clean spread (no collision detection needed).
  const ringOffsets = [0, 40, 80]; // outer, middle, inner

  // Round-robin from inside out: hottest topic → innermost ring, next → next
  // ring, …, then wraps. Every ring fills before any wraps so dots can never
  // bunch in one quadrant.
  const ringTopics = ringRadii.map(() => []);
  list.forEach((t, idx) => {
    const ri = (ringCount - 1) - (idx % ringCount);
    ringTopics[ri].push(t);
  });

  // Lay each ring out with even angular spacing around its full circumference.
  const placed = [];
  ringTopics.forEach((items, ri) => {
    const r = ringRadii[ri];
    const n = items.length;
    if (!n) return;
    const ringSpacing = 360 / n;
    items.forEach((t, i) => {
      const angleDeg = -90 + ringOffsets[ri] + i * ringSpacing;
      const rad = (angleDeg * Math.PI) / 180;
      const ratio = t.count / maxCount;
      placed.push({
        ...t,
        x: cx + r * Math.cos(rad),
        y: cy + r * Math.sin(rad),
        hot: ratio > 0.6,
        ratio,
      });
    });
  });
  return placed;
}

// Full-screen radar view (own nav tab) — glass aviation radar, red palette
export function RadarView({ trending, allFeed, onOpenArticle, onClose, onRefresh, refreshing }) {
  const [filter, setFilter] = useState(null);
  const [booted, setBooted] = useState(false);
  const [activeBlip, setActiveBlip] = useState(-1);
  const [ripple, setRipple] = useState(null);
  const [discSize, setDiscSize] = useState(360);
  const [sweptBlip, setSweptBlip] = useState(-1);
  const intervalRef = useRef(null);
  const sweepStartRef = useRef(0);

  // Responsive disc sizing — frame-free, disc fills the viewport.
  // No bezel or label padding reserved — the radar content extends to the
  // screen edges.
  useEffect(() => {
    const updateSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Reserve only ~120px for the header + small breathing room at bottom.
      const available = Math.min(vw, vh - 120);
      setDiscSize(Math.max(260, Math.min(900, available)));
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const placed = useMemo(() => placeBig(trending.slice(0, 16), discSize), [trending, discSize]);
  const placedRef = useRef(placed);
  useEffect(() => { placedRef.current = placed; }, [placed]);

  const filtered = filter ? allFeed.filter(item => (item.title || '').includes(filter)).sort((a, b) => (b.pubTs || 0) - (a.pubTs || 0)) : [];

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

      const p = cur[idx];
      if (p) setRipple({ x: p.x, y: p.y, id: Date.now() });

      setTimeout(() => setActiveBlip(-1), 800);
      setTimeout(() => setRipple(null), 1000);

      scanCount++;
      if (scanCount % 3 === 0) {
        setTimeout(() => Sound.radarScan(), 400);
      }
    }, 4000 + Math.random() * 3000);

    return () => clearInterval(intervalRef.current);
  }, [placed]);

  // Sweep tracking — runs only while refreshing. Performs exactly one 360°
  // rotation matched to the CSS animation, lighting up blips it passes over.
  useEffect(() => {
    if (!refreshing) {
      setSweptBlip(-1);
      return;
    }
    sweepStartRef.current = performance.now();
    let raf;
    const SWEEP_DURATION_MS = 1500;
    // Conic-gradient wedge bright edge is at 0° (top); CSS keyframe rotates
    // 0° → 360°, exactly one full turn.
    const SWEEP_START_DEG = 0;
    const tick = (now) => {
      const elapsed = now - sweepStartRef.current;
      if (elapsed >= SWEEP_DURATION_MS) {
        setSweptBlip(-1);
        return; // single rotation done
      }
      const progress = elapsed / SWEEP_DURATION_MS; // 0..1
      const sweepDeg = (SWEEP_START_DEG + progress * 360) % 360;

      const cur = placedRef.current;
      const cx = discSize / 2, cy = discSize / 2;
      let lit = -1;
      for (let i = 0; i < cur.length; i++) {
        const p = cur[i];
        const dx = p.x - cx;
        const dy = p.y - cy;
        const blipDeg = (Math.atan2(dy, dx) * 180 / Math.PI + 90 + 360) % 360;
        const diff = (sweepDeg - blipDeg + 360) % 360;
        if (diff < 18) { lit = i; break; }
      }
      setSweptBlip(prev => prev === lit ? prev : lit);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [refreshing, discSize]);

  // Red palette
  const RED        = '#E53935';
  const RED_BRIGHT = '#ff6659';
  const RED_DIM    = 'rgba(229,57,53,.3)';
  const RED_FAINT  = 'rgba(229,57,53,.12)';
  const RING       = 'rgba(229,57,53,.22)';
  const MONO       = 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace';

  // UTC timestamp
  const now = new Date();
  const hudTime = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}Z`;

  // Spectrum bars (visible only when refreshing) — 60 bars around the ring
  const SPECTRUM_COUNT = 60;

  return (
    <div style={{
      background:'radial-gradient(ellipse at 50% 35%, #140608 0%, #080205 55%, #040102 100%)',
      minHeight:'100%',
      fontFamily:'var(--ft)', direction:'rtl',
      position:'relative',
    }}>
      {/* Header — overlay style */}
      <div style={{
        padding:'14px 18px 6px', display:'flex', alignItems:'center', gap:10,
        opacity: booted ? 1 : 0, transition:'opacity .5s ease .2s',
        position:'relative', zIndex:10,
      }}>
        <div style={{ flex:1, display:'flex', alignItems:'center', gap:9 }}>
          <div style={{
            width:7, height:7, borderRadius:'50%', background:RED,
            animation:'radar-ping 2.4s ease infinite',
            boxShadow:`0 0 6px ${RED}`,
          }}/>
          <span style={{ fontSize:17, fontWeight:700, color:'#fff', letterSpacing:.2 }}>رادار الأخبار</span>
          <span style={{
            fontSize:8.5, color:RED, fontFamily:MONO, letterSpacing:1.3, fontWeight:700,
            padding:'2px 5px', border:`1px solid ${RED_DIM}`, borderRadius:2,
          }}>LIVE</span>
          <span style={{
            fontSize:9, color:'rgba(255,255,255,.35)', fontFamily:MONO, letterSpacing:.8,
            marginRight:8,
          }}>
            {String(trending.length).padStart(3,'0')} · {hudTime}
          </span>
        </div>
        {onClose && <button onClick={onClose} style={{
          background:'rgba(255,255,255,.03)', border:'1px solid rgba(255,255,255,.08)',
          borderRadius:3, width:28, height:28,
          display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer',
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,.65)" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
        </button>}
      </div>

      {/* Disc area — frame-free, rings and lines extend to the screen edges */}
      <div style={{
        height: discSize + 20,
        display:'flex', alignItems:'center', justifyContent:'center',
        position:'relative', zIndex:2,
      }}>
        <div style={{
          position:'relative',
          width: discSize, height: discSize,
          animation: booted ? 'radar-boot .7s cubic-bezier(.34,1.56,.64,1) both' : 'none',
        }}>
          {/* Frame-free disc container — no border, no background, no bezel */}
          <div style={{
            position:'absolute', inset:0,
          }}>
            {/* Dot grid texture */}
            <div style={{
              position:'absolute', inset:0, borderRadius:'50%',
              backgroundImage:`radial-gradient(${RED_FAINT} 1px, transparent 1px)`,
              backgroundSize:'10px 10px',
              opacity: booted ? 0.4 : 0, transition:'opacity .5s ease .3s',
              pointerEvents:'none',
            }}/>

            {/* Concentric rings — frame-free, extending all the way to the edge */}
            {[0, 0.2, 0.4, 0.6, 0.8].map((pct, i) => (
              <div key={i} style={{
                position:'absolute',
                inset: `${pct * discSize / 2}px`,
                borderRadius:'50%',
                border:`1px ${i === 2 ? 'solid' : 'dashed'} ${RING}`,
                opacity: booted ? 0.5 - i*0.07 : 0,
                transition:`opacity .5s ease ${.3 + i*.08}s`,
              }}/>
            ))}

            {/* Crosshairs */}
            <div style={{
              position:'absolute', top:'50%', left:0, right:0, height:1,
              background:`linear-gradient(90deg, transparent 0%, ${RING} 20%, ${RING} 80%, transparent 100%)`,
              opacity: booted ? .7 : 0, transition:'opacity .5s ease .5s',
            }}/>
            <div style={{
              position:'absolute', left:'50%', top:0, bottom:0, width:1,
              background:`linear-gradient(180deg, transparent 0%, ${RING} 20%, ${RING} 80%, transparent 100%)`,
              opacity: booted ? .7 : 0, transition:'opacity .5s ease .55s',
            }}/>

            {/* Subtle diagonals */}
            <div style={{
              position:'absolute', inset:0,
              background:`linear-gradient(45deg,transparent 49.9%,rgba(229,57,53,.08) 49.9%,rgba(229,57,53,.08) 50.1%,transparent 50.1%)`,
              opacity: booted ? 1 : 0, transition:'opacity .5s ease .6s',
            }}/>
            <div style={{
              position:'absolute', inset:0,
              background:`linear-gradient(-45deg,transparent 49.9%,rgba(229,57,53,.08) 49.9%,rgba(229,57,53,.08) 50.1%,transparent 50.1%)`,
              opacity: booted ? 1 : 0, transition:'opacity .5s ease .65s',
            }}/>

            {/* Radar sweep wedge — visible only while refreshing. Performs
                exactly one 360° rotation, starting from the top. Bright
                leading edge fades to transparent over ~55°. The whole wedge
                dissolves in at the start and out at the end, so the rotation
                doesn't snap on/off. */}
            {refreshing && (
              <div style={{
                position:'absolute', inset:0, borderRadius:'50%',
                background:`conic-gradient(from 0deg,
                  ${RED_BRIGHT} 0deg,
                  rgba(255,102,89,.85) 4deg,
                  rgba(229,57,53,.55) 14deg,
                  rgba(229,57,53,.28) 28deg,
                  rgba(229,57,53,.10) 42deg,
                  transparent 55deg,
                  transparent 360deg)`,
                animation:'radar-sweep-rotate 1.5s cubic-bezier(.45,.05,.55,.95) 1 forwards, radar-sweep-dissolve 1.5s ease-in-out 1 forwards',
                pointerEvents:'none',
                mixBlendMode:'screen',
                filter:'blur(1.5px) drop-shadow(0 0 12px rgba(229,57,53,.55))',
                zIndex: 3,
              }}/>
            )}

            {/* Center — refresh button */}
            <button
              type="button"
              onClick={() => { Sound.tap(); onRefresh && onRefresh(); }}
              disabled={refreshing}
              aria-label="تحديث الرادار"
              style={{
                position:'absolute',
                top: discSize/2 - 26, left: discSize/2 - 26,
                width:52, height:52, padding:0,
                borderRadius:'50%', border:'none', background:'transparent',
                cursor: refreshing ? 'wait' : 'pointer',
                opacity: booted ? 1 : 0,
                transition:'opacity .4s ease .7s',
                zIndex: 5,
              }}>
              <div style={{
                position:'absolute', top:8, left:8,
                width:36, height:36, borderRadius:'50%',
                border:`1px solid ${RED_DIM}`,
                opacity: refreshing ? 0 : .6,
                transition:'opacity .3s',
                pointerEvents:'none',
              }}/>
              <div style={{
                position:'absolute',
                top: refreshing ? 15 : 17,
                left: refreshing ? 15 : 17,
                width: refreshing ? 22 : 18,
                height: refreshing ? 22 : 18,
                borderRadius:'50%',
                background: RED,
                border:`1.5px solid ${RED_BRIGHT}`,
                boxShadow: refreshing
                  ? `0 0 22px ${RED}, 0 0 44px rgba(229,57,53,.5)`
                  : `0 0 12px rgba(229,57,53,.6)`,
                transition:'all .3s ease',
                pointerEvents:'none',
              }}/>
            </button>

            {/* Ripple on detection */}
            {ripple && (
              <div key={ripple.id} style={{
                position:'absolute', left:ripple.x, top:ripple.y,
                width:18, height:18, borderRadius:'50%',
                border:`1px solid ${RED_BRIGHT}`,
                animation:'radar-ripple .8s ease-out forwards',
                pointerEvents:'none',
              }}/>
            )}

            {/* Contacts (blips) */}
            {placed.map((t, i) => {
              const isDetected = activeBlip === i;
              const isSelected = filter === t.word;
              const isSwept = sweptBlip === i;
              const isLit = isDetected || isSwept;
              return (
                <div key={`${t.word}-${i}`}
                  style={{
                    position:'absolute', left:t.x-28, top:t.y-28, width:56, textAlign:'center',
                    cursor:'pointer',
                    animation: booted ? `radar-blip-drop .5s cubic-bezier(.34,1.56,.64,1) ${0.6 + i*0.05}s both` : 'none',
                    transition:'transform .2s',
                    transform: isLit ? 'scale(1.15)' : 'scale(1)',
                    zIndex: 3,
                  }}
                  onClick={() => { Sound.tap(); setFilter(prev => prev === t.word ? null : t.word); }}>
                  <div style={{
                    width: t.hot ? 10 : 7,
                    height: t.hot ? 10 : 7,
                    borderRadius: '50%',
                    background: isSelected || isLit ? RED_BRIGHT : RED,
                    margin: '0 auto 4px',
                    boxShadow: isSwept
                      ? `0 0 22px ${RED_BRIGHT}, 0 0 44px rgba(255,102,89,.7), 0 0 70px rgba(229,57,53,.4)`
                      : isDetected
                        ? `0 0 16px ${RED_BRIGHT}, 0 0 32px rgba(229,57,53,.55)`
                      : isSelected
                        ? `0 0 14px ${RED_BRIGHT}, 0 0 28px rgba(229,57,53,.45)`
                        : t.hot ? `0 0 10px rgba(229,57,53,.6)` : `0 0 6px rgba(229,57,53,.4)`,
                    animation: isDetected ? 'radar-detect .8s ease' : t.hot ? 'radar-ping 2.4s ease infinite' : 'none',
                    transition: isSwept ? 'box-shadow .15s, background .15s' : 'all .3s',
                  }}/>
                  <div style={{
                    fontSize: t.hot ? 12 : 11,
                    fontWeight: 700,
                    color: isLit || isSelected ? '#fff' : 'rgba(255,255,255,.88)',
                    whiteSpace: 'nowrap',
                    textShadow:'0 1px 5px rgba(0,0,0,.95), 0 0 8px rgba(0,0,0,.6)',
                    letterSpacing: .2,
                    transition:'all .3s',
                  }}>{t.word}</div>
                  <div style={{
                    fontSize:9, fontWeight:700,
                    color: isLit ? RED_BRIGHT : 'rgba(255,255,255,.45)',
                    fontFamily: MONO,
                    letterSpacing: .5,
                    display:'flex', alignItems:'center', justifyContent:'center', gap:3,
                  }}>
                    <span>{String(t.count).padStart(2,'0')}</span>
                    {t.velocity >= 2 && <span style={{ color:RED_BRIGHT }}>↑</span>}
                    {t.velocity >= 5 && <span style={{ color:RED_BRIGHT, marginLeft:-2 }}>↑</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Filter lock bar */}
      {filter && (
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'12px 20px',
          borderTop:`1px solid rgba(229,57,53,.2)`,
          background:'rgba(229,57,53,.04)',
          position:'relative', zIndex:5,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ width:6, height:6, borderRadius:'50%', background:RED, boxShadow:`0 0 8px ${RED}` }}/>
            <span style={{ fontSize:10, color:RED, fontFamily:MONO, letterSpacing:1.3, fontWeight:700 }}>[ LOCK ]</span>
            <span style={{ fontSize:14, fontWeight:700, color:'#fff' }}>{filter}</span>
            <span style={{ fontSize:10, color:'rgba(255,255,255,.5)', fontFamily:MONO }}>·{String(filtered.length).padStart(3,'0')}</span>
          </div>
          <button onClick={() => setFilter(null)} style={{
            background:'rgba(229,57,53,.08)', border:`1px solid ${RED_DIM}`,
            borderRadius:3, padding:'4px 12px', fontSize:10, fontWeight:700, color:RED,
            cursor:'pointer', fontFamily:MONO, letterSpacing:1.2,
          }}>CLEAR</button>
        </div>
      )}

      {/* Filtered articles */}
      {filter && filtered.slice(0, 12).map(item => (
        <div key={item.id}
          onClick={() => { Sound.open(); onOpenArticle(item); }}
          style={{
            padding:'14px 20px',
            borderBottom:'1px solid rgba(255,255,255,.04)',
            cursor:'pointer', transition:'background .15s',
            position:'relative', zIndex:5,
          }}>
          <div style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,.9)', lineHeight:1.7, marginBottom:4 }}>{item.title}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,.4)', fontFamily:MONO, letterSpacing:.5 }}>{item.s?.n} · {item.t}</div>
        </div>
      ))}
    </div>
  );
}
