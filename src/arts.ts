// The newer techniques. Every class has a second one of its own, on J from the first run:
//   Iaijutsu del Relámpago (ronin)  one flash 12 m ahead; the cut lands on everyone in the way as the blade is sheathed
//   Rueda del Dharma (sōhei)        the staff spins, drags the onis in, keeps striking, then throws them back
//   Palma del Buda (xiákè)          a golden palm falls from the sky ahead and crushes all under it
//   Lluvia de Flechas (hwarang)     arrows rain on the nearest onis for a couple of seconds
// and four more are taught at the temples for jade seals:
//   Ojo del Tifón (Viento)          a tornado walks ahead, pulling onis in and battering them
//   Lluvia de Meteoros (Brasas)     six burning stones fall on the onis around you
//   Aliento Glacial (Marea)         a freezing breath in a fan: the onis stand frozen, then the ice shatters
//   Grieta del Trueno (Rayo)        a crack runs over the ground and fangs of rock throw the onis aside
// All damage goes through specialDamage (its cap per enemy and cast keeps the katana needed).
import * as THREE from 'three';
import { scene } from './renderer';
import { sam } from './avatar';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { burst, dashGhost, dashRing } from './fx';
import { flare } from './flare';
import { sparkBurst } from './katana-fx';
import { CLS, tagMat } from './materials';
import { collide } from './physics';
import { panOf, sfx } from './sfx';
import { specialDamage } from './special-damage';
import { player, state } from './state';
import { surfaceY } from './structures';
import { TECHNIQUES, type TechniqueId } from './techniques';
import type { Enemy } from './types';
import { dmgMult } from './upgrades';
import { rnd } from './utils';

export type ArtId = 'iai' | 'rueda' | 'palma' | 'flechas' | 'tornado' | 'meteoro' | 'hielo' | 'tierra';
const ART_IDS: readonly string[] = ['iai', 'rueda', 'palma', 'flechas', 'tornado', 'meteoro', 'hielo', 'tierra'];
export const isArt = (id: TechniqueId): id is ArtId => ART_IDS.includes(id);
const color = (id: ArtId) => TECHNIQUES[id].color;

// ------------------------------------------------------------ shared pieces
const BOX = new THREE.BoxGeometry(1, 1, 1);
const RING = new THREE.RingGeometry(0.86, 1, 48);
const TORUS = new THREE.TorusGeometry(1, 0.07, 5, 28);
const ROCK = new THREE.IcosahedronGeometry(1, 0);
const ICE = new THREE.OctahedronGeometry(1, 0);
const FANG = new THREE.ConeGeometry(0.42, 1.9, 5);
const stone = tagMat(new THREE.MeshStandardMaterial({ color: 0x80705c, roughness: 0.95, flatShading: true }), CLS.ground);
const glow = (c: THREE.ColorRepresentation, opacity = 1) => tagMat(new THREE.MeshBasicMaterial({
  color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }), CLS.fx);
const arrowMat = glow(0xfff0f6, 0.95), arrowHeadMat = glow(TECHNIQUES.flechas.color, 1);

/** something seen for a while: `mats` are its own (disposed with it), `tick` animates it, `end` runs as it goes */
interface Prop { obj: THREE.Object3D; mats: THREE.Material[]; t: number; life: number; tick?: (p: Prop, dt: number) => void; end?: () => void }
const props: Prop[] = [];
/** a cast still at work: false when it is over */
const actives: ((dt: number) => boolean)[] = [];
const later: { t: number; fn: () => void }[] = [];
const burning = new Map<Enemy, { ticks: number; t: number }>();

function addProp(obj: THREE.Object3D, mats: THREE.Material[], life: number, tick?: Prop['tick'], end?: () => void) {
  scene.add(obj);
  const p: Prop = { obj, mats, t: 0, life, tick, end };
  props.push(p);
  return p;
}
function removeProp(p: Prop) { scene.remove(p.obj); for (const m of p.mats) m.dispose(); }
const after = (t: number, fn: () => void) => later.push({ t, fn });

const alive = (e: Enemy) => e.hp > 0 && enemies.includes(e);
const flatDist = (e: Enemy, x: number, z: number) => Math.hypot(e.g.position.x - x, e.g.position.z - z);
const near = (x: number, z: number, r: number) => enemies.filter(e => e.hp > 0 && flatDist(e, x, z) < r + 0.4 * e.scale);
const nearest = (r: number, n: number) => enemies.filter(e => e.hp > 0 && flatDist(e, player.pos.x, player.pos.z) < r)
  .sort((a, b) => flatDist(a, player.pos.x, player.pos.z) - flatDist(b, player.pos.x, player.pos.z)).slice(0, n);
