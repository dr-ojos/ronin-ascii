// The two big places of the far lands:
//  - Asagiri, a market town: two crossing streets lined with two-storey machiya, back lanes of
//    thatched cottages, a plaza with a fire-watch tower and market stalls, gates and a temple.
//  - the ruins of Takamori castle: a moat with one causeway, broken outer and inner walls, fallen
//    corner towers and the burnt shell of the keep on its huge stone base. Oni have moved in.
// Both are built from hundreds of small pieces and then baked into one mesh per material, so a whole
// town costs a couple of dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, CLS, tagMat } from './materials';
import { addCollider } from './physics';
import { addLight } from './lights';
import { groundY } from './terrain';
import { place, seeded, FOOTPRINTS, type Line } from './map';
import { MT, G, add, box, post, pyr, hangingLantern, stoneLantern, miniShrine, torii, solidBox, disc, site, ribbon, toWorld, type Obj } from './structures';
import { CAMP_SPOTS } from './landmarks';

const TAU = Math.PI * 2;
let R = seeded(9917);
const rnd = (a: number, b: number) => a + R() * (b - a);
const pick = <T,>(l: T[]) => l[Math.floor(R() * l.length)];

const MAT = {
  charred: tagMat(M(0x17131a, { roughness: 1, flatShading: true }), CLS.wood),
  moss: tagMat(M(0x4a5a3e, { roughness: 1, flatShading: true }), CLS.ground),
  wisp: tagMat(M(0x9ff0ff, { emissive: 0x6fd8ff, emissiveIntensity: 2.2 }), CLS.light),
  noren: [0x1c2a4a, 0x7a1c16, 0x2e4a2a, 0xd8d0b8].map(c => tagMat(M(c, { roughness: 1, side: THREE.DoubleSide }), CLS.wood)),
  awning: [0xb3261e, 0xe8e0cc, 0x3a5a8a, 0xc08a2a].map(c => tagMat(M(c, { roughness: 1, side: THREE.DoubleSide }), CLS.wood)),
  crate: tagMat(M(0x7a5a3a, { roughness: 1 }), CLS.wood)
};
/** gable roof: triangular prism, base 1 x 1 at y = 0, apex at y = 1, ridge along local z */
const PRISM = (() => {
  const g = new THREE.CylinderGeometry(1, 1, 1, 3, 1).rotateX(-Math.PI / 2).translate(0, 0.5, 0);
  g.scale(1 / Math.sqrt(3), 1 / 1.5, 1); return g;
})();
const roof = (p: Obj, across: number, h: number, along: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => add(p, PRISM, mat, x, y, z, across, h, along, ry);

/** one mesh per material: a whole town becomes a couple of dozen draw calls */
function bake(g: THREE.Group) {
  g.updateMatrixWorld(true);
  const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
  g.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || (m as THREE.InstancedMesh).isInstancedMesh) return;
    const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
    for (const k of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(k)) geo.deleteAttribute(k);
    const mat = m.material as THREE.Material; let l = byMat.get(mat); if (!l) byMat.set(mat, l = []); l.push(geo);
  });
  const out = new THREE.Group();
  for (const [mat, geos] of byMat) {
    const merged = mergeGeometries(geos, false); geos.forEach(x => x.dispose());
    if (merged) out.add(new THREE.Mesh(merged, mat));
  }
  return out;
}

