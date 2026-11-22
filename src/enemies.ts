// Oni: the live list and spawning (mocap-rigged or procedural) at a camp. Their behaviour is in enemy-ai.ts,
// where they stand and when they appear in encounters.ts.
import * as THREE from 'three';
import { rigGltf } from './assets';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createOniWarrior } from './rig';
import { scene } from './renderer';
import { ACTOR_LAYER } from './ascii';
import { M, CLS, tagTree } from './materials';
import { surfaceY } from './structures';
import { rnd } from './utils';
import type { Camp, Enemy } from './types';

const oniGeo = {
  robe: new THREE.ConeGeometry(0.55, 1.5, 7), head: new THREE.SphereGeometry(0.28, 12, 10),
  horn: new THREE.ConeGeometry(0.06, 0.28, 5), eye: new THREE.SphereGeometry(0.045, 6, 5),
  arm: new THREE.ConeGeometry(0.1, 0.8, 5), ring: new THREE.RingGeometry(0.85, 1.05, 28)
};
const hornMat = M(0xdccca2), eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
export const enemies: Enemy[] = [];
/** stats for one oni of a camp: tougher further from the shrine */
function stats(camp: Camp, big: boolean, x: number, z: number) {
  const t = camp.tier, hp = big ? 12 + Math.round(t * 8) : 3 + Math.round(t * 2.4);
  return { hp, maxHp: hp, dmg: Math.round((big ? 24 : 11) * (1 + t * 0.5)), camp, wander: { x, z } };
}
export function spawnOni(camp: Camp, big: boolean, x: number, z: number) {
  if (rigGltf) return spawnRealOni(rigGltf, camp, big, x, z);
  const g = new THREE.Group();
  const robeMat = M(big ? 0x8a1a14 : 0x6a2a6a, { roughness: 0.8, emissive: 0x000000 });
  const maskMat = M(big ? 0xc0402a : 0xe6ddc8, { roughness: 0.6, emissive: 0x000000 });
  const robe = new THREE.Mesh(oniGeo.robe, robeMat); robe.position.y = 0.75; g.add(robe);
  const head = new THREE.Mesh(oniGeo.head, maskMat); head.position.y = 1.72; g.add(head);
  for (const s of [1, -1]) {
    const h = new THREE.Mesh(oniGeo.horn, hornMat); h.position.set(0.13 * s, 2.0, 0); h.rotation.z = -0.35 * s; g.add(h);
    const e = new THREE.Mesh(oniGeo.eye, eyeMat); e.position.set(0.1 * s, 1.76, 0.24); g.add(e);
    const a = new THREE.Mesh(oniGeo.arm, robeMat); a.position.set(0.48 * s, 1.05, 0.15); a.rotation.set(-1.1, 0, -0.5 * s); g.add(a);
  }
  const ring = new THREE.Mesh(oniGeo.ring, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  const k = big ? 1.9 : rnd(0.9, 1.1); g.scale.setScalar(k);
  g.position.set(x, surfaceY(x, z), z); g.rotation.y = Math.random() * Math.PI * 2;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== ring) { o.castShadow = true; o.layers.enable(ACTOR_LAYER); } });
  tagTree(g, CLS.actor);
  scene.add(g);
  enemies.push({
    g, robeMat, maskMat, ring, big, scale: k, speed: big ? 2.0 : rnd(2.6, 3.6), ...stats(camp, big, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10
  });
}

function spawnRealOni(gltf: GLTF, camp: Camp, big: boolean, x: number, z: number) {
  const oni = createOniWarrior(gltf, big);
  const g = oni.root;
  const k = big ? 1.45 : 1; g.scale.setScalar(k);
  g.position.set(x, surfaceY(x, z), z); g.rotation.y = Math.random() * Math.PI * 2;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== oni.ring) o.layers.enable(ACTOR_LAYER); });
  tagTree(g, CLS.actor);
  scene.add(g);
  enemies.push({
    g, oni, ring: oni.ring, big, scale: k, speed: big ? 2.2 : rnd(2.8, 3.8), move: 0, ...stats(camp, big, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10
  });
}