const chest = (e: Enemy) => new THREE.Vector3(e.g.position.x, e.g.position.y + 1.1 * e.scale, e.g.position.z);
const ahead = () => new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face));
const ground = (x: number, z: number) => new THREE.Vector3(x, surfaceY(x, z), z);

/** one blow of a technique: wounds (capped), dazes (less the heavy ones) and pushes along `push` */
function strike(id: ArtId, e: Enemy, dmg: number, stagger: number, push?: THREE.Vector3, force = 0) {
  state.casting = id;   // the rank of this technique sets the damage
  specialDamage(e, dmg * dmgMult()); e.flash = 1; provoke(e);
  if (e.state !== 'return' && stagger > 0) staggerEnemy(e, e.big ? stagger * 0.45 : stagger);
  if (push && force) e.knock.set(push.x, 0, push.z).normalize().multiplyScalar(force / (e.big ? 2.6 : 1));
}
/** a ring of light on the ground that opens out to `r` and fades */
function groundRing(at: THREE.Vector3, c: THREE.ColorRepresentation, r: number, life = 0.5, opacity = 0.8) {
  const mat = glow(c, opacity), m = new THREE.Mesh(RING, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(at.x, surfaceY(at.x, at.z) + 0.1, at.z);
  addProp(m, [mat], life, p => { const k = p.t / p.life; m.scale.setScalar(0.2 + r * (1 - (1 - k) ** 3)); mat.opacity = opacity * (1 - k); });
}

/** P or J with one of these equipped (special.ts) */
export function startArt(id: ArtId) {
  // the body's motion: a cut, a thrust or the heavy blow (the blade itself does no harm: hitDone)
  const combo = { iai: 2, rueda: 0, palma: 2, flechas: 1, tornado: 0, meteoro: 2, hielo: 1, tierra: 3 }[id];
  Object.assign(player, { combo, attackT: 0, attackDur: id === 'iai' ? 0.3 : 0.55, hitDone: true, invuln: Math.max(player.invuln, 0.5) });
  state.hitStop = Math.max(state.hitStop, 0.06);
  ({ iai: startIai, rueda: startRueda, palma: startPalma, flechas: startFlechas,
    tornado: startTornado, meteoro: startMeteoro, hielo: startHielo, tierra: startTierra })[id]();
}

// ------------------------------------------------------------ Iaijutsu del Relámpago
const IAI_LEN = 12, IAI_TIME = 0.16, IAI_SHEATH = 0.42;

function startIai() {
  const from = player.pos.clone(), dir = ahead();
  // the nearest oni more or less ahead decides the line; the flash goes on a couple of metres past it
  let target: Enemy | null = null, best = IAI_LEN + 2;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const dx = e.g.position.x - from.x, dz = e.g.position.z - from.z, d = Math.hypot(dx, dz);
    if (d > 0.4 && d < best && (dx * dir.x + dz * dir.z) / d > 0.3) { best = d; target = e; }
  }
  if (target) dir.set(target.g.position.x - from.x, 0, target.g.position.z - from.z).normalize();
  const to = from.clone().addScaledVector(dir, target ? Math.min(IAI_LEN, best + 2.2) : IAI_LEN);
  player.face = Math.atan2(dir.x, dir.z);
  player.dancing = true;
  player.invuln = Math.max(player.invuln, IAI_TIME + IAI_SHEATH + 0.3);
  dashRing(from); sfx.dash();
  let t = 0, ghost = 0;
  const before = new THREE.Vector3();
  actives.push(dt => {
    t += dt;
    const k = Math.min(1, t / IAI_TIME), ease = 1 - (1 - k) ** 3;
    before.copy(player.pos);
    player.pos.lerpVectors(from, to, ease);
    collide(player.pos, 0.45);
    player.pos.y = surfaceY(player.pos.x, player.pos.z);
    ghost -= Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
    while (ghost <= 0) { ghost += 0.6; dashGhost(player.pos, player.face, 0.8); }
    sam.root.position.copy(player.pos); sam.root.rotation.y = player.face;
    if (k < 1) return true;
    player.dancing = false;
    sheath(from, player.pos.clone());
    return false;
  });
}

