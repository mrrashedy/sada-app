import { useState, useEffect, useRef, useMemo } from 'react';
import { I } from '../shared/Icons';
import { detectGeoFromText } from '../../data/geo';
import { Sound } from '../../lib/sounds';

const CITY_TIMES = [
  { city:'الرياض', tz:'Asia/Riyadh' },
  { city:'لندن',   tz:'Europe/London' },
  { city:'نيويورك',tz:'America/New_York' },
  { city:'طوكيو',  tz:'Asia/Tokyo' },
];

function buildMapSpots(feed) {
  const spots = {};
  feed.forEach(item => {
    const txt = (item.title||'')+' '+(item.body||'');
    const geo = detectGeoFromText(txt);
    if (!geo) return;
    if (!spots[geo.id]) spots[geo.id] = { ...geo, stories: [], heat: 1 };
    spots[geo.id].stories.push({
      title: item.title, src: item.s?.n||item.source?.name||'—',
      t: item.t||item.time||'', tag: item.tag||item.categories?.[0]||null,
      brk: item.brk||false, link: item.link||null,
    });
  });
  Object.values(spots).forEach(s => { const c=s.stories.length; s.heat=c>=5?3:c>=2?2:1; });
  return Object.values(spots).sort((a,b) => b.stories.length-a.stories.length);
}

