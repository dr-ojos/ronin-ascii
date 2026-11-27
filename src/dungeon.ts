// Portal Dungeon Mission: "La Fortaleza Abismal" (Minecraft Dungeons-style sprawling castle & caverns).
// Features a branching 3-wing labyrinth (West Dungeons & Armory, Central Royal Hall, East Spider Nest
// & Crystal Pools) converging into the Great Crystal Cavern, Twin Abyssal Bridges, Crypt of the Fallen,
// and the Obsidian Throne Sanctum of the Shōgun de la Cripta.
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
import { DUNGEON_ORIGIN, dungeonFloorY, player, state } from './state';
import { rnd } from './utils';
import {
  DM, addPropBox, buildBannerStand, buildBrazier, buildCastleWallSeg, buildCaveWallSeg,
  buildCobweb, buildColumn, buildCrystalSpire, buildGlowingPool, buildSarcophagus,
  buildStoneArchway, buildWeaponRack, type ColliderSpec, type LightSpec
} from './dungeon-art';
import type { Camp, Chest, EnemyKind } from './types';

/** Overworld entrance portal position (east edge of El Claro del Santuario). */
export const OVERWORLD_PORTAL = { x: 22, z: -8 };
export { DUNGEON_ORIGIN, dungeonFloorY };
const OX = DUNGEON_ORIGIN.x;
const OZ = DUNGEON_ORIGIN.z;
const CELL = 4; // 4m x 4m modular dungeon grid

const DUNGEON_OWNER = Symbol('dungeon');

export interface DungeonRect {
  x0: number; x1: number; z0: number; z1: number;
  theme: 'castle' | 'cave' | 'bridge' | 'boss';
  name: string;
}

interface GridRoom {
  gx0: number; gx1: number; gz0: number; gz1: number;
  theme: 'castle' | 'cave' | 'bridge' | 'boss';
  name: string;
}

/**
 * Sprawling, intricate branching dungeon layout in grid cells (1 cell = 4m).
 * Local world coords: x in [gx0*4 - 2, gx1*4 + 2], z in [gz0*4 - 2, gz1*4 + 2].
 */
const GRID_ROOMS: GridRoom[] = [
  // Entrance & Crossroads
  { gx0: -2, gx1: 2, gz0: -2, gz1: 2, theme: 'castle', name: 'Atrio del Portal' },
  { gx0: -1, gx1: 1, gz0: -4, gz1: -3, theme: 'castle', name: 'Pasillo de Entrada' },
  { gx0: -4, gx1: 4, gz0: -10, gz1: -5, theme: 'castle', name: 'Vestíbulo de las Antorchas' },

  // Central Royal Spine
  { gx0: -1, gx1: 1, gz0: -13, gz1: -11, theme: 'castle', name: 'Pasaje Real' },
  { gx0: -4, gx1: 4, gz0: -20, gz1: -14, theme: 'castle', name: 'Salón de los Estandartes' },
  { gx0: -1, gx1: 1, gz0: -24, gz1: -21, theme: 'cave', name: 'Grieta Central' },

  // West Wing: Dungeons -> Corridors -> Abandoned Armory -> Secret Alcove -> Loop to Crystal Cavern
  { gx0: -10, gx1: -5, gz0: -8, gz1: -7, theme: 'castle', name: 'Corredor Oeste' },
  { gx0: -14, gx1: -9, gz0: -16, gz1: -9, theme: 'castle', name: 'Celdas de los Condenados' },
  { gx0: -13, gx1: -12, gz0: -23, gz1: -17, theme: 'castle', name: 'Galería de Hierro' },
  { gx0: -15, gx1: -9, gz0: -29, gz1: -24, theme: 'castle', name: 'Armería Abandonada' },
  { gx0: -17, gx1: -16, gz0: -27, gz1: -26, theme: 'castle', name: 'Cámara Secreta Oeste' },
  { gx0: -8, gx1: -6, gz0: -28, gz1: -27, theme: 'cave', name: 'Pasaje de la Armería' },

  // East Wing: Silk Tunnels -> Spider Nest -> Winding Cave -> Glowing Pool -> Secret Cove -> Loop to Crystal Cavern
  { gx0: 5, gx1: 10, gz0: -8, gz1: -7, theme: 'cave', name: 'Túnel de Seda' },
  { gx0: 9, gx1: 14, gz0: -17, gz1: -9, theme: 'cave', name: 'Nido de las Arañas' },
  { gx0: 12, gx1: 13, gz0: -24, gz1: -18, theme: 'cave', name: 'Pasadizo de Estalactitas' },
  { gx0: 9, gx1: 15, gz0: -30, gz1: -25, theme: 'cave', name: 'Estanque Luminoso' },
  { gx0: 16, gx1: 17, gz0: -28, gz1: -27, theme: 'cave', name: 'Gruta Secreta Este' },
  { gx0: 6, gx1: 8, gz0: -29, gz1: -28, theme: 'cave', name: 'Brecha de Cristales' },

  // Convergence: Grand Crystal Cavern
  { gx0: -5, gx1: 5, gz0: -36, gz1: -25, theme: 'cave', name: 'Gran Caverna de Cristal' },

  // Abyssal Chasm: Main Bridge + Narrow West Catwalk to Hidden Chasm Island
  { gx0: -1, gx1: 1, gz0: -43, gz1: -37, theme: 'bridge', name: 'Puente del Abismo' },
  { gx0: -5, gx1: -2, gz0: -37, gz1: -37, theme: 'bridge', name: 'Pasarela del Abismo' },
  { gx0: -7, gx1: -6, gz0: -42, gz1: -37, theme: 'bridge', name: 'Pasarela del Abismo' },
  { gx0: -9, gx1: -6, gz0: -44, gz1: -43, theme: 'cave', name: 'Islote del Abismo' },

  // Crypt of the Fallen (Act II finale)
  { gx0: -5, gx1: 5, gz0: -50, gz1: -44, theme: 'castle', name: 'Cripta de los Caídos' },

  // ======================== ACT III: LAS PROFUNDIDADES DE OBSIDIANA ========================
  { gx0: -1, gx1: 1, gz0: -54, gz1: -51, theme: 'castle', name: 'Pasillo de las Sombras' },
  { gx0: -4, gx1: 4, gz0: -60, gz1: -55, theme: 'castle', name: 'Encrucijada de Obsidiana' },

  // Deep West Wing: Crystal Pit & Secret Vault
  { gx0: -10, gx1: -5, gz0: -58, gz1: -57, theme: 'cave', name: 'Túnel Abisal Oeste' },
  { gx0: -15, gx1: -10, gz0: -68, gz1: -59, theme: 'cave', name: 'Fosa de Cristales' },
  { gx0: -17, gx1: -16, gz0: -65, gz1: -64, theme: 'cave', name: 'Bóveda Oculta' },
  { gx0: -9, gx1: -6, gz0: -67, gz1: -66, theme: 'cave', name: 'Paso de la Fosa' },

  // Deep East Wing: Royal Catacombs
  { gx0: 5, gx1: 10, gz0: -58, gz1: -57, theme: 'castle', name: 'Galería Fúnebre' },
  { gx0: 10, gx1: 15, gz0: -68, gz1: -59, theme: 'castle', name: 'Catacumbas Reales' },
  { gx0: 6, gx1: 9, gz0: -67, gz1: -66, theme: 'castle', name: 'Paso de las Catacumbas' },

  // Deep Convergence: Hall of Rituals
  { gx0: -1, gx1: 1, gz0: -63, gz1: -61, theme: 'castle', name: 'Corredor del Sello' },
  { gx0: -5, gx1: 5, gz0: -74, gz1: -64, theme: 'castle', name: 'Salón de los Rituales' },

  // Second Abyssal Chasm: Bridge of the Ancients
  { gx0: -1, gx1: 1, gz0: -81, gz1: -75, theme: 'bridge', name: 'Puente de los Antiguos' },

  // Grand Boss Stairway & Obsidian Throne Sanctum
  { gx0: -1, gx1: 1, gz0: -84, gz1: -82, theme: 'boss', name: 'Escalinata del Trono' },
  { gx0: -6, gx1: 6, gz0: -94, gz1: -85, theme: 'boss', name: 'Trono Abismal' }
];

