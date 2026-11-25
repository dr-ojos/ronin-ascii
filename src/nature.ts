// Landscape: infinite dense grass, procedural trees (sakura, black pine, cypress, bamboo), bushes,
// wildflowers, fallen petals, mossy rocks, a rippling pond and fireflies — all swaying in one wind field.
// The trees come from a reusable "kit" so the streamed forest chunks (chunks.ts) grow the same species.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { tagMat, CLS, asciiGrid, FLOWER_GLYPHS } from './materials';
import { addRoundedSurface, detailedSurfaces, showSurfaceDetail, surfaceMaterial } from './surfaces';
import { bambooBlade, canopySprays, canopyTexture, grassTuft, lowShrubGeometry } from './vegetation-art';
import { TERRAIN_GLSL, terrainUniforms, groundY } from './terrain';
import { HALF, SIZE, WORLD_R, MASK_RES, groundMask, groundAt, seeded, treeBlocked } from './map';
import type { Collider, XZ } from './types';
import { waterMaterial } from './water';

/** what world.ts hands to the landscape builder */
export interface NatureCtx {
  addCollider(c: Collider): void;
  isFree(x: number, z: number, gap: number): boolean;
  camBlockers: THREE.Object3D[];
  inCompound(x: number, z: number, margin?: number): boolean;
  onPath(x: number, z: number): boolean;
}
type ShaderParams = Parameters<THREE.Material['onBeforeCompile']>[0];

const V = THREE.Vector3, TAU = Math.PI * 2, UP = new V(0, 1, 0);
/** random source for everything built here; chunks swap in a seeded one so a forest regrows identically */
export const rng = { f: Math.random };
const R = () => rng.f();
const rnd = (a: number, b: number) => a + R() * (b - a);
const pick = <T,>(a: readonly T[]): T => a[(R() * a.length) | 0];
// cheap ambient occlusion: darker towards the inside / underside of a canopy
const ao = (hex: THREE.ColorRepresentation, k: number) => new THREE.Color(hex).multiplyScalar(THREE.MathUtils.clamp(k, 0.35, 1.1));
// canopies are brighter on the side facing the moon (same direction as the moonlight in world.ts)
const MOON = new V(-0.55, 0.7, -0.45).normalize();
const moonLit = (u: THREE.Vector3) => 0.8 + 0.32 * (u.lengthSq() > 1e-6 ? u.clone().normalize().dot(MOON) : 0);

// ------------------------------------------------------------ wind
export const wind = {
  uTime: { value: 0 },
  uCenter: { value: new THREE.Vector2() },                                   // grass tile follows the player
  uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(-999, -999, 0.001, 0)) } // x, z, radius
};
export const POND = { x: -15, z: 13, r: 4.6 };
/** the pond's wobbly shore (same formula as POND_SHORE_GLSL, whose angle runs in the mesh's local x, -z) */
export function pondShore(x: number, z: number) {
  const a = Math.atan2(-(z - POND.z), x - POND.x);
  return POND.r * (1 + Math.sin(a * 3) * 0.08 + Math.sin(a * 7 + 1) * 0.05);
}
/** the pond is shallow: walkers wade in it up to the ankles (0 on the shore, ~0.5 in the middle) */
export function pondDepth(x: number, z: number) {
  const d = Math.hypot(x - POND.x, z - POND.z);
  if (d > POND.r * 1.2) return 0;
  const R = pondShore(x, z);
  return d > R ? 0 : (1 - THREE.MathUtils.smoothstep(d, R * 0.2, R)) * 0.5;
}
export const POND_SHORE_GLSL = `
  float pondRadius(vec2 p) {
    float a = atan(p.y, p.x);
    return ${POND.r.toFixed(2)} * (1.0 + sin(a * 3.0) * 0.08 + sin(a * 7.0 + 1.0) * 0.05);
  }
`;

const WIND_GLSL = /* glsl */`
uniform float uTime;
// smooth value noise (sin-free hash, stays precise at large coordinates)
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// soft gust patches rolling across the meadow + gentle local sway + a little flutter.
// h01 = 0 at the root, 1 at the tip.
vec3 windAt(vec3 wp, float h01, float amp, float flutter) {
  // the wind direction drifts slowly instead of always blowing the same way
  float a = 0.34 + 0.32 * sin(uTime * 0.045) + 0.12 * sin(uTime * 0.11 + 1.3);
  vec2 dir = vec2(cos(a), sin(a)), side = vec2(-dir.y, dir.x);
  // gust field: two octaves of noise carried downwind -> organic patches, never a regular stripe
  vec2 q = wp.xz - dir * uTime * 2.4;
  float gust = wNoise(q * 0.055) * 0.65 + wNoise(q * 0.16 + 7.3) * 0.35;
  gust = smoothstep(0.2, 0.85, gust);
  float breath = 0.78 + 0.22 * sin(uTime * 0.19) * sin(uTime * 0.071 + 2.0);   // whole wind slowly rises and calms
  // local sway: neighbours share a phase (so clumps move together) but drift apart smoothly
  float ph = wNoise(wp.xz * 0.3) * 6.2832;
  float sway = sin(uTime * 1.7 + ph) * (0.3 + 0.7 * gust);
  float cross = sin(uTime * 1.15 + ph * 1.6) * (0.4 + 0.6 * gust);
  float bend = (0.25 + gust * 0.95) * breath;
  vec2 d = (dir * (bend + sway * 0.2) + side * cross * 0.09) * amp * h01 * h01;
  vec3 o = vec3(d.x, -dot(d, d) * 0.45, d.y);   // tips dip as they bend, so blades don't stretch
  float fp = dot(wp, vec3(3.1, 5.7, 4.3));
  o += flutter * (0.3 + gust) * vec3(sin(uTime * 4.2 + fp), sin(uTime * 5.3 + fp * 1.3) * 0.4, cos(uTime * 4.7 + fp * 0.7));
  return o;
}
` + TERRAIN_GLSL;

