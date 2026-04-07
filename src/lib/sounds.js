// Broadcast-grade sound design — Reuters/Bloomberg wire room aesthetic
// Deep, authoritative, minimal. No gimmicks.
let ctx;
function getCtx() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Sub-bass thud — felt more than heard, like a newsroom monitor snap
function thud(freq = 55, vol = 0.25, dur = 0.15) {
  try {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.6, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
  } catch {}
}

// Clean tone — pure sine, tight envelope, broadcast alert quality
function tone(freq, dur = 0.12, vol = 0.08) {
  try {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.setValueAtTime(vol, t + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
  } catch {}
}

// Knock — short filtered noise burst, like a keyboard hit on a marble desk
function knock(vol = 0.1) {
  try {
    const c = getCtx(), t = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * 0.015, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * 0.002));
    const src = c.createBufferSource();
    src.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 800;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 4000;
    const g = c.createGain();
    g.gain.value = vol;
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t);
  } catch {}
}

// Low resonant pulse — filtered sub hit with subtle harmonic, news wire ping
function pulse(freq = 80, vol = 0.15, dur = 0.2) {
  try {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 300; lp.Q.value = 4;
    o.type = 'triangle';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.7, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
  } catch {}
}

// Wire alert — two-note descending minor second, wire service urgency
function wireAlert(vol = 0.07) {
  try {
    const c = getCtx(), t = c.currentTime;
    [0, 0.12].forEach((delay, i) => {
      const freq = i === 0 ? 880 : 830;
      const o = c.createOscillator(), g = c.createGain();
      o.type = 'sine';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0, t + delay);
      g.gain.linearRampToValueAtTime(vol, t + delay + 0.003);
      g.gain.exponentialRampToValueAtTime(0.001, t + delay + 0.1);
      o.connect(g); g.connect(c.destination);
      o.start(t + delay); o.stop(t + delay + 0.12);
    });
  } catch {}
}

export const Sound = {
  // Tap — hard knock, like tapping a glass desk
  tap: () => knock(0.1),

  // Open article — deep thud + clean high tone (document opens)
  open: () => {
    thud(60, 0.18, 0.12);
    setTimeout(() => tone(660, 0.1, 0.06), 40);
  },

  // Close — muted low pulse, door shuts
  close: () => {
    thud(45, 0.12, 0.08);
  },

  // Bookmark save — confirmation: pulse + ascending fifth
  save: () => {
    pulse(70, 0.12, 0.15);
    setTimeout(() => tone(440, 0.08, 0.06), 50);
    setTimeout(() => tone(660, 0.12, 0.07), 120);
  },

  // Bookmark unsave — single low knock
  unsave: () => {
    knock(0.07);
    thud(40, 0.08, 0.06);
  },

  // Refresh — low sweep pulse (scanning the wire)
  refresh: () => {
    pulse(60, 0.1, 0.25);
    setTimeout(() => knock(0.06), 200);
  },

  // New articles alert — wire service triple: knock knock + tone
  notify: () => {
    knock(0.12);
    setTimeout(() => knock(0.12), 120);
    setTimeout(() => {
      thud(55, 0.2, 0.18);
      tone(880, 0.15, 0.08);
    }, 240);
  },

  // Share — clean ascending pair
  share: () => {
    tone(550, 0.08, 0.05);
    setTimeout(() => tone(733, 0.1, 0.06), 80);
  },

  // Like — deep double pulse
  like: () => {
    pulse(70, 0.12, 0.14);
    setTimeout(() => pulse(90, 0.1, 0.1), 100);
  },
};
