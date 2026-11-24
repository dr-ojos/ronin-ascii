// Canyon paths: in the rocky country the road narrows into a path that snakes between walls of rock.
// Side trails fork off it and wind away to little nooks closed in by rock (some keep a chest), so the
// way through is easy to lose. The walls follow every path (map.ts CANYONS) on both sides, open
// wherever another path joins, and are baked with the same mossy rock as every boulder.
import * as THREE from 'three';
import { createKit } from './nature';
import { addCollider } from './physics';
import { addLight } from './lights';
import { groundY } from './terrain';
import { CANYONS, seeded, segDist, FOOTPRINTS, type P2, type Line } from './map';
import { stoneLantern, site } from './structures';
import { HIDDEN_CHESTS } from './landmarks';

const GAP = 2.3;    // from the edge of the path to the foot of the wall
const STEP = 3.1;   // one lump of rock every few metres

function distToLines(x: number, z: number, lines: Line[]) {
  let d = Infinity;
  for (const l of lines) for (let i = 0; i < l.pts.length - 1; i++) {
    const a = l.pts[i];
    if (Math.abs(a[0] - x) > d + 6 || Math.abs(a[1] - z) > d + 6) continue;
    d = Math.min(d, segDist(x, z, a, l.pts[i + 1]));
  }
  return d;
}

function buildCanyon(c: typeof CANYONS[number], seed: number) {
  const R = seeded(seed), rnd = (a: number, b: number) => a + R() * (b - a);
  const kit = createKit({ lite: false, addCollider: () => {}, onPath: () => false });
  const paths = [c.main, ...c.branches], off = c.width / 2 + GAP;
  const NOOK = 7.5;
  let cx = 0, cz = 0, n = 0;
  const lump = (x: number, z: number, dir: number, tall: number) => {
    const k = rnd(1.5, 2.1), H = tall * rnd(0.8, 1.2), sy = H / k * 0.62;
    kit.rock(x, z, k, false, { sx: rnd(0.75, 1.05), sy, sz: rnd(1.0, 1.35), ry: dir + rnd(-0.25, 0.25), y: H * 0.34 });
    FOOTPRINTS.rects.push([x, z, k * 1.8, k * 2.4, dir]);
    cx += x; cz += z; n++;
  };
  // walls along both sides of every path; a chain of capsules keeps you between them
  for (const path of paths) {
    const pts = path.pts;
    for (const side of [-1, 1]) {
      let prev: P2 | null = null, acc = STEP;
      for (let i = 1; i < pts.length; i++) {
        acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
        if (acc < STEP) continue;
        acc = 0;
        const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az) || 1;
        const x = bx - (bz - az) / l * side * off, z = bz + (bx - ax) / l * side * off, dir = Math.atan2(bx - ax, bz - az);
        // open where another path comes in, and inside the nooks
        const open = distToLines(x, z, paths) < off - 0.4 || c.nooks.some(([nx, nz]) => Math.hypot(nx - x, nz - z) < NOOK - 1) || i < 3 && path === c.main;
        if (open) { prev = null; continue; }
        // the walls rise higher deeper into the canyon
        const t = path === c.main ? Math.sin((i / pts.length) * Math.PI) : 0.7;
        lump(x, z, dir, 3.4 + t * 3.6);
        if (prev && Math.hypot(prev[0] - x, prev[1] - z) < STEP * 1.8) addCollider({ seg: [prev[0], prev[1], x, z], r: 1.25 });
        else addCollider({ x, z, r: 1.4 });
        prev = [x, z];
      }
    }
  }
  // each nook: a ring of rock with the way in left open; a chest in most of them, a lantern in the rest
  c.nooks.forEach(([nx, nz], k) => {
    const ring: P2[] = [];
    for (let a = 0; a < Math.PI * 2; a += 0.42) {
      const x = nx + Math.cos(a) * NOOK, z = nz + Math.sin(a) * NOOK;
      if (distToLines(x, z, paths) < off - 0.6) { ring.push([NaN, NaN]); continue; }
      lump(x, z, a + Math.PI / 2, rnd(4, 6.5)); ring.push([x, z]);
    }
    ring.forEach((p, i) => { const q = ring[(i + 1) % ring.length]; if (!isNaN(p[0]) && !isNaN(q[0])) addCollider({ seg: [p[0], p[1], q[0], q[1]], r: 1.25 }); });
    if (k % 4 !== 3) HIDDEN_CHESTS.push([nx, nz, R() * Math.PI * 2]);
    else addLight({ x: nx, y: groundY(nx, nz) + 1.4, z: nz, color: 0xff9a40, intensity: 5, distance: 12, decay: 1.4 });
  });
  const g = new THREE.Group();
  for (const { mesh } of kit.build()) g.add(mesh);
  // stone lanterns where the canyon opens, at both ends of the way through
  for (const end of [c.main.pts[0], c.main.pts[c.main.pts.length - 1]]) {
    const [ex, ez] = end;
    const nb = c.main.pts[end === c.main.pts[0] ? 2 : c.main.pts.length - 3], dx = nb[0] - ex, dz = nb[1] - ez, l = Math.hypot(dx, dz) || 1;
    for (const side of [-1, 1]) {
      const x = ex - dz / l * side * (c.width / 2 + 1.4), z = ez + dx / l * side * (c.width / 2 + 1.4);
      stoneLantern(g, x, groundY(x, z), z, x, z, 1);
    }
  }
  site(g, cx / n, cz / n, 200, false);
}

/** raise the walls of every canyon (after buildStructures, before buildLandmarks and buildMasks) */
export function buildCanyons() {
  CANYONS.forEach((c, i) => buildCanyon(c, 7000 + i * 31));
}
