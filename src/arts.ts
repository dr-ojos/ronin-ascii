// The newer techniques, staged like film shots. Every class has a second one of its own, on J from the first run:
//   Iaijutsu del Relámpago (ronin)  one flash across 12 m; a beat of stillness; the cut opens on everyone in the way
//   Rueda del Dharma (sōhei)        a golden dharma wheel rises behind him, the staff spins and drags the onis in
//   Palma del Buda (xiákè)          a mandala opens in the sky and a golden palm crashes down through it
//   Lluvia de Flechas (hwarang)     a fan of arrows goes up, a ring opens above the onis and the sky rains arrows
// and four more are taught at the temples for jade seals:
//   Ojo del Tifón (Viento)          a tornado full of stones and leaves walks ahead and bursts at the end
//   Lluvia de Meteoros (Brasas)     a burning rift opens above you and stones of fire fall from it
//   Aliento Glacial (Marea)         a freezing breath: ice spikes rise, the onis are locked in crystal, then it shatters
//   Grieta del Trueno (Rayo)        a glowing crack races over the ground, fangs of rock and sparks burst from it
// The gathering before each one (chargeAura) and the slow motion / title / flashes are in cinematic.ts and special.ts.
// All damage goes through specialDamage (its cap per enemy and cast keeps the katana needed).
import * as THREE from 'three';
import { camera, scene } from './renderer';
import { sam } from './avatar';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { burst, dashGhost, dashRing } from './fx';
import { flare } from './flare';
import { sparkBurst } from './katana-fx';
import { CLS, markCombatFx, tagMat } from './materials';
import { collide } from './physics';
import { panOf, sfx } from './sfx';
import { specialDamage } from './special-damage';
import { player, state } from './state';
import { surfaceY } from './structures';
import { TECHNIQUES, type TechniqueId } from './techniques';
import type { Enemy } from './types';
import { dmgMult } from './upgrades';
import { rnd } from './utils';
import { impactFlash, screenSlash, slowMo } from './cinematic';
import {
  makeCrescentSlashMat, makeEnergyPillarMat, makeFireBladeMat, makeFresnelShellMat,
  makeShockRingMat, makeStormPortalMat, makeVolumetricBeamMat, makeVortexFunnelMat,
  mandalaTex, scorchTex, spawnMiniArc,
} from './vfx-art';

export type ArtId = 'iai' | 'rueda' | 'palma' | 'flechas' | 'tornado' | 'meteoro' | 'hielo' | 'tierra';
const ART_IDS: readonly string[] = ['iai', 'rueda', 'palma', 'flechas', 'tornado', 'meteoro', 'hielo', 'tierra'];
export const isArt = (id: TechniqueId): id is ArtId => ART_IDS.includes(id);
const color = (id: ArtId) => TECHNIQUES[id].color;
type V3 = THREE.Vector3;

// ------------------------------------------------------------ shared pieces
const BOX = new THREE.BoxGeometry(1, 1, 1);
const PLANE_2 = new THREE.PlaneGeometry(2, 2);
const TORUS = new THREE.TorusGeometry(1, 0.07, 8, 36);
const ROCK = new THREE.IcosahedronGeometry(1, 0);
const ICE = new THREE.OctahedronGeometry(1, 0);
const FANG = new THREE.ConeGeometry(0.42, 1.9, 5);
const DOME = new THREE.SphereGeometry(1, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2);
const COLUMN = new THREE.CylinderGeometry(1, 1, 1, 24, 1, true);
const BEAM_CYL = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1, true).rotateX(Math.PI / 2);
const FUNNEL = new THREE.CylinderGeometry(2.6, 0.45, 5.8, 28, 1, true);
const REENTRY_CONE = new THREE.ConeGeometry(1.4, 3.6, 20, 1, true).rotateX(Math.PI / 2);
const CAPSULE = new THREE.CapsuleGeometry(0.5, 1.0, 6, 12);
const SPHERE_HI = new THREE.SphereGeometry(1, 16, 12);
const stone = tagMat(new THREE.MeshStandardMaterial({ color: 0x80705c, roughness: 0.95, flatShading: true }), CLS.ground);
const glow = (c: THREE.ColorRepresentation, opacity = 1) => tagMat(new THREE.MeshBasicMaterial({
  color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }), CLS.fx);
/** glow materials that never fade (debris, trails, arrows): shared, faded by scale instead */
const sharedGlow = new Map<string, THREE.MeshBasicMaterial>();
const fixedGlow = (c: number, opacity = 1) => {
  const key = `${c}:${opacity}`;
  let m = sharedGlow.get(key);
  if (!m) { m = glow(c, opacity); sharedGlow.set(key, m); }
  return m;
};

// one light for the big moments, always in the scene (adding lights later would recompile every shader)
const light = new THREE.PointLight(0xffffff, 0, 34, 1.6);
scene.add(light);
let lightT = 0, lightMax = 1, lightI = 0;
function impactLight(at: V3, c: number, intensity = 90, life = 0.4) {
  light.position.set(at.x, at.y + 2.5, at.z); light.color.set(c);
  lightI = intensity; lightT = lightMax = life;
}

/** something seen for a while: `mats` / `geo` are its own (disposed with it), `tick` animates it, `end` runs as it goes */
interface Prop { obj: THREE.Object3D; mats: THREE.Material[]; geo?: THREE.BufferGeometry; t: number; life: number; tick?: (p: Prop, dt: number) => void; end?: () => void }
const props: Prop[] = [];
/** a cast still at work: false when it is over */
const actives: ((dt: number) => boolean)[] = [];
const later: { t: number; fn: () => void }[] = [];
const burning = new Map<Enemy, { ticks: number; t: number }>();

function addProp(obj: THREE.Object3D, mats: THREE.Material[], life: number, tick?: Prop['tick'], end?: () => void, geo?: THREE.BufferGeometry) {
  scene.add(markCombatFx(obj));
  const p: Prop = { obj, mats, t: 0, life, tick, end, geo };
  props.push(p);
  return p;
}
function removeProp(p: Prop) { scene.remove(p.obj); for (const m of p.mats) m.dispose(); p.geo?.dispose(); }
const after = (t: number, fn: () => void) => later.push({ t, fn });

const alive = (e: Enemy) => e.hp > 0 && enemies.includes(e);
const flatDist = (e: Enemy, x: number, z: number) => Math.hypot(e.g.position.x - x, e.g.position.z - z);
const near = (x: number, z: number, r: number) => enemies.filter(e => e.hp > 0 && flatDist(e, x, z) < r + 0.4 * e.scale);
const nearest = (r: number, n: number) => enemies.filter(e => e.hp > 0 && flatDist(e, player.pos.x, player.pos.z) < r)
  .sort((a, b) => flatDist(a, player.pos.x, player.pos.z) - flatDist(b, player.pos.x, player.pos.z)).slice(0, n);
const chest = (e: Enemy) => new THREE.Vector3(e.g.position.x, e.g.position.y + 1.1 * e.scale, e.g.position.z);
const ahead = () => new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face));
const ground = (x: number, z: number) => new THREE.Vector3(x, surfaceY(x, z), z);
const lift = (v: V3, y: number) => v.clone().setY(v.y + y);
const tmp = new THREE.Vector3();

/** one blow of a technique: wounds (capped), dazes (less the heavy ones) and pushes along `push` */
function strike(id: ArtId, e: Enemy, dmg: number, stagger: number, push?: V3, force = 0) {
  state.casting = id;   // the rank of this technique sets the damage
  specialDamage(e, dmg * dmgMult()); e.flash = 1; provoke(e);
  if (e.state !== 'return' && stagger > 0) staggerEnemy(e, e.big ? stagger * 0.45 : stagger);
  if (push && force) e.knock.set(push.x, 0, push.z).normalize().multiplyScalar(force / (e.big ? 2.6 : 1));
}

