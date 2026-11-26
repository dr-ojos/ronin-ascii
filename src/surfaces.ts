// Materials and rounded geometry for the direct 3D view.
import * as THREE from 'three';
import { seeded } from './map';
import { DIRT, FINISH_HELPERS, MASONRY, PAVERS, PLASTER, SIDING, THATCH, TILES, ASCII_HELPERS, ASCII_TILES, ASCII_THATCH, ASCII_SIDING, ASCII_PLASTER, ASCII_MASONRY, ASCII_WOOD, ASCII_MOTTLE } from './architecture-finishes';

export const detailedSurfaces = { value: 0 };
/** Mid-afternoon sun direction shared by surface and foliage shaders in Mode T. */
export const sunsetSunDir = { value: new THREE.Vector3(-0.66, 0.60, -0.45).normalize() };
interface SurfaceVariant {
  geometry: THREE.BufferGeometry;
  material: THREE.Mesh['material'];
  depth: THREE.Material | undefined;
}
const surfaceVariants = new Map<THREE.Mesh, [SurfaceVariant, SurfaceVariant]>();
const modeDetails: { object: THREE.Object3D; detailed: boolean }[] = [];

export function setDetailedSurfaces(enabled: boolean) {
  const value = Number(enabled);
  if (detailedSurfaces.value === value) return;
  detailedSurfaces.value = value;
  for (const [mesh, variants] of surfaceVariants) applySurfaceVariant(mesh, variants[enabled ? 1 : 0]);
  for (const { object, detailed } of modeDetails) object.visible = enabled === detailed;
}

export function addRoundedSurface(mesh: THREE.Mesh, rounded: THREE.BufferGeometry) {
  addSurfaceVariant(mesh, rounded, mesh.material, mesh.customDepthMaterial);
}

function applySurfaceVariant(mesh: THREE.Mesh, variant: SurfaceVariant) {
  mesh.geometry = variant.geometry;
  mesh.material = variant.material;
  mesh.customDepthMaterial = variant.depth;
}

export function addSurfaceVariant(mesh: THREE.Mesh, geometry: THREE.BufferGeometry, material: THREE.Mesh['material'], depth: THREE.Material | undefined) {
  const detailed = { geometry, material, depth };
  surfaceVariants.set(mesh, [{ geometry: mesh.geometry, material: mesh.material, depth: mesh.customDepthMaterial }, detailed]);
  if (detailedSurfaces.value) applySurfaceVariant(mesh, detailed);
}

export function removeSurfaceVariant(mesh: THREE.Mesh) {
  surfaceVariants.delete(mesh);
}

export function showSurfaceDetail(object: THREE.Object3D, detailed = true) {
  object.visible = detailedSurfaces.value === Number(detailed);
  if (detailed) object.raycast = () => {};
  modeDetails.push({ object, detailed });
}

function tileNoise(width: number, height: number, random: () => number) {
  const grid = Float32Array.from({ length: width * height }, random);
  return (u: number, v: number) => {
    const x = u * width, y = v * height;
    const i = Math.floor(x), j = Math.floor(y);
    const at = (c: number, r: number) => grid[THREE.MathUtils.euclideanModulo(r, height) * width + THREE.MathUtils.euclideanModulo(c, width)];
    const tx = THREE.MathUtils.smoothstep(x - i, 0, 1), ty = THREE.MathUtils.smoothstep(y - j, 0, 1);
    const mix = THREE.MathUtils.lerp;
    return mix(mix(at(i, j), at(i + 1, j), tx), mix(at(i, j + 1), at(i + 1, j + 1), tx), ty);
  };
}

// One mipmapped tile packs broad stains, mineral grit and curved wood fibres into RGB.
function surfaceTexture() {
  const size = 512, data = new Uint8Array(size * size * 4), rng = seeded(6162);
  const stain = tileNoise(5, 5, rng), patches = tileNoise(17, 17, rng);
  const chips = tileNoise(38, 38, rng), dust = tileNoise(91, 91, rng);
  const rings = tileNoise(38, 4, rng), fibres = tileNoise(85, 9, rng);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const i = 4 * (y * size + x), u = x / size, v = y / size;
    const broad = stain(u, v), medium = patches(u, v);
    const grit = chips(u + broad * 0.023, v + medium * 0.033);
    const bend = u + 0.11 * stain(u, v + 0.2); // horizontal displacement varies slowly along the grain
    data[i] = 255 * (broad * 0.61 + medium * 0.39);
    data[i + 1] = 255 * (grit * 0.74 + dust(u, v) * 0.26);
    data[i + 2] = 255 * (rings(bend, v) * 0.62 + fibres(bend, v) * 0.38);
    data[i + 3] = 255;
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  return texture;
}

