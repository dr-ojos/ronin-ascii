// The level-up celebration (progression.ts onLevelUp): in the world, a beam of light drops from the sky onto
// the ronin, a pillar opens round them, rings of light climb their body, motes spiral up and the ground rings
// out; on screen, a banner with the new level, what it brought and what it opened. Every tenth level is a
// milestone (red and gold, more of everything) and level 100 is white gold.
import * as THREE from 'three';
import { scene } from './renderer';
import { CLS, tagMat } from './materials';
import { burst, impactRing } from './fx';
import { flare } from './flare';
import { skyFlash } from './special';
import { sfx } from './sfx';
import { player, state } from './state';
import { WEAPONS } from './weapons';
import { canWield } from './classes';
import { ARMORS } from './armor';
import { hasPerk, isMilestone, MAX_LEVEL, onLevelUp, type LevelUp } from './progression';

const GOLD = 0xffd27a, EMBER = 0xff5a4a, WHITE = 0xfff6e0;
const add = THREE.AdditiveBlending;
const glowMat = (color: number) => tagMat(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, blending: add, side: THREE.DoubleSide }), CLS.fx);

// ------------------------------------------------------------ the world effect (built once, shown when needed)
const root = new THREE.Group(); root.visible = false; scene.add(root);
const pillarGeo = new THREE.CylinderGeometry(1, 1.25, 16, 32, 1, true).translate(0, 8, 0);
const pillarMat = glowMat(GOLD), coreMat = glowMat(WHITE);
const pillar = new THREE.Mesh(pillarGeo, pillarMat), core = new THREE.Mesh(pillarGeo, coreMat);
root.add(pillar, core);
const ringGeo = new THREE.RingGeometry(0.92, 1.12, 56).rotateX(-Math.PI / 2);
const rings = Array.from({ length: 4 }, (_, i) => {
  const mat = glowMat(i % 2 ? WHITE : GOLD), m = new THREE.Mesh(ringGeo, mat);
  root.add(m); return { m, mat, delay: i * 0.16 };
});
// motes climbing in a double helix
const MOTES = 90;
const motePos = new Float32Array(MOTES * 3);
const moteGeo = new THREE.BufferGeometry(); moteGeo.setAttribute('position', new THREE.BufferAttribute(motePos, 3));
const moteMat = tagMat(new THREE.PointsMaterial({ color: GOLD, size: 0.17, transparent: true, opacity: 0, depthWrite: false, blending: add }), CLS.fx);
const motes = new THREE.Points(moteGeo, moteMat); motes.frustumCulled = false; root.add(motes);
const moteSeed = Array.from({ length: MOTES }, (_, i) => ({ a: (i % 2) * Math.PI + Math.random() * 0.6, d: Math.random() * 0.9, r: 0.7 + Math.random() * 0.6, s: 0.8 + Math.random() * 0.6 }));

const DUR = 2.4;
let t = -1, big = false, legend = false;

function play(milestone: boolean, top: boolean) {
  t = 0; big = milestone || top; legend = top;
  const main = top ? WHITE : GOLD, accent = top ? GOLD : milestone ? EMBER : WHITE;
  pillarMat.color.set(main); coreMat.color.set(accent); moteMat.color.set(main);
  rings.forEach((r, i) => r.mat.color.set(i % 2 ? accent : main));
  root.visible = true;
  const chest = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
  // a beam drops from the sky first (the flare's aviso), then the star opens over the ronin
  flare(chest, main, { size: big ? 3 : 2.2, pre: 0.22, life: big ? 1.4 : 1.0, lift: 0.6 });
  setTimeout(() => {
    if (state.dead) return;
    const at = new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z);
    burst(at, main, big ? 220 : 140, big ? 11 : 9, 0.18);
    burst(at, accent, big ? 90 : 60, 6, 0.12);
    impactRing(player.pos, main, big ? 9 : 6.5);
    setTimeout(() => impactRing(player.pos, accent, big ? 13 : 9), 140);
    if (big) setTimeout(() => { impactRing(player.pos, main, 16); burst(at, main, 120, 13, 0.2); }, 320);
    skyFlash(big ? 0.6 : 0.4);
    state.shake = Math.max(state.shake, big ? 0.75 : 0.45);
    state.hitStop = Math.max(state.hitStop, big ? 0.3 : 0.18);   // a heartbeat of slow motion
  }, 220);
}