/** Exported world-space-local rectangles for minimap and zone lookup. */
export const DUNGEON_RECTS: DungeonRect[] = GRID_ROOMS.map(r => ({
  x0: r.gx0 * CELL - CELL / 2,
  x1: r.gx1 * CELL + CELL / 2,
  z0: r.gz0 * CELL - CELL / 2,
  z1: r.gz1 * CELL + CELL / 2,
  theme: r.theme,
  name: r.name
}));

const ENTRANCE_PORTAL_LOCAL = { x: 0, z: 7.4 };
const VICTORY_PORTAL_LOCAL = { x: 0, z: -369.5 };

export function dungeonZoneName(wx = player.pos.x, wz = player.pos.z): string {
  const lx = wx - OX, lz = wz - OZ;
  for (const r of DUNGEON_RECTS) {
    if (lx >= r.x0 && lx <= r.x1 && lz >= r.z0 && lz <= r.z1) return r.name;
  }
  return 'Fortaleza Abismal';
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

// ------------------------------------------------------------ overworld entrance portal
let overworldPortal: PortalVisual | null = null;
const OVERWORLD_PORTAL_OWNER = Symbol('overworld-portal');

export function buildDungeonPortal() {
  if (overworldPortal) return;
  const x = OVERWORLD_PORTAL.x, z = OVERWORLD_PORTAL.z, y = groundY(x, z);
  overworldPortal = buildPortalGateway(scene, x, y, z, -Math.PI * 0.35, [0x3b1278, 0x9b4dff, 0x8af6ff], true);
  const ry = -Math.PI * 0.35, c = Math.cos(ry), s = Math.sin(ry);
  for (const sx of [-1.8, 1.8]) {
    addCollider({ x: x + sx * c, z: z - sx * s, r: 0.68 }, OVERWORLD_PORTAL_OWNER);
  }
  addLight({ x, y: y + 2.6, z, color: 0xa45eff, intensity: 7.8, distance: 19, decay: 1.35, owner: OVERWORLD_PORTAL_OWNER });
}

// ------------------------------------------------------------ dungeon 3D geometry builder (grid auto-walls + rich set dressing)
let dungeonGroup: THREE.Group | null = null;
let entrancePortal: PortalVisual | null = null;
let victoryPortal: PortalVisual | null = null;
const dungeonLightSpecs: LightSpec[] = [];
const dungeonColliderSpecs: ColliderSpec[] = [];

function buildDungeonGeometry() {
  if (dungeonGroup) return;
  const g = new THREE.Group();
  g.position.set(OX, 0, OZ);
  g.visible = false;
  scene.add(g);
  dungeonGroup = g;

  // 1) Rasterize GRID_ROOMS into a cell lookup map
  const cellMap = new Map<string, GridRoom>();
  const cKey = (gx: number, gz: number) => `${gx},${gz}`;
  for (const r of GRID_ROOMS) {
    for (let gz = r.gz0; gz <= r.gz1; gz++) {
      for (let gx = r.gx0; gx <= r.gx1; gx++) {
        cellMap.set(cKey(gx, gz), r);
      }
    }
  }

  // 2) Floor slabs for each room (except the stepped Boss Stairway built separately)
  for (const r of GRID_ROOMS) {
    if (r.name === 'Escalinata del Trono') continue;
    const x0 = r.gx0 * CELL - CELL / 2, x1 = r.gx1 * CELL + CELL / 2;
    const z0 = r.gz0 * CELL - CELL / 2, z1 = r.gz1 * CELL + CELL / 2;
    const w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
    const y = r.theme === 'boss' ? 1.4 : 0;
    const mat = r.theme === 'cave' ? DM.caveFloor : r.theme === 'boss' ? DM.bossFloor : DM.stoneFloor;
    addPropBox(g, w + 0.25, 0.75, d + 0.25, mat, cx, y - 0.75, cz, false);
  }

  // Stepped Obsidian Boss Stairway (lz: -326 -> -338, y: 0 -> 1.4)
  for (let i = 0; i < 6; i++) {
    const h = ((i + 1) / 6) * 1.4;
    const cz = -327 - i * 2;
    addPropBox(g, 12.2, h + 0.7, 2.05, DM.obsidian, 0, -0.7, cz, false);
    addPropBox(g, 4.6, 0.05, 2.05, DM.carpet, 0, h, cz, false);
  }

  // 3) Auto-generate perimeter walls & exact colliders on every boundary between walkable and solid cells
  const WALL_T = 1.45;
  const DIRS: { dx: number; dz: number; lowForCam: boolean }[] = [
    { dx: 0, dz: -1, lowForCam: false }, // North wall (tall)
    { dx: 0, dz: 1, lowForCam: true },   // South wall (low cutaway so camera never gets blocked!)
    { dx: -1, dz: 0, lowForCam: false }, // West wall (tall)
    { dx: 1, dz: 0, lowForCam: false }   // East wall (tall)
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
        // Carved stone bridge parapet with posts
        addPropBox(g, alongZ ? 0.85 : CELL + 0.2, h, alongZ ? CELL + 0.2 : 0.85, DM.castleTrim, wx, y0, wz, true);
      } else if (room.theme === 'cave') {
        buildCaveWallSeg(g, wx, y0, wz, CELL + 0.35, WALL_T, h, alongZ, gx * 73 + gz * 137 + dir.dx * 11 + dir.dz * 23);
      } else {
        buildCastleWallSeg(g, wx, y0, wz, CELL + 0.2, WALL_T, h, alongZ);
      }

      // Exact wall collider
      const halfX = alongZ ? WALL_T / 2 : CELL / 2;
      const halfZ = alongZ ? CELL / 2 : WALL_T / 2;
      dungeonColliderSpecs.push({
        rect: [OX + wx - halfX, OX + wx + halfX, OZ + wz - halfZ, OZ + wz + halfZ]
      });
    }
  }

  // 4) Handcrafted Set Dressing, Archways, Carpets, Props, Pools, Chasm & Boss Sanctum
  // Carpets along central spine & crypt
  addPropBox(g, 3.8, 0.04, 16, DM.carpet, 0, 0, -2, false);
  addPropBox(g, 4.2, 0.04, 24, DM.carpet, 0, 0, -30, false);
  addPropBox(g, 4.2, 0.04, 28, DM.carpet, 0, 0, -68, false);
  addPropBox(g, 4.2, 0.04, 26, DM.carpet, 0, 0, -188, false);
  addPropBox(g, 4.2, 0.04, 24, DM.carpet, 0, 0, -230, false);
  addPropBox(g, 4.4, 0.04, 40, DM.carpet, 0, 0, -276, false);
  addPropBox(g, 4.8, 0.04, 34, DM.carpet, 0, 1.4, -353, false);

  // Vaulted stone archways with iron portcullises at major room entrances
  buildStoneArchway(g, 0, 0, -14, 9.6, false);       // Entrance -> Crossroads
  buildStoneArchway(g, 0, 0, -48, 9.6, false);       // Crossroads -> Banner Hall
  buildStoneArchway(g, -20, 0, -30, 7.6, true);      // Crossroads -> West Wing
  buildStoneArchway(g, 20, 0, -30, 7.6, true);       // Crossroads -> East Wing
  buildStoneArchway(g, -48, 0, -90, 7.6, false);     // West Dungeons -> Armory
  buildStoneArchway(g, 0, 0, -174, 10.0, false);     // Bridge -> Crypt
  buildStoneArchway(g, 0, 0, -210, 9.6, false, true); // Crypt -> Deep Crossroads
  buildStoneArchway(g, -20, 0, -230, 7.6, true);      // Deep Crossroads -> Crystal Pit
  buildStoneArchway(g, 20, 0, -230, 7.6, true);       // Deep Crossroads -> Royal Catacombs
  buildStoneArchway(g, 0, 0, -254, 10.0, false, true); // Deep Crossroads -> Ritual Hall
  buildStoneArchway(g, 0, 0.5, -330, 11.2, false, true); // Bridge II -> Boss Sanctum (Obsidian)

  // Entrance / Retreat Portal in Atrio
  entrancePortal = buildPortalGateway(g, ENTRANCE_PORTAL_LOCAL.x, 0, ENTRANCE_PORTAL_LOCAL.z, Math.PI, [0x261258, 0x7e4dff, 0x8af6ff], false);
  dungeonLightSpecs.push({ x: OX, y: 2.5, z: OZ + ENTRANCE_PORTAL_LOCAL.z, color: 0x8f5cff, intensity: 6.5, distance: 16, decay: 1.4 });
  buildBrazier(g, -7.2, 0, 4, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, 7.2, 0, 4, OX, OZ, dungeonLightSpecs);
  buildBannerStand(g, -7.6, 0, -6, Math.PI / 2);
  buildBannerStand(g, 7.6, 0, -6, -Math.PI / 2);

  // Vestíbulo de las Antorchas (Crossroads)
  for (const [px, pz] of [[-10, -24], [10, -24], [-10, -36], [10, -36]] as [number, number][]) {
    buildColumn(g, px, 0, pz, OX, OZ, dungeonColliderSpecs, 4.6, 0.85);
  }
  buildBrazier(g, -15, 0, -24, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, 15, 0, -24, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, -15, 0, -36, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, 15, 0, -36, OX, OZ, dungeonLightSpecs);

  // Salón de los Estandartes (Center Hall)
  for (const [px, pz] of [[-10, -60], [10, -60], [-10, -76], [10, -76]] as [number, number][]) {
    buildColumn(g, px, 0, pz, OX, OZ, dungeonColliderSpecs, 4.8, 0.85);
    buildBannerStand(g, px + (px < 0 ? 1.4 : -1.4), 0, pz, px < 0 ? Math.PI / 2 : -Math.PI / 2);
  }
  buildBrazier(g, -14, 0, -68, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, 14, 0, -68, OX, OZ, dungeonLightSpecs);

  // West Wing: Celdas de los Condenados & Armería Abandonada
  buildSarcophagus(g, -53, 0, -44, Math.PI / 2, OX, OZ, dungeonColliderSpecs);
  buildSarcophagus(g, -53, 0, -56, Math.PI / 2, OX, OZ, dungeonColliderSpecs);
  buildBrazier(g, -40, 0, -40, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, -40, 0, -60, OX, OZ, dungeonLightSpecs);
  buildBrazier(g, -50, 0, -82, OX, OZ, dungeonLightSpecs);

  buildWeaponRack(g, -57, 0, -100, Math.PI / 2);
  buildWeaponRack(g, -57, 0, -112, Math.PI / 2);
  buildWeaponRack(g, -42, 0, -116, 0);
  buildBannerStand(g, -40, 0, -100, -Math.PI / 2, true);
  buildBrazier(g, -56, 0, -106, OX, OZ, dungeonLightSpecs, true);
  buildBrazier(g, -40, 0, -106, OX, OZ, dungeonLightSpecs, true);

  // East Wing: Nido de las Arañas & Estanque Luminoso
  buildCobweb(g, 38, 0, -40, 0.4, 2.2);
  buildCobweb(g, 54, 0, -42, -0.7, 2.4);
  buildCobweb(g, 54, 0, -64, -2.1, 2.3);
  buildCobweb(g, 40, 0, -62, 1.2, 2.0);
  buildCrystalSpire(g, 39, 0, -48, OX, OZ, dungeonLightSpecs, false, 1.25);
  buildCrystalSpire(g, 54, 0, -54, OX, OZ, dungeonLightSpecs, true, 1.15);
  buildCrystalSpire(g, 50, 0, -84, OX, OZ, dungeonLightSpecs, false, 1.0);

  // Glowing subterranean pool in Estanque Luminoso
  buildGlowingPool(g, 48, 0, -110, 5.2, 4.2);
  buildCrystalSpire(g, 39, 0, -104, OX, OZ, dungeonLightSpecs, true, 1.35);
  buildCrystalSpire(g, 58, 0, -116, OX, OZ, dungeonLightSpecs, true, 1.4);
  buildCrystalSpire(g, 66, 0, -110, OX, OZ, dungeonLightSpecs, false, 1.25);

  // Gran Caverna de Cristal (Convergence Hall)
  buildGlowingPool(g, -11, 0, -124, 4.8, 3.8);
  buildGlowingPool(g, 11, 0, -130, 4.4, 3.5);
  buildCrystalSpire(g, -18, 0, -106, OX, OZ, dungeonLightSpecs, true, 1.45);
  buildCrystalSpire(g, 18, 0, -106, OX, OZ, dungeonLightSpecs, false, 1.45);
  buildCrystalSpire(g, -18, 0, -138, OX, OZ, dungeonLightSpecs, false, 1.5);
  buildCrystalSpire(g, 18, 0, -138, OX, OZ, dungeonLightSpecs, true, 1.5);
  buildColumn(g, -9, 0, -116, OX, OZ, dungeonColliderSpecs, 4.4, 1.05, true);
  buildColumn(g, 9, 0, -116, OX, OZ, dungeonColliderSpecs, 4.4, 1.05, true);

  // Deep Abyssal Chasm below Twin Bridges
  addPropBox(g, 110, 1, 36, DM.chasm, -10, -14, -160, false);
  for (const [cx, cz, cyan] of [[-12, -154, false], [12, -154, true], [-14, -166, true], [14, -166, false], [-36, -162, false]] as [number, number, boolean][]) {
    buildCrystalSpire(g, cx, -12, cz, OX, OZ, dungeonLightSpecs, cyan, 2.8, false);
  }
  for (const bz of [-152, -160, -168]) {
    buildBrazier(g, -5.2, 0.5, bz, OX, OZ, dungeonLightSpecs);
    buildBrazier(g, 5.2, 0.5, bz, OX, OZ, dungeonLightSpecs);
  }
  buildCrystalSpire(g, -34, 0, -174, OX, OZ, dungeonLightSpecs, true, 1.2);

  // Cripta de los Caídos
  for (const [px, pz] of [[-12, -182], [12, -182], [-12, -196], [12, -196]] as [number, number][]) {
    buildColumn(g, px, 0, pz, OX, OZ, dungeonColliderSpecs, 5.0, 0.9, true);
    buildBrazier(g, px + (px < 0 ? -3.4 : 3.4), 0, pz, OX, OZ, dungeonLightSpecs, true);
  }
  buildSarcophagus(g, -17, 0, -189, Math.PI / 2, OX, OZ, dungeonColliderSpecs);
  buildSarcophagus(g, 17, 0, -189, -Math.PI / 2, OX, OZ, dungeonColliderSpecs);
  buildBannerStand(g, -9, 0, -199, 0, true);
  buildBannerStand(g, 9, 0, -199, 0, true);

  // ======================== ACT III SET DRESSING ========================
  // Encrucijada de Obsidiana (Deep Crossroads)
  for (const [px, pz] of [[-11, -224], [11, -224], [-11, -236], [11, -236]] as [number, number][]) {
    buildColumn(g, px, 0, pz, OX, OZ, dungeonColliderSpecs, 5.0, 0.9, true);
  }
  buildBrazier(g, -15, 0, -230, OX, OZ, dungeonLightSpecs, true);
  buildBrazier(g, 15, 0, -230, OX, OZ, dungeonLightSpecs, true);

  // Fosa de Cristales (Deep West Wing)
  buildGlowingPool(g, -50, 0, -254, 5.6, 4.6);
  buildCrystalSpire(g, -58, 0, -242, OX, OZ, dungeonLightSpecs, true, 1.5);
  buildCrystalSpire(g, -42, 0, -264, OX, OZ, dungeonLightSpecs, false, 1.5);
  buildCrystalSpire(g, -66, 0, -258, OX, OZ, dungeonLightSpecs, true, 1.3);
  buildCobweb(g, -42, 0, -240, -0.8, 2.3);

  // Catacumbas Reales (Deep East Wing)
  buildSarcophagus(g, 57, 0, -246, -Math.PI / 2, OX, OZ, dungeonColliderSpecs);
  buildSarcophagus(g, 57, 0, -258, -Math.PI / 2, OX, OZ, dungeonColliderSpecs);
  buildSarcophagus(g, 43, 0, -252, Math.PI / 2, OX, OZ, dungeonColliderSpecs);
  buildBannerStand(g, 43, 0, -240, Math.PI / 2, true);
  buildBannerStand(g, 57, 0, -266, -Math.PI / 2, true);
  buildBrazier(g, 44, 0, -244, OX, OZ, dungeonLightSpecs, true);
  buildBrazier(g, 56, 0, -264, OX, OZ, dungeonLightSpecs, true);

  // Salón de los Rituales (Deep Convergence Hall)
  for (const [px, pz] of [[-13, -262], [13, -262], [-13, -288], [13, -288]] as [number, number][]) {
    buildColumn(g, px, 0, pz, OX, OZ, dungeonColliderSpecs, 5.4, 0.95, true);
    buildBrazier(g, px + (px < 0 ? 2.4 : -2.4), 0, pz, OX, OZ, dungeonLightSpecs, true);
  }
  const ritualSigilMat = tagMat(new THREE.MeshBasicMaterial({
    color: 0xff4a6a, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending
  }), CLS.fx);
  const ritualRing = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.0, 40), ritualSigilMat);
  ritualRing.rotation.x = -Math.PI / 2; ritualRing.position.set(0, 0.05, -276); g.add(ritualRing);

  // Second Chasm below Puente de los Antiguos (lz: -300..-324)
  addPropBox(g, 90, 1, 34, DM.chasm, 0, -14, -312, false);
  for (const [cx, cz, cyan] of [[-13, -306, false], [13, -306, true], [-14, -318, true], [14, -318, false]] as [number, number, boolean][]) {
    buildCrystalSpire(g, cx, -12, cz, OX, OZ, dungeonLightSpecs, cyan, 2.9, false);
  }
  for (const bz of [-304, -312, -320]) {
    buildBrazier(g, -5.2, 0.5, bz, OX, OZ, dungeonLightSpecs, true);
    buildBrazier(g, 5.2, 0.5, bz, OX, OZ, dungeonLightSpecs, true);
  }

  // Boss Sanctum: Trono Abismal (y = 1.4, lz: -338..-378)
  const by = 1.4;
  for (const [px, pz] of [[-16, -346], [16, -346], [-19, -358], [19, -358], [-16, -370], [16, -370]] as [number, number][]) {
    buildColumn(g, px, by, pz, OX, OZ, dungeonColliderSpecs, 6.4, 1.1, true);
    buildBrazier(g, px + (px < 0 ? 1.8 : -1.8), by, pz, OX, OZ, dungeonLightSpecs, true);
  }
  buildCrystalSpire(g, -22, by, -342, OX, OZ, dungeonLightSpecs, false, 1.7);
  buildCrystalSpire(g, 22, by, -342, OX, OZ, dungeonLightSpecs, false, 1.7);
  buildCrystalSpire(g, -22, by, -374, OX, OZ, dungeonLightSpecs, true, 1.9);
  buildCrystalSpire(g, 22, by, -374, OX, OZ, dungeonLightSpecs, true, 1.9);

  // Multi-ring arcane floor mandala at Boss Arena center (0, -358)
  const sigilMat = tagMat(new THREE.MeshBasicMaterial({
    color: 0xa85eff, transparent: true, opacity: 0.48, depthWrite: false, blending: THREE.AdditiveBlending
  }), CLS.fx);
  for (const [r0, r1] of [[7.6, 8.1], [4.6, 4.95], [2.2, 2.45]] as [number, number][]) {
    const ring = new THREE.Mesh(new THREE.RingGeometry(r0, r1, 48), sigilMat);
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, by + 0.05, -358); g.add(ring);
  }

  // Stepped Obsidian Shōgun Throne Dais at north end
  addPropBox(g, 19, 0.5, 10, DM.obsidian, 0, by, -371, false);
  addPropBox(g, 19.4, 0.08, 10.4, DM.gold, 0, by + 0.46, -371, false);
  addPropBox(g, 4.2, 4.6, 1.2, DM.obsidian, 0, by + 0.5, -374.6, true);
  addPropBox(g, 5.0, 0.42, 1.4, DM.gold, 0, by + 5.1, -374.6, false);
  buildBannerStand(g, -7.2, by + 0.5, -373.5, 0, true);
  buildBannerStand(g, 7.2, by + 0.5, -373.5, 0, true);

  // Victory Return Portal (hidden until Shōgun de la Cripta falls)
  victoryPortal = buildPortalGateway(g, VICTORY_PORTAL_LOCAL.x, by + 0.5, VICTORY_PORTAL_LOCAL.z, 0, [0x146648, 0x4ef5a8, 0xfff2a6], true);
  victoryPortal.group.visible = false;

  shadowTree(g);
}

