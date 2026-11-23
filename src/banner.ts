// Cloth banners that wave in the wind: the edge laced to the pole stays put, travelling ripples grow
// towards the free edge, and every banner keeps its own phase and gusts (taken from where it stands).
// Everything moves in the vertex shader on the shared clock (wind.uTime), shadows included.
import * as THREE from 'three';
import { M, CLS, tagMat } from './materials';
import { wind } from './nature';

type ShaderParams = Parameters<THREE.Material['onBeforeCompile']>[0];

// x runs 0 (pole) .. 1 (free edge), y -0.5 .. 0.5; enough rows and columns for the ripples to bend
const GEO = new THREE.PlaneGeometry(1, 1, 12, 8).translate(0.5, 0, 0);

const WAVE = /* glsl */`
uniform float uTime;
// p in geometry units (before the mesh scale); returns the cloth's displacement out of its plane
float bannerWave(vec3 p, float ph) {
  float u = p.x;
  float gust = 0.55 + 0.45 * sin(uTime * 0.21 + ph) * sin(uTime * 0.083 + ph * 1.7);
  float ripple = sin(u * 6.5 - uTime * 3.4 + ph + p.y * 1.4);
  float flutter = sin(u * 15.0 - uTime * 7.3 + ph * 2.0 + p.y * 3.0) * 0.22;
  return (ripple + flutter) * u * (0.1 + 0.2 * gust);
}
`;

const inject = (sh: ShaderParams) => {
  sh.uniforms.uTime = wind.uTime;
  sh.vertexShader = WAVE + sh.vertexShader
    .replace('#include <beginnormal_vertex>', /* glsl */`
      float bPh = dot(modelMatrix[3].xz, vec2(0.37, 0.61));
      float bZ = bannerWave(position, bPh);
      float dzdx = (bannerWave(position + vec3(0.02, 0.0, 0.0), bPh) - bZ) / 0.02;
      float dzdy = (bannerWave(position + vec3(0.0, 0.02, 0.0), bPh) - bZ) / 0.02;
      vec3 objectNormal = normalize(vec3(-dzdx, -dzdy, 1.0));
      #ifdef USE_TANGENT
        vec3 objectTangent = vec3(1.0, 0.0, 0.0);
      #endif`)
    .replace('#include <begin_vertex>', /* glsl */`
      vec3 transformed = position;
      transformed.z += bZ;
      transformed.x *= 1.0 - abs(bZ) * 0.25;   // the cloth gathers instead of stretching as it bends`);
};
// the shadow pass has no normals: only the displacement
const injectDepth = (sh: ShaderParams) => {
  sh.uniforms.uTime = wind.uTime;
  sh.vertexShader = WAVE + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */`
    vec3 transformed = position;
    float bZ = bannerWave(position, dot(modelMatrix[3].xz, vec2(0.37, 0.61)));
    transformed.z += bZ;
    transformed.x *= 1.0 - abs(bZ) * 0.25;`);
};
const depthMat = (() => {
  const d = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, side: THREE.DoubleSide });
  d.onBeforeCompile = injectDepth;
  d.customProgramCacheKey = () => 'banner-depth';
  return d;
})();

const mats = new Map<number, THREE.MeshStandardMaterial>();
/** waving cloth of this colour (shared by every banner of the colour) */
export function bannerMat(color: number) {
  let m = mats.get(color);
  if (!m) {
    m = M(color, { roughness: 1, side: THREE.DoubleSide });
    m.onBeforeCompile = inject;
    m.customProgramCacheKey = () => 'banner';
    tagMat(m, CLS.wood);
    mats.set(color, m);
  }
  return m;
}

/** a w x h banner laced to a pole at (x, y, z) of parent (y = its middle), flying towards ry */
export function banner(parent: THREE.Object3D, mat: THREE.Material, x: number, y: number, z: number, w: number, h: number, ry: number) {
  const b = new THREE.Mesh(GEO, mat);
  b.position.set(x, y, z); b.scale.set(w, h, 1); b.rotation.y = ry;
  b.customDepthMaterial = depthMat;
  parent.add(b);
  return b;
}