// patch any lit material (and its shadow depth material) so vertices move with the wind.
// Height is measured from the terrain under the vertex, so trees on a hill sway like trees in the valley.
export function addWind(mat: THREE.Material, { height = 6, amp = 0.3, flutter = 0 }: { height?: number; amp?: number; flutter?: number } = {}) {
  const inject = (sh: ShaderParams) => {
    sh.uniforms.uTime = wind.uTime; sh.uniforms.uHeight = terrainUniforms.uHeight;
    sh.vertexShader = WIND_GLSL + sh.vertexShader
      .replace('#include <project_vertex>', /* glsl */`
        #ifdef USE_INSTANCING
          vec4 wPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 wPos = modelMatrix * vec4(transformed, 1.0);
        #endif
        wPos.xyz += windAt(wPos.xyz, clamp((wPos.y - terrainH(wPos.xz)) / ${height.toFixed(2)}, 0.0, 1.0), ${amp.toFixed(3)}, ${flutter.toFixed(3)});
        vec4 mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wPos;');
  };
  const key = `wind_${height}_${amp}_${flutter}`;
  mat.onBeforeCompile = inject;
  mat.customProgramCacheKey = () => key;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = inject;
  depth.customProgramCacheKey = () => key + '_d';
  return depth;
}

// ------------------------------------------------------------ helpers
function tube(start: THREE.Vector3, end: THREE.Vector3, r0: number, r1: number, seg = 6, color?: THREE.ColorRepresentation, gy = 0) {
  const d = end.clone().sub(start), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(start.x, start.y, start.z);
  if (color !== undefined) {
    // darker + mossy near the ground, lighter on thin twigs, a little random variation per piece
    const base = new THREE.Color(color), moss = new THREE.Color(0x2c3a24), c = new THREE.Color();
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), height = new Float32Array(pos.count);
    const v = rnd(0.88, 1.12);
    const thin = THREE.MathUtils.clamp(1.25 - r0 * 2.5, 0.75, 1.25);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) - gy;
      height[i] = y;
      c.copy(base).lerp(moss, THREE.MathUtils.clamp(0.55 - y * 0.6, 0, 0.55)).multiplyScalar(THREE.MathUtils.clamp(0.5 + y * 0.18, 0.5, 1.1) * thin * v);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aBarkHeight', new THREE.BufferAttribute(height, 1));
  }
  return g;
}
const perp = (d: THREE.Vector3) => { const p = new V(1, 0, 0); if (Math.abs(d.x) > 0.9) p.set(0, 0, 1); return p.cross(d).normalize(); };
function jitter<T extends THREE.BufferGeometry>(geo: T, amt: number): T {
  const p = geo.attributes.position, seen = new Map<string, number[]>();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [rnd(-amt, amt), rnd(-amt, amt), rnd(-amt, amt)]);
    const j = seen.get(k)!; p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  geo.computeVertexNormals(); return geo;
}

// The icosahedra duplicate vertices on their faces and along their UV seam.
function roundedNormals<T extends THREE.BufferGeometry>(geo: T): T {
  const { position, normal } = geo.attributes;
  const byPoint = new Map<string, THREE.Vector3>(), byVertex: THREE.Vector3[] = [], face = new V();
  for (let i = 0; i < position.count; i++) {
    const key = `${position.getX(i).toFixed(5)},${position.getY(i).toFixed(5)},${position.getZ(i).toFixed(5)}`;
    let sum = byPoint.get(key);
    if (!sum) { sum = new V(); byPoint.set(key, sum); }
    sum.add(face.fromBufferAttribute(normal, i));
    byVertex.push(sum);
  }
  for (const sum of byPoint.values()) sum.normalize();
  const normals = new Float32Array(position.count * 3);
  byVertex.forEach((n, i) => n.toArray(normals, i * 3));
  geo.setAttribute('aRoundedNormal', new THREE.BufferAttribute(normals, 3));
  return geo;
}
// collects instances of one blob geometry and emits a single InstancedMesh
class Batch {
  geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[] = []; c: THREE.Color[] = [];
  constructor(geo: THREE.BufferGeometry, mat: THREE.Material) { this.geo = geo; this.mat = mat; }
  add(pos: THREE.Vector3, scale: number | THREE.Vector3, rotY: number | undefined = R() * TAU, color: THREE.ColorRepresentation, rot?: THREE.Quaternion) {
    const q = rot || new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.4, 0.4), rotY, rnd(-0.4, 0.4)));
    this.m.push(new THREE.Matrix4().compose(pos, q, typeof scale === 'number' ? new V(scale, scale, scale) : scale));
    this.c.push(new THREE.Color(color));
  }
  build(cull: boolean) {
    const im = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, this.m.length));
    this.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, this.c[i]); });
    im.count = this.m.length;
    if (cull) { im.computeBoundingSphere(); im.boundingSphere!.radius += 1.5; } else im.frustumCulled = false;
    return im;
  }
}

// ------------------------------------------------------------ shared materials (one shader each, whole world)
function sprayMaterial(kind: Parameters<typeof canopyTexture>[0], height: number, amp: number, flutter: number, gain: number) {
  const map = canopyTexture(kind), alphaTest = kind === 'needles' ? 0.28 : 0.40;
  const material = new THREE.MeshStandardMaterial({ map, alphaTest, roughness: 0.97, side: THREE.DoubleSide });
  const depth = addWind(material, { height, amp, flutter });
  const compile = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (sh, renderer) => {
    compile.call(material, sh, renderer);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);')
      .replace('#include <color_fragment>', `#include <color_fragment>\ndiffuseColor.rgb *= ${gain.toFixed(2)};`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * 0.10;');
  };
  material.customProgramCacheKey = () => `${key}|sprays:${kind}`;
  return { material: tagMat(material, CLS.foliageLeaf), depth };
}

const MAT = (() => {
  const bark = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true });
  const petal = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide });
  const culm = new THREE.MeshStandardMaterial({ color: 0x5d8a35, roughness: 0.5 });
  const leaf = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
  const lowShrub = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const flower = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x181018 });
  const wild = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x101010 });
  const rock = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  // wind first (it replaces onBeforeCompile), then the class tag (which wraps it)
  const depth = {
    bark: addWind(bark, { height: 12, amp: 0.25, flutter: 0 }),
    culm: addWind(culm, { height: 10, amp: 0.55, flutter: 0 }),
    leaf: addWind(leaf, { height: 10, amp: 0.55, flutter: 0.05 }),
    lowShrub: addWind(lowShrub, { height: 0.7, amp: 0.07, flutter: 0.003 }),
    flower: addWind(flower, { height: 1.6, amp: 0.08, flutter: 0.015 }),
    wild: addWind(wild, { height: 0.8, amp: 0.32, flutter: 0.01 })
  };
  surfaceMaterial(bark, 'bark');
  surfaceMaterial(culm, 'bamboo');
  surfaceMaterial(leaf, 'leafBlade');
  surfaceMaterial(rock, 'boulder', 'rounded');
  tagMat(bark, CLS.wood); tagMat(culm, CLS.foliage);
  tagMat(leaf, CLS.foliageLeaf); tagMat(petal, CLS.foliageLeaf); tagMat(flower, CLS.light);
  tagMat(wild, CLS.light); tagMat(rock, CLS.ground);
  tagMat(lowShrub, CLS.foliageLeaf);
  return { bark, petal, culm, leaf, lowShrub, flower, wild, rock, depth };
})();
const SPRAYS = {
  blossoms: sprayMaterial('blossom', 7, 0.3, 0.03, 1.12),
  needles: sprayMaterial('needles', 12, 0.28, 0.012, 3.15),
  bushes: sprayMaterial('leaves', 1.6, 0.08, 0.012, 2.9),
};
// built once, shared by every tree in the world
const GEO = (() => {
  return {
    petal: new THREE.PlaneGeometry(0.07, 0.05),
    bloom: new THREE.IcosahedronGeometry(0.05, 0),
    wild: new THREE.IcosahedronGeometry(0.04, 0),
    flowerSpray: canopySprays(0.26),
    needleSpray: canopySprays(0.34),
    shrubSpray: canopySprays(0.39),
    lowShrub: lowShrubGeometry(),
    bambooBlade: bambooBlade(),
  };
})();
const PINK = [0xf4b3c8, 0xe993b1, 0xfcd6e2, 0xd97a9e, 0xf7c4d4];
const GREEN = [0x1d3b27, 0x24452c, 0x2d5233, 0x183322];

