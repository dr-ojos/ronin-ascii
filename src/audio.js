// Cinematic combat audio with WebAudio:
// master bus with compressor + long hall reverb, layered katana swings, steel rings, body impacts,
// taiko drums for waves, oni roars, and a rain / wind / drone ambience bed.
//
// Recorded samples: every sound first looks for files listed in sounds/manifest.json (see sounds/LEEME.md).
// A sample plays through the same reverb / panning / compressor chain; if a slot has no files (or they
// fail to load) the original synthesised version plays instead, so the game is never silent.

// Per-slot defaults; any of these can be overridden in the manifest with { "files": [...], "gain": .. }.
//   gain  – level of the sample      wet   – reverb send       pitch – random ± playback-rate variation
//   layer – level of the synth layer kept underneath the sample (0 = sample only)
//   loop  – ambience bed that loops forever
const SLOTS = {
  swing:      { wet: 0.2,  gain: 0.9 },
  swingHeavy: { wet: 0.22, gain: 1 },
  dash:       { wet: 0.15, gain: 0.7 },
  hit:        { wet: 0.3,  gain: 1, layer: 0.5 },
  hitHeavy:   { wet: 0.35, gain: 1, layer: 0.6 },
  hurt:       { wet: 0.15, gain: 1 },
  warn:       { wet: 0.3,  gain: 0.7 },
  roar:       { wet: 0.4,  gain: 0.8 },
  roarBig:    { wet: 0.45, gain: 1 },
  death:      { wet: 0.4,  gain: 1 },
  deathBig:   { wet: 0.5,  gain: 1 },
  taiko:      { wet: 0.5,  gain: 1 },
  rain:       { wet: 0.15, gain: 0.35, loop: true, pitch: 0 },
  wind:       { wet: 0.25, gain: 0.3,  loop: true, pitch: 0 },
};
const SOUND_DIR = new URL('../sounds/', import.meta.url);

