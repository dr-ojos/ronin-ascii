import * as THREE from 'three';
import { M } from './materials';
import { mangaFinish } from './manga-art';
import { crystalBladeGeo, crystalLoft, crystalShardGeo, earGeo, furLockGeo, getFurTextures, limbGeo, loftMesh, taperTube } from './beast-art';
import type { EnemyModel } from './types';

type Species = 'wolf' | 'bear' | 'boar' | 'spider' | 'scorpion';
export interface BeastLook { species: Species; coat: number; trim: number; eye: number; alpha?: boolean }

function withWhiteColors(g: THREE.BufferGeometry) {
  const c = new Float32Array(g.attributes.position.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// Shared primitives (spider + shadow ring + small eye/nostril accents)
const SPHERE = withWhiteColors(new THREE.SphereGeometry(1, 12, 9));
const LIMB = withWhiteColors(new THREE.CylinderGeometry(0.74, 1, 1, 7));
const CONE = withWhiteColors(new THREE.ConeGeometry(1, 1, 6));
const RING = new THREE.RingGeometry(0.85, 1.05, 28).rotateX(-Math.PI / 2);

// ------------------------------------------------------------ Cached sculpted geometries per species

const wolfGeo = {
  torso: loftMesh([
    { z: -0.68, y: 0.79, rx: 0.13, ryTop: 0.13, ryBot: 0.11, shadeTop: 0.78, shadeSide: 0.94, shadeBot: 0.80 },
    { z: -0.46, y: 0.82, rx: 0.20, ryTop: 0.17, ryBot: 0.15, shadeTop: 0.78, shadeSide: 1.00, shadeBot: 0.84 },
    { z: -0.18, y: 0.81, rx: 0.145, ryTop: 0.155, ryBot: 0.115, botPinch: 0.25, shadeTop: 0.80, shadeSide: 1.00, shadeBot: 0.92 },
    { z:  0.14, y: 0.82, rx: 0.215, ryTop: 0.185, ryBot: 0.245, botPinch: 0.45, shadeTop: 0.76, shadeSide: 1.00, shadeBot: 0.96 },
    { z:  0.40, y: 0.86, rx: 0.23, ryTop: 0.215, ryBot: 0.22, topPinch: 0.35, botPinch: 0.40, shadeTop: 0.74, shadeSide: 0.98, shadeBot: 0.98 },
    { z:  0.57, y: 0.87, rx: 0.155, ryTop: 0.15, ryBot: 0.14, shadeTop: 0.80, shadeSide: 0.98, shadeBot: 1.02 }
  ], 14),
  neck: loftMesh([
    { z: 0.44, y: 0.88, rx: 0.175, ryTop: 0.175, ryBot: 0.16, topPinch: 0.25, shadeTop: 0.76, shadeSide: 0.96, shadeBot: 1.02 },
    { z: 0.60, y: 0.97, rx: 0.15, ryTop: 0.155, ryBot: 0.14, topPinch: 0.25, shadeTop: 0.78, shadeSide: 0.98, shadeBot: 1.04 },
    { z: 0.74, y: 1.05, rx: 0.125, ryTop: 0.125, ryBot: 0.11, shadeTop: 0.82, shadeSide: 1.00, shadeBot: 1.00 }
  ], 12),
  skull: loftMesh([
    { z: -0.10, y:  0.04, rx: 0.14, ryTop: 0.13, ryBot: 0.10, shadeTop: 0.82, shadeSide: 0.98, shadeBot: 0.92 },
    { z:  0.04, y:  0.06, rx: 0.178, ryTop: 0.145, ryBot: 0.105, topPinch: 0.18, square: 0.16, shadeTop: 0.80, shadeSide: 1.00, shadeBot: 0.96 },
    { z:  0.16, y:  0.035, rx: 0.125, ryTop: 0.105, ryBot: 0.068, topPinch: 0.22, shadeTop: 0.82, shadeSide: 0.98, shadeBot: 0.94 },
    { z:  0.29, y:  0.015, rx: 0.082, ryTop: 0.068, ryBot: 0.042, topPinch: 0.15, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.92 },
    { z:  0.40, y:  0.008, rx: 0.056, ryTop: 0.046, ryBot: 0.028, shadeTop: 0.84, shadeSide: 0.96, shadeBot: 0.90 }
  ], 12),
  jaw: loftMesh([
    { z: 0.00, y: 0.00, rx: 0.088, ryTop: 0.030, ryBot: 0.042, shadeTop: 0.75, shadeSide: 0.92, shadeBot: 0.96 },
    { z: 0.14, y: -0.008, rx: 0.064, ryTop: 0.024, ryBot: 0.034, shadeTop: 0.78, shadeSide: 0.96, shadeBot: 0.98 },
    { z: 0.28, y: -0.005, rx: 0.042, ryTop: 0.020, ryBot: 0.025, shadeTop: 0.82, shadeSide: 0.98, shadeBot: 0.96 }
  ], 10),
  ear: earGeo(0.24, 0.135, 0.065, false),
  innerEar: earGeo(0.17, 0.075, 0.026, false),
  fang: taperTube([[0, 0, 0], [0, -0.028, 0.004], [0, -0.052, 0.002]], 0.014, 0.002, 6, 6),
  maneLock: furLockGeo(0.32, 0.14, 0.095, 0.24),
  alphaManeLock: furLockGeo(0.44, 0.18, 0.125, 0.30),
  cheekRuff: furLockGeo(0.21, 0.10, 0.068, 0.18),
  hackle: furLockGeo(0.26, 0.11, 0.09, 0.36),
  upperFront: limbGeo(0.42, 0.102, 0.078, 0.058, 0.14),
  lowerFront: limbGeo(0.40, 0.056, 0.046, 0.040, 0.06),
  upperBack: limbGeo(0.44, 0.128, 0.092, 0.062, 0.22),
  lowerBack: limbGeo(0.42, 0.058, 0.046, 0.040, 0.08),
  paw: loftMesh([
    { z: -0.05, y: 0.032, rx: 0.048, ryTop: 0.032, ryBot: 0.028 },
    { z:  0.03, y: 0.030, rx: 0.062, ryTop: 0.034, ryBot: 0.028, square: 0.25 },
    { z:  0.11, y: 0.024, rx: 0.052, ryTop: 0.024, ryBot: 0.022 }
  ], 10),
  claw: taperTube([[0, 0, 0], [0, -0.006, 0.026], [0, -0.020, 0.042]], 0.009, 0.002, 5, 5),
  tail: taperTube(
    [[0, 0, 0], [0, -0.08, -0.18], [0, -0.22, -0.40], [0, -0.26, -0.60], [0, -0.19, -0.76]],
    0.06, 0.015, 9, 14,
    t => 0.048 + Math.sin(Math.pow(t, 0.72) * Math.PI) * 0.085
  )
};

const bearGeo = {
  torso: loftMesh([
    { z: -0.84, y: 0.99, rx: 0.34, ryTop: 0.27, ryBot: 0.25, square: 0.22, shadeTop: 0.80, shadeSide: 0.96, shadeBot: 0.76 },
    { z: -0.54, y: 1.03, rx: 0.44, ryTop: 0.33, ryBot: 0.39, square: 0.25, shadeTop: 0.80, shadeSide: 1.00, shadeBot: 0.74 },
    { z: -0.16, y: 1.04, rx: 0.47, ryTop: 0.36, ryBot: 0.45, square: 0.26, shadeTop: 0.82, shadeSide: 1.00, shadeBot: 0.72 },
    { z:  0.26, y: 1.13, rx: 0.48, ryTop: 0.44, ryBot: 0.41, topPinch: 0.22, square: 0.28, shadeTop: 0.76, shadeSide: 0.98, shadeBot: 0.76 },
    { z:  0.64, y: 1.09, rx: 0.39, ryTop: 0.30, ryBot: 0.34, square: 0.22, shadeTop: 0.78, shadeSide: 0.98, shadeBot: 0.80 },
    { z:  0.88, y: 1.11, rx: 0.28, ryTop: 0.24, ryBot: 0.22, shadeTop: 0.82, shadeSide: 0.96, shadeBot: 0.84 }
  ], 16),
  skull: loftMesh([
    { z: -0.14, y:  0.04, rx: 0.245, ryTop: 0.23, ryBot: 0.19, square: 0.18, shadeTop: 0.82, shadeSide: 0.98, shadeBot: 0.86 },
    { z:  0.04, y:  0.055, rx: 0.29, ryTop: 0.245, ryBot: 0.195, square: 0.24, shadeTop: 0.80, shadeSide: 1.00, shadeBot: 0.88 },
    { z:  0.19, y:  0.015, rx: 0.20, ryTop: 0.16, ryBot: 0.115, shadeTop: 0.84, shadeSide: 0.98, shadeBot: 0.92 },
    { z:  0.34, y: -0.01, rx: 0.14, ryTop: 0.11, ryBot: 0.075, square: 0.15, shadeTop: 0.88, shadeSide: 1.00, shadeBot: 0.92 },
    { z:  0.45, y: -0.015, rx: 0.105, ryTop: 0.082, ryBot: 0.055, shadeTop: 0.86, shadeSide: 0.96, shadeBot: 0.88 }
  ], 14),
  jaw: loftMesh([
    { z: 0.00, y: 0.00, rx: 0.145, ryTop: 0.048, ryBot: 0.072 },
    { z: 0.16, y: -0.01, rx: 0.11, ryTop: 0.040, ryBot: 0.058 },
    { z: 0.30, y: -0.005, rx: 0.082, ryTop: 0.032, ryBot: 0.044 }
  ], 10),
  ear: earGeo(0.165, 0.165, 0.075, true),
  innerEar: earGeo(0.105, 0.10, 0.028, true),
  fang: taperTube([[0, 0, 0], [0, -0.038, 0.005], [0, -0.072, 0.002]], 0.020, 0.004, 6, 6),
  shagLock: furLockGeo(0.36, 0.21, 0.13, 0.22),
  upperFront: limbGeo(0.50, 0.205, 0.175, 0.145, 0.14),
  lowerFront: limbGeo(0.46, 0.152, 0.135, 0.122, 0.10),
  upperBack: limbGeo(0.50, 0.225, 0.185, 0.145, 0.18),
  lowerBack: limbGeo(0.46, 0.148, 0.132, 0.118, 0.08),
  paw: loftMesh([
    { z: -0.10, y: 0.056, rx: 0.118, ryTop: 0.056, ryBot: 0.052, square: 0.25 },
    { z:  0.04, y: 0.054, rx: 0.142, ryTop: 0.060, ryBot: 0.052, square: 0.32 },
    { z:  0.17, y: 0.044, rx: 0.132, ryTop: 0.046, ryBot: 0.042, square: 0.25 }
  ], 12),
  claw: taperTube([[0, 0, 0], [0, 0.005, 0.055], [0, -0.036, 0.105]], 0.017, 0.003, 6, 7),
  tail: furLockGeo(0.24, 0.17, 0.14, -0.22)
};

const boarGeo = {
  torso: loftMesh([
    { z: -0.66, y: 0.62, rx: 0.19, ryTop: 0.16, ryBot: 0.14, shadeTop: 0.78, shadeSide: 0.94, shadeBot: 0.78 },
    { z: -0.38, y: 0.67, rx: 0.26, ryTop: 0.22, ryBot: 0.22, topPinch: 0.15, shadeTop: 0.78, shadeSide: 0.98, shadeBot: 0.80 },
    { z: -0.02, y: 0.71, rx: 0.31, ryTop: 0.27, ryBot: 0.29, topPinch: 0.25, shadeTop: 0.76, shadeSide: 1.00, shadeBot: 0.76 },
    { z:  0.34, y: 0.76, rx: 0.34, ryTop: 0.32, ryBot: 0.31, topPinch: 0.38, square: 0.22, shadeTop: 0.72, shadeSide: 0.98, shadeBot: 0.78 },
    { z:  0.58, y: 0.71, rx: 0.26, ryTop: 0.25, ryBot: 0.24, topPinch: 0.32, shadeTop: 0.76, shadeSide: 0.96, shadeBot: 0.82 }
  ], 14),
  skull: loftMesh([
    { z: -0.08, y:  0.04, rx: 0.23, ryTop: 0.22, ryBot: 0.19, topPinch: 0.30, shadeTop: 0.76, shadeSide: 0.96, shadeBot: 0.84 },
    { z:  0.10, y:  0.02, rx: 0.205, ryTop: 0.18, ryBot: 0.155, topPinch: 0.26, shadeTop: 0.78, shadeSide: 0.98, shadeBot: 0.86 },
    { z:  0.28, y: -0.03, rx: 0.135, ryTop: 0.115, ryBot: 0.088, topPinch: 0.16, shadeTop: 0.84, shadeSide: 1.00, shadeBot: 0.88 },
    { z:  0.44, y: -0.065, rx: 0.095, ryTop: 0.084, ryBot: 0.062, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.90 },
    { z:  0.54, y: -0.078, rx: 0.088, ryTop: 0.078, ryBot: 0.060, shadeTop: 0.88, shadeSide: 0.98, shadeBot: 0.90 }
  ], 14),
  snoutDisc: new THREE.CylinderGeometry(0.086, 0.092, 0.045, 14).rotateX(Math.PI / 2),
  jaw: loftMesh([
    { z: 0.02, y: 0.00, rx: 0.135, ryTop: 0.040, ryBot: 0.062 },
    { z: 0.20, y: -0.022, rx: 0.096, ryTop: 0.032, ryBot: 0.048 },
    { z: 0.38, y: -0.036, rx: 0.064, ryTop: 0.024, ryBot: 0.034 }
  ], 10),
  ear: earGeo(0.22, 0.16, 0.06, false),
  innerEar: earGeo(0.15, 0.095, 0.024, false),
  // Dramatic sweeping lower ivory tusks (defenders) and upper curled whetters
  lowerTuskL: taperTube([[0, 0, 0], [0.065, 0.02, 0.045], [0.135, 0.105, 0.072], [0.155, 0.235, 0.055]], 0.032, 0.004, 8, 12),
  lowerTuskR: taperTube([[0, 0, 0], [-0.065, 0.02, 0.045], [-0.135, 0.105, 0.072], [-0.155, 0.235, 0.055]], 0.032, 0.004, 8, 12),
  upperTuskL: taperTube([[0, 0, 0], [0.052, -0.01, 0.025], [0.095, 0.048, 0.028], [0.082, 0.105, 0.010]], 0.024, 0.005, 7, 10),
  upperTuskR: taperTube([[0, 0, 0], [-0.052, -0.01, 0.025], [-0.095, 0.048, 0.028], [-0.082, 0.105, 0.010]], 0.024, 0.005, 7, 10),
  crestLock: furLockGeo(0.26, 0.105, 0.11, 0.44),
  cheekBristle: furLockGeo(0.20, 0.085, 0.06, 0.16),
  upperFront: limbGeo(0.32, 0.118, 0.092, 0.068, 0.14),
  lowerFront: limbGeo(0.30, 0.064, 0.052, 0.045, 0.06),
  upperBack: limbGeo(0.33, 0.128, 0.094, 0.066, 0.18),
  lowerBack: limbGeo(0.30, 0.062, 0.049, 0.043, 0.08),
  hoofToe: loftMesh([
    { z: -0.03, y: 0.036, rx: 0.022, ryTop: 0.038, ryBot: 0.034 },
    { z:  0.03, y: 0.030, rx: 0.024, ryTop: 0.032, ryBot: 0.028 },
    { z:  0.075, y: 0.020, rx: 0.015, ryTop: 0.020, ryBot: 0.018 }
  ], 8),
  tail: taperTube(
    [[0, 0, 0], [0, -0.05, -0.10], [0, -0.15, -0.17], [0, -0.25, -0.19]],
    0.022, 0.012, 6, 9
  ),
  tailTuft: furLockGeo(0.13, 0.055, 0.055, -0.35)
};

const scorpionGeo = {
  // Low, broad, hexagonal jewel-cut cephalothorax + segmented mesosoma
  carapace: crystalLoft([
    { z: -0.64, y: 0.44, rx: 0.14, ryTop: 0.11, ryBot: 0.08, topPinch: 0.25, shadeTop: 0.92, shadeSide: 1.05, shadeBot: 0.78 },
    { z: -0.38, y: 0.45, rx: 0.28, ryTop: 0.17, ryBot: 0.11, topPinch: 0.22, square: 0.18, shadeTop: 1.00, shadeSide: 1.10, shadeBot: 0.80 },
    { z: -0.06, y: 0.46, rx: 0.36, ryTop: 0.20, ryBot: 0.13, topPinch: 0.20, square: 0.24, shadeTop: 1.05, shadeSide: 1.12, shadeBot: 0.82 },
    { z:  0.26, y: 0.45, rx: 0.34, ryTop: 0.18, ryBot: 0.12, topPinch: 0.28, square: 0.22, shadeTop: 1.02, shadeSide: 1.10, shadeBot: 0.82 },
    { z:  0.50, y: 0.42, rx: 0.20, ryTop: 0.11, ryBot: 0.08, shadeTop: 1.08, shadeSide: 1.12, shadeBot: 0.86 }
  ], 6),
  // Overlapping translucent dorsal crystal armor plates
  plate: crystalLoft([
    { z: -0.10, y: 0.00, rx: 0.26, ryTop: 0.085, ryBot: 0.02, topPinch: 0.40 },
    { z:  0.00, y: 0.02, rx: 0.32, ryTop: 0.095, ryBot: 0.02, topPinch: 0.35 },
    { z:  0.10, y: 0.00, rx: 0.24, ryTop: 0.060, ryBot: 0.015, topPinch: 0.30 }
  ], 6),
  dorsalSpike: crystalShardGeo(0.26, 0.052, 5),
  sideSpike: crystalShardGeo(0.18, 0.036, 5),
  // Articulated tail segment (extends from z=0 to z=-0.25)
  tailSeg: crystalLoft([
    { z:  0.02, y: 0, rx: 0.082, ryTop: 0.072, ryBot: 0.065, topPinch: 0.30 },
    { z: -0.12, y: 0, rx: 0.096, ryTop: 0.084, ryBot: 0.072, topPinch: 0.35 },
    { z: -0.25, y: 0, rx: 0.072, ryTop: 0.064, ryBot: 0.056, topPinch: 0.25 }
  ], 6),
  tailSpike: crystalShardGeo(0.15, 0.028, 5),
  // Venom bulb (telson) & curved crystal stinger (aculeus)
  telson: crystalLoft([
    { z:  0.02, y: 0, rx: 0.068, ryTop: 0.064, ryBot: 0.060 },
    { z: -0.10, y: 0.01, rx: 0.118, ryTop: 0.108, ryBot: 0.092, topPinch: 0.20 },
    { z: -0.22, y: -0.01, rx: 0.052, ryTop: 0.048, ryBot: 0.042 }
  ], 6),
  stinger: crystalBladeGeo([[0, 0, 0], [0, 0.04, -0.12], [0, 0.15, -0.22], [0, 0.29, -0.24]], 0.042, 0.004, 5, 10),
  // Pedipalp (pincer arm + huge faceted crusher palm + outer/inner serrated crystal blades)
  armSeg: crystalLoft([
    { z: 0.00, y: 0, rx: 0.070, ryTop: 0.065, ryBot: 0.060 },
    { z: 0.16, y: 0, rx: 0.090, ryTop: 0.082, ryBot: 0.072 },
    { z: 0.32, y: 0, rx: 0.072, ryTop: 0.066, ryBot: 0.058 }
  ], 6),
  pincerPalm: crystalLoft([
    { z: 0.00, y: 0, rx: 0.095, ryTop: 0.085, ryBot: 0.075 },
    { z: 0.15, y: 0, rx: 0.165, ryTop: 0.125, ryBot: 0.105, square: 0.25 },
    { z: 0.30, y: 0, rx: 0.125, ryTop: 0.095, ryBot: 0.080 }
  ], 6),
  clawOuterL: crystalBladeGeo([[0, 0, 0], [0.06, 0.01, 0.14], [0.04, 0.01, 0.29], [-0.06, 0.0, 0.40]], 0.058, 0.006, 5, 9),
  clawOuterR: crystalBladeGeo([[0, 0, 0], [-0.06, 0.01, 0.14], [-0.04, 0.01, 0.29], [0.06, 0.0, 0.40]], 0.058, 0.006, 5, 9),
  clawInnerL: crystalBladeGeo([[0, 0, 0], [-0.03, 0.0, 0.12], [-0.01, 0.0, 0.25], [0.07, 0.0, 0.34]], 0.044, 0.005, 5, 8),
  clawInnerR: crystalBladeGeo([[0, 0, 0], [0.03, 0.0, 0.12], [0.01, 0.0, 0.25], [-0.07, 0.0, 0.34]], 0.044, 0.005, 5, 8),
  // Faceted arachnid crystal leg segments
  legFemur: crystalShardGeo(0.38, 0.046, 5),
  legKnee: withWhiteColors(new THREE.OctahedronGeometry(0.045, 0)),
  legTibia: crystalShardGeo(0.72, 0.040, 5)
};

// ------------------------------------------------------------ Helper builders

interface LegRig {
  joint: THREE.Group;
  lower?: THREE.Group;
  side: number;
  front: boolean;
  phase: number;
  baseUpperX: number;
  baseLowerX: number;
}

function addMesh(
  parent: THREE.Object3D,
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  x = 0, y = 0, z = 0,
  rx = 0, ry = 0, rz = 0
) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.set(x, y, z);
  mesh.scale.set(sx, sy, sz);
  parent.add(mesh);
  return mesh;
}

function addClovenHoof(parent: THREE.Object3D, mat: THREE.Material, y: number) {
  const hoof = new THREE.Group();
  hoof.position.set(0, y, 0.012);
  addMesh(hoof, boarGeo.hoofToe, mat, -0.022, 0, 0, 0, -0.08, 0);
  addMesh(hoof, boarGeo.hoofToe, mat,  0.022, 0, 0, 0,  0.08, 0);
  // Dewclaws at the back of the fetlock
  part(hoof, CONE, mat, -0.024, 0.055, -0.038, 0.014, 0.040, 0.014).rotation.x = 2.55;
  part(hoof, CONE, mat,  0.024, 0.055, -0.038, 0.014, 0.040, 0.014).rotation.x = 2.55;
  parent.add(hoof);
}

/** Animated directly in the game so quadrupeds and spiders keep sculpted silhouettes in 3D and ASCII. */
export function createBeast(look: BeastLook): EnemyModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const head = new THREE.Group();
  const tail = new THREE.Group();
  let jaw: THREE.Group | null = null;
  root.add(body);
  body.add(head, tail);

  const bear = look.species === 'bear';
  const boar = look.species === 'boar';
  const spider = look.species === 'spider';
  const scorpion = look.species === 'scorpion';
  const alpha = !!look.alpha;

  const fur = (spider || scorpion) ? null : getFurTextures(bear ? 'bear' : boar ? 'boar' : 'wolf');
  const bumpScale = bear ? 0.028 : boar ? 0.032 : 0.020;

  const coat = M(look.coat, {
    roughness: bear ? 0.94 : boar ? 0.92 : 0.88,
    vertexColors: !(spider || scorpion),
    ...(fur ? { map: fur.map, bumpMap: fur.bump, bumpScale } : {})
  });
  const trim = M(look.trim, {
    roughness: 0.86,
    vertexColors: !(spider || scorpion),
    ...(fur ? { map: fur.map, bumpMap: fur.bump, bumpScale: bumpScale * 0.85 } : {})
  });
  // Rich dark accent derived from coat for dorsal crest, stockings, muzzle mask, and inner ears
  const darkTint = new THREE.Color(look.coat).multiplyScalar(0.38);
  const dark = M(darkTint, { roughness: 0.86, ...(fur ? { map: fur.map } : {}) });
  const leather = M(0x1b171b, { roughness: 0.56, metalness: 0.08 });
  const mouth = M(0x2a1014, { roughness: 0.72 });
  const ivory = M(0xead9b5, { roughness: 0.34, metalness: 0.06 });
  ivory.userData.noGlyphs = true;
  const eyes = new THREE.MeshBasicMaterial({ color: look.eye });

  // Crystal materials (only used by crystal scorpions; disposed alongside other mats)
  const extraMats: THREE.Material[] = [];
  const flashMats: THREE.MeshStandardMaterial[] = [coat, trim, dark];
  const tailSegs: THREE.Group[] = [];
  const pincers: { arm: THREE.Group; finger: THREE.Group; side: number }[] = [];
  let crystalGlowMat: THREE.MeshPhysicalMaterial | null = null;
  let crystalBaseEmissive: THREE.Color | null = null;

  const ring = new THREE.Mesh(RING, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
  ring.position.y = 0.048;
  root.add(ring);

  const legs: LegRig[] = [];
  const addLeg = (x: number, y: number, z: number, side: number, front: boolean, phase: number, baseUpperX = 0, baseLowerX = 0) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    g.rotation.x = baseUpperX;
    body.add(g);
    const rig: LegRig = { joint: g, side, front, phase, baseUpperX, baseLowerX };
    legs.push(rig);
    return rig;
  };

  if (scorpion) {
    // ======================== CRYSTAL SCORPION (Escorpión de Cristal) ========================
    const crystalBase = new THREE.Color(look.coat);
    const crystalCore = new THREE.MeshPhysicalMaterial({
      color: crystalBase.clone().multiplyScalar(0.72),
      emissive: crystalBase.clone().multiplyScalar(0.32),
      roughness: 0.14,
      metalness: 0.24,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
      flatShading: true,
      vertexColors: true
    });
    const crystalFacet = new THREE.MeshPhysicalMaterial({
      color: look.trim,
      emissive: crystalBase.clone().multiplyScalar(0.45),
      roughness: 0.06,
      metalness: 0.14,
      clearcoat: 1.0,
      clearcoatRoughness: 0.03,
      transparent: true,
      opacity: 0.78,
      flatShading: true,
      vertexColors: true
    });
    crystalFacet.userData.noGlyphs = true;

    crystalGlowMat = new THREE.MeshPhysicalMaterial({
      color: 0xeaffff,
      emissive: crystalBase.clone(),
      emissiveIntensity: 0.92,
      roughness: 0.04,
      metalness: 0.10,
      clearcoat: 1.0,
      flatShading: true,
      vertexColors: true
    });
    crystalGlowMat.userData.noGlyphs = true;
    crystalBaseEmissive = crystalBase.clone();
    extraMats.push(crystalCore, crystalFacet, crystalGlowMat);
    flashMats.push(crystalCore, crystalFacet);

    // Armored faceted crystal body
    addMesh(body, scorpionGeo.carapace, crystalCore);

    // 4 overlapping translucent crystal dorsal armor plates + erupting crystal spine shards
    for (let i = 0; i < 4; i++) {
      const t = i / 3;
      const z = 0.28 - t * 0.72;
      const s = 1.0 - Math.abs(t - 0.35) * 0.32;
      const plate = addMesh(body, scorpionGeo.plate, crystalFacet, 0, 0.56 - t * 0.03, z, -0.08, 0, 0);
      plate.scale.set(s, s, 1.0);
      const spike = addMesh(body, scorpionGeo.dorsalSpike, i % 2 === 0 ? crystalFacet : crystalGlowMat, 0, 0.61 - t * 0.03, z - 0.02, -0.82 - t * 0.18, 0, 0);
      spike.scale.setScalar(0.95 - t * 0.18);
    }

    // Glowing arachnid eye clusters on the front carapace
    for (const side of [-1, 1]) {
      part(body, SPHERE, eyes, side * 0.055, 0.555, 0.39, 0.026, 0.024, 0.024);
      part(body, SPHERE, eyes, side * 0.145, 0.505, 0.44, 0.020, 0.018, 0.018);
      part(body, SPHERE, eyes, side * 0.185, 0.485, 0.40, 0.016, 0.015, 0.015);
      // Side crystal ridges along the carapace flanks
      addMesh(body, scorpionGeo.sideSpike, crystalFacet, side * 0.31, 0.50,  0.10, -0.45, side * 0.95, 0);
      addMesh(body, scorpionGeo.sideSpike, crystalFacet, side * 0.30, 0.49, -0.18, -0.50, side * 1.05, 0);

      // Massive articulated crystal pedipalps (pincers)
      const arm = new THREE.Group();
      arm.position.set(side * 0.22, 0.44, 0.42);
      arm.rotation.y = side * 0.36;
      body.add(arm);
      addMesh(arm, scorpionGeo.armSeg, crystalCore, 0, 0, 0, 0, side * 0.22, 0);

      const forearm = new THREE.Group();
      forearm.position.set(side * 0.07, 0.01, 0.30);
      forearm.rotation.y = -side * 0.56;
      arm.add(forearm);
      addMesh(forearm, scorpionGeo.armSeg, crystalCore, 0, 0, 0);
      addMesh(forearm, scorpionGeo.pincerPalm, crystalFacet, 0, 0.01, 0.26);
      // Outer fixed crystal crusher blade
      addMesh(forearm, side > 0 ? scorpionGeo.clawOuterL : scorpionGeo.clawOuterR, crystalFacet, side * 0.07, 0.01, 0.52);
      // Articulated inner movable crystal blade
      const finger = new THREE.Group();
      finger.position.set(-side * 0.05, 0.01, 0.52);
      forearm.add(finger);
      addMesh(finger, side > 0 ? scorpionGeo.clawInnerL : scorpionGeo.clawInnerR, crystalGlowMat);
      pincers.push({ arm, finger, side });

      // 4 pairs of splayed faceted crystal arachnid legs landing cleanly on y = 0
      for (let i = 0; i < 4; i++) {
        const zLeg = 0.28 - i * 0.20;
        const rig = addLeg(side * 0.24, 0.44, zLeg, side, i < 2, (i + (side > 0 ? 1 : 0)) * Math.PI);
        // Splay legs outward from front (+Z) to rear (-Z) like a real arachnid
        rig.joint.rotation.y = -side * (1.5 - i) * 0.32;
        // Upper crystal femur angling up & out to knee at (side*0.31, +0.20, 0)
        const femur = addMesh(rig.joint, scorpionGeo.legFemur, crystalCore, 0, 0, 0);
        femur.rotation.set(0, side * Math.PI / 2, 0);
        femur.rotateX(-0.56);
        // Sharp faceted crystal knee joint
        addMesh(rig.joint, scorpionGeo.legKnee, crystalFacet, side * 0.31, 0.20, 0, 0.3, 0.4, 0.2);
        // Long tapered translucent crystal tibia spear angling down & out to ground (y = 0)
        const tibia = addMesh(rig.joint, scorpionGeo.legTibia, crystalFacet, side * 0.31, 0.20, 0);
        tibia.rotation.set(0, side * Math.PI / 2, 0);
        tibia.rotateX(1.06);
      }
    }

    // 5-segment articulated overhead crystal tail + glowing venom bulb & curved stinger
    tail.position.set(0, 0.48, -0.60);
    let parentSeg: THREE.Object3D = tail;
    for (let i = 0; i < 5; i++) {
      const seg = new THREE.Group();
      if (i > 0) seg.position.set(0, 0, -0.23);
      seg.rotation.x = i === 0 ? 0.68 : 0.46;
      parentSeg.add(seg);
      const s = 1.0 - i * 0.07;
      const m = addMesh(seg, scorpionGeo.tailSeg, i % 2 === 0 ? crystalCore : crystalFacet);
      m.scale.setScalar(s);
      const sp = addMesh(seg, scorpionGeo.tailSpike, crystalGlowMat, 0, 0.065 * s, -0.10, 0.85, 0, 0);
      sp.scale.setScalar(s);
      tailSegs.push(seg);
      parentSeg = seg;
    }
    const telsonGroup = new THREE.Group();
    telsonGroup.position.set(0, 0, -0.22);
    telsonGroup.rotation.x = 0.25;
    parentSeg.add(telsonGroup);
    addMesh(telsonGroup, scorpionGeo.telson, crystalFacet);
    addMesh(telsonGroup, scorpionGeo.stinger, crystalGlowMat, 0, 0, -0.19);
    tailSegs.push(telsonGroup);
  } else if (spider) {
    part(body, SPHERE, coat, 0, 0.61, -0.44, 0.43, 0.37, 0.66);
    part(body, SPHERE, trim, 0, 0.84, -0.46, 0.19, 0.105, 0.36);
    head.position.set(0, 0.54, 0.24);
    part(head, SPHERE, coat, 0, 0, 0, 0.31, 0.22, 0.38);
    for (const side of [-1, 1]) {
      part(head, SPHERE, eyes, side * 0.10, 0.08, 0.318, 0.041, 0.037, 0.031);
      part(head, SPHERE, eyes, side * 0.198, 0.065, 0.268, 0.030, 0.027, 0.024);
      part(head, CONE, ivory, side * 0.115, -0.11, 0.34, 0.05, 0.22, 0.05).rotation.x = Math.PI * 0.75;
      for (let i = 0; i < 4; i++) {
        const rig = addLeg(side * 0.24, 0.53, 0.31 - i * 0.19, side, i < 2, (i + (side > 0 ? 1 : 0)) * Math.PI);
        rig.joint.rotation.y = side * (i - 1.5) * 0.43;
        part(rig.joint, LIMB, trim, side * 0.26, 0.15, 0, 0.066, 0.62, 0.068).rotation.z = -side * 1.05;
        part(rig.joint, SPHERE, coat, side * 0.53, 0.29, 0, 0.088, 0.09, 0.09);
        part(rig.joint, LIMB, leather, side * 0.70, -0.075, 0, 0.051, 0.84, 0.053).rotation.z = side * 0.43;
      }
    }
  } else if (bear) {
    // ======================== BEAR (Higuma / Japanese Brown Bear) ========================
    addMesh(body, bearGeo.torso, coat);

    // Shaggy shoulder hump & neck ruff tufts
    for (let i = 0; i < 5; i++) {
      const t = i / 4;
      addMesh(body, bearGeo.shagLock, i < 2 ? dark : coat, 0, 1.50 - t * 0.16, 0.44 - t * 0.28, -0.12 - t * 0.10, 0, 0);
    }
    for (const side of [-1, 1]) {
      addMesh(body, bearGeo.shagLock, coat, side * 0.32, 1.32, 0.56, -0.12, side * 0.38, -side * 0.45);
      addMesh(body, bearGeo.shagLock, trim, side * 0.26, 0.94, 0.66,  0.18, side * 0.28, -side * 0.32);
      addMesh(body, bearGeo.shagLock, coat, side * 0.38, 1.24, 0.18, -0.05, side * 0.32, -side * 0.55);
    }

    // Broad bear head + articulated roaring jaw
    head.position.set(0, 1.16, 0.92);
    addMesh(head, bearGeo.skull, coat);
    // Lighter blunt muzzle bridge & jowl accents
    part(head, SPHERE, trim, 0, -0.015, 0.31, 0.132, 0.095, 0.155);
    // Broad leathery nose
    part(head, SPHERE, leather, 0, 0.012, 0.455, 0.072, 0.052, 0.044);

    jaw = new THREE.Group();
    jaw.position.set(0, -0.075, 0.08);
    head.add(jaw);
    addMesh(jaw, bearGeo.jaw, trim);
    part(jaw, SPHERE, mouth, 0, 0.018, 0.17, 0.088, 0.032, 0.13);

    for (const side of [-1, 1]) {
      // Heavy brow ridge & recessed dark eye socket
      part(head, SPHERE, dark, side * 0.145, 0.125, 0.22, 0.068, 0.036, 0.072).rotation.set(0.18, side * 0.25, -side * 0.22);
      part(head, SPHERE, leather, side * 0.148, 0.085, 0.235, 0.042, 0.034, 0.032);
      part(head, SPHERE, eyes, side * 0.154, 0.084, 0.256, 0.026, 0.020, 0.018);

      // Thick rounded cupped bear ears
      addMesh(head, bearGeo.ear, dark, side * 0.225, 0.20, -0.02, -0.08, side * 0.22, -side * 0.32);
      addMesh(head, bearGeo.innerEar, leather, side * 0.222, 0.215, 0.015, -0.08, side * 0.22, -side * 0.32);

      // Upper & lower curved fangs
      addMesh(head, bearGeo.fang, ivory, side * 0.074, -0.055, 0.34, 0.12, 0, side * 0.08);
      addMesh(jaw, bearGeo.fang, ivory, side * 0.064, 0.012, 0.23, Math.PI - 0.15, 0, -side * 0.08);

      // Massive front & rear articulated legs with 4 long curved bone claws
      for (const isFront of [true, false]) {
        const yHip = isFront ? 0.96 : 0.94;
        const zHip = isFront ? 0.44 : -0.58;
        const baseU = isFront ? 0.08 : -0.14;
        const baseL = isFront ? -0.10 : 0.18;
        const rig = addLeg(side * (isFront ? 0.35 : 0.34), yHip, zHip, side, isFront, isFront === (side > 0) ? 0 : Math.PI, baseU, baseL);

        addMesh(rig.joint, isFront ? bearGeo.upperFront : bearGeo.upperBack, coat, 0, -0.24, 0);
        if (isFront) addMesh(rig.joint, bearGeo.shagLock, coat, side * 0.04, -0.22, -0.06, -0.35, 0, -side * 0.2);

        const lower = new THREE.Group();
        lower.position.set(0, -0.45, isFront ? 0.02 : -0.04);
        lower.rotation.x = baseL;
        rig.joint.add(lower);
        rig.lower = lower;

        addMesh(lower, isFront ? bearGeo.lowerFront : bearGeo.lowerBack, dark, 0, -0.22, 0);
        addMesh(lower, bearGeo.paw, dark, 0, -0.45, 0.05);
        for (let c = 0; c < 4; c++) {
          const cx = (c - 1.5) * 0.058;
          addMesh(lower, bearGeo.claw, ivory, cx, -0.445, 0.195, 0.12, cx * 0.5, 0);
        }
      }
    }

    tail.position.set(0, 1.02, -0.82);
    addMesh(tail, bearGeo.tail, dark, 0, 0, 0, 0.35, 0, 0);
  } else if (boar) {
    // ======================== BOAR (Inoshishi / Japanese Wild Boar) ========================
    addMesh(body, boarGeo.torso, coat);

    // Dramatic swept-back ridge of coarse dorsal bristles from crown to rump
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const z = 0.54 - t * 1.08;
      const y = 0.94 + Math.sin(t * Math.PI * 0.85) * 0.12 - t * 0.18;
      const s = 1.15 - Math.abs(t - 0.28) * 0.55;
      const lock = addMesh(body, boarGeo.crestLock, dark, 0, y, z, -0.22 - t * 0.15, 0, 0);
      lock.scale.set(s * 0.95, s * 1.12, s * 1.05);
    }

    // Heavy wedge-shaped boar head held low as a battering ram
    head.position.set(0, 0.70, 0.56);
    addMesh(head, boarGeo.skull, coat);
    // Flat cartilaginous snout disc + two recessed dark nostrils
    addMesh(head, boarGeo.snoutDisc, leather, 0, -0.078, 0.555, 0.14, 0, 0);
    part(head, SPHERE, mouth, -0.032, -0.072, 0.576, 0.019, 0.023, 0.012);
    part(head, SPHERE, mouth,  0.032, -0.072, 0.576, 0.019, 0.023, 0.012);

    // Crown bristles continuing onto the forehead
    addMesh(head, boarGeo.crestLock, dark, 0, 0.20, 0.02, -0.35, 0, 0);

    jaw = new THREE.Group();
    jaw.position.set(0, -0.072, 0.06);
    head.add(jaw);
    addMesh(jaw, boarGeo.jaw, trim);
    part(jaw, SPHERE, mouth, 0, 0.005, 0.18, 0.062, 0.024, 0.14);

    for (const side of [-1, 1]) {
      // Heavy brow ridge + recessed fierce eyes
      part(head, SPHERE, dark, side * 0.148, 0.088, 0.17, 0.056, 0.030, 0.072).rotation.set(0.24, side * 0.28, -side * 0.30);
      part(head, SPHERE, leather, side * 0.152, 0.048, 0.185, 0.036, 0.028, 0.028);
      part(head, SPHERE, eyes, side * 0.162, 0.048, 0.204, 0.024, 0.018, 0.016);

      // Broad bristled ears
      addMesh(head, boarGeo.ear, dark, side * 0.175, 0.16, -0.04, -0.18, side * 0.38, -side * 0.42);
      addMesh(head, boarGeo.innerEar, trim, side * 0.172, 0.17, -0.01, -0.18, side * 0.38, -side * 0.42);

      // Coarse cheek bristles framing the tusks
      addMesh(head, boarGeo.cheekBristle, trim, side * 0.18, -0.05, 0.10, 0.12, side * 0.35, -side * 0.38);
      addMesh(head, boarGeo.cheekBristle, dark, side * 0.19, -0.09, 0.04, 0.18, side * 0.42, -side * 0.48);

      // Massive curved lower tusks (defenders) + upper whetters
      addMesh(jaw, side > 0 ? boarGeo.lowerTuskL : boarGeo.lowerTuskR, ivory, side * 0.078, -0.015, 0.25);
      addMesh(head, side > 0 ? boarGeo.upperTuskL : boarGeo.upperTuskR, ivory, side * 0.092, -0.068, 0.27);

      // Sturdy articulated boar legs ending in split cloven hooves
      for (const isFront of [true, false]) {
        const yHip = isFront ? 0.62 : 0.60;
        const zHip = isFront ? 0.32 : -0.42;
        const baseU = isFront ? 0.10 : -0.22;
        const baseL = isFront ? -0.14 : 0.28;
        const rig = addLeg(side * (isFront ? 0.23 : 0.21), yHip, zHip, side, isFront, isFront === (side > 0) ? 0 : Math.PI, baseU, baseL);

        addMesh(rig.joint, isFront ? boarGeo.upperFront : boarGeo.upperBack, coat, 0, -0.16, 0);

        const lower = new THREE.Group();
        lower.position.set(0, -0.30, isFront ? 0.02 : -0.05);
        lower.rotation.x = baseL;
        rig.joint.add(lower);
        rig.lower = lower;

        addMesh(lower, isFront ? boarGeo.lowerFront : boarGeo.lowerBack, trim, 0, -0.14, 0);
        addClovenHoof(lower, leather, -0.295);
      }
    }

    tail.position.set(0, 0.68, -0.65);
    addMesh(tail, boarGeo.tail, dark);
    addMesh(tail, boarGeo.tailTuft, dark, 0, -0.24, -0.19, 0.85, 0, 0);
  } else {
    // ======================== WOLF (Lobo Gris & Lobo Alfa) ========================
    addMesh(body, wolfGeo.torso, coat);
    addMesh(body, wolfGeo.neck, coat);

    // Layered shoulder mane / ruff & dorsal hackles (extra grand on Lobo Alfa)
    const maneGeo = alpha ? wolfGeo.alphaManeLock : wolfGeo.maneLock;
    const maneCount = alpha ? 11 : 8;
    for (let i = 0; i < maneCount; i++) {
      const a = (i / maneCount) * Math.PI * 2;
      const sx = Math.sin(a), cy = Math.cos(a);
      const isTop = cy > 0.25;
      const isChest = cy < -0.35;
      const mat = isTop ? (alpha ? trim : dark) : isChest ? trim : coat;
      const m = addMesh(
        body, maneGeo, mat,
        sx * (alpha ? 0.20 : 0.175),
        0.93 + cy * (alpha ? 0.16 : 0.14),
        0.52 - Math.abs(sx) * 0.06 + (isChest ? 0.06 : 0),
        cy * -0.32 - 0.12,
        sx * 0.42,
        -sx * 0.48
      );
      if (isChest) m.scale.set(1.05, 1.0, 1.12);
    }
    // Dorsal hackles along the withers
    for (let i = 0; i < (alpha ? 4 : 3); i++) {
      const h = addMesh(body, wolfGeo.hackle, alpha ? trim : dark, 0, 1.07 - i * 0.035, 0.42 - i * 0.16, -0.18 - i * 0.08, 0, 0);
      if (alpha) h.scale.setScalar(1.24);
    }

    // Predatory wolf head + articulated snarling jaw
    head.position.set(0, 1.06, 0.74);
    addMesh(head, wolfGeo.skull, coat);
    // Lighter muzzle underside & bridge accent
    part(head, SPHERE, trim, 0, -0.01, 0.26, 0.072, 0.044, 0.135);
    // Sharp black wolf nose pad
    part(head, SPHERE, leather, 0, 0.012, 0.412, 0.044, 0.032, 0.030);

    jaw = new THREE.Group();
    jaw.position.set(0, -0.042, 0.08);
    head.add(jaw);
    addMesh(jaw, wolfGeo.jaw, trim);
    part(jaw, SPHERE, mouth, 0, 0.014, 0.14, 0.048, 0.020, 0.11);

    for (const side of [-1, 1]) {
      // Sculpted fierce brow ridge + recessed eye socket + glowing almond eye
      part(head, SPHERE, dark, side * 0.098, 0.112, 0.15, 0.048, 0.022, 0.064).rotation.set(0.22, side * 0.26, -side * 0.28);
      part(head, SPHERE, leather, side * 0.104, 0.080, 0.165, 0.034, 0.024, 0.026);
      const eye = part(head, SPHERE, eyes, side * 0.110, 0.080, 0.180, 0.024, 0.015, 0.016);
      eye.rotation.set(0, side * 0.35, -side * 0.25);

      // Swept-back cheek ruffs
      addMesh(head, wolfGeo.cheekRuff, trim, side * 0.14, -0.01, 0.04, 0.08, side * 0.44, -side * 0.35);
      if (alpha) addMesh(head, wolfGeo.cheekRuff, coat, side * 0.155, 0.03, -0.01, -0.05, side * 0.48, -side * 0.25);

      // Tall pointed cupped wolf ears with dark inner hollows
      addMesh(head, wolfGeo.ear, coat, side * 0.118, 0.145, -0.02, -0.14, side * 0.18, -side * 0.24);
      addMesh(head, wolfGeo.innerEar, dark, side * 0.116, 0.158, 0.008, -0.14, side * 0.18, -side * 0.24);

      // Sharp upper & lower canines
      addMesh(head, wolfGeo.fang, ivory, side * 0.044, -0.025, 0.31, 0.12, 0, side * 0.06);
      addMesh(jaw, wolfGeo.fang, ivory, side * 0.038, 0.008, 0.21, Math.PI - 0.14, 0, -side * 0.06);

      // Articulated 2-segment digitigrade wolf legs with feathered elbows & clawed paws
      for (const isFront of [true, false]) {
        const yHip = isFront ? 0.80 : 0.79;
        const zHip = isFront ? 0.36 : -0.46;
        const baseU = isFront ? 0.14 : -0.26;
        const baseL = isFront ? -0.18 : 0.36;
        const rig = addLeg(side * 0.172, yHip, zHip, side, isFront, isFront === (side > 0) ? 0 : Math.PI, baseU, baseL);

        addMesh(rig.joint, isFront ? wolfGeo.upperFront : wolfGeo.upperBack, coat, 0, -0.20, 0);
        if (isFront) {
          const tuft = addMesh(rig.joint, wolfGeo.cheekRuff, trim, 0, -0.28, -0.05, -0.42, 0, 0);
          tuft.scale.set(0.7, 0.7, 0.8);
        }

        const lower = new THREE.Group();
        lower.position.set(0, -0.38, isFront ? 0.02 : -0.08);
        lower.rotation.x = baseL;
        rig.joint.add(lower);
        rig.lower = lower;

        addMesh(lower, isFront ? wolfGeo.lowerFront : wolfGeo.lowerBack, trim, 0, -0.19, 0);
        addMesh(lower, wolfGeo.paw, dark, 0, -0.395, 0.035);
        for (let c = 0; c < 3; c++) {
          addMesh(lower, wolfGeo.claw, leather, (c - 1) * 0.028, -0.39, 0.135);
        }
      }
    }

    // Sweeping bushy wolf tail
    tail.position.set(0, 0.84, -0.65);
    addMesh(tail, wolfGeo.tail, coat);
    const tip = part(tail, SPHERE, alpha ? trim : dark, 0, -0.20, -0.73, 0.055, 0.055, 0.10);
    tip.rotation.x = 0.45;
  }

  // Apply the same manga rim light, form shading, and ASCII surface glyphs as the samurai & oni
  mangaFinish(root);

  let stride = Math.random() * Math.PI * 2, time = 0, pose = 0;
  const allMats: THREE.Material[] = [coat, trim, dark, leather, mouth, ivory, eyes, ring.material, ...extraMats];

  return {
    root, ring,
    update(dt, { moving, speed, state }) {
      time += dt;
      stride += dt * Math.min(20, 4 + speed * (spider || scorpion ? 1.85 : bear ? 1.35 : 1.65));
      const wind = state === 'windup', strike = state === 'strike';
      pose = THREE.MathUtils.damp(pose, wind ? 1 : strike ? -1 : 0, 14, dt);

      const breathe = Math.sin(time * 3.1) * 0.014;
      const bounce = Math.abs(Math.sin(stride)) * moving * (bear ? 0.06 : scorpion ? 0.035 : 0.075);

      if (scorpion) {
        body.position.y = breathe * 0.6 + bounce - Math.max(0, pose) * 0.05;
        body.rotation.x = pose * -0.12;
        // Articulated 5-segment overhead tail coils high on windup and whips forward on strike
        const sway = Math.sin(time * 2.8) * 0.035;
        tailSegs.forEach((seg, i) => {
          const base = i === 0 ? 0.68 : i === 5 ? 0.25 : 0.46;
          seg.rotation.x = base - pose * (i === 0 ? 0.14 : 0.18) + sway;
        });
        tail.rotation.y = Math.sin(time * (2.2 + moving * 2.5)) * 0.14;
        // Pincers spread & open wide on windup, snap shut forward on strike
        for (const p of pincers) {
          p.arm.rotation.y = p.side * (0.36 + pose * 0.34);
          p.arm.rotation.x = -Math.max(0, pose) * 0.22;
          p.finger.rotation.y = p.side * (0.14 + Math.max(0, pose) * 0.38 - Math.max(0, -pose) * 0.16);
        }
        // Subtle pulsing crystalline glow in the stinger & core
        if (crystalGlowMat && crystalBaseEmissive) {
          const pulse = 0.85 + Math.sin(time * 4.2) * 0.18 + Math.max(0, pose) * 0.45;
          crystalGlowMat.emissiveIntensity = pulse;
        }
      } else if (bear) {
        // Bear rears up powerfully on windup, slams down on strike
        const rear = Math.max(0, pose);
        body.position.y = breathe + bounce + rear * 0.34;
        body.rotation.x = pose * -0.62;
        head.rotation.x = -pose * -0.26 + Math.sin(time * 2.1) * 0.03;
      } else if (boar) {
        // Boar lowers its tusks to the earth on windup, thrusts upward on charge/strike
        body.position.y = breathe + bounce - Math.max(0, pose) * 0.10;
        body.rotation.x = pose * 0.16;
        head.rotation.x = pose * 0.34;
      } else if (!spider) {
        // Wolf crouches predatory on windup, lunges flat on strike
        body.position.y = breathe + bounce - Math.max(0, pose) * 0.14;
        body.rotation.x = pose * 0.14;
        head.rotation.x = -pose * 0.24 + Math.sin(time * 2.4) * 0.035;
      } else {
        body.position.y = breathe + bounce - pose * 0.10;
        body.rotation.x = pose * 0.10;
        head.rotation.x = -pose * 0.22;
      }

      // Snarling / roaring articulated jaw
      if (jaw) {
        const snarl = Math.max(0, pose) * (bear ? 0.58 : boar ? 0.28 : 0.48)
          + Math.max(0, -pose) * (bear ? 0.24 : 0.18)
          + (0.5 + 0.5 * Math.sin(time * 3.1)) * 0.05;
        jaw.rotation.x = snarl;
      }

      if (!scorpion) {
        tail.rotation.y = Math.sin(time * (2.6 + moving * 3.2)) * (boar ? 0.36 : 0.28);
        if (!spider && !bear) tail.rotation.x = -moving * 0.18 + pose * 0.16;
      }

      for (const leg of legs) {
        const s = Math.sin(stride + leg.phase) * moving;
        const lift = Math.max(0, Math.cos(stride + leg.phase)) * moving;
        if (spider || scorpion) {
          leg.joint.rotation.z = leg.side * (s * 0.21 - pose * 0.10);
        } else if (bear) {
          const swipe = leg.front ? (Math.max(0, pose) * 0.85 - Math.max(0, -pose) * 0.55) : -Math.max(0, pose) * 0.42;
          leg.joint.rotation.x = leg.baseUpperX + s * 0.44 - swipe;
          leg.joint.rotation.z = leg.front ? -leg.side * Math.max(0, pose) * 0.28 : 0;
          if (leg.lower) leg.lower.rotation.x = leg.baseLowerX + (leg.front ? -lift * 0.36 - Math.max(0, pose) * 0.32 : lift * 0.34);
        } else {
          const amp = boar ? 0.54 : 0.62;
          const crouch = leg.front ? pose * 0.18 : -pose * 0.14;
          leg.joint.rotation.x = leg.baseUpperX + s * amp + crouch;
          if (leg.lower) {
            const bend = leg.front ? -lift * 0.58 : lift * 0.52;
            leg.lower.rotation.x = leg.baseLowerX + bend - crouch * 0.7;
          }
        }
      }
    },
    setFlash(value) {
      for (const m of flashMats) m.emissive.setScalar(value * 0.82);
    },
    dispose() {
      for (const material of allMats) material.dispose();
    }
  };
}
