// Material helpers. Every material carries a "class" (grass, wood, actor...) in the alpha channel
// of the rendered scene; the ASCII pass uses it to pick a glyph ramp per material.
import * as THREE from 'three';

export const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });
// material class goes into the alpha channel; the ASCII pass picks a glyph ramp per class
export const CLS = { grass: 0.1, ground: 0.2, wood: 0.3, foliage: 0.4, light: 0.5, actor: 0.6, fx: 0.7, sky: 1.0 };
export function keepAlpha(mat, additive) {
  Object.assign(mat, {
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor, blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
  });
  return mat;
}
export function tagMat(mat, cls) {
  if (mat.userData.cls !== undefined) return mat;
  mat.userData.cls = cls;
  if (mat.transparent) return keepAlpha(mat, mat.blending === THREE.AdditiveBlending);
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, `  gl_FragColor.a = ${cls.toFixed(2)};\n}`);
  };
  mat.customProgramCacheKey = () => key() + '|cls' + cls;
  return mat;
}
export function tagTree(obj, cls) {
  obj.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => tagMat(m, cls)); });
  return obj;
}
export function shadowTree(obj) { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); return obj; }
export const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
