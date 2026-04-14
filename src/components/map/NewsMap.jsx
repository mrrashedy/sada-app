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
  const geojsonData = useMemo(() => ({
    type: 'FeatureCollection',
    features: spots.map(spot => ({
      type: 'Feature',
      properties: { weight: spot.stories.length, id: spot.id },
      geometry: { type: 'Point', coordinates: [spot.lng, spot.lat] },
    })),
  }), [spots]);

  const topSpot = spots[0];
  const totalStories = spots.reduce((a,s)=>a+s.stories.length,0);

  const activeClock = REGION_CLOCKS[detectRegion(sel)] || REGION_CLOCKS.default;

  const fmt = (tz) => {
    try { return new Intl.DateTimeFormat('en-u-nu-latn',{timeZone:tz,hour:'numeric',minute:'2-digit',hour12:true}).format(time); }
    catch { return '--:--'; }
  };

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
        style: {
          version: 8,
          sources: {
            'dark': {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256, maxzoom: 16, attribution: '',
            },
            'ref': {
              type: 'raster',
              tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}'],
              tileSize: 256, maxzoom: 16,
            },
            'hillshade-src': {
              type: 'raster-dem',
              tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
              tileSize: 256, maxzoom: 14, encoding: 'terrarium',
            },
          },
          terrain: { source: 'hillshade-src', exaggeration: 3.0 },
          layers: [
            { id: 'dark', type: 'raster', source: 'dark', paint: { 'raster-saturation': 0.4, 'raster-contrast': 0.15, 'raster-brightness-min': 0.25, 'raster-brightness-max': 0.9 } },
            { id: 'hillshade', type: 'hillshade', source: 'hillshade-src', paint: { 'hillshade-exaggeration': 0.5, 'hillshade-shadow-color': 'rgba(0,15,0,0.25)', 'hillshade-highlight-color': 'rgba(0,255,100,0.15)', 'hillshade-illumination-direction': 315 } },
            { id: 'ref', type: 'raster', source: 'ref', paint: { 'raster-opacity': 0.95 } },
          ],
        },
        center: [38, 28], zoom: 3.2, pitch: 50, bearing: -15,
        attributionControl: false, maxPitch: 75,
      });

      mapRef.current = map;

      map.on('load', () => {
        setMapReady(true);
        map.addSource('news-heat', { type: 'geojson', data: geojsonData });

        // Outer glow layer — softer, wider
        map.addLayer({
          id: 'news-glow',
          type: 'heatmap',
          source: 'news-heat',
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': ['interpolate',['linear'],['zoom'], 0,0.3, 5,0.6, 9,1.0],
            'heatmap-color': [
              'interpolate',['linear'],['heatmap-density'],
              0,    'rgba(0,0,0,0)',
              0.15, 'rgba(255,140,0,0.08)',
              0.4,  'rgba(255,80,0,0.15)',
              0.7,  'rgba(255,40,0,0.2)',
              1.0,  'rgba(255,20,0,0.25)',
            ],
            'heatmap-radius': ['interpolate',['linear'],['zoom'], 0,50, 3,80, 5,110, 8,150, 12,200],
            'heatmap-opacity': 0.9,
          },
        });

        // Core heatmap — intense, tight
        map.addLayer({
          id: 'news-heatmap',
          type: 'heatmap',
          source: 'news-heat',
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': ['interpolate',['linear'],['zoom'], 0,0.6, 5,1.2, 9,2.0],
            'heatmap-color': [
              'interpolate',['linear'],['heatmap-density'],
              0,    'rgba(0,0,0,0)',
              0.08, 'rgba(255,200,50,0.2)',
              0.2,  'rgba(255,160,0,0.4)',
              0.35, 'rgba(255,120,0,0.55)',
              0.5,  'rgba(255,80,0,0.65)',
              0.65, 'rgba(255,50,0,0.75)',
              0.8,  'rgba(240,35,0,0.85)',
              1.0,  'rgba(255,60,20,0.95)',
            ],
            'heatmap-radius': ['interpolate',['linear'],['zoom'], 0,25, 3,40, 5,55, 8,75, 12,100],
            'heatmap-opacity': 0.85,
          },
        });

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
            setSel(nearest);
            map.flyTo({
              center: [nearest.lng, nearest.lat-1.5], zoom:5.8, pitch:58,
              bearing: (Math.random()-0.5)*25, duration:1600,
              easing: t => t<0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
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
    return () => { if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; } setMapReady(false); };
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('news-heat');
    if (source) source.setData(geojsonData);
  }, [mapReady, geojsonData]);

  // Breathing pulse
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let frame, last = 0;
    const animate = (now) => {
      if (now - last > 33) {
        last = now;
        const t = 0.5 + 0.5 * Math.sin((now / 2200) * Math.PI * 2);
        try {
          if (map.getLayer('news-heatmap')) {
            map.setPaintProperty('news-heatmap','heatmap-opacity', 0.75 + 0.15 * t);
          }
          if (map.getLayer('news-glow')) {
            map.setPaintProperty('news-glow','heatmap-opacity', 0.7 + 0.25 * t);
          }
        } catch(e) {}
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [mapReady]);

  // Snapchat-style DOM markers — circular avatar per spot, ring color by heat
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const ML = window.maplibregl;
    if (!ML) return;
    const map = mapRef.current;
    const markers = [];

    spots.forEach((spot) => {
      const heat = spot.heat || 1;
      const size = heat >= 3 ? 52 : heat >= 2 ? 44 : 38;
      const ringColor = heat >= 3 ? '#E53935' : heat >= 2 ? '#FF9800' : '#FFC107';
      const glowRgba = heat >= 3 ? 'rgba(229,57,53,.55)' : heat >= 2 ? 'rgba(255,152,0,.5)' : 'rgba(255,193,7,.45)';
      const hasBreaking = spot.stories.some(s => s.brk);
      const top = spot.stories[0] || {};
      const avatar = top.img || top.logo || '';

      const el = document.createElement('div');
      el.className = `nm-marker${heat >= 3 ? ' hot' : ''}`;
      // Don't set position here — maplibre sets `position: absolute` on the
      // marker element to anchor it to geo coordinates. Children use their
      // own absolute positioning, which still resolves against this element.
      el.style.cssText = `width:${size}px;height:${size}px;--mk-glow:${glowRgba};`;

      const avatarInner = avatar
        ? `<img src="${avatar}" alt="" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none';this.parentElement.style.background='#222';this.parentElement.innerHTML='<div style=&quot;color:#fff;font-size:16px;font-weight:900;&quot;>${(top.src||'?')[0]||'?'}</div>'+this.parentElement.innerHTML;"/>`
        : `<div style="color:#fff;font-size:${Math.round(size*0.4)}px;font-weight:900;font-family:var(--ft);">${(top.src||'?')[0]||'?'}</div>`;

      el.innerHTML = `
        <div class="nm-marker-avatar" style="
          width:${size}px;height:${size}px;border-radius:50%;
          background:#0b0d11;border:3px solid ${ringColor};
          box-shadow:0 0 18px ${glowRgba},0 4px 14px rgba(0,0,0,.55),inset 0 0 0 1.5px rgba(255,255,255,.12);
          overflow:hidden;display:flex;align-items:center;justify-content:center;
          position:relative;
        ">
          ${avatarInner}
        </div>
        ${spot.stories.length > 1 ? `
          <div style="
            position:absolute;top:-4px;right:-4px;z-index:2;
            background:${ringColor};color:#fff;
            font-size:10px;font-weight:800;font-family:var(--ft);
            min-width:18px;height:18px;border-radius:9px;
            display:flex;align-items:center;justify-content:center;padding:0 5px;
            border:2px solid #020408;letter-spacing:.02em;
          ">${spot.stories.length}</div>
        ` : ''}
        ${hasBreaking ? `
          <div style="
            position:absolute;bottom:-2px;left:50%;transform:translateX(-50%);z-index:2;
            background:#E53935;color:#fff;
            font-size:8px;font-weight:900;font-family:var(--ft);letter-spacing:.08em;
            padding:2px 6px;border-radius:3px;
            border:1.5px solid #020408;
            box-shadow:0 0 8px rgba(229,57,53,.6);
          ">LIVE</div>
        ` : ''}
        <div class="nm-marker-label" style="
          position:absolute;top:${size + (hasBreaking ? 12 : 6)}px;left:50%;transform:translateX(-50%);
          font-size:10px;font-weight:800;color:#fff;font-family:var(--ft);
          background:rgba(0,0,0,.78);padding:3px 8px;border-radius:6px;
          white-space:nowrap;pointer-events:none;letter-spacing:.02em;
          border:.5px solid rgba(255,255,255,.1);
        ">${spot.city}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        playBlip();
        setSel(spot);
        map.flyTo({
          center: [spot.lng, spot.lat - 1.5], zoom: 5.8, pitch: 58,
          bearing: (Math.random() - 0.5) * 25, duration: 1600,
          easing: t => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * t - 2) * (2 * t - 2) + 1,
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
    if (mapRef.current) mapRef.current.flyTo({ center:[38,28], zoom:3.2, pitch:50, bearing:-15, duration:1000 });
    onClose();
  };

  return (
    <div style={{
      position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:50,
      display:'flex', flexDirection:'column', background:'#020408', height:'100dvh',
      opacity: entered ? 1 : 0, transition:'opacity .5s ease',
    }}>

      {/* ─── CINEMATIC VIGNETTE ─── */}
      <div style={{ position:'absolute', inset:0, zIndex:10, pointerEvents:'none',
        background:'radial-gradient(ellipse 70% 60% at 50% 45%, transparent 0%, rgba(2,4,8,0.3) 60%, rgba(2,4,8,0.85) 100%)',
      }}/>

      {/* ─── TOP HEADER ─── */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, zIndex:100,
        padding:'max(44px, env(safe-area-inset-top, 44px)) 16px 20px',
        background:'linear-gradient(180deg, rgba(2,4,8,0.97) 0%, rgba(2,4,8,0.88) 50%, rgba(2,4,8,0.4) 80%, transparent 100%)',
        pointerEvents:'none',
      }}>
        {/* Title row */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', pointerEvents:'auto' }}>
          <div style={{ direction:'rtl' }}>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ fontSize:20, fontWeight:900, color:'#fff', letterSpacing:'-0.02em' }}>خريطة الأخبار</div>
              {/* LIVE badge */}
              <div style={{
                display:'flex', alignItems:'center', gap:4,
                background:'rgba(229,57,53,0.15)', border:'1px solid rgba(229,57,53,0.3)',
                borderRadius:6, padding:'2px 8px',
              }}>
                <div style={{
                  width:6, height:6, borderRadius:'50%', background:'#E53935',
                  animation:'nm-glow 1.5s ease-in-out infinite',
                }}/>
                <span style={{ fontSize:10, fontWeight:800, color:'#E53935', letterSpacing:'0.05em' }}>LIVE</span>
              </div>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', marginTop:3 }}>
              {spots.length} منطقة · {totalStories} خبر مباشر
            </div>
          </div>
          <button onClick={handleClose} style={{
            background:'rgba(255,255,255,0.06)',
            border:'1px solid rgba(255,255,255,.08)', cursor:'pointer',
            color:'rgba(255,255,255,.6)', padding:10, borderRadius:'50%', display:'flex',
            pointerEvents:'auto', transition:'all .2s',
          }}>{I.close()}</button>
        </div>

        {/* Accent line */}
        <div style={{
          height:1, marginTop:12,
          background:'linear-gradient(90deg, transparent 0%, rgba(229,57,53,0.5) 20%, rgba(255,140,0,0.3) 50%, rgba(229,57,53,0.5) 80%, transparent 100%)',
          animation:'nm-line .8s ease-out forwards', transformOrigin:'center',
        }}/>

        {/* World clocks — change by region */}
        <div style={{ display:'flex', gap:5, marginTop:10, justifyContent:'center', pointerEvents:'auto', transition:'all .3s ease' }}>
          {activeClock.map((c,i) => (
            <div key={c.tz} style={{
              background:'rgba(255,255,255,0.04)',
              borderRadius:8, padding:'6px 10px', border:'1px solid rgba(255,255,255,.06)',
              textAlign:'center', minWidth:68, transition:'all .3s ease',
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,.9)', fontVariantNumeric:'tabular-nums', fontFeatureSettings:'"tnum"', whiteSpace:'nowrap' }}>{fmt(c.tz)}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.3)', marginTop:2, letterSpacing:'0.02em' }}>{c.city}</div>
            </div>
          ))}
        </div>

        {/* Trending spot ticker */}
        {topSpot && (
          <div style={{
            marginTop:10, display:'flex', alignItems:'center', gap:6,
            direction:'rtl', overflow:'hidden',
          }}>
            <div style={{
              fontSize:9, fontWeight:700, color:'#E53935', letterSpacing:'0.04em',
              background:'rgba(229,57,53,0.1)', padding:'2px 6px', borderRadius:4, flexShrink:0,
            }}>
              الأكثر تغطية
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.55)', fontWeight:600, whiteSpace:'nowrap' }}>
              {topSpot.city} — {topSpot.stories.length} خبر
            </div>
          </div>
        )}
      </div>

      {/* ─── MAP ─── */}
      <div ref={mapContainerRef} style={{ flex:1, width:'100%' }}/>

      {/* ─── BOTTOM GRADIENT ─── */}
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, height:120, zIndex:10, pointerEvents:'none',
        background:'linear-gradient(to top, rgba(2,4,8,0.7) 0%, transparent 100%)',
      }}/>

      {/* ─── LOADING ─── */}
      {!mapReady && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#020408', zIndex:99 }}>
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