// ------------------------------------------------------------ the film's vocabulary
/** stretch a box from a to b */
function orient(m: THREE.Object3D, a: V3, b: V3, w: number, h = w) {
  const len = Math.max(0.01, a.distanceTo(b));
  m.position.copy(a).lerp(b, 0.5); m.lookAt(b); m.scale.set(w, h, len);
}
/** a volumetric bar of light from a to b that fades softly at its edges */
function beam(a: V3, b: V3, c: number, w = 0.06, life = 0.25, opacity = 1) {
  const mat = makeVolumetricBeamMat(0xffffff, c, opacity), m = new THREE.Mesh(BEAM_CYL, mat);
  orient(m, a, b, w * 2.2);
  addProp(m, [mat], life, p => { mat.uniforms.uOpacity.value = opacity * (1 - p.t / p.life); });
}
/** a smooth radial shockwave ring on the ground that opens out to `r` and fades */
function groundRing(at: V3, c: THREE.ColorRepresentation, r: number, life = 0.5, opacity = 0.85) {
  const mat = makeShockRingMat(0xffffff, c, opacity), m = new THREE.Mesh(PLANE_2, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(at.x, surfaceY(at.x, at.z) + 0.1, at.z);
  addProp(m, [mat], life, p => {
    const k = p.t / p.life;
    m.scale.setScalar(0.25 + r * (1 - (1 - k) ** 3));
    mat.uniforms.uOpacity.value = opacity * (1 - k);
  });
}
/** a luminous Fresnel half-sphere shockwave swelling out of the ground */
function dome(at: V3, c: number, r: number, life = 0.45, opacity = 0.65) {
  const mat = makeFresnelShellMat(0xffffff, c, opacity, 2.0), m = new THREE.Mesh(DOME, mat);
  m.position.set(at.x, surfaceY(at.x, at.z), at.z);
  addProp(m, [mat], life, p => {
    const k = p.t / p.life, e = 1 - (1 - k) ** 3;
    m.scale.set(r * e + 0.01, (r * e + 0.01) * (0.75 - 0.35 * k), r * e + 0.01);
    mat.uniforms.uOpacity.value = opacity * (1 - k) ** 1.5;
  });
}
/** a volumetric column of scrolling energy standing on `at` that thins out */
function pillar(at: V3, c: number, h: number, w = 1, life = 0.6, opacity = 0.78) {
  const mat = makeEnergyPillarMat(0xffffff, c, opacity), m = new THREE.Mesh(COLUMN, mat);
  m.position.set(at.x, at.y + h / 2, at.z);
  m.scale.set(w, 0.01, w);
  addProp(m, [mat], life, p => {
    const k = p.t / p.life;
    m.scale.set(w * (1 - k * 0.75), h * Math.min(1, p.t / 0.06 + 0.01), w * (1 - k * 0.75));
    mat.uniforms.uOpacity.value = opacity * (1 - k);
  });
}
/** the trace of a sweeping cut: a razor-edged cinematic crescent slash at `at` */
function crescent(at: V3, c: number, r: number, yaw: number, roll: number, life = 0.35, opacity = 0.95) {
  const mat = makeCrescentSlashMat(0xffffff, c, opacity), m = new THREE.Mesh(PLANE_2, mat), g = new THREE.Group();
  m.rotation.x = -Math.PI / 2; g.add(m);
  g.position.copy(at); g.rotation.set(0, yaw, roll); g.scale.setScalar(r * 0.82);
  addProp(g, [mat], life, p => {
    const k = p.t / p.life;
    g.scale.setScalar(r * (0.82 + 0.38 * k));
    mat.uniforms.uOpacity.value = opacity * (1 - k * k);
  });
}
/** an ornate double-layered calligraphic mandala magic circle that opens at `at` */
function runeCircle(at: V3, c: number, r: number, life: number, opacity = 0.82, turn = 1.5, follow?: () => V3) {
  const outerMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color: c, transparent: true, opacity, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const innerMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color: 0xffffff, transparent: true, opacity: opacity * 0.55, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const outer = new THREE.Group();
  const layerA = new THREE.Mesh(PLANE_2, outerMat);
  layerA.rotation.x = -Math.PI / 2;
  layerA.scale.setScalar(r);
  const layerB = new THREE.Mesh(PLANE_2, innerMat);
  layerB.rotation.x = -Math.PI / 2;
  layerB.position.y = 0.02;
  layerB.scale.setScalar(r * 0.62);
  outer.add(layerA, layerB);
  outer.position.copy(at); outer.scale.setScalar(0.35);
  addProp(outer, [outerMat, innerMat], life, (p, dt) => {
    if (follow) outer.position.copy(follow());
    layerA.rotation.z += dt * turn;
    layerB.rotation.z -= dt * turn * 1.45;
    const open = Math.min(1, p.t / 0.15), close = Math.min(1, (p.life - p.t) / 0.25);
    outer.scale.setScalar(0.35 + 0.65 * (1 - (1 - open) ** 3));
    const pulse = Math.min(open, close) * (0.85 + 0.15 * Math.sin(p.t * 28));
    outerMat.opacity = opacity * pulse;
    innerMat.opacity = opacity * 0.55 * pulse;
  });
}
/** chunks thrown into the air that fall, bounce once and crumble */
function debris(at: V3, n: number, speed: number, mat: THREE.Material = stone, size = 0.22, geo: THREE.BufferGeometry = ROCK) {
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(geo, mat), s = size * rnd(0.5, 1.3);
    m.scale.setScalar(s); m.position.copy(at).add(new THREE.Vector3(rnd(-0.4, 0.4), rnd(0.1, 0.6), rnd(-0.4, 0.4)));
    const v = new THREE.Vector3(rnd(-1, 1), rnd(0.8, 1.8), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.5, 1));
    const spin = new THREE.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12));
    let bounced = false;
    addProp(m, [], rnd(1, 1.5), (p, dt) => {
      v.y -= 24 * dt;
      m.position.addScaledVector(v, dt);
      m.rotation.x += spin.x * dt; m.rotation.y += spin.y * dt; m.rotation.z += spin.z * dt;
      const gy = surfaceY(m.position.x, m.position.z) + s * 0.5;
      if (m.position.y < gy) {
        m.position.y = gy;
        if (!bounced) { bounced = true; v.multiplyScalar(0.35); v.y = Math.abs(v.y); } else v.set(0, 0, 0);
        spin.multiplyScalar(0.5);
      }
      m.scale.setScalar(s * Math.min(1, (p.life - p.t) / 0.3));
    });
  }
}
/** a flat ring of dust kicked up round a blow */
const dust = (at: V3, n = 40, speed = 5) => burst(lift(at, 0.25), 0x8a7a62, Math.round(n), speed, 0.22);
/** where on the screen a line on the ground runs (degrees), for screenSlash */
function screenAngle(a: V3, b: V3) {
  const p = tmp.set(a.x, a.y + 1, a.z).project(camera), x0 = p.x * innerWidth, y0 = -p.y * innerHeight;
  const q = tmp.set(b.x, b.y + 1, b.z).project(camera), x1 = q.x * innerWidth, y1 = -q.y * innerHeight;
  return Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
}

// ------------------------------------------------------------ the gathering (special.ts, every technique)
/** the power gathers round the warrior while time crawls: a magic circle at his feet, streaks of light
 *  rushing into him, a thin column rising, his own light swelling */
export function chargeAura(id: TechniqueId, time: number) {
  const c = TECHNIQUES[id].color, at = player.pos.clone();
  runeCircle(lift(at, 0.08), c, 2.6, time + 0.35, 0.8, 4, () => lift(player.pos, 0.08));
  pillar(at, c, 9, 0.9, time + 0.25, 0.35);
  impactLight(at, c, 45, time + 0.2);
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(3.5, 6), h = rnd(0.2, 3.2);
    const from = new THREE.Vector3(at.x + Math.sin(a) * r, at.y + h, at.z + Math.cos(a) * r);
    const mat = glow(i % 3 ? c : 0xffffff, 0.9), m = new THREE.Mesh(BOX, mat);
    const delay = rnd(0, time * 0.4), to = new THREE.Vector3(), head = new THREE.Vector3(), tail = new THREE.Vector3();
    m.scale.setScalar(0.001);
    addProp(m, [mat], time + 0.05, p => {
      const k = Math.min(1, Math.max(0, (p.t - delay) / (time - delay))), e = k * k;
      to.set(player.pos.x, player.pos.y + 1.1, player.pos.z);
      head.copy(from).lerp(to, e); tail.copy(from).lerp(to, Math.max(0, e - 0.35));
      if (head.distanceTo(tail) < 0.02) tail.y -= 0.02;
      orient(m, tail, head, 0.05);
      mat.opacity = 0.9 * Math.min(1, k * 4) * (1 - k * 0.3);
    });
  }
  burst(lift(at, 0.2), c, 30, 3, 0.12);
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
  const c = color('iai'), from = player.pos.clone(), dir = ahead();
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
  // the draw: a white crescent at the hip, a ring of wind under the feet
  crescent(lift(from, 1.1), 0xffffff, 1.8, player.face, 0.25, 0.22);
  dashRing(from); dust(from, 24, 4); sfx.dash();
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
    while (ghost <= 0) { ghost += 0.45; dashGhost(player.pos, player.face, 0.9); }
    burst(lift(player.pos, rnd(0.3, 1.6)), k > 0.5 ? c : 0xffffff, 3, 2, 0.1);
    sam.root.position.copy(player.pos); sam.root.rotation.y = player.face;
    if (k < 1) return true;
    player.dancing = false;
    sheath(from, player.pos.clone());
    return false;
  });
}

