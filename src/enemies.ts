// Oni: the kinds there are, the live list and spawning (mocap-rigged or procedural) at a camp.
// Their behaviour is in enemy-ai.ts; where they stand and when they appear, in encounters.ts.
import * as THREE from 'three';
import { rigGltf } from './assets';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createOniWarrior, oniDrum, oniScythe, type OniLook } from './rig';
import { oniCostume, oniMask } from './oni-costume';
import { scene } from './renderer';
import { ACTOR_LAYER } from './ascii';
import { M, CLS, tagTree } from './materials';
import { surfaceY } from './structures';
import { addLight, removeLights } from './lights';
import { clearEnemyAttack, type EnemyMove } from './enemy-moves';
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
  /** a major boss changes its attack cycle at half health */
  boss?: { aura: number; enraged: readonly EnemyMove[] };
  moves?: readonly EnemyMove[];
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
  escudero: { name: 'escudero oni', scale: 1.05, hp: 4, speed: [2.6, 3.0], dmg: 12, reach: 1.7, windup: 0.62, heavy: false, points: 180, glyph: 'E',
              look: { tint: 0x35322a, mask: 0xb99247, eye: 0xffe99c, weapon: 'club', shield: true }, robe: 0x5c4828, maskC: 0xb99247 },
  acechador: { name: 'acechador', scale: 0.85, hp: 3, speed: [4.7, 5.2], dmg: 13, reach: 1.5, windup: 0.55, heavy: false, points: 180, glyph: 'v',
               look: { tint: 0x261b24, mask: 0xcb392f, eye: 0xff7150, weapon: 'sword' }, robe: 0x55243c, maskC: 0xcb392f, moves: ['pounce'] },
  hechicero: { name: 'hechicero oni', scale: 0.98, hp: 3, speed: [2.9, 3.3], dmg: 15, reach: 11, windup: 0.95, heavy: false, points: 220, glyph: 'h', ranged: true,
               look: { tint: 0x372041, mask: 0xb267da, eye: 0xe3a6ff, weapon: 'staff' }, robe: 0x552f69, maskC: 0xb267da, moves: ['curse'] },
  guadanero: { name: 'guadañero', scale: 1.12, hp: 4, speed: [2.9, 3.3], dmg: 14, reach: 3.3, windup: 0.75, heavy: false, points: 220, glyph: 'g',
               look: { tint: 0x28473f, mask: 0x74ad8c, eye: 0xcdffd3, weapon: 'scythe' }, robe: 0x2c4b3e, maskC: 0x74ad8c,
               moves: ['hook', 'staffStrike'] },
  piromante: { name: 'piromante de las brasas', scale: 1.01, hp: 4, speed: [2.8, 3.2], dmg: 15, reach: 12, windup: 1, heavy: false, points: 250, glyph: 'f', ranged: true,
               look: { tint: 0x593221, mask: 0xed672d, eye: 0xffc160, weapon: 'staff', crest: 'halo' }, robe: 0x664129, maskC: 0xea6c2d, moves: ['fire'] },
  duelista: { name: 'duelista de marfil', scale: 1.12, hp: 6, speed: [3.8, 4.2], dmg: 16, reach: 3.2, windup: 0.8, heavy: false, points: 290, glyph: 'd',
              look: { tint: 0x344257, mask: 0xe5d9bf, eye: 0xffd194, weapon: 'sword', crest: 'crescent' }, robe: 0x384963, maskC: 0xe5d9bf,
              moves: ['riposte', 'blade'] },
  tambor: { name: 'tambor de guerra', scale: 1.14, hp: 6, speed: [2.7, 3.1], dmg: 15, reach: 3, windup: 0.8, heavy: false, points: 325, glyph: 'm',
            look: { tint: 0x423a18, mask: 0xd5a84f, eye: 0xccffa0, weapon: 'drum' }, robe: 0x585526, maskC: 0xd5a84f, moves: ['rally', 'staffStrike'] },
  sombra: { name: 'sombra del bambú', scale: 0.96, hp: 6, speed: [4.4, 4.9], dmg: 18, reach: 3, windup: 0.57, heavy: false, points: 340, glyph: 's',
            look: { tint: 0x251e3d, mask: 0x9577d1, eye: 0xe7bcff, weapon: 'sword', crest: 'feathers' }, robe: 0x352245, maskC: 0x9577d1,
            moves: ['shadowCut', 'pounce'] },
  coloso: { name: 'coloso de obsidiana', scale: 1.48, hp: 13, speed: [2.3, 2.6], dmg: 26, reach: 3.5, windup: 1, heavy: true, points: 490, glyph: 'Q',
            look: { tint: 0x22262d, mask: 0x48677d, eye: 0x8be8ff, weapon: 'bigclub', plated: true }, robe: 0x292e3b, maskC: 0x48677d,
            moves: ['shockwave', 'crush'] },
  // major bosses, with separate attack cycles for each phase
  jefe:     { name: 'oni sepulcral', scale: 1.58, hp: 21, speed: [2.4, 2.6], dmg: 25, reach: 3.3, windup: 0.67, heavy: true, points: 720, glyph: 'O',
              look: { tint: 0x3d1e12, mask: 0xad6037, eye: 0xffb353, weapon: 'bigclub' }, robe: 0x8a1a14, maskC: 0xc06038,
              moves: ['crush', 'slam'], boss: { aura: 0xff8a44, enraged: ['quake', 'crush', 'slam'] } },
  kuro:     { name: 'señor Kuro', scale: 1.44, hp: 31, speed: [3.6, 3.8], dmg: 26, reach: 3.6, windup: 0.64, heavy: true, points: 1100, glyph: 'D',
              look: { tint: 0x281e24, mask: 0x9a2830, eye: 0xff503d, weapon: 'sword', crest: 'crescent' }, robe: 0x301923, maskC: 0xac382b,
              moves: ['bladeRush', 'blade', 'blade'], boss: { aura: 0xff453c, enraged: ['whirlwind', 'bladeRush', 'blade', 'bladeRush'] } },
  tenguMayor: { name: 'tengu de los Cinco Vientos', scale: 1.36, hp: 23, speed: [3.5, 3.7], dmg: 17, reach: 15, windup: 0.83, heavy: false, points: 900, glyph: 'V', ranged: true,
                look: { tint: 0x193f39, mask: 0x57bba5, eye: 0xc0ffbe, weapon: 'bow', tengu: true, crest: 'feathers' }, robe: 0x1d5447, maskC: 0x70cdad,
                moves: ['arrows', 'gust'], boss: { aura: 0x74ffd1, enraged: ['arrowStorm', 'gust', 'arrows', 'gust'] } },
  raijinMayor: { name: 'Raijin de la Cumbre', scale: 1.6, hp: 28, speed: [2.7, 2.9], dmg: 25, reach: 3.8, windup: 0.9, heavy: true, points: 1000, glyph: 'J',
                 look: { tint: 0x222f6c, mask: 0x6876d8, eye: 0xd0eaff, weapon: 'bigclub', crest: 'halo' }, robe: 0x222f6c, maskC: 0x8695df,
                 moves: ['thunder', 'slam', 'crush'], boss: { aura: 0x8ca9ff, enraged: ['storm', 'quake', 'thunder'] } },
  // --- the sub-bosses that guard chests (encounters.ts) ---
  // a spear master: three lunges in a row, barely a breath between them, then a long pause (your turn)
  kensei:   { name: 'kensei de la lanza', scale: 1.14, hp: 9, speed: [4.6, 4.6], dmg: 13, reach: 2.5, windup: 0.42, heavy: false, points: 450, glyph: 'K',
              look: { tint: 0x101018, mask: 0xe8e0d0, eye: 0xff2040, weapon: 'spear' }, robe: 0x1a1a2a, maskC: 0xe8e0d0, elite: { aura: 0xbfe8ff } },
  // a tengu: shoots fans of arrows and vanishes in a gust when you get too close
  tengu:    { name: 'tengu de la niebla', scale: 1.06, hp: 7, speed: [4.0, 4.0], dmg: 10, reach: 15, windup: 0.75, heavy: false, points: 450, glyph: 'T', ranged: true,
              look: { tint: 0x1a1a22, mask: 0xc8201a, eye: 0xfff0a0, weapon: 'bow', tengu: true }, robe: 0x6a1a14, maskC: 0xc8201a, elite: { aura: 0xff6a40 } },
  // the thunder oni: calls lightning down where you stand (marked on the ground first) and slams
  raijin:   { name: 'oni del trueno', scale: 1.4, hp: 12, speed: [2.4, 2.4], dmg: 18, reach: 2.2, windup: 0.8, heavy: true, points: 500, glyph: 'R',
              look: { tint: 0x141a2e, mask: 0x2a4aa8, eye: 0xcfe0ff, weapon: 'bigclub' }, robe: 0x1a2a5a, maskC: 0x4a6ad8, elite: { aura: 0x7fa8ff } }
};
export const ELITES: EnemyKind[] = ['kensei', 'tengu', 'raijin'];
export const isElite = (k: EnemyKind) => !!KINDS[k].elite;
export const isBoss = (k: EnemyKind) => !!KINDS[k].boss;

