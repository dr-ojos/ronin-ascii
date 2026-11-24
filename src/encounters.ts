// Encounters in the open world, no waves:
//  - camps: the strong ones at the named places, and many small ones in the wilds (landmarks.ts),
//  - patrols: small groups walking the roads back and forth,
//  - ambushes: now and then, out in the wilds, a group waiting a little ahead of you.
//  - temple guardians: a boss in the courtyard of the Templo del Rayo; beat it to earn the lightning.
//  - guardians: a sub-boss (kensei, tengu, oni del trueno) standing by many of the hidden chests,
//    and by the fire of some camps of the wilds: their chest stays sealed while the guardian lives.
// A group's oni only exist while you are near it; walk away and they vanish (keeping who is left),
// clear a camp and it stays empty for a while. Also: starting a new run, and slow healing out of combat.
import { enemies, spawnEnemy, despawn, ELITES, isBoss, isElite } from './enemies';
import { clearEnemyHazards } from './enemy-ai';
import { collide, isFree } from './physics';
import { WORLD_R, PLACES, ROADS, TEMPLES, TEMPLE_PATHS, TORII_PATH, RIVER, place, inLake, lineDist, type P2 } from './map';
import { toWorld } from './structures';
import { CAMP_SPOTS, HIDDEN_CHESTS, POIS, WILDLIFE_SPOTS } from './landmarks';
import { chests, makeChest, resetChests, updateLoot } from './loot';
import { resetScore, updateScore } from './score';
import { resetUpgrades } from './upgrades';
import { equipmentThreat } from './equipment-threat';
import { showMsg } from './hud';
import { sfx } from './sfx';
import { resetSpecial } from './special';
import { player, state } from './state';
import { rnd } from './utils';
import type { Camp, EnemyKind } from './types';

const SPAWN_R = 85;       // oni appear when you come this close to their group...
const DESPAWN_R = 130;    // ...and vanish beyond this (if they are not fighting you)
const RESPAWN = 240;      // seconds a cleared camp stays empty (and only while you are far away)
const SAFE_R = 75;        // nothing attacks you around the shrine you start at

export const camps: Camp[] = [];

/** who lives in a camp: specialists become more frequent further from the shrine */
function roster(size: number, tier: number, boss: boolean): EnemyKind[] {
  const pool: [EnemyKind, number][] = [
    ['oni', 3], ['ashigaru', 1.5 + tier * 2], ['arquero', tier > 0.25 ? 1 + tier * 2 : 0],
    ['bruto', tier > 0.45 ? tier * 2.2 : 0], ['escudero', tier > 0.2 ? 0.9 + tier : 0],
    ['acechador', tier > 0.27 ? 1.7 * tier + 0.4 : 0], ['hechicero', tier > 0.42 ? 1.5 * tier + 0.3 : 0],
    ['guadanero', tier > 0.19 ? 1 + tier : 0], ['piromante', tier > 0.36 ? 0.65 + tier : 0],
    ['espectro', tier > 0.51 ? tier * 1.5 : 0]
  ];
  const tot = pool.reduce((s, [, w]) => s + w, 0), out: EnemyKind[] = boss ? ['jefe'] : [];
  while (out.length < size) {
    let w = Math.random() * tot;
    for (const [k, kw] of pool) if ((w -= kw) < 0) { out.push(k); break; }
  }
  return out;
}

const REINFORCEMENTS: { kind: EnemyKind; rank: number; tier: number }[] = [
  { kind: 'duelista', rank: 1, tier: 0 },
  { kind: 'tambor', rank: 2, tier: 0.24 },
  { kind: 'sombra', rank: 2, tier: 0.2 },
  { kind: 'coloso', rank: 3, tier: 0.46 }
];

