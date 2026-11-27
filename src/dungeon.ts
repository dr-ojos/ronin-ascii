// Dynamic Portal Dungeon System (Minecraft Dungeons-style castle & caverns).
// - Portals open in the overworld, close upon completing the dungeon, and respawn randomly
//   across the map after a cooldown with a new layout archetype (optionally mirrored) and final boss.
// - 3 distinct structural archetypes x 2 mirror orientations (6 shapes) + 6 rotating final bosses.
import * as THREE from 'three';
import { scene } from './renderer';
import { M, CLS, tagMat, shadowTree } from './materials';
import { addCollider, removeColliders, collide } from './physics';
import { addLight, removeLights } from './lights';
import { groundY } from './terrain';
import { sam } from './avatar';
import { snapCamera } from './camera';
import { enemies, spawnEnemy, despawn, KINDS } from './enemies';
import { clearEnemyHazards } from './enemy-ai';
import { makeChest, removeChest, unseal } from './loot';
import { burst, impactRing } from './fx';
import { sfx } from './sfx';
import { showMsg } from './hud';
import { addPoints } from './score';
import { skyFlash } from './special';
import { saveVault } from './vault';
import { equipmentThreat } from './equipment-threat';
import { DUNGEON_ORIGIN, dungeonElev, dungeonFloorY, player, state } from './state';
import { rnd } from './utils';
import {
  DM, addPropBox, buildBannerStand, buildBrazier, buildCastleWallSeg, buildCaveWallSeg,
  buildCobweb, buildColumn, buildCrystalSpire, buildGlowingPool, buildSarcophagus,
  buildStoneArchway, buildWeaponRack, type ColliderSpec, type LightSpec
} from './dungeon-art';
import {
  KURO_CASTLE_ARCHETYPE, KURO_CASTLE_BOSS, kuroKeepDoorPos,
  type BossPreset, type DungeonArchetype, type GridRoom
} from './kuro-castle';
import type { Camp, Chest, EnemyKind } from './types';

export { DUNGEON_ORIGIN, dungeonFloorY };
const OX = DUNGEON_ORIGIN.x;
const OZ = DUNGEON_ORIGIN.z;
const CELL = 4; // 4m x 4m modular dungeon grid

const DUNGEON_OWNER = Symbol('dungeon');
const OVERWORLD_PORTAL_OWNER = Symbol('overworld-portal');

export interface DungeonRect {
  x0: number; x1: number; z0: number; z1: number;
  theme: 'castle' | 'cave' | 'bridge' | 'boss';
  name: string;
}

const DUNGEON_BOSSES: BossPreset[] = [
  { kind: 'senorCripta', escort: ['espectro', 'duelista'], portalColors: [0x3b1278, 0x9b4dff, 0x8af6ff], colorHex: '#c996ff', lightColor: 0xa45eff },
  { kind: 'enma', escort: ['piromante', 'guadanero'], portalColors: [0x5a0d12, 0xff4528, 0xffd27a], colorHex: '#ff7654', lightColor: 0xff5230 },
  { kind: 'yukiOnna', escort: ['espectro', 'sombra'], portalColors: [0x0d365c, 0x4ae0ff, 0xe8ffff], colorHex: '#7aeaff', lightColor: 0x52e0ff },
  { kind: 'kagutsuchi', escort: ['piromante', 'bruto'], portalColors: [0x521d08, 0xff7b24, 0xfff099], colorHex: '#ff9e4a', lightColor: 0xff8428 },
  { kind: 'shuten', escort: ['coloso', 'tambor'], portalColors: [0x4e0810, 0xe8283c, 0xffc864], colorHex: '#ff5864', lightColor: 0xf03044 },
  { kind: 'daimyoHueso', escort: ['espectro', 'escudero', 'arquero'], portalColors: [0x0e4432, 0x4ef5a8, 0xe6ffe8], colorHex: '#74ffc2', lightColor: 0x52ffb4 }
];

interface PortalSpot {
  x: number; z: number; ry: number; label: string;
}

/** Curated scenic overworld spots where random dungeon portals can open (never fixed to one spot). */
const PORTAL_SPOTS: PortalSpot[] = [
  { x: 135, z: 225, ry: 0.4, label: 'Valle de los Cerezos' },
  { x: 355, z: 95, ry: -0.9, label: 'Bosque de Bambú' },
  { x: -235, z: 130, ry: 0.8, label: 'Orilla del Lago Espejo' },
  { x: -215, z: -240, ry: 0.5, label: 'Pagoda de los Cinco Vientos' },
  { x: 85, z: -455, ry: -0.3, label: 'Cercanías del Castillo Kuro' },
  { x: -465, z: 55, ry: 1.1, label: 'Campamento Ronin' },
  { x: 95, z: 445, ry: -0.6, label: 'Cementerio de las Linternas' },
  { x: 560, z: 620, ry: -0.8, label: 'Llanura de los Susurros' },
  { x: -490, z: -760, ry: 0.6, label: 'Ruinas de Takamori' },
  { x: 205, z: -165, ry: -0.5, label: 'Afueras de Aldea de Kiri' },
  { x: -340, z: -310, ry: 0.9, label: 'Altos de los Pinos' },
  { x: 740, z: -220, ry: -1.1, label: 'Afueras de Pueblo de Asagiri' },
  { x: -760, z: -410, ry: 0.3, label: 'Lindes del Bosque Negro' },
  { x: 340, z: 890, ry: -0.7, label: 'Pedregal de los Cuervos' },
  { x: -820, z: 150, ry: 1.2, label: 'Riscos del Viento' },
  { x: 280, z: -860, ry: -0.4, label: 'Canchal del Norte' }
];

// ------------------------------------------------------------ 3 Distinct Dungeon Layout Archetypes

