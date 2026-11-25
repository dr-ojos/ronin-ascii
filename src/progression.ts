// Experience and levels, 1 to 100. Every point earned in battle or by exploring is also experience (score.ts);
// each level costs more than the last (xpToNext). A level brings points to spend on attributes or on the rank
// of a technique (the U menu, level-menu.ts, and the inventory), mon for the purse, a jade seal every ten levels, and at set levels a passive skill (PERKS) or
// the right to buy a legendary blade or armour from Masa (LEVEL_REQ, shop.ts).
//
// Unlike the gear of a run, the level is kept: one profile per class, saved in the browser. The oni of the world
// grow a little with it (foeHp / foeDmg), so the ronin of level 80 still has to fight.
//
// This module only keeps the numbers; level-fx.ts draws the celebration and the rest of the game reads the
// helpers below (upgrades.ts, special.ts, special-damage.ts, player.ts, damage.ts, score.ts).
import { player, state } from './state';
import { cls } from './classes';
import type { ClassId } from './classes';
import { TECHNIQUES, type TechniqueId } from './techniques';

export const MAX_LEVEL = 100;
/** experience from `level` to the next: steep, so the last levels are a long road */
export const xpToNext = (level: number) => level >= MAX_LEVEL ? Infinity : Math.round((300 + 220 * Math.pow(level, 1.7)) / 10) * 10;
/** experience from level 1 to `level` */
export function xpForLevel(level: number) { let s = 0; for (let l = 1; l < level; l++) s += xpToNext(l); return s; }
export const isMilestone = (level: number) => level % 10 === 0;
/** points the climb to `level` has given (for attributes and technique ranks): 2 a level, 3 more every ten */
export const pointsAt = (level: number) => 2 * (level - 1) + 3 * Math.floor(level / 10);

// ------------------------------------------------------------ attributes
export type StatId = 'vigor' | 'fuerza' | 'agilidad' | 'temple' | 'espiritu' | 'fortuna';
export const STAT_CAP = 50;
/** max life per point of vigour: kept small so life grows slowly with the level */
const VIGOR_HP = 2;
const LEGEND_HP = 25;
export const STATS: Record<StatId, { name: string; kanji: string; per: string; effect(n: number): string }> = {
  vigor:    { name: 'Vigor',    kanji: '体', per: '+2 vida máxima',
    effect: n => `vida máxima +${n * VIGOR_HP}` },
  fuerza:   { name: 'Fuerza',   kanji: '力', per: '+2 % de daño',
    effect: n => `daño +${n * 2} %` },
  agilidad: { name: 'Agilidad', kanji: '速', per: '+0,4 % velocidad · esquiva 0,8 % antes',
    effect: n => `velocidad +${pct(n * 0.4)} % · esquiva ${pct(n * 0.8)} % antes` },
  temple:   { name: 'Temple',   kanji: '鋼', per: '−0,6 % de daño recibido',
    effect: n => `daño recibido −${pct(n * 0.6)} %` },
  espiritu: { name: 'Espíritu', kanji: '気', per: '+2 % de carga · +1,5 % daño de técnica',
    effect: n => `técnica: carga +${n * 2} % · daño +${pct(n * 1.5)} %` },
  fortuna:  { name: 'Fortuna',  kanji: '運', per: '+2 % mon · +1 % XP · +0,3 % crítico',
    effect: n => `mon +${n * 2} % · XP +${n} % · crítico +${pct(n * 0.3)} %` }
};
export const STAT_IDS = Object.keys(STATS) as StatId[];
const pct = (v: number) => (Math.round(v * 10) / 10).toString().replace('.', ',');

