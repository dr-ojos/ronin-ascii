// The river can be waded: how deep a point is, and the ripples that spread wherever something touches
// the water (feet, a dodge, a blow, a falling oni). The ripples live in a small ring buffer of uniforms
// that the water shader reads (structures.ts), so every water surface shows them for free.
import * as THREE from 'three';
import { RIVER, lineDist } from './map';
import { wind } from './nature';
import { burst } from './fx';
import { sfx, panOf } from './sfx';

export const RIPPLES = 24;
/** x, z, start time (wind.uTime), strength */
export const rippleUniforms = { uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) } };
let next = 0;
/** a ring of waves spreading from (x, z) */
export function ripple(x: number, z: number, strength = 1) {
  rippleUniforms.uRip.value[next].set(x, z, wind.uTime.value, strength);
  next = (next + 1) % RIPPLES;
}

/** 0 on the bank, 1 in the middle of the river (callers rule out the bridges) */
export function riverDepth(x: number, z: number) {
  const d = lineDist(x, z, RIVER), half = RIVER.width / 2;
  return d > half ? 0 : 1 - THREE.MathUtils.smoothstep(d, half * 0.3, half);
}
/** how far the feet sink into the riverbed at full depth */
export const WADE_SINK = 0.5;

/** spray of droplets, a big ring and a splash sound */
export function splash(x: number, y: number, z: number, power = 1) {
  ripple(x, z, 1.4 * power);
  burst(new THREE.Vector3(x, y + 0.15, z), 0x9fd2ff, Math.round(26 * power), 3.2 + power * 1.6, 0.11);
  sfx.splash({ power, pan: panOf(x, z) });
}

/** per-walker bookkeeping: emits ripples while it wades, a splash when it steps in */
export function wader() {
  let gap = 0, was = 0;
  return function step(dt: number, x: number, y: number, z: number, depth: number, moving: number, fast = false) {
    if (depth <= 0.02) { was = 0; return; }
    if (was <= 0.02 && moving > 0.3) splash(x, y, z, 0.7);
    was = depth;
    gap -= dt;
    if (gap > 0) return;
    if (moving > 0.3) { ripple(x, z, 0.5 + depth * 0.5); gap = fast ? 0.12 : 0.2; }
    else { ripple(x, z, 0.25 + depth * 0.15); gap = 0.85; }      // standing still: water lapping at the legs
  };
}
