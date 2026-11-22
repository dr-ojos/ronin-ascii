// Oni: the kinds there are, the live list and spawning (mocap-rigged or procedural) at a camp.
// Their behaviour is in enemy-ai.ts; where they stand and when they appear, in encounters.ts.
import * as THREE from 'three';
import { rigGltf } from './assets';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createOniWarrior, type OniLook } from './rig';
import { scene } from './renderer';
import { ACTOR_LAYER } from './ascii';
import { M, CLS, tagTree } from './materials';
import { surfaceY } from './structures';
import { addLight, removeLights } from './lights';
import { rnd } from './utils';
import type { Camp, Enemy, EnemyKind } from './types';

/** every kind of oni: size, toughness, speed, how hard and how far it hits, its look and its worth */
export interface KindDef {
  name: string; scale: number; hp: number; speed: [number, number]; dmg: number; reach: number; windup: number;
  heavy: boolean; points: number; glyph: string; look: Omit<OniLook, 'big'>; robe: number; maskC: number;
  /** shoots instead of striking (keeps its distance) */
  ranged?: boolean;
  /** a sub-boss: guards a chest, glows with its own colour, its name shows over the life bar */
  elite?: { aura: number };
}
export const KINDS: Record<EnemyKind, KindDef> = {
  // the club-wielding oni: the common one
  oni:      { name: 'oni', scale: 1, hp: 3, speed: [2.8, 3.6], dmg: 11, reach: 1.55, windup: 0.55, heavy: false, points: 100, glyph: 'o',
              look: { tint: 0x23202a, mask: 0x8e1d14, weapon: 'club' }, robe: 0x6a2a6a, maskC: 0xe6ddc8 },
  // a quick spearman: weak, fast, strikes from further away with almost no warning
  ashigaru: { name: 'lancero', scale: 0.88, hp: 2, speed: [4.2, 4.8], dmg: 8, reach: 2.3, windup: 0.34, heavy: false, points: 120, glyph: 'y',
              look: { tint: 0x1c2a3a, mask: 0x2f5f8e, eye: 0xbfe8ff, weapon: 'spear' }, robe: 0x2a3a5a, maskC: 0x6a9ac8 },
  // an archer: keeps its distance and shoots arrows you can dodge (SPACE) or outrun
  arquero:  { name: 'arquero', scale: 0.92, hp: 2, speed: [3.2, 3.6], dmg: 9, reach: 13, windup: 0.9, heavy: false, points: 150, glyph: 'a',
              look: { tint: 0x2a2a18, mask: 0xc9a227, eye: 0xff4020, weapon: 'bow' }, robe: 0x5a5a2a, maskC: 0xe8c860 },
  // a brute: slow and tough, slams the ground around it (no facing needed: step back or dodge)
  bruto:    { name: 'bruto', scale: 1.28, hp: 7, speed: [2.0, 2.3], dmg: 20, reach: 2.6, windup: 0.85, heavy: true, points: 300, glyph: 'B',
              look: { tint: 0x1a2a1c, mask: 0x3f7a3a, eye: 0xfff060, weapon: 'bigclub' }, robe: 0x2a4a2a, maskC: 0x6aa860 },
  // the giant: guards the dangerous places
  jefe:     { name: 'jefe oni', scale: 1.5, hp: 14, speed: [2.2, 2.2], dmg: 24, reach: 2.1, windup: 0.75, heavy: true, points: 600, glyph: 'O',
              look: { tint: 0x3a1512, mask: 0x24302a, weapon: 'bigclub' }, robe: 0x8a1a14, maskC: 0xc0402a },
  // --- the sub-bosses that guard chests (encounters.ts) ---
  // a spear master: three lunges in a row, barely a breath between them, then a long pause (your turn)
  kensei:   { name: 'kensei de la lanza', scale: 1.14, hp: 9, speed: [4.6, 4.6], dmg: 13, reach: 2.5, windup: 0.42, heavy: false, points: 450, glyph: 'K',
              look: { tint: 0x101018, mask: 0xe8e0d0, eye: 0xff2040, weapon: 'spear' }, robe: 0x1a1a2a, maskC: 0xe8e0d0, elite: { aura: 0xbfe8ff } },
  // a tengu: shoots fans of arrows and vanishes in a gust when you get too close
  tengu:    { name: 'tengu de la niebla', scale: 1.06, hp: 7, speed: [4.0, 4.0], dmg: 10, reach: 15, windup: 0.75, heavy: false, points: 450, glyph: 'T', ranged: true,
              look: { tint: 0x1a1a22, mask: 0xc8201a, eye: 0xfff0a0, weapon: 'bow' }, robe: 0x6a1a14, maskC: 0xc8201a, elite: { aura: 0xff6a40 } },
  // the thunder oni: calls lightning down where you stand (marked on the ground first) and slams
  raijin:   { name: 'oni del trueno', scale: 1.4, hp: 12, speed: [2.4, 2.4], dmg: 18, reach: 2.2, windup: 0.8, heavy: true, points: 500, glyph: 'R',
              look: { tint: 0x141a2e, mask: 0x2a4aa8, eye: 0xcfe0ff, weapon: 'bigclub' }, robe: 0x1a2a5a, maskC: 0x4a6ad8, elite: { aura: 0x7fa8ff } }
};
export const ELITES: EnemyKind[] = ['kensei', 'tengu', 'raijin'];
export const isElite = (k: EnemyKind) => !!KINDS[k].elite;

