// Finding the way between the plateaus (mesas.ts). Enemies used to walk straight at you and pile up
// against the cliffs; now, every frame, each chaser asks for the point it should head to:
//  - you are on the same level and nothing stands between you: straight at you;
//  - a plateau is in the way: round its cliff, on the side it is already on;
//  - you are up on a plateau: to the foot of its ramp, up the steps, then at you
//    (a plateau with no ramp: it waits at the foot of the cliff, below you);
//  - it is up on a plateau and you are below: back to its ramp and down.
// Plateaus with a second level are handled the same way, one level at a time.
import { MESAS, mesaRadius, mesaRamp, type Mesa } from './map';

const RING = 2.4;   // the cliff's colliders stand this far out from the rim

const parentOf = (m: Mesa) => m.base > 0 ? MESAS.find(p => p.base === 0 && p.x === m.x && p.z === m.z) ?? null : null;
const near = (m: Mesa, x: number, z: number, extra: number) => Math.abs(x - m.x) < m.R * 1.3 + m.L + extra && Math.abs(z - m.z) < m.R * 1.3 + m.L + extra;

/** the highest plateau whose top contains (x, z), or null on the open ground */
function topOf(x: number, z: number): Mesa | null {
  let best: Mesa | null = null;
  for (const m of MESAS) {
    if (!near(m, x, z, 2)) continue;
    const d = Math.hypot(x - m.x, z - m.z);
    // up to the foot of the cliff's rocks (they stand just outside the rim) counts as the top
    if (d < mesaRadius(m, Math.atan2(z - m.z, x - m.x)) + 1.2 && (!best || m.base > best.base)) best = m;
  }
  return best;
}
/** where (x, z) stands along a ramp: s = metres out from the rim (negative: on the top), lat = metres to the side */
function rampCoords(m: Mesa, x: number, z: number) {
  const { ux, uz, rim } = mesaRamp(m), dx = x - m.x, dz = z - m.z;
  return { s: dx * ux + dz * uz - rim, lat: Math.abs(-dx * uz + dz * ux) };
}
/** on the steps of this mesa's ramp; `upTo` is how far out along it still counts (the foot is level ground) */
const onRamp = (m: Mesa, x: number, z: number, upTo = 1.05) => {
  if (m.ramp === null) return false;
  const { s, lat } = rampCoords(m, x, z);
  return lat < m.W / 2 + 0.8 && s > -3 && s < m.L * upTo + 1;
};
const levelOf = (x: number, z: number) => {
  // standing on a ramp counts as the plateau it leads up to
  // the steps of a ramp count as the level they climb to (the second level's ramp sits on the first);
  // the lowest part of a ramp counts as the ground below, so nobody dithers at its foot
  let lvl = topOf(x, z);
  for (const m of MESAS) if (near(m, x, z, 4) && onRamp(m, x, z, 0.75) && (!lvl || m.base >= lvl.base)) lvl = m;
  return lvl;
};
const chain = (m: Mesa | null) => { const c: Mesa[] = []; for (let k = m; k; k = parentOf(k)) c.push(k); return c; };

/** is (x, z) the foot of this mesa's ramp (where you go to climb it)? */
function toFoot(m: Mesa, x: number, z: number) {
  const { ux, uz, x0, z0 } = mesaRamp(m);
  return Math.hypot(x - x0 - ux * (m.L + 3), z - z0 - uz * (m.L + 3)) < m.W / 2 + 6;
}
/** a plateau of this level blocks the straight line from f to t: head round it, else straight to t */
function around(fx: number, fz: number, tx: number, tz: number, level: Mesa | null, out: { x: number; z: number }) {
  const dx = tx - fx, dz = tz - fz, l2 = dx * dx + dz * dz || 1;
  let hit: Mesa | null = null, hitT = Infinity;
  for (const m of MESAS) {
    // obstacles are the plateaus that rise from the ground we are walking on
    if (m === level || (m.base === 0 ? level !== null : parentOf(m) !== level)) continue;
    if (!near(m, (fx + tx) / 2, (fz + tz) / 2, Math.hypot(dx, dz) / 2 + 4)) continue;
    // does the line cross the cliff itself? (its real, wobbly edge plus the rock standing on the slope)
    const t = Math.max(0, Math.min(1, ((m.x - fx) * dx + (m.z - fz) * dz) / l2)), cx = fx + dx * t, cz = fz + dz * t;
    const edge = mesaRadius(m, Math.atan2(cz - m.z, cx - m.x)) + RING + 1.4;
    // a ramp sticks out of the cliff with rocks along it: crossing it sideways counts as blocked too
    let blocked = Math.hypot(cx - m.x, cz - m.z) < edge;
    if (!blocked && m.ramp !== null && !toFoot(m, tx, tz)) {
      const { ux, uz, x0, z0 } = mesaRamp(m);
      blocked = segSeg(fx, fz, tx, tz, x0, z0, x0 + ux * m.L, z0 + uz * m.L) < m.W / 2 + 1.6;
    }
    if (blocked && t < hitT) { hit = m; hitT = t; }
  }
  if (!hit) { out.x = tx; out.z = tz; return out; }
  // go round on the side the line already passes: head for the tangent to the cliff on that side,
  // a little beyond it, so the way stays clear of the rock (and of the plateau's own ramp)
  // round a plateau and its ramp; on top of another one, round just the upper level's cliff (there's no room for more)
  const Rc = (hit.base > 0 ? hit.R * 1.3 : Math.max(hit.R * 1.3, hit.ramp !== null ? mesaRamp(hit).rim + hit.L : 0)) + RING + 2, ex = fx - hit.x, ez = fz - hit.z, de = Math.hypot(ex, ez) || 1;
  // which way round: the shorter way towards the target (stable from frame to frame)
  const side = ex * (tz - hit.z) - ez * (tx - hit.x);
  const sg = side >= 0 ? 1 : -1, a0 = Math.atan2(ez, ex);
  // standing in line with its ramp: first step off to that side, so the way round doesn't cross the ramp
  if (hit.ramp !== null && !toFoot(hit, tx, tz)) {
    const { ux, uz, rim } = mesaRamp(hit), along = ex * ux + ez * uz - rim, lat = -ex * uz + ez * ux;
    if (Math.abs(lat) < hit.W / 2 + 2.5 && along > -1 && along < hit.L + 6) {
      const want = hit.W / 2 + 4.5, r = rim + Math.max(along, hit.L * 0.6);
      out.x = hit.x + ux * r - uz * sg * want; out.z = hit.z + uz * r + ux * sg * want;
      return out;
    }
  }
  const a = de > Rc ? a0 + sg * (Math.acos(Rc / de) + 0.2) : a0 + sg * 0.55;   // tangent, or slide along when close
  out.x = hit.x + Math.cos(a) * (Rc + 1.5); out.z = hit.z + Math.sin(a) * (Rc + 1.5);
  return out;
}

