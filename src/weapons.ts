// Blades sold by Masa, the smith of Kiri (shop.ts). Each one cuts differently: damage, reach, speed and
// a gift of its own. Bought with mon; like the chest upgrades, they are lost when you fall.
// player.ts reads the current blade through the helpers below; applyWeapon() reshapes the katana mesh.
import { bladeMat, showWeaponModel } from './avatar';
import { BLADE_PROFILE } from './samurai';
import { player, state } from './state';
import { BLADE_LAYOUT } from './weapon-models';
import type { WeaponForm } from './types';

export interface Weapon {
  id: string; name: string; desc: string; price: number; tier: number;
  form?: WeaponForm;
  /** damage multiplier, extra reach (m), attack duration multiplier (<1 = faster) */
  dmg: number; reach: number; speed: number;
  /** blade length multiplier, glow and steel colours */
  len: number; glow: number; steel: number;
  /** life healed per oni struck, lightning charge per oni struck */
  heal?: number; charge?: number;
  /** how it shines in use (katana-fx.ts): trail / halo / arc colour, sparks hot → cool, spark gravity,
   *  halo thickness, how bright the trail is, and a flourish of its own */
  fx: {
    glow: number; hot: number; cool: number; gravity: number; halo: number; trail: number;
    sparks?: readonly [number, number, number];
    extra?: 'bolts' | 'blood' | 'feathers' | 'stars';
  };
}
export const WEAPONS: Weapon[] = [
  { id: 'katana',   name: 'Katana del ronin',  desc: 'la de siempre: equilibrada',                        price: 0, tier: 0,    dmg: 1,   reach: 0,   speed: 1,    len: 1,    glow: 0xa6dcff, steel: 0xf4f9ff,
    fx: { glow: 0xbfe4ff, hot: 0xfff0a0, cool: 0xff7a10, gravity: 9, halo: 1, trail: 1 } },
  { id: 'kogarasu', name: 'Kogarasu-maru',     desc: 'ligera como un cuervo: tajos mucho más rápidos',    price: 600, tier: 1,  dmg: 1.1, reach: 0,   speed: 0.72, len: 0.88, glow: 0xb04aff, steel: 0x3a3048,
    fx: { glow: 0xb85cff, hot: 0xf0c8ff, cool: 0x7d36e0, gravity: 1.5, halo: 1.3, trail: 1.6, sparks: [0xb56aff, 0x7777ff, 0xff82e1], extra: 'feathers' } },
  { id: 'kagutsuchi', name: 'Brasa de Kagutsuchi', desc: 'acero de la fragua: más daño con el ritmo de la katana', price: 850, tier: 1.25, dmg: 1.28, reach: 0.1, speed: 1, len: 1.04, glow: 0xff6c31, steel: 0x815643,
    fx: { glow: 0xff6e2e, hot: 0xffd184, cool: 0xff4817, gravity: 10, halo: 1.35, trail: 1.5, sparks: [0xff4b25, 0xff9827, 0xffdd69] } },
  { id: 'yari', name: 'Yari del peregrino', desc: 'lanza de fresno: estocadas rectas y barrido con el golpe fuerte', form: 'spear', price: 1000, tier: 1.25, dmg: 1.17, reach: 1.6, speed: 1, len: 0.51, glow: 0x60ddbb, steel: 0x659fa0,
    fx: { glow: 0x64e4cf, hot: 0xbbffec, cool: 0x3095b5, gravity: 4, halo: 1.3, trail: 1.45, sparks: [0x57f1c0, 0x63cfff, 0xc1ff76] } },
  { id: 'nodachi',  name: 'Nodachi',           desc: 'hoja larguísima: alcanza lejos y pega fuerte, pero es lenta', price: 1200, tier: 1.5, dmg: 1.45, reach: 1.2, speed: 1.28, len: 1.6, glow: 0x30e0ff, steel: 0xe0fcff,
    fx: { glow: 0x40f0ff, hot: 0xc8ffff, cool: 0x0090ff, gravity: 4, halo: 1.4, trail: 1.8, sparks: [0x28e7ff, 0x548bff, 0x91fff5] } },
  { id: 'sakura', name: 'Aguja de Sakura', desc: 'hoja corta de acero rosado, la más rápida de Masa', price: 1750, tier: 1.65, dmg: 1.08, reach: 0, speed: 0.64, len: 0.79, glow: 0xff72ad, steel: 0xa9637b,
    fx: { glow: 0xff6fb3, hot: 0xffc3dd, cool: 0xe43f8a, gravity: 1.2, halo: 1.25, trail: 1.65, sparks: [0xff74b7, 0xe65bff, 0xffbcaa], extra: 'feathers' } },
  { id: 'golondrinas', name: 'Dos Golondrinas', desc: 'espadas cortas dobles: dos tajos alternos y un remate cruzado', form: 'dual', price: 1900, tier: 1.7, dmg: 1.25, reach: -0.55, speed: 0.9, len: 0.60, glow: 0x77b9ff, steel: 0x7096a8,
    fx: { glow: 0x79c2ff, hot: 0xd9eaff, cool: 0x575ac6, gravity: 2, halo: 1.25, trail: 1.55, sparks: [0x54d8ff, 0x7d8bff, 0xe996ff] } },
  { id: 'espada-forja', name: 'Mandoble de la fragua', desc: 'espada de hoja ancha: tajos lentos y pesados que abren la guardia', form: 'broad', price: 2150, tier: 1.85, dmg: 1.68, reach: 0.4, speed: 1.15, len: 1.15, glow: 0xff9949, steel: 0x95716a,
    fx: { glow: 0xff8b42, hot: 0xffd5a3, cool: 0xd14f27, gravity: 9, halo: 1.4, trail: 1.8, sparks: [0xff7437, 0xffc14d, 0xf46474] } },
  { id: 'muramasa', name: 'Hoja de Muramasa',  desc: 'sedienta: cada oni que cortas te cura 3',            price: 2400, tier: 2, dmg: 1.6, reach: 0.2, speed: 0.95, len: 1.1,  glow: 0xff1030, steel: 0x501018, heal: 3,
    fx: { glow: 0xff2040, hot: 0xff6060, cool: 0xd90c39, gravity: 16, halo: 1.6, trail: 2, sparks: [0xff254a, 0xff5786, 0xbf54ff], extra: 'blood' } },
  { id: 'marea', name: 'Filo de Marea', desc: 'acero oceánico: buen alcance con un tajo ágil', price: 2850, tier: 2.15, dmg: 1.35, reach: 0.9, speed: 0.88, len: 1.4, glow: 0x19dfab, steel: 0x4b9f99,
    fx: { glow: 0x29f4c6, hot: 0xb5ffe5, cool: 0x158dff, gravity: 4.5, halo: 1.45, trail: 1.9, sparks: [0x24ffc3, 0x39afff, 0x82ff76] } },
  { id: 'raiken',   name: 'Raiken de Raijin',  desc: 'cada golpe que acierta carga el rayo',              price: 3600, tier: 2.45, dmg: 1.5, reach: 0.3, speed: 0.9,  len: 1.15, glow: 0xffe020, steel: 0xfffbe0, charge: 0.035,
    fx: { glow: 0xffe840, hot: 0xfff8b5, cool: 0x2a7aff, gravity: 3, halo: 1.6, trail: 2, sparks: [0xffdf36, 0x73ddff, 0x6f87ff], extra: 'bolts' } },
  { id: 'yari-marea', name: 'Lanza de la Marea', desc: 'punta de acero azulado: alcanza lejos y carga el rayo al acertar', form: 'spear', price: 4100, tier: 2.55, dmg: 1.55, reach: 2.05, speed: 1.04, len: 0.67, glow: 0x328dff, steel: 0x85b7d5, charge: 0.018,
    fx: { glow: 0x68aaff, hot: 0xc3edff, cool: 0x5e56fc, gravity: 3, halo: 1.55, trail: 1.85, sparks: [0x47b8ff, 0x7465ff, 0x50ffd2] } },
  { id: 'susanoo', name: 'Colmillo de Susanoo', desc: 'hoja pesada de tormenta: gran daño y largo alcance', price: 4900, tier: 2.7, dmg: 2.02, reach: 1.5, speed: 1.32, len: 1.72, glow: 0x635bff, steel: 0x5b618a,
    fx: { glow: 0x7473ff, hot: 0xaabfff, cool: 0x5841ff, gravity: 6, halo: 1.7, trail: 2.15, sparks: [0x7364ff, 0x41acff, 0xed6dff], extra: 'bolts' } },
  { id: 'gemelas-ocaso', name: 'Gemelas del Ocaso', desc: 'filos gemelos de laca oscura: sucesión rápida y remate en cruz', form: 'dual', price: 5400, tier: 2.8, dmg: 1.55, reach: -0.45, speed: 0.82, len: 0.66, glow: 0xf25fa9, steel: 0x7b5a79,
    fx: { glow: 0xf774c2, hot: 0xffbfd6, cool: 0xb351ff, gravity: 2, halo: 1.5, trail: 1.9, sparks: [0xff72ad, 0xf06bff, 0xffb16f] } },
  { id: 'masamune', name: 'Hoja de Masamune',  desc: 'la obra maestra: corta como ninguna',               price: 6000, tier: 3, dmg: 2.3, reach: 0.6, speed: 0.85, len: 1.25, glow: 0xfff0b0, steel: 0xffffff,
    fx: { glow: 0xfff4c8, hot: 0xffffff, cool: 0xffb020, gravity: 2, halo: 2, trail: 2.4, sparks: [0xffd167, 0xff9854, 0xf9eeac], extra: 'stars' } },
  { id: 'espada-montana', name: 'Quebramontes', desc: 'gran hoja ancha: tajo fuerte de gran daño y barrido amplio', form: 'broad', price: 6700, tier: 3, dmg: 2.28, reach: 0.7, speed: 1.23, len: 1.34, glow: 0xffbd6a, steel: 0xb4a099,
    fx: { glow: 0xffad61, hot: 0xffe7b1, cool: 0xf66d42, gravity: 8, halo: 1.8, trail: 2.15, sparks: [0xff985d, 0xffd664, 0xff648f] } },
  { id: 'aurora', name: 'Espada de la Aurora', desc: 'hoja iridiscente: tajos veloces que también cargan el rayo', price: 7900, tier: 3, dmg: 1.85, reach: 0.5, speed: 0.76, len: 1.2, glow: 0x5afdd2, steel: 0xa7d4dc, charge: 0.02,
    fx: { glow: 0x83ffe5, hot: 0xbaffed, cool: 0xaf53ff, gravity: 1.5, halo: 1.8, trail: 2.2, sparks: [0x32ffc2, 0x4ebaff, 0xff67e6], extra: 'stars' } }
];
const byId = new Map(WEAPONS.map(w => [w.id, w]));
export const weapon = () => byId.get(state.weapon) || WEAPONS[0];
export const owns = (id: string) => state.owned.includes(id);

