// Terrain: rolling hills, levelled ground under every place, lake basins and a ring of mountains
// that closes the world. One height grid feeds the CPU (groundY: feet, trees, buildings) and the GPU
// (grass, wind and the ground mesh) with the same bilinear filter, so everything sits on the same ground.
import * as THREE from 'three';
import { HALF, SIZE, WORLD_R, PLACES, LAKES, lakeRadius, fbm, place } from './map';
import { surfaceMaterial } from './surfaces';

export const HN = 449;                       // vertices per side
export const HCELL = SIZE / (HN - 1);        // 6.25 m
const sm = THREE.MathUtils.smoothstep;

function rawHeight(x: number, z: number) {
  let h = (fbm(x * 0.0035, z * 0.0035, 4) - 0.5) * 20;
  h += Math.max(0, fbm(x * 0.0017 + 5, z * 0.0017 + 2, 3) - 0.52) * 46;   // a few big hills
  const ip = place('inari'), di = Math.hypot(x - ip.x, z - ip.z);
  h += 22 * Math.exp(-((di / 80) ** 2));                                     // the hill of the mountain shrine
  const cp = place('castillo'), dc = Math.hypot(x - cp.x, z - cp.z);
  h += 5 * Math.exp(-((dc / 110) ** 2));                                     // castle mound
  const rp = place('ruinas'), dr = Math.hypot(x - rp.x, z - rp.z);
  h += 12 * Math.exp(-((dr / 210) ** 2));                                    // the hill of the ruined castle
  const r = Math.hypot(x, z), m = sm(r, WORLD_R - 80, WORLD_R + 100);
  h += m * m * (75 + 45 * fbm(x * 0.012, z * 0.012, 3));                   // mountains around the world
  return h;
}

// levels of the places (their raw height, unless fixed), computed once before any flattening
for (const p of PLACES) if (p.level === undefined && p.flat > 0) p.level = Math.round(rawHeight(p.x, p.z) * 2) / 2;
export const lakeLevel = LAKES.map(() => place('lago').level!);

function height(x: number, z: number) {
  let h = rawHeight(x, z);
  for (const p of PLACES) {
    if (p.flat <= 0) continue;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d < p.flat + p.blend) h = THREE.MathUtils.lerp(p.level!, h, sm(d, p.flat, p.flat + p.blend));
  }
  LAKES.forEach((l, i) => {   // basin under the water
    const d = Math.hypot(x - l.x, z - l.z), R = lakeRadius(l, Math.atan2(z - l.z, x - l.x));
    if (d < R + 8) h = Math.min(h, lakeLevel[i] - 3 * (1 - sm(d, R - 10, R + 2)) + 0.2);
  });
  return h;
}

export const heights = new Float32Array(HN * HN);
for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) heights[j * HN + i] = height(-HALF + i * HCELL, -HALF + j * HCELL);

/** ground height at any point (bilinear on the grid, identical to the shader's terrainH) */
export function groundY(x: number, z: number) {
  const gx = (x + HALF) / HCELL, gz = (z + HALF) / HCELL;
  const i = Math.max(0, Math.min(HN - 2, Math.floor(gx))), j = Math.max(0, Math.min(HN - 2, Math.floor(gz)));
  const fx = Math.max(0, Math.min(1, gx - i)), fz = Math.max(0, Math.min(1, gz - j));
  const a = heights[j * HN + i], b = heights[j * HN + i + 1], c = heights[(j + 1) * HN + i], d = heights[(j + 1) * HN + i + 1];
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}

