// Material helpers. Every material carries a "class" (grass, wood, actor...) in the alpha channel
// of the rendered scene; the ASCII pass uses it to pick a glyph ramp per material.
import * as THREE from 'three';

export const M = (color: THREE.ColorRepresentation, o: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, ...o });
// material class goes into the alpha channel; the ASCII pass picks a glyph ramp per class
export const CLS = { grass: 0.1, grassBlade: 0.12, ground: 0.2, wood: 0.3, foliage: 0.4, foliageLeaf: 0.42, light: 0.5, actor: 0.6, fx: 0.7, water: 0.8, sky: 1.0 };
export const BLADE_SPARK_ALPHA = 0.75;
export const BLADE_SHEEN_ALPHA = 0.66;

export function keepAlpha<T extends THREE.Material>(mat: T, additive: boolean): T {
  Object.assign(mat, {
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor, blendDst: additive ? THREE.OneFactor : THREE.OneMinusSrcAlphaFactor,
    blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor
  });
  return mat;
}
export function tagMat<T extends THREE.Material>(mat: T, cls: number): T {
  if (mat.userData.cls !== undefined) return mat;
  mat.userData.cls = cls;
  if (mat.transparent) return keepAlpha(mat, mat.blending === THREE.AdditiveBlending);
  const prev = mat.onBeforeCompile, key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    // a shader that #defines PIXEL_CLS can reclass single pixels (a road's puddles draw as water)
    sh.fragmentShader = sh.fragmentShader.replace(/}\s*$/, `  gl_FragColor.a = ${cls.toFixed(2)};
#ifdef PIXEL_CLS
  if (pixelCls > 0.0) gl_FragColor.a = pixelCls;
#endif
}`);
  };
  mat.customProgramCacheKey = () => key() + '|cls' + cls;
  return mat;
}
export function tagTree<T extends THREE.Object3D>(obj: T, cls: number): T {
  obj.traverse(o => {
    const m = (o as THREE.Mesh).material;
    if (m) (Array.isArray(m) ? m : [m]).forEach(mm => tagMat(mm, cls));
  });
  return obj;
}
export function shadowTree<T extends THREE.Object3D>(obj: T): T {
  obj.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return obj;
}
export const box = (w: number, h: number, d: number, m: THREE.Material) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);

/** The text view's grid, in pixels of the scene render (ascii.ts keeps it current): world-anchored ASCII
 *  art (the meadow flowers, nature.ts) lays its characters out cell by cell on it. */
export const asciiGrid = { uCellPx: { value: new THREE.Vector2(4, 7) }, uRtPx: { value: new THREE.Vector2(1, 1) } };
/** glyphs of the ASCII-art flowers: two atlas rows of 12, each starting blank. A flower pixel carries
 *  class 0.9 + code * 0.002, code = index in this string. */
export const FLOWER_GLYPHS = " |/\\()@*oYvV" + " wW_-.,'~:%&";