const oniGeo = {
  robe: new THREE.CylinderGeometry(0.247, 0.221, 0.59, 14), neck: new THREE.CylinderGeometry(0.063, 0.086, 0.16, 10),
  arm: new THREE.CapsuleGeometry(0.075, 0.47, 4, 9), leg: new THREE.CylinderGeometry(0.105, 0.075, 0.79, 10),
  sandal: new THREE.SphereGeometry(1, 10, 7), ring: new THREE.RingGeometry(0.85, 1.05, 28),
  shield: new THREE.CylinderGeometry(0.46, 0.46, 0.1, 8).rotateX(Math.PI / 2),
  staff: new THREE.CylinderGeometry(0.04, 0.04, 1.95, 6), crystal: new THREE.OctahedronGeometry(0.19),
  blade: new THREE.BoxGeometry(0.1, 1.1, 0.055), hilt: new THREE.BoxGeometry(0.28, 0.08, 0.09)
};
const hornMat = M(0xdccca2), bladeMat = M(0xdbe4ed, { metalness: 0.7 }), bootMat = M(0x2e2426);
export const enemies: Enemy[] = [];

/** Regional danger and acquired gear scale independently. */
function stats(camp: Camp, kind: EnemyKind, x: number, z: number) {
  const k = KINDS[kind], t = camp.tier;
  const hp = Math.round(k.hp * (1 + t * 0.8) * (1 + (camp.threat?.offense ?? 0) * 0.16));
  const dmg = Math.round(k.dmg * (1 + t * 0.3) * (1 + (camp.threat?.defense ?? 0) * 0.11));
  return {
    kind, hp, maxHp: hp, dmg, reach: k.reach, windup: k.windup, swings: 0, strikeT: 0, cd: 0,
    big: k.heavy || !!k.elite || !!k.boss, enraged: false, speed: rnd(k.speed[0], k.speed[1]), camp, wander: { x, z }
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
  const look = { ...def.look, big: def.heavy, mask: def.maskC };
  const baseMask = oniMask(look.mask), maskMat = baseMask.clone();
  const { head, chest, belt } = oniCostume(look);
  head.traverse(o => { const part = o as THREE.Mesh; if (part.material === baseMask) part.material = maskMat; });
  head.position.set(0, 1.665, 0.015);
  chest.position.y = 1.48;
  belt.position.y = 0.93;
  const robe = new THREE.Mesh(oniGeo.robe, robeMat); robe.position.y = 1.19; robe.scale.z = 0.72;
  const neck = new THREE.Mesh(oniGeo.neck, robeMat); neck.position.y = 1.52;
  g.add(robe, neck, head, chest, belt);
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(oniGeo.arm, robeMat); a.position.set(0.29 * s, 1.165, 0.08); a.rotation.set(-0.35, 0, 0.12 * s);
    const leg = new THREE.Mesh(oniGeo.leg, robeMat); leg.position.set(0.118 * s, 0.48, 0.04 * s); leg.rotation.z = 0.08 * s;
    const foot = new THREE.Mesh(oniGeo.sandal, bootMat); foot.position.set(0.149 * s, 0.052, 0.065 + 0.04 * s); foot.scale.set(0.071, 0.052, 0.122);
    g.add(a, leg, foot);
  }
  if (def.look.shield) {
    const shield = new THREE.Mesh(oniGeo.shield, maskMat); shield.position.set(0.43, 1.02, 0.47); g.add(shield);
  }
  if (def.look.weapon === 'staff') {
    const staff = new THREE.Mesh(oniGeo.staff, robeMat); staff.position.set(-0.55, 1.05, 0.33); g.add(staff);
    const gem = new THREE.Mesh(oniGeo.crystal, maskMat); gem.position.set(-0.55, 2.13, 0.33); g.add(gem);
  } else if (def.look.weapon === 'sword') {
    const sword = new THREE.Group();
    const blade = new THREE.Mesh(oniGeo.blade, bladeMat); blade.position.y = 0.6; sword.add(blade);
    sword.add(new THREE.Mesh(oniGeo.hilt, hornMat));
    sword.position.set(-0.54, 1, 0.32); sword.rotation.set(0.65, 0, 0.35); g.add(sword);
  } else if (def.look.weapon === 'scythe') {
    const scythe = oniScythe(); scythe.position.set(-0.57, 1.05, 0.21); scythe.rotation.z = 0.22; g.add(scythe);
  } else if (def.look.weapon === 'drum') {
    const drum = oniDrum(maskMat); drum.position.set(0, 1.05, 0.4); g.add(drum);
  }
  const ring = new THREE.Mesh(oniGeo.ring, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  const k = def.scale * rnd(0.95, 1.05); g.scale.setScalar(k);
  place(g, x, z, ring);
  enemies.push({ g, robeMat, maskMat, ring, scale: k, ...stats(camp, kind, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10 });
  glow(enemies[enemies.length - 1]);
}
/** bosses and guardians carry their own light */
function glow(en: Enemy) {
  const def = KINDS[en.kind], e = def.boss ?? def.elite;
  if (e) en.aura = addLight({ x: en.g.position.x, y: en.g.position.y + 2, z: en.g.position.z, color: e.aura, intensity: 2.6, distance: 9, decay: 1.4, flicker: 0.6, owner: en });
}
/** take an oni out of the world (killed, or its camp left behind) */
export function despawn(en: Enemy) { clearEnemyAttack(en); scene.remove(en.g); removeLights(en); }

function spawnRealOni(gltf: GLTF, camp: Camp, kind: EnemyKind, x: number, z: number) {
  const def = KINDS[kind];
  const oni = createOniWarrior(gltf, { ...def.look, big: def.heavy });
  const g = oni.root;
  const k = def.scale * rnd(0.97, 1.03); g.scale.setScalar(k);
  place(g, x, z, oni.ring);
  enemies.push({ g, oni, ring: oni.ring, scale: k, move: 0, ...stats(camp, kind, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10 });
  glow(enemies[enemies.length - 1]);
}
