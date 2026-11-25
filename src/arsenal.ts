// The rest of Masa's stock for the sōhei, the xiákè and the hwarang, so every class can buy as many weapons as
// the ronin (21). Each class climbs the same ladder as the ronin's blades: the same prices, the same tiers and
// the same levels for the legendary pieces (lv, registered in progression.ts LEVEL_REQ by weapons.ts), each step
// with a gift in that class's own style. weapons.ts adds them to WEAPONS.
import type { Weapon } from './weapons';
import type { ClassId } from './classes';
import type { WeaponForm } from './types';
import type { BladeLook } from './blade-looks';

type Extra = NonNullable<Weapon['fx']['extra']>;
interface Forge {
  id: string; name: string; desc: string; price: number; tier: number; lv?: number;
  form?: WeaponForm; look?: BladeLook; cls?: ClassId;
  dmg: number; reach: number; speed: number; len: number;
  heal?: number; charge?: number; daze?: number;
  /** the weapon's light; the steel, the trail's hot and cool ends and the halo follow from it and the tier */
  glow: number; steel?: number; sparks?: readonly [number, number, number]; extra?: Extra; gravity?: number;
}
const mix = (a: number, b: number, k: number) => {
  const ch = (s: number) => Math.round(((a >> s) & 255) * (1 - k) + ((b >> s) & 255) * k);
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
};
function forged(f: Forge): Weapon {
  const { glow, steel, sparks, extra, gravity, ...w } = f;
  return {
    ...w, glow, steel: steel ?? mix(glow, 0xffffff, 0.7),
    fx: {
      glow: mix(glow, 0xffffff, 0.12), hot: mix(glow, 0xffffff, 0.72), cool: mix(glow, 0x000000, 0.35),
      gravity: gravity ?? 4, halo: 1 + 0.3 * f.tier, trail: 1.2 + 0.4 * f.tier, sparks, extra
    }
  };
}

