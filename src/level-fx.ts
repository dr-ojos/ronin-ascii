// The level-up celebration (progression.ts onLevelUp). In the world, a whirlwind of neon yellow sparks
// starts just over the fighter's head and spirals up into the sky, fast and fluid, each spark leaving a short
// streak; as it reaches the top of the screen, the banner with the new level appears. Nothing covers the
// fighter or slows the fight. Every tenth level is a milestone (red embers in the whirl, a wider, longer
// one) and level 100 is white gold.
import * as THREE from 'three';
import { renderer, scene } from './renderer';
import { CLS, tagMat } from './materials';
import { burst } from './fx';
import { skyFlash } from './special';
import { sfx } from './sfx';
import { player, state } from './state';
import { WEAPONS } from './weapons';
import { canWield } from './classes';
import { ARMORS } from './armor';
import { hasPerk, isMilestone, MAX_LEVEL, onLevelUp, type LevelUp } from './progression';

const GOLD = 0xffd27a;
const NEON = new THREE.Color(0xffdc00), HOT = new THREE.Color(0xfffbe0), AMBER = new THREE.Color(0xffa000);
const EMBER = new THREE.Color(0xff5a3a), PEARL = new THREE.Color(0xfffaf0);

// ------------------------------------------------------------ the whirlwind (built once, shown when needed)
const root = new THREE.Group(); root.visible = false; scene.add(root);
const HEAD = 2.3;        // the whirl is born just over the head (and the hat)
const SKY = 16;          // ...and climbs this high, out past the top of the screen
const RISE = 0.85;       // seconds a spark takes to climb
const SPREAD = 0.45;     // sparks set off over this many seconds
const DUR = RISE + SPREAD + 0.1;
/** when the whirl reaches the sky and the number appears (ms after the level-up) */
const REVEAL_MS = 520;

const SPARKS = 150, TRAIL = 4, N = SPARKS * TRAIL;
const pos = new Float32Array(N * 3), col = new Float32Array(N * 3), seedAttr = new Float32Array(N);
for (let i = 0; i < N; i++) seedAttr[i] = Math.random() * 1000;
const geo = new THREE.BufferGeometry();
geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
geo.setAttribute('seed', new THREE.BufferAttribute(seedAttr, 1));
// Neon sparks with a glitch, the same in the ASCII view and the plain 3D one (T): a white-hot core in a soft
// halo, the colour channels split apart, flicker, sideways jumps in steps, and now and then a spark that
// tears into a short scanline dash.
const cloudMat = tagMat(new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 }, uSize: { value: 0.42 }, uScale: { value: 400 } },
  vertexShader: /* glsl */`
    attribute vec3 color;
    attribute float seed;
    uniform float uTime, uSize, uScale;
    varying vec3 vColor;
    varying float vTear, vSplit;
    float hash(float n) { return fract(sin(n) * 43758.5453); }
    void main() {
      vColor = color;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      float slice = floor(uTime * 22.0);                       // the glitch changes in steps, not smoothly
      float g = hash(seed + slice * 1.37);
      vTear = step(0.9, g);                                    // ~1 in 10: torn into a scanline dash
      vSplit = 0.08 + 0.22 * step(0.72, hash(seed * 0.7 + slice));
      gl_Position = projectionMatrix * mv;
      // a sideways jump in screen space for a few sparks at a time
      gl_Position.x += (hash(seed + slice) - 0.5) * 0.06 * step(0.82, hash(seed * 3.1 + slice)) * gl_Position.w;
      float flicker = mix(1.0, 0.25, step(0.93, hash(seed * 1.9 + slice)));
      vColor *= flicker;
      gl_PointSize = uSize * uScale / -mv.z * (1.0 + 2.2 * vTear);
    }`,
  fragmentShader: /* glsl */`
    varying vec3 vColor;
    varying float vTear, vSplit;
    float spark(vec2 p) { float d = dot(p, p); return exp(-d * 22.0) + 0.6 * exp(-d * 5.0); }
    void main() {
      vec2 p = gl_PointCoord - 0.5;
      vec3 c;
      if (vTear > 0.5) {
        // a horizontal neon dash with its channels torn apart
        float row = smoothstep(0.07, 0.0, abs(p.y));
        float len = smoothstep(0.5, 0.2, abs(p.x));
        c = vec3(row * smoothstep(0.5, 0.2, abs(p.x - 0.06)), row * len, row * smoothstep(0.5, 0.2, abs(p.x + 0.06))) * vColor * 1.4;
      } else {
        // red, green and blue drawn a little apart: a chromatic fringe round a white-hot core
        float r = spark(p - vec2(vSplit * 0.25, 0.0)), gch = spark(p), b = spark(p + vec2(vSplit * 0.25, 0.0));
        c = vec3(r, gch, b) * vColor + vec3(exp(-dot(p, p) * 90.0)) * length(vColor) * 0.6;
      }
      if (max(c.r, max(c.g, c.b)) < 0.004) discard;
      gl_FragColor = vec4(c, 1.0);
    }`,
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
}), CLS.fx);
const cloud = new THREE.Points(geo, cloudMat); cloud.frustumCulled = false; root.add(cloud);