function sheath(a: THREE.Vector3, b: THREE.Vector3) {
  const c = color('iai'), dx = b.x - a.x, dz = b.z - a.z, len = Math.max(0.1, Math.hypot(dx, dz));
  // the path stays drawn in the air as a thread of light
  const mat = glow(c, 1), line = new THREE.Mesh(BOX, mat);
  line.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 1.1, (a.z + b.z) / 2);
  line.rotation.y = Math.atan2(dx, dz); line.scale.set(0.06, 0.06, len);
  addProp(line, [mat], IAI_SHEATH + 0.4, p => {
    const k = p.t / p.life; mat.opacity = 1 - k * k; line.scale.x = line.scale.y = 0.06 + k * 0.3;
  });
  const victims = enemies.filter(e => {
    if (e.hp <= 0) return false;
    const p = e.g.position, s = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len)));
    return Math.hypot(p.x - a.x - dx * s, p.z - a.z - dz * s) < 2 + 0.4 * e.scale;
  });
  for (const e of victims.slice(0, 6)) flare(e.g.position, c, { pre: IAI_SHEATH, life: 0, lift: 1.1 * e.scale, follow: true });
  sfx.swing({ power: 1.7, pan: 0 });
  after(IAI_SHEATH, () => {
    // the click of the guard against the scabbard: everyone in the way is cut at once
    let hits = 0;
    for (const e of victims) {
      if (!alive(e)) continue;
      const p = e.g.position, side = Math.sign((p.x - a.x) * dz - (p.z - a.z) * dx) || 1;
      strike('iai', e, 11, 1.7, new THREE.Vector3(dz * side, 0, -dx * side), 4);
      const at = chest(e);
      burst(at, 0xffffff, 34, 6, 0.14); burst(at, 0xff3a2a, 14, 4, 0.12); sparkBurst(at, 12, 6);
      flare(at, c, { size: 0.9, life: 0.45 });
      hits++;
    }
    if (hits) { sfx.hit({ heavy: true, pan: 0, count: hits }); state.hitStop = Math.max(state.hitStop, 0.14); state.shake = Math.max(state.shake, 0.5); }
    else sfx.rings(0);
  });
}

// ------------------------------------------------------------ Rueda del Dharma
const WHEEL_TIME = 2.4, WHEEL_PULSE = 0.3, WHEEL_PULL = 8, WHEEL_HIT = 2.8;

function startRueda() {
  const c = color('rueda');
  // the staff spun so fast it is a wheel of eight spokes, and the reach drawn on the ground
  const wheel = new THREE.Group(), mat = glow(c, 0.85), rim = glow(c, 0.5);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, spoke = new THREE.Mesh(BOX, mat);
    spoke.scale.set(0.1, 0.1, 1.5); spoke.position.set(Math.sin(a) * 0.85, 0, Math.cos(a) * 0.85); spoke.rotation.y = a;
    wheel.add(spoke);
  }
  const hoop = new THREE.Mesh(TORUS, rim); hoop.rotation.x = Math.PI / 2; hoop.scale.setScalar(1.7); wheel.add(hoop);
  const reachMat = glow(c, 0.22), reach = new THREE.Mesh(RING, reachMat);
  reach.rotation.x = -Math.PI / 2; reach.scale.setScalar(WHEEL_PULL);
  addProp(wheel, [mat, rim], WHEEL_TIME + 0.25, (p, dt) => {
    wheel.position.set(player.pos.x, player.pos.y + 1.05, player.pos.z);
    wheel.rotation.y += dt * 16;
    const k = p.t > WHEEL_TIME ? 1 - (p.t - WHEEL_TIME) / 0.25 : Math.min(1, p.t / 0.15);
    mat.opacity = 0.85 * k; rim.opacity = 0.5 * k; wheel.scale.setScalar(0.5 + 0.5 * k);
  });
  addProp(reach, [reachMat], WHEEL_TIME, p => {
    reach.position.set(player.pos.x, surfaceY(player.pos.x, player.pos.z) + 0.1, player.pos.z);
    reachMat.opacity = 0.22 * (0.6 + 0.4 * Math.sin(p.t * 20));
  });
  sfx.rings(0);
  let t = 0, next = 0, swing = 0;
  actives.push(dt => {
    t += dt;
    if ((swing -= dt) <= 0 && t < WHEEL_TIME) {
      swing = 0.45;
      Object.assign(player, { combo: Math.floor(Math.random() * 3), attackT: 0, attackDur: 0.45, hitDone: true });
      sfx.swing({ power: 0.8, pan: rnd(-0.3, 0.3) });
    }
    while (t >= next && next < WHEEL_TIME) { next += WHEEL_PULSE; wheelPulse(c); }
    if (t < WHEEL_TIME) return true;
    // the last turn throws them all back
    let hits = 0;
    for (const e of near(player.pos.x, player.pos.z, WHEEL_PULL)) {
      strike('rueda', e, 3.5, 1.6, new THREE.Vector3(e.g.position.x - player.pos.x, 0, e.g.position.z - player.pos.z), 12);
      burst(chest(e), c, 18, 5, 0.14); hits++;
    }
    groundRing(player.pos, c, WHEEL_PULL + 1, 0.5);
    burst(player.pos.clone().setY(player.pos.y + 1), c, 70, 7, 0.17);
    flare(player.pos.clone().setY(player.pos.y + 2.3), c, { size: 1.2, life: 0.55 });
    sfx.taiko(1.1); if (hits) sfx.hit({ heavy: true, pan: 0, count: hits });
    state.shake = Math.max(state.shake, 0.5);
    return false;
  });
}

