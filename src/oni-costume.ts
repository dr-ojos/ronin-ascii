import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TessellateModifier } from 'three/addons/modifiers/TessellateModifier.js';
import { grp, mesh, openCyl } from './samurai';

export interface OniLook {
  big: boolean;
  tint: number;
  mask: number;
  eye?: number;
  weapon: 'club' | 'spear' | 'bow' | 'bigclub' | 'sword' | 'staff' | 'scythe' | 'drum';
  shield?: boolean;
  plated?: boolean;
  crest?: 'crescent' | 'feathers' | 'halo' | 'horns' | 'flames' | 'antlers';
  tengu?: boolean;
  /** iron spikes on the shoulder plates (the great bosses) */
  spikes?: boolean;
  /** a third, glowing eye on the brow */
  thirdEye?: boolean;
  /** colossal event-boss regalia: layered ō-yoroi, glowing core & grand proportions */
  colossal?: boolean;
  /** mythic imperial crown for colossal calamity bosses */
  crown?: 'eclipse' | 'solar' | 'tempest';
  /** iconic ring of floating taiko storm-drums arched behind the shoulders */
  drums?: boolean;
  /** regal tattered warlord back banners / jimbaori strips */
  cape?: boolean;
}

const TAU = Math.PI * 2;
type XYZ = [number, number, number];

// High-resolution procedural PBR bump map: fine urushi lacquer woodgrain, hammered metal & micro-scratches
const lacquerBump = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 2) {
    const v = 122 + Math.round(Math.sin(y * 0.27) * 8 + Math.sin(y * 0.09) * 5);
    ctx.fillStyle = `rgb(${v},${v},${v})`; ctx.fillRect(0, y, 256, 2);
  }
  // hammered dimples & fine battle wear
  for (let i = 0; i < 180; i++) {
    const x = (i * 73) % 256, y = (i * 137) % 256, r = 4 + (i % 7);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, i % 2 ? 'rgba(205,205,205,0.22)' : 'rgba(55,55,55,0.24)');
    g.addColorStop(1, 'rgba(128,128,128,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.strokeStyle = 'rgba(42,42,42,0.32)'; ctx.lineWidth = 1;
  for (let i = 0; i < 36; i++) {
    const x = (i * 59) % 256, y = (i * 97) % 256;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 14 + (i % 18), y + ((i % 3) - 1) * 5); ctx.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 4;
  return tex;
})();

// High-resolution Japanese imperial brocade (kikko hexagonal & gold-threaded damask) for robes & capes
const [brocadeTex, brocadeBump] = (() => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 256;
  const ctx = c.getContext('2d')!;
  const b = document.createElement('canvas'); b.width = 256; b.height = 256;
  const bctx = b.getContext('2d')!;
  ctx.fillStyle = '#c8c4be'; ctx.fillRect(0, 0, 256, 256);
  bctx.fillStyle = '#787878'; bctx.fillRect(0, 0, 256, 256);
  // fine woven silk warp/weft
  for (let i = 0; i < 256; i += 4) {
    ctx.fillStyle = i % 8 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.07)';
    ctx.fillRect(0, i, 256, 1.5); ctx.fillRect(i, 0, 1.5, 256);
    bctx.fillStyle = i % 8 ? 'rgba(170,170,170,0.18)' : 'rgba(90,90,90,0.18)';
    bctx.fillRect(0, i, 256, 1.5);
  }
  // traditional diamond-kikko gilded motif
  const step = 32;
  ctx.strokeStyle = 'rgba(242,216,152,0.52)'; ctx.lineWidth = 1.6;
  bctx.strokeStyle = 'rgba(235,235,235,0.55)'; bctx.lineWidth = 2;
  for (let y = -step; y < 256 + step; y += step) {
    for (let x = -step; x < 256 + step; x += step) {
      const ox = x + ((Math.round(y / step) & 1) ? step * 0.5 : 0);
      for (const g of [ctx, bctx]) {
        g.beginPath();
        g.moveTo(ox, y - 12); g.lineTo(ox + 12, y); g.lineTo(ox, y + 12); g.lineTo(ox - 12, y); g.closePath();
        g.stroke();
      }
      ctx.fillStyle = 'rgba(255,228,162,0.42)';
      ctx.beginPath(); ctx.arc(ox, y, 2.4, 0, TAU); ctx.fill();
      bctx.fillStyle = 'rgba(245,245,245,0.65)';
      bctx.beginPath(); bctx.arc(ox, y, 2.8, 0, TAU); bctx.fill();
    }
  }
  const color = new THREE.CanvasTexture(c); color.colorSpace = THREE.SRGBColorSpace;
  color.wrapS = color.wrapT = THREE.RepeatWrapping; color.repeat.set(2, 2); color.anisotropy = 4;
  const bump = new THREE.CanvasTexture(b);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping; bump.repeat.set(2, 2); bump.anisotropy = 4;
  return [color, bump] as const;
})();

