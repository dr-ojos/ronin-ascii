// The battle engine: what turns a scuffle with a group into a fight with a rhythm.
//  - turns: only a few common foes strike at once; the others circle you, waiting for their turn
//    (bosses, guardians, beasts and archers are free to act on their own)
//  - combo and fighting spirit: hits in a row without being hurt raise your damage
//  - finishers: a common foe left below a quarter of its life falls to the next cut (slow motion)
//  - reinforcements: a boss that loses half its life calls more of its own to the fight
//  - bosses and guardians: stagger bar and affixes (boss-mechanics.ts)
//  - the end: slow motion on the last kill, then a summary with a rank and bonus points
import * as THREE from 'three';
import { enemies, KINDS } from './enemies';
import { resetBossMechanics, summon, updateBossMechanics } from './boss-mechanics';
import { burst } from './fx';
import { showMsg } from './hud';
import { addPoints } from './score';
import { sfx, panOf } from './sfx';
import { player, state } from './state';
import { angDiff, rnd } from './utils';
import type { Enemy, EnemyKind } from './types';

const RANGE = 40;              // how far an enemy still counts as part of the fight
const COMBO_WINDOW = 4;        // seconds to land the next hit and keep the combo
const FINISH_AT = 0.25;        // share of its life under which a common foe can be finished
const SUMMARY_DELAY = 2.4;     // the summary waits for the camp's own message

/** who a boss calls when it is enraged */
const REINFORCE: Partial<Record<EnemyKind, EnemyKind[]>> = {
  jefe: ['oni', 'bruto', 'oni'], kuro: ['escudero', 'duelista', 'espectro'], tenguMayor: ['sombra', 'arquero', 'hechicero'],
  kuroCapitan: ['escudero', 'ashigaru', 'duelista'],
  kuroOnmyoji: ['hechicero', 'piromante', 'espectro'],
  kuroJuggernaut: ['coloso', 'bruto', 'tambor'],
  kuroSombra: ['sombra', 'acechador', 'duelista'],
  raijinMayor: ['coloso', 'tambor', 'bruto'],
  guardianViento: ['sombra', 'duelista', 'arquero'],
  guardianFuego: ['piromante', 'guadanero', 'bruto'],
  guardianAgua: ['espectro', 'hechicero', 'duelista'],
  guardianRayo: ['espectro', 'duelista', 'sombra'],
  shuten: ['bruto', 'oni', 'coloso'], enma: ['piromante', 'acechador', 'sombra'],
  senorBosque: ['guadanero', 'arana', 'acechador'], yukiOnna: ['espectro', 'hechicero', 'sombra'],
  kagutsuchi: ['piromante', 'guadanero', 'escudero'], daimyoHueso: ['ashigaru', 'escudero', 'duelista'],
  taikoDemonio: ['tambor', 'bruto', 'oni'],
  gashadokuro: ['espectro', 'sombra', 'duelista'], susanooTempestad: ['hechicero', 'guadanero', 'tambor'],
  amaterasuCeniza: ['coloso', 'piromante', 'bruto']
};

export const battle = {
  active: false, t: 0, kills: 0, finishers: 0, hurt: 0, combo: 0, bestCombo: 0, lastHit: -99, foes: 0
};
let summaryT = -1, summary = '', summaryBonus = 0;

const tokens = new Map<Enemy, { since: number; struck: boolean }>();   // the common foes whose turn it is
const rest = new WeakMap<Enemy, number>();   // state.time until which a foe that just struck waits
const engagedNow = () => enemies.filter(e => e.hp > 0 && e.state !== 'idle' && e.state !== 'return'
  && Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z) < RANGE);