// ------------------------------------------------------------ the sōhei: staves (15 more, 21 in all)
const staff = (f: Omit<Forge, 'form'>) => forged({ ...f, form: 'staff' });
const SOHEI: Weapon[] = [
  staff({ id: 'bo-bambu', name: 'Bō de bambú', desc: 'caña ligera: golpes mucho más rápidos', price: 1200, tier: 1, dmg: 1.08, reach: 0.2, speed: 0.74, len: 0.86, glow: 0x9cff7a, steel: 0xc8e0a0 }),
  staff({ id: 'konsaibo', name: 'Konsaibō de roble', desc: 'bastón largo con anillas de hierro: alcanza lejos', price: 2000, tier: 1.25, dmg: 1.15, reach: 0.9, speed: 1.02, len: 1.08, glow: 0x7ac8ff, sparks: [0x7ac8ff, 0xb0e0ff, 0x5a8aff] }),
  staff({ id: 'kanabo-templo', name: 'Kanabō del templo', desc: 'maza de hierro tachonada: lenta, pega fuerte y aturde mucho', price: 2400, tier: 1.5, dmg: 1.45, reach: 0.5, speed: 1.25, len: 1.05, daze: 1.5, glow: 0xff6a4a, steel: 0x5a5250, gravity: 9, sparks: [0xff6a4a, 0xffa040, 0xff3a3a] }),
  staff({ id: 'jo-viento', name: 'Jō del viento', desc: 'bastón corto de los peregrinos: el más rápido', price: 3500, tier: 1.65, dmg: 1.06, reach: 0, speed: 0.66, len: 0.8, glow: 0x9afff0, extra: 'feathers', sparks: [0x9afff0, 0xd0fff8, 0x7ac8ff] }),
  staff({ id: 'shakujo-eco', name: 'Shakujō del eco', desc: 'sus anillas resuenan: aturde más y carga un poco la técnica', price: 3800, tier: 1.7, dmg: 1.25, reach: 0.4, speed: 0.92, len: 0.95, daze: 1.3, charge: 0.015, glow: 0xffd88a, sparks: [0xffd88a, 0xffb050, 0xfff4c8] }),
  staff({ id: 'tengu-bo', name: 'Bastón del tengu', desc: 'sediento como el viento de la montaña: cada oni golpeado te cura 3', price: 4800, tier: 2, dmg: 1.6, reach: 0.4, speed: 0.95, len: 1, heal: 3, glow: 0xff3a50, steel: 0x6a2a30, extra: 'blood', gravity: 12, sparks: [0xff3a50, 0xff7a8a, 0xb04aff] }),
  staff({ id: 'nami-bo', name: 'Bastón de la marea', desc: 'largo y ágil como una ola', price: 5700, tier: 2.15, dmg: 1.35, reach: 1, speed: 0.88, len: 1.12, glow: 0x29f4c6, sparks: [0x24ffc3, 0x39afff, 0x82ff76] }),
  staff({ id: 'raiden-bo', name: 'Bastón de Raiden', desc: 'cada golpe que acierta carga el rayo', price: 7200, tier: 2.45, dmg: 1.5, reach: 0.4, speed: 0.9, len: 1, charge: 0.035, glow: 0xffe040, extra: 'bolts', gravity: 3, sparks: [0xffdf36, 0x73ddff, 0x6f87ff] }),
  staff({ id: 'konsaibo-trueno', name: 'Konsaibō del trueno', desc: 'larguísimo: aturde y carga el rayo al acertar', price: 8200, tier: 2.55, dmg: 1.55, reach: 1.4, speed: 1.04, len: 1.12, charge: 0.018, daze: 1.2, glow: 0x5a8dff, sparks: [0x47b8ff, 0x7465ff, 0x50ffd2] }),
  staff({ id: 'yamabushi', name: 'Shakujō del yamabushi', desc: 'de los ascetas de la montaña: pesado, de largo alcance y aturde mucho', price: 9800, tier: 2.7, lv: 15, dmg: 2, reach: 1.1, speed: 1.28, len: 1.12, daze: 1.4, glow: 0x7a6aff, sparks: [0x7364ff, 0x41acff, 0xed6dff] }),
  staff({ id: 'kannon', name: 'Bastón de Kannon', desc: 'la misericordia: golpes rápidos que cargan la técnica y aturden', price: 10800, tier: 2.8, lv: 15, dmg: 1.6, reach: 0.5, speed: 0.84, len: 1, charge: 0.02, daze: 1.2, glow: 0xf2a0ff, sparks: [0xf27aff, 0xffb0e0, 0xfff0b0] }),
  staff({ id: 'ashura', name: 'Kanabō de Ashura', desc: 'el demonio de tres rostros: el golpe más pesado, aturde muchísimo', price: 13400, tier: 3, lv: 25, dmg: 2.3, reach: 0.7, speed: 1.22, len: 1.08, daze: 1.8, glow: 0xff8a3a, steel: 0x6a5048, gravity: 8, sparks: [0xff985d, 0xffd664, 0xff648f] }),
  staff({ id: 'amida', name: 'Bastón de Amida', desc: 'luz infinita: golpes veloces que cargan la técnica', price: 15800, tier: 3, lv: 30, dmg: 1.85, reach: 0.5, speed: 0.76, len: 1, charge: 0.02, glow: 0x83ffe5, extra: 'stars', gravity: 1.5, sparks: [0x32ffc2, 0x4ebaff, 0xff67e6] }),
  staff({ id: 'nio', name: 'Vara de los Niō', desc: 'los guardianes del portal: alcance enorme, aturde y carga el rayo', price: 19000, tier: 3, lv: 55, dmg: 2.4, reach: 1.6, speed: 0.95, len: 1.12, charge: 0.025, daze: 1.6, glow: 0xff7ae0, extra: 'bolts', sparks: [0xff7ae0, 0x9d7bff, 0x7af0ff] }),
  staff({ id: 'dainichi', name: 'Bastón de Dainichi', desc: 'el buda del gran sol: golpes devastadores que cargan la técnica', price: 27000, tier: 3, lv: 85, dmg: 3.2, reach: 0.9, speed: 1.1, len: 1.06, charge: 0.03, daze: 1.8, glow: 0xffe9a0, extra: 'stars', sparks: [0xffe9a0, 0xffb040, 0xffffff] })
];