const ARCHETYPE_FORTALEZA: DungeonArchetype = {
  id: 'fortaleza',
  name: 'Fortaleza Abismal',
  stairGzStart: -82,
  bossCenterGz: -89.5,
  victoryPortalGz: -92.4,
  bossGx: 0,
  gridRooms: [
    { gx0: -2, gx1: 2, gz0: -2, gz1: 2, theme: 'castle', name: 'Atrio del Portal' },
    { gx0: -1, gx1: 1, gz0: -4, gz1: -3, theme: 'castle', name: 'Pasillo de Entrada' },
    { gx0: -4, gx1: 4, gz0: -10, gz1: -5, theme: 'castle', name: 'Vestíbulo de las Antorchas' },
    { gx0: -1, gx1: 1, gz0: -13, gz1: -11, theme: 'castle', name: 'Pasaje Real' },
    { gx0: -4, gx1: 4, gz0: -20, gz1: -14, theme: 'castle', name: 'Salón de los Estandartes' },
    { gx0: -1, gx1: 1, gz0: -24, gz1: -21, theme: 'cave', name: 'Grieta Central' },
    { gx0: -10, gx1: -5, gz0: -8, gz1: -7, theme: 'castle', name: 'Corredor Oeste' },
    { gx0: -14, gx1: -9, gz0: -16, gz1: -9, theme: 'castle', name: 'Celdas de los Condenados' },
    { gx0: -13, gx1: -12, gz0: -23, gz1: -17, theme: 'castle', name: 'Galería de Hierro' },
    { gx0: -15, gx1: -9, gz0: -29, gz1: -24, theme: 'castle', name: 'Armería Abandonada' },
    { gx0: -17, gx1: -16, gz0: -27, gz1: -26, theme: 'castle', name: 'Cámara Secreta Oeste' },
    { gx0: -8, gx1: -6, gz0: -28, gz1: -27, theme: 'cave', name: 'Pasaje de la Armería' },
    { gx0: 5, gx1: 10, gz0: -8, gz1: -7, theme: 'cave', name: 'Túnel de Seda' },
    { gx0: 9, gx1: 14, gz0: -17, gz1: -9, theme: 'cave', name: 'Nido de las Arañas' },
    { gx0: 12, gx1: 13, gz0: -24, gz1: -18, theme: 'cave', name: 'Pasadizo de Estalactitas' },
    { gx0: 9, gx1: 15, gz0: -30, gz1: -25, theme: 'cave', name: 'Estanque Luminoso' },
    { gx0: 16, gx1: 17, gz0: -28, gz1: -27, theme: 'cave', name: 'Gruta Secreta Este' },
    { gx0: 6, gx1: 8, gz0: -29, gz1: -28, theme: 'cave', name: 'Brecha de Cristales' },
    { gx0: -5, gx1: 5, gz0: -36, gz1: -25, theme: 'cave', name: 'Gran Caverna de Cristal' },
    { gx0: -1, gx1: 1, gz0: -43, gz1: -37, theme: 'bridge', name: 'Puente del Abismo' },
    { gx0: -5, gx1: -2, gz0: -37, gz1: -37, theme: 'bridge', name: 'Pasarela del Abismo' },
    { gx0: -7, gx1: -6, gz0: -42, gz1: -37, theme: 'bridge', name: 'Pasarela del Abismo' },
    { gx0: -9, gx1: -6, gz0: -44, gz1: -43, theme: 'cave', name: 'Islote del Abismo' },
    { gx0: -5, gx1: 5, gz0: -50, gz1: -44, theme: 'castle', name: 'Cripta de los Caídos' },
    { gx0: -1, gx1: 1, gz0: -54, gz1: -51, theme: 'castle', name: 'Pasillo de las Sombras' },
    { gx0: -4, gx1: 4, gz0: -60, gz1: -55, theme: 'castle', name: 'Encrucijada de Obsidiana' },
    { gx0: -10, gx1: -5, gz0: -58, gz1: -57, theme: 'cave', name: 'Túnel Abisal Oeste' },
    { gx0: -15, gx1: -10, gz0: -68, gz1: -59, theme: 'cave', name: 'Fosa de Cristales' },
    { gx0: -17, gx1: -16, gz0: -65, gz1: -64, theme: 'cave', name: 'Bóveda Oculta' },
    { gx0: -9, gx1: -6, gz0: -67, gz1: -66, theme: 'cave', name: 'Paso de la Fosa' },
    { gx0: 5, gx1: 10, gz0: -58, gz1: -57, theme: 'castle', name: 'Galería Fúnebre' },
    { gx0: 10, gx1: 15, gz0: -68, gz1: -59, theme: 'castle', name: 'Catacumbas Reales' },
    { gx0: 6, gx1: 9, gz0: -67, gz1: -66, theme: 'castle', name: 'Paso de las Catacumbas' },
    { gx0: -1, gx1: 1, gz0: -63, gz1: -61, theme: 'castle', name: 'Corredor del Sello' },
    { gx0: -5, gx1: 5, gz0: -74, gz1: -64, theme: 'castle', name: 'Salón de los Rituales' },
    { gx0: -1, gx1: 1, gz0: -81, gz1: -75, theme: 'bridge', name: 'Puente de los Antiguos' },
    { gx0: -1, gx1: 1, gz0: -84, gz1: -82, theme: 'boss', name: 'Escalinata del Trono' },
    { gx0: -6, gx1: 6, gz0: -94, gz1: -85, theme: 'boss', name: 'Trono Abismal' }
  ],
  roomSpecs: [
    { id: 'estandartes', name: 'Salón de los Estandartes', lx: 0, lz: -68, r: 13, kinds: ['escudero', 'ashigaru', 'arquero', 'oni', 'duelista'], chest: { lx: 0, lz: -68, ry: 0, kind: 'guarida', sealed: true } },
    { id: 'celdas', name: 'Celdas de los Condenados', lx: -46, lz: -50, r: 11, kinds: ['espectro', 'guadanero', 'escudero', 'oni', 'arquero'], chest: { lx: -46, lz: -50, ry: Math.PI / 2, kind: 'guarida', sealed: true } },
    { id: 'armeria', name: 'Armería Abandonada', lx: -48, lz: -106, r: 11, kinds: ['kensei', 'duelista', 'escudero', 'ashigaru'], chest: { lx: -48, lz: -106, ry: 0, kind: 'guardian', sealed: true }, eliteKind: 'kensei' },
    { id: 'nido', name: 'Nido de las Arañas', lx: 46, lz: -52, r: 12, kinds: ['arana', 'arana', 'arana', 'acechador', 'sombra'], chest: { lx: 46, lz: -52, ry: -Math.PI / 2, kind: 'guarida', sealed: true } },
    { id: 'estanque', name: 'Estanque Luminoso', lx: 48, lz: -110, r: 12, kinds: ['escorpion', 'escorpion', 'hechicero', 'arana', 'piromante'], chest: { lx: 48, lz: -110, ry: -Math.PI / 2, kind: 'guarida', sealed: true } },
    { id: 'cavernas', name: 'Gran Caverna de Cristal', lx: 0, lz: -124, r: 16, kinds: ['bruto', 'arana', 'escorpion', 'hechicero', 'acechador', 'duelista'], chest: { lx: 0, lz: -124, ry: 0, kind: 'guarida', sealed: true } },
    { id: 'cripta', name: 'Cripta de los Caídos', lx: 0, lz: -188, r: 15, kinds: ['coloso', 'espectro', 'piromante', 'tambor', 'escudero'], chest: { lx: 0, lz: -188, ry: 0, kind: 'guardian', sealed: true } },
    { id: 'fosa', name: 'Fosa de Cristales', lx: -50, lz: -254, r: 13, kinds: ['escorpion', 'escorpion', 'arana', 'arana', 'hechicero', 'sombra'], chest: { lx: -50, lz: -254, ry: Math.PI / 2, kind: 'guardian', sealed: true } },
    { id: 'catacumbas', name: 'Catacumbas Reales', lx: 50, lz: -254, r: 13, kinds: ['tengu', 'espectro', 'espectro', 'piromante', 'guadanero'], chest: { lx: 50, lz: -254, ry: -Math.PI / 2, kind: 'guardian', sealed: true }, eliteKind: 'tengu' },
    { id: 'rituales', name: 'Salón de los Rituales', lx: 0, lz: -276, r: 16, kinds: ['raijin', 'coloso', 'tambor', 'piromante', 'hechicero', 'duelista'], chest: { lx: 0, lz: -276, ry: 0, kind: 'guardian', sealed: true }, eliteKind: 'raijin' },
    { id: 'trono', name: 'Trono Abismal', lx: 0, lz: -358, r: 20, kinds: ['senorCripta'], chest: { lx: 0, lz: -365, ry: 0, kind: 'jefe', sealed: true }, bossRoom: true }
  ],
  secretChests: [
    { lx: -67, lz: -106, ry: Math.PI / 2, tier: 0.55 },
    { lx: 67, lz: -110, ry: -Math.PI / 2, tier: 0.55 },
    { lx: -32, lz: -174, ry: Math.PI / 2, tier: 0.65 },
    { lx: -67, lz: -258, ry: Math.PI / 2, tier: 0.72 }
  ],
  props: [
    { kind: 'carpet', x: 0, z: -2, w: 3.8, d: 16 },
    { kind: 'carpet', x: 0, z: -30, w: 4.2, d: 24 },
    { kind: 'carpet', x: 0, z: -68, w: 4.2, d: 28 },
    { kind: 'carpet', x: 0, z: -188, w: 4.2, d: 26 },
    { kind: 'carpet', x: 0, z: -230, w: 4.2, d: 24 },
    { kind: 'carpet', x: 0, z: -276, w: 4.4, d: 40 },
    { kind: 'arch', x: 0, z: -14, w: 9.6 }, { kind: 'arch', x: 0, z: -48, w: 9.6 },
    { kind: 'arch', x: -20, z: -30, w: 7.6, alongZ: true }, { kind: 'arch', x: 20, z: -30, w: 7.6, alongZ: true },
    { kind: 'arch', x: -48, z: -90, w: 7.6 }, { kind: 'arch', x: 0, z: -174, w: 10.0 },
    { kind: 'arch', x: 0, z: -210, w: 9.6, obsidian: true }, { kind: 'arch', x: 0, z: -254, w: 10.0, obsidian: true },
    { kind: 'column', x: -10, z: -24, h: 4.6, r: 0.85 }, { kind: 'column', x: 10, z: -24, h: 4.6, r: 0.85 },
    { kind: 'column', x: -10, z: -60, h: 4.8, r: 0.85 }, { kind: 'column', x: 10, z: -60, h: 4.8, r: 0.85 },
    { kind: 'column', x: -12, z: -182, h: 5.0, r: 0.9, obsidian: true }, { kind: 'column', x: 12, z: -182, h: 5.0, r: 0.9, obsidian: true },
    { kind: 'column', x: -13, z: -262, h: 5.4, r: 0.95, obsidian: true }, { kind: 'column', x: 13, z: -262, h: 5.4, r: 0.95, obsidian: true },
    { kind: 'brazier', x: -15, z: -30 }, { kind: 'brazier', x: 15, z: -30 },
    { kind: 'brazier', x: -14, z: -68 }, { kind: 'brazier', x: 14, z: -68 },
    { kind: 'brazier', x: -40, z: -50 }, { kind: 'brazier', x: -56, z: -106, violet: true },
    { kind: 'brazier', x: -5.2, z: -160, y: 0.5 }, { kind: 'brazier', x: 5.2, z: -160, y: 0.5 },
    { kind: 'brazier', x: -15, z: -188, violet: true }, { kind: 'brazier', x: 15, z: -188, violet: true },
    { kind: 'brazier', x: -15, z: -230, violet: true }, { kind: 'brazier', x: 15, z: -230, violet: true },
    { kind: 'brazier', x: -11, z: -276, violet: true }, { kind: 'brazier', x: 11, z: -276, violet: true },
    { kind: 'brazier', x: -5.2, z: -312, y: 0.5, violet: true }, { kind: 'brazier', x: 5.2, z: -312, y: 0.5, violet: true },
    { kind: 'sarcophagus', x: -53, z: -46, ry: Math.PI / 2 }, { kind: 'sarcophagus', x: -53, z: -56, ry: Math.PI / 2 },
    { kind: 'sarcophagus', x: -17, z: -189, ry: Math.PI / 2 }, { kind: 'sarcophagus', x: 17, z: -189, ry: -Math.PI / 2 },
    { kind: 'sarcophagus', x: 57, z: -248, ry: -Math.PI / 2 }, { kind: 'sarcophagus', x: 57, z: -260, ry: -Math.PI / 2 },
    { kind: 'rack', x: -57, z: -100, ry: Math.PI / 2 }, { kind: 'rack', x: -57, z: -112, ry: Math.PI / 2 },
    { kind: 'banner', x: -8, z: -68, ry: Math.PI / 2 }, { kind: 'banner', x: 8, z: -68, ry: -Math.PI / 2 },
    { kind: 'web', x: 38, z: -42, ry: 0.4, scale: 2.2 }, { kind: 'web', x: 54, z: -62, ry: -2.1, scale: 2.3 },
    { kind: 'pool', x: 48, z: -110, w: 5.2, d: 4.2 }, { kind: 'pool', x: -11, z: -124, w: 4.8, d: 3.8 }, { kind: 'pool', x: -50, z: -254, w: 5.4, d: 4.4 },
    { kind: 'crystal', x: 39, z: -48, cyan: false, scale: 1.25 }, { kind: 'crystal', x: 58, z: -116, cyan: true, scale: 1.4 },
    { kind: 'crystal', x: -18, z: -110, cyan: true, scale: 1.45 }, { kind: 'crystal', x: 18, z: -136, cyan: false, scale: 1.5 },
    { kind: 'crystal', x: -58, z: -244, cyan: true, scale: 1.5 }, { kind: 'crystal', x: -42, z: -264, cyan: false, scale: 1.5 },
    { kind: 'ritualRing', x: 0, z: -276 },
    { kind: 'chasm', x: -10, z: -160, w: 110, d: 36 }, { kind: 'chasm', x: 0, z: -312, w: 90, d: 34 }
  ]
};

