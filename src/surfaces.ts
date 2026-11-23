// Materials and rounded geometry for the direct 3D view.
import * as THREE from 'three';
import { seeded } from './map';
import { DIRT, FINISH_HELPERS, MASONRY, PAVERS, PLASTER, SIDING, THATCH, TILES } from './architecture-finishes';

export const detailedSurfaces = { value: 0 };
const geometryVariants: { mesh: THREE.Mesh; original: THREE.BufferGeometry; rounded: THREE.BufferGeometry }[] = [];
const modeDetails: { object: THREE.Object3D; detailed: boolean }[] = [];

export function setDetailedSurfaces(enabled: boolean) {
  const value = Number(enabled);
  if (detailedSurfaces.value === value) return;
  detailedSurfaces.value = value;
  for (const { mesh, original, rounded } of geometryVariants) mesh.geometry = enabled ? rounded : original;
  for (const { object, detailed } of modeDetails) object.visible = enabled === detailed;
}

export function addRoundedSurface(mesh: THREE.Mesh, rounded: THREE.BufferGeometry) {
  geometryVariants.push({ mesh, original: mesh.geometry, rounded });
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
const finishes = {
  stone: { scale: 0.46, stretch: 1, bump: 0.020, height: 'mineral', color: 'stoneTint', roughness: 0.94 },
  boulder: { scale: 0.46, stretch: 1, bump: 0.017, height: 'mineral', color: 'stoneTint', roughness: 0.96 },
  gravel: { scale: 0.73, stretch: 1, bump: 0.015, height: 'grit', color: 'gravelTint', roughness: 0.98 },
  wood: { scale: 0.48, stretch: 0.45, bump: 0.013, height: 'grain', color: 'woodTint', roughness: 0.90 },
  boards: { scale: 0.48, stretch: 0.45, bump: 0.011, height: 'grain', color: 'woodTint', roughness: 0.90 },
  clay: { scale: 0.53, stretch: 1, bump: 0.009, height: 'mineral', color: 'clayTint', roughness: 0.93 },
  foliage: { scale: 0.85, stretch: 1, bump: 0.005, height: 'grit', color: 'leafTint', roughness: 0.94 },
  terrain: { scale: 0.34, stretch: 1, bump: 0.012, height: 'mineral', color: 'stoneTint', roughness: 0.98 },
  track: { scale: 0.75, stretch: 1, bump: 0.030, height: 'grit', color: '', roughness: 0.99, shader: TRACK },
  lane: { scale: 0.65, stretch: 1, bump: 0.024, height: 'grit', color: '', roughness: 0.99, shader: DIRT },
  pavers: { scale: 0.62, stretch: 1, bump: 0.027, height: 'mineral', color: '', roughness: 0.97, shader: PAVERS },
  flagstone: { scale: 0.55, stretch: 1, bump: 0.022, height: 'mineral', color: '', roughness: 0.95, shader: flagstone },
  tiles: { scale: 0.45, stretch: 1, bump: 0.016, height: 'mineral', color: '', roughness: 0.92, shader: TILES },
  sweptTiles: { scale: 0.45, stretch: 1, bump: 0.018, height: 'mineral', color: '', roughness: 0.92, shader: SWEPT_TILES },
  thatch: { scale: 0.43, stretch: 1, bump: 0.013, height: 'grit', color: '', roughness: 0.98, shader: THATCH },
  siding: { scale: 0.42, stretch: 0.5, bump: 0.018, height: 'grain', color: '', roughness: 0.93, shader: SIDING },
  plaster: { scale: 0.54, stretch: 1, bump: 0.008, height: 'grit', color: '', roughness: 0.98, shader: PLASTER },
  masonry: { scale: 0.46, stretch: 1, bump: 0.036, height: 'mineral', color: '', roughness: 0.97, shader: MASONRY },
  paper: { scale: 0.67, stretch: 1, bump: 0.003, height: 'grit', color: '', roughness: 0.94, shader: paper },
  cloth: { scale: 0.42, stretch: 1, bump: 0.005, height: 'grit', color: '', roughness: 0.97, shader: cloth },
};

export function surfaceMaterial(mat: THREE.MeshStandardMaterial, style: keyof typeof finishes, smooth?: 'mesh' | 'rounded') {
  const finish = finishes[style], compile = mat.onBeforeCompile, cacheKey = mat.customProgramCacheKey();
  const pattern = 'shader' in finish ? finish.shader : '';
  const roofVarying = style === 'sweptTiles' ? 'varying vec2 vRoofPanelPosition;\n' : '';
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.uniforms.uDetailedSurfaces = detailedSurfaces;
    sh.uniforms.uSurfaceTile = { value: texture ??= surfaceTexture() };
    const smoothVarying = smooth ? 'varying vec3 vSurfaceNormal;\n' : '';
    sh.vertexShader = `varying vec3 vSurfacePosition;
uniform float uDetailedSurfaces;
${smoothVarying}${roofVarying}${smooth === 'rounded' ? 'attribute vec3 aRoundedNormal;\n' : ''}` + sh.vertexShader
      .replace('#include <beginnormal_vertex>', `#include <beginnormal_vertex>
        ${smooth === 'rounded' ? 'if (uDetailedSurfaces > 0.5) objectNormal = aRoundedNormal;' : ''}`)
      .replace('#include <defaultnormal_vertex>', `#include <defaultnormal_vertex>
        ${smooth ? 'vSurfaceNormal = normalize(transformedNormal);' : ''}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        ${style === 'sweptTiles' ? 'vRoofPanelPosition = position.xz;' : ''}
        vSurfacePosition = vec3(0.0);
        if (uDetailedSurfaces > 0.5) {
          vec4 surfacePosition = vec4(position, 1.0);
          #ifdef USE_INSTANCING
            surfacePosition = instanceMatrix * surfacePosition;
          #endif
          vSurfacePosition = (modelMatrix * surfacePosition).xyz;
        }`);
    sh.fragmentShader = `varying vec3 vSurfacePosition;
${smoothVarying}${roofVarying}
uniform float uDetailedSurfaces;
uniform sampler2D uSurfaceTile;

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
${pattern ? FINISH_HELPERS : ''}
` + sh.fragmentShader
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    if (uDetailedSurfaces > 0.5) {
      ${smooth ? 'normal = normalize(vSurfaceNormal * faceDirection);' : ''}
      vec3 worldNormal = inverseTransformDirection(normal, viewMatrix);
      vec3 p = vSurfacePosition * ${finish.scale.toFixed(2)};
      ${style === 'boards' ? `float board = vSurfacePosition.x / 0.29;
        float offset = fract(sin(floor(board) * 31.87) * 47.51);
        p += vec3(offset * 0.5, 0.0, offset);` : ''}
      vec3 tex = surfaceSample(p, worldNormal);
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
      ${style === 'terrain' ? `vec3 soil = mix(vec3(0.019, 0.013, 0.007), vec3(0.049, 0.036, 0.017), stain);
        diffuseColor.rgb = mix(soil * (0.76 + 0.51 * grit), diffuseColor.rgb, smoothstep(0.1, 0.75, vRock));` : ''}
      ${style === 'boards' ? `float joint = abs(fract(board + 0.5) - 0.5);
        float seam = smoothstep(0.013, 0.020 + fwidth(board), joint);
        diffuseColor.rgb *= mix(0.36, 0.86 + offset * 0.22, mix(1.0, seam, abs(worldNormal.y)));` : ''}
      roughnessFactor = max(roughnessFactor, ${finish.roughness.toFixed(2)});
      metalnessFactor = 0.0;
      float relief = ${finish.height};
      ${pattern}
      normal = surfaceRelief(normal, relief * ${finish.bump.toFixed(3)}, -vViewPosition);
    }`);
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
