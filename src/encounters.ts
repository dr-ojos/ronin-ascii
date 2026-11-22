// Encounters in the open world, no waves:
//  - camps: the strong ones at the named places, and many small ones in the wilds (landmarks.ts),
//  - patrols: small groups walking the roads back and forth,
//  - ambushes: now and then, out in the wilds, a group waiting a little ahead of you.
//  - guardians: a sub-boss (kensei, tengu, oni del trueno) standing by many of the hidden chests,
//    and by the fire of some camps of the wilds: their chest stays sealed while the guardian lives.
// A group's oni only exist while you are near it; walk away and they vanish (keeping who is left),
// clear a camp and it stays empty for a while. Also: starting a new run, and slow healing out of combat.
import { enemies, spawnOni, despawn, ELITES, isElite } from './enemies';
import { clearArrows } from './enemy-ai';
import { collide, isFree } from './physics';
import { WORLD_R, PLACES, ROADS, TORII_PATH, RIVER, place, inLake, lineDist, type P2 } from './map';
import { CAMP_SPOTS, HIDDEN_CHESTS, POIS } from './landmarks';
import { chests, makeChest, resetChests, updateLoot } from './loot';
import { resetScore, updateScore } from './score';
import { resetUpgrades } from './upgrades';
import { showMsg } from './hud';
import { sfx } from './sfx';
import { player, state } from './state';
import { rnd } from './utils';
import type { Camp, EnemyKind } from './types';

const SPAWN_R = 85;       // oni appear when you come this close to their group...
const DESPAWN_R = 130;    // ...and vanish beyond this (if they are not fighting you)
const RESPAWN = 240;      // seconds a cleared camp stays empty (and only while you are far away)
const SAFE_R = 75;        // nothing attacks you around the shrine you start at

export const camps: Camp[] = [];

/** who lives in a camp: weaker kinds near the shrine, archers and brutes further out */
function roster(size: number, tier: number, boss: boolean): EnemyKind[] {
  const pool: [EnemyKind, number][] = [['oni', 3], ['ashigaru', 1.5 + tier * 2], ['arquero', tier > 0.25 ? 1 + tier * 2 : 0], ['bruto', tier > 0.45 ? tier * 2.2 : 0]];
  const tot = pool.reduce((s, [, w]) => s + w, 0), out: EnemyKind[] = boss ? ['jefe'] : [];
  while (out.length < size) {
    let w = Math.random() * tot;
    for (const [k, kw] of pool) if ((w -= kw) < 0) { out.push(k); break; }
  }
  return out;
}
function makeCamp(x: number, z: number, kinds: EnemyKind[], r: number, extra: Partial<Camp> = {}): Camp {
  const tier = Math.min(1, Math.hypot(x, z) / WORLD_R);
  return { x, z, r, leash: r + 18, size: kinds.length, boss: kinds.includes('jefe'), elite: kinds.find(isElite), tier, kinds, roster: kinds.slice(), active: false, clearedAt: -1, ...extra };
}
/** which sub-boss guards a chest (the thunder oni only far from the shrine) */
const pickElite = (tier: number): EnemyKind => { const l = ELITES.filter(k => k !== 'raijin' || tier > 0.45); return l[Math.floor(Math.random() * l.length)]; };
const GUARD_MIN = SAFE_R + 45;   // no guardians this close to the shrine
/** a free spot for a chest near a place's centre */
function chestSpot(x: number, z: number, r0: number, r1: number): [number, number, number] {
  for (let k = 0; k < 40; k++) {
    const a = Math.random() * Math.PI * 2, d = rnd(r0, r1), cx = x + Math.cos(a) * d, cz = z + Math.sin(a) * d;
    if (isFree(cx, cz, 1.2) && !inLake(cx, cz, 2)) return [cx, cz, Math.atan2(x - cx, z - cz)];
  }
  return [x + r0, z, 0];
}

