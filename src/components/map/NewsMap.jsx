import { useState, useEffect, useRef, useMemo } from 'react';
import { I } from '../shared/Icons';
import { detectGeoFromText } from '../../data/geo';

const REGION_CLOCKS = {
  default: [
    { city:'الرياض', tz:'Asia/Riyadh' },
    { city:'لندن',   tz:'Europe/London' },
    { city:'نيويورك',tz:'America/New_York' },
    { city:'طوكيو',  tz:'Asia/Tokyo' },
  ],
  gulf: [
    { city:'الرياض', tz:'Asia/Riyadh' },
    { city:'دبي',    tz:'Asia/Dubai' },
    { city:'الدوحة', tz:'Asia/Qatar' },
    { city:'الكويت', tz:'Asia/Kuwait' },
  ],
  levant: [
    { city:'دمشق',   tz:'Asia/Damascus' },
    { city:'بيروت',  tz:'Asia/Beirut' },
    { city:'عمّان',  tz:'Asia/Amman' },
    { city:'القدس',  tz:'Asia/Jerusalem' },
  ],
  iraq: [
    { city:'بغداد',  tz:'Asia/Baghdad' },
    { city:'طهران',  tz:'Asia/Tehran' },
    { city:'الرياض', tz:'Asia/Riyadh' },
    { city:'أنقرة',  tz:'Europe/Istanbul' },
  ],
  iran: [
    { city:'طهران',  tz:'Asia/Tehran' },
    { city:'بغداد',  tz:'Asia/Baghdad' },
    { city:'كابل',   tz:'Asia/Kabul' },
    { city:'موسكو',  tz:'Europe/Moscow' },
  ],
  northAfrica: [
    { city:'القاهرة', tz:'Africa/Cairo' },
    { city:'طرابلس', tz:'Africa/Tripoli' },
    { city:'تونس',   tz:'Africa/Tunis' },
    { city:'الجزائر', tz:'Africa/Algiers' },
  ],
  egypt: [
    { city:'القاهرة', tz:'Africa/Cairo' },
    { city:'الرياض', tz:'Asia/Riyadh' },
    { city:'الخرطوم', tz:'Africa/Khartoum' },
    { city:'لندن',   tz:'Europe/London' },
  ],
  turkey: [
    { city:'أنقرة',   tz:'Europe/Istanbul' },
    { city:'موسكو',  tz:'Europe/Moscow' },
    { city:'القاهرة', tz:'Africa/Cairo' },
    { city:'طهران',  tz:'Asia/Tehran' },
  ],
  europe: [
    { city:'لندن',   tz:'Europe/London' },
    { city:'باريس',  tz:'Europe/Paris' },
    { city:'برلين',  tz:'Europe/Berlin' },
    { city:'موسكو',  tz:'Europe/Moscow' },
  ],
  americas: [
    { city:'واشنطن', tz:'America/New_York' },
    { city:'شيكاغو', tz:'America/Chicago' },
    { city:'لوس أنجلس', tz:'America/Los_Angeles' },
    { city:'ساو باولو', tz:'America/Sao_Paulo' },
  ],
  eastAsia: [
    { city:'طوكيو',  tz:'Asia/Tokyo' },
    { city:'بكين',   tz:'Asia/Shanghai' },
    { city:'سيول',   tz:'Asia/Seoul' },
    { city:'نيودلهي', tz:'Asia/Kolkata' },
  ],
  africa: [
    { city:'نيروبي',  tz:'Africa/Nairobi' },
    { city:'القاهرة', tz:'Africa/Cairo' },
    { city:'لاغوس',  tz:'Africa/Lagos' },
    { city:'جوهانسبرغ', tz:'Africa/Johannesburg' },
  ],
  yemen: [
    { city:'صنعاء',  tz:'Asia/Aden' },
    { city:'الرياض', tz:'Asia/Riyadh' },
    { city:'جيبوتي', tz:'Africa/Djibouti' },
    { city:'القاهرة', tz:'Africa/Cairo' },
  ],
};

