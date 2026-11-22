// One-shot effects: particle bursts (hits, deaths) and slash arcs.
import * as THREE from 'three';
import { scene } from './renderer';
import { CLS, tagMat } from './materials';
import { player } from './state';
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
const arcs: { m: THREE.Group; mesh: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; life: number; max: number }[] = [];
export function slashArc(spin: boolean, big: boolean, combo = 0) {
  const spread = spin ? Math.PI * 2 : 2.6;
  const geo = new THREE.RingGeometry(big ? 1.0 : 1.1, big ? 3.2 : 2.7, 48, 1, -Math.PI / 2 - spread / 2, spread);
  const m = new THREE.Mesh(geo, tagMat(new THREE.MeshBasicMaterial({ color: 0xdfeaff, transparent: true, opacity: 0.3, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx));
  m.rotation.x = -Math.PI / 2;
  const tilt = new THREE.Group(); tilt.rotation.z = spin ? 0 : (combo === 0 ? -0.5 : 0.5); tilt.add(m);
  const g = new THREE.Group(); g.rotation.y = player.face; g.position.set(player.pos.x, player.pos.y + 1.15, player.pos.z); g.add(tilt);
  scene.add(g); arcs.push({ m: g, mesh: m, life: 0.2, max: 0.2 });
}

export function updateFx(dt: number) {
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i], pa = b.pts.geometry.attributes.position;
    for (let k = 0; k < b.v.length; k++) {
      b.v[k].y -= 9 * dt; b.v[k].multiplyScalar(0.985);
      pa.array[k * 3] += b.v[k].x * dt; pa.array[k * 3 + 1] = Math.max(b.floor, pa.array[k * 3 + 1] + b.v[k].y * dt); pa.array[k * 3 + 2] += b.v[k].z * dt;
    }
    pa.needsUpdate = true; b.life -= dt; b.pts.material.opacity = Math.max(0, b.life / b.max);
    if (b.life <= 0) { scene.remove(b.pts); b.pts.geometry.dispose(); b.pts.material.dispose(); bursts.splice(i, 1); }
  }
  for (let i = arcs.length - 1; i >= 0; i--) {
    const a = arcs[i]; a.life -= dt; a.mesh.material.opacity = Math.max(0, a.life / a.max);
    a.m.scale.setScalar(1 + (1 - a.life / a.max) * 0.15);
    if (a.life <= 0) { scene.remove(a.m); a.mesh.geometry.dispose(); a.mesh.material.dispose(); arcs.splice(i, 1); }
  }
}
