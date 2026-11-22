// The ronin's look, chosen by the player (custom.ts): name, lacquer of the armour bands, kimono and sash,
// scarf, hat and mask. Saved in the browser. Applied to the avatar through the roles its materials and
// parts carry (rig.ts / samurai.ts tag them: userData.role on materials, userData.part on meshes).
import * as THREE from 'three';

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
  mask: [{ name: 'sin máscara', c: 0xc8955a }, { name: 'laca roja', c: 0xb0201a }, { name: 'hueso', c: 0xe8e0cc }, { name: 'negra', c: 0x18161a }, { name: 'oro', c: 0xd8a630 }]
} satisfies Record<string, Option[]>;
export type LookPart = keyof typeof LOOK_OPTIONS;
export const LOOK_LABELS: Record<LookPart, string> = { lacquer: 'Lacado', cloth: 'Kimono y faja', scarf: 'Bufanda', hat: 'Sombrero', mask: 'Máscara' };

export type Look = { name: string } & Record<LookPart, number>;
const KEY = 'ronin-ascii.look';
const DEFAULT: Look = { name: 'Ronin', lacquer: 0, cloth: 0, scarf: 0, hat: 0, mask: 0 };
export const look: Look = { ...DEFAULT };
try { Object.assign(look, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch { /* no storage */ }
for (const k of Object.keys(LOOK_OPTIONS) as LookPart[]) look[k] = ((Math.round(Number(look[k])) || 0) % LOOK_OPTIONS[k].length + LOOK_OPTIONS[k].length) % LOOK_OPTIONS[k].length;
look.name = String(look.name || DEFAULT.name).slice(0, 16);

export function saveLook() { try { localStorage.setItem(KEY, JSON.stringify(look)); } catch { /* ignore */ } }
export const opt = (k: LookPart) => LOOK_OPTIONS[k][look[k]] as Option;
export function cycleLook(k: LookPart, d: number) { const n = LOOK_OPTIONS[k].length; look[k] = (look[k] + d + n) % n; saveLook(); }
export function randomLook() { for (const k of Object.keys(LOOK_OPTIONS) as LookPart[]) look[k] = Math.floor(Math.random() * LOOK_OPTIONS[k].length); saveLook(); }

/** recolour / show-hide the avatar's parts to match the current look */
export function applyLook(root: THREE.Object3D) {
  root.traverse(obj => {
    if (obj.userData.part === 'hat') obj.visible = !opt('hat').hidden;
    const m = (obj as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
    const role = m?.userData?.role as LookPart | undefined;
    if (!m || !role || !(role in LOOK_OPTIONS)) return;
    m.color.set(opt(role).c);
    // the faint self-light follows the new colour (avatar.ts gives every material a little)
    if (!m.emissiveMap || role === 'lacquer') m.emissive.copy(m.color);
  });
}
