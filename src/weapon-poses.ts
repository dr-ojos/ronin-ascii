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
  // Natural relaxed dual-blade combat stance: arms gently bent at hip/waist level, both blades held cleanly forward & outward
  const idle = key([side * 0.30, 0.96 + (side > 0 ? 0.03 : 0), 0.24 + (side > 0 ? 0.04 : 0)], [side * 0.28, 0.14 + (side > 0 ? 0.04 : 0), 0.95], [0, -1, 0]);
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

// ------------------------------------------------------------ bō (the sōhei's staff)
// Held in the middle with both hands, the left a third of a metre up the shaft. `staffKey` places the
// point between the hands, so a staff swung out to one side keeps both hands in reach.
// K1 a flat swing from the right at head height · K2 the backhand return from the left, lower
// K3 an overhead blow straight down · L the wheel: a full turn with the staff held out, then a leap
// and a slam into the ground that dazes everything around (player.ts)
const STAFF_HANDS = 0.33;
function staffKey(mid: Vec3, d: Vec3, e: Vec3 = [0, -1, 0]) {
  const n = new THREE.Vector3(...d).normalize().multiplyScalar(STAFF_HANDS / 2);
  return key([mid[0] - n.x, mid[1] - n.y, mid[2] - n.z], d, e);
}
const staffIdle = key([-0.24, 1.0, 0.18], [0.5, 0.5, 0.71], [0, -1, 0]);
const staffOverhead = staffKey([0, 1.62, 0.04], [0.05, 0.62, -0.78], [0, 0, 1]);
const staffSlam = staffKey([0, 1.0, 0.46], [0.02, -0.62, 0.78]);
const staff: Grip = {
  idle: staffIdle,
  run: key([-0.25, 0.98, 0.13], [0.5, 0.25, 0.83], [0, -1, 0]),
  show: key([-0.14, 1.03, 0.28], [0.59, 0.68, 0.43], [0, -0.2, 1]),
  dash: key([-0.27, 0.97, 0.15], [0.55, 0.2, 0.81], [0, -1, 0]),
  attacks: [{
    keys: [[0, staffIdle], [0.28, staffKey([-0.05, 1.32, 0.2], [-0.85, 0.3, -0.42])],
      [0.48, staffKey([0, 1.25, 0.34], [0.05, 0.12, 1])], [0.62, staffKey([0.06, 1.2, 0.28], [0.88, 0.05, 0.47])], [1, staffIdle]],
    twist: [[0, 0], [0.28, -0.45], [0.48, 0.1], [0.64, 0.45], [1, 0]],
    lean: [[0, 0], [0.28, -0.06], [0.48, 0.18], [0.64, 0.12], [1, 0]]
  }, {
    keys: [[0, staffIdle], [0.28, staffKey([0.08, 1.15, 0.22], [0.85, 0.1, -0.4])],
      [0.48, staffKey([0, 1.05, 0.36], [-0.1, -0.05, 1])], [0.62, staffKey([-0.08, 1.1, 0.26], [-0.9, 0.15, 0.42])], [1, staffIdle]],
    twist: [[0, 0], [0.28, 0.45], [0.48, -0.1], [0.64, -0.45], [1, 0]],
    lean: [[0, 0], [0.28, -0.04], [0.48, 0.22], [0.64, 0.16], [1, 0]]
  }, {
    keys: [[0, staffIdle], [0.3, staffOverhead], [0.44, staffOverhead], [0.54, staffSlam], [0.75, staffSlam], [1, staffIdle]],
    twist: [[0, 0], [0.3, -0.12], [0.54, 0.05], [1, 0]],
    lean: [[0, 0], [0.3, -0.22], [0.44, -0.18], [0.54, 0.36], [0.75, 0.3], [1, 0]]
  }, {
    keys: [[0, staffIdle], [0.1, staffKey([0, 1.2, 0.3], [-0.95, 0.08, 0.3])], [0.5, staffKey([0, 1.2, 0.3], [-0.95, 0.08, 0.3])],
      [0.6, staffOverhead], [0.72, staffSlam], [0.88, staffSlam], [1, staffIdle]],
    twist: [[0, 0], [0.1, -0.3], [0.5, -0.3], [0.6, -0.1], [0.72, 0.08], [1, 0]],
    spin: [[0, 0], [0.1, 0], [0.5, TAU], [1, TAU]],
    rise: [[0, 0], [0.52, 0], [0.62, 0.28], [0.72, 0], [1, 0]],
    lean: [[0, 0], [0.5, 0.06], [0.6, -0.26], [0.72, 0.42], [0.88, 0.36], [1, 0]]
  }]
};

