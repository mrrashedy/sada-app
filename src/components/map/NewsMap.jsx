import { useState, useEffect, useRef, useMemo } from 'react';
import { I } from '../shared/Icons';
import { detectGeoFromText } from '../../data/geo';

// ═══════════════════════════════════════════
// CITY_TIMES — world clocks shown in map header
// ═══════════════════════════════════════════

const CITY_TIMES = [
  { city:'الرياض', tz:'Asia/Riyadh' },
  { city:'لندن',   tz:'Europe/London' },
  { city:'نيويورك',tz:'America/New_York' },
  { city:'طوكيو',  tz:'Asia/Tokyo' },
];

// ═══════════════════════════════════════════
// buildMapSpots — group feed items by geo location
// ═══════════════════════════════════════════

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

// ═══════════════════════════════════════════
// playBlip — short audio cue on spot selection
// ═══════════════════════════════════════════

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

// ═══════════════════════════════════════════
// NEWS MAP — MapLibre GL JS
// WebGL, flyTo camera, pulsing markers, free
// ═══════════════════════════════════════════

export function NewsMap({ onClose, liveFeed=[] }) {
  const mapContainerRef = useRef(null);
  const mapRef          = useRef(null);
  const [sel, setSel]   = useState(null);
  const [time, setTime] = useState(new Date());
  const [mapReady, setMapReady] = useState(false);
  const spots = useMemo(() => buildMapSpots(liveFeed), [liveFeed.length]);
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

  const fmt = (tz) => {
    try { return new Intl.DateTimeFormat('ar',{timeZone:tz,hour:'2-digit',minute:'2-digit',hour12:false}).format(time); }
    catch { return '--:--'; }
  };

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
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
        pitch: 30,
        bearing: 0,
        attributionControl: false,
        maxPitch: 65,
      });

      mapRef.current = map;

      map.on('load', () => {
        setMapReady(true);

        // Heatmap GeoJSON source
        map.addSource('news-heat', { type: 'geojson', data: geojsonData });

        // Snap Map-style heatmap layer
        map.addLayer({
          id: 'news-heatmap',
          type: 'heatmap',
          source: 'news-heat',
          paint: {
            'heatmap-weight': ['get', 'weight'],
            'heatmap-intensity': ['interpolate',['linear'],['zoom'], 0,0.6, 5,1.2, 9,2.0],
            'heatmap-color': [
              'interpolate',['linear'],['heatmap-density'],
              0,   'rgba(0,0,0,0)',
              0.1, 'rgba(30,60,180,0.4)',
              0.25,'rgba(0,180,220,0.55)',
              0.4, 'rgba(0,220,120,0.6)',
              0.55,'rgba(180,220,0,0.7)',
              0.7, 'rgba(255,180,0,0.8)',
              0.85,'rgba(255,100,0,0.85)',
              1.0, 'rgba(230,40,30,0.9)',
            ],
            'heatmap-radius': ['interpolate',['linear'],['zoom'], 0,30, 3,45, 5,65, 8,90, 12,120],
            'heatmap-opacity': 0.85,
          },
        });

        // Invisible circles for pointer cursor feedback
        map.addLayer({
          id: 'news-heat-circles',
          type: 'circle',
          source: 'news-heat',
          paint: {
            'circle-radius': ['interpolate',['linear'],['zoom'], 0,4, 5,8, 10,14],
            'circle-color': 'rgba(255,255,255,0)',
            'circle-stroke-width': 0,
          },
        });
        map.on('mouseenter','news-heat-circles', () => { map.getCanvas().style.cursor='pointer'; });
        map.on('mouseleave','news-heat-circles', () => { map.getCanvas().style.cursor=''; });

        // Click → find nearest spot → open drawer
        map.on('click', (e) => {
          const { lng: cLng, lat: cLat } = e.lngLat;
          const zoom = map.getZoom();
          const maxDist = zoom < 4 ? 5 : zoom < 6 ? 3 : zoom < 8 ? 1.5 : 0.5;
          let nearest = null, minDist = Infinity;
          spotsRef.current.forEach(spot => {
            const d = Math.sqrt(Math.pow(spot.lng-cLng,2)+Math.pow(spot.lat-cLat,2));
            if (d < minDist && d < maxDist) { minDist = d; nearest = spot; }
          });
          if (nearest) {
            playBlip();
            setSel(nearest);
            map.flyTo({
              center: [nearest.lng, nearest.lat-1.5], zoom:5.8, pitch:50,
              bearing: (Math.random()-0.5)*20, duration:1600,
              easing: t => t<0.5 ? 4*t*t*t : (t-1)*(2*t-2)*(2*t-2)+1,
            });
          }
        });
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
      if (mapRef.current) { mapRef.current.remove(); mapRef.current = null; }
      setMapReady(false);
    };
  }, []);

  // Update heatmap data when feed changes
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const source = mapRef.current.getSource('news-heat');
    if (source) source.setData(geojsonData);
  }, [mapReady, geojsonData]);

  // Pulsing animation — subtle breathing like Snap Map
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    const map = mapRef.current;
    let frame, last = 0;
    const animate = (now) => {
      if (now - last > 33) {
        last = now;
        const t = 0.5 + 0.5 * Math.sin((now / 2500) * Math.PI * 2);
        try {
          map.setPaintProperty('news-heatmap','heatmap-opacity', 0.7 + 0.15 * t);
          map.setPaintProperty('news-heatmap','heatmap-intensity',
            ['interpolate',['linear'],['zoom'], 0, 0.6*(0.85+0.15*t), 5, 1.2*(0.85+0.15*t), 9, 2.0*(0.85+0.15*t)]);
        } catch(e) {}
      }
      frame = requestAnimationFrame(animate);
    };
    frame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frame);
  }, [mapReady]);

  const handleClose = () => {
    setSel(null);
    if (mapRef.current) {
      mapRef.current.flyTo({ center:[38,28], zoom:3.2, pitch:30, bearing:0, duration:1000 });
    }
    onClose();
  };

  const totalStories = spots.reduce((a,s)=>a+s.stories.length,0);

  return (
    <div style={{ position:'fixed', top:0, left:0, right:0, bottom:0, zIndex:50, display:'flex', flexDirection:'column', background:'#04080f', height:'100dvh' }}>

      {/* Gradient overlay header */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, zIndex:100,
        padding:'max(44px, env(safe-area-inset-top, 44px)) 16px 16px',
        background:'linear-gradient(to bottom, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 60%, transparent 100%)',
        pointerEvents:'none',
      }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', pointerEvents:'auto' }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'#fff', direction:'rtl' }}>خريطة الأخبار</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,.45)', direction:'rtl', marginTop:2 }}>
              {spots.length} منطقة · {totalStories} خبر مباشر
            </div>
          </div>
          <button onClick={handleClose} style={{
            background:'rgba(0,0,0,0.55)', backdropFilter:'blur(12px)',
            border:'1px solid rgba(255,255,255,.18)', cursor:'pointer',
            color:'#fff', padding:10, borderRadius:'50%', display:'flex',
            pointerEvents:'auto',
          }}>{I.close()}</button>
        </div>

        {/* World clocks */}
        <div style={{ display:'flex', gap:6, marginTop:12, justifyContent:'center', pointerEvents:'auto' }}>
          {CITY_TIMES.map((c,i) => (
            <div key={i} style={{
              background:'rgba(0,0,0,0.55)', backdropFilter:'blur(12px)',
              borderRadius:10, padding:'5px 8px', border:'1px solid rgba(255,255,255,.12)',
              textAlign:'center',
            }}>
              <div style={{ fontSize:13, fontWeight:700, color:'rgba(255,255,255,.95)', fontVariantNumeric:'tabular-nums' }}>{fmt(c.tz)}</div>
              <div style={{ fontSize:9, color:'rgba(255,255,255,.35)', marginTop:1 }}>{c.city}</div>
            </div>
          ))}
        </div>
      </div>

      {/* MapLibre GL container */}
      <div ref={mapContainerRef} style={{ flex:1, width:'100%' }}/>

      {/* Loading spinner */}
      {!mapReady && (
        <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center', background:'#04080f', zIndex:99 }}>
          <div style={{ textAlign:'center', color:'rgba(255,255,255,.4)', fontSize:13 }}>
            <div style={{ width:32, height:32, border:'2px solid rgba(255,255,255,.12)', borderTopColor:'#E53935', borderRadius:'50%', margin:'0 auto 12px', animation:'spin .8s linear infinite' }}/>
            جاري تحميل الخريطة…
          </div>
        </div>
      )}

      {/* Story drawer */}
      {sel && (
        <div onClick={()=>setSel(null)} style={{ position:'absolute', inset:0, zIndex:200 }}>
          <div onClick={e=>e.stopPropagation()} style={{
            position:'absolute', bottom:0, left:0, right:0,
            background:'#fff', borderRadius:'20px 20px 0 0',
            maxHeight:'55%', display:'flex', flexDirection:'column',
            boxShadow:'0 -8px 40px rgba(0,0,0,.5)',
            animation:'cu .3s cubic-bezier(.32,.72,.24,1)',
            direction:'rtl', fontFamily:'var(--ft)',
          }}>
            <div style={{ width:36, height:4, background:'#E0E0E0', borderRadius:2, margin:'10px auto 0', flexShrink:0 }}/>
            <div style={{ padding:'12px 20px 10px', borderBottom:'.5px solid #F0F0F0', flexShrink:0 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:3 }}>
                <span style={{ fontSize:18, fontWeight:800, color:'#0A0A0A' }}>{sel.city}</span>
                <span style={{ fontSize:13, color:'#C0C0C0' }}>· {sel.country}</span>
              </div>
              <div style={{ fontSize:11, color:'#C0C0C0' }}>{sel.stories.length} {sel.stories.length>1?'أخبار':'خبر'} الآن</div>
            </div>
            <div style={{ flex:1, overflowY:'auto', WebkitOverflowScrolling:'touch' }}>
              {sel.stories.map((s,i) => (
                <div key={i} onClick={()=>s.link&&s.link!=='#'&&window.open(s.link,'_blank')}
                  style={{ padding:'14px 20px', borderBottom:i<sel.stories.length-1?'.5px solid #F0F0F0':'none', cursor:s.link?'pointer':'default' }}>
                  {s.tag && <div style={{ display:'inline-block', fontSize:10, fontWeight:600, color:s.brk||s.tag==='عاجل'?'#B71C1C':'#999', border:`1px solid ${s.brk||s.tag==='عاجل'?'rgba(183,28,28,.15)':'#F0F0F0'}`, padding:'1px 8px', borderRadius:3, marginBottom:6 }}>{s.tag}</div>}
                  <div style={{ fontSize:15, fontWeight:700, lineHeight:1.7, color:'#0A0A0A', marginBottom:4 }}>{s.title}</div>
                  <div style={{ fontSize:11, color:'#C0C0C0' }}>{s.src} · {s.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