// ------------------------------------------------------------ passive skills
export type PerkId = 'pies' | 'halcon' | 'sed' | 'meditacion' | 'aliento' | 'tigre' | 'aura' | 'dragon' | 'acero' | 'despertar' | 'leyenda';
export interface Perk { id: PerkId; level: number; name: string; desc: string }
export const PERKS: Perk[] = [
  { id: 'pies',       level: 5,   name: 'Pies ligeros',     desc: 'la esquiva se recupera un 12 % antes' },
  { id: 'halcon',     level: 10,  name: 'Ojo del halcón',   desc: '+8 % de probabilidad de golpe crítico' },
  { id: 'sed',        level: 15,  name: 'Sed de batalla',   desc: 'cada baja te cura 3 de vida' },
  { id: 'meditacion', level: 20,  name: 'Meditación',       desc: 'la técnica se carga un 25 % más rápido' },
  { id: 'aliento',    level: 25,  name: 'Segundo aliento',  desc: 'sobrevives a un golpe mortal (una vez cada 3 min)' },
  { id: 'tigre',      level: 35,  name: 'Racha del tigre',  desc: 'la racha dura 2 s más y llega hasta x6' },
  { id: 'aura',       level: 50,  name: 'Aura del maestro', desc: 'recuperas 0,8 de vida por segundo, incluso en combate' },
  { id: 'dragon',     level: 65,  name: 'Golpe del dragón', desc: 'los críticos hacen x2,5 en lugar de x1,75' },
  { id: 'acero',      level: 80,  name: 'Piel de acero',    desc: '−12 % de daño recibido' },
  { id: 'despertar',  level: 90,  name: 'Despertar',        desc: 'empiezas cada partida con la técnica cargada' },
  { id: 'leyenda',    level: 100, name: 'Leyenda viva',     desc: '+15 % de daño, +25 de vida máxima y un aura dorada' }
];

/** Masa only sells these to whoever has the level (weapons.ts / armor.ts ids) */
export const LEVEL_REQ: Record<string, number> = {
  // armour
  oyoroi: 12, tsukuyomi: 15, neon: 20, hachiman: 25, kurogane: 30,
  // the masters' blades
  susanoo: 15, 'gemelas-ocaso': 15, masamune: 25, 'espada-montana': 25, bishamon: 25, aurora: 30, guandao: 25, sainggeom: 25,
  // legendary: only by level
  kusanagi: 40, kongo: 40, 'ame-nuboko': 55, 'hoo-tsubasa': 70, jizo: 70, tenrai: 85, mugen: 100, fudo: 100
};
export const levelReq = (id: string) => LEVEL_REQ[id] ?? 0;
export const levelOk = (id: string) => prof.level >= levelReq(id);

// ------------------------------------------------------------ the profile (one per class, kept in the browser)
interface Profile {
  level: number; xp: number; total: number; stats: Record<StatId, number>;
  /** technique ranks bought with points (rank 1, the one a technique is learnt at, is not stored) */
  ranks: Partial<Record<TechniqueId, number>>;
}
const blank = (): Profile => ({ level: 1, xp: 0, total: 0, stats: { vigor: 0, fuerza: 0, agilidad: 0, temple: 0, espiritu: 0, fortuna: 0 }, ranks: {} });
let prof = blank(), dirty = false, saveT = 0;
const key = (id: ClassId) => `ronin-ascii.progress.${id}`;

export function loadProgress(id: ClassId = state.cls) {
  prof = blank();
  try {
    const raw = JSON.parse(localStorage.getItem(key(id)) || 'null');
    if (raw && typeof raw === 'object') {
      prof.level = Math.max(1, Math.min(MAX_LEVEL, Math.floor(Number(raw.level) || 1)));
      prof.xp = Math.max(0, Number(raw.xp) || 0);
      prof.total = Math.max(0, Number(raw.total) || 0);
      for (const s of STAT_IDS) prof.stats[s] = Math.max(0, Math.min(STAT_CAP, Math.floor(Number(raw.stats?.[s]) || 0)));
      for (const t of Object.keys(TECHNIQUES) as TechniqueId[]) {
        const r = Math.floor(Number(raw.ranks?.[t]) || 1);
        if (r > 1) prof.ranks[t] = Math.min(MAX_RANK, r);
      }
      // never more points spent than the level has given
      // more spent than the level gives (an old save, from when levels gave more): every point comes back
      if (spent() > pointsAt(prof.level)) refundAll();
    }
  } catch { /* no storage, or a broken save: start fresh */ }
}
export function saveProgress() {
  dirty = false;
  try { localStorage.setItem(key(state.cls), JSON.stringify(prof)); } catch { /* ignore */ }
}
loadProgress();
addEventListener('beforeunload', () => { if (dirty) saveProgress(); });
addEventListener('visibilitychange', () => { if (document.hidden && dirty) saveProgress(); });

