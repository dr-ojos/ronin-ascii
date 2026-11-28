// What makes each boss and guardian fight differently:
//  - the stagger bar: heavy cuts and techniques fill it; full, the foe is stunned for a few seconds and
//    takes +50 % damage (each stun makes the next one need more)
//  - affixes: one to three random modifiers per boss (one per guardian) that change how the fight goes
import * as THREE from 'three';
import { enemies, KINDS, spawnEnemy } from './enemies';
import { blink, staggerEnemy } from './enemy-ai';
import { hurtPlayer } from './damage';
import { burst, impactRing } from './fx';
import { showMsg } from './hud';
import { collide, isFree } from './physics';
import { sfx, panOf } from './sfx';
import { player, state } from './state';
import { foeRecovery, level } from './progression';
import { surfaceY } from './structures';
import { rnd } from './utils';
import type { Affix, Enemy, EnemyKind } from './types';

const DAZE = { boss: 3.2, elite: 2.4 };   // seconds stunned when the bar fills
const VULNERABLE = 1.5;                    // damage taken while stunned
const NEED = { boss: 0.32, elite: 0.4 };   // share of its life worth of stagger to fill the bar
const NEED_GROWTH = 1.35;                  // each stun makes the next one harder
const DECAY_AFTER = 4.0;                   // seconds without stagger before the bar empties...
const DECAY = 0.06;                        // ...by this share of the bar per second

export const AFFIXES: Record<Affix, { name: string; desc: string }> = {
  acorazado: { name: 'acorazado', desc: 'recibe un 22 % menos de daño hasta que lo aturdes' },
  regenerador: { name: 'regenerador', desc: 'recupera vida poco a poco' },
  furioso: { name: 'furioso', desc: 'más rápido, ataca antes y pega más' },
  gelido: { name: 'gélido', desc: 'hace estallar escarcha donde estás' },
  invocador: { name: 'invocador', desc: 'llama a sus siervos cada poco' },
  errante: { name: 'errante', desc: 'aparece a tu espalda' },
  espinoso: { name: 'espinoso', desc: 'cortarlo te hiere a ti también' }
};
const ALL = Object.keys(AFFIXES) as Affix[];
const MINIONS: EnemyKind[] = ['oni', 'ashigaru', 'acechador', 'escudero'];

const strong = (en: Enemy) => KINDS[en.kind].boss ? 'boss' : KINDS[en.kind].elite ? 'elite' : null;
const lastStagger = new WeakMap<Enemy, number>();
const summoned = new WeakMap<Enemy, number>();
const reflectT = new WeakMap<Enemy, number>();
const frost: { at: THREE.Vector3; t: number; dmg: number }[] = [];

/** the affixes of a boss or guardian, rolled the first time they are asked for */
export function affixesOf(en: Enemy): Affix[] {
  const rank = strong(en);
  if (!rank) return [];
  if (en.affixes) return en.affixes;
  const tier = en.camp.tier, colossal = !!KINDS[en.kind].boss?.phase3, temple = !!en.camp.templeGuard, lv = level();
  const n = rank === 'elite'
    ? (lv >= 45 ? 2 : 1)
    : colossal
      ? Math.min(4, 3 + (lv >= 80 ? 1 : 0))
      : Math.min(3, Math.max(temple ? 2 : 1, 1 + (tier > 0.45 ? 1 : 0) + (tier > 0.78 ? 1 : 0) + (lv >= 55 ? 1 : 0)));
  const pool = ALL.slice(), out: Affix[] = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]);
  en.affixes = out;
  en.stagger = 0; en.staggerNeed = en.maxHp * NEED[rank] * (colossal ? 1.2 : temple ? 1.15 : 1); en.dazedT = 0;
  en.affixT = state.time + (colossal || temple ? rnd(3.2, 5.2) : rnd(4.2, 6.8)) * foeRecovery();
  if (out.includes('furioso')) { en.speed *= 1.22; en.windup *= 0.88; en.dmg = Math.round(en.dmg * 1.12); }
  return out;
}
export const affixLabel = (en: Enemy) => affixesOf(en).map(a => AFFIXES[a].name).join(' · ');

/** damage taken: +50 % while stunned, -22 % for an armoured one that is not */
export function damageTaken(en: Enemy) {
  if ((en.dazedT ?? 0) > 0) return VULNERABLE;
  return affixesOf(en).includes('acorazado') ? 0.78 : 1;
}

/** fill the stagger bar of a boss or guardian; full, it is stunned and vulnerable */
export function addStagger(en: Enemy, amount: number) {
  const rank = strong(en);
  if (!rank || en.hp <= 0) return;
  affixesOf(en);
  if ((en.dazedT ?? 0) > 0) return;
  en.stagger = (en.stagger ?? 0) + amount;
  lastStagger.set(en, state.time);
  if (en.stagger < en.staggerNeed!) return;
  en.stagger = 0; en.staggerNeed! *= NEED_GROWTH;
  en.dazedT = KINDS[en.kind].boss?.phase3 ? 2.6 : en.camp.templeGuard ? 2.8 : DAZE[rank];
  staggerEnemy(en, en.dazedT);
  en.knock.set(0, 0, 0);
  const p = en.g.position, at = new THREE.Vector3(p.x, p.y + 2 * en.scale, p.z);
  burst(at, 0xffe07a, 90, 6, 0.16); impactRing(p.clone(), 0xffe07a, 3.5);
  state.hitStop = Math.max(state.hitStop, 0.14); state.shake = Math.max(state.shake, 0.5);
  sfx.taiko(1.2);
  showMsg(`¡ ${KINDS[en.kind].name.toUpperCase()} ATURDIDO !\nvulnerable · +50 % daño`, 1.6);
}

