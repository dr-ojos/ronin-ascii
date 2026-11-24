import * as THREE from 'three';
import type { Attack, AvatarInput, Pose, Vec3, WeaponForm } from './types';

export function key(p: Vec3, d: Vec3, e: Vec3): Pose {
  const z = new THREE.Vector3(...d).normalize();
  const y = new THREE.Vector3(...e);
  y.addScaledVector(z, -y.dot(z)).normalize().negate();
  const x = new THREE.Vector3().crossVectors(y, z);
  return { pos: new THREE.Vector3(...p), q: new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)) };
}

export function sampleKeys(keys: Attack['keys'], p: number, outPos: THREE.Vector3, outQ: THREE.Quaternion) {
  let i = 0;
  while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  const t = THREE.MathUtils.smoothstep(p, t0, t1);
  outPos.lerpVectors(a.pos, b.pos, t);
  outQ.slerpQuaternions(a.q, b.q, t);
}

interface Grip {
  idle: Pose;
  run: Pose;
  show: Pose;
  dash: Pose;
  attacks: Attack[];
}

const TAU = Math.PI * 2;

// ------------------------------------------------------------ yari
// K1 a straight thrust · K2 two quick jabs, the second a little higher · K3 a wide sweep with the shaft
// L the dragon's coil: the spear whirls once around the body, then a lunging thrust
const spearIdle = key([-0.27, 1.02, 0.17], [0.62, 0.28, 0.74], [0, -1, 0]);
const spearRun = key([-0.26, 0.99, 0.13], [0.55, 0.10, 0.83], [0, -1, 0]);
const spearShow = key([-0.14, 1.03, 0.28], [0.59, 0.68, 0.43], [0, -0.2, 1]);
const spearDash = key([-0.28, 0.97, 0.17], [0.55, 0.23, 0.80], [0, -1, 0]);
const spearPull = (lift: number) => key([-0.32, 1.07 + lift, 0.03], [0.58, 0.06, 0.82], [0, -1, 0]);
const spearStrike = (lift: number) => key([-0.17, 1.10 + lift, 0.35], [0.18, 0.04, 1], [0, -1, 0]);
const spear: Grip = {
  idle: spearIdle, run: spearRun, show: spearShow, dash: spearDash,
  attacks: [{
    keys: [[0, spearIdle], [0.23, spearPull(0)], [0.41, spearStrike(0)], [0.52, spearStrike(0)], [1, spearIdle]],
    twist: [[0, 0], [0.23, -0.36], [0.41, 0.25], [0.52, 0.19], [1, 0]],
    lean: [[0, 0], [0.23, -0.08], [0.41, 0.22], [0.6, 0.18], [1, 0]]
  }, {
    keys: [[0, spearIdle], [0.14, spearPull(0)], [0.28, spearStrike(-0.04)], [0.38, spearPull(0.05)],
      [0.52, spearStrike(0.1)], [0.62, spearStrike(0.1)], [1, spearIdle]],
    twist: [[0, 0], [0.14, -0.3], [0.28, 0.22], [0.38, -0.2], [0.52, 0.3], [0.65, 0.22], [1, 0]],
    lean: [[0, 0], [0.14, -0.05], [0.28, 0.18], [0.38, 0.04], [0.52, 0.26], [0.7, 0.2], [1, 0]]
  }, {
    keys: [[0, spearIdle], [0.23, key([-0.22, 1.15, 0.07], [-0.48, 0.16, 0.86], [0, -1, 0])],
      [0.48, key([-0.17, 1.12, 0.34], [0.18, 0.04, 1], [1, 0, 0])],
      [0.66, key([-0.05, 1.12, 0.22], [0.86, 0.11, 0.51], [0, -1, 0])], [1, spearIdle]],
    twist: [[0, 0], [0.24, -0.52], [0.48, 0.04], [0.68, 0.55], [1, 0]],
    lean: [[0, 0], [0.24, 0.04], [0.48, 0.16], [0.68, 0.1], [1, 0]]
  }, {
    keys: [[0, spearIdle], [0.1, key([-0.12, 1.16, 0.22], [-0.92, 0.08, 0.38], [0, -1, 0])],
      [0.5, key([-0.12, 1.16, 0.22], [-0.92, 0.08, 0.38], [0, -1, 0])], [0.62, spearPull(0.06)],
      [0.72, key([-0.13, 1.14, 0.44], [0.12, 0.02, 1], [0, -1, 0])], [0.86, key([-0.13, 1.14, 0.44], [0.12, 0.02, 1], [0, -1, 0])],
      [1, spearIdle]],
    twist: [[0, 0], [0.1, -0.3], [0.5, -0.3], [0.62, -0.5], [0.72, 0.3], [0.86, 0.25], [1, 0]],
    spin: [[0, 0], [0.12, 0], [0.5, TAU], [1, TAU]],
    lean: [[0, 0], [0.12, 0.06], [0.5, 0.06], [0.62, -0.14], [0.72, 0.34], [0.86, 0.3], [1, 0]]
  }]
};

