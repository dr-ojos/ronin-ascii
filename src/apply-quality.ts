// Switches the graphics quality (quality.ts) while the game runs: pixel ratio, ASCII grid, shadow filter and size.
// T mode (the plain 3D view) always runs at Baja; back in ASCII the quality the player chose returns.
import * as THREE from 'three';
import { renderer, scene, setDpr } from './renderer';
import { resizeAscii } from './ascii';
import { setMoonShadowMap } from './world';
import { dprFor, quality, QUALITY_PRESETS, storeQuality, type Quality } from './quality';
import { state } from './state';

/** what the renderer runs right now (renderer.ts and world.ts start with the stored quality) */
let applied: Quality = quality;
export const effectiveQuality = (): Quality => state.viewMode === '3d' ? 'baja' : quality;

function apply(q: Quality) {
  applied = q;
  const p = QUALITY_PRESETS[q];
  setDpr(dprFor(q));
  resizeAscii();   // the character grid and the ASCII pass's buffers follow the new pixel count
  setMoonShadowMap(p.shadowMap);
  if (renderer.shadowMap.type !== p.shadowType) {
    renderer.shadowMap.type = p.shadowType;
    // three.js picks the shadow filter when it compiles a material: rebuild the ones in the scene
    scene.traverse(o => {
      const m = (o as THREE.Mesh).material;
      if (m) for (const mat of Array.isArray(m) ? m : [m]) mat.needsUpdate = true;
    });
  }
  renderer.shadowMap.needsUpdate = true;
}

/** every frame (main.ts): follows T mode on and off, and the H menu's choice */
export function syncQuality() { const q = effectiveQuality(); if (q !== applied) apply(q); }

/** the player's choice (H menu): kept for ASCII mode, applied now unless T mode holds Baja */
export function setQuality(q: Quality) { storeQuality(q); syncQuality(); }
