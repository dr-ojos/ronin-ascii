// Streamed wilderness: the world is cut into square chunks that grow their forest (trees, bushes,
// rocks, wildflowers) when the player gets close, and are thrown away again when left far behind.
// Every chunk has its own seed, so walking back finds exactly the same trees.
import * as THREE from 'three';
import { scene } from './renderer';
import { createKit, POND, rng, type Kit, type KitMesh } from './nature';
import { removeSurfaceVariant } from './surfaces';
import { addCollider, removeColliders, isFree } from './physics';
import { biomeAt, treeBlocked, groundAt, seeded, rockZone, hillsAt, WORLD_R, HALF } from './map';

const CH = 48, LOAD = 120, UNLOAD = 170, DRAW = 115, CLEARING = 56;
interface Chunk { i: number; j: number; cx: number; cz: number; group: THREE.Group; meshes: KitMesh[]; owner: object }
const chunks = new Map<number, Chunk>();
const ckey = (i: number, j: number) => (i + 512) * 1024 + (j + 512);

// Myrtle, fern, olive and honey. A whole thicket draws its leaf tints from the same pair.
const SHRUB_TINTS = [
  [0x215331, 0x517c51], [0x50712a, 0x91a84b],
  [0x8b782c, 0xc9b542], [0xa76d20, 0xe1b543]
].map(pair => pair.map(hex => new THREE.Color(hex)));

function growLowShrubs(kit: Kit, i: number, j: number, abundance: number) {
  const cell = CH / 3;
  for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
    const gx = i * 3 + a, gz = j * 3 + b;
    const random = seeded(Math.imul(gx, 73856093) ^ Math.imul(gz, 19349663) ^ 1692);
    if (random() > 0.54 + 0.14 * abundance) continue;
    const [shade, sun] = SHRUB_TINTS[Math.floor(random() * SHRUB_TINTS.length)];
    const cx = (gx + 0.25 + random() * 0.50) * cell, cz = (gz + 0.25 + random() * 0.50) * cell;
    const axis = random() * Math.PI, dx = Math.cos(axis), dz = Math.sin(axis);
    const length = 2.3 + random() * 1.6, width = 1.0 + random() * 1.4, count = 5 + Math.floor(random() * 7);
    for (let n = 0; n < count; n++) {
      const radius = Math.sqrt(n / count), angle = n * 2.40 + random() * 0.75;
      const u = radius * length * Math.cos(angle), v = radius * width * Math.sin(angle);
      const x = cx + dx * u - dz * v, z = cz + dz * u + dx * v;
      const spread = 0.79 + random() * 0.57, height = 0.74 + random() * 0.30;
      const turn = random() * Math.PI * 2, tint = random();
      if (Math.hypot(x, z) > WORLD_R || treeBlocked(x, z) || Math.max(...groundAt(x, z)) > 40) continue;
      // The starting shrine's flagstones, courtyard and wading pond also have hand-laid footprints.
      if (Math.abs(x) < 2.6 && z > -17 && z < 8 || Math.abs(x) < 13 && z > -32 && z < -14) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r * 1.15 + 1 || !isFree(x, z, spread * 0.65)) continue;
      kit.lowShrub(x, z, spread, height, turn, shade.clone().lerp(sun, tint));
    }
  }
}

