// Rewards. Chests: one in every camp (sealed with an ofuda until the camp is cleared), a lacquered one
// where a giant lives, a violet one watched by a sub-boss (always an upgrade inside), and plain ones hidden near the corners of the wilds. Walk up and press E:
// (or cut it open with the katana): mon (points), healing and often an upgrade (upgrades.ts). Slain oni also drop mon and onigiri.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { scene } from './renderer';
import { M, CLS, tagMat } from './materials';
import { addCollider } from './physics';
import { addLight, removeLights } from './lights';
import { surfaceY } from './structures';
import { burst } from './fx';
import { sfx } from './sfx';
import { showMsg } from './hud';
import { addPoints } from './score';
import { UPGRADES, grant, lvl, roman, rollUpgrade } from './upgrades';
import { player, state } from './state';
import { rnd } from './utils';
import type { Chest } from './types';

export const chests: Chest[] = [];
export function makeChest(x: number, z: number, ry: number, kind: Chest['kind'], tier: number, sealed: boolean): Chest {
  const c: Chest = { x, z, ry, kind, tier, state: sealed ? 'sealed' : 'closed', openT: 0 };
  addCollider({ x, z, r: kind === 'jefe' ? 0.9 : kind === 'guardian' ? 0.8 : 0.7 });
  chests.push(c);
  return c;
}

// ------------------------------------------------------------ the chest model
// A lacquered karabitsu: bracket feet on a plinth, a moulded rim, a lid with a raised panel, gilt corner
// guards, straps with rivets, a chrysanthemum lock plate with its hasp, ring handles at the ends and a crest
// on the lid. Every kind has its own palette; the parts are merged per material once per kind and shared.
const lacquer = (color: number, o: THREE.MeshPhysicalMaterialParameters = {}) =>
  tagMat(new THREE.MeshPhysicalMaterial({ color, roughness: 0.32, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.14, ...o }), CLS.wood);
const metal = (color: number, emissive: number, ei: number) =>
  tagMat(M(color, { emissive, emissiveIntensity: ei, metalness: 0.85, roughness: 0.28 }), CLS.light);
