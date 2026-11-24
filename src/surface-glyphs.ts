// Surface glyphs: the characters' letters are printed ON their 3D surface instead of being laid
// out on a screen grid. Every lit material of a figure (manga-art.ts installs this) tiles its own
// skin with character cells anchored to the bind pose, so the letters ride on the cloth as it
// folds, turn with the body and foreshorten with the perspective. Light picks how dense the
// letter is (punctuation in the shadow, lower case in the half-tones, capitals and blocks where
// lit) and how bright it shines; between the strokes the surface sinks to a dark backing, so the
// figure stays a solid volume made of text.
//
// The letter size follows how big the ronin is on screen (fitGlyphs), in steps, so the letters
// stay legible far away and get finer close up without swimming every frame.
import * as THREE from 'three';
import { DPR } from './renderer';

const COLS = 16;
// three bands per material: shadow, half-tone, light
const SETS = [
  // cloth: soft, woven
  ".,:;'`-~.,:;'`-~", "sczeouvnrxawmcos", "SZ52%&$#8NMWQ@Bs",
  // metal / lacquer: hard strokes
  ".-:=_'.-:=_'.-:=", "=+|/\\ilt17ji=+|/", "#H$%&8@MNWE#H$%E",
  // skin: round letters
  ".,:o.,:o.,:o.,:o", "coaeoucanoeaucoe", "OQ0@GDCOQ0@GDBO8"
];
for (const s of SETS) if (s.length !== COLS) throw new Error('glyph set must have ' + COLS + ' letters: ' + s);
const ROWS = SETS.length;

const atlas = (() => {
  const gw = 40, gh = 64, c = document.createElement('canvas');
  c.width = gw * COLS; c.height = gh * ROWS;
  const x = c.getContext('2d')!;
  x.fillStyle = '#000'; x.fillRect(0, 0, c.width, c.height);
  x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.font = `bold ${Math.round(gh * 0.78)}px "Courier New", Courier, monospace`;
  SETS.forEach((set, r) => [...set].forEach((ch, i) => x.fillText(ch, i * gw + gw / 2, r * gh + gh / 2 + 2)));
  const t = new THREE.CanvasTexture(c);
  t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  return t;
})();

/** shared by every figure material and by the final ASCII pass (ascii.ts) */
export const surfaceGlyphs = {
  uSurfGlyph: { value: 1 },        // 1: letters on the surface; 0: the classic screen-grid characters
  uGlyphH: { value: 0.06 },        // letter height in metres
  tGlyphs: { value: atlas }
};

const VERT = /* glsl */`
{
  // anchor: the bind-pose position, in metres (local -> world scale, skinning included)
  mat3 gM = mat3(modelMatrix);
#ifdef USE_SKINNING
  gM = gM * mat3(skinMatrix);
#endif
  float gS = (length(gM[0]) + length(gM[1]) + length(gM[2])) / 3.0;
#ifdef GLYPH_REST
  // simulated cloth (cloth.ts): anchor to its rest drape, not to where it flaps now
  vGlyphP = glyphRest * gS; vGlyphN = glyphRestN;
#else
  vGlyphP = position * gS; vGlyphN = normal;
#endif
#ifdef USE_SKINNING
  // the mocap bodies are modelled Z-up: turn them Y-up like everything else
  vGlyphP = vec3(vGlyphP.x, vGlyphP.z, -vGlyphP.y); vGlyphN = vec3(vGlyphN.x, vGlyphN.z, -vGlyphN.y);
#endif
}
`;

const FRAG = /* glsl */`
#ifndef PIXEL_CLS
  float pixelCls = 0.0;
#endif
if (uSurfGlyph > 0.5) {
  // pick the plane the surface faces most, so the letters stand upright on it
  vec3 n = abs(vGlyphN), P = vGlyphP;
  vec2 q; float face;
  if (n.x > n.y && n.x > n.z) { q = vec2(-P.z * sign(vGlyphN.x), P.y); face = 0.0; }
  else if (n.z > n.y) { q = vec2(P.x * sign(vGlyphN.z), P.y); face = 1.0; }
  else { q = P.xz; face = 2.0; }
  vec2 g = q / vec2(uGlyphH * 0.62, uGlyphH);
  vec2 cell = floor(g), f = g - cell;
  float lum = dot(outgoingLight, vec3(0.2126, 0.7152, 0.0722));
  float L = 1.0 - exp(-lum * 2.6);                                     // 0..1, compressed like the eye
  float band = L < 0.16 ? 0.0 : L < 0.46 ? 1.0 : 2.0;
  float sub = GLYPH_SUB;
  if (pixelCls > 0.63) sub = 2.0;                                      // painted skin on the body
  else if (pixelCls > 0.61) sub = 1.0;                                 // embroidered trim reads as metal
  float h = fract(sin(dot(cell + face * 37.17, vec2(12.9898, 78.233))) * 43758.5453);
  float idx = floor(h * ${COLS.toFixed(1)});
  vec2 fi = mix(vec2(0.07), vec2(0.93), f);
  vec2 auv = vec2((idx + fi.x) / ${COLS.toFixed(1)}, 1.0 - (sub * 3.0 + band + 1.0 - fi.y) / ${ROWS.toFixed(1)});
  vec2 k = vec2(0.86 / ${COLS.toFixed(1)}, 0.86 / ${ROWS.toFixed(1)});
  float ink = textureGrad(tGlyphs, auv, dFdx(g) * k, dFdy(g) * k).r;
  ink = smoothstep(0.18, 0.62, ink);
  vec3 tint = outgoingLight / max(max(outgoingLight.r, max(outgoingLight.g, outgoingLight.b)), 1e-3);
  vec3 letter = mix(tint, vec3(1.0), 0.18 + 0.5 * L * L) * (0.12 + 1.25 * L);
  // a far oni's letters shrink below a few pixels: fade back to its plain shading instead of shimmering
  float cellPx = 1.0 / max(fwidth(g.y), 1e-4);
  outgoingLight = mix(outgoingLight, mix(outgoingLight * 0.14, letter, ink), smoothstep(2.5, 5.0, cellPx));
}
`;

/** install the surface letters on a figure material (inside its onBeforeCompile) */
export function glyphShader(sh: THREE.WebGLProgramParametersWithUniforms, sub: number, rest = false) {
  Object.assign(sh.uniforms, surfaceGlyphs);
  sh.vertexShader = 'varying vec3 vGlyphP; varying vec3 vGlyphN;\n'
    + (rest ? '#define GLYPH_REST\nattribute vec3 glyphRest; attribute vec3 glyphRestN;\n' : '')
    + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n' + VERT);
  sh.fragmentShader = `varying vec3 vGlyphP; varying vec3 vGlyphN;
uniform float uSurfGlyph; uniform float uGlyphH; uniform sampler2D tGlyphs;
#define GLYPH_SUB ${sub.toFixed(1)}
` + sh.fragmentShader.replace('#include <opaque_fragment>', FRAG + '#include <opaque_fragment>');
}

// ---- letter size from the ronin's height on screen (device px), in steps with hysteresis
const BODY = 1.75;   // metres, kasa included
let rows = 0;
export function fitGlyphs(px: number) {
  const ideal = THREE.MathUtils.clamp(px / (3.4 * DPR), 14, 44);
  if (!rows || Math.abs(ideal - rows) > 3) rows = Math.round(ideal / 2) * 2;
  surfaceGlyphs.uGlyphH.value = BODY / rows;
}

export function toggleSurfaceGlyphs() {
  surfaceGlyphs.uSurfGlyph.value = surfaceGlyphs.uSurfGlyph.value > 0.5 ? 0 : 1;
}
