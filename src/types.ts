// Shared type definitions.
import type * as THREE from 'three';
import type { EnemyAttack } from './enemy-moves';
import type { LightAnchor } from './lights';
import type { EquipmentThreat } from './equipment-threat';
import type { TechniqueId } from './techniques';

export type Vec3 = [number, number, number];
export type WeaponForm = 'katana' | 'spear' | 'broad' | 'dual' | 'staff' | 'odachi' | 'rapier' | 'cleaver';

/** katana pose in body space */
export interface Pose { pos: THREE.Vector3; q: THREE.Quaternion }
/** one attack: weapon keyframes and body motion, all keyed by attack progress 0..1 */
export interface Attack {
  keys: [number, Pose][];
  /** spine twist (radians, + turns the chest to the samurai's left) */
  twist: [number, number][];
  /** whole-body turn (radians): spinning cuts */
  spin?: [number, number][];
  /** the body leaves the ground by this much (metres): leaps */
  rise?: [number, number][];
  /** torso pitch (radians, + leans into the blow, - arches back) */
  lean?: [number, number][];
}

/** what the samurai animation needs each frame */
export interface AvatarInput {
  time: number;
  moving: number;          // 0 idle .. 1 walking
  walk: number;            // walk cycle phase
  dash: boolean;
  jumpY?: number;          // height above ground (metres)
  vy?: number;             // vertical velocity (m/s)
  land?: number;           // 0..1 landing recovery settle
  weaponForm: WeaponForm;
  showWeapon?: boolean;
  look?: number;           // head turn towards the nearest oni (radians)
  /** combo 0..2 = K chain, 3 = L heavy attack */
  attack: { combo: number; p: number } | null;
}
/** the player's samurai, procedural (samurai.ts) or mocap-rigged (rig.ts) */
export interface Avatar {
  root: THREE.Object3D;
  katana: THREE.Object3D;
  offhand: THREE.Object3D;
  update(dt: number, s: AvatarInput): void;
  fitOutfit?(fitted: boolean): void;
  realistic?: boolean;
}

/** static obstacle: a circle (x, z, r), an axis-aligned rectangle [x0, x1, z0, z1],
 *  a capsule around a segment [x0, z0, x1, z1] (walls, rails, the river) or a lake's shore */
export type Collider =
  | { x: number; z: number; r: number; rect?: undefined; seg?: undefined; lake?: undefined }
  | { rect: [number, number, number, number]; seg?: undefined; lake?: undefined }
  | { seg: [number, number, number, number]; r: number; rect?: undefined; lake?: undefined }
  | { lake: { x: number; z: number; R: number; ph: number }; rect?: undefined; seg?: undefined };

/** minimal 2D position (THREE.Vector3 fits: only x / z are used) */
export interface XZ { x: number; z: number }

/** the kinds of oni: each looks and fights differently (enemies.ts KINDS) */
export type Wildlife = 'lobos' | 'oso' | 'jabalies' | 'aranas' | 'escorpiones';
export type EnemyKind = 'oni' | 'ashigaru' | 'arquero' | 'bruto' | 'escudero' | 'acechador' | 'hechicero'
  | 'guadanero' | 'piromante' | 'duelista' | 'tambor' | 'sombra' | 'coloso'
  | 'lobo' | 'loboAlfa' | 'oso' | 'jabali' | 'arana' | 'escorpion' | 'espectro'
  | 'jefe' | 'kuro' | 'tenguMayor' | 'raijinMayor' | 'guardianViento' | 'guardianFuego' | 'guardianAgua' | 'guardianRayo' | 'shuten' | 'enma' | 'senorBosque' | 'yukiOnna'
  | 'kagutsuchi' | 'daimyoHueso' | 'taikoDemonio'
  | 'gashadokuro' | 'susanooTempestad' | 'amaterasuCeniza'
  | 'senorCripta'
  | 'kensei' | 'tengu' | 'raijin';
export type Affix = 'acorazado' | 'regenerador' | 'furioso' | 'gelido' | 'invocador' | 'errante' | 'espinoso';
export type EnemyState = 'idle' | 'chase' | 'windup' | 'charge' | 'recover' | 'return';