// ------------------------------------------------------------ odachi (gran sable colosal)
// Held low at the right side (waki-gamae).
// K1 rising diagonal draw-cut · K2 wide waist-level horizontal sweep · K3 lunging overhead cleave
// L horizon crescent: coiled lunge into a blazing 360-degree horizontal sweep
const odachiIdle = key([-0.22, 1.02, 0.14], [-0.36, 0.34, -0.87], [0, -1, 0]);
const odachiLowR = key([-0.28, 0.86, 0.08], [-0.55, -0.45, -0.70], [0, 0.4, 1]);
const odachiMidUp = key([0.02, 1.24, 0.46], [0.22, 0.38, 0.90], [0.6, 0.7, 0]);
const odachiHighL = key([0.24, 1.54, 0.20], [0.58, 0.68, -0.45], [0, -0.2, 1]);
const odachiSweepR = key([-0.28, 1.12, 0.24], [-0.90, -0.06, 0.42], [0, -1, 0]);
const odachiHigh = key([-0.04, 1.76, 0.02], [0.04, 0.48, -0.88], [0, 0.2, 1]);
const odachiDown = key([0.04, 0.96, 0.56], [0.08, -0.52, 0.85], [0, -1, 0]);
const odachiCoil = key([-0.28, 0.96, 0.02], [-0.88, -0.10, -0.46], [0.3, 0, 1]);
const odachiWhirl = key([-0.08, 1.08, 0.44], [-0.78, 0.04, 0.62], [0.7, 0, 0.7]);
const odachi: Grip = {
  idle: odachiIdle,
  run: key([-0.25, 0.96, 0.08], [-0.30, 0.14, -0.94], [0, -1, 0]),
  show: key([-0.08, 1.12, 0.30], [0.64, 0.70, 0.32], [0, -0.35, 1]),
  dash: key([-0.28, 0.92, 0.02], [-0.25, -0.05, -0.96], [0, -1, 0]),
  attacks: [{
    // K1 rising diagonal draw from low right to high left
    keys: [[0, odachiIdle], [0.24, odachiLowR], [0.48, odachiMidUp], [0.70, odachiHighL], [1, odachiIdle]],
    twist: [[0, 0], [0.24, -0.48], [0.48, 0.18], [0.70, 0.52], [1, 0]],
    lean: [[0, 0], [0.24, 0.18], [0.48, 0.22], [0.70, -0.08], [1, 0]]
  }, {
    // K2 wide flat horizontal reverse sweep from left to right
    keys: [[0, odachiIdle], [0.22, odachiHighL], [0.46, key([0.04, 1.14, 0.48], [0.18, 0.04, 0.98], [-1, 0, 0])],
      [0.68, odachiSweepR], [1, odachiIdle]],
    twist: [[0, 0], [0.22, 0.56], [0.46, 0.02], [0.68, -0.58], [1, 0]],
    lean: [[0, 0], [0.22, -0.06], [0.46, 0.20], [0.68, 0.14], [1, 0]]
  }, {
    // K3 lunging overhead cleave
    keys: [[0, odachiIdle], [0.30, odachiHigh], [0.54, odachiDown], [0.74, odachiDown], [1, odachiIdle]],
    twist: [[0, 0], [0.30, -0.14], [0.54, 0.12], [1, 0]],
    lean: [[0, 0], [0.30, -0.22], [0.54, 0.38], [0.74, 0.30], [1, 0]]
  }, {
    // L horizon crescent: coiled dash into a blazing 360 horizontal sweep
    keys: [[0, odachiIdle], [0.20, odachiCoil], [0.34, odachiWhirl], [0.74, odachiWhirl], [1, odachiIdle]],
    twist: [[0, 0], [0.20, -0.55], [0.34, 0.15], [0.74, 0.15], [1, 0]],
    spin: [[0, 0], [0.26, 0], [0.72, TAU], [1, TAU]],
    lean: [[0, 0], [0.20, 0.26], [0.34, 0.22], [0.74, 0.16], [1, 0]]
  }]
};

