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
} as const;

export type TechniqueId = keyof typeof TECHNIQUES;
/** taught (or won) at a temple: everything but the sword dance you start with */
export type TempleTechniqueId = Exclude<TechniqueId, 'tajos'>;
/** bought from a master with jade seals */
export type JadeTechniqueId = Exclude<TempleTechniqueId, 'rayo'>;
export type WaveTechniqueId = Exclude<JadeTechniqueId, 'cuatroLlamas'>;

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
