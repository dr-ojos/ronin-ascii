// Rewards. Chests: one in every camp (sealed with an ofuda until the camp is cleared), a lacquered one
// where a giant lives, and plain ones hidden near the corners of the wilds. Walk up and press E:
// mon (points), healing and often an upgrade (upgrades.ts). Slain oni also drop mon and onigiri.
import * as THREE from 'three';
import { scene } from './renderer';
import { M, CLS, tagMat, shadowTree } from './materials';
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
  addCollider({ x, z, r: kind === 'jefe' ? 0.9 : 0.7 });
  chests.push(c);
  return c;
}

// ------------------------------------------------------------ the chest model
const CM = {
  red: tagMat(M(0x8e1d14, { roughness: 0.35, metalness: 0.1 }), CLS.wood),
  black: tagMat(M(0x141216, { roughness: 0.3, metalness: 0.2 }), CLS.wood),
  wood: tagMat(M(0x5a3e28, { roughness: 0.9 }), CLS.wood),
  gold: tagMat(M(0xffd060, { emissive: 0xb07a10, emissiveIntensity: 1.2, metalness: 0.7, roughness: 0.3 }), CLS.light),
  paper: tagMat(M(0xf2eee0, { roughness: 1, side: THREE.DoubleSide, emissive: 0x3a1a10 }), CLS.wood),
  glow: tagMat(new THREE.MeshBasicMaterial({ color: 0xffd060, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx)
};
const BOX = new THREE.BoxGeometry(1, 1, 1);
const part = (p: THREE.Object3D, m: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
  const o = new THREE.Mesh(BOX, m); o.position.set(x, y, z); o.scale.set(sx, sy, sz); p.add(o); return o;
};
function buildChest(c: Chest) {
  const g = new THREE.Group(), body = c.kind === 'jefe' ? CM.black : c.kind === 'oculto' ? CM.wood : CM.red;
  part(g, body, 0, 0.3, 0, 1.1, 0.6, 0.7);
  for (const x of [-0.38, 0.38]) part(g, CM.gold, x, 0.3, 0, 0.08, 0.62, 0.72);
  const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.35); g.add(lid);
  part(lid, body, 0, 0.12, 0.35, 1.12, 0.24, 0.72);
  for (const x of [-0.38, 0.38]) part(lid, CM.gold, x, 0.12, 0.35, 0.08, 0.26, 0.74);
  part(lid, CM.gold, 0, 0.02, 0.72, 0.16, 0.18, 0.05);               // lock
  if (c.state === 'sealed') { const seal = part(g, CM.paper, 0, 0.42, 0.36, 0.22, 0.55, 0.01); seal.name = 'seal'; }
  const glow = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), CM.glow.clone()); glow.position.y = 0.75; glow.scale.set(1, 0.6, 0.8); glow.name = 'glow'; g.add(glow);
  if (c.kind === 'jefe') g.scale.setScalar(1.35);
  shadowTree(g); glow.castShadow = false;
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
  const mon = Math.round((c.kind === 'jefe' ? 500 : c.kind === 'oculto' ? 220 : 120) * (1 + c.tier * 1.5) / 10) * 10;
  addPoints(mon, 'mon del cofre'); lines.push(`+${mon} mon`);
  if (c.kind !== 'oculto') { const h = c.kind === 'jefe' ? 50 : 30; player.hp = Math.min(player.maxHp, player.hp + h); lines.push(`+${h} vida`); }
  const chance = c.kind === 'jefe' ? 1 : c.kind === 'oculto' ? 0.75 : 0.4;
  const up = Math.random() < chance ? rollUpgrade() : null;
  if (up) { grant(up); lines.push(`${UPGRADES[up].name} ${roman(lvl(up))}`, UPGRADES[up].desc); }
  const y = c.g ? c.g.position.y : surfaceY(c.x, c.z);
  burst(new THREE.Vector3(c.x, y + 0.9, c.z), 0xffd060, up ? 120 : 60, up ? 6 : 4, 0.14);
  sfx.chime(!!up);
  showMsg(`— ${c.kind === 'oculto' ? 'COFRE ESCONDIDO' : c.kind === 'jefe' ? 'TESORO DEL JEFE' : 'COFRE DE LA GUARIDA'} —\n${lines.join('\n')}`, up ? 3.4 : 2.4);
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
  else { const r = new THREE.Mesh(RICE, PM.rice); r.rotation.x = Math.PI / 2; r.rotation.z = Math.PI / 6; m.add(r); const n = new THREE.Mesh(BOX, PM.nori); n.scale.set(0.2, 0.18, 0.12); n.position.y = -0.1; m.add(n); }
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
    if (c.openT > 0 && c.openT < 1) { c.openT = Math.min(1, c.openT + dt * 2.2); c.lid!.rotation.x = -1.9 * (1 - Math.pow(1 - c.openT, 3)); }
    const glow = c.g.getObjectByName('glow') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    glow.material.opacity = c.state === 'closed' ? 0.18 + 0.1 * Math.sin(state.time * 3 + c.x) : 0;
    if (c.state !== 'open' && d < nd) { nd = d; near = c; }
  }
  if (near && !state.dead) state.prompt = near.state === 'sealed' ? 'sellado con un ofuda · limpia la guarida para abrirlo' : '[ E ] abrir el cofre';
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
/** E pressed */
export function tryOpen() {
  if (!state.playing || state.dead || !nearest) return;
  if (nearest.state === 'closed') openChest(nearest);
  else if (nearest.state === 'sealed') showMsg('el ofuda no se rompe mientras quede un oni en la guarida', 1.6);
}
