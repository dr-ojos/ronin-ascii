import * as THREE from 'three';
import { CLS, markCombatFx, tagMat } from './materials';
import { collide } from './physics';
import { scene } from './renderer';
import { surfaceY } from './structures';
import type { Enemy, XZ } from './types';

type Move = {
  range: number;
  windup: number;
  recovery: number;
  power: number;
  color: number;
} & (
  | { shape: 'arc'; radius: number; angle: number; innerRadius?: number; pull?: number; parry?: boolean; heal?: number }
  | { shape: 'charge'; length: number; width: number; duration?: number }
  | { shape: 'wave'; length: number; width: number }
  | { shape: 'zones'; radius: number; layout: 'single' | 'line' | 'cross'; effect: 'curse' | 'wind' | 'thunder' | 'fire' | 'web' }
  | { shape: 'volley'; arrows: number; angle: number }
);

const MOVES = {
  pounce:     { shape: 'charge', range: 5.8, length: 7, width: 0.95, windup: 0.55, recovery: 0.95, power: 1, color: 0xff663d },
  curse:      { shape: 'zones', range: 11, radius: 2.2, layout: 'single', effect: 'curse', windup: 0.95, recovery: 1.45, power: 1, color: 0xed7dff },
  crush:      { shape: 'arc', range: 3.3, radius: 4.2, angle: 1.12, windup: 0.67, recovery: 0.9, power: 0.9, color: 0xff5938 },
  slam:       { shape: 'arc', range: 3.8, radius: 4.8, angle: Math.PI, windup: 0.9, recovery: 1.25, power: 1, color: 0xff8944 },
  quake:      { shape: 'arc', range: 5, radius: 6.2, angle: Math.PI, windup: 1.1, recovery: 1.45, power: 1.17, color: 0xff5938 },
  blade:      { shape: 'arc', range: 3.6, radius: 4.4, angle: 1.35, windup: 0.64, recovery: 0.85, power: 0.9, color: 0xff433e },
  bladeRush:  { shape: 'charge', range: 8, length: 9, width: 1.45, windup: 0.76, recovery: 1.05, power: 1.1, color: 0xff433e },
  whirlwind:  { shape: 'arc', range: 4.2, radius: 5.1, angle: Math.PI, windup: 0.88, recovery: 1.3, power: 1.12, color: 0xff433e },
  arrows:     { shape: 'volley', range: 15, arrows: 5, angle: 0.35, windup: 0.83, recovery: 0.95, power: 1, color: 0xa9f9cb },
  arrowStorm: { shape: 'volley', range: 15, arrows: 7, angle: 0.59, windup: 0.87, recovery: 1.05, power: 1.1, color: 0xa9f9cb },
  gust:       { shape: 'zones', range: 13, radius: 2.2, layout: 'line', effect: 'wind', windup: 1.05, recovery: 1.15, power: 1.15, color: 0xa9f9cb },
  thunder:    { shape: 'zones', range: 13, radius: 2, layout: 'line', effect: 'thunder', windup: 1.03, recovery: 1.05, power: 0.85, color: 0x9fbbff },
  storm:      { shape: 'zones', range: 14, radius: 2.25, layout: 'cross', effect: 'thunder', windup: 1.2, recovery: 1.3, power: 1.05, color: 0x9fbbff },
  hook:       { shape: 'arc', range: 3.6, radius: 4.45, angle: 1.06, windup: 0.78, recovery: 0.9, power: 0.8, pull: 1.55, color: 0xc6e4a7 },
  staffStrike: { shape: 'arc', range: 2.8, radius: 3.5, angle: 0.9, windup: 0.62, recovery: 0.8, power: 1, color: 0xffaf50 },
  fire:       { shape: 'zones', range: 12, radius: 2.35, layout: 'single', effect: 'fire', windup: 0.98, recovery: 1.38, power: 0.78, color: 0xff7530 },
  riposte:    { shape: 'arc', range: 3.0, radius: 3.75, angle: 0.58, windup: 0.88, recovery: 1.02, power: 1.10, parry: true, color: 0xe7c47a },
  rally:      { shape: 'arc', range: 8.5, radius: 7, angle: Math.PI, windup: 0.85, recovery: 1.45, power: 0, heal: 0.24, color: 0x8bdc7a },
  shadowCut:  { shape: 'arc', range: 3.35, radius: 4.0, angle: 1.45, windup: 0.57, recovery: 0.82, power: 1, color: 0xcaa2ff },
  shockwave:  { shape: 'arc', range: 5.9, radius: 7.25, innerRadius: 2.4, angle: Math.PI, windup: 1.03, recovery: 1.45, power: 1.06, color: 0x86d9ff },
  wolfPounce: { shape: 'charge', range: 4.4, length: 5.2, width: 0.69, duration: 0.29, windup: 0.56, recovery: 1.05, power: 1, color: 0xfecb8c },
  alphaPounce: { shape: 'charge', range: 5.7, length: 6.6, width: 0.92, duration: 0.34, windup: 0.64, recovery: 1.14, power: 1.08, color: 0xffb772 },
  bite:       { shape: 'arc', range: 1.8, radius: 2.65, angle: 0.86, windup: 0.49, recovery: 0.82, power: 0.92, color: 0xfecb8c },
  bearSwipe:  { shape: 'arc', range: 3.2, radius: 4.05, angle: 1.52, windup: 0.88, recovery: 1.1, power: 1, color: 0xf69a61 },
  bearRush:   { shape: 'charge', range: 6.5, length: 7.6, width: 1.22, duration: 0.53, windup: 0.97, recovery: 1.65, power: 1.12, color: 0xfa8e5b },
  boarRush:   { shape: 'charge', range: 7, length: 8.9, width: 0.77, duration: 0.48, windup: 0.8, recovery: 1.35, power: 1.08, color: 0xe5ac70 },
  web:        { shape: 'zones', range: 9.7, radius: 2.05, layout: 'single', effect: 'web', windup: 0.87, recovery: 1.12, power: 0.78, color: 0xd6bedf },
  scorpionSting: { shape: 'arc', range: 3.1, radius: 4.1, angle: 0.76, windup: 0.62, recovery: 0.88, power: 1.05, color: 0x7ef3ff },
  crystalShard:  { shape: 'wave', range: 9.5, length: 11.2, width: 1.05, windup: 0.78, recovery: 1.15, power: 0.90, color: 0x7ef3ff },
  crescent:   { shape: 'wave', range: 10.5, length: 12.2, width: 1.32, windup: 0.91, recovery: 1.32, power: 0.92, color: 0x9aeaff },
  eclipseSlash: { shape: 'arc', range: 5.4, radius: 6.6, angle: 1.78, windup: 0.96, recovery: 1.15, power: 1.24, color: 0xff2848 },
  cataclysm:  { shape: 'arc', range: 7.4, radius: 8.8, innerRadius: 2.3, angle: Math.PI, windup: 1.28, recovery: 1.55, power: 1.32, color: 0xff9438 }
} satisfies Record<string, Move>;
export type EnemyMove = keyof typeof MOVES;
export const moveDef = (id: EnemyMove): Move => MOVES[id];