function wheelPulse(c: number) {
  let hits = 0, pan = 0;
  for (const e of near(player.pos.x, player.pos.z, WHEEL_PULL)) {
    const p = e.g.position, d = flatDist(e, player.pos.x, player.pos.z);
    const pull = new THREE.Vector3(player.pos.x - p.x, 0, player.pos.z - p.z);
    if (d > 1.6) e.knock.copy(pull.normalize().multiplyScalar(e.big ? 3 : 7.5));
    provoke(e);
    if (d < WHEEL_HIT + 0.4 * e.scale) {
      strike('rueda', e, 1.3, 0.45);
      burst(chest(e), c, 10, 4, 0.12);
      hits++; pan += panOf(p.x, p.z);
    }
  }
  if (hits) { sfx.hit({ heavy: false, pan: pan / hits, count: hits }); state.shake = Math.max(state.shake, 0.15); }
}

// ------------------------------------------------------------ Palma del Buda
const PALM_AHEAD = 6, PALM_REACH = 10, PALM_R = 5.5, PALM_FALL = 0.42;

function palmMesh(mat: THREE.Material) {
  const g = new THREE.Group();
  const part = (w: number, h: number, l: number, x: number, z: number, ry = 0) => {
    const m = new THREE.Mesh(BOX, mat); m.scale.set(w, h, l); m.position.set(x, 0, z); m.rotation.y = ry; g.add(m);
  };
  part(3.4, 0.55, 3.6, 0, 0);                                         // the palm, face down
  [-1.25, -0.42, 0.42, 1.25].forEach((x, i) => part(0.68, 0.48, i === 0 || i === 3 ? 2.3 : 2.7, x, 3.0 + (i === 0 || i === 3 ? -0.2 : 0)));
  part(0.75, 0.5, 2.0, 2.15, 0.9, -0.6);                              // the thumb
  part(2.6, 0.5, 1.6, 0, -2.4);                                       // the wrist
  return g;
}

function startPalma() {
  const c = color('palma'), dir = ahead();
  // it falls on the nearest oni ahead (up to 10 m), or 6 m in front with nobody there
  let reach = PALM_AHEAD, best = PALM_REACH;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const dx = e.g.position.x - player.pos.x, dz = e.g.position.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 0.5 && d < best && (dx * dir.x + dz * dir.z) / d > 0.5) { best = d; reach = Math.max(3, d); dir.set(dx / d, 0, dz / d); }
  }
  player.face = Math.atan2(dir.x, dir.z);
  const at = ground(player.pos.x + dir.x * reach, player.pos.z + dir.z * reach);
  flare(at, c, { pre: PALM_FALL, life: 0, lift: 0.3 });
  groundRing(at, c, PALM_R, PALM_FALL, 0.35);
  const mat = glow(c, 0.9), halo = glow(0xffffff, 0.35), palm = palmMesh(mat), shine = palmMesh(halo);
  shine.scale.setScalar(1.12); palm.add(shine);
  palm.rotation.y = player.face;
  palm.position.set(at.x, at.y + 18, at.z);
  addProp(palm, [mat, halo], PALM_FALL + 0.7, p => {
    if (p.t < PALM_FALL) { const k = p.t / PALM_FALL; palm.position.y = at.y + 0.35 + 18 * (1 - k * k); return; }
    const k = (p.t - PALM_FALL) / 0.7;
    palm.position.y = at.y + 0.35; mat.opacity = 0.9 * (1 - k); halo.opacity = 0.35 * (1 - k);
  });
  sfx.swing({ power: 1.4, pan: 0 });
  after(PALM_FALL, () => {
    let hits = 0;
    for (const e of near(at.x, at.z, PALM_R)) {
      strike('palma', e, 9, 2, new THREE.Vector3(e.g.position.x - at.x, 0, e.g.position.z - at.z), 10);
      burst(chest(e), c, 22, 5, 0.14); hits++;
    }
    burst(at.clone().setY(at.y + 0.5), c, 120, 9, 0.18);
    burst(at.clone().setY(at.y + 0.3), 0x8a7a62, 50, 6, 0.2);
    flare(at.clone().setY(at.y + 1), c, { size: 1.45, life: 0.6 });
    groundRing(at, c, PALM_R + 1.5, 0.55);
    sfx.taiko(1.3); if (hits) sfx.hit({ heavy: true, pan: panOf(at.x, at.z), count: hits });
    state.shake = Math.max(state.shake, 0.9); state.hitStop = Math.max(state.hitStop, 0.1);
  });
}

