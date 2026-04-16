// Broadcast-grade sound design — Reuters/Bloomberg wire room aesthetic
// for the general UI (tap / open / save / notify), and a warm aviation
// cockpit ASMR palette for the radar view: jet engine spool-up + steady
// turbine bed, cabin airflow, ATC radio beeps, radio squelch, GPS nav
// chime. Deep, serious, minimal. No gimmicks.
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

// ─── Aviation palette — cockpit / ATC / avionics ASMR primitives ───
// Used only by the radar sounds. The aesthetic is: warm, serious, soft
// attacks, long release envelopes, low-passed so nothing is harsh.
// Reference: jet engine spool-up, steady turbine drone, ATC radio beeps,
// Boeing chime, cabin airflow, radio squelch tails, avionics self-test
// tones.

// Cabin airflow / wind over airframe — pink-noise swell with a slow attack
// and slow release. This is the textural "ASMR breath" that carries the
// aviation mood. Very low volume, warm low-pass filtering.
function airflow(vol = 0.05, dur = 1.2) {
  try {
    const c = getCtx(), t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    // Paul Kellet pink-noise IIR approximation — warmer than white noise,
    // closer to real cabin/wind texture.
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    const src = c.createBufferSource(); src.buffer = buf;
    const hp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 80;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.7;
    const g = c.createGain();
    // ADSR: slow attack (25% of dur), sustain (35%), slow release (40%).
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + dur * 0.25);
    g.gain.setValueAtTime(vol, t + dur * 0.6);
    g.gain.linearRampToValueAtTime(0, t + dur);
    src.connect(hp); hp.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t);
  } catch {}
}

// ATC beep — soft warm pure-sine tone, 8ms attack (no click), gentle linear
// release (no hard exponential drop). This is the ASMR-serious "transmission
// received" tone. Frequency range 600–1400 Hz for human-voice proximity.
function atcBeep(freq = 1000, vol = 0.05, dur = 0.22) {
  try {
    const c = getCtx(), t = c.currentTime;
    const o = c.createOscillator(), g = c.createGain();
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = freq * 2.4; lp.Q.value = 0.7;
    o.type = 'sine';
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.008);
    g.gain.setValueAtTime(vol, t + dur * 0.5);
    g.gain.linearRampToValueAtTime(0, t + dur);
    o.connect(lp); lp.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.01);
  } catch {}
}

// Jet engine drone — multi-harmonic turbine body (fundamental + 3rd/2nd/3rd
// octave) layered with band-passed pink noise (combustion roar around
// 400 Hz) and a subtle high whine with slow vibrato. Everything is master
// low-passed at 600 Hz and very quiet so it reads as a *distant* engine —
// like hearing a plane from inside a cabin — instead of a jet landing on
// top of you. Used as the steady-state engine bed for the radar view.
function jetEngine(vol = 0.07, dur = 2.0) {
  try {
    const c = getCtx(), t = c.currentTime;

    // ── Turbine body: four sines below 250 Hz for warm harmonic fill ──
    const body = c.createGain(); body.gain.value = 1;
    const bodyParts = [
      { f: 44,  g: 0.55 }, // fundamental
      { f: 66,  g: 0.35 }, // perfect fifth
      { f: 88,  g: 0.25 }, // octave
      { f: 132, g: 0.15 }, // octave + fifth
    ];
    const oscs = [];
    for (const { f, g } of bodyParts) {
      const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = f;
      const og = c.createGain(); og.gain.value = g;
      o.connect(og); og.connect(body);
      oscs.push(o);
    }

    // ── Combustion roar: band-passed pink noise ~400 Hz ──
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.0990460;
      b1 = 0.96300 * b1 + w * 0.2965164;
      b2 = 0.57000 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.11;
    }
    const noise = c.createBufferSource(); noise.buffer = buf;
    const noiseBp = c.createBiquadFilter();
    noiseBp.type = 'bandpass'; noiseBp.frequency.value = 400; noiseBp.Q.value = 0.7;
    const noiseG = c.createGain(); noiseG.gain.value = 0.35;
    noise.connect(noiseBp); noiseBp.connect(noiseG);

    // ── Turbine whine: high sine with slow vibrato via LFO on frequency ──
    const whine = c.createOscillator();
    whine.type = 'sine'; whine.frequency.value = 2400;
    const lfo = c.createOscillator();
    lfo.type = 'sine'; lfo.frequency.value = 4.5;
    const lfoDepth = c.createGain(); lfoDepth.gain.value = 14; // ±14 Hz vibrato
    lfo.connect(lfoDepth); lfoDepth.connect(whine.frequency);
    const whineG = c.createGain(); whineG.gain.value = 0.07;
    whine.connect(whineG);

    // ── Master warm LP + ADSR envelope ──
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 600; lp.Q.value = 0.9;
    const master = c.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(vol, t + Math.min(0.4, dur * 0.25));
    master.gain.setValueAtTime(vol, t + dur * 0.65);
    master.gain.linearRampToValueAtTime(0, t + dur);

    body.connect(lp);
    noiseG.connect(lp);
    whineG.connect(lp);
    lp.connect(master); master.connect(c.destination);

    for (const o of oscs) o.start(t);
    noise.start(t); whine.start(t); lfo.start(t);
    const stopT = t + dur + 0.02;
    for (const o of oscs) o.stop(stopT);
    whine.stop(stopT); lfo.stop(stopT);
  } catch {}
}