export interface EnemyAttack {
  move: Move;
  origin: THREE.Vector3;
  target: THREE.Vector3;
  yaw: number;
  windup: number;
  zones: XZ[];
  length: number;
  hit: boolean;
  warning: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
}

// Project the filled warning and its brighter outline onto the ground, including slopes and bridges.
function groundWarning(outlines: XZ[][], color: number, innerRadiusRatio = 0) {
  const positions: number[] = [], colors: number[] = [];
  const fill = new THREE.Color(color), edge = fill.clone().lerp(new THREE.Color(0xfff4da), 0.42);
  const bands = innerRadiusRatio > 0 ? [0, 0.09, 0.11, 0.5, 0.88, 0.90, 1] : [0, 0.25, 0.5, 0.75, 0.88, 0.90, 1];
  for (const outline of outlines) {
    const center = { x: 0, z: 0 };
    for (const p of outline) { center.x += p.x / outline.length; center.z += p.z / outline.length; }
    const vertex = (point: XZ, fraction: number) => {
      const radial = THREE.MathUtils.lerp(innerRadiusRatio, 1, fraction);
      const x = THREE.MathUtils.lerp(center.x, point.x, radial), z = THREE.MathUtils.lerp(center.z, point.z, radial);
      positions.push(x, surfaceY(x, z) + 0.09, z);
      const rim = fraction >= 0.90 || (innerRadiusRatio > 0 && fraction <= 0.09), tint = rim ? edge : fill;
      colors.push(tint.r, tint.g, tint.b, rim ? 0.95 : 0.22);
    };
    for (let i = 0; i < outline.length; i++) {
      const a = outline[i], b = outline[(i + 1) % outline.length];
      for (let j = 1; j < bands.length; j++) {
        const inner = bands[j - 1], outer = bands[j];
        vertex(a, inner); vertex(a, outer); vertex(b, outer);
        vertex(a, inner); vertex(b, outer); vertex(b, inner);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 4));
  const mat = tagMat(new THREE.MeshBasicMaterial({
    vertexColors: true, transparent: true, opacity: 0.76, side: THREE.DoubleSide, fog: false, toneMapped: false,
    depthWrite: false
  }), CLS.fx);
  const mesh = new THREE.Mesh(geo, mat);
  scene.add(markCombatFx(mesh));
  return mesh;
}

function arcOutline(center: XZ, yaw: number, radius: number, angle: number) {
  const steps = Math.ceil(angle * 10), outline: XZ[] = [];
  const sector = angle < Math.PI;
  if (sector) outline.push(center);
  for (let i = 0; i < steps + Number(sector); i++) {
    const a = yaw - angle + i / steps * angle * 2;
    outline.push({ x: center.x + Math.sin(a) * radius, z: center.z + Math.cos(a) * radius });
  }
  return outline;
}

/** The first obstacle also stops the stripe, so a charge cannot cross a wall. */
export function chargeBlocked(en: Enemy, x: number, z: number) {
  const p = { x, z };
  collide(p, en.scale * 0.5);
  return Math.hypot(p.x - x, p.z - z) > 0.04;
}

export function prepareEnemyAttack(en: Enemy, move: Move, target: THREE.Vector3, yaw: number): EnemyAttack {
  const origin = en.g.position.clone(), fx = Math.sin(yaw), fz = Math.cos(yaw);
  const windup = move.windup * (en.phase === 3 ? 0.74 : en.enraged ? 0.86 : 1) * (en.camp.templeGuard ? 0.84 : 1);
  const zones: XZ[] = [];
  let outlines: XZ[][], length = 0;
  if (move.shape === 'charge' || move.shape === 'wave') {
    for (let d = 0.25; d <= move.length; d += 0.25) {
      if (chargeBlocked(en, origin.x + fx * d, origin.z + fz * d)) break;
      length = d;
    }
    const point = (d: number, s: number) => ({ x: origin.x + fx * d + fz * s, z: origin.z + fz * d - fx * s });
    const outline: XZ[] = [];
    const steps = Math.max(1, Math.ceil(length));
    for (let i = 0; i <= steps; i++) outline.push(point(i / steps * length, -move.width));
    for (let i = steps; i >= 0; i--) outline.push(point(i / steps * length, move.width));
    outlines = [outline];
  } else if (move.shape === 'zones') {
    zones.push({ x: target.x, z: target.z });
    const gap = move.radius * 1.75;
    if (move.layout !== 'single') {
      zones.push({ x: target.x + fz * gap, z: target.z - fx * gap }, { x: target.x - fz * gap, z: target.z + fx * gap });
    }
    if (move.layout === 'cross') {
      zones.push({ x: target.x + fx * gap, z: target.z + fz * gap }, { x: target.x - fx * gap, z: target.z - fz * gap });
    }
    outlines = zones.map(p => arcOutline(p, 0, move.radius, Math.PI));
  } else {
    outlines = [arcOutline(origin, yaw, move.shape === 'arc' ? move.radius : 4.5, move.angle)];
  }
  const innerRadiusRatio = move.shape === 'arc' ? (move.innerRadius ?? 0) / move.radius : 0;
  return { move, origin, target: target.clone(), yaw, windup, zones, length, hit: false, warning: groundWarning(outlines, move.color, innerRadiusRatio) };
}

export function removeEnemyWarning(warning: EnemyAttack['warning']) {
  scene.remove(warning);
  warning.geometry.dispose();
  warning.material.dispose();
}

export function clearEnemyAttack(en: Enemy) {
  if (!en.attack) return;
  removeEnemyWarning(en.attack.warning);
  en.attack = undefined;
}
