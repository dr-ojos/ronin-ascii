// Graphics quality: how many pixels the scene is drawn at and how fine (and soft) the moon's shadows are.
// Pure data + storage, so renderer.ts and world.ts can read it while they set themselves up; the switch
// while playing is apply-quality.ts, the row that changes it is in the H menu (info.ts).
import * as THREE from 'three';

export type Quality = 'alta' | 'media' | 'baja';
export const QUALITIES: readonly Quality[] = ['alta', 'media', 'baja'];

export interface QualityPreset {
  name: string;
  /** the most screen pixels per CSS pixel (Retina screens have 2: up to 4× the pixels to draw) */
  maxDpr: number;
  shadowType: THREE.ShadowMapType;
  /** side of the moon's shadow map, in texels */
  shadowMap: number;
  note: string;
}
export const QUALITY_PRESETS: Record<Quality, QualityPreset> = {
  alta:  { name: 'Alta',  maxDpr: 2,   shadowType: THREE.PCFSoftShadowMap, shadowMap: 4096, note: 'resolución completa y sombras suaves' },
  media: { name: 'Media', maxDpr: 1.5, shadowType: THREE.PCFShadowMap,     shadowMap: 2048, note: 'menos píxeles, sombras más simples · más fluido' },
  baja:  { name: 'Baja',  maxDpr: 1,   shadowType: THREE.PCFShadowMap,     shadowMap: 1024, note: 'la más rápida, para ordenadores modestos' }
};

const KEY = 'ronin-quality';
function load(): Quality {
  try {
    const q = localStorage.getItem(KEY) as Quality | null;
    if (q && QUALITIES.includes(q)) return q;
  } catch { /* no storage */ }
  return 'alta';
}
export let quality: Quality = load();
export const preset = () => QUALITY_PRESETS[quality];
export function storeQuality(q: Quality) {
  quality = q;
  try { localStorage.setItem(KEY, q); } catch { /* ignore */ }
}
export const dprFor = (q: Quality) => Math.min(window.devicePixelRatio || 1, QUALITY_PRESETS[q].maxDpr);