const CM = {
  red: lacquer(0x8a1a12), vermilion: lacquer(0xb3261e), black: lacquer(0x121014, { roughness: 0.22 }),
  violet: lacquer(0x2a1240, { emissive: 0x08030e, clearcoatRoughness: 0.2 }), indigo: lacquer(0x15121f),
  wood: tagMat(M(0x6a4a30, { roughness: 0.85, flatShading: true }), CLS.wood), woodD: tagMat(M(0x3a281c, { roughness: 0.95 }), CLS.wood),
  gold: metal(0xffcf5a, 0xa06a08, 1.1), silver: metal(0xd6dbe8, 0x4a5068, 0.9),
  iron: tagMat(M(0x3c3c42, { metalness: 0.7, roughness: 0.55 }), CLS.wood),
  lining: tagMat(M(0x3a0c0a, { roughness: 1 }), CLS.wood), dark: tagMat(M(0x050506, { roughness: 1 }), CLS.wood),
  paper: tagMat(M(0xf2eee0, { roughness: 1, side: THREE.DoubleSide, emissive: 0x3a1a10 }), CLS.wood),
  ink: tagMat(M(0xb0201a, { roughness: 0.9, emissive: 0x300404 }), CLS.wood),
  rope: tagMat(M(0xc0a46c, { roughness: 1 }), CLS.wood),
  coin: metal(0xffd468, 0xc08a10, 1.4),
  glow: tagMat(new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx)
};
type Palette = { shell: THREE.Material; trim: THREE.Material; metal: THREE.Material; tassel?: THREE.Material; crest: 'none' | 'diamond' | 'tomoe' | 'flower' };
const PALETTE: Record<Chest['kind'], Palette> = {
  guarida: { shell: CM.red, trim: CM.black, metal: CM.gold, crest: 'diamond' },
  jefe: { shell: CM.black, trim: CM.vermilion, metal: CM.gold, tassel: CM.vermilion, crest: 'tomoe' },
  guardian: { shell: CM.violet, trim: CM.indigo, metal: CM.silver, tassel: CM.violet, crest: 'flower' },
  oculto: { shell: CM.wood, trim: CM.woodD, metal: CM.iron, crest: 'none' }
};
const W = 1.1, D = 0.7, HINGE = 0.64;
const RB = (w: number, h: number, d: number, r: number) => new RoundedBoxGeometry(w, h, d, 2, r);
const GEO = {
  box: new THREE.BoxGeometry(1, 1, 1), sphere: new THREE.SphereGeometry(1, 8, 6),
  plinth: RB(W + 0.05, 0.07, D + 0.05, 0.02), foot: RB(0.17, 0.13, 0.15, 0.025), body: RB(W, 0.42, D, 0.03),
  moulding: RB(W + 0.035, 0.04, D + 0.035, 0.015), lid: RB(W + 0.05, 0.12, D + 0.05, 0.035),
  panel: RB(W - 0.14, 0.05, D - 0.16, 0.02), lidBand: RB(W + 0.07, 0.03, D + 0.07, 0.012),
  guard: RB(0.11, 0.13, 0.11, 0.018), lidGuard: RB(0.12, 0.135, 0.12, 0.02),
  plate: new THREE.CylinderGeometry(0.1, 0.1, 0.016, 16), petals: new THREE.CylinderGeometry(0.125, 0.125, 0.01, 16),
  boss: new THREE.CylinderGeometry(0.07, 0.07, 0.016, 12), ring: new THREE.TorusGeometry(0.075, 0.013, 6, 18),
  crest: new THREE.TorusGeometry(0.1, 0.012, 6, 24), cord: new THREE.CylinderGeometry(0.01, 0.01, 0.12, 5),
  tassel: new THREE.ConeGeometry(0.04, 0.17, 8), coin: new THREE.CylinderGeometry(0.055, 0.055, 0.016, 10),
  rope: new THREE.CylinderGeometry(0.02, 0.02, 1, 6)
};
type Parts = Map<THREE.Material, THREE.BufferGeometry[]>;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _v = new THREE.Vector3(), _s = new THREE.Vector3();
function put(parts: Parts, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx = 1, sy = 1, sz = 1, rx = 0, ry = 0, rz = 0) {
  const g = geo.index ? geo.toNonIndexed() : geo.clone();
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal' && k !== 'uv') g.deleteAttribute(k);
  g.applyMatrix4(_m.compose(_v.set(x, y, z), _q.setFromEuler(_e.set(rx, ry, rz)), _s.set(sx, sy, sz)));
  let list = parts.get(mat); if (!list) parts.set(mat, list = []);
  list.push(g);
}
function merged(parts: Parts) {
  const g = new THREE.Group();
  for (const [mat, geos] of parts) { const m = new THREE.Mesh(mergeGeometries(geos), mat); m.castShadow = m.receiveShadow = true; g.add(m); }
  return g;
}
/** the merged meshes of one kind of chest: the body (with the coins inside) and the lid (around its hinge) */
const templates = new Map<Chest['kind'], { body: THREE.Group; lid: THREE.Group; loot: THREE.Group }>();
function template(kind: Chest['kind']) {
  let t = templates.get(kind); if (t) return t;
  const P = PALETTE[kind], body: Parts = new Map(), lid: Parts = new Map(), loot: Parts = new Map(), { box, sphere } = GEO;
  const rivets = (parts: Parts, x: number, ys: number[], z: number) => { for (const y of ys) put(parts, sphere, P.metal, x, y, z, 0.017, 0.017, 0.012); };
  // ---- body: feet, plinth, carcass, moulding, a tray whose floor is lined in red
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    put(body, GEO.foot, P.trim, sx * (W / 2 - 0.07), 0.065, sz * (D / 2 - 0.06));
    put(body, box, P.metal, sx * (W / 2 - 0.07), 0.012, sz * (D / 2 - 0.06), 0.18, 0.024, 0.16);           // shod feet
  }
  put(body, GEO.plinth, P.trim, 0, 0.155, 0);
  put(body, GEO.body, P.shell, 0, 0.38, 0);
  put(body, GEO.moulding, P.trim, 0, 0.585, 0);
  for (const sz of [-1, 1]) put(body, box, P.shell, 0, 0.615, sz * (D / 2 - 0.025), W - 0.02, 0.05, 0.05);
  for (const sx of [-1, 1]) put(body, box, P.shell, sx * (W / 2 - 0.025), 0.615, 0, 0.05, 0.05, D - 0.1);
  put(body, box, CM.lining, 0, 0.592, 0, W - 0.1, 0.01, D - 0.1);
  // corner guards top and bottom of every upright edge
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const y of [0.245, 0.515])
    put(body, GEO.guard, P.metal, sx * (W / 2 - 0.049), y, sz * (D / 2 - 0.049));
  // straps down the front and back, riveted at the front
  for (const sx of [-1, 1]) {
    const x = sx * 0.33;
    put(body, box, P.metal, x, 0.38, D / 2 + 0.006, 0.07, 0.4, 0.012);
    put(body, box, P.metal, x, 0.38, -D / 2 - 0.006, 0.07, 0.4, 0.012);
    rivets(body, x, [0.24, 0.38, 0.52], D / 2 + 0.014);
  }
  // chrysanthemum lock plate and keyhole
  put(body, GEO.petals, P.metal, 0, 0.47, D / 2 + 0.006, 1, 1, 1, Math.PI / 2);
  put(body, GEO.plate, P.trim, 0, 0.47, D / 2 + 0.012, 0.78, 1, 0.78, Math.PI / 2);
  put(body, GEO.boss, P.metal, 0, 0.47, D / 2 + 0.019, 0.8, 1, 0.8, Math.PI / 2);
  put(body, box, CM.dark, 0, 0.455, D / 2 + 0.03, 0.022, 0.05, 0.01);
  // ring handles on the ends (with tassels on the treasure chests)
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 + 0.008);
    put(body, GEO.boss, P.metal, x, 0.47, 0, 1, 1, 1, 0, 0, Math.PI / 2);
    put(body, GEO.ring, P.metal, x + sx * 0.016, 0.4, 0, 1, 1, 1, 0, Math.PI / 2);
    if (P.tassel) {
      put(body, GEO.cord, P.tassel, x + sx * 0.02, 0.28, 0);
      put(body, GEO.tassel, P.tassel, x + sx * 0.02, 0.15, 0);
      put(body, sphere, P.metal, x + sx * 0.02, 0.235, 0, 0.022, 0.022, 0.022);
    }
  }
  // what waits inside: a heap of mon and a koban
  const r = (i: number) => Math.abs(Math.sin(i * 12.9898 + kind.length * 4.1) * 43758.5453) % 1;
  for (let i = 0; i < 18; i++) {
    const a = r(i) * Math.PI * 2, d = Math.sqrt(r(i + 50)) * 0.3, x = Math.cos(a) * d * 1.4, z = Math.sin(a) * d * 0.8;
    put(loot, GEO.coin, CM.coin, x, 0.603 + (1 - d / 0.3) * 0.025 + r(i + 90) * 0.01, z, 1, 1, 1, (r(i + 7) - 0.5) * 0.6, 0, (r(i + 3) - 0.5) * 0.6);
  }
  put(loot, sphere, CM.coin, 0.12, 0.62, -0.02, 0.12, 0.022, 0.075, 0, 0.4);
  // ---- lid (hinged at the back edge of the rim)
  const zc = D / 2;
  put(lid, GEO.lidBand, P.trim, 0, 0.015, zc);
  put(lid, GEO.lid, P.shell, 0, 0.07, zc);
  put(lid, GEO.panel, P.shell, 0, 0.14, zc);
  for (const sx of [-1, 1]) for (const z of [0.012, D - 0.012]) put(lid, GEO.lidGuard, P.metal, sx * (W / 2 - 0.037), 0.07, z);
  for (const sx of [-1, 1]) {
    const x = sx * 0.33;
    put(lid, box, P.metal, x, 0.168, zc, 0.07, 0.012, D + 0.06);
    put(lid, box, P.metal, x, 0.07, D + 0.031, 0.07, 0.13, 0.012);
    rivets(lid, x, [0.04, 0.11], D + 0.04);
  }
  // hasp hanging over the lock plate
  put(lid, box, P.metal, 0, 0.06, D + 0.033, 0.14, 0.1, 0.014);
  put(lid, box, P.metal, 0, -0.04, D + 0.035, 0.06, 0.13, 0.014);
  put(lid, sphere, P.metal, 0, -0.1, D + 0.045, 0.025, 0.025, 0.018);
  // the crest on the lid
  if (P.crest !== 'none') {
    put(lid, GEO.crest, P.metal, 0, 0.168, zc, 1, 1, 1, Math.PI / 2);
    if (P.crest === 'diamond') put(lid, box, P.metal, 0, 0.168, zc, 0.085, 0.012, 0.085, 0, Math.PI / 4);
    else if (P.crest === 'tomoe') for (let i = 0; i < 3; i++) {
      const a = (i / 3) * Math.PI * 2;
      put(lid, sphere, P.metal, Math.cos(a) * 0.042, 0.168, zc + Math.sin(a) * 0.042, 0.03, 0.01, 0.03);
      put(lid, sphere, P.metal, Math.cos(a + 0.9) * 0.06, 0.168, zc + Math.sin(a + 0.9) * 0.06, 0.016, 0.009, 0.016);
    } else for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      put(lid, sphere, P.metal, Math.cos(a) * 0.045, 0.168, zc + Math.sin(a) * 0.045, 0.034, 0.008, 0.02, 0, -a);
    }
  } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) put(lid, sphere, P.metal, sx * 0.48, 0.13, zc + sz * 0.27, 0.022, 0.016, 0.022);
  t = { body: merged(body), lid: merged(lid), loot: merged(loot) };
  templates.set(kind, t);
  return t;
}
/** the ofuda that seals a chest: a rope tied around the rim, two crossed paper strips with a red stamp */
function sealGroup() {
  const s = new THREE.Group(); s.name = 'seal';
  const add = (geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.set(rx, ry, rz); s.add(m); return m;
  };
  for (const sz of [-1, 1]) add(GEO.rope, CM.rope, 0, 0.64, sz * (D / 2 + 0.05), 1, W + 0.12, 1, 0, 0, Math.PI / 2);
  for (const sx of [-1, 1]) add(GEO.rope, CM.rope, sx * (W / 2 + 0.05), 0.64, 0, 1, D + 0.12, 1, Math.PI / 2);
  for (const k of [-1, 1]) add(GEO.box, CM.paper, 0, 0.56, D / 2 + 0.07, 0.12, 0.5, 0.004, 0, 0, k * 0.42);
  add(GEO.box, CM.ink, 0, 0.56, D / 2 + 0.075, 0.07, 0.07, 0.004, 0, 0, Math.PI / 4);
  for (const sx of [-1, 1]) add(GEO.box, CM.paper, sx * 0.2, 0.52, D / 2 + 0.06, 0.06, 0.22, 0.003, 0, 0, sx * 0.08);   // shide
  s.traverse(o => { o.castShadow = true; });
  return s;
}
function buildChest(c: Chest) {
  const g = new THREE.Group(), t = template(c.kind);
  for (const m of t.body.children) g.add((m as THREE.Mesh).clone());
  const loot = (t.loot.children[0] as THREE.Mesh).clone(); loot.name = 'loot'; loot.visible = c.state !== 'open'; g.add(loot);
  const lid = new THREE.Group(); lid.position.set(0, HINGE, -D / 2); g.add(lid);
  for (const m of t.lid.children) lid.add((m as THREE.Mesh).clone());
  if (c.state === 'sealed') g.add(sealGroup());
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), CM.glow.clone()); glow.position.y = 0.75; glow.scale.set(1.1, 0.6, 0.8); glow.name = 'glow'; glow.castShadow = false; g.add(glow);
  if (c.kind === 'jefe') g.scale.setScalar(1.35); else if (c.kind === 'guardian') g.scale.setScalar(1.18);
  g.position.set(c.x, surfaceY(c.x, c.z), c.z); g.rotation.y = c.ry;
  if (c.state === 'open') lid.rotation.x = -1.9;
  scene.add(g); c.g = g; c.lid = lid;
  if (c.state === 'closed') addLight({ x: c.x, y: g.position.y + 1, z: c.z, color: 0xffc050, intensity: 3, distance: 7, decay: 1.5, owner: c });
}
function dropChest(c: Chest) { if (c.g) scene.remove(c.g); c.g = c.lid = undefined; removeLights(c); }

