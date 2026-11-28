import { state } from './state';

export const TECHNIQUES = {
  tajos: { name: 'Danza de los Mil Tajos', short: 'Mil Tajos', kanji: '千刃', color: 0xe6f0ff,
    description: 'Cruzas el campo en destellos y cortas hasta a 6 onis a 13 m. Cada tajo hiere también a quien esté en tu camino.' },
  rayo: { name: 'Rayo de Raijin', short: 'Rayo', kanji: '雷', color: 0xaacbff,
    description: 'Hasta 8 rayos caen sobre los onis a 15 m. Se gana venciendo al guardián del Templo del Rayo.' },
  viento: { name: 'Corte del Vendaval', short: 'Vendaval', kanji: '風', color: 0x81ffcc, cost: 2,
    description: 'Lanza un tajo que atraviesa a los onis en línea recta hasta 24 m.' },
  fuego: { name: 'Anillo de Brasas', short: 'Brasas', kanji: '炎', color: 0xff993f, cost: 3,
    description: 'Un anillo de fuego se expande hasta 10 m, aturde y empuja a los onis.' },
  agua: { name: 'Marea Lunar', short: 'Marea Lunar', kanji: '潮', color: 0x76c5ff, cost: 4,
    description: 'Una ola de 12 m golpea en abanico y recupera hasta 24 de vida al acertar.' },
  cuatroLlamas: { name: 'Cuatro Llamas', short: 'Cuatro Llamas', kanji: '四炎', color: 0xff693b, cost: 5,
    description: 'Cuatro tajos simultáneos. Se reparten si hay 3 o más onis a 14 m y queman a cada alcanzado durante 2,4 s.' },
  // the sōhei's own: the bell he starts with, the sutras taught to monks at the Templo del Viento
  campana: { name: 'Campana del Templo', short: 'Campana', kanji: '鐘', color: 0xffcf6e,
    description: 'Golpeas el suelo con el bastón y suena una campana de bronce: la onda llega a 11 m, empuja y aturde a todos los onis durante 2,4 s.' },
  sutras: { name: 'Escudo de Sutras', short: 'Sutras', kanji: '経', color: 0xfff0b8, cost: 3,
    description: 'Seis sutras de luz giran a tu alrededor durante 12 s. Cada una detiene un golpe y estalla contra los onis que te rodean.' },
  // the swordsmen from across the sea start with their own
  feijian: { name: 'Espadas Voladoras', short: 'Feijian', kanji: '飛剣', color: 0x7dffc0,
    description: 'Seis espadas de luz salen de tu espalda y vuelan hasta 6 onis a 15 m: cada una hiere, aturde y los empuja.' },
  petalos: { name: 'Tormenta de Pétalos', short: 'Pétalos', kanji: '花嵐', color: 0xff8ab8,
    description: 'Un remolino de pétalos de 10 m te rodea: hiere y aturde a los onis, te cura 4 por cada uno y te vuelve intocable 1 s.' },
  // every class's second technique, ready on J from the first run (arts.ts)
  iai: { name: 'Iaijutsu del Relámpago', short: 'Iai', kanji: '居合', color: 0xfff4d6,
    description: 'Desenvainas y cruzas 12 m en un instante, intocable. Al envainar, cada oni de tu camino recibe un corte profundo y queda aturdido.' },
  rueda: { name: 'Rueda del Dharma', short: 'Dharma', kanji: '法輪', color: 0xffb347,
    description: 'Tu bastón gira durante 2,4 s y arrastra hacia ti a los onis a 8 m, golpeándolos sin parar. Al final los despide con una onda.' },
  palma: { name: 'Palma del Buda', short: 'Palma', kanji: '仏掌', color: 0xffe08a,
    description: 'Una palma dorada gigante cae del cielo sobre el oni más cercano por delante (hasta 10 m): aplasta a todos en 5,5 m y los aturde 2 s.' },
  flechas: { name: 'Lluvia de Flechas', short: 'Flechas', kanji: '矢雨', color: 0xffd6e6,
    description: 'Durante 2,5 s llueven flechas sobre los onis más cercanos (16 m): cada una hiere y frena a quien alcanza.' },
  // more temple lessons, bought with jade seals
  tornado: { name: 'Ojo del Tifón', short: 'Tifón', kanji: '颶風', color: 0xa8ffe8, cost: 4,
    description: 'Un tornado avanza delante de ti durante 3,5 s: atrae a los onis a 6 m y los golpea una y otra vez.' },
  meteoro: { name: 'Lluvia de Meteoros', short: 'Meteoros', kanji: '流星', color: 0xff7a2e, cost: 5,
    description: 'Seis meteoros caen sobre los onis a 16 m: cada uno estalla en 3,5 m, quema y derriba.' },
  hielo: { name: 'Aliento Glacial', short: 'Glacial', kanji: '氷息', color: 0xbfefff, cost: 3,
    description: 'Un aliento helado en abanico de 11 m congela a los onis 3 s. Cuando el hielo se rompe, vuelve a herirlos.' },
  tierra: { name: 'Grieta del Trueno', short: 'Grieta', kanji: '雷裂', color: 0xd9b27a, cost: 4,
    description: 'Golpeas la tierra y una grieta corre 18 m: colmillos de roca y chispas lanzan por los aires a cada oni del camino.' },
  espectros: { name: 'Clones Espectrales', short: 'Espectros', kanji: '分身', color: 0x72f0ff, cost: 4,
    description: 'Invocas 3 copias espectrales de tu guerrero que persiguen y atacan a los onis durante 8 s.' },
} as const;

