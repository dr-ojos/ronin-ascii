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
    const card = new THREE.PlaneGeometry(radius * 2, radius * 2, 2, 2);
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

export const GRASS_SHAPE = /* glsl */`
  vPlant = vec3(uv.x, 0.5, 0.0);
  if (uDetailedSurfaces > 0.5) {
    float meadow = wNoise(base * 0.26 + vec2(11.7, 6.3));
    float kind = fract(vVar * 13.37);
    float stalk = step(0.976, vVar) * smoothstep(0.42, 0.62, meadow);
    float height = mix(0.41, 1.10, smoothstep(0.11, 0.91, meadow * 0.64 + kind * 0.36));
    float seedHead = smoothstep(0.61, 0.79, vH) * (1.0 - smoothstep(0.90, 1.0, vH));
    lp.y *= mix(height, 1.56, stalk);
    lp.x *= mix(0.58 + 0.52 * kind, 0.17 + 2.0 * seedHead, stalk);
    lp.x += sin(vH * 2.8) * (vVar - 0.52) * 0.073;
    lp.z += lp.x * (vH - 0.16) * (kind - 0.5);
    vPlant.yz = vec2(meadow, stalk);
  }
`;

export const GRASS_COLOUR = /* glsl */`
  float across = vPlant.x;
  float lush = smoothstep(0.15, 0.76, vPlant.y);
  float sunDry = smoothstep(0.62, 0.94, vVar * 0.58 + (1.0 - vPlant.y) * 0.42);
  vec3 green = mix(vec3(0.074, 0.132, 0.038), vec3(0.115, 0.244, 0.085), lush);
  vec3 blade = mix(green, vec3(0.261, 0.211, 0.071), sunDry * (0.44 + 0.56 * vH));
  float pixel = fwidth(across);
  float midrib = 1.0 - smoothstep(0.02, 0.085 + pixel, abs(across - 0.5));
  float veins = 0.5 + 0.5 * sin((abs(across - 0.49) * 13.5 + vH * 3.1 + vVar) * 6.2832);
  float fibres = mix(veins, 0.5, smoothstep(0.030, 0.12, pixel));
  float margin = smoothstep(0.8, 0.99, abs(across * 2.0 - 1.0));
  blade *= 0.63 + 0.56 * smoothstep(0.0, 0.86, vH) + 0.095 * fibres;
  blade += vec3(0.031, 0.039, 0.014) * (midrib * 0.75 + margin * 0.28) * vH;
  float husk = 0.5 + 0.5 * sin(vH * 133.0 + abs(across - 0.5) * 6.0);
  blade = mix(blade, vec3(0.31, 0.197, 0.081) * (0.81 + husk * 0.38), vPlant.z * smoothstep(0.62, 0.78, vH));
  diffuseColor.rgb = blade * (0.51 + 0.49 * smoothstep(0.0, 0.52, vH) + vSheen * vH * 0.056);
`;
