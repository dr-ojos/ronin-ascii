// Oni: the kinds there are, the live list and spawning (mocap-rigged or procedural) at a camp.
// Their behaviour is in enemy-ai.ts; where they stand and when they appear, in encounters.ts.
import * as THREE from 'three';
import { rigGltf } from './assets';
import { createOniWarrior, oniDrum, oniScythe, type OniLook } from './rig';
import { createBeast, type BeastLook } from './beasts';
import { oniCostume, oniMask, oniYumi } from './oni-costume';
import { bladeGeometry } from './samurai';
import { scene } from './renderer';
import { ACTOR_LAYER } from './ascii';
import { M, CLS, tagTree } from './materials';
import { surfaceY } from './structures';
import { addLight, removeLights } from './lights';
import { clearEnemyAttack, type EnemyMove } from './enemy-moves';
import { rnd } from './utils';
import { foeDmg, foeDmgAt, foeHp, foeHpAt, foeSpeed, foeSpeedAt, foeWindup, foeWindupAt, onLevelUp } from './progression';
import type { Camp, Enemy, EnemyKind, EnemyModel } from './types';

/** every kind of oni: size, toughness, speed, how hard and how far it hits, its look and its worth */
type KindDef = {
  name: string; scale: number; hp: number; speed: [number, number]; dmg: number; reach: number; windup: number;
  heavy: boolean; points: number; glyph: string;
  /** shoots instead of striking (keeps its distance) */
  ranged?: boolean;
  /** a sub-boss: guards a chest, glows with its own colour, its name shows over the life bar */
  elite?: { aura: number };
  /** a major boss changes its attack cycle at half health (or across 3 phases when phase3 is set) */
  boss?: { aura: number; enraged: readonly EnemyMove[]; phase3?: readonly EnemyMove[] };
  moves?: readonly EnemyMove[];
} & (
  | { beast: BeastLook; look?: never }
  | { beast?: never; look: Omit<OniLook, 'big'>; robe: number; maskC: number }
);
export const KINDS: Record<EnemyKind, KindDef> = {
  // the club-wielding oni: the common one
  oni:      { name: 'oni', scale: 1, hp: 3, speed: [2.8, 3.6], dmg: 11, reach: 1.55, windup: 0.55, heavy: false, points: 100, glyph: 'o',
              look: { tint: 0x23202a, mask: 0x8e1d14, weapon: 'club' }, robe: 0x6a2a6a, maskC: 0xe6ddc8 },
  // a quick spearman: weak, fast, strikes from further away with almost no warning
  ashigaru: { name: 'lancero', scale: 0.88, hp: 2, speed: [4.2, 4.8], dmg: 8, reach: 2.3, windup: 0.34, heavy: false, points: 120, glyph: 'y',
              look: { tint: 0x1c2a3a, mask: 0x2f5f8e, eye: 0xbfe8ff, weapon: 'spear' }, robe: 0x2a3a5a, maskC: 0x6a9ac8 },
  // an archer: keeps its distance and shoots arrows you can dodge (SPACE) or outrun
  arquero:  { name: 'arquero', scale: 0.92, hp: 2, speed: [3.2, 3.6], dmg: 9, reach: 13, windup: 0.9, heavy: false, points: 150, glyph: 'a',
              look: { tint: 0x2a2a18, mask: 0xc9a227, eye: 0xff4020, weapon: 'bow' }, robe: 0x5a5a2a, maskC: 0xe8c860 },
  // a brute: slow and tough, slams the ground around it (no facing needed: step back or dodge)
  bruto:    { name: 'bruto', scale: 1.28, hp: 7, speed: [2.0, 2.3], dmg: 20, reach: 2.6, windup: 0.85, heavy: true, points: 300, glyph: 'B',
              look: { tint: 0x1a2a1c, mask: 0x3f7a3a, eye: 0xfff060, weapon: 'bigclub' }, robe: 0x2a4a2a, maskC: 0x6aa860 },
  escudero: { name: 'escudero oni', scale: 1.05, hp: 4, speed: [2.6, 3.0], dmg: 12, reach: 1.7, windup: 0.62, heavy: false, points: 180, glyph: 'E',
              look: { tint: 0x35322a, mask: 0xb99247, eye: 0xffe99c, weapon: 'club', shield: true }, robe: 0x5c4828, maskC: 0xb99247 },
  acechador: { name: 'acechador', scale: 0.85, hp: 3, speed: [4.7, 5.2], dmg: 13, reach: 1.5, windup: 0.55, heavy: false, points: 180, glyph: 'v',
               look: { tint: 0x261b24, mask: 0xcb392f, eye: 0xff7150, weapon: 'sword' }, robe: 0x55243c, maskC: 0xcb392f, moves: ['pounce'] },
  hechicero: { name: 'hechicero oni', scale: 0.98, hp: 3, speed: [2.9, 3.3], dmg: 15, reach: 11, windup: 0.95, heavy: false, points: 220, glyph: 'h', ranged: true,
               look: { tint: 0x372041, mask: 0xb267da, eye: 0xe3a6ff, weapon: 'staff' }, robe: 0x552f69, maskC: 0xb267da, moves: ['curse'] },
  guadanero: { name: 'guadañero', scale: 1.12, hp: 4, speed: [2.9, 3.3], dmg: 14, reach: 3.3, windup: 0.75, heavy: false, points: 220, glyph: 'g',
               look: { tint: 0x28473f, mask: 0x74ad8c, eye: 0xcdffd3, weapon: 'scythe' }, robe: 0x2c4b3e, maskC: 0x74ad8c,
               moves: ['hook', 'staffStrike'] },
  piromante: { name: 'piromante de las brasas', scale: 1.01, hp: 4, speed: [2.8, 3.2], dmg: 15, reach: 12, windup: 1, heavy: false, points: 250, glyph: 'f', ranged: true,
               look: { tint: 0x593221, mask: 0xed672d, eye: 0xffc160, weapon: 'staff', crest: 'halo' }, robe: 0x664129, maskC: 0xea6c2d, moves: ['fire'] },
  duelista: { name: 'duelista de marfil', scale: 1.12, hp: 6, speed: [3.8, 4.2], dmg: 16, reach: 3.2, windup: 0.8, heavy: false, points: 290, glyph: 'd',
              look: { tint: 0x344257, mask: 0xe5d9bf, eye: 0xffd194, weapon: 'sword', crest: 'crescent' }, robe: 0x384963, maskC: 0xe5d9bf,
              moves: ['riposte', 'blade'] },
  tambor: { name: 'tambor de guerra', scale: 1.14, hp: 6, speed: [2.7, 3.1], dmg: 15, reach: 3, windup: 0.8, heavy: false, points: 325, glyph: 'm',
            look: { tint: 0x423a18, mask: 0xd5a84f, eye: 0xccffa0, weapon: 'drum' }, robe: 0x585526, maskC: 0xd5a84f, moves: ['rally', 'staffStrike'] },
  sombra: { name: 'sombra del bambú', scale: 0.96, hp: 6, speed: [4.4, 4.9], dmg: 18, reach: 3, windup: 0.57, heavy: false, points: 340, glyph: 's',
            look: { tint: 0x251e3d, mask: 0x9577d1, eye: 0xe7bcff, weapon: 'sword', crest: 'feathers' }, robe: 0x352245, maskC: 0x9577d1,
            moves: ['shadowCut', 'pounce'] },
  coloso: { name: 'coloso de obsidiana', scale: 1.48, hp: 13, speed: [2.3, 2.6], dmg: 26, reach: 3.5, windup: 1, heavy: true, points: 490, glyph: 'Q',
            look: { tint: 0x22262d, mask: 0x48677d, eye: 0x8be8ff, weapon: 'bigclub', plated: true }, robe: 0x292e3b, maskC: 0x48677d,
            moves: ['shockwave', 'crush'] },
  lobo: { name: 'lobo gris', scale: 0.94, hp: 3, speed: [5.6, 6.2], dmg: 10, reach: 4, windup: 0.56, heavy: false, points: 130, glyph: 'w',
          beast: { species: 'wolf', coat: 0x5f6573, trim: 0x98999d, eye: 0xffd293 }, moves: ['wolfPounce', 'bite'] },
  loboAlfa: { name: 'lobo alfa', scale: 1.18, hp: 7, speed: [6.1, 6.5], dmg: 15, reach: 5, windup: 0.62, heavy: false, points: 250, glyph: 'W',
              beast: { species: 'wolf', coat: 0xbac6d1, trim: 0x657485, eye: 0xffbb66, alpha: true }, moves: ['alphaPounce', 'bite'] },
  oso: { name: 'oso pardo', scale: 1.26, hp: 15, speed: [2.9, 3.2], dmg: 24, reach: 3.3, windup: 0.85, heavy: true, points: 470, glyph: 'U',
         beast: { species: 'bear', coat: 0x594031, trim: 0x997457, eye: 0xcfa974 }, moves: ['bearSwipe', 'bearRush', 'bearSwipe'] },
  jabali: { name: 'jabalí', scale: 1.14, hp: 5, speed: [3.2, 3.8], dmg: 15, reach: 7, windup: 0.75, heavy: true, points: 190, glyph: 'j',
            beast: { species: 'boar', coat: 0x56514a, trim: 0x8d7662, eye: 0xffa873 }, moves: ['boarRush'] },
  arana: { name: 'araña de seda', scale: 1.08, hp: 4, speed: [3.5, 4.0], dmg: 11, reach: 9, windup: 0.82, heavy: false, points: 205, glyph: '8', ranged: true,
           beast: { species: 'spider', coat: 0x382c43, trim: 0x946d74, eye: 0xffb05c }, moves: ['web', 'bite'] },
  escorpion: { name: 'escorpión de cristal', scale: 1.12, hp: 6, speed: [4.0, 4.5], dmg: 16, reach: 9.5, windup: 0.72, heavy: false, points: 270, glyph: 'c',
               beast: { species: 'scorpion', coat: 0x4fd2f5, trim: 0xc8f8ff, eye: 0xffffff }, moves: ['scorpionSting', 'crystalShard'] },
  espectro: { name: 'samurái espectral', scale: 1.11, hp: 7, speed: [3.3, 3.7], dmg: 16, reach: 10, windup: 0.9, heavy: false, points: 315, glyph: 'S',
              look: { tint: 0x314861, mask: 0xa1c9d8, eye: 0xbbfcff, weapon: 'sword', crest: 'halo' }, robe: 0x3d6079, maskC: 0xa1c9d8,
              moves: ['crescent', 'shadowCut'] },
  // major bosses, with separate attack cycles for each phase
  jefe:     { name: 'oni sepulcral', scale: 1.58, hp: 21, speed: [2.4, 2.6], dmg: 25, reach: 3.3, windup: 0.67, heavy: true, points: 720, glyph: 'O',
              look: { tint: 0x3d1e12, mask: 0xad6037, eye: 0xffb353, weapon: 'bigclub' }, robe: 0x8a1a14, maskC: 0xc06038,
              moves: ['crush', 'slam'], boss: { aura: 0xff8a44, enraged: ['quake', 'crush', 'slam'] } },
  kuro:     { name: 'Señor Kuro, Shōgun Carmesí', scale: 1.78, hp: 56, speed: [3.7, 4.0], dmg: 34, reach: 4.1, windup: 0.60, heavy: true, points: 2600, glyph: 'D',
              look: { tint: 0x201218, mask: 0xb82430, eye: 0xff453c, weapon: 'sword', crest: 'crescent', plated: true, spikes: true, thirdEye: true, cape: true }, robe: 0x2e121b, maskC: 0xc22b36,
              moves: ['bladeRush', 'blade', 'eclipseSlash', 'fire'],
              boss: { aura: 0xff3038, enraged: ['whirlwind', 'bladeRush', 'eclipseSlash', 'blade'], phase3: ['cataclysm', 'eclipseSlash', 'bladeRush', 'whirlwind', 'fire'] } },
  // --- Castle Kuro fortress bosses (kuro-castle.ts & encounters.ts) ---
  kuroCapitan: { name: 'Capitán Kagemaru, Guardia de Kuro', scale: 1.54, hp: 30, speed: [3.6, 3.9], dmg: 26, reach: 3.6, windup: 0.64, heavy: true, points: 1200, glyph: 'G',
                 look: { tint: 0x1c141a, mask: 0xa6262e, eye: 0xff8040, weapon: 'spear', crest: 'horns', plated: true, spikes: true }, robe: 0x2d1620, maskC: 0xa6262e,
                 moves: ['bladeRush', 'riposte', 'shockwave'], boss: { aura: 0xff5a36, enraged: ['bladeRush', 'whirlwind', 'shockwave', 'riposte'] } },
  kuroOnmyoji: { name: 'Maestro Kurama, Onmyōji de la Sangre', scale: 1.58, hp: 36, speed: [3.5, 3.8], dmg: 29, reach: 12.5, windup: 0.66, heavy: false, points: 1550, glyph: 'M', ranged: true,
                 look: { tint: 0x240e1c, mask: 0xd63652, eye: 0xffc864, weapon: 'staff', crest: 'flames', thirdEye: true, cape: true }, robe: 0x3b1224, maskC: 0xd63652,
                 moves: ['fire', 'curse', 'crescent', 'gust'], boss: { aura: 0xff4a6a, enraged: ['storm', 'fire', 'curse', 'eclipseSlash'] } },
  kuroJuggernaut: { name: 'Tetsujin, Verdugo de Hierro', scale: 1.84, hp: 44, speed: [2.7, 3.0], dmg: 34, reach: 4.0, windup: 0.74, heavy: true, points: 1800, glyph: 'T',
                    look: { tint: 0x18181f, mask: 0xb8522a, eye: 0xffb84a, weapon: 'bigclub', crest: 'horns', plated: true, spikes: true }, robe: 0x242028, maskC: 0xb8522a,
                    moves: ['crush', 'quake', 'slam', 'shockwave'], boss: { aura: 0xff7b28, enraged: ['cataclysm', 'quake', 'crush', 'shockwave'] } },
  kuroSombra: { name: 'Kage-Hime, Dama de las Sombras', scale: 1.56, hp: 38, speed: [4.2, 4.5], dmg: 30, reach: 3.8, windup: 0.56, heavy: true, points: 1650, glyph: 'K',
                look: { tint: 0x12101a, mask: 0xe03248, eye: 0xff92a8, weapon: 'scythe', crest: 'feathers', cape: true }, robe: 0x1e1428, maskC: 0xe03248,
                moves: ['shadowCut', 'bladeRush', 'hook', 'crescent'], boss: { aura: 0xe63868, enraged: ['eclipseSlash', 'shadowCut', 'bladeRush', 'whirlwind'] } },
  tenguMayor: { name: 'tengu de los Cinco Vientos', scale: 1.42, hp: 42, speed: [3.9, 4.2], dmg: 30, reach: 15, windup: 0.68, heavy: false, points: 1500, glyph: 'V', ranged: true,
                look: { tint: 0x193f39, mask: 0x57bba5, eye: 0xc0ffbe, weapon: 'bow', tengu: true, crest: 'feathers' }, robe: 0x1d5447, maskC: 0x70cdad,
                moves: ['arrowStorm', 'gust', 'arrows'], boss: { aura: 0x74ffd1, enraged: ['arrowStorm', 'gust', 'arrowStorm', 'storm'] } },
  raijinMayor: { name: 'Raijin de la Cumbre', scale: 1.66, hp: 48, speed: [3.1, 3.4], dmg: 38, reach: 3.9, windup: 0.72, heavy: true, points: 1700, glyph: 'J',
                 look: { tint: 0x222f6c, mask: 0x6876d8, eye: 0xd0eaff, weapon: 'bigclub', crest: 'halo' }, robe: 0x222f6c, maskC: 0x8695df,
                 moves: ['thunder', 'quake', 'slam', 'crush'], boss: { aura: 0x8ca9ff, enraged: ['storm', 'shockwave', 'quake', 'thunder'] } },
  // the elemental temple guardians: 3-phase mythic bosses who defend each temple courtyard with their guard squad
  guardianViento: { name: 'Fūjin, guardián del viento', scale: 1.72, hp: 54, speed: [4.2, 4.6], dmg: 35, reach: 4.0, windup: 0.54, heavy: true, points: 2200, glyph: 'W',
                    look: { tint: 0x163832, mask: 0x9cf2d4, eye: 0x81ffcc, weapon: 'sword', crest: 'feathers', plated: true, cape: true }, robe: 0x204f46, maskC: 0x81ffcc,
                    moves: ['bladeRush', 'gust', 'shadowCut', 'whirlwind'],
                    boss: { aura: 0x81ffcc, enraged: ['gust', 'whirlwind', 'bladeRush', 'eclipseSlash', 'shadowCut'], phase3: ['cataclysm', 'bladeRush', 'gust', 'eclipseSlash', 'whirlwind'] } },
  guardianFuego: { name: 'Homura, guardián de las brasas', scale: 1.80, hp: 60, speed: [3.7, 4.0], dmg: 40, reach: 4.2, windup: 0.58, heavy: true, points: 2400, glyph: 'F',
                   look: { tint: 0x3b120e, mask: 0xff8a3d, eye: 0xffd166, weapon: 'scythe', crest: 'flames', plated: true, spikes: true, cape: true }, robe: 0x5c1c14, maskC: 0xff993f,
                   moves: ['fire', 'hook', 'quake', 'eclipseSlash'],
                   boss: { aura: 0xff7a30, enraged: ['fire', 'whirlwind', 'quake', 'eclipseSlash', 'cataclysm'], phase3: ['cataclysm', 'fire', 'eclipseSlash', 'quake', 'whirlwind'] } },
  guardianAgua: { name: 'Suijin, guardián de la marea', scale: 1.76, hp: 56, speed: [3.9, 4.3], dmg: 37, reach: 4.1, windup: 0.56, heavy: true, points: 2300, glyph: 'A',
                  look: { tint: 0x132642, mask: 0x9fd8ff, eye: 0x76c5ff, weapon: 'spear', crest: 'crescent', plated: true, thirdEye: true, cape: true }, robe: 0x1c3a63, maskC: 0x8fd2ff,
                  moves: ['crescent', 'bladeRush', 'riposte', 'shockwave'],
                  boss: { aura: 0x76c5ff, enraged: ['crescent', 'shockwave', 'bladeRush', 'curse', 'eclipseSlash'], phase3: ['cataclysm', 'crescent', 'shockwave', 'bladeRush', 'eclipseSlash'] } },
  guardianRayo: { name: 'Ikazuchi, guardián del rayo', scale: 1.78, hp: 58, speed: [4.0, 4.4], dmg: 39, reach: 4.1, windup: 0.55, heavy: true, points: 2400, glyph: 'Z',
                  look: { tint: 0x1a2250, mask: 0xd7e3ff, eye: 0x9fdcff, weapon: 'sword', crest: 'halo', plated: true, spikes: true, cape: true }, robe: 0x24306e, maskC: 0xc4d6ff,
                  moves: ['bladeRush', 'thunder', 'storm', 'eclipseSlash'],
                  boss: { aura: 0x9fbbff, enraged: ['storm', 'whirlwind', 'bladeRush', 'thunder', 'eclipseSlash'], phase3: ['cataclysm', 'storm', 'bladeRush', 'eclipseSlash', 'thunder'] } },
  // --- the great bosses of the wilds (encounters.ts WILD_BOSSES): each with its own look and attack cycle ---
  // the oni king: a mountain of red muscle with great ox horns and a spiked iron club; shakes the earth
  shuten: { name: 'Shuten, rey de los oni', scale: 1.8, hp: 34, speed: [2.6, 2.8], dmg: 30, reach: 3.7, windup: 0.8, heavy: true, points: 1300, glyph: 'H',
            look: { tint: 0x4a0d0d, mask: 0xd23a24, eye: 0xffe14a, weapon: 'bigclub', crest: 'horns', spikes: true }, robe: 0x5a1010, maskC: 0xd23a24,
            moves: ['crush', 'quake', 'slam'], boss: { aura: 0xff3a20, enraged: ['shockwave', 'quake', 'crush', 'quake'] } },
  // the judge of the underworld: dark crimson, a crown of flames and a third eye; cuts and sets the ground alight
  enma: { name: 'Enma, juez del infierno', scale: 1.6, hp: 32, speed: [3.4, 3.6], dmg: 27, reach: 3.6, windup: 0.7, heavy: true, points: 1250, glyph: 'N',
          look: { tint: 0x2a0a12, mask: 0x7a0f1e, eye: 0xffb020, weapon: 'sword', crest: 'flames', thirdEye: true, spikes: true }, robe: 0x3a0a14, maskC: 0x7a0f1e,
          moves: ['blade', 'fire', 'bladeRush'], boss: { aura: 0xff6a1a, enraged: ['whirlwind', 'fire', 'bladeRush', 'fire'] } },
  // the lord of the dark forest: mossy green, great antlers, a scythe that hooks you in and webs of roots
  senorBosque: { name: 'Señor del Bosque Sombrío', scale: 1.66, hp: 30, speed: [3.0, 3.3], dmg: 24, reach: 3.6, windup: 0.78, heavy: true, points: 1150, glyph: 'Y',
                 look: { tint: 0x16301c, mask: 0x5c8a3c, eye: 0xd6ff6a, weapon: 'scythe', crest: 'antlers', spikes: true }, robe: 0x1d3a22, maskC: 0x5c8a3c,
                 moves: ['hook', 'web', 'staffStrike'], boss: { aura: 0x9cff5a, enraged: ['curse', 'hook', 'web', 'shockwave'] } },
  // the lady of the snow: pale, a crown of icicles, keeps her distance and throws cutting waves of frost
  yukiOnna: { name: 'Yuki, dama de la nieve', scale: 1.50, hp: 44, speed: [4.0, 4.3], dmg: 34, reach: 12, windup: 0.68, heavy: false, points: 1650, glyph: 'I', ranged: true,
              look: { tint: 0x8aa7c4, mask: 0xf1f6ff, eye: 0x6ad8ff, weapon: 'staff', crest: 'flames', thirdEye: true }, robe: 0xb9d4ea, maskC: 0xf1f6ff,
              moves: ['crescent', 'curse', 'gust', 'crescent'], boss: { aura: 0x7fe0ff, enraged: ['crescent', 'gust', 'storm', 'curse', 'crescent'] } },
  // --- the new warlords occupying the towns (and roaming the wilds) ---
  // the ash lord of Asagiri: charred armour, crown of embers and a great scythe; drags you in and burns the square
  kagutsuchi: { name: 'Kagutsuchi, señor de la ceniza', scale: 1.62, hp: 28, speed: [3.1, 3.4], dmg: 25, reach: 3.6, windup: 0.74, heavy: true, points: 1150, glyph: 'F',
                look: { tint: 0x2e120e, mask: 0xf05020, eye: 0xffd966, weapon: 'scythe', crest: 'flames', plated: true, spikes: true }, robe: 0x4a1912, maskC: 0xf05020,
                moves: ['hook', 'fire', 'slam'], boss: { aura: 0xff5522, enraged: ['fire', 'whirlwind', 'hook', 'quake'] } },
  // the bone warlord of Aldea de Kiri: pale lacquered mask, ox horns and a long spear; dashes, counters and cuts from afar
  daimyoHueso: { name: 'Daimyō de los Huesos', scale: 1.48, hp: 22, speed: [3.5, 3.8], dmg: 21, reach: 3.5, windup: 0.66, heavy: true, points: 950, glyph: 'M',
                 look: { tint: 0x26262e, mask: 0xe6dec8, eye: 0x7effb2, weapon: 'spear', crest: 'horns', plated: true, spikes: true, thirdEye: true }, robe: 0x353542, maskC: 0xe6dec8,
                 moves: ['bladeRush', 'riposte', 'crescent'], boss: { aura: 0x8ff5c8, enraged: ['bladeRush', 'shockwave', 'crescent', 'riposte'] } },
  // the crimson war-drum overlord: rallies its oni, shakes the earth with shockwaves and calls thunder
  taikoDemonio: { name: 'Oni del Tambor Carmesí', scale: 1.68, hp: 30, speed: [2.8, 3.1], dmg: 24, reach: 3.7, windup: 0.78, heavy: true, points: 1200, glyph: 'G',
                  look: { tint: 0x3b1520, mask: 0xd9a036, eye: 0xff5a36, weapon: 'drum', crest: 'halo', plated: true, spikes: true }, robe: 0x5c1a24, maskC: 0xd9a036,
                  moves: ['rally', 'shockwave', 'slam'], boss: { aura: 0xffb840, enraged: ['rally', 'quake', 'storm', 'shockwave'] } },
  // --- colossal calamity event bosses (world-events.ts): towering 3-phase mythic titans with bespoke 3D regalia ---
  gashadokuro: { name: 'Gashadokuro, Soberano del Eclipse', scale: 2.45, hp: 60, speed: [3.3, 3.6], dmg: 36, reach: 4.6, windup: 0.74, heavy: true, points: 3200, glyph: 'Ω',
                 look: { tint: 0x160a12, mask: 0xb81d2c, eye: 0xff3b58, weapon: 'sword', plated: true, spikes: true, thirdEye: true, colossal: true, crown: 'eclipse', cape: true },
                 robe: 0x240b14, maskC: 0xb81d2c,
                 moves: ['bladeRush', 'eclipseSlash', 'fire', 'quake'],
                 boss: { aura: 0xff2848, enraged: ['cataclysm', 'bladeRush', 'eclipseSlash', 'storm'], phase3: ['cataclysm', 'eclipseSlash', 'bladeRush', 'storm', 'eclipseSlash'] } },
  susanooTempestad: { name: 'Susanoo, Titán de la Tempestad', scale: 2.35, hp: 56, speed: [3.4, 3.7], dmg: 34, reach: 4.5, windup: 0.76, heavy: true, points: 3100, glyph: 'Ψ',
                      look: { tint: 0x101c3a, mask: 0xd6e6ff, eye: 0x5ce1ff, weapon: 'scythe', plated: true, spikes: true, thirdEye: true, colossal: true, crown: 'tempest', drums: true, cape: true },
                      robe: 0x182a54, maskC: 0xd6e6ff,
                      moves: ['storm', 'hook', 'shockwave', 'crescent'],
                      boss: { aura: 0x5ce1ff, enraged: ['cataclysm', 'storm', 'whirlwind', 'thunder'], phase3: ['cataclysm', 'storm', 'whirlwind', 'eclipseSlash', 'thunder'] } },
  amaterasuCeniza: { name: 'Kijin Kōtei, Emperador de la Forja', scale: 2.55, hp: 66, speed: [2.9, 3.2], dmg: 39, reach: 4.7, windup: 0.80, heavy: true, points: 3600, glyph: 'Φ',
                     look: { tint: 0x241008, mask: 0xe68422, eye: 0xffe26a, weapon: 'bigclub', plated: true, spikes: true, thirdEye: true, colossal: true, crown: 'solar', drums: true, cape: true },
                     robe: 0x3b170a, maskC: 0xe68422,
                     moves: ['quake', 'fire', 'crush', 'slam'],
                     boss: { aura: 0xff9828, enraged: ['cataclysm', 'quake', 'shockwave', 'fire'], phase3: ['cataclysm', 'quake', 'shockwave', 'fire', 'eclipseSlash'] } },
  // --- final dungeon boss of La Fortaleza Abismal (dungeon.ts) ---
  senorCripta: { name: 'Shōgun de la Cripta', scale: 1.92, hp: 46, speed: [3.3, 3.6], dmg: 31, reach: 4.0, windup: 0.68, heavy: true, points: 2200, glyph: '♛',
                 look: { tint: 0x161224, mask: 0x9b3dff, eye: 0x62f2ff, weapon: 'sword', crest: 'horns', plated: true, spikes: true, thirdEye: true, cape: true },
                 robe: 0x24183a, maskC: 0x9b3dff,
                 moves: ['bladeRush', 'eclipseSlash', 'quake', 'fire'],
                 boss: { aura: 0xa45eff, enraged: ['whirlwind', 'eclipseSlash', 'storm', 'bladeRush', 'quake'] } },
  // --- the sub-bosses that guard chests (encounters.ts) ---
  // a spear master: three lunges in a row, barely a breath between them, then a long pause (your turn)
  kensei:   { name: 'kensei de la lanza', scale: 1.14, hp: 9, speed: [4.6, 4.6], dmg: 13, reach: 2.5, windup: 0.42, heavy: false, points: 450, glyph: 'K',
              look: { tint: 0x101018, mask: 0xe8e0d0, eye: 0xff2040, weapon: 'spear' }, robe: 0x1a1a2a, maskC: 0xe8e0d0, elite: { aura: 0xbfe8ff } },
  // a tengu: shoots fans of arrows and vanishes in a gust when you get too close
  tengu:    { name: 'tengu de la niebla', scale: 1.06, hp: 7, speed: [4.0, 4.0], dmg: 10, reach: 15, windup: 0.75, heavy: false, points: 450, glyph: 'T', ranged: true,
              look: { tint: 0x1a1a22, mask: 0xc8201a, eye: 0xfff0a0, weapon: 'bow', tengu: true }, robe: 0x6a1a14, maskC: 0xc8201a, elite: { aura: 0xff6a40 } },
  // the thunder oni: calls lightning down where you stand (marked on the ground first) and slams
  raijin:   { name: 'oni del trueno', scale: 1.4, hp: 12, speed: [2.4, 2.4], dmg: 18, reach: 2.2, windup: 0.8, heavy: true, points: 500, glyph: 'R',
              look: { tint: 0x141a2e, mask: 0x2a4aa8, eye: 0xcfe0ff, weapon: 'bigclub' }, robe: 0x1a2a5a, maskC: 0x4a6ad8, elite: { aura: 0x7fa8ff } }
};
export const ELITES: EnemyKind[] = ['kensei', 'tengu', 'raijin'];
/** the bosses that can lead a camp or a patrol of the wilds, and how far out (tier) they start to appear */
export const WILD_BOSSES: [EnemyKind, number][] = [
  ['jefe', 0], ['daimyoHueso', 0.25], ['senorBosque', 0.3], ['yukiOnna', 0.35],
  ['taikoDemonio', 0.4], ['enma', 0.45], ['shuten', 0.5], ['kagutsuchi', 0.55]
];
export const isElite = (k: EnemyKind) => !!KINDS[k].elite;
export const isBoss = (k: EnemyKind) => !!KINDS[k].boss;