// ------------------------------------------------------------ the town of Asagiri
/** a two-storey town house with a lattice front, a shop curtain and a tiled gable roof (front = local +z) */
function machiya(p: Obj, x: number, y: number, z: number, ry: number, w: number, d: number, lit: boolean, wx: number, wz: number) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  box(g, w + 0.3, 0.35, d + 0.3, MT.stone, 0, -0.15, 0);
  box(g, w, 3, d, MT.wood, 0, 0.2, 0);
  const door = rnd(-w / 4, w / 4);
  if (lit) add(g, G.plane, MT.shoji, -door * 0.5 + (door > 0 ? -w / 4 : w / 4), 1.6, d / 2 + 0.03, w * 0.42, 2.1, 1);
  else for (let sx = -w / 2 + 0.3; sx < w / 2 - 0.2; sx += 0.32) if (Math.abs(sx - door) > 0.8) box(g, 0.07, 2.5, 0.07, MT.woodL, sx, 0.35, d / 2 + 0.05);
  add(g, G.plane, pick(MAT.noren), door, 2.45, d / 2 + 0.08, 1.4, 0.9, 1);                     // noren over the door
  const eave = box(g, w + 0.6, 0.12, 1.5, MT.roof, 0, 3.15, d / 2 + 0.55); eave.rotation.x = 0.32;  // pent roof
  box(g, w - 0.2, 2.3, d - 1.4, R() < 0.5 ? MT.plaster : MT.wood, 0, 3.2, -0.7);
  add(g, G.plane, MT.shojiDark, 0, 4.35, d / 2 - 1.38, w * 0.6, 0.9, 1);                        // mushiko window
  roof(g, d - 1.4 + 1.8, 1.9, w + 1.1, MT.roof, 0, 5.45, -0.7, Math.PI / 2);
  box(g, w + 1.1, 0.22, 0.4, MT.roofL, 0, 7.25, -0.7);
  if (R() < 0.55) { box(g, 0.55, 1.7, 0.08, MT.woodL, door + 1.2, 0.8, d / 2 + 0.25); }       // shop sign board
  if (lit) {
    hangingLantern(g, door - 0.9, 2.3, d / 2 + 0.85, 0.5);
    const [lx, lz] = toWorld(wx, wz, ry, door, d / 2 + 1.5);
    addLight({ x: lx, y: groundY(lx, lz) + 2.2, z: lz, color: 0xffa050, intensity: 4.5, distance: 11, decay: 1.4 });
  }
  solidBox(wx, wz, w + 0.3, d + 0.3, ry);
}
/** a thatched cottage for the back lanes */
function cottage(p: Obj, x: number, y: number, z: number, ry: number, w: number, d: number, lit: boolean, wx: number, wz: number) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  box(g, w + 0.6, 0.35, d + 0.6, MT.stone, 0, -0.15, 0);
  box(g, w, 2.4, d, MT.wood, 0, 0.2, 0);
  add(g, G.plane, lit ? MT.shoji : MT.shojiDark, 0, 1.4, d / 2 + 0.03, w * 0.55, 1.6, 1);
  pyr(g, w + 2.2, 3, d + 2.2, MT.thatch, 0, 2.55, 0);
  box(g, w * 0.45, 0.3, 0.45, MT.thatch, 0, 5.45, 0);
  if (R() < 0.4) { const b = add(g, G.cyl, MT.woodL, w / 2 + 0.8, 0.6, d / 2 - 0.4, 0.7, 0.8, 0.7); void b; }
  solidBox(wx, wz, w + 0.6, d + 0.6, ry);
}
function marketStall(p: Obj, x: number, y: number, z: number, ry: number, wx: number, wz: number) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  for (const sx of [-1.3, 1.3]) for (const sz of [-0.9, 0.9]) post(g, 0.06, 2.2, MT.woodL, sx, 0, sz);
  box(g, 2.8, 0.12, 1.9, MT.woodL, 0, 0.85, 0);
  const aw = add(g, G.plane, pick(MAT.awning), 0, 2.3, 0.2, 3.2, 2.4, 1); aw.rotation.x = -Math.PI / 2 + 0.3;
  for (let i = 0; i < 4; i++) box(g, rnd(0.35, 0.6), rnd(0.25, 0.45), rnd(0.35, 0.5), R() < 0.5 ? MAT.crate : MT.woodL, rnd(-1, 1), 0.97, rnd(-0.6, 0.6));
  add(g, G.cyl, MAT.crate, 1.8, 0.4, 0.6, 0.6, 0.8, 0.6);
  addCollider({ x: wx, z: wz, r: 1.6 });
}
function townGate(p: Obj, x: number, y: number, z: number, ry: number, wx: number, wz: number) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  for (const s of [-1, 1]) {
    post(g, 0.22, 4.4, MT.black, s * 4.6, 0, 0);
    const [cx, cz] = toWorld(wx, wz, ry, s * 4.6, 0); addCollider({ x: cx, z: cz, r: 0.35 });
    hangingLantern(g, s * 3.6, 3.1, 0.6, 0.62);
  }
  box(g, 10.6, 0.35, 0.5, MT.black, 0, 4.0, 0);
  roof(g, 1.8, 0.8, 11.4, MT.roof, 0, 4.35, 0, Math.PI / 2);
  box(g, 1.4, 0.7, 0.12, MT.woodL, 0, 3.15, 0.3);                     // name board
  addLight({ x: wx, y: groundY(wx, wz) + 3, z: wz, color: 0xffa050, intensity: 5, distance: 13, decay: 1.4 });
}
function watchTower(p: Obj, x: number, y: number, z: number) {
  const g = new THREE.Group(); g.position.set(x, y, z); p.add(g);
  for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) { const l = add(g, G.cyl, MT.wood, sx, 6.5, sz, 0.28, 13, 0.28); l.rotation.set(-sz * 0.03, 0, sx * 0.03); }
  for (const h of [3.5, 7, 10.5]) { box(g, 3.2, 0.12, 0.12, MT.woodL, 0, h, 1.35); box(g, 3.2, 0.12, 0.12, MT.woodL, 0, h, -1.35); box(g, 0.12, 0.12, 3.2, MT.woodL, 1.35, h, 0); box(g, 0.12, 0.12, 3.2, MT.woodL, -1.35, h, 0); }
  box(g, 3.6, 0.2, 3.6, MT.woodL, 0, 12.6, 0);
  for (const [sx, sz, w, d] of [[0, 1.7, 3.6, 0.1], [0, -1.7, 3.6, 0.1], [1.7, 0, 0.1, 3.6], [-1.7, 0, 0.1, 3.6]]) box(g, w, 1, d, MT.woodL, sx, 12.8, sz);
  pyr(g, 4.6, 1.8, 4.6, MT.roof, 0, 14.4, 0);
  for (let k = 0; k < 4; k++) post(g, 0.08, 1.6, MT.wood, k < 2 ? -1.6 : 1.6, 12.8, k % 2 ? -1.6 : 1.6);
  add(g, G.sphere, MT.gold, 0, 13.9, 0, 0.55, 0.7, 0.55);           // the fire bell
}