// ------------------------------------------------------------ dungeon encounters & chests
interface DungeonRoomSpec {
  id: string;
  name: string;
  lx: number; lz: number;
  r: number;
  kinds: EnemyKind[];
  chest?: { lx: number; lz: number; ry: number; kind: Chest['kind']; sealed: boolean };
  bossRoom?: boolean;
  eliteKind?: EnemyKind;
}

const ROOM_SPECS: DungeonRoomSpec[] = [
  {
    id: 'estandartes', name: 'Salón de los Estandartes', lx: 0, lz: -68, r: 13,
    kinds: ['escudero', 'ashigaru', 'arquero', 'oni', 'duelista'],
    chest: { lx: 0, lz: -68, ry: 0, kind: 'guarida', sealed: true }
  },
  {
    id: 'celdas', name: 'Celdas de los Condenados', lx: -46, lz: -50, r: 11,
    kinds: ['espectro', 'guadanero', 'escudero', 'oni', 'arquero'],
    chest: { lx: -46, lz: -50, ry: Math.PI / 2, kind: 'guarida', sealed: true }
  },
  {
    id: 'armeria', name: 'Armería Abandonada', lx: -48, lz: -106, r: 11,
    kinds: ['kensei', 'duelista', 'escudero', 'ashigaru'],
    chest: { lx: -48, lz: -106, ry: 0, kind: 'guardian', sealed: true },
    eliteKind: 'kensei'
  },
  {
    id: 'nido', name: 'Nido de las Arañas', lx: 46, lz: -52, r: 12,
    kinds: ['arana', 'arana', 'arana', 'acechador', 'sombra'],
    chest: { lx: 46, lz: -52, ry: -Math.PI / 2, kind: 'guarida', sealed: true }
  },
  {
    id: 'estanque', name: 'Estanque Luminoso', lx: 48, lz: -110, r: 12,
    kinds: ['escorpion', 'escorpion', 'hechicero', 'arana', 'piromante'],
    chest: { lx: 48, lz: -110, ry: -Math.PI / 2, kind: 'guarida', sealed: true }
  },
  {
    id: 'cavernas', name: 'Gran Caverna de Cristal', lx: 0, lz: -124, r: 16,
    kinds: ['bruto', 'arana', 'escorpion', 'hechicero', 'acechador', 'duelista'],
    chest: { lx: 0, lz: -124, ry: 0, kind: 'guarida', sealed: true }
  },
  {
    id: 'cripta', name: 'Cripta de los Caídos', lx: 0, lz: -188, r: 15,
    kinds: ['coloso', 'espectro', 'piromante', 'tambor', 'escudero'],
    chest: { lx: 0, lz: -188, ry: 0, kind: 'guardian', sealed: true }
  },
  {
    id: 'fosa', name: 'Fosa de Cristales', lx: -50, lz: -254, r: 13,
    kinds: ['escorpion', 'escorpion', 'arana', 'arana', 'hechicero', 'sombra'],
    chest: { lx: -50, lz: -254, ry: Math.PI / 2, kind: 'guardian', sealed: true }
  },
  {
    id: 'catacumbas', name: 'Catacumbas Reales', lx: 50, lz: -254, r: 13,
    kinds: ['tengu', 'espectro', 'espectro', 'piromante', 'guadanero'],
    chest: { lx: 50, lz: -254, ry: -Math.PI / 2, kind: 'guardian', sealed: true },
    eliteKind: 'tengu'
  },
  {
    id: 'rituales', name: 'Salón de los Rituales', lx: 0, lz: -276, r: 16,
    kinds: ['raijin', 'coloso', 'tambor', 'piromante', 'hechicero', 'duelista'],
    chest: { lx: 0, lz: -276, ry: 0, kind: 'guardian', sealed: true },
    eliteKind: 'raijin'
  },
  {
    id: 'trono', name: 'Trono Abismal', lx: 0, lz: -358, r: 20,
    kinds: ['senorCripta', 'espectro', 'duelista'],
    chest: { lx: 0, lz: -365, ry: 0, kind: 'jefe', sealed: true },
    bossRoom: true
  }
];