const bone = new THREE.MeshStandardMaterial({ color: 0xd4c6ad, roughness: 0.52, bumpMap: lacquerBump, bumpScale: 0.006 });
const iron = new THREE.MeshPhysicalMaterial({ color: 0x3b4048, metalness: 0.82, roughness: 0.34, clearcoat: 0.28, bumpMap: lacquerBump, bumpScale: 0.009 });
const brass = new THREE.MeshPhysicalMaterial({ color: 0xcfa95c, metalness: 0.86, roughness: 0.26, clearcoat: 0.5, clearcoatRoughness: 0.2, bumpMap: lacquerBump, bumpScale: 0.007 });
const cord = new THREE.MeshStandardMaterial({ color: 0x9b8768, roughness: 0.92, bumpMap: brocadeBump, bumpScale: 0.005 });
const recess = new THREE.MeshStandardMaterial({ color: 0x100c10, roughness: 0.86 });
const stud = new THREE.SphereGeometry(0.009, 6, 4);
const tessellate = new TessellateModifier(0.013, 5);

const masks = new Map<number, THREE.MeshPhysicalMaterial>();
const eyes = new Map<number, THREE.MeshBasicMaterial>();
export function oniMask(color: number) {
  let material = masks.get(color);
  if (!material) {
    material = new THREE.MeshPhysicalMaterial({
      color, clearcoat: 0.72, roughness: 0.36, metalness: 0.14, clearcoatRoughness: 0.18,
      bumpMap: lacquerBump, bumpScale: 0.008
    });
    masks.set(color, material);
  }
  return material;
}

export function oniEye(color: number) {
  let material = eyes.get(color);
  if (!material) {
    material = new THREE.MeshBasicMaterial({ color });
    eyes.set(color, material);
  }
  return material;
}

function taper(points: XYZ[], radius: number, endRadius: number) {
  const path = new THREE.CatmullRomCurve3(points.map(point => new THREE.Vector3(...point)));
  const sides = 8, steps = 12, geometry = new THREE.TubeGeometry(path, steps, radius, sides);
  const pos = geometry.attributes.position;
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, center = path.getPointAt(t);
    const r = THREE.MathUtils.lerp(1, endRadius / radius, Math.pow(t, 0.74));
    for (let j = 0; j <= sides; j++) {
      const k = i * (sides + 1) + j;
      pos.setXYZ(k, center.x + (pos.getX(k) - center.x) * r, center.y + (pos.getY(k) - center.y) * r, center.z + (pos.getZ(k) - center.z) * r);
    }
  }
  geometry.computeVertexNormals();
  return geometry;
}

// Three-dimensional front of the carved mask. The deeper bridge and raised cheekbones catch
// a side light, while the eye slits and the mouth remain readable at the normal playing distance.
const maskRows = [
  [-0.111, 0.033, 0.093], [-0.092, 0.061, 0.121], [-0.059, 0.085, 0.128],
  [-0.029, 0.100, 0.123], [0.001, 0.108, 0.116], [0.027, 0.105, 0.112],
  [0.056, 0.11, 0.121], [0.082, 0.099, 0.112], [0.105, 0.070, 0.089], [0.114, 0.028, 0.075]
];

function section(y: number) {
  const index = maskRows.findIndex(row => row[0] >= y);
  const hi = Math.max(1, index < 0 ? maskRows.length - 1 : index);
  const [ya, wa, a] = maskRows[hi - 1], [yb, wb, b] = maskRows[hi];
  const t = THREE.MathUtils.clamp((y - ya) / (yb - ya), 0, 1);
  return [THREE.MathUtils.lerp(wa, wb, t), THREE.MathUtils.lerp(a, b, t)];
}

function relief(x: number, y: number, [width, depth] = section(y)) {
  const u = x / width;
  const z = depth - 0.062 * u * u;
  const brow = 0.014 * Math.exp(-(((Math.abs(x) - 0.052) / 0.034) ** 2 + ((y - 0.049) / 0.021) ** 2));
  const cheek = 0.016 * Math.exp(-(((Math.abs(x) - 0.070) / 0.024) ** 2 + ((y + 0.012) / 0.019) ** 2));
  const nose = 0.041 * Math.exp(-((x / 0.021) ** 2 + ((y - 0.013) / 0.036) ** 2));
  return z + brow + cheek + nose;
}

function frontMask() {
  const g = new THREE.PlaneGeometry(2, 1, 24, 28);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = THREE.MathUtils.lerp(-0.111, 0.114, p.getY(i) + 0.5);
    const row = section(y), x = p.getX(i) * row[0];
    p.setXYZ(i, x, y, relief(x, y, row));
  }
  g.computeVertexNormals();
  return g;
}