// ------------------------------------------------------------ mandoble
// K1 / K2 heavy diagonals from each shoulder · K3 a full turn with the blade at waist height
// L the mountain splitter: a leap with the sword raised behind the head and a cleave into the ground
const broadIdle = key([-0.15, 1.02, 0.32], [0.56, 0.38, 0.74], [0, -1, 0]);
function broadCut(side: 1 | -1): Attack {
  return {
    keys: [[0, broadIdle],
      [0.30, key([side * 0.22, 1.47, 0.16], [side * 0.35, 0.77, -0.53], [0, -0.1, 1])],
      [0.52, key([side * 0.04, 1.23, 0.47], [-side * 0.17, 0.12, 0.98], [-side, -0.36, 0])],
      [0.71, key([-side * 0.18, 0.95, 0.31], [-side * 0.62, -0.54, 0.57], [0, -1, 0])], [1, broadIdle]],
    twist: [[0, 0], [0.30, side * 0.44], [0.52, -side * 0.14], [0.72, -side * 0.48], [1, 0]],
    lean: [[0, 0], [0.30, -0.12], [0.52, 0.24], [0.72, 0.3], [1, 0]]
  };
}
const broadSpinBack = key([-0.3, 1.2, 0.05], [-0.9, 0.15, -0.3], [0.3, 0, 1]);
const broadSpinOut = key([-0.06, 1.14, 0.42], [-0.72, 0.02, 0.69], [0.7, 0, 0.7]);
const broadRaised = key([-0.04, 1.86, -0.04], [0.02, 0.35, -0.94], [0, 1, 0.1]);
const broadCleave = key([-0.02, 0.95, 0.6], [0, -0.55, 0.84], [0, -1, 0.2]);
const broad: Grip = {
  idle: broadIdle,
  run: key([-0.20, 0.98, 0.27], [0.64, 0.24, 0.63], [0, -1, 0]),
  show: key([-0.06, 1.14, 0.33], [0.69, 0.66, 0.25], [0, -0.42, 1]),
  dash: key([-0.20, 1.01, 0.16], [0.76, 0.1, 0.63], [0, -1, 0]),
  attacks: [broadCut(-1), broadCut(1), {
    keys: [[0, broadIdle], [0.22, broadSpinBack], [0.36, broadSpinOut], [0.78, broadSpinOut], [1, broadIdle]],
    twist: [[0, 0], [0.22, -0.6], [0.36, 0.1], [0.78, 0.1], [1, 0]],
    spin: [[0, 0], [0.3, 0], [0.76, TAU], [1, TAU]],
    lean: [[0, 0], [0.22, -0.06], [0.4, 0.16], [0.78, 0.12], [1, 0]]
  }, {
    keys: [[0, broadIdle], [0.24, broadRaised], [0.44, broadRaised], [0.55, broadCleave], [0.78, broadCleave], [1, broadIdle]],
    twist: [[0, 0], [0.24, -0.15], [0.44, -0.1], [0.55, 0.05], [1, 0]],
    rise: [[0, 0], [0.14, 0], [0.34, 0.62], [0.46, 0.52], [0.55, 0], [1, 0]],
    lean: [[0, 0], [0.14, 0.12], [0.32, -0.28], [0.46, -0.2], [0.55, 0.48], [0.78, 0.42], [1, 0]]
  }]
};