function sheath(a: V3, b: V3) {
  const c = color('iai'), dx = b.x - a.x, dz = b.z - a.z, len = Math.max(0.1, Math.hypot(dx, dz)), yaw = Math.atan2(dx, dz);
  // the path stays drawn in the air: a white-hot core in a volumetric halo + crackling lightning arcs along the cut
  const coreMat = makeVolumetricBeamMat(0xffffff, c, 1), haloMat = makeVolumetricBeamMat(c, 0x88b8ff, 0.55), g = new THREE.Group();
  const core = new THREE.Mesh(BEAM_CYL, coreMat), halo = new THREE.Mesh(BEAM_CYL, haloMat);
  core.scale.set(0.11, 0.11, len); halo.scale.set(0.75, 0.28, len * 1.04); g.add(core, halo);
  g.position.set((a.x + b.x) / 2, (a.y + b.y) / 2 + 1.1, (a.z + b.z) / 2); g.rotation.y = yaw;
  addProp(g, [coreMat, haloMat], IAI_SHEATH + 0.5, p => {
    if (p.t < IAI_SHEATH) { haloMat.uniforms.uOpacity.value = 0.55 * (0.7 + 0.3 * Math.sin(p.t * 60)); return; }
    const k = (p.t - IAI_SHEATH) / (p.life - IAI_SHEATH);
    core.scale.y = 0.11 + k * 2.1; halo.scale.y = 0.28 + k * 3.8;
    coreMat.uniforms.uOpacity.value = 1 - k; haloMat.uniforms.uOpacity.value = 0.55 * (1 - k);
  });
  // Crackling electric filament along the Iaijutsu dash line
  spawnMiniArc(lift(a, 1.1), lift(b, 1.1), 0xffffff, c, { steps: 10, spread: 0.45, radius: 0.055, life: IAI_SHEATH + 0.2, fork: true });
  const victims = enemies.filter(e => {
    if (e.hp <= 0) return false;
    const p = e.g.position, s = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.z - a.z) * dz) / (len * len)));
    return Math.hypot(p.x - a.x - dx * s, p.z - a.z - dz * s) < 2 + 0.4 * e.scale;
  });
  for (const e of victims.slice(0, 6)) flare(e.g.position, c, { pre: IAI_SHEATH, life: 0, lift: 1.1 * e.scale, follow: true });
  sfx.swing({ power: 1.7, pan: 0 });
  // the stillness before the click: the world holds its breath
  slowMo(0.4, 0.55);
  after(IAI_SHEATH, () => {
    // the click of the guard against the scabbard: everyone in the way is cut at once, and the screen with them
    screenSlash(screenAngle(a, b), c);
    impactFlash(0xffffff, victims.length ? 0.75 : 0.35);
    impactLight(a.clone().lerp(b, 0.5), 0xffffff, 110, 0.35);
    crescent(lift(a.clone().lerp(b, 0.5), 1.2), c, len * 0.55, yaw + Math.PI / 2, 0.15, 0.4, 0.9);
    let hits = 0;
    for (const e of victims) {
      if (!alive(e)) continue;
      const p = e.g.position, side = Math.sign((p.x - a.x) * dz - (p.z - a.z) * dx) || 1;
      strike('iai', e, 11, 1.7, new THREE.Vector3(dz * side, 0, -dx * side), 4);
      const at = chest(e);
      // a diagonal sheet of light through the body
      const cutMat = glow(0xffffff, 1), cut = new THREE.Mesh(BOX, cutMat);
      cut.position.copy(at); cut.rotation.set(0, yaw + Math.PI / 2, 0.75); cut.scale.set(2.6 * e.scale, 0.04, 0.04);
      addProp(cut, [cutMat], 0.4, p2 => { const k = p2.t / p2.life; cut.scale.y = 0.04 + k * 0.5; cutMat.opacity = 1 - k; });
      burst(at, 0xffffff, 34, 6, 0.14); burst(at, 0xff2a1e, 26, 5, 0.13); sparkBurst(at, 14, 7);
      flare(at, c, { size: 1, life: 0.5 });
      hits++;
    }
    if (hits) { sfx.hit({ heavy: true, pan: 0, count: hits }); state.hitStop = Math.max(state.hitStop, 0.16); state.shake = Math.max(state.shake, 0.6); }
    else sfx.rings(0);
  });
}

// ------------------------------------------------------------ Rueda del Dharma
const WHEEL_TIME = 2.4, WHEEL_PULSE = 0.3, WHEEL_PULL = 8, WHEEL_HIT = 2.8;

/** the dharmachakra: a rim, eight spokes and a hub, standing upright */
function dharmaWheel(mat: THREE.Material, hub: THREE.Material) {
  const g = new THREE.Group();
  const rim = new THREE.Mesh(TORUS, mat); rim.scale.setScalar(1.5); g.add(rim);
  const inner = new THREE.Mesh(TORUS, mat); inner.scale.setScalar(0.45); g.add(inner);
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * Math.PI * 2, s = new THREE.Mesh(BOX, mat);
    s.position.set(Math.cos(a) * 0.95, Math.sin(a) * 0.95, 0); s.rotation.z = a; s.scale.set(1.05, 0.09, 0.09); g.add(s);
    const knob = new THREE.Mesh(ROCK, hub); knob.position.set(Math.cos(a) * 1.68, Math.sin(a) * 1.68, 0); knob.scale.setScalar(0.13); g.add(knob);
  }
  const centre = new THREE.Mesh(ROCK, hub); centre.scale.setScalar(0.22); g.add(centre);
  return g;
}