/** the camp was cleared: its seal burns away */
export function unseal(c: Chest) {
  if (c.state !== 'sealed') return;
  c.state = 'closed';
  if (c.g) {
    const seal = c.g.getObjectByName('seal'); if (seal) seal.removeFromParent();
    burst(new THREE.Vector3(c.x, c.g.position.y + 0.6, c.z), 0xffd060, 40, 4, 0.12);
    addLight({ x: c.x, y: c.g.position.y + 1, z: c.z, color: 0xffc050, intensity: 3, distance: 7, decay: 1.5, owner: c });
  }
}
export function resetChests() {
  for (const c of chests) { dropChest(c); c.openT = 0; c.state = c.kind === 'oculto' ? 'closed' : 'sealed'; }
  for (const p of pickups) scene.remove(p.m);
  pickups.length = 0;
}

function openChest(c: Chest) {
  c.state = 'open'; c.openT = 0.0001; removeLights(c);
  state.chests++;
  const lines: string[] = [];
  const mon = Math.round((c.kind === 'jefe' ? 500 : c.kind === 'guardian' ? 360 : c.kind === 'oculto' ? 220 : 120) * (1 + c.tier * 1.5) / 10) * 10;
  addPoints(mon, 'mon del cofre'); lines.push(`+${mon} mon`);
  if (c.kind !== 'oculto') { const h = c.kind === 'jefe' ? 50 : c.kind === 'guardian' ? 40 : 30; player.hp = Math.min(player.maxHp, player.hp + h); lines.push(`+${h} vida`); }
  const chance = c.kind === 'jefe' || c.kind === 'guardian' ? 1 : c.kind === 'oculto' ? 0.75 : 0.4;
  const up = Math.random() < chance ? rollUpgrade() : null;
  if (up) { grant(up); lines.push(`${UPGRADES[up].name} ${roman(lvl(up))}`, UPGRADES[up].desc); }
  const y = c.g ? c.g.position.y : surfaceY(c.x, c.z);
  burst(new THREE.Vector3(c.x, y + 0.9, c.z), 0xffd060, up ? 120 : 60, up ? 6 : 4, 0.14);
  sfx.chime(!!up);
  showMsg(`— ${c.kind === 'oculto' ? 'COFRE ESCONDIDO' : c.kind === 'jefe' ? 'TESORO DEL JEFE' : c.kind === 'guardian' ? 'TESORO DEL GUARDIÁN' : 'COFRE DE LA GUARIDA'} —\n${lines.join('\n')}`, up ? 3.4 : 2.4);
}

