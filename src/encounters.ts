// Encounters in the open world: no waves. Oni guard camps scattered over the map (a few strong ones
// at the named places, many small ones in the wilds). A camp's oni only exist while you are near it;
// walk away and they vanish (keeping how many are left), clear it and it stays empty for a while.
// Also: starting a new run, and slow healing while nobody is fighting you.
import { scene } from './renderer';
import { enemies, spawnOni } from './enemies';
import { collide, isFree } from './physics';
import { WORLD_R, PLACES, RIVER, place, inLake, lineDist, groundAt, seeded } from './map';
import { resetScore, updateScore } from './score';
import { player, state } from './state';
import { rnd } from './utils';
import type { Camp } from './types';

const SPAWN_R = 70;       // oni appear when you come this close to their camp...
const DESPAWN_R = 110;    // ...and vanish beyond this (if they are not fighting you)
const RESPAWN = 240;      // seconds a cleared camp stays empty (and only while you are far away)
const SAFE_R = 75;        // no camps around the shrine you start at

export const camps: Camp[] = [];

function makeCamp(x: number, z: number, size: number, boss: boolean, r: number, name?: string): Camp {
  const tier = Math.min(1, Math.hypot(x, z) / WORLD_R);
  return { x, z, r, leash: r + 18, size, boss, tier, left: size, active: false, clearedAt: -1, name };
}
/** a spot fit for a camp: dry, inside the world, not on a building, away from the start and other camps */
function goodSpot(x: number, z: number, gap: number) {
  const d = Math.hypot(x, z);
  if (d < SAFE_R || d > WORLD_R - 25 || inLake(x, z, 8) || lineDist(x, z, RIVER) < 14) return false;
  const [, water, built] = groundAt(x, z);
  if (water > 60 || built > 60) return false;
  return camps.every(c => Math.hypot(c.x - x, c.z - z) > gap);
}
function buildCamps() {
  // guarded places: [place, oni, boss?]
  const guarded: [string, number, boolean][] = [
    ['castillo', 5, true], ['cementerio', 4, true], ['pagoda', 4, true], ['inari', 3, true],
    ['aldea', 3, false], ['campamento', 4, false], ['torii', 2, false]
  ];
  for (const [id, n, boss] of guarded) {
    const p = place(id);
    camps.push(makeCamp(p.x, p.z, n, boss, Math.min(22, p.r * 0.5), p.name));
  }
  // the wilds: small groups, bigger the further from the shrine
  const rand = seeded(1337);
  for (let tries = 0; camps.length < 75 && tries < 4000; tries++) {
    const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * WORLD_R;
    const x = Math.cos(a) * d, z = Math.sin(a) * d;
    if (!goodSpot(x, z, 85)) continue;
    const tier = d / WORLD_R, size = 1 + Math.floor(rand() * (1.5 + tier * 2.5));
    camps.push(makeCamp(x, z, size, tier > 0.55 && rand() < 0.12, 10 + size * 2));
  }
}

function activate(c: Camp) {
  c.active = true;
  for (let i = 0; i < c.left; i++) {
    let x = c.x, z = c.z;
    for (let k = 0; k < 12; k++) {   // a free spot around the camp's centre
      const a = Math.random() * Math.PI * 2, r = rnd(2, c.r * 0.7);
      x = c.x + Math.cos(a) * r; z = c.z + Math.sin(a) * r;
      if (isFree(x, z, 1) && !inLake(x, z, 2)) break;
    }
    const p = { x, z }; collide(p, 0.6);
    spawnOni(c, c.boss && i === 0, p.x, p.z);
  }
}
function deactivate(c: Camp) {
  c.active = false;
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].camp === c) { scene.remove(enemies[i].g); enemies.splice(i, 1); }
}

export function reset() {
  for (const e of enemies) scene.remove(e.g);
  enemies.length = 0;
  if (!camps.length) buildCamps();
  for (const c of camps) { c.active = false; c.left = c.size; c.clearedAt = -1; }
  Object.assign(player, { hp: 100, attackT: -1, combo: 0, dashT: 0, dashCd: 0, invuln: 1 });
  player.pos.set(0, 0, 4); state.yaw = 0; state.dead = false; state.lastHurt = -99;
  resetScore();
  discovered.clear(); discovered.add('claro');
}

/** places already visited this run (discovering one gives points: see minimap.ts) */
export const discovered = new Set<string>();
export const placeCount = PLACES.length;

let scan = 0;
export function updateEncounters(dt: number) {
  updateScore(dt);
  // which camps should have their oni out (checked a few times a second)
  if ((scan -= dt) <= 0) {
    scan = 0.25;
    for (const c of camps) {
      const d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      if (c.left <= 0 && c.clearedAt >= 0 && state.time - c.clearedAt > RESPAWN && d > DESPAWN_R) { c.left = c.size; c.clearedAt = -1; }
      if (!c.active && c.left > 0 && d < SPAWN_R) activate(c);
      else if (c.active && d > DESPAWN_R && !enemies.some(e => e.camp === c && e.state !== 'idle' && e.state !== 'return')) deactivate(c);
      else if (c.active && c.left <= 0) c.active = false;
    }
  }
  // heal slowly when nobody is fighting you and you have not been hit for a while
  const fighting = enemies.some(e => e.state === 'chase' || e.state === 'windup' || e.state === 'recover');
  if (!fighting && state.time - state.lastHurt > 5) player.hp = Math.min(100, player.hp + 4 * dt);
}