/** bosses, guardians, beasts and shooters do not wait for a turn */
export function freeAgent(en: Enemy) {
  const def = KINDS[en.kind];
  return !!(def.boss || def.elite || def.beast || def.ranged || en.camp.wildlife) || en.reach > 6;
}
/** how many common foes may strike at once: more in long fights and against big groups */
function maxStrikers() {
  const crowd = enemies.filter(e => !freeAgent(e) && e.state !== 'idle' && e.state !== 'return').length;
  return 2 + (crowd >= 4 ? 1 : 0) + (battle.t > 30 ? 1 : 0);
}
function releaseTokens() {
  for (const [e, turn] of tokens) {
    if (e.state === 'windup' || e.state === 'charge' || e.state === 'recover') turn.struck = true;
    const gone = e.hp <= 0 || !enemies.includes(e) || e.state === 'idle' || e.state === 'return';
    const done = turn.struck && e.state === 'chase', stuck = !turn.struck && state.time - turn.since > 4;
    if (!gone && !done && !stuck) continue;
    tokens.delete(e);
    if (done || stuck) rest.set(e, state.time + rnd(0.35, 0.9));   // step back before trying again
  }
}
/** this foe's turn to close in and strike: it keeps it until it has struck (bosses and the like always have it).
 *  A foe without a turn circles you and waits. */
export function takeTurn(en: Enemy) {
  if (freeAgent(en)) return true;
  releaseTokens();
  if (tokens.has(en)) return true;
  if ((rest.get(en) ?? 0) > state.time || tokens.size >= maxStrikers()) return false;
  tokens.set(en, { since: state.time, struck: false });
  return true;
}
/** how far from you a foe waiting its turn keeps */
export const ringRadius = (en: Enemy) => 3.3 + 0.9 * en.scale;

/** wait for a turn: circle around you at the edge of the fight, working round to your back and sides
 *  (each to its own spot) so you have to turn and move. (dx, dz) is the way to the player, d the distance;
 *  returns the walking speed */
export function circle(en: Enemy, dx: number, dz: number, d: number, speed: number, dt: number) {
  if (d < 1e-3) return 0;
  const spot = player.face + Math.PI + (Math.floor(en.seed * 10) % 3 - 1) * 0.95;   // behind you, or to a flank
  const side = THREE.MathUtils.clamp(angDiff(spot, Math.atan2(-dx, -dz)) * 1.5, -1, 1);
  const radial = THREE.MathUtils.clamp((d - ringRadius(en)) * 0.9, -1, 1);
  const sx = dx / d * radial - dz / d * side * 0.8, sz = dz / d * radial + dx / d * side * 0.8;
  const l = Math.hypot(sx, sz) || 1, walk = speed * (radial < -0.5 ? 0.85 : 0.55);   // backs off quicker when too close
  en.g.position.x += sx / l * walk * dt; en.g.position.z += sz / l * walk * dt;
  return walk;
}

/** your damage grows with the combo: +15 % from 10 hits in a row, +30 % from 20 */
export const spirit = () => battle.combo >= 20 ? 1.3 : battle.combo >= 10 ? 1.15 : 1;

