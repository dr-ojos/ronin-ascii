// Cinematic combat audio with WebAudio:
// master bus with compressor + long hall reverb, layered katana swings, steel rings, body impacts,
// taiko drums, oni roars, temple bells for loot, arrows, and a rain / wind / drone ambience bed.
//
// Recorded samples: every sound first looks for files listed in sounds/manifest.json (see sounds/LEEME.md).
// A sample plays through the same reverb / panning / compressor chain; if a slot has no files (or they
// fail to load) the original synthesised version plays instead, so the game is never silent.

// Per-slot defaults; any of these can be overridden in the manifest with { "files": [...], "gain": .. }.
//   gain  – level of the sample      wet   – reverb send       pitch – random ± playback-rate variation
//   layer – level of the synth layer kept underneath the sample (0 = sample only)
//   loop  – ambience bed that loops forever
interface SlotCfg { wet: number; gain: number; layer?: number; loop?: boolean; pitch?: number }
/** settings once defaults and the manifest are merged in */
type SlotSettings = SlotCfg & { pitch: number; layer: number; files?: string[] };
/** a slot ready to play: its decoded variants and the last one played */
type Slot = SlotSettings & { buffers: AudioBuffer[]; last: number; raw?: undefined };
type RawFile = { f: string; data: ArrayBuffer };
/** manifest.json: a list of files, or { files, gain, wet, ... } */
type ManifestEntry = string[] | (Partial<SlotCfg> & { files?: string[] });
type PlayOpts = { t?: number; pan?: number; gain?: number; rate?: number };
/** 'slot' or ['slot', { rate, gain }] for a re-pitched fallback */
type Candidate = string | [string, PlayOpts];
interface Ambience { rainBus: GainNode; windBus: GainNode; drone: GainNode; rainLevel: number; rainSample?: GainNode }

const SLOTS = {
  swing:      { wet: 0.2,  gain: 0.9 },
  swingHeavy: { wet: 0.22, gain: 1 },
  dash:       { wet: 0.15, gain: 0.7 },
  hit:        { wet: 0.3,  gain: 1 },
  hitHeavy:   { wet: 0.35, gain: 1 },
  hurt:       { wet: 0.15, gain: 1 },
  warn:       { wet: 0.3,  gain: 0.7 },
  roar:       { wet: 0.4,  gain: 0.8 },
  roarBig:    { wet: 0.45, gain: 1 },
  death:      { wet: 0.4,  gain: 1 },
  deathBig:   { wet: 0.5,  gain: 1 },
  taiko:      { wet: 0.5,  gain: 1 },
  rain:       { wet: 0.15, gain: 0.14, loop: true, pitch: 0 },
  wind:       { wet: 0.25, gain: 0.3,  loop: true, pitch: 0 },
} satisfies Record<string, SlotCfg>;
type SlotName = keyof typeof SLOTS;
const SOUND_DIR = new URL(import.meta.env.BASE_URL + 'sounds/', location.href);

// Download the manifest and the raw file bytes straight away (no AudioContext needed yet),
// so the samples are usually ready by the time the player clicks to start.
function prefetchSamples(): Promise<[SlotName, SlotSettings & { raw: RawFile[] }][]> {
  return fetch(new URL('manifest.json', SOUND_DIR)).then(r => (r.ok ? r.json() : {})).catch(() => ({}))
    .then((manifest: Record<string, ManifestEntry>) => Promise.all((Object.keys(SLOTS) as SlotName[]).map(async (name): Promise<[SlotName, SlotSettings & { raw: RawFile[] }]> => {
      const entry = manifest[name] || [];
      const base: SlotCfg = SLOTS[name];
      const cfg = { ...base, pitch: base.pitch ?? 0.04, layer: base.layer ?? 0, ...(Array.isArray(entry) ? {} : entry) };
      const files: string[] = Array.isArray(entry) ? entry : entry.files || [];
      const raw = await Promise.all(files.map(f => fetch(new URL(f, SOUND_DIR))
        .then(r => { if (!r.ok) throw new Error(String(r.status)); return r.arrayBuffer(); })
        .then((data): RawFile => ({ f, data }))
        .catch(e => { console.warn(`[audio] no se pudo cargar sounds/${f} (${e.message})`); return null; })));
      return [name, { ...cfg, raw: raw.filter((r): r is RawFile => r !== null) }];
    })));
}

