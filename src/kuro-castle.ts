// Castle Kuro Interior Adventure ("Interior del Castillo Kuro"):
// A sprawling, handcrafted multi-wing Japanese fortress dungeon entered directly
// through the Keep Doors of Castillo Kuro in the overworld.
// Features 3 branching paths (West Wing: Santuario de Sangre, East Wing: Forja de las Cadenas,
// Central Keep: Puente del Foso & Salón del Consejo Oscuro), 3 secret treasure vaults,
// 11 combat chambers (~65+ enemies), 3 elite mini-bosses, and 4 major interior bosses
// culminating in the 3-phase battle against Señor Kuro in the Trono del Torreón Carmesí.
import { place } from './map';
import type { Chest, EnemyKind } from './types';

export interface GridRoom {
  gx0: number; gx1: number; gz0: number; gz1: number;
  theme: 'castle' | 'cave' | 'bridge' | 'boss';
  name: string;
}

export interface DungeonRoomSpec {
  id: string;
  name: string;
  lx: number; lz: number;
  r: number;
  kinds: EnemyKind[];
  chest?: { lx: number; lz: number; ry: number; kind: Chest['kind']; sealed: boolean };
  bossRoom?: boolean;
  /** Optional dedicated boss for mid-dungeon boss wings (used in Castle Kuro's multi-boss wings). */
  bossKind?: EnemyKind;
  eliteKind?: EnemyKind;
}

export interface SecretChestSpec {
  lx: number; lz: number; ry: number; tier: number;
}

export interface PropAction {
  kind: 'carpet' | 'arch' | 'brazier' | 'banner' | 'column' | 'sarcophagus' | 'rack' | 'web' | 'crystal' | 'pool' | 'chasm' | 'ritualRing';
  x: number; y?: number; z: number;
  w?: number; d?: number; h?: number; r?: number; ry?: number;
  alongZ?: boolean; obsidian?: boolean; violet?: boolean; cyan?: boolean; scale?: number; withLight?: boolean;
}

export interface DungeonArchetype {
  id: 'fortaleza' | 'catacumbas' | 'cavernas' | 'castilloKuro';
  name: string;
  gridRooms: GridRoom[];
  roomSpecs: DungeonRoomSpec[];
  secretChests: SecretChestSpec[];
  props: PropAction[];
  stairGzStart: number;
  bossCenterGz: number;
  victoryPortalGz: number;
  bossGx: number;
}

export interface BossPreset {
  kind: EnemyKind;
  escort: EnemyKind[];
  portalColors: [number, number, number];
  colorHex: string;
  lightColor: number;
}

/** World coordinates of the interactive Keep Doors on Castle Kuro's south facade. */
export function kuroKeepDoorPos() {
  const pl = place('castillo');
  return { x: pl.x, z: pl.z + 12.2, returnX: pl.x, returnZ: pl.z + 16.5 };
}

export const KURO_CASTLE_BOSS: BossPreset = {
  kind: 'kuro',
  escort: ['escudero', 'duelista', 'espectro', 'tambor'],
  portalColors: [0x4a0810, 0xe82838, 0xffd27a],
  colorHex: '#ff525e',
  lightColor: 0xff3c38
};

