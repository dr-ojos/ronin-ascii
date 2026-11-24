// Who you play. The ronin fights with blades and starts with the sword dance; the sōhei, a warrior monk,
// fights with a staff whose blows daze, takes more punishment, walks a little slower and starts with the
// temple bell. Chosen on the title screen (class-select.ts) and saved in the browser. Each class keeps its
// own look (look.ts), wields only its own weapon forms (weapons.ts) and starts each run with its own gear.
import { state } from './state';
import type { TechniqueId } from './techniques';
import type { WeaponForm } from './types';

export type ClassId = 'ronin' | 'sohei';
export interface CharacterClass {
  id: ClassId;
  name: string;
  kanji: string;
  /** one line on the title screen */
  desc: string;
  /** what the smith calls you */
  address: string;
  /** life at the start of a run, share of damage shrugged off (0..1), running speed multiplier */
  hp: number; guard: number; run: number;
  /** the weapon forms it can wield, the weapon and technique it starts with */
  forms: readonly WeaponForm[];
  weapon: string;
  technique: TechniqueId;
}

export const CLASSES: Record<ClassId, CharacterClass> = {
  ronin: {
    id: 'ronin', name: 'Ronin', kanji: '浪人', address: 'ronin',
    desc: 'samurái sin señor · katanas, lanzas y espadas · empieza con la Danza de los Mil Tajos',
    hp: 100, guard: 0, run: 1,
    forms: ['katana', 'spear', 'broad', 'dual'], weapon: 'katana', technique: 'tajos'
  },
  sohei: {
    id: 'sohei', name: 'Sōhei', kanji: '僧兵', address: 'monje',
    desc: 'monje guerrero · más vida y aguante, algo más lento · su bastón aturde · empieza con la Campana del Templo',
    hp: 130, guard: 0.1, run: 0.93,
    forms: ['staff'], weapon: 'bo', technique: 'campana'
  }
};
export const CLASS_IDS = Object.keys(CLASSES) as ClassId[];

const KEY = 'ronin-ascii.class';
try {
  const saved = localStorage.getItem(KEY);
  if (saved && saved in CLASSES) state.cls = saved as ClassId;
} catch { /* no storage */ }

export const cls = () => CLASSES[state.cls];
export const canWield = (form: WeaponForm = 'katana') => cls().forms.includes(form);
/** only changes the stored choice: class-select.ts re-dresses and re-arms the avatar */
export function storeClass(id: ClassId) {
  state.cls = id;
  try { localStorage.setItem(KEY, id); } catch { /* ignore */ }
}
