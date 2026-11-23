import { state } from './state';

export const TECHNIQUES = {
  rayo: { name: 'Rayo de Raijin', short: 'Rayo', color: 0xaacbff },
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
export type TempleTechniqueId = Exclude<TechniqueId, 'rayo'>;
export type WaveTechniqueId = Exclude<TempleTechniqueId, 'cuatroLlamas'>;

export function cycleTechnique() {
  const index = state.learnedTechniques.indexOf(state.technique);
  state.technique = state.learnedTechniques[(index + 1) % state.learnedTechniques.length];
  return TECHNIQUES[state.technique];
}
