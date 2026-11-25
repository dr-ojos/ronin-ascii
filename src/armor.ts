// Armour sold in Masa's shop (shop.ts): more life, less damage taken, and a gift of its own. One worn at a time;
// bought with mon and, like the blades, kept from run to run (vault.ts). upgrades.ts folds these numbers into the
// helpers the rest of the game already reads (hurtMult, dashCdMult, runMult).
import { player, state } from './state';
import { readVault } from './vault';

export interface Armor {
  id: string; name: string; desc: string; price: number; tier: number;
  /** extra max life, share of damage it stops (0..1) */
  hp: number; guard: number;
  /** dodge cooldown and running speed multipliers, life regained per second even while fighting */
  dash?: number; run?: number; regen?: number;
  robe?: { linen: number; mantle: number; sash: number };
  /** how it looks on you (outfit.ts): lacquered plates (lame), the silk lacing that binds them (lace), the metal
   *  fittings, size of the shoulder guards, helmet and its crest, shin guards, aura, how much it glows,
   *  and optional glowing neon edge colour (TRON-style dark plates with luminous circuit borders) */
  look?: { lame: number; lace: number; metal: number; sode: number; helmet?: 'jingasa' | 'crescent' | 'kuwagata' | 'sun'; shins?: boolean; aura?: 'foxfire' | 'gold' | 'neon'; glow?: number; neon?: number };
}
export const ARMORS: Armor[] = [
  { id: 'kimono',   name: 'Kimono de viaje',        desc: 'tela y polvo del camino',                     price: 0, tier: 0,    hp: 0,   guard: 0 },
  { id: 'ashigaru', name: 'Dō de ashigaru',         desc: 'peto de cuero y bambú',                       price: 1000, tier: 1,  hp: 25,  guard: 0.1,
    look: { lame: 0x2b2724, lace: 0x3a5cb0, metal: 0xc09a5c, sode: 0.7, helmet: 'jingasa' } },
  { id: 'hayate', name: 'Armadura de Hayate', desc: 'peto ligero de explorador: corres más rápido', price: 1600, tier: 1.2, hp: 20, guard: 0.08, run: 1.12,
    look: { lame: 0x385e38, lace: 0xb6c47e, metal: 0xc3a564, sode: 0.62, helmet: 'jingasa' } },
  { id: 'monje', name: 'Túnica del monje errante', desc: 'hábito de lino con manto ocre: permite esquivar y recupera vida poco a poco', price: 2500, tier: 1.25,
    hp: 18, guard: 0.05, dash: 0.82, regen: 0.45, robe: { linen: 0xb0743a, mantle: 0x7e3222, sash: 0x3d2a24 } },
  { id: 'kitsune',  name: 'Armadura del zorro',     desc: 'ligera: esquivas mucho más a menudo',         price: 3000, tier: 1.5, hp: 30,  guard: 0.12, dash: 0.7, run: 1.05,
    look: { lame: 0xf2eee6, lace: 0xe0202e, metal: 0xd0d6e0, sode: 1, aura: 'foxfire' } },
  { id: 'garza', name: 'Armadura de la Garza', desc: 'placas claras y ligeras para correr y esquivar', price: 3700, tier: 1.75, hp: 40, guard: 0.15, dash: 0.82, run: 1.09,
    look: { lame: 0xc3d8de, lace: 0x27778c, metal: 0xe4f3ff, sode: 0.9, helmet: 'crescent', shins: true } },
  { id: 'lacado',   name: 'Dō lacado',              desc: 'placas lacadas cosidas con seda',             price: 4400, tier: 2, hp: 50,  guard: 0.2,
    look: { lame: 0x17151c, lace: 0xc81e26, metal: 0xe8b640, sode: 1.3, helmet: 'crescent', shins: true } },
  { id: 'guardian', name: 'Dō del Guardián', desc: 'placas reforzadas que apenas frenan al correr', price: 6200, tier: 2.3, hp: 65, guard: 0.26, run: 0.98,
    look: { lame: 0x284f49, lace: 0xed9149, metal: 0xdcb879, sode: 1.5, helmet: 'kuwagata', shins: true } },
  { id: 'oyoroi',   name: 'O-yoroi del general',    desc: 'casi nada la atraviesa, pero pesa',           price: 8400, tier: 2.7, hp: 85,  guard: 0.32, run: 0.94,
    look: { lame: 0x1a2342, lace: 0x2f78f0, metal: 0xf2c445, sode: 1.8, helmet: 'kuwagata', shins: true, glow: 0.1 } },
  { id: 'tsukuyomi', name: 'Armadura de Tsukuyomi', desc: 'lacado lunar: recuperas vida sin perder agilidad', price: 10800, tier: 2.8, hp: 75, guard: 0.26, dash: 0.74, regen: 0.8,
    look: { lame: 0x362953, lace: 0x9584e5, metal: 0xbecbfa, sode: 1.35, helmet: 'crescent', shins: true, glow: 0.16 } },
  { id: 'neon', name: 'Coraza de Neón Blanco', desc: 'obsidiana oscura surcada por circuitos de luz blanca: veloz y precisa', price: 12400, tier: 2.9, hp: 90, guard: 0.3, dash: 0.72, run: 1.12, regen: 0.6,
    look: { lame: 0x07080d, lace: 0xeef6ff, metal: 0xffffff, sode: 1.45, helmet: 'crescent', shins: true, aura: 'neon', glow: 0.04, neon: 0xffffff } },
  { id: 'hachiman', name: 'Armadura de Hachiman',   desc: 'bendecida: cierra tus heridas incluso en combate', price: 14000, tier: 3, hp: 100, guard: 0.35, regen: 1.5,
    look: { lame: 0xd8a21e, lace: 0xd81a22, metal: 0xffe08a, sode: 1.8, helmet: 'sun', shins: true, aura: 'gold', glow: 0.3 } },
  { id: 'kurogane', name: 'Gran coraza Kurogane', desc: 'hierro oscuro: la mayor protección, a cambio de movilidad', price: 16800, tier: 3, hp: 120, guard: 0.42, dash: 1.18, run: 0.88,
    look: { lame: 0x22273b, lace: 0xc23d3a, metal: 0xc8af83, sode: 2, helmet: 'kuwagata', shins: true, glow: 0.09 } }
];
const byId = new Map(ARMORS.map(a => [a.id, a]));
export const armor = () => byId.get(state.armor) || ARMORS[0];
export const ownsArmor = (id: string) => state.ownedArmor.includes(id);