// ------------------------------------------------------------ rapier (estoque / aguja)
// Held forward in a fencer's guard; lightning thrusts, flick-slash and a blazing dash-skewer.
// K1 fast lunge thrust · K2 flick-slash into high thrust · K3 triple needle flurry · L lightning skewer + riposte
const rapierIdle = key([-0.14, 1.12, 0.34], [0.08, 0.10, 0.99], [0, -1, 0]);
const rapierBack = (y = 0) => key([-0.26, 1.10 + y, 0.08], [0.10, 0.04, 0.99], [0, -1, 0]);
const rapierThrust = (x = 0, y = 0) => key([-0.06 + x, 1.15 + y, 0.56], [0.02 + x * 0.4, 0.04 + y * 0.4, 1], [0, -1, 0]);
const rapierFlickL = key([0.18, 1.18, 0.40], [0.74, 0.12, 0.66], [0, -1, 0]);
const rapierFlickR = key([-0.24, 1.14, 0.34], [-0.72, 0.06, 0.69], [0, -1, 0]);
const rapier: Grip = {
  idle: rapierIdle,
  run: key([-0.18, 1.06, 0.24], [0.16, -0.06, 0.98], [0, -1, 0]),
  show: key([-0.08, 1.14, 0.34], [0.52, 0.78, 0.34], [0, -0.25, 1]),
  dash: key([-0.24, 1.04, 0.10], [0.14, 0.04, 0.99], [0, -1, 0]),
  attacks: [{
    // K1 lightning thrust
    keys: [[0, rapierIdle], [0.18, rapierBack(0)], [0.38, rapierThrust(0, 0)], [0.54, rapierThrust(0, 0)], [1, rapierIdle]],
    twist: [[0, 0], [0.18, -0.40], [0.38, 0.28], [0.56, 0.20], [1, 0]],
    lean: [[0, 0], [0.18, -0.06], [0.38, 0.28], [0.56, 0.22], [1, 0]]
  }, {
    // K2 quick horizontal flick-slash + high thrust
    keys: [[0, rapierIdle], [0.16, rapierFlickR], [0.30, rapierFlickL], [0.44, rapierBack(0.08)],
      [0.58, rapierThrust(0, 0.10)], [0.70, rapierThrust(0, 0.10)], [1, rapierIdle]],
    twist: [[0, 0], [0.16, -0.36], [0.30, 0.38], [0.44, -0.30], [0.58, 0.32], [1, 0]],
    lean: [[0, 0], [0.30, 0.14], [0.44, 0.02], [0.58, 0.30], [1, 0]]
  }, {
    // K3 triple needle flurry
    keys: [[0, rapierIdle], [0.14, rapierBack(-0.04)], [0.26, rapierThrust(-0.08, -0.04)],
      [0.36, rapierBack(0.06)], [0.48, rapierThrust(0.10, 0.08)],
      [0.58, rapierBack(0)], [0.70, rapierThrust(0, 0.02)], [0.80, rapierThrust(0, 0.02)], [1, rapierIdle]],
    twist: [[0, 0], [0.14, -0.30], [0.26, 0.22], [0.36, -0.24], [0.48, 0.26], [0.58, -0.32], [0.70, 0.34], [1, 0]],
    lean: [[0, 0], [0.26, 0.20], [0.48, 0.24], [0.70, 0.32], [1, 0]]
  }, {
    // L lightning dash-skewer followed by a sweeping riposte
    keys: [[0, rapierIdle], [0.24, key([-0.30, 0.96, -0.02], [0.06, 0.04, 0.99], [0, -1, 0])],
      [0.44, key([-0.02, 1.12, 0.62], [0, 0.02, 1], [0, -1, 0])],
      [0.54, key([-0.02, 1.12, 0.62], [0, 0.02, 1], [0, -1, 0])],
      [0.70, rapierFlickL], [0.82, rapierFlickL], [1, rapierIdle]],
    twist: [[0, 0], [0.24, -0.52], [0.44, 0.32], [0.54, 0.28], [0.70, 0.56], [1, 0]],
    lean: [[0, 0], [0.24, 0.20], [0.44, 0.42], [0.56, 0.34], [0.70, 0.14], [1, 0]]
  }]
};