// polylines walked by patrols: arc length along them, and the point at a distance (ping-pong)
const routeLen = (pts: P2[]) => pts.reduce((s, p, i) => i ? s + Math.hypot(p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0, 0);
function routeAt(pts: P2[], len: number, t: number): P2 {
  let s = t % (2 * len); if (s > len) s = 2 * len - s;
  for (let i = 1; i < pts.length; i++) {
    const [ax, az] = pts[i - 1], [bx, bz] = pts[i], l = Math.hypot(bx - ax, bz - az);
    if (s <= l) { const k = l > 0 ? s / l : 0; return [ax + (bx - ax) * k, az + (bz - az) * k]; }
    s -= l;
  }
  return pts[pts.length - 1];
}
const lens = new Map<Camp, number>();

function buildCamps() {
  // guarded places: [place, roster]
  const guarded: [string, EnemyKind[]][] = [
    ['castillo', ['jefe', 'arquero', 'arquero', 'ashigaru', 'ashigaru', 'oni']],
    ['cementerio', ['jefe', 'oni', 'oni', 'oni', 'arquero']],
    ['pagoda', ['jefe', 'arquero', 'arquero', 'ashigaru']],
    ['inari', ['jefe', 'bruto', 'arquero']],
    ['aldea', ['oni', 'oni', 'ashigaru', 'ashigaru']],
    ['campamento', ['ashigaru', 'ashigaru', 'ashigaru', 'arquero', 'bruto']],
    ['torii', ['arquero', 'arquero', 'ashigaru']]
  ];
  for (const [id, kinds] of guarded) {
    const p = place(id), r = Math.min(24, p.r * 0.5), c = makeCamp(p.x, p.z, kinds, r, { name: p.name });
    const [cx, cz, ry] = chestSpot(p.x, p.z, 4, r * 0.8);
    c.chest = makeChest(cx, cz, ry, c.boss ? 'jefe' : 'guarida', c.tier, true);
    camps.push(c);
  }
  // the camps of the wilds, with their chest by the fire
  // (a third of the ones further out also have a guardian by the chest)
  for (const s of CAMP_SPOTS) {
    const kinds = roster(s.size, s.tier, s.boss);
    if (!s.boss && s.tier > 0.3 && Math.hypot(s.x, s.z) > GUARD_MIN && Math.random() < 0.33) kinds.push(pickElite(s.tier));
    const c = makeCamp(s.x, s.z, kinds, s.r);
    c.chest = makeChest(s.chest[0], s.chest[1], s.chest[2], c.boss ? 'jefe' : c.elite ? 'guardian' : 'guarida', s.tier, true);
    camps.push(c);
  }
  // patrols along the roads (two on the long ones)
  for (const road of ROADS) {
    if (road === TORII_PATH) continue;
    const len = routeLen(road.pts);
    for (let k = 0; k < (len > 260 ? 2 : 1); k++) {
      const t0 = Math.random() * len * 2, [x, z] = routeAt(road.pts, len, t0);
      const tier = Math.min(1, Math.hypot(x, z) / WORLD_R);
      const c = makeCamp(x, z, roster(2 + Math.floor(Math.random() * 2), Math.max(0.3, tier), false), 6, { route: road.pts, routeT: t0 });
      lens.set(c, len); camps.push(c);
    }
  }
  // hidden chests: half of those out in the wilds have a guardian (with an escort, far out)
  for (const [x, z, ry] of HIDDEN_CHESTS) {
    const tier = Math.min(1, Math.hypot(x, z) / WORLD_R);
    if (Math.hypot(x, z) < GUARD_MIN || Math.random() > 0.5) { makeChest(x, z, ry, 'oculto', tier, false); continue; }
    const escort = tier > 0.7 ? 2 : tier > 0.45 ? 1 : 0;
    const c = makeCamp(x, z, [pickElite(tier), ...roster(escort, tier, false)], 8);
    c.chest = makeChest(x, z, ry, 'guardian', tier, true);
    camps.push(c);
  }
}

function activate(c: Camp) {
  c.active = true;
  for (const kind of c.roster) {
    // a free spot around the camp's centre (a guardian: right beside its chest)
    const guard = isElite(kind) && c.chest, ox = guard ? c.chest!.x : c.x, oz = guard ? c.chest!.z : c.z;
    let x = ox, z = oz;
    for (let k = 0; k < 12; k++) {
      const a = Math.random() * Math.PI * 2, r = guard ? rnd(1.6, 2.6) : kind === 'jefe' ? rnd(0, 3) : rnd(2.5, c.r * 0.7);
      x = ox + Math.cos(a) * r; z = oz + Math.sin(a) * r;
      if (isFree(x, z, 1) && !inLake(x, z, 2)) break;
    }
    const p = { x, z }; collide(p, 0.6);
    spawnOni(c, kind, p.x, p.z);
  }
}
function deactivate(c: Camp) {
  c.active = false;
  for (let i = enemies.length - 1; i >= 0; i--) if (enemies[i].camp === c) { despawn(enemies[i]); enemies.splice(i, 1); }
  if (c.temp) camps.splice(camps.indexOf(c), 1);
}

/** places and corners already visited this run (discovering one gives points: see minimap.ts) */
export const discovered = new Set<string>();
export const placeCount = () => PLACES.length + POIS.length;

export function reset() {
  for (const e of enemies) despawn(e);
  enemies.length = 0; clearArrows();
  if (!camps.length) buildCamps();
  for (let i = camps.length - 1; i >= 0; i--) if (camps[i].temp) camps.splice(i, 1);
  for (const c of camps) { c.active = false; c.roster = c.kinds.slice(); c.clearedAt = -1; }
  resetChests(); resetUpgrades();
  Object.assign(player, { hp: 100, maxHp: 100, attackT: -1, combo: 0, dashT: 0, dashCd: 0, invuln: 1 });
  player.pos.set(0, 0, 4); state.yaw = 0; state.dead = false; state.lastHurt = -99; state.chests = 0; state.special = 0;
  resetScore();
  discovered.clear(); discovered.add('claro');
  ambushT = rnd(35, 60);
}

// ------------------------------------------------------------ ambushes
let ambushT = 40;
function tryAmbush() {
  const px = player.pos.x, pz = player.pos.z, d0 = Math.hypot(px, pz);
  if (d0 < SAFE_R + 40 || player.moving < 0.5) return false;
  if (camps.some(c => c.roster.length && Math.hypot(c.x - px, c.z - pz) < 45)) return false;   // there is a camp around already
  if (PLACES.some(p => p.flat > 0 && Math.hypot(p.x - px, p.z - pz) < p.r + 20)) return false;
  // a little ahead of where you are heading, off to one side
  const a = player.face + rnd(-0.7, 0.7), dist = rnd(26, 34), x = px + Math.sin(a) * dist, z = pz + Math.cos(a) * dist;
  if (Math.hypot(x, z) > WORLD_R - 20 || inLake(x, z, 4) || lineDist(x, z, RIVER) < 8) return false;
  const tier = Math.min(1, Math.hypot(x, z) / WORLD_R);
  const c = makeCamp(x, z, roster(2 + Math.floor(Math.random() * (1 + tier * 2)), tier, false), 8, { temp: true });
  camps.push(c); activate(c);
  if (Math.random() < 0.5) {   // half of them have already seen you
    for (const e of enemies) if (e.camp === c) e.state = 'chase';
    sfx.roar({}); showMsg('¡ EMBOSCADA !', 1.4);
  }
  return true;
}

let scan = 0;
export function updateEncounters(dt: number) {
  updateScore(dt);
  updateLoot(dt);
  // patrols walk their road while calm (their oni follow their moving home)
  for (const c of camps) if (c.route) {
    const calm = !c.active || enemies.every(e => e.camp !== c || e.state === 'idle');
    if (!calm) continue;
    c.routeT! += dt * 1.3;
    const [x, z] = routeAt(c.route, lens.get(c)!, c.routeT!); c.x = x; c.z = z;
    if (c.active) for (const e of enemies) if (e.camp === c) { e.wander.x = x + Math.sin(e.seed) * 2.5; e.wander.z = z + Math.cos(e.seed) * 2.5; e.t = Math.min(e.t, 0); }
  }
  // which groups should have their oni out (checked a few times a second)
  if ((scan -= dt) <= 0) {
    scan = 0.25;
    for (let i = camps.length - 1; i >= 0; i--) {
      const c = camps[i], d = Math.hypot(player.pos.x - c.x, player.pos.z - c.z);
      const busy = enemies.some(e => e.camp === c && e.state !== 'idle' && e.state !== 'return');
      if (!c.roster.length) {
        if (c.active) c.active = false;
        if (c.temp) { camps.splice(i, 1); continue; }
        if (c.clearedAt >= 0 && state.time - c.clearedAt > RESPAWN && d > DESPAWN_R) { c.roster = c.kinds.slice(); c.clearedAt = -1; }
      } else if (!c.active && d < SPAWN_R && Math.hypot(c.x, c.z) > SAFE_R) activate(c);
      else if (c.active && d > DESPAWN_R && !busy) deactivate(c);
    }
    // nothing around for a while? an ambush
    const fighting = enemies.some(e => e.state !== 'idle' && e.state !== 'return');
    if (!fighting && (ambushT -= 0.25) <= 0) ambushT = tryAmbush() ? rnd(60, 110) : rnd(4, 8);
  }
  // heal slowly when nobody is fighting you and you have not been hit for a while
  const fighting = enemies.some(e => e.state === 'chase' || e.state === 'windup' || e.state === 'recover');
  if (!fighting && state.time - state.lastHurt > 5) player.hp = Math.min(player.maxHp, player.hp + 4 * dt);
}

/** chests nobody has opened yet (for the HUD) */
export const chestsLeft = () => chests.filter(c => c.state !== 'open').length;
