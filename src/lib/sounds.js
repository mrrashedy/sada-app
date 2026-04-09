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

// Sonar ping — heavy military-grade ping with reverb tail
function sonarPing(freq = 1400, vol = 0.1, dur = 1.2) {
  try {
    const c = getCtx(), t = c.currentTime;
    // Main ping — sharp attack, long resonant decay
    const o = c.createOscillator(), g = c.createGain();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 12;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.92, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.002);
    g.gain.exponentialRampToValueAtTime(vol * 0.3, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
    // Echo — delayed quieter repeat
    const o2 = c.createOscillator(), g2 = c.createGain();
    const bp2 = c.createBiquadFilter();
    bp2.type = 'bandpass'; bp2.frequency.value = freq * 0.95; bp2.Q.value = 8;
    o2.type = 'sine';
    o2.frequency.setValueAtTime(freq * 0.95, t + 0.15);
    o2.frequency.exponentialRampToValueAtTime(freq * 0.88, t + 0.15 + dur * 0.6);
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.152);
    g2.gain.exponentialRampToValueAtTime(0.001, t + 0.15 + dur * 0.6);
    o2.connect(bp2); bp2.connect(g2); g2.connect(c.destination);
    o2.start(t + 0.15); o2.stop(t + 0.15 + dur * 0.6 + 0.01);
  } catch {}
}

// Deep rumble — sub-bass foundation, felt in chest
function rumble(vol = 0.12, dur = 0.8) {
  try {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 120; lp.Q.value = 2;
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(35, t);
    o.frequency.exponentialRampToValueAtTime(25, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.05);
    g.gain.setValueAtTime(vol * 0.7, t + dur * 0.3);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
  } catch {}
}

// Sweep tone — deep military scan pass
function sweepTone(from = 80, to = 600, dur = 0.7, vol = 0.06) {
  try {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 800; lp.Q.value = 3;
    o.type = 'sine';
    o.frequency.setValueAtTime(from, t);
    o.frequency.exponentialRampToValueAtTime(to, t + dur * 0.6);
    o.frequency.exponentialRampToValueAtTime(to * 0.7, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.08);
    g.gain.setValueAtTime(vol * 0.5, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(lp); lp.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
  } catch {}
}

// Contact ping — sharp detection hit with metallic resonance
function contactPing(freq = 1800, vol = 0.07, dur = 0.5) {
  try {
    const c = getCtx(), t = c.currentTime;
    // Primary — tight bandpass for metallic quality
    const o = c.createOscillator(), g = c.createGain();
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = freq; bp.Q.value = 18;
    o.type = 'sine';
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(freq * 0.88, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.001);
    g.gain.exponentialRampToValueAtTime(vol * 0.15, t + 0.04);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(bp); bp.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
    // Sub-harmonic — adds weight
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine';
    o2.frequency.value = freq * 0.5;
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vol * 0.3, t + 0.002);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.4);
    o2.connect(g2); g2.connect(c.destination);
    o2.start(t); o2.stop(t + dur * 0.4 + 0.01);
  } catch {}
}

// Static burst — filtered noise, like radio static
function staticBurst(vol = 0.04, dur = 0.12) {
  try {
    const c = getCtx(), t = c.currentTime;
    const buf = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (c.sampleRate * dur * 0.3));
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 2000; bp.Q.value = 1;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(g); g.connect(c.destination);
    src.start(t);
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

  // Radar open — military system boot: rumble → static → sweep → sonar ping with echo
  radarOpen: () => {
    rumble(0.15, 1.2);
    staticBurst(0.06, 0.2);
    setTimeout(() => sweepTone(50, 500, 0.8, 0.07), 300);
    setTimeout(() => staticBurst(0.03, 0.08), 600);
    setTimeout(() => sonarPing(1400, 0.12, 1.5), 800);
    setTimeout(() => thud(40, 0.2, 0.25), 800);
    setTimeout(() => contactPing(2200, 0.04, 0.3), 1400);
    setTimeout(() => contactPing(1800, 0.03, 0.25), 1600);
    setTimeout(() => contactPing(2000, 0.03, 0.2), 1800);
  },

  // Radar blip — contact detection: sharp metallic ping + sub weight
  radarBlip: () => {
    const freq = 1400 + Math.random() * 800;
    contactPing(freq, 0.06, 0.45);
    thud(50, 0.08, 0.1);
  },

  // Radar scan — deep sweep pass with static crackle
  radarScan: () => {
    sweepTone(60, 400, 0.6, 0.05);
    setTimeout(() => staticBurst(0.025, 0.08), 300);
  },
};