// ------------------------------------------------------------ Lluvia de Flechas
const VOLLEY_TIME = 2.5, VOLLEY_EVERY = 0.055, VOLLEY_R = 4.5;

function startFlechas() {
  const centre = player.pos.clone().addScaledVector(ahead(), 8);
  const aim = () => {
    const ts = nearest(16, 4);
    if (!ts.length) return;
    centre.set(0, 0, 0);
    for (const e of ts) centre.add(e.g.position);
    centre.divideScalar(ts.length);
  };
  aim();
  // the arrows come down slanting from behind you
  const from = ahead().multiplyScalar(-6);
  flare(player.pos.clone().setY(player.pos.y + 2.4), color('flechas'), { size: 1, life: 0.5 });
  sfx.arrow(0);
  let t = 0, spawn = 0, retarget = 0.5, n = 0;
  actives.push(dt => {
    t += dt;
    if ((retarget -= dt) <= 0) { retarget = 0.5; aim(); }
    spawn -= dt;
    while (spawn <= 0 && t < VOLLEY_TIME) {
      spawn += VOLLEY_EVERY;
      const a = rnd(0, Math.PI * 2), r = VOLLEY_R * Math.sqrt(Math.random());
      arrow(ground(centre.x + Math.sin(a) * r, centre.z + Math.cos(a) * r), from, n++ % 6 === 0);
    }
    return t < VOLLEY_TIME;
  });
}

function arrow(to: THREE.Vector3, from: THREE.Vector3, loud: boolean) {
  const start = to.clone().add(from).setY(to.y + 14), fall = 0.3;
  const g = new THREE.Group(), shaft = new THREE.Mesh(BOX, arrowMat), head = new THREE.Mesh(BOX, arrowHeadMat);
  shaft.scale.set(0.035, 0.035, 1.05); head.scale.set(0.09, 0.09, 0.2); head.position.z = 0.55;
  g.add(shaft, head);
  g.position.copy(start); g.lookAt(to);
  const flight = to.clone().sub(start);
  addProp(g, [], fall + 0.7, p => {
    if (p.t < fall) { g.position.copy(start).addScaledVector(flight, p.t / fall); return; }
    g.position.copy(to).addScaledVector(flight, -0.28 / flight.length());   // stuck in the ground
    g.scale.setScalar(Math.max(0.01, 1 - Math.max(0, p.t - fall - 0.4) / 0.3));
  });
  if (loud) sfx.arrow(panOf(to.x, to.z));
  after(fall, () => {
    burst(to.clone().setY(to.y + 0.15), 0xd8c8b0, 4, 2, 0.1);
    let hits = 0;
    for (const e of near(to.x, to.z, 1.25)) { strike('flechas', e, 1.15, 0.35, flight, 2.5); burst(chest(e), color('flechas'), 8, 3, 0.12); hits++; }
    if (hits) sfx.hit({ heavy: false, pan: panOf(to.x, to.z), count: 1 });
  });
}

// ------------------------------------------------------------ Ojo del Tifón
const TWISTER_TIME = 3.5, TWISTER_SPEED = 5, TWISTER_PULL = 6.5, TWISTER_HIT = 2.4, TWISTER_EVERY = 0.25;