// ------------------------------------------------------------ the xiákè: jian, dao, twin blades, polearms (18 more)
const xia = (f: Omit<Forge, 'cls'>) => forged({ ...f, cls: 'xia' });
const XIA: Weapon[] = [
  xia({ id: 'jian-sauce', name: 'Jian del sauce', desc: 'fino y flexible como una rama de sauce: tajos mucho más rápidos', look: 'jian', price: 1200, tier: 1, dmg: 1.1, reach: 0, speed: 0.72, len: 0.9, glow: 0xb8ff8a, extra: 'feathers', sparks: [0xb8ff8a, 0x7dffc0, 0xfff0a0] }),
  xia({ id: 'dao-longquan', name: 'Dao de Longquan', desc: 'acero de las forjas de Longquan: más daño', look: 'dao', price: 1700, tier: 1.25, dmg: 1.28, reach: 0.1, speed: 1, len: 1.04, glow: 0xff6c31, gravity: 10, sparks: [0xff4b25, 0xff9827, 0xffdd69] }),
  xia({ id: 'miaodao', name: 'Miaodao', desc: 'sable largo de dos manos, fino como un brote: alcanza lejos, pero es lento', look: 'dao', price: 2400, tier: 1.5, dmg: 1.45, reach: 1.2, speed: 1.28, len: 1.55, glow: 0x40f0ff, sparks: [0x28e7ff, 0x548bff, 0x91fff5] }),
  xia({ id: 'jian-golondrina', name: 'Jian de la golondrina', desc: 'el más rápido de los ríos y los lagos', look: 'jian', price: 3500, tier: 1.65, dmg: 1.08, reach: 0, speed: 0.64, len: 0.82, glow: 0x9ad8ff, extra: 'feathers', sparks: [0x9ad8ff, 0xe0f4ff, 0x7a9aff] }),
  xia({ id: 'emei', name: 'Espadas de Emei', desc: 'las hojas gemelas de la montaña Emei: dos tajos alternos y un remate cruzado', form: 'dual', price: 3800, tier: 1.7, dmg: 1.25, reach: -0.55, speed: 0.9, len: 0.6, glow: 0x79c2ff, sparks: [0x54d8ff, 0x7d8bff, 0xe996ff] }),
  xia({ id: 'moye', name: 'Jian de Moye', desc: 'la espada hembra de Ganjiang y Moye, sedienta: cada oni cortado te cura 3', look: 'jian', price: 4800, tier: 2, dmg: 1.6, reach: 0.2, speed: 0.95, len: 1.1, heal: 3, glow: 0xff2040, steel: 0x501018, extra: 'blood', gravity: 16, sparks: [0xff254a, 0xff5786, 0xbf54ff] }),
  xia({ id: 'jian-yangtse', name: 'Jian del Yangtsé', desc: 'acero del gran río: buen alcance con un tajo ágil', look: 'jian', price: 5700, tier: 2.15, dmg: 1.35, reach: 0.9, speed: 0.88, len: 1.4, glow: 0x19dfab, sparks: [0x24ffc3, 0x39afff, 0x82ff76] }),
  xia({ id: 'leigong', name: 'Jian de Lei Gong', desc: 'del dios del trueno: cada golpe que acierta carga el rayo', look: 'jian', price: 7200, tier: 2.45, dmg: 1.5, reach: 0.3, speed: 0.9, len: 1.15, charge: 0.035, glow: 0xffe020, extra: 'bolts', gravity: 3, sparks: [0xffdf36, 0x73ddff, 0x6f87ff] }),
  xia({ id: 'qiang-plata', name: 'Qiang de punta de plata', desc: 'la lanza del general Zhao Yun: alcanza lejos y carga el rayo al acertar', form: 'spear', price: 8200, tier: 2.55, dmg: 1.55, reach: 2.05, speed: 1.04, len: 0.67, charge: 0.018, glow: 0xc8d8ff, steel: 0xe8eeff, sparks: [0xc8d8ff, 0x7465ff, 0xffffff] }),
  xia({ id: 'zhanmadao', name: 'Zhanmadao', desc: 'el sable que corta caballos: gran daño y largo alcance', form: 'broad', price: 9800, tier: 2.7, lv: 15, dmg: 2.02, reach: 1.5, speed: 1.32, len: 1.3, glow: 0x635bff, steel: 0x5b618a, extra: 'bolts', gravity: 6, sparks: [0x7364ff, 0x41acff, 0xed6dff] }),
  xia({ id: 'dos-dragones', name: 'Espadas de los dos dragones', desc: 'filos gemelos lacados en negro: sucesión rápida y remate en cruz', form: 'dual', price: 10800, tier: 2.8, lv: 15, dmg: 1.55, reach: -0.45, speed: 0.82, len: 0.66, glow: 0x5dffb0, sparks: [0x5dffb0, 0xffd060, 0x8affc8] }),
  xia({ id: 'dadao', name: 'Dadao del gran río', desc: 'gran hoja ancha: tajo fuerte de gran daño y barrido amplio', form: 'broad', price: 13400, tier: 3, lv: 25, dmg: 2.28, reach: 0.7, speed: 1.23, len: 1.34, glow: 0xffbd6a, steel: 0xb4a099, gravity: 8, sparks: [0xff985d, 0xffd664, 0xff648f] }),
  xia({ id: 'osa-mayor', name: 'Jian de la Osa Mayor', desc: 'grabado con las siete estrellas del norte: tajos veloces que cargan la técnica', look: 'jian', price: 15800, tier: 3, lv: 30, dmg: 1.85, reach: 0.5, speed: 0.76, len: 1.2, charge: 0.02, glow: 0x9ab8ff, extra: 'stars', gravity: 1.5, sparks: [0x9ab8ff, 0xfff0b0, 0x7dffc0] }),
  xia({ id: 'ganjiang', name: 'Ganjiang', desc: 'la espada macho del herrero de leyenda: cada golpe carga la técnica y cierra heridas', look: 'jian', price: 16000, tier: 3, lv: 40, dmg: 2.55, reach: 0.7, speed: 0.8, len: 1.22, heal: 1, charge: 0.025, glow: 0x8affc0, extra: 'stars', gravity: 1.5, sparks: [0x6dffb2, 0xc8ff7a, 0x5ee0ff] }),
  xia({ id: 'fangtian', name: 'Alabarda celeste de Lü Bu', desc: 'la fangtian ji del guerrero invencible: alcance enorme y rayo', form: 'spear', price: 19000, tier: 3, lv: 55, dmg: 2.4, reach: 2.5, speed: 0.95, len: 0.72, charge: 0.025, glow: 0xff5a5a, extra: 'bolts', gravity: 2, sparks: [0xff5a5a, 0xffb040, 0x9d7bff] }),
  xia({ id: 'fenghuang', name: 'Alas del Fenghuang', desc: 'filos gemelos del fénix: rapidísimos, y cada oni cortado te cura 2', form: 'dual', price: 23000, tier: 3, lv: 70, dmg: 2.3, reach: -0.35, speed: 0.72, len: 0.7, heal: 2, glow: 0xffa53a, extra: 'feathers', gravity: -2, sparks: [0xffb03a, 0xff5a2a, 0xffe57a] }),
  xia({ id: 'huangdi', name: 'Dao del Emperador Amarillo', desc: 'hoja ancha del primer emperador: golpes devastadores que cargan el rayo', form: 'broad', price: 27000, tier: 3, lv: 85, dmg: 3.2, reach: 0.9, speed: 1.12, len: 1.4, charge: 0.03, glow: 0xffd040, extra: 'bolts', gravity: 3, sparks: [0xffe060, 0xff9a2a, 0xfff3a0] }),
  xia({ id: 'xuanyuan', name: 'Xuanyuan, espada del cielo', desc: 'la espada de la leyenda: corta la nada, cura, carga y alcanza lejos', look: 'jian', price: 32000, tier: 3, lv: 100, dmg: 3.6, reach: 1, speed: 0.76, len: 1.32, heal: 3, charge: 0.03, glow: 0xffffff, steel: 0x1a2420, extra: 'stars', gravity: 0.5, sparks: [0xffffff, 0x7dffc0, 0xffd98a] })
];