function detectRegion(spot) {
  if (!spot) return 'default';
  const { lat, lng, country } = spot;
  const c = (country || '').toLowerCase();
  if (c.includes('إيران') || c.includes('iran')) return 'iran';
  if (c.includes('عراق') || c.includes('iraq')) return 'iraq';
  if (c.includes('تركيا') || c.includes('turkey') || c.includes('türk')) return 'turkey';
  if (c.includes('مصر') || c.includes('egypt')) return 'egypt';
  if (c.includes('يمن') || c.includes('yemen')) return 'yemen';
  if (c.includes('سوري') || c.includes('لبنان') || c.includes('أردن') || c.includes('فلسطين')) return 'levant';
  if (c.includes('ليبيا') || c.includes('تونس') || c.includes('جزائر') || c.includes('مغرب')) return 'northAfrica';
  // Fallback by coordinates
  if (lat > 20 && lat < 32 && lng > 43 && lng < 60) return 'gulf';
  if (lat > 30 && lat < 38 && lng > 34 && lng < 43) return 'levant';
  if (lat > 15 && lat < 35 && lng > -10 && lng < 20) return 'northAfrica';
  if (lat > 35 && lat < 70 && lng > -12 && lng < 40) return 'europe';
  if (lat > -60 && lat < 70 && lng > -130 && lng < -30) return 'americas';
  if (lat > -10 && lat < 55 && lng > 70 && lng < 150) return 'eastAsia';
  if (lat > -40 && lat < 15 && lng > 10 && lng < 55) return 'africa';
  return 'default';
}

function buildMapSpots(feed) {
  const spots = {};
  feed.forEach(item => {
    const txt = (item.title||'')+' '+(item.body||'');
    const geo = detectGeoFromText(txt);
    if (!geo) return;
    if (!spots[geo.id]) spots[geo.id] = { ...geo, stories: [], heat: 1 };
    const src = item.s || item.source || {};
    const logo = src.logo || (src.domain ? `https://www.google.com/s2/favicons?domain=${src.domain}&sz=64` : null);
    spots[geo.id].stories.push({
      title: item.title,
      src: src.n || src.name || '—',
      logo,
      img: item.realImg || null,
      t: item.t||item.time||'',
      tag: item.tag||item.categories?.[0]||null,
      brk: item.brk||false,
      link: item.link||null,
    });
  });
  Object.values(spots).forEach(s => { const c=s.stories.length; s.heat=c>=5?3:c>=2?2:1; });
  return Object.values(spots).sort((a,b) => b.stories.length-a.stories.length);
}

// ────────────────────────────────────────────────────────────
// Minimal digital clock — HH:MM with city name below.
function DigitalClock({ tz, city, time }) {
  let display = '--:--';
  try {
    display = new Intl.DateTimeFormat('en-u-nu-latn', {
      timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false,
    }).format(time);
  } catch {}

  return (
    <div style={{ textAlign:'center', pointerEvents:'none', minWidth:52 }}>
      <div style={{
        fontSize:18, color:'rgba(255,255,255,.92)', fontWeight:700,
        fontVariantNumeric:'tabular-nums', fontFeatureSettings:'"tnum"',
        fontFamily:'var(--ft)', letterSpacing:'.04em', lineHeight:1,
      }}>{display}</div>
      <div style={{
        fontSize:9, color:'rgba(255,255,255,.48)', marginTop:4,
        letterSpacing:'.02em', fontWeight:600,
        fontFamily:'var(--ft)', direction:'rtl',
      }}>{city}</div>
    </div>
  );
}

function playBlip() {
  try {
    const ctx=new (window.AudioContext||window.webkitAudioContext)();
    const osc=ctx.createOscillator(), gain=ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.setValueAtTime(900,ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(450,ctx.currentTime+0.15);
    osc.type='sine';
    gain.gain.setValueAtTime(0.06,ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+0.3);
    osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.35);
  } catch(e){}
}