function prepareRoster(c: Camp) {
  const threat = equipmentThreat(), previous = c.threat;
  // A squad that has taken casualties keeps its survivors and stats until it is cleared.
  if (previous && c.roster.length !== c.size) return;
  c.threat = threat;
  if (previous?.rank === threat.rank || threat.rank === 0) return;

  c.roster = c.kinds.slice();
  if (c.wildlife) {
    if (c.wildlife === 'lobos' && threat.rank >= 2 && !c.roster.includes('loboAlfa')) c.roster[0] = 'loboAlfa';
    return;
  }
  const slots = c.roster.flatMap((kind, i) => kind === c.boss || kind === c.elite ? [] : [i]);
  const pool = REINFORCEMENTS.filter(foe => foe.rank <= threat.rank && foe.tier <= c.tier && (foe.kind !== 'tambor' || c.size > 1));
  const count = threat.rank >= 2 && slots.length >= 3 ? 2 : 1;
  for (let n = 0; n < count && slots.length && pool.length; n++) {
    const chance = n === 0 ? 0.32 + threat.rank * 0.19 : 0.28 + (threat.rank - 2) * 0.22;
    if (Math.random() >= chance) break;
    const topRank = pool[pool.length - 1].rank;
    const choices = Math.random() < 0.55 ? pool.filter(foe => foe.rank === topRank) : pool;
    const foe = choices[Math.floor(Math.random() * choices.length)];
    const [slot] = slots.splice(Math.floor(Math.random() * slots.length), 1);
    c.roster[slot] = foe.kind;
    pool.splice(pool.indexOf(foe), 1);
  }
}
function makeCamp(x: number, z: number, kinds: EnemyKind[], r: number, extra: Partial<Camp> = {}): Camp {
  const tier = Math.min(1, Math.hypot(x, z) / WORLD_R);
  return { x, z, r, leash: r + 18, size: kinds.length, boss: kinds.find(isBoss), elite: kinds.find(isElite), tier, kinds, roster: kinds.slice(), active: false, clearedAt: -1, ...extra };
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
  // Offset bosses into their courtyards so they have room to move and telegraph their attacks.
  const guarded: [string, EnemyKind[], P2?][] = [
    ['castillo', ['kuro', 'escudero', 'escudero', 'ashigaru', 'arquero', 'oni'], [0, 25]],
    ['cementerio', ['jefe', 'hechicero', 'espectro', 'oni', 'acechador']],
    ['pagoda', ['tenguMayor', 'arquero', 'acechador', 'ashigaru'], [0, 13]],
    ['inari', ['raijinMayor', 'bruto', 'ashigaru'], [-2, -10]],
    ['aldea', ['oni', 'guadanero', 'ashigaru', 'escudero']],
    ['campamento', ['ashigaru', 'acechador', 'escudero', 'arquero', 'bruto']],
    ['torii', ['acechador', 'piromante', 'ashigaru']]
  ];
  for (const [id, kinds, [dx, dz] = [0, 0]] of guarded) {
    const p = place(id), r = Math.min(24, p.r * 0.5), c = makeCamp(p.x + dx, p.z + dz, kinds, r, { name: p.name });
    const [cx, cz, ry] = chestSpot(c.x, c.z, 4, r * 0.8);
    c.chest = makeChest(cx, cz, ry, c.boss ? 'jefe' : 'guarida', c.tier, true);
    camps.push(c);
  }
  // the camps of the wilds, with their chest by the fire
  // (a third of the ones further out also have a guardian by the chest)
  for (const s of CAMP_SPOTS) {
    const kinds = roster(s.size + 1, s.tier, s.boss);   // one more oni than the camp was laid out for
    if (!s.boss && s.tier > 0.3 && Math.hypot(s.x, s.z) > GUARD_MIN && Math.random() < 0.33) kinds.push(pickElite(s.tier));
    const c = makeCamp(s.x, s.z, kinds, s.r);
    c.chest = makeChest(s.chest[0], s.chest[1], s.chest[2], c.boss ? 'jefe' : c.elite ? 'guardian' : 'guarida', s.tier, true);
    camps.push(c);
  }
  // patrols along the roads (two on the long ones)
  for (const road of ROADS) {
    if (road === TORII_PATH || TEMPLE_PATHS.includes(road)) continue;
    const len = routeLen(road.pts);
    for (let k = 0; k < (len > 260 ? 2 : 1); k++) {
      const t0 = Math.random() * len * 2, [x, z] = routeAt(road.pts, len, t0);
      const tier = Math.min(1, Math.hypot(x, z) / WORLD_R);
      const c = makeCamp(x, z, roster(3 + Math.floor(Math.random() * 2), Math.max(0.3, tier), false), 6, { route: road.pts, routeT: t0 });
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
  // a temple whose technique is won in battle: its guardian waits in the courtyard, between master and torii
  for (const t of TEMPLES) if (t.guardian) {
    const [x, z] = toWorld(t.x, t.z, t.facing, 0, 14);
    camps.push(makeCamp(x, z, [t.guardian], 9, { name: t.name, technique: t.technique }));
  }
  for (const { x, z, r, wildlife } of WILDLIFE_SPOTS) {
    let kinds: EnemyKind[];
    if (wildlife === 'lobos') {
      const far = Math.hypot(x, z) > WORLD_R * 0.42;
      kinds = Array.from({ length: far ? 5 : 3 + Math.floor(Math.random() * 2) }, (_, i) => far && i === 0 ? 'loboAlfa' : 'lobo');
    } else if (wildlife === 'oso') kinds = ['oso'];
    else if (wildlife === 'jabalies') kinds = Math.random() < 0.65 ? ['jabali', 'jabali'] : ['jabali', 'jabali', 'jabali'];
    else kinds = ['arana', 'arana'];
    camps.push(makeCamp(x, z, kinds, r, { wildlife }));
  }
}

function activate(c: Camp) {
  prepareRoster(c);
  c.active = true;
  const orientation = c.wildlife ? Math.random() * Math.PI * 2 : 0;
  for (const [index, kind] of c.roster.entries()) {
    // a free spot around the camp's centre (a guardian: right beside its chest)
    const guard = isElite(kind) && c.chest, ox = guard ? c.chest!.x : c.x, oz = guard ? c.chest!.z : c.z;
    let x = ox, z = oz;
    for (let k = 0; k < 12; k++) {
      const a = c.wildlife ? orientation + index / c.roster.length * Math.PI * 2 + rnd(-0.32, 0.32) * k : Math.random() * Math.PI * 2;
      const r = guard ? rnd(1.6, 2.6) : kind === c.boss ? rnd(0, 3) : rnd(2.5, c.r * 0.7);
      x = ox + Math.cos(a) * r; z = oz + Math.sin(a) * r;
      if (isFree(x, z, 1) && !inLake(x, z, 2)) break;
    }
    const p = { x, z }; collide(p, 0.6);
    spawnEnemy(c, kind, p.x, p.z);
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
  enemies.length = 0; clearEnemyHazards();
  if (!camps.length) buildCamps();
  for (let i = camps.length - 1; i >= 0; i--) if (camps[i].temp) camps.splice(i, 1);
  for (const c of camps) { c.active = false; c.roster = c.kinds.slice(); c.threat = undefined; c.clearedAt = -1; }
  resetChests(); resetUpgrades();
  Object.assign(player, { hp: 100, maxHp: 100, attackT: -1, combo: 0, dashT: 0, dashCd: 0, invuln: 1, snareT: 0 });
  player.pos.set(0, 0, 4); state.yaw = 0; state.dead = false; state.lastHurt = -99; state.chests = 0;
  resetSpecial();
  resetScore();
  discovered.clear(); discovered.add('claro');
  ambushT = rnd(25, 45);
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
  const c = makeCamp(x, z, roster(3 + Math.floor(Math.random() * (1 + tier * 2)), tier, false), 8, { temp: true });
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
        const won = c.technique && state.learnedTechniques.includes(c.technique);   // a beaten temple guardian stays beaten
        if (c.clearedAt >= 0 && state.time - c.clearedAt > RESPAWN && d > DESPAWN_R && !won) {
          c.roster = c.kinds.slice(); c.threat = undefined; c.clearedAt = -1;
        }
      } else if (!c.active && d < SPAWN_R && Math.hypot(c.x, c.z) > SAFE_R) activate(c);
      else if (c.active && d > DESPAWN_R && !busy) deactivate(c);
    }
    // nothing around for a while? an ambush
    const fighting = enemies.some(e => e.state !== 'idle' && e.state !== 'return');
    if (!fighting && (ambushT -= 0.25) <= 0) ambushT = tryAmbush() ? rnd(40, 75) : rnd(4, 8);
  }
  // heal slowly when nobody is fighting you and you have not been hit for a while
  const fighting = enemies.some(e => e.state !== 'idle' && e.state !== 'return');
  if (!fighting && state.time - state.lastHurt > 5) player.hp = Math.min(player.maxHp, player.hp + 4 * dt);
}

/** chests nobody has opened yet (for the HUD) */
export const chestsLeft = () => chests.filter(c => c.state !== 'open').length;
