// Blades sold by Masa, the smith of Kiri (shop.ts). Each one cuts differently: damage, reach, speed and
// a gift of its own. The sōhei's staves are here too: each class only wields its own forms (classes.ts). Bought with mon; like the chest upgrades, they are lost when you fall.
// player.ts reads the current blade through the helpers below; applyWeapon() reshapes the katana mesh.
import { bladeMat, showWeaponModel } from './avatar';
import { BLADE_PROFILE } from './samurai';
import { player, state } from './state';
import { canWield, cls } from './classes';
import { BLADE_LAYOUT } from './weapon-models';
import type { WeaponForm } from './types';
import type { BladeLook } from './blade-looks';
import type { MangaBlade } from './manga-swords';
import type { ClassId } from './classes';
import { CLASS_ARSENAL } from './arsenal';
import { LEVEL_REQ } from './progression';
import { readVault, saveVault, vaultReady } from './vault';
import { weaponDmg, weaponLevel, weaponReach, weaponSpeed } from './weapon-upgrades';

export interface Weapon {
  id: string; name: string; desc: string; price: number; tier: number;
  /** exclusive relic dropped by defeating a major boss (not sold by Masa; wieldable by any class) */
  bossDrop?: boolean;
  form?: WeaponForm;
  /** a sword from across the sea in the katana's slot (blade-looks.ts), a bespoke Japanese manga broadsword
   *  (manga-swords.ts), and the class it was forged for (classes.ts canWield) */
  look?: BladeLook; mangaModel?: MangaBlade; cls?: ClassId;
  /** the level Masa asks before he sells it (folded into progression.ts LEVEL_REQ below) */
  lv?: number;
  /** damage multiplier, extra reach (m), attack duration multiplier (<1 = faster) */
  dmg: number; reach: number; speed: number;
  /** blade length multiplier, optional width multiplier, glow and steel colours */
  len: number; width?: number; glow: number; steel: number;
  /** life healed per oni struck, lightning charge per oni struck */
  heal?: number; charge?: number;
  /** staves: how long each blow dazes the oni it strikes (multiplier) */
  daze?: number;
  /** how it shines in use (katana-fx.ts): trail / halo / arc colour, sparks hot → cool, spark gravity,
   *  halo thickness, how bright the trail is, and a flourish of its own */
  fx: {
    glow: number; hot: number; cool: number; gravity: number; halo: number; trail: number;
    sparks?: readonly [number, number, number];
    extra?: 'bolts' | 'blood' | 'feathers' | 'stars' | 'flames';
  };
}
export const WEAPONS: Weapon[] = [
  { id: 'katana',   name: 'Katana del ronin',  desc: 'la de siempre: equilibrada',                        price: 0, tier: 0,    dmg: 1,   reach: 0,   speed: 1,    len: 1,    glow: 0xa6dcff, steel: 0xf4f9ff,
    fx: { glow: 0xbfe4ff, hot: 0xfff0a0, cool: 0xff7a10, gravity: 9, halo: 1, trail: 1 } },
  { id: 'kogarasu', name: 'Kogarasu-maru',     desc: 'ligera como un cuervo: tajos mucho más rápidos',    price: 1200, tier: 1,  dmg: 1.1, reach: 0,   speed: 0.72, len: 0.88, glow: 0xb04aff, steel: 0x3a3048,
    fx: { glow: 0xb85cff, hot: 0xf0c8ff, cool: 0x7d36e0, gravity: 1.5, halo: 1.3, trail: 1.6, sparks: [0xb56aff, 0x7777ff, 0xff82e1], extra: 'feathers' } },
  { id: 'kagutsuchi', name: 'Brasa de Kagutsuchi', desc: 'acero de la fragua: más daño con el ritmo de la katana', price: 1700, tier: 1.25, dmg: 1.28, reach: 0.1, speed: 1, len: 1.04, glow: 0xff6c31, steel: 0x815643,
    fx: { glow: 0xff6e2e, hot: 0xffd184, cool: 0xff4817, gravity: 10, halo: 1.35, trail: 1.5, sparks: [0xff4b25, 0xff9827, 0xffdd69] } },
  { id: 'yari', name: 'Yari del peregrino', desc: 'lanza de fresno: estocadas rectas y barrido con el golpe fuerte', form: 'spear', price: 2000, tier: 1.25, dmg: 1.17, reach: 1.6, speed: 1, len: 0.51, glow: 0x60ddbb, steel: 0x659fa0,
    fx: { glow: 0x64e4cf, hot: 0xbbffec, cool: 0x3095b5, gravity: 4, halo: 1.3, trail: 1.45, sparks: [0x57f1c0, 0x63cfff, 0xc1ff76] } },
  { id: 'nodachi',  name: 'Nodachi',           desc: 'hoja larguísima: alcanza lejos y pega fuerte, pero es lenta', price: 2400, tier: 1.5, dmg: 1.45, reach: 1.2, speed: 1.28, len: 1.6, glow: 0x30e0ff, steel: 0xe0fcff,
    fx: { glow: 0x40f0ff, hot: 0xc8ffff, cool: 0x0090ff, gravity: 4, halo: 1.4, trail: 1.8, sparks: [0x28e7ff, 0x548bff, 0x91fff5] } },
  { id: 'sakura', name: 'Aguja de Sakura', desc: 'hoja corta de acero rosado, la más rápida de Masa', price: 3500, tier: 1.65, dmg: 1.08, reach: 0, speed: 0.64, len: 0.79, glow: 0xff72ad, steel: 0xa9637b,
    fx: { glow: 0xff6fb3, hot: 0xffc3dd, cool: 0xe43f8a, gravity: 1.2, halo: 1.25, trail: 1.65, sparks: [0xff74b7, 0xe65bff, 0xffbcaa], extra: 'feathers' } },
  { id: 'golondrinas', name: 'Dos Golondrinas', desc: 'espadas cortas dobles: dos tajos alternos y un remate cruzado', form: 'dual', price: 3800, tier: 1.7, dmg: 1.25, reach: -0.55, speed: 0.9, len: 0.60, glow: 0x77b9ff, steel: 0x7096a8,
    fx: { glow: 0x79c2ff, hot: 0xd9eaff, cool: 0x575ac6, gravity: 2, halo: 1.25, trail: 1.55, sparks: [0x54d8ff, 0x7d8bff, 0xe996ff] } },
  { id: 'espada-forja', name: 'Mandoble de la fragua', desc: 'espada de hoja ancha: tajos lentos y pesados que abren la guardia', form: 'broad', price: 4300, tier: 1.85, dmg: 1.68, reach: 0.4, speed: 1.15, len: 1.15, width: 0.92, glow: 0xff9949, steel: 0x95716a,
    fx: { glow: 0xff8b42, hot: 0xffd5a3, cool: 0xd14f27, gravity: 9, halo: 1.4, trail: 1.8, sparks: [0xff7437, 0xffc14d, 0xf46474] } },
  { id: 'muramasa', name: 'Hoja de Muramasa',  desc: 'sedienta: cada oni que cortas te cura 3',            price: 4800, tier: 2, dmg: 1.6, reach: 0.2, speed: 0.95, len: 1.1,  glow: 0xff1030, steel: 0x501018, heal: 3,
    fx: { glow: 0xff2040, hot: 0xff6060, cool: 0xd90c39, gravity: 16, halo: 1.6, trail: 2, sparks: [0xff254a, 0xff5786, 0xbf54ff], extra: 'blood' } },
  { id: 'marea', name: 'Filo de Marea', desc: 'acero oceánico: buen alcance con un tajo ágil', price: 5700, tier: 2.15, dmg: 1.35, reach: 0.9, speed: 0.88, len: 1.4, glow: 0x19dfab, steel: 0x4b9f99,
    fx: { glow: 0x29f4c6, hot: 0xb5ffe5, cool: 0x158dff, gravity: 4.5, halo: 1.45, trail: 1.9, sparks: [0x24ffc3, 0x39afff, 0x82ff76] } },
  { id: 'raiken',   name: 'Raiken de Raijin',  desc: 'cada golpe que acierta carga el rayo',              price: 7200, tier: 2.45, dmg: 1.5, reach: 0.3, speed: 0.9,  len: 1.15, glow: 0xffe020, steel: 0xfffbe0, charge: 0.035,
    fx: { glow: 0xffe840, hot: 0xfff8b5, cool: 0x2a7aff, gravity: 3, halo: 1.6, trail: 2, sparks: [0xffdf36, 0x73ddff, 0x6f87ff], extra: 'bolts' } },
  { id: 'yari-marea', name: 'Lanza de la Marea', desc: 'punta de acero azulado: alcanza lejos y carga el rayo al acertar', form: 'spear', price: 8200, tier: 2.55, dmg: 1.55, reach: 2.05, speed: 1.04, len: 0.67, glow: 0x328dff, steel: 0x85b7d5, charge: 0.018,
    fx: { glow: 0x68aaff, hot: 0xc3edff, cool: 0x5e56fc, gravity: 3, halo: 1.55, trail: 1.85, sparks: [0x47b8ff, 0x7465ff, 0x50ffd2] } },
  { id: 'susanoo', name: 'Colmillo de Susanoo', desc: 'hoja pesada de tormenta: gran daño y largo alcance', price: 9800, tier: 2.7, dmg: 2.02, reach: 1.5, speed: 1.32, len: 1.72, glow: 0x635bff, steel: 0x5b618a,
    fx: { glow: 0x7473ff, hot: 0xaabfff, cool: 0x5841ff, gravity: 6, halo: 1.7, trail: 2.15, sparks: [0x7364ff, 0x41acff, 0xed6dff], extra: 'bolts' } },
  { id: 'gemelas-ocaso', name: 'Gemelas del Ocaso', desc: 'filos gemelos de laca oscura: sucesión rápida y remate en cruz', form: 'dual', price: 10800, tier: 2.8, dmg: 1.55, reach: -0.45, speed: 0.82, len: 0.66, glow: 0xf25fa9, steel: 0x7b5a79,
    fx: { glow: 0xf774c2, hot: 0xffbfd6, cool: 0xb351ff, gravity: 2, halo: 1.5, trail: 1.9, sparks: [0xff72ad, 0xf06bff, 0xffb16f] } },
  { id: 'masamune', name: 'Hoja de Masamune',  desc: 'la obra maestra: corta como ninguna',               price: 12000, tier: 3, dmg: 2.3, reach: 0.6, speed: 0.85, len: 1.25, glow: 0xfff0b0, steel: 0xffffff,
    fx: { glow: 0xfff4c8, hot: 0xffffff, cool: 0xffb020, gravity: 2, halo: 2, trail: 2.4, sparks: [0xffd167, 0xff9854, 0xf9eeac], extra: 'stars' } },
  { id: 'espada-montana', name: 'Quebramontes', desc: 'gran hoja ancha: tajo fuerte de gran daño y barrido amplio', form: 'broad', price: 13400, tier: 3, dmg: 2.28, reach: 0.7, speed: 1.23, len: 1.34, width: 1.05, glow: 0xffbd6a, steel: 0xb4a099,
    fx: { glow: 0xffad61, hot: 0xffe7b1, cool: 0xf66d42, gravity: 8, halo: 1.8, trail: 2.15, sparks: [0xff985d, 0xffd664, 0xff648f] } },
  { id: 'aurora', name: 'Espada de la Aurora', desc: 'hoja iridiscente: tajos veloces que también cargan el rayo', price: 15800, tier: 3, dmg: 1.85, reach: 0.5, speed: 0.76, len: 1.2, glow: 0x5afdd2, steel: 0xa7d4dc, charge: 0.02,
    fx: { glow: 0x83ffe5, hot: 0xbaffed, cool: 0xaf53ff, gravity: 1.5, halo: 1.8, trail: 2.2, sparks: [0x32ffc2, 0x4ebaff, 0xff67e6], extra: 'stars' } },
  // ---- legendary blades: Masa only forges them for a ronin of high enough level (progression.ts LEVEL_REQ)
  { id: 'kusanagi', name: 'Kusanagi-no-Tsurugi', desc: 'la espada que segó el viento: cada golpe carga la técnica y cierra heridas', price: 16000, tier: 3, dmg: 2.55, reach: 0.7, speed: 0.8, len: 1.22, glow: 0x7dffb0, steel: 0xe9fff2, heal: 1, charge: 0.025,
    fx: { glow: 0x8affc0, hot: 0xeafff2, cool: 0x2fd08a, gravity: 1.5, halo: 2, trail: 2.4, sparks: [0x6dffb2, 0xc8ff7a, 0x5ee0ff], extra: 'stars' } },
  { id: 'ame-nuboko', name: 'Ame-no-Nuboko', desc: 'la lanza enjoyada que agitó el mar primordial: alcance enorme y rayo', form: 'spear', price: 19000, tier: 3, dmg: 2.4, reach: 2.5, speed: 0.95, len: 0.72, glow: 0xff7ae0, steel: 0xf3d7ff, charge: 0.025,
    fx: { glow: 0xff8ae6, hot: 0xffe0fa, cool: 0x8a5cff, gravity: 2, halo: 1.9, trail: 2.3, sparks: [0xff7ae0, 0x9d7bff, 0x7af0ff], extra: 'bolts' } },
  { id: 'hoo-tsubasa', name: 'Alas del Hō-ō', desc: 'filos gemelos del fénix: rapidísimos, y cada oni cortado te cura 2', form: 'dual', price: 23000, tier: 3, dmg: 2.3, reach: -0.35, speed: 0.72, len: 0.7, glow: 0xff9a2a, steel: 0xffe1a8, heal: 2,
    fx: { glow: 0xffa53a, hot: 0xfff0b0, cool: 0xff3d1a, gravity: -2, halo: 2, trail: 2.4, sparks: [0xffb03a, 0xff5a2a, 0xffe57a], extra: 'feathers' } },
  { id: 'tenrai', name: 'Tenrai, quiebracielos', desc: 'hoja ancha forjada en una tormenta: golpes devastadores que cargan el rayo', form: 'broad', price: 27000, tier: 3, dmg: 3.2, reach: 0.9, speed: 1.12, len: 1.4, width: 1.15, glow: 0x9fd4ff, steel: 0xf0f6ff, charge: 0.03,
    fx: { glow: 0xb0dcff, hot: 0xffffff, cool: 0x4a6bff, gravity: 3, halo: 2.1, trail: 2.5, sparks: [0xbfe6ff, 0x6f8bff, 0xfff3a0], extra: 'bolts' } },
  { id: 'mugen', name: 'Mugen, filo del vacío', desc: 'la hoja de la leyenda: corta la nada, cura, carga y alcanza lejos', price: 32000, tier: 3, dmg: 3.6, reach: 1, speed: 0.76, len: 1.32, glow: 0xffffff, steel: 0x1a1424, heal: 3, charge: 0.03,
    fx: { glow: 0xf4eaff, hot: 0xffffff, cool: 0xb06aff, gravity: 0.5, halo: 2.4, trail: 2.8, sparks: [0xffffff, 0xd6a8ff, 0xffd98a], extra: 'stars' } },
  // ---- new sword archetypes: rapier (estoque), odachi (gran sable colosal), cleaver (zanbatō monumental)
  { id: 'estoque-plata', name: 'Aguja de Plata', desc: 'estoque de hoja finísima: estocadas veloces, ráfaga triple y embestida relámpago', form: 'rapier', price: 1500, tier: 1.15, dmg: 1.12, reach: 0.55, speed: 0.80, len: 1.15, width: 0.9, glow: 0x6cd8ff, steel: 0xdceeff,
    fx: { glow: 0x7ce4ff, hot: 0xe8fbff, cool: 0x2a88ff, gravity: 2.5, halo: 1.15, trail: 1.45, sparks: [0x7ce4ff, 0xb8f0ff, 0x5c9eff] } },
  { id: 'odachi-niebla', name: 'Ōdachi de la Niebla', desc: 'gran sable curvo de hoja media y gran alcance: tajo ascendente y barrido circular', form: 'odachi', price: 2800, tier: 1.55, dmg: 1.48, reach: 1.15, speed: 1.14, len: 1.52, width: 0.92, glow: 0x3ef5c4, steel: 0x66a8a2,
    fx: { glow: 0x4cffd0, hot: 0xc8fff0, cool: 0x149c88, gravity: 4, halo: 1.45, trail: 1.85, sparks: [0x3ef5c4, 0x76e0ff, 0xa8ffda] } },
  { id: 'zanbato-hierro', name: 'Zanbatō de Hierro Negro', desc: 'cuchilla monumental más ancha que el mandoble: gancho ascendente y golpe sísmico', form: 'cleaver', price: 4600, tier: 1.9, dmg: 1.85, reach: 0.6, speed: 1.24, len: 1.24, width: 0.92, glow: 0xff5e24, steel: 0x383336,
    fx: { glow: 0xff6e32, hot: 0xffd296, cool: 0xb82c10, gravity: 11, halo: 1.55, trail: 1.9, sparks: [0xff5e24, 0xffa838, 0xff3b4e] } },
  { id: 'estoque-ambar', name: 'Aguijón de Ámbar', desc: 'estoque dorado de gran alcance: estocadas eléctricas que cargan el rayo', form: 'rapier', price: 6400, tier: 2.3, dmg: 1.52, reach: 0.8, speed: 0.78, len: 1.28, width: 1.05, glow: 0xffb82e, steel: 0xc9933a, charge: 0.022,
    fx: { glow: 0xffc646, hot: 0xfff2ba, cool: 0xd96e14, gravity: 2, halo: 1.45, trail: 1.8, sparks: [0xffc646, 0xffe885, 0x6ec6ff], extra: 'bolts' } },
  { id: 'odachi-carmesi', name: 'Segadora Carmesí', desc: 'ōdachi ancho de acero carmesí: gran alcance, barrido amplio y cura 2 por golpe', form: 'odachi', price: 8800, tier: 2.6, lv: 15, dmg: 1.98, reach: 1.45, speed: 1.12, len: 1.70, width: 1.12, glow: 0xff2854, steel: 0x5c1422, heal: 2,
    fx: { glow: 0xff3a66, hot: 0xff9eb4, cool: 0xb8082c, gravity: 12, halo: 1.75, trail: 2.1, sparks: [0xff2854, 0xff6a8a, 0xc246ff], extra: 'blood' } },
  { id: 'zanbato-jade', name: 'Tajamontañas de Jade', desc: 'hoja colosal de jade forjado: aplasta la guardia y cada oni golpeado te cura 2', form: 'cleaver', price: 11400, tier: 2.85, lv: 18, dmg: 2.38, reach: 0.85, speed: 1.22, len: 1.36, width: 1.06, glow: 0x38ff9a, steel: 0x266c54, heal: 2,
    fx: { glow: 0x48ffa6, hot: 0xd2ffe6, cool: 0x109458, gravity: 9, halo: 1.85, trail: 2.2, sparks: [0x38ff9a, 0x9eff6e, 0x4ee6ff] } },
  { id: 'estoque-estrella', name: 'Alfiler del Lucero', desc: 'estoque astral ultrafino: embestida fulgurante que cura y carga la técnica', form: 'rapier', price: 17500, tier: 3, lv: 45, dmg: 2.35, reach: 1.0, speed: 0.72, len: 1.40, width: 0.82, glow: 0x6ff8ff, steel: 0xe8f4ff, heal: 1, charge: 0.025,
    fx: { glow: 0x8affff, hot: 0xffffff, cool: 0x8e5cff, gravity: 1, halo: 1.95, trail: 2.35, sparks: [0x6ff8ff, 0xd48aff, 0xfff2a8], extra: 'stars' } },
  { id: 'odachi-eclipse', name: 'Ōdachi del Eclipse', desc: 'hoja colosal de obsidiana y oro: el mayor arco de espada, carga la técnica al cortar', form: 'odachi', price: 21000, tier: 3, lv: 60, dmg: 2.85, reach: 1.70, speed: 1.06, len: 1.84, width: 1.25, glow: 0xc266ff, steel: 0x1e1430, charge: 0.025,
    fx: { glow: 0xcf7eff, hot: 0xf4dcff, cool: 0x6a22d8, gravity: 2, halo: 2.1, trail: 2.5, sparks: [0xc266ff, 0xffd266, 0x70c6ff], extra: 'stars' } },
  { id: 'zanbato-sol', name: 'Hendedor del Sol Negro', desc: 'la hoja más ancha y temible: saltos sísmicos que aturden y cargan el rayo', form: 'cleaver', price: 25000, tier: 3, lv: 75, dmg: 3.35, reach: 1.05, speed: 1.18, len: 1.46, width: 1.18, glow: 0xffc636, steel: 0x1a1210, charge: 0.025, daze: 1.2,
    fx: { glow: 0xffd04a, hot: 0xfff5c0, cool: 0xd84414, gravity: 6, halo: 2.25, trail: 2.6, sparks: [0xffc636, 0xff6a2a, 0xffffff], extra: 'bolts' } },
  // ---- bespoke Japanese manga broad-blade greatswords (manga-swords.ts)
  { id: 'matadragones', name: 'Matadragones de Hierro', desc: 'espadón colosal de doble filo con doble hueco: golpes sísmicos y chispa eléctrica por toda la hoja', form: 'cleaver', mangaModel: 'buster', price: 3400, tier: 1.75, dmg: 1.78, reach: 0.85, speed: 1.22, len: 1.42, width: 1.1, glow: 0x5ec8ff, steel: 0x2e323c,
    fx: { glow: 0x70d6ff, hot: 0xe6f8ff, cool: 0x2b6bff, gravity: 7, halo: 1.65, trail: 2.0, sparks: [0x70d6ff, 0xffffff, 0x5282ff], extra: 'bolts' } },
  { id: 'carmesi-sangre', name: 'Lágrima Carmesí', desc: 'gran hoja ancha rojo sangre de diseño manga: sus chispas caen como gotas de sangre y cura 3 por golpe', form: 'broad', mangaModel: 'executioner', price: 4200, tier: 2.05, dmg: 1.92, reach: 0.9, speed: 1.16, len: 1.38, width: 1.08, glow: 0xff1024, steel: 0x7a0814, heal: 3,
    fx: { glow: 0xff182e, hot: 0xff4c5c, cool: 0x8a0010, gravity: 18, halo: 1.8, trail: 2.2, sparks: [0xff1428, 0xb80014, 0xff4a58], extra: 'blood' } },
  { id: 'colmillo-oni', name: 'Colmillo de Oni', desc: 'espadón demoníaco dentado de hoja ancha: desgarra la guardia y aturde con chispas violeta', form: 'cleaver', mangaModel: 'fang', price: 7600, tier: 2.45, dmg: 2.15, reach: 0.95, speed: 1.20, len: 1.40, width: 1.12, glow: 0xd440ff, steel: 0x341c44, daze: 1.3,
    fx: { glow: 0xe054ff, hot: 0xffc8ff, cool: 0x6b14b8, gravity: 6, halo: 1.85, trail: 2.2, sparks: [0xe048ff, 0x8a38ff, 0xff70c8], extra: 'bolts' } },
  { id: 'verdugo-luna', name: 'Cortadora de la Luna Llena', desc: 'hoja ancha con eclipse tallado en el acero: alcance enorme y carga la técnica al cortar', form: 'cleaver', mangaModel: 'executioner', price: 14800, tier: 3, lv: 25, dmg: 2.65, reach: 1.15, speed: 1.16, len: 1.50, width: 1.15, glow: 0x9ab4ff, steel: 0xdbe6ff, charge: 0.025,
    fx: { glow: 0xb4c8ff, hot: 0xffffff, cool: 0x5c6eff, gravity: 2.5, halo: 2.0, trail: 2.4, sparks: [0xc8dcff, 0xffffff, 0x8c7aff], extra: 'stars' } },
  { id: 'alas-eclipse', name: 'Espadón del Serafín Solar', desc: 'gran espada alada de doble filo y gema solar: cura 2 por golpe, carga la técnica y brilla como el sol', form: 'broad', mangaModel: 'winged', price: 19800, tier: 3, lv: 50, dmg: 2.95, reach: 1.1, speed: 1.08, len: 1.46, width: 1.15, glow: 0xffaa28, steel: 0xfff0c2, heal: 2, charge: 0.025,
    fx: { glow: 0xffbe40, hot: 0xffffff, cool: 0xe05810, gravity: 1.5, halo: 2.15, trail: 2.5, sparks: [0xffd44a, 0xff7a1a, 0xffffff], extra: 'feathers' } },
  // ---- four elemental fire blades (katana-fx.ts 'flames' sheath & rising embers)
  { id: 'espada-fuego', name: 'Espada de Fuego', desc: 'hoja envuelta en llamas vivas: tajos ardientes de gran potencia que dejan brasas en el aire', price: 5200, tier: 2.1, dmg: 1.65, reach: 0.35, speed: 0.92, len: 1.16, glow: 0xff5a14, steel: 0x4a1a0c,
    fx: { glow: 0xff6218, hot: 0xfff0a8, cool: 0xd81808, gravity: -3.2, halo: 1.85, trail: 2.25, sparks: [0xff6a1a, 0xffc83c, 0xff2810], extra: 'flames' } },
  { id: 'espada-fuego-verde', name: 'Espada de Fuego Verde', desc: 'hoja de llamas esmeralda espectrales: fuego jade que consume al oni y te cura 2 por golpe', price: 6800, tier: 2.3, dmg: 1.8, reach: 0.4, speed: 0.9, len: 1.2, glow: 0x28ff78, steel: 0x103824, heal: 2,
    fx: { glow: 0x38ff82, hot: 0xe2ffec, cool: 0x0ca848, gravity: -3.4, halo: 1.9, trail: 2.3, sparks: [0x38ff82, 0xa8ff52, 0x18d898], extra: 'flames' } },
  { id: 'espada-fuego-purpura', name: 'Espada de Fuego Púrpura', desc: 'hoja de llamas violetas arcanas: arde con fuego maldito y carga la técnica al cortar', price: 7800, tier: 2.45, dmg: 1.9, reach: 0.45, speed: 0.88, len: 1.22, glow: 0xb438ff, steel: 0x28103c, charge: 0.025,
    fx: { glow: 0xc248ff, hot: 0xf8d8ff, cool: 0x6210c8, gravity: -3.4, halo: 1.95, trail: 2.35, sparks: [0xc850ff, 0xff7ae8, 0x7630ff], extra: 'flames' } },
  { id: 'espada-fuego-blanco', name: 'Espada de Fuego Blanco', desc: 'hoja de fuego blanco incandescente: la llama más pura, veloz, cura 1 y carga la técnica', price: 9400, tier: 2.65, dmg: 2.05, reach: 0.5, speed: 0.86, len: 1.24, glow: 0xffffff, steel: 0xf4f8ff, heal: 1, charge: 0.02,
    fx: { glow: 0xf0f6ff, hot: 0xffffff, cool: 0x9ed4ff, gravity: -3.6, halo: 2.0, trail: 2.4, sparks: [0xffffff, 0xdcf0ff, 0xfff6d6], extra: 'flames' } },
  // ---- the xiákè's arms: the straight jian he starts with, a tiger dao, butterfly swords and a guandao
  { id: 'jian', name: 'Jian de jade', desc: 'espada recta de doble filo con borla roja: rápida y precisa', look: 'jian', cls: 'xia', price: 0, tier: 0, dmg: 1, reach: 0.05, speed: 0.92, len: 1, glow: 0x7dffc0, steel: 0xe6fff3,
    fx: { glow: 0x8affc8, hot: 0xeafff4, cool: 0x2fd08a, gravity: 4, halo: 1.1, trail: 1.25 } },
  { id: 'dao-tigre', name: 'Dao del tigre', desc: 'sable que se ensancha hacia la punta: tajos más pesados', look: 'dao', cls: 'xia', price: 2000, tier: 1.25, dmg: 1.32, reach: 0.1, speed: 1.02, len: 1.02, glow: 0xff9a3a, steel: 0xd8c8b0,
    fx: { glow: 0xffa64a, hot: 0xffe2b0, cool: 0xe0541c, gravity: 9, halo: 1.35, trail: 1.5, sparks: [0xff8a3a, 0xffc85a, 0xff5a3a] } },
  { id: 'mariposa', name: 'Espadas mariposa', desc: 'dos hojas cortas del sur: una lluvia de tajos', form: 'dual', cls: 'xia', price: 4400, tier: 1.85, dmg: 1.5, reach: -0.4, speed: 0.8, len: 0.62, glow: 0xffd060, steel: 0xc8c0a8,
    fx: { glow: 0xffd870, hot: 0xfff4c8, cool: 0xff9a2a, gravity: 2, halo: 1.4, trail: 1.8, sparks: [0xffd060, 0xff9a4a, 0x8affc8] } },
  { id: 'guandao', name: 'Guandao del dragón verde', desc: 'la alabarda de Guan Yu: alcance enorme, y cada golpe carga la técnica', form: 'spear', cls: 'xia', price: 11000, tier: 2.8, dmg: 2.1, reach: 2, speed: 1.08, len: 0.72, glow: 0x5dffb0, steel: 0xb8e6d0, charge: 0.02,
    fx: { glow: 0x6affb8, hot: 0xeafff4, cool: 0x1fa86a, gravity: 3, halo: 1.8, trail: 2.2, sparks: [0x5dffb0, 0xb8ff6a, 0xfff0a0], extra: 'stars' } },
  // ---- the hwarang's arms: the ring-pommel sword he starts with, a woldo, twin swords and the four-tiger sword
  { id: 'hwandu', name: 'Hwandudaedo del hwarang', desc: 'espada recta con pomo de anilla: firme y equilibrada', look: 'hwandu', cls: 'hwarang', price: 0, tier: 0, dmg: 1.05, reach: 0, speed: 0.98, len: 1, glow: 0xff8ab8, steel: 0xf2e6ee,
    fx: { glow: 0xff9ac4, hot: 0xffe6f0, cool: 0xd8447a, gravity: 3, halo: 1.1, trail: 1.25 } },
  { id: 'woldo', name: 'Woldo de la luna', desc: 'alabarda de hoja de media luna: barre lejos', form: 'spear', cls: 'hwarang', price: 2000, tier: 1.25, dmg: 1.25, reach: 1.7, speed: 1.02, len: 0.6, glow: 0xb4a0ff, steel: 0xd0d4f0,
    fx: { glow: 0xbcaaff, hot: 0xf0eaff, cool: 0x6a5aff, gravity: 3, halo: 1.35, trail: 1.5, sparks: [0xb4a0ff, 0xff9ac4, 0x9ad8ff] } },
  { id: 'ssanggeom', name: 'Ssanggeom', desc: 'las espadas gemelas de la danza: rápidas y en cruz', form: 'dual', cls: 'hwarang', price: 4400, tier: 1.85, dmg: 1.55, reach: -0.45, speed: 0.82, len: 0.64, glow: 0xff6a9a, steel: 0xe0c8d4,
    fx: { glow: 0xff7aa8, hot: 0xffe0ec, cool: 0xc8306a, gravity: 2, halo: 1.45, trail: 1.85, sparks: [0xff6a9a, 0xffb0d0, 0xffe08a] } },
  { id: 'sainggeom', name: 'Sainggeom', desc: 'la espada de los cuatro tigres, grabada con estrellas: cura 2 por golpe y carga la técnica', look: 'hwandu', cls: 'hwarang', price: 11000, tier: 2.8, dmg: 2.1, reach: 0.4, speed: 0.88, len: 1.15, glow: 0xffe0a0, steel: 0xfff6e6, heal: 2, charge: 0.02,
    fx: { glow: 0xffe8b0, hot: 0xffffff, cool: 0xff8ab8, gravity: 1, halo: 1.9, trail: 2.3, sparks: [0xffe0a0, 0xff9ac4, 0xb4c8ff], extra: 'stars' } },
  // ---- the sōhei's staves: held in the middle with both hands; every blow dazes (player.ts)
  { id: 'bo', name: 'Bō del peregrino', desc: 'bastón de roble con regatones de bronce: golpes amplios que aturden', form: 'staff', price: 0, tier: 0, dmg: 1, reach: 0.3, speed: 1, len: 0.9, glow: 0xffc46b, steel: 0xc9a979,
    fx: { glow: 0xffcf7a, hot: 0xfff1c4, cool: 0xff8a2a, gravity: 6, halo: 1.1, trail: 1.2 } },
  { id: 'shakujo', name: 'Shakujō del templo', desc: 'bastón de anillas que tintinean: cada golpe que acierta carga la técnica', form: 'staff', price: 1900, tier: 1.25, dmg: 1.15, reach: 0.4, speed: 0.95, len: 0.95, glow: 0xffe48a, steel: 0xe8cf86, charge: 0.03,
    fx: { glow: 0xffe27a, hot: 0xfff6cf, cool: 0xffa632, gravity: 3, halo: 1.3, trail: 1.5, sparks: [0xffe063, 0xffb347, 0xfff2b0] } },
  { id: 'tetsubo-monje', name: 'Bastón de hierro', desc: 'hierro negro anillado: lento, pero aturde mucho más', form: 'staff', price: 4200, tier: 1.85, dmg: 1.6, reach: 0.5, speed: 1.18, len: 1, glow: 0xff7b4a, steel: 0x6f6660, daze: 1.6,
    fx: { glow: 0xff8450, hot: 0xffd0a0, cool: 0xd8401c, gravity: 9, halo: 1.45, trail: 1.7, sparks: [0xff6a3a, 0xffb04d, 0xff4f6a] } },
  { id: 'bishamon', name: 'Bastón de Bishamon', desc: 'del guardián del norte: gran daño y cada oni que golpeas te cura 2', form: 'staff', price: 11200, tier: 2.8, dmg: 2.05, reach: 0.6, speed: 0.92, len: 1, glow: 0x8fb6ff, steel: 0xd6e2ff, heal: 2, daze: 1.25,
    fx: { glow: 0x9cc0ff, hot: 0xeaf2ff, cool: 0x5b6cff, gravity: 2, halo: 1.7, trail: 2.1, sparks: [0x8fc4ff, 0xb08cff, 0xfff0b0], extra: 'stars' } },
  // legendary staves, by level
  { id: 'kongo', name: 'Vajra de Kongō', desc: 'el rayo diamantino de los reyes guardianes: aturde mucho y carga la técnica', form: 'staff', price: 16000, tier: 3, dmg: 2.45, reach: 0.6, speed: 0.95, len: 1, glow: 0xa8f0ff, steel: 0xe4f6ff, daze: 1.5, charge: 0.025,
    fx: { glow: 0xb4f2ff, hot: 0xffffff, cool: 0x4a9bff, gravity: 2, halo: 1.9, trail: 2.3, sparks: [0xa8f0ff, 0x7aa8ff, 0xfff6c0], extra: 'bolts' } },
  { id: 'jizo', name: 'Shakujō de Jizō', desc: 'el báculo del protector de viajeros: cada golpe cura 3 y carga la técnica', form: 'staff', price: 23000, tier: 3, dmg: 2.8, reach: 0.7, speed: 0.9, len: 1.02, glow: 0xffe9a8, steel: 0xfff4d0, heal: 3, charge: 0.02, daze: 1.3,
    fx: { glow: 0xfff0b8, hot: 0xffffff, cool: 0xffb84a, gravity: 1, halo: 2.1, trail: 2.4, sparks: [0xffe9a8, 0xffc26a, 0xfff8e0], extra: 'stars' } },
  { id: 'fudo', name: 'Kurikara de Fudō', desc: 'la llama inmóvil del rey de la sabiduría: el bastón de la leyenda', form: 'staff', price: 32000, tier: 3, dmg: 3.5, reach: 0.8, speed: 0.92, len: 1.05, glow: 0xff4a2a, steel: 0x2a1a1a, heal: 3, charge: 0.03, daze: 1.8,
    fx: { glow: 0xff5a30, hot: 0xffe0a0, cool: 0xd01a3a, gravity: -1, halo: 2.4, trail: 2.8, sparks: [0xff5a30, 0xffb040, 0xff3a8a], extra: 'blood' } },
  // ---- boss-exclusive relics (dropped by major bosses in loot.ts, not sold by Masa)
  { id: 'kuro-odachi', name: 'Ōdachi del Señor Kuro', desc: 'reliquia del Señor Kuro: hoja carmesí de gran alcance que drena 2 de vida por golpe', form: 'odachi', bossDrop: true, price: 0, tier: 2.75, dmg: 2.25, reach: 1.55, speed: 1.02, len: 1.78, width: 1.16, glow: 0xff3838, steel: 0x28141c, heal: 2,
    fx: { glow: 0xff453c, hot: 0xffb8b0, cool: 0x8f0a18, gravity: 14, halo: 1.9, trail: 2.3, sparks: [0xff3838, 0xff7a5c, 0xc8163a], extra: 'blood' } },
  { id: 'martillo-raijin', name: 'Maza de Raijin', desc: 'reliquia de Raijin: descarga el trueno en cada impacto, aturde y carga la técnica', form: 'cleaver', mangaModel: 'fang', bossDrop: true, price: 0, tier: 2.85, dmg: 2.5, reach: 0.95, speed: 1.14, len: 1.42, width: 1.15, glow: 0x7ea6ff, steel: 0x2c3a78, charge: 0.035, daze: 1.35,
    fx: { glow: 0x8ca9ff, hot: 0xe6f2ff, cool: 0x3852ff, gravity: 4, halo: 2.0, trail: 2.4, sparks: [0x8ca9ff, 0xffe266, 0x5ce0ff], extra: 'bolts' } },
  { id: 'filo-ikazuchi', name: 'Relámpago de Ikazuchi', desc: 'reliquia de Ikazuchi: estocadas fulgurantes que cargan el rayo al instante', form: 'rapier', bossDrop: true, price: 0, tier: 2.7, dmg: 2.05, reach: 0.95, speed: 0.72, len: 1.35, width: 0.92, glow: 0x7ad8ff, steel: 0xd8ecff, charge: 0.04,
    fx: { glow: 0x9fbbff, hot: 0xffffff, cool: 0x3b8eff, gravity: 1.5, halo: 1.9, trail: 2.3, sparks: [0x9fdcff, 0xffffff, 0x7ea6ff], extra: 'bolts' } },
  { id: 'hoja-enma', name: 'Sentencia de Enma', desc: 'reliquia del juez del infierno: filo llameante que cura 2 por golpe y carga la técnica', form: 'broad', mangaModel: 'winged', bossDrop: true, price: 0, tier: 3, dmg: 2.9, reach: 1.15, speed: 1.05, len: 1.48, width: 1.18, glow: 0xff6a1a, steel: 0x2a0c12, heal: 2, charge: 0.025,
    fx: { glow: 0xff7824, hot: 0xfff0a8, cool: 0xb81810, gravity: -1.5, halo: 2.2, trail: 2.6, sparks: [0xff6a1a, 0xffd24a, 0xff2a20], extra: 'feathers' } },
  { id: 'lanza-bosque', name: 'Guadaña del Bosque Sombrío', desc: 'reliquia del Bosque Sombrío: alcance inmenso, aturde y absorbe 2 de vida por golpe', form: 'spear', bossDrop: true, price: 0, tier: 2.9, dmg: 2.35, reach: 2.3, speed: 0.92, len: 0.72, glow: 0x8cff52, steel: 0x1e4428, heal: 2, daze: 1.25,
    fx: { glow: 0x9cff5a, hot: 0xeaffc0, cool: 0x228836, gravity: 2, halo: 2.0, trail: 2.4, sparks: [0x9cff5a, 0x52d878, 0xd8ff7a], extra: 'stars' } },
  { id: 'lanza-hueso', name: 'Lanza del Daimyō de Hueso', desc: 'reliquia del Daimyō de los Huesos: estocada espectral de gran alcance que aturde y sana 1 de vida', form: 'spear', bossDrop: true, price: 0, tier: 2.6, dmg: 2.0, reach: 2.15, speed: 0.9, len: 0.68, glow: 0x8ff5c8, steel: 0xe6dec8, heal: 1, daze: 1.3,
    fx: { glow: 0x8ff5c8, hot: 0xeafff4, cool: 0x2ca87a, gravity: 2, halo: 1.85, trail: 2.2, sparks: [0x8ff5c8, 0xe6dec8, 0x58e0ff], extra: 'stars' } },
  { id: 'hoz-ceniza', name: 'Filo de Ceniza de Kagutsuchi', desc: 'reliquia de Kagutsuchi: gran sable abrasador que carga la técnica y deja brasas al cortar', form: 'odachi', bossDrop: true, price: 0, tier: 2.95, dmg: 2.65, reach: 1.5, speed: 0.98, len: 1.72, width: 1.14, glow: 0xff5522, steel: 0x2a1412, charge: 0.03, daze: 1.2,
    fx: { glow: 0xff622a, hot: 0xffe49c, cool: 0xa81c0e, gravity: -1, halo: 2.1, trail: 2.5, sparks: [0xff5522, 0xffb838, 0xff2820], extra: 'feathers' } }
];
// the rest of the sōhei's, the xiákè's and the hwarang's stock: 21 weapons to buy for every class (arsenal.ts)
WEAPONS.push(...CLASS_ARSENAL);
for (const w of WEAPONS) if (w.lv) LEVEL_REQ[w.id] = w.lv;
const byId = new Map(WEAPONS.map(w => [w.id, w]));
export const weaponById = (id: string) => byId.get(id);
export const weapon = () => byId.get(state.weapon) || byId.get(cls().weapon)!;
/** what Masa can sell you: your class's non-relic weapons */
export const forSale = () => WEAPONS.filter(w => !w.bossDrop && canWield(w)).sort((a, b) => a.price - b.price);
export const owns = (id: string) => state.owned.includes(id);

