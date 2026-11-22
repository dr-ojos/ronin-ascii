// Oni: the live list and spawning (mocap-rigged or procedural). Their behaviour is in enemy-ai.js.
import * as THREE from 'three';
import { rigGltf } from './assets';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import { createOniWarrior } from './rig';
import { scene } from './renderer';
import { ACTOR_LAYER } from './ascii';
import { M, CLS, tagTree } from './materials';
import { WORLD_R } from './world';
import { player } from './state';
import { rnd } from './utils';
import type { Enemy } from './types';

const oniGeo = {
  robe: new THREE.ConeGeometry(0.55, 1.5, 7), head: new THREE.SphereGeometry(0.28, 12, 10),
  horn: new THREE.ConeGeometry(0.06, 0.28, 5), eye: new THREE.SphereGeometry(0.045, 6, 5),
  arm: new THREE.ConeGeometry(0.1, 0.8, 5), ring: new THREE.RingGeometry(0.85, 1.05, 28)
};
const hornMat = M(0xdccca2), eyeMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
export const enemies: Enemy[] = [];
export function spawnOni(big: boolean) {
  if (rigGltf) return spawnRealOni(rigGltf, big);
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
  const a = Math.random() * Math.PI * 2, r = rnd(18, 28);
  let x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
  const d = Math.hypot(x, z); if (d > WORLD_R - 2) { x *= (WORLD_R - 2) / d; z *= (WORLD_R - 2) / d; }
  g.position.set(x, 0, z);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== ring) { o.castShadow = true; o.layers.enable(ACTOR_LAYER); } });
  tagTree(g, CLS.actor);
  scene.add(g);
  enemies.push({
    g, robeMat, maskMat, ring, big, scale: k, hp: big ? 12 : 3, speed: big ? 2.0 : rnd(2.6, 3.6),
    dmg: big ? 24 : 11, state: 'chase', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10
  });
}

function spawnRealOni(gltf: GLTF, big: boolean) {
  const oni = createOniWarrior(gltf, big);
  const g = oni.root;
  const k = big ? 1.45 : 1; g.scale.setScalar(k);
  const a = Math.random() * Math.PI * 2, r = rnd(18, 28);
  let x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
  const d = Math.hypot(x, z); if (d > WORLD_R - 2) { x *= (WORLD_R - 2) / d; z *= (WORLD_R - 2) / d; }
  g.position.set(x, 0, z);
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== oni.ring) o.layers.enable(ACTOR_LAYER); });
  tagTree(g, CLS.actor);
  scene.add(g);
  enemies.push({
    g, oni, ring: oni.ring, big, scale: k, hp: big ? 12 : 3, speed: big ? 2.2 : rnd(2.8, 3.8), move: 0,
    dmg: big ? 24 : 11, state: 'chase', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10
  });
}
