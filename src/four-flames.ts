import * as THREE from 'three';
import { provoke, staggerEnemy } from './enemy-ai';
import { enemies } from './enemies';
import { burst } from './fx';
import { CLS, tagMat } from './materials';
import { scene } from './renderer';
import { panOf, sfx } from './sfx';
import { player, state } from './state';
import { surfaceY } from './structures';
import { TECHNIQUES } from './techniques';
import type { Enemy } from './types';
import { dmgMult } from './upgrades';
import { specialDamage } from './special-damage';

const RANGE = 14;
const WINDUP = 0.32, FADE = 0.31;
const BURN_TICKS = 4, TICK_TIME = 0.6;
const HIT_DAMAGE = 2.5, BURN_DAMAGE = 1.6;
const FIRE = TECHNIQUES.cuatroLlamas.color, GOLD = 0xffd089;

const blade = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.bezierCurveTo(-0.3, -0.9, 0.15, -2.7, 0.82, -4.2);
  shape.bezierCurveTo(0.76, -2.8, 1.3, -1, 0, 0);
  return new THREE.ShapeGeometry(shape, 24).rotateX(Math.PI / 2);
})();

function fireMaterial(color: number) {
  return tagMat(new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false,
    side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }), CLS.fx);
}

interface Flame { target?: Enemy; point: THREE.Vector3; angle: number; visual: THREE.Group }
interface Cast {
  group: THREE.Group;
  flames: Flame[];
  outer: THREE.MeshBasicMaterial;
  core: THREE.MeshBasicMaterial;
  time: number;
  force: number;
}
const casts: Cast[] = [];
const burning = new Map<Enemy, { ticks: number; remaining: number; damage: number }>();

function drawFlames(cast: Cast) {
  const travel = THREE.MathUtils.smoothstep(cast.time, 0, WINDUP), fade = 1 - Math.max(0, cast.time - WINDUP) / FADE;
  cast.outer.opacity = 0.78 * fade;
  cast.core.opacity = 0.94 * fade;
  for (const { point, angle, visual } of cast.flames) {
    const offset = 5.6 * (1 - travel);
    visual.position.set(point.x - Math.sin(angle) * offset, point.y + 1.95 * (1 - travel), point.z - Math.cos(angle) * offset);
    visual.rotation.set(-0.26 + travel * 0.2, angle, 0.6, 'YXZ');
    visual.scale.setScalar(0.8 + travel * 0.45);
  }
}

export function startFourFlames() {
  const nearest = enemies.flatMap(enemy => {
    const p = enemy.g.position, distance = Math.hypot(p.x - player.pos.x, p.z - player.pos.z);
    return distance <= RANGE && enemy.hp > 0 ? [{ enemy, distance }] : [];
  }).sort((a, b) => a.distance - b.distance).slice(0, 4);
  const forwardX = Math.sin(player.face), forwardZ = Math.cos(player.face);
  const x = player.pos.x + forwardX * 5, z = player.pos.z + forwardZ * 5;
  const group = new THREE.Group(); group.name = TECHNIQUES.cuatroLlamas.name;
  const outer = fireMaterial(FIRE), core = fireMaterial(GOLD);
  const cast: Cast = { group, flames: [], outer, core, time: 0, force: dmgMult() };
  for (let i = 0; i < 4; i++) {
    const target = nearest[nearest.length >= 3 ? i % nearest.length : 0]?.enemy;
    const point = target ? target.g.position.clone().add(new THREE.Vector3(0, target.scale * 0.95, 0))
      : new THREE.Vector3(x, surfaceY(x, z) + 0.8, z);
    const visual = new THREE.Group(); group.add(visual);
    const trail = new THREE.Mesh(blade, outer); trail.scale.set(1.4, 1, 1.2); visual.add(trail);
    const edge = new THREE.Mesh(blade, core); edge.scale.set(0.56, 1, 0.95); edge.position.y = 0.025; visual.add(edge);
    cast.flames.push({ target, point, angle: player.face + (i + 0.5) * Math.PI / 2, visual });
  }
  if (nearest.length) {
    const aim = nearest[0].enemy.g.position;
    player.face = Math.atan2(aim.x - player.pos.x, aim.z - player.pos.z);
  }
  drawFlames(cast); casts.push(cast); scene.add(group);
  sfx.swing({ power: 1.35, pan: 0 });
}

function ignite(cast: Cast) {
  const strikes = new Map<Enemy, number>();
  for (const flame of cast.flames) {
    const { target, point } = flame;
    if (target && enemies.includes(target) && target.hp > 0) strikes.set(target, (strikes.get(target) ?? 0) + 1);
    burst(point, FIRE, 28, 5.5, 0.18);
    burst(point, GOLD, 12, 4, 0.13);
  }
  for (const [enemy, hits] of strikes) {
    specialDamage(enemy, hits * HIT_DAMAGE * cast.force);
    enemy.flash = 1;
    provoke(enemy);
    if (enemy.state !== 'return') staggerEnemy(enemy, 0.85);
    if (enemy.hp > 0) burning.set(enemy, { ticks: BURN_TICKS, remaining: TICK_TIME, damage: BURN_DAMAGE * cast.force });
    const p = enemy.g.position;
    sfx.hit({ heavy: true, pan: panOf(p.x, p.z), count: hits });
  }
  if (strikes.size) state.shake = Math.max(state.shake, 0.55);
}

function removeCast(cast: Cast) {
  scene.remove(cast.group); cast.outer.dispose(); cast.core.dispose();
}

export function updateFourFlames(dt: number) {
  for (const [enemy, burn] of burning) {
    if (!enemies.includes(enemy) || enemy.hp <= 0) { burning.delete(enemy); continue; }
    burn.remaining -= dt;
    while (burn.remaining <= 0 && burn.ticks > 0 && enemy.hp > 0) {
      burn.remaining += TICK_TIME; burn.ticks--; specialDamage(enemy, burn.damage);
      enemy.flash = Math.max(0.45, enemy.flash);
      const p = enemy.g.position.clone().add(new THREE.Vector3(0, enemy.scale * 0.7, 0));
      burst(p, FIRE, 18, 3, 0.13);
    }
    if (burn.ticks === 0 || enemy.hp <= 0) burning.delete(enemy);
  }
  for (let i = casts.length - 1; i >= 0; i--) {
    const cast = casts[i], before = cast.time;
    cast.time += dt;
    if (before < WINDUP) {
      for (const { target, point } of cast.flames) {
        if (target && enemies.includes(target) && target.hp > 0) {
          point.copy(target.g.position); point.y += target.scale * 0.95;
        }
      }
      if (cast.time >= WINDUP) ignite(cast);
    }
    if (cast.time >= WINDUP + FADE) { removeCast(cast); casts.splice(i, 1); continue; }
    drawFlames(cast);
  }
}

export function clearFourFlames() {
  burning.clear();
  for (const cast of casts) removeCast(cast);
  casts.length = 0;
}
