// Blades sold by Masa, the smith of Kiri (shop.ts). Each one cuts differently: damage, reach, speed and
// a gift of its own. Bought with mon; like the chest upgrades, they are lost when you fall.
// player.ts reads the current blade through the helpers below; applyWeapon() reshapes the katana mesh.
import * as THREE from 'three';
import { sam, bladeMat } from './avatar';
import { state } from './state';

export interface Weapon {
  id: string; name: string; desc: string; price: number;
  /** damage multiplier, extra reach (m), attack duration multiplier (<1 = faster) */
  dmg: number; reach: number; speed: number;
  /** blade length multiplier, glow and steel colours */
  len: number; glow: number; steel: number;
  /** life healed per oni struck, lightning charge per oni struck */
  heal?: number; charge?: number;
}
export const WEAPONS: Weapon[] = [
  { id: 'katana',   name: 'Katana del ronin',  desc: 'la de siempre: equilibrada',                        price: 0,    dmg: 1,   reach: 0,   speed: 1,    len: 1,    glow: 0xa6dcff, steel: 0xf4f9ff },
  { id: 'kogarasu', name: 'Kogarasu-maru',     desc: 'ligera como un cuervo: tajos mucho más rápidos',    price: 600,  dmg: 1.1, reach: 0,   speed: 0.72, len: 0.88, glow: 0x9a7cff, steel: 0x6a6a7a },
  { id: 'nodachi',  name: 'Nodachi',           desc: 'hoja larguísima: alcanza lejos y pega fuerte, pero es lenta', price: 1200, dmg: 1.45, reach: 1.2, speed: 1.28, len: 1.6, glow: 0xd8f0ff, steel: 0xffffff },
  { id: 'muramasa', name: 'Hoja de Muramasa',  desc: 'sedienta: cada oni que cortas te cura 3',            price: 2400, dmg: 1.6, reach: 0.2, speed: 0.95, len: 1.1,  glow: 0xff2a2a, steel: 0xffd0d0, heal: 3 },
  { id: 'raiken',   name: 'Raiken de Raijin',  desc: 'cada golpe que acierta carga el rayo',              price: 3600, dmg: 1.5, reach: 0.3, speed: 0.9,  len: 1.15, glow: 0xffe84a, steel: 0xfff8d0, charge: 0.035 },
  { id: 'masamune', name: 'Hoja de Masamune',  desc: 'la obra maestra: corta como ninguna',               price: 6000, dmg: 2.3, reach: 0.6, speed: 0.85, len: 1.25, glow: 0xffffff, steel: 0xffffff }
];
const byId = new Map(WEAPONS.map(w => [w.id, w]));
export const weapon = () => byId.get(state.weapon) || WEAPONS[0];
export const owns = (id: string) => state.owned.includes(id);

/** a line of numbers for the shop: compared with the plain katana */
export function weaponStats(w: Weapon) {
  const sp = w.speed < 0.8 ? 'muy rápida' : w.speed < 0.97 ? 'rápida' : w.speed > 1.15 ? 'lenta' : 'normal';
  return `daño x${w.dmg.toFixed(2).replace(/\.?0+$/, '')} · alcance ${w.reach ? '+' + w.reach.toFixed(1) + ' m' : 'normal'} · ${sp}`;
}

export function buy(w: Weapon): 'ok' | 'poor' | 'owned' {
  if (owns(w.id)) return 'owned';
  if (state.mon < w.price) return 'poor';
  state.mon -= w.price; state.owned.push(w.id); equip(w.id);
  return 'ok';
}
export function equip(id: string) { if (owns(id)) { state.weapon = id; applyWeapon(); } }
/** Q: the next blade you own */
export function cycleWeapon() {
  if (state.owned.length < 2) return null;
  const list = WEAPONS.filter(w => owns(w.id)), i = list.findIndex(w => w.id === state.weapon);
  equip(list[(i + 1) % list.length].id);
  return weapon();
}
export function resetWeapons() { state.owned = ['katana']; state.weapon = 'katana'; applyWeapon(); }

// ------------------------------------------------------------ the blade mesh
const BLADE_BASE = 0.162, BLADE_TIP = 0.86;   // where the blade starts / ends along the katana (samurai.ts bladeGeometry)
let blade: THREE.Mesh | null = null;
sam.katana.traverse(o => { const m = o as THREE.Mesh; if (m.isMesh && m.geometry.type === 'ExtrudeGeometry') blade = m; });
/** katana-space z of the blade's tip (the trail and sparks follow it) */
export const tipZ = () => BLADE_BASE + (BLADE_TIP - BLADE_BASE) * weapon().len;
export function applyWeapon() {
  const w = weapon();
  if (blade) { blade.scale.z = w.len; blade.position.z = BLADE_BASE * (1 - w.len); }
  bladeMat.color.set(w.steel); bladeMat.emissive.set(w.glow);
}
applyWeapon();
