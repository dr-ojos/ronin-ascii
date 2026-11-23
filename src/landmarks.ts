// What you stumble upon in the wilds between the named places:
//  - oni camps (a bonfire, tents, crested banners and stakes) where encounters.ts puts its oni,
//  - small corners worth a detour: roadside hokora, rows of jizo, a fallen torii, a sacred tree,
//    a stone circle, a burnt farmhouse, a forgotten battlefield. Many hide a chest (loot.ts).
// All placed once from a fixed seed, before the masks are drawn, so trees keep clear of them.
import * as THREE from 'three';
import { M, CLS, tagMat } from './materials';
import { addCollider, isFree } from './physics';
import { addLight } from './lights';
import { campfire } from './campfire';
import { groundY } from './terrain';
import { WORLD_R, PLACES, ROADS, RIVER, FOOTPRINTS, inLake, lineDist, seeded, type P2 } from './map';
import { MT, G, TENT, add, box, post, pyr, stoneLantern, site, solidBox, disc } from './structures';

export interface CampSpot { x: number; z: number; size: number; r: number; tier: number; boss: boolean; chest: [number, number, number] }
export type PoiKind = 'hokora' | 'jizo' | 'torii' | 'arbol' | 'circulo' | 'ruina' | 'batalla';
export interface Poi { x: number; z: number; kind: PoiKind; name: string; glyph: string }
export const POI_NAMES: Record<PoiKind, [string, string]> = {
  hokora: ['hokora del camino', 'h'], jizo: ['jizos del bosque', 'j'], torii: ['torii caido', 'n'], arbol: ['arbol sagrado', 'Y'],
  circulo: ['circulo de piedras', 'o'], ruina: ['granja en ruinas', '#'], batalla: ['campo de batalla olvidado', 'x']
};

export const CAMP_SPOTS: CampSpot[] = [];
export const POIS: Poi[] = [];
/** hidden chests: [x, z, rotY] */
export const HIDDEN_CHESTS: [number, number, number][] = [];

const SAFE_R = 75;
const taken: [number, number, number][] = [];   // x, z, radius of everything placed so far
let R = seeded(4242);
const rnd = (a: number, b: number) => a + R() * (b - a);
const pick = <T,>(l: T[]) => l[Math.floor(R() * l.length)];

/** room for something of radius r here: dry, flat enough, off the roads, away from places and other things */
function spotOk(x: number, z: number, r: number, gap: number, roadGap = 6) {
  const d = Math.hypot(x, z);
  if (d < SAFE_R || d > WORLD_R - 25 - r) return false;
  if (inLake(x, z, r + 6) || lineDist(x, z, RIVER) < r + 8) return false;
  if (ROADS.some(rd => lineDist(x, z, rd) < r + roadGap)) return false;
  if (PLACES.some(p => p.flat > 0 && Math.hypot(x - p.x, z - p.z) < p.r + r + 12)) return false;
  const h = groundY(x, z);
  if (Math.abs(groundY(x + r, z) - h) > r * 0.35 || Math.abs(groundY(x, z + r) - h) > r * 0.35) return false;
  if (!isFree(x, z, r)) return false;
  return taken.every(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) > tr + r + gap);
}
const claim = (x: number, z: number, r: number) => { taken.push([x, z, r]); FOOTPRINTS.clearings.push([x, z, r + 2]); };
const local = (gx: number, gz: number, x: number, z: number) => groundY(gx + x, gz + z) - groundY(gx, gz);

