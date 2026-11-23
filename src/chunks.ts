// Streamed wilderness: the world is cut into square chunks that grow their forest (trees, bushes,
// rocks, wildflowers) when the player gets close, and are thrown away again when left far behind.
// Every chunk has its own seed, so walking back finds exactly the same trees.
import * as THREE from 'three';
import { scene } from './renderer';
import { createKit, rng, type KitMesh } from './nature';
import { removeSurfaceVariant } from './surfaces';
import { addCollider, removeColliders, isFree } from './physics';
import { biomeAt, treeBlocked, groundAt, seeded, WORLD_R, HALF } from './map';

const CH = 48, LOAD = 150, UNLOAD = 240, DRAW = 140, CLEARING = 56;
interface Chunk { i: number; j: number; cx: number; cz: number; group: THREE.Group; meshes: KitMesh[]; owner: object }
const chunks = new Map<number, Chunk>();
const ckey = (i: number, j: number) => (i + 512) * 1024 + (j + 512);

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
  // wildflowers drift over the open meadows
  const flowers = Math.round(520 * (1 - mid.density));
  for (let k = 0; k < flowers; k++) {
    const x = x0 + rnd(0, CH), z = z0 + rnd(0, CH);
    if (Math.hypot(x, z) < CLEARING || Math.hypot(x, z) > WORLD_R) continue;
    if (Math.sin(x * 0.21) * Math.sin(z * 0.17 + 1.3) < 0.2) continue;
    const g = groundAt(x, z); if (g[0] + g[1] + g[2] > 60) continue;
    kit.wildflower(x, z);
  }
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
