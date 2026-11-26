// Shared, mutable game state. Modules import these objects and read / write their fields
// (an imported `let` can't be reassigned from another module, so loose variables live in `state`).
import * as THREE from 'three';
import type { TechniqueId } from './techniques';
import type { ClassId } from './classes';
import type { OrbElement } from './elemental-orb';

export type MenuId = 'shop' | 'custom' | 'temple' | 'inventory' | 'level' | 'info';

export const player = {
  pos: new THREE.Vector3(0, 0, 4), face: Math.PI, hp: 100, maxHp: 100, attackT: -1, attackDur: 0.3, combo: 0, lastAttackEnd: -9,
  hitDone: false, dashT: 0, dashCd: 0, dashDir: new THREE.Vector3(), invuln: 0, snareT: 0, walk: 0, moving: 0,
  jumpY: 0, vy: 0, jumpBuf: 0, landT: 0, airDashUsed: false,
  // the Danza de los Mil Tajos carries you from oni to oni (blade-dance.ts): no walking or attacking meanwhile
  dancing: false
};

export const state = {
  // who you play (classes.ts): the ronin or the sōhei, chosen on the title screen
  cls: 'ronin' as ClassId,
  // camera
  yaw: 0, pitch: 0.92, camDistUser: 21, photoDist: 3.2,
  // match
  kills: 0, playing: false, dead: false, lastHurt: -99,
  // points: a kill streak raises the multiplier, getting hit resets it
  score: 0, best: 0, mult: 1, streakT: 0, campsCleared: 0, gain: '', gainT: 0,
  // loot: chests opened, upgrades (level by id, see upgrades.ts), the "press E" hint
  chests: 0, upgrades: {} as Record<string, number>, prompt: '',
  // the purse: every point earned is also mon to spend at the smith's (weapons.ts); buying never lowers the score
  mon: 0, weapon: 'katana' as string, owned: ['katana'] as string[], armor: 'kimono' as string, ownedArmor: ['kimono'] as string[],
  // inside Masa's shop (the shrine at the start): its roof hides and the camera comes closer
  indoors: false,
  // An open menu pauses the fight. Two technique slots, each with its own charge (0..1): P (technique, special)
  // and J (technique2, special2). `casting` is the last one cast: its rank sets the damage (progression.ts).
  menu: null as MenuId | null,
  /** the title screen is up: the camera frames the chosen warrior on the right (title.ts, camera.ts) */
  showcase: false,
  special: 0, jade: 0, technique: 'tajos' as TechniqueId, learnedTechniques: ['tajos', 'iai'] as TechniqueId[],
  special2: 0, technique2: 'iai' as TechniqueId, casting: 'tajos' as TechniqueId,
  // ranged elemental orb attack (Ñ): 3 charges with its own special recharge, SHIFT+Ñ cycles the element
  rangedElement: 'fuego' as OrbElement, rangedCharges: 3, rangedCharge: 0,
  // feel
  shake: 0, hitStop: 0, time: 0,
  // weather: `raining` is where it is heading, rainAmt how hard it rains now (0..1), rainT seconds until it changes
  raining: false, rainAmt: 0, rainT: 140 + Math.random() * 160,
  // toggles
  asciiOn: true, colorMode: 0, photo: false, bigMap: false
};

/** keys currently held, by KeyboardEvent.code */
export const keys: Record<string, boolean> = {};
