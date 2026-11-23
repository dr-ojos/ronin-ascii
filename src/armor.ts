// Armour sold in Masa's shop (shop.ts): more life, less damage taken, and a gift of its own. One worn at a time;
// bought with mon and, like the blades, lost when you fall. upgrades.ts folds these numbers into the
// helpers the rest of the game already reads (hurtMult, dashCdMult, runMult).
import { player, state } from './state';

export interface Armor {
  id: string; name: string; desc: string; price: number; tier: number;
  /** extra max life, share of damage it stops (0..1) */
  hp: number; guard: number;
  /** dodge cooldown and running speed multipliers, life regained per second even while fighting */
  dash?: number; run?: number; regen?: number;
  /** how it looks on you (outfit.ts): plate and trim colours, shoulder guard size, helmet, aura, glow */
  /** how it looks on you (outfit.ts): lacquered plates (lame), the silk lacing that binds them (lace), the metal
   *  fittings, size of the shoulder guards, helmet and its crest, shin guards, aura, how much it glows */
  look?: { lame: number; lace: number; metal: number; sode: number; helmet?: 'jingasa' | 'crescent' | 'kuwagata' | 'sun'; shins?: boolean; aura?: 'foxfire' | 'gold'; glow?: number };
}
export const ARMORS: Armor[] = [
  { id: 'kimono',   name: 'Kimono de viaje',        desc: 'tela y polvo del camino',                     price: 0, tier: 0,    hp: 0,   guard: 0 },
  { id: 'ashigaru', name: 'Dō de ashigaru',         desc: 'peto de cuero y bambú',                       price: 500, tier: 1,  hp: 25,  guard: 0.1,
    look: { lame: 0x2b2724, lace: 0x3a5cb0, metal: 0xc09a5c, sode: 0.7, helmet: 'jingasa' } },
  { id: 'kitsune',  name: 'Armadura del zorro',     desc: 'ligera: esquivas mucho más a menudo',         price: 1500, tier: 1.5, hp: 30,  guard: 0.12, dash: 0.7, run: 1.05,
    look: { lame: 0xf2eee6, lace: 0xe0202e, metal: 0xd0d6e0, sode: 1, aura: 'foxfire' } },
  { id: 'lacado',   name: 'Dō lacado',              desc: 'placas lacadas cosidas con seda',             price: 2200, tier: 2, hp: 50,  guard: 0.2,
    look: { lame: 0x17151c, lace: 0xc81e26, metal: 0xe8b640, sode: 1.3, helmet: 'crescent', shins: true } },
  { id: 'oyoroi',   name: 'O-yoroi del general',    desc: 'casi nada la atraviesa, pero pesa',           price: 4200, tier: 2.7, hp: 85,  guard: 0.32, run: 0.94,
    look: { lame: 0x1a2342, lace: 0x2f78f0, metal: 0xf2c445, sode: 1.8, helmet: 'kuwagata', shins: true, glow: 0.1 } },
  { id: 'hachiman', name: 'Armadura de Hachiman',   desc: 'bendecida: cierra tus heridas incluso en combate', price: 7000, tier: 3, hp: 100, guard: 0.35, regen: 1.5,
    look: { lame: 0xd8a21e, lace: 0xd81a22, metal: 0xffe08a, sode: 1.8, helmet: 'sun', shins: true, aura: 'gold', glow: 0.3 } }
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
