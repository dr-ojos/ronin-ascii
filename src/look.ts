// The ronin's look, chosen by the player (custom.ts): name, lacquer of the armour bands, kimono and sash,
// scarf, hat and mask. Saved in the browser, one look per class (classes.ts): the sōhei reuses the same
// palettes for his habit (cloth), his kesa (lacquer) and his hood (scarf); the xiákè and the hwarang for their
// robe (cloth), its trims or cord (lacquer) and the veil of the douli or the beads of the gat (scarf). Applied to the avatar through
// the roles its materials and parts carry (rig.ts / samurai.ts tag them: userData.role on materials, userData.part on meshes).
import * as THREE from 'three';
import { state } from './state';
import './classes';   // reads the stored class before the look is loaded below
import type { ClassId } from './classes';

export interface Option { name: string; c: number; hidden?: boolean }
export const LOOK_OPTIONS = {
  lacquer: [
    { name: 'bermellón', c: 0xe4573d }, { name: 'añil', c: 0x3f72d8 }, { name: 'jade', c: 0x3fae6a }, { name: 'oro', c: 0xd8a630 },
    { name: 'marfil', c: 0xe6dcc4 }, { name: 'violeta', c: 0x9a4ad0 }, { name: 'ceniza', c: 0x70747e }, { name: 'sakura', c: 0xf08cb4 }
  ],
  cloth: [
    { name: 'turquesa', c: 0x2b7f8c }, { name: 'carmesí', c: 0x9a1a1c }, { name: 'tinta', c: 0x1c1d24 }, { name: 'blanco', c: 0xd8d4cc },
    { name: 'morado', c: 0x5d2c72 }, { name: 'musgo', c: 0x4a5e2a }, { name: 'ocre', c: 0xb07a30 }
  ],
  scarf: [{ name: 'negra', c: 0x0b0a0c }, { name: 'carmesí', c: 0x8e1d14 }, { name: 'blanca', c: 0xe8e4dc }, { name: 'añil', c: 0x22336e }, { name: 'dorada', c: 0xc9a227 }],
  hat: [{ name: 'kasa de paja', c: 0xffffff }, { name: 'kasa lacada', c: 0xff6a50 }, { name: 'kasa de hielo', c: 0x9fd0ff }, { name: 'sin sombrero', c: 0xffffff, hidden: true }],
  mask: [{ name: 'sin máscara', c: 0xc8955a, hidden: true }, { name: 'laca roja', c: 0xb0201a }, { name: 'hueso', c: 0xe8e0cc }, { name: 'negra', c: 0x18161a }, { name: 'oro', c: 0xd8a630 }]
} satisfies Record<string, Option[]>;
export type LookPart = keyof typeof LOOK_OPTIONS;
/** the parts each class can restyle, in menu order, and what they are called on it */
export const LOOK_PARTS: Record<ClassId, Partial<Record<LookPart, string>>> = {
  ronin: { lacquer: 'Lacado', cloth: 'Kimono y faja', scarf: 'Bufanda', hat: 'Sombrero', mask: 'Máscara' },
  sohei: { cloth: 'Hábito', lacquer: 'Kesa', scarf: 'Capucha' },
  xia: { cloth: 'Hanfu', lacquer: 'Ribetes y faja', scarf: 'Velo' },
  hwarang: { cloth: 'Dopo', lacquer: 'Cordón', scarf: 'Cuentas del gat' },
  monarca: {},
  vagabundo: {}
};

export type Look = { name: string } & Record<LookPart, number>;
const KEY = 'ronin-ascii.look';
const keyOf = (c: ClassId) => c === 'ronin' ? KEY : `${KEY}.${c}`;
// the sōhei starts in an ink-black habit, a golden kesa and a white hood
const DEFAULTS: Record<ClassId, Look> = {
  ronin: { name: 'Ronin', lacquer: 0, cloth: 0, scarf: 0, hat: 0, mask: 0 },
  sohei: { name: 'Benkei', lacquer: 3, cloth: 2, scarf: 2, hat: 3, mask: 0 },
  // a moss-green hanfu with gilt hems and a white veil; a white dopo with a vermilion cord and amber gat beads
  xia: { name: 'Li Mu', lacquer: 3, cloth: 5, scarf: 2, hat: 3, mask: 0 },
  hwarang: { name: 'Gwanchang', lacquer: 0, cloth: 3, scarf: 4, hat: 3, mask: 0 },
  monarca: { name: 'Jin', lacquer: 0, cloth: 2, scarf: 0, hat: 3, mask: 0 },
  vagabundo: { name: 'Musashi', lacquer: 0, cloth: 0, scarf: 0, hat: 3, mask: 0 }
};
export const look: Look = { ...DEFAULTS.ronin };
/** the look saved for a class (or its default) */
export function loadLook(c: ClassId = state.cls) {
  Object.assign(look, DEFAULTS[c]);
  try { Object.assign(look, JSON.parse(localStorage.getItem(keyOf(c)) || '{}')); } catch { /* no storage */ }
  for (const k of Object.keys(LOOK_OPTIONS) as LookPart[]) look[k] = ((Math.round(Number(look[k])) || 0) % LOOK_OPTIONS[k].length + LOOK_OPTIONS[k].length) % LOOK_OPTIONS[k].length;
  look.name = String(look.name || DEFAULTS[c].name).slice(0, 16);
  if (c === 'monarca' && look.name === 'Jin-Woo') look.name = 'Jin';
}
loadLook();

export function saveLook() { try { localStorage.setItem(keyOf(state.cls), JSON.stringify(look)); } catch { /* ignore */ } }
export const opt = (k: LookPart) => LOOK_OPTIONS[k][look[k]] as Option;
export function cycleLook(k: LookPart, d: number) { const n = LOOK_OPTIONS[k].length; look[k] = (look[k] + d + n) % n; saveLook(); }
export function randomLook() { for (const k of Object.keys(LOOK_PARTS[state.cls]) as LookPart[]) look[k] = Math.floor(Math.random() * LOOK_OPTIONS[k].length); saveLook(); }

/** recolour / show-hide the avatar's parts to match the current look */
export function applyLook(root: THREE.Object3D) {
  root.traverse(obj => {
    if (obj.userData.part === 'hat') obj.visible = !opt('hat').hidden;
    if (obj.userData.part === 'mask') obj.visible = !opt('mask').hidden;
    const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    const role = m?.userData?.role as LookPart | undefined;
    if (!m || !role || !(role in LOOK_OPTIONS)) return;
    m.color.set(opt(role).c);
    // the faint self-light follows the new colour (avatar.ts gives every material a little)
    if (!m.emissiveMap || role === 'lacquer') m.emissive.copy(m.color);
  });
}