/** each spark: its start delay, starting angle, how wide its turn is, how fast it spins and its colour */
const seeds = Array.from({ length: SPARKS }, () => ({ d: 0, a: 0, r: 0, spin: 0, c: NEON, k: 1 }));
let t = -1, big = false, used = SPARKS;
const _buf = new THREE.Vector2();

function play(milestone: boolean, top: boolean) {
  t = 0; big = milestone || top;
  used = big ? SPARKS : 110;
  const accent = top ? PEARL : milestone ? EMBER : AMBER;
  for (let i = 0; i < SPARKS; i++) {
    const s = seeds[i];
    s.d = Math.pow(Math.random(), 1.3) * SPREAD;
    s.a = Math.random() * Math.PI * 2;
    s.r = 0.55 + Math.random() * 0.5;
    s.spin = (9 + Math.random() * 5) * (big ? 1.1 : 1);
    s.c = Math.random() < 0.15 ? HOT : Math.random() < (big ? 0.3 : 0.18) ? accent : NEON;
    s.k = 0.9 + Math.random() * 0.6;
  }
  root.visible = true;
  sfx.levelUp(big);
  // the whirl reaches the sky: a glint over the land as the number appears
  setTimeout(() => { if (!state.dead) skyFlash(big ? 0.16 : 0.08); }, REVEAL_MS);
}

/** where a spark is `u` (0..1) of the way up its climb: a funnel that widens and spins as it rises */
function whirl(i: number, u: number, out: Float32Array, at: number) {
  const s = seeds[i], climb = u * u * (1.6 - 0.6 * u);          // quick lift-off, still accelerating at the top
  const y = HEAD + climb * SKY;
  const r = s.r * (1 + climb * 2.4) * (big ? 1.25 : 1);
  const a = s.a + u * s.spin;
  out[at] = Math.cos(a) * r; out[at + 1] = y; out[at + 2] = Math.sin(a) * r;
}

export function updateLevelFx(dt: number) {
  // the living legend (level 100) leaves a faint golden haze over the head
  if (hasPerk('leyenda') && !state.dead && Math.random() < dt * 4) {
    const a = Math.random() * Math.PI * 2, r = 0.25 + Math.random() * 0.3;
    burst(new THREE.Vector3(player.pos.x + Math.cos(a) * r, player.pos.y + HEAD + Math.random() * 0.4, player.pos.z + Math.sin(a) * r), GOLD, 2, 0.8, 0.06);
  }
  if (t < 0) return;
  t += dt;
  if (t >= DUR) { t = -1; root.visible = false; return; }
  root.position.set(player.pos.x, player.pos.y, player.pos.z);
  cloudMat.uniforms.uTime.value = state.time;
  cloudMat.uniforms.uScale.value = renderer.getDrawingBufferSize(_buf).y * 0.5;
  for (let i = 0; i < SPARKS; i++) {
    const s = seeds[i], u = (t - s.d) / RISE;
    for (let k = 0; k < TRAIL; k++) {
      const j = (i * TRAIL + k) * 3, uk = u - k * 0.035;          // the streak: the same spark a moment earlier
      if (i >= used || uk <= 0 || uk >= 1) { pos[j + 1] = -50; col[j] = col[j + 1] = col[j + 2] = 0; continue; }
      whirl(i, uk, pos, j);
      // bright at the head of the streak, fading along its tail; glows in, burns out near the sky
      const life = Math.min(1, uk / 0.12) * Math.min(1, (1 - uk) / 0.25);
      const b = 1.3 * s.k * life * (1 - k / TRAIL);
      const c = k === 0 && uk > 0.15 ? HOT : s.c;
      col[j] = c.r * b; col[j + 1] = c.g * b; col[j + 2] = c.b * b;
    }
  }
  geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
}