/** shortest distance between segments ab and cd */
function segSeg(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const cross = (px: number, pz: number, qx: number, qz: number, rx: number, rz: number) => (qx - px) * (rz - pz) - (qz - pz) * (rx - px);
  const d1 = cross(ax, az, bx, bz, cx, cz), d2 = cross(ax, az, bx, bz, dx, dz), d3 = cross(cx, cz, dx, dz, ax, az), d4 = cross(cx, cz, dx, dz, bx, bz);
  if (d1 * d2 < 0 && d3 * d4 < 0) return 0;
  const pd = (px: number, pz: number, sx: number, sz: number, ex: number, ez: number) => {
    const vx = ex - sx, vz = ez - sz, l2 = vx * vx + vz * vz || 1, t = Math.max(0, Math.min(1, ((px - sx) * vx + (pz - sz) * vz) / l2));
    return Math.hypot(px - sx - vx * t, pz - sz - vz * t);
  };
  return Math.min(pd(ax, az, cx, cz, dx, dz), pd(bx, bz, cx, cz, dx, dz), pd(cx, cz, ax, az, bx, bz), pd(dx, dz, ax, az, bx, bz));
}

/** the point an enemy at f should walk towards to reach t; equals t when the way is clear */
export function navTarget(fx: number, fz: number, tx: number, tz: number, out: { x: number; z: number }) {
  const a = levelOf(fx, fz), b = levelOf(tx, tz);
  // on the bottom steps of a ramp the target isn't up: step off at the foot first, then go round
  if (!a || a.base === 0) for (const m of MESAS) {
    if (m === b || m.ramp === null || !near(m, fx, fz, 4) || !onRamp(m, fx, fz) || onRamp(m, fx, fz, 0.75)) continue;
    if (chain(b).includes(m)) break;
    const { ux, uz, x0, z0 } = mesaRamp(m); out.x = x0 + ux * (m.L + 4); out.z = z0 + uz * (m.L + 4); return out;
  }
  if (a === b) {
    // still on the steps of the ramp and the target is up on the top: finish the climb first
    if (a && a.ramp !== null && !topOf(fx, fz) && topOf(tx, tz) === a) {
      const { ux, uz, x0, z0 } = mesaRamp(a); out.x = x0 - ux * 4; out.z = z0 - uz * 4; return out;
    }
    return around(fx, fz, tx, tz, a, out);
  }
  const ca = chain(a), cb = chain(b);
  if (a && !cb.includes(a)) {
    // up here and the target isn't: back to the ramp and down it
    if (a.ramp === null) { out.x = tx; out.z = tz; return out; }
    const { ux, uz, x0, z0 } = mesaRamp(a);
    if (onRamp(a, fx, fz)) { out.x = x0 + ux * (a.L + 4); out.z = z0 + uz * (a.L + 4); return out; }
    return around(fx, fz, x0 - ux * 1.5, z0 - uz * 1.5, a, out);
  }
  // the target is higher up: climb the next plateau on its way
  const next = cb.filter(m => !ca.includes(m)).pop()!;
  if (next.ramp === null) {
    // no way up: wait at the foot of the cliff, below the target
    const ang = Math.atan2(tz - next.z, tx - next.x), r = mesaRadius(next, ang) + RING + 2.2;
    return around(fx, fz, next.x + Math.cos(ang) * r, next.z + Math.sin(ang) * r, a, out);
  }
  const { ux, uz, x0, z0 } = mesaRamp(next);
  if (onRamp(next, fx, fz)) { out.x = x0 - ux * 4; out.z = z0 - uz * 4; return out; }
  return around(fx, fz, x0 + ux * (next.L + 3), z0 + uz * (next.L + 3), a, out);
}