function buildChunk(i: number, j: number): Chunk {
  const owner = {}, x0 = i * CH, z0 = j * CH;
  const R = seeded(((i * 73856093) ^ (j * 19349663) ^ 0x5bd1e995) >>> 0);
  const rnd = (a: number, b: number) => a + R() * (b - a);
  const prevRng = rng.f; rng.f = R;
  const kit = createKit({ lite: true, addCollider: c => addCollider(c, owner), onPath: (x, z) => groundAt(x, z)[0] > 100 });
  const usable = (x: number, z: number) => {
    const r = Math.hypot(x, z);
    return r > CLEARING && r < WORLD_R + 30 && Math.abs(x) < HALF - 4 && Math.abs(z) < HALF - 4 && !treeBlocked(x, z);
  };

  // trees on a jittered grid: one candidate per cell, kept with the biome's density
  const S = 7.5, n = Math.round(CH / S);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    const x = x0 + (a + 0.5) * S + rnd(-S * 0.38, S * 0.38), z = z0 + (b + 0.5) * S + rnd(-S * 0.38, S * 0.38);
    const bio = biomeAt(x, z), roll = R(), pickRoll = R();
    if (!usable(x, z) || roll > bio.density) continue;
    const tot = bio.sakura + bio.pine + bio.cypress + bio.bamboo;
    let w = pickRoll * tot;
    const kind = (w -= bio.sakura) < 0 ? 0 : (w -= bio.pine) < 0 ? 1 : (w -= bio.cypress) < 0 ? 2 : 3;
    if (!isFree(x, z, kind === 3 ? 3.5 : 2.6)) continue;
    if (kind === 0) kit.sakura(x, z); else if (kind === 1) kit.pine(x, z); else if (kind === 2) kit.cypress(x, z); else kit.bamboo(x, z);
  }
  // undergrowth
  const mid = biomeAt(x0 + CH / 2, z0 + CH / 2);
  for (let k = 0; k < Math.round(mid.bush * 7); k++) {
    const x = x0 + rnd(0, CH), z = z0 + rnd(0, CH);
    if (usable(x, z) && isFree(x, z, 1.2)) kit.bush(x, z);
  }
  for (let k = 0; k < Math.round(mid.rock * 6); k++) {
    const x = x0 + rnd(0, CH), z = z0 + rnd(0, CH);
    if (usable(x, z) && isFree(x, z, 1.5)) kit.rock(x, z, rnd(0.35, 1.5));
  }
  // the rocky country: big boulders and needles of rock, thick enough to wind your way between them
  const rz = Math.max(rockZone(x0 + CH / 2, z0 + CH / 2), rockZone(x0 + CH * 0.2, z0 + CH * 0.2), rockZone(x0 + CH * 0.8, z0 + CH * 0.8));
  if (rz > 0.05) {
    for (let k = 0; k < Math.round(rz * 18); k++) {
      const x = x0 + rnd(0, CH), z = z0 + rnd(0, CH), b = rnd(1.2, 3.8);
      if (rockZone(x, z) > 0.2 && usable(x, z) && isFree(x, z, b * 0.5 + 1.2)) kit.rock(x, z, b);
    }
    for (let k = 0; k < Math.round(rz * 6); k++) {
      const x = x0 + rnd(0, CH), z = z0 + rnd(0, CH), b = rnd(1.1, 2.2), sy = rnd(2.2, 3.8);
      if (rockZone(x, z) > 0.3 && usable(x, z) && isFree(x, z, b + 1)) kit.rock(x, z, b, true, { sx: rnd(0.6, 0.95), sy, sz: rnd(0.6, 0.95), y: b * sy * 0.55 });
    }
  }
  // crags crowning the rocky hills whose top is in this chunk
  for (const h of hillsAt(x0 + CH / 2, z0 + CH / 2)) {
    if (!h.rocky || h.x < x0 || h.x >= x0 + CH || h.z < z0 || h.z >= z0 + CH || !usable(h.x, h.z)) continue;
    const n = 3 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const a = rnd(0, Math.PI * 2), d = rnd(0, h.R * 0.35), x = h.x + Math.cos(a) * d, z = h.z + Math.sin(a) * d;
      if (isFree(x, z, 0.5)) kit.rock(x, z, rnd(1.4, 3.4));
    }
    const b = rnd(1.4, 2.4), sy = rnd(2.6, 4);
    if (isFree(h.x, h.z, 0)) kit.rock(h.x, h.z, b, true, { sx: rnd(0.7, 1), sy, sz: rnd(0.7, 1), y: b * sy * 0.5 });
  }
  // wildflowers drift over the open meadows
  const flowers = Math.round(520 * (1 - mid.density));
  for (let k = 0; k < flowers; k++) {
    const x = x0 + rnd(0, CH), z = z0 + rnd(0, CH);
    if (Math.hypot(x, z) < CLEARING || Math.hypot(x, z) > WORLD_R) continue;
    if (Math.sin(x * 0.21) * Math.sin(z * 0.17 + 1.3) < 0.2) continue;
    const g = groundAt(x, z); if (g[0] + g[1] + g[2] > 60) continue;
    kit.wildflower(x, z);
  }
  growLowShrubs(kit, i, j, mid.bush);
  const group = new THREE.Group(), meshes = kit.build();
  for (const m of meshes) group.add(m.mesh);
  scene.add(group);
  rng.f = prevRng;
  return { i, j, cx: x0 + CH / 2, cz: z0 + CH / 2, group, meshes, owner };
}
function dropChunk(c: Chunk) {
  scene.remove(c.group);
  for (const { mesh } of c.meshes) {
    removeSurfaceVariant(mesh);
    if ((mesh as THREE.InstancedMesh).isInstancedMesh) (mesh as THREE.InstancedMesh).dispose();   // shared geometry stays
    else mesh.geometry.dispose();
  }
  removeColliders(c.owner);
  chunks.delete(ckey(c.i, c.j));
}

/** grow what's missing near the player (at most `budget` chunks per call), drop what's far, hide what's out of range */
export function updateChunks(px: number, pz: number, budget = 1) {
  for (const c of chunks.values()) {
    const d = Math.hypot(c.cx - px, c.cz - pz);
    if (d > UNLOAD) dropChunk(c); else c.group.visible = d < DRAW + CH * 0.71;
  }
  const r = Math.ceil(LOAD / CH), pi = Math.floor(px / CH), pj = Math.floor(pz / CH);
  const todo: [number, number, number][] = [];
  for (let i = pi - r; i <= pi + r; i++) for (let j = pj - r; j <= pj + r; j++) {
    if (chunks.has(ckey(i, j))) continue;
    const d = Math.hypot((i + 0.5) * CH - px, (j + 0.5) * CH - pz);
    if (d < LOAD && Math.hypot((i + 0.5) * CH, (j + 0.5) * CH) < WORLD_R + 120) todo.push([d, i, j]);
  }
  todo.sort((a, b) => a[0] - b[0]);
  for (let k = 0; k < Math.min(budget, todo.length); k++) { const [, i, j] = todo[k]; chunks.set(ckey(i, j), buildChunk(i, j)); }
}

/** tree meshes near a point (the camera pulls in front of them) */
export function chunkBlockers(x: number, z: number, out: THREE.Object3D[]) {
  for (const c of chunks.values()) {
    if (!c.group.visible || Math.abs(c.cx - x) > CH * 1.2 || Math.abs(c.cz - z) > CH * 1.2) continue;
    for (const m of c.meshes) if (m.blocker) out.push(m.mesh);
  }
}