// ------------------------------------------------------------ materials of their own
const MAT = {
  crest: tagMat(M(0x8e1d14, { roughness: 1, side: THREE.DoubleSide }), CLS.wood),
  hide: tagMat(M(0x5a4636, { roughness: 1, side: THREE.DoubleSide }), CLS.wood),
  bone: tagMat(M(0xd8ccb0, { roughness: 0.8 }), CLS.wood),
  moss: tagMat(M(0x5a6a4a, { roughness: 1, flatShading: true }), CLS.ground),
  bib: tagMat(M(0xc0281c, { roughness: 1, side: THREE.DoubleSide }), CLS.wood),
  paper: tagMat(M(0xf2eee0, { roughness: 1, side: THREE.DoubleSide, emissive: 0x302c24 }), CLS.wood),
  rope: tagMat(M(0xb8a070, { roughness: 1 }), CLS.wood),
  bark: tagMat(M(0x2e2420, { roughness: 1, flatShading: true }), CLS.wood),
  canopy: tagMat(M(0x264a30, { roughness: 1, flatShading: true }), CLS.foliage),
  charred: tagMat(M(0x18141a, { roughness: 1 }), CLS.wood),
  steel: tagMat(M(0x9aa0ac, { metalness: 0.8, roughness: 0.35 }), CLS.wood)
};

// ------------------------------------------------------------ oni camp
function campDecor(s: CampSpot) {
  const { x, z } = s, g = new THREE.Group(); g.position.set(x, groundY(x, z), z);
  // bonfire: crossed logs in a ring of stones, a flickering light you can see from far away
  campfire(g, x, g.position.y, z, 0.95);
  disc(x, z, 3);
  // hide tents around the fire, the camp's chest in front of the biggest one
  const tents = Math.min(3, 1 + Math.floor(s.size / 2)), a0 = rnd(0, Math.PI * 2);
  for (let i = 0; i < tents; i++) {
    const a = a0 + (i / tents) * Math.PI * 2, r = 6.5, tx = Math.cos(a) * r, tz = Math.sin(a) * r, ry = Math.atan2(-tx, -tz);
    const t = new THREE.Group(); t.position.set(tx, local(x, z, tx, tz), tz); t.rotation.y = ry; t.scale.setScalar(0.8); g.add(t);
    add(t, TENT, MAT.hide, 0, 0, 0, 1, 1, 1);
    post(t, 0.06, 2.4, MT.wood, 0, 0, -2.2); post(t, 0.06, 2.4, MT.wood, 0, 0, 2.2);
    solidBox(x + tx, z + tz, 2.6, 3.5, ry, false);
  }
  const ca = a0 + Math.PI / tents, cr = 3.4;
  s.chest = [x + Math.cos(ca) * cr, z + Math.sin(ca) * cr, Math.atan2(-Math.cos(ca), -Math.sin(ca))];
  // crested banners on tall poles, a few sharpened stakes with skulls
  const banners = 2 + Math.floor(s.size / 2);
  for (let i = 0; i < banners; i++) {
    const a = a0 + 0.6 + (i / banners) * Math.PI * 2, bx = Math.cos(a) * (s.r - 1), bz = Math.sin(a) * (s.r - 1), y = local(x, z, bx, bz);
    post(g, 0.07, 5, MT.black, bx, y, bz);
    add(g, G.plane, MAT.crest, bx + Math.cos(a + 1.57) * 0.45, y + 3.4, bz + Math.sin(a + 1.57) * 0.45, 0.85, 2.8, 1, -a);
    addCollider({ x: x + bx, z: z + bz, r: 0.2 });
  }
  for (let i = 0; i < 3 + s.size; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(s.r * 0.6, s.r), sx = Math.cos(a) * r, sz = Math.sin(a) * r, y = local(x, z, sx, sz);
    const st = add(g, G.cyl6, MT.woodL, sx, y + 0.8, sz, 0.18, 1.6, 0.18); st.rotation.set(rnd(-0.2, 0.2), 0, rnd(-0.2, 0.2));
    if (R() < 0.5) add(g, G.sphere, MAT.bone, sx, y + 1.7, sz, 0.32, 0.36, 0.34);
  }
  if (s.boss) {   // a war drum and a pile of bones: something big lives here
    const d = add(g, G.cyl, MAT.hide, -2.4, 0.7, 2.4, 1.4, 1.1, 1.4); d.rotation.z = 0.2;
    for (let i = 0; i < 6; i++) add(g, G.sphere, MAT.bone, 2.5 + rnd(-0.6, 0.6), 0.15, -2.2 + rnd(-0.6, 0.6), 0.5, 0.25, 0.35);
  }
  site(g, x, z, s.r + 6);
}

