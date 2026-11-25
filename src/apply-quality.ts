// Switches the graphics quality (quality.ts) while the game runs: pixel ratio, ASCII grid, shadow filter and size.
import * as THREE from 'three';
import { renderer, scene, setDpr } from './renderer';
import { resizeAscii } from './ascii';
import { setMoonShadowMap } from './world';
import { dprFor, QUALITY_PRESETS, storeQuality, type Quality } from './quality';

export function setQuality(q: Quality) {
  storeQuality(q);
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