function startRueda() {
  const c = color('rueda');
  // the great wheel rises behind his back
  const wMat = glow(c, 0.9), hubMat = glow(0xffffff, 0.9), wheelBack = dharmaWheel(wMat, hubMat), spinner = new THREE.Group();
  spinner.add(wheelBack); spinner.scale.setScalar(0.01);
  addProp(spinner, [wMat, hubMat], WHEEL_TIME + 0.2, (p, dt) => {
    const back = ahead().multiplyScalar(-0.9);
    spinner.position.set(player.pos.x + back.x, player.pos.y + 2.5 + Math.sin(p.t * 3) * 0.08, player.pos.z + back.z);
    spinner.rotation.y = player.face;
    wheelBack.rotation.z -= dt * 5;
    const open = Math.min(1, p.t / 0.25), close = p.t > WHEEL_TIME ? 1 - (p.t - WHEEL_TIME) / 0.2 : 1;
    spinner.scale.setScalar(1.3 * (1 - (1 - open) ** 3) * (0.6 + 0.4 * close) + (p.t > WHEEL_TIME ? (p.t - WHEEL_TIME) * 6 : 0) + 0.01);
    wMat.opacity = 0.9 * close; hubMat.opacity = 0.9 * close;
  });
  // the staff spun so fast it is a wheel of light at the waist
  const blurMat = glow(c, 0.7), blur = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const s = new THREE.Mesh(BOX, blurMat);
    s.scale.set(0.08, 0.08, 3.4); s.rotation.y = i / 6 * Math.PI; blur.add(s);
  }
  blur.position.copy(lift(player.pos, 1.05));
  addProp(blur, [blurMat], WHEEL_TIME, (p, dt) => {
    blur.position.set(player.pos.x, player.pos.y + 1.05, player.pos.z);
    blur.rotation.y += dt * 22;
    blurMat.opacity = 0.7 * Math.min(1, p.t / 0.1) * (0.7 + 0.3 * Math.sin(p.t * 40));
  });
  // the reach, drawn on the ground as a turning mandala
  runeCircle(lift(player.pos, 0.08), c, WHEEL_PULL, WHEEL_TIME, 0.4, -1.4, () => lift(player.pos, 0.08));
  impactLight(player.pos, c, 60, WHEEL_TIME);
  sfx.rings(0);
  let t = 0, next = 0, swing = 0;
  actives.push(dt => {
    t += dt;
    light.position.set(player.pos.x, player.pos.y + 2.5, player.pos.z);
    if ((swing -= dt) <= 0 && t < WHEEL_TIME) {
      swing = 0.45;
      Object.assign(player, { combo: Math.floor(Math.random() * 3), attackT: 0, attackDur: 0.45, hitDone: true });
      sfx.swing({ power: 0.8, pan: rnd(-0.3, 0.3) });
    }
    while (t >= next && next < WHEEL_TIME) { next += WHEEL_PULSE; wheelPulse(c); }
    if (t < WHEEL_TIME) return true;
    // the last turn: the wheel slams into the ground and throws them all back
    let hits = 0;
    for (const e of near(player.pos.x, player.pos.z, WHEEL_PULL)) {
      strike('rueda', e, 3.5, 1.6, new THREE.Vector3(e.g.position.x - player.pos.x, 0, e.g.position.z - player.pos.z), 12);
      burst(chest(e), c, 18, 5, 0.14); hits++;
    }
    const at = player.pos.clone();
    dome(at, c, WHEEL_PULL + 1, 0.5); groundRing(at, c, WHEEL_PULL + 2, 0.55); groundRing(at, 0xffffff, WHEEL_PULL * 0.6, 0.35);
    pillar(at, c, 14, 1.6, 0.5, 0.6);
    debris(at, 10, 9); dust(at, 60, 8);
    burst(lift(at, 1), c, 80, 8, 0.17);
    flare(lift(at, 2.3), c, { size: 1.3, life: 0.6 });
    impactLight(at, c, 120, 0.45); impactFlash(c, 0.55); slowMo(0.3, 0.22);
    sfx.taiko(1.2); if (hits) sfx.hit({ heavy: true, pan: 0, count: hits });
    state.shake = Math.max(state.shake, 0.7); state.hitStop = Math.max(state.hitStop, 0.08);
    return false;
  });
}

function wheelPulse(c: number) {
  let hits = 0, pan = 0;
  const me = lift(player.pos, 1.1);
  for (const e of near(player.pos.x, player.pos.z, WHEEL_PULL)) {
    const p = e.g.position, d = flatDist(e, player.pos.x, player.pos.z);
    if (d > 1.6) {
      e.knock.set(player.pos.x - p.x, 0, player.pos.z - p.z).normalize().multiplyScalar(e.big ? 3 : 7.5);
      beam(chest(e), me, c, 0.05, 0.18, 0.7);   // a golden tether drags it in
    }
    provoke(e);
    if (d < WHEEL_HIT + 0.4 * e.scale) {
      strike('rueda', e, 1.3, 0.45);
      burst(chest(e), c, 10, 4, 0.12); sparkBurst(chest(e), 6, 4);
      hits++; pan += panOf(p.x, p.z);
    }
  }
  if (hits) { sfx.hit({ heavy: false, pan: pan / hits, count: hits }); state.shake = Math.max(state.shake, 0.15); }
}

// ------------------------------------------------------------ Palma del Buda
const PALM_AHEAD = 6, PALM_REACH = 10, PALM_R = 5.5, PALM_FALL = 0.5, PALM_SKY = 18;

function palmMesh(mat: THREE.Material, sealMat?: THREE.Material) {
  const g = new THREE.Group();
  // Sculpted rounded palm using spheres & capsules instead of flat boxes
  const palmCore = new THREE.Mesh(SPHERE_HI, mat);
  palmCore.scale.set(1.85, 0.44, 1.9);
  g.add(palmCore);
  const heel = new THREE.Mesh(SPHERE_HI, mat);
  heel.scale.set(1.45, 0.42, 0.95); heel.position.set(0, 0.02, -1.7);
  g.add(heel);
  // Four articulated rounded fingers (proximal + distal phalanx)
  [-1.22, -0.41, 0.41, 1.22].forEach((x, i) => {
    const long = i === 1 || i === 2 ? 2.85 : 2.35;
    const f1 = new THREE.Mesh(CAPSULE, mat);
    f1.rotation.x = Math.PI / 2;
    f1.scale.set(0.62, long * 0.34, 0.48);
    f1.position.set(x, 0, 1.6 + long * 0.25);
    const f2 = new THREE.Mesh(CAPSULE, mat);
    f2.rotation.x = Math.PI / 2 + 0.12;
    f2.scale.set(0.54, long * 0.28, 0.42);
    f2.position.set(x, -0.08, 1.6 + long * 0.56 + long * 0.18);
    g.add(f1, f2);
  });
  // Sculpted thumb
  const thumb = new THREE.Mesh(CAPSULE, mat);
  thumb.rotation.set(Math.PI / 2, 0, 0.58);
  thumb.scale.set(0.7, 0.95, 0.5);
  thumb.position.set(2.05, -0.02, 0.72);
  g.add(thumb);
  // Glowing lotus dharma seal embossed on the underside of the palm
  if (sealMat) {
    const seal = new THREE.Mesh(PLANE_2, sealMat);
    seal.rotation.x = Math.PI / 2;
    seal.position.set(0, -0.46, 0.1);
    seal.scale.setScalar(1.35);
    g.add(seal);
  }
  const band = new THREE.Mesh(TORUS, mat);                            // a sutra band round the wrist
  band.scale.set(1.5, 0.48, 1); band.position.z = -2.75; g.add(band);
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
  // a mandala opens in the sky above the mark, a thread of light drops from it, the circle below answers
  runeCircle(lift(at, PALM_SKY + 1), c, 4.8, PALM_FALL + 0.45, 0.88, 2.2);
  runeCircle(lift(at, 0.08), c, PALM_R, PALM_FALL + 0.1, 0.55, -2.5);
  pillar(at, c, PALM_SKY, 0.25, PALM_FALL, 0.8);
  flare(at, c, { pre: PALM_FALL, life: 0, lift: 0.3 });
  const mat = makeFresnelShellMat(0xfff8dc, c, 0.92, 1.65);
  const halo = makeFresnelShellMat(0xffffff, c, 0.42, 2.6);
  const sealMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color: 0xffffff, transparent: true, opacity: 0.95,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const palm = palmMesh(mat, sealMat), shine = palmMesh(halo);
  shine.scale.setScalar(1.14); palm.add(shine);
  palm.rotation.y = player.face;
  palm.position.set(at.x, at.y + PALM_SKY, at.z); palm.scale.setScalar(0.6);
  let trail = 0;
  addProp(palm, [mat, halo, sealMat], PALM_FALL + 0.9, (p, dt) => {
    if (p.t < PALM_FALL) {
      const k = p.t / PALM_FALL;
      palm.position.y = at.y + 0.35 + PALM_SKY * (1 - k * k);
      palm.scale.setScalar(0.6 + 0.42 * k);
      if ((trail -= dt) <= 0) {   // streaks of speed above it
        trail = 0.03;
        const x = at.x + rnd(-1.7, 1.7), z = at.z + rnd(-1.7, 1.7), y = palm.position.y + 0.6;
        beam(new THREE.Vector3(x, y, z), new THREE.Vector3(x, y + rnd(3, 6), z), c, 0.06, 0.15, 0.7);
      }
      return;
    }
    // pressed into the earth a moment, then it rises and fades
    const k = (p.t - PALM_FALL) / 0.9;
    palm.scale.setScalar(1.02);
    palm.position.y = at.y + 0.35 + Math.max(0, k - 0.45) * 5;
    mat.uniforms.uOpacity.value = 0.92 * (1 - k);
    halo.uniforms.uOpacity.value = 0.42 * (1 - k);
    sealMat.opacity = 0.95 * (1 - k);
  });
  sfx.swing({ power: 1.4, pan: 0 });
  after(PALM_FALL, () => {
    let hits = 0;
    for (const e of near(at.x, at.z, PALM_R)) {
      strike('palma', e, 9, 2, new THREE.Vector3(e.g.position.x - at.x, 0, e.g.position.z - at.z), 10);
      burst(chest(e), c, 22, 5, 0.14); hits++;
    }
    dome(at, c, PALM_R + 1.5, 0.55, 0.6); groundRing(at, c, PALM_R + 2.5, 0.6); groundRing(at, 0xffffff, PALM_R, 0.35);
    // the earth cracks out from under the palm
    for (let i = 0; i < 12; i++) {
      const a = i / 12 * Math.PI * 2 + rnd(-0.15, 0.15), r = rnd(3, PALM_R + 1.5);
      const p0 = ground(at.x + Math.sin(a) * 1.6, at.z + Math.cos(a) * 1.6), p1 = ground(at.x + Math.sin(a) * r, at.z + Math.cos(a) * r);
      beam(lift(p0, 0.06), lift(p1, 0.06), c, 0.12, 0.9, 0.9);
    }
    debris(at, 16, 11); dust(at, 80, 9);
    burst(lift(at, 0.5), c, 120, 9, 0.18);
    flare(lift(at, 1), c, { size: 1.5, life: 0.6 });
    impactLight(at, c, 150, 0.5); impactFlash(c, 0.7); slowMo(0.25, 0.3);
    sfx.taiko(1.3); if (hits) sfx.hit({ heavy: true, pan: panOf(at.x, at.z), count: hits });
    state.shake = Math.max(state.shake, 1); state.hitStop = Math.max(state.hitStop, 0.1);
  });
}