// ------------------------------------------------------------ corners of the world
function hokora(g: THREE.Group, x: number, z: number) {
  box(g, 1.8, 0.4, 1.4, MT.stone, 0, 0, 0);
  box(g, 1.0, 0.9, 0.8, MT.wood, 0, 0.4, 0);
  pyr(g, 1.6, 0.6, 1.3, MT.red, 0, 1.3, 0);
  box(g, 0.5, 0.25, 0.3, MT.gold, 0, 0.4, 0.55);        // offerings
  add(g, G.cyl, MAT.rope, 0, 1.25, 0.42, 1.0, 0.05, 0.05).rotation.z = Math.PI / 2;
  for (const s of [-1, 1]) stoneLantern(g, 1.6 * s, 0, 0.4, x + 1.6 * s, z + 0.4, 0.6, s > 0);
  addCollider({ x, z, r: 1 });
}
function jizo(g: THREE.Group, x: number, z: number) {
  const n = 3 + Math.floor(R() * 4);
  for (let i = 0; i < n; i++) {
    const lx = (i - (n - 1) / 2) * 0.95, y = local(x, z, lx, 0), k = rnd(0.8, 1.1);
    box(g, 0.7, 0.25, 0.6, MT.stoneD, lx, y, 0);
    add(g, new THREE.ConeGeometry(0.32, 0.8, 8), MAT.moss, lx, y + 0.65, 0, k, k, k);
    add(g, G.sphere, MT.stone, lx, y + 1.15 * k, 0, 0.36 * k, 0.38 * k, 0.36 * k);
    const bib = add(g, new THREE.ConeGeometry(0.34, 0.35, 8, 1, true), MAT.bib, lx, y + 0.86 * k, 0.02, k, k, k); bib.rotation.x = 0.1;
  }
  addCollider({ seg: [x - n * 0.48, z, x + n * 0.48, z], r: 0.45 });
}
function fallenTorii(g: THREE.Group, x: number, z: number) {
  add(g, G.cyl, MT.red, -2.3, 2.2, 0, 0.48, 4.4, 0.48).rotation.z = 0.06;                     // still standing
  const p = add(g, G.cyl, MT.red, 1.4, 0.3, 1.4, 0.48, 4.4, 0.48); p.rotation.set(Math.PI / 2, 0, 0.5);   // fallen
  const beam = box(g, 6.6, 0.32, 0.55, MT.black, 0.2, 0.2, -0.6); beam.rotation.set(0.1, 0.35, 0.32);   // the lintel, slid down
  box(g, 0.4, 0.4, 0.4, MT.stoneD, 2.3, 0, 0); box(g, 0.6, 0.3, 0.5, MT.stoneD, -1, 0, 1.5);
  addCollider({ x: x - 2.3, z, r: 0.35 }); addCollider({ seg: [x - 1.2, z - 1.6, x + 3, z + 0.9], r: 0.45 });
}
function sacredTree(g: THREE.Group, x: number, z: number) {
  add(g, new THREE.CylinderGeometry(0.9, 1.6, 12, 9), MAT.bark, 0, 6, 0, 1, 1, 1);
  for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI * 2 + 0.4, r = add(g, new THREE.ConeGeometry(0.6, 2.4, 6), MAT.bark, Math.cos(a) * 1.4, 0.5, Math.sin(a) * 1.4, 1, 1, 1); r.rotation.set(Math.sin(a) * 1.1, 0, -Math.cos(a) * 1.1); }
  for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; add(g, G.sphere, MAT.canopy, Math.cos(a) * 4, 12 + rnd(-1, 1.5), Math.sin(a) * 4, rnd(6, 8), rnd(3.5, 5), rnd(6, 8)); }
  add(g, G.sphere, MAT.canopy, 0, 14.5, 0, 8, 5, 8);
  // the shimenawa rope with its zigzag paper streamers
  add(g, new THREE.TorusGeometry(1.42, 0.16, 6, 24), MAT.rope, 0, 2.8, 0, 1, 1, 1).rotation.x = Math.PI / 2;
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; add(g, G.plane, MAT.paper, Math.cos(a) * 1.5, 2.35, Math.sin(a) * 1.5, 0.22, 0.7, 1, -a + Math.PI / 2); }
  stoneLantern(g, 0, 0, 3.2, x, z + 3.2, 0.7, true);
  addCollider({ x, z, r: 1.8 });
}
function stoneCircle(g: THREE.Group, x: number, z: number) {
  const n = 7 + Math.floor(R() * 3), r = 5.5;
  for (let i = 0; i < n; i++) {
    if (R() < 0.12) continue;   // one or two have fallen away
    const a = (i / n) * Math.PI * 2, sx = Math.cos(a) * r, sz = Math.sin(a) * r, h = rnd(1.8, 3.4);
    const s = box(g, rnd(0.7, 1.1), h, rnd(0.5, 0.8), MT.stoneD, sx, local(x, z, sx, sz) - 0.2, sz, -a);
    s.rotation.z = rnd(-0.12, 0.12);
    addCollider({ x: x + sx, z: z + sz, r: 0.55 });
  }
  box(g, 2.2, 0.5, 1.4, MT.stone, 0, 0, 0, rnd(0, 3)); addCollider({ x, z, r: 1.1 });
  add(g, G.sphere, MT.fire, 0, 0.62, 0, 0.25, 0.25, 0.25).castShadow = false;
  addLight({ x, y: groundY(x, z) + 1, z, color: 0x9ab8ff, intensity: 4, distance: 10, decay: 1.5, flicker: 0.4 });
}
function ruin(g: THREE.Group, x: number, z: number) {
  box(g, 7, 0.3, 5, MT.stoneD, 0, -0.1, 0);
  for (const [px, pz] of [[-3.2, -2.2], [3.2, -2.2], [-3.2, 2.2], [3.2, 2.2], [0, -2.2], [0, 2.2]] as P2[]) {
    if (R() < 0.25) continue;
    post(g, 0.16, rnd(0.8, 3), MAT.charred, px, 0.1, pz); addCollider({ x: x + px, z: z + pz, r: 0.25 });
  }
  const roof = box(g, 7.6, 0.25, 3.2, MT.thatch, -0.5, 0.5, 1.4); roof.rotation.set(0.5, 0.1, 0.22);
  for (let i = 0; i < 6; i++) box(g, rnd(0.4, 1.4), rnd(0.2, 0.5), rnd(0.3, 1), MAT.charred, rnd(-3, 3), 0.1, rnd(-2, 2), rnd(0, 3));
  box(g, 1.1, 0.8, 1.1, MT.wood, 2.4, 0.1, -1.2, 0.3);   // an old crate
  solidBox(x - 0.5, z + 1.4, 7.6, 2.4, 0, false);
}
function battlefield(g: THREE.Group, x: number, z: number) {
  for (let i = 0; i < 9; i++) {
    const a = rnd(0, Math.PI * 2), r = rnd(1, 7), sx = Math.cos(a) * r, sz = Math.sin(a) * r, y = local(x, z, sx, sz);
    if (i % 3 === 0) {   // a torn banner on a leaning pole
      const p = post(g, 0.06, 4, MT.black, sx, y, sz); p.rotation.set(rnd(-0.4, 0.4), 0, rnd(-0.4, 0.4));
      add(g, G.plane, MT.banner[i % 3], sx + 0.4, y + 2.8, sz, 0.75, rnd(1.2, 2.2), 1, a);
    } else {             // swords and spears stuck in the ground
      const b = box(g, 0.06, rnd(1, 1.6), 0.02, MAT.steel, sx, y - 0.1, sz, a); b.rotation.z = rnd(-0.35, 0.35);
      box(g, 0.22, 0.04, 0.06, MT.black, sx, y + b.scale.y * 0.75, sz, a);
    }
  }
  for (let i = 0; i < 4; i++) add(g, G.sphere, MT.black, rnd(-5, 5), 0.15, rnd(-5, 5), 0.55, 0.35, 0.55);   // fallen helmets
}
const BUILD: Record<PoiKind, [number, (g: THREE.Group, x: number, z: number) => void]> = {
  hokora: [3, hokora], jizo: [4, jizo], torii: [5, fallenTorii], arbol: [6, sacredTree], circulo: [7, stoneCircle], ruina: [6, ruin], batalla: [8, battlefield]
};
function placePoi(kind: PoiKind, x: number, z: number, ry: number) {
  const [r, build] = BUILD[kind];
  claim(x, z, r);
  const g = new THREE.Group(); g.position.set(x, groundY(x, z), z); g.rotation.y = ry;
  // builders work in un-rotated local space for colliders: keep them aligned (ry only for hokora, which faces its road)
  build(g, x, z);
  site(g, x, z, r + (kind === 'arbol' ? 20 : 4));
  const [name, glyph] = POI_NAMES[kind];
  POIS.push({ x, z, kind, name, glyph });
  // more than half of them hide a chest close by
  if (R() < 0.6) {
    for (let k = 0; k < 10; k++) {
      const a = rnd(0, Math.PI * 2), d = r + rnd(0.5, 2.5), cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
      if (!inLake(cx, cz, 2) && isFree(cx, cz, 0.8)) { HIDDEN_CHESTS.push([cx, cz, rnd(0, Math.PI * 2)]); break; }
    }
  }
}