const ARCHETYPE_CATACUMBAS: DungeonArchetype = {
  id: 'catacumbas',
  name: 'Catacumbas del Serpenteo',
  stairGzStart: -78,
  bossCenterGz: -85.5,
  victoryPortalGz: -88.4,
  bossGx: 0,
  gridRooms: [
    // Entry snakes East first!
    { gx0: -2, gx1: 2, gz0: -2, gz1: 2, theme: 'castle', name: 'Atrio del Portal' },
    { gx0: 3, gx1: 8, gz0: -1, gz1: 0, theme: 'castle', name: 'Pasaje del Este' },
    { gx0: 7, gx1: 13, gz0: -10, gz1: -2, theme: 'castle', name: 'Cripta de los Ecos' },
    { gx0: 14, gx1: 15, gz0: -7, gz1: -6, theme: 'castle', name: 'Osario Secreto' },
    { gx0: 9, gx1: 11, gz0: -16, gz1: -11, theme: 'cave', name: 'Túnel de Telarañas' },
    { gx0: 5, gx1: 13, gz0: -24, gz1: -17, theme: 'cave', name: 'Guarida Arácnida' },
    // Swing all the way West across a sunken chasm bridge!
    { gx0: -5, gx1: 4, gz0: -21, gz1: -20, theme: 'bridge', name: 'Puente de la Serpiente' },
    { gx0: -13, gx1: -6, gz0: -26, gz1: -17, theme: 'cave', name: 'Caverna de los Escorpiones' },
    { gx0: -15, gx1: -14, gz0: -22, gz1: -21, theme: 'cave', name: 'Grieta del Tesoro' },
    { gx0: -11, gx1: -9, gz0: -33, gz1: -27, theme: 'cave', name: 'Desfiladero Subterráneo' },
    { gx0: -14, gx1: -6, gz0: -42, gz1: -34, theme: 'castle', name: 'Armería de los Caídos' },
    // Swing back to Center & East loop!
    { gx0: -5, gx1: 4, gz0: -39, gz1: -38, theme: 'castle', name: 'Galería de los Escudos' },
    { gx0: 5, gx1: 13, gz0: -46, gz1: -36, theme: 'castle', name: 'Salón de los Tambores' },
    { gx0: 8, gx1: 10, gz0: -54, gz1: -47, theme: 'cave', name: 'Gruta de Amatista' },
    { gx0: 4, gx1: 12, gz0: -62, gz1: -55, theme: 'cave', name: 'Lago de Cristales' },
    { gx0: 13, gx1: 14, gz0: -59, gz1: -58, theme: 'cave', name: 'Altar Oculto' },
    // Final swing back to Center for Crypt + Obsidian Bridge + Boss Sanctum
    { gx0: -4, gx1: 3, gz0: -59, gz1: -58, theme: 'castle', name: 'Corredor de Obsidiana' },
    { gx0: -5, gx1: 5, gz0: -70, gz1: -61, theme: 'castle', name: 'Sanctasanctórum de los Huesos' },
    { gx0: -1, gx1: 1, gz0: -77, gz1: -71, theme: 'bridge', name: 'Puente del Juicio' },
    { gx0: -1, gx1: 1, gz0: -80, gz1: -78, theme: 'boss', name: 'Escalinata del Trono' },
    { gx0: -6, gx1: 6, gz0: -90, gz1: -81, theme: 'boss', name: 'Trono de las Catacumbas' }
  ],
  roomSpecs: [
    { id: 'ecos', name: 'Cripta de los Ecos', lx: 40, lz: -24, r: 12, kinds: ['escudero', 'ashigaru', 'oni', 'arquero', 'espectro'], chest: { lx: 40, lz: -24, ry: 0, kind: 'guarida', sealed: true } },
    { id: 'aracnida', name: 'Guarida Arácnida', lx: 36, lz: -82, r: 13, kinds: ['arana', 'arana', 'arana', 'sombra', 'acechador'], chest: { lx: 36, lz: -82, ry: -Math.PI / 2, kind: 'guarida', sealed: true } },
    { id: 'escorpiones', name: 'Caverna de los Escorpiones', lx: -38, lz: -86, r: 13, kinds: ['escorpion', 'escorpion', 'arana', 'hechicero', 'bruto'], chest: { lx: -38, lz: -86, ry: Math.PI / 2, kind: 'guarida', sealed: true } },
    { id: 'armeria_cat', name: 'Armería de los Caídos', lx: -40, lz: -152, r: 13, kinds: ['kensei', 'duelista', 'escudero', 'guadanero'], chest: { lx: -40, lz: -152, ry: 0, kind: 'guardian', sealed: true }, eliteKind: 'kensei' },
    { id: 'tambores', name: 'Salón de los Tambores', lx: 36, lz: -164, r: 14, kinds: ['tambor', 'bruto', 'oni', 'piromante', 'escudero'], chest: { lx: 36, lz: -164, ry: 0, kind: 'guarida', sealed: true } },
    { id: 'lago_cris', name: 'Lago de Cristales', lx: 32, lz: -234, r: 13, kinds: ['escorpion', 'escorpion', 'arana', 'hechicero', 'sombra'], chest: { lx: 32, lz: -234, ry: -Math.PI / 2, kind: 'guardian', sealed: true } },
    { id: 'sanctum', name: 'Sanctasanctórum de los Huesos', lx: 0, lz: -262, r: 15, kinds: ['raijin', 'coloso', 'espectro', 'piromante', 'duelista'], chest: { lx: 0, lz: -262, ry: 0, kind: 'guardian', sealed: true }, eliteKind: 'raijin' },
    { id: 'trono', name: 'Trono de las Catacumbas', lx: 0, lz: -342, r: 20, kinds: ['senorCripta'], chest: { lx: 0, lz: -349, ry: 0, kind: 'jefe', sealed: true }, bossRoom: true }
  ],
  secretChests: [
    { lx: 58, lz: -26, ry: -Math.PI / 2, tier: 0.45 },
    { lx: -58, lz: -86, ry: Math.PI / 2, tier: 0.55 },
    { lx: 54, lz: -234, ry: -Math.PI / 2, tier: 0.68 }
  ],
  props: [
    { kind: 'arch', x: 10, z: -2, w: 7.6, alongZ: true },
    { kind: 'arch', x: 0, z: -242, w: 9.6, obsidian: true },
    { kind: 'sarcophagus', x: 48, z: -18, ry: -Math.PI / 2 }, { kind: 'sarcophagus', x: 48, z: -32, ry: -Math.PI / 2 },
    { kind: 'sarcophagus', x: -16, z: -262, ry: Math.PI / 2 }, { kind: 'sarcophagus', x: 16, z: -262, ry: -Math.PI / 2 },
    { kind: 'brazier', x: 32, z: -24 }, { kind: 'brazier', x: 48, z: -24 },
    { kind: 'brazier', x: -32, z: -152, violet: true }, { kind: 'brazier', x: -48, z: -152, violet: true },
    { kind: 'brazier', x: 26, z: -164 }, { kind: 'brazier', x: 46, z: -164 },
    { kind: 'brazier', x: -12, z: -262, violet: true }, { kind: 'brazier', x: 12, z: -262, violet: true },
    { kind: 'brazier', x: -5.2, z: -296, y: 0.5, violet: true }, { kind: 'brazier', x: 5.2, z: -296, y: 0.5, violet: true },
    { kind: 'rack', x: -50, z: -144, ry: Math.PI / 2 }, { kind: 'rack', x: -50, z: -160, ry: Math.PI / 2 },
    { kind: 'banner', x: 28, z: -154, ry: Math.PI / 2 }, { kind: 'banner', x: 44, z: -174, ry: -Math.PI / 2 },
    { kind: 'web', x: 24, z: -72, ry: 0.5, scale: 2.4 }, { kind: 'web', x: 48, z: -90, ry: -2.0, scale: 2.3 },
    { kind: 'crystal', x: 44, z: -76, cyan: false, scale: 1.3 }, { kind: 'crystal', x: -46, z: -80, cyan: true, scale: 1.4 },
    { kind: 'crystal', x: -30, z: -94, cyan: false, scale: 1.35 }, { kind: 'crystal', x: 42, z: -226, cyan: true, scale: 1.5 },
    { kind: 'pool', x: 32, z: -234, w: 5.5, d: 4.5 }, { kind: 'pool', x: -38, z: -86, w: 4.6, d: 3.6 },
    { kind: 'column', x: -10, z: -254, h: 5.2, r: 0.9, obsidian: true }, { kind: 'column', x: 10, z: -254, h: 5.2, r: 0.9, obsidian: true },
    { kind: 'ritualRing', x: 0, z: -262 },
    { kind: 'chasm', x: 0, z: -82, w: 44, d: 30 }, { kind: 'chasm', x: 0, z: -296, w: 84, d: 34 }
  ]
};

