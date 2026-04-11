import { useState, useEffect, useRef } from 'react';

function playBroadcastSound() {
  try {
    const c = new (window.AudioContext || window.webkitAudioContext)();
    const t = c.currentTime;

    // Tick sounds for countdown — sharp, percussive
    for (let i = 0; i < 5; i++) {
      const tick = c.createOscillator(), tg = c.createGain();
      tick.type = 'square';
      tick.frequency.setValueAtTime(1200, t + i * 0.7);
      tg.gain.setValueAtTime(0.15, t + i * 0.7);
      tg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.7 + 0.05);
      tick.connect(tg); tg.connect(c.destination);
      tick.start(t + i * 0.7); tick.stop(t + i * 0.7 + 0.06);

      // Sub-bass on each tick
      const sub = c.createOscillator(), sg = c.createGain();
      sub.type = 'sine'; sub.frequency.setValueAtTime(50, t + i * 0.7);
      sg.gain.setValueAtTime(0.2, t + i * 0.7);
      sg.gain.exponentialRampToValueAtTime(0.001, t + i * 0.7 + 0.15);
      sub.connect(sg); sg.connect(c.destination);
      sub.start(t + i * 0.7); sub.stop(t + i * 0.7 + 0.16);
    }

    // Building tension — rising filtered noise
    const bufSize = c.sampleRate * 3;
    const buf = c.createBuffer(1, bufSize, c.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < bufSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = c.createBufferSource(); noise.buffer = buf;
    const filt = c.createBiquadFilter(); filt.type = 'bandpass';
    filt.frequency.setValueAtTime(200, t);
    filt.frequency.exponentialRampToValueAtTime(3000, t + 3.5);
    filt.Q.value = 5;
    const ng = c.createGain();
    ng.gain.setValueAtTime(0.02, t);
    ng.gain.linearRampToValueAtTime(0.06, t + 3.0);
    ng.gain.exponentialRampToValueAtTime(0.001, t + 3.8);
    noise.connect(filt); filt.connect(ng); ng.connect(c.destination);
    noise.start(t); noise.stop(t + 3.8);

    // IMPACT at 3.5s — massive bass drop + chord
    const impact = t + 3.5;
    const bass = c.createOscillator(), bg = c.createGain();
    bass.type = 'sine'; bass.frequency.setValueAtTime(35, impact);
    bass.frequency.exponentialRampToValueAtTime(20, impact + 1.5);
    bg.gain.setValueAtTime(0.5, impact);
    bg.gain.exponentialRampToValueAtTime(0.001, impact + 1.5);
    bass.connect(bg); bg.connect(c.destination);
    bass.start(impact); bass.stop(impact + 1.6);

    // Power chord — stacked fifths
    [220, 330, 440, 660].forEach((f, i) => {
      const o = c.createOscillator(), g = c.createGain();
      o.type = i === 0 ? 'sawtooth' : 'sine';
      o.frequency.setValueAtTime(f, impact);
      g.gain.setValueAtTime(i === 0 ? 0.08 : 0.04, impact);
      g.gain.exponentialRampToValueAtTime(0.001, impact + 2.0);
      o.connect(g); g.connect(c.destination);
      o.start(impact); o.stop(impact + 2.1);
    });

    // Signature pings
    const ping1 = c.createOscillator(), p1g = c.createGain();
    ping1.type = 'sine'; ping1.frequency.setValueAtTime(1760, impact + 0.1);
    p1g.gain.setValueAtTime(0.1, impact + 0.1);
    p1g.gain.exponentialRampToValueAtTime(0.001, impact + 0.8);
    ping1.connect(p1g); p1g.connect(c.destination);
    ping1.start(impact + 0.1); ping1.stop(impact + 0.85);

    const ping2 = c.createOscillator(), p2g = c.createGain();
    ping2.type = 'sine'; ping2.frequency.setValueAtTime(2640, impact + 0.3);
    p2g.gain.setValueAtTime(0.06, impact + 0.3);
    p2g.gain.exponentialRampToValueAtTime(0.001, impact + 1.0);
    ping2.connect(p2g); p2g.connect(c.destination);
    ping2.start(impact + 0.3); ping2.stop(impact + 1.05);
  } catch {}
}