/** place every camp, corner and hidden chest (call after buildStructures, before buildMasks) */
export function buildLandmarks() {
  R = seeded(4242);
  // camps: many small groups in the wilds, bigger the further from the shrine
  for (let tries = 0, start = CAMP_SPOTS.length; CAMP_SPOTS.length - start < 250 && tries < 20000; tries++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * WORLD_R, x = Math.cos(a) * d, z = Math.sin(a) * d;
    const tier = d / WORLD_R, size = 1 + Math.floor(R() * (1.6 + tier * 2.6)), r = 9 + size * 1.6;
    if (!spotOk(x, z, r, 42)) continue;
    claim(x, z, r);
    const s: CampSpot = { x, z, size, r, tier, boss: tier > 0.5 && R() < 0.12, chest: [x, z, 0] };
    campDecor(s); CAMP_SPOTS.push(s);
  }
  // roadside shrines: next to a road, facing it
  for (let tries = 0, n = 0; n < 26 && tries < 6000; tries++) {
    const road = pick(ROADS), i = Math.floor(R() * (road.pts.length - 2)), [ax, az] = road.pts[i], [bx, bz] = road.pts[i + 1];
    const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz) || 1, side = R() < 0.5 ? 1 : -1;
    const x = ax - dz / l * side * (road.width / 2 + 3.2), z = az + dx / l * side * (road.width / 2 + 3.2);
    if (!spotOk(x, z, 2.5, 60, 0.5)) continue;
    placePoi('hokora', x, z, 0); n++;
  }
  // the other corners, anywhere in the wilds
  const kinds: PoiKind[] = ['jizo', 'torii', 'arbol', 'circulo', 'ruina', 'batalla'];
  for (let tries = 0, n = 0; n < 84 && tries < 20000; tries++) {
    const kind = kinds[n % kinds.length], a = R() * Math.PI * 2, d = Math.sqrt(R()) * WORLD_R, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!spotOk(x, z, BUILD[kind][0], 30)) continue;
    placePoi(kind, x, z, 0); n++;
  }
  // and a few chests lying alone in the deep woods
  for (let tries = 0, n = 0; n < 28 && tries < 6000; tries++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * WORLD_R, x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!spotOk(x, z, 1.5, 25)) continue;
    claim(x, z, 1.5); HIDDEN_CHESTS.push([x, z, rnd(0, Math.PI * 2)]); n++;
  }
}