// ------------------------------------------------------------ Lluvia de Flechas
const VOLLEY_TIME = 2.5, VOLLEY_EVERY = 0.055, VOLLEY_R = 4.5, VOLLEY_SKY = 14;
const arrowMat = fixedGlow(0xfff0f6, 0.95), arrowHeadMat = fixedGlow(TECHNIQUES.flechas.color, 1), arrowTrailMat = fixedGlow(TECHNIQUES.flechas.color, 0.3);

function startFlechas() {
  const c = color('flechas'), centre = player.pos.clone().addScaledVector(ahead(), 8);
  const aim = () => {
    const ts = nearest(16, 4);
    if (!ts.length) return;
    centre.set(0, 0, 0);
    for (const e of ts) centre.add(e.g.position);
    centre.divideScalar(ts.length);
  };
  aim();
  // the volley goes up first: a fan of arrows of light into the sky
  for (let i = 0; i < 9; i++) {
    const a = player.face + (i / 8 - 0.5) * 1.2, from = lift(player.pos, 1.5);
    const to = from.clone().add(new THREE.Vector3(Math.sin(a) * 3, 16, Math.cos(a) * 3));
    after(i * 0.025, () => beam(from, to, i % 2 ? c : 0xffffff, 0.05, 0.3, 0.9));
  }
  sfx.arrow(-0.3); after(0.06, () => sfx.arrow(0.3));
  // a ring opens over the onis, the arrows come out of it
  const sky = () => ground(centre.x, centre.z).setY(surfaceY(centre.x, centre.z) + VOLLEY_SKY);
  const floor = () => ground(centre.x, centre.z).setY(surfaceY(centre.x, centre.z) + 0.08);
  runeCircle(sky(), c, VOLLEY_R + 0.6, VOLLEY_TIME + 0.4, 0.7, 2.6, sky);
  runeCircle(floor(), c, VOLLEY_R, VOLLEY_TIME + 0.4, 0.3, -2, floor);
  const slant = ahead().multiplyScalar(-4);
  let t = 0, spawn = 0.2, retarget = 0.5, n = 0;
  actives.push(dt => {
    t += dt;
    if ((retarget -= dt) <= 0) { retarget = 0.5; aim(); }
    spawn -= dt;
    while (spawn <= 0 && t < VOLLEY_TIME) {
      spawn += VOLLEY_EVERY;
      const a = rnd(0, Math.PI * 2), r = VOLLEY_R * Math.sqrt(Math.random());
      arrow(ground(centre.x + Math.sin(a) * r, centre.z + Math.cos(a) * r), slant, n++ % 6 === 0, 1);
    }
    if (t < VOLLEY_TIME) return true;
    // the last one: a great arrow drops on the heart of the ring
    arrow(ground(centre.x, centre.z), slant, true, 4);
    return false;
  });
}

function arrow(to: V3, slant: V3, loud: boolean, size: number) {
  const big = size > 1, c = color('flechas');
  const start = to.clone().add(slant).setY(to.y + VOLLEY_SKY), fall = big ? 0.42 : 0.3;
  const g = new THREE.Group(), shaft = new THREE.Mesh(BOX, arrowMat), head = new THREE.Mesh(BOX, arrowHeadMat), trail = new THREE.Mesh(BOX, arrowTrailMat);
  shaft.scale.set(0.035, 0.035, 1.05); head.scale.set(0.09, 0.09, 0.2); head.position.z = 0.55;
  trail.scale.set(0.12, 0.12, 2.6); trail.position.z = -1.6;
  g.add(shaft, head, trail);
  g.scale.setScalar(size);
  g.position.copy(start); g.lookAt(to);
  const flight = to.clone().sub(start);
  addProp(g, [], fall + (big ? 1.2 : 0.7), p => {
    if (p.t < fall) { g.position.copy(start).addScaledVector(flight, p.t / fall); return; }
    trail.visible = false;
    g.position.copy(to).addScaledVector(flight, -0.28 * size / flight.length());   // stuck in the ground
    g.scale.setScalar(size * Math.max(0.01, 1 - Math.max(0, p.t - fall - (big ? 0.9 : 0.4)) / 0.3));
  });
  if (loud) sfx.arrow(panOf(to.x, to.z));
  after(fall, () => {
    if (!big) {
      burst(lift(to, 0.15), Math.random() < 0.5 ? 0xffb0d0 : 0xd8c8b0, 5, 2, 0.1);
      let hits = 0;
      for (const e of near(to.x, to.z, 1.25)) { strike('flechas', e, 1.15, 0.35, flight, 2.5); burst(chest(e), c, 8, 3, 0.12); hits++; }
      if (hits) sfx.hit({ heavy: false, pan: panOf(to.x, to.z), count: 1 });
      return;
    }
    let hits = 0;
    for (const e of near(to.x, to.z, 3.5)) {
      strike('flechas', e, 3, 1.2, new THREE.Vector3(e.g.position.x - to.x, 0, e.g.position.z - to.z), 9);
      hits++;
    }
    dome(to, c, 4.5, 0.45); groundRing(to, c, 5.5, 0.5); pillar(to, 0xffffff, 10, 0.6, 0.35, 0.7);
    debris(to, 8, 8); dust(to, 50, 7);
    burst(lift(to, 0.6), 0xffb0d0, 90, 8, 0.16);
    flare(lift(to, 1), c, { size: 1.3, life: 0.55 });
    impactLight(to, c, 110, 0.4); impactFlash(c, 0.5); slowMo(0.3, 0.2);
    sfx.taiko(1.1); if (hits) sfx.hit({ heavy: true, pan: panOf(to.x, to.z), count: hits });
    state.shake = Math.max(state.shake, 0.7);
  });
}

// ------------------------------------------------------------ Ojo del Tifón
const TWISTER_TIME = 3.5, TWISTER_SPEED = 5, TWISTER_PULL = 6.5, TWISTER_HIT = 2.4, TWISTER_EVERY = 0.25;

