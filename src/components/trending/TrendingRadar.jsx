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
    @keyframes map-drift{0%,100%{transform:translate(0,0)}25%{transform:translate(-10px,-5px)}50%{transform:translate(-4px,7px)}75%{transform:translate(8px,3px)}}
    @keyframes map-breathe{0%,100%{opacity:.55}50%{opacity:1}}
    @keyframes map-land-ping{0%,100%{opacity:.45;transform-origin:center;transform:scale(1)}50%{opacity:1;transform:scale(1.08)}}
    @keyframes map-coast-flow{0%{stroke-dashoffset:0}100%{stroke-dashoffset:-40}}

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
  // Horizontal label clearance — half the blip container width plus a
  // generous cushion so topic words always keep a safe margin from the
  // left/right screen edges (≈23px on a 375-wide viewport).
  const LABEL_HALFW = 60;
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
  const [geom, setGeom] = useState({ discSize: 360, wrapperH: 360, safeWidth: 360, vw: 360, vh: 720 });
  const { discSize, wrapperH, safeWidth, vw: geomVW, vh: geomVH } = geom;
  // Topic-count knob (3..15). 3 = show only the most newsworthy;
  // 15 = show the full placed set.
  const [topicCount, setTopicCount] = useState(8);
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
      // Layout: an outer `wrapperH` owns the vertical space the radar takes,
      // and the `discSize` is the actual disc drawn inside it. The disc is
      // anchored at the BOTTOM of the wrapper so shrinking the disc pulls
      // the TOP down while the bottom stays put.
      //   wrapperH = 55% of viewport height (total radar area)
      //   discSize = wrapperH * 0.88        (disc minus 12% from the top)
      const wrapper = Math.min(1060, vh * 0.55);
      const d = wrapper * 0.88;
      setGeom({
        discSize: Math.max(280, Math.round(d)),
        wrapperH: Math.max(300, Math.round(wrapper)),
        safeWidth: vw,
        vw,
        vh,
      });
    };
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const placed = useMemo(() => placeBig(trending.slice(0, topicCount), discSize, safeWidth), [trending, topicCount, discSize, safeWidth]);

  // Knob size: scale to fit the space between the disc and the footer
  // WITHOUT touching the disc's outer rim / blip labels. Uses 60% of
  // the available band and caps at 160 so even on tall screens the
  // knob stays modest and leaves generous negative space between it
  // and the disc — the key to making the two elements read as one
  // unified environment instead of two crowded blocks.
  const knobSize = useMemo(() => {
    const avail = (geomVH || 720) - wrapperH - 108;
    return Math.max(130, Math.min(160, Math.round(avail * 0.60)));
  }, [geomVH, wrapperH]);

  // Vertical gap between the disc's bottom edge (= 60 + wrapperH) and
  // the top of the knob. Centers the knob in the remaining band with a
  // minimum 42px buffer so the knob's outer tick ring can't visually
  // touch / overlap the disc's bottom rim or the blip labels that
  // spill just below it. 42px is enough for a ~30px label tail plus a
  // clean 12px breathing strip of negative space.
  const knobTopOffset = useMemo(() => {
    const avail = (geomVH || 720) - wrapperH - 108;
    const slack = Math.max(0, avail - knobSize);
    return Math.max(42, Math.round(slack / 2));
  }, [geomVH, wrapperH, knobSize]);

  const placedRef = useRef(placed);
  useEffect(() => { placedRef.current = placed; }, [placed]);

  const filtered = filter ? allFeed.filter(item => (item.title || '').includes(filter)).sort((a, b) => (b.pubTs || 0) - (a.pubTs || 0)) : [];

  // Reset any leftover sheet drag offset whenever the filter (news
  // panel open state) toggles, so a freshly-opened panel always
  // starts at translateY(0) without inheriting the previous drag.
  useEffect(() => {
    if (!filter) setSheetDragY(0);
  }, [filter]);

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

  // Theme — Wayfinder (Apple-Watch-Ultra-inspired graphite instrument
  // with sapphire crystal and compass bezel) is now the default. The
  // legacy red-wash instrument is still accessible via ?classic=1 for
  // reference. Using a URL param instead of a build flag so we can A/B
  // at any time without a redeploy.
  const theme = useMemo(() => {
    if (typeof window === 'undefined') return 'wayfinder';
    const p = new URLSearchParams(window.location.search);
    if (p.get('day') === '1') return 'day';
    if (p.get('classic') === '1') return 'default';
    return 'wayfinder';
  }, []);
  const isWF = theme === 'wayfinder' || theme === 'day';
  const isDay = theme === 'day';

  // Palette — swaps based on theme. In Wayfinder mode the accent is
  // Brand red (#E53935) — main accent, compass-needle colour of
  // the Apple Watch Ultra Wayfinder face — used sparingly as the sole
  // accent. Ring colors shift from the red tint to near-white titanium
  // so the concentric rings read like machined metal, not phosphor.
  // The background is tinted toward the same graphite so the whole
  // page feels like one material. The variable is still named `RED`
  // internally to keep the code shape stable across theme swaps.
  const RED        = '#E53935';
  const RED_BRIGHT = '#ff6659';
  const RED_DIM    = isWF ? 'rgba(229,57,53,.32)'  : 'rgba(229,57,53,.3)';
  const RED_FAINT  = isWF ? 'rgba(229,57,53,.10)'  : 'rgba(229,57,53,.12)';
  const RING       = isWF ? 'rgba(220,224,230,.12)' : 'rgba(229,57,53,.35)';
  const RING_BRIGHT = isWF ? 'rgba(240,244,250,.20)' : 'rgba(255,102,89,.50)';
  const MONO       = isWF
    ? '-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Arabic", system-ui, sans-serif'
    : 'ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace';

  // Live clock — tick every 15s so the minute display stays in sync.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);

  // ─── Topic-count knob (rotary) ─────────────────────────────────
  // Brushed-metal mechanical knob sitting in the lower center. Controls
  // how many trending topics render on the radar, from 3 (only the most
  // newsworthy) to 15 (essentially everything the placer can fit).
  // Gesture: pointerdown anywhere on the knob body and drag in an arc —
  // the angular delta from grab-point maps to a value delta. Released
  // pointer ends the gesture. Each discrete step vibrates briefly on
  // devices that support navigator.vibrate.
  const KNOB_MIN   = 3;
  const KNOB_MAX   = 15;
  const KNOB_RANGE = KNOB_MAX - KNOB_MIN; // 12 steps
  const KNOB_ARC   = 270;   // sweep from -135° (MIN) to +135° (MAX)
  const KNOB_START = -135;  // angle at MIN
  const knobRef         = useRef(null);
  const knobStartAngRef = useRef(0);
  const knobStartValRef = useRef(0);
  const [knobDragging, setKnobDragging] = useState(false);

  // Current indicator-pip angle from topicCount. 0° = up (12 o'clock).
  const knobAngle = KNOB_START + ((topicCount - KNOB_MIN) / KNOB_RANGE) * KNOB_ARC;

  // Get the pointer angle relative to the knob's center, normalized so
  // 0° = up (12 o'clock) and positive = clockwise.
  const getKnobAngle = useCallback((e) => {
    const el = knobRef.current;
    if (!el) return 0;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = e.clientX - cx;
    const dy = e.clientY - cy;
    return Math.atan2(dy, dx) * (180 / Math.PI) + 90;
  }, []);

  const handleKnobDown = useCallback((e) => {
    if (refreshing) return;
    knobStartAngRef.current = getKnobAngle(e);
    knobStartValRef.current = topicCount;
    setKnobDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }, [refreshing, topicCount, getKnobAngle]);

  const handleKnobMove = useCallback((e) => {
    if (!knobDragging) return;
    const a = getKnobAngle(e);
    // Unwrap angular delta so we can cross the ±180° seam without jumps.
    let delta = a - knobStartAngRef.current;
    while (delta > 180)  delta -= 360;
    while (delta < -180) delta += 360;
    const valueDelta = (delta / KNOB_ARC) * KNOB_RANGE;
    let v = Math.round(knobStartValRef.current + valueDelta);
    if (v < KNOB_MIN) v = KNOB_MIN;
    if (v > KNOB_MAX) v = KNOB_MAX;
    if (v !== topicCount) {
      setTopicCount(v);
      try { navigator.vibrate?.(6); } catch {}
    }
  }, [knobDragging, topicCount, getKnobAngle]);

  const handleKnobUp = useCallback((e) => {
    if (!knobDragging) return;
    setKnobDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
  }, [knobDragging]);

  // ─── News sheet swipe-down-to-dismiss ──────────────────────────
  // When the user presses a dot, the news panel slides up covering
  // the lower ~85% of the screen. These handlers let the user drag
  // the panel down by its handle/header area to dismiss it. Upward
  // drag is resisted (rubber-band); downward drag past 110px closes
  // the panel.
  const sheetStartYRef = useRef(0);
  const [sheetDragY,    setSheetDragY]    = useState(0);
  const [sheetDragging, setSheetDragging] = useState(false);

  const handleSheetDown = useCallback((e) => {
    sheetStartYRef.current = e.clientY;
    setSheetDragging(true);
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch {}
  }, []);

  const handleSheetMove = useCallback((e) => {
    if (!sheetDragging) return;
    const dy = e.clientY - sheetStartYRef.current;
    // Downward drag 1:1; upward drag rubber-bands to ~22%.
    setSheetDragY(dy > 0 ? dy : dy * 0.22);
  }, [sheetDragging]);

  const handleSheetUp = useCallback((e) => {
    if (!sheetDragging) return;
    setSheetDragging(false);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch {}
    if (sheetDragY > 110) {
      try { Sound.tap(); } catch {}
      setFilter(null);
    }
    setSheetDragY(0);
  }, [sheetDragging, sheetDragY]);

  const now = new Date(nowMs);
  const hudTime = `${String(now.getUTCHours()).padStart(2,'0')}:${String(now.getUTCMinutes()).padStart(2,'0')}Z`;

  // Real telemetry derived from the actual feed — no decorative numbers.
  const hud = useMemo(() => {
    const items = Array.isArray(allFeed) ? allFeed : [];
    const ts = items.map(it => it.pubTs).filter(t => typeof t === 'number' && t > 0);
    const maxTs = ts.length ? Math.max(...ts) : 0;
    const minTs = ts.length ? Math.min(...ts) : 0;

    // Age of the newest article (minutes)
    const ageMin = maxTs ? Math.max(0, Math.round((nowMs - maxTs) / 60000)) : null;
    const lastUtc = maxTs
      ? `${String(new Date(maxTs).getUTCHours()).padStart(2,'0')}:${String(new Date(maxTs).getUTCMinutes()).padStart(2,'0')}Z`
      : '--:--';

    // Time window covered by the current feed
    const spanMin = maxTs && minTs ? Math.max(0, Math.round((maxTs - minTs) / 60000)) : 0;
    const spanH = Math.floor(spanMin / 60);
    const spanRemM = spanMin % 60;

    // Unique sources active in the current feed
    const srcSet = new Set();
    items.forEach(it => {
      const sid = it?.s?.id || it?.source?.id || it?.source;
      if (sid) srcSet.add(sid);
    });

    // Peak topic — velocity-aware label if available, otherwise just the word
    const top = Array.isArray(trending) && trending[0] ? trending[0] : null;
    const topWord = top?.word || '—';
    const topVel = (top?.velocity ?? null);

    return {
      ageMin,
      lastUtc,
      spanH,
      spanRemM,
      sourceCount: srcSet.size,
      topWord,
      topVel,
      coverage: items.length,
      scanning: !!refreshing,
    };
  }, [allFeed, trending, refreshing, nowMs]);

  // Format age as "Nm" or "Nh" for compactness
  const fmtAge = (m) => m == null ? '--' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m/60)}h` : `${Math.round(m/1440)}d`;

  // Spectrum bars (visible only when refreshing) — 60 bars around the ring
  const SPECTRUM_COUNT = 60;

  return (
    <div style={{
      // Page background — harmonized with the disc material so the radar
      // reads as an instrument set into a larger graphite surface
      // instead of floating on a black void. In Wayfinder mode the
      // gradient is FLAT (nearly uniform graphite edge-to-edge) so the
      // bottom of the screen never cliffs into pitch black and the
      // disc + knob feel like they're in one continuous material with
      // no visible floor or ceiling. The tiny amount of gradient that
      // remains matches the sapphire specular direction.
      background: isDay
        ? 'radial-gradient(ellipse 140% 120% at 50% 38%, #FFFFFF 0%, #F5F5F5 40%, #EDEDED 75%, #E0E0E0 100%)'
        : isWF
        ? 'radial-gradient(ellipse 140% 120% at 50% 38%, #0f1014 0%, #0a0b0e 40%, #07080a 75%, #050608 100%)'
        : 'radial-gradient(ellipse at 50% 35%, #1a1c20 0%, #111316 55%, #07080a 100%)',
      minHeight:'100%',
      fontFamily:'var(--ft)', direction:'rtl',
      position:'relative',
    }}>
      {/* ─── Radar-room chrome overlays ─────────────────────────────────
          Fixed to the viewport so the whole page reads like a radar
          operator station: geopolitical motif background, CRT scanlines,
          ambient vignette, corner telemetry HUDs, and a red phosphor
          bezel. All pointer-events are disabled so clicks still reach
          the content below. */}

      {/* ─── Full-screen geopolitical motif ─────────────────
          A world-map schematic drawn across the entire viewport:
          latitude/meridian curves, landmass blobs, coastline arcs.
          Wrapped in a drifting container so the whole map slowly
          parallaxes. Individual landmass circles pulse on staggered
          timers so the motif feels alive. In Wayfinder mode the
          motif is dimmed to a near-invisible ambient texture so the
          background stays harmonized with the graphite disc surface
          — it's still there but reads as noise, not a feature. */}
      <div style={{
        position:'fixed', top:0, left:0,
        width:'100vw', height:'100vh',
        pointerEvents:'none', zIndex:1,
        opacity: booted ? (isWF ? 0.12 : 1) : 0,
        filter: isWF ? 'saturate(0) brightness(0.7)' : 'none',
        transition:'opacity 1.4s ease .2s',
        animation: booted ? 'map-drift 50s ease-in-out infinite' : 'none',
      }}>
      <svg
        width={geomVW || '100%'}
        height={geomVH || '100%'}
        viewBox={`0 0 ${geomVW || 375} ${geomVH || 812}`}
        preserveAspectRatio="none"
        style={{ width:'100%', height:'100%', display:'block' }}
      >
        {/* Latitude parallels — 7 curves sweeping across the width with
            slight vertical bow so they read as Earth parallels */}
        {[0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.92].map((y, i) => (
          <path
            key={`bg-lat-${i}`}
            d={`M ${-20} ${(geomVH||812)*y} Q ${(geomVW||375)*0.5} ${(geomVH||812)*(y + (i % 2 ? 0.018 : -0.018))}, ${(geomVW||375)+20} ${(geomVH||812)*y}`}
            fill="none"
            stroke="rgba(229,57,53,.18)"
            strokeWidth="1"
            strokeDasharray={i % 2 ? '4 8' : 'none'}
            style={{
              animation: `map-breathe ${11 + i}s ease-in-out ${i * 0.6}s infinite`,
            }}
          />
        ))}

        {/* Meridians — 7 vertical curves spanning full height */}
        {[0.08, 0.22, 0.36, 0.50, 0.64, 0.78, 0.92].map((x, i) => (
          <path
            key={`bg-mer-${i}`}
            d={`M ${(geomVW||375)*x} ${-20} Q ${(geomVW||375)*(x + (i % 2 ? 0.025 : -0.025))} ${(geomVH||812)*0.5}, ${(geomVW||375)*x} ${(geomVH||812)+20}`}
            fill="none"
            stroke="rgba(229,57,53,.16)"
            strokeWidth="1"
            strokeDasharray={i % 2 ? 'none' : '3 6'}
            style={{
              animation: `map-breathe ${13 + i}s ease-in-out ${i * 0.7 + 1}s infinite`,
            }}
          />
        ))}

        {/* Landmass blobs — scattered "continents" across the viewport.
            Each pulses on its own timer so the map feels like it's
            returning signal from distributed contacts. */}
        {[
          { cx: 0.12, cy: 0.10, r: 0.14, dash: '3 6' },
          { cx: 0.22, cy: 0.16, r: 0.06, dash: null },
          { cx: 0.06, cy: 0.22, r: 0.04, dash: null },
          { cx: 0.80, cy: 0.08, r: 0.11, dash: '3 6' },
          { cx: 0.92, cy: 0.14, r: 0.04, dash: null },
          { cx: 0.72, cy: 0.18, r: 0.05, dash: null },
          { cx: 0.50, cy: 0.06, r: 0.07, dash: '2 5' },

          { cx: 0.04, cy: 0.40, r: 0.06, dash: null },
          { cx: 0.96, cy: 0.44, r: 0.07, dash: '3 6' },

          { cx: 0.10, cy: 0.68, r: 0.08, dash: null },
          { cx: 0.02, cy: 0.80, r: 0.05, dash: null },
          { cx: 0.22, cy: 0.88, r: 0.10, dash: '3 6' },
          { cx: 0.34, cy: 0.78, r: 0.04, dash: null },

          { cx: 0.78, cy: 0.72, r: 0.12, dash: '3 6' },
          { cx: 0.92, cy: 0.82, r: 0.06, dash: null },
          { cx: 0.64, cy: 0.88, r: 0.08, dash: '3 6' },
          { cx: 0.56, cy: 0.76, r: 0.03, dash: null },
          { cx: 0.86, cy: 0.92, r: 0.04, dash: null },
        ].map((f, i) => (
          <circle
            key={`bg-land-${i}`}
            cx={f.cx * (geomVW||375)}
            cy={f.cy * (geomVH||812)}
            r={f.r * Math.min(geomVW||375, geomVH||812)}
            fill="none"
            stroke="rgba(229,57,53,.22)"
            strokeWidth="1.1"
            strokeDasharray={f.dash || 'none'}
            style={{
              transformBox:'fill-box',
              transformOrigin:'center',
              animation: `map-land-ping ${6 + (i % 5)}s ease-in-out ${(i * 0.45) % 6}s infinite`,
            }}
          />
        ))}

        {/* Coastline arcs — sinuous Q/T paths scattered across the screen.
            Stroke-dashoffset animates so the coastlines "flow" subtly. */}
        {(() => {
          const W = geomVW || 375;
          const H = geomVH || 812;
          return [
            `M ${W*0.02} ${H*0.12} Q ${W*0.16} ${H*0.06}, ${W*0.28} ${H*0.10} T ${W*0.48} ${H*0.14}`,
            `M ${W*0.62} ${H*0.04} Q ${W*0.74} ${H*0.12}, ${W*0.86} ${H*0.08}`,
            `M ${W*0.04} ${H*0.30} Q ${W*0.18} ${H*0.34}, ${W*0.26} ${H*0.28} T ${W*0.44} ${H*0.32}`,
            `M ${W*0.58} ${H*0.26} Q ${W*0.70} ${H*0.32}, ${W*0.82} ${H*0.28} T ${W*0.98} ${H*0.32}`,

            `M ${W*0.02} ${H*0.50} Q ${W*0.14} ${H*0.54}, ${W*0.22} ${H*0.48}`,
            `M ${W*0.78} ${H*0.52} Q ${W*0.88} ${H*0.48}, ${W*0.98} ${H*0.54}`,

            `M ${W*0.02} ${H*0.64} Q ${W*0.14} ${H*0.70}, ${W*0.24} ${H*0.66} T ${W*0.44} ${H*0.70}`,
            `M ${W*0.54} ${H*0.66} Q ${W*0.66} ${H*0.72}, ${W*0.78} ${H*0.68} T ${W*0.98} ${H*0.70}`,

            `M ${W*0.06} ${H*0.84} Q ${W*0.18} ${H*0.78}, ${W*0.30} ${H*0.84} T ${W*0.50} ${H*0.88}`,
            `M ${W*0.56} ${H*0.88} Q ${W*0.68} ${H*0.82}, ${W*0.80} ${H*0.88} T ${W*0.98} ${H*0.84}`,
          ];
        })().map((d, i) => (
          <path
            key={`bg-coast-${i}`}
            d={d}
            fill="none"
            stroke="rgba(229,57,53,.24)"
            strokeWidth="1.2"
            strokeLinecap="round"
            strokeDasharray="6 10"
            style={{
              animation: `map-coast-flow ${14 + (i % 4) * 3}s linear infinite`,
            }}
          />
        ))}

        {/* Grid intersection markers — faint crosses at every 10% */}
        {[0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].flatMap((x) =>
          [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9].map((y) => (
            <circle
              key={`bg-gx-${x}-${y}`}
              cx={x * (geomVW||375)}
              cy={y * (geomVH||812)}
              r="1"
              fill="rgba(229,57,53,.32)"
            />
          ))
        )}
      </svg>
      </div>

      {/* Depth vignette — darkens everything OUTSIDE the radar's
          outermost ring so the disc reads as a bright, recessed well
          against the dark void around it. Circle stops are pixel-based
          off `discSize` so the transparent hole matches the biggest
          circle exactly; outside the disc the fade ramps steeply to
          near-black, producing the "looking down into a radar pit"
          depth the design calls for. */}
      {/* Page-level radar-pit vignette — pixel-accurate circular
          darkening that leaves a transparent hole exactly where the
          disc sits and pitch-blacks everything else. Sits at zIndex:1
          so the map motif below it stays faintly visible through the
          darkening and the disc wrapper (zIndex:2) is drawn OVER the
          hole with its own lighter fill — that contrast is what makes
          the disc visibly pop from the surround. Center Y is computed
          from the actual (header + wrapperH − discSize/2) position so
          the hole lines up with the disc on every screen size. */}
      {/* In Wayfinder mode the pit vignette is replaced by the
          full-screen brushed plate below (with two circular cutouts
          for the disc and knob). In classic mode keep the original
          circular pit vignette so the disc still reads as a bright
          well against the void. */}
      {!isWF && (
        <div style={{
          position:'fixed', inset:0, pointerEvents:'none', zIndex:1,
          background: `radial-gradient(
            circle at 50% ${60 + wrapperH - discSize / 2}px,
            transparent 0px,
            transparent ${Math.max(0, discSize / 2 - 6)}px,
            rgba(0,0,0,0.52) ${discSize / 2 + 2}px,
            rgba(0,0,0,0.84) ${discSize / 2 + 90}px,
            rgba(0,0,0,0.96) ${discSize / 2 + 280}px
          )`,
          opacity: booted ? 1 : 0,
          transition:'opacity 1s ease .3s',
        }}/>
      )}

      {/* ─── Brushed-titanium plate with disc + knob cutouts ─────
          Wayfinder-only. A full-screen textured layer sitting above
          the page background and below the disc + knob. Two circular
          holes are masked out of it — one for the disc, one for the
          rotary knob — so the disc and knob feel like instruments
          "set into" a single continuous tool plate that fills the
          entire viewport. This is what makes the whole screen read
          as ONE environment instead of "disc + knob + background"
          as three separate blocks. */}
      {isWF && !isDay && geomVW > 0 && geomVH > 0 && (
        <svg
          width={geomVW}
          height={geomVH}
          viewBox={`0 0 ${geomVW} ${geomVH}`}
          preserveAspectRatio="none"
          style={{
            position:'fixed',
            top:0, left:0,
            width:'100vw', height:'100vh',
            pointerEvents:'none',
            zIndex: 2,
            opacity: booted ? 1 : 0,
            transition:'opacity 1.2s ease .35s',
          }}
        >
          <defs>
            {/* Brushed graphite base — fine vertical strokes at 4px
                intervals. Brighter base than the page bg so the plate
                reads as a distinct solid surface, with enough contrast
                in the strokes to feel hand-finished. */}
            <pattern
              id="wf-plate-pattern"
              x="0" y="0" width="4" height="4"
              patternUnits="userSpaceOnUse"
            >
              <rect width="4" height="4" fill="#22242a"/>
              <line x1="0" y1="0" x2="0" y2="4" stroke="rgba(62,66,74,.42)" strokeWidth="0.5"/>
              <line x1="2" y1="0" x2="2" y2="4" stroke="rgba(14,15,18,.48)" strokeWidth="0.5"/>
            </pattern>

            {/* Coordinate dots — fine pinpoint grid at 12px, like the
                reference ticks on a navigation chart. Feels less like
                tech/blueprint and more like a printed atlas. */}
            <pattern
              id="wf-plate-dots"
              x="0" y="0" width="12" height="12"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="0" cy="0" r="0.5" fill="rgba(150,158,172,.22)"/>
              <circle cx="6" cy="6" r="0.3" fill="rgba(130,138,150,.10)"/>
            </pattern>

            {/* Main map grid — 48px crosshatch of bright hairlines,
                the primary coordinate lines of the chart. */}
            <pattern
              id="wf-plate-grid"
              x="0" y="0" width="48" height="48"
              patternUnits="userSpaceOnUse"
            >
              <line x1="0" y1="0" x2="48" y2="0" stroke="rgba(155,165,180,.14)" strokeWidth="0.6"/>
              <line x1="0" y1="0" x2="0"  y2="48" stroke="rgba(155,165,180,.14)" strokeWidth="0.6"/>
            </pattern>

            {/* Meridian curves — 96px tile with two opposing arcs,
                suggesting a globe projection where longitude/latitude
                lines bow across the surface. Very subtle so it reads
                as geography, not as decoration. */}
            <pattern
              id="wf-plate-meridians"
              x="0" y="0" width="96" height="96"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0,48 Q48,8 96,48"  stroke="rgba(140,150,165,.08)" fill="none" strokeWidth="0.5"/>
              <path d="M0,48 Q48,88 96,48" stroke="rgba(140,150,165,.08)" fill="none" strokeWidth="0.5"/>
              <path d="M48,0 Q8,48 48,96"  stroke="rgba(140,150,165,.06)" fill="none" strokeWidth="0.5"/>
              <path d="M48,0 Q88,48 48,96" stroke="rgba(140,150,165,.06)" fill="none" strokeWidth="0.5"/>
            </pattern>

            {/* Topographic contours — irregular horizontal waves at
                120px pitch, suggesting terrain elevation lines seen
                from above. Draws the eye across the plate. */}
            <pattern
              id="wf-plate-contours"
              x="0" y="0" width="240" height="120"
              patternUnits="userSpaceOnUse"
            >
              <path d="M0,30 Q60,10 120,30 T240,30" stroke="rgba(160,170,185,.05)" fill="none" strokeWidth="0.5"/>
              <path d="M0,70 Q60,50 120,70 T240,70" stroke="rgba(160,170,185,.04)" fill="none" strokeWidth="0.5"/>
              <path d="M0,110 Q60,90 120,110 T240,110" stroke="rgba(160,170,185,.05)" fill="none" strokeWidth="0.5"/>
            </pattern>

            {/* Radial brightening overlay — a soft spotlight centered
                on the disc that lifts the plate in the viewing area. */}
            <radialGradient
              id="wf-plate-sheen"
              cx="50%"
              cy="38%"
              r="55%"
            >
              <stop offset="0%"   stopColor="rgba(255,255,255,.08)"/>
              <stop offset="40%"  stopColor="rgba(255,255,255,.025)"/>
              <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
            </radialGradient>

            {/* DEEP black halo — tight, aggressive vignette that
                pulls the entire periphery into near-black. This is
                the "suspense" filter the user asked for: the whole
                screen is darkened except for a tight pool around
                the disc center. */}
            <radialGradient
              id="wf-plate-halo"
              cx="50%" cy="40%"
              r="60%"
            >
              <stop offset="0%"   stopColor="rgba(0,0,0,0)"/>
              <stop offset="25%"  stopColor="rgba(0,0,0,.12)"/>
              <stop offset="55%"  stopColor="rgba(0,0,0,.55)"/>
              <stop offset="85%"  stopColor="rgba(0,0,0,.88)"/>
              <stop offset="100%" stopColor="rgba(0,0,0,.98)"/>
            </radialGradient>
          </defs>

          {/* 1. Base brushed graphite plate — covers the whole viewport,
                 no mask. The disc and knob (higher z-index, opaque
                 fills) stack on top and naturally occlude the plate
                 where they exist, so no alignment math is needed. */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="url(#wf-plate-pattern)"
          />
          {/* 2. Coordinate pinpoint dots */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="url(#wf-plate-dots)"
          />
          {/* 3. Main map-grid crosshatch */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="url(#wf-plate-grid)"
          />
          {/* 4. Meridian arcs — globe projection feel */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="url(#wf-plate-meridians)"
          />
          {/* 5. Topographic contours — terrain waves */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="url(#wf-plate-contours)"
          />
          {/* 6. Global dim tint — overall "night mode" darken */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="rgba(0,0,0,.30)"
          />
          {/* 7. Ambient sheen — soft spotlight around the disc area */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="url(#wf-plate-sheen)"
          />
          {/* 8. Deep black halo — tight suspense vignette */}
          <rect
            x="0" y="0"
            width={geomVW} height={geomVH}
            fill="url(#wf-plate-halo)"
          />
        </svg>
      )}

      {/* CRT scanlines + vertical scan drift — CRT monitor effects.
          Suppressed in Wayfinder mode because an Apple-grade instrument
          isn't pretending to be a 1970s scope. Left on in classic mode. */}
      {!isWF && (
        <>
          <div style={{
            position:'fixed', inset:0, pointerEvents:'none', zIndex:49,
            backgroundImage:'repeating-linear-gradient(0deg, rgba(229,57,53,.035) 0px, rgba(229,57,53,.035) 1px, transparent 1px, transparent 3px)',
            mixBlendMode:'screen',
            opacity: booted ? 1 : 0,
            transition:'opacity 1.2s ease .6s',
          }}/>
          <div style={{
            position:'fixed', left:0, right:0, height:'14%', pointerEvents:'none', zIndex:50,
            background:'linear-gradient(180deg, transparent 0%, rgba(229,57,53,.06) 40%, rgba(229,57,53,.10) 50%, rgba(229,57,53,.06) 60%, transparent 100%)',
            mixBlendMode:'screen',
            opacity: booted ? 1 : 0,
            animation: booted ? 'radar-vscan 7s linear infinite' : 'none',
            transition:'opacity 1s ease .8s',
          }}/>
        </>
      )}

      {/* ─── Footer: local date + time ──────────────────────
          A single centered footer line showing the user's LOCAL weekday,
          day, month, year, and time. Sits at the very bottom; the topic-
          count rotary knob lives above it, anchored below the disc. */}
      <div style={{
        position:'fixed', bottom:22, left:0, right:0,
        textAlign:'center',
        fontFamily:MONO, fontSize:11, fontWeight:800,
        color:RED, letterSpacing:.6,
        pointerEvents:'none', zIndex:51, direction:'rtl',
        opacity: booted ? (filter ? 0 : 1) : 0,
        visibility: filter ? 'hidden' : 'visible',
        transition: filter
          ? 'opacity .25s ease, visibility 0s linear .25s'
          : 'opacity 1s ease .9s',
        textShadow:`0 0 6px rgba(229,57,53,.55)`,
      }}>
        <div style={{display:'inline-flex', alignItems:'center', gap:10, justifyContent:'center'}}>
          <span>
            {new Date(nowMs).toLocaleDateString('ar', {
              weekday:'long', day:'numeric', month:'long', year:'numeric',
            })}
          </span>
          <span style={{color:'rgba(229,57,53,.55)'}}>·</span>
          <span style={{direction:'ltr'}}>
            {new Date(nowMs).toLocaleTimeString('ar', {
              hour:'2-digit', minute:'2-digit', hour12:false,
            })}
          </span>
        </div>
      </div>

      {/* ─── Topic-count rotary knob ─────────────────────────────────
          Brushed-metal mechanical knob sitting in the lower third
          below the disc. Primary tactile control for how many topics
          render on the radar. Rotate by dragging in an arc. In
          Wayfinder mode the knob is obsidian + titanium; classic mode
          is silver chrome. The single red indicator pip shows the
          current position against the tick ring. */}
      <div
        ref={knobRef}
        role="slider"
        tabIndex={0}
        aria-label="عدد المواضيع على الرادار"
        aria-valuemin={KNOB_MIN}
        aria-valuemax={KNOB_MAX}
        aria-valuenow={topicCount}
        onPointerDown={handleKnobDown}
        onPointerMove={handleKnobMove}
        onPointerUp={handleKnobUp}
        onPointerCancel={handleKnobUp}
        style={{
          position:'fixed',
          top: `${60 + wrapperH + knobTopOffset}px`,
          left:'50%',
          marginLeft: -knobSize / 2,
          width: knobSize,
          height: knobSize,
          borderRadius:'50%',
          zIndex: 52,
          opacity: booted ? (filter ? 0 : 1) : 0,
          transition: filter
            ? 'opacity .25s ease, visibility 0s linear .25s'
            : 'opacity 1s ease 1.1s',
          visibility: filter ? 'hidden' : 'visible',
          pointerEvents: (booted && !filter) ? 'auto' : 'none',
          touchAction:'none',
          userSelect:'none', WebkitUserSelect:'none',
          cursor: knobDragging ? 'grabbing' : 'grab',
          // Knob body: uses the SAME translucent graphite as the disc
          // above so the two elements read as one material, not two
          // floating objects. The knob's only distinguishing treatment
          // is a faint orange drag glow when active.
          background: isDay
            ? `radial-gradient(circle at 34% 24%,
                #FFFFFF 0%,
                #F5F5F5 30%,
                #E0E0E0 65%,
                #CFCFCF 100%)`
            : isWF
            ? `radial-gradient(circle at 34% 24%,
                #050608 0%,
                #030406 40%,
                #010102 72%,
                #000000 100%)`
            : `radial-gradient(circle at 34% 26%,
                #e2e3e6 0%,
                #b4b6bb 18%,
                #7a7c81 48%,
                #2b2c30 82%,
                #0e0f12 100%)`,
          boxShadow: isDay
            ? `
              0 0 0 1px rgba(10,10,10,.10),
              0 0 0 2px rgba(207,207,207,.45),
              0 0 0 3px rgba(10,10,10,.06),
              inset 0 3px 5px rgba(10,10,10,.06),
              inset 0 -1px 1px rgba(255,255,255,.85),
              inset 0 0 70px rgba(10,10,10,.04),
              0 18px 40px rgba(10,10,10,.10),
              0 0 ${knobDragging ? 44 : 26}px rgba(229,57,53,.42)
            `
            : isWF
            // Same inset rim recipe as the disc — dark groove +
            // titanium highlight + inner shadow for a "sunk into
            // the plate" feel. Plus the orange drag-glow layered
            // on top as the knob's active state.
            ? `
              0 0 0 1px rgba(0,0,0,.70),
              0 0 0 2px rgba(72,76,84,.38),
              0 0 0 3px rgba(0,0,0,.50),
              inset 0 3px 5px rgba(0,0,0,.65),
              inset 0 -1px 1px rgba(255,255,255,.05),
              inset 0 0 70px rgba(0,0,0,.55),
              0 0 35px rgba(0,0,0,.45),
              0 0 ${knobDragging ? 44 : 26}px rgba(229,57,53,.32)
            `
            : `
              inset 0 1px 0 rgba(255,255,255,.7),
              inset 0 -2px 4px rgba(0,0,0,.7),
              inset 0 0 0 1px rgba(0,0,0,.55),
              0 2px 0 rgba(255,255,255,.08),
              0 20px 38px rgba(0,0,0,.7),
              0 0 ${knobDragging ? 34 : 18}px rgba(229,57,53,.45)
            `,
        }}
      >
        {/* Tick ring — 49 ticks over 270° arc, inside the bezel */}
        <svg
          viewBox="0 0 164 164"
          width="100%" height="100%"
          style={{ position:'absolute', inset:0, pointerEvents:'none' }}
        >
          {Array.from({ length: 49 }).map((_, i) => {
            const t = i / 48;
            const ang = (KNOB_START + t * KNOB_ARC - 90) * Math.PI / 180;
            const r1 = 76;
            const r2 = i % 4 === 0 ? 68 : 72;
            const cx = 82 + Math.cos(ang) * r1;
            const cy = 82 + Math.sin(ang) * r1;
            const ix = 82 + Math.cos(ang) * r2;
            const iy = 82 + Math.sin(ang) * r2;
            // Highlight ticks at or before the current value (red tint)
            const valAt = KNOB_MIN + Math.round(t * KNOB_RANGE);
            const active = valAt <= topicCount;
            const stroke = active
              ? (isWF ? 'rgba(229,57,53,.85)' : 'rgba(229,57,53,.85)')
              : (isWF ? 'rgba(220,224,230,.42)' : 'rgba(235,238,243,.45)');
            return (
              <line
                key={i}
                x1={cx} y1={cy} x2={ix} y2={iy}
                stroke={stroke}
                strokeWidth={i % 4 === 0 ? 1.4 : 0.8}
                strokeLinecap="round"
              />
            );
          })}
        </svg>

        {/* Inner brushed disc — the rotating face of the knob */}
        <div style={{
          position:'absolute',
          inset: '16%',
          borderRadius:'50%',
          background: isDay
            ? `conic-gradient(from 0deg,
                #f5f5f5, #e9e9ec, #efefef, #e0e0e0, #f1f1f3,
                #e5e5e8, #ededed, #dcdce0, #f5f5f5)`
            : isWF
            ? `conic-gradient(from 0deg,
                #161719, #1f2023, #161719, #1b1c1f, #151618,
                #1e1f22, #171819, #1a1b1e, #161719)`
            : `conic-gradient(from 0deg,
                #e8e9ec, #b7b8bc, #d9dade, #aeafb3, #dddee1,
                #bcbdc0, #e4e5e8, #b5b6ba, #e8e9ec)`,
          boxShadow: isWF
            ? `
              inset 0 2px 6px rgba(0,0,0,.85),
              inset 0 -1px 0 rgba(255,255,255,.05),
              0 0 0 1px rgba(0,0,0,.55),
              0 0 0 2px rgba(200,204,210,.10)
            `
            : `
              inset 0 2px 6px rgba(0,0,0,.55),
              inset 0 -2px 5px rgba(255,255,255,.20),
              0 0 0 1px rgba(0,0,0,.7)
            `,
          transform: `rotate(${knobAngle}deg)`,
          transition: knobDragging
            ? 'box-shadow .15s'
            : 'transform .22s cubic-bezier(.2,.9,.2,1.05), box-shadow .25s',
        }}>
          {/* Center dimple — small recessed dot at the pivot */}
          <div style={{
            position:'absolute',
            top:'50%', left:'50%',
            width: 14, height: 14,
            marginLeft: -7, marginTop: -7,
            borderRadius:'50%',
            background: isWF
              ? 'radial-gradient(circle at 40% 36%, #0a0b0d 0%, #040506 60%, #000 100%)'
              : 'radial-gradient(circle at 40% 36%, #2a2b2e 0%, #0a0b0d 60%, #000 100%)',
            boxShadow:`
              inset 0 1px 2px rgba(0,0,0,.95),
              inset 0 -1px 0 rgba(255,255,255,.12),
              0 0 0 1px rgba(0,0,0,.7)
            `,
          }}/>

          {/* Red indicator pip — sits near the top edge of the inner
              disc, rotates with it. This is the primary readout of
              the current value against the tick ring. */}
          <div style={{
            position:'absolute',
            top: 10,
            left:'50%',
            marginLeft: -6,
            width: 12, height: 12,
            borderRadius:'50%',
            background:'radial-gradient(circle at 36% 28%, #FFB3B0 0%, #E53935 45%, #B71C1C 100%)',
            boxShadow:`
              inset 0 1px 1px rgba(255,255,255,.55),
              inset 0 -1px 2px rgba(0,0,0,.55),
              0 0 0 1px rgba(0,0,0,.8),
              0 0 ${knobDragging ? 14 : 7}px rgba(229,57,53,1)
            `,
          }}/>
        </div>

        {/* MIN / MAX reference labels outside the tick arc */}
        <div style={{
          position:'absolute',
          left: '12%', bottom: '12%',
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
          letterSpacing: 1.4,
          color: isDay ? 'rgba(68,68,68,.65)' : isWF ? 'rgba(220,224,230,.55)' : 'rgba(235,238,243,.55)',
          pointerEvents:'none',
        }}>MIN</div>
        <div style={{
          position:'absolute',
          right: '12%', bottom: '12%',
          fontFamily: MONO, fontSize: 9, fontWeight: 700,
          letterSpacing: 1.4,
          color: isDay ? 'rgba(68,68,68,.65)' : isWF ? 'rgba(220,224,230,.55)' : 'rgba(235,238,243,.55)',
          pointerEvents:'none',
        }}>MAX</div>
      </div>

      {/* ─── Bezel frame — inset red phosphor glow on page edges ───
          Suppressed in Wayfinder mode: Apple-style means no permanent
          colored wash. The graphite page background speaks for itself. */}
      {!isWF && (
        <div style={{
          position:'fixed', inset:0, pointerEvents:'none', zIndex:52,
          boxShadow:'inset 0 0 48px rgba(229,57,53,.18), inset 0 0 2px rgba(229,57,53,.45)',
          opacity: booted ? 1 : 0,
          transition:'opacity 1s ease .5s',
        }}/>
      )}
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
            fontSize:12, color:RED, fontWeight:800, letterSpacing:.5,
            padding:'2px 8px', border:`1px solid ${RED_DIM}`, borderRadius:3,
          }}>رادار</span>
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
        height: wrapperH,
        width:'100%',
        // Crop horizontally only (the disc extends past vw on narrow
        // screens and needs to be cropped on the sides). Keep Y visible
        // so blip labels that naturally fall just below the disc edge
        // are NOT cropped by the wrapper.
        overflowX:'hidden',
        overflowY:'visible',
        position:'relative', zIndex:3,
      }}>
        <div style={{
          position:'absolute',
          bottom:0, left:'50%',
          marginLeft: -discSize / 2,
          width: discSize, height: discSize,
          animation: booted ? 'radar-boot .7s cubic-bezier(.34,1.56,.64,1) both' : 'none',
        }}>
          {/* Disc surface — the radar pit itself.
              A noticeably lighter dark-gray fill fading to near-black at
              the rim. The contrast against the pitch-black page (set to
              #050608 by the page-level dark layer behind us) is what
              makes the disc pop — matching the watch sketch where the
              inside is visibly lighter than the outside. A crisp 2px
              red rim marks the edge, with a soft outer red glow and
              inner rim darkening for depth. */}
          <div style={{
            position:'absolute', inset:0,
            borderRadius:'50%',
            background: isWF
              // Wayfinder: a deep graphite well, noticeably darker than
              // the surrounding textured plate so the disc reads as
              // an instrument panel inlaid INTO the plate — not as a
              // separate floating object. Same fill used by the knob
              // so both elements share one material. Dimmed one more
              // notch so the disc surface recedes and the content
              // (rings, blips, labels) reads as the hero.
              ? 'radial-gradient(circle at 42% 36%, #050608 0%, #030406 40%, #010102 72%, #000000 100%)'
              : 'radial-gradient(circle at 50% 45%, #34383f 0%, #262930 35%, #171a1f 70%, #0c0e12 95%, #0a0c10 100%)',
            boxShadow: isWF
              // Inset rim treatment: a dark groove around the perimeter
              // plus a titanium highlight catches the plate's edge,
              // and a soft inner shadow gives the disc a "sunk into
              // the plate" feel. The knob uses the same recipe so
              // both elements share one edge treatment.
              ? `
                0 0 0 1px rgba(0,0,0,.70),
                0 0 0 2px rgba(72,76,84,.38),
                0 0 0 3px rgba(0,0,0,.50),
                inset 0 3px 5px rgba(0,0,0,.65),
                inset 0 -1px 1px rgba(255,255,255,.05),
                inset 0 0 70px rgba(0,0,0,.55),
                0 0 40px rgba(0,0,0,.45)
              `
              : `
                0 0 0 2px rgba(229,57,53,.38),
                0 0 64px rgba(229,57,53,.14),
                inset 0 0 80px rgba(0,0,0,.55),
                inset 0 0 0 1px rgba(255,255,255,.05)
              `,
          }}>
            {/* ─── Wayfinder overlays — only rendered when ?wayfinder=1
                is on the URL. These turn the disc into an Apple-Watch-
                Ultra-style instrument: a compass bezel engraved around
                the rim, and a sapphire specular highlight arcing across
                the upper-left of the crystal. Layered ABOVE the disc
                fill so they sit on the glass, not under it. */}
            {isWF && (
              <>
                {/* Sapphire specular highlight — a soft elliptical sheen
                    simulating light glancing off a convex sapphire crystal.
                    Positioned up-left, faded to nothing by the disc center,
                    no pointer events so tags stay tappable. */}
                <div style={{
                  position:'absolute', inset:0, borderRadius:'50%',
                  background:`
                    radial-gradient(ellipse 65% 50% at 32% 22%,
                      rgba(255,255,255,.16) 0%,
                      rgba(255,255,255,.06) 28%,
                      rgba(255,255,255,0) 60%
                    )
                  `,
                  mixBlendMode:'screen',
                  pointerEvents:'none',
                  opacity: booted ? 1 : 0,
                  transition:'opacity .9s ease .4s',
                }}/>

                {/* Compass bezel ring — thin inset ring with 72 ticks
                    (every 5°), major ticks every 30°, and cardinal
                    engravings N / E / S / W at 0/90/180/270. SVG lives
                    in a coordinate space equal to discSize so the
                    positions scale automatically. */}
                <svg
                  width={discSize} height={discSize}
                  viewBox={`0 0 ${discSize} ${discSize}`}
                  style={{
                    position:'absolute', inset:0, pointerEvents:'none',
                    opacity: booted ? 1 : 0,
                    transition:'opacity .9s ease .5s',
                  }}
                >
                  {/* Bezel inner ring — hairline */}
                  <circle
                    cx={discSize/2} cy={discSize/2}
                    r={discSize/2 - 18}
                    fill="none"
                    stroke="rgba(220,224,230,.10)"
                    strokeWidth={1}
                  />
                  {/* Bezel ticks */}
                  {Array.from({length:72}).map((_, i) => {
                    const deg = i * 5;
                    const rad = (deg - 90) * Math.PI / 180;
                    const isMajor = deg % 30 === 0;
                    const rOuter = discSize/2 - 6;
                    const rInner = isMajor ? discSize/2 - 22 : discSize/2 - 14;
                    const cx = discSize/2, cy = discSize/2;
                    const x1 = cx + rOuter * Math.cos(rad);
                    const y1 = cy + rOuter * Math.sin(rad);
                    const x2 = cx + rInner * Math.cos(rad);
                    const y2 = cy + rInner * Math.sin(rad);
                    return (
                      <line
                        key={i}
                        x1={x1} y1={y1} x2={x2} y2={y2}
                        stroke={isMajor ? 'rgba(235,238,243,.42)' : 'rgba(180,184,190,.22)'}
                        strokeWidth={isMajor ? 1.6 : 0.9}
                        strokeLinecap="round"
                      />
                    );
                  })}
                  {/* Cardinal engravings — N / E / S / W */}
                  {[
                    {label:'N', deg:0},
                    {label:'E', deg:90},
                    {label:'S', deg:180},
                    {label:'W', deg:270},
                  ].map(({label, deg}) => {
                    const rad = (deg - 90) * Math.PI / 180;
                    const r = discSize/2 - 34;
                    const cx = discSize/2, cy = discSize/2;
                    const x = cx + r * Math.cos(rad);
                    const y = cy + r * Math.sin(rad);
                    return (
                      <text
                        key={label}
                        x={x} y={y}
                        textAnchor="middle"
                        dominantBaseline="central"
                        fill={label === 'N' ? RED : 'rgba(235,238,243,.55)'}
                        fontSize={13}
                        fontWeight={700}
                        fontFamily='-apple-system, "SF Pro Display", system-ui, sans-serif'
                        letterSpacing={0.8}
                      >{label}</text>
                    );
                  })}
                </svg>

                {/* Inner glass rim — crystal edge highlight */}
                <div style={{
                  position:'absolute',
                  inset: 2,
                  borderRadius:'50%',
                  pointerEvents:'none',
                  boxShadow:`
                    inset 0 1px 0 rgba(255,255,255,.10),
                    inset 0 -1px 0 rgba(0,0,0,.6)
                  `,
                }}/>
              </>
            )}

            {/* Dot grid texture — suppressed in Wayfinder mode so the
                disc surface stays clean and graphite. */}
            {!isWF && (
              <div style={{
                position:'absolute', inset:0, borderRadius:'50%',
                backgroundImage:`radial-gradient(${RED_FAINT} 1px, transparent 1px)`,
                backgroundSize:'10px 10px',
                opacity: booted ? 0.4 : 0, transition:'opacity .5s ease .3s',
                pointerEvents:'none',
              }}/>
            )}

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
                // Outermost ring is the disc rim — thicker + soft glow
                // so it reads as the radar's physical edge without
                // overpowering the rest of the chrome.
                border: i === 0
                  ? `1.4px solid ${RING_BRIGHT}`
                  : `1px ${i === 2 ? 'solid' : 'dashed'} ${RING}`,
                boxShadow: i === 0
                  ? '0 0 10px rgba(229,57,53,.22), inset 0 0 10px rgba(229,57,53,.10)'
                  : 'none',
                opacity: booted ? (i === 0 ? 0.85 : 0.75 - i*0.08) : 0,
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
          mental model. The drag handle + header are a swipe-down-to-
          dismiss zone: drag them down past ~110px and the panel closes. */}
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
        transform: filter
          ? `translateY(${Math.max(0, sheetDragY)}px)`
          : 'translateY(100%)',
        transition: sheetDragging
          ? 'none'
          : 'transform .42s cubic-bezier(.22,1,.36,1)',
        zIndex: 50,
        display:'flex', flexDirection:'column',
        pointerEvents: filter ? 'auto' : 'none',
        direction:'rtl',
      }}>
        {/* Drag zone — drag handle + header combined. Pointer events
            on this wrapper drive the swipe-to-dismiss gesture. The
            scrollable article list below is excluded so the list still
            scrolls normally. */}
        <div
          onPointerDown={handleSheetDown}
          onPointerMove={handleSheetMove}
          onPointerUp={handleSheetUp}
          onPointerCancel={handleSheetUp}
          style={{
            touchAction:'none',
            userSelect:'none', WebkitUserSelect:'none',
            cursor: sheetDragging ? 'grabbing' : 'grab',
          }}
        >
        {/* Drag handle */}
        <div style={{
          padding:'10px 0 4px', display:'flex', justifyContent:'center',
        }}>
          <div style={{
            width:40, height:4, borderRadius:2,
            background: sheetDragging
              ? 'rgba(255,255,255,.45)'
              : 'rgba(255,255,255,.18)',
            transition:'background .2s',
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
          <button
            onClick={() => { Sound.tap(); setFilter(null); }}
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              background:'rgba(229,57,53,.1)', border:`1px solid ${RED_DIM}`,
              borderRadius:14, width:28, height:28, padding:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              cursor:'pointer', flexShrink:0,
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={RED} strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
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