const heightTex = new THREE.DataTexture(heights, HN, HN, THREE.RedFormat, THREE.FloatType);
heightTex.minFilter = heightTex.magFilter = THREE.NearestFilter; heightTex.needsUpdate = true;
export const terrainUniforms = { uHeight: { value: heightTex } };
/** GLSL: float terrainH(vec2 xz) */
export const TERRAIN_GLSL = /* glsl */`
uniform sampler2D uHeight;
float terrainH(vec2 p) {
  vec2 g = (p + ${HALF.toFixed(1)}) / ${HCELL.toFixed(4)};
  vec2 i = clamp(floor(g), vec2(0.0), vec2(${(HN - 2).toFixed(1)}));
  vec2 f = clamp(g - i, 0.0, 1.0);
  ivec2 c = ivec2(i);
  float a = texelFetch(uHeight, c, 0).r, b = texelFetch(uHeight, c + ivec2(1, 0), 0).r;
  float d = texelFetch(uHeight, c + ivec2(0, 1), 0).r, e = texelFetch(uHeight, c + ivec2(1, 1), 0).r;
  return mix(mix(a, b, f.x), mix(d, e, f.x), f.y);
}
`;

/** The ground mesh. In ASCII mode the lowland soil is black so only the grass draws characters. */
export function buildTerrainMesh() {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(HN * HN * 3), rock = new Float32Array(HN * HN), col = new Float32Array(HN * HN * 3);
  for (let j = 0; j < HN; j++) for (let i = 0; i < HN; i++) {
    const k = j * HN + i, x = -HALF + i * HCELL, z = -HALF + j * HCELL, h = heights[k];
    pos.set([x, h - 0.15, z], k * 3);
    const hx = heights[j * HN + Math.min(HN - 1, i + 1)] - heights[j * HN + Math.max(0, i - 1)];
    const hz = heights[Math.min(HN - 1, j + 1) * HN + i] - heights[Math.max(0, j - 1) * HN + i];
    const slope = Math.hypot(hx, hz) / (HCELL * 2), r = Math.hypot(x, z);
    rock[k] = Math.max(sm(r, WORLD_R - 50, WORLD_R + 10), sm(slope, 0.85, 1.1));
    const v = 0.75 + fbm(x * 0.05, z * 0.05, 2) * 0.5, snow = sm(h, 70, 100);
    col.set([0.36 * v + snow * 0.5, 0.38 * v + snow * 0.5, 0.45 * v + snow * 0.5], k * 3);
  }
  const idx: number[] = [];
  for (let j = 0; j < HN - 1; j++) for (let i = 0; i < HN - 1; i++) {
    const a = j * HN + i, b = a + 1, c = a + HN, d = c + 1;
    idx.push(a, c, b, b, c, d);
  }
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aRock', new THREE.BufferAttribute(rock, 1));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true });
  mat.userData.cls = 0.2;
  mat.onBeforeCompile = sh => {
    sh.vertexShader = 'attribute float aRock; varying float vRock;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvRock = aRock;');
    // lowland soil: pure black (so the ASCII pass draws nothing there) and classed like the grass: the
    // ASCII pass samples the class between pixels, and soil of another class showing between the blades
    // would blend into a third class (the lantern glyphs). Mountains: stone.
    sh.fragmentShader = 'varying float vRock;\n' + sh.fragmentShader.replace(/}\s*$/, `
  if (uDetailedSurfaces < 0.5 && vRock < 0.5) gl_FragColor = vec4(0.0, 0.0, 0.0, 0.1); else gl_FragColor.a = 0.2;
}`);
  };
  mat.customProgramCacheKey = () => 'terrain';
  const mesh = new THREE.Mesh(geo, surfaceMaterial(mat, 'terrain', 'mesh'));
  mesh.receiveShadow = true;
  return mesh;
}

/** far mountain silhouettes on the horizon: a ring that travels with the camera (like the moon) */
export function buildSkyline() {
  const N = 220, R = 238, pos: number[] = [], idx: number[] = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, h = 14 + fbm(Math.cos(a) * 3 + 9, Math.sin(a) * 3, 4) * 44 + Math.pow(fbm(Math.cos(a) * 9, Math.sin(a) * 9, 2), 3) * 30;
    pos.push(Math.cos(a) * R, -40, Math.sin(a) * R, Math.cos(a) * R, h, Math.sin(a) * R);
    if (i < N) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
  const mat = new THREE.MeshBasicMaterial({ color: 0x141b33, fog: false, side: THREE.DoubleSide });
  const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.renderOrder = -1;
  return m;
}