// inject keyframes once
if (typeof document !== 'undefined' && !document.getElementById('newsmap-css')) {
  const s = document.createElement('style');
  s.id = 'newsmap-css';
  s.textContent = `
    @keyframes nm-fade{0%{opacity:0}100%{opacity:1}}
    @keyframes nm-pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.85)}}
    @keyframes nm-glow{0%,100%{box-shadow:0 0 4px rgba(229,57,53,.6)}50%{box-shadow:0 0 12px rgba(229,57,53,.9),0 0 24px rgba(229,57,53,.3)}}
    @keyframes nm-slide{0%{transform:translateY(100%)}100%{transform:translateY(0)}}
    @keyframes nm-line{0%{transform:scaleX(0)}100%{transform:scaleX(1)}}
    @keyframes nm-ticker{0%{transform:translateX(100%)}100%{transform:translateX(-100%)}}
    @keyframes nm-ring{0%{transform:scale(1);opacity:.6}100%{transform:scale(2.5);opacity:0}}
    @keyframes nm-mark-in{0%{transform:scale(0);opacity:0}60%{transform:scale(1.15);opacity:1}100%{transform:scale(1);opacity:1}}
    @keyframes nm-mark-pulse{0%,100%{box-shadow:0 0 0 0 var(--mk-glow, rgba(229,57,53,.5)),0 4px 14px rgba(0,0,0,.5)}50%{box-shadow:0 0 0 6px rgba(229,57,53,0),0 4px 14px rgba(0,0,0,.5)}}
    /* Animate the avatar (child), not the marker root — maplibre owns the root's transform */
    .nm-marker{cursor:pointer}
    .nm-marker-avatar{transition:transform .22s cubic-bezier(.34,1.56,.64,1);animation:nm-mark-in .45s cubic-bezier(.34,1.56,.64,1) both;will-change:transform}
    .nm-marker:hover .nm-marker-avatar{transform:scale(1.12)}
    .nm-marker.hot .nm-marker-avatar{animation:nm-mark-in .45s cubic-bezier(.34,1.56,.64,1) both,nm-mark-pulse 2.2s ease-in-out .45s infinite}
    .nm-marker-label{opacity:0;transition:opacity .2s}
    .nm-marker:hover .nm-marker-label{opacity:1}
  `;
  document.head.appendChild(s);
}