export const KURO_CASTLE_ARCHETYPE: DungeonArchetype = {
  id: 'castilloKuro',
  name: 'Interior del Castillo Kuro',
  stairGzStart: -51,
  bossCenterGz: -59,
  victoryPortalGz: -62.4,
  bossGx: 0,
  gridRooms: [
    // Entrance Hall
    { gx0: -2, gx1: 2, gz0: -2, gz1: 2, theme: 'castle', name: 'Atrio del Portón Carmesí' },
    { gx0: -1, gx1: 1, gz0: -5, gz1: -3, theme: 'castle', name: 'Corredor de las Lanzas' },
    { gx0: -5, gx1: 5, gz0: -12, gz1: -6, theme: 'castle', name: 'Salón de los Estandartes Carmesí' },

    // West Wing: Ala de la Sangre -> Boss #1 (Maestro Kurama)
    { gx0: -10, gx1: -6, gz0: -10, gz1: -9, theme: 'castle', name: 'Galería del Oeste' },
    { gx0: -16, gx1: -11, gz0: -14, gz1: -7, theme: 'castle', name: 'Cuartel de la Guardia' },
    { gx0: -14, gx1: -13, gz0: -20, gz1: -15, theme: 'castle', name: 'Pasaje de los Pergaminos' },
    { gx0: -17, gx1: -10, gz0: -27, gz1: -21, theme: 'castle', name: 'Biblioteca Maldita' },
    { gx0: -20, gx1: -18, gz0: -25, gz1: -24, theme: 'castle', name: 'Cámara Secreta del Sello' },
    { gx0: -14, gx1: -13, gz0: -32, gz1: -28, theme: 'bridge', name: 'Puente de los Susurros' },
    { gx0: -18, gx1: -9, gz0: -41, gz1: -33, theme: 'castle', name: 'Santuario de Sangre' },
    { gx0: -8, gx1: -6, gz0: -38, gz1: -37, theme: 'castle', name: 'Pasadizo del Santuario' },

    // East Wing: Mazmorras y Forja -> Boss #2 (Tetsujin)
    { gx0: 6, gx1: 10, gz0: -10, gz1: -9, theme: 'castle', name: 'Galería del Este' },
    { gx0: 11, gx1: 16, gz0: -15, gz1: -7, theme: 'cave', name: 'Calabozos de Kuro' },
    { gx0: 13, gx1: 14, gz0: -21, gz1: -16, theme: 'cave', name: 'Túnel de las Cadenas' },
    { gx0: 10, gx1: 17, gz0: -28, gz1: -22, theme: 'castle', name: 'Armería Carmesí' },
    { gx0: 18, gx1: 20, gz0: -26, gz1: -25, theme: 'castle', name: 'Bóveda del Tesoro Este' },
    { gx0: 13, gx1: 14, gz0: -32, gz1: -29, theme: 'bridge', name: 'Puente de las Brasas' },
    { gx0: 9, gx1: 18, gz0: -41, gz1: -33, theme: 'castle', name: 'Forja de las Cadenas' },
    { gx0: 6, gx1: 8, gz0: -38, gz1: -37, theme: 'castle', name: 'Pasadizo de la Forja' },

    // Central Keep -> Boss #3 (Kage-Hime) -> Final Boss #4 (Señor Kuro)
    { gx0: -1, gx1: 1, gz0: -16, gz1: -13, theme: 'castle', name: 'Pasaje del Foso' },
    { gx0: -2, gx1: 2, gz0: -23, gz1: -17, theme: 'bridge', name: 'Puente del Foso Interior' },
    { gx0: -5, gx1: 5, gz0: -32, gz1: -24, theme: 'castle', name: 'Patio de los Duelos' },
    { gx0: -1, gx1: 1, gz0: -35, gz1: -33, theme: 'castle', name: 'Escalera del Consejo' },
    { gx0: -5, gx1: 5, gz0: -43, gz1: -36, theme: 'castle', name: 'Salón del Consejo Oscuro' },
    { gx0: -8, gx1: -6, gz0: -43, gz1: -42, theme: 'castle', name: 'Cámara de las Reliquias' },
    { gx0: -1, gx1: 1, gz0: -50, gz1: -44, theme: 'bridge', name: 'Puente del Shōgun' },
    { gx0: -1, gx1: 1, gz0: -53, gz1: -51, theme: 'boss', name: 'Escalinata del Trono' },
    { gx0: -7, gx1: 7, gz0: -64, gz1: -54, theme: 'boss', name: 'Trono del Torreón Carmesí' }
  ],
  roomSpecs: [
    // Central entry hall
    {
      id: 'estandartes',
      name: 'Salón de los Estandartes Carmesí',
      lx: 0, lz: -36, r: 14,
      kinds: ['escudero', 'ashigaru', 'ashigaru', 'arquero', 'duelista', 'tambor'],
      chest: { lx: 0, lz: -36, ry: 0, kind: 'guarida', sealed: true }
    },
    // West Wing
    {
      id: 'cuartel',
      name: 'Cuartel de la Guardia',
      lx: -54, lz: -42, r: 11,
      kinds: ['kensei', 'escudero', 'duelista', 'ashigaru', 'arquero', 'oni'],
      chest: { lx: -54, lz: -42, ry: Math.PI / 2, kind: 'guardian', sealed: true },
      eliteKind: 'kensei'
    },
    {
      id: 'biblioteca',
      name: 'Biblioteca Maldita',
      lx: -54, lz: -96, r: 12,
      kinds: ['hechicero', 'hechicero', 'piromante', 'espectro', 'sombra', 'escudero'],
      chest: { lx: -54, lz: -96, ry: Math.PI / 2, kind: 'guarida', sealed: true }
    },
    {
      id: 'santuario',
      name: 'Santuario de Sangre',
      lx: -54, lz: -148, r: 15,
      kinds: ['kuroOnmyoji', 'piromante', 'hechicero', 'espectro', 'escudero'],
      chest: { lx: -54, lz: -158, ry: 0, kind: 'jefe', sealed: true },
      bossKind: 'kuroOnmyoji'
    },
    // East Wing
    {
      id: 'calabozos',
      name: 'Calabozos de Kuro',
      lx: 54, lz: -44, r: 11,
      kinds: ['arana', 'arana', 'escorpion', 'guadanero', 'acechador', 'sombra', 'oni'],
      chest: { lx: 54, lz: -44, ry: -Math.PI / 2, kind: 'guarida', sealed: true }
    },
    {
      id: 'armeria',
      name: 'Armería Carmesí',
      lx: 54, lz: -100, r: 12,
      kinds: ['tengu', 'bruto', 'escudero', 'arquero', 'duelista', 'tambor'],
      chest: { lx: 54, lz: -100, ry: -Math.PI / 2, kind: 'guardian', sealed: true },
      eliteKind: 'tengu'
    },
    {
      id: 'forja',
      name: 'Forja de las Cadenas',
      lx: 54, lz: -148, r: 15,
      kinds: ['kuroJuggernaut', 'coloso', 'bruto', 'piromante', 'tambor'],
      chest: { lx: 54, lz: -158, ry: 0, kind: 'jefe', sealed: true },
      bossKind: 'kuroJuggernaut'
    },
    // Central Keep
    {
      id: 'puenteFoso',
      name: 'Puente del Foso Interior',
      lx: 0, lz: -80, r: 9,
      kinds: ['escudero', 'escudero', 'arquero', 'arquero', 'duelista']
    },
    {
      id: 'patioDuelos',
      name: 'Patio de los Duelos',
      lx: 0, lz: -112, r: 15,
      kinds: ['raijin', 'duelista', 'duelista', 'guadanero', 'hechicero', 'tambor'],
      chest: { lx: 0, lz: -112, ry: 0, kind: 'guardian', sealed: true },
      eliteKind: 'raijin'
    },
    {
      id: 'consejo',
      name: 'Salón del Consejo Oscuro',
      lx: 0, lz: -158, r: 15,
      kinds: ['kuroSombra', 'sombra', 'sombra', 'duelista', 'acechador'],
      chest: { lx: 0, lz: -166, ry: 0, kind: 'jefe', sealed: true },
      bossKind: 'kuroSombra'
    },
    // Grand Finale
    {
      id: 'trono',
      name: 'Trono del Torreón Carmesí',
      lx: 0, lz: -236, r: 22,
      kinds: ['kuro'],
      chest: { lx: 0, lz: -244, ry: 0, kind: 'jefe', sealed: true },
      bossRoom: true
    }
  ],
  secretChests: [
    { lx: -76, lz: -98, ry: Math.PI / 2, tier: 0.72 },
    { lx: 76, lz: -102, ry: -Math.PI / 2, tier: 0.72 },
    { lx: -28, lz: -170, ry: Math.PI / 2, tier: 0.84 }
  ],
  props: [
    // Imperial crimson carpets along main axis and wings
    { kind: 'carpet', x: 0, z: -6, w: 4.2, d: 24 },
    { kind: 'carpet', x: 0, z: -36, w: 4.8, d: 26 },
    { kind: 'carpet', x: 0, z: -80, w: 4.4, d: 34 },
    { kind: 'carpet', x: 0, z: -112, w: 4.8, d: 32 },
    { kind: 'carpet', x: 0, z: -158, w: 4.8, d: 32 },
    { kind: 'carpet', x: 0, z: -188, w: 4.2, d: 28 },
    { kind: 'carpet', x: -54, z: -148, w: 4.4, d: 30 },
    { kind: 'carpet', x: 54, z: -148, w: 4.4, d: 30 },

    // Grand stone & obsidian archways
    { kind: 'arch', x: 0, z: -14, w: 9.6, obsidian: true },
    { kind: 'arch', x: -22, z: -38, w: 7.6, alongZ: true },
    { kind: 'arch', x: 22, z: -38, w: 7.6, alongZ: true },
    { kind: 'arch', x: 0, z: -56, w: 9.6, obsidian: true },
    { kind: 'arch', x: 0, z: -96, w: 10.0, obsidian: true },
    { kind: 'arch', x: 0, z: -138, w: 10.0, obsidian: true },
    { kind: 'arch', x: -22, z: -150, w: 7.6, alongZ: true, obsidian: true },
    { kind: 'arch', x: 22, z: -150, w: 7.6, alongZ: true, obsidian: true },
    { kind: 'arch', x: 0, z: -176, w: 10.4, obsidian: true },

    // Columns in grand halls
    { kind: 'column', x: -13, z: -28, h: 5.0, r: 0.9, obsidian: true },
    { kind: 'column', x: 13, z: -28, h: 5.0, r: 0.9, obsidian: true },
    { kind: 'column', x: -13, z: -44, h: 5.0, r: 0.9, obsidian: true },
    { kind: 'column', x: 13, z: -44, h: 5.0, r: 0.9, obsidian: true },
    { kind: 'column', x: -13, z: -102, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'column', x: 13, z: -102, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'column', x: -13, z: -122, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'column', x: 13, z: -122, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'column', x: -13, z: -150, h: 5.4, r: 0.95, obsidian: true },
    { kind: 'column', x: 13, z: -150, h: 5.4, r: 0.95, obsidian: true },
    { kind: 'column', x: -13, z: -166, h: 5.4, r: 0.95, obsidian: true },
    { kind: 'column', x: 13, z: -166, h: 5.4, r: 0.95, obsidian: true },
    { kind: 'column', x: -66, z: -138, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'column', x: -42, z: -138, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'column', x: 42, z: -138, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'column', x: 66, z: -138, h: 5.2, r: 0.9, obsidian: true },

    // Warm roaring fortress braziers
    { kind: 'brazier', x: -17, z: -36 }, { kind: 'brazier', x: 17, z: -36 },
    { kind: 'brazier', x: -46, z: -42 }, { kind: 'brazier', x: -62, z: -42 },
    { kind: 'brazier', x: -44, z: -96 }, { kind: 'brazier', x: -64, z: -96 },
    { kind: 'brazier', x: -42, z: -148 }, { kind: 'brazier', x: -66, z: -148 },
    { kind: 'brazier', x: 46, z: -44 }, { kind: 'brazier', x: 62, z: -44 },
    { kind: 'brazier', x: 44, z: -100 }, { kind: 'brazier', x: 64, z: -100 },
    { kind: 'brazier', x: 42, z: -148 }, { kind: 'brazier', x: 66, z: -148 },
    { kind: 'brazier', x: -8.5, z: -80, y: 0.4 }, { kind: 'brazier', x: 8.5, z: -80, y: 0.4 },
    { kind: 'brazier', x: -17, z: -112 }, { kind: 'brazier', x: 17, z: -112 },
    { kind: 'brazier', x: -17, z: -158 }, { kind: 'brazier', x: 17, z: -158 },
    { kind: 'brazier', x: -5.2, z: -188, y: 0.5 }, { kind: 'brazier', x: 5.2, z: -188, y: 0.5 },

    // War banners & weapon racks
    { kind: 'banner', x: -9, z: -36, ry: Math.PI / 2 }, { kind: 'banner', x: 9, z: -36, ry: -Math.PI / 2 },
    { kind: 'banner', x: -9, z: -112, ry: Math.PI / 2 }, { kind: 'banner', x: 9, z: -112, ry: -Math.PI / 2 },
    { kind: 'banner', x: -9, z: -158, ry: Math.PI / 2 }, { kind: 'banner', x: 9, z: -158, ry: -Math.PI / 2 },
    { kind: 'rack', x: -63, z: -36, ry: Math.PI / 2 }, { kind: 'rack', x: -63, z: -48, ry: Math.PI / 2 },
    { kind: 'rack', x: 65, z: -94, ry: -Math.PI / 2 }, { kind: 'rack', x: 65, z: -106, ry: -Math.PI / 2 },
    { kind: 'rack', x: 42, z: -156, ry: Math.PI / 2 }, { kind: 'rack', x: 66, z: -156, ry: -Math.PI / 2 },

    // Dungeon cells & cursed library flavor
    { kind: 'sarcophagus', x: -65, z: -90, ry: Math.PI / 2 }, { kind: 'sarcophagus', x: -65, z: -102, ry: Math.PI / 2 },
    { kind: 'web', x: 46, z: -34, ry: 0.5, scale: 2.3 }, { kind: 'web', x: 62, z: -54, ry: -2.0, scale: 2.4 },
    { kind: 'ritualRing', x: -54, z: -148 },
    { kind: 'ritualRing', x: 54, z: -148 },
    { kind: 'ritualRing', x: 0, z: -158 },

    // Subterranean castle moats & chasms beneath the bridges
    { kind: 'chasm', x: 0, z: -80, w: 48, d: 30 },
    { kind: 'chasm', x: -54, z: -120, w: 36, d: 24 },
    { kind: 'chasm', x: 54, z: -122, w: 36, d: 22 },
    { kind: 'chasm', x: 0, z: -188, w: 86, d: 30 }
  ]
};
