// Collision against the world's static colliders (circles and rectangles) and the edge of the clearing.
import { colliders, WORLD_R } from './world.js';

export function collide(p, r) {
  for (const c of colliders) {
    if (c.rect) {
      const [x0, x1, z0, z1] = c.rect;
      if (p.x > x0 - r && p.x < x1 + r && p.z > z0 - r && p.z < z1 + r) {
        const d = [p.x - (x0 - r), (x1 + r) - p.x, p.z - (z0 - r), (z1 + r) - p.z], m = Math.min(...d);
        if (m === d[0]) p.x = x0 - r; else if (m === d[1]) p.x = x1 + r; else if (m === d[2]) p.z = z0 - r; else p.z = z1 + r;
      }
      continue;
    }
    const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = c.r + r;
    if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; }
  }
  const d = Math.hypot(p.x, p.z); if (d > WORLD_R) { p.x *= WORLD_R / d; p.z *= WORLD_R / d; }
}
