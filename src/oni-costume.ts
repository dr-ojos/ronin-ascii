import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { grp, mesh, openCyl } from './samurai';

export interface OniLook {
  big: boolean;
  tint: number;
  mask: number;
  eye?: number;
  weapon: 'club' | 'spear' | 'bow' | 'bigclub' | 'sword' | 'staff' | 'scythe' | 'drum';
  shield?: boolean;
  plated?: boolean;
  crest?: 'crescent' | 'feathers' | 'halo';
  tengu?: boolean;
}

const TAU = Math.PI * 2;
type XYZ = [number, number, number];
const bone = new THREE.MeshStandardMaterial({ color: 0xc9baa1, roughness: 0.63 });
const iron = new THREE.MeshStandardMaterial({ color: 0x4a4e54, metalness: 0.62, roughness: 0.49 });
const brass = new THREE.MeshStandardMaterial({ color: 0xb19868, metalness: 0.51, roughness: 0.48 });
const cord = new THREE.MeshStandardMaterial({ color: 0x9b8768, roughness: 0.94 });
const recess = new THREE.MeshStandardMaterial({ color: 0x130e12, roughness: 0.87 });
const stud = new THREE.SphereGeometry(0.009, 6, 4);

const masks = new Map<number, THREE.MeshPhysicalMaterial>();
const eyes = new Map<number, THREE.MeshBasicMaterial>();
export function oniMask(color: number) {
  let material = masks.get(color);
  if (!material) {
    material = new THREE.MeshPhysicalMaterial({ color, clearcoat: 0.48, roughness: 0.46, clearcoatRoughness: 0.28 });
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
  const geo = new THREE.ShapeGeometry(shape);
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) p.setZ(i, relief(p.getX(i), p.getY(i)) + lift);
  geo.computeVertexNormals();
  mesh(geo, material, g);
}

const coat = (look: OniLook) => new THREE.MeshStandardMaterial({
  color: new THREE.Color(look.tint).lerp(new THREE.Color(look.mask), 0.22),
  side: THREE.DoubleSide, roughness: 0.93
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
  if (heavy) g.scale.set(1.16, 1.05, 1.13);
  return g;
}

const scales = (() => {
  const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  for (let row = 0; row < 4; row++) {
    const y = row * 32, wash = ctx.createLinearGradient(0, y, 0, y + 32);
    wash.addColorStop(0, '#cac4bb'); wash.addColorStop(0.23, '#918679'); wash.addColorStop(0.87, '#524c48'); wash.addColorStop(1, '#302c2f');
    ctx.fillStyle = wash; ctx.fillRect(0, y, 256, 32);
    for (let x = 0; x < 256; x += 16) {
      ctx.fillStyle = '#383334'; ctx.fillRect(x, y + 2, 1.5, 27);
      ctx.fillStyle = '#d0ba91'; ctx.fillRect(x + 4, y + 5, 2.3, 15); ctx.fillRect(x + 9, y + 5, 2.3, 15);
    }
  }
  const tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  return tex;
})();

function bodyArmor(look: OniLook, cloth: THREE.Material, lacquer: THREE.Material, lames: THREE.Material) {
  const chest = new THREE.Group(), belt = new THREE.Group();
  const heavy = look.big || look.plated, bound = heavy || look.shield || look.weapon === 'spear' || look.crest === 'crescent';
  if (bound) {
    const dō = mesh(openCyl(0.248, 0.204, 0.35, -1.84, 3.68, 26), lames, chest, 0, -0.233, 0.014);
    dō.scale.z = 0.78;
    mesh(openCyl(0.232, 0.25, 0.07, -1.82, 3.64, 24), lacquer, chest, 0, -0.071, 0.016).scale.z = 0.8;
    mesh(new THREE.RingGeometry(0.028, 0.039, 18), brass, chest, 0, -0.119, 0.214);
    mesh(new THREE.OctahedronGeometry(0.024), lacquer, chest, 0, -0.12, 0.216).scale.z = 0.35;
  } else {
    const fold = mesh(openCyl(0.13, 0.25, 0.17, -1.85, 3.7, 20), cloth, chest, 0, -0.09, 0.023);
    fold.scale.z = 0.83;
    mesh(taper([[-0.156, -0.045, 0.112], [-0.089, -0.116, 0.176], [0.047, -0.184, 0.204], [0.153, -0.259, 0.149]],
      0.015, 0.011), cord, chest);
    if (look.weapon === 'staff' || look.weapon === 'drum') for (let i = -1; i <= 1; i++) {
      mesh(new THREE.BoxGeometry(0.037, 0.106, 0.009), bone, chest, i * 0.049, -0.196 - 0.018 * Math.abs(i), 0.187).rotation.z = i * -0.23;
      mesh(new THREE.BoxGeometry(0.013, 0.063, 0.007), lacquer, chest, i * 0.049, -0.196 - 0.018 * Math.abs(i), 0.194).rotation.z = i * -0.23;
    }
  }
  for (const side of [-1, 1]) {
    const shoulder = grp(chest, side * (heavy ? 0.215 : 0.184), -0.03, -0.012);
    shoulder.rotation.z = side * -0.52;
    const count = heavy ? 3 : bound ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const part = mesh(openCyl(0.122 + i * 0.015, 0.154 + i * 0.02, 0.098, -1.34, 2.68, 14), i === 0 ? lacquer : lames, shoulder, 0, -i * 0.063, 0.039);
      part.scale.z = 0.82;
    }
    mesh(stud, brass, shoulder, 0, -0.009, 0.15);
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
  return { chest, belt };
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

const costumes = new Map<string, { head: THREE.Group; chest: THREE.Group; belt: THREE.Group }>();
export function oniCostume(look: OniLook) {
  const key = JSON.stringify(look);
  let outfit = costumes.get(key);
  if (!outfit) {
    const lacquer = oniMask(look.mask);
    const cloth = coat(look);
    const bright = new THREE.MeshStandardMaterial({
      color: lacquer.color.clone().lerp(new THREE.Color(0xcac3af), 0.23),
      metalness: 0.26, roughness: 0.51, side: THREE.DoubleSide
    });
    const lames = new THREE.MeshStandardMaterial({ map: scales, color: bright.color, side: THREE.DoubleSide, metalness: 0.24, roughness: 0.55 });
    const { chest, belt } = bodyArmor(look, cloth, bright, lames);
    outfit = { head: packed(carveHead(look, lacquer, oniEye(look.eye ?? 0xffd040), cloth, bright)), chest: packed(chest), belt: packed(belt) };
    costumes.set(key, outfit);
  }
  return { head: outfit.head.clone(), chest: outfit.chest.clone(), belt: outfit.belt.clone() };
}