function inlay(g: THREE.Group, material: THREE.Material, points: [number, number][], lift: number) {
  const shape = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const flat = new THREE.ShapeGeometry(shape);
  const geo = tessellate.modify(flat);
  flat.dispose();
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, relief(p.getX(i), p.getY(i)) + lift);
  geo.computeVertexNormals();
  mesh(geo, material, g);
}

const coat = (look: OniLook) => new THREE.MeshStandardMaterial({
  color: new THREE.Color(look.tint).lerp(new THREE.Color(look.mask), 0.24),
  map: look.big || look.colossal || look.cape ? brocadeTex : undefined,
  bumpMap: look.big || look.colossal || look.cape ? brocadeBump : undefined,
  bumpScale: 0.012,
  side: THREE.DoubleSide, roughness: 0.82, metalness: look.colossal ? 0.14 : 0.04
});

function carveHead(look: OniLook, mask: THREE.Material, eye: THREE.Material, cloth: THREE.Material, bright: THREE.Material) {
  const g = new THREE.Group(), heavy = look.big && look.weapon === 'bigclub';
  const conical = look.weapon === 'bow' && !look.tengu;
  const helmet = look.weapon === 'spear' || look.shield || look.plated || look.crest === 'crescent';
  const hood = !helmet && (look.weapon === 'sword' || look.weapon === 'scythe' || look.weapon === 'staff');

  const skull = mesh(new THREE.SphereGeometry(1, 18, 12), hood ? cloth : recess, g, 0, 0.004, -0.022);
  skull.scale.set(0.106, 0.123, 0.115);
  mesh(frontMask(), mask, g);
  for (const side of [-1, 1]) {
    const patch = (material: THREE.Material, points: [number, number][], z: number) =>
      inlay(g, material, points.map(([x, y]) => [x * side, y]), z);
    patch(recess, [[0.024, 0.023], [0.051, 0.045], [0.092, 0.036], [0.071, 0.016], [0.039, 0.012]], 0.006);
    patch(eye, [[0.033, 0.025], [0.058, 0.032], [0.079, 0.03], [0.066, 0.023], [0.042, 0.02]], 0.013);
    patch(bright, [[0.018, 0.044], [0.055, 0.063], [0.093, 0.052], [0.082, 0.046], [0.05, 0.053]], 0.006);
    patch(iron, [[0.044, -0.024], [0.093, 0.004], [0.085, -0.035], [0.059, -0.075], [0.067, -0.04]], 0.009);
    if (!look.tengu && !helmet && !conical && !hood) {
      mesh(taper([[0.074 * side, 0.079, 0.043], [0.119 * side, 0.15, 0.032],
        [(heavy ? 0.186 : 0.135) * side, 0.218, 0.016], [(heavy ? 0.212 : 0.14) * side, heavy ? 0.281 : 0.242, -0.057]], heavy ? 0.034 : 0.024, 0.001), bone, g);
    }
  }
  inlay(g, recess, [[-0.054, -0.07], [-0.037, -0.037], [0, -0.049], [0.037, -0.037], [0.054, -0.07], [0, -0.089]], 0.009);
  if (look.tengu) {
    mesh(taper([[0, 0.032, 0.12], [0, 0.017, 0.163], [0, -0.001, 0.213], [0, -0.043, 0.246]],
      0.042, 0.004), mask, g);
    mesh(taper([[0, -0.037, 0.116], [0, -0.037, 0.171], [0, -0.049, 0.212]], 0.027, 0.003), bright, g);
  } else if (!helmet && !conical && !hood) {
    for (const side of [-1, 1]) {
      mesh(taper([[side * 0.043, -0.056, 0.119], [side * 0.037, -0.075, 0.131], [side * 0.031, -0.091, 0.126]], 0.01, 0.001), bone, g);
      mesh(taper([[side * 0.018, -0.081, 0.133], [side * 0.017, -0.06, 0.14]], 0.006, 0.001), bone, g);
    }
  }

  if (conical) {
    const hat = mesh(new THREE.CylinderGeometry(0.042, 0.194, 0.11, 20), cloth, g, 0, 0.099, 0.004);
    hat.rotation.x = -0.11;
    const brim = mesh(new THREE.TorusGeometry(0.194, 0.012, 5, 24), iron, g, 0, 0.046, -0.002);
    brim.rotation.set(Math.PI / 2 - 0.11, 0, 0);
    mesh(new THREE.OctahedronGeometry(0.032), brass, g, 0, 0.1, 0.119).scale.set(0.84, 0.8, 0.25);
  } else if (helmet || hood) {
    const dome = mesh(new THREE.SphereGeometry(1, 20, 10, 0, TAU, 0, 1.58), helmet ? iron : cloth, g, 0, 0.046, -0.011);
    dome.scale.set(0.119, 0.105, 0.128);
    const rows = helmet ? 3 : 1;
    for (let i = 0; i < rows; i++) {
      const edge = 0.126 + 0.016 * i, height = helmet ? 0.039 : 0.18;
      mesh(openCyl(edge, edge * 1.12, height, 1.03, TAU - 2.06, 20), helmet ? bright : cloth, g, 0, 0.037 - i * 0.034 - height * 0.49, -0.01);
    }
    if (helmet) {
      mesh(openCyl(0.125, 0.163, 0.027, -1.16, 2.32, 16), iron, g, 0, 0.062, 0.004);
      for (const side of [-1, 1]) mesh(stud, brass, g, side * 0.072, 0.077, 0.12);
    } else {
      mesh(taper([[-0.11, -0.06, -0.025], [-0.12, 0.005, 0.061], [-0.067, 0.078, 0.096], [0, 0.102, 0.103]], 0.021, 0.012), cloth, g);
      mesh(taper([[0.11, -0.06, -0.025], [0.12, 0.005, 0.061], [0.067, 0.078, 0.096], [0, 0.102, 0.103]], 0.021, 0.012), cloth, g);
    }
  } else if (!look.tengu) {
    for (let i = -2; i <= 2; i++) {
      mesh(taper([[i * 0.04, 0.08, -0.055], [i * 0.062, -0.025, -0.103], [i * 0.058, -0.13 - 0.02 * Math.cos(i), -0.112]],
        0.027, 0.003), cloth, g);
    }
  }

  if (look.crest === 'crescent') {
    mesh(taper([[0, 0.081, 0.104], [0, 0.121, 0.122], [0, 0.155, 0.126]], 0.025, 0.016), brass, g);
    const moon = new THREE.Shape();
    moon.moveTo(-0.182, 0.104);
    moon.quadraticCurveTo(0, -0.113, 0.182, 0.104);
    moon.quadraticCurveTo(0, -0.026, -0.182, 0.104);
    mesh(new THREE.ExtrudeGeometry(moon, { depth: 0.012, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 }), brass, g, 0, 0.149, 0.122);
  }
  if (look.crest === 'feathers' || look.tengu) for (const side of [-1, 1]) {
    for (let i = 0; i < 4; i++) {
      const end = 0.16 + i * 0.037;
      const feather = mesh(taper([[side * 0.07, 0.01, -0.063], [side * (end - 0.04), 0.146 - i * 0.019, -0.074],
        [side * end, 0.271 - i * 0.052, -0.092]], 0.034, 0.001), i % 2 ? cloth : bright, g);
      feather.scale.z = 0.73;
    }
  }
  if (look.crest === 'halo') {
    const r = heavy ? 0.249 : 0.178;
    mesh(new THREE.TorusGeometry(r, 0.014, 6, 32), brass, g, 0, 0.147, -0.147);
    for (let i = 0; i < 7; i++) {
      const a = i * TAU / 7;
      mesh(new THREE.OctahedronGeometry(0.029), i % 2 ? bright : eye, g, Math.sin(a) * r, 0.147 + Math.cos(a) * r, -0.147).rotation.z = -a;
    }
  }
  if (look.crest === 'horns') for (const side of [-1, 1]) {
    // great ox horns sweeping out and up, bound with a brass ring at the root
    mesh(taper([[side * 0.075, 0.07, -0.01], [side * 0.2, 0.11, 0], [side * 0.3, 0.25, 0.04], [side * 0.28, 0.43, 0.09]], 0.05, 0.002), bone, g);
    mesh(new THREE.TorusGeometry(0.045, 0.011, 6, 14), brass, g, side * 0.11, 0.085, -0.006).rotation.y = Math.PI / 2;
  }
  if (look.crest === 'flames') for (let i = 0; i < 9; i++) {
    // a crown of tall tongues of fire (or ice) behind the brow, tallest in the middle
    const a = (i - 4) * 0.32, x = Math.sin(a) * 0.13, z = Math.cos(a) * 0.05 - 0.06, h = 0.2 + 0.16 * (1 - Math.abs(i - 4) / 4);
    mesh(taper([[x, 0.07, z], [x * 1.25, 0.07 + h * 0.45, z - 0.01], [x * 1.1 + Math.sin(i * 2.3) * 0.03, 0.07 + h, z - 0.03]], 0.03, 0.001), i % 2 ? bright : eye, g);
  }
  if (look.crest === 'antlers') for (const side of [-1, 1]) {
    // branching antlers of a forest lord
    const beam: XYZ[] = [[side * 0.07, 0.09, -0.03], [side * 0.16, 0.22, -0.05], [side * 0.22, 0.38, -0.04], [side * 0.26, 0.54, -0.07]];
    mesh(taper(beam, 0.024, 0.004), bone, g);
    mesh(taper([beam[1], [side * 0.13, 0.31, 0.03], [side * 0.11, 0.38, 0.05]], 0.014, 0.002), bone, g);
    mesh(taper([beam[2], [side * 0.3, 0.45, -0.02], [side * 0.36, 0.5, -0.01]], 0.013, 0.002), bone, g);
    mesh(taper([[side * 0.235, 0.44, -0.05], [side * 0.19, 0.52, -0.04], [side * 0.17, 0.58, -0.05]], 0.011, 0.002), bone, g);
  }
  if (look.thirdEye) inlay(g, eye, [[0, 0.052], [0.013, 0.073], [0, 0.094], [-0.013, 0.073]], 0.017);
  if (look.crown === 'eclipse') {
    // towering blood-moon eclipse crown: twin obsidian-gold horns + double crescent ring + floating diamond sigils
    for (const side of [-1, 1]) {
      mesh(taper([[side * 0.078, 0.075, -0.01], [side * 0.22, 0.14, 0.02], [side * 0.34, 0.31, 0.05], [side * 0.30, 0.52, 0.02]], 0.048, 0.002), iron, g);
      mesh(new THREE.TorusGeometry(0.046, 0.011, 6, 14), brass, g, side * 0.13, 0.10, 0.0).rotation.y = Math.PI / 2;
      mesh(new THREE.OctahedronGeometry(0.032), eye, g, side * 0.27, 0.36, -0.08).scale.set(0.65, 1.35, 0.5);
    }
    mesh(new THREE.TorusGeometry(0.28, 0.016, 8, 36), brass, g, 0, 0.23, -0.15);
    mesh(new THREE.TorusGeometry(0.21, 0.009, 6, 32), eye, g, 0, 0.23, -0.155);
    mesh(new THREE.OctahedronGeometry(0.048), eye, g, 0, 0.23, -0.15).scale.set(0.75, 1.4, 0.4);
  }
  if (look.crown === 'tempest') {
    // storm-god crest: sweeping forked lightning horns + feathered storm-wings behind the kabuto
    for (const side of [-1, 1]) {
      mesh(taper([[side * 0.06, 0.09, 0.07], [side * 0.15, 0.20, 0.09], [side * 0.11, 0.31, 0.08], [side * 0.23, 0.46, 0.10]], 0.028, 0.003), brass, g);
      mesh(taper([[side * 0.15, 0.20, 0.09], [side * 0.24, 0.25, 0.08], [side * 0.31, 0.34, 0.07]], 0.018, 0.002), eye, g);
      for (let i = 0; i < 5; i++) {
        const end = 0.19 + i * 0.042;
        const wing = mesh(taper([[side * 0.08, 0.03, -0.07], [side * (end - 0.04), 0.19 - i * 0.022, -0.09],
          [side * end, 0.34 - i * 0.058, -0.11]], 0.038, 0.001), i % 2 ? eye : bright, g);
        wing.scale.z = 0.65;
      }
    }
    mesh(new THREE.OctahedronGeometry(0.042), eye, g, 0, 0.17, 0.11).scale.set(0.7, 1.25, 0.35);
  }
  if (look.crown === 'solar') {
    // imperial solar-forge corona: blazing sun-rays + grand curved golden horns
    for (let i = 0; i < 11; i++) {
      const a = (i - 5) * 0.28, r0 = 0.14, len = 0.22 + (i % 2 === 0 ? 0.16 : 0.06);
      const x0 = Math.sin(a) * r0, y0 = 0.11 + Math.cos(a) * 0.07;
      mesh(taper([[x0, y0, -0.09], [x0 * 1.45, y0 + Math.cos(a) * len * 0.55, -0.11],
        [Math.sin(a) * (r0 + len * 0.9), y0 + Math.cos(a) * len, -0.13]], 0.028, 0.002), i % 2 ? brass : eye, g);
    }
    for (const side of [-1, 1]) {
      mesh(taper([[side * 0.08, 0.07, 0.01], [side * 0.21, 0.11, 0.04], [side * 0.32, 0.26, 0.08], [side * 0.29, 0.44, 0.11]], 0.046, 0.003), brass, g);
    }
    mesh(new THREE.TorusGeometry(0.24, 0.015, 7, 32), eye, g, 0, 0.20, -0.13);
  }
  if (heavy || look.colossal) g.scale.set(1.18, 1.07, 1.15);
  return g;
}

