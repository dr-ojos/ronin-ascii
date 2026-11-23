import * as THREE from 'three';
import { M } from './materials';
import type { EnemyModel } from './types';

type Species = 'wolf' | 'bear' | 'boar' | 'spider';
export interface BeastLook { species: Species; coat: number; trim: number; eye: number }

const SPHERE = new THREE.SphereGeometry(1, 12, 9);
const LIMB = new THREE.CylinderGeometry(0.74, 1, 1, 7);
const CONE = new THREE.ConeGeometry(1, 1, 6);
const TUSK = new THREE.TorusGeometry(1, 0.23, 5, 11, Math.PI * 0.62);
const RING = new THREE.RingGeometry(0.85, 1.05, 28).rotateX(-Math.PI / 2);

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

/** Animated directly in the game so quadrupeds and spiders keep their own silhouettes in ASCII. */
export function createBeast(look: BeastLook): EnemyModel {
  const root = new THREE.Group(), body = new THREE.Group(), head = new THREE.Group(), tail = new THREE.Group();
  root.add(body);
  body.add(head, tail);
  const coat = M(look.coat, { roughness: 0.96 });
  const trim = M(look.trim, { roughness: 0.86 });
  const dark = M(0x262228, { roughness: 0.82 });
  const ivory = M(0xe4d0a7, { roughness: 0.42 });
  const eyes = new THREE.MeshBasicMaterial({ color: look.eye });
  const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  ring.position.y = 0.048;
  root.add(ring);
  const legs: { joint: THREE.Group; side: number; phase: number }[] = [];
  const bear = look.species === 'bear', boar = look.species === 'boar', spider = look.species === 'spider';
  const joint = (x: number, y: number, z: number, side: number, phase: number) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    body.add(g);
    legs.push({ joint: g, side, phase });
    return g;
  };
  if (spider) {
    part(body, SPHERE, coat, 0, 0.61, -0.44, 0.43, 0.37, 0.66);
    part(body, SPHERE, trim, 0, 0.84, -0.46, 0.19, 0.105, 0.36);
    head.position.set(0, 0.54, 0.24);
    part(head, SPHERE, coat, 0, 0, 0, 0.31, 0.22, 0.38);
    for (const side of [-1, 1]) {
      part(head, SPHERE, eyes, side * 0.10, 0.08, 0.318, 0.041, 0.037, 0.031);
      part(head, SPHERE, eyes, side * 0.198, 0.065, 0.268, 0.030, 0.027, 0.024);
      part(head, CONE, ivory, side * 0.115, -0.11, 0.34, 0.05, 0.22, 0.05).rotation.x = Math.PI * 0.75;
      for (let i = 0; i < 4; i++) {
        const g = joint(side * 0.24, 0.53, 0.31 - i * 0.19, side, (i + (side > 0 ? 1 : 0)) * Math.PI);
        g.rotation.y = side * (i - 1.5) * 0.43;
        part(g, LIMB, trim, side * 0.26, 0.15, 0, 0.066, 0.62, 0.068).rotation.z = -side * 1.05;
        part(g, SPHERE, coat, side * 0.53, 0.29, 0, 0.088, 0.09, 0.09);
        part(g, LIMB, dark, side * 0.70, -0.075, 0, 0.051, 0.84, 0.053).rotation.z = side * 0.43;
      }
    }
  } else {
    const height = bear ? 1.13 : boar ? 0.71 : 0.87;
    const width = bear ? 0.48 : boar ? 0.30 : 0.25;
    const belly = bear ? 0.50 : boar ? 0.35 : 0.26;
    const length = bear ? 0.93 : boar ? 0.63 : 0.68;
    part(body, SPHERE, coat, 0, height, -0.05, width, belly, length);
    part(body, SPHERE, trim, 0, height - belly * 0.4, 0.38, width * 0.78, belly * 0.88, length * 0.65);
    part(body, SPHERE, coat, 0, height + 0.10, 0.40, width * 0.96, belly * 0.92, length * 0.64);
    head.position.set(0, height + (boar ? 0.02 : 0.11), length * 0.83);
    const hw = bear ? 0.29 : boar ? 0.22 : 0.19;
    part(head, SPHERE, coat, 0, 0.07, 0.08, hw, hw * 0.98, hw * 1.22);
    const muzzle = boar ? 0.43 : bear ? 0.30 : 0.36;
    part(head, SPHERE, trim, 0, -0.045, muzzle * 0.72, hw * 0.73, hw * 0.51, muzzle * 0.62);
    part(head, SPHERE, dark, 0, 0.004, muzzle * 1.24, hw * 0.48, hw * 0.31, hw * 0.27);
    for (const side of [-1, 1]) {
      part(head, SPHERE, eyes, side * hw * 0.81, 0.11, hw, 0.035, 0.026, 0.025);
      if (bear) part(head, SPHERE, dark, side * 0.208, 0.29, -0.012, 0.105, 0.11, 0.065);
      else part(head, CONE, trim, side * (boar ? 0.15 : 0.14), 0.28, -0.012, 0.10, 0.29, 0.081).rotation.z = side * -0.23;
      if (boar) {
        const tusk = part(head, TUSK, ivory, side * 0.145, -0.09, 0.30, 0.105, 0.105, 0.105);
        tusk.rotation.set(0.11, -side * 0.95, side === 1 ? -0.35 : 1.31);
      }
      for (const front of [-1, 1]) {
        const h = height * (front > 0 ? 0.98 : 0.92);
        const g = joint(side * width * 0.67, h, front * length * 0.61, side, (front === side ? 0 : Math.PI));
        const girth = bear ? 0.15 : boar ? 0.096 : 0.091;
        part(g, SPHERE, coat, 0, -h * 0.18, 0, girth * 1.24, h * 0.35, girth * 1.33);
        part(g, LIMB, trim, 0, -h * 0.65, front > 0 ? 0.01 : -0.045, girth * 0.69, h * 0.55, girth * 0.74).rotation.x = front > 0 ? 0 : -0.2;
        part(g, SPHERE, dark, 0, -h + 0.061, 0.067, girth * 0.91, 0.066, girth * 1.51);
      }
    }
    tail.position.set(0, height + 0.08, -length * 0.88);
    const tl = bear ? 0.22 : boar ? 0.27 : 0.7;
    part(tail, SPHERE, trim, 0, -tl * 0.25, -tl * 0.44, bear ? 0.115 : 0.079, tl * 0.28, tl * 0.61).rotation.x = -0.45;
    if (boar) {
      for (let i = 0; i < 5; i++) part(body, CONE, dark, 0, height + 0.27, 0.40 - i * 0.17, 0.15, 0.29, 0.17).rotation.x = -0.4;
    }
  }

  let stride = Math.random() * Math.PI * 2, time = 0, pose = 0;
  return {
    root, ring,
    update(dt, { moving, speed, state }) {
      time += dt;
      stride += dt * Math.min(20, 4 + speed * (spider ? 1.8 : 1.55));
      const wind = state === 'windup', strike = state === 'strike';
      pose = THREE.MathUtils.damp(pose, wind ? 1 : strike ? -1 : 0, 15, dt);
      body.position.y = Math.sin(time * 3.4) * 0.018 + Math.abs(Math.sin(stride)) * moving * 0.075
        + (bear ? Math.max(0, pose) * 0.24 : -pose * 0.10);
      body.rotation.x = pose * (bear ? -0.55 : 0.10);
      head.rotation.x = -pose * (bear ? -0.24 : 0.22);
      tail.rotation.y = Math.sin(time * (2.4 + moving * 3)) * 0.29;
      for (const leg of legs) {
        const swing = Math.sin(stride + leg.phase) * moving;
        leg.joint.rotation.x = spider ? 0 : swing * (bear ? 0.49 : 0.63) + (bear && leg.joint.position.z > 0 ? pose * 0.65 : 0);
        if (spider) leg.joint.rotation.z = leg.side * (swing * 0.23 - pose * 0.14);
      }
    },
    setFlash(value) { coat.emissive.setScalar(value * 0.85); trim.emissive.setScalar(value * 0.8); },
    dispose() { for (const material of [coat, trim, dark, ivory, eyes, ring.material]) material.dispose(); }
  };
}