function startTornado() {
  const c = color('tornado'), dir = ahead(), pos = player.pos.clone().addScaledVector(dir, 2);
  const g = new THREE.Group(), mats = [glow(c, 0.6), glow(0xffffff, 0.35)];
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 8; i++) {
    const ring = new THREE.Mesh(TORUS, mats[i % 2]);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.2 + i * 0.55; ring.scale.setScalar(0.45 + i * 0.32);
    g.add(ring); rings.push(ring);
  }
  // a few streaks of wind winding up the funnel
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(BOX, mats[0]), a = i / 5 * Math.PI * 2;
    s.scale.set(0.06, 3.2, 0.06); s.position.set(Math.sin(a) * 1.2, 2.2, Math.cos(a) * 1.2); s.rotation.set(0.35 * Math.cos(a), 0, 0.35 * Math.sin(a));
    g.add(s);
  }
  addProp(g, mats, TWISTER_TIME + 0.35, (p, dt) => {
    g.position.set(pos.x, surfaceY(pos.x, pos.z), pos.z);
    g.rotation.y += dt * 11;
    rings.forEach((r, i) => { r.position.x = Math.sin(p.t * 6 + i * 0.8) * 0.12 * i; r.position.z = Math.cos(p.t * 5 + i) * 0.1 * i; });
    const k = p.t > TWISTER_TIME ? 1 - (p.t - TWISTER_TIME) / 0.35 : Math.min(1, p.t / 0.2);
    mats[0].opacity = 0.6 * k; mats[1].opacity = 0.35 * k; g.scale.set(1, 0.3 + 0.7 * k, 1);
  });
  flare(pos.clone().setY(pos.y + 2.5), c, { size: 1.1, life: 0.5 });
  sfx.swing({ power: 1.5, pan: 0 });
  let t = 0, next = 0, whoosh = 0;
  actives.push(dt => {
    t += dt;
    // it drifts towards the nearest oni in its path
    const prey = enemies.filter(e => e.hp > 0 && flatDist(e, pos.x, pos.z) < 9)
      .sort((a, b) => flatDist(a, pos.x, pos.z) - flatDist(b, pos.x, pos.z))[0];
    if (prey) dir.lerp(new THREE.Vector3(prey.g.position.x - pos.x, 0, prey.g.position.z - pos.z).normalize(), Math.min(1, dt * 2)).normalize();
    pos.addScaledVector(dir, TWISTER_SPEED * (prey && flatDist(prey, pos.x, pos.z) < 1.5 ? 0.3 : 1) * dt);
    for (let k = 0; k < 3; k++) {
      const a = rnd(0, Math.PI * 2), h = rnd(0, 4.5), r = 0.5 + h * 0.35;
      burst(new THREE.Vector3(pos.x + Math.sin(a) * r, surfaceY(pos.x, pos.z) + h, pos.z + Math.cos(a) * r), k ? c : 0xffffff, 2, 1.5, 0.1);
    }
    if ((whoosh -= dt) <= 0) { whoosh = 0.5; sfx.swing({ power: 0.7, pan: panOf(pos.x, pos.z) }); }
    while (t >= next && next < TWISTER_TIME) {
      next += TWISTER_EVERY;
      let hits = 0;
      for (const e of near(pos.x, pos.z, TWISTER_PULL)) {
        const d = flatDist(e, pos.x, pos.z);
        provoke(e);
        if (d > 1) e.knock.set(pos.x - e.g.position.x, 0, pos.z - e.g.position.z).normalize().multiplyScalar(e.big ? 3 : 8);
        if (d < TWISTER_HIT + 0.4 * e.scale) { strike('tornado', e, 1.2, 0.5); burst(chest(e), c, 8, 3, 0.12); hits++; }
      }
      if (hits) sfx.hit({ heavy: false, pan: panOf(pos.x, pos.z), count: hits });
    }
    return t < TWISTER_TIME;
  });
}

// ------------------------------------------------------------ Lluvia de Meteoros
const METEORS = 6, METEOR_RANGE = 16, METEOR_R = 3.5, METEOR_FALL = 0.45, BURN_TICKS = 3, BURN_EVERY = 0.6;

function startMeteoro() {
  const ts = nearest(METEOR_RANGE, METEORS);
  for (let i = 0; i < METEORS; i++) {
    const e = ts.length ? ts[i % ts.length] : null;
    after(0.12 + i * 0.2, () => {
      let at: THREE.Vector3;
      if (e && alive(e)) at = ground(e.g.position.x + rnd(-0.7, 0.7), e.g.position.z + rnd(-0.7, 0.7));
      else { const a = rnd(0, Math.PI * 2), r = rnd(4, 10); at = ground(player.pos.x + Math.sin(a) * r, player.pos.z + Math.cos(a) * r); }
      meteor(at);
    });
  }
  flare(player.pos.clone().setY(player.pos.y + 2.4), color('meteoro'), { size: 1.1, life: 0.5 });
  sfx.taiko(0.8);
  state.shake = Math.max(state.shake, 0.3);
}