export const armorGuard = () => 1 - armor().guard;
export const armorDash = () => armor().dash ?? 1;
export const armorRun = () => armor().run ?? 1;

export function armorStats(a: Armor) {
  const bits = [`vida +${a.hp}`, `daño recibido -${Math.round(a.guard * 100)} %`];
  if (a.dash) bits.push(a.dash < 1 ? 'esquiva más frecuente' : 'esquiva menos frecuente');
  if (a.run) bits.push(a.run > 1 ? 'carrera más rápida' : 'carrera más lenta');
  if (a.regen) bits.push(`+${a.regen} vida/s`);
  return a.hp ? bits.join(' · ') : 'sin protección';
}
export function wearArmor(id: string, justBought = false) {
  if (!ownsArmor(id) || state.armor === id) return;
  const before = armor().hp;
  const healthRatio = player.hp / player.maxHp;
  state.armor = id;
  const d = armor().hp - before;
  player.maxHp += d;
  // Swapping armour keeps the same health percentage so repeated changes cannot heal the player.
  player.hp = justBought
    ? Math.max(1, Math.min(player.maxHp, player.hp + Math.max(0, d)))
    : healthRatio * player.maxHp;
}
export function buyArmor(a: Armor): 'ok' | 'poor' | 'owned' {
  if (ownsArmor(a.id)) return 'owned';
  if (state.mon < a.price) return 'poor';
  state.mon -= a.price; state.ownedArmor.push(a.id); wearArmor(a.id, true);
  return 'ok';
}
/** a new run (or another class): the travelling clothes, every armour already won (vault.ts), and the one worn last
 *  (encounters.reset has already set the class's starting life; wearArmor adds the armour's) */
export function resetArmor() {
  const v = readVault();
  state.armor = 'kimono';
  state.ownedArmor = ['kimono', ...v.armors.filter(id => id !== 'kimono' && byId.has(id))];
  if (v.armor) wearArmor(v.armor);
}
export function updateArmor(dt: number) {
  const r = armor().regen;
  if (r && !state.dead) player.hp = Math.min(player.maxHp, player.hp + r * dt);
}