// ------------------------------------------------------------ the hwarang: ring-pommel swords, twin blades, polearms (18 more)
const hwa = (f: Omit<Forge, 'cls'>) => forged({ ...f, cls: 'hwarang' });
const HWARANG: Weapon[] = [
  hwa({ id: 'hwandu-pino', name: 'Hwandu del pino joven', desc: 'ligera como una rama de pino: tajos mucho más rápidos', look: 'hwandu', price: 1200, tier: 1, dmg: 1.1, reach: 0, speed: 0.72, len: 0.88, glow: 0xa0ffcf, extra: 'feathers', sparks: [0xa0ffcf, 0xff9ac4, 0xfff0a0] }),
  hwa({ id: 'geom-gaya', name: 'Geom de Gaya', desc: 'hierro de las forjas de Gaya: más daño', look: 'hwandu', price: 1700, tier: 1.25, dmg: 1.28, reach: 0.1, speed: 1, len: 1.04, glow: 0xff6c31, gravity: 10, sparks: [0xff4b25, 0xff9827, 0xffdd69] }),
  hwa({ id: 'jangdo', name: 'Jangdo', desc: 'espada larga de dos manos: alcanza lejos y pega fuerte, pero es lenta', look: 'hwandu', price: 2400, tier: 1.5, dmg: 1.45, reach: 1.2, speed: 1.28, len: 1.6, glow: 0x40f0ff, sparks: [0x28e7ff, 0x548bff, 0x91fff5] }),
  hwa({ id: 'mugunghwa', name: 'Hoja de mugunghwa', desc: 'la flor que nunca se marchita: la más rápida', look: 'hwandu', price: 3500, tier: 1.65, dmg: 1.08, reach: 0, speed: 0.64, len: 0.8, glow: 0xd87aff, extra: 'feathers', sparks: [0xd87aff, 0xff9ac4, 0xffe0f0] }),
  hwa({ id: 'geommu', name: 'Espadas del geommu', desc: 'las hojas cortas de la danza de espadas: dos tajos alternos y un remate cruzado', form: 'dual', price: 3800, tier: 1.7, dmg: 1.25, reach: -0.55, speed: 0.9, len: 0.6, glow: 0x79c2ff, sparks: [0x54d8ff, 0x7d8bff, 0xe996ff] }),
  hwa({ id: 'gwisin', name: 'Hwandu del gwisin', desc: 'un espíritu sediento vive en ella: cada oni cortado te cura 3', look: 'hwandu', price: 4800, tier: 2, dmg: 1.6, reach: 0.2, speed: 0.95, len: 1.1, heal: 3, glow: 0xff2040, steel: 0x501018, extra: 'blood', gravity: 16, sparks: [0xff254a, 0xff5786, 0xbf54ff] }),
  hwa({ id: 'geom-hangang', name: 'Geom del río Han', desc: 'acero del río: buen alcance con un tajo ágil', look: 'hwandu', price: 5700, tier: 2.15, dmg: 1.35, reach: 0.9, speed: 0.88, len: 1.4, glow: 0x19dfab, sparks: [0x24ffc3, 0x39afff, 0x82ff76] }),
  hwa({ id: 'cheondung', name: 'Geom de Cheondung', desc: 'la espada del trueno: cada golpe que acierta carga el rayo', look: 'hwandu', price: 7200, tier: 2.45, dmg: 1.5, reach: 0.3, speed: 0.9, len: 1.15, charge: 0.035, glow: 0xffe020, extra: 'bolts', gravity: 3, sparks: [0xffdf36, 0x73ddff, 0x6f87ff] }),
  hwa({ id: 'chang-goguryeo', name: 'Chang de Goguryeo', desc: 'la lanza de los jinetes del norte: alcanza lejos y carga el rayo al acertar', form: 'spear', price: 8200, tier: 2.55, dmg: 1.55, reach: 2.05, speed: 1.04, len: 0.67, charge: 0.018, glow: 0x328dff, steel: 0x85b7d5, sparks: [0x47b8ff, 0x7465ff, 0x50ffd2] }),
  hwa({ id: 'ssangsudo', name: 'Ssangsudo', desc: 'la gran espada a dos manos de Joseon: gran daño y largo alcance', form: 'broad', price: 9800, tier: 2.7, lv: 15, dmg: 2.02, reach: 1.5, speed: 1.32, len: 1.3, glow: 0x635bff, steel: 0x5b618a, extra: 'bolts', gravity: 6, sparks: [0x7364ff, 0x41acff, 0xed6dff] }),
  hwa({ id: 'ssanggeom-ocaso', name: 'Ssanggeom del ocaso', desc: 'filos gemelos de laca oscura: sucesión rápida y remate en cruz', form: 'dual', price: 10800, tier: 2.8, lv: 15, dmg: 1.55, reach: -0.45, speed: 0.82, len: 0.66, glow: 0xf25fa9, sparks: [0xff72ad, 0xf06bff, 0xffb16f] }),
  hwa({ id: 'hyeonmu', name: 'Hoja de Hyeonmu', desc: 'la tortuga negra del norte: tajo fuerte de gran daño y barrido amplio', form: 'broad', price: 13400, tier: 3, lv: 25, dmg: 2.28, reach: 0.7, speed: 1.23, len: 1.34, glow: 0x6affd0, steel: 0x3a4a48, gravity: 8, sparks: [0x6affd0, 0x4a8aff, 0xfff0a0] }),
  hwa({ id: 'eunha', name: 'Geom de Eunha', desc: 'la Vía Láctea en el acero: tajos veloces que cargan la técnica', look: 'hwandu', price: 15800, tier: 3, lv: 30, dmg: 1.85, reach: 0.5, speed: 0.76, len: 1.2, charge: 0.02, glow: 0xb4c8ff, extra: 'stars', gravity: 1.5, sparks: [0xb4c8ff, 0xff9ac4, 0xffffff] }),
  hwa({ id: 'chilseong', name: 'Chilseonggeom', desc: 'la espada de las siete estrellas: cada golpe carga la técnica y cierra heridas', look: 'hwandu', price: 16000, tier: 3, lv: 40, dmg: 2.55, reach: 0.7, speed: 0.8, len: 1.22, heal: 1, charge: 0.025, glow: 0xffe0a0, extra: 'stars', gravity: 1.5, sparks: [0xffe0a0, 0xb4c8ff, 0xff9ac4] }),
  hwa({ id: 'dangpa-dragon', name: 'Dangpa del dragón', desc: 'el tridente del rey dragón del mar del este: alcance enorme y rayo', form: 'spear', price: 19000, tier: 3, lv: 55, dmg: 2.4, reach: 2.5, speed: 0.95, len: 0.72, charge: 0.025, glow: 0x5ac8ff, extra: 'bolts', gravity: 2, sparks: [0x5ac8ff, 0x9d7bff, 0x7af0ff] }),
  hwa({ id: 'bonghwang', name: 'Alas del Bonghwang', desc: 'filos gemelos del fénix: rapidísimos, y cada oni cortado te cura 2', form: 'dual', price: 23000, tier: 3, lv: 70, dmg: 2.3, reach: -0.35, speed: 0.72, len: 0.7, heal: 2, glow: 0xff7aa8, extra: 'feathers', gravity: -2, sparks: [0xff7aa8, 0xffb03a, 0xffe57a] }),
  hwa({ id: 'cheonma', name: 'Hoja de Cheonma', desc: 'del caballo celeste: golpes devastadores que cargan el rayo', form: 'broad', price: 27000, tier: 3, lv: 85, dmg: 3.2, reach: 0.9, speed: 1.12, len: 1.4, charge: 0.03, glow: 0xb0dcff, extra: 'bolts', gravity: 3, sparks: [0xbfe6ff, 0x6f8bff, 0xfff3a0] }),
  hwa({ id: 'dangun', name: 'Espada de Dangun', desc: 'la espada del fundador: corta la nada, cura, carga y alcanza lejos', look: 'hwandu', price: 32000, tier: 3, lv: 100, dmg: 3.6, reach: 1, speed: 0.76, len: 1.32, heal: 3, charge: 0.03, glow: 0xfff0f6, steel: 0x241a20, extra: 'stars', gravity: 0.5, sparks: [0xffffff, 0xff9ac4, 0xffd98a] })
];

export const CLASS_ARSENAL: Weapon[] = [...SOHEI, ...XIA, ...HWARANG];