// ------------------------------------------------------------ drops: mon and onigiri
const PM = {
  coin: tagMat(M(0xffd060, { emissive: 0xc08a10, emissiveIntensity: 1.4, metalness: 0.8, roughness: 0.25 }), CLS.light),
  rice: tagMat(M(0xf4f0e6, { roughness: 0.9, emissive: 0x302c28 }), CLS.wood),
  nori: tagMat(M(0x101418, { roughness: 0.8 }), CLS.wood)
};
const COIN = new THREE.CylinderGeometry(0.2, 0.2, 0.06, 12), RICE = new THREE.ConeGeometry(0.28, 0.42, 3);
interface Pickup { m: THREE.Object3D; kind: 'mon' | 'onigiri'; value: number; life: number; vy: number; y: number }
const pickups: Pickup[] = [];
function addPickup(kind: Pickup['kind'], value: number, x: number, z: number) {
  const m = new THREE.Group();
  if (kind === 'mon') for (let i = 0; i < 3; i++) { const c = new THREE.Mesh(COIN, PM.coin); c.position.set(rnd(-0.12, 0.12), i * 0.07, rnd(-0.12, 0.12)); m.add(c); }
  else { const r = new THREE.Mesh(RICE, PM.rice); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI / 6; m.add(r); const n = new THREE.Mesh(GEO.box, PM.nori); n.scale.set(0.2, 0.18, 0.12); n.position.y = -0.1; m.add(n); }
  const y = surfaceY(x, z);
  m.position.set(x, y + 0.6, z); scene.add(m);
  pickups.push({ m, kind, value, life: 45, vy: 4, y });
}
/** what a slain oni leaves behind */
export function dropLoot(x: number, z: number, tier: number, big: boolean) {
  const mon = Math.round((big ? 120 : rnd(20, 50)) * (1 + tier) / 5) * 5;
  if (big || Math.random() < 0.5) addPickup('mon', mon, x + rnd(-0.6, 0.6), z + rnd(-0.6, 0.6));
  if (big || Math.random() < (player.hp < player.maxHp * 0.5 ? 0.45 : 0.22)) addPickup('onigiri', big ? 30 : 14, x + rnd(-0.8, 0.8), z + rnd(-0.8, 0.8));
}