const SECRET_CHESTS: { lx: number; lz: number; ry: number; tier: number }[] = [
  { lx: -67, lz: -106, ry: Math.PI / 2, tier: 0.55 },   // Cámara Secreta Oeste
  { lx: 67, lz: -110, ry: -Math.PI / 2, tier: 0.55 },   // Gruta Secreta Este
  { lx: -32, lz: -174, ry: Math.PI / 2, tier: 0.65 },   // Islote del Abismo (catwalk)
  { lx: -67, lz: -258, ry: Math.PI / 2, tier: 0.72 }    // Bóveda Oculta (Acto III)
];

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
  returnPos: new THREE.Vector3(OVERWORLD_PORTAL.x - 3.6, 0, OVERWORLD_PORTAL.z + 2.6)
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

  const threat = equipmentThreat();

  // Hidden unsealed treasure chests in secret alcoves & chasm island
  for (const sc of SECRET_CHESTS) {
    const c = makeChest(OX + sc.lx, OZ + sc.lz, sc.ry, 'oculto', sc.tier, false, DUNGEON_OWNER);
    c.dungeon = true;
    run.chests.push(c);
  }

  for (const sp of ROOM_SPECS) {
    const tier = sp.bossRoom ? 0.75 : sp.id === 'cripta' ? 0.62 : sp.id === 'cavernas' ? 0.54 : sp.id === 'armeria' || sp.id === 'estanque' ? 0.48 : 0.36;
    let chest: Chest | undefined;
    if (sp.chest) {
      chest = makeChest(OX + sp.chest.lx, OZ + sp.chest.lz, sp.chest.ry, sp.chest.kind, tier, sp.chest.sealed, DUNGEON_OWNER);
      chest.dungeon = true;
      run.chests.push(chest);
    }
    const camp: Camp = {
      x: OX + sp.lx,
      z: OZ + sp.lz,
      r: sp.r,
      leash: sp.r + 14,
      size: sp.kinds.length,
      boss: sp.bossRoom ? 'senorCripta' : undefined,
      elite: sp.eliteKind,
      tier,
      threat,
      kinds: sp.kinds.slice(),
      roster: sp.kinds.slice(),
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
    const angle = (idx / Math.max(1, camp.roster.length)) * Math.PI * 2 + 0.4;
    const dist = isMainBoss ? 0 : rnd(3.2, Math.min(8.0, camp.r * 0.55));
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
    run.bossDefeated = true;
    run.returnPortalOpen = true;
    run.clearedRuns++;
    if (victoryPortal) {
      victoryPortal.group.visible = true;
      const vx = OX + VICTORY_PORTAL_LOCAL.x;
      const vy = dungeonFloorY(vx, OZ + VICTORY_PORTAL_LOCAL.z);
      const vz = OZ + VICTORY_PORTAL_LOCAL.z;
      addLight({ x: vx, y: vy + 2.8, z: vz, color: 0x52ffb4, intensity: 8.8, distance: 24, decay: 1.3, owner: DUNGEON_OWNER });
      impactRing(new THREE.Vector3(vx, vy + 0.12, vz), 0x52ffb4, 6.5);
      burst(new THREE.Vector3(vx, vy + 1.8, vz), 0x52ffb4, 130, 7.8, 0.16);
      burst(new THREE.Vector3(vx, vy + 2.0, vz), 0xffd27a, 95, 6.8, 0.14);
    }
    const bonus = 2800;
    addPoints(bonus, 'fortaleza abismal completada');
    state.jade += 3;
    saveVault();
    player.hp = player.maxHp;
    sfx.taiko(1.35);
    sfx.chime(true);
    skyFlash(0.65);
    showMsg(
      `✦ ¡ SHŌGUN DE LA CRIPTA ABATIDO ! ✦\n+${bonus} puntos · +3 sellos de jade · vida al máximo\nAbre el cofre del jefe y cruza el PORTAL DE REGRESO`,
      5.0
    );
    return true;
  }

  const cleared = run.camps.filter(c => c.roster.length === 0).length;
  showMsg(
    `— ${camp.name?.toUpperCase() ?? 'SALA'} DESPEJADA —\nEl cofre se ha abierto · Salas ${cleared}/${run.camps.length}`,
    2.6
  );
  return true;
}