function startTornado() {
  const c = color('tornado'), dir = ahead(), pos = player.pos.clone().addScaledVector(dir, 2);
  const g = new THREE.Group();
  const funnelMat = makeVortexFunnelMat(0xffffff, c, 0.76);
  const innerFunnelMat = makeVortexFunnelMat(c, 0x26b88e, 0.48);
  const baseMat = makeShockRingMat(0xffffff, c, 0.72);
  const mats: THREE.Material[] = [funnelMat, innerFunnelMat, baseMat, glow(c, 0.45)];
  // Smooth volumetric helical wind funnels (outer + counter-spinning inner core)
  const funnel = new THREE.Mesh(FUNNEL, funnelMat);
  funnel.position.y = 2.9;
  g.add(funnel);
  const innerFunnel = new THREE.Mesh(FUNNEL, innerFunnelMat);
  innerFunnel.position.y = 2.75;
  innerFunnel.scale.set(0.6, 0.95, 0.6);
  g.add(innerFunnel);
  // Whirling wind rings for layered depth
  const rings: THREE.Mesh[] = [];
  for (let i = 0; i < 7; i++) {
    const ring = new THREE.Mesh(TORUS, mats[3]);
    ring.rotation.x = Math.PI / 2; ring.position.y = 0.25 + i * 0.8; ring.scale.setScalar(0.5 + i * 0.34);
    g.add(ring); rings.push(ring);
  }
  // what it has swallowed: stones and leaves whirling round it
  const leafMat = fixedGlow(0x9dffb0, 0.9);
  const caught: { m: THREE.Mesh; a: number; h: number; w: number }[] = [];
  for (let i = 0; i < 22; i++) {
    const leaf = i % 3 === 0, m = new THREE.Mesh(leaf ? BOX : ROCK, leaf ? leafMat : stone);
    if (leaf) m.scale.set(0.22, 0.02, 0.12); else m.scale.setScalar(rnd(0.12, 0.26));
    g.add(m); caught.push({ m, a: rnd(0, Math.PI * 2), h: rnd(0.2, 5.4), w: rnd(5, 9.5) });
  }
  const base = new THREE.Mesh(PLANE_2, baseMat); base.rotation.x = -Math.PI / 2; base.scale.setScalar(2.9); base.position.y = 0.1; g.add(base);
  g.position.set(pos.x, surfaceY(pos.x, pos.z), pos.z); g.scale.set(1, 0.3, 1);
  addProp(g, mats, TWISTER_TIME + 0.35, (p, dt) => {
    g.position.set(pos.x, surfaceY(pos.x, pos.z), pos.z);
    g.rotation.y += dt * 9;
    innerFunnel.rotation.y -= dt * 15;
    rings.forEach((r, i) => { r.position.x = Math.sin(p.t * 6 + i * 0.9) * 0.14 * i; r.position.z = Math.cos(p.t * 5 + i) * 0.11 * i; });
    for (const s of caught) {
      s.a += dt * s.w; s.h = (s.h + dt * 1.7) % 5.4;
      const r = 0.55 + s.h * 0.36;
      s.m.position.set(Math.sin(s.a) * r, s.h, Math.cos(s.a) * r); s.m.rotation.x += dt * 8; s.m.rotation.z += dt * 6;
    }
    const k = p.t > TWISTER_TIME ? 1 - (p.t - TWISTER_TIME) / 0.35 : Math.min(1, p.t / 0.2), wide = p.t > TWISTER_TIME ? 2 - k : 1;
    funnelMat.uniforms.uOpacity.value = 0.76 * k;
    innerFunnelMat.uniforms.uOpacity.value = 0.48 * k;
    baseMat.uniforms.uOpacity.value = 0.72 * k;
    (mats[3] as THREE.MeshBasicMaterial).opacity = 0.45 * k;
    g.scale.set(wide, 0.3 + 0.7 * k, wide);
  });
  flare(lift(pos, 2.5), c, { size: 1.1, life: 0.5 });
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
      const a = rnd(0, Math.PI * 2), h = rnd(0, 5), r = 0.5 + h * 0.33;
      burst(new THREE.Vector3(pos.x + Math.sin(a) * r, surfaceY(pos.x, pos.z) + h, pos.z + Math.cos(a) * r), k ? c : 0xffffff, 2, 1.5, 0.1);
    }
    if (Math.random() < 0.4) dust(ground(pos.x, pos.z), 6, 4);
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
    if (t < TWISTER_TIME) return true;
    // it bursts: everything it carried flies out
    const at = ground(pos.x, pos.z);
    let hits = 0;
    for (const e of near(at.x, at.z, 4)) {
      strike('tornado', e, 2, 0.8, new THREE.Vector3(e.g.position.x - at.x, 0, e.g.position.z - at.z), 11); hits++;
    }
    dome(at, c, 5.5, 0.4); groundRing(at, c, 6.5, 0.5);
    debris(lift(at, 2), 12, 10); debris(lift(at, 2), 8, 9, leafMat, 0.14, BOX);
    burst(lift(at, 2), c, 90, 9, 0.15);
    impactLight(at, c, 90, 0.35); impactFlash(c, 0.35);
    sfx.taiko(0.9); if (hits) sfx.hit({ heavy: true, pan: panOf(at.x, at.z), count: hits });
    state.shake = Math.max(state.shake, 0.45);
    return false;
  });
}

// ------------------------------------------------------------ Lluvia de Meteoros
const METEORS = 6, METEOR_RANGE = 16, METEOR_R = 3.5, METEOR_FALL = 0.5, BURN_TICKS = 3, BURN_EVERY = 0.6, RIFT_H = 30;
const scorchMat = tagMat(new THREE.MeshBasicMaterial({ map: scorchTex, transparent: true, opacity: 0.78, depthWrite: false }), CLS.ground);

function startMeteoro() {
  const c = color('meteoro'), ts = nearest(METEOR_RANGE, METEORS), sky = lift(player.pos, RIFT_H);
  // a burning swirling rift opens high above, a wide glow hanging under it
  const time = 0.12 + METEORS * 0.2 + 0.35;
  const riftMat = makeStormPortalMat(0xfff0c0, c, 0.9);
  const rift = new THREE.Mesh(PLANE_2, riftMat);
  rift.rotation.x = Math.PI / 2; rift.position.copy(sky); rift.scale.setScalar(11);
  addProp(rift, [riftMat], time, (p, dt) => {
    rift.rotation.z += dt * 1.8;
    const open = Math.min(1, p.t / 0.18), close = Math.min(1, (p.life - p.t) / 0.4);
    riftMat.uniforms.uOpacity.value = 0.9 * Math.min(open, close);
  });
  runeCircle(lift(sky, -0.5), 0xffd089, 6.2, time, 0.65, -2);
  pillar(lift(sky, -9), c, 9, 6.5, time, 0.2);
  for (let i = 0; i < METEORS; i++) {
    const e = ts.length ? ts[i % ts.length] : null;
    after(0.12 + i * 0.2, () => {
      let at: V3;
      if (e && alive(e)) at = ground(e.g.position.x + rnd(-0.7, 0.7), e.g.position.z + rnd(-0.7, 0.7));
      else { const a = rnd(0, Math.PI * 2), r = rnd(4, 10); at = ground(player.pos.x + Math.sin(a) * r, player.pos.z + Math.cos(a) * r); }
      meteor(at, sky, i === 0);
    });
  }
  sfx.taiko(0.8);
  state.shake = Math.max(state.shake, 0.3);
}