const ARCHETYPE_CAVERNAS: DungeonArchetype = {
  id: 'cavernas',
  name: 'Cavernas de la Grieta Profunda',
  stairGzStart: -76,
  bossCenterGz: -83.5,
  victoryPortalGz: -86.4,
  bossGx: 0,
  gridRooms: [
    // Opens straight into glowing crystal caves!
    { gx0: -2, gx1: 2, gz0: -2, gz1: 2, theme: 'cave', name: 'Boca de la Grieta' },
    { gx0: -1, gx1: 1, gz0: -5, gz1: -3, theme: 'cave', name: 'Túnel de Cuarzo' },
    { gx0: -5, gx1: 5, gz0: -14, gz1: -6, theme: 'cave', name: 'Gruta Luminosa' },
    // Central Chasm Hub with 4 radiating bridges!
    { gx0: -1, gx1: 1, gz0: -21, gz1: -15, theme: 'bridge', name: 'Puente Sur de la Grieta' },
    { gx0: -4, gx1: 4, gz0: -30, gz1: -22, theme: 'cave', name: 'Isla del Abismo Central' },
    // West Island Bridge -> Spider Abyss
    { gx0: -10, gx1: -5, gz0: -27, gz1: -26, theme: 'bridge', name: 'Puente Oeste de la Grieta' },
    { gx0: -17, gx1: -11, gz0: -32, gz1: -22, theme: 'cave', name: 'Abismo de Seda' },
    { gx0: -15, gx1: -13, gz0: -34, gz1: -33, theme: 'cave', name: 'Nicho de Seda' },
    // East Island Bridge -> Crystal Scorpion Hive
    { gx0: 5, gx1: 10, gz0: -27, gz1: -26, theme: 'bridge', name: 'Puente Este de la Grieta' },
    { gx0: 11, gx1: 17, gz0: -32, gz1: -22, theme: 'cave', name: 'Colmena de Escorpiones' },
    { gx0: 13, gx1: 15, gz0: -34, gz1: -33, theme: 'cave', name: 'Nicho de Cristal' },
    // North Bridge from Hub -> Sunken Obsidian Citadel
    { gx0: -1, gx1: 1, gz0: -37, gz1: -31, theme: 'bridge', name: 'Puente Norte de la Grieta' },
    { gx0: -5, gx1: 5, gz0: -46, gz1: -38, theme: 'castle', name: 'Ciudadela Hundida' },
    // Twin Citadel Wings looping into the Inner Sanctum
    { gx0: -12, gx1: -6, gz0: -44, gz1: -43, theme: 'castle', name: 'Alas de Piedra Oeste' },
    { gx0: -14, gx1: -9, gz0: -56, gz1: -45, theme: 'castle', name: 'Cuartel Subterráneo' },
    { gx0: -8, gx1: -5, gz0: -55, gz1: -54, theme: 'castle', name: 'Galería Oeste' },
    { gx0: 6, gx1: 12, gz0: -44, gz1: -43, theme: 'castle', name: 'Alas de Piedra Este' },
    { gx0: 9, gx1: 14, gz0: -56, gz1: -45, theme: 'castle', name: 'Templo Sumergido' },
    { gx0: 5, gx1: 8, gz0: -55, gz1: -54, theme: 'castle', name: 'Galería Este' },
    // Inner Citadel & Boss Approach
    { gx0: -5, gx1: 5, gz0: -64, gz1: -53, theme: 'castle', name: 'Salón de la Obsidiana' },
    { gx0: -1, gx1: 1, gz0: -75, gz1: -65, theme: 'bridge', name: 'Calzada del Soberano' },
    { gx0: -1, gx1: 1, gz0: -78, gz1: -76, theme: 'boss', name: 'Escalinata del Trono' },
    { gx0: -6, gx1: 6, gz0: -88, gz1: -79, theme: 'boss', name: 'Santuario de la Grieta' }
  ],
  roomSpecs: [
    { id: 'gruta_lum', name: 'Gruta Luminosa', lx: 0, lz: -40, r: 15, kinds: ['arana', 'arana', 'escorpion', 'acechador', 'hechicero'], chest: { lx: 0, lz: -40, ry: 0, kind: 'guarida', sealed: true } },
    { id: 'isla_hub', name: 'Isla del Abismo Central', lx: 0, lz: -104, r: 13, kinds: ['bruto', 'escorpion', 'arana', 'sombra', 'duelista'], chest: { lx: 0, lz: -104, ry: 0, kind: 'guarida', sealed: true } },
    { id: 'abismo_seda', name: 'Abismo de Seda', lx: -56, lz: -108, r: 13, kinds: ['arana', 'arana', 'arana', 'arana', 'sombra'], chest: { lx: -56, lz: -108, ry: Math.PI / 2, kind: 'guardian', sealed: true } },
    { id: 'colmena', name: 'Colmena de Escorpiones', lx: 56, lz: -108, r: 13, kinds: ['escorpion', 'escorpion', 'escorpion', 'hechicero', 'piromante'], chest: { lx: 56, lz: -108, ry: -Math.PI / 2, kind: 'guardian', sealed: true } },
    { id: 'ciudadela', name: 'Ciudadela Hundida', lx: 0, lz: -168, r: 15, kinds: ['escudero', 'ashigaru', 'guadanero', 'duelista', 'arquero'], chest: { lx: 0, lz: -168, ry: 0, kind: 'guarida', sealed: true } },
    { id: 'cuartel', name: 'Cuartel Subterráneo', lx: -46, lz: -202, r: 12, kinds: ['kensei', 'escudero', 'oni', 'tambor'], chest: { lx: -46, lz: -202, ry: Math.PI / 2, kind: 'guardian', sealed: true }, eliteKind: 'kensei' },
    { id: 'templo_sum', name: 'Templo Sumergido', lx: 46, lz: -202, r: 12, kinds: ['tengu', 'espectro', 'hechicero', 'piromante'], chest: { lx: 46, lz: -202, ry: -Math.PI / 2, kind: 'guardian', sealed: true }, eliteKind: 'tengu' },
    { id: 'salon_obs', name: 'Salón de la Obsidiana', lx: 0, lz: -234, r: 16, kinds: ['coloso', 'espectro', 'tambor', 'piromante', 'duelista'], chest: { lx: 0, lz: -234, ry: 0, kind: 'guardian', sealed: true } },
    { id: 'trono', name: 'Santuario de la Grieta', lx: 0, lz: -334, r: 20, kinds: ['senorCripta'], chest: { lx: 0, lz: -341, ry: 0, kind: 'jefe', sealed: true }, bossRoom: true }
  ],
  secretChests: [
    { lx: -56, lz: -134, ry: 0, tier: 0.60 },
    { lx: 56, lz: -134, ry: 0, tier: 0.60 }
  ],
  props: [
    { kind: 'pool', x: -10, z: -40, w: 5.0, d: 4.0 }, { kind: 'pool', x: 10, z: -40, w: 5.0, d: 4.0 },
    { kind: 'pool', x: 56, z: -108, w: 5.4, d: 4.4 }, { kind: 'web', x: -64, z: -100, ry: 0.7, scale: 2.5 },
    { kind: 'web', x: -48, z: -116, ry: -1.8, scale: 2.4 },
    { kind: 'crystal', x: -16, z: -32, cyan: true, scale: 1.5 }, { kind: 'crystal', x: 16, z: -48, cyan: false, scale: 1.5 },
    { kind: 'crystal', x: -12, z: -98, cyan: false, scale: 1.4 }, { kind: 'crystal', x: 12, z: -110, cyan: true, scale: 1.4 },
    { kind: 'crystal', x: 64, z: -98, cyan: true, scale: 1.5 }, { kind: 'crystal', x: -64, z: -118, cyan: false, scale: 1.4 },
    { kind: 'arch', x: 0, z: -152, w: 10.0, obsidian: true }, { kind: 'arch', x: 0, z: -214, w: 10.0, obsidian: true },
    { kind: 'column', x: -12, z: -168, h: 5.0, r: 0.9, obsidian: true }, { kind: 'column', x: 12, z: -168, h: 5.0, r: 0.9, obsidian: true },
    { kind: 'column', x: -12, z: -234, h: 5.4, r: 0.95, obsidian: true }, { kind: 'column', x: 12, z: -234, h: 5.4, r: 0.95, obsidian: true },
    { kind: 'brazier', x: -14, z: -168, violet: true }, { kind: 'brazier', x: 14, z: -168, violet: true },
    { kind: 'brazier', x: -46, z: -194 }, { kind: 'brazier', x: 46, z: -194, violet: true },
    { kind: 'brazier', x: -14, z: -234, violet: true }, { kind: 'brazier', x: 14, z: -234, violet: true },
    { kind: 'brazier', x: -5.2, z: -280, y: 0.5, violet: true }, { kind: 'brazier', x: 5.2, z: -280, y: 0.5, violet: true },
    { kind: 'rack', x: -52, z: -202, ry: Math.PI / 2 }, { kind: 'sarcophagus', x: 52, z: -202, ry: -Math.PI / 2 },
    { kind: 'carpet', x: 0, z: -168, w: 4.2, d: 30 }, { kind: 'carpet', x: 0, z: -234, w: 4.4, d: 38 },
    { kind: 'ritualRing', x: 0, z: -234 },
    { kind: 'chasm', x: 0, z: -104, w: 130, d: 84 }, { kind: 'chasm', x: 0, z: -280, w: 90, d: 44 }
  ]
};

const ARCHETYPES: DungeonArchetype[] = [ARCHETYPE_FORTALEZA, ARCHETYPE_CATACUMBAS, ARCHETYPE_CAVERNAS];

// ------------------------------------------------------------ Active Portal & Variant State
interface ActiveVariant {
  archetype: DungeonArchetype;
  boss: BossPreset;
  mirrorX: boolean;
  spot: PortalSpot;
}

let activeVariant: ActiveVariant = {
  archetype: ARCHETYPE_FORTALEZA,
  boss: DUNGEON_BOSSES[0],
  mirrorX: false,
  spot: PORTAL_SPOTS[0]
};
let inKuroCastle = false;
let kuroConquered = false;
let activeRects: DungeonRect[] = [];
let activeBounds = { minX: -70, maxX: 70, minZ: -380, maxZ: 12 };
let overworldPortalOpen = false;
let portalRespawnT = 0;

/** Returns the active interior configuration (either Castle Kuro or the current random portal dungeon). */
function currentInterior(): { archetype: DungeonArchetype; boss: BossPreset; mirrorX: boolean } {
  if (inKuroCastle) {
    return { archetype: KURO_CASTLE_ARCHETYPE, boss: KURO_CASTLE_BOSS, mirrorX: false };
  }
  return activeVariant;
}

export const isKuroCastleInterior = () => state.inDungeon && inKuroCastle;
export const isKuroCastleConquered = () => kuroConquered;

const ENTRANCE_PORTAL_LOCAL = { x: 0, z: 7.4 };
let victoryPortalLocal = { x: 0, z: -369.5 };

export function dungeonZoneName(wx = player.pos.x, wz = player.pos.z): string {
  const lx = wx - OX, lz = wz - OZ;
  for (const r of activeRects) {
    if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) return r.name;
  }
  return currentInterior().archetype.name;
}

/** Current open overworld portal info (or null while closed / waiting to respawn). */
export function activeDungeonPortal() {
  if (!overworldPortalOpen) return null;
  return {
    x: activeVariant.spot.x,
    z: activeVariant.spot.z,
    name: activeVariant.archetype.name,
    colorHex: activeVariant.boss.colorHex,
    bossName: KINDS[activeVariant.boss.kind].name,
    spotLabel: activeVariant.spot.label
  };
}

// ------------------------------------------------------------ animated portal shader & builder
interface PortalVisual {
  group: THREE.Group;
  vortexMat: THREE.ShaderMaterial;
  ring: THREE.Mesh;
  beam?: THREE.Mesh;
  wx: number; wy: number; wz: number;
}