export function NewsMap({ onClose, liveFeed=[] }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const [sel, setSel]   = useState(null);
  const [time, setTime] = useState(new Date());
  const [mapReady, setMapReady] = useState(false);
  const [entered, setEntered]   = useState(false);
  const spotsKey = useMemo(() => liveFeed.map(f => f.id).join(','), [liveFeed]);
  const spots = useMemo(() => buildMapSpots(liveFeed), [spotsKey]);
  const spotsRef = useRef(spots);
  useEffect(() => { spotsRef.current = spots; }, [spots]);

  const activeClock = REGION_CLOCKS[detectRegion(sel)] || REGION_CLOCKS.default;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Cinematic entrance
  useEffect(() => { const t = setTimeout(()=>setEntered(true), 80); return ()=>clearTimeout(t); }, []);

  useEffect(() => {
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css'; link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (!mapContainerRef.current || mapRef.current) return;
      const ML = window.maplibregl;

      const map = new ML.Map({
        container: mapContainerRef.current,
        style: 'https://api.maptiler.com/maps/satellite-v4/style.json?key=4N5DoFylw84fAtpCt9kl',
        center: [38, 28], zoom: 3.2, pitch: 0, bearing: 0,
        minZoom: 1.8, maxZoom: 10,
        attributionControl: false, maxPitch: 0,
        dragRotate: false, pitchWithRotate: false, touchPitch: false,
        renderWorldCopies: false,
      });

      mapRef.current = map;

      // ── Touch UX ─────────────────────────────────────────────
      // Lock rotation + pitch so the map stays flat. Everything else
      // uses MapLibre's built-in defaults — they're already tuned for
      // smooth inertial panning and pinch-zoom. Don't override them.
      try { map.touchZoomRotate.disableRotation(); } catch {}

      // ── Idle drift ──────────────────────────────────────────────
      // Uses MapLibre's own easeTo (long-duration, linear easing) so
      // the engine handles its own render loop instead of us fighting
      // it with per-frame jumpTo calls. Each leg is a 25-second ease
      // to a new waypoint on a Lissajous orbit.
      let idleRunning = false;
      let idleLeg = 0;
      let idleTimer = null;

      const nextIdleWaypoint = () => {
        idleLeg++;
        const t = idleLeg * 0.9;
        return [
          38 + Math.sin(t * 0.35) * 6,
          28 + Math.cos(t * 0.25) * 3,
          3.2 + Math.sin(t * 0.18) * 0.25,
        ];
      };

      const driftLeg = () => {
        if (!idleRunning || !map || map._removed) return;
        const [lng, lat, z] = nextIdleWaypoint();
        map.easeTo({
          center: [lng, lat], zoom: z, duration: 25000,
          easing: t => t, // linear — constant, smooth motion
        });
      };

      const startIdle = () => {
        if (idleRunning) return;
        idleRunning = true;
        driftLeg();
        // Chain legs: every time one finishes, start the next
        map.on('moveend', onIdleMoveEnd);
      };

      const onIdleMoveEnd = () => {
        if (idleRunning) driftLeg();
      };

      const stopIdle = () => {
        idleRunning = false;
        if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
        map.stop(); // cancel any in-progress easeTo
        map.off('moveend', onIdleMoveEnd);
      };

      const scheduleIdle = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(startIdle, 4000);
      };

      // Only real user gestures stop the drift — canvas-level events,
      // not map-internal moveend/zoomstart events.
      const canvas = map.getCanvas();
      const onWheel = () => { stopIdle(); scheduleIdle(); };
      canvas.addEventListener('mousedown', stopIdle, { passive: true });
      canvas.addEventListener('touchstart', stopIdle, { passive: true });
      canvas.addEventListener('wheel', onWheel, { passive: true });
      canvas.addEventListener('mouseup', scheduleIdle, { passive: true });
      canvas.addEventListener('touchend', scheduleIdle, { passive: true });

      // Begin drift 2s after map init
      const initIdleTimeout = setTimeout(startIdle, 2000);

      // Expose for cross-closure access (marker click handler, cleanup)
      map._idleStop = stopIdle;
      map._idleSchedule = scheduleIdle;
      map._cleanupCanvas = () => {
        clearTimeout(initIdleTimeout);
        canvas.removeEventListener('mousedown', stopIdle);
        canvas.removeEventListener('touchstart', stopIdle);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('mouseup', scheduleIdle);
        canvas.removeEventListener('touchend', scheduleIdle);
      };

      map.on('load', () => {
        setMapReady(true);

        // Click fallback for low-zoom (when DOM markers are small/clustered)
        map.on('click', (e) => {
          const { lng: cLng, lat: cLat } = e.lngLat;
          const zoom = map.getZoom();
          // Only do proximity fallback when zoomed way out — otherwise let
          // DOM markers handle direct clicks.
          if (zoom > 4.5) return;
          const maxDist = 5;
          let nearest = null, minDist = Infinity;
          spotsRef.current.forEach(spot => {
            const d = Math.sqrt(Math.pow(spot.lng-cLng,2)+Math.pow(spot.lat-cLat,2));
            if (d < minDist && d < maxDist) { minDist = d; nearest = spot; }
          });
          if (nearest) {
            playBlip();
            try { navigator.vibrate && navigator.vibrate(12); } catch {}
            try { map._idleStop && map._idleStop(); } catch {}
            setSel(nearest);
            map.flyTo({
              center: [nearest.lng, nearest.lat-1.2], zoom:6, pitch:0, bearing:0,
              duration:1600,
              easing: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
            });
          }
        });
      });
    };

    if (window.maplibregl) { initMap(); }
    else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }
    return () => {
      if (mapRef.current) {
        try { mapRef.current._idleStop && mapRef.current._idleStop(); } catch {}
        try { mapRef.current._cleanupCanvas && mapRef.current._cleanupCanvas(); } catch {}
        mapRef.current.remove();
        mapRef.current = null;
      }
      setMapReady(false);
    };
  }, []);

  // Editorial markers — simple dots sized by story count
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const ML = window.maplibregl;
    if (!ML) return;
    const map = mapRef.current;
    const markers = [];

    spots.forEach((spot) => {
      const n = spot.stories.length;
      // Size scale: 1 story = 7px, many stories = up to 18px
      const size = Math.max(7, Math.min(18, 6 + n * 1.4));
      // Editorial accent — single desaturated orange across all spots
      const accent = '#FF9500';
      const accentGlow = 'rgba(255,149,0,.38)';

      // Tight finger-sized hit target. The wrapper is pointer-events:
      // none so pans/pinches pass through empty space, and only the
      // hit circle absorbs taps. We keep it small so even at zoom 3
      // with 30+ spots visible, most of the map stays pannable.
      const hitSize = 20;

      const el = document.createElement('div');
      el.className = 'nm-marker';
      // Wrapper is a bit wider than the hit circle just so the label
      // has breathing room — but the wrapper itself is non-hittable.
      const wrap = 40;
      el.style.cssText = `
        width:${wrap}px;height:${wrap}px;
        pointer-events:none;
        -webkit-user-select:none; user-select:none;
        -webkit-touch-callout:none;
        -webkit-tap-highlight-color:transparent;
      `;

      el.innerHTML = `
        <div class="nm-marker-hit" style="
          position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
          width:${hitSize}px; height:${hitSize}px; border-radius:50%;
          pointer-events:auto; cursor:pointer;
          display:flex; align-items:center; justify-content:center;
          -webkit-tap-highlight-color:transparent;
        ">
          <div class="nm-marker-dot" style="
            width:${size}px; height:${size}px; border-radius:50%;
            background:${accent};
            box-shadow:
              0 0 0 1px rgba(0,0,0,.55),
              0 0 ${Math.round(size * 1.4)}px ${accentGlow},
              0 1px 4px rgba(0,0,0,.6);
          "></div>
        </div>
        <div class="nm-marker-label" style="
          position:absolute; left:50%; top:calc(50% + ${Math.round(size/2) + 6}px);
          transform:translateX(-50%);
          font-size:10px; font-weight:700; color:rgba(255,255,255,.88);
          font-family:var(--ft); direction:rtl;
          background:rgba(10,12,16,.86); padding:2px 7px; border-radius:4px;
          white-space:nowrap; pointer-events:none; letter-spacing:.02em;
          border:.5px solid rgba(255,255,255,.09);
        ">${spot.city}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        playBlip();
        // Haptic feedback on supported devices
        try { navigator.vibrate && navigator.vibrate(12); } catch {}
        // Stop idle drift
        try { map._idleStop && map._idleStop(); } catch {}
        setSel(spot);
        map.flyTo({
          center: [spot.lng, spot.lat - 1.2], zoom: 6, pitch: 0, bearing: 0,
          duration: 1600,
          easing: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
        });
      });

      const marker = new ML.Marker({ element: el, anchor: 'center' })
        .setLngLat([spot.lng, spot.lat])
        .addTo(map);
      markers.push(marker);
    });

    return () => { markers.forEach(m => m.remove()); };
  }, [mapReady, spots]);

  const handleClose = () => {
    setSel(null);
    if (mapRef.current) {
      try { mapRef.current._idleStop && mapRef.current._idleStop(); } catch {}
      mapRef.current.flyTo({
        center:[38,28], zoom:3.2, pitch:0, bearing:0,
        duration:1400,
        easing: t => 1 + 2.7 * Math.pow(t - 1, 3) + 1.7 * Math.pow(t - 1, 2),
      });
    }
    onClose();
  };

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:50,
      display:'flex', flexDirection:'column', background:'#12151a', height:'100dvh',
      opacity: entered ? 1 : 0, transition:'opacity .5s ease',
    }}>

      {/* ─── SLATE FRAME VIGNETTE ─── */}
      <div style={{ position:'absolute', inset:0, zIndex:10, pointerEvents:'none',
        background:'radial-gradient(ellipse 90% 75% at 50% 50%, transparent 0%, rgba(18,21,26,.45) 70%, rgba(8,10,14,.85) 100%)',
      }}/>


      {/* ─── DIGITAL CLOCKS (glass pill) ─── */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, zIndex:100,
        padding:'max(18px, env(safe-area-inset-top, 18px)) 16px 0',
        display:'flex', justifyContent:'center',
        pointerEvents:'none',
      }}>
        <div style={{
          display:'flex', gap:6,
          background:'rgba(10,12,16,.72)',
          backdropFilter:'blur(14px) saturate(1.4)',
          WebkitBackdropFilter:'blur(14px) saturate(1.4)',
          border:'1px solid rgba(255,255,255,.10)',
          borderRadius:16, padding:'10px 16px',
          boxShadow:'0 4px 24px rgba(0,0,0,.45)',
        }}>
          {activeClock.map((c, i) => (
            <div key={c.tz} style={{ display:'flex', alignItems:'center', gap:6 }}>
              {i > 0 && (
                <div style={{ width:1, height:24, background:'rgba(255,255,255,.10)', flexShrink:0 }}/>
              )}
              <DigitalClock tz={c.tz} city={c.city} time={time}/>
            </div>
          ))}
        </div>
      </div>

      {/* ─── FLOATING CLOSE BUTTON ─── */}
      <button onClick={handleClose} style={{
        position:'absolute',
        top:'max(22px, env(safe-area-inset-top, 22px))',
        left:16, zIndex:110,
        background:'rgba(10,12,16,.78)',
        border:'1px solid rgba(255,255,255,.10)',
        cursor:'pointer', color:'rgba(255,255,255,.72)',
        padding:10, borderRadius:'50%', display:'flex',
        backdropFilter:'blur(10px) saturate(1.4)',
        WebkitBackdropFilter:'blur(10px) saturate(1.4)',
        transition:'all .2s',
      }}>{I.close()}</button>


      {/* ─── MAP ─── */}
      <div ref={mapContainerRef} style={{ flex:1, width:'100%' }}/>

      {/* ─── BOTTOM GRADIENT ─── */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, height:140, zIndex:13, pointerEvents:'none',
        background:'linear-gradient(to top, rgba(8,10,14,0.85) 0%, rgba(12,15,20,0.4) 55%, transparent 100%)',
      }}/>
      {/* ─── TOP GRADIENT (deepens the carved-layer feel) ─── */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:120, zIndex:13, pointerEvents:'none',
        background:'linear-gradient(to bottom, rgba(8,10,14,0.7) 0%, transparent 100%)',
      }}/>

      {/* ─── LOADING ─── */}
      {!mapReady && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#12151a', zIndex:99 }}>
          <div style={{ textAlign:'center', color:'rgba(255,255,255,.35)', fontSize:13 }}>
            <div style={{ width:36, height:36, border:'2px solid rgba(255,255,255,.08)', borderTopColor:'#E53935', borderRadius:'50%', margin:'0 auto 14px', animation:'spin .8s linear infinite' }}/>
            جاري تحميل الخريطة…
          </div>
        </div>
      )}

      {/* ─── STORY DRAWER ─── */}
      {sel && (
        <div onClick={()=>setSel(null)} style={{ position:'absolute', inset:0, zIndex:200 }}>
          {/* Scrim */}
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.3)', animation:'nm-fade .2s ease' }}/>

          <div onClick={e=>e.stopPropagation()} style={{
            position:'absolute', bottom:0, left:0, right:0,
            background:'rgba(10,12,16,0.94)', backdropFilter:'blur(30px) saturate(1.8)',
            WebkitBackdropFilter:'blur(30px) saturate(1.8)',
            borderRadius:'24px 24px 0 0',
            maxHeight:'58%', display:'flex', flexDirection:'column',
            boxShadow:'0 -4px 60px rgba(0,0,0,.6)',
            animation:'nm-slide .35s cubic-bezier(.32,.72,.24,1) forwards',
            direction:'rtl', fontFamily:'var(--ft)',
            borderTop:'1px solid rgba(255,255,255,0.08)',
          }}>
            {/* Handle */}
            <div style={{ width:36, height:4, background:'rgba(255,255,255,0.12)', borderRadius:2, margin:'10px auto 0', flexShrink:0 }}/>

            {/* Header */}
            <div style={{ padding:'14px 20px 12px', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:20, fontWeight:900, color:'#fff' }}>{sel.city}</span>
                  <span style={{ fontSize:13, color:'rgba(255,255,255,0.3)' }}>{sel.country}</span>
                </div>
                {/* Story count badge */}
                <div style={{
                  background:'linear-gradient(135deg, #E53935 0%, #FF6F00 100%)',
                  borderRadius:10, padding:'3px 10px', minWidth:28, textAlign:'center',
                }}>
                  <span style={{ fontSize:12, fontWeight:800, color:'#fff' }}>{sel.stories.length}</span>
                </div>
              </div>
              {/* Accent line */}
              <div style={{
                height:1, marginTop:12,
                background:'linear-gradient(90deg, rgba(229,57,53,0.4) 0%, rgba(255,140,0,0.2) 50%, transparent 100%)',
              }}/>
            </div>

            {/* Stories list */}
            <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
              {sel.stories.map((s,i) => (
                <div key={i} onClick={()=>s.link&&s.link!=='#'&&window.open(s.link,'_blank')}
                  style={{
                    padding:'14px 20px', cursor:s.link?'pointer':'default',
                    borderBottom:i<sel.stories.length-1?'1px solid rgba(255,255,255,0.04)':'none',
                    transition:'background .15s',
                  }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                  onMouseLeave={e=>e.currentTarget.style.background='transparent'}
                >
                  {s.tag && (
                    <div style={{
                      display:'inline-block', fontSize:10, fontWeight:700, marginBottom:6,
                      color: s.brk||s.tag==='عاجل' ? '#E53935' : 'rgba(255,255,255,0.4)',
                      background: s.brk||s.tag==='عاجل' ? 'rgba(229,57,53,0.1)' : 'rgba(255,255,255,0.04)',
                      border:`1px solid ${s.brk||s.tag==='عاجل'?'rgba(229,57,53,.2)':'rgba(255,255,255,0.06)'}`,
                      padding:'2px 8px', borderRadius:4,
                    }}>{s.tag}</div>
                  )}
                  <div style={{ fontSize:15, fontWeight:700, lineHeight:1.75, color:'rgba(255,255,255,0.9)', marginBottom:4 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)' }}>{s.src} · {s.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
