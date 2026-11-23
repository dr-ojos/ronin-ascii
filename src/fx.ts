// One-shot effects: particle bursts (hits, deaths) and the dodge's halo (the cut itself leaves its trail in katana-fx.ts).
import * as THREE from 'three';
import { scene } from './renderer';
import { CLS, tagMat } from './materials';
import { rnd } from './utils';
import { groundY } from './terrain';

const bursts: { pts: THREE.Points<THREE.BufferGeometry, THREE.PointsMaterial>; v: THREE.Vector3[]; life: number; max: number; floor: number }[] = [];
export function burst(pos: THREE.Vector3, color: THREE.ColorRepresentation, n = 60, speed = 7, size = 0.16) {
  const p = new Float32Array(n * 3), v: THREE.Vector3[] = [];
  for (let i = 0; i < n; i++) {
    p.set([pos.x, pos.y, pos.z], i * 3);
    const d = new THREE.Vector3(rnd(-1, 1), rnd(-0.2, 1.2), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.3, 1));
    v.push(d);
  }
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(p, 3));
  const pts = new THREE.Points(geo, tagMat(new THREE.PointsMaterial({ color, size, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx));
  scene.add(pts); bursts.push({ pts, v, life: 0.9, max: 0.9, floor: groundY(pos.x, pos.z) + 0.05 });
}

// ------------------------------------------------------------ dodge halo: glowing after-images along the dash
const GHOST_BODY = new THREE.CapsuleGeometry(0.32, 0.95, 4, 10), GHOST_HEAD = new THREE.SphereGeometry(0.2, 10, 8);
const GHOST_RING = new THREE.RingGeometry(0.5, 0.75, 32);
const ghostMat = tagMat(new THREE.MeshBasicMaterial({ color: 0x7fd8ff, transparent: true, opacity: 0.45, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx);
const ghosts: { g: THREE.Object3D; mat: THREE.MeshBasicMaterial; life: number; max: number; peak: number; grow: number }[] = [];
/** one after-image of the samurai where it is now */
export function dashGhost(pos: THREE.Vector3, face: number, k = 1) {
  const mat = ghostMat.clone(), g = new THREE.Group();
  const body = new THREE.Mesh(GHOST_BODY, mat); body.position.y = 0.85; g.add(body);
  const head = new THREE.Mesh(GHOST_HEAD, mat); head.position.y = 1.62; g.add(head);
  g.position.copy(pos); g.rotation.y = face; scene.add(g);
  ghosts.push({ g, mat, life: 0.45, max: 0.45, peak: 0.45 * k, grow: 0.15 });
}
/** a ring of light that spreads from your feet when you start the dodge */
export function dashRing(pos: THREE.Vector3) {
  const mat = ghostMat.clone(), m = new THREE.Mesh(GHOST_RING, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, groundY(pos.x, pos.z) + 0.08, pos.z); scene.add(m);
  ghosts.push({ g: m, mat, life: 0.4, max: 0.4, peak: 0.7, grow: 2.6 });
}

/** a ring of light that runs along the ground from a heavy landing */
export function impactRing(pos: THREE.Vector3, color: THREE.ColorRepresentation, size = 4) {
  const mat = ghostMat.clone(); mat.color.set(color);
  const m = new THREE.Mesh(GHOST_RING, mat);
  m.rotation.x = -Math.PI / 2; m.position.set(pos.x, groundY(pos.x, pos.z) + 0.08, pos.z); scene.add(m);
  ghosts.push({ g: m, mat, life: 0.5, max: 0.5, peak: 0.9, grow: size });
}

export function updateFx(dt: number) {
  for (let i = ghosts.length - 1; i >= 0; i--) {
    const h = ghosts[i]; h.life -= dt;
    const k = Math.max(0, h.life / h.max);
    h.mat.opacity = h.peak * k; h.g.scale.setScalar(1 + (1 - k) * h.grow);
    if (h.life <= 0) { scene.remove(h.g); h.mat.dispose(); ghosts.splice(i, 1); }
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i], pa = b.pts.geometry.attributes.position;
    for (let k = 0; k < b.v.length; k++) {
      b.v[k].y -= 9 * dt; b.v[k].multiplyScalar(0.985);
      pa.array[k * 3] += b.v[k].x * dt; pa.array[k * 3 + 1] = Math.max(b.floor, pa.array[k * 3 + 1] + b.v[k].y * dt); pa.array[k * 3 + 2] += b.v[k].z * dt;
    }
    pa.needsUpdate = true; b.life -= dt; b.pts.material.opacity = Math.max(0, b.life / b.max);
    if (b.life <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
  }
}