// Jet engine spool-up — cold start. Pitch, combustion noise, and whine
// all rise together from sub-audible to full RPM over `dur`. Used at the
// front of the radar boot sequence so the view "powers on" like avionics.
function engineSpool(vol = 0.09, dur = 2.2) {
  try {
    const c = getCtx(), t = c.currentTime;

    // Rising fundamental: 22 Hz → 48 Hz (felt more than heard at the low end)
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(22, t);
    o.frequency.exponentialRampToValueAtTime(48, t + dur * 0.85);
    const bodyG = c.createGain(); bodyG.gain.value = 0.8;
    o.connect(bodyG);

    // Rising combustion noise — bandpass sweeps from 200 → 500 Hz
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * 0.3;
    const noise = c.createBufferSource(); noise.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(200, t);
    bp.frequency.exponentialRampToValueAtTime(500, t + dur);
    bp.Q.value = 0.8;
    const noiseG = c.createGain(); noiseG.gain.value = 0.5;
    noise.connect(bp); bp.connect(noiseG);

    // Whine sweeps from 800 → 2400 Hz and fades IN during the last 70%
    // so the spool feels like it crosses over from rumble → whine as
    // the turbine catches RPM.
    const whine = c.createOscillator();
    whine.type = 'sine';
    whine.frequency.setValueAtTime(800, t);
    whine.frequency.exponentialRampToValueAtTime(2400, t + dur);
    const whineG = c.createGain();
    whineG.gain.setValueAtTime(0, t);
    whineG.gain.setValueAtTime(0, t + dur * 0.3);
    whineG.gain.linearRampToValueAtTime(vol * 0.7, t + dur);
    whine.connect(whineG);

    // Master warm LP + envelope
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 700; lp.Q.value = 0.9;
    const master = c.createGain();
    master.gain.setValueAtTime(0, t);
    master.gain.linearRampToValueAtTime(vol, t + dur * 0.9);
    master.gain.linearRampToValueAtTime(0, t + dur + 0.3);

    bodyG.connect(lp);
    noiseG.connect(lp);
    whineG.connect(lp);
    lp.connect(master); master.connect(c.destination);

    o.start(t); noise.start(t); whine.start(t);
    const stopT = t + dur + 0.35;
    o.stop(stopT); whine.stop(stopT);
  } catch {}
}