// Download the manifest and the raw file bytes straight away (no AudioContext needed yet),
// so the samples are usually ready by the time the player clicks to start.
function prefetchSamples() {
  return fetch(new URL('manifest.json', SOUND_DIR)).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    .then(manifest => Promise.all(Object.keys(SLOTS).map(async name => {
      const entry = manifest[name] || [];
      const cfg = { ...SLOTS[name], pitch: SLOTS[name].pitch ?? 0.04, layer: SLOTS[name].layer ?? 0, ...(Array.isArray(entry) ? {} : entry) };
      const files = Array.isArray(entry) ? entry : entry.files || [];
      const raw = await Promise.all(files.map(f => fetch(new URL(f, SOUND_DIR))
        .then(r => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
        .then(data => ({ f, data }))
        .catch(e => { console.warn(`[audio] no se pudo cargar sounds/${f} (${e.message})`); return null; })));
      return [name, { ...cfg, raw: raw.filter(Boolean) }];
    })));
}

export function createAudio() {
  let ctx = null, master, verb, verbSend, noise, amb = null, muted = false, scale = 1, ready = null;
  const rnd = (a, b) => a + Math.random() * (b - a);
  const prefetch = prefetchSamples();
  const slots = {}; // name -> { buffers: AudioBuffer[], gain, wet, pitch, layer, loop, last }

  function impulse(seconds, decay) {
    const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
    return buf;
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    const comp = ctx.createDynamicsCompressor();
    Object.assign(comp, {});
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5; comp.attack.value = 0.003; comp.release.value = 0.25;
    master = ctx.createGain(); master.gain.value = 0.85;
    master.connect(comp).connect(ctx.destination);
    verb = ctx.createConvolver(); verb.buffer = impulse(3.2, 2.6);
    verbSend = ctx.createGain(); verbSend.gain.value = 0.55;
    verb.connect(verbSend).connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
    ready = prefetch.then(entries => Promise.all(entries.map(async ([name, cfg]) => {
      const buffers = (await Promise.all(cfg.raw.map(({ f, data }) => ctx.decodeAudioData(data)
        .catch(() => { console.warn(`[audio] formato no soportado: sounds/${f}`); return null; })))).filter(Boolean);
      slots[name] = { ...cfg, raw: undefined, buffers, last: -1 };
    }))).then(() => {
      const loaded = Object.entries(slots).filter(([, s]) => s.buffers.length).map(([n, s]) => `${n}×${s.buffers.length}`);
      if (loaded.length) console.info(`[audio] samples: ${loaded.join(', ')}`);
      startSampleAmbience();
      return summary();
    });
  }
  const summary = () => Object.fromEntries(Object.entries(slots).map(([n, s]) => [n, s.buffers.length]));

  // ------------------------------------------------------------ samples
  // Play one random variant of a slot (never the same one twice in a row). Returns false if the slot is empty.
  function playSample(name, { t = ctx.currentTime, pan = 0, gain = 1, rate = 1 } = {}) {
    const s = slots[name]; if (!s || !s.buffers.length) return false;
    let i = (Math.random() * s.buffers.length) | 0;
    if (s.buffers.length > 1 && i === s.last) i = (i + 1) % s.buffers.length;
    s.last = i;
    const src = ctx.createBufferSource(); src.buffer = s.buffers[i];
    src.playbackRate.value = rate * (1 + rnd(-s.pitch, s.pitch));
    out(src, { wet: s.wet, pan, gain: gain * s.gain });
    src.start(t);
    return true;
  }
  // Try each candidate slot in order ('name' or ['name', { rate, gain }] for a re-pitched fallback).
  // If one plays, the synth version is kept underneath at that slot's `layer` level; otherwise the synth plays alone.
  function voice(candidates, opts, synth, layerSynth = synth) {
    for (const c of candidates) {
      const [name, extra] = Array.isArray(c) ? c : [c, {}];
      if (!playSample(name, { ...opts, ...extra })) continue;
      const l = slots[name].layer;
      if (l > 0) { const prev = scale; scale = prev * l; try { layerSynth(); } finally { scale = prev; } }
      return;
    }
    synth();
  }

  // route a node to the dry bus and the reverb, with stereo position
  function out(node, { wet = 0.25, pan = 0, gain = 1 } = {}) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain(); g.gain.value = gain * scale;
    node.connect(g).connect(p); p.connect(master);
    const s = ctx.createGain(); s.gain.value = wet; p.connect(s).connect(verb);
    return g;
  }
  function env(g, t, a, peak, d, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  function noiseSrc(t, dur, rate = 1) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = rate;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s;
  }
  const ok = () => ctx && !muted;

  // ------------------------------------------------------------ one-shots
  function swing({ power = 1, pan = 0 } = {}) {
    if (!ok()) return;
    const cands = power > 1.2 ? ['swingHeavy', ['swing', { rate: 0.9, gain: 1.15 }]] : ['swing'];
    voice(cands, { pan }, () => swingSynth({ power, pan }));
  }
  function swingSynth({ power = 1, pan = 0 } = {}) {
    const t = ctx.currentTime, len = 0.32 * (0.8 + power * 0.3);
    // body of the whoosh: band-passed noise sweeping up then down (doppler feel)
    const n = noiseSrc(t, len), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2.2;
    bp.frequency.setValueAtTime(350, t); bp.frequency.exponentialRampToValueAtTime(2600 * power, t + len * 0.45); bp.frequency.exponentialRampToValueAtTime(600, t + len);
    const g = ctx.createGain(); env(g, t, len * 0.4, 0.55 * power, len * 0.6);
    n.connect(bp).connect(g); out(g, { wet: 0.18, pan });
    // airy edge of the blade
    const n2 = noiseSrc(t, len), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    const g2 = ctx.createGain(); env(g2, t + len * 0.25, 0.04, 0.18 * power, len * 0.4);
    n2.connect(hp).connect(g2); out(g2, { wet: 0.3, pan: pan * 1.4 });
    // low cloth / body movement
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(55, t + len);
    const g3 = ctx.createGain(); env(g3, t, 0.05, 0.18 * power, len);
    o.connect(g3); out(g3, { wet: 0.05 }); o.start(t); o.stop(t + len + 0.1);
  }
  function steel(t, pan, bright = 1) {
    // inharmonic partials = struck blade ringing in the hall
    const f0 = rnd(1500, 2100) * bright;
    for (const [m, amp, dec] of [[1, 0.16, 1.4], [2.76, 0.09, 0.9], [5.4, 0.06, 0.6], [8.93, 0.035, 0.35], [1.008, 0.1, 1.6]]) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f0 * m;
      const g = ctx.createGain(); env(g, t, 0.002, amp, dec);
      o.connect(g); out(g, { wet: 0.45, pan }); o.start(t); o.stop(t + dec + 0.1);
    }
    const n = noiseSrc(t, 0.05), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const g = ctx.createGain(); env(g, t, 0.001, 0.5, 0.04); n.connect(hp).connect(g); out(g, { wet: 0.2, pan });
  }
  function body(t, heavy, pan) {
    // sub drop + flesh slap + distortion grit
    const o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(heavy ? 140 : 170, t); o.frequency.exponentialRampToValueAtTime(heavy ? 32 : 45, t + (heavy ? 0.45 : 0.25));
    const sh = ctx.createWaveShaper(); const c = new Float32Array(256);
    for (let i = 0; i < 256; i++) { const x = i / 128 - 1; c[i] = Math.tanh(x * 3); } sh.curve = c;
    const g = ctx.createGain(); env(g, t, 0.003, heavy ? 1.0 : 0.75, heavy ? 0.5 : 0.28);
    o.connect(sh).connect(g); out(g, { wet: 0.12, pan: pan * 0.5 }); o.start(t); o.stop(t + 0.7);
    const n = noiseSrc(t, 0.2, 0.6), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g2 = ctx.createGain(); env(g2, t, 0.002, heavy ? 0.7 : 0.5, 0.14); n.connect(lp).connect(g2); out(g2, { wet: 0.15, pan });
  }
  function blood(t, pan) {
    const n = noiseSrc(t + 0.03, 0.35, 0.8), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ctx.createGain(); env(g, t + 0.03, 0.01, 0.22, 0.3); n.connect(bp).connect(g); out(g, { wet: 0.2, pan });
  }
  function hit({ heavy = false, pan = 0, count = 1 } = {}) {
    if (!ok()) return; const t = ctx.currentTime, big = heavy || count > 1;
    voice(big ? ['hitHeavy', ['hit', { rate: 0.88, gain: 1.15 }]] : ['hit'], { pan },
      () => { steel(t, pan, heavy ? 0.85 : 1); body(t, big, pan); blood(t, pan); },
      () => body(t, big, pan)); // under a recorded hit keep only the synth sub-thump for weight
  }
  function taiko(power = 1, t0 = 0) {
    if (!ok()) return; const t = ctx.currentTime + t0;
    // power doubles as pitch, so a sampled drum still follows the rhythm's accents
    voice(['taiko'], { t, rate: 0.85 + power * 0.15, gain: Math.min(1.2, power) }, () => taikoSynth(t, power));
  }
  function taikoSynth(t, power) {
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(110 * power, t); o.frequency.exponentialRampToValueAtTime(48, t + 0.5);
    const g = ctx.createGain(); env(g, t, 0.004, 0.9, 0.9); o.connect(g); out(g, { wet: 0.5 }); o.start(t); o.stop(t + 1.2);
    const n = noiseSrc(t, 0.2), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g2 = ctx.createGain(); env(g2, t, 0.002, 0.6, 0.18); n.connect(lp).connect(g2); out(g2, { wet: 0.6 });
  }
  function waveStart(boss) {
    taiko(1, 0); taiko(0.9, 0.32); taiko(1.15, 0.64);
    if (boss) { taiko(0.7, 1.0); taiko(0.7, 1.15); taiko(1.3, 1.4); roar({ big: true, delay: 1.5 }); }
  }
  function roar({ big = false, pan = 0, delay = 0 } = {}) {
    if (!ok()) return; const t = ctx.currentTime + delay;
    voice(big ? ['roarBig', ['roar', { rate: 0.78, gain: 1.2 }]] : ['roar'], { t, pan }, () => roarSynth(t, big, pan));
  }
  function roarSynth(t, big, pan) {
    const dur = big ? 1.4 : 0.7;
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(big ? 70 : 110, t); o.frequency.linearRampToValueAtTime(big ? 95 : 150, t + dur * 0.3); o.frequency.exponentialRampToValueAtTime(big ? 45 : 70, t + dur);
    const trem = ctx.createOscillator(); trem.frequency.value = big ? 23 : 31; const tg = ctx.createGain(); tg.gain.value = 0.35; trem.connect(tg);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = big ? 700 : 1100; lp.Q.value = 4;
    const g = ctx.createGain(); env(g, t, 0.08, big ? 0.32 : 0.16, dur);
    tg.connect(g.gain);
    const n = noiseSrc(t, dur, 0.5), nb = ctx.createBiquadFilter(); nb.type = 'bandpass'; nb.frequency.value = 600; const ng = ctx.createGain(); env(ng, t, 0.06, big ? 0.2 : 0.1, dur);
    o.connect(lp).connect(g); n.connect(nb).connect(ng);
    out(g, { wet: 0.4, pan }); out(ng, { wet: 0.4, pan });
    o.start(t); o.stop(t + dur + 0.1); trem.start(t); trem.stop(t + dur + 0.1);
  }
  function death({ big = false, pan = 0 } = {}) {
    if (!ok()) return;
    voice(big ? ['deathBig', ['death', { rate: 0.82, gain: 1.2 }]] : ['death'], { pan }, () => deathSynth(big, pan));
  }
  function deathSynth(big, pan) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.setValueAtTime(big ? 80 : 110, t); o.frequency.exponentialRampToValueAtTime(22, t + (big ? 1.6 : 0.9));
    const g = ctx.createGain(); env(g, t, 0.005, big ? 1 : 0.7, big ? 1.6 : 0.9); o.connect(g); out(g, { wet: 0.5, pan }); o.start(t); o.stop(t + 2);
    roar({ big, pan, delay: 0.02 });
    const n = noiseSrc(t, 0.6, 0.4), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const g2 = ctx.createGain(); env(g2, t, 0.005, 0.4, 0.55); n.connect(lp).connect(g2); out(g2, { wet: 0.5, pan });
  }
  function hurt() {
    if (!ok()) return; const t = ctx.currentTime;
    voice(['hurt'], {}, () => body(t, true, 0));
    // tinnitus ring: the cinematic "ears ringing" after a heavy blow
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 3150;
    const g = ctx.createGain(); env(g, t + 0.05, 0.05, 0.05, 1.6); o.connect(g); out(g, { wet: 0.1 }); o.start(t); o.stop(t + 2);
    // duck the world for a moment
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(0.4, t); master.gain.linearRampToValueAtTime(0.85, t + 0.9);
  }
  function dash() {
    if (!ok()) return;
    voice(['dash', ['swing', { rate: 0.8, gain: 0.9 }]], {}, () => swingSynth({ power: 0.6 }));
  }
  function warn(pan = 0) { // oni wind-up: a short rising growl
    if (!ok()) return;
    voice(['warn'], { pan }, () => warnSynth(pan));
  }
  function warnSynth(pan) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.4);
    const g = ctx.createGain(); env(g, t, 0.15, 0.08, 0.35); o.connect(g); out(g, { wet: 0.3, pan }); o.start(t); o.stop(t + 0.6);
  }

  // ------------------------------------------------------------ ambience bed
  function startAmbience() {
    const t = ctx.currentTime;
    const rain = noiseSrc(t, 3600, 1), rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 1400;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 7000;
    // rainBus is the on/off switch (R key); rg is the synth rain, muted if a recorded rain loop loads
    const rainBus = ctx.createGain(); rainBus.gain.value = 1;
    const rg = ctx.createGain(); rg.gain.value = 0.05; rain.connect(rh).connect(rl).connect(rg).connect(rainBus); out(rainBus, { wet: 0.2 });
    const wind = noiseSrc(t, 3600, 0.5), wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 420;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 0.035; lfo.connect(lg).connect(wg.gain); lfo.start(t);
    // wind swells via the LFO on wg; windBus lets a recorded wind loop take over from the synth
    const windBus = ctx.createGain(); windBus.gain.value = 1;
    wind.connect(wl).connect(wg).connect(windBus); out(windBus, { wet: 0.3 });
    const drone = ctx.createGain(); drone.gain.value = 0.022;
    for (const f of [55, 82.4, 110.3]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = rnd(-6, 6); o.connect(drone); o.start(t); }
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 300; drone.connect(dl); out(dl, { wet: 0.6 });
    amb = { rainBus, windBus, drone, rainOn: true };
  }
  // Swap the synth rain / wind for recorded loops once they have decoded (crossfade over ~1 s).
  function startSampleAmbience() {
    const t = ctx.currentTime;
    for (const [name, bus] of [['rain', amb.rainBus], ['wind', amb.windBus]]) {
      const s = slots[name]; if (!s || !s.buffers.length) continue;
      const src = ctx.createBufferSource(); src.buffer = s.buffers[(Math.random() * s.buffers.length) | 0]; src.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(s.gain, t + 1.2);
      bus.gain.setTargetAtTime(0, t, 0.3); // fade out the synth version
      src.connect(g); const o = out(g, { wet: s.wet });
      src.start(t, Math.random() * src.buffer.duration);
      if (name === 'rain') { amb.rainSample = o; if (!amb.rainOn) o.gain.value = 0; }
    }
  }
  function setRain(on) {
    if (!amb) return; amb.rainOn = on; const t = ctx.currentTime;
    if (amb.rainSample) amb.rainSample.gain.setTargetAtTime(on ? 1 : 0, t, 0.4);
    else amb.rainBus.gain.setTargetAtTime(on ? 1 : 0, t, 0.4);
  }
  function setMuted(m) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05); }

  return {
    init, swing, hit, taiko, waveStart, roar, death, hurt, dash, warn, setRain, setMuted,
    get muted() { return muted; },
    // resolves to { slot: number of loaded files } once samples have decoded (after init)
    get ready() { return ready || Promise.resolve({}); },
  };
}
