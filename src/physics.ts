// Collision against the world's static colliders (circles, rectangles, capsules / segments, lakes)
// and the edge of the world. Colliders live in a spatial hash, so a huge world costs the same as a small one;
// each collider has an owner (a streamed chunk) so it can be removed when that chunk is unloaded.
import { WORLD_R, LAKES, lakeRadius } from './map';
import type { Collider, XZ } from './types';

const CELL = 16, MARGIN = 2;
const grid = new Map<number, Collider[]>();
const owned = new Map<unknown, { key: number; c: Collider }[]>();
const key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096);
export const GLOBAL = Symbol('global');

function bounds(c: Collider): [number, number, number, number] {
  if (c.rect) return c.rect;
  if (c.seg) { const [x0, z0, x1, z1] = c.seg; return [Math.min(x0, x1) - c.r, Math.max(x0, x1) + c.r, Math.min(z0, z1) - c.r, Math.max(z0, z1) + c.r]; }
  if (c.lake) { const R = c.lake.R * 1.2; return [c.lake.x - R, c.lake.x + R, c.lake.z - R, c.lake.z + R]; }
  return [c.x - c.r, c.x + c.r, c.z - c.r, c.z + c.r];
}
export function addCollider(c: Collider, owner: unknown = GLOBAL) {
  const [x0, x1, z0, z1] = bounds(c);
  let list = owned.get(owner); if (!list) owned.set(owner, list = []);
  for (let i = Math.floor((x0 - MARGIN) / CELL); i <= Math.floor((x1 + MARGIN) / CELL); i++)
    for (let j = Math.floor((z0 - MARGIN) / CELL); j <= Math.floor((z1 + MARGIN) / CELL); j++) {
      const k = key(i, j); let cell = grid.get(k); if (!cell) grid.set(k, cell = []);
      cell.push(c); list.push({ key: k, c });
    }
}
export function removeColliders(owner: unknown) {
  const list = owned.get(owner); if (!list) return;
  for (const { key: k, c } of list) {
    const cell = grid.get(k); if (!cell) continue;
    const i = cell.indexOf(c); if (i >= 0) cell.splice(i, 1);
    if (!cell.length) grid.delete(k);
  }
  owned.delete(owner);
}
const EMPTY: Collider[] = [];
export const collidersAt = (x: number, z: number) => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || EMPTY;
/** no circle collider within `gap` of its edge (used to space out trees, rocks...) */
export function isFree(x: number, z: number, gap: number) {
  for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
    const cell = grid.get(key(Math.floor(x / CELL) + di, Math.floor(z / CELL) + dj)); if (!cell) continue;
    for (const c of cell) {
      if (c.rect) { const [x0, x1, z0, z1] = c.rect; if (x > x0 - gap && x < x1 + gap && z > z0 - gap && z < z1 + gap) return false; }
      else if (c.seg || c.lake) continue;
      else if (Math.hypot(c.x - x, c.z - z) < c.r + gap) return false;
    }
  }
  return true;
}

export function collide(p: XZ, r: number) {
  for (const c of collidersAt(p.x, p.z)) {
    if (c.rect) {
      const [x0, x1, z0, z1] = c.rect;
      if (p.x > x0 - r && p.x < x1 + r && p.z > z0 - r && p.z < z1 + r) {
        const d = [p.x - (x0 - r), (x1 + r) - p.x, p.z - (z0 - r), (z1 + r) - p.z], m = Math.min(...d);
        if (m === d[0]) p.x = x0 - r; else if (m === d[1]) p.x = x1 + r; else if (m === d[2]) p.z = z0 - r; else p.z = z1 + r;
      }
    } else if (c.seg) {
      const [x0, z0, x1, z1] = c.seg, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((p.x - x0) * dx + (p.z - z0) * dz) / l2)) : 0;
      const qx = x0 + dx * t, qz = z0 + dz * t, ex = p.x - qx, ez = p.z - qz, d = Math.hypot(ex, ez), m = c.r + r;
      if (d < m) {
        if (d > 1e-4) { p.x = qx + ex / d * m; p.z = qz + ez / d * m; }
        else { const n = Math.hypot(dx, dz) || 1; p.x = qx - dz / n * m; p.z = qz + dx / n * m; }
      }
    } else if (c.lake) {
      const l = c.lake, ex = p.x - l.x, ez = p.z - l.z, d = Math.hypot(ex, ez), R = lakeRadius(l, Math.atan2(ez, ex)) - 0.6 + r;
      if (d < R && d > 1e-4) { p.x = l.x + ex / d * R; p.z = l.z + ez / d * R; }
    } else {
      const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
      if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
    }
  }
  const d = Math.hypot(p.x, p.z); if (d > WORLD_R) { p.x *= WORLD_R / d; p.z *= WORLD_R / d; }
}

for (const l of LAKES) addCollider({ lake: l });