/** a line of numbers for the shop: compared with the plain katana */
export function weaponStats(w: Weapon) {
  const spd = weaponSpeed(w);
  const rch = weaponReach(w);
  const dmg = weaponDmg(w);
  const lv = weaponLevel(w.id);
  const sp = w.form === 'cleaver' ? 'muy pesada'
    : w.form === 'broad' ? 'lenta'
    : w.form === 'odachi' ? 'gran arco'
    : w.form === 'rapier' ? 'estocada veloz'
    : w.form === 'dual' ? 'doble tajo'
    : spd < 0.8 ? 'muy rápida' : spd < 0.97 ? 'rápida' : spd > 1.15 ? 'lenta' : 'normal';
  const reach = Math.abs(rch) > 0.005 ? `${rch > 0 ? '+' : '−'}${Math.abs(rch).toFixed(2).replace(/\.?0+$/, '')} m` : 'normal';
  const daze = (w.form === 'staff' || w.daze) ? ` · aturde${w.daze && w.daze > 1 ? ' mucho' : ''}` : '';
  const forge = lv > 0 ? ` · temple +${lv}` : '';
  return `daño x${dmg.toFixed(2).replace(/\.?0+$/, '')} · alcance ${reach} · ${sp}${daze}${forge}`;
}

export function buy(w: Weapon): 'ok' | 'poor' | 'owned' {
  if (owns(w.id)) return 'owned';
  if (state.mon < w.price) return 'poor';
  state.mon -= w.price; state.owned.push(w.id); equip(w.id);
  return 'ok';
}
/** award a special weapon (e.g. from defeating a major boss) and persist it to the vault */
export function grantWeapon(id: string, autoEquip = true): Weapon | null {
  const w = byId.get(id);
  if (!w) return null;
  if (!owns(w.id)) state.owned.push(w.id);
  if (autoEquip) equip(w.id);
  saveVault();
  return w;
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
/** a new run (or another class): the weapon your class starts with and every blade already won (vault.ts) */
export function resetWeapons() {
  const id = cls().weapon, v = readVault();
  state.owned = [id, ...v.weapons.filter(w => w !== id && byId.has(w) && canWield(byId.get(w)!))];
  state.weapon = v.weapon && state.owned.includes(v.weapon) ? v.weapon : id;
  state.weaponLevels = { ...(v.weaponLevels ?? {}) };
  state.weaponXp = { ...(v.weaponXp ?? {}) };
  applyWeapon();
  vaultReady();
}

// ------------------------------------------------------------ the blade mesh
let displayed = WEAPONS[0];
export const displayedWeapon = () => displayed;
/** katana-space z of the blade's tip (the trail and sparks follow it) */
export const tipZ = (w: Weapon) => (w.mangaModel ? BLADE_PROFILE.base : BLADE_LAYOUT[w.form ?? 'katana'].base) + BLADE_PROFILE.length * w.len;
export function applyWeapon(w = weapon()) {
  displayed = w;
  showWeaponModel(w.form ?? 'katana', w.len, w.look, w.width ?? 1, w.mangaModel);
  bladeMat.color.set(w.steel); bladeMat.emissive.set(w.glow);
}
applyWeapon();