/** a line of numbers for the shop: compared with the plain katana */
export function weaponStats(w: Weapon) {
  const sp = w.form === 'broad' ? 'lenta' : w.form === 'dual' ? 'doble tajo' : w.speed < 0.8 ? 'muy rápida' : w.speed < 0.97 ? 'rápida' : w.speed > 1.15 ? 'lenta' : 'normal';
  const reach = w.reach ? `${w.reach > 0 ? '+' : '−'}${Math.abs(w.reach).toFixed(1)} m` : 'normal';
  return `daño x${w.dmg.toFixed(2).replace(/\.?0+$/, '')} · alcance ${reach} · ${sp}`;
}

export function buy(w: Weapon): 'ok' | 'poor' | 'owned' {
  if (owns(w.id)) return 'owned';
  if (state.mon < w.price) return 'poor';
  state.mon -= w.price; state.owned.push(w.id); equip(w.id);
  return 'ok';
}
export function equip(id: string) {
  if (!owns(id)) return;
  if (state.weapon !== id) { player.attackT = -1; player.lastAttackEnd = -9; }
  state.weapon = id;
  applyWeapon();
}
/** Q: the next blade you own */
export function cycleWeapon() {
  if (state.owned.length < 2) return null;
  const list = WEAPONS.filter(w => owns(w.id)), i = list.findIndex(w => w.id === state.weapon);
  equip(list[(i + 1) % list.length].id);
  return weapon();
}
export function resetWeapons() { state.owned = ['katana']; state.weapon = 'katana'; applyWeapon(); }

// ------------------------------------------------------------ the blade mesh
let displayed = WEAPONS[0];
export const displayedWeapon = () => displayed;
/** katana-space z of the blade's tip (the trail and sparks follow it) */
export const tipZ = (w: Weapon) => BLADE_LAYOUT[w.form ?? 'katana'].base + BLADE_PROFILE.length * w.len;
export function applyWeapon(w = weapon()) {
  displayed = w;
  showWeaponModel(w.form ?? 'katana', w.len);
  bladeMat.color.set(w.steel); bladeMat.emissive.set(w.glow);
}
applyWeapon();