const oniGeo = {
  robe: new THREE.CylinderGeometry(0.247, 0.221, 0.59, 14), neck: new THREE.CylinderGeometry(0.063, 0.086, 0.16, 10),
  arm: new THREE.CapsuleGeometry(0.075, 0.47, 4, 9), leg: new THREE.CylinderGeometry(0.105, 0.075, 0.79, 10),
  sandal: new THREE.SphereGeometry(1, 10, 7), ring: new THREE.RingGeometry(0.85, 1.05, 28),
  shield: new THREE.CylinderGeometry(0.39, 0.37, 0.078, 10).rotateX(Math.PI / 2),
  staff: new THREE.CylinderGeometry(0.04, 0.04, 1.95, 6), crystal: new THREE.OctahedronGeometry(0.19),
  blade: bladeGeometry(), hilt: new THREE.CylinderGeometry(0.024, 0.021, 0.27, 10).rotateX(Math.PI / 2),
  guard: new THREE.CylinderGeometry(0.06, 0.06, 0.012, 10).rotateX(Math.PI / 2),
  yari: new THREE.CylinderGeometry(0.018, 0.022, 1.78, 9), point: new THREE.ConeGeometry(0.054, 0.26, 4),
  club: new THREE.CylinderGeometry(0.062, 0.025, 0.91, 10),
  clubRing: new THREE.TorusGeometry(0.05, 0.012, 5, 10).rotateX(Math.PI / 2)
};
const hornMat = M(0xdccca2), bladeMat = M(0xdbe4ed, { metalness: 0.7 }), bootMat = M(0x2e2426);
export const enemies: Enemy[] = [];