// Radio squelch tail — short warm noise burst with a bandpass around the
// human voice band. Analogous to the "psht" heard when an ATC channel
// opens. Closes softly instead of cutting sharply.
function squelchTail(vol = 0.04, dur = 0.18) {
  try {
    const c = getCtx(), t = c.currentTime;
    const n = Math.floor(c.sampleRate * dur);
    const buf = c.createBuffer(1, n, c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    const src = c.createBufferSource(); src.buffer = buf;
    const bp = c.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.2;
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 3500;
    const g = c.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.linearRampToValueAtTime(vol * 0.6, t + dur * 0.25);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(bp); bp.connect(lp); lp.connect(g); g.connect(c.destination);
    src.start(t);
  } catch {}
}

// GPS waypoint / nav confirmation chime — clean fundamental sine with a
// quieter octave harmonic for warmth. Used as a "system ready" signal at
// the end of the avionics boot sequence.
function gpsPing(freq = 1320, vol = 0.06, dur = 0.6) {
  try {
    const c = getCtx(), t = c.currentTime;
    // Fundamental
    const o1 = c.createOscillator(), g1 = c.createGain();
    o1.type = 'sine'; o1.frequency.value = freq;
    g1.gain.setValueAtTime(0, t);
    g1.gain.linearRampToValueAtTime(vol, t + 0.01);
    g1.gain.setValueAtTime(vol, t + Math.min(0.15, dur * 0.25));
    g1.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o1.connect(g1); g1.connect(c.destination);
    o1.start(t); o1.stop(t + dur + 0.01);
    // Octave up — quieter harmonic body, shorter tail
    const o2 = c.createOscillator(), g2 = c.createGain();
    o2.type = 'sine'; o2.frequency.value = freq * 2;
    g2.gain.setValueAtTime(0, t);
    g2.gain.linearRampToValueAtTime(vol * 0.25, t + 0.01);
    g2.gain.exponentialRampToValueAtTime(0.001, t + dur * 0.7);
    o2.connect(g2); g2.connect(c.destination);
    o2.start(t); o2.stop(t + dur * 0.7 + 0.01);
  } catch {}
}

// Haptic feedback — tiny vibration on tap (Android). iOS gets native tap via webkit.
function haptic(ms = 10) {
  try { navigator?.vibrate?.(ms); } catch {}
}

export const Sound = {
  // Tap — hard knock + haptic buzz
  tap: () => { knock(0.1); haptic(10); },

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

  // Radar open — avionics power-up sequence. A cold jet engine spools from
  // sub-audible rumble to full RPM under cabin airflow, the ATC channel
  // opens with a soft squelch tail, a 3-note self-test chime follows, and
  // a warm GPS "system ready" ping lands last. Serious, ASMR, cockpit
  // aesthetic throughout — the engine does the heavy lifting on the bed.
  radarOpen: () => {
    engineSpool(0.09, 2.2);
    airflow(0.05, 1.6);
    setTimeout(() => squelchTail(0.04, 0.18), 520);
    setTimeout(() => atcBeep(660,  0.05, 0.20), 820);
    setTimeout(() => atcBeep(880,  0.05, 0.20), 1000);
    setTimeout(() => atcBeep(1100, 0.05, 0.24), 1180);
    setTimeout(() => gpsPing(1320, 0.07, 0.80), 1520);
    // Steady engine settles in behind the GPS chime, fading out cleanly.
    setTimeout(() => jetEngine(0.05, 2.0), 2200);
  },

  // Radar blip — transponder return. Silent by default: the ATC peep in
  // the human-voice band tested as annoying on repeated blips. The radar
  // already has the engine bed + airflow providing ambient feedback, and
  // the visual ripple is enough to show a hit. Kept as a no-op so any
  // future tweak only touches this file.
  radarBlip: () => {},

  // Map blip — territorial sweep ping: low resonant pulse + soft sub
  // (different timbre from radarBlip so the two indicators are aurally distinct)
  mapBlip: () => {
    const freq = 60 + Math.random() * 40;
    pulse(freq, 0.12, 0.35);
    setTimeout(() => tone(380, 0.08, 0.04), 60);
  },

  // Radar scan — gentle cabin airflow layered over a distant jet engine
  // drone. No tones, just textural breath + turbine bed. Plays as ambient
  // background every few seconds while the radar view is open.
  radarScan: () => {
    airflow(0.04, 0.9);
    setTimeout(() => jetEngine(0.035, 1.2), 40);
  },
};
