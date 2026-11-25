import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seeded } from './map';

type Canopy = 'blossom' | 'needles' | 'leaves';
const TAU = Math.PI * 2;
const TILE = 192;

function blossom(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number, turn: number, shade: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(turn);
  ctx.scale(radius, radius * (0.71 + shade * 0.29));
  const pink = ctx.createRadialGradient(0, 0, 0.05, 0, 0, 1);
  pink.addColorStop(0, '#aa425d');
  pink.addColorStop(0.32, shade < 0.5 ? '#dd829c' : '#e998ac');
  pink.addColorStop(1, shade < 0.31 ? '#f6b5c6' : '#fff1ec');
  ctx.fillStyle = pink;
  for (let i = 0; i < 5; i++) {
    ctx.rotate(TAU / 5);
    ctx.beginPath();
    ctx.moveTo(0, 0.02);
    ctx.bezierCurveTo(-0.52, -0.19, -0.55, -1.09, -0.10, -0.99);
    ctx.lineTo(0, -0.89);
    ctx.bezierCurveTo(0.52, -1.21, 0.62, -0.24, 0, 0.02);
    ctx.fill();
  }
  ctx.fillStyle = '#83454a';
  ctx.beginPath();
  ctx.arc(0, 0, 0.14, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#f8d299';
  for (let i = 0; i < 5; i++) {
    ctx.beginPath();
    ctx.arc(Math.sin(i * 2.4) * 0.16, Math.cos(i * 2.4) * 0.16, 0.034, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function leaf(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, width: number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(width, length);
  const vein = ctx.createLinearGradient(-0.5, 0, 0.5, 0);
  vein.addColorStop(0, '#627652');
  vein.addColorStop(0.42, '#aabf7e');
  vein.addColorStop(0.48, '#d3d8a5');
  vein.addColorStop(0.57, '#91ab6e');
  vein.addColorStop(1, '#516e48');
  ctx.fillStyle = vein;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.bezierCurveTo(-0.60, -0.23, -0.58, -0.60, 0.10, -1);
  ctx.bezierCurveTo(0.17, -0.71, 0.64, -0.34, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(218,226,179,0.46)';
  ctx.lineWidth = 0.032;
  for (let j = 1; j < 5; j++) {
    const y = -0.17 - j * 0.12, edge = 0.45 * Math.sin(-y * Math.PI);
    ctx.beginPath();
    ctx.moveTo(-edge, y - 0.11);
    ctx.lineTo(0, y);
    ctx.lineTo(edge, y - 0.095);
    ctx.stroke();
  }
  ctx.restore();
}

function needles(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, length: number, random: () => number) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#566143';
  ctx.lineWidth = 2.3;
  ctx.beginPath();
  ctx.moveTo(0, 6);
  ctx.quadraticCurveTo(2.8, -length * 0.51, 0, -length);
  ctx.stroke();
  for (let i = 0; i < 36; i++) {
    const t = i / 36, y = -length * t, side = i % 2 ? 1 : -1;
    const reach = length * (0.19 + 0.064 * random()) * Math.sin(Math.PI * (0.19 + 0.81 * t));
    ctx.strokeStyle = ['#657d53', '#95ae72', '#b1c289', '#496746'][i % 4];
    ctx.lineWidth = 1.3 + random() * 0.95;
    ctx.beginPath();
    ctx.moveTo(2.8 * t * (1 - t), y);
    ctx.quadraticCurveTo(side * reach * 0.74, y - reach * 0.15, side * reach, y - reach * 0.92);
    ctx.stroke();
  }
  ctx.restore();
}

export function canopyTexture(kind: Canopy) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = TILE * 2;
  const ctx = canvas.getContext('2d')!, random = seeded(kind === 'blossom' ? 443 : kind === 'needles' ? 914 : 337);
  for (let tile = 0; tile < 4; tile++) {
    ctx.save();
    ctx.translate((tile % 2) * TILE + TILE / 2, (tile >> 1) * TILE + TILE / 2);
    ctx.beginPath();
    ctx.rect(-TILE / 2, -TILE / 2, TILE, TILE);
    ctx.clip();
    if (kind === 'blossom') {
      // Flowers overlap in the middle and leave gaps and loose buds around the silhouette.
      for (let i = 0; i < 25; i++) {
        const angle = i * 2.4 + random() * 0.3, gap = Math.sqrt(i / 25);
        const x = Math.cos(angle) * gap * (64 + random() * 7);
        const y = Math.sin(angle) * gap * (60 + random() * 8);
        blossom(ctx, x, y, 12 + random() * 15 - gap * 6, random() * TAU, random());
      }
    } else {
      for (let i = 0; i < 14; i++) {
        const angle = i * 2.4 + random() * 0.4, r = 6 + random() * 25;
        const x = Math.sin(angle) * r, y = -Math.cos(angle) * r;
        if (kind === 'needles') needles(ctx, x, y, angle, 35 + random() * 26, random);
        else leaf(ctx, x, y, angle, 36 + random() * 26, 13 + random() * 13);
      }
    }
    ctx.restore();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.name = kind;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** A few bent sprays keep a volumetric silhouette at far fewer triangles than individual leaves. */
export function canopySprays(radius: number, sprigs = 4) {
  const parts = [];
  for (let i = 0; i < sprigs; i++) {
    const card = new THREE.PlaneGeometry(radius * 2, radius * 2, 2, 1);
    const { position, uv } = card.attributes, row = i >> 1, col = i % 2;
    for (let j = 0; j < position.count; j++) {
      const curve = 1 - Math.abs(position.getX(j) / radius);
      position.setZ(j, radius * (0.20 * curve - 0.08));
      uv.setXY(j, (col + uv.getX(j)) / 2, (1 - row + uv.getY(j)) / 2);
    }
    if (i === 0) card.rotateX(-1.31);
    else {
      card.rotateX(0.21 * Math.sin(i * 2.3));
      card.rotateY(i * 1.09);
    }
    const normal = card.attributes.normal, radial = new THREE.Vector3();
    for (let j = 0; j < position.count; j++) {
      radial.fromBufferAttribute(position, j);
      radial.y += radius * 0.36;
      radial.normalize();
      normal.setXYZ(j, radial.x, radial.y, radial.z);
    }
    parts.push(card);
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}

export function bambooBlade() {
  const blade = new THREE.PlaneGeometry(0.10, 0.36, 2, 6);
  const { position, uv } = blade.attributes;
  for (let i = 0; i < position.count; i++) {
    const y = 1 - uv.getY(i), width = 0.10 + 0.90 * Math.pow(Math.sin(Math.PI * Math.pow(y, 0.75)), 0.78);
    const x = position.getX(i) * width;
    const fold = (1 - Math.abs(2 * uv.getX(i) - 1)) * width;
    position.setXYZ(i, x + y * y * 0.035, -y * 0.36, 0.022 * fold + 0.078 * y * y);
  }
  blade.computeVertexNormals();
  return blade;
}

/** A low woody crown with spreading shoots, paired oval leaves and lighter new growth. */
export function lowShrubGeometry() {
  const random = seeded(5237);
  const positions: number[] = [], colors: number[] = [], indices: number[] = [];
  const leafOutline = [[0, 0], [0.30, 0.84], [0.70, 0.72], [1, 0], [0.70, -0.72], [0.30, -0.84]];
  const vertex = (x: number, y: number, z: number, light: number) => {
    positions.push(x, y, z);
    colors.push(light, light, light);
    return positions.length / 3 - 1;
  };
  function addLeaf(root: THREE.Vector3, angle: number, length: number, rise: number, light: number) {
    const dx = Math.cos(angle), dz = Math.sin(angle), width = length * (0.28 + 0.10 * random());
    // Two pairs of shoulders round out the leaf. Its lifted midrib catches a strip of light.
    const ridge = vertex(root.x + dx * length * 0.47, root.y + rise * 0.47 + width * 0.34, root.z + dz * length * 0.47, light);
    for (const [t, side] of leafOutline) {
      vertex(root.x + dx * length * t - dz * width * side, root.y + rise * t,
        root.z + dz * length * t + dx * width * side, light * (0.66 + 0.28 * t + 0.08 * side));
    }
    for (let j = 0; j < leafOutline.length; j++) indices.push(ridge, ridge + 1 + j, ridge + 1 + (j + 1) % leafOutline.length);
  }
  for (let i = 0; i < 11; i++) {
    const angle = i * 2.40 + random() * 0.40, dx = Math.cos(angle), dz = Math.sin(angle);
    const reach = 0.18 + random() * 0.46, height = 0.70 - reach * 0.49 + random() * 0.09;
    const shoot = (t: number) => new THREE.Vector3(dx * reach * t * t, (height + 0.14) * t - 0.23, dz * reach * t * t);
    const start = positions.length / 3;
    for (const t of [0, 0.48, 1]) {
      const p = shoot(t), radius = 0.019 - 0.014 * t;
      for (let j = 0; j < 3; j++) {
        const a = angle + j * TAU / 3;
        vertex(p.x + Math.cos(a) * radius, p.y, p.z + Math.sin(a) * radius, 0.16 + t * 0.16);
      }
    }
    for (const ring of [start, start + 3]) {
      for (let side = 0; side < 3; side++) {
        const a = ring + side, b = ring + (side + 1) % 3;
        indices.push(a, a + 3, b, b, a + 3, b + 3);
      }
    }
    for (let j = 0; j < 7; j++) {
      const t = 0.38 + j * 0.095;
      const direction = angle + (j % 2 ? 1 : -1) * (0.64 + random() * 0.52);
      addLeaf(shoot(t), direction, 0.14 + random() * 0.12, 0.027 + random() * 0.08, 0.46 + t * 0.49 + random() * 0.15);
    }
    addLeaf(shoot(0.99), angle, 0.14, 0.045, 1.10);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.name = 'Low shrub';
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/** Eight narrow ribbons share one instance. Each root is sampled separately on slopes and path edges. */
export function grassTuft() {
  const random = seeded(9284);
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 8; i++) {
    const turn = i * 2.4 + random() * 0.6;
    const radius = Math.sqrt((i + 0.5) / 8) * 0.30;
    const dirX = Math.cos(turn), dirZ = Math.sin(turn);
    const width = 0.033 + random() * 0.019, height = 0.46 + random() * 0.30;
    const lean = height * (0.12 + 0.31 * random());
    const face = turn + (random() - 0.5) * 1.6;
    const blade = new THREE.PlaneGeometry(1, 1, 1, 2);
    const { position, normal, uv } = blade.attributes;
    // xy is the root offset; zw is the ribbon's half-width vector, for the broad pale leaves.
    const offsets = new Float32Array(position.count * 4);
    for (let j = 0; j < position.count; j++) {
      const t = uv.getY(j), side = uv.getX(j) - 0.5;
      const edge = side * width * (1 - 0.80 * t * t);
      const bend = lean * t * (0.62 + 0.38 * t);
      const edgeX = -Math.sin(face) * edge, edgeZ = Math.cos(face) * edge;
      position.setXYZ(j, dirX * bend + edgeX, height * t + edge * t, dirZ * bend + edgeZ);
      normal.setXYZ(j, 0, 1, 0);
      offsets.set([dirX * radius, dirZ * radius, edgeX, edgeZ], j * 4);
    }
    blade.setAttribute('aGrassOffsets', new THREE.BufferAttribute(offsets, 4));
    parts.push(blade);
  }
  const geometry = mergeGeometries(parts)!;
  parts.forEach(part => part.dispose());
  return geometry;
}