// ------------------------------------------------------------ enter / exit transitions
export function enterDungeon() {
  if (state.inDungeon || !state.playing || state.dead || state.menu) return;
  buildDungeonGeometry();

  run.returnPos.set(OVERWORLD_PORTAL.x - 3.6, groundY(OVERWORLD_PORTAL.x - 3.6, OVERWORLD_PORTAL.z + 2.6), OVERWORLD_PORTAL.z + 2.6);

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

  impactRing(player.pos, 0xa45eff, 4.4);
  burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z), 0xa45eff, 70, 6.5, 0.14);
  burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z), 0x62f2ff, 45, 5.2, 0.12);
  skyFlash(0.32);
  sfx.dash();
  sfx.taiko(1.1);
  showMsg(
    '✦ MAZMORRA: LA FORTALEZA ABISMAL ✦\nExplora sus 3 alas, pasillos secretos y cavernas · Derrota al Shōgun de la Cripta',
    4.2
  );
}

export function exitDungeon(silent = false, targetPos?: THREE.Vector3) {
  if (!state.inDungeon) return;
  const completed = run.bossDefeated;
  clearDungeonEntities();
  state.inDungeon = false;
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
  player.face = Math.PI;
  state.yaw = 0;
  sam.root.position.copy(player.pos);
  sam.root.rotation.y = player.face;
  snapCamera();

  if (!silent) {
    const col = completed ? 0x52ffb4 : 0xa45eff;
    impactRing(player.pos, col, 4.6);
    burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.3, player.pos.z), col, 75, 6.8, 0.15);
    skyFlash(0.28);
    sfx.dash();
    sfx.chime(completed);
    showMsg(
      completed
        ? '✦ REGRESO AL MUNDO PRINCIPAL ✦\nHas conquistado La Fortaleza Abismal'
        : '✦ HAS SALIDO DE LA MAZMORRA ✦\nDe vuelta en El Claro del Santuario',
      3.0
    );
  }
}

