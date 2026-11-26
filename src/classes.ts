// Who you play. The ronin fights with blades and starts with the sword dance; the sōhei, a warrior monk,
// fights with a staff whose blows daze, takes more punishment, walks a little slower and starts with the
// temple bell. Two swordsmen come from across the sea: the xiákè, a wandering Chinese swordsman (jian, quick
// and light on his feet, flying swords), and the hwarang, a Korean flower knight (ring-pommel sword, steady,
// a storm of petals). Chosen on the title screen (class-select.ts) and saved in the browser. Each class keeps
// its own look (look.ts), wields only its own weapons (weapons.ts) and starts each run with its own gear.
import { state } from './state';
import type { TechniqueId } from './techniques';
import type { WeaponForm } from './types';

export type ClassId = 'ronin' | 'sohei' | 'xia' | 'hwarang';
export interface CharacterClass {
  id: ClassId;
  name: string;
  kanji: string;
  /** one line on the title screen */
  desc: string;
  /** what the smith calls you */
  address: string;
  /** the "random look" line in the look menu (custom.ts) */
  wanderer: string;
  /** life at the start of a run, share of damage shrugged off (0..1), running speed multiplier,
   *  dodge cooldown multiplier (<1 = dodges more often) */
  hp: number; guard: number; run: number; dash?: number;
  /** the weapon forms it can wield, the weapon and the two techniques it starts with (P and J); `own`: only the
   *  weapons forged for it (Weapon.cls), not every weapon of those forms */
  forms: readonly WeaponForm[];
  own?: boolean;
  weapon: string;
  technique: TechniqueId;
  technique2: TechniqueId;
}

export const CLASSES: Record<ClassId, CharacterClass> = {
  ronin: {
    id: 'ronin', name: 'Ronin', kanji: '浪人', address: 'ronin', wanderer: 'un ronin cualquiera de los caminos',
    desc: 'samurái sin señor · katanas, lanzas y espadas · empieza con la Danza de los Mil Tajos y el Iaijutsu',
    hp: 100, guard: 0, run: 1,
    forms: ['katana', 'spear', 'broad', 'dual', 'odachi', 'rapier', 'cleaver'], weapon: 'katana', technique: 'tajos', technique2: 'iai'
  },
  sohei: {
    id: 'sohei', name: 'Sōhei', kanji: '僧兵', address: 'monje', wanderer: 'un monje cualquiera de las montañas',
    desc: 'monje guerrero · más vida y aguante, algo más lento · su bastón aturde · empieza con la Campana del Templo y la Rueda del Dharma',
    hp: 130, guard: 0.1, run: 0.93,
    forms: ['staff'], weapon: 'bo', technique: 'campana', technique2: 'rueda'
  },
  xia: {
    id: 'xia', name: 'Xiákè', kanji: '侠客', address: 'viajero', wanderer: 'un espadachín errante de los ríos y los lagos',
    desc: 'espadachín errante chino · rápido y esquivo, pero frágil · jian, dao y guandao · empieza con las Espadas Voladoras y la Palma del Buda',
    hp: 90, guard: 0, run: 1.1, dash: 0.8,
    forms: ['katana', 'dual', 'spear'], own: true, weapon: 'jian', technique: 'feijian', technique2: 'palma'
  },
  hwarang: {
    id: 'hwarang', name: 'Hwarang', kanji: '花郎', address: 'caballero', wanderer: 'un caballero flor cualquiera de Silla',
    desc: 'caballero flor coreano · equilibrado y firme · espada de anilla, woldo y espadas gemelas · empieza con la Tormenta de Pétalos y la Lluvia de Flechas',
    hp: 110, guard: 0.05, run: 1.02, dash: 0.92,
    forms: ['katana', 'dual', 'spear'], own: true, weapon: 'hwandu', technique: 'petalos', technique2: 'flechas'
  }
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

const KEY = 'ronin-ascii.class';
try {
  const saved = localStorage.getItem(KEY);
  if (saved && saved in CLASSES) state.cls = saved as ClassId;
} catch { /* no storage */ }

export const cls = () => CLASSES[state.cls];
/** a weapon forged for one class (Weapon.cls) is only its own; boss relics can be wielded by any class; the rest go to the classes wielding their form */
export const canWield = (w: { form?: WeaponForm; cls?: ClassId; bossDrop?: boolean }) =>
  w.bossDrop ? true : w.cls ? w.cls === state.cls : !cls().own && cls().forms.includes(w.form ?? 'katana');
/** only changes the stored choice: class-select.ts re-dresses and re-arms the avatar */
export function storeClass(id: ClassId) {
  state.cls = id;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
