// Lantern light for a whole world with a fixed budget: every lantern, window and campfire registers an
// anchor, and a small pool of real point lights is handed each frame to the anchors nearest the player.
// The number of lights never changes (so no shader recompiles) and lights fade in / out at the edge of the set.
import * as THREE from 'three';
import { scene } from './renderer';

export interface LightAnchor { x: number; y: number; z: number; color: number; intensity: number; distance: number; decay: number; flicker?: number; owner?: unknown }
const anchors: LightAnchor[] = [];
const POOL = 7;
const pool = Array.from({ length: POOL }, () => { const l = new THREE.PointLight(0xffa050, 0, 14, 1.4); scene.add(l); return l; });

export function addLight(a: LightAnchor) { anchors.push(a); return a; }
export function removeLights(owner: unknown) {
  for (let i = anchors.length - 1; i >= 0; i--) if (anchors[i].owner === owner) anchors.splice(i, 1);
}

const ranked: { a: LightAnchor; d: number }[] = [];
export function updateLights(px: number, pz: number, t: number) {
  ranked.length = 0;
  for (const a of anchors) {
    const d = Math.hypot(a.x - px, a.z - pz);
    if (d < 70) ranked.push({ a, d });
  }
  ranked.sort((p, q) => p.d - q.d);
  // the first anchor left out sets the fade: lights about to drop out of the set dim smoothly
  const edge = ranked.length > POOL ? ranked[POOL].d : 70;
  for (let i = 0; i < POOL; i++) {
    const l = pool[i], r = ranked[i];
    if (!r) { l.intensity = 0; continue; }
    const a = r.a, fade = Math.min(1, Math.max(0, (edge - r.d) / 6)) * Math.min(1, Math.max(0, (70 - r.d) / 15));
    // fires: several unrelated beats plus a slow surge, and the light itself dances with the flames
    const f = a.flicker || 0, ph = a.x * 0.37 + a.z * 0.61;
    const fl = f ? 1 + f * (Math.sin(t * 13 + ph) * 0.11 + Math.sin(t * 29.3 + ph * 1.7) * 0.07 + Math.sin(t * 47.1 + ph * 2.3) * 0.05
      + Math.sin(t * 2.1 + ph) * Math.sin(t * 3.7 + ph * 0.5) * 0.12) : 1;
    l.position.set(a.x + f * Math.sin(t * 7.3 + ph) * 0.12, a.y + f * Math.sin(t * 9.1 + ph * 1.3) * 0.15, a.z + f * Math.cos(t * 6.1 + ph) * 0.12);
    l.color.setHex(a.color);
    l.intensity = a.intensity * fade * fl; l.distance = a.distance; l.decay = a.decay;
  }
}