/** every enemy is tougher, hits harder and strikes sooner than its table numbers; bosses and temple guards even more */
const HP_MULT = 1.5, DMG_MULT = 1.3, WINDUP_MULT = 0.88, SPEED_MULT = 1.08;
const BOSS_HP = 1.65, BOSS_DMG = 1.38, BOSS_WINDUP = 0.92, BOSS_SPEED = 1.07;
const TEMPLE_HP = 1.65, TEMPLE_DMG = 1.45, TEMPLE_WINDUP = 0.82, TEMPLE_SPEED = 1.15;
/** Regional danger, acquired gear and your level (progression.ts) scale independently. */
function stats(camp: Camp, kind: EnemyKind, x: number, z: number) {
  const k = KINDS[kind], t = camp.tier, tg = !!camp.templeGuard;
  const bh = HP_MULT * (k.boss ? BOSS_HP : 1) * (tg ? TEMPLE_HP : 1);
  const bd = DMG_MULT * (k.boss ? BOSS_DMG : 1) * (tg ? TEMPLE_DMG : 1);
  const hp = Math.round(k.hp * bh * (1 + t * 0.8) * (1 + (camp.threat?.offense ?? 0) * 0.16) * foeHp());
  const dmg = Math.round(k.dmg * bd * (1 + t * 0.3) * (1 + (camp.threat?.defense ?? 0) * 0.11) * foeDmg());
  const bw = k.boss ? BOSS_WINDUP : 1, bs = k.boss ? BOSS_SPEED : 1;
  return {
    kind, hp, maxHp: hp, dmg, reach: k.reach, windup: k.windup * WINDUP_MULT * bw * (tg ? TEMPLE_WINDUP : 1) * foeWindup(), swings: 0, strikeT: 0, cd: 0,
    big: k.heavy || !!k.elite || !!k.boss, enraged: false, phase: 1, speed: rnd(k.speed[0], k.speed[1]) * SPEED_MULT * bs * (tg ? TEMPLE_SPEED : 1) * foeSpeed(), camp, wander: { x, z }
  };
}
onLevelUp(({ from, to }) => {
  const hpK = foeHpAt(to) / foeHpAt(from);
  const dmgK = foeDmgAt(to) / foeDmgAt(from);
  const spdK = foeSpeedAt(to) / foeSpeedAt(from);
  const wndK = foeWindupAt(to) / foeWindupAt(from);
  for (const en of enemies) {
    if (en.hp <= 0) continue;
    const ratio = en.maxHp > 0 ? en.hp / en.maxHp : 1;
    en.maxHp = Math.max(1, Math.round(en.maxHp * hpK));
    en.hp = Math.max(1, Math.round(en.maxHp * ratio));
    en.dmg = Math.max(1, Math.round(en.dmg * dmgK));
    en.speed *= spdK;
    en.windup *= wndK;
    if (en.staggerNeed) en.staggerNeed *= hpK;
  }
});
function place(g: THREE.Object3D, x: number, z: number, skip?: THREE.Object3D) {
  g.position.set(x, surfaceY(x, z), z); g.rotation.y = Math.random() * Math.PI * 2;
  g.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== skip) { o.castShadow = true; o.layers.enable(ACTOR_LAYER); } });
  tagTree(g, CLS.actor);
  scene.add(g);
}
export function spawnEnemy(camp: Camp, kind: EnemyKind, x: number, z: number) {
  const def = KINDS[kind];
  if (def.beast) return spawnAnimated(createBeast(def.beast), camp, kind, x, z);
  if (rigGltf) return spawnAnimated(createOniWarrior(rigGltf, { ...def.look, big: def.heavy }), camp, kind, x, z);
  const g = new THREE.Group();
  const robeMat = M(def.robe, { roughness: 0.8, emissive: 0x000000 });
  const look = { ...def.look, big: def.heavy, mask: def.maskC };
  const baseMask = oniMask(look.mask), maskMat = baseMask.clone();
  const { head, chest, belt } = oniCostume(look);
  head.traverse(o => { const part = o as THREE.Mesh; if (part.material === baseMask) part.material = maskMat; });
  head.position.set(0, 1.665, 0.015);
  chest.position.y = 1.48;
  belt.position.y = 0.93;
  const robe = new THREE.Mesh(oniGeo.robe, robeMat); robe.position.y = 1.19; robe.scale.z = 0.72;
  const neck = new THREE.Mesh(oniGeo.neck, robeMat); neck.position.y = 1.52;
  g.add(robe, neck, head, chest, belt);
  for (const s of [1, -1]) {
    const a = new THREE.Mesh(oniGeo.arm, robeMat); a.position.set(0.29 * s, 1.165, 0.08); a.rotation.set(-0.35, 0, 0.12 * s);
    const leg = new THREE.Mesh(oniGeo.leg, robeMat); leg.position.set(0.118 * s, 0.48, 0.04 * s); leg.rotation.z = 0.08 * s;
    const foot = new THREE.Mesh(oniGeo.sandal, bootMat); foot.position.set(0.149 * s, 0.052, 0.065 + 0.04 * s); foot.scale.set(0.071, 0.052, 0.122);
    g.add(a, leg, foot);
  }
  if (def.look.shield) {
    const shield = new THREE.Mesh(oniGeo.shield, maskMat); shield.position.set(0.37, 1.015, 0.28); g.add(shield);
  }
  if (def.look.weapon === 'staff') {
    const staff = new THREE.Mesh(oniGeo.staff, bootMat); staff.position.set(-0.34, 1.05, 0.212); g.add(staff);
    const gem = new THREE.Mesh(oniGeo.crystal, maskMat); gem.position.set(-0.34, 2.13, 0.212); g.add(gem);
  } else if (def.look.weapon === 'sword') {
    const sword = new THREE.Group();
    const guard = new THREE.Mesh(oniGeo.guard, hornMat); guard.position.z = 0.14;
    sword.add(new THREE.Mesh(oniGeo.blade, bladeMat), new THREE.Mesh(oniGeo.hilt, bootMat), guard);
    sword.position.set(-0.328, 0.92, 0.187); sword.rotation.set(-0.9, -0.35, 0.14); g.add(sword);
  } else if (def.look.weapon === 'scythe') {
    const scythe = oniScythe(); scythe.position.set(-0.334, 0.934, 0.194); scythe.rotation.z = 0.22; g.add(scythe);
  } else if (def.look.weapon === 'drum') {
    const drum = oniDrum(maskMat); drum.position.set(0, 1.05, 0.4); g.add(drum);
  } else if (def.look.weapon === 'bow') {
    const bow = oniYumi(); bow.position.set(0.33, 0.931, 0.188); bow.rotation.set(-0.18, 0.66, -0.17); g.add(bow);
  } else if (def.look.weapon === 'spear') {
    const yari = new THREE.Group();
    const shaft = new THREE.Mesh(oniGeo.yari, bootMat); shaft.position.y = 0.32;
    const tip = new THREE.Mesh(oniGeo.point, bladeMat); tip.position.y = 1.306; tip.scale.z = 0.48;
    yari.add(shaft, tip); yari.position.set(-0.333, 0.927, 0.191); yari.rotation.z = 0.24; g.add(yari);
  } else {
    const club = new THREE.Group(), shaft = new THREE.Mesh(oniGeo.club, bootMat);
    shaft.position.y = 0.331; club.add(shaft);
    for (let i = 0; i < 4; i++) {
      const ring = new THREE.Mesh(oniGeo.clubRing, bladeMat);
      ring.position.y = 0.42 + i * 0.102; ring.scale.setScalar(0.9 + i * 0.083); club.add(ring);
    }
    club.position.set(-0.337, 0.925, 0.193); club.rotation.set(-0.33, -0.26, 0.43);
    if (def.look.weapon === 'bigclub') club.scale.set(1.38, 1.34, 1.38);
    g.add(club);
  }
  const ring = new THREE.Mesh(oniGeo.ring, new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; g.add(ring);
  const k = def.scale * rnd(0.95, 1.05); g.scale.setScalar(k);
  place(g, x, z, ring);
  enemies.push({ g, robeMat, maskMat, ring, scale: k, ...stats(camp, kind, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10 });
  glow(enemies[enemies.length - 1]);
}
/** bosses and guardians carry their own light */
function glow(en: Enemy) {
  const def = KINDS[en.kind], e = def.boss ?? def.elite;
  const colossal = !def.beast && !!def.look.colossal;
  if (e) en.aura = addLight({
    x: en.g.position.x, y: en.g.position.y + 2 * en.scale, z: en.g.position.z,
    color: e.aura, intensity: colossal ? 4.8 : 2.6, distance: colossal ? 18 : 9, decay: 1.4, flicker: 0.6, owner: en
  });
}
/** take an oni out of the world (killed, or its camp left behind) */
export function despawn(en: Enemy) { clearEnemyAttack(en); scene.remove(en.g); removeLights(en); en.model?.dispose?.(); }

function spawnAnimated(model: EnemyModel, camp: Camp, kind: EnemyKind, x: number, z: number) {
  const { root: g, ring } = model, k = KINDS[kind].scale * rnd(0.97, 1.03);
  g.scale.setScalar(k);
  place(g, x, z, ring);
  enemies.push({ g, model, ring, scale: k, move: 0, ...stats(camp, kind, x, z), state: 'idle', t: 0, knock: new THREE.Vector3(), flash: 0, seed: Math.random() * 10 });
  glow(enemies[enemies.length - 1]);
}