let texture: THREE.DataTexture | undefined;
const TRACK = '#define WORN_TRACK\n' + DIRT;
const SWEPT_TILES = '#define SWEPT_EAVES\n' + TILES;
const flagstone = /* glsl */`
  float patina = texture2D(uSurfaceTile, vSurfacePosition.xz * 0.28 + vec2(0.17, 0.41)).r;
  float lichen = smoothstep(0.57, 0.80, grit * 0.27 + stain * 0.39 + patina * 0.34);
  float crack = fissure * smoothstep(0.38, 0.70, patina);
  vec3 slate = diffuseColor.rgb * stoneTint * (0.80 + 0.32 * patina - 0.52 * crack);
  diffuseColor.rgb = mix(slate, vec3(0.084, 0.094, 0.041), lichen * 0.74);
  relief = mineral - 0.18 * crack;
`;
const paper = /* glsl */`
  float fibres = texture2D(uSurfaceTile, vSurfacePosition.xy * vec2(1.1, 0.52)).b;
  float paperAge = smoothstep(0.33, 0.72, stain * 0.73 + fibres * 0.27);
  // Preserve the separate paper light and stain it in the same places as the diffuse texture.
  paperTint = mix(vec3(1.0, 0.96, 0.86), vec3(0.75, 0.64, 0.49), paperAge);
  diffuseColor.rgb *= paperTint;
  relief = grit * 0.12;
`;
const cloth = /* glsl */`
  vec3 weave = surfaceSample(vSurfacePosition * vec3(0.92, 0.77, 0.92), worldNormal);
  float bleached = smoothstep(0.32, 0.75, stain * 0.59 + weave.b * 0.41);
  vec3 dyed = diffuseColor.rgb * (0.72 + 0.32 * grit + 0.13 * weave.b);
  diffuseColor.rgb = mix(dyed, mix(dyed, vec3(0.30, 0.218, 0.135), 0.25), bleached);
  relief = weave.g * 0.46 + weave.b * 0.26;
`;
const bark = /* glsl */`
  vec3 cork = tex;
  float seam = 1.0 - smoothstep(0.012, 0.094, abs(cork.b - 0.42 + 0.17 * (cork.r - 0.5)));
  seam *= smoothstep(0.24, 0.64, tex.r + cork.g * 0.17);
  float scale = smoothstep(0.27, 0.76, cork.g * 0.64 + cork.r * 0.36);
  vec3 tint = mix(vec3(0.65, 0.41, 0.27), vec3(1.85, 1.45, 1.03), scale);
  vec3 cambium = diffuseColor.rgb * tint * (1.0 - seam * 0.55);
  float rootMoss = (1.0 - smoothstep(0.06, 1.02, vBarkHeight)) * smoothstep(0.39, 0.64, tex.r * 0.7 + cork.g * 0.3);
  float lichen = smoothstep(0.61, 0.83, cork.r * 0.65 + grit * 0.35) * (1.0 - seam);
  cambium = mix(cambium, vec3(0.071, 0.080, 0.045), lichen * 0.56);
  diffuseColor.rgb = mix(cambium, vec3(0.044, 0.071, 0.022) * (0.73 + grit * 0.57), rootMoss * 0.79);
  relief = 0.44 * scale + 0.25 * grit - 0.43 * seam;
`;
const bamboo = /* glsl */`
  vec3 fibre = tex;
  float sap = smoothstep(0.24, 0.82, fibre.b * 0.64 + fibre.r * 0.36);
  float age = smoothstep(0.59, 0.83, stain * 0.61 + grit * 0.39);
  vec3 rind = mix(vec3(0.043, 0.091, 0.021), vec3(0.177, 0.244, 0.068), sap);
  diffuseColor.rgb = mix(rind, vec3(0.194, 0.148, 0.054), age * 0.62);
  relief = 0.25 * fibre.b + 0.23 * grit;
`;
const leafBlade = /* glsl */`
  vec2 blade = vBambooUv;
  float line = abs(blade.x - 0.5);
  float midrib = 1.0 - smoothstep(0.014, 0.043 + fwidth(line), line);
  float vein = pow(0.5 + 0.5 * sin((blade.y * 12.0 - line * 1.85) * 6.2832), 10.0);
  vein *= 1.0 - smoothstep(0.026, 0.073, fwidth(blade.y));
  vec3 leaf = diffuseColor.rgb * (0.66 + 0.40 * blade.y + 0.17 * grit);
  diffuseColor.rgb = leaf + vec3(0.043, 0.062, 0.018) * (midrib + vein * 0.19);
  relief = midrib * 0.32 + vein * 0.15 + grit * 0.13;
`;
interface FinishSpec {
  scale: number;
  stretch: number;
  bump: number;
  height: string;
  color: string;
  roughness: number;
  metalness?: number;
  sunGlow?: number;
  shader?: string;
}
const finishes = {
  stone: { scale: 0.46, stretch: 1, bump: 0.020, height: 'mineral', color: 'stoneTint', roughness: 0.78, sunGlow: 0.28 },
  boulder: { scale: 0.46, stretch: 1, bump: 0.017, height: 'mineral', color: 'stoneTint', roughness: 0.86, sunGlow: 0.22 },
  gravel: { scale: 0.73, stretch: 1, bump: 0.015, height: 'grit', color: 'gravelTint', roughness: 0.90 },
  wood: { scale: 0.48, stretch: 0.45, bump: 0.013, height: 'grain', color: 'woodTint', roughness: 0.68, sunGlow: 0.42 },
  boards: { scale: 0.48, stretch: 0.45, bump: 0.011, height: 'grain', color: 'woodTint', roughness: 0.70, sunGlow: 0.36 },
  clay: { scale: 0.53, stretch: 1, bump: 0.009, height: 'mineral', color: 'clayTint', roughness: 0.50, metalness: 0.16, sunGlow: 0.52 },
  foliage: { scale: 0.85, stretch: 1, bump: 0.005, height: 'grit', color: 'leafTint', roughness: 0.64, sunGlow: 0.45 },
  terrain: { scale: 0.34, stretch: 1, bump: 0.012, height: 'mineral', color: 'stoneTint', roughness: 0.96 },
  track: { scale: 0.75, stretch: 1, bump: 0.030, height: 'grit', color: '', roughness: 0.96, shader: TRACK },
  lane: { scale: 0.65, stretch: 1, bump: 0.024, height: 'grit', color: '', roughness: 0.95, shader: DIRT },
  pavers: { scale: 0.62, stretch: 1, bump: 0.027, height: 'mineral', color: '', roughness: 0.76, sunGlow: 0.26, shader: PAVERS },
  flagstone: { scale: 0.55, stretch: 1, bump: 0.022, height: 'mineral', color: '', roughness: 0.74, sunGlow: 0.28, shader: flagstone },
  tiles: { scale: 0.45, stretch: 1, bump: 0.016, height: 'mineral', color: '', roughness: 0.42, metalness: 0.22, sunGlow: 0.65, shader: TILES },
  sweptTiles: { scale: 0.45, stretch: 1, bump: 0.018, height: 'mineral', color: '', roughness: 0.40, metalness: 0.24, sunGlow: 0.68, shader: SWEPT_TILES },
  thatch: { scale: 0.43, stretch: 1, bump: 0.013, height: 'grit', color: '', roughness: 0.82, sunGlow: 0.36, shader: THATCH },
  siding: { scale: 0.42, stretch: 0.5, bump: 0.018, height: 'grain', color: '', roughness: 0.70, sunGlow: 0.38, shader: SIDING },
  plaster: { scale: 0.54, stretch: 1, bump: 0.008, height: 'grit', color: '', roughness: 0.76, sunGlow: 0.32, shader: PLASTER },
  masonry: { scale: 0.46, stretch: 1, bump: 0.036, height: 'mineral', color: '', roughness: 0.76, sunGlow: 0.30, shader: MASONRY },
  paper: { scale: 0.67, stretch: 1, bump: 0.003, height: 'grit', color: '', roughness: 0.88, sunGlow: 0.20, shader: paper },
  cloth: { scale: 0.42, stretch: 1, bump: 0.005, height: 'grit', color: '', roughness: 0.90, sunGlow: 0.24, shader: cloth },
  bark: { scale: 0.90, stretch: 0.35, bump: 0.018, height: 'grain', color: '', roughness: 0.76, sunGlow: 0.38, shader: bark },
  bamboo: { scale: 0.90, stretch: 0.32, bump: 0.006, height: 'grain', color: '', roughness: 0.36, metalness: 0.06, sunGlow: 0.55, shader: bamboo },
  leafBlade: { scale: 0.82, stretch: 1, bump: 0.002, height: 'grit', color: '', roughness: 0.44, sunGlow: 0.55, shader: leafBlade },
} satisfies Record<string, FinishSpec>;