// ------------------------------------------------------------ the kit: grows trees anywhere on the terrain
export interface KitOpts {
  lite: boolean;                                  // streamed chunks: fewer, larger, low-poly canopy blobs
  addCollider(c: Collider): void;
  onPath(x: number, z: number): boolean;          // no fallen petals here
}
export interface KitMesh { mesh: THREE.Mesh; blocker: boolean }
export function createKit(o: KitOpts) {
  const q = o.lite ? 0.55 : 1, qs = o.lite ? 1.22 : 1, cnt = (n: number) => Math.max(1, Math.round(n * q));
  const bark: THREE.BufferGeometry[] = [], culms: THREE.BufferGeometry[] = [], rockGeos: THREE.BufferGeometry[] = [];
  const blossoms = new Batch(GEO.flowerSpray, SPRAYS.blossoms.material), needles = new Batch(GEO.needleSpray, SPRAYS.needles.material), petals = new Batch(GEO.petal, MAT.petal);
  const leaves = new Batch(GEO.bambooBlade, MAT.leaf), bushes = new Batch(GEO.shrubSpray, SPRAYS.bushes.material), blooms = new Batch(GEO.bloom, MAT.flower), wild = new Batch(GEO.wild, MAT.wild);
  const lowShrubs = new Batch(GEO.lowShrub, MAT.lowShrub);
  const petalSources: THREE.Vector3[] = [];   // canopy points that shed falling petals
  let gy = 0;   // ground height under the tree being grown

  // a branch made of a few slightly bent segments, so limbs curve instead of being straight sticks
  function bentTube(start: THREE.Vector3, dir: THREE.Vector3, len: number, r0: number, r1: number, bend: number, color: THREE.ColorRepresentation, parts = 3): [THREE.Vector3, THREE.Vector3] {
    let p = start.clone(), d = dir.clone().normalize();
    const axis = perp(d).applyAxisAngle(d, rnd(0, TAU));
    const n = o.lite ? Math.max(1, parts - 1) : parts;
    for (let i = 0; i < n; i++) {
      const e = p.clone().addScaledVector(d, len / n);
      const ra = THREE.MathUtils.lerp(r0, r1, i / n), rb = THREE.MathUtils.lerp(r0, r1, (i + 1) / n);
      bark.push(tube(p, e, ra * 1.04, rb, ra > 0.07 ? (o.lite ? 6 : 8) : (o.lite ? 4 : 5), color, gy));
      p = e; d = d.clone().applyAxisAngle(axis, (bend * rnd(-0.5, 1)) / n).normalize();
    }
    return [p, d];
  }
  // buttress roots splaying into the soil
  function roots(base: THREE.Vector3, r: number, color: THREE.ColorRepresentation) {
    const n = (o.lite ? 4 : 5) + ((R() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.3, 0.3), reach = r * rnd(2.6, 3.8);
      const s = new V(base.x, base.y + r * rnd(1.2, 2.0), base.z), e = new V(base.x + Math.cos(a) * reach, base.y - 0.25, base.z + Math.sin(a) * reach);
      bark.push(tube(s, e, r * 0.5, r * 0.1, 6, color, gy));
    }
  }

  function sakura(x: number, z: number) {
    gy = groundY(x, z);
    const k = rnd(0.85, 1.25), tips: THREE.Vector3[] = [], weeping = R() < 0.3;
    const barkCol = pick([0x4a2f29, 0x52342c, 0x3f2824]);
    const branch = (s: THREE.Vector3, d: THREE.Vector3, len: number, r: number, depth: number): void => {
      const [e, ed] = bentTube(s, d, len, r, r * 0.66, depth > 2 ? 0.3 : 0.55, barkCol);
      if (depth === 0) { tips.push(e); return; }
      const n = depth > 2 ? 2 : (o.lite && depth === 1 ? 2 : 3);
      for (let i = 0; i < n; i++) {
        const nd = ed.clone().applyAxisAngle(perp(ed), rnd(0.35, 0.85)).applyAxisAngle(ed, (i / n) * TAU + rnd(-0.5, 0.5));
        nd.y = Math.max(nd.y, depth > 2 ? 0.25 : (weeping ? -0.1 : 0.04)); nd.normalize();
        branch(e, nd, len * rnd(0.62, 0.8), r * 0.64, depth - 1);
      }
    };
    const base = new V(x, gy, z);
    roots(base, 0.25 * k, barkCol);
    branch(base, new V(rnd(-0.2, 0.2), 1, rnd(-0.2, 0.2)).normalize(), 1.7 * k, 0.27 * k, 4);
    const cTop = tips.reduce((m, t) => Math.max(m, t.y), -1e9), cBot = tips.reduce((m, t) => Math.min(m, t.y), 1e9);
    const span = Math.max(0.5, cTop - cBot);
    // cloud-like puffs around every twig tip: flattened, lit on the moon side, darker underneath
    for (const t of tips) {
      const c = t.clone(); c.y += 0.12 * k;
      for (let i = 0; i < cnt(26); i++) {
        const u = new V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (u.lengthSq() > 1) { i--; continue; }
        const off = new V(u.x * 0.72, u.y * 0.42, u.z * 0.72).multiplyScalar(k);
        const p = c.clone().add(off);
        const shade = (0.6 + 0.4 * (p.y - cBot) / span) * moonLit(u) * (0.8 + 0.3 * u.length());
        blossoms.add(p, rnd(0.45, 0.85) * k * qs, undefined, R() < 0.07 ? ao(0xffffff, shade) : ao(pick(PINK), shade));
      }
      if (R() < 0.35) petalSources.push(c);
      // weeping cherry: strands of blossom hanging from the tips
      if (weeping) for (let s = 0; s < (o.lite ? 1 : 2); s++) {
        const drift = new V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(0.06 * k);
        const p = c.clone().add(new V(rnd(-0.4, 0.4), -0.2, rnd(-0.4, 0.4)).multiplyScalar(k)), n = 5 + ((R() * 5) | 0);
        for (let j = 0; j < n && p.y > gy + 0.6; j++) {
          blossoms.add(p.clone(), rnd(0.3, 0.45) * k * qs * (1 - j / (n * 1.6)), undefined, ao(pick(PINK), (0.75 - j * 0.03) * moonLit(drift)));
          p.y -= 0.24 * k; p.add(drift);
        }
      }
    }
    for (let i = 0; i < cnt(140); i++) {
      const a = rnd(0, TAU), r = Math.sqrt(R()) * 4.2 * k;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (o.onPath(px, pz)) continue;
      petals.add(new V(px, groundY(px, pz) + 0.05, pz), rnd(0.8, 1.4) * qs, 0, pick(PINK), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + rnd(-0.3, 0.3), 0, rnd(0, TAU))));
    }
    o.addCollider({ x, z, r: 0.35 * k });
  }
  function pine(x: number, z: number) {
    gy = groundY(x, z);
    const k = rnd(0.9, 1.3), barkCol = pick([0x34302d, 0x3a3430, 0x2e2a28]);
    let p = new V(x, gy, z), d = new V(rnd(-0.3, 0.3), 1, rnd(-0.3, 0.3)).normalize(), r = 0.27 * k;
    const lean = new V(rnd(-1, 1), 0, rnd(-1, 1)).normalize();
    roots(p, r, barkCol);
    for (let s = 0; s < 5; s++) {
      const [e] = bentTube(p, d, 1.1 * k, r, r * 0.82, 0.35, barkCol, 2);
      if (s >= 1) {
        for (let b = 0; b < 2; b++) {
          // limbs droop out of the trunk, then the tip turns up under its pad (bonsai "cloud" style)
          const bd = new V(Math.cos(rnd(0, TAU)), rnd(-0.15, 0.1), Math.sin(rnd(0, TAU))).normalize();
          const bl = rnd(1.2, 2.2) * k * (1 - s * 0.12);
          const [be] = bentTube(e, bd, bl, r * 0.45, r * 0.16, -0.6, barkCol, 3);
          // flat needle pad: wide, thin, bright on top and on the moon side, dark underneath
          for (let i = 0; i < cnt(46); i++) {
            const u = new V(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1));
            const off = new V(u.x * 0.85, u.y * 0.16 + 0.12, u.z * 0.85).multiplyScalar(k), qq = be.clone().add(off);
            needles.add(qq, new V(rnd(0.8, 1.3), rnd(0.32, 0.5), rnd(0.8, 1.3)).multiplyScalar(k * qs), undefined, ao(pick(GREEN), (0.62 + u.y * 0.3 + Math.hypot(u.x, u.z) * 0.15) * moonLit(u)));
          }
        }
      }
      p = e; d = d.clone().addScaledVector(lean, 0.25).add(new V(rnd(-0.15, 0.15), 0, rnd(-0.15, 0.15))).normalize(); r *= 0.8;
    }
    for (let i = 0; i < cnt(64); i++) {
      const u = new V(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)), off = new V(u.x, u.y * 0.3, u.z).multiplyScalar(k);
      needles.add(p.clone().add(off), new V(1.1, 0.42, 1.1).multiplyScalar(k * qs * rnd(0.8, 1.2)), undefined, ao(pick(GREEN), (0.66 + u.y * 0.3 + off.length() * 0.15) * moonLit(u)));
    }
    o.addCollider({ x, z, r: 0.4 * k });
  }
  function cypress(x: number, z: number) {
    gy = groundY(x, z);
    const H = rnd(8, 12.5), base = rnd(1.3, 1.9), barkCol = 0x3d2c24;
    roots(new V(x, gy, z), 0.2, barkCol);
    bark.push(tube(new V(x, gy, z), new V(x, gy + H * 0.92, z), 0.22, 0.05, 8, barkCol, gy));
    for (let y = 1.2; y < H; y += o.lite ? 0.32 : 0.2) {
      const t = y / H, rad = base * Math.pow(1 - t, 0.85) + 0.15, n = Math.max(4, Math.round(rad * (o.lite ? 8 : 11)));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-0.3, 0.3) + y * 1.7, f = rnd(0.45, 1), rr = rad * f;
        const u = new V(Math.cos(a), 0.3, Math.sin(a));
        needles.add(new V(x + Math.cos(a) * rr, gy + y + rnd(-0.1, 0.1), z + Math.sin(a) * rr), rnd(1.0, 1.6) * (0.6 + rad * 0.4) * qs, undefined, ao(pick([0x1a3321, 0x203c28, 0x27472e]), (0.45 + f * 0.6 + t * 0.2) * moonLit(u)));
      }
    }
    o.addCollider({ x, z, r: 0.45 });
  }
  function bamboo(x: number, z: number) {
    for (let j = 0; j < (o.lite ? 7 : 9); j++) {
      const h = rnd(6.5, 10.5), bx = x + rnd(-1.5, 1.5), bz = z + rnd(-1.5, 1.5), tilt = new V(rnd(-0.06, 0.06), 1, rnd(-0.06, 0.06)).normalize();
      const b0 = new V(bx, groundY(bx, bz) - 0.1, bz), top = b0.clone().addScaledVector(tilt, h);
      culms.push(tube(b0, top, 0.085, 0.06, o.lite ? 5 : 7));
      for (let y = 0.45; y < h; y += rnd(0.42, 0.55) * (o.lite ? 1.6 : 1)) {
        const ring = new THREE.TorusGeometry(0.08 - y * 0.002, 0.012, 4, o.lite ? 6 : 10); ring.rotateX(Math.PI / 2);
        const c = b0.clone().addScaledVector(tilt, y); ring.translate(c.x, c.y, c.z); culms.push(ring);
      }
      for (let i = 0; i < cnt(42); i++) {
        const y = rnd(h * 0.45, h), c = b0.clone().addScaledVector(tilt, y), a = rnd(0, TAU), r = rnd(0.1, 0.9) * (1.2 - y / h);
        const qq = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0.6, 1.4), a, rnd(-0.3, 0.3)));
        leaves.add(new V(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r), rnd(0.9, 1.4) * qs, 0, pick([0x6f9a3c, 0x7da845, 0x5c8a33, 0x8db24f]), qq);
      }
    }
    o.addCollider({ x, z, r: 1.7 });
  }
  /** a mossy rock; shape stretches it (sx across, sy up, sz along), turns it (ry) and sets its centre height (y) */
  function rock(x: number, z: number, k: number, solid = true, shape?: { sx?: number; sy?: number; sz?: number; ry?: number; y?: number }) {
    const g = jitter(new THREE.IcosahedronGeometry(k, 1), k * 0.22);
    if (shape) g.scale(shape.sx ?? 1, shape.sy ?? 1, shape.sz ?? 1); else g.scale(1, rnd(0.45, 0.75), 1);
    g.computeVertexNormals();
    const n = g.attributes.normal, cols: number[] = [];
    for (let i = 0; i < n.count; i++) {
      const moss = THREE.MathUtils.smoothstep(n.getY(i), 0.35, 0.85) * rnd(0.7, 1);
      const c = new THREE.Color(0x5a5d66).lerp(new THREE.Color(0x3d5a2e), moss).multiplyScalar(rnd(0.8, 1.15));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.rotateY(shape?.ry ?? rnd(0, TAU));
    roundedNormals(g);
    g.translate(x, groundY(x, z) + (shape?.y ?? k * 0.2), z);
    rockGeos.push(g);
    if (solid) o.addCollider({ x, z, r: k * 0.85 });
  }
  function bush(x: number, z: number) {
    const n = (rnd(16, 28) * (o.lite ? 0.7 : 1)) | 0, k = rnd(0.7, 1.3), flower = R() < 0.45 ? pick([0xff7aa8, 0xffffff, 0xd46cff]) : 0;
    for (let j = 0; j < n; j++) {
      const off = new V(rnd(-0.75, 0.75), rnd(0.1, 0.7), rnd(-0.75, 0.75)).multiplyScalar(k);
      off.y *= 1 - Math.hypot(off.x, off.z) / (1.3 * k);              // dome shape
      const px = x + off.x, pz = z + off.z, ly = Math.max(0.1, off.y), p = new V(px, groundY(px, pz) + ly, pz);
      bushes.add(p, new V(rnd(0.5, 0.85), rnd(0.4, 0.65), rnd(0.5, 0.85)).multiplyScalar(k), undefined, ao(pick([0x2a4a2c, 0x335a31, 0x24412a, 0x3d6634]), 0.45 + ly * 1.0));
      if (flower && ly > 0.3 * k) for (let f = 0; f < 3; f++) blooms.add(p.clone().add(new V(rnd(-0.2, 0.2), rnd(0.08, 0.2), rnd(-0.2, 0.2)).multiplyScalar(k)), rnd(0.7, 1.2), undefined, flower);
    }
    o.addCollider({ x, z, r: 0.6 * k });
  }
  function wildflower(x: number, z: number) {
    wild.add(new V(x, groundY(x, z) + rnd(0.45, 0.8), z), rnd(0.8, 1.4), undefined, pick([0x6f8dff, 0x8aa6ff, 0xffffff, 0xf2e27a, 0x9a7bff]));
  }
  function lowShrub(x: number, z: number, spread: number, height: number, angle: number, color: THREE.Color) {
    const rotation = new THREE.Quaternion().setFromAxisAngle(UP, angle);
    lowShrubs.add(new V(x, groundY(x, z), z), new V(spread, height, spread), angle, color, rotation);
  }

  /** emit the meshes (shadow + class + wind depth already set up) */
  function build(): KitMesh[] {
    const out: KitMesh[] = [];
    const put = (mesh: THREE.Mesh, depth: THREE.Material | null, blocker: boolean, shadow = true) => {
      if (depth) mesh.customDepthMaterial = depth;
      mesh.castShadow = shadow; mesh.receiveShadow = true;
      out.push({ mesh, blocker });
    };
    const merged = (geos: THREE.BufferGeometry[], mat: THREE.Material, depth: THREE.Material | null, blocker: boolean) => {
      if (!geos.length) return;
      const g = mergeGeometries(geos); geos.forEach(x => x.dispose());
      put(new THREE.Mesh(g, mat), depth, blocker);
    };
    const inst = (b: Batch, depth: THREE.Material | null, blocker: boolean, shadow = true) => {
      if (!b.m.length) return;
      const mesh = b.build(o.lite);
      put(mesh, depth, blocker, shadow);
      return mesh;
    };
    merged(rockGeos, MAT.rock, null, false);
    merged(bark, MAT.bark, MAT.depth.bark, true);
    merged(culms, MAT.culm, MAT.depth.culm, true);
    inst(blossoms, SPRAYS.blossoms.depth, true);
    inst(needles, SPRAYS.needles.depth, true);
    inst(leaves, MAT.depth.leaf, false);
    inst(petals, null, false, false);
    inst(bushes, SPRAYS.bushes.depth, false);
    inst(lowShrubs, MAT.depth.lowShrub, false);
    inst(blooms, MAT.depth.flower, false, false);
    inst(wild, MAT.depth.wild, false, false);
    return out;
  }
  return { sakura, pine, cypress, bamboo, rock, bush, lowShrub, wildflower, build, petalSources };
}
export type Kit = ReturnType<typeof createKit>;