export type TechniqueId = keyof typeof TECHNIQUES;
/** each class's own techniques: never taught at a temple */
export type ClassTechniqueId = 'tajos' | 'campana' | 'feijian' | 'petalos' | 'iai' | 'rueda' | 'palma' | 'flechas';
/** taught (or won) at a temple: everything but the techniques a class starts with */
export type TempleTechniqueId = Exclude<TechniqueId, ClassTechniqueId>;
/** bought from a master with jade seals */
export type JadeTechniqueId = Exclude<TempleTechniqueId, 'rayo'>;
/** the techniques that run out from you as a wave (technique-waves.ts) */
export type WaveTechniqueId = 'viento' | 'fuego' | 'agua' | 'campana' | 'petalos';

/** the two slots: P (state.technique) and J (state.technique2) */
export type Slot = 1 | 2;
export const SLOT_KEY = { 1: 'P', 2: 'J' } as const;
export const slotTechnique = (slot: Slot) => slot === 1 ? state.technique : state.technique2;
/** the slot a technique is equipped in (0: none) */
export const slotOf = (id: TechniqueId): Slot | 0 => state.technique === id ? 1 : state.technique2 === id ? 2 : 0;

/** puts a known technique in a slot; if it was in the other one, the two swap */
export function equipTechnique(id: TechniqueId, slot: Slot) {
  const other = slot === 1 ? state.technique2 : state.technique, here = slotTechnique(slot);
  if (here === id) return;
  if (other === id) { state.technique = slot === 1 ? id : here; state.technique2 = slot === 1 ? here : id; return; }
  if (slot === 1) state.technique = id; else state.technique2 = id;
}

/** next learnt technique in a slot (the one in the other slot is skipped) */
export function cycleTechnique(slot: Slot = 1) {
  const list = state.learnedTechniques, other = slot === 1 ? state.technique2 : state.technique;
  const start = list.indexOf(slotTechnique(slot));
  for (let i = 1; i <= list.length; i++) {
    const id = list[(start + i) % list.length];
    if (id !== other) { equipTechnique(id, slot); break; }
  }
  return TECHNIQUES[slotTechnique(slot)];
}

/** a technique won in battle (a temple guardian): learnt and equipped at once */
export function earnTechnique(id: TechniqueId) {
  if (state.learnedTechniques.includes(id)) return false;
  state.learnedTechniques.push(id);
  state.technique = id;
  return true;
}