export function createAudio() {
  // the WebAudio graph is built by init() on the first click; every sound checks ok() before using it
  let ctx!: AudioContext, master!: GainNode, verb!: ConvolverNode, verbSend!: GainNode, noise!: AudioBuffer;
  let amb: Ambience | null = null, rainLevel = 1, muted = false, scale = 1, ready: Promise<Record<string, number>> | null = null;
  const rnd = (a: number, b: number) => a + Math.random() * (b - a);
  const prefetch = prefetchSamples();
  const slots: Record<string, Slot> = {}; // name -> { buffers: AudioBuffer[], gain, wet, pitch, layer, loop, last }

  function impulse(seconds: number, decay: number) {
    const len = ctx.sampleRate * seconds, buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, decay) * (i < ctx.sampleRate * 0.012 ? i / (ctx.sampleRate * 0.012) : 1);
    }
    return buf;
  }
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
        .catch(() => { console.warn(`[audio] formato no soportado: sounds/${f}`); return null; })))).filter((b): b is AudioBuffer => b !== null);
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
  function playSample(name: string, { t = ctx.currentTime, pan = 0, gain = 1, rate = 1 }: PlayOpts = {}) {
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
  function voice(candidates: Candidate[], opts: PlayOpts, synth: () => void, layerSynth = synth) {
    for (const c of candidates) {
      const [name, extra]: [string, PlayOpts] = Array.isArray(c) ? c : [c, {}];
      if (!playSample(name, { ...opts, ...extra })) continue;
      const l = slots[name].layer;
      if (l > 0) { const prev = scale; scale = prev * l; try { layerSynth(); } finally { scale = prev; } }
      return;
    }
    synth();
  }

  // route a node to the dry bus and the reverb, with stereo position
  function out(node: AudioNode, { wet = 0.25, pan = 0, gain = 1 }: { wet?: number; pan?: number; gain?: number } = {}) {
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    const g = ctx.createGain(); g.gain.value = gain * scale;
    node.connect(g).connect(p); p.connect(master);
    const s = ctx.createGain(); s.gain.value = wet; p.connect(s).connect(verb);
    return g;
  }
  function env(g: GainNode, t: number, a: number, peak: number, d: number, end = 0.0001) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  }
  function noiseSrc(t: number, dur: number, rate = 1) {
    const s = ctx.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = rate;
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05); return s;
  }
  const ok = () => ctx && !muted;

  // ------------------------------------------------------------ one-shots
  function swing({ power = 1, pan = 0 }: { power?: number; pan?: number } = {}) {
    if (!ok()) return;
    const cands: Candidate[] = power > 1.2 ? ['swingHeavy', ['swing', { rate: 0.9, gain: 1.15 }]] : ['swing'];
    voice(cands, { pan }, () => swingSynth({ power, pan }));
  }
  function swingSynth({ power = 1, pan = 0 }: { power?: number; pan?: number } = {}) {
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
    const n3 = noiseSrc(t, len), lp3 = ctx.createBiquadFilter(); lp3.type = 'lowpass'; lp3.frequency.value = 260;
    const g3 = ctx.createGain(); env(g3, t, 0.05, 0.3 * power, len);
    n3.connect(lp3).connect(g3); out(g3, { wet: 0.05 });
  }
  // Fallback synth only (recorded samples normally play instead). Everything here is filtered noise:
  // pitched oscillators read as beeps and pitch-dropping sines as rubber "boings", so none are used.
  function steel(t: number, pan: number, bright = 1) {
    // bright metallic scrape: two narrow noise bands that decay at different speeds
    for (const [f, q, amp, dec] of [[4200 * bright, 6, 0.35, 0.35], [7600 * bright, 4, 0.2, 0.18]]) {
      const n = noiseSrc(t, dec + 0.05), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q;
      const g = ctx.createGain(); env(g, t, 0.001, amp, dec); n.connect(bp).connect(g); out(g, { wet: 0.35, pan });
    }
  }
  function body(t: number, heavy: boolean, pan: number) {
    // low thud (low-passed noise, no pitch sweep) + flesh slap
    const sub = noiseSrc(t, 0.4, 0.5), sl = ctx.createBiquadFilter(); sl.type = 'lowpass'; sl.frequency.value = heavy ? 160 : 220; sl.Q.value = 0.7;
    const g = ctx.createGain(); env(g, t, 0.003, heavy ? 1.6 : 1.1, heavy ? 0.3 : 0.18);
    sub.connect(sl).connect(g); out(g, { wet: 0.12, pan: pan * 0.5 });
    const n = noiseSrc(t, 0.2, 0.6), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
    const g2 = ctx.createGain(); env(g2, t, 0.002, heavy ? 0.7 : 0.5, 0.14); n.connect(lp).connect(g2); out(g2, { wet: 0.15, pan });
  }
  function blood(t: number, pan: number) {
    const n = noiseSrc(t + 0.03, 0.35, 0.8), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 0.8;
    const g = ctx.createGain(); env(g, t + 0.03, 0.01, 0.22, 0.3); n.connect(bp).connect(g); out(g, { wet: 0.2, pan });
  }
  function hit({ heavy = false, pan = 0, count = 1 }: { heavy?: boolean; pan?: number; count?: number } = {}) {
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
  function taikoSynth(t: number, power: number) {
    // drum skin: resonant low-passed noise (a body, not a pitch sweep) + the stick slap below
    const b = noiseSrc(t, 1), bl = ctx.createBiquadFilter(); bl.type = 'lowpass'; bl.frequency.value = 70 * power; bl.Q.value = 6;
    const g = ctx.createGain(); env(g, t, 0.004, 2.2, 0.7); b.connect(bl).connect(g); out(g, { wet: 0.5 });
    const n = noiseSrc(t, 0.2), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const g2 = ctx.createGain(); env(g2, t, 0.002, 0.6, 0.18); n.connect(lp).connect(g2); out(g2, { wet: 0.6 });
  }
  function waveStart(boss: boolean) {
    taiko(1, 0); taiko(0.9, 0.32); taiko(1.15, 0.64);
    if (boss) { taiko(0.7, 1.0); taiko(0.7, 1.15); taiko(1.3, 1.4); roar({ big: true, delay: 1.5 }); }
  }
  function roar({ big = false, pan = 0, delay = 0 }: { big?: boolean; pan?: number; delay?: number } = {}) {
    if (!ok()) return; const t = ctx.currentTime + delay;
    voice(big ? ['roarBig', ['roar', { rate: 0.78, gain: 1.2 }]] : ['roar'], { t, pan }, () => roarSynth(t, big, pan));
  }
  function roarSynth(t: number, big: boolean, pan: number) {
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
  function howl(pan = 0) {
    if (!ok()) return;
    const t = ctx.currentTime, duration = 1.1;
    const voice = ctx.createOscillator(), wobble = ctx.createOscillator();
    const vibrato = ctx.createGain(), loudness = ctx.createGain(), filter = ctx.createBiquadFilter();
    voice.type = 'triangle'; voice.frequency.setValueAtTime(385, t);
    voice.frequency.exponentialRampToValueAtTime(625, t + 0.26);
    voice.frequency.exponentialRampToValueAtTime(435, t + duration);
    wobble.frequency.value = 5.5; vibrato.gain.value = 14;
    wobble.connect(vibrato).connect(voice.frequency);
    filter.type = 'lowpass'; filter.frequency.value = 1680;
    env(loudness, t, 0.18, 0.22, duration);
    voice.connect(filter).connect(loudness); out(loudness, { wet: 0.6, pan });
    for (const osc of [voice, wobble]) { osc.start(t); osc.stop(t + duration + 0.05); }
  }
  function growl(pan = 0, big = true) {
    if (ok()) roarSynth(ctx.currentTime, big, pan);
  }
  function death({ big = false, pan = 0 }: { big?: boolean; pan?: number } = {}) {
    if (!ok()) return;
    voice(big ? ['deathBig', ['death', { rate: 0.82, gain: 1.2 }]] : ['death'], { pan }, () => deathSynth(big, pan));
  }
  function deathSynth(big: boolean, pan: number) {
    const t = ctx.currentTime;
    body(t, big, pan); // body hitting the ground
    roar({ big, pan, delay: 0.02 });
    const n = noiseSrc(t, 0.6, 0.4), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(2500, t); lp.frequency.exponentialRampToValueAtTime(200, t + 0.6);
    const g2 = ctx.createGain(); env(g2, t, 0.005, 0.4, 0.55); n.connect(lp).connect(g2); out(g2, { wet: 0.5, pan });
  }
  function hurt() {
    if (!ok()) return; const t = ctx.currentTime;
    voice(['hurt'], {}, () => body(t, true, 0));
    // duck the world for a moment
    master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(0.4, t); master.gain.linearRampToValueAtTime(0.85, t + 0.9);
  }
  function dash() {
    if (!ok()) return;
    voice(['dash', ['swing', { rate: 0.8, gain: 0.9 }]], {}, () => swingSynth({ power: 0.6 }));
  }
  function splash({ power = 1, pan = 0 }: { power?: number; pan?: number } = {}) { // stepping into the river
    if (!ok()) return; const t = ctx.currentTime, len = 0.28 + power * 0.18;
    // the slosh: band-passed noise falling in pitch, then a hiss of droplets
    const n = noiseSrc(t, len), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(1800, t); bp.frequency.exponentialRampToValueAtTime(420, t + len);
    const g = ctx.createGain(); env(g, t, 0.012, 0.32 * power, len); n.connect(bp).connect(g); out(g, { wet: 0.25, pan });
    const n2 = noiseSrc(t + 0.05, len), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 4200;
    const g2 = ctx.createGain(); env(g2, t + 0.05, 0.02, 0.09 * power, len * 0.9); n2.connect(hp).connect(g2); out(g2, { wet: 0.35, pan: pan * 1.3 });
    const n3 = noiseSrc(t, 0.25, 0.5), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    const g3 = ctx.createGain(); env(g3, t, 0.005, 0.4 * power, 0.18); n3.connect(lp).connect(g3); out(g3, { wet: 0.1, pan: pan * 0.5 });
  }
  function warn(pan = 0) { // oni wind-up: a short rising growl
    if (!ok()) return;
    voice(['warn'], { pan }, () => warnSynth(pan));
  }
  function warnSynth(pan: number) {
    const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(70, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.4);
    const g = ctx.createGain(); env(g, t, 0.15, 0.08, 0.35); o.connect(g); out(g, { wet: 0.3, pan }); o.start(t); o.stop(t + 0.6);
  }

  // ------------------------------------------------------------ loot and arrows (synth only)
  function bell(t: number, f: number, peak: number, dur: number) {
    for (const [mul, g0] of [[1, 1], [2.76, 0.35], [5.4, 0.12]] as const) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f * mul;
      const g = ctx.createGain(); env(g, t, 0.004, peak * g0, dur / mul); o.connect(g); out(g, { wet: 0.55 }); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function chime(big = false) { // chest opened: a rising pentatonic arpeggio of temple bells
    if (!ok()) return; const t = ctx.currentTime;
    const notes = big ? [523, 659, 784, 1047, 1319] : [587, 784, 1047];
    notes.forEach((f, i) => bell(t + i * 0.09, f, 0.12, 1.6));
    if (big) taiko(0.8, 0);
  }
  function coin(heal = false) {
    if (!ok()) return; const t = ctx.currentTime;
    if (heal) { bell(t, 440, 0.06, 0.5); bell(t + 0.07, 660, 0.05, 0.5); return; }
    bell(t, 1760 + rnd(-60, 60), 0.05, 0.25); bell(t + 0.05, 2350 + rnd(-60, 60), 0.04, 0.3);
  }
  function anvil(pan = 0, gain = 1) { // the smith's hammer on the anvil: a ringing clang, quieter with distance
    if (!ok() || gain < 0.02) return; const t = ctx.currentTime;
    for (const [f, peak, dur] of [[1180, 0.07, 0.7], [2910, 0.035, 0.4], [4630, 0.018, 0.25]] as const) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * (1 + rnd(-0.01, 0.01));
      const g = ctx.createGain(); env(g, t, 0.001, peak * gain, dur); o.connect(g); out(g, { wet: 0.45, pan }); o.start(t); o.stop(t + dur + 0.1);
    }
  }
  function arrow(pan = 0) { // bowstring twang + the hiss of the arrow
    if (!ok()) return; const t = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.setValueAtTime(220, t); o.frequency.exponentialRampToValueAtTime(110, t + 0.15);
    const g = ctx.createGain(); env(g, t, 0.002, 0.12, 0.18); o.connect(g); out(g, { wet: 0.2, pan }); o.start(t); o.stop(t + 0.25);
    const n = noiseSrc(t, 0.45), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
    bp.frequency.setValueAtTime(2500, t); bp.frequency.exponentialRampToValueAtTime(900, t + 0.45);
    const g2 = ctx.createGain(); env(g2, t, 0.03, 0.07, 0.4); n.connect(bp).connect(g2); out(g2, { wet: 0.25, pan });
  }

  function thunder(pan = 0, big = true) { // a sharp crack, then (for the first bolt) a long rolling rumble
    if (!ok()) return; const t = ctx.currentTime;
    const c = noiseSrc(t, 0.25), hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1200;
    const g = ctx.createGain(); env(g, t, 0.002, 0.5, 0.22); c.connect(hp).connect(g); out(g, { wet: 0.5, pan });
    if (!big) return;
    const r = noiseSrc(t, 3.2, 0.5), lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(400, t); lp.frequency.exponentialRampToValueAtTime(90, t + 3);
    const g2 = ctx.createGain(); env(g2, t + 0.05, 0.08, 0.6, 3); r.connect(lp).connect(g2); out(g2, { wet: 0.7 });
  }

  // ------------------------------------------------------------ ambience bed
  function startAmbience() {
    const t = ctx.currentTime;
    const rain = noiseSrc(t, 3600, 1), rh = ctx.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 1400;
    const rl = ctx.createBiquadFilter(); rl.type = 'lowpass'; rl.frequency.value = 7000;
    // rainBus follows the weather (0..1, see setRain); rg is the synth rain, muted if a recorded rain loop loads
    const rainBus = ctx.createGain(); rainBus.gain.value = rainLevel;
    const rg = ctx.createGain(); rg.gain.value = 0.02; rain.connect(rh).connect(rl).connect(rg).connect(rainBus); out(rainBus, { wet: 0.2 });
    const wind = noiseSrc(t, 3600, 0.5), wl = ctx.createBiquadFilter(); wl.type = 'lowpass'; wl.frequency.value = 420;
    const wg = ctx.createGain(); wg.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 0.035; lfo.connect(lg).connect(wg.gain); lfo.start(t);
    // wind swells via the LFO on wg; windBus lets a recorded wind loop take over from the synth
    const windBus = ctx.createGain(); windBus.gain.value = 1;
    wind.connect(wl).connect(wg).connect(windBus); out(windBus, { wet: 0.3 });
    const drone = ctx.createGain(); drone.gain.value = 0.022;
    for (const f of [55, 82.4, 110.3]) { const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = f; o.detune.value = rnd(-6, 6); o.connect(drone); o.start(t); }
    const dl = ctx.createBiquadFilter(); dl.type = 'lowpass'; dl.frequency.value = 300; drone.connect(dl); out(dl, { wet: 0.6 });
    amb = { rainBus, windBus, drone, rainLevel };
  }
  // Swap the synth rain / wind for recorded loops once they have decoded (crossfade over ~1 s).
  function startSampleAmbience() {
    if (!amb) return;
    const t = ctx.currentTime;
    for (const [name, bus] of [['rain', amb.rainBus], ['wind', amb.windBus]] as const) {
      const s = slots[name]; if (!s || !s.buffers.length) continue;
      const src = ctx.createBufferSource(); src.buffer = s.buffers[(Math.random() * s.buffers.length) | 0]; src.loop = true;
      const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(s.gain, t + 1.2);
      bus.gain.setTargetAtTime(0, t, 0.3); // fade out the synth version
      src.connect(g); const o = out(g, { wet: s.wet });
      src.start(t, Math.random() * src.buffer!.duration);
      if (name === 'rain') { amb.rainSample = o; o.gain.value = amb.rainLevel; }
    }
  }
  /** how hard it rains, 0 (dry) .. 1 (downpour); world.ts eases it in and out */
  function setRain(level: number) {
    rainLevel = level; if (!amb) return; amb.rainLevel = level; const t = ctx.currentTime;
    if (amb.rainSample) amb.rainSample.gain.setTargetAtTime(level, t, 0.15);
    else amb.rainBus.gain.setTargetAtTime(level, t, 0.15);
  }
  function setMuted(m: boolean) { muted = m; if (ctx) master.gain.setTargetAtTime(m ? 0 : 0.85, ctx.currentTime, 0.05); }

  return {
    init, swing, hit, taiko, waveStart, roar, howl, growl, death, hurt, dash, splash, warn, chime, coin, anvil, arrow, thunder, setRain, setMuted,
    get muted() { return muted; },
    // resolves to { slot: number of loaded files } once samples have decoded (after init)
    get ready() { return ready || Promise.resolve({}); },
  };
}
