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

// Minimum / maximum dot diameter in pixels. `count/maxCount` drives the linear
// scale between them, so the most-mentioned topic = max, floor = min.
const DOT_MIN = 5;
const DOT_MAX = 11;

function dotSizeFor(ratio) {
  return Math.round(DOT_MIN + Math.max(0, Math.min(1, ratio)) * (DOT_MAX - DOT_MIN));
}

// Deterministic pseudo-random in [0,1) from a string seed. Used to jitter
// dot angle + radius so the radar doesn't feel mechanically symmetric —
// same topic always lands in the same visual slot, so the scatter is
// stable across re-renders instead of jiggling on every poll.
function hash01(str, salt = 0) {
  let h = 5381 + salt * 131;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function placeBig(topics, size = 360, safeWidth = 360) {
  const cx = size / 2, cy = size / 2;
  // Cap at 20 so the radar fits up to 20 dots regularly.
  const list = topics.slice(0, 20);
  const maxCount = list[0]?.count || 1;

  // Two concentric CIRCLES — the disc is square (size × size) and the rings
  // are perfect circles. The disc may be larger than the viewport width, in
  // which case the visible portion is an arc. Blip placement is horizontally
  // constrained by `safeWidth` so labels never fall outside the viewport;
  // when a ring exceeds the safe zone, dots are placed in top/bottom arcs
  // only (the east/west sectors of the ring extend off-screen, unused).
  // Three rings — the hottest topics sit closest to the centre, with
  // progressively cooler topics at wider radii. The innermost ring (0.28)
  // fills the dead zone around the refresh button so the radar doesn't
  // feel like an empty bullseye.
  const ringPct = [0.86, 0.50, 0.28];
  // Vertical padding (px) reserved for labels below each dot so outer-ring
  // dots at the bottom don't push their labels off the disc.
  const VPAD = 30;
  // Horizontal label clearance — half the blip container width plus cushion.
  const LABEL_HALFW = 44;
  // Largest horizontal displacement a dot may have from the disc center while
  // its label stays within the viewport. Clamped to prevent collapse on tiny
  // screens.
  const safeHalfW = Math.max(120, safeWidth / 2 - LABEL_HALFW);
  const ringCapacity = [10, 6, 4];
  // Offset each ring so dots don't align on the same radial spoke across
  // rings — middle and inner rings are rotated by half their own spacing.
  const ringOffsets  = [0, 30, 45];

  // Assign topics to rings in rank order, starting with the innermost.
  // Topics 0–3 (hottest) → inner ring, topics 4–9 → middle ring,
  // topics 10–19 → outer ring.
  const ringTopics = ringPct.map(() => []);
  let idx = 0;
  for (let ri = ringPct.length - 1; ri >= 0; ri--) {
    const cap = ringCapacity[ri];
    for (let k = 0; k < cap && idx < list.length; k++, idx++) {
      ringTopics[ri].push(list[idx]);
    }
  }

  const placed = [];
  ringTopics.forEach((items, ri) => {
    const r = ringPct[ri] * size / 2;
    // Vertical radius shrinks slightly so outer-ring labels fit within the
    // disc without clipping the count text.
    const ry = Math.min(r, (size - VPAD * 2) / 2);
    const n = items.length;
    if (!n) return;

    // If the ring fits entirely within the safe horizontal zone, distribute
    // blips around the full circle. Otherwise, split them between two arcs
    // (north and south), because the east/west sectors are off-screen.
    if (r <= safeHalfW) {
      const ringSpacing = 360 / n;
      items.forEach((t, i) => {
        const seed = t.word || String(i);
        // Jitter angle by up to ±35% of the slot so neighbours don't
        // collide, and radius by ±8% so dots scatter along the ring band
        // instead of sitting on a perfect circle.
        const angleJitter = (hash01(seed, 1) - 0.5) * ringSpacing * 0.7;
        const radiusScale = 1 + (hash01(seed, 2) - 0.5) * 0.16;
        const angleDeg = -90 + ringOffsets[ri] + i * ringSpacing + angleJitter;
        const rad = (angleDeg * Math.PI) / 180;
        const ratio = t.count / maxCount;
        placed.push({
          ...t,
          x: cx + r * radiusScale * Math.cos(rad),
          y: cy + ry * radiusScale * Math.sin(rad),
          dotSize: dotSizeFor(ratio),
          hot: ratio > 0.55,
          ratio,
        });
      });
    } else {
      // Angular span where |cos θ| ≤ safeHalfW / r ⇔ dot is inside the safe
      // horizontal zone. Measured from the ±y axis; gives two symmetric arcs
      // centred on top (−90°) and bottom (+90°).
      const cutoffDeg = Math.asin(safeHalfW / r) * 180 / Math.PI;
      // Reserve a label-sized margin from the arc ends so the outermost blips
      // don't sit right at the cropping edge.
      const arcPad = Math.min(cutoffDeg * 0.15, 8);
      const topStart = -90 - cutoffDeg + arcPad;
      const topEnd   = -90 + cutoffDeg - arcPad;
      const botStart =  90 - cutoffDeg + arcPad;
      const botEnd   =  90 + cutoffDeg - arcPad;

      const topCount = Math.ceil(n / 2);
      const botCount = n - topCount;
      const topItems = items.slice(0, topCount);
      const botItems = items.slice(topCount);

      const placeArc = (arcItems, startDeg, endDeg) => {
        const m = arcItems.length;
        if (!m) return;
        const arcSpacing = m > 1 ? (endDeg - startDeg) / (m - 1) : (endDeg - startDeg);
        arcItems.forEach((t, i) => {
          const baseDeg = m === 1
            ? (startDeg + endDeg) / 2
            : startDeg + (i / (m - 1)) * (endDeg - startDeg);
          const seed = t.word || String(i);
          // Same jitter pattern as the full-circle branch but slightly
          // tighter on angle (0.5 vs 0.7) since arc slots are already
          // compressed into a smaller angular span.
          const angleJitter = (hash01(seed, 1) - 0.5) * arcSpacing * 0.5;
          const radiusScale = 1 + (hash01(seed, 2) - 0.5) * 0.16;
          const angleDeg = baseDeg + angleJitter;
          const rad = (angleDeg * Math.PI) / 180;
          const ratio = t.count / maxCount;
          placed.push({
            ...t,
            x: cx + r * radiusScale * Math.cos(rad),
            y: cy + ry * radiusScale * Math.sin(rad),
            dotSize: dotSizeFor(ratio),
            hot: ratio > 0.55,
            ratio,
          });
        });
      };

      placeArc(topItems, topStart, topEnd);
      placeArc(botItems, botStart, botEnd);
    }
  });
  return placed;
}

// Full-screen radar view (own nav tab) — glass aviation radar, red palette
export function RadarView({ trending, allFeed, onOpenArticle, onClose, onRefresh, refreshing }) {
  const [filter, setFilter] = useState(null);
  const [booted, setBooted] = useState(false);
  const [activeBlip, setActiveBlip] = useState(-1);
  const [ripple, setRipple] = useState(null);
  const [geom, setGeom] = useState({ discSize: 360, safeWidth: 360 });
  const { discSize, safeWidth } = geom;
  const [sweptBlip, setSweptBlip] = useState(-1);
  const intervalRef = useRef(null);
  const sweepStartRef = useRef(0);

  // Responsive disc sizing — the radar is a CIRCLE whose diameter scales with
  // the viewport. On portrait phones where vw ≪ vh, the circle is larger
  // than vw, so its left and right edges are cropped by the viewport
  // (overflow:hidden on the wrapper). Rings stay circular so the radar keeps
  // its characteristic shape. The diameter is capped at vh*0.85 so the full
  // circle always fits vertically.
  useEffect(() => {
    const updateSize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // Diameter: 70% of viewport height, capped at 1200 for very large
      // displays. On portrait phones this leaves ~30% vertical breathing
      // room; on narrow phones where vh*0.70 > vw, the disc extends past
      // the viewport edges and is cropped by overflow:hidden on the wrapper.
      const d = Math.min(1200, vh * 0.70);
      setGeom({
        discSize: Math.max(320, Math.round(d)),
        safeWidth: vw,
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const placed = useMemo(() => placeBig(trending.slice(0, 20), discSize, safeWidth), [trending, discSize, safeWidth]);
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
          <span style={{
            fontSize:9, color:RED, fontFamily:MONO, letterSpacing:1.3, fontWeight:700,
            padding:'2px 6px', border:`1px solid ${RED_DIM}`, borderRadius:2,
          }}>LIVE</span>
          <span style={{
            fontSize:9.5, color:'rgba(255,255,255,.4)', fontFamily:MONO, letterSpacing:.9,
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

      {/* Disc area — the wrapper is full-width with overflow:hidden so the
          inner disc (a square of discSize) gets horizontally cropped by the
          viewport when discSize > vw. This gives the radar its classic
          circular look even on portrait phones: rings stay as perfect
          circles that simply extend off-screen at the east/west sides. */}
      <div style={{
        height: discSize,
        width:'100%',
        overflow:'hidden',
        position:'relative', zIndex:2,
      }}>
        <div style={{
          position:'absolute',
          top:0, left:'50%',
          marginLeft: -discSize / 2,
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

            {/* Radar environment — degree ticks around the rim and
                scattered ghost ambient returns. All subtle and low
                opacity: the ticks give a compass feel, the ghosts read
                as background clutter behind the real blips. Positions
                are deterministic (seeded from a fixed index) so the
                clutter doesn't shuffle on each re-render. */}
            <svg
              width={discSize}
              height={discSize}
              viewBox={`0 0 ${discSize} ${discSize}`}
              style={{
                position:'absolute', inset:0,
                opacity: booted ? 1 : 0,
                transition:'opacity .6s ease .35s',
                pointerEvents:'none',
              }}>
              {/* Degree ticks every 10° — longer at 30° increments, longest at cardinals */}
              {Array.from({length: 36}).map((_, i) => {
                const deg = i * 10;
                const isCardinal = deg % 90 === 0;
                const isMajor = deg % 30 === 0;
                const outer = discSize / 2 - 1;
                const len = isCardinal ? 13 : isMajor ? 8 : 4;
                const inner = outer - len;
                const rad = (deg - 90) * Math.PI / 180;
                const cx = discSize / 2;
                const cy = discSize / 2;
                return (
                  <line
                    key={`tick-${i}`}
                    x1={cx + outer * Math.cos(rad)}
                    y1={cy + outer * Math.sin(rad)}
                    x2={cx + inner * Math.cos(rad)}
                    y2={cy + inner * Math.sin(rad)}
                    stroke="rgba(229,57,53,.28)"
                    strokeWidth={isCardinal ? 1.2 : 0.8}
                  />
                );
              })}
              {/* Ghost ambient returns — fixed dim blips mimicking noise */}
              {Array.from({length: 16}).map((_, i) => {
                const seed = `ghost-${i}`;
                const angle = hash01(seed, 1) * 360;
                // Bias to the mid-band so ghosts don't crowd the centre
                // (where real hot topics live) or the clipped rim.
                const rPct = 0.18 + hash01(seed, 2) * 0.68;
                const r = rPct * discSize / 2;
                const rad = angle * Math.PI / 180;
                const gx = discSize / 2 + r * Math.cos(rad);
                const gy = discSize / 2 + r * Math.sin(rad);
                const size = 0.8 + hash01(seed, 3) * 1.6;
                return (
                  <circle
                    key={`ghost-${i}`}
                    cx={gx}
                    cy={gy}
                    r={size}
                    fill="rgba(229,57,53,.26)"
                  />
                );
              })}
              {/* Bearing spokes every 45° — very faint dashed radials
                  from the outer tick ring down to the innermost visible ring */}
              {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => {
                if (deg % 90 === 0) return null; // skip cardinals (crosshairs already cover them)
                const rad = (deg - 90) * Math.PI / 180;
                const cx = discSize / 2;
                const cy = discSize / 2;
                const r1 = discSize / 2 * 0.15;
                const r2 = discSize / 2 * 0.88;
                return (
                  <line
                    key={`spoke-${deg}`}
                    x1={cx + r1 * Math.cos(rad)}
                    y1={cy + r1 * Math.sin(rad)}
                    x2={cx + r2 * Math.cos(rad)}
                    y2={cy + r2 * Math.sin(rad)}
                    stroke="rgba(229,57,53,.15)"
                    strokeWidth={0.8}
                    strokeDasharray="2 6"
                  />
                );
              })}

              {/* Geographical features — non-concentric circles and curved
                  paths that read as landmasses / coastlines / terrain
                  contours. Positions are hard-coded as fractions of
                  discSize so they scale with the disc. Opacity is kept
                  extremely low so they dissolve into the background. */}
              {[
                // Upper-left landmass cluster
                { cx: 0.22, cy: 0.24, r: 0.098, dash: '3 5' },
                { cx: 0.13, cy: 0.38, r: 0.042, dash: '3 5' },
                { cx: 0.32, cy: 0.36, r: 0.022, dash: null },
                { cx: 0.27, cy: 0.18, r: 0.035, dash: '2 4' },
                { cx: 0.10, cy: 0.22, r: 0.028, dash: null },
                { cx: 0.34, cy: 0.28, r: 0.018, dash: null },
                // Lower-right landmass cluster
                { cx: 0.78, cy: 0.72, r: 0.108, dash: '3 5' },
                { cx: 0.89, cy: 0.80, r: 0.028, dash: null },
                { cx: 0.71, cy: 0.88, r: 0.048, dash: '3 5' },
                { cx: 0.82, cy: 0.64, r: 0.030, dash: null },
                { cx: 0.93, cy: 0.72, r: 0.020, dash: null },
                // Lower-left islands
                { cx: 0.42, cy: 0.92, r: 0.035, dash: null },
                { cx: 0.18, cy: 0.84, r: 0.065, dash: '3 5' },
                { cx: 0.08, cy: 0.92, r: 0.028, dash: '2 4' },
                { cx: 0.30, cy: 0.80, r: 0.020, dash: null },
                // Upper-right cluster
                { cx: 0.58, cy: 0.20, r: 0.036, dash: null },
                { cx: 0.86, cy: 0.30, r: 0.024, dash: null },
                { cx: 0.72, cy: 0.10, r: 0.042, dash: '3 5' },
                { cx: 0.90, cy: 0.18, r: 0.018, dash: null },
                // Mid-zone small markers
                { cx: 0.48, cy: 0.62, r: 0.016, dash: null },
                { cx: 0.62, cy: 0.48, r: 0.022, dash: null },
                { cx: 0.38, cy: 0.52, r: 0.018, dash: null },
              ].map((f, i) => (
                <circle
                  key={`geo-c-${i}`}
                  cx={f.cx * discSize}
                  cy={f.cy * discSize}
                  r={f.r * discSize}
                  fill="none"
                  stroke="rgba(229,57,53,.16)"
                  strokeWidth={0.8}
                  strokeDasharray={f.dash || ''}
                />
              ))}
              {/* Coastline arcs — sinuous curves that suggest shoreline */}
              {[
                `M ${discSize*0.06} ${discSize*0.56} Q ${discSize*0.22} ${discSize*0.46}, ${discSize*0.40} ${discSize*0.56} T ${discSize*0.72} ${discSize*0.60}`,
                `M ${discSize*0.60} ${discSize*0.12} Q ${discSize*0.76} ${discSize*0.26}, ${discSize*0.68} ${discSize*0.42} T ${discSize*0.84} ${discSize*0.54}`,
                `M ${discSize*0.28} ${discSize*0.06} Q ${discSize*0.44} ${discSize*0.16}, ${discSize*0.54} ${discSize*0.08}`,
                `M ${discSize*0.20} ${discSize*0.96} Q ${discSize*0.35} ${discSize*0.86}, ${discSize*0.55} ${discSize*0.94}`,
                `M ${discSize*0.92} ${discSize*0.44} Q ${discSize*0.82} ${discSize*0.56}, ${discSize*0.88} ${discSize*0.68}`,
                `M ${discSize*0.04} ${discSize*0.32} Q ${discSize*0.14} ${discSize*0.44}, ${discSize*0.06} ${discSize*0.58}`,
                // Longer winding coastlines
                `M ${discSize*0.02} ${discSize*0.70} Q ${discSize*0.18} ${discSize*0.64}, ${discSize*0.28} ${discSize*0.74} T ${discSize*0.52} ${discSize*0.78}`,
                `M ${discSize*0.46} ${discSize*0.04} Q ${discSize*0.56} ${discSize*0.14}, ${discSize*0.52} ${discSize*0.24} T ${discSize*0.64} ${discSize*0.34}`,
                `M ${discSize*0.98} ${discSize*0.36} Q ${discSize*0.86} ${discSize*0.42}, ${discSize*0.78} ${discSize*0.36} T ${discSize*0.66} ${discSize*0.28}`,
                `M ${discSize*0.64} ${discSize*0.96} Q ${discSize*0.74} ${discSize*0.86}, ${discSize*0.82} ${discSize*0.92}`,
                // Small terrain contour curves
                `M ${discSize*0.36} ${discSize*0.44} Q ${discSize*0.44} ${discSize*0.40}, ${discSize*0.48} ${discSize*0.46}`,
                `M ${discSize*0.54} ${discSize*0.70} Q ${discSize*0.62} ${discSize*0.66}, ${discSize*0.66} ${discSize*0.74}`,
              ].map((d, i) => (
                <path
                  key={`geo-p-${i}`}
                  d={d}
                  fill="none"
                  stroke="rgba(229,57,53,.16)"
                  strokeWidth={0.8}
                  strokeDasharray="4 4"
                />
              ))}
              {/* Latitude parallels — subtle horizontal arcs suggesting a
                  geographic projection overlay. Shifted off-centre so they
                  don't line up with the concentric rings. */}
              {[0.18, 0.32, 0.66, 0.80].map((y, i) => (
                <path
                  key={`lat-${i}`}
                  d={`M ${discSize*0.05} ${discSize*y} Q ${discSize*0.5} ${discSize*(y + (i % 2 ? 0.025 : -0.025))}, ${discSize*0.95} ${discSize*y}`}
                  fill="none"
                  stroke="rgba(229,57,53,.13)"
                  strokeWidth={0.7}
                  strokeDasharray="2 8"
                />
              ))}
              {/* Meridian-style curves — gentle vertical arcs */}
              {[0.22, 0.38, 0.62, 0.78].map((x, i) => (
                <path
                  key={`mer-${i}`}
                  d={`M ${discSize*x} ${discSize*0.05} Q ${discSize*(x + (i % 2 ? 0.03 : -0.03))} ${discSize*0.5}, ${discSize*x} ${discSize*0.95}`}
                  fill="none"
                  stroke="rgba(229,57,53,.12)"
                  strokeWidth={0.7}
                  strokeDasharray="2 8"
                />
              ))}
            </svg>

            {/* Concentric CIRCLES — symmetric inset gives a circle in a
                square container. The outermost ring is the disc itself
                (inset 0). Inner rings shrink toward the centre. The last
                entry (0.92) is a tight inner ring wrapping the refresh
                button, giving the classic radar-within-a-radar feel. */}
            {[0, 0.2, 0.4, 0.6, 0.8, 0.92].map((pct, i) => (
              <div key={i} style={{
                position:'absolute',
                inset: `${pct * discSize / 2}px`,
                borderRadius:'50%',
                border:`1px ${i === 2 ? 'solid' : 'dashed'} ${RING}`,
                opacity: booted ? 0.5 - i*0.05 : 0,
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

            {/* Contacts (blips) — dot size is proportional to count (7–17px).
                Dots are flat solid colour; depth comes from a layered outer
                shadow "wave" (concentric halos) rather than a 3D gradient. */}
            {placed.map((t, i) => {
              const isDetected = activeBlip === i;
              const isSelected = filter === t.word;
              const isSwept = sweptBlip === i;
              const isLit = isDetected || isSwept;
              const ds = t.dotSize;
              const BLIP_W = 74; // label container width — tight enough that 4 rings × 5 dots don't collide
              return (
                <div key={`${t.word}-${i}`}
                  style={{
                    position:'absolute',
                    left: t.x - BLIP_W / 2,
                    top: t.y - ds / 2,
                    width: BLIP_W,
                    textAlign:'center',
                    cursor:'pointer',
                    animation: booted ? `radar-blip-drop .5s cubic-bezier(.34,1.56,.64,1) ${0.6 + i*0.04}s both` : 'none',
                    transition:'transform .2s',
                    transform: isLit ? 'scale(1.15)' : 'scale(1)',
                    zIndex: 3,
                  }}
                  onClick={() => { Sound.tap(); setFilter(prev => prev === t.word ? null : t.word); }}>
                  <div style={{
                    width: ds,
                    height: ds,
                    borderRadius: '50%',
                    background: isSelected || isLit ? RED_BRIGHT : RED,
                    margin: '0 auto 5px',
                    // Shadow "wave" — two tight rings + two soft halos give the
                    // dot a radiating feel without making it look 3D/spherical.
                    boxShadow: isSwept
                      ? `0 0 0 1.5px rgba(255,102,89,.7), 0 0 0 4px rgba(229,57,53,.35), 0 0 14px ${RED_BRIGHT}, 0 0 30px rgba(229,57,53,.45)`
                      : isDetected
                        ? `0 0 0 1.5px rgba(255,102,89,.6), 0 0 0 4px rgba(229,57,53,.3), 0 0 12px ${RED_BRIGHT}, 0 0 24px rgba(229,57,53,.4)`
                      : isSelected
                        ? `0 0 0 1.5px rgba(255,102,89,.55), 0 0 0 4px rgba(229,57,53,.25), 0 0 10px ${RED_BRIGHT}, 0 0 20px rgba(229,57,53,.35)`
                        : t.hot
                          ? `0 0 0 1px rgba(255,102,89,.45), 0 0 0 3px rgba(229,57,53,.2), 0 0 8px rgba(229,57,53,.55), 0 0 16px rgba(229,57,53,.25)`
                          : `0 0 0 1px rgba(255,102,89,.35), 0 0 0 3px rgba(229,57,53,.15), 0 0 6px rgba(229,57,53,.4), 0 0 12px rgba(229,57,53,.18)`,
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

      {/* Sliding news panel — covers the lower ~85% of the radar when a blip
          is selected, slides back down on CLEAR. Keeps the radar visible
          above the panel so the user still has the "radar → dot → news"
          mental model. */}
      <div style={{
        position:'fixed',
        left:0, right:0, bottom:0,
        top:'15%',
        background:'linear-gradient(180deg, rgba(18,5,8,.96) 0%, rgba(8,2,4,.99) 40%)',
        backdropFilter:'blur(14px)',
        WebkitBackdropFilter:'blur(14px)',
        borderTop:`1px solid ${RED_DIM}`,
        borderTopLeftRadius:22,
        borderTopRightRadius:22,
        boxShadow: filter ? `0 -20px 60px rgba(0,0,0,.7), 0 -4px 40px rgba(229,57,53,.18)` : 'none',
        transform: filter ? 'translateY(0)' : 'translateY(100%)',
        transition: 'transform .42s cubic-bezier(.22,1,.36,1)',
        zIndex: 50,
        display:'flex', flexDirection:'column',
        pointerEvents: filter ? 'auto' : 'none',
        direction:'rtl',
      }}>
        {/* Drag handle */}
        <div style={{
          padding:'10px 0 4px', display:'flex', justifyContent:'center',
        }}>
          <div style={{
            width:40, height:4, borderRadius:2,
            background:'rgba(255,255,255,.18)',
          }}/>
        </div>

        {/* Panel header — filter name + close */}
        <div style={{
          display:'flex', alignItems:'center', justifyContent:'space-between',
          padding:'6px 20px 14px',
          borderBottom:`1px solid rgba(229,57,53,.18)`,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:9, minWidth:0 }}>
            <div style={{
              width:7, height:7, borderRadius:'50%', background:RED,
              boxShadow:`0 0 10px ${RED}`,
              animation:'radar-ping 2s ease infinite', flexShrink:0,
            }}/>
            <span style={{
              fontSize:9, color:RED, fontFamily:MONO, letterSpacing:1.3, fontWeight:700,
              padding:'2px 6px', border:`1px solid ${RED_DIM}`, borderRadius:2, flexShrink:0,
            }}>LOCK</span>
            <span style={{
              fontSize:16, fontWeight:800, color:'#fff',
              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
            }}>{filter}</span>
            <span style={{
              fontSize:10, color:'rgba(255,255,255,.45)', fontFamily:MONO, flexShrink:0,
            }}>·{String(filtered.length).padStart(3,'0')}</span>
          </div>
          <button onClick={() => { Sound.tap(); setFilter(null); }} style={{
            background:'rgba(229,57,53,.1)', border:`1px solid ${RED_DIM}`,
            borderRadius:14, width:28, height:28, padding:0,
            display:'flex', alignItems:'center', justifyContent:'center',
            cursor:'pointer', flexShrink:0,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>

        {/* Scrollable article list */}
        <div style={{
          flex:1, overflow:'auto', WebkitOverflowScrolling:'touch',
        }}>
          {filtered.length === 0 && (
            <div style={{
              padding:'40px 20px', textAlign:'center',
              color:'rgba(255,255,255,.4)', fontSize:13,
            }}>
              لا توجد مقالات متطابقة
            </div>
          )}
          {filtered.map((item, idx) => (
            // Key includes index — some sources occasionally republish the
            // same id (e.g. live blog updates), so item.id alone collides.
            <div key={`${item.id}-${idx}`}
              onClick={() => { Sound.open(); onOpenArticle(item); }}
              style={{
                padding:'14px 20px',
                borderBottom:'1px solid rgba(255,255,255,.05)',
                cursor:'pointer', transition:'background .15s',
              }}>
              <div style={{ fontSize:14, fontWeight:700, color:'rgba(255,255,255,.92)', lineHeight:1.7, marginBottom:5 }}>{item.title}</div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,.42)', fontFamily:MONO, letterSpacing:.5 }}>{item.s?.n} · {item.t}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