function makePortalVortexMat(c1: number, c2: number, c3: number): THREE.ShaderMaterial {
  return tagMat(new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uC1: { value: new THREE.Color(c1) },
      uC2: { value: new THREE.Color(c2) },
      uC3: { value: new THREE.Color(c3) }
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv * 2.0 - 1.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      varying vec2 vUv;
      uniform float uTime;
      uniform vec3 uC1, uC2, uC3;
      void main() {
        float r = length(vUv);
        if (r > 1.0) discard;
        float a = atan(vUv.y, vUv.x);
        float swirl = sin(a * 5.0 - uTime * 3.4 + r * 9.0) * 0.5 + 0.5;
        float swirl2 = sin(a * 3.0 + uTime * 2.1 - r * 12.0) * 0.5 + 0.5;
        float core = smoothstep(0.65, 0.0, r);
        float edge = smoothstep(1.0, 0.72, r);
        float rim = smoothstep(0.68, 0.92, r) * smoothstep(1.0, 0.9, r);
        vec3 col = mix(uC1, uC2, swirl * 0.65 + swirl2 * 0.35);
        col = mix(col, uC3, core * 0.85 + rim * 0.9);
        float alpha = edge * (0.58 + 0.38 * swirl + 0.35 * core);
        gl_FragColor = vec4(col * (1.2 + core * 0.9), clamp(alpha, 0.0, 0.96));
      }
    `
  }), CLS.fx);
}

function buildPortalGateway(
  parent: THREE.Object3D,
  x: number, y: number, z: number, ry: number,
  colors: [number, number, number],
  withBeam = false
): PortalVisual {
  const g = new THREE.Group();
  g.position.set(x, y, z);
  g.rotation.y = ry;
  parent.add(g);

  const step1 = new THREE.Mesh(new THREE.CylinderGeometry(2.7, 3.05, 0.24, 8), DM.obsidian);
  step1.position.y = 0.12; step1.receiveShadow = true; g.add(step1);
  const step2 = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.35, 0.20, 8), DM.castleTrim);
  step2.position.y = 0.32; step2.receiveShadow = true; g.add(step2);

  for (const sx of [-1.8, 1.8]) {
    addPropBox(g, 0.74, 4.4, 0.74, DM.obsidian, sx, 0.3, 0, true);
    addPropBox(g, 1.0, 0.36, 1.0, DM.castleWall, sx, 4.65, 0, true);
    const rune = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.7, 0.78), tagMat(M(colors[1], { emissive: colors[1], emissiveIntensity: 2.1 }), CLS.light));
    rune.position.set(sx, 2.45, 0); g.add(rune);
  }
  addPropBox(g, 5.3, 0.62, 0.96, DM.obsidian, 0, 4.95, 0, true);
  addPropBox(g, 4.3, 0.34, 0.78, DM.castleWall, 0, 5.55, 0, false);
  const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.35), tagMat(M(colors[2], { emissive: colors[1], emissiveIntensity: 2.7 }), CLS.light));
  gem.position.set(0, 5.32, 0.5); g.add(gem);

  const vortexMat = makePortalVortexMat(colors[0], colors[1], colors[2]);
  const disc = new THREE.Mesh(new THREE.CircleGeometry(1.62, 32), vortexMat);
  disc.position.set(0, 2.45, 0); g.add(disc);

  const ringMat = tagMat(M(colors[2], { emissive: colors[1], emissiveIntensity: 2.2, metalness: 0.55, roughness: 0.22 }), CLS.light);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1.66, 0.06, 8, 32), ringMat);
  ring.position.set(0, 2.45, 0); g.add(ring);

  for (const sx of [-2.65, 2.65]) {
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.20, 0.6, 8), DM.iron);
    bowl.position.set(sx, 0.58, 0.68); g.add(bowl);
    const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.25), tagMat(M(colors[2], { emissive: colors[1], emissiveIntensity: 2.8 }), CLS.light));
    fl.position.set(sx, 1.0, 0.68); fl.scale.set(0.85, 1.4, 0.85); g.add(fl);
  }

  let beam: THREE.Mesh | undefined;
  if (withBeam) {
    const beamMat = tagMat(new THREE.MeshBasicMaterial({
      color: colors[1], transparent: true, opacity: 0.18, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending
    }), CLS.fx);
    beam = new THREE.Mesh(new THREE.CylinderGeometry(0.65, 1.5, 24, 16, 1, true), beamMat);
    beam.position.set(0, 12.2, 0);
    g.add(beam);
  }

  return { group: g, vortexMat, ring, beam, wx: x, wy: y, wz: z };
}

// ------------------------------------------------------------ Overworld Portal Lifecycle (spawn / close / respawn)
let overworldPortal: PortalVisual | null = null;

function destroyOverworldPortal() {
  if (overworldPortal) {
    scene.remove(overworldPortal.group);
    overworldPortal.vortexMat.dispose();
    overworldPortal = null;
  }
  removeColliders(OVERWORLD_PORTAL_OWNER);
  removeLights(OVERWORLD_PORTAL_OWNER);
  overworldPortalOpen = false;
}

function compassDir(dx: number, dz: number): string {
  const deg = (Math.atan2(dx, -dz) * 180 / Math.PI + 360) % 360;
  const dirs = ['Norte', 'Noreste', 'Este', 'Sureste', 'Sur', 'Suroeste', 'Oeste', 'Noroeste'];
  return dirs[Math.round(deg / 45) % 8];
}

let lastArchId: DungeonArchetype['id'] | null = null;
let lastBossKind: EnemyKind | null = null;
let lastSpotLabel: string | null = null;

function pickNextVariant(): ActiveVariant {
  const otherArchs = lastArchId ? ARCHETYPES.filter(a => a.id !== lastArchId) : ARCHETYPES;
  const archetype = otherArchs[Math.floor(Math.random() * otherArchs.length)];
  const otherBosses = lastBossKind ? DUNGEON_BOSSES.filter(b => b.kind !== lastBossKind) : DUNGEON_BOSSES;
  const boss = otherBosses[Math.floor(Math.random() * otherBosses.length)];
  const otherSpots = lastSpotLabel ? PORTAL_SPOTS.filter(s => s.label !== lastSpotLabel) : PORTAL_SPOTS;
  const spot = otherSpots[Math.floor(Math.random() * otherSpots.length)];
  const mirrorX = Math.random() < 0.5;
  lastArchId = archetype.id;
  lastBossKind = boss.kind;
  lastSpotLabel = spot.label;
  return { archetype, boss, mirrorX, spot };
}

export function spawnOverworldPortal(_initial = false, announce = true) {
  destroyOverworldPortal();
  activeVariant = pickNextVariant();
  const { spot, boss, archetype } = activeVariant;
  const y = groundY(spot.x, spot.z);
  overworldPortal = buildPortalGateway(scene, spot.x, y, spot.z, spot.ry, boss.portalColors, true);
  const c = Math.cos(spot.ry), s = Math.sin(spot.ry);
  for (const sx of [-1.8, 1.8]) {
    addCollider({ x: spot.x + sx * c, z: spot.z - sx * s, r: 0.68 }, OVERWORLD_PORTAL_OWNER);
  }
  addLight({ x: spot.x, y: y + 2.6, z: spot.z, color: boss.lightColor, intensity: 7.8, distance: 19, decay: 1.35, owner: OVERWORLD_PORTAL_OWNER });
  overworldPortalOpen = true;
  portalRespawnT = 0;

  if (announce && state.playing && !state.dead) {
    const dx = spot.x - player.pos.x, dz = spot.z - player.pos.z;
    const dist = Math.round(Math.hypot(dx, dz));
    const dir = compassDir(dx, dz);
    sfx.taiko(1.1);
    sfx.chime(true);
    showMsg(
      `✦ NUEVO PORTAL DE MAZMORRA ✦\n${archetype.name} en ${spot.label} (${dir} · ${dist} m)\nJefe: ${KINDS[boss.kind].name} · Míralo en el mapa (N)`,
      4.8
    );
  }
}

export function buildDungeonPortal() {
  if (!overworldPortal) spawnOverworldPortal(true, false);
}

// ------------------------------------------------------------ Dungeon 3D Geometry Builder (rebuilt per variant!)
let dungeonGroup: THREE.Group | null = null;
let entrancePortal: PortalVisual | null = null;
let victoryPortal: PortalVisual | null = null;
const dungeonLightSpecs: LightSpec[] = [];
const dungeonColliderSpecs: ColliderSpec[] = [];

function disposeDungeonGeometry() {
  if (dungeonGroup) {
    scene.remove(dungeonGroup);
    dungeonGroup.traverse(o => {
      const m = o as THREE.Mesh;
      if (m.isMesh && m.geometry) m.geometry.dispose();
    });
    dungeonGroup = null;
  }
  if (entrancePortal) { entrancePortal.vortexMat.dispose(); entrancePortal = null; }
  if (victoryPortal) { victoryPortal.vortexMat.dispose(); victoryPortal = null; }
  dungeonLightSpecs.length = 0;
  dungeonColliderSpecs.length = 0;
}

function buildDungeonGeometry() {
  disposeDungeonGeometry();
  const { archetype, boss, mirrorX } = currentInterior();
  const mx = (v: number) => (mirrorX ? -v : v);

  const g = new THREE.Group();
  g.position.set(OX, 0, OZ);
  g.visible = false;
  scene.add(g);
  dungeonGroup = g;

  // Update dynamic floor elevation bounds for this archetype
  const stairZ0 = archetype.stairGzStart * CELL + CELL / 2;
  const stairZ1 = stairZ0 - 12;
  const bossCenterZ = archetype.bossCenterGz * CELL;
  const daisZ = (archetype.victoryPortalGz + 0.9) * CELL;
  dungeonElev.stairZ0 = stairZ0;
  dungeonElev.stairZ1 = stairZ1;
  dungeonElev.daisZ = daisZ;
  dungeonElev.bossX = mx(archetype.bossGx * CELL);
  victoryPortalLocal = { x: mx(archetype.bossGx * CELL), z: archetype.victoryPortalGz * CELL };

  // Mirror grid rooms if mirrorX
  const rooms: GridRoom[] = archetype.gridRooms.map(r => mirrorX
    ? { ...r, gx0: -r.gx1, gx1: -r.gx0 }
    : r
  );

  // Update exported rects & bounding box for minimap
  activeRects = rooms.map(r => ({
    x0: r.gx0 * CELL - CELL / 2,
    x1: r.gx1 * CELL + CELL / 2,
    z0: r.gz0 * CELL - CELL / 2,
    z1: r.gz1 * CELL + CELL / 2,
    theme: r.theme,
    name: r.name
  }));
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const r of activeRects) {
    if (r.x0 < minX) minX = r.x0; if (r.x1 > maxX) maxX = r.x1;
    if (r.z0 < minZ) minZ = r.z0; if (r.z1 > maxZ) maxZ = r.z1;
  }
  activeBounds = { minX, maxX, minZ, maxZ };

  // 1) Rasterize rooms into cell lookup
  const cellMap = new Map<string, GridRoom>();
  const cKey = (gx: number, gz: number) => `${gx},${gz}`;
  for (const r of rooms) {
    for (let gz = r.gz0; gz <= r.gz1; gz++) {
      for (let gx = r.gx0; gx <= r.gx1; gx++) cellMap.set(cKey(gx, gz), r);
    }
  }

  // 2) Floors
  for (const r of rooms) {
    if (r.name === 'Escalinata del Trono') continue;
    const x0 = r.gx0 * CELL - CELL / 2, x1 = r.gx1 * CELL + CELL / 2;
    const z0 = r.gz0 * CELL - CELL / 2, z1 = r.gz1 * CELL + CELL / 2;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const y = r.theme === 'boss' ? 1.4 : 0;
    const mat = r.theme === 'cave' ? DM.caveFloor : r.theme === 'boss' ? DM.bossFloor : DM.stoneFloor;
    addPropBox(g, w + 0.25, 0.75, d + 0.25, mat, cx, y - 0.75, cz, false);
  }

  // Stepped Boss Stairway
  const bx = mx(archetype.bossGx * CELL);
  for (let i = 0; i < 6; i++) {
    const h = ((i + 1) / 6) * 1.4;
    const cz = stairZ0 - 1 - i * 2;
    addPropBox(g, 12.2, h + 0.7, 2.05, DM.obsidian, bx, -0.7, cz, false);
    addPropBox(g, 4.6, 0.05, 2.05, DM.carpet, bx, h, cz, false);
  }

  // 3) Auto-generate perimeter walls & exact colliders
  const WALL_T = 1.45;
  const DIRS: { dx: number; dz: number; lowForCam: boolean }[] = [
    { dx: 0, dz: -1, lowForCam: false },
    { dx: 0, dz: 1, lowForCam: true },
    { dx: -1, dz: 0, lowForCam: false },
    { dx: 1, dz: 0, lowForCam: false }
  ];
  for (const [k, room] of cellMap) {
    const [gx, gz] = k.split(',').map(Number);
    const cx = gx * CELL, cz = gz * CELL;
    const y0 = room.theme === 'boss' && room.name !== 'Escalinata del Trono' ? 1.4 : 0;
    for (const dir of DIRS) {
      if (cellMap.has(cKey(gx + dir.dx, gz + dir.dz))) continue;
      const alongZ = dir.dx !== 0;
      const wx = cx + dir.dx * (CELL / 2 + WALL_T / 2 - 0.15);
      const wz = cz + dir.dz * (CELL / 2 + WALL_T / 2 - 0.15);
      const isBridge = room.theme === 'bridge';
      const h = isBridge ? 0.95 : dir.lowForCam ? 1.25 : room.theme === 'boss' ? 6.0 : room.theme === 'cave' ? 5.2 : 4.5;
      if (isBridge) {
        addPropBox(g, alongZ ? 0.85 : CELL + 0.2, h, alongZ ? CELL + 0.2 : 0.85, DM.castleTrim, wx, y0, wz, true);
      } else if (room.theme === 'cave') {
        buildCaveWallSeg(g, wx, y0, wz, CELL + 0.35, WALL_T, h, alongZ, gx * 73 + gz * 137 + dir.dx * 11 + dir.dz * 23);
      } else {
        buildCastleWallSeg(g, wx, y0, wz, CELL + 0.2, WALL_T, h, alongZ);
      }
      const halfX = alongZ ? WALL_T / 2 : CELL / 2;
      const halfZ = alongZ ? CELL / 2 : WALL_T / 2;
      dungeonColliderSpecs.push({ rect: [OX + wx - halfX, OX + wx + halfX, OZ + wz - halfZ, OZ + wz + halfZ] });
    }
  }

  // 4) Entrance / Retreat Portal
  entrancePortal = buildPortalGateway(g, ENTRANCE_PORTAL_LOCAL.x, 0, ENTRANCE_PORTAL_LOCAL.z, Math.PI, boss.portalColors, false);
  dungeonLightSpecs.push({ x: OX, y: 2.5, z: OZ + ENTRANCE_PORTAL_LOCAL.z, color: boss.lightColor, intensity: 6.5, distance: 16, decay: 1.4 });
  buildBrazier(g, -7.2, 0, 4, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, 7.2, 0, 4, OX, OZ, dungeonLightSpecs);
  buildBannerStand(g, -7.6, 0, -6, Math.PI / 2);
  buildBannerStand(g, 7.6, 0, -6, -Math.PI / 2);

  // 5) Archetype Set-Dressing Props (automatically mirrored if mirrorX!)
  for (const p of archetype.props) {
    const px = mx(p.x), py = p.y ?? 0, pz = p.z;
    const ry = mirrorX ? -(p.ry ?? 0) : (p.ry ?? 0);
    if (p.kind === 'carpet') addPropBox(g, p.w ?? 4, 0.04, p.d ?? 16, DM.carpet, px, py, pz, false);
    else if (p.kind === 'arch') buildStoneArchway(g, px, py, pz, p.w ?? 9.6, !!p.alongZ, !!p.obsidian);
    else if (p.kind === 'brazier') buildBrazier(g, px, py, pz, OX, OZ, dungeonLightSpecs, !!p.violet);
    else if (p.kind === 'banner') buildBannerStand(g, px, py, pz, ry, !!p.violet);
    else if (p.kind === 'column') buildColumn(g, px, py, pz, OX, OZ, dungeonColliderSpecs, p.h ?? 4.8, p.r ?? 0.85, !!p.obsidian);
    else if (p.kind === 'sarcophagus') buildSarcophagus(g, px, py, pz, ry, OX, OZ, dungeonColliderSpecs);
    else if (p.kind === 'rack') buildWeaponRack(g, px, py, pz, ry);
    else if (p.kind === 'web') buildCobweb(g, px, py, pz, ry, p.scale ?? 2.2);
    else if (p.kind === 'crystal') buildCrystalSpire(g, px, py, pz, OX, OZ, dungeonLightSpecs, !!p.cyan, p.scale ?? 1.3, p.withLight ?? true);
    else if (p.kind === 'pool') buildGlowingPool(g, px, py, pz, p.w ?? 4.8, p.d ?? 3.8);
    else if (p.kind === 'ritualRing') {
      const m = tagMat(new THREE.MeshBasicMaterial({ color: boss.lightColor, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx);
      const ring = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.0, 40), m);
      ring.rotation.x = -Math.PI / 2; ring.position.set(px, 0.05, pz); g.add(ring);
    } else if (p.kind === 'chasm') {
      addPropBox(g, p.w ?? 90, 1, p.d ?? 34, DM.chasm, px, -14, pz, false);
      for (const sx of [-13, 13]) {
        buildCrystalSpire(g, px + sx, -12, pz - 6, OX, OZ, dungeonLightSpecs, sx > 0, 2.8, false);
        buildCrystalSpire(g, px - sx, -12, pz + 6, OX, OZ, dungeonLightSpecs, sx < 0, 2.6, false);
      }
    }
  }

  // 6) Boss Sanctum Architecture (tinted to the current boss!)
  const by = 1.4;
  buildStoneArchway(g, bx, 0.5, stairZ0 - 4, 11.2, false, true);
  addPropBox(g, 4.8, 0.04, 34, DM.carpet, bx, by, bossCenterZ + 5, false);
  for (const [dx, dz] of [[-16, 12], [16, 12], [-19, 0], [19, 0], [-16, -12], [16, -12]] as [number, number][]) {
    buildColumn(g, bx + dx, by, bossCenterZ + dz, OX, OZ, dungeonColliderSpecs, 6.4, 1.1, true);
    buildBrazier(g, bx + dx + (dx < 0 ? 1.8 : -1.8), by, bossCenterZ + dz, OX, OZ, dungeonLightSpecs, !inKuroCastle);
  }
  if (inKuroCastle) {
    // Imperial war banners and weapon racks flanking Señor Kuro's crimson throne room
    for (const [dx, dz, ry] of [
      [-23, 14, Math.PI / 2], [23, 14, -Math.PI / 2],
      [-23, -14, Math.PI / 2], [23, -14, -Math.PI / 2]
    ] as [number, number, number][]) {
      buildBannerStand(g, bx + dx, by, bossCenterZ + dz, ry, false);
      buildBrazier(g, bx + dx + (dx < 0 ? 2.2 : -2.2), by, bossCenterZ + dz, OX, OZ, dungeonLightSpecs, false);
    }
  } else {
    buildCrystalSpire(g, bx - 22, by, bossCenterZ + 16, OX, OZ, dungeonLightSpecs, false, 1.7);
    buildCrystalSpire(g, bx + 22, by, bossCenterZ + 16, OX, OZ, dungeonLightSpecs, false, 1.7);
    buildCrystalSpire(g, bx - 22, by, bossCenterZ - 16, OX, OZ, dungeonLightSpecs, true, 1.9);
    buildCrystalSpire(g, bx + 22, by, bossCenterZ - 16, OX, OZ, dungeonLightSpecs, true, 1.9);
  }

  const sigilMat = tagMat(new THREE.MeshBasicMaterial({
    color: boss.lightColor, transparent: true, opacity: 0.48, depthWrite: false, blending: THREE.AdditiveBlending
  }), CLS.fx);
  for (const [r0, r1] of [[7.6, 8.1], [4.6, 4.95], [2.2, 2.45]] as [number, number][]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), sigilMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(bx, by + 0.05, bossCenterZ); g.add(ring);
  }

  // Stepped Obsidian Throne Dais
  const daisCenterZ = victoryPortalLocal.z - 1.5;
  addPropBox(g, 19, 0.5, 10, DM.obsidian, bx, by, daisCenterZ, false);
  addPropBox(g, 19.4, 0.08, 10.4, DM.gold, bx, by + 0.46, daisCenterZ, false);
  addPropBox(g, 4.2, 4.6, 1.2, DM.obsidian, bx, by + 0.5, daisCenterZ - 3.6, true);
  addPropBox(g, 5.0, 0.42, 1.4, DM.gold, bx, by + 5.1, daisCenterZ - 3.6, false);
  buildBannerStand(g, bx - 7.2, by + 0.5, daisCenterZ - 2.5, 0, true);
  buildBannerStand(g, bx + 7.2, by + 0.5, daisCenterZ - 2.5, 0, true);

  // Victory Return Portal (hidden until the current Boss falls!)
  victoryPortal = buildPortalGateway(g, victoryPortalLocal.x, by + 0.5, victoryPortalLocal.z, 0, [0x146648, 0x4ef5a8, 0xfff2a6], true);
  victoryPortal.group.visible = false;

  shadowTree(g);
}

// ------------------------------------------------------------ Dungeon Run State & Encounters
interface DungeonRun {
  camps: Camp[];
  chests: Chest[];
  bossDefeated: boolean;
  returnPortalOpen: boolean;
  clearedRuns: number;
  returnPos: THREE.Vector3;
}

const run: DungeonRun = {
  camps: [],
  chests: [],
  bossDefeated: false,
  returnPortalOpen: false,
  clearedRuns: 0,
  returnPos: new THREE.Vector3(22 - 3.6, 0, -8 + 2.6)
};

function clearDungeonEntities() {
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].camp.dungeonRoom) {
      despawn(enemies[i]);
      enemies.splice(i, 1);
    }
  }
  clearEnemyHazards();
  for (const c of run.chests) removeChest(c);
  run.chests.length = 0;
  run.camps.length = 0;
  removeColliders(DUNGEON_OWNER);
  removeLights(DUNGEON_OWNER);
}

function populateDungeonRun() {
  clearDungeonEntities();
  for (const col of dungeonColliderSpecs) addCollider(col, DUNGEON_OWNER);
  for (const l of dungeonLightSpecs) addLight({ ...l, owner: DUNGEON_OWNER });

  run.bossDefeated = false;
  run.returnPortalOpen = false;
  if (victoryPortal) victoryPortal.group.visible = false;

  const { archetype, boss, mirrorX } = currentInterior();
  const mx = (v: number) => (mirrorX ? -v : v);
  const threat = equipmentThreat();

  for (const sc of archetype.secretChests) {
    const c = makeChest(OX + mx(sc.lx), OZ + sc.lz, mirrorX ? -sc.ry : sc.ry, 'oculto', sc.tier, false, DUNGEON_OWNER);
    c.dungeon = true;
    run.chests.push(c);
  }

  for (const sp of archetype.roomSpecs) {
    const tier = sp.bossRoom ? (inKuroCastle ? 0.85 : 0.76) : sp.bossKind ? 0.68 : 0.44 + Math.min(0.28, Math.abs(sp.lz) / 1000);
    const kinds: EnemyKind[] = sp.bossRoom ? [boss.kind, ...boss.escort] : sp.kinds.slice();
    let chest: Chest | undefined;
    if (sp.chest) {
      chest = makeChest(OX + mx(sp.chest.lx), OZ + sp.chest.lz, mirrorX ? -sp.chest.ry : sp.chest.ry, sp.chest.kind, tier, sp.chest.sealed, DUNGEON_OWNER);
      chest.dungeon = true;
      run.chests.push(chest);
    }
    const camp: Camp = {
      x: OX + mx(sp.lx),
      z: OZ + sp.lz,
      r: sp.r,
      leash: sp.r + 14,
      size: kinds.length,
      boss: sp.bossRoom ? boss.kind : sp.bossKind,
      elite: sp.eliteKind,
      tier,
      threat,
      kinds,
      roster: kinds.slice(),
      active: false,
      clearedAt: -1,
      name: sp.name,
      chest,
      dungeonRoom: sp.id
    };
    run.camps.push(camp);
  }
}

function spawnDungeonRoom(camp: Camp) {
  camp.active = true;
  for (const [idx, kind] of camp.roster.entries()) {
    const isMainBoss = kind === camp.boss;
    const angle = (idx / Math.max(1, camp.roster.length)) * Math.PI * 2 + rnd(-0.25, 0.25);
    const dist = isMainBoss ? 0 : rnd(2.8, Math.min(10.5, camp.r * 0.72));
    const p = {
      x: camp.x + Math.cos(angle) * dist,
      z: camp.z + Math.sin(angle) * dist
    };
    collide(p, 0.75);
    spawnEnemy(camp, kind, p.x, p.z);
  }
}

export function onDungeonCampCleared(camp: Camp): boolean {
  if (!camp.dungeonRoom) return false;
  if (camp.chest) unseal(camp.chest);

  if (camp.dungeonRoom === 'trono' && !run.bossDefeated) {
    const { archetype, boss } = currentInterior();
    run.bossDefeated = true;
    run.returnPortalOpen = true;
    run.clearedRuns++;
    if (inKuroCastle) kuroConquered = true;
    if (victoryPortal) {
      victoryPortal.group.visible = true;
      const vx = OX + victoryPortalLocal.x;
      const vy = dungeonFloorY(vx, OZ + victoryPortalLocal.z);
      const vz = OZ + victoryPortalLocal.z;
      addLight({ x: vx, y: vy + 2.8, z: vz, color: 0x52ffb4, intensity: 8.8, distance: 24, decay: 1.3, owner: DUNGEON_OWNER });
      impactRing(new THREE.Vector3(vx, vy + 0.12, vz), 0x52ffb4, 6.5);
      burst(new THREE.Vector3(vx, vy + 1.8, vz), 0x52ffb4, 130, 7.8, 0.16);
      burst(new THREE.Vector3(vx, vy + 2.0, vz), 0xffd27a, 95, 6.8, 0.14);
    }
    const bonus = inKuroCastle ? 5000 : 2800;
    const jadeGain = inKuroCastle ? 5 : 3;
    addPoints(bonus, inKuroCastle ? 'castillo kuro conquistado' : `${archetype.name.toLowerCase()} completada`);
    state.jade += jadeGain;
    saveVault();
    player.hp = player.maxHp;
    sfx.taiko(1.35);
    sfx.chime(true);
    skyFlash(0.65);
    showMsg(
      inKuroCastle
        ? `✦ ¡ ${KINDS[boss.kind].name.toUpperCase()} DERROTADO ! ✦\n+${bonus} puntos · +${jadeGain} sellos de jade · vida al máximo\n¡Has conquistado el Castillo Kuro! Abre el cofre real y cruza el PORTAL DE REGRESO`
        : `✦ ¡ ${KINDS[boss.kind].name.toUpperCase()} ABATIDO ! ✦\n+${bonus} puntos · +${jadeGain} sellos de jade · vida al máximo\nAbre el cofre del jefe y cruza el PORTAL DE REGRESO`,
      5.2
    );
    return true;
  }

  const cleared = run.camps.filter(c => c.roster.length === 0).length;
  const bossCleared = camp.boss ? `\n✦ Jefe de ala derrotado: ${KINDS[camp.boss].name} · Cofre de jefe abierto` : '';
  showMsg(
    `— ${camp.name?.toUpperCase() ?? 'SALA'} DESPEJADA —${bossCleared}\nSalas ${cleared}/${run.camps.length}`,
    camp.boss ? 3.4 : 2.6
  );
  return true;
}

// ------------------------------------------------------------ enter / exit transitions
function startInteriorSession(isKuro: boolean) {
  if (state.inDungeon || !state.playing || state.dead || state.menu) return;
  inKuroCastle = isKuro;
  state.inKuroCastle = isKuro;
  buildDungeonGeometry();

  const { archetype, boss } = currentInterior();
  if (isKuro) {
    const gate = kuroKeepDoorPos();
    run.returnPos.set(gate.returnX, groundY(gate.returnX, gate.returnZ), gate.returnZ);
  } else {
    const { spot } = activeVariant;
    run.returnPos.set(spot.x - 3.6, groundY(spot.x - 3.6, spot.z + 2.6), spot.z + 2.6);
  }

  for (let i = enemies.length - 1; i >= 0; i--) {
    enemies[i].camp.active = false;
    despawn(enemies[i]);
    enemies.splice(i, 1);
  }
  clearEnemyHazards();

  state.inDungeon = true;
  state.indoors = false;
  if (dungeonGroup) dungeonGroup.visible = true;
  populateDungeonRun();

  player.attackT = -1;
  player.dashT = 0;
  player.snareT = 0;
  player.jumpY = 0;
  player.vy = 0;
  player.airDashUsed = false;
  player.invuln = Math.max(player.invuln, 1.2);
  player.pos.set(OX, 0, OZ + 3.0);
  player.face = Math.PI;
  state.yaw = 0;
  sam.root.position.copy(player.pos);
  sam.root.rotation.y = player.face;
  snapCamera();

  impactRing(player.pos, boss.lightColor, 4.4);
  burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z), boss.lightColor, 70, 6.5, 0.14);
  skyFlash(0.32);
  sfx.dash();
  sfx.taiko(1.15);
  showMsg(
    isKuro
      ? `✦ INTERIOR DEL CASTILLO KURO ✦\nExplora las alas del torreón, vence a sus 4 jefes y desafía al Señor Kuro`
      : `✦ MAZMORRA: ${archetype.name.toUpperCase()} ✦\nExplora sus pasillos y cofres · Jefe final: ${KINDS[boss.kind].name}`,
    4.5
  );
}

export function enterDungeon() {
  startInteriorSession(false);
}

export function enterKuroCastle() {
  startInteriorSession(true);
}

export function exitDungeon(silent = false, targetPos?: THREE.Vector3) {
  if (!state.inDungeon) return;
  const wasKuro = inKuroCastle;
  const completed = run.bossDefeated;
  const completedName = currentInterior().archetype.name;
  const portalSpot = activeVariant.spot;

  clearDungeonEntities();
  state.inDungeon = false;
  inKuroCastle = false;
  state.inKuroCastle = false;
  state.indoors = false;
  if (dungeonGroup) dungeonGroup.visible = false;

  const dest = targetPos ?? run.returnPos;
  const y = groundY(dest.x, dest.z);
  player.attackT = -1;
  player.dashT = 0;
  player.snareT = 0;
  player.jumpY = 0;
  player.vy = 0;
  player.airDashUsed = false;
  player.invuln = Math.max(player.invuln, 1.2);
  player.pos.set(dest.x, y, dest.z);
  player.face = wasKuro ? 0 : Math.PI;
  state.yaw = 0;
  sam.root.position.copy(player.pos);
  sam.root.rotation.y = player.face;
  snapCamera();

  // If completed a random overworld portal dungeon: close the portal and schedule a brand-new random one later!
  if (completed && !wasKuro) {
    const py = groundY(portalSpot.x, portalSpot.z);
    burst(new THREE.Vector3(portalSpot.x, py + 2.0, portalSpot.z), activeVariant.boss.lightColor, 100, 7.2, 0.16);
    impactRing(new THREE.Vector3(portalSpot.x, py + 0.15, portalSpot.z), 0x52ffb4, 5.5);
    destroyOverworldPortal();
    disposeDungeonGeometry();
    portalRespawnT = rnd(55, 95);
  } else if (wasKuro) {
    disposeDungeonGeometry();
  }

  if (!silent) {
    const col = completed ? 0x52ffb4 : wasKuro ? KURO_CASTLE_BOSS.lightColor : activeVariant.boss.lightColor;
    impactRing(player.pos, col, 4.6);
    burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z), col, 75, 6.8, 0.15);
    skyFlash(0.28);
    sfx.dash();
    sfx.chime(completed);
    showMsg(
      wasKuro
        ? (completed
          ? `✦ ¡ CASTILLO KURO CONQUISTADO ! ✦\nEl Señor Kuro ha caído y el torreón es tuyo`
          : `✦ PATIO DEL CASTILLO KURO ✦\nHas salido del interior del torreón`)
        : (completed
          ? `✦ PORTAL SELLADO ✦\nHas conquistado ${completedName}\nUn nuevo portal aparecerá en otro lugar del mundo`
          : `✦ HAS SALIDO DE LA MAZMORRA ✦\nDe vuelta en ${portalSpot.label}`),
      3.8
    );
  }
}

export function resetDungeon() {
  if (state.inDungeon) {
    clearDungeonEntities();
    state.inDungeon = false;
  }
  inKuroCastle = false;
  state.inKuroCastle = false;
  kuroConquered = false;
  disposeDungeonGeometry();
  run.bossDefeated = false;
  run.returnPortalOpen = false;
  run.clearedRuns = 0;
  portalRespawnT = 0;
  spawnOverworldPortal(true, false);
}

// ------------------------------------------------------------ per-frame update & interaction
let nearPortal: 'enter' | 'enterKuro' | 'retreat' | 'victory' | null = null;
let roomScanT = 0;

function animatePortal(p: PortalVisual | null, dt: number) {
  if (!p || !p.group.visible) return;
  p.vortexMat.uniforms.uTime.value = state.time;
  p.ring.rotation.z += dt * 0.9;
  if (p.beam) {
    (p.beam.material as THREE.MeshBasicMaterial).opacity = 0.14 + 0.06 * Math.sin(state.time * 2.6);
  }
}

export function updateDungeon(dt: number) {
  animatePortal(overworldPortal, dt);
  if (state.inDungeon) {
    animatePortal(entrancePortal, dt);
    animatePortal(victoryPortal, dt);
  }

  nearPortal = null;
  if (!state.inDungeon) {
    // Always check Castle Kuro Keep Doors in the overworld
    const gate = kuroKeepDoorPos();
    const dKuro = Math.hypot(player.pos.x - gate.x, player.pos.z - gate.z);
    if (dKuro < 4.6 && !state.dead) {
      nearPortal = 'enterKuro';
      state.prompt = kuroConquered
        ? '[ E ] Volver a entrar al interior del Castillo Kuro'
        : '[ E ] Entrar al interior del Castillo Kuro · 4 jefes';
    }
    // Handle random portal respawn timer after completing a dungeon
    if (!overworldPortalOpen && state.playing && !state.dead) {
      portalRespawnT -= dt;
      if (portalRespawnT <= 0) {
        spawnOverworldPortal(false, true);
      }
      return;
    }
    if (overworldPortalOpen && !nearPortal) {
      const { spot, archetype } = activeVariant;
      const d = Math.hypot(player.pos.x - spot.x, player.pos.z - spot.z);
      if (d < 3.6 && !state.dead) {
        nearPortal = 'enter';
        state.prompt = `[ E ] Cruzar el portal · ${archetype.name}`;
      }
    }
    return;
  }

  if ((roomScanT -= dt) <= 0) {
    roomScanT = 0.2;
    for (const camp of run.camps) {
      if (camp.active || camp.roster.length === 0) continue;
      const d = Math.hypot(player.pos.x - camp.x, player.pos.z - camp.z);
      if (d < camp.r + 18) {
        spawnDungeonRoom(camp);
        if (camp.dungeonRoom === 'trono') {
          sfx.roar({});
          sfx.taiko(1.3);
          const bossName = KINDS[currentInterior().boss.kind].name.toUpperCase();
          showMsg(
            inKuroCastle
              ? `— ${bossName} —\n¡El Shōgun del Castillo Kuro desenvaina su Ōdachi!`
              : `— ${bossName} —\n¡El señor de la mazmorra te desafía!`,
            3.6
          );
        } else if (camp.boss) {
          sfx.roar({});
          sfx.taiko(1.15);
          showMsg(`— ${KINDS[camp.boss].name.toUpperCase()} —\n¡Guardián de ${camp.name ?? 'esta ala'}!`, 3.0);
        }
      }
    }
  }

  const dRetreat = Math.hypot(player.pos.x - (OX + ENTRANCE_PORTAL_LOCAL.x), player.pos.z - (OZ + ENTRANCE_PORTAL_LOCAL.z));
  if (dRetreat < 3.4 && !state.dead) {
    nearPortal = 'retreat';
    state.prompt = inKuroCastle
      ? '[ E ] Salir al patio del Castillo Kuro'
      : '[ E ] Salir de la mazmorra · Volver al mundo principal';
  }
  if (run.returnPortalOpen) {
    const dWin = Math.hypot(player.pos.x - (OX + victoryPortalLocal.x), player.pos.z - (OZ + victoryPortalLocal.z));
    if (dWin < 3.8 && !state.dead) {
      nearPortal = 'victory';
      state.prompt = inKuroCastle
        ? '[ E ] Salir victorioso del Castillo Kuro'
        : '[ E ] Cruzar el Portal de Regreso y sellar la mazmorra';
    }
  }
}

export function tryUseDungeonPortal(): boolean {
  if (!state.playing || state.dead || state.menu || !nearPortal) return false;
  if (nearPortal === 'enter') {
    enterDungeon();
    return true;
  }
  if (nearPortal === 'enterKuro') {
    enterKuroCastle();
    return true;
  }
  if (nearPortal === 'retreat' || nearPortal === 'victory') {
    exitDungeon(false);
    return true;
  }
  return false;
}

// ------------------------------------------------------------ HUD & Minimap queries
export function dungeonStatus() {
  if (!state.inDungeon) return null;
  const { archetype, boss } = currentInterior();
  const totalRooms = run.camps.length;
  const clearedRooms = run.camps.filter(c => c.roster.length === 0).length;
  const totalChests = run.chests.length;
  const openedChests = run.chests.filter(c => c.state === 'open').length;
  const remainingFoes = run.camps.reduce((sum, c) => sum + c.roster.length, 0);
  const bossCamps = run.camps.filter(c => !!c.boss);
  const bossesDefeated = bossCamps.filter(c => c.roster.length === 0).length;
  return {
    isKuro: inKuroCastle,
    name: archetype.name,
    bossName: KINDS[boss.kind].name,
    zone: dungeonZoneName(),
    clearedRooms,
    totalRooms,
    openedChests,
    totalChests,
    remainingFoes,
    bossesDefeated,
    totalBosses: bossCamps.length,
    bossDefeated: run.bossDefeated,
    returnPortalOpen: run.returnPortalOpen
  };
}

export function dungeonHud(): string {
  const s = dungeonStatus();
  if (!s) return '';
  const bar = '#'.repeat(s.clearedRooms) + '-'.repeat(Math.max(0, s.totalRooms - s.clearedRooms));
  const title = s.isKuro ? 'CASTILLO KURO · INTERIOR' : `MAZMORRA · ${s.name.toUpperCase()}`;
  const bossInfo = s.totalBosses > 1
    ? `jefes ${s.bossesDefeated}/${s.totalBosses} · final: ${s.bossName}`
    : `jefe final: ${s.bossName}`;
  const goal = s.returnPortalOpen
    ? '\n  <span class="jade">✦ portal de regreso abierto en el trono</span>'
    : `\n  <span class="r">${bossInfo}</span>`;
  return `<span class="jade">${title}</span>\n` +
    `  salas [<span class="jade">${bar}</span>] ${s.clearedRooms}/${s.totalRooms}  <span class="y">cofres ${s.openedChests}/${s.totalChests}</span>${goal}\n`;
}

export function dungeonMapData() {
  const { archetype } = currentInterior();
  return {
    isKuro: inKuroCastle,
    name: archetype.name,
    ox: OX,
    oz: OZ,
    rects: activeRects,
    bounds: activeBounds,
    chests: run.chests,
    entrancePortal: { x: OX + ENTRANCE_PORTAL_LOCAL.x, z: OZ + ENTRANCE_PORTAL_LOCAL.z },
    victoryPortal: run.returnPortalOpen ? { x: OX + victoryPortalLocal.x, z: OZ + victoryPortalLocal.z } : null
  };
}