// ------------------------------------------------------------ the banner
const banner = document.createElement('div');
banner.id = 'levelup'; banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite');
const flash = document.createElement('div'); flash.id = 'levelup-flash';
document.body.append(flash, banner);
let hideT = 0, revealT = 0;

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const gearName = (id: string) => WEAPONS.find(w => w.id === id)?.name ?? ARMORS.find(a => a.id === id)?.name ?? id;
/** gear for the class you play (its own weapons, classes.ts canWield; armour for every class) */
const forYou = (id: string) => { const w = WEAPONS.find(x => x.id === id); return !w || canWield(w); };

function show(e: LevelUp, milestone: boolean, top: boolean) {
  const kind = top ? 'legend' : milestone ? 'milestone' : 'normal';
  const lines: string[] = [];
  lines.push(`<span class="lu-pts">+${e.points} ${e.points === 1 ? 'punto' : 'puntos'} para atributos y técnicas</span> <kbd>I</kbd> <kbd>U</kbd>`);
  lines.push(`<span class="lu-mon">+${e.mon} mon</span>${e.heal > 0 ? ` · <span class="lu-heal">+${e.heal} vida</span>` : ''}${e.jade ? ` · <span class="lu-jade">+${e.jade} ${e.jade === 1 ? 'sello' : 'sellos'} de jade</span>` : ''}`);
  // a big jump (several levels at once) would list too much: the latest few, and the rest in the U menu
  const perks = e.perks.slice(-3), items = e.items.filter(forYou), shownItems = items.slice(-3);
  for (const p of perks) lines.push(`<span class="lu-perk">★ NUEVA HABILIDAD · ${esc(p.name)}</span><i>${esc(p.desc)}</i>`);
  for (const id of shownItems) lines.push(`<span class="lu-item">⚔ MASA YA TE VENDE · ${esc(gearName(id))}</span>`);
  const more = e.perks.length - perks.length + items.length - shownItems.length;
  if (more > 0) lines.push(`<i>y ${more} ${more === 1 ? 'desbloqueo' : 'desbloqueos'} más · míralos con <kbd>U</kbd></i>`);
  const jump = e.to - e.from > 1 ? `<div class="lu-jump">+${e.to - e.from} niveles</div>` : '';
  banner.className = ''; void banner.offsetWidth;   // restart the animations
  banner.dataset.kind = kind;
  banner.innerHTML =
    `<div class="lu-kanji">${top ? '極' : milestone ? '段' : '昇'}</div>` +
    `<div class="lu-title">${top ? 'NIVEL MÁXIMO' : milestone ? '— HITO —' : 'SUBES DE NIVEL'}</div>` +
    `<div class="lu-num" data-n="${e.to}">${e.to}</div>` + jump +
    `<div class="lu-rule"><span></span>◆<span></span></div>` +
    `<div class="lu-lines">${lines.map((l, i) => `<div style="animation-delay:${0.3 + i * 0.09}s">${l}</div>`).join('')}</div>`;
  banner.classList.add('on');
  flash.dataset.kind = kind; flash.className = ''; void flash.offsetWidth; flash.classList.add('on');
  document.body.classList.add('leveling');
  clearTimeout(hideT);
  const stay = 2600 + lines.length * 380 + (top ? 1500 : 0);
  hideT = window.setTimeout(() => {
    banner.classList.add('out');
    hideT = window.setTimeout(() => { banner.className = ''; document.body.classList.remove('leveling'); }, 500);
  }, stay);
}

onLevelUp(e => {
  const top = e.to >= MAX_LEVEL;
  const milestone = Array.from({ length: e.to - e.from }, (_, i) => e.from + 1 + i).some(isMilestone);
  play(milestone, top);
  // the number appears as the whirl reaches the sky
  clearTimeout(revealT);
  revealT = window.setTimeout(() => show(e, milestone, top), REVEAL_MS);
});