export const level = () => prof.level;
export const xp = () => prof.xp;
export const totalXp = () => prof.total;
export const xpNeed = () => xpToNext(prof.level);
export const xpFrac = () => prof.level >= MAX_LEVEL ? 1 : prof.xp / xpNeed();
export const stat = (id: StatId) => prof.stats[id];
const statSpent = () => STAT_IDS.reduce((s, id) => s + prof.stats[id], 0);
const rankSpent = () => (Object.keys(prof.ranks) as TechniqueId[]).reduce((s, t) => s + rankCostTo(prof.ranks[t] ?? 1), 0);
const spent = () => statSpent() + rankSpent();
export const freePoints = () => Math.max(0, pointsAt(prof.level) - spent());
export const hasPerk = (id: PerkId) => prof.level >= PERKS.find(p => p.id === id)!.level;

// ------------------------------------------------------------ what the rest of the game reads
/** max life on top of the class's own */
export const bonusHp = () => prof.stats.vigor * VIGOR_HP + (hasPerk('leyenda') ? LEGEND_HP : 0);
/** max life at the start of a run */
export const baseHp = () => cls().hp + bonusHp();
export const statDmg = () => (1 + 0.02 * prof.stats.fuerza) * (hasPerk('leyenda') ? 1.15 : 1);
export const statHurt = () => (1 - 0.006 * prof.stats.temple) * (hasPerk('acero') ? 0.88 : 1);
export const statRun = () => 1 + 0.004 * prof.stats.agilidad;
export const statDash = () => (1 - 0.008 * prof.stats.agilidad) * (hasPerk('pies') ? 0.88 : 1);
export const chargeMult = () => (1 + 0.02 * prof.stats.espiritu) * (hasPerk('meditacion') ? 1.25 : 1) * rankCharge(rank(state.technique));
export const techMult = () => (1 + 0.015 * prof.stats.espiritu) * rankPower(rank(state.technique));
export const monMult = () => 1 + 0.02 * prof.stats.fortuna;
export const xpMult = () => 1 + 0.01 * prof.stats.fortuna;
export const critChance = () => 0.05 + (hasPerk('halcon') ? 0.08 : 0) + 0.003 * prof.stats.fortuna;
export const critMult = () => hasPerk('dragon') ? 2.5 : 1.75;
export const rollCrit = () => Math.random() < critChance();
export const perkHeal = () => hasPerk('sed') ? 3 : 0;
export const perkStreakTime = () => hasPerk('tigre') ? 2 : 0;
export const maxStreak = () => hasPerk('tigre') ? 6 : 5;
/** the oni of the world grow with you: a little more life and bite per level */
export const foeHp = () => 1 + 0.008 * (prof.level - 1);
export const foeDmg = () => 1 + 0.005 * (prof.level - 1);
/** mon at the start of every run: the reputation of a seasoned ronin */
export const stipend = () => 60 * (prof.level - 1);

// ------------------------------------------------------------ gaining levels
export interface LevelUp {
  from: number; to: number;
  points: number; mon: number; jade: number; heal: number;
  perks: Perk[];
  /** ids of the gear (LEVEL_REQ) Masa will now sell you */
  items: string[];
}
const listeners: ((e: LevelUp) => void)[] = [];
export const onLevelUp = (fn: (e: LevelUp) => void) => { listeners.push(fn); };

/** add experience (fortune adds its share); returns the experience actually gained */
export function gainXp(n: number) {
  if (n <= 0 || prof.level >= MAX_LEVEL) return 0;
  n = Math.round(n * xpMult());
  prof.xp += n; prof.total += n; dirty = true;
  const from = prof.level;
  while (prof.level < MAX_LEVEL && prof.xp >= xpToNext(prof.level)) { prof.xp -= xpToNext(prof.level); prof.level++; }
  if (prof.level >= MAX_LEVEL) prof.xp = 0;
  if (prof.level > from) levelUp(from, prof.level);
  return n;
}

