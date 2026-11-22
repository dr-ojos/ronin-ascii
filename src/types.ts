// Shared type definitions.
import type * as THREE from 'three';

/** static obstacle: a circle (x, z, r) or an axis-aligned rectangle [x0, x1, z0, z1] */
export type Collider =
  | { x: number; z: number; r: number; rect?: undefined }
  | { rect: [number, number, number, number] };

/** minimal 2D position (THREE.Vector3 fits: only x / z are used) */
export interface XZ { x: number; z: number }

export type EnemyState = 'chase' | 'windup' | 'recover';

/** the mocap-rigged oni returned by createOniWarrior (rig.js) */
export interface OniWarrior {
  root: THREE.Object3D;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  update(dt: number, o: { moving: number; speed: number; state: 'windup' | 'strike' | 'idle' }): void;
  setFlash(v: number): void;
}

interface EnemyBase {
  g: THREE.Object3D;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  big: boolean;
  scale: number;
  hp: number;
  speed: number;
  dmg: number;
  state: EnemyState;
  t: number;
  knock: THREE.Vector3;
  flash: number;
  seed: number;
}
/** rigged oni (when the character model loaded) */
export interface RiggedEnemy extends EnemyBase { oni: OniWarrior; move: number }
/** procedural oni (fallback): flashes through its two materials */
export interface ProceduralEnemy extends EnemyBase {
  oni?: undefined;
  robeMat: THREE.MeshStandardMaterial;
  maskMat: THREE.MeshStandardMaterial;
}
export type Enemy = RiggedEnemy | ProceduralEnemy;