/** the katana hit this foe (after its damage): count the combo and finish it off if it is low */
export function onPlayerHit(en: Enemy) {
  battle.combo++; battle.bestCombo = Math.max(battle.bestCombo, battle.combo); battle.lastHit = state.time;
  if (battle.combo === 10 || battle.combo === 20) { sfx.chime(false); showMsg(`ESPÍRITU DE BATALLA · +${battle.combo === 20 ? 30 : 15} % daño`, 1.1); }
  const def = KINDS[en.kind];
  if (en.hp <= 0 || def.boss || def.elite || en.hp > en.maxHp * FINISH_AT) return;
  en.hp = 0;
  battle.finishers++;
  state.hitStop = Math.max(state.hitStop, 0.18);
  state.shake = Math.max(state.shake, 0.4);
  const p = en.g.position, at = new THREE.Vector3(p.x, p.y + 1.2 * en.scale, p.z);
  burst(at, 0xffffff, 40, 7, 0.15); burst(at, 0xff3a2a, 50, 6, 0.12);
  sfx.hit({ heavy: true, pan: panOf(p.x, p.z), count: 1 });
  addPoints(40, 'remate');
  showMsg('¡ REMATE !', 0.6);
}
/** you were hurt: the combo is lost */
export function onPlayerHurt() {
  if (battle.combo >= 10) showMsg('combo roto', 0.8);
  battle.combo = 0; battle.hurt++;
}
/** an enemy fell (enemy-ai.ts kill): the last one of the fight falls in slow motion */
export function onKill(en: Enemy) {
  if (!battle.active) return;
  battle.kills++;
  if (!engagedNow().some(e => e !== en)) { state.hitStop = Math.max(state.hitStop, 0.5); state.shake = Math.max(state.shake, 0.5); }
}
/** a boss reached its second phase: it calls reinforcements around it */
export function onEnrage(boss: Enemy) {
  summon(boss, REINFORCE[boss.kind] ?? ['oni', 'ashigaru'], boss.camp.templeGuard ? 4 : boss.camp.tier > 0.6 ? 3 : 2);
  sfx.waveStart(true);
}

function rank() {
  const score = battle.kills * 10 + battle.bestCombo * 2 + battle.finishers * 8 - battle.hurt * 7 - Math.max(0, battle.t - battle.kills * 8);
  return score >= battle.kills * 18 ? 'S' : score >= battle.kills * 12 ? 'A' : score >= battle.kills * 6 ? 'B' : 'C';
}
const RANK_BONUS: Record<string, number> = { S: 25, A: 15, B: 8, C: 0 };

export function updateBattle(dt: number) {
  updateBossMechanics(dt);
  if (summaryT >= 0 && (summaryT -= dt) < 0) { showMsg(summary, 2.8); if (summaryBonus) addPoints(summaryBonus, 'batalla'); }
  if (state.time - battle.lastHit > COMBO_WINDOW) battle.combo = 0;
  const engaged = engagedNow();
  if (!battle.active) {
    if (!engaged.length || state.dead) return;
    Object.assign(battle, { active: true, t: 0, kills: 0, finishers: 0, hurt: 0, bestCombo: 0, foes: engaged.length });
    tokens.clear();
    return;
  }
  battle.t += dt;
  battle.foes = Math.max(battle.foes, engaged.length + battle.kills);
  if (engaged.length && !state.dead) return;
  // the fight is over
  battle.active = false; tokens.clear();
  if (state.dead || battle.kills < 2) return;
  const r = rank();
  summaryBonus = battle.kills * RANK_BONUS[r];
  summary = `— BATALLA GANADA · RANGO ${r} —\n${battle.kills} bajas · combo máx ${battle.bestCombo} · ${battle.finishers} remates · ${battle.hurt} heridas · ${Math.round(battle.t)} s`
    + (summaryBonus ? `\n+${summaryBonus}` : '');
  summaryT = SUMMARY_DELAY;
}

/** structured combat status for the Modo T HUD */
export function battleStatus() {
  if (!battle.active) return null;
  return { combo: battle.combo, spirit: spirit(), kills: battle.kills, left: engagedNow().length, finishers: battle.finishers };
}

/** a line for the HUD while fighting */
export function battleLine() {
  if (!battle.active) return '';
  const s = spirit(), left = engagedNow().length;
  return `BATALLA  combo <span class="y">x${battle.combo}</span>${s > 1 ? `  <span class="r">espíritu +${Math.round((s - 1) * 100)} %</span>` : ''}`
    + `   <span class="d">bajas ${battle.kills} · quedan ${left} · remates ${battle.finishers}</span>\n`;
}

export function resetBattle() {
  Object.assign(battle, { active: false, t: 0, kills: 0, finishers: 0, hurt: 0, combo: 0, bestCombo: 0, lastHit: -99, foes: 0 });
  tokens.clear(); summaryT = -1; resetBossMechanics();
}