export interface EnemyModel {
  root: THREE.Object3D;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  update(dt: number, o: { moving: number; speed: number; state: 'windup' | 'strike' | 'idle' }): void;
  setFlash(v: number): void;
  dispose?(): void;
}

interface EnemyBase {
  kind: EnemyKind;
  g: THREE.Object3D;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  big: boolean;
  scale: number;
  hp: number;
  maxHp: number;
  speed: number;
  dmg: number;
  /** strike distance and wind-up time */
  reach: number;
  windup: number;
  /** attacks done in the current fight */
  swings: number;
  enraged: boolean;
  /** boss phase (1 = base, 2 = enraged, 3 = final phase for 3-phase colossal bosses) */
  phase?: number;
  attack?: EnemyAttack;
  strikeT: number;
  /** cooldown of a blink or flank */
  cd: number;
  /** bosses and guardians (battle.ts): the stagger bar, how much it needs, and the seconds left stunned */
  stagger?: number;
  staggerNeed?: number;
  dazedT?: number;
  /** random modifiers of a boss or guardian (battle.ts AFFIXES) */
  affixes?: Affix[];
  /** state.time of the next thing an affix does */
  affixT?: number;
  /** the coloured glow that follows a boss or guardian */
  aura?: LightAnchor;
  state: EnemyState;
  t: number;
  knock: THREE.Vector3;
  flash: number;
  seed: number;
  /** the camp it belongs to (its home and territory) */
  camp: Camp;
  /** where it is ambling to while idle */
  wander: { x: number; z: number };
}
/** a group of oni guarding a spot of the world (encounters.ts) */
export interface Camp {
  x: number; z: number;
  /** territory radius: they wander inside it and only notice you near it */
  r: number;
  /** leash: how far from home they follow you before giving up */
  leash: number;
  size: number;
  boss?: EnemyKind;
  /** the sub-boss guarding its chest, if any */
  elite?: EnemyKind;
  /** base composition and the current occupation's survivors, including reinforcements */
  kinds: EnemyKind[];
  roster: EnemyKind[];
  /** 0 = near the shrine .. 1 = the edge of the world (tougher oni) */
  tier: number;
  /** equipment bonuses locked when the group appears */
  threat?: EquipmentThreat;
  active: boolean;
  /** state.time when cleared (-1 = not cleared) */
  clearedAt: number;
  name?: string;
  wildlife?: Wildlife;
  /** patrols walk a road: their home moves along it */
  route?: [number, number][];
  routeT?: number;
  /** ambushes are one-off camps that vanish once cleared or left behind */
  temp?: boolean;
  /** camps with a chest at their centre (opened once cleared) */
  chest?: Chest;
  /** a temple guardian: beating it teaches this technique, and it does not come back this run */
  technique?: TechniqueId;
  /** guards a temple or sacred shrine: tougher stats, extra affixes and stronger reinforcements */
  templeGuard?: boolean;
  /** town liberation mission this occupation camp belongs to (liberation.ts) */
  town?: 'aldea' | 'pueblo';
  /** random colossal boss world event id (world-events.ts) */
  worldEvent?: string;
  /** dungeon room id this encounter belongs to (dungeon.ts) */
  dungeonRoom?: string;
}
/** a chest in the world (loot.ts) */
export interface Chest {
  x: number; z: number; ry: number;
  kind: 'guarida' | 'jefe' | 'oculto' | 'guardian';
  tier: number;
  state: 'sealed' | 'closed' | 'open';
  g?: THREE.Object3D;
  lid?: THREE.Object3D;
  openT: number;
  dungeon?: boolean;
}
export interface AnimatedEnemy extends EnemyBase { model: EnemyModel; move: number }
/** procedural oni (fallback): flashes through its two materials */
export interface ProceduralEnemy extends EnemyBase {
  model?: undefined;
  robeMat: THREE.MeshStandardMaterial;
  maskMat: THREE.MeshStandardMaterial;
}
export type Enemy = AnimatedEnemy | ProceduralEnemy;