function buildTown() {
  R = seeded(9917);
  const pl = place('pueblo'), cx = pl.x, cz = pl.z, L = pl.level!, g = new THREE.Group(); g.position.set(cx, L, cz);
  const ly = (x: number, z: number) => groundY(cx + x, cz + z) - L;
  const HALF_ST = 106, ST = 8, BACK = 44;
  // streets: gravel, no grass
  const street = (x: number, z: number, w: number, d: number) => {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(w, d), MT.gravel); s.rotation.x = -Math.PI / 2; s.position.set(x, ly(x, z) + 0.04, z); g.add(s);
    FOOTPRINTS.rects.push([cx + x, cz + z, w, d, 0]);
  };
  street(0, 0, HALF_ST * 2, ST); street(0, 0, ST, HALF_ST * 2);
  for (const s of [-1, 1]) street(0, s * BACK, HALF_ST * 1.7, 5);
  street(0, 0, 32, 32);                                                           // plaza
  // machiya rows along both main streets, contiguous like a real town
  const rowAlong = (axis: 'x' | 'z', side: number) => {
    for (let t = -HALF_ST + 4; t < HALF_ST - 4;) {
      const w = rnd(6.5, 9), d = rnd(9, 11.5), c = t + w / 2;
      t += w + rnd(0.3, 1.2);
      if (Math.abs(c) < 20 + w / 2) continue;                                       // plaza and the other street
      const off = ST / 2 + 0.9 + d / 2;
      const [x, z] = axis === 'x' ? [c, side * off] : [side * off, c];
      const ry = axis === 'x' ? (side < 0 ? 0 : Math.PI) : (side < 0 ? Math.PI / 2 : -Math.PI / 2);
      if (axis === 'z' && Math.abs(Math.abs(c) - BACK) < w / 2 + 3.5) continue;     // leave the back lanes open
      machiya(g, x, ly(x, z), z, ry, w, Math.min(d, BACK - ST / 2 - 5), R() < 0.55, cx + x, cz + z);
    }
  };
  rowAlong('x', -1); rowAlong('x', 1); rowAlong('z', -1); rowAlong('z', 1);
  // back lanes of thatched cottages
  for (const lane of [-1, 1]) for (const side of [-1, 1]) {
    for (let x = -HALF_ST * 0.82; x < HALF_ST * 0.82; x += rnd(10, 14)) {
      if (Math.abs(x) < 23 || R() < 0.15) continue;
      const w = rnd(5.5, 7.5), d = rnd(5, 6.5), z = lane * BACK + side * (2.5 + 1 + d / 2);
      if (Math.abs(z) < ST / 2 + 13) continue;                                     // the machiya behind
      cottage(g, x, ly(x, z), z, side > 0 ? 0 : Math.PI, w, d, R() < 0.5, cx + x, cz + z);
    }
  }
  // the plaza: well, fire-watch tower, notice board, market stalls, stone lanterns
  add(g, G.cyl, MT.stone, 0, 0.45, 0, 2.4, 0.9, 2.4); for (const s of [-1, 1]) post(g, 0.08, 2.4, MT.wood, s * 1, 0, 0);
  pyr(g, 2.8, 0.9, 2.2, MT.roof, 0, 2.3, 0); addCollider({ x: cx, z: cz, r: 1.4 });
  watchTower(g, 11, ly(11, -11), -11); for (const sx of [-1.4, 1.4]) for (const sz of [-1.4, 1.4]) addCollider({ x: cx + 11 + sx, z: cz - 11 + sz, r: 0.35 });
  box(g, 3.4, 0.5, 0.25, MT.wood, -11, 2.0, -12.5); for (const s of [-1, 1]) post(g, 0.1, 2.6, MT.wood, -11 + s * 1.5, 0, -12.5);
  add(g, G.plane, MT.cloth, -11, 1.6, -12.35, 3, 0.9, 1); addCollider({ x: cx - 11, z: cz - 12.5, r: 1.6 });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.39, r = 10.5, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.hypot(x - 11, z + 11) < 5 || Math.hypot(x + 11, z + 12.5) < 4) continue;
    marketStall(g, x, ly(x, z), z, Math.atan2(-x, -z), cx + x, cz + z);
  }
  for (const sx of [-14, 14]) for (const sz of [-14, 14]) if (!(sx > 0 && sz < 0)) stoneLantern(g, sx, ly(sx, sz), sz, cx + sx, cz + sz, 1.1);
  addLight({ x: cx, y: L + 3, z: cz, color: 0xff9040, intensity: 9, distance: 24, decay: 1.3, flicker: 0.3 });
  // gates at the street ends; the temple behind the north gate
  townGate(g, HALF_ST + 1, ly(HALF_ST + 1, 0), 0, Math.PI / 2, cx + HALF_ST + 1, cz);
  townGate(g, -HALF_ST - 1, ly(-HALF_ST - 1, 0), 0, Math.PI / 2, cx - HALF_ST - 1, cz);
  townGate(g, 0, ly(0, HALF_ST + 1), HALF_ST + 1, 0, cx, cz + HALF_ST + 1);
  torii(g, 0, ly(0, -HALF_ST - 1), -HALF_ST - 1, 0, 1.1); for (const s of [-2.5, 2.5]) addCollider({ x: cx + s, z: cz - HALF_ST - 1, r: 0.4 });
  miniShrine(g, 0, ly(0, -HALF_ST - 16), -HALF_ST - 16, 0, 1.05); solidBox(cx, cz - HALF_ST - 16, 10.5, 7.3, 0);
  street(0, -HALF_ST - 8, 6, 12);
  for (const s of [-1, 1]) stoneLantern(g, s * 4, ly(s * 4, -HALF_ST - 7), -HALF_ST - 7, cx + s * 4, cz - HALF_ST - 7, 1.1);
  // hanging street lanterns on posts, both streets
  for (const axis of ['x', 'z'] as const) for (let t = -HALF_ST + 12; t < HALF_ST - 6; t += 18) {
    if (Math.abs(t) < 22) continue;
    for (const s of [-1, 1]) {
      const [x, z] = axis === 'x' ? [t + s * 4, s * (ST / 2 - 0.4)] : [s * (ST / 2 - 0.4), t - s * 4];
      post(g, 0.07, 3, MT.black, x, ly(x, z), z); hangingLantern(g, x, ly(x, z) + 2.55, z, 0.45);
      addCollider({ x: cx + x, z: cz + z, r: 0.2 });
      if (s > 0) addLight({ x: cx + x, y: L + ly(x, z) + 2.5, z: cz + z, color: 0xff9a40, intensity: 3.5, distance: 10, decay: 1.4 });
    }
  }
  const baked = bake(g);
  site(baked, cx, cz, 160);
}