const ease = (x: number) => 1 - Math.pow(1 - x, 3);
export function updateLevelFx(dt: number) {
  // the living legend (level 100) walks in a faint golden haze
  if (hasPerk('leyenda') && !state.dead && Math.random() < dt * 5) {
    const a = Math.random() * Math.PI * 2, r = 0.4 + Math.random() * 0.5;
    burst(new THREE.Vector3(player.pos.x + Math.cos(a) * r, player.pos.y + 0.3 + Math.random() * 1.4, player.pos.z + Math.sin(a) * r), GOLD, 3, 1.2, 0.07);
  }
  if (t < 0) return;
  t += dt;
  const k = t / DUR;
  if (k >= 1) { t = -1; root.visible = false; return; }
  root.position.set(player.pos.x, player.pos.y + 0.02, player.pos.z);
  // pillar: opens wide fast, holds, then thins to a thread and fades
  const open = ease(Math.min(1, t / 0.35)), close = Math.max(0, (k - 0.45) / 0.55);
  const w = (big ? 1.6 : 1.2) * open * (1 - close * 0.9);
  pillar.scale.set(w, 0.4 + 0.6 * open, w);
  core.scale.set(w * 0.35, 0.4 + 0.6 * open, w * 0.35);
  pillar.rotation.y += dt * 2;
  pillarMat.opacity = (big ? 0.55 : 0.42) * open * (1 - close);
  coreMat.opacity = 0.8 * open * (1 - close) * (0.85 + 0.15 * Math.sin(t * 40));
  // rings: climb the body, widen and fade, one after another
  for (const r of rings) {
    const p = Math.max(0, Math.min(1, (t - 0.2 - r.delay) / 1.1));
    r.m.position.y = 0.05 + ease(p) * (big ? 3.6 : 2.6);
    r.m.scale.setScalar(1.6 - ease(p) * 0.9 + (legend ? 0.3 : 0));
    r.mat.opacity = p > 0 && p < 1 ? Math.sin(p * Math.PI) * 0.9 : 0;
  }
  // motes: a double helix that climbs and narrows
  for (let i = 0; i < MOTES; i++) {
    const s = moteSeed[i], p = Math.max(0, Math.min(1, (t - 0.15 - s.d) / (1.2 * s.s)));
    const a = s.a + p * 9, r = s.r * (1 - p * 0.65) * (big ? 1.3 : 1);
    motePos[i * 3] = Math.cos(a) * r; motePos[i * 3 + 1] = p * (big ? 5.5 : 4.2); motePos[i * 3 + 2] = Math.sin(a) * r;
  }
  moteGeo.attributes.position.needsUpdate = true;
  moteMat.opacity = Math.min(1, t / 0.2) * (1 - close);
}

// ------------------------------------------------------------ the banner
const banner = document.createElement('div');
banner.id = 'levelup'; banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite');
const flash = document.createElement('div'); flash.id = 'levelup-flash';
document.body.append(flash, banner);
let hideT = 0;

const esc = (s: string) => s.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const gearName = (id: string) => WEAPONS.find(w => w.id === id)?.name ?? ARMORS.find(a => a.id === id)?.name ?? id;
/** gear for the class you play (its own weapons, classes.ts canWield; armour for every class) */
const forYou = (id: string) => { const w = WEAPONS.find(x => x.id === id); return !w || canWield(w); };

function show(e: LevelUp, milestone: boolean, top: boolean) {
  const kind = top ? 'legend' : milestone ? 'milestone' : 'normal';
  const lines: string[] = [];
  lines.push(`<span class="lu-pts">+${e.points} puntos de atributo</span> <kbd>U</kbd>`);
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
    `<div class="lu-lines">${lines.map((l, i) => `<div style="animation-delay:${0.55 + i * 0.16}s">${l}</div>`).join('')}</div>`;
  banner.classList.add('on');
  flash.dataset.kind = kind; flash.className = ''; void flash.offsetWidth; flash.classList.add('on');
  document.body.classList.add('leveling');
  clearTimeout(hideT);
  const stay = 3200 + lines.length * 450 + (top ? 1500 : 0);
  hideT = window.setTimeout(() => {
    banner.classList.add('out');
    hideT = window.setTimeout(() => { banner.className = ''; document.body.classList.remove('leveling'); }, 700);
  }, stay);
}

onLevelUp(e => {
  const top = e.to >= MAX_LEVEL;
  const milestone = Array.from({ length: e.to - e.from }, (_, i) => e.from + 1 + i).some(isMilestone);
  play(milestone, top);
  sfx.levelUp(milestone || top);
  show(e, milestone, top);
});