export function resetDungeon() {
  if (state.inDungeon) {
    clearDungeonEntities();
    state.inDungeon = false;
    if (dungeonGroup) dungeonGroup.visible = false;
  }
  run.bossDefeated = false;
  run.returnPortalOpen = false;
  run.clearedRuns = 0;
}

// ------------------------------------------------------------ per-frame update & interaction
let nearPortal: 'enter' | 'retreat' | 'victory' | null = null;
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
    const d = Math.hypot(player.pos.x - OVERWORLD_PORTAL.x, player.pos.z - OVERWORLD_PORTAL.z);
    if (d < 3.6 && !state.dead) {
      nearPortal = 'enter';
      state.prompt = '[ E ] Cruzar el portal · Misión: Fortaleza Abismal';
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
          sfx.taiko(1.25);
          showMsg(`— ${KINDS.senorCripta.name.toUpperCase()} —\n¡El señor de la fortaleza te desafía!`, 3.4);
        }
      }
    }
  }

  const dRetreat = Math.hypot(player.pos.x - (OX + ENTRANCE_PORTAL_LOCAL.x), player.pos.z - (OZ + ENTRANCE_PORTAL_LOCAL.z));
  if (dRetreat < 3.4 && !state.dead) {
    nearPortal = 'retreat';
    state.prompt = '[ E ] Salir de la mazmorra · Volver al claro';
  }
  if (run.returnPortalOpen) {
    const dWin = Math.hypot(player.pos.x - (OX + VICTORY_PORTAL_LOCAL.x), player.pos.z - (OZ + VICTORY_PORTAL_LOCAL.z));
    if (dWin < 3.8 && !state.dead) {
      nearPortal = 'victory';
      state.prompt = '[ E ] Cruzar el Portal de Regreso al mundo principal';
    }
  }
}

