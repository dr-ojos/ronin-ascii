// Plateaus: the ground rises in steps, like the broken country of an action RPG. The terrain already
// lifts every mesa (map.ts mesaHeight); here each one gets its cliff (a ring of tall rock standing on
// the slope, with a fence of colliders so you can't walk up it) and, if it can be climbed, a ramp of
// stone steps between guard rocks: the only way up. Seen from the top, the land below lies at your feet.
import * as THREE from 'three';
import { createKit } from './nature';
import { addCollider } from './physics';
import { groundY } from './terrain';
import { MESAS, mesaRadius, mesaRamp, seeded, FOOTPRINTS, type Mesa } from './map';
import { MT, G, add, site } from './structures';

const RING = 2.4;   // the cliff's rocks stand this far out from the rim, on the slope

/** is (x, z) on this mesa's ramp, or close enough to leave the cliff open there? */
function inRamp(m: Mesa, x: number, z: number, margin: number) {
  if (m.ramp === null) return false;
  const { ux, uz, rim } = mesaRamp(m), dx = x - m.x, dz = z - m.z;
  const s = dx * ux + dz * uz - rim, lat = Math.abs(-dx * uz + dz * ux);
  return lat < m.W / 2 + margin && s > -RING - 4 && s < m.L + 3;
}

function buildMesa(m: Mesa, seed: number) {
  const R = seeded(seed), rnd = (a: number, b: number) => a + R() * (b - a);
  const kit = createKit({ lite: false, addCollider: () => {}, onPath: () => false });
  const g = new THREE.Group();
  const circ = 2 * Math.PI * m.R * 1.1;
  // the cliff: tall rocks from the foot to above the rim, all round except where the ramp comes up
  const nRock = Math.max(14, Math.round(circ / 2.9));
  for (let i = 0; i < nRock; i++) {
    const a = (i / nRock) * Math.PI * 2 + rnd(-0.03, 0.03), rr = mesaRadius(m, a), ca = Math.cos(a), sa = Math.sin(a);
    const x = m.x + ca * (rr + RING), z = m.z + sa * (rr + RING);
    if (inRamp(m, x, z, 0.6)) continue;
    const foot = groundY(m.x + ca * (rr + 6.5), m.z + sa * (rr + 6.5)), top = groundY(m.x + ca * (rr - 2), m.z + sa * (rr - 2));
    const k = rnd(2.1, 2.8), half = (top - foot) / 2 + rnd(0.9, 2.2), mid = (top + foot) / 2 + rnd(0.2, 0.9);
    kit.rock(x, z, k, false, { sx: rnd(0.9, 1.25), sy: half / k, sz: rnd(1.1, 1.5), ry: Math.atan2(-sa, ca), y: mid - groundY(x, z) });
    FOOTPRINTS.rects.push([x, z, k * 2, k * 2.6, Math.atan2(-sa, ca)]);
  }
  // the fence that makes it a cliff: overlapping circles along the slope
  const nCol = Math.max(20, Math.round(circ / 2));
  for (let i = 0; i < nCol; i++) {
    const a = (i / nCol) * Math.PI * 2, rr = mesaRadius(m, a), x = m.x + Math.cos(a) * (rr + RING), z = m.z + Math.sin(a) * (rr + RING);
    if (!inRamp(m, x, z, 0.2)) addCollider({ x, z, r: 1.55 });
  }
  // the ramp: stone steps from the foot to the rim, guard rocks along both sides
  if (m.ramp !== null) {
    const { ux, uz, x0, z0 } = mesaRamp(m), ry = Math.atan2(ux, uz);
    for (let s = -1.5; s < m.L + 0.6; s += 1.15) {
      const x = x0 + ux * s, z = z0 + uz * s, y = groundY(x, z);
      const st = add(g, G.box, MT.stone, x, y - 0.05, z, m.W - 1.4, 0.32, 1.2, ry);
      st.rotation.x = rnd(-0.02, 0.02);
    }
    FOOTPRINTS.rects.push([x0 + ux * m.L / 2, z0 + uz * m.L / 2, m.W - 1, m.L + 3, ry]);
    for (const side of [-1, 1]) for (let s = 0.5; s < m.L * 0.92; s += 2.6) {
      const ox = -uz * side * (m.W / 2 + 0.9), oz = ux * side * (m.W / 2 + 0.9);
      const x = x0 + ux * s + ox, z = z0 + uz * s + oz, k = rnd(0.9, 1.3);
      kit.rock(x, z, k, false, { sx: rnd(0.8, 1.1), sy: rnd(0.8, 1.2), sz: rnd(1, 1.4), ry: ry + rnd(-0.3, 0.3), y: k * 0.35 });
      addCollider({ x, z, r: k * 0.85 });
    }
  }
  for (const { mesh } of kit.build()) g.add(mesh);
  site(g, m.x, m.z, m.R * 1.3 + m.L + 40, false);
}

/** raise the cliffs and ramps of every plateau (after buildStructures, before buildLandmarks and buildMasks) */
export function buildMesas() {
  MESAS.forEach((m, i) => buildMesa(m, 9100 + i * 17));
}