const oniGeo = {
  robe: new THREE.ConeGeometry(0.55, 1.5, 7), head: new THREE.SphereGeometry(0.28, 12, 10),
  horn: new THREE.ConeGeometry(0.06, 0.28, 5), eye: new THREE.SphereGeometry(0.045, 6, 5),
  arm: new THREE.ConeGeometry(0.1, 0.8, 5), ring: new THREE.RingGeometry(0.85, 1.05, 28)
};
const hornMat = M(0xdccca2), eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
export const enemies: Enemy[] = [];

/** stats for one oni of a camp: tougher further from the shrine */
function stats(camp: Camp, kind: EnemyKind, x: number, z: number) {
  const k = KINDS[kind], t = camp.tier, hp = Math.round(k.hp * (1 + t * 0.8));
  return {
    kind, hp, maxHp: hp, dmg: Math.round(k.dmg * (1 + t * 0.3)), reach: k.reach, windup: k.windup, swings: 0, cd: 0,
    big: k.heavy || !!k.elite, speed: rnd(k.speed[0], k.speed[1]), camp, wander: { x, z }
  };
}
function place(g: THREE.Object3D, x: number, z: number, skip?: THREE.Object3D) {
  g.position.set(x, surfaceY(x, z), z); g.rotation.y = Math.random() * Math.PI * 2;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== skip) { o.castShadow = true; o.layers.enable(ACTOR_LAYER); } });
  tagTree(g, CLS.actor);
  scene.add(g);
}
export function spawnOni(camp: Camp, kind: EnemyKind, x: number, z: number) {
  if (rigGltf) return spawnRealOni(rigGltf, camp, kind, x, z);
  const def = KINDS[kind], g = new THREE.Group();
  const robeMat = M(def.robe, { roughness: 0.8, emissive: 0x000000 });
  const maskMat = M(def.maskC, { roughness: 0.6, emissive: 0x000000 });
  const robe = new THREE.Mesh(oniGeo.robe, robeMat); robe.position.y = 0.75; g.add(robe);
  const head = new THREE.Mesh(oniGeo.head, maskMat); head.position.y = 1.72; g.add(head);
  for (const s of [1, -1]) {
    const h = new THREE.Mesh(oniGeo.horn, hornMat); h.position.set(0.13 * s, 2.0, 0); h.rotation.z = -0.35 * s; g.add(h);
    const e = new THREE.Mesh(oniGeo.eye, eyeMat); e.position.set(0.1 * s, 1.76, 0.24); g.add(e);
    const a = new THREE.Mesh(oniGeo.arm, robeMat); a.position.set(0.48 * s, 1.05, 0.15); a.rotation.set(-1.1, 0, -0.5 * s); g.add(a);
  }
  const ring = new THREE.Mesh(oniGeo.ring, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  const k = def.scale * rnd(0.95, 1.05); g.scale.setScalar(k);
  place(g, x, z, ring);
  enemies.push({ g, robeMat, maskMat, ring, scale: k, ...stats(camp, kind, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10 });
  glow(enemies[enemies.length - 1]);
}
/** a sub-boss carries its own light */
function glow(en: Enemy) {
  const e = KINDS[en.kind].elite;
  if (e) en.aura = addLight({ x: en.g.position.x, y: en.g.position.y + 2, z: en.g.position.z, color: e.aura, intensity: 2.6, distance: 9, decay: 1.4, flicker: 0.6, owner: en });
}
/** take an oni out of the world (killed, or its camp left behind) */
export function despawn(en: Enemy) { scene.remove(en.g); removeLights(en); }

function spawnRealOni(gltf: GLTF, camp: Camp, kind: EnemyKind, x: number, z: number) {
  const def = KINDS[kind];
  const oni = createOniWarrior(gltf, { ...def.look, big: def.heavy });
  const g = oni.root;
  const k = def.scale * rnd(0.97, 1.03); g.scale.setScalar(k);
  place(g, x, z, oni.ring);
  enemies.push({ g, oni, ring: oni.ring, scale: k, move: 0, ...stats(camp, kind, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10 });
  glow(enemies[enemies.length - 1]);
}
