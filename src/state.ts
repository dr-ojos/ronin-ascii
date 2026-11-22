// Shared, mutable game state. Modules import these objects and read / write their fields
// (an imported `let` can't be reassigned from another module, so loose variables live in `state`).
import * as THREE from 'three';

export const player = {
  pos: new THREE.Vector3(0, 0, 4), face: Math.PI, hp: 100, maxHp: 100, attackT: -1, attackDur: 0.3, combo: 0, lastAttackEnd: -9,
  hitDone: false, dashT: 0, dashCd: 0, dashDir: new THREE.Vector3(), invuln: 0, walk: 0, moving: 0
};

export const state = {
  // camera
  yaw: 0, pitch: 0.92, camDistUser: 21, photoDist: 3.2,
  // match
  kills: 0, playing: false, dead: false, lastHurt: -99,
  // points: a kill streak raises the multiplier, getting hit resets it
  score: 0, best: 0, mult: 1, streakT: 0, campsCleared: 0, gain: '', gainT: 0,
  // loot: chests opened, upgrades (level by id, see upgrades.ts), the "press E" hint
  chests: 0, upgrades: {} as Record<string, number>, prompt: '',
  // feel
  shake: 0, hitStop: 0, time: 0,
  // toggles
  asciiOn: true, colorMode: 0, photo: false, raining: true, bigMap: false
};

/** keys currently held, by KeyboardEvent.code */
export const keys: Record<string, boolean> = {};