// ------------------------------------------------------------ hojas dobles
// K1 a one-two from high: right blade, then left · K2 a one-two rising from low: left, then right
// K3 both blades cross in an X and scissor open · L the whirlwind: a leap with both blades spread,
// two turns in the air, landing with both points driven into the ground
function dualGrip(side: -1 | 1): Grip {
  const idle = key([side * 0.34, 1.12, 0.24], [side * 0.53, 0.43, 0.73], [0, -1, 0]);
  const wind = key([side * 0.39, 1.34, 0.16], [side * 0.72, 0.63, -0.27], [0, -0.3, 1]);
  const strike = key([side * 0.15, 1.23, 0.45], [-side * 0.34, 0.15, 0.93], [-side, -0.55, 0]);
  const follow = key([side * 0.12, 1.02, 0.38], [-side * 0.57, -0.34, 0.74], [-side, -0.57, 0]);
  const low = key([side * 0.38, 0.96, 0.18], [side * 0.45, -0.7, 0.2], [0, 0.3, 1]);
  const rising = key([side * 0.12, 1.32, 0.48], [-side * 0.2, 0.55, 0.81], [-side * 0.4, 0.9, 0]);
  const high = key([-side * 0.04, 1.58, 0.3], [-side * 0.35, 0.9, -0.1], [0, 0.4, -1]);
  const oneTwo = (first: boolean, twist: number, [a, b, c]: Pose[]): Attack => {
    const lead = first ? 0 : 0.24;
    return {
      keys: [[0, idle], [0.18 + lead, a], [0.36 + lead, b], [0.48 + lead, c], [1, idle]],
      twist: [[0, 0], [0.20, twist * 0.46], [0.37, -twist * 0.38], [0.60, twist * 0.48], [0.77, twist * 0.18], [1, 0]],
      lean: [[0, 0], [0.2, -0.04], [0.37, 0.2], [0.6, 0.22], [1, 0]]
    };
  };
  const cross = key([side * 0.10, 1.22 + side * 0.065, 0.44], [-side * 0.71, side * 0.06, 0.70], [0, -1, 0]);
  const open = key([side * 0.42, 1.2, 0.3], [side * 0.9, 0.05, 0.42], [side, 0, 0]);
  const gather = key([side * 0.28, 1.0, 0.02], [side * 0.35, -0.25, -0.9], [0, -1, 0]);
  const spread = key([side * 0.5, 1.3, 0.12], [side * 0.95, 0.05, 0.3], [0, 0, 1]);
  const raised = key([side * 0.18, 1.66, 0.24], [side * 0.08, 1, 0.12], [0, 0, 1]);
  const plunge = key([side * 0.13, 0.92, 0.5], [side * 0.05, -0.75, 0.65], [0, -1, 0]);
  return {
    idle,
    run: key([side * 0.34, 0.99, 0.11], [side * 0.57, -0.32, 0.74], [0, -1, 0]),
    show: key([side * 0.29, 1.10 - side * 0.03, 0.29], [side * 0.58, 0.75, 0.27], [0, -0.3, 1]),
    dash: key([side * 0.37, 0.94, 0.04], [side * 0.49, 0.12, -0.86], [0, -1, 0]),
    attacks: [oneTwo(side < 0, -1, [wind, strike, follow]), oneTwo(side > 0, 1, [low, rising, high]), {
      keys: [[0, idle], [0.24, wind], [0.49, cross], [0.57, cross], [0.7, open], [0.82, open], [1, idle]],
      twist: [[0, 0], [0.24, -0.19], [0.49, 0.12], [0.62, 0.25], [1, 0]],
      lean: [[0, 0], [0.24, -0.1], [0.49, 0.26], [0.7, 0.18], [1, 0]]
    }, {
      keys: [[0, gather], [0.16, gather], [0.26, spread], [0.68, spread], [0.74, raised], [0.82, plunge], [0.92, plunge], [1, idle]],
      twist: [[0, 0.1], [0.16, 0.2], [0.3, 0], [0.82, 0], [1, 0]],
      spin: [[0, 0], [0.18, 0], [0.7, 2 * TAU], [1, 2 * TAU]],
      rise: [[0, 0], [0.16, 0], [0.4, 0.55], [0.7, 0.45], [0.82, 0], [1, 0]],
      lean: [[0, 0.15], [0.16, 0.25], [0.3, 0], [0.7, -0.08], [0.82, 0.42], [0.92, 0.38], [1, 0]]
    }]
  };
}

export function leftGripOffset(form: WeaponForm, extension: number) {
  // The supporting hand slides down the wrapping as the rear hand pushes the spear forward.
  if (form === 'spear') return THREE.MathUtils.clamp(0.31 - (extension - 0.19) * 0.9, 0.115, 0.31);
  if (form === 'broad') return -0.105;
  return form === 'dual' ? 0 : -0.075;
}

// Positions along the wrapped handles in the shop pose. The twin blades each have their own handle.
export const previewGripOffsets: Record<WeaponForm, readonly [right: number, left: number]> = {
  katana: [0.06, -0.065],
  spear: [-0.025, 0.265],
  broad: [0.065, -0.10],
  dual: [0, 0]
};

export function previewPalmAxis(forward: THREE.Vector3, shaft: THREE.Vector3) {
  return forward.addScaledVector(shaft, -forward.dot(shaft)).normalize();
}

export const weaponGrips: Record<Exclude<WeaponForm, 'katana'>, Grip> = { spear, broad, dual: dualGrip(-1) };
export const offhandGrip = dualGrip(1);

export function sampleGrip(grip: Grip, s: AvatarInput, gait: number, outPos: THREE.Vector3, outQ: THREE.Quaternion) {
  if (s.attack) {
    sampleKeys(grip.attacks[s.attack.combo].keys, s.attack.p, outPos, outQ);
    return;
  }
  const pose = s.showWeapon ? grip.show : s.dash ? grip.dash : grip.idle;
  outPos.copy(pose.pos);
  outQ.copy(pose.q);
  if (!s.showWeapon && !s.dash) {
    outPos.lerp(grip.run.pos, s.moving);
    outQ.slerp(grip.run.q, s.moving);
    outPos.y += Math.sin(s.time * 1.9) * 0.008 + Math.abs(gait) * s.moving * 0.018;
    outPos.z += gait * s.moving * 0.10;
  }
}