// ------------------------------------------------------------ the ruins of Takamori castle
/** a ruined wall from a to b (local): broken into blocks of random height, with breaches */
function ruinedWall(p: Obj, cx: number, cz: number, L: number, a: [number, number], b: [number, number], th: number, hMin: number, hMax: number, breach: number, gate?: number) {
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[0] - a[0], b[1] - a[1]), n = Math.round(len / 5.5);
  let gap = 0;
  for (let i = 0; i < n; i++) {
    const t0 = i / n, t1 = (i + 1) / n, tm = (t0 + t1) / 2;
    const x = a[0] + (b[0] - a[0]) * tm, z = a[1] + (b[1] - a[1]) * tm;
    if (gate !== undefined && Math.abs(tm - gate) * len < 8) continue;               // the gateway
    if (gap > 0) { gap--; } else if (R() < breach) gap = 1 + Math.floor(R() * 2);   // a breach a few blocks wide
    const y = groundY(cx + x, cz + z) - L;
    if (gap > 0) {
      for (let k = 0; k < 4; k++) {   // rubble spilled through the breach
        const rb = box(p, rnd(0.8, 2.2), rnd(0.5, 1.3), rnd(0.8, 2.2), MT.stoneD, x + rnd(-2.5, 2.5), y - 0.2, z + rnd(-3, 3), rnd(0, TAU));
        rb.rotation.x = rnd(-0.3, 0.3); rb.rotation.z = rnd(-0.3, 0.3);
      }
      continue;
    }
    const h = rnd(hMin, hMax), seg = len / n;
    box(p, th, h, seg * 1.02, MT.stoneD, x, y - 0.3, z, ang);
    if (R() < 0.45) box(p, th * rnd(0.5, 0.9), rnd(0.4, 1.4), seg * rnd(0.3, 0.7), MT.stoneD, x, y - 0.3 + h, z + rnd(-1, 1), ang + rnd(-0.1, 0.1));
    if (R() < 0.3) box(p, th + 0.3, 0.15, seg * rnd(0.4, 0.9), MAT.moss, x, y - 0.3 + h, z, ang);
    const [ax, az] = [cx + x - Math.sin(ang) * seg / 2, cz + z - Math.cos(ang) * seg / 2], [bx, bz] = [cx + x + Math.sin(ang) * seg / 2, cz + z + Math.cos(ang) * seg / 2];
    addCollider({ seg: [ax, az, bx, bz], r: th / 2 + 0.1 });
  }
  FOOTPRINTS.rects.push([cx + (a[0] + b[0]) / 2, cz + (a[1] + b[1]) / 2, th + 1, len, ang]);
}
function ruinedTower(p: Obj, cx: number, cz: number, L: number, x: number, z: number, state: number) {
  const y = groundY(cx + x, cz + z) - L, h = 4 + state * 2.5;
  box(p, 14, h, 14, MT.stoneD, x, y - 0.3, z);
  solidBox(cx + x, cz + z, 14, 14, 0);
  if (state > 0) {   // what is left of the plastered turret: two or three broken walls
    for (const [sx, sz, w, d] of [[0, -5.5, 11, 0.6], [-5.5, 0, 0.6, 11], [5.5, 0, 0.6, 11]].slice(0, 1 + state)) box(p, w, rnd(1.5, 4), d, MT.plaster, x + sx, y + h - 0.3, z + sz);
    for (let k = 0; k < 5; k++) { const b = add(p, G.cyl6, MAT.charred, x + rnd(-5, 5), y + h + 1, z + rnd(-5, 5), 0.35, rnd(1.5, 4), 0.35); b.rotation.set(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5)); }
  } else {           // collapsed: its roof lies tilted at the foot of the base
    const r = pyr(p, 13, 3.5, 13, MT.roof, x + 9, y - 1.2, z + 7); r.rotation.set(0.5, 0.4, 0.35);
  }
}
function deadTree(p: Obj, x: number, y: number, z: number) {
  const h = rnd(4, 7), t = add(p, G.cyl6, MAT.charred, x, y + h / 2, z, 0.5, h, 0.5); t.rotation.z = rnd(-0.12, 0.12);
  for (let k = 0; k < 4; k++) {
    const l = rnd(1.5, 3), b = add(p, G.cyl6, MAT.charred, x, y + h * rnd(0.5, 0.95), z, 0.18, l, 0.18);
    b.rotation.set(rnd(0.6, 1.1), rnd(0, TAU), 0); b.rotation.order = 'YXZ';
  }
}
function buildRuins() {
  R = seeded(31337);
  const pl = place('ruinas'), cx = pl.x, cz = pl.z, L = pl.level!, g = new THREE.Group(); g.position.set(cx, L, cz);
  const ly = (x: number, z: number) => groundY(cx + x, cz + z) - L;
  const OUT = 110, IN = 58, MOAT = 125, CAUSE = 8;
  // moat: dark water all around, one earthen causeway to the south gate
  const c = 18;
  // moat corners walked round: south-east, north-east, north-west, south-west
  const pts: [number, number][] = [[CAUSE, MOAT]];
  const arc = (ccx: number, ccz: number, a0: number, a1: number) => { for (let k = 0; k <= 6; k++) { const a = a0 + (a1 - a0) * (k / 6); pts.push([ccx + Math.cos(a) * c, ccz + Math.sin(a) * c]); } };
  arc(MOAT - c, MOAT - c, Math.PI / 2, 0);
  arc(MOAT - c, -MOAT + c, 0, -Math.PI / 2);
  arc(-MOAT + c, -MOAT + c, -Math.PI / 2, -Math.PI);
  arc(-MOAT + c, MOAT - c, Math.PI, Math.PI / 2);
  pts.push([-CAUSE, MOAT]);
  const dense: [number, number][] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1], n = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 3));
    for (let k = 0; k < n; k++) dense.push([cx + ax + (bx - ax) * k / n, cz + az + (bz - az) * k / n]);
  }
  dense.push([cx + pts[pts.length - 1][0], cz + pts[pts.length - 1][1]]);
  const moatLine: Line = { pts: dense, width: 9 };
  ribbon(moatLine, 9, MT.water, 0.1);
  for (let i = 0; i < dense.length - 1; i++) addCollider({ seg: [dense[i][0], dense[i][1], dense[i + 1][0], dense[i + 1][1]], r: 4.2 });
  for (const [x, z, w, d] of [[0, -MOAT, 2 * MOAT, 10], [MOAT, 0, 10, 2 * MOAT], [-MOAT, 0, 10, 2 * MOAT], [(MOAT + CAUSE) / 2, MOAT, MOAT - CAUSE, 10], [-(MOAT + CAUSE) / 2, MOAT, MOAT - CAUSE, 10]] as const)
    FOOTPRINTS.rects.push([cx + x, cz + z, w, d, 0]);
  // the causeway's stone edging, and a broken gate bridge post or two
  for (const s of [-1, 1]) { box(g, 0.8, 0.7, 14, MT.stoneD, s * (CAUSE - 0.6), ly(s * CAUSE, MOAT) - 0.2, MOAT); addCollider({ seg: [cx + s * (CAUSE - 0.6), cz + MOAT - 7, cx + s * (CAUSE - 0.6), cz + MOAT + 7], r: 0.5 }); }
  // outer and inner walls, broken, with their gates to the south
  ruinedWall(g, cx, cz, L, [-OUT, -OUT], [OUT, -OUT], 3, 1.5, 6.5, 0.18);
  ruinedWall(g, cx, cz, L, [OUT, -OUT], [OUT, OUT], 3, 1.5, 6.5, 0.18);
  ruinedWall(g, cx, cz, L, [-OUT, OUT], [-OUT, -OUT], 3, 1.5, 6.5, 0.18);
  ruinedWall(g, cx, cz, L, [-OUT, OUT], [OUT, OUT], 3, 1.5, 6.5, 0.14, 0.5);
  ruinedWall(g, cx, cz, L, [-IN, -IN], [IN, -IN], 2.6, 2, 7.5, 0.12);
  ruinedWall(g, cx, cz, L, [IN, -IN], [IN, IN], 2.6, 2, 7.5, 0.12);
  ruinedWall(g, cx, cz, L, [-IN, IN], [-IN, -IN], 2.6, 2, 7.5, 0.12);
  ruinedWall(g, cx, cz, L, [-IN, IN], [IN, IN], 2.6, 2, 7.5, 0.1, 0.5);
  for (const s of [-1, 1]) {   // stumps of the gatehouses
    box(g, 5, rnd(4, 6), 6, MT.stoneD, s * 9, ly(s * 9, OUT) - 0.3, OUT); solidBox(cx + s * 9, cz + OUT, 5, 6, 0);
    box(g, 4, rnd(4, 7), 5, MT.stoneD, s * 8.5, ly(s * 8.5, IN) - 0.3, IN); solidBox(cx + s * 8.5, cz + IN, 4, 5, 0);
  }
  const beam = box(g, 16, 0.6, 0.7, MAT.charred, 2, ly(2, OUT + 4) + 0.1, OUT + 4); beam.rotation.y = 0.3;
  // corner towers: two still half standing, two fallen
  ruinedTower(g, cx, cz, L, OUT, OUT, 2); ruinedTower(g, cx, cz, L, -OUT, OUT, 0);
  ruinedTower(g, cx, cz, L, OUT, -OUT, 0); ruinedTower(g, cx, cz, L, -OUT, -OUT, 1);
  // the keep: an enormous stone base, and on it the burnt shell of the tower
  const KZ = -12, kb = new THREE.Mesh(new THREE.CylinderGeometry(21 * Math.SQRT2, 26 * Math.SQRT2, 13, 4, 1).rotateY(Math.PI / 4), MT.stoneD);
  kb.position.set(0, ly(0, KZ) + 6.2, KZ); g.add(kb);
  solidBox(cx - 13, cz + KZ, 26, 52, 0, false); solidBox(cx + 13, cz + KZ, 26, 52, 0, false);
  FOOTPRINTS.rects.push([cx, cz + KZ, 54, 54, 0]);
  const top = ly(0, KZ) + 12.7;
  box(g, 40, 0.4, 40, MAT.charred, 0, top, KZ);
  for (const [sx, sz, w, d] of [[0, -19.5, 40, 0.8], [0, 19.5, 40, 0.8], [-19.5, 0, 0.8, 40], [19.5, 0, 0.8, 40]]) {
    const n = 7;
    for (let k = 0; k < n; k++) {   // wall panels, many missing, the rest at broken heights
      if (R() < 0.4) continue;
      const t = (k + 0.5) / n - 0.5, px = sx + (w > 1 ? t * w : 0), pz = sz + (d > 1 ? t * d : 0);
      box(g, w > 1 ? w / n : 0.8, rnd(1.2, 6.5), d > 1 ? d / n : 0.8, R() < 0.6 ? MT.plaster : MAT.charred, px, top + 0.4, KZ + pz);
    }
  }
  for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {   // burnt pillars, some fallen
    if (R() < 0.3) continue;
    const px = -15 + i * 6, pz = KZ - 15 + j * 6, h = rnd(1, 8), p = add(g, G.cyl6, MAT.charred, px, top + h / 2, pz, 0.6, h, 0.6);
    if (R() < 0.25) { p.rotation.z = Math.PI / 2 - 0.15; p.position.y = top + 0.6; }
  }
  const fall = pyr(g, 30, 5, 26, MT.roof, -4, top + 0.2, KZ + 4); fall.rotation.set(0.12, 0.5, -0.2);
  const fall2 = pyr(g, 18, 3.5, 16, MT.roof, 9, top + 1.2, KZ - 8); fall2.rotation.set(-0.35, -0.2, 0.25);
  const fish = box(g, 0.9, 2.4, 1.5, MT.gold, 24, ly(24, 22) - 0.1, 22); fish.rotation.set(1.2, 0.6, 0.3);   // the fallen golden shachihoko
  // the courtyards: dead trees, toppled lanterns, spears stuck in the ground, torn banners, wisps
  for (let i = 0; i < 26; i++) {
    const a = rnd(0, TAU), r = rnd(IN + 8, OUT - 10), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 12 && z > 0) continue;
    deadTree(g, x, ly(x, z), z); addCollider({ x: cx + x, z: cz + z, r: 0.45 });
  }
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, TAU), r = rnd(30, OUT - 8), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (Math.abs(x) < 30 && Math.abs(z - KZ) < 30) continue;
    const l = new THREE.Group(); l.position.set(x, ly(x, z), z); l.rotation.set(rnd(-0.2, 0.2), rnd(0, TAU), R() < 0.5 ? Math.PI / 2 - 0.2 : 0); g.add(l);
    box(l, 0.7, 0.25, 0.7, MT.stone, 0, 0, 0); post(l, 0.15, 0.9, MT.stone, 0, 0.25, 0); box(l, 0.55, 0.45, 0.55, MT.stoneD, 0, 1.15, 0); pyr(l, 0.9, 0.45, 0.9, MT.stone, 0, 1.6, 0);
  }
  for (let i = 0; i < 40; i++) {
    const x = rnd(-OUT + 8, OUT - 8), z = rnd(-OUT + 8, OUT - 8);
    if (Math.abs(x) < 30 && Math.abs(z - KZ) < 30) continue;
    const sp = add(g, G.cyl6, MT.woodL, x, ly(x, z) + 1, z, 0.08, 2.4, 0.08); sp.rotation.set(rnd(-0.5, 0.5), 0, rnd(-0.5, 0.5));
    if (R() < 0.25) { const b = add(g, G.plane, pick(MT.banner), x + 0.35, ly(x, z) + 1.6, z, 0.6, rnd(0.6, 1.4), 1, rnd(0, TAU)); b.rotation.z = rnd(-0.3, 0.3); }
  }
  for (let i = 0; i < 9; i++) {
    const a = rnd(0, TAU), r = rnd(15, OUT - 15), x = Math.cos(a) * r, z = Math.sin(a) * r, y = ly(x, z) + rnd(1.2, 2.6);
    const w = add(g, G.sphere, MAT.wisp, x, y, z, 0.35, 0.35, 0.35); w.castShadow = false;
    addLight({ x: cx + x, y: L + y, z: cz + z, color: 0x6fd8ff, intensity: 3, distance: 10, decay: 1.5, flicker: 0.8 });
  }
  // rubble heaps all over the baileys: stones fallen from the walls and the keep
  for (let i = 0; i < 70; i++) {
    const x = rnd(-OUT + 6, OUT - 6), z = rnd(-OUT + 6, OUT - 6);
    if ((Math.abs(x) < 30 && Math.abs(z - KZ) < 30) || (Math.abs(x) < 6 && z > 20)) continue;
    const y = ly(x, z), n = 2 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) { const s = rnd(0.6, 1.8), b = box(g, s * rnd(0.8, 1.6), s * rnd(0.5, 0.9), s, MT.stoneD, x + rnd(-1.5, 1.5), y - 0.2, z + rnd(-1.5, 1.5), rnd(0, TAU)); b.rotation.x = rnd(-0.4, 0.4); b.rotation.z = rnd(-0.4, 0.4); }
    if (n > 3) addCollider({ x: cx + x, z: cz + z, r: 1.2 });
  }
  // the oni's watch fires among the ruins
  for (const [fx, fz] of [[0, 30], [-78, 40], [80, -50]]) {
    const y = ly(fx, fz), f = new THREE.Group(); f.position.set(fx + 3, y, fz - 3); g.add(f);
    for (let i = 0; i < 4; i++) { const l = box(f, 0.18, 0.18, 1.3, MT.wood, 0, 0.05, 0, (i / 4) * Math.PI); l.rotation.x = 0.25; }
    add(f, new THREE.ConeGeometry(0.5, 1.1, 7), MT.fire, 0, 0.55, 0, 1, 1, 1);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; add(f, G.sphere, MT.stone, Math.cos(a), 0.1, Math.sin(a), 0.38, 0.28, 0.38); }
    addCollider({ x: cx + fx + 3, z: cz + fz - 3, r: 1.2 });
    addLight({ x: cx + fx + 3, y: L + y + 1.2, z: cz + fz - 3, color: 0xff6a20, intensity: 9, distance: 18, decay: 1.4, flicker: 1 });
  }
  disc(cx, cz + OUT + 6, 8);
  // oni have made the ruins their stronghold: a warlord before the keep, two war bands in the outer bailey
  CAMP_SPOTS.push(
    { x: cx, z: cz + 30, size: 5, r: 14, tier: 1, boss: true, chest: [cx + 4, cz + 26, Math.PI] },
    { x: cx - 78, z: cz + 40, size: 4, r: 12, tier: 0.95, boss: false, chest: [cx - 74, cz + 37, 0] },
    { x: cx + 80, z: cz - 50, size: 4, r: 12, tier: 0.95, boss: false, chest: [cx + 76, cz - 47, 0] }
  );
  const baked = bake(g);
  baked.traverse(o => { if ((o as THREE.Mesh).material === MAT.wisp) o.castShadow = false; });
  site(baked, cx, cz, 170);
}

/** build the town and the ruins (after buildStructures, before buildLandmarks and buildMasks) */
export function buildSettlements() {
  buildTown();
  buildRuins();
}
