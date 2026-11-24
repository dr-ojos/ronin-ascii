import { state } from './state';

export const TECHNIQUES = {
  tajos: { name: 'Danza de los Mil Tajos', short: 'Mil Tajos', color: 0xe6f0ff,
    description: 'Cruzas el campo en destellos y cortas hasta a 6 onis a 13 m. Cada tajo hiere también a quien esté en tu camino.' },
  rayo: { name: 'Rayo de Raijin', short: 'Rayo', color: 0xaacbff,
    description: 'Hasta 8 rayos caen sobre los onis a 15 m. Se gana venciendo al guardián del Templo del Rayo.' },
  viento: { name: 'Corte del Vendaval', short: 'Vendaval', color: 0x81ffcc, cost: 2,
    description: 'Lanza un tajo que atraviesa a los onis en línea recta hasta 24 m.' },
  fuego: { name: 'Anillo de Brasas', short: 'Brasas', color: 0xff993f, cost: 3,
    description: 'Un anillo de fuego se expande hasta 10 m, aturde y empuja a los onis.' },
  agua: { name: 'Marea Lunar', short: 'Marea Lunar', color: 0x76c5ff, cost: 4,
    description: 'Una ola de 12 m golpea en abanico y recupera hasta 24 de vida al acertar.' },
  cuatroLlamas: { name: 'Cuatro Llamas', short: 'Cuatro Llamas', color: 0xff693b, cost: 5,
    description: 'Cuatro tajos simultáneos. Se reparten si hay 3 o más onis a 14 m y queman a cada alcanzado durante 2,4 s.' },
  // the sōhei's own: the bell he starts with, the sutras taught to monks at the Templo del Viento
  campana: { name: 'Campana del Templo', short: 'Campana', color: 0xffcf6e,
    description: 'Golpeas el suelo con el bastón y suena una campana de bronce: la onda llega a 11 m, empuja y aturde a todos los onis durante 2,4 s.' },
  sutras: { name: 'Escudo de Sutras', short: 'Sutras', color: 0xfff0b8, cost: 3,
    description: 'Seis sutras de luz giran a tu alrededor durante 12 s. Cada una detiene un golpe y estalla contra los onis que te rodean.' },
} as const;

export type TechniqueId = keyof typeof TECHNIQUES;
/** taught (or won) at a temple: everything but the techniques a class starts with */
export type TempleTechniqueId = Exclude<TechniqueId, 'tajos' | 'campana'>;
/** bought from a master with jade seals */
export type JadeTechniqueId = Exclude<TempleTechniqueId, 'rayo'>;
/** the techniques that run out from you as a wave (technique-waves.ts) */
export type WaveTechniqueId = 'viento' | 'fuego' | 'agua' | 'campana';

export function cycleTechnique() {
  const index = state.learnedTechniques.indexOf(state.technique);
  state.technique = state.learnedTechniques[(index + 1) % state.learnedTechniques.length];
  return TECHNIQUES[state.technique];
}

/** a technique won in battle (a temple guardian): learnt and equipped at once */
export function earnTechnique(id: TechniqueId) {
  if (state.learnedTechniques.includes(id)) return false;
  state.learnedTechniques.push(id);
  state.technique = id;
  return true;
}