// ------------------------------------------------------------ main: the clearing around the shrine
export function buildNature(scene: THREE.Scene, ctx: NatureCtx) {
  const { addCollider, isFree, camBlockers, inCompound, onPath } = ctx;
  const free = (minR: number, maxR: number, gap = 3): [number, number] | null => {
    for (let t = 0; t < 120; t++) {
      const a = R() * TAU, r = rnd(minR, maxR), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 4.5 && z < 8 && z > -16) continue;
      if (inCompound(x, z, 2.5)) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2) continue;
      if (treeBlocked(x, z)) continue;                 // the roads that leave the clearing
      if (isFree(x, z, gap)) return [x, z];
    }
    return null;
  };
  const addMesh = (mesh: THREE.Mesh, cls: number) => {
    tagMat(mesh.material as THREE.Material, cls);
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  };

  // ---------------- pond (placed first so everything else avoids it)
  // no collider: the pond is shallow and can be waded (pondDepth, structures.ts wadeDepth)
  const waterGeo = new THREE.CircleGeometry(POND.r, 64, 0, TAU);
  { // irregular shoreline
    const p = waterGeo.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const a = Math.atan2(p.getY(i), p.getX(i)), k = 1 + Math.sin(a * 3) * 0.08 + Math.sin(a * 7 + 1) * 0.05;
      p.setXY(i, p.getX(i) * k, p.getY(i) * k);
    }
  }
  const pondGrid = new THREE.PlaneGeometry(POND.r * 2.3, POND.r * 2.3);
  // the shared water shader (water.ts), clipped to the wobbly shoreline: shallow and clear, calm little swells
  const water = new THREE.Mesh(pondGrid, waterMaterial({
    key: 'pond', swell: 0.4, foam: 0.35, clear: 1.8, colour: 0x06121a, head: POND_SHORE_GLSL,
    shore: `vec2 l = vec2(p.x - ${POND.x.toFixed(2)}, ${POND.z.toFixed(2)} - p.y); shore = pondRadius(l) - length(l); q = p * 1.6;`
  }));
  water.rotation.x = -Math.PI / 2; water.position.set(POND.x, 0.06, POND.z);
  water.receiveShadow = true; scene.add(water);
  const bed = new THREE.Mesh(waterGeo, tagMat(new THREE.MeshStandardMaterial({ color: 0x0b1410, roughness: 1 }), CLS.ground));
  bed.rotation.x = -Math.PI / 2; bed.position.set(POND.x, 0.03, POND.z); scene.add(bed);
  const lilyMat = surfaceMaterial(new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide
  }), 'foliage');
  const lily = new Batch(new THREE.CircleGeometry(0.28, 12, 0.3, TAU - 0.5), lilyMat);
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, TAU), r = rnd(0.8, POND.r - 0.8);
    lily.add(new V(POND.x + Math.cos(a) * r, 0.09, POND.z + Math.sin(a) * r), rnd(0.7, 1.3), 0, pick([0x2f5a2a, 0x3c6b31, 0x284d27]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rnd(0, TAU))));
  }
  const lilyPads = addMesh(lily.build(false), CLS.foliage);
  lilyPads.castShadow = false;
  addRoundedSurface(lilyPads, new THREE.CircleGeometry(0.28, 32, 0.3, TAU - 0.5));
  const lotus = new Batch(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x401020, roughness: 0.5 }));
  for (let i = 0; i < 5; i++) { const a = rnd(0, TAU), r = rnd(1, POND.r - 1); lotus.add(new V(POND.x + Math.cos(a) * r, 0.14, POND.z + Math.sin(a) * r), 1, 0, 0xf6c2d6); }
  addMesh(lotus.build(false), CLS.foliage);

  const kit = createKit({ lite: false, addCollider, onPath });
  // ---------------- mossy rocks (incl. the pond rim)
  for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU + rnd(-0.1, 0.1), r = POND.r * (1 + Math.sin(a * 3) * 0.08 + Math.sin(a * 7 + 1) * 0.05) + rnd(0.05, 0.35); kit.rock(POND.x + Math.cos(a) * r, POND.z - Math.sin(a) * r, rnd(0.25, 0.55), false); }
  for (let i = 0; i < 26; i++) { const s = free(8, 44, 2); if (s) kit.rock(s[0], s[1], rnd(0.35, 1.2)); }
  // ---------------- trees
  for (let i = 0; i < 18; i++) { const s = free(8, 40, 3.5); if (s) kit.sakura(s[0], s[1]); }
  for (let i = 0; i < 12; i++) { const s = free(10, 42, 3.5); if (s) kit.pine(s[0], s[1]); }
  for (let i = 0; i < 22; i++) { const s = free(18, 47, 2.5); if (s) kit.cypress(s[0], s[1]); }
  for (let i = 0; i < 10; i++) { const s = free(14, 45, 3.5); if (s) kit.bamboo(s[0], s[1]); }
  // ---------------- bushes with blossoms
  for (let i = 0; i < 55; i++) { const s = free(6, 44, 1.2); if (s) kit.bush(s[0], s[1]); }
  // ---------------- wildflowers in the grass
  for (let i = 0; i < 3200; i++) {
    const a = rnd(0, TAU), r = Math.sqrt(R()) * 44, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (onPath(x, z) || inCompound(x, z, 0.5) || Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.4) continue;
    const g = groundAt(x, z); if (g[0] + g[1] + g[2] > 100) continue;
    // flowers grow in drifts
    if (Math.sin(x * 0.21) * Math.sin(z * 0.17 + 1.3) < 0.15) continue;
    kit.wildflower(x, z);
  }
  for (const { mesh, blocker } of kit.build()) { scene.add(mesh); if (blocker) camBlockers.push(mesh); }

  // ---------------- dense infinite grass
  buildGrass(scene);
  buildMeadowFlowers(scene);

  // ---------------- sakura petals drifting down from the canopies
  const petalSources = kit.petalSources;
  const PF = Math.min(420, petalSources.length * 6), pfPos = new Float32Array(PF * 3);
  const pfSeed: { src: THREE.Vector3; ox: number; oz: number; sp: number; ph: number; sw: number }[] = [];
  for (let i = 0; i < PF; i++) pfSeed.push({ src: petalSources[i % petalSources.length], ox: rnd(-0.7, 0.7), oz: rnd(-0.7, 0.7), sp: rnd(0.28, 0.5), ph: R() * 40, sw: rnd(0.8, 1.6) });
  const pfGeo = new THREE.BufferGeometry(); pfGeo.setAttribute('position', new THREE.BufferAttribute(pfPos, 3));
  const pfMat = tagMat(new THREE.PointsMaterial({ color: 0xf7c6d6, size: 0.075 }), CLS.foliage);
  const fallingPetals = new THREE.Points(pfGeo, pfMat); fallingPetals.frustumCulled = false;
  if (PF) scene.add(fallingPetals);

  // ---------------- fireflies (they travel with the player, hovering over whatever ground is there)
  const FF = 140, ffPos = new Float32Array(FF * 3), ffSeed = new Float32Array(FF * 3);
  for (let i = 0; i < FF; i++) { ffSeed.set([rnd(-24, 24), rnd(0.4, 2.4), rnd(-24, 24)], i * 3); }
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = tagMat(new THREE.PointsMaterial({ color: 0xd8ff7a, size: 0.12, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
  const fireflies = new THREE.Points(ffGeo, ffMat); fireflies.frustumCulled = false; scene.add(fireflies);

  return function update(t: number, center: XZ) {
    wind.uTime.value = t;
    wind.uCenter.value.set(center.x, center.z);
    for (let i = 0; i < FF; i++) {
      const sx = ffSeed[i * 3], sy = ffSeed[i * 3 + 1], sz = ffSeed[i * 3 + 2];
      let x = sx + Math.sin(t * 0.3 + i) * 1.5, z = sz + Math.cos(t * 0.25 + i * 1.7) * 1.5;
      x = center.x + ((x - center.x + 24) % 48 + 48) % 48 - 24; z = center.z + ((z - center.z + 24) % 48 + 48) % 48 - 24;
      ffPos.set([x, groundY(x, z) + sy + Math.sin(t * 0.8 + i * 2.1) * 0.3, z], i * 3);
    }
    ffGeo.attributes.position.needsUpdate = true;
    // petals: fall from their canopy, carried downwind and fluttering side to side, then respawn
    const nearClearing = Math.hypot(center.x, center.z) < 120;
    fallingPetals.visible = nearClearing;
    if (nearClearing) {
      const wa = 0.34 + 0.32 * Math.sin(t * 0.045) + 0.12 * Math.sin(t * 0.11 + 1.3), wx = Math.cos(wa), wz = Math.sin(wa);
      for (let i = 0; i < PF; i++) {
        const s = pfSeed[i], H = s.src.y, life = H / s.sp + 2.0, a = ((t + s.ph) % life) / life;
        const fall = a * H, y = Math.max(0.04, H - fall), flut = Math.sin((t + s.ph) * s.sw * 2.2) * 0.35;
        const carry = Math.min(fall, H) * 0.55;
        pfPos[i * 3] = s.src.x + s.ox + wx * carry - wz * flut;
        pfPos[i * 3 + 1] = y;
        pfPos[i * 3 + 2] = s.src.z + s.oz + wz * carry + wx * flut;
      }
      if (PF) pfGeo.attributes.position.needsUpdate = true;
    }
    ffMat.opacity = 0.55 + 0.45 * Math.sin(t * 2.3);
  };
}

// ------------------------------------------------------------ grass
/** GLSL: where grass (and the meadow flowers) may grow: 0 on paths, water, plazas and bare mountains */
const GRASS_KEEP = /* glsl */`
      float grassKeep(vec2 p) {
        if (abs(p.x) < 1.55 && p.y > -16.0 && p.y < 7.0) return 0.0;                 // stone path
        if (abs(p.x) < 12.3 && p.y < -14.7 && p.y > -31.3) return 0.0;               // shrine courtyard
        if (length(p - vec2(${POND.x.toFixed(1)}, ${POND.z.toFixed(1)})) < ${(POND.r + 0.15).toFixed(2)}) return 0.0; // pond
        if (length(p) > ${(WORLD_R + 20).toFixed(1)}) return 0.0;                     // bare mountains
        vec4 m = texture2D(uMask, (p + ${HALF.toFixed(1)}) / ${SIZE.toFixed(1)});
        return 1.0 - smoothstep(0.25, 0.5, max(m.r, max(m.g, m.b)));               // roads, water, plazas
      }
`;
/** the ground mask as a texture (roads, water and built ground have no grass) */
let maskTexture: THREE.DataTexture | null = null;
function grassMask() {
  if (maskTexture) return maskTexture;
  maskTexture = new THREE.DataTexture(groundMask, MASK_RES, MASK_RES, THREE.RGBAFormat);
  maskTexture.minFilter = maskTexture.magFilter = THREE.LinearFilter; maskTexture.needsUpdate = true;
  return maskTexture;
}
// A shared height field keeps flower heads nestled among the leaves in the low clearings.
const MEADOW_HEIGHT = /* glsl */`
  float meadowHeight(vec2 p, float meadow) {
    float growth = 0.80 * wNoise(p * 0.083 + vec2(4.8, -8.1)) + 0.20 * meadow;
    return smoothstep(0.36, 0.57, growth);
  }
`;
function buildGrass(scene: THREE.Scene) {
  const TILE = 84, tufts = 24000;
  const geo = grassTuft();
  const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, wind, terrainUniforms, { uMask: { value: grassMask() }, uDetailedSurfaces: detailedSurfaces });
    sh.vertexShader = WIND_GLSL + `
      uniform vec2 uCenter; uniform vec4 uPush[8]; uniform sampler2D uMask; uniform float uDetailedSurfaces;
      attribute vec4 aGrassOffsets;
      varying vec3 vGrassTint;
      varying float vAcross;
      ${GRASS_KEEP}
      ${MEADOW_HEIGHT}
    ` + sh.vertexShader
      .replace('#include <project_vertex>', /* glsl */`
        vec2 anchor = instanceMatrix[3].xz;
        vec2 tuft = anchor + ${TILE.toFixed(1)} * floor((uCenter - anchor) / ${TILE.toFixed(1)} + 0.5);
        vec2 offset = tuft - uCenter;
        mat3 basis = mat3(instanceMatrix);
        vec2 root = tuft + (basis * vec3(aGrassOffsets.x, 0.0, aGrassOffsets.y)).xz;
        float meadow = wNoise(tuft * 0.23);
        // Broad low clearings with smaller variations along their edges, fixed to the terrain.
        float tall = meadowHeight(tuft, meadow);
        float lengthScale = mix(0.34, 1.0, tall);
        float stand = 0.74 * wNoise(tuft * 0.61 + 13.2) + 0.26 * meadow;
        float sage = smoothstep(0.67, 0.78, stand) * mix(0.32, 1.0, tall);
        float variation = wHash(root * 19.7);
        float tip = uv.y;
        // The pale stands have wider, straighter leaves and catch the light as one group.
        vec3 leaf = transformed * lengthScale;
        // Short leaves still have a readable width at the normal play camera distance.
        leaf.xz += aGrassOffsets.zw * (0.58 * (1.0 - tall) + 1.8 * sage);
        vec3 local = basis * leaf;
        local.y *= (0.68 + 0.56 * meadow) * (1.0 + 0.28 * sage);
        vec3 base = vec3(root.x, terrainH(root) - 0.13, root.y);
        vec3 windBend = windAt(base, tip, (0.18 + variation * 0.14) * (1.0 - sage * 0.20), 0.006 * tip);
        local += windBend * lengthScale;
        for (int i = 0; i < 8; i++) {
          vec2 d = root - uPush[i].xy;
          float push = (1.0 - smoothstep(0.0, uPush[i].z, length(d))) * tip;
          local.xz += normalize(d + 1e-4) * push * (0.48 * lengthScale);
          local.y *= 1.0 - 0.65 * push;
        }
        // Fade before a tuft wraps to the opposite edge of the player-centred tile.
        float edge = 1.0 - smoothstep(33.0, 41.0, max(abs(offset.x), abs(offset.y)));
        vec4 wPos = vec4(base + local * (grassKeep(root) * edge), 1.0);
        vAcross = uv.x;
        if (uDetailedSurfaces > 0.5) {
          vec3 cool = mix(vec3(0.048, 0.118, 0.026), vec3(0.105, 0.215, 0.048), meadow);
          cool = mix(cool, vec3(0.082, 0.178, 0.038), (1.0 - tall) * 0.35);
          vGrassTint = mix(cool, vec3(0.195, 0.195, 0.058), sage);
          vGrassTint *= (0.64 + 0.52 * variation) * (0.52 + 0.58 * tip);
        } else {
          vec3 cool = mix(vec3(0.029, 0.044, 0.029), vec3(0.077, 0.101, 0.058), meadow);
          vGrassTint = mix(cool, vec3(0.182, 0.168, 0.055), sage);
          vGrassTint *= (0.58 + 0.56 * variation) * (0.38 + 0.62 * tip);
        }
        vec4 mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wPos;');
    sh.fragmentShader = 'uniform float uDetailedSurfaces; varying vec3 vGrassTint; varying float vAcross;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        // A narrow folded face reads as a stroke even seen from above.
        diffuseColor.rgb = vGrassTint * mix(0.78, 1.10, smoothstep(0.40, 0.65, vAcross));
        float thinFade = uDetailedSurfaces > 0.5 ? 0.18 : 0.40;
        diffuseColor.rgb *= 1.0 - thinFade * smoothstep(0.5, 1.8, fwidth(vAcross));`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => 'grass-tufts';
  tagMat(mat, CLS.grassBlade);
  const grass = new THREE.InstancedMesh(geo, mat, tufts);
  const random = seeded(18023), instance = new THREE.Object3D();
  for (let i = 0; i < tufts; i++) {
    instance.position.set((random() - 0.5) * TILE, 0, (random() - 0.5) * TILE);
    instance.rotation.y = random() * TAU;
    const spread = 0.70 + random() * 0.65;
    instance.scale.set(spread, 0.72 + random() * 0.59, spread);
    instance.updateMatrix();
    grass.setMatrixAt(i, instance.matrix);
  }
  grass.frustumCulled = false; grass.receiveShadow = true;
  scene.add(grass);
}

// ------------------------------------------------------------ meadow flowers (text view)
// Wild flowers as the text view draws a meadow: no stems, no little drawings, just specks of colour
// sown through the grass, one character each (* an open flower, . a bud). They grow in drifts of one
// tint (pink and white, buttercup, violet, poppy), feathered at the edges, and thin out with distance
// so the far meadow doesn't turn to confetti. Each speck sits on the text grid (its card covers exactly
// one cell, materials.ts asciiGrid), keeps its colour under any light and nods in the wind.
// The 3D view keeps its modelled wildflowers.
function buildMeadowFlowers(scene: THREE.Scene) {
  const TILE = 84, N = 5200;
  const g = (ch: string) => { const k = FLOWER_GLYPHS.indexOf(ch); if (k < 1) throw new Error(`flor sin glifo: ${ch}`); return k.toFixed(1); };
  const geo = new THREE.PlaneGeometry(1, 1).translate(0.5, 0.5, 0);   // unit card, 0..1 in x and y
  const seed = new Float32Array(N);
  // no fog: it would wash every petal to the same grey-blue (the moonlight still shades them)
  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide, fog: false });
  mat.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, asciiGrid, {
      uTime: wind.uTime, uCenter: wind.uCenter, uPush: wind.uPush, uHeight: terrainUniforms.uHeight, uMask: { value: grassMask() }
    });
    sh.vertexShader = WIND_GLSL + `
      uniform vec2 uCenter; uniform vec4 uPush[8]; uniform sampler2D uMask; uniform vec2 uCellPx, uRtPx;
      attribute float aSeed;
      varying vec2 vHeadCell; varying vec3 vPetal; varying float vBud;
      ${GRASS_KEEP}
      ${MEADOW_HEIGHT}
    ` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', 'vec3 objectNormal = vec3(0.0, 1.0, 0.0);')   // lit from above, like the grass round it
      .replace('#include <project_vertex>', /* glsl */`
        vec3 o = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec2 base = uCenter + mod(o.xz - uCenter + ${(TILE / 2).toFixed(1)}, ${TILE.toFixed(1)}) - ${(TILE / 2).toFixed(1)};
        // drifts with feathered edges: dense in the heart of a patch, a few strays round it
        float drift = wNoise(base * 0.06 + 3.7) * 0.7 + wNoise(base * 0.23 + 1.3) * 0.3;
        float keep = grassKeep(base) * step(0.5 + 0.14 * fract(aSeed * 7.13), drift);
        // one tint per drift, a little variation per flower
        float tint = floor(wNoise(base * 0.025 + 17.0) * 4.0 * 1.3);
        tint = mod(tint + step(0.93, fract(aSeed * 31.7)), 4.0);
        float v = fract(aSeed * 13.7);
        vec3 c = tint < 0.5 ? mix(vec3(1.0, 0.56, 0.72), vec3(1.0, 0.88, 0.92), step(0.6, v))     // pink and white
               : tint < 1.5 ? mix(vec3(1.0, 0.8, 0.16), vec3(1.0, 0.92, 0.5), step(0.7, v))      // buttercup
               : tint < 2.5 ? mix(vec3(0.58, 0.42, 1.0), vec3(0.42, 0.55, 1.0), step(0.55, v))    // violet and blue
               : mix(vec3(0.95, 0.18, 0.14), vec3(1.0, 0.45, 0.16), step(0.6, v));               // poppy
        vPetal = c * (0.85 + 0.3 * fract(aSeed * 91.3));
        vBud = step(0.72, fract(aSeed * 5.31));
        vec3 root = vec3(base.x, terrainH(base), base.y);
        float stem = mix(0.48, 1.0, meadowHeight(base, wNoise(base * 0.23)));
        vec3 head = root + vec3(0.0, stem * (0.32 + 0.2 * fract(aSeed * 3.7)), 0.0);
        head += windAt(head, 1.0, 0.4, 0.01) * stem;
        for (int i = 0; i < 8; i++) {                                       // lean away from feet
          vec2 d = base - uPush[i].xy;
          float push = smoothstep(uPush[i].z * 1.3, 0.0, length(d));
          head.xz += normalize(d + 1e-4) * push * 0.35 * stem; head.y -= push * 0.15 * stem;
        }
        vec4 mvPosition = viewMatrix * vec4(head, 1.0);
        float dist = length(mvPosition.xyz);
        keep *= step(fract(aSeed * 53.1), clamp(22.0 / dist, 0.15, 1.0));   // thinner far away: the same few specks per screen
        vec4 hc = projectionMatrix * mvPosition;
        vHeadCell = floor((hc.xy / hc.w * 0.5 + 0.5) * uRtPx / uCellPx);
        vec2 px = (vHeadCell + position.xy) * uCellPx;                     // the card is exactly that one cell
        // depth: as if 1.2 m nearer, so the speck shows over the blades round it (trees and walls still hide it)
        vec4 dc = projectionMatrix * vec4(mvPosition.xyz * max(0.0, 1.0 - 1.2 / dist), 1.0);
        gl_Position = vec4((px / uRtPx * 2.0 - 1.0) * hc.w, dc.z / dc.w * hc.w, hc.w);
        if (keep < 0.5 || hc.w < 0.5) gl_Position = vec4(2.0, 2.0, 2.0, 1.0);   // not growing here: off screen`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = modelMatrix * vec4(head, 1.0);');
    sh.fragmentShader = `#define PIXEL_CLS
      float pixelCls = 0.0;
      varying vec2 vHeadCell; varying vec3 vPetal; varying float vBud;
` + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
      diffuseColor.rgb = vPetal;
      pixelCls = 0.9 + (vBud > 0.5 ? ${g('.')} : ${g('*')}) * 0.002;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      totalEmissiveRadiance += diffuseColor.rgb * 0.04;           // still readable in the deepest shade`);
  };
  mat.customProgramCacheKey = () => 'meadow-specks';
  tagMat(mat, 0.9);
  const flowers = new THREE.InstancedMesh(geo, mat, N);
  const m4 = new THREE.Matrix4(), p = new V();
  for (let i = 0; i < N; i++) {
    flowers.setMatrixAt(i, m4.makeTranslation(p.set(rnd(-TILE / 2, TILE / 2), 0, rnd(-TILE / 2, TILE / 2))));
    seed[i] = R();
  }
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
  flowers.frustumCulled = false;
  showSurfaceDetail(flowers, false);
  scene.add(flowers);
}