function meteor(at: V3, sky: V3, first: boolean) {
  const c = color('meteoro');
  flare(at, c, { pre: METEOR_FALL, life: 0, lift: 0.3 });
  runeCircle(lift(at, 0.08), c, METEOR_R, METEOR_FALL, 0.52, 3);
  const core = makeFresnelShellMat(0xfff8d0, 0xff9a38, 1.0, 1.4);
  const fire = makeFireBladeMat(0xfff4c0, c, 0xcc1a00, 0.85);
  const g = new THREE.Group();
  const rock = new THREE.Mesh(ROCK, core); rock.scale.setScalar(0.85);
  const cone = new THREE.Mesh(REENTRY_CONE, fire); cone.position.z = -1.6;
  const tail = new THREE.Mesh(REENTRY_CONE, fire); tail.scale.set(0.7, 0.7, 2.2); tail.position.z = -4.2;
  g.add(rock, cone, tail);
  const start = sky.clone().add(new THREE.Vector3(rnd(-6, 6), 0, rnd(-6, 6)));
  g.position.copy(start); g.lookAt(at);
  addProp(g, [core, fire], METEOR_FALL, (p, dt) => {
    const k = p.t / p.life;
    g.position.lerpVectors(start, at, k * k);
    rock.rotation.x += dt * 9; cone.rotation.z += dt * 11;
    tail.scale.z = 1.8 + 2.4 * k;
    burst(g.position.clone(), Math.random() < 0.5 ? c : 0xffd089, 5, 2.5, 0.22);
  });
  after(METEOR_FALL, () => {
    let hits = 0;
    for (const e of near(at.x, at.z, METEOR_R)) {
      strike('meteoro', e, 6, 1, new THREE.Vector3(e.g.position.x - at.x, 0, e.g.position.z - at.z), 9);
      if (e.hp > 0) burning.set(e, { ticks: BURN_TICKS, t: BURN_EVERY });
      hits++;
    }
    pillar(at, c, 10, 1.6, 0.45, 0.85);
    dome(at, c, METEOR_R + 1.2, 0.45, 0.68); groundRing(at, c, METEOR_R + 1.8, 0.55);
    // the crater: a charred cracked decal with a cooling ring of embers
    const scorch = new THREE.Mesh(PLANE_2, scorchMat);
    scorch.rotation.x = -Math.PI / 2; scorch.rotation.z = rnd(0, Math.PI * 2);
    scorch.position.set(at.x, at.y + 0.05, at.z); scorch.scale.setScalar(METEOR_R * 0.85);
    addProp(scorch, [], 3.5, p => scorch.scale.setScalar(METEOR_R * 0.85 * Math.min(1, (p.life - p.t) / 0.8 + 0.2)));
    const emberMat = makeShockRingMat(0xffd089, c, 0.82), ember = new THREE.Mesh(PLANE_2, emberMat);
    ember.rotation.x = -Math.PI / 2; ember.position.set(at.x, at.y + 0.08, at.z); ember.scale.setScalar(METEOR_R * 0.82);
    addProp(ember, [emberMat], 3.2, p => { emberMat.uniforms.uOpacity.value = 0.82 * (1 - p.t / p.life) * (0.75 + 0.25 * Math.sin(p.t * 17)); });
    debris(at, 9, 10); dust(at, 40, 7);
    burst(lift(at, 0.5), c, 90, 9, 0.2);
    burst(lift(at, 0.4), 0xffd089, 40, 6, 0.16);
    flare(lift(at, 0.6), c, { size: 1.2, life: 0.5 });
    impactLight(at, c, 130, 0.4); impactFlash(c, first ? 0.5 : 0.22);
    if (first) slowMo(0.35, 0.18);
    sfx.taiko(1.2); if (hits) sfx.hit({ heavy: true, pan: panOf(at.x, at.z), count: hits });
    state.shake = Math.max(state.shake, 0.65);
  });
}

// ------------------------------------------------------------ Aliento Glacial
const FROST_RANGE = 11, FROST_HALF = 0.9, FROST_TIME = 0.45, FROZEN = 3, FROZEN_BIG = 1.3;
const iceMat = makeFresnelShellMat(0xffffff, TECHNIQUES.hielo.color, 0.72, 1.7);
const iceWhite = makeFresnelShellMat(0xffffff, 0x9be8ff, 0.62, 2.2);

function startHielo() {
  const c = color('hielo'), origin = player.pos.clone(), dir = ahead(), face = player.face, cos = Math.cos(FROST_HALF);
  const hit = new Set<Enemy>();
  const mouth = lift(origin.clone().addScaledVector(dir, 0.8), 1.4);
  burst(mouth, c, 50, 6, 0.15);
  flare(lift(origin.clone().addScaledVector(dir, 2), 1.6), c, { size: 1.1, life: 0.5 });
  // the frost spreads over the ground in a fan
  const fanGeo = new THREE.RingGeometry(0.6, FROST_RANGE, 40, 1, face - Math.PI / 2 - FROST_HALF, FROST_HALF * 2);
  const fanMat = glow(c, 0.28), fan = new THREE.Mesh(fanGeo, fanMat);
  fan.rotation.x = -Math.PI / 2; fan.position.set(origin.x, origin.y + 0.07, origin.z); fan.scale.setScalar(0.1);
  addProp(fan, [fanMat], 2.2, p => {
    fan.scale.setScalar(0.1 + 0.9 * Math.min(1, p.t / FROST_TIME));
    fanMat.opacity = 0.28 * Math.min(1, (p.life - p.t) / 0.8);
  }, undefined, fanGeo);
  impactLight(mouth, c, 70, 0.6);
  sfx.swing({ power: 1.2, pan: 0 }); sfx.rings(0);
  let t = 0, nextSpike = 1.4;
  actives.push(dt => {
    const before = Math.min(1, t / FROST_TIME) * FROST_RANGE;
    t += dt;
    const r = Math.min(1, t / FROST_TIME) * FROST_RANGE;
    // streaks of icy wind shooting ahead, and snow on the front
    for (let k = 0; k < 3; k++) {
      const a = face + rnd(-FROST_HALF, FROST_HALF) * 0.85, len = rnd(2, 4);
      const tip = new THREE.Vector3(origin.x + Math.sin(a) * r, origin.y + rnd(0.3, 1.6), origin.z + Math.cos(a) * r);
      beam(tip.clone().lerp(mouth, Math.min(0.9, len / Math.max(1, r))), tip, k ? c : 0xffffff, 0.04, 0.12, 0.8);
    }
    for (let k = 0; k < 8; k++) {
      const a = face + rnd(-FROST_HALF, FROST_HALF), x = origin.x + Math.sin(a) * r, z = origin.z + Math.cos(a) * r;
      burst(new THREE.Vector3(x, surfaceY(x, z) + rnd(0.2, 1.6), z), k % 3 ? c : 0xffffff, 3, 1.2, 0.14);
    }
    // spikes of ice rise behind the front
    while (nextSpike < r) {
      for (let s = 0; s < 3; s++) {
        const a = face + rnd(-FROST_HALF, FROST_HALF) * 0.9;
        iceSpike(ground(origin.x + Math.sin(a) * nextSpike, origin.z + Math.cos(a) * nextSpike), 0.6 + nextSpike / FROST_RANGE);
      }
      nextSpike += 1.5;
    }
    for (const e of enemies) {
      if (e.hp <= 0 || hit.has(e)) continue;
      const dx = e.g.position.x - origin.x, dz = e.g.position.z - origin.z, d = Math.hypot(dx, dz), pad = 0.45 * e.scale;
      if (d < before - pad || d > r + pad) continue;
      if (d > 1.2 && (dx * dir.x + dz * dir.z) / d < cos) continue;
      hit.add(e); freeze(e);
    }
    if (t < FROST_TIME) return true;
    if (hit.size) { sfx.hit({ heavy: true, pan: 0, count: hit.size }); impactFlash(c, 0.35); }
    return false;
  });
}

function iceSpike(at: V3, size: number) {
  const m = new THREE.Mesh(ICE, Math.random() < 0.3 ? iceWhite : iceMat), h = rnd(0.7, 1.4) * size;
  m.rotation.set(rnd(-0.35, 0.35), rnd(0, Math.PI), rnd(-0.35, 0.35));
  m.position.copy(at); m.scale.setScalar(0.001);
  addProp(m, [], 1.8, p => {
    const k = Math.max(0.001, p.t < 0.1 ? p.t / 0.1 : p.t > 1.4 ? 1 - (p.t - 1.4) / 0.4 : 1);
    m.scale.set(0.22 * size * k, h * k, 0.22 * size * k);
    m.position.y = at.y + h * 0.4 * k;
  });
}