export function tryUseDungeonPortal(): boolean {
  if (!state.playing || state.dead || state.menu || !nearPortal) return false;
  if (nearPortal === 'enter') {
    enterDungeon();
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
  const totalRooms = run.camps.length;
  const clearedRooms = run.camps.filter(c => c.roster.length === 0).length;
  const totalChests = run.chests.length;
  const openedChests = run.chests.filter(c => c.state === 'open').length;
  const remainingFoes = run.camps.reduce((sum, c) => sum + c.roster.length, 0);
  return {
    zone: dungeonZoneName(),
    clearedRooms,
    totalRooms,
    openedChests,
    totalChests,
    remainingFoes,
    bossDefeated: run.bossDefeated,
    returnPortalOpen: run.returnPortalOpen
  };
}

export function dungeonHud(): string {
  const s = dungeonStatus();
  if (!s) return '';
  const bar = '#'.repeat(s.clearedRooms) + '-'.repeat(Math.max(0, s.totalRooms - s.clearedRooms));
  const goal = s.returnPortalOpen
    ? '\n  <span class="jade">✦ portal de regreso abierto en el trono</span>'
    : `\n  <span class="r">jefe final:</span> Shōgun de la Cripta`;
  return `<span class="jade">MAZMORRA · FORTALEZA ABISMAL</span>\n` +
    `  salas [<span class="jade">${bar}</span>] ${s.clearedRooms}/${s.totalRooms}  <span class="y">cofres ${s.openedChests}/${s.totalChests}</span>${goal}\n`;
}

export function dungeonMapData() {
  return {
    ox: OX,
    oz: OZ,
    rects: DUNGEON_RECTS,
    chests: run.chests,
    entrancePortal: { x: OX + ENTRANCE_PORTAL_LOCAL.x, z: OZ + ENTRANCE_PORTAL_LOCAL.z },
    victoryPortal: run.returnPortalOpen ? { x: OX + VICTORY_PORTAL_LOCAL.x, z: OZ + VICTORY_PORTAL_LOCAL.z } : null
  };
}