// High-resolution 512x256 Japanese ō-yoroi kozane lamellar armor (color + bump relief)
const [scales, scalesBump] = (() => {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const bump = document.createElement('canvas'); bump.width = 512; bump.height = 256;
  const bctx = bump.getContext('2d')!;
  bctx.fillStyle = '#555555'; bctx.fillRect(0, 0, 512, 256);
  for (let row = 0; row < 4; row++) {
    const y = row * 64;
    const wash = ctx.createLinearGradient(0, y, 0, y + 64);
    wash.addColorStop(0, '#ebe3d5'); wash.addColorStop(0.14, '#bdb2a2');
    wash.addColorStop(0.72, '#5a524e'); wash.addColorStop(0.92, '#2d282c'); wash.addColorStop(1, '#1a171b');
    ctx.fillStyle = wash; ctx.fillRect(0, y, 512, 64);
    // beveled plate relief in bump map
    const bwash = bctx.createLinearGradient(0, y, 0, y + 64);
    bwash.addColorStop(0, '#f0f0f0'); bwash.addColorStop(0.16, '#c8c8c8');
    bwash.addColorStop(0.84, '#929292'); bwash.addColorStop(1, '#242424');
    bctx.fillStyle = bwash; bctx.fillRect(0, y, 512, 64);
    // gilded top rim of each lamellar row
    ctx.fillStyle = 'rgba(236,204,132,0.58)'; ctx.fillRect(0, y + 1, 512, 3);
    for (let x = 0; x < 512; x += 24) {
      // deep vertical seam between kozane plates
      ctx.fillStyle = '#241f22'; ctx.fillRect(x, y + 3, 2.5, 58);
      bctx.fillStyle = '#1d1d1d'; bctx.fillRect(x, y + 2, 3, 60);
      // subtle specular bevel next to seam
      ctx.fillStyle = 'rgba(255,248,232,0.22)'; ctx.fillRect(x + 3, y + 4, 2, 52);
      // braided silk odoshi lacing cords (twin vertical gold/cream bands + cross-tie)
      ctx.fillStyle = '#dfca96'; ctx.fillRect(x + 7, y + 12, 3.6, 30); ctx.fillRect(x + 14, y + 12, 3.6, 30);
      ctx.fillStyle = '#8b6a38'; ctx.fillRect(x + 7, y + 25, 10.6, 3);
      bctx.fillStyle = '#ededed'; bctx.fillRect(x + 7, y + 12, 3.6, 30); bctx.fillRect(x + 14, y + 12, 3.6, 30);
      // brass rivet at the top of each plate
      ctx.fillStyle = '#f2d388'; ctx.beginPath(); ctx.arc(x + 12.5, y + 7, 2.3, 0, TAU); ctx.fill();
      bctx.fillStyle = '#ffffff'; bctx.beginPath(); bctx.arc(x + 12.5, y + 7, 2.6, 0, TAU); bctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const btex = new THREE.CanvasTexture(bump); btex.anisotropy = 4;
  return [tex, btex] as const;
})();

function bodyArmor(look: OniLook, cloth: THREE.Material, lacquer: THREE.Material, lames: THREE.Material, eye: THREE.Material) {
  const chest = new THREE.Group(), belt = new THREE.Group();
  let backDrums: THREE.Group | undefined, backCape: THREE.Group | undefined;
  const heavy = look.big || look.plated || look.colossal, bound = heavy || look.shield || look.weapon === 'spear' || look.crest === 'crescent';
  if (bound) {
    const dō = mesh(openCyl(0.248, 0.204, 0.35, -1.84, 3.68, 26), lames, chest, 0, -0.24, 0.029);
    dō.scale.z = 0.87;
    mesh(openCyl(0.232, 0.25, 0.076, -1.82, 3.64, 24), lacquer, chest, 0, -0.071, 0.03).scale.z = 0.89;
    mesh(new THREE.RingGeometry(0.028, 0.039, 18), brass, chest, 0, -0.126, 0.248);
    mesh(new THREE.OctahedronGeometry(0.024), look.colossal ? eye : lacquer, chest, 0, -0.126, 0.249).scale.z = 0.35;
    if (look.colossal) {
      // ornate imperial collar guard (nodowa) & glowing core seal on the cuirass
      mesh(openCyl(0.18, 0.235, 0.09, -1.65, 3.3, 22), brass, chest, 0, -0.03, 0.035).scale.z = 0.92;
      mesh(new THREE.RingGeometry(0.056, 0.072, 24), brass, chest, 0, -0.18, 0.244);
      mesh(new THREE.OctahedronGeometry(0.044), eye, chest, 0, -0.18, 0.248).scale.set(0.85, 1.15, 0.35);
    }
  } else {
    const fold = mesh(openCyl(0.149, 0.257, 0.193, -1.85, 3.7, 20), cloth, chest, 0, -0.098, 0.038);
    fold.scale.z = 0.9;
    mesh(taper([[-0.151, -0.045, 0.144], [-0.089, -0.119, 0.209], [0.047, -0.191, 0.263], [0.153, -0.279, 0.18]],
      0.015, 0.011), cord, chest);
    if (look.weapon === 'staff' || look.weapon === 'drum') for (let i = -1; i <= 1; i++) {
      mesh(new THREE.BoxGeometry(0.037, 0.106, 0.009), bone, chest, i * 0.049, -0.196 - 0.018 * Math.abs(i), 0.257).rotation.z = i * -0.23;
      mesh(new THREE.BoxGeometry(0.013, 0.063, 0.007), lacquer, chest, i * 0.049, -0.196 - 0.018 * Math.abs(i), 0.265).rotation.z = i * -0.23;
    }
  }
  for (const side of [-1, 1]) {
    const shoulder = grp(chest, side * (look.colossal ? 0.24 : heavy ? 0.215 : 0.184), look.colossal ? -0.015 : -0.03, -0.012);
    shoulder.rotation.z = side * (look.colossal ? -0.44 : -0.52);
    const count = look.colossal ? 4 : heavy ? 3 : bound ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const part = mesh(openCyl(0.122 + i * 0.016, 0.154 + i * 0.022, 0.098, -1.34, 2.68, 14), i === 0 ? lacquer : i === count - 1 && look.colossal ? brass : lames, shoulder, 0, -i * 0.062, 0.039);
      part.scale.z = 0.84;
    }
    mesh(stud, brass, shoulder, 0, -0.009, 0.15);
    if (look.spikes) for (let i = -1; i <= 1; i++) {
      const t = i * 0.75, r = heavy ? 0.14 : 0.125;
      const spike = mesh(new THREE.ConeGeometry(look.colossal ? 0.03 : 0.024, (look.colossal ? 0.19 : 0.14) - Math.abs(i) * 0.03, 6), look.colossal ? brass : iron, shoulder, Math.sin(t) * r * 0.4, 0.085, Math.cos(t) * r * 0.6 + 0.02);
      spike.rotation.x = t * 0.5;
    }
  }
  if (look.drums) {
    // iconic Raijin/war-god arch of 6 lacquered taiko drums suspended behind the shoulders (animated in rig.ts)
    backDrums = new THREE.Group();
    const archR = 0.46;
    mesh(new THREE.TorusGeometry(archR, 0.014, 6, 36, Math.PI * 1.18), brass, backDrums, 0, 0.06, -0.24).rotation.z = -Math.PI * 0.09;
    for (let i = 0; i < 6; i++) {
      const a = -0.14 + (i / 5) * (Math.PI + 0.28);
      const dx = Math.cos(a) * archR, dy = 0.06 + Math.sin(a) * archR;
      const dGrp = grp(backDrums, dx, dy, -0.24);
      dGrp.rotation.z = a - Math.PI / 2;
      mesh(new THREE.CylinderGeometry(0.084, 0.084, 0.074, 14), lacquer, dGrp).rotation.x = Math.PI / 2;
      mesh(new THREE.CircleGeometry(0.076, 14), bone, dGrp, 0, 0, 0.039);
      mesh(new THREE.CircleGeometry(0.076, 14), bone, dGrp, 0, 0, -0.039).rotation.y = Math.PI;
      mesh(new THREE.TorusGeometry(0.084, 0.012, 5, 16), brass, dGrp, 0, 0, 0.035);
      mesh(new THREE.OctahedronGeometry(0.025), eye, dGrp, 0, 0, 0.043).scale.z = 0.35;
    }
  }
  if (look.cape) {
    // layered regal warlord back banners / tattered jimbaori panels flowing from the shoulders (animated in rig.ts)
    backCape = new THREE.Group();
    for (let i = -2; i <= 2; i++) {
      const w = i === 0 ? 0.145 : 0.098, len = i === 0 ? 0.98 : 0.80 - Math.abs(i) * 0.08;
      const panel = new THREE.Shape();
      panel.moveTo(-w * 0.5, 0); panel.lineTo(w * 0.5, 0);
      panel.quadraticCurveTo(w * 0.65, -len * 0.55, w * 0.45, -len);
      panel.lineTo(0, -len * 0.86); panel.lineTo(-w * 0.45, -len);
      panel.quadraticCurveTo(-w * 0.65, -len * 0.55, -w * 0.5, 0);
      const strip = mesh(new THREE.ShapeGeometry(panel), Math.abs(i) % 2 === 0 ? cloth : lacquer, backCape, i * 0.105, -0.04, -0.19 - Math.abs(i) * 0.012);
      strip.rotation.set(0.22 + Math.abs(i) * 0.03, i * 0.14, i * 0.06);
    }
  }
  const sash = mesh(new THREE.TorusGeometry(0.21, 0.024, 7, 26), cord, belt); sash.rotation.x = Math.PI / 2; sash.scale.y = 0.79;
  if (bound) {
    for (let i = 0; i < 6; i++) {
      const angle = i * TAU / 6 - 0.44;
      mesh(openCyl(0.213, 0.294, heavy ? 0.34 : 0.242, angle, 0.89, 8), lames, belt, 0, heavy ? -0.168 : -0.121, 0).scale.z = 0.74;
    }
    mesh(new THREE.BoxGeometry(0.106, 0.062, 0.021), lacquer, belt, 0, -0.009, 0.183);
    mesh(new THREE.RingGeometry(0.021, 0.03, 16), brass, belt, 0, -0.009, 0.196);
  } else {
    for (const side of [-1, 1]) {
      const panel = new THREE.Shape();
      panel.moveTo(-0.091, 0); panel.lineTo(0.081, 0); panel.quadraticCurveTo(0.112, -0.16, 0.128, -0.32);
      panel.lineTo(0.014, -0.28); panel.lineTo(-0.007, -0.366); panel.lineTo(-0.073, -0.32); panel.closePath();
      const flap = mesh(new THREE.ShapeGeometry(panel), side === 1 ? cloth : lacquer, belt, side * 0.118, -0.007, 0.139);
      flap.rotation.set(-0.19, side * 0.61, side * -0.16);
    }
  }
  return { chest, belt, backDrums, backCape };
}

// The plates are rigid relative to their bone. Merge by material so adding detail does not
// multiply draw calls for every enemy in a patrol.
function packed(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const parts = new Map<THREE.Material, THREE.BufferGeometry[]>();
  group.traverse(obj => {
    const part = obj as THREE.Mesh<THREE.BufferGeometry, THREE.Material>;
    if (!part.isMesh) return;
    const geometry = part.geometry.index ? part.geometry.toNonIndexed() : part.geometry.clone();
    geometry.applyMatrix4(part.matrixWorld);
    const list = parts.get(part.material);
    if (list) list.push(geometry);
    else parts.set(part.material, [geometry]);
  });
  const batch = new THREE.Group();
  for (const [material, geometries] of parts) {
    const geometry = mergeGeometries(geometries)!;
    mesh(geometry, material, batch);
    geometries.forEach(geo => geo.dispose());
  }
  return batch;
}

const costumes = new Map<string, { head: THREE.Group; chest: THREE.Group; belt: THREE.Group; backDrums?: THREE.Group; backCape?: THREE.Group }>();
export function oniCostume(look: OniLook) {
  const key = JSON.stringify(look);
  let outfit = costumes.get(key);
  if (!outfit) {
    const lacquer = oniMask(look.mask);
    const cloth = coat(look);
    const bright = new THREE.MeshPhysicalMaterial({
      color: lacquer.color.clone().lerp(new THREE.Color(0xcac3af), 0.23),
      metalness: 0.34, roughness: 0.4, clearcoat: 0.45, clearcoatRoughness: 0.24,
      bumpMap: lacquerBump, bumpScale: 0.007, side: THREE.DoubleSide
    });
    const lames = new THREE.MeshPhysicalMaterial({
      map: scales, bumpMap: scalesBump, bumpScale: 0.022,
      color: bright.color, side: THREE.DoubleSide,
      metalness: 0.34, roughness: 0.44, clearcoat: 0.38, clearcoatRoughness: 0.26
    });
    const eyeMat = oniEye(look.eye ?? 0xffd040);
    const { chest, belt, backDrums, backCape } = bodyArmor(look, cloth, bright, lames, eyeMat);
    outfit = {
      head: packed(carveHead(look, lacquer, eyeMat, cloth, bright)),
      chest: packed(chest),
      belt: packed(belt),
      backDrums: backDrums ? packed(backDrums) : undefined,
      backCape: backCape ? packed(backCape) : undefined
    };
    costumes.set(key, outfit);
  }
  return {
    head: outfit.head.clone(),
    chest: outfit.chest.clone(),
    belt: outfit.belt.clone(),
    backDrums: outfit.backDrums?.clone(),
    backCape: outfit.backCape?.clone()
  };
}

const bow = (() => {
  const g = new THREE.Group(), wood = new THREE.MeshStandardMaterial({ color: 0x775939, roughness: 0.67 });
  const grip: XYZ = [0, 0, 0.021], lower: XYZ = [0, -0.614, -0.168], upper: XYZ = [0, 0.934, -0.192];
  mesh(taper([grip, [0, -0.28, 0.006], [0, -0.49, -0.078], lower], 0.025, 0.006), wood, g);
  mesh(taper([grip, [0, 0.38, 0.045], [0, 0.72, -0.044], upper], 0.025, 0.006), wood, g);
  const string = new THREE.MeshBasicMaterial({ color: 0xc1ae92 });
  const a = new THREE.Vector3(...lower), b = new THREE.Vector3(...upper), axis = b.clone().sub(a);
  const line = mesh(new THREE.CylinderGeometry(0.0032, 0.0032, axis.length(), 6), string, g);
  line.position.copy(a).lerp(b, 0.5);
  line.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis.normalize());
  mesh(new THREE.CylinderGeometry(0.028, 0.027, 0.168, 9), recess, g, 0, -0.005, 0.022);
  for (let i = -2; i <= 2; i++) {
    const band = mesh(new THREE.TorusGeometry(0.026, 0.0038, 4, 10), cord, g, 0, i * 0.032, 0.022);
    band.rotation.x = Math.PI / 2;
  }
  return packed(g);
})();
export const oniYumi = () => bow.clone();
