// Character lens flares for the special techniques: a star drawn with ASCII strokes
// (`----*----` across, `|` up and down, short `\ /` diagonals) over the impact point. ascii.ts
// draws the strokes into the environment's character grid and its glow pass haloes them.
//
// Every flare lives through three phases:
//   aviso  (pre)  a thin dim `|` beam drops from the sky onto the point, with a tiny `-+-` mark;
//   golpe         the full star snaps open in a few hundredths of a second;
//   final         the horizontal streak shrinks first and the vertical beam lingers, thinning out.
import * as THREE from 'three';
import { camera, renderer, scene } from './renderer';
import { state } from './state';
import { CLS, tagMat } from './materials';
import { anamorphicFlareTex, softGlowTex } from './vfx-art';

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

// 3D optical anamorphic flares for T-mode (direct WebGL): hidden in ASCII mode where ascii.ts draws character flares
const flarePool = Array.from({ length: MAX_FLARES }, () => {
  const starMat = tagMat(new THREE.SpriteMaterial({
    map: anamorphicFlareTex, color: 0xffffff, transparent: true, opacity: 0,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const coreMat = tagMat(new THREE.SpriteMaterial({
    map: softGlowTex, color: 0xffffff, transparent: true, opacity: 0,
    depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const star = new THREE.Sprite(starMat);
  const core = new THREE.Sprite(coreMat);
  star.renderOrder = 998;
  core.renderOrder = 999;
  star.visible = core.visible = false;
  scene.add(star, core);
  return { star, core, starMat, coreMat };
});

function sync3dFlares() {
  const show = !state.asciiOn;
  for (let i = 0; i < MAX_FLARES; i++) {
    const slot = flarePool[i];
    const f = show ? flares[i] : undefined;
    if (!f) {
      slot.star.visible = slot.core.visible = false;
      continue;
    }
    const px = f.at.x, py = f.at.y + f.lift, pz = f.at.z;
    slot.star.position.set(px, py, pz);
    slot.core.position.set(px, py, pz);
    if (f.t < f.pre) {
      // aviso: pulsing star glint marking the incoming strike
      const p = f.t / Math.max(0.01, f.pre);
      const flick = Math.random() < 0.85 ? 1 : 0.45;
      const s = (0.7 + 0.9 * p) * f.size;
      slot.star.scale.set(s * 2.1, s * 1.15, 1);
      slot.core.scale.set(s * 0.55, s * 0.55, 1);
      slot.starMat.color.copy(f.color);
      slot.starMat.opacity = (0.35 + 0.55 * p) * flick;
      slot.coreMat.opacity = (0.45 + 0.45 * p) * flick;
    } else {
      const s = f.t - f.pre, u = Math.min(1, s / Math.max(0.01, f.life));
      const open = Math.min(1, s / ATTACK), e = 1 - u;
      const k = open * Math.pow(e, 1.15);
      const w = (3.4 + 2.6 * open) * f.size * (0.45 + 0.55 * e);
      const h = (1.6 + 1.4 * open) * f.size * Math.pow(e, 0.7);
      slot.star.scale.set(w, h, 1);
      slot.core.scale.set(w * 0.28, w * 0.28, 1);
      slot.starMat.color.copy(f.color);
      slot.starMat.opacity = Math.min(1, k * 1.15);
      slot.coreMat.opacity = Math.min(1, k * 0.95);
    }
    slot.star.visible = slot.core.visible = true;
  }
}

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
  sync3dFlares();
}

export function clearFlares() {
  flares.length = 0;
  sync3dFlares();
}

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
