// Procedural textures, materials, and detailed architectural / cavern prop kits
// for La Fortaleza Abismal (dungeon.ts). Replaces naive flat boxes with weathered
// masonry, buttresses, vaulted archways, iron portcullises, sarcophagi, weapon racks,
// banners, glowing subterranean pools, layered rock cliffs, and faceted crystal spires.
import * as THREE from 'three';
import { M, CLS, tagMat } from './materials';

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, repeatX = 1, repeatY = 1, isBump = false) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.anisotropy = 4;
  if (!isBump) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ------------------------------------------------------------ Procedural Stone, Rock, Obsidian & Brocade Textures

function buildMasonrySet(seed: number, baseRgb: [number, number, number], mossChance: number) {
  const draw = (ctx: CanvasRenderingContext2D, s: number, bump: boolean) => {
    const r = seeded(seed);
    ctx.fillStyle = bump ? '#242424' : '#12131a';
    ctx.fillRect(0, 0, s, s);
    const rows = 6;
    const rowH = s / rows;
    for (let row = 0; row < rows; row++) {
      const y = row * rowH;
      const cols = 3 + (row % 2);
      const offset = (row % 2) * (s / cols) * 0.45;
      for (let col = -1; col <= cols; col++) {
        const w = s / cols;
        const x = col * w + offset;
        const pad = 3.2;
        const v = 0.72 + r() * 0.46;
        if (bump) {
          const g = Math.round(135 + r() * 95);
          ctx.fillStyle = `rgb(${g},${g},${g})`;
        } else {
          const cr = Math.min(255, Math.round(baseRgb[0] * v));
          const cg = Math.min(255, Math.round(baseRgb[1] * v));
          const cb = Math.min(255, Math.round(baseRgb[2] * v));
          ctx.fillStyle = `rgb(${cr},${cg},${cb})`;
        }
        ctx.fillRect(x + pad, y + pad, w - pad * 2, rowH - pad * 2);
        // Subtle bevel highlight on top/left and shadow on bottom
        ctx.fillStyle = bump ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.08)';
        ctx.fillRect(x + pad, y + pad, w - pad * 2, 3);
        ctx.fillStyle = bump ? 'rgba(0,0,0,0.32)' : 'rgba(0,0,0,0.22)';
        ctx.fillRect(x + pad, y + rowH - pad - 3, w - pad * 2, 3);
        // Weathering crack or damp moss patch
        if (!bump && r() < mossChance) {
          const mx = x + pad + r() * (w - 18);
          const my = y + rowH - pad - 8 - r() * 10;
          ctx.fillStyle = 'rgba(34, 68, 44, 0.48)';
          ctx.beginPath();
          ctx.ellipse(mx, my, 8 + r() * 12, 4 + r() * 6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        if (r() < 0.35) {
          ctx.strokeStyle = bump ? 'rgba(20,20,20,0.6)' : 'rgba(8,9,14,0.5)';
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          const cx = x + pad + r() * (w - pad * 2);
          const cy = y + pad + r() * (rowH - pad * 2);
          ctx.moveTo(cx, cy);
          ctx.lineTo(cx + (r() - 0.5) * 26, cy + (r() - 0.5) * 18);
          ctx.stroke();
        }
      }
    }
    // Fine stone grain speckles
    for (let i = 0; i < 420; i++) {
      const gx = r() * s, gy = r() * s, shade = r() < 0.5 ? 255 : 0;
      ctx.fillStyle = `rgba(${shade},${shade},${shade},${bump ? 0.08 : 0.06})`;
      ctx.fillRect(gx, gy, 2, 2);
    }
  };
  return {
    map: makeTex(256, (ctx, s) => draw(ctx, s, false), 1, 1, false),
    bump: makeTex(256, (ctx, s) => draw(ctx, s, true), 1, 1, true)
  };
}

function buildCaveRockSet(seed: number) {
  const draw = (ctx: CanvasRenderingContext2D, s: number, bump: boolean) => {
    const r = seeded(seed);
    ctx.fillStyle = bump ? '#707070' : '#262434';
    ctx.fillRect(0, 0, s, s);
    // Horizontal geological strata bands
    for (let i = 0; i < 18; i++) {
      const y = (i / 18) * s;
      const h = 10 + r() * 22;
      const v = 0.72 + r() * 0.52;
      ctx.fillStyle = bump
        ? `rgb(${Math.round(80 + r() * 115)},${Math.round(80 + r() * 115)},${Math.round(80 + r() * 115)})`
        : `rgb(${Math.round(46 * v)},${Math.round(44 * v)},${Math.round(62 * v)})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= s; x += 32) ctx.lineTo(x, y + (r() - 0.5) * 10);
      ctx.lineTo(s, y + h);
      ctx.lineTo(0, y + h);
      ctx.closePath();
      ctx.fill();
    }
    // Deep fractures & mineral glints
    for (let i = 0; i < 40; i++) {
      const x = r() * s, y = r() * s;
      ctx.strokeStyle = bump ? 'rgba(15,15,15,0.65)' : 'rgba(10,8,16,0.55)';
      ctx.lineWidth = 1.5 + r() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (r() - 0.5) * 48, y + (r() - 0.5) * 32);
      ctx.stroke();
    }
    if (!bump) {
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(92, 220, 255, 0.16)' : 'rgba(176, 102, 255, 0.16)';
        ctx.fillRect(r() * s, r() * s, 3 + r() * 5, 2 + r() * 3);
      }
    }
  };
  return {
    map: makeTex(256, (ctx, s) => draw(ctx, s, false), 1, 1, false),
    bump: makeTex(256, (ctx, s) => draw(ctx, s, true), 1, 1, true)
  };
}

function buildObsidianTileSet() {
  const draw = (ctx: CanvasRenderingContext2D, s: number, bump: boolean) => {
    const r = seeded(9091);
    ctx.fillStyle = bump ? '#222222' : '#0f0c18';
    ctx.fillRect(0, 0, s, s);
    const n = 4, step = s / n;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const x = i * step, y = j * step, v = 0.8 + r() * 0.35;
      ctx.fillStyle = bump ? `rgb(${Math.round(160 + r() * 60)},${Math.round(160 + r() * 60)},${Math.round(160 + r() * 60)})`
        : `rgb(${Math.round(32 * v)},${Math.round(25 * v)},${Math.round(48 * v)})`;
      ctx.fillRect(x + 3, y + 3, step - 6, step - 6);
      // Carved diamond rune inlay
      ctx.strokeStyle = bump ? '#606060' : 'rgba(164, 94, 255, 0.34)';
      ctx.lineWidth = 1.6;
      ctx.strokeRect(x + 8, y + 8, step - 16, step - 16);
    }
  };
  return {
    map: makeTex(256, (ctx, s) => draw(ctx, s, false), 1, 1, false),
    bump: makeTex(256, (ctx, s) => draw(ctx, s, true), 1, 1, true)
  };
}

function buildCarpetTex() {
  return makeTex(128, (ctx, s) => {
    ctx.fillStyle = '#68121e';
    ctx.fillRect(0, 0, s, s);
    // Gold woven borders along left & right
    ctx.fillStyle = '#c89b3c';
    ctx.fillRect(6, 0, 5, s);
    ctx.fillRect(s - 11, 0, 5, s);
    ctx.fillStyle = '#3b0910';
    ctx.fillRect(14, 0, 3, s);
    ctx.fillRect(s - 17, 0, 3, s);
    // Diamond brocade pattern down center
    ctx.strokeStyle = 'rgba(218, 174, 82, 0.42)';
    ctx.lineWidth = 2;
    for (let y = 0; y < s; y += 32) {
      ctx.beginPath();
      ctx.moveTo(s / 2, y + 4);
      ctx.lineTo(s / 2 + 18, y + 16);
      ctx.lineTo(s / 2, y + 28);
      ctx.lineTo(s / 2 - 18, y + 16);
      ctx.closePath();
      ctx.stroke();
    }
  }, 1, 3, false);
}

const castleWallTex = buildMasonrySet(401, [82, 86, 102], 0.35);
const castleFloorTex = buildMasonrySet(409, [66, 70, 84], 0.22);
const caveTex = buildCaveRockSet(523);
const obsidianTex = buildObsidianTileSet();
const carpetTex = buildCarpetTex();

export const DM = {
  stoneFloor: tagMat(M(0x8890a4, { map: castleFloorTex.map, bumpMap: castleFloorTex.bump, bumpScale: 0.08, roughness: 0.86, metalness: 0.06 }), CLS.ground),
  caveFloor: tagMat(M(0x7c7894, { map: caveTex.map, bumpMap: caveTex.bump, bumpScale: 0.14, roughness: 0.94, flatShading: true }), CLS.ground),
  bossFloor: tagMat(M(0x9a8cb8, { map: obsidianTex.map, bumpMap: obsidianTex.bump, bumpScale: 0.07, roughness: 0.56, metalness: 0.22 }), CLS.ground),
  castleWall: tagMat(M(0x9298ac, { map: castleWallTex.map, bumpMap: castleWallTex.bump, bumpScale: 0.12, roughness: 0.88 }), CLS.ground),
  castleTrim: tagMat(M(0x303342, { roughness: 0.72, metalness: 0.14 }), CLS.ground),
  obsidian: tagMat(M(0x1b172a, { roughness: 0.38, metalness: 0.38 }), CLS.ground),
  caveRock: tagMat(M(0x7a7692, { map: caveTex.map, bumpMap: caveTex.bump, bumpScale: 0.18, roughness: 0.96, flatShading: true }), CLS.ground),
  carpet: tagMat(M(0xd4b8b8, { map: carpetTex, roughness: 0.9 }), CLS.wood),
  bannerRed: tagMat(M(0x8e1922, { roughness: 0.88, side: THREE.DoubleSide }), CLS.wood),
  bannerViolet: tagMat(M(0x4a1d78, { roughness: 0.88, side: THREE.DoubleSide }), CLS.wood),
  wood: tagMat(M(0x4a3122, { roughness: 0.9 }), CLS.wood),
  iron: tagMat(M(0x2d303a, { metalness: 0.78, roughness: 0.38 }), CLS.wood),
  steel: tagMat(M(0x9ea8ba, { metalness: 0.85, roughness: 0.26 }), CLS.light),
  bone: tagMat(M(0xcfc6b2, { roughness: 0.78 }), CLS.wood),
  gold: tagMat(M(0xffcf5c, { emissive: 0x996814, emissiveIntensity: 0.85, metalness: 0.82, roughness: 0.24 }), CLS.light),
  flame: tagMat(M(0xffa03c, { emissive: 0xff6e14, emissiveIntensity: 2.7 }), CLS.light),
  violetFlame: tagMat(M(0xc66eff, { emissive: 0x8e2cff, emissiveIntensity: 2.6 }), CLS.light),
  crystalCyan: tagMat(new THREE.MeshPhysicalMaterial({ color: 0x52eeff, emissive: 0x16a4d6, emissiveIntensity: 1.55, roughness: 0.12, metalness: 0.22, clearcoat: 1, flatShading: true }), CLS.light),
  crystalViolet: tagMat(new THREE.MeshPhysicalMaterial({ color: 0xbe6aff, emissive: 0x6f24cf, emissiveIntensity: 1.55, roughness: 0.12, metalness: 0.22, clearcoat: 1, flatShading: true }), CLS.light),
  glowPool: tagMat(new THREE.MeshBasicMaterial({ color: 0x26d8f2, transparent: true, opacity: 0.62, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.water),
  web: tagMat(new THREE.MeshBasicMaterial({ color: 0xd8dce8, transparent: true, opacity: 0.26, side: THREE.DoubleSide, depthWrite: false }), CLS.fx),
  chasm: tagMat(M(0x05040b, { roughness: 1 }), CLS.ground)
};

// ------------------------------------------------------------ Reusable Detailed Prop Builders

export interface LightSpec {
  x: number; y: number; z: number;
  color: number; intensity: number; distance: number; decay: number;
}
export type ColliderSpec = { rect: [number, number, number, number] } | { x: number; z: number; r: number };

export function addPropBox(
  parent: THREE.Object3D,
  w: number, h: number, d: number,
  mat: THREE.Material,
  lx: number, y: number, lz: number,
  cast = true
) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(lx, y + h / 2, lz);
  m.castShadow = cast;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

/** Detailed feudal-gothic castle wall segment with stepped plinth, buttress pilasters, and crenellated cornice. */
export function buildCastleWallSeg(
  parent: THREE.Object3D,
  lx: number, y0: number, lz: number,
  len: number, thickness: number, height: number,
  alongZ: boolean
) {
  const w = alongZ ? thickness : len;
  const d = alongZ ? len : thickness;
  // Base plinth
  addPropBox(parent, w + 0.16, 0.42, d + 0.16, DM.castleTrim, lx, y0, lz, false);
  // Main weathered masonry body
  addPropBox(parent, w, height, d, DM.castleWall, lx, y0 + 0.28, lz, height > 1.8);
  // Top cornice cap
  addPropBox(parent, w + 0.22, 0.28, d + 0.22, DM.castleTrim, lx, y0 + 0.28 + height, lz, false);

  // If tall wall, add stone buttress pilaster + battlements
  if (height >= 3.0) {
    const bw = alongZ ? thickness + 0.45 : 0.72;
    const bd = alongZ ? 0.72 : thickness + 0.45;
    addPropBox(parent, bw, height + 0.35, bd, DM.castleTrim, lx, y0, lz, true);
    // Merlon crenellation tooth on top
    const mw = alongZ ? thickness * 0.85 : len * 0.36;
    const md = alongZ ? len * 0.36 : thickness * 0.85;
    addPropBox(parent, mw, 0.52, md, DM.castleWall, lx, y0 + 0.56 + height, lz, false);
  }
}

/** Organic layered cavern rock cliff wall segment (replaces flat boxes in caves). */
export function buildCaveWallSeg(
  parent: THREE.Object3D,
  lx: number, y0: number, lz: number,
  len: number, thickness: number, height: number,
  alongZ: boolean,
  seed: number
) {
  const r = seeded(seed);
  const w = alongZ ? thickness : len;
  const d = alongZ ? len : thickness;
  // Core rock cliff backing (ensures visual continuity with collider)
  addPropBox(parent, w, height * 0.86, d, DM.caveRock, lx, y0, lz, height > 1.8);
  // Layered craggy rock outcrops protruding organically
  const clusters = height > 2.2 ? 3 : 2;
  for (let i = 0; i < clusters; i++) {
    const t = (i / Math.max(1, clusters - 1) - 0.5) * (len * 0.62);
    const ox = lx + (alongZ ? (r() - 0.5) * 0.65 : t);
    const oz = lz + (alongZ ? t : (r() - 0.5) * 0.65);
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(1, 0), DM.caveRock);
    const rx = 1.05 + r() * 0.75;
    const ry = (height * (0.45 + r() * 0.48)) * 0.65;
    const rz = 1.05 + r() * 0.75;
    rock.scale.set(rx, ry, rz);
    rock.position.set(ox, y0 + ry * 0.75, oz);
    rock.rotation.set(r() * 0.6, r() * 3.14, r() * 0.5);
    rock.castShadow = height > 1.8;
    rock.receiveShadow = true;
    parent.add(rock);
  }
}

/** Carved stone castle archway with keystone lintel and raised iron portcullis teeth. */
export function buildStoneArchway(
  parent: THREE.Object3D,
  lx: number, y0: number, lz: number,
  span: number, alongZ: boolean,
  obsidian = false
) {
  const g = new THREE.Group();
  g.position.set(lx, y0, lz);
  if (alongZ) g.rotation.y = Math.PI / 2;
  parent.add(g);

  const mainMat = obsidian ? DM.obsidian : DM.castleWall;
  const trimMat = obsidian ? DM.gold : DM.castleTrim;
  const half = span / 2;
  const H = 4.6;

  // Massive jamb pillars
  for (const sx of [-1, 1]) {
    addPropBox(g, 0.95, 0.5, 1.35, trimMat, sx * half, 0, 0, false);
    addPropBox(g, 0.78, H, 1.15, mainMat, sx * half, 0.45, 0, true);
    addPropBox(g, 1.05, 0.4, 1.4, trimMat, sx * half, H + 0.35, 0, true);
  }
  // Heavy lintel + keystone + corbels
  addPropBox(g, span + 1.4, 0.85, 1.35, mainMat, 0, H + 0.65, 0, true);
  addPropBox(g, 0.9, 1.15, 1.55, trimMat, 0, H + 0.52, 0, true);
  // Raised iron portcullis spikes hanging under the lintel
  const bars = Math.max(4, Math.floor(span * 1.4));
  for (let i = 0; i < bars; i++) {
    const bx = -half + 0.65 + (i / Math.max(1, bars - 1)) * (span - 1.3);
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 1.05, 6), DM.iron);
    bar.position.set(bx, H + 0.25, 0); g.add(bar);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.28, 4), DM.iron);
    tip.rotation.x = Math.PI; tip.position.set(bx, H - 0.35, 0); g.add(tip);
  }
}

/** Ornate iron brazier stand with glowing embers and layered flame. */
export function buildBrazier(
  parent: THREE.Object3D,
  lx: number, y0: number, lz: number,
  ox: number, oz: number,
  lights: LightSpec[],
  violet = false
) {
  const g = new THREE.Group();
  g.position.set(lx, y0, lz);
  parent.add(g);

  // Stone pedestal + tripod iron stand + riveted fire bowl
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 0.32, 8), DM.castleTrim);
  base.position.y = 0.16; g.add(base);
  const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.10, 0.16, 1.1, 7), DM.iron);
  stem.position.y = 0.85; g.add(stem);
  const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.22, 0.34, 8), DM.iron);
  bowl.position.y = 1.48; g.add(bowl);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 12), DM.iron);
  rim.rotation.x = Math.PI / 2; rim.position.y = 1.64; g.add(rim);

  const flMat = violet ? DM.violetFlame : DM.flame;
  const fl = new THREE.Mesh(new THREE.OctahedronGeometry(0.26), flMat);
  fl.position.y = 1.88; fl.scale.set(0.95, 1.55, 0.95); g.add(fl);
  const fl2 = new THREE.Mesh(new THREE.OctahedronGeometry(0.16), DM.gold);
  fl2.position.set(0.06, 1.98, -0.05); fl2.scale.set(0.7, 1.4, 0.7); g.add(fl2);

  lights.push({
    x: ox + lx, y: y0 + 2.25, z: oz + lz,
    color: violet ? 0xba5eff : 0xff8d36,
    intensity: violet ? 6.4 : 6.0,
    distance: 16, decay: 1.4
  });
}

/** Faceted crystal spire cluster with dark rock cradle. */
export function buildCrystalSpire(
  parent: THREE.Object3D,
  lx: number, y0: number, lz: number,
  ox: number, oz: number,
  lights: LightSpec[],
  cyan = true,
  scale = 1,
  withLight = true
) {
  const g = new THREE.Group();
  g.position.set(lx, y0, lz);
  parent.add(g);

  // Rock cradle at base
  const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(0.55 * scale, 0), DM.caveRock);
  rock.scale.set(1.2, 0.55, 1.1); rock.position.y = 0.2 * scale; g.add(rock);

  const mat = cyan ? DM.crystalCyan : DM.crystalViolet;
  const shards: [number, number, number, number, number, number][] = [
    [0, 1.25, 0, 0.30, 2.5, 0.08],
    [0.38, 0.85, 0.22, 0.22, 1.7, -0.28],
    [-0.35, 0.75, -0.20, 0.19, 1.5, 0.30],
    [0.16, 0.58, -0.36, 0.16, 1.2, 0.22],
    [-0.22, 0.52, 0.34, 0.14, 1.0, -0.24]
  ];
  for (const [cx, cy, cz, r, h, tilt] of shards) {
    const m = new THREE.Mesh(new THREE.ConeGeometry(r * scale, h * scale, 5), mat);
    m.position.set(cx * scale, cy * scale, cz * scale);
    m.rotation.set(tilt, cx * 5, -tilt * 0.85);
    g.add(m);
  }
  if (withLight) {
    lights.push({
      x: ox + lx, y: y0 + 1.7 * scale, z: oz + lz,
      color: cyan ? 0x4aeaff : 0xb45cff,
      intensity: 5.8, distance: 16, decay: 1.4
    });
  }
}

/** Fluted stone/obsidian fortress column with stepped base and capital. */
export function buildColumn(
  parent: THREE.Object3D,
  lx: number, y0: number, lz: number,
  ox: number, oz: number,
  colliders: ColliderSpec[],
  h: number, r: number,
  obsidian = false
) {
  const mat = obsidian ? DM.obsidian : DM.castleWall;
  const trim = obsidian ? DM.gold : DM.castleTrim;
  addPropBox(parent, r * 2.5, 0.42, r * 2.5, DM.castleTrim, lx, y0, lz, false);
  addPropBox(parent, r * 2.1, 0.32, r * 2.1, trim, lx, y0 + 0.42, lz, false);
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.88, r * 1.0, h, 8), mat);
  shaft.position.set(lx, y0 + 0.74 + h / 2, lz);
  shaft.castShadow = shaft.receiveShadow = true;
  parent.add(shaft);
  addPropBox(parent, r * 2.4, 0.42, r * 2.4, DM.castleTrim, lx, y0 + 0.74 + h, lz, true);
  colliders.push({ x: ox + lx, z: oz + lz, r: r * 1.2 });
}

/** Carved stone sarcophagus for crypts & dungeons. */
export function buildSarcophagus(
  parent: THREE.Object3D,
  lx: number, y0: number, lz: number,
  ry: number,
  ox: number, oz: number,
  colliders: ColliderSpec[]
) {
  const g = new THREE.Group();
  g.position.set(lx, y0, lz);
  g.rotation.y = ry;
  parent.add(g);
  addPropBox(g, 1.55, 0.25, 2.75, DM.castleTrim, 0, 0, 0, false);
  addPropBox(g, 1.32, 0.72, 2.48, DM.castleWall, 0, 0.25, 0, true);
  addPropBox(g, 1.44, 0.20, 2.60, DM.castleTrim, 0, 0.97, 0, true);
  // Decorative gold crest on lid
  addPropBox(g, 0.22, 0.06, 1.3, DM.gold, 0, 1.17, 0, false);
  addPropBox(g, 0.75, 0.06, 0.22, DM.gold, 0, 1.17, -0.35, false);
  colliders.push({ x: ox + lx, z: oz + lz, r: 1.25 });
}

/** Hanging feudal war banner on a vertical pole. */
export function buildBannerStand(parent: THREE.Object3D, lx: number, y0: number, lz: number, ry: number, violet = false) {
  const g = new THREE.Group();
  g.position.set(lx, y0, lz);
  g.rotation.y = ry;
  parent.add(g);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.8, 6), DM.iron);
  pole.position.y = 1.9; g.add(pole);
  const cross = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.25, 6), DM.gold);
  cross.rotation.z = Math.PI / 2; cross.position.y = 3.55; g.add(cross);
  const cloth = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 2.35), violet ? DM.bannerViolet : DM.bannerRed);
  cloth.position.set(0, 2.32, 0.06); g.add(cloth);
  const crest = new THREE.Mesh(new THREE.RingGeometry(0.18, 0.28, 12), DM.gold);
  crest.position.set(0, 2.55, 0.08); g.add(crest);
}

/** Medieval-feudal weapon rack for the Abandoned Armory. */
export function buildWeaponRack(parent: THREE.Object3D, lx: number, y0: number, lz: number, ry: number) {
  const g = new THREE.Group();
  g.position.set(lx, y0, lz);
  g.rotation.y = ry;
  parent.add(g);
  for (const sx of [-0.85, 0.85]) addPropBox(g, 0.14, 1.6, 0.55, DM.wood, sx, 0, 0, true);
  addPropBox(g, 1.9, 0.12, 0.14, DM.wood, 0, 0.45, 0, false);
  addPropBox(g, 1.9, 0.12, 0.14, DM.wood, 0, 1.28, 0, false);
  for (let i = 0; i < 4; i++) {
    const x = -0.58 + i * 0.38;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.8, 6), DM.wood);
    shaft.position.set(x, 1.0, 0.04); shaft.rotation.x = 0.08; g.add(shaft);
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.65, 0.02), DM.steel);
    blade.position.set(x, 1.85, 0.08); g.add(blade);
  }
}

/** Glowing subterranean crystal/mana pool in cave chambers. */
export function buildGlowingPool(parent: THREE.Object3D, lx: number, y0: number, lz: number, rx: number, rz: number) {
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 24), DM.glowPool);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(rx, rz, 1);
  pool.position.set(lx, y0 + 0.05, lz);
  parent.add(pool);
  // Rocky rim pebbles
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const p = new THREE.Mesh(new THREE.DodecahedronGeometry(0.32 + (i % 3) * 0.12, 0), DM.caveRock);
    p.position.set(lx + Math.cos(a) * rx * 1.02, y0 + 0.12, lz + Math.sin(a) * rz * 1.02);
    p.scale.set(1.2, 0.55, 1.1);
    parent.add(p);
  }
}

/** Cobweb drapes for the Spider Nest cavern. */
export function buildCobweb(parent: THREE.Object3D, lx: number, y0: number, lz: number, ry: number, scale = 1.6) {
  const web = new THREE.Mesh(new THREE.CircleGeometry(scale, 7, 0, Math.PI * 0.65), DM.web);
  web.position.set(lx, y0 + scale * 0.72, lz);
  web.rotation.y = ry;
  parent.add(web);
}