// ------------------------------------------------------------ every frame
const OPEN_R = 2.3;
export function updateLoot(dt: number) {
  state.prompt = '';
  let near: Chest | null = null, nd = OPEN_R;
  for (const c of chests) {
    const d = Math.hypot(c.x - player.pos.x, c.z - player.pos.z);
    if (!c.g && d < 120) buildChest(c); else if (c.g && d > 170) dropChest(c);
    if (!c.g) continue;
    if (c.openT > 0 && c.openT < 1) {
      // the lid swings back on its hinge, overshoots a little and settles
      c.openT = Math.min(1, c.openT + dt * 1.9);
      const k = c.openT - 1, back = 1 + 2.4 * k * k * k + 1.4 * k * k;
      c.lid!.rotation.x = -1.9 * back;
      const loot = c.g.getObjectByName('loot');           // the mon flies out with the burst
      if (loot) { loot.scale.setScalar(Math.max(0.01, 1 - c.openT * 1.6)); loot.visible = c.openT < 0.62; }
    }
    const glow = c.g.getObjectByName('glow') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    glow.material.opacity = c.state === 'closed' ? 0.16 + 0.08 * Math.sin(state.time * 2.4 + c.x)
      : c.state === 'open' && c.openT < 1 ? 0.75 * (1 - c.openT) : 0;
    if (c.state !== 'open' && d < nd) { nd = d; near = c; }
  }
  if (near && !state.dead) state.prompt = near.state === 'sealed' ? (near.kind === 'guardian' ? 'sellado con un ofuda · vence a su guardián para abrirlo' : 'sellado con un ofuda · limpia la guarida para abrirlo') : '[ E ] o un tajo para abrir el cofre';
  nearest = near;
  // drops: pop up, settle, bob; drawn to you when close
  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i], m = p.m;
    p.life -= dt;
    const dx = player.pos.x - m.position.x, dz = player.pos.z - m.position.z, d = Math.hypot(dx, dz);
    if (d < 4.5 && d > 1e-3 && !state.dead) { const k = Math.min(d, 9 * dt); m.position.x += dx / d * k; m.position.z += dz / d * k; p.y = surfaceY(m.position.x, m.position.z); }
    p.vy -= 14 * dt; m.position.y = Math.max(p.y + 0.45 + Math.sin(state.time * 4 + i) * 0.08, m.position.y + p.vy * dt);
    m.rotation.y += dt * 2.5;
    m.visible = p.life > 5 || Math.floor(p.life * 6) % 2 === 0;
    if (d < 1.1 && !state.dead) {
      if (p.kind === 'mon') { addPoints(p.value, 'mon'); sfx.coin(); }
      else { player.hp = Math.min(player.maxHp, player.hp + p.value); state.gain = `+${p.value} vida`; state.gainT = 1.6; sfx.coin(true); }
      scene.remove(m); pickups.splice(i, 1);
    } else if (p.life <= 0) { scene.remove(m); pickups.splice(i, 1); }
  }
}
let nearest: Chest | null = null;
/** the katana hit whatever is in front (or all around, for a spin): closed chests burst open,
 *  sealed ones just ring. Returns how many chests were struck. */