/** a katana cut landed on this foe (after its damage): stagger, and the thorns of a spiny one */
export function bossHit(en: Enemy, dealt: number, heavy: boolean) {
  if (!strong(en)) return;
  addStagger(en, dealt * (heavy ? 2 : 1));
  if (affixesOf(en).includes('espinoso') && (en.dazedT ?? 0) <= 0 && state.time > (reflectT.get(en) ?? 0)) {
    reflectT.set(en, state.time + 1.0);
    burst(player.pos.clone().setY(player.pos.y + 1.2), 0x9cff5a, 20, 4, 0.12);
    hurtPlayer(Math.max(3, Math.round(en.dmg * 0.26)));
  }
}

/** call some foes to fight around `around` (also the enraged bosses' reinforcements, battle.ts) */
export function summon(around: Enemy, kinds: EnemyKind[], n: number) {
  const camp = around.camp, b = around.g.position;
  for (let i = 0; i < n; i++) {
    const kind = kinds[i % kinds.length];
    let x = b.x, z = b.z;
    for (let k = 0; k < 10; k++) {
      const a = Math.random() * Math.PI * 2, r = rnd(4, 7);
      x = b.x + Math.cos(a) * r; z = b.z + Math.sin(a) * r;
      if (isFree(x, z, 1)) break;
    }
    const p = { x, z }; collide(p, 0.6);
    spawnEnemy(camp, kind, p.x, p.z);
    const e = enemies[enemies.length - 1];
    e.state = 'chase'; e.t = rnd(0.4, 1);
    camp.roster.push(kind);
    burst(new THREE.Vector3(p.x, e.g.position.y + 1, p.z), 0xff4a30, 40, 5, 0.14);
  }
}

/** what the stunned ones and the affixes do, every frame */
export function updateBossMechanics(dt: number) {
  for (let i = frost.length - 1; i >= 0; i--) {
    const f = frost[i];
    if ((f.t -= dt) > 0) continue;
    frost.splice(i, 1);
    burst(f.at.clone().setY(f.at.y + 0.4), 0xbff4ff, 70, 7, 0.15); impactRing(f.at, 0xbff4ff, 2.6);
    sfx.taiko(0.5);
    if (Math.hypot(player.pos.x - f.at.x, player.pos.z - f.at.z) < 2.4 && hurtPlayer(f.dmg) && !state.dead) player.snareT = Math.max(player.snareT, 1.3);
  }
  for (const en of enemies) {
    if (!strong(en) || en.hp <= 0) continue;
    const affixes = affixesOf(en), p = en.g.position;
    if ((en.dazedT ?? 0) > 0) {
      en.dazedT! -= dt;
      if (Math.floor(state.time * 3) !== Math.floor((state.time - dt) * 3)) burst(new THREE.Vector3(p.x, p.y + 2.2 * en.scale, p.z), 0xffe07a, 10, 2, 0.1);
      continue;
    }
    if (state.time - (lastStagger.get(en) ?? -99) > DECAY_AFTER) en.stagger = Math.max(0, (en.stagger ?? 0) - en.staggerNeed! * DECAY * dt);
    const fighting = en.state !== 'idle' && en.state !== 'return' && !state.dead;
    const apex = !!KINDS[en.kind].boss?.phase3 || !!en.camp.templeGuard;
    if (affixes.includes('regenerador') && fighting) en.hp = Math.min(en.maxHp, en.hp + en.maxHp * (apex ? 0.011 : 0.008) * dt);
    if (!fighting || state.time < (en.affixT ?? 0)) continue;
    // one affix acts at a time, every few seconds
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    const active = affixes.filter(a => a === 'gelido' || a === 'invocador' || (a === 'errante' && d > 4));
    en.affixT = state.time + (apex ? rnd(3.4, 5.4) : rnd(4.5, 7.0)) * foeRecovery();
    if (!active.length) continue;
    const a = active[Math.floor(Math.random() * active.length)];
    if (a === 'gelido') {
      const at = new THREE.Vector3(player.pos.x, surfaceY(player.pos.x, player.pos.z) + 0.05, player.pos.z);
      impactRing(at, 0x7fd8ff, 2.5); burst(at.clone().setY(at.y + 0.3), 0x7fd8ff, 24, 2, 0.1);
      frost.push({ at, t: 1.05, dmg: Math.round(en.dmg * 0.48) });
    } else if (a === 'invocador' && (summoned.get(en) ?? 0) < (apex ? 6 : 4)) {
      summoned.set(en, (summoned.get(en) ?? 0) + 1);
      summon(en, [MINIONS[Math.floor(Math.random() * MINIONS.length)]], 1);
      sfx.roar({ big: false, pan: panOf(p.x, p.z) });
    } else if (a === 'errante') blink(en, true);
  }
}

/** the extra lines under a boss's life bar */
export function bossHud(en: Enemy) {
  if (!strong(en)) return '';
  const label = affixLabel(en);
  const daze = (en.dazedT ?? 0) > 0
    ? `  <span class="y">¡ ATURDIDO ! · vulnerable</span>`
    : `  aturdir [<span class="y">${'='.repeat(Math.min(12, Math.floor((en.stagger ?? 0) / en.staggerNeed! * 12)))}</span>${'-'.repeat(12 - Math.min(12, Math.floor((en.stagger ?? 0) / en.staggerNeed! * 12)))}]`;
  return (label ? `  <span class="d">${label}</span>\n` : '') + daze + '\n';
}

export function resetBossMechanics() { frost.length = 0; }