function meteor(at: THREE.Vector3) {
  const c = color('meteoro');
  flare(at, c, { pre: METEOR_FALL, life: 0, lift: 0.3 });
  const core = glow(0xffd089, 1), fire = glow(c, 0.45), g = new THREE.Group();
  const rock = new THREE.Mesh(ROCK, core), mantle = new THREE.Mesh(ROCK, fire);
  rock.scale.setScalar(0.7); mantle.scale.setScalar(1.5); g.add(rock, mantle);
  const start = at.clone().add(new THREE.Vector3(rnd(-7, 7), 26, rnd(-7, 7)));
  g.position.copy(start);
  addProp(g, [core, fire], METEOR_FALL, (p, dt) => {
    g.position.lerpVectors(start, at, p.t / p.life);
    g.rotation.x += dt * 9; g.rotation.z += dt * 7;
    burst(g.position.clone(), Math.random() < 0.5 ? c : 0xffd089, 4, 1.5, 0.2);
  });
  after(METEOR_FALL, () => {
    let hits = 0;
    for (const e of near(at.x, at.z, METEOR_R)) {
      strike('meteoro', e, 6, 1, new THREE.Vector3(e.g.position.x - at.x, 0, e.g.position.z - at.z), 9);
      if (e.hp > 0) burning.set(e, { ticks: BURN_TICKS, t: BURN_EVERY });
      hits++;
    }
    burst(at.clone().setY(at.y + 0.5), c, 90, 9, 0.2);
    burst(at.clone().setY(at.y + 0.4), 0xffd089, 40, 6, 0.16);
    burst(at.clone().setY(at.y + 0.2), 0x4a4038, 30, 4, 0.2);
    flare(at.clone().setY(at.y + 0.6), c, { size: 1.2, life: 0.5 });
    groundRing(at, c, METEOR_R, 0.6);
    sfx.taiko(1.2); if (hits) sfx.hit({ heavy: true, pan: panOf(at.x, at.z), count: hits });
    state.shake = Math.max(state.shake, 0.6);
  });
}

// ------------------------------------------------------------ Aliento Glacial
const FROST_RANGE = 11, FROST_HALF = 0.9, FROST_TIME = 0.45, FROZEN = 3, FROZEN_BIG = 1.3;

function startHielo() {
  const c = color('hielo'), origin = player.pos.clone(), dir = ahead(), face = player.face, cos = Math.cos(FROST_HALF);
  const hit = new Set<Enemy>();
  burst(origin.clone().addScaledVector(dir, 1).setY(origin.y + 1.3), c, 50, 6, 0.15);
  flare(origin.clone().addScaledVector(dir, 2).setY(origin.y + 1.6), c, { size: 1.1, life: 0.5 });
  sfx.swing({ power: 1.2, pan: 0 }); sfx.rings(0);
  let t = 0;
  actives.push(dt => {
    const before = Math.min(1, t / FROST_TIME) * FROST_RANGE;
    t += dt;
    const r = Math.min(1, t / FROST_TIME) * FROST_RANGE;
    for (let k = 0; k < 8; k++) {
      const a = face + rnd(-FROST_HALF, FROST_HALF), x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r;
      burst(new THREE.Vector3(x, surfaceY(x, z) + rnd(0.2, 1.6), z), k % 3 ? c : 0xffffff, 3, 1.2, 0.14);
    }
    for (const e of enemies) {
      if (e.hp <= 0 || hit.has(e)) continue;
      const dx = e.g.position.x - origin.x, dz = e.g.position.z - origin.z, d = Math.hypot(dx, dz), pad = 0.45 * e.scale;
      if (d < before - pad || d > r + pad) continue;
      if (d > 1.2 && (dx * dir.x + dz * dir.z) / d < cos) continue;
      hit.add(e); freeze(e);
    }
    if (t < FROST_TIME) return true;
    if (hit.size) sfx.hit({ heavy: true, pan: 0, count: hit.size });
    return false;
  });
}

function freeze(e: Enemy) {
  const c = color('hielo');
  const hold = e.big ? FROZEN_BIG : FROZEN;
  strike('hielo', e, 3, hold / (e.big ? 0.45 : 1));
  e.knock.set(0, 0, 0);
  const mat = glow(c, 0.42), edge = glow(0xffffff, 0.2), g = new THREE.Group();
  const shell = new THREE.Mesh(ICE, mat), rime = new THREE.Mesh(ICE, edge);
  rime.scale.setScalar(1.08); rime.rotation.y = 0.5; g.add(shell, rime);
  g.scale.set(0.8 * e.scale, 1.3 * e.scale, 0.8 * e.scale);
  burst(chest(e), 0xffffff, 20, 4, 0.12);
  const prop = addProp(g, [mat, edge], hold, p => {
    if (!alive(e)) { p.t = p.life; return; }
    g.position.set(e.g.position.x, e.g.position.y + 1.05 * e.scale, e.g.position.z);
    mat.opacity = 0.42 + 0.08 * Math.sin(p.t * 9);
  }, () => {
    // the ice shatters and cuts once more
    burst(g.position.clone(), 0xffffff, 40, 6, 0.14); burst(g.position.clone(), c, 30, 5, 0.12);
    if (alive(e)) { strike('hielo', e, 3, 0.3); sfx.hit({ heavy: false, pan: panOf(e.g.position.x, e.g.position.z), count: 1 }); }
  });
  prop.obj.position.copy(chest(e));
}