export function hitChests(px: number, pz: number, face: number, reach: number, spin: boolean) {
  let n = 0;
  for (const c of chests) {
    if (!c.g || c.state === 'open') continue;
    const dx = c.x - px, dz = c.z - pz, d = Math.hypot(dx, dz);
    const ang = Math.abs(Math.atan2(Math.sin(Math.atan2(dx, dz) - face), Math.cos(Math.atan2(dx, dz) - face)));
    if (d > reach + (c.kind === 'jefe' ? 0.9 : 0.6) || (!spin && ang > 1.35)) continue;
    n++;
    if (c.state === 'closed') openChest(c);
    else {
      burst(new THREE.Vector3(c.x, c.g.position.y + 0.7, c.z), 0xfff0c0, 14, 4, 0.1);
      sealedMsg(c);
    }
  }
  return n;
}
/** the closest unopened chest within reach (the katana aims at it when no oni is around) */
export function chestInReach(px: number, pz: number, r: number) {
  let best: Chest | null = null, bd = r;
  for (const c of chests) { if (!c.g || c.state === 'open') continue; const d = Math.hypot(c.x - px, c.z - pz); if (d < bd) { bd = d; best = c; } }
  return best;
}
/** E pressed */
export function tryOpen() {
  if (!state.playing || state.dead || !nearest) return;
  if (nearest.state === 'closed') openChest(nearest);
  else if (nearest.state === 'sealed') sealedMsg(nearest);
}
const sealedMsg = (c: Chest) => showMsg(c.kind === 'guardian' ? 'el ofuda no se rompe mientras su guardián siga en pie' : 'el ofuda no se rompe mientras quede un oni en la guarida', 1.6);