function levelUp(from: number, to: number) {
  const e: LevelUp = { from, to, points: pointsAt(to) - pointsAt(from), mon: 0, jade: 0, heal: 0, perks: [], items: [] };
  for (let l = from + 1; l <= to; l++) {
    const big = isMilestone(l);
    e.mon += Math.round((100 + 30 * l) * (big ? 3 : 1) * monMult() / 5) * 5;
    if (big) e.jade++;
    e.perks.push(...PERKS.filter(p => p.level === l));
    e.items.push(...Object.keys(LEVEL_REQ).filter(id => LEVEL_REQ[id] === l));
  }
  state.mon += e.mon; state.jade += e.jade;
  if (e.perks.some(p => p.id === 'leyenda')) { player.maxHp += LEGEND_HP; player.hp += LEGEND_HP; }
  // a breath of new strength: part of the life comes back, and a moment untouchable
  const before = player.hp;
  player.hp = Math.min(player.maxHp, player.hp + player.maxHp * 0.35);
  e.heal = Math.round(player.hp - before);
  graceUntil = state.time + 1.2;   // untouchable, but without the dodge's blink: the fighter stays in view
  saveProgress();
  for (const fn of listeners) fn(e);
}

/** spend a free point on an attribute: 'ok', or why not */
export function spendPoint(id: StatId): 'ok' | 'none' | 'max' {
  if (!freePoints()) return 'none';
  if (prof.stats[id] >= STAT_CAP) return 'max';
  prof.stats[id]++;
  if (id === 'vigor') { player.maxHp += VIGOR_HP; player.hp += VIGOR_HP; }
  saveProgress();
  return 'ok';
}
// ------------------------------------------------------------ technique ranks (I .. V), bought with the same points
export const MAX_RANK = 5;
/** points to go from `r` to the next rank: 2, 3, 4, 5 (14 for a technique at V) */
export const rankCost = (r: number) => r + 1;
/** points spent to reach rank `r` from I */
const rankCostTo = (r: number) => { let s = 0; for (let k = 1; k < r; k++) s += rankCost(k); return s; };
export const rank = (t: TechniqueId) => prof.ranks[t] ?? 1;
/** technique damage and charge speed at a rank: +15 % and +8 % per rank above I */
export const rankPower = (r: number) => 1 + 0.15 * (r - 1);
export const rankCharge = (r: number) => 1 + 0.08 * (r - 1);
export const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
/** one rank more for a technique: 'ok', or why not */
export function upgradeTechnique(t: TechniqueId): 'ok' | 'none' | 'max' {
  const r = rank(t);
  if (r >= MAX_RANK) return 'max';
  if (freePoints() < rankCost(r)) return 'none';
  prof.ranks[t] = r + 1;
  saveProgress();
  return 'ok';
}
function refundAll() { for (const s of STAT_IDS) prof.stats[s] = 0; prof.ranks = {}; }

/** mon it costs to take every point back */
export const respecCost = () => 50 * prof.level;
export function respec(): 'ok' | 'poor' | 'empty' {
  if (!spent()) return 'empty';
  if (state.mon < respecCost()) return 'poor';
  state.mon -= respecCost();
  const hp = prof.stats.vigor * VIGOR_HP;
  player.maxHp -= hp; player.hp = Math.max(1, Math.min(player.maxHp, player.hp - hp));
  refundAll();
  saveProgress();
  return 'ok';
}

// ------------------------------------------------------------ the run
let windReady = 0, graceUntil = 0;
/** a moment of grace after a level-up (damage.ts): no blow lands */
export const levelGrace = () => state.time < graceUntil;
/** a new run starts (input.ts, after the reset): the purse of a known ronin, the awakened technique */
export function startRun() {
  windReady = 0; graceUntil = 0;
  state.mon += stipend();
  if (hasPerk('despertar')) state.special = 1;
}
/** damage.ts asks before you fall: true if the second wind keeps you standing */
export function secondWind() {
  if (!hasPerk('aliento') || state.time < windReady) return false;
  windReady = state.time + 180;
  return true;
}
export const secondWindIn = () => Math.max(0, windReady - state.time);

export function updateProgression(dt: number) {
  if (hasPerk('aura') && !state.dead && player.hp < player.maxHp) player.hp = Math.min(player.maxHp, player.hp + 0.8 * dt);
  if (dirty && (saveT -= dt) <= 0) { saveT = 4; saveProgress(); }
}

/** dev: jump to a level (console: __ronin.progress.setLevel(40)) */
export function devSetLevel(l: number) {
  const to = Math.max(1, Math.min(MAX_LEVEL, Math.floor(l)));
  if (to > prof.level) { prof.xp = 0; const from = prof.level; prof.level = to; levelUp(from, to); }
  else { prof.level = to; prof.xp = 0; if (spent() > pointsAt(to)) { player.maxHp -= prof.stats.vigor * VIGOR_HP; refundAll(); } saveProgress(); }
}
