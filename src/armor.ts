// Armour sold in Masa's shop (shop.ts): more life, less damage taken, and a gift of its own. One worn at a time;
// bought with mon and, like the blades, lost when you fall. upgrades.ts folds these numbers into the
// helpers the rest of the game already reads (hurtMult, dashCdMult, runMult).
import { player, state } from './state';

export interface Armor {
  id: string; name: string; desc: string; price: number;
  /** extra max life, share of damage it stops (0..1) */
  hp: number; guard: number;
  /** dodge cooldown and running speed multipliers, life regained per second even while fighting */
  dash?: number; run?: number; regen?: number;
}
export const ARMORS: Armor[] = [
  { id: 'kimono',   name: 'Kimono de viaje',        desc: 'tela y polvo del camino',                     price: 0,    hp: 0,   guard: 0 },
  { id: 'ashigaru', name: 'Dō de ashigaru',         desc: 'peto de cuero y bambú',                       price: 500,  hp: 25,  guard: 0.1 },
  { id: 'kitsune',  name: 'Armadura del zorro',     desc: 'ligera: esquivas mucho más a menudo',         price: 1500, hp: 30,  guard: 0.12, dash: 0.7, run: 1.05 },
  { id: 'lacado',   name: 'Dō lacado',              desc: 'placas lacadas cosidas con seda',             price: 2200, hp: 50,  guard: 0.2 },
  { id: 'oyoroi',   name: 'O-yoroi del general',    desc: 'casi nada la atraviesa, pero pesa',           price: 4200, hp: 85,  guard: 0.32, run: 0.94 },
  { id: 'hachiman', name: 'Armadura de Hachiman',   desc: 'bendecida: cierra tus heridas incluso en combate', price: 7000, hp: 100, guard: 0.35, regen: 1.5 }
];
const byId = new Map(ARMORS.map(a => [a.id, a]));
export const armor = () => byId.get(state.armor) || ARMORS[0];
export const ownsArmor = (id: string) => state.ownedArmor.includes(id);

export const armorGuard = () => 1 - armor().guard;
export const armorDash = () => armor().dash ?? 1;
export const armorRun = () => armor().run ?? 1;

export function armorStats(a: Armor) {
  const bits = [`vida +${a.hp}`, `daño recibido -${Math.round(a.guard * 100)} %`];
  if (a.dash) bits.push('esquiva rápida');
  if (a.run && a.run < 1) bits.push('algo más lento');
  if (a.regen) bits.push(`+${a.regen} vida/s`);
  return a.hp ? bits.join(' · ') : 'sin protección';
}
export function wearArmor(id: string) {
  if (!ownsArmor(id)) return;
  const before = armor().hp;
  state.armor = id;
  const d = armor().hp - before;
  player.maxHp += d; player.hp = Math.max(1, Math.min(player.maxHp, player.hp + Math.max(0, d)));
}
export function buyArmor(a: Armor): 'ok' | 'poor' | 'owned' {
  if (ownsArmor(a.id)) return 'owned';
  if (state.mon < a.price) return 'poor';
  state.mon -= a.price; state.ownedArmor.push(a.id); wearArmor(a.id);
  return 'ok';
}
/** a new run: back to the travelling kimono (encounters.reset has already set the life back to 100) */
export function resetArmor() { state.armor = 'kimono'; state.ownedArmor = ['kimono']; }
export function updateArmor(dt: number) {
  const r = armor().regen;
  if (r && !state.dead) player.hp = Math.min(player.maxHp, player.hp + r * dt);
}