export function NewsMap({ onClose, liveFeed=[] }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const markersRef      = useRef([]);
  const [sel, setSel]   = useState(null);
  const [time, setTime] = useState(new Date());
  const [mapReady, setMapReady] = useState(false);
  const spots = useMemo(() => buildMapSpots(liveFeed), [liveFeed.length]);
  const spotsRef = useRef(spots);
  useEffect(() => { spotsRef.current = spots; }, [spots]);

  const fmt = (tz) => {
    try { return new Intl.DateTimeFormat('ar',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(time); }
    catch { return '--:--'; }
  };

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Inject radar CSS
  useEffect(() => {
    if (document.getElementById('radar-css')) return;
    const style = document.createElement('style');
    style.id = 'radar-css';
    style.textContent = `
      @keyframes radarSweep { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      @keyframes radarPing { 0% { transform: scale(0.3); opacity: 0.8; } 100% { transform: scale(2.5); opacity: 0; } }
      @keyframes radarPing2 { 0% { transform: scale(0.3); opacity: 0.6; } 100% { transform: scale(3.5); opacity: 0; } }
      @keyframes dotPulse { 0%,100% { box-shadow: 0 0 8px 2px rgba(230,40,30,0.6); } 50% { box-shadow: 0 0 20px 6px rgba(230,40,30,0.9); } }
      @keyframes dotPulseAmber { 0%,100% { box-shadow: 0 0 6px 2px rgba(255,160,0,0.5); } 50% { box-shadow: 0 0 16px 5px rgba(255,160,0,0.8); } }
      @keyframes dotPulseGreen { 0%,100% { box-shadow: 0 0 4px 1px rgba(0,200,100,0.4); } 50% { box-shadow: 0 0 12px 4px rgba(0,200,100,0.7); } }
      .cmd-marker { position:relative; cursor:pointer; }
      .cmd-dot { border-radius:50%; position:relative; z-index:2; }
      .cmd-dot.hot { width:14px; height:14px; background:radial-gradient(circle, #ff4030 30%, #c41010 100%); animation: dotPulse 2s ease infinite; }
      .cmd-dot.warm { width:11px; height:11px; background:radial-gradient(circle, #ffa000 30%, #e07000 100%); animation: dotPulseAmber 2.5s ease infinite; }
      .cmd-dot.cool { width:8px; height:8px; background:radial-gradient(circle, #00d865 30%, #009940 100%); animation: dotPulseGreen 3s ease infinite; }
      .cmd-ring { position:absolute; border-radius:50%; border:1px solid; pointer-events:none; top:50%; left:50%; transform:translate(-50%,-50%); }
      .cmd-ring.r1 { animation: radarPing 3s ease-out infinite; }
      .cmd-ring.r2 { animation: radarPing2 3s ease-out 1s infinite; }
      .cmd-ring.hot .cmd-ring { border-color: rgba(230,40,30,0.3); }
      .cmd-badge { position:absolute; top:-10px; right:-10px; z-index:3; background:#e53935; color:#fff; font-size:9px; font-weight:800; min-width:16px; height:16px; border-radius:8px; display:flex; align-items:center; justify-content:center; padding:0 4px; border:1.5px solid #0a0e14; font-family:system-ui; }
      .cmd-label { position:absolute; top:100%; left:50%; transform:translateX(-50%); white-space:nowrap; font-size:10px; font-weight:600; color:rgba(255,255,255,0.7); margin-top:6px; text-shadow:0 1px 4px rgba(0,0,0,0.8); font-family:var(--ft); direction:rtl; pointer-events:none; }
      .cmd-scanline { position:absolute; top:0; left:0; right:0; bottom:0; pointer-events:none; z-index:90; background:repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,255,100,0.015) 3px, rgba(0,255,100,0.015) 4px); }
      .cmd-vignette { position:absolute; inset:0; pointer-events:none; z-index:89; background:radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.5) 100%); }
      .cmd-grid { position:absolute; inset:0; pointer-events:none; z-index:88; opacity:0.04; background-image: linear-gradient(rgba(0,255,100,1) 1px, transparent 1px), linear-gradient(90deg, rgba(0,255,100,1) 1px, transparent 1px); background-size:60px 60px; }
    `;
    document.head.appendChild(style);
  }, []);

  useEffect(() => {
    if (!document.getElementById('maplibre-css')) {
      const link = document.createElement('link');
      link.id = 'maplibre-css';
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css';
      document.head.appendChild(link);
    }

    const initMap = () => {
      if (!mapContainerRef.current || mapRef.current) return;
      const ML = window.maplibregl;

      const map = new ML.Map({
        container: mapContainerRef.current,
        style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
        center: [38, 28],
        zoom: 3.2,
        pitch: 35,
        bearing: -5,
        attributionControl: false,
        maxPitch: 65,
      });

      mapRef.current = map;

      map.on('load', () => {
        setMapReady(true);

        // Subtle green-tinted atmosphere
        map.setPaintProperty('water', 'fill-color', '#080e18');

        // Add heatmap source
        map.addSource('news-heat', {
          type: 'geojson',
          data: {
            type: 'FeatureCollection',
            features: spotsRef.current.map(spot => ({
              type: 'Feature',
              properties: { weight: spot.stories.length },
              geometry: { type: 'Point', coordinates: [spot.lng, spot.lat] },
            })),
          },
        });

        // Deep red/orange heatmap — military thermal
        map.addLayer({
          id: 'news-heatmap',
          type: 'heatmap',
          source: 'news-heat',
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': ['interpolate',['linear'],['zoom'], 0,0.5, 5,1.0, 9,1.8],
            'heatmap-color': [
              'interpolate',['linear'],['heatmap-density'],
              0,    'rgba(0,0,0,0)',
              0.1,  'rgba(20,0,0,0.3)',
              0.2,  'rgba(80,0,0,0.4)',
              0.35, 'rgba(160,20,0,0.5)',
              0.5,  'rgba(200,50,0,0.6)',
              0.65, 'rgba(230,80,0,0.7)',
              0.8,  'rgba(255,120,0,0.8)',
              0.9,  'rgba(255,60,20,0.85)',
              1.0,  'rgba(255,30,10,0.95)',
            ],
            'heatmap-radius': ['interpolate',['linear'],['zoom'], 0,25, 3,40, 5,60, 8,80, 12,110],
            'heatmap-opacity': 0.8,
          },
        });

        // Create DOM markers with radar rings
        createMarkers(map, spotsRef.current);
      });

      return map;
    };

    if (window.maplibregl) {
      initMap();
    } else {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js';
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      markersRef.current.forEach(m => m.remove());
      markersRef.current = [];
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      setMapReady(false);
    };
  }, []);

  function createMarkers(map, spots) {
    markersRef.current.forEach(m => m.remove());
    markersRef.current = [];

    spots.forEach(spot => {
      const count = spot.stories.length;
      const tier = count >= 5 ? 'hot' : count >= 2 ? 'warm' : 'cool';
      const ringColor = tier === 'hot' ? 'rgba(230,40,30,0.25)' : tier === 'warm' ? 'rgba(255,160,0,0.2)' : 'rgba(0,200,100,0.15)';
      const ringSize = tier === 'hot' ? 50 : tier === 'warm' ? 36 : 24;

      const el = document.createElement('div');
      el.className = 'cmd-marker';
      el.innerHTML = `
        <div class="cmd-dot ${tier}"></div>
        <div class="cmd-ring r1" style="width:${ringSize}px;height:${ringSize}px;border-color:${ringColor}"></div>
        <div class="cmd-ring r2" style="width:${ringSize*1.4}px;height:${ringSize*1.4}px;border-color:${ringColor.replace(/[\d.]+\)$/,'0.12)').replace('0.25','0.12').replace('0.2','0.1').replace('0.15','0.08')}"></div>
        ${count > 1 ? `<div class="cmd-badge">${count}</div>` : ''}
        <div class="cmd-label">${spot.city}</div>
      `;

      el.addEventListener('click', (e) => {
        e.stopPropagation();
        Sound.open();
        setSel(spot);
        map.flyTo({
          center: [spot.lng, spot.lat - 1.2],
          zoom: 5.5,
          pitch: 50,
          bearing: (Math.random() - 0.5) * 15,
          duration: 1400,
          easing: t => t < 0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
        });
      });

      const marker = new window.maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat([spot.lng, spot.lat])
        .addTo(map);

      markersRef.current.push(marker);
    });
  }

  // Update markers when feed changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    createMarkers(mapRef.current, spots);

    const source = mapRef.current.getSource('news-heat');
    if (source) {
      source.setData({
        type: 'FeatureCollection',
        features: spots.map(spot => ({
          type: 'Feature',
          properties: { weight: spot.stories.length },
          geometry: { type: 'Point', coordinates: [spot.lng, spot.lat] },
        })),
      });
    }
  }, [mapReady, spots]);

  // Heatmap breathing animation
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let frame, last = 0;
    const animate = (now) => {
      if (now - last > 33) {
        last = now;
        const t = 0.5 + 0.5 * Math.sin((now / 3000) * Math.PI * 2);
        try {
          map.setPaintProperty('news-heatmap', 'heatmap-opacity', 0.65 + 0.2 * t);
        } catch {}
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [mapReady]);

  const handleClose = () => {
    Sound.close();
    setSel(null);
    if (mapRef.current) {
      mapRef.current.flyTo({ center:[38,28], zoom:3.2, pitch:35, bearing:-5, duration:1000 });
    }
    onClose();
  };

  const totalStories = spots.reduce((a,s) => a+s.stories.length, 0);
  const breakingCount = spots.reduce((a,s) => a+s.stories.filter(x=>x.brk).length, 0);

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:50, display:'flex', flexDirection:'column', background:'#04080f', height:'100dvh' }}>

      {/* Scanline + vignette + grid overlays */}
      <div className="cmd-scanline"/>
      <div className="cmd-vignette"/>
      <div className="cmd-grid"/>

      {/* Header */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, zIndex:100,
        padding:'max(44px, env(safe-area-inset-top, 44px)) 16px 16px',
        background:'linear-gradient(to bottom, rgba(4,8,15,0.95) 0%, rgba(4,8,15,0.6) 60%, transparent 100%)',
        pointerEvents:'none',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', pointerEvents:'auto' }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'#e53935', direction:'rtl', letterSpacing:'-0.5px', textShadow:'0 0 20px rgba(229,57,53,0.4)' }}>
              غرفة العمليات
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.4)', direction:'rtl', marginTop:2, fontFamily:'monospace' }}>
              {spots.length} منطقة · {totalStories} خبر مباشر{breakingCount > 0 ? ` · ${breakingCount} عاجل` : ''}
            </div>
          </div>
          <button onClick={handleClose} style={{
            background:'rgba(229,57,53,0.15)', backdropFilter:'blur(12px)',
            border:'1px solid rgba(229,57,53,.25)', cursor:'pointer',
            color:'#e53935', padding:10, borderRadius:'50%', display:'flex',
            pointerEvents:'auto',
          }}>{I.close()}</button>
        </div>

        {/* World clocks */}
        <div style={{ display:'flex', gap:6, marginTop:12, justifyContent:'center', pointerEvents:'auto' }}>
          {CITY_TIMES.map((c,i) => (
            <div key={i} style={{
              background:'rgba(229,57,53,0.08)', backdropFilter:'blur(12px)',
              borderRadius:8, padding:'5px 8px', border:'1px solid rgba(229,57,53,.15)',
              textAlign:'center',
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,.9)', fontVariantNumeric:'tabular-nums', fontFamily:'monospace' }}>{fmt(c.tz)}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.3)', marginTop:1 }}>{c.city}</div>
            </div>
          ))}
        </div>

        {/* Status bar */}
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:10, justifyContent:'center' }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#4caf50', boxShadow:'0 0 8px rgba(76,175,80,0.6)', animation:'dotPulseGreen 2s ease infinite' }}/>
          <span style={{ fontSize:10, color:'rgba(76,175,80,0.7)', fontFamily:'monospace', letterSpacing:'0.5px' }}>LIVE MONITORING</span>
        </div>
      </div>

      {/* Map container */}
      <div ref={mapContainerRef} style={{ flex:1, width:'100%' }}/>

      {/* Loading */}
      {!mapReady && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#04080f', zIndex:99 }}>
          <div style={{ textAlign:'center' }}>
            <div style={{ width:40, height:40, border:'2px solid rgba(229,57,53,.15)', borderTopColor:'#e53935', borderRadius:'50%', margin:'0 auto 12px', animation:'spin .8s linear infinite' }}/>
            <div style={{ color:'rgba(229,57,53,0.6)', fontSize:12, fontFamily:'monospace' }}>INITIALIZING MAP...</div>
          </div>
        </div>
      )}

      {/* Story drawer — dark command style */}
      {sel && (
        <div onClick={()=>{Sound.close();setSel(null);}} style={{ position:'absolute', inset:0, zIndex:200 }}>
          <div onClick={e=>e.stopPropagation()} style={{
            position:'absolute', bottom:0, left:0, right:0,
            background:'#0a0e14', borderRadius:'20px 20px 0 0',
            maxHeight:'55%', display:'flex', flexDirection:'column',
            boxShadow:'0 -4px 40px rgba(229,57,53,0.15), 0 -1px 0 rgba(229,57,53,0.2)',
            animation:'cu .3s cubic-bezier(.32,.72,.24,1)',
            direction:'rtl', fontFamily:'var(--ft)',
            border:'1px solid rgba(229,57,53,0.1)', borderBottom:'none',
          }}>
            <div style={{ width:36, height:3, background:'rgba(229,57,53,0.3)', borderRadius:2, margin:'10px auto 0', flexShrink:0 }}/>
            <div style={{ padding:'12px 20px 10px', borderBottom:'1px solid rgba(229,57,53,0.1)', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <span style={{ fontSize:18, fontWeight:800, color:'#fff' }}>{sel.city}</span>
                <span style={{ fontSize:13, color:'rgba(255,255,255,.3)' }}>· {sel.country}</span>
              </div>
              <div style={{ fontSize:11, color:'rgba(229,57,53,0.6)', fontFamily:'monospace' }}>
                {sel.stories.length} {sel.stories.length>1?'SIGNALS':'SIGNAL'} DETECTED
              </div>
            </div>
            <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
              {sel.stories.map((s,i) => (
                <div key={i} onClick={()=>{Sound.tap();s.link&&s.link!=='#'&&window.open(s.link,'_blank');}}
                  style={{ padding:'14px 20px', borderBottom:i<sel.stories.length-1?'1px solid rgba(255,255,255,0.05)':'none', cursor:s.link?'pointer':'default' }}>
                  {s.tag && <div style={{
                    display:'inline-block', fontSize:10, fontWeight:600,
                    color: s.brk||s.tag==='عاجل' ? '#e53935' : 'rgba(255,255,255,0.4)',
                    border:`1px solid ${s.brk||s.tag==='عاجل' ? 'rgba(229,57,53,.25)' : 'rgba(255,255,255,0.08)'}`,
                    padding:'1px 8px', borderRadius:3, marginBottom:6,
                  }}>{s.tag}</div>}
                  <div style={{ fontSize:15, fontWeight:700, lineHeight:1.7, color:'rgba(255,255,255,0.9)', marginBottom:4 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)', fontFamily:'monospace' }}>{s.src} · {s.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