// ------------------------------------------------------------ cleaver (zanbato / cuchilla monumental)
// Carried heavy over the right shoulder.
// K1 earth-scraping uppercut · K2 crushing vertical slam · K3 colossal 360 spin cleave
// L earth hammer: high spinning leap into a seismic vertical slam
const cleaverIdle = key([-0.20, 1.36, 0.12], [-0.24, 0.28, -0.93], [0, -1, 0]);
const cleaverLow = key([-0.24, 0.72, 0.22], [-0.22, -0.78, 0.58], [0, 0.6, 1]);
const cleaverUp = key([0.08, 1.66, 0.34], [0.20, 0.82, 0.54], [0, 0.4, -1]);
const cleaverOver = key([-0.02, 1.88, -0.06], [0, 0.38, -0.92], [0, 1, 0.1]);
const cleaverSlam = key([0, 0.88, 0.58], [0, -0.68, 0.73], [0, -1, 0.2]);
const cleaverSpinBack = key([-0.32, 1.18, 0.02], [-0.92, 0.10, -0.38], [0.3, 0, 1]);
const cleaverSpinOut = key([-0.04, 1.12, 0.44], [-0.76, -0.02, 0.65], [0.7, 0, 0.7]);
const cleaver: Grip = {
  idle: cleaverIdle,
  run: key([-0.22, 1.32, 0.08], [-0.26, 0.20, -0.94], [0, -1, 0]),
  show: key([-0.06, 1.16, 0.32], [0.66, 0.68, 0.28], [0, -0.45, 1]),
  dash: key([-0.24, 1.24, 0.02], [-0.30, 0.12, -0.94], [0, -1, 0]),
  attacks: [{
    // K1 earth-scraping rising uppercut
    keys: [[0, cleaverIdle], [0.28, cleaverLow], [0.52, key([-0.04, 1.26, 0.52], [0.06, 0.28, 0.96], [0, 1, -0.2])],
      [0.72, cleaverUp], [1, cleaverIdle]],
    twist: [[0, 0], [0.28, -0.44], [0.52, 0.16], [0.72, 0.38], [1, 0]],
    lean: [[0, 0], [0.28, 0.34], [0.52, 0.12], [0.72, -0.18], [1, 0]]
  }, {
    // K2 crushing overhead vertical slam
    keys: [[0, cleaverIdle], [0.32, cleaverOver], [0.54, cleaverSlam], [0.78, cleaverSlam], [1, cleaverIdle]],
    twist: [[0, 0], [0.32, -0.12], [0.54, 0.06], [1, 0]],
    lean: [[0, 0], [0.32, -0.28], [0.54, 0.48], [0.78, 0.40], [1, 0]]
  }, {
    // K3 colossal 360 spin cleave
    keys: [[0, cleaverIdle], [0.24, cleaverSpinBack], [0.38, cleaverSpinOut], [0.78, cleaverSpinOut], [1, cleaverIdle]],
    twist: [[0, 0], [0.24, -0.62], [0.38, 0.12], [0.78, 0.12], [1, 0]],
    spin: [[0, 0], [0.30, 0], [0.76, TAU], [1, TAU]],
    lean: [[0, 0], [0.24, -0.08], [0.40, 0.20], [0.78, 0.14], [1, 0]]
  }, {
    // L earth hammer: high spinning leap into a seismic vertical slam
    keys: [[0, cleaverIdle], [0.16, cleaverSpinOut], [0.48, cleaverOver], [0.68, cleaverSlam], [0.86, cleaverSlam], [1, cleaverIdle]],
    twist: [[0, 0], [0.16, -0.22], [0.48, -0.10], [0.68, 0.08], [1, 0]],
    spin: [[0, 0], [0.14, 0], [0.50, TAU], [1, TAU]],
    rise: [[0, 0], [0.14, 0], [0.42, 0.72], [0.56, 0.56], [0.68, 0], [1, 0]],
    lean: [[0, 0], [0.14, 0.10], [0.48, -0.32], [0.68, 0.54], [0.86, 0.44], [1, 0]]
  }]
};

export function leftGripOffset(form: WeaponForm, extension: number) {
  // The supporting hand slides down the wrapping as the rear hand pushes the spear forward.
  if (form === 'spear') return THREE.MathUtils.clamp(0.31 - (extension - 0.19) * 0.9, 0.115, 0.31);
  if (form === 'broad') return -0.105;
  if (form === 'odachi') return -0.145;
  if (form === 'rapier') return -0.085;
  if (form === 'cleaver') return -0.14;
  if (form === 'staff') return STAFF_HANDS;
  return form === 'dual' ? 0 : -0.075;
}

// Positions along the wrapped handles in the shop pose. The twin blades each have their own handle.
export const previewGripOffsets: Record<WeaponForm, readonly [right: number, left: number]> = {
  katana: [0.06, -0.065],
  spear: [-0.025, 0.265],
  broad: [0.065, -0.10],
  dual: [0, 0],
  staff: [0, STAFF_HANDS],
  odachi: [0.06, -0.145],
  rapier: [0.04, -0.085],
  cleaver: [0.07, -0.14]
};

export function previewPalmAxis(forward: THREE.Vector3, shaft: THREE.Vector3) {
  return forward.addScaledVector(shaft, -forward.dot(shaft)).normalize();
}

export const weaponGrips: Record<Exclude<WeaponForm, 'katana'>, Grip> = { spear, broad, dual: dualGrip(-1), staff, odachi, rapier, cleaver };
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