export function AppIntro({ onComplete }) {
  const [count, setCount] = useState(5);
  const [phase, setPhase] = useState('count'); // count → impact → reveal → out
  const played = useRef(false);

  useEffect(() => {
    if (!played.current) { played.current = true; playBroadcastSound(); }

    // Countdown: 5→4→3→2→1 at 700ms intervals
    const timers = [];
    for (let i = 1; i <= 4; i++) {
      timers.push(setTimeout(() => setCount(5 - i), i * 700));
    }
    // Impact at 3.5s
    timers.push(setTimeout(() => setPhase('impact'), 3500));
    // Reveal at 4.2s
    timers.push(setTimeout(() => setPhase('reveal'), 4200));
    // Fade at 5.5s
    timers.push(setTimeout(() => setPhase('out'), 5500));
    // Done at 6.2s
    timers.push(setTimeout(() => onComplete(), 6200));

    return () => timers.forEach(clearTimeout);
  }, []);

  const isCount = phase === 'count';
  const isImpact = phase === 'impact';
  const isReveal = phase === 'reveal' || phase === 'out';
  const isOut = phase === 'out';

  return (
    <div style={{
      position:'fixed', inset:0, zIndex:9999,
      background:'#080808',
      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
      fontFamily:'var(--ft)',
      opacity: isOut ? 0 : 1,
      transition:'opacity 0.7s ease',
      overflow:'hidden',
    }}>

      {/* Animated grid background */}
      <div style={{
        position:'absolute', inset:0, overflow:'hidden',
        opacity: isCount ? 0.15 : 0,
        transition:'opacity 0.3s',
      }}>
        {Array.from({length:8}).map((_,i) => (
          <div key={`h${i}`} style={{
            position:'absolute', left:0, right:0,
            top:`${12.5 * (i+1)}%`, height:1,
            background:'rgba(211,47,47,.3)',
            transform: isCount ? 'scaleX(1)' : 'scaleX(0)',
            transition:`transform 0.8s ease ${i*0.05}s`,
          }}/>
        ))}
        {Array.from({length:6}).map((_,i) => (
          <div key={`v${i}`} style={{
            position:'absolute', top:0, bottom:0,
            left:`${16.66 * (i+1)}%`, width:1,
            background:'rgba(211,47,47,.3)',
            transform: isCount ? 'scaleY(1)' : 'scaleY(0)',
            transition:`transform 0.8s ease ${i*0.05}s`,
          }}/>
        ))}
      </div>

      {/* Rotating ring */}
      <div style={{
        position:'absolute', width:280, height:280,
        borderRadius:'50%',
        border:'1px solid rgba(211,47,47,.15)',
        animation: isCount ? 'spin 8s linear infinite' : 'none',
        opacity: isImpact || isReveal ? 0 : 0.6,
        transition:'opacity 0.3s',
      }}>
        <div style={{ position:'absolute', top:-3, left:'50%', width:6, height:6, borderRadius:'50%', background:'#D32F2F', transform:'translateX(-50%)' }}/>
      </div>

      {/* Second ring — counter-rotate */}
      <div style={{
        position:'absolute', width:220, height:220,
        borderRadius:'50%',
        border:'1px solid rgba(211,47,47,.08)',
        animation: isCount ? 'spin 6s linear infinite reverse' : 'none',
        opacity: isImpact || isReveal ? 0 : 0.4,
        transition:'opacity 0.3s',
      }}/>

      {/* Pulse rings on impact */}
      {(isImpact || isReveal) && <>
        <div style={{
          position:'absolute', width:10, height:10, borderRadius:'50%',
          border:'2px solid rgba(211,47,47,.6)',
          animation:'intro-pulse 1s ease-out forwards',
        }}/>
        <div style={{
          position:'absolute', width:10, height:10, borderRadius:'50%',
          border:'2px solid rgba(211,47,47,.4)',
          animation:'intro-pulse 1s ease-out 0.15s forwards',
        }}/>
        <div style={{
          position:'absolute', width:10, height:10, borderRadius:'50%',
          border:'2px solid rgba(211,47,47,.2)',
          animation:'intro-pulse 1s ease-out 0.3s forwards',
        }}/>
      </>}

      {/* Flash on impact */}
      {isImpact && <div style={{
        position:'absolute', inset:0,
        background:'radial-gradient(circle, rgba(211,47,47,.2) 0%, transparent 60%)',
        animation:'intro-flash 0.5s ease-out forwards',
      }}/>}

      {/* Countdown number */}
      {isCount && (
        <div key={count} style={{
          fontSize:120, fontWeight:900, color:'#D32F2F',
          textShadow:'0 0 80px rgba(211,47,47,.5), 0 0 160px rgba(211,47,47,.2)',
          animation:'intro-num 0.7s cubic-bezier(.34,1.56,.64,1) both',
          position:'relative', zIndex:2,
          fontFamily:'-apple-system, system-ui, sans-serif',
          lineHeight:1,
        }}>
          {count}
        </div>
      )}

      {/* LIVE bar under countdown */}
      {isCount && (
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          marginTop:20, opacity:0.5,
        }}>
          <div style={{ width:6, height:6, borderRadius:'50%', background:'#D32F2F', animation:'intro-blink 1s ease infinite' }}/>
          <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,.4)', letterSpacing:4, fontFamily:'-apple-system, system-ui, sans-serif' }}>LIVE</span>
        </div>
      )}

      {/* Logo reveal after impact */}
      {(isImpact || isReveal) && (
        <div style={{
          display:'flex', flexDirection:'column', alignItems:'center',
          animation:'intro-logo 0.8s cubic-bezier(.22,1,.36,1) both',
          position:'relative', zIndex:2,
        }}>
          {/* Monogram */}
          <div style={{
            width:80, height:80, borderRadius:16,
            background:'#D32F2F',
            display:'flex', alignItems:'center', justifyContent:'center',
            fontSize:42, fontWeight:900, color:'#fff',
            boxShadow:'0 0 80px rgba(211,47,47,.5), 0 0 160px rgba(211,47,47,.2)',
            marginBottom:20,
          }}>
            غ
          </div>

          {/* Name */}
          <div style={{
            fontSize:32, fontWeight:900, color:'#F2F0EB',
            direction:'rtl', letterSpacing:'-0.5px',
            opacity: isReveal ? 1 : 0,
            transform: isReveal ? 'translateY(0)' : 'translateY(12px)',
            transition:'all 0.5s cubic-bezier(.22,1,.36,1)',
          }}>
            غرفة الأخبار
          </div>

          {/* Red line */}
          <div style={{
            width: isReveal ? 60 : 0, height:3, borderRadius:2,
            background:'#D32F2F', margin:'16px 0',
            transition:'width 0.5s cubic-bezier(.22,1,.36,1) 0.2s',
          }}/>

          {/* Tagline */}
          <div style={{
            fontSize:12, fontWeight:600, color:'rgba(255,255,255,.3)',
            letterSpacing:3, direction:'rtl',
            opacity: isReveal ? 1 : 0,
            transition:'opacity 0.5s ease 0.4s',
          }}>
            صحافة · تحليل · رصد
          </div>
        </div>
      )}

      {/* Top/bottom scan lines */}
      <div style={{
        position:'absolute', top:0, left:0, right:0, height:2,
        background:'linear-gradient(90deg, transparent, #D32F2F, transparent)',
        opacity: isCount ? 0.4 : 0,
        animation: isCount ? 'intro-scan 2s ease infinite' : 'none',
      }}/>
      <div style={{
        position:'absolute', bottom:0, left:0, right:0, height:2,
        background:'linear-gradient(90deg, transparent, #D32F2F, transparent)',
        opacity: isCount ? 0.4 : 0,
        animation: isCount ? 'intro-scan 2s ease 1s infinite' : 'none',
      }}/>

      {/* Corner brackets */}
      <div style={{ position:'absolute', top:30, right:25, width:24, height:24, borderTop:'2px solid rgba(211,47,47,.4)', borderRight:'2px solid rgba(211,47,47,.4)', opacity: isCount ? 1 : 0, transition:'opacity 0.3s' }}/>
      <div style={{ position:'absolute', top:30, left:25, width:24, height:24, borderTop:'2px solid rgba(211,47,47,.4)', borderLeft:'2px solid rgba(211,47,47,.4)', opacity: isCount ? 1 : 0, transition:'opacity 0.3s' }}/>
      <div style={{ position:'absolute', bottom:30, right:25, width:24, height:24, borderBottom:'2px solid rgba(211,47,47,.4)', borderRight:'2px solid rgba(211,47,47,.4)', opacity: isCount ? 1 : 0, transition:'opacity 0.3s' }}/>
      <div style={{ position:'absolute', bottom:30, left:25, width:24, height:24, borderBottom:'2px solid rgba(211,47,47,.4)', borderLeft:'2px solid rgba(211,47,47,.4)', opacity: isCount ? 1 : 0, transition:'opacity 0.3s' }}/>

      {/* Inline keyframes */}
      <style>{`
        @keyframes intro-num{0%{opacity:0;transform:scale(2.5) rotate(-5deg)}30%{opacity:1;transform:scale(0.95) rotate(0deg)}100%{opacity:1;transform:scale(1)}}
        @keyframes intro-pulse{0%{transform:scale(1);opacity:1}100%{transform:scale(40);opacity:0}}
        @keyframes intro-flash{0%{opacity:1}100%{opacity:0}}
        @keyframes intro-logo{0%{opacity:0;transform:scale(0.5)}60%{transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
        @keyframes intro-blink{0%,100%{opacity:1}50%{opacity:0.2}}
        @keyframes intro-scan{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
      `}</style>
    </div>
  );
}