// ------------------------------------------------------------ Grieta del Trueno
const CRACK_LEN = 18, CRACK_SPEED = 30, CRACK_STEP = 1.1, CRACK_W = 2.3;

function startTierra() {
  const c = color('tierra'), origin = player.pos.clone(), dir = ahead();
  const hit = new Set<Enemy>();
  burst(origin.clone().setY(origin.y + 0.3), 0x8a7a62, 50, 6, 0.2);
  groundRing(origin, c, 3, 0.4);
  sfx.taiko(1.1);
  state.shake = Math.max(state.shake, 0.5);
  let front = 0, nextFang = 1;
  actives.push(dt => {
    const before = front;
    front = Math.min(CRACK_LEN, front + CRACK_SPEED * dt);
    while (nextFang <= front) {
      const side = rnd(-0.5, 0.5);
      fang(ground(origin.x + dir.x * nextFang + dir.z * side, origin.z + dir.z * nextFang - dir.x * side), c);
      nextFang += CRACK_STEP;
    }
    let hits = 0;
    for (const e of enemies) {
      if (e.hp <= 0 || hit.has(e)) continue;
      const dx = e.g.position.x - origin.x, dz = e.g.position.z - origin.z, pad = 0.45 * e.scale;
      const along = dx * dir.x + dz * dir.z, side = dx * dir.z - dz * dir.x;
      if (along < before - pad || along > front + pad || along < -0.5 || Math.abs(side) > CRACK_W + pad) continue;
      hit.add(e);
      const s = Math.sign(side) || 1;
      strike('tierra', e, 7, 1.4, new THREE.Vector3(dir.z * s + dir.x * 0.4, 0, -dir.x * s + dir.z * 0.4), 8);
      const at = chest(e);
      burst(at, c, 20, 6, 0.15); sparkBurst(at, 14, 6);
      flare(at, 0xffe2a0, { size: 0.8, life: 0.4 });
      hits++;
    }
    if (hits) { sfx.hit({ heavy: true, pan: 0, count: hits }); state.shake = Math.max(state.shake, 0.35); }
    return front < CRACK_LEN;
  });
}

function fang(at: THREE.Vector3, c: number) {
  const m = new THREE.Mesh(FANG, stone), s = rnd(0.8, 1.35);
  m.scale.setScalar(s); m.rotation.set(rnd(-0.25, 0.25), rnd(0, Math.PI), rnd(-0.25, 0.25));
  const top = at.y + 0.85 * s, low = at.y - 1.2 * s;
  m.position.set(at.x, low, at.z);
  addProp(m, [], 1.1, p => {
    const k = p.t < 0.08 ? p.t / 0.08 : p.t > 0.8 ? 1 - (p.t - 0.8) / 0.3 : 1;
    m.position.y = low + (top - low) * k;
  });
  burst(at.clone().setY(at.y + 0.3), 0x8a7a62, 8, 4, 0.18);
  burst(at.clone().setY(at.y + 0.6), c, 5, 5, 0.1);
}

// ------------------------------------------------------------ every frame
export function updateArts(dt: number) {
  for (let i = later.length - 1; i >= 0; i--) { const l = later[i]; if ((l.t -= dt) <= 0) { later.splice(i, 1); l.fn(); } }
  for (let i = actives.length - 1; i >= 0; i--) if (!actives[i](dt)) actives.splice(i, 1);
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    p.t += dt;
    if (p.t < p.life) p.tick?.(p, dt);
    if (p.t >= p.life) { props.splice(i, 1); p.end?.(); removeProp(p); }
  }
  for (const [e, b] of burning) {
    if (!alive(e)) { burning.delete(e); continue; }
    if ((b.t -= dt) > 0) continue;
    b.t += BURN_EVERY; b.ticks--;
    state.casting = 'meteoro';
    specialDamage(e, 1 * dmgMult()); e.flash = 0.6;
    burst(chest(e), color('meteoro'), 8, 2.5, 0.14);
    if (b.ticks <= 0) burning.delete(e);
  }
}

export function clearArts() {
  for (const p of props) removeProp(p);
  props.length = actives.length = later.length = 0;
  burning.clear();
}