/** what the buildings show in the text view, where the detailed finishes above are switched off */
const asciiFinishes: Partial<Record<keyof typeof finishes, string>> = {
  tiles: ASCII_TILES(false), sweptTiles: ASCII_TILES(true), clay: ASCII_MOTTLE, thatch: ASCII_THATCH,
  siding: ASCII_SIDING, plaster: ASCII_PLASTER, masonry: ASCII_MASONRY, wood: ASCII_WOOD, boards: ASCII_WOOD, stone: ASCII_MOTTLE
};

export function surfaceMaterial(mat: THREE.MeshStandardMaterial, style: keyof typeof finishes, smooth?: 'mesh' | 'rounded') {
  const finish: FinishSpec = finishes[style], compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey();
  const pattern = finish.shader ?? '', ascii = asciiFinishes[style] ?? '';
  const sunGlow = finish.sunGlow ?? 0;
  const finishMetal = finish.metalness ?? 0;
  const finishVarying = style === 'sweptTiles' ? 'varying vec2 vRoofPanelPosition;\n'
    : style === 'bark' ? 'varying float vBarkHeight;\n'
    : style === 'leafBlade' ? 'varying vec2 vBambooUv;\n' : '';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.uniforms.uDetailedSurfaces = detailedSurfaces;
    sh.uniforms.uSurfaceTile = { value: texture ??= surfaceTexture() };
    sh.uniforms.uSunDir = sunsetSunDir;
    const smoothVarying = smooth ? 'varying vec3 vSurfaceNormal;\n' : '';
    sh.vertexShader = `varying vec3 vSurfacePosition;
uniform float uDetailedSurfaces;
${smoothVarying}${finishVarying}${smooth === 'rounded' ? 'attribute vec3 aRoundedNormal;\n' : ''}
${style === 'bark' ? 'attribute float aBarkHeight;\n' : ''}` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${smooth === 'rounded' ? 'if (uDetailedSurfaces > 0.5) objectNormal = aRoundedNormal;' : ''}`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        ${smooth ? 'vSurfaceNormal = normalize(transformedNormal);' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${style === 'sweptTiles' ? 'vRoofPanelPosition = position.xz;' : ''}
        ${style === 'bark' ? 'vBarkHeight = aBarkHeight;' : ''}
        ${style === 'leafBlade' ? 'vBambooUv = uv;' : ''}
        vSurfacePosition = vec3(0.0);
        if (uDetailedSurfaces > 0.5 || ${ascii ? 'true' : 'false'}) {
          vec4 surfacePosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            surfacePosition = instanceMatrix * surfacePosition;
          #endif
          vSurfacePosition = (modelMatrix * surfacePosition).xyz;
        }`);
    sh.fragmentShader = `varying vec3 vSurfacePosition;
${smoothVarying}${finishVarying}
uniform float uDetailedSurfaces;
uniform sampler2D uSurfaceTile;
uniform vec3 uSunDir;

vec3 surfaceSample(vec3 p, vec3 n) {
  vec3 w = pow(abs(n), vec3(5.0));
  w /= w.x + w.y + w.z;
  vec2 scale = vec2(1.0, ${finish.stretch.toFixed(2)});
  return texture2D(uSurfaceTile, p.zy * scale).rgb * w.x
       + texture2D(uSurfaceTile, p.xz * scale + vec2(0.31, 0.62)).rgb * w.y
       + texture2D(uSurfaceTile, p.xy * scale + vec2(0.63, 0.27)).rgb * w.z;
}

vec3 surfaceRelief(vec3 n, float h, vec3 p) {
  vec3 dx = dFdx(p), dy = dFdy(p);
  vec3 rx = cross(dy, n), ry = cross(n, dx);
  float det = dot(dx, rx);
  vec3 gradient = (dFdx(h) * rx + dFdy(h) * ry) * sign(det) / max(abs(det), 0.000001);
  return normalize(n - gradient / max(1.0, length(gradient) * 1.5));
}
${pattern || ascii ? FINISH_HELPERS : ''}
${ascii ? ASCII_HELPERS : ''}
` + sh.fragmentShader
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    if (uDetailedSurfaces > 0.5) {
      ${smooth ? 'normal = normalize(vSurfaceNormal * faceDirection);' : ''}
      vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
      vec3 p = vSurfacePosition * ${finish.scale.toFixed(2)};
      ${style === 'boards' ? `float board = vSurfacePosition.x / 0.29;
        float offset = fract(sin(floor(board) * 31.87) * 47.51);
        p += vec3(offset * 0.5, 0.0, offset);` : ''}
      ${style === 'terrain' ? 'vec3 tex = texture2D(uSurfaceTile, p.xz).rgb;' : 'vec3 tex = surfaceSample(p, worldNormal);'}
      float stain = smoothstep(0.25, 0.77, tex.r);
      float grit = smoothstep(0.28, 0.77, tex.g);
      float grain = smoothstep(0.23, 0.76, tex.b);
      float fissure = 1.0 - smoothstep(0.007, 0.053, abs(tex.r - 0.38));
      float mineral = stain * 0.53 + grit * 0.47 - fissure * 0.13;
      vec3 stoneTint = mix(vec3(0.37, 0.41, 0.47), vec3(1.24, 1.19, 1.05), mineral);
      vec3 gravelTint = mix(vec3(0.40, 0.35, 0.30), vec3(1.63, 1.39, 1.13), grit * (0.6 + 0.4 * stain));
      vec3 woodTint = mix(vec3(0.43, 0.31, 0.24), vec3(1.32, 1.15, 0.98), grain * 0.7 + stain * 0.3);
      vec3 clayTint = mix(vec3(0.39, 0.44, 0.53), vec3(1.07, 1.03, 0.96), mineral);
      vec3 leafTint = mix(vec3(0.68, 0.66, 0.62), vec3(1.14, 1.16, 1.07), grit);
      ${style === 'boulder' ? `float moss = smoothstep(0.44, 0.92, worldNormal.y * 0.76 + stain * 0.50);
        diffuseColor.rgb = mix(vec3(0.108, 0.115, 0.132), vec3(0.042, 0.084, 0.029), moss);` : ''}
      ${finish.color ? `diffuseColor.rgb *= ${finish.color};` : ''}
      ${style === 'terrain' ? `vec3 turf = mix(vec3(0.010, 0.072, 0.022), vec3(0.028, 0.145, 0.038), stain);
        turf = mix(turf, vec3(0.016, 0.062, 0.020), smoothstep(0.55, 0.92, 1.0 - grit) * 0.30);
        diffuseColor.rgb = mix(turf * (0.78 + 0.44 * grit), diffuseColor.rgb, smoothstep(0.1, 0.75, vRock));` : ''}
      ${style === 'boards' ? `float joint = abs(fract(board + 0.5) - 0.5);
        float seam = smoothstep(0.013, 0.020 + fwidth(board), joint);
        diffuseColor.rgb *= mix(0.36, 0.86 + offset * 0.22, mix(1.0, seam, abs(worldNormal.y)));` : ''}
      float relief = ${finish.height};
      ${pattern}
      roughnessFactor = clamp(min(roughnessFactor, ${finish.roughness.toFixed(2)}) + (0.5 - relief) * 0.18, 0.24, 0.98);
      metalnessFactor = ${finishMetal > 0 ? `max(metalnessFactor, ${finishMetal.toFixed(2)})` : '0.0'};
      if (dot(vViewPosition, vViewPosition) < 1600.0) normal = surfaceRelief(normal, relief * ${finish.bump.toFixed(3)}, -vViewPosition);
    }${ascii ? ` else {
      vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
      ${ascii}
    }` : ''}`);
    if (sunGlow > 0) {
      // Shadow-aware warm mid-afternoon sheen & sunlight rim on sunlit building and tree surfaces in Mode T.
      sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      if (uDetailedSurfaces > 0.5) {
        float sunLit = smoothstep(0.02, 0.24, length(reflectedLight.directDiffuse));
        vec3 sunV = normalize((viewMatrix * vec4(uSunDir, 0.0)).xyz);
        float sunSide = smoothstep(-0.15, 0.65, dot(geometryNormal, sunV));
        float fres = pow(1.0 - clamp(dot(geometryNormal, geometryViewDir), 0.0, 1.0), 2.3);
        reflectedLight.directSpecular += vec3(1.0, 0.90, 0.72) * fres * sunSide * sunLit * ${sunGlow.toFixed(2)};
        reflectedLight.directDiffuse += reflectedLight.directDiffuse * vec3(0.18, 0.14, 0.06) * sunSide * ${(sunGlow * 0.75).toFixed(2)};
      }`);
    }
    if (ascii.includes('asciiLift')) {
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', 'vec3 asciiLift = vec3(0.0);\n#include <map_fragment>')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += asciiLift;');
    }
    if (style === 'paper') {
      // The paper light uses an emissive map, applied after the normal and diffuse weathering.
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <map_fragment>', 'vec3 paperTint = vec3(1.0);\n#include <map_fragment>')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance *= paperTint;');
    }
  };
  mat.customProgramCacheKey = () => `${cacheKey}|surface:${style}:${smooth ?? ''}`;
  return mat;
}
