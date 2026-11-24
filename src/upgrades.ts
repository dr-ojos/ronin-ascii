// Upgrades found in chests. They last until you fall, stack up to a few levels, and each one changes
// how you fight: player.ts, damage.ts, score.ts and enemy-ai.ts read them through the helpers below.
import { player, state } from './state';
import { armorGuard, armorDash, armorRun } from './armor';
import { cls } from './classes';
import { baseHp, statDmg, statHurt, statDash, statRun, perkHeal, perkStreakTime } from './progression';

export type UpgradeId = 'filo' | 'armadura' | 'viento' | 'sangre' | 'ofuda' | 'kitsune';
export const UPGRADES: Record<UpgradeId, { name: string; desc: string; max: number }> = {
  filo:     { name: 'Filo templado',       desc: '+40 % de daño con la katana', max: 3 },
  armadura: { name: 'Armadura lacada',     desc: '+20 de vida máxima',          max: 3 },
  viento:   { name: 'Sandalias de viento', desc: 'esquivas antes y corres más', max: 3 },
  sangre:   { name: 'Talismán de sangre',  desc: 'cada baja te cura 3',         max: 3 },
  ofuda:    { name: 'Ofuda de hierro',     desc: '-15 % de daño recibido',      max: 3 },
  kitsune:  { name: 'Máscara de kitsune',  desc: 'la racha dura 2 s más',       max: 2 }
};
export const lvl = (id: UpgradeId) => state.upgrades[id] || 0;
export const roman = (n: number) => ['', 'I', 'II', 'III', 'IV'][n] || String(n);

export const dmgMult = () => (1 + 0.4 * lvl('filo')) * statDmg();
export const hurtMult = () => (1 - 0.15 * lvl('ofuda')) * armorGuard() * (1 - cls().guard) * statHurt();
export const dashCdMult = () => Math.pow(0.8, lvl('viento')) * armorDash() * statDash() * (cls().dash ?? 1);
export const runMult = () => (1 + 0.07 * lvl('viento')) * armorRun() * cls().run * statRun();
export const lifesteal = () => 3 * lvl('sangre') + perkHeal();
export const streakBonus = () => 2 * lvl('kitsune') + perkStreakTime();

/** a random upgrade not yet at its top level (null when all are maxed) */
export function rollUpgrade(): UpgradeId | null {
  const open = (Object.keys(UPGRADES) as UpgradeId[]).filter(id => lvl(id) < UPGRADES[id].max);
  return open.length ? open[Math.floor(Math.random() * open.length)] : null;
}
export function grant(id: UpgradeId) {
  state.upgrades[id] = lvl(id) + 1;
  if (id === 'armadura') { player.maxHp += 20; player.hp += 20; }
}
export function resetUpgrades() { state.upgrades = {}; player.maxHp = baseHp(); }
/** "filo II · ofuda I" for the HUD */
export const upgradeList = () => (Object.keys(state.upgrades) as UpgradeId[]).map(id => `${UPGRADES[id].name.split(' ')[0].toLowerCase()} ${roman(lvl(id))}`).join(' · ');