function freeze(e: Enemy) {
  const c = color('hielo');
  const hold = e.big ? FROZEN_BIG : FROZEN;
  strike('hielo', e, 3, hold / (e.big ? 0.45 : 1));
  e.knock.set(0, 0, 0);
  // a cluster of Fresnel-glowing crystals locks it in
  const mat = makeFresnelShellMat(0xffffff, c, 0.68, 1.7), edge = makeFresnelShellMat(0xffffff, 0x9be8ff, 0.45, 2.4), g = new THREE.Group();
  const shell = new THREE.Mesh(ICE, mat), rime = new THREE.Mesh(ICE, edge);
  shell.scale.set(0.8, 1.3, 0.8); rime.scale.set(0.88, 1.42, 0.88); rime.rotation.y = 0.5; g.add(shell, rime);
  for (let i = 0; i < 5; i++) {
    const s = new THREE.Mesh(ICE, mat), a = i / 5 * Math.PI * 2;
    s.position.set(Math.sin(a) * 0.55, rnd(-0.6, 0.4), Math.cos(a) * 0.55);
    s.rotation.set(Math.cos(a) * 0.7, 0, -Math.sin(a) * 0.7); s.scale.set(0.2, rnd(0.5, 0.8), 0.2); g.add(s);
  }
  g.position.copy(chest(e)); g.scale.setScalar(0.01);
  burst(chest(e), 0xffffff, 20, 4, 0.12);
  addProp(g, [mat, edge], hold, p => {
    if (!alive(e)) { p.t = p.life; return; }
    g.position.set(e.g.position.x, e.g.position.y + 1.05 * e.scale, e.g.position.z);
    g.scale.setScalar(e.scale * Math.min(1, p.t / 0.12 + 0.01));
    mat.uniforms.uOpacity.value = 0.68 + 0.12 * Math.sin(p.t * 9);
  }, () => {
    // the ice shatters and cuts once more
    const at = g.position.clone();
    burst(at, 0xffffff, 40, 6, 0.14); burst(at, c, 30, 5, 0.12);
    debris(at, 8, 7, iceMat, 0.16, ICE);
    if (alive(e)) { strike('hielo', e, 3, 0.3); sfx.hit({ heavy: false, pan: panOf(e.g.position.x, e.g.position.z), count: 1 }); }
  });
}

// ------------------------------------------------------------ Grieta del Trueno
const CRACK_LEN = 18, CRACK_SPEED = 30, CRACK_STEP = 1.1, CRACK_W = 2.3;

function startTierra() {
  const c = color('tierra'), origin = player.pos.clone(), dir = ahead();
  const hit = new Set<Enemy>();
  dust(origin, 50, 6);
  groundRing(origin, c, 3, 0.4); dome(origin, c, 2.5, 0.3);
  debris(origin, 6, 7);
  impactLight(origin, c, 80, 0.4);
  sfx.taiko(1.1);
  state.shake = Math.max(state.shake, 0.5);
  let front = 0, nextFang = 1, crackAt = lift(origin, 0.06), along = 0, zig = 0, sparkT = 0;
  actives.push(dt => {
    const before = front;
    front = Math.min(CRACK_LEN, front + CRACK_SPEED * dt);
    // the glowing crack itself, a zigzag of magma-light over the ground
    while (along < front - 0.6) {
      along += rnd(0.6, 1);
      zig = THREE.MathUtils.clamp(zig + rnd(-0.6, 0.6), -0.8, 0.8);
      const next = ground(origin.x + dir.x * along + dir.z * zig, origin.z + dir.z * along - dir.x * zig);
      next.y += 0.06;
      crackLine(crackAt, next, c);
      crackAt = next;
    }
    while (nextFang <= front) {
      const side = rnd(-0.6, 0.6);
      fang(ground(origin.x + dir.x * nextFang + dir.z * side, origin.z + dir.z * nextFang - dir.x * side), c, 1);
      nextFang += CRACK_STEP;
    }
    // volumetric lightning crackles out of the fissure
    if ((sparkT -= dt) <= 0) {
      sparkT = 0.055;
      const base = lift(crackAt, 0.12);
      const top = base.clone().add(new THREE.Vector3(rnd(-1.2, 1.2), rnd(1.8, 3.6), rnd(-1.2, 1.2)));
      spawnMiniArc(base, top, 0xffffff, 0x9fd0ff, { steps: 5, spread: 0.42, radius: 0.04, life: 0.18, fork: true });
    }
    impactLight(crackAt, c, 60, 0.15);
    let hits = 0;
    for (const e of enemies) {
      if (e.hp <= 0 || hit.has(e)) continue;
      const dx = e.g.position.x - origin.x, dz = e.g.position.z - origin.z, pad = 0.45 * e.scale;
      const ahead2 = dx * dir.x + dz * dir.z, side = dx * dir.z - dz * dir.x;
      if (ahead2 < before - pad || ahead2 > front + pad || ahead2 < -0.5 || Math.abs(side) > CRACK_W + pad) continue;
      hit.add(e);
      const s = Math.sign(side) || 1;
      strike('tierra', e, 7, 1.4, new THREE.Vector3(dir.z * s + dir.x * 0.4, 0, -dir.x * s + dir.z * 0.4), 8);
      const at = chest(e);
      burst(at, c, 20, 6, 0.15); sparkBurst(at, 14, 6);
      flare(at, 0xffe2a0, { size: 0.8, life: 0.4 });
      hits++;
    }
    if (hits) { sfx.hit({ heavy: true, pan: 0, count: hits }); state.shake = Math.max(state.shake, 0.35); }
    if (front < CRACK_LEN) return true;
    // the end of the crack: one great fang bursts out
    const end = ground(origin.x + dir.x * CRACK_LEN, origin.z + dir.z * CRACK_LEN);
    fang(end, c, 2.6);
    dome(end, c, 4.5, 0.4); groundRing(end, c, 5, 0.5);
    debris(end, 12, 11); dust(end, 60, 8);
    impactLight(end, c, 120, 0.4); impactFlash(c, 0.45); slowMo(0.35, 0.18);
    for (const e of near(end.x, end.z, 3.5)) if (!hit.has(e)) strike('tierra', e, 7, 1.4, new THREE.Vector3(e.g.position.x - end.x, 0, e.g.position.z - end.z), 9);
    sfx.taiko(1.3);
    state.shake = Math.max(state.shake, 0.8);
    return false;
  });
}

function crackLine(a: V3, b: V3, c: number) {
  const coreMat = glow(0xfff0c8, 1), haloMat = glow(c, 0.45), g = new THREE.Group();
  const core = new THREE.Mesh(BOX, coreMat), halo = new THREE.Mesh(BOX, haloMat);
  g.add(core, halo);
  const len = Math.max(0.01, a.distanceTo(b));
  g.position.copy(a).lerp(b, 0.5); g.lookAt(b);
  core.scale.set(0.12, 0.04, len); halo.scale.set(0.6, 0.03, len * 1.1);
  addProp(g, [coreMat, haloMat], 1.6, p => {
    const k = p.t / p.life, flick = 0.8 + 0.2 * Math.sin(p.t * 40 + a.x);
    coreMat.opacity = (1 - k) * flick; haloMat.opacity = 0.45 * (1 - k) * flick;
  });
}

function fang(at: V3, c: number, size: number) {
  const m = new THREE.Mesh(FANG, stone), s = rnd(0.8, 1.35) * size;
  m.scale.setScalar(s); m.rotation.set(rnd(-0.25, 0.25), rnd(0, Math.PI), rnd(-0.25, 0.25));
  const top = at.y + 0.85 * s, low = at.y - 1.2 * s;
  m.position.set(at.x, low, at.z);
  addProp(m, [], 1.1 + (size > 1 ? 0.6 : 0), p => {
    const end = p.life - 0.3, k = p.t < 0.08 ? p.t / 0.08 : p.t > end ? 1 - (p.t - end) / 0.3 : 1;
    m.position.y = low + (top - low) * k;
  });
  dust(at, 8 * size, 4);
  burst(lift(at, 0.6), c, Math.round(6 * size), 5, 0.1);
  if (Math.random() < 0.5 || size > 1) debris(lift(at, 0.4), Math.round(2 * size), 6 * Math.sqrt(size), stone, 0.15 * size);
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
  lightT = Math.max(0, lightT - dt);
  light.intensity = lightT > 0 ? lightI * (lightT / lightMax) * (0.85 + 0.15 * Math.random()) : 0;
}

export function clearArts() {
  for (const p of props) removeProp(p);
  props.length = actives.length = later.length = 0;
  burning.clear();
  lightT = 0; light.intensity = 0;
}
