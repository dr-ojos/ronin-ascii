// Character lens flares for the special techniques: a star drawn with ASCII strokes
// (`----*----` across, `|` up and down, short `\ /` diagonals) over the impact point. ascii.ts
// draws the strokes into the environment's character grid and its glow pass haloes them.
//
// Every flare lives through three phases:
//   aviso  (pre)  a thin dim `|` beam drops from the sky onto the point, with a tiny `-+-` mark;
//   golpe         the full star snaps open in a few hundredths of a second;
//   final         the horizontal streak shrinks first and the vertical beam lingers, thinning out.
import * as THREE from 'three';
import { camera, renderer } from './renderer';

export const MAX_FLARES = 8;
const ATTACK = 0.05;   // seconds for the star to snap fully open

interface Flare {
  at: THREE.Vector3;   // followed live: pass an enemy's position to track it
  lift: number;        // metres above `at`
  color: THREE.Color;
  size: number;
  pre: number;         // aviso duration
  life: number;        // golpe + final duration (0: aviso only, something else bursts afterwards)
  t: number;
}
const flares: Flare[] = [];

export const flareUniforms = {
  uFlareA: { value: Array.from({ length: MAX_FLARES }, () => new THREE.Vector4()) },   // x, y (device px, y up), half-length across, half-length up/down (< 0: upwards only)
  uFlareB: { value: Array.from({ length: MAX_FLARES }, () => new THREE.Vector4()) },   // rgb, intensity (0 = off)
  uGlow: { value: 1 }                                                                 // glow strength; rises while flares burn
};

export interface FlareOpts { size?: number; life?: number; pre?: number; lift?: number; follow?: boolean }
/** a character star at `at`. With `follow`, the vector is read every frame (an oni's position). */
export function flare(at: THREE.Vector3, color: THREE.ColorRepresentation, o: FlareOpts = {}) {
  const f: Flare = { at: o.follow ? at : at.clone(), lift: o.lift ?? 0, color: new THREE.Color(color),
    size: o.size ?? 1, pre: o.pre ?? 0, life: o.life ?? 0.55, t: 0 };
  if (flares.length >= MAX_FLARES) {
    // full: the flare closest to its end makes room
    let worst = 0, left = Infinity;
    flares.forEach((g, i) => { const r = g.pre + g.life - g.t; if (r < left) { left = r; worst = i; } });
    flares.splice(worst, 1);
  }
  flares.push(f);
}

export function updateFlares(dt: number) {
  for (let i = flares.length - 1; i >= 0; i--) if ((flares[i].t += dt) >= flares[i].pre + flares[i].life) flares.splice(i, 1);
}

export function clearFlares() { flares.length = 0; }

const _p = new THREE.Vector3(), _v = new THREE.Vector3(), _buf = new THREE.Vector2();
/** every frame, after the camera moved: the flares' screen positions and shapes for ascii.ts */
export function projectFlares() {
  renderer.getDrawingBufferSize(_buf);
  const W = _buf.x, H = _buf.y, A = flareUniforms.uFlareA.value, B = flareUniforms.uFlareB.value;
  let glow = 0;
  for (let i = 0; i < MAX_FLARES; i++) {
    const f = flares[i];
    B[i].w = 0;
    if (!f) continue;
    _p.copy(f.at); _p.y += f.lift;
    const dist = _v.copy(_p).applyMatrix4(camera.matrixWorldInverse).z;
    if (dist > -0.3) continue;                                            // behind the camera
    _p.project(camera);
    const x = (_p.x * 0.5 + 0.5) * W, y = (_p.y * 0.5 + 0.5) * H;
    const persp = THREE.MathUtils.clamp(14 / -dist, 0.45, 1.3) * f.size;
    let across: number, upDown: number, k: number;
    if (f.t < f.pre) {
      // aviso: the beam falls from the top of the screen towards the point and flickers
      const p = f.t / f.pre;
      across = 0.022 * W * persp;
      upDown = -(H - y + 8) * Math.min(1, p * 3);
      k = (0.55 + 0.3 * p) * (Math.random() < 0.85 ? 1 : 0.5);
      glow = Math.max(glow, 0.4 * p);
    } else {
      const s = f.t - f.pre, u = s / f.life, open = Math.min(1, s / ATTACK), e = 1 - u;
      across = 0.24 * W * persp * (0.35 + 0.65 * open) * e * e;           // the streak collapses first...
      upDown = 0.3 * H * persp * (0.4 + 0.6 * open) * Math.pow(e, 0.6);    // ...the beam lingers
      k = open * Math.pow(e, 1.1);
      glow = Math.max(glow, k);
    }
    A[i].set(x, y, across, upDown);
    B[i].set(f.color.r, f.color.g, f.color.b, k);
  }
  flareUniforms.uGlow.value = 1 + 0.8 * glow;
}
