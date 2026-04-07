// BBC News countdown / broadcast vibe — authoritative, tense, orchestral stabs
let ctx;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Orchestral stab — layered detuned oscillators with fast attack, medium decay
function stab(freq, dur = 0.18, vol = 0.12) {
  try {
    const c = getCtx();
    const t = c.currentTime;
    // Layer 3 slightly detuned oscillators for thickness
    [-3, 0, 3].forEach(detune => {
      const o = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(freq * 3, t);
      lp.frequency.exponentialRampToValueAtTime(freq * 0.8, t + dur);
      o.type = 'sawtooth';
      o.frequency.value = freq;
      o.detune.value = detune;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol / 3, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(lp);
      lp.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur);
    });
  } catch {}
}

// BBC-style timpani hit — sine with pitch drop + noise layer
function timpani(vol = 0.2) {
  try {
    const c = getCtx();
    const t = c.currentTime;
    // Sine body
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(90, t);
    o.frequency.exponentialRampToValueAtTime(50, t + 0.3);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + 0.35);
    // Attack transient
    const buf = c.createBuffer(1, c.sampleRate * 0.02, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.003));
    const src = c.createBufferSource();
    src.buffer = buf;
    const g2 = c.createGain();
    g2.gain.value = vol * 0.5;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 500;
    src.connect(lp);
    lp.connect(g2);
    g2.connect(c.destination);
    src.start(t);
  } catch {}
}

// Ticking pulse — the BBC countdown clock tick
function tick(vol = 0.15) {
  try {
    const c = getCtx();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = 'sine';
    o.frequency.value = 1000;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.025);
    o.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + 0.03);
  } catch {}
}

// Tension string — sustained filtered pad, very short
function tensionPad(freq, dur = 0.25, vol = 0.06) {
  try {
    const c = getCtx();
    const t = c.currentTime;
    [0, 7, 12].forEach((semi, i) => {
      const f = freq * Math.pow(2, semi / 12);
      const o = c.createOscillator();
      const g = c.createGain();
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 1200;
      o.type = i === 0 ? 'sawtooth' : 'triangle';
      o.frequency.value = f;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol / 3, t + 0.02);
      g.gain.setValueAtTime(vol / 3, t + dur * 0.6);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      o.connect(lp);
      lp.connect(g);
      g.connect(c.destination);
      o.start(t);
      o.stop(t + dur + 0.01);
    });
  } catch {}
}

// Rising sweep — broadcast tension builder
function risingSweep(dur = 0.3, vol = 0.05) {
  try {
    const c = getCtx();
    const t = c.currentTime;
    const o = c.createOscillator();
    const g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'bandpass';
    lp.frequency.value = 2000;
    lp.Q.value = 2;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(200, t);
    o.frequency.exponentialRampToValueAtTime(1200, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.7);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp);
    lp.connect(g);
    g.connect(c.destination);
    o.start(t);
    o.stop(t + dur + 0.01);
  } catch {}
}

export const Sound = {
  // Tap — crisp clock tick
  tap: () => tick(0.15),

  // Open article — timpani + orchestral stab (breaking news reveal)
  open: () => {
    timpani(0.15);
    stab(220, 0.2, 0.08);
    setTimeout(() => stab(330, 0.15, 0.06), 80);
  },

  // Close — descending stab, case closed
  close: () => {
    stab(330, 0.12, 0.06);
    setTimeout(() => stab(220, 0.18, 0.05), 60);
  },

  // Bookmark save — tension resolve: stab + fifth
  save: () => {
    timpani(0.12);
    stab(330, 0.15, 0.08);
    setTimeout(() => stab(495, 0.2, 0.07), 70);
  },

  // Bookmark unsave — single muted stab down
  unsave: () => {
    stab(220, 0.12, 0.05);
    tick(0.08);
  },

  // Refresh — rising sweep + timpani hit (scanning the wire)
  refresh: () => {
    risingSweep(0.3, 0.06);
    setTimeout(() => timpani(0.15), 250);
  },

  // New articles — BBC countdown: tick tick STAB
  notify: () => {
    tick(0.18);
    setTimeout(() => tick(0.18), 150);
    setTimeout(() => {
      timpani(0.18);
      stab(330, 0.25, 0.1);
    }, 300);
  },

  // Share — quick rising tension + release
  share: () => {
    risingSweep(0.15, 0.05);
    setTimeout(() => stab(440, 0.12, 0.06), 120);
  },

  // Like — deep timpani double
  like: () => {
    timpani(0.18);
    setTimeout(() => timpani(0.12), 130);
  },
};
