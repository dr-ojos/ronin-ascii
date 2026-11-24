// ASCII post-process: turns the rendered scene into real text-mode output (one printable ASCII
// character per cell), with a finer character grid for the actors and light-aware contours.
import * as THREE from 'three';
import { renderer, DPR } from './renderer';
import { asciiGrid, BLADE_SHEEN_ALPHA, BLADE_SPARK_ALPHA, CLS, FLOWER_GLYPHS } from './materials';
import { flareUniforms, MAX_FLARES, projectFlares } from './flare';
import { surfaceGlyphs } from './surface-glyphs';

export const bufSize = new THREE.Vector2();
renderer.getDrawingBufferSize(bufSize);
const RT_SCALE = bufSize.x * bufSize.y > 4e6 ? 0.6 : 1;
const sceneDepth = new THREE.DepthTexture(bufSize.x * RT_SCALE, bufSize.y * RT_SCALE, THREE.UnsignedIntType);
const rt = new THREE.WebGLRenderTarget(bufSize.x * RT_SCALE, bufSize.y * RT_SCALE, { type: THREE.HalfFloatType, depthTexture: sceneDepth });

// Real text-mode output: the screen is a grid of small cells and every cell holds ONE printable
// ASCII character (0x20-0x7E) in ONE colour, on black. Glyphs are drawn larger than their cell
// (OVERLAP) so neighbouring characters overlap and weave denser textures. Meadow blades
// keep their individual strokes from the scene render, even when a leaf spans several cells.
//
// pass 1 (cellMat): one texel per cell -> which character + colour
// pass 2 (postMat): every pixel adds up the glyphs of the nearby cells that cover it
//
// one glyph ramp per material class, like a tapestry: grass = strokes, stone = dashes, foliage = round letters...
const CLASS_CHARS = [
  " .'`*+",                 // 0 sky / misc
  " .,'`\";/\\|(%#&",      // 1 grass
  " .-_~=+*#",              // 2 ground / stone
  " .:-=+|#H",              // 3 wood / structures
  " .,ow*x&%@",             // 4 foliage
  " .:+*oO#@",              // 5 light
  " .:-=+szSZN#%@",         // 6 actor
  " .-~~=*"                 // 7 water: still dots, rolling tildes, moonlit crests
];
// The characters are drawn with three ramps chosen by what the pixel is made of (manga-art.ts
// tags it): woven cloth, hard metal / lacquer, and round letters for skin and faces. Light and
// shadow walk each ramp from a sparse dot to a full block, so the volume is in the characters.
const ACTOR_RAMPS = [
  " .,:;~+*xX%#",      // cloth: soft punctuation in the folds, crosses and blocks where lit
  " .-:=+*#%@$H",      // metal / lacquer: hard strokes, sparkling * on the highlights
  " .,:coaeO0@Q"       // skin: round letters model the flesh
];
const EDGE_CHARS = '|\\-/';  // row 8: outline strokes, picked by edge direction
// ASCII-art flowers (nature.ts): not a ramp, every cell of a flower names its own glyph (materials.ts FLOWER_GLYPHS)
for (const s of [...CLASS_CHARS, ...ACTOR_RAMPS, EDGE_CHARS, FLOWER_GLYPHS]) for (const ch of s) {
  const k = ch.charCodeAt(0);
  if (k < 0x20 || k > 0x7e) throw new Error(`glyph no ASCII: ${JSON.stringify(ch)}`);
}
const N = 12, EDGE_ROW = CLASS_CHARS.length, ROWS = EDGE_ROW + 1 + 2 + 2;   // + metal and skin ramps for actors, + two flower rows
const METAL_ROW = EDGE_ROW + 1, SKIN_ROW = EDGE_ROW + 2, FLOWER_ROW = EDGE_ROW + 3;
const SPARK_GLYPH = FLOWER_ROW * N + FLOWER_GLYPHS.indexOf('*');
// a cell's alpha = glyph code + glow level * GLOW_STEP (codes stay below it; half floats hold whole numbers exactly up to 2048)
const GLOW_STEP = 512;
if (ROWS * N >= GLOW_STEP) throw new Error('glyph codes overflow GLOW_STEP');
const FONT_FAMILY = '"Courier New", Courier, monospace';
const OVERLAP = 1.8;   // glyph size / cell size (must stay < 3: each pixel looks at the 3x3 neighbouring cells)

// each ramp sorted by ink coverage (measured once on a large reference glyph)
const RAMPS = (() => {
  const gw = 44, gh = 72, c = document.createElement('canvas'); c.width = gw; c.height = gh;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const coverage = (ch: string) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, gw, gh);
    x.fillStyle = '#fff'; x.font = `bold ${Math.round(gh * 0.86)}px ${FONT_FAMILY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.fillText(ch, gw / 2, gh / 2 + 2);
    const d = x.getImageData(0, 0, gw, gh).data; let s = 0;
    for (let i = 0; i < d.length; i += 4) s += d[i];
    return s;
  };
  return [...CLASS_CHARS, ...ACTOR_RAMPS].map(set => {
    const sorted = [...set].map(ch => ({ ch, s: coverage(ch) })).sort((p, q) => p.s - q.s).map(o => o.ch);
    return Array.from({ length: N }, (_, i) => sorted[Math.round(i * (sorted.length - 1) / (N - 1))]);
  });
})();

// The font atlas is rasterised at the exact on-screen glyph size and read with texelFetch
// (1 atlas texel = 1 screen pixel), so characters stay sharp: no scaling, no mipmap blur.
function buildAtlas(gw: number, gh: number, actor: boolean) {
  const a = document.createElement('canvas'); a.width = gw * N; a.height = gh * ROWS;
  const x = a.getContext('2d')!;
  x.fillStyle = '#000'; x.fillRect(0, 0, a.width, a.height);
  const size = Math.max(actor ? 5 : 6, Math.floor(Math.min(gh * 0.95, gw / 0.6)));   // Courier advance = 0.6em
  x.fillStyle = '#fff'; x.font = `bold ${size}px ${FONT_FAMILY}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const put = (c: string, col: number, row: number) => x.fillText(c, col * gw + gw / 2, row * gh + gh / 2 + (actor ? 0 : 1));
  RAMPS.slice(0, CLASS_CHARS.length).forEach((ramp, r) => [...(actor && r === 6 ? RAMPS[CLASS_CHARS.length] : ramp)].forEach((c, i) => put(c, i, r)));
  [...EDGE_CHARS].forEach((c, i) => put(c, i, EDGE_ROW));
  [...FLOWER_GLYPHS].forEach((c, i) => put(c, i % N, FLOWER_ROW + Math.floor(i / N)));
  if (actor) { RAMPS[CLASS_CHARS.length + 1].forEach((c, i) => put(c, i, METAL_ROW)); RAMPS[CLASS_CHARS.length + 2].forEach((c, i) => put(c, i, SKIN_ROW)); }
  const t = new THREE.CanvasTexture(a);
  t.minFilter = t.magFilter = THREE.NearestFilter; t.generateMipmaps = false; t.flipY = false;
  return t;
}
// cell pitch in CSS px (w, h); the glyph itself is OVERLAP times bigger. + / - walk this list
const DENSITY = [[2.5, 4.5], [3, 5.5], [3.5, 6.5], [4, 7.5], [5, 9], [6, 11], [8, 14]];
let densityIdx = 2;

// Full-resolution, single-channel silhouettes keep thin features on the finer actor grid.
const maskRT = new THREE.WebGLRenderTarget(bufSize.x, bufSize.y, { format: THREE.RedFormat });
const maskMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
maskMat.onBeforeCompile = shader => {
  shader.uniforms.uSceneDepth = { value: sceneDepth };
  shader.uniforms.uMaskSize = { value: bufSize };
  // Use the actor's local slope to allow for sampling between texels when the scene is downscaled.
  const slopeMargin = RT_SCALE < 1 ? 0.5 / RT_SCALE : 0;
  shader.fragmentShader = `uniform sampler2D uSceneDepth;
uniform vec2 uMaskSize;
` + shader.fragmentShader.replace('#include <tonemapping_fragment>', `
    float depth = texture2D(uSceneDepth, gl_FragCoord.xy / uMaskSize).r;
    float margin = 1e-6 + fwidth(gl_FragCoord.z) * ${slopeMargin.toFixed(4)};
    if (gl_FragCoord.z > depth + margin) discard;
    #include <tonemapping_fragment>
  `);
};
export const ACTOR_LAYER = 1;

// one texel per cell: rgb = colour, a = glyph code (row * N + idx)
const cellOpts = { type: THREE.HalfFloatType, minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, depthBuffer: false };
const cellRT = new THREE.WebGLRenderTarget(1, 1, cellOpts);
const actorCellRT = new THREE.WebGLRenderTarget(1, 1, cellOpts);   // finer grid, actors only
// Characters get their own grid, on whole pixels (a fractional pitch beats against the glyphs into
// horizontal lines). Its size follows how big the ronin is on screen: about ACTOR_ROWS rows of
// characters from head to feet, so far away the figure keeps its detail in small letters and up
// close (photo mode, the shop) the letters grow until each one reads, up to ACTOR_SCALE of the
// environment's cell.
// Small letters: ~56 rows head to feet (at play distance on a retina screen the cells go down to
// 1.5 CSS px), so hands, folds and armour plates each get several characters.
const ACTOR_SCALE = 0.42, ACTOR_OVERLAP = 1.3, ACTOR_ROWS = 56;
let fitPx = 0, envCh = 0;
interface Grid { cw: number; ch: number; gw: number; gh: number; cols: number; rows: number; font: THREE.CanvasTexture }
const grids: { env: Grid | null; actor: Grid | null } = { env: null, actor: null };
export const cellMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: rt.texture }, tMask: { value: maskRT.texture },
    uRes: { value: bufSize.clone() }, uCell: { value: new THREE.Vector2() },
    uN: { value: N }, uEdgeRow: { value: EDGE_ROW }, uMode: { value: 0 }, uHit: { value: 0 }, uTime: { value: 0 }, uActor: { value: 0 },
    uLight: { value: new THREE.Vector2(0, 1) },  // moonlight direction on screen (unit, pixels, y up)
    // ---- relief engine: the scene's depth buffer rebuilt into view-space positions and normals
    tDepth: { value: sceneDepth }, uProjInv: { value: new THREE.Matrix4() }, uProj: { value: new THREE.Matrix4() }, uProjScale: { value: new THREE.Vector2(1, 1) },
    uViewRot: { value: new THREE.Matrix3() },    // view -> world rotation (for the sky term)
    uMoonW: { value: new THREE.Vector3(0, 1, 0) }, uMoonV: { value: new THREE.Vector3(0, 0, 1) },   // moon direction, world / view
    uExposure: { value: 2.25 },                    // environment exposure (the figures keep their own)
    uFlareA: flareUniforms.uFlareA, uFlareB: flareUniforms.uFlareB   // technique flares (flare.ts)
  },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tScene; uniform sampler2D tMask; uniform sampler2D tDepth;
    uniform vec2 uRes; uniform vec2 uCell; uniform float uN; uniform float uEdgeRow; uniform float uMode; uniform float uHit; uniform float uActor;
    uniform vec2 uLight;
    uniform mat4 uProjInv; uniform mat4 uProj; uniform vec2 uProjScale; uniform mat3 uViewRot; uniform vec3 uMoonV; uniform float uExposure; uniform float uTime;
    #define MAXF ${MAX_FLARES}
    uniform vec4 uFlareA[MAXF]; uniform vec4 uFlareB[MAXF];
    // view-space position of the surface seen at uv (z < 0 in front of the camera)
    vec3 vpos(vec2 uv){
      float d = texture2D(tDepth, uv).r;
      vec4 p = uProjInv * vec4(uv * 2.0 - 1.0, d * 2.0 - 1.0, 1.0);
      return p.xyz / p.w;
    }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
    vec3 grade(vec3 c){ return pow(aces(c * 1.9), vec3(1.0 / 2.2)); }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float Mk(vec2 uv){ return texture2D(tMask, uv).r; }
    vec3 cellCol(vec2 uv, vec2 cs){
      vec2 o = cs * 0.3;
      return (texture2D(tScene, uv).rgb * 2.0 + texture2D(tScene, uv + o).rgb + texture2D(tScene, uv - o).rgb
        + texture2D(tScene, uv + vec2(o.x, -o.y)).rgb + texture2D(tScene, uv + vec2(-o.x, o.y)).rgb) / 6.0;
    }
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float L(vec2 uv, vec2 cs, float x, float y){ return luma(grade(texture2D(tScene, uv + vec2(x, y) * cs).rgb)); }
    float M(vec2 uv, vec2 cs, float x, float y){ return Mk(uv + vec2(x, y) * cs); }
    // gradient direction -> stroke along the edge:  0 '|'  1 '\\'  2 '-'  3 '/'
    float bin(vec2 gr){
      float a = mod(atan(gr.y, gr.x), 3.14159265);
      if (a < 0.3927 || a >= 2.7489) return 0.0;
      if (a < 1.1781) return 1.0;
      if (a < 1.9635) return 2.0;
      return 3.0;
    }
    vec3 modeCol(vec3 c, float l){
      float lum = 0.35 + 0.85 * l;
      if (uMode > 2.5) return vec3(0.93) * lum;
      if (uMode > 1.5) return vec3(1.0, 0.68, 0.22) * lum;
      if (uMode > 0.5) return vec3(0.25, 1.0, 0.45) * lum;
      return c;
    }
    void main(){
      vec2 cell = floor(gl_FragCoord.xy);
      vec2 uv = min((cell + 0.5) * uCell / uRes, vec2(0.999));
      vec2 cs = uCell / uRes;
      vec3 hurt = vec3(1.0, 0.12, 0.08);
      float row, idx; vec3 c;
      // how much this cell glows (the glow pass): 0 none, 1 soft (lanterns), 2 strong (technique fx,
      // sparks, flares). Stored in the cell's alpha as glyph code + level * GLOW_STEP.
      float glowLvl = 0.0;
      vec2 dx = vec2(cs.x * 0.3, 0.0), dy = vec2(0.0, cs.y * 0.3);
      float center = Mk(uv);
      vec4 sides = vec4(Mk(uv + dx), Mk(uv - dx), Mk(uv + dy), Mk(uv - dy));
      float coverage = center * 2.0 + dot(sides, vec4(1.0));
      vec4 surface = texelFetch(tScene, ivec2(uv * vec2(textureSize(tScene, 0))), 0);
      if (abs(surface.a - ${BLADE_SPARK_ALPHA.toFixed(2)}) < 0.002 && (uActor > 0.5 ? coverage >= 1.0 : coverage <= 2.0)) {
        // Keep blade sparks saturated and legible as single asterisks at the normal camera distance.
        float peak = max(max(surface.r, surface.g), surface.b);
        vec3 tint = sqrt(surface.rgb / max(peak, 0.01));
        c = modeCol(tint * (0.8 + 0.55 * sqrt(min(1.0, peak))), peak);
        gl_FragColor = vec4(c, ${(SPARK_GLYPH + 2 * GLOW_STEP).toFixed(1)});
        return;
      }
      if (uActor > 0.5) {
        if (coverage < 1.0) { gl_FragColor = vec4(0.0); return; }
        // ---- actors: silhouette drawn with | \\ - / strokes, creases too, body filled with the actor ramp
        // Sample actor colours only, so a narrow horn or blade keeps its colour at the edge.
        // the figures get their own exposure (x1.8): at night they would otherwise sit in the bottom
        // third of the ramp, all dots; this way the lit side reaches the dense letters
        vec3 ac = grade(1.8 * (texture2D(tScene, uv).rgb * (2.0 * center)
          + texture2D(tScene, uv + dx).rgb * sides.x + texture2D(tScene, uv - dx).rgb * sides.y
          + texture2D(tScene, uv + dy).rgb * sides.z + texture2D(tScene, uv - dy).rgb * sides.w) / coverage);
        float al = min(pow(luma(ac), 0.75), 0.999);
        vec2 e = cs;
        float m0 = M(uv, e, -1., 1.), m1 = M(uv, e, 0., 1.), m2 = M(uv, e, 1., 1.), m3 = M(uv, e, -1., 0.);
        float m5 = M(uv, e, 1., 0.), m6 = M(uv, e, -1., -1.), m7 = M(uv, e, 0., -1.), m8 = M(uv, e, 1., -1.);
        vec2 mg = vec2((m2 + 2.*m5 + m8) - (m0 + 2.*m3 + m6), (m0 + 2.*m1 + m2) - (m6 + 2.*m7 + m8));
        float a0 = L(uv, e, -1., 1.), a1 = L(uv, e, 0., 1.), a2 = L(uv, e, 1., 1.), a3 = L(uv, e, -1., 0.);
        float a5 = L(uv, e, 1., 0.), a6 = L(uv, e, -1., -1.), a7 = L(uv, e, 0., -1.), a8 = L(uv, e, 1., -1.);
        vec2 gl = vec2((a2 + 2.*a5 + a8) - (a0 + 2.*a3 + a6), (a0 + 2.*a1 + a2) - (a6 + 2.*a7 + a8));
        bool outline = length(mg) > 1.8;
        // what the pixel is made of (alpha: 0.60 cloth, 0.62 metal / lacquer, 0.64 skin)
        float sub = texture2D(tScene, uv).a;
        bool bladeSheen = abs(surface.a - ${BLADE_SHEEN_ALPHA.toFixed(2)}) < 0.002;
        float ramp = !bladeSheen && sub > 0.63 ? ${SKIN_ROW.toFixed(1)} : sub > 0.61 ? ${METAL_ROW.toFixed(1)} : 6.0;
        // light and shadow pick the density; an ordered jitter keeps neighbouring cells from repeating
        // the same letter in rows, so the shading reads as a gradient of characters
        float dith = (hash(cell) - 0.5) * 0.9 + (mod(cell.x + cell.y * 2.0, 3.0) - 1.0) * 0.25;
        // tonal curve: a steep S so the lit side and the shadow side separate into distinct letters
        float shade = smoothstep(0.03, 0.9, al) * 0.72 + al * 0.28;
        // local contrast: a cell brighter than its neighbours (a ridge, a fold catching light) rises,
        // a cell darker than them (a cavity, under the arm, between plates) sinks -> carved volume
        float nb = (a0 + a1 + a2 + a3 + a5 + a6 + a7 + a8) * 0.125, lc = L(uv, e, 0., 0.);
        shade = clamp(shade + (lc - nb) * 1.6, 0.0, 1.0);
        if (outline) { row = uEdgeRow; idx = bin(mg); }
        else if (length(gl) > 1.35) { row = uEdgeRow; idx = bin(gl); }     // only deep creases get a stroke
        else { row = ramp; idx = clamp(floor(shade * (uN - 1.0) + 0.5 + dith), 1.0, uN - 1.0); }
        vec3 tint = ac / max(max(max(ac.r, ac.g), ac.b), 0.03);
        // stronger light / shadow: dim strokes in the shade (the solid backing carries the form there),
        // white-hot strokes where the light hits
        c = mix(tint, vec3(1.0), 0.04 + 0.2 * shade * shade * shade) * (0.26 + 0.98 * shade);
        // colour temperature: shadows go cool indigo, light goes faintly warm (chiaroscuro)
        c *= mix(vec3(0.72, 0.8, 1.08), vec3(1.07, 1.0, 0.92), smoothstep(0.15, 0.75, shade));
        if (ramp > ${METAL_ROW.toFixed(1)} - 0.5 && ramp < ${METAL_ROW.toFixed(1)} + 0.5 && shade > 0.82)
          c = mix(c, vec3(1.0), (shade - 0.82) * 2.5);                     // specular glint on steel and lacquer
        // light-aware contour: the edge of the silhouette that faces the moon (or is lit by a lantern)
        // becomes a band of bright cool characters; the edge turned away sinks into dark characters
        float rim = smoothstep(1.1, 2.6, length(mg));                      // thin: the outermost cell or so
        if (rim > 0.0) {
          vec2 n = -mg / (e * uRes);                                        // outward normal, in pixels
          float facing = dot(normalize(n + 1e-6), uLight);
          // mostly the moon's direction; a strongly lit cell (lantern, sparks) can light its edge too
          float lit = clamp(smoothstep(0.05, 0.75, facing) * 0.9 + smoothstep(0.55, 0.85, al) * 0.3 * step(-0.3, facing), 0.0, 1.0);
          vec3 rimC = mix(vec3(0.82, 0.9, 1.0), tint, 0.45) * (0.6 + 0.35 * lit);
          c = mix(c, rimC, rim * lit);
          c *= 1.0 - rim * (1.0 - lit) * 0.78;
          if (outline) c = max(c, tint * 0.1);                             // shadow side: dim, but still a character
        }
        if (bladeSheen) {
          float peak = max(max(surface.r, surface.g), surface.b);
          vec3 steel = sqrt(surface.rgb / max(peak, 0.01));
          c = mix(c, steel * (0.30 + 0.95 * sqrt(min(1.0, peak))), 0.86);
        }
        c = modeCol(c, al);
      } else if (abs(surface.a - ${CLS.grassBlade.toFixed(2)}) < 0.002) {
        // The final pass draws the leaf. A technique flare can still write its glyph here.
        row = 0.0; idx = 0.0; c = vec3(0.0);
      } else {
        if (coverage / 6.0 > 0.35) { gl_FragColor = vec4(0.0); return; }
        // ---- environment: glyph ramp chosen per material class (stored in alpha)
        vec4 s0 = texture2D(tScene, uv);
        vec3 col = pow(aces(cellCol(uv, cs) * uExposure), vec3(1.0 / 2.2));
        float cls = floor(s0.a * 10.0 + 0.5);
        if (abs(cls - 9.0) < 0.5) {
          // ---- ASCII-art flowers: the exact texel (no filtering between cells) says which glyph to draw
          vec4 sf = texelFetch(tScene, ivec2(uv * vec2(textureSize(tScene, 0))), 0);
          if (abs(floor(sf.a * 10.0 + 0.5) - 9.0) < 0.5) {
            float code = clamp(floor((sf.a - 0.9) * 500.0 + 0.5), 1.0, ${(FLOWER_GLYPHS.length - 1).toFixed(1)});
            float fl = luma(grade(sf.rgb));
            vec3 ft = sf.rgb / max(max(max(sf.rgb.r, sf.rgb.g), sf.rgb.b), 1e-4);   // hue before the tone curve: a lantern must not bleach it white
            ft = mix(vec3(dot(ft, vec3(0.299, 0.587, 0.114))), ft, 0.9);   // true colour, a touch muted by the night
            c = modeCol(ft * (0.42 + 0.7 * sqrt(fl)), 0.4 + fl);              // shaded by the moon, never glowing
            c = mix(c, hurt * max(luma(c), 0.5), uHit * 0.6);
            float frow = floor(code / uN);
            gl_FragColor = vec4(c, (${FLOWER_ROW.toFixed(1)} + frow) * uN + code - frow * uN);
            return;
          }
        }
        row = 0.0;
        if (cls > 8.5) row = 0.0;
        else if (cls < 1.5) row = 1.0;
        else if (cls < 2.5) row = 2.0;
        else if (cls < 3.5) row = 3.0;
        else if (cls < 4.5) row = 4.0;
        else if (cls < 5.5) row = 5.0;
        else if (cls < 6.5) row = 6.0;
        else if (cls < 7.5) row = 5.0;
        else row = 7.0;
        bool light = abs(row - 5.0) < 0.1;
        if (light) glowLvl = abs(cls - 7.0) < 0.5 ? 2.0 : 1.0;   // CLS.fx (techniques) glows hard, CLS.light softly
        float l = luma(col);
        // muted night palette: desaturate and push towards indigo; lights stay warm and saturated
        bool grassRow = row > 0.5 && row < 1.5;
        bool foliageRow = row > 3.5 && row < 4.5;
        bool waterRow = row > 6.5;
        float vividGrass = 0.0;
        if (waterRow) col = mix(vec3(l), col, 0.8) * vec3(0.72, 0.95, 1.3);                  // cold blue water, cyan where the moon hits
        else if (grassRow) {                                                             // dark teal-green woven grass...
          // ...with touches of vivid young green where the scene lit the tips (nature.ts: a saturated, blue-free green)
          vividGrass = smoothstep(0.5, 0.25, col.b / max(col.g, 0.001)) * smoothstep(0.03, 0.1, l);
          col = mix(vec3(l), col, 0.85) * vec3(0.8, 1.05, 0.95);
          col = mix(col, vec3(0.5, 1.0, 0.28) * max(l, 0.2) * 1.5, vividGrass);
        }
        else if (foliageRow) col = mix(vec3(l), col, 1.15) * vec3(0.95, 0.95, 1.05);  // canopies keep their colour: pink sakura, green pine
        else if (!light) col = mix(vec3(l), col, 0.5) * vec3(0.86, 0.9, 1.12);        // indigo stone / wood
        float gain = light ? 1.4 : (grassRow ? 1.0 : (waterRow ? 1.15 : (row < 3.5 && row > 1.5 ? 1.08 : 1.1)));
        l = clamp(luma(col) * gain, 0.0, 0.999);
        l = pow(l, 0.85);                                              // night lift: the mid-tones come up out of the black

        // ---- relief engine: rebuild the surface from the depth buffer and light it again in ASCII
        // (half-lambert moon, sky dome, ambient occlusion, depth contours, glints on water, aerial depth)
        vec3 P = vpos(uv);
        bool solid = texture2D(tDepth, uv).r < 0.99999 && !(row < 0.5);
        float edgeK = 0.0; vec2 eg = vec2(0.0); float facingE = 0.0;
        float relief = 1.0;
        vec3 mist = vec3(0.0); float far = 0.0;
        float reflK = 0.0, reflL = 0.0; vec3 reflTint = vec3(1.0);   // what the water mirrors
        float strokeOn = 0.0; vec2 strokeDir = vec2(0.0);            // roofs and walls: letters that follow the surface
        if (solid) {
          float dist = -P.z;
          vec2 o = cs * 0.5;                                           // half a cell: one normal per character
          vec3 pr = vpos(uv + vec2(o.x, 0.0)), pl = vpos(uv - vec2(o.x, 0.0));
          vec3 pu = vpos(uv + vec2(0.0, o.y)), pd = vpos(uv - vec2(0.0, o.y));
          // pick the flatter side on each axis, so a cell on a silhouette keeps its own surface's normal
          vec3 ddx = abs(pr.z - P.z) < abs(P.z - pl.z) ? pr - P : P - pl;
          vec3 ddy = abs(pu.z - P.z) < abs(P.z - pd.z) ? pu - P : P - pd;
          vec3 Nv = normalize(cross(ddx, ddy));
          if (Nv.z < 0.0) Nv = -Nv;
          vec3 Nw = uViewRot * Nv;
          if (abs(row - 3.0) < 0.1) {
            mat3 toView = transpose(uViewRot);
            if (Nw.y > 0.2 && Nw.y < 0.97) {
              // a roof: strokes run down the slope, row after row like its tiles in the rain
              vec3 D = cross(cross(Nw, vec3(0.0, 1.0, 0.0)), Nw);
              strokeDir = (toView * normalize(D)).xy; strokeOn = 1.0;
            } else if (abs(Nw.y) < 0.2 && mod(cell.y, 2.0) < 0.5) {
              // a wall: every other row a plank line along it, converging with the perspective
              vec3 T = cross(vec3(0.0, 1.0, 0.0), Nw);
              strokeDir = (toView * normalize(T)).xy; strokeOn = 1.0;
            }
          }
          // moon: half-lambert, squared so the lit flank and the far flank separate into different letters
          float ndl = dot(Nv, uMoonV);
          float hl = ndl * 0.5 + 0.5; hl *= hl;
          float skyT = Nw.y * 0.5 + 0.5;                              // faces turned to the sky catch the moonlit sky
          // ambient occlusion: 8 taps in a ring of ~0.7 m around the point, the classic Alchemy estimator
          float R = 0.7, ao = 0.0, jr = hash(cell) * 6.2832;
          vec2 rad = R * uProjScale / max(dist, 0.5);
          for (int i = 0; i < 8; i++) {
            float a = float(i) * 0.785398 + jr;
            float rr = 0.35 + 0.65 * fract(float(i) * 0.618 + jr);
            vec3 S = vpos(uv + vec2(cos(a), sin(a)) * rad * rr);
            vec3 v = S - P; float vl = length(v) + 1e-4;
            ao += max(0.0, dot(Nv, v / vl) - 0.12) * smoothstep(R * 2.2, R * 0.6, vl);
          }
          ao = clamp(1.0 - ao * 0.24, 0.0, 1.0);
          // creases from the second derivative of the surface: a ridge (box corner, stone lip, roof edge)
          // catches the light, a valley sinks
          vec3 lap = (pr + pl - 2.0 * P) + (pu + pd - 2.0 * P);
          float crease = clamp(-dot(lap, Nv) / max(dist * 0.02, 0.01), -1.0, 1.0);
          // depth contours: where this cell stands in front of what is next to it, the edge is drawn
          // with a | / - \\ stroke, lit on the moon's side and sunk on the other
          vec4 jump = vec4(pr.z, pl.z, pu.z, pd.z) - P.z;              // < 0: that neighbour is farther away
          float behind = -min(min(jump.x, jump.y), min(jump.z, jump.w));
          edgeK = smoothstep(0.05, 0.14, behind / dist);
          eg = vec2(pr.z - pl.z, pu.z - pd.z);                         // points towards the nearer side (into the object)
          facingE = length(eg) > 1e-5 ? dot(normalize(-eg), uLight) : 0.0;
          // how much each material listens: grass blades are too thin for a clean normal
          float k = grassRow ? 0.45 : (light ? 0.2 : (waterRow ? 0.6 : 1.0));
          relief = mix(1.0, (0.45 + 0.75 * hl) * (0.85 + 0.2 * skyT), k);   // flat ground stays ~1
          relief *= mix(1.0, 0.35 + 0.65 * ao, grassRow ? 0.75 : 1.0);
          relief *= 1.0 + crease * (grassRow ? 0.15 : 0.45);
          if (waterRow) {                                              // the moon's path on the water
            vec3 H = normalize(uMoonV + normalize(-P));
            relief += pow(max(dot(Nv, H), 0.0), 70.0) * 2.2;
            // ---- reflection: march the mirrored view ray across the screen against the depth buffer, so the
            // water shows what stands over it (the ronin in his letters, lanterns, trees), broken by ripples
            vec3 upV = normalize(vec3(uViewRot[0].y, uViewRot[1].y, uViewRot[2].y));
            float ripple = sin(P.x * 3.1 + uTime * 1.7) * 0.5 + sin(P.z * 2.3 - uTime * 1.3 + P.x) * 0.5;
            vec3 Rv = reflect(normalize(P), normalize(upV + Nv * 0.15 + vec3(ripple * 0.025, 0.0, 0.0)));
            float t = 0.15;
            for (int i = 0; i < 24; i++) {
              t *= 1.22;
              vec3 Q = P + Rv * t;
              vec4 cq = uProj * vec4(Q, 1.0);
              if (cq.w <= 0.0) break;
              vec2 uq = cq.xy / cq.w * 0.5 + 0.5;
              if (uq.x < 0.0 || uq.x > 1.0 || uq.y < 0.0 || uq.y > 1.0) break;
              float sz = vpos(uq).z, dz = sz - Q.z;                        // > 0: the ray went behind what the screen shows there
              if (dz > 0.0 && dz < 0.6 + t * 0.25 && texture2D(tDepth, uq).r < 0.99999) {
                vec3 rc = pow(aces(cellCol(uq, cs) * uExposure), vec3(1.0 / 2.2));
                float edge = smoothstep(0.0, 0.08, min(min(uq.x, 1.0 - uq.x), min(uq.y, 1.0 - uq.y)));
                reflK = 0.85 * edge * smoothstep(16.0, 2.0, t);             // near things mirror clearly, far ones fade out
                reflL = luma(rc);
                reflTint = rc / max(max(max(rc.r, rc.g), rc.b), 0.04);
                break;
              }
            }
          }
          // aerial perspective: far ground fades into a cool moonlit mist instead of black, so the
          // planes of the landscape stack one behind the other
          far = smoothstep(18.0, 95.0, dist);
          mist = vec3(0.42, 0.5, 0.78);
          // grass and foliage do not get outlines (every blade would be one)
          if (grassRow || foliageRow && edgeK < 0.9 || light) edgeK = 0.0;
        }
        l = clamp(l * clamp(relief, 0.3, waterRow ? 3.0 : 1.3), 0.0, light || waterRow ? 0.999 : 0.86);   // only real lights reach the densest glyphs
        l = mix(l, 0.2 + 0.25 * l, far * 0.55);
        l = smoothstep(0.0, 1.0, l) * 0.5 + l * 0.5;                   // contrast curve: shadows sink, lit areas pop
        if (row > 0.5 && row < 4.5) l = max(l, 0.13);  // shadows keep a faint woven texture
        if (waterRow) l = max(l, 0.12);                // still water in the dark: a field of dots
        if (reflK > 0.0) l = mix(l, clamp(reflL * 1.15 + 0.06, 0.08, 0.95), reflK);   // the mirror sets the water's brightness: dark figures mirror dark
        idx = floor(l * uN);
        vec3 tint = col / max(max(max(col.r, col.g), col.b), 0.04);
        tint = mix(tint, mist / 0.78, far * 0.5);
        tint = mix(tint, reflTint * vec3(0.88, 0.96, 1.08), reflK * 0.92);   // the mirrored colour, a touch cooler
        c = light ? mix(tint, vec3(1.0), 0.25) * (0.8 + 0.6 * l) : tint * (0.27 + 0.75 * l);
        c = mix(c, mix(tint, vec3(0.8, 1.0, 0.55), 0.2) * (0.5 + 0.85 * l), vividGrass);   // lit blades glow
        // the moon's side of every surface warms a touch, the shaded side cools: volume through colour too
        c *= mix(vec3(0.85, 0.9, 1.1), vec3(1.06, 1.02, 0.95), smoothstep(0.25, 0.85, l));
        if (strokeOn > 0.5 && edgeK <= 0.5 && l > 0.14 && length(strokeDir) > 0.05) {
          row = uEdgeRow; idx = bin(vec2(-strokeDir.y, strokeDir.x));
        }
        if (edgeK > 0.5) {
          row = uEdgeRow; idx = bin(eg);
          float lit = smoothstep(-0.2, 0.7, facingE);
          c = mix(tint * (0.22 + 0.4 * l), mix(tint, vec3(0.92, 0.96, 1.0), 0.45) * (0.75 + 0.5 * l), lit);
        }
        c = modeCol(c, l);
      }
      c = mix(c, hurt * max(luma(c), 0.5), uHit * 0.6);   // damage flash tints the characters, not the background
      float code = row * uN + idx;
      if (uActor < 0.5) {
        // ---- technique flares (flare.ts): a star of strokes,  --- across, | up and down, \ / diagonals, * at the core
        vec2 pc = (cell + 0.5) * uCell;
        float best = 0.0, fcode = 0.0; vec3 fcol = vec3(0.0);
        for (int i = 0; i < MAXF; i++) {
          vec4 A = uFlareA[i], B = uFlareB[i];
          if (B.w <= 0.0) continue;
          vec2 d = pc - A.xy, ad = abs(d);
          float vLen = abs(A.w), s = 0.0, g = 0.0, v;
          if (length(d / uCell) < 0.75) { s = 1.0; g = ${SPARK_GLYPH.toFixed(1)}; }
          else {
            if (ad.y < uCell.y * 0.5 && ad.x < A.z) { v = pow(1.0 - ad.x / A.z, 1.6); if (v > s) { s = v; g = uEdgeRow * uN + 2.0; } }
            if (ad.x < uCell.x * 0.5 && ad.y < vLen && (A.w > 0.0 || d.y > 0.0)) {
              // the full beam fades along its length; the aviso's beam from the sky stays even
              v = A.w > 0.0 ? pow(1.0 - ad.y / vLen, 1.2) : 0.6 + 0.4 * (1.0 - ad.y / vLen);
              if (v > s) { s = v; g = uEdgeRow * uN; }
            }
            float dl = min(A.z, vLen) * 0.22;
            if (A.w > 0.0 && ad.x < dl && abs(ad.x - ad.y) < uCell.x * 0.7) {
              v = 0.8 * pow(1.0 - ad.x / dl, 1.4);
              if (v > s) { s = v; g = uEdgeRow * uN + (d.x * d.y > 0.0 ? 3.0 : 1.0); }
            }
          }
          s *= B.w;
          if (s > best) { best = s; fcode = g; fcol = B.rgb; }
        }
        if (best > 0.05) {
          c = modeCol(mix(fcol, vec3(1.0), 0.15 + 0.6 * best * best) * (0.45 + 1.15 * best), best);
          code = fcode; glowLvl = 2.0;
        }
      }
      gl_FragColor = vec4(c, code + glowLvl * ${GLOW_STEP.toFixed(1)});
    }`
});
const cellScene = new THREE.Scene();
cellScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cellMat));

// ---- glow: the light the characters themselves give off. Glowing cells (lanterns softly, technique
// fx / sparks / flares hard) are picked out of the environment's cell grid and blurred twice, a
// tight halo at one texel per cell and a wide one at half that; the final pass adds them over the
// glyphs (strongly on their ink, faintly between them), so the light comes from the letters.
const glowOpts = { type: THREE.HalfFloatType, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false };
const glowA = new THREE.WebGLRenderTarget(1, 1, glowOpts), glowB = new THREE.WebGLRenderTarget(1, 1, glowOpts);
const wideA = new THREE.WebGLRenderTarget(1, 1, glowOpts), wideB = new THREE.WebGLRenderTarget(1, 1, glowOpts);
const fullVert = `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const extractMat = new THREE.ShaderMaterial({
  uniforms: { tCells: { value: cellRT.texture }, uN: { value: N } },
  vertexShader: fullVert,
  fragmentShader: /* glsl */`
    uniform sampler2D tCells; uniform float uN;
    void main(){
      vec4 cd = texelFetch(tCells, ivec2(gl_FragCoord.xy), 0);
      float raw = floor(cd.a + 0.5), lvl = floor(raw / ${GLOW_STEP.toFixed(1)}), code = raw - lvl * ${GLOW_STEP.toFixed(1)};
      float row = floor(code / uN), idx = code - row * uN;
      float dens = abs(row - 5.0) < 0.5 ? idx / (uN - 1.0) : 1.0;   // a lamp's densest letters shine most
      gl_FragColor = vec4(cd.rgb * dens * (lvl > 1.5 ? 1.0 : lvl > 0.5 ? 0.4 : 0.0), 1.0);
    }`
});
// 9-tap gaussian in 5 linear fetches
const blurMat = new THREE.ShaderMaterial({
  uniforms: { tSrc: { value: null }, uDir: { value: new THREE.Vector2() }, uSize: { value: new THREE.Vector2() } },
  vertexShader: fullVert,
  fragmentShader: /* glsl */`
    uniform sampler2D tSrc; uniform vec2 uDir; uniform vec2 uSize;
    void main(){
      vec2 uv = gl_FragCoord.xy / uSize;
      vec3 s = texture2D(tSrc, uv).rgb * 0.2270270270;
      s += (texture2D(tSrc, uv + uDir * 1.3846153846).rgb + texture2D(tSrc, uv - uDir * 1.3846153846).rgb) * 0.3162162162;
      s += (texture2D(tSrc, uv + uDir * 3.2307692308).rgb + texture2D(tSrc, uv - uDir * 3.2307692308).rgb) * 0.0702702703;
      gl_FragColor = vec4(s, 1.0);
    }`
});
const passQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), extractMat);
const passScene = new THREE.Scene(); passScene.add(passQuad);
function blur(src: THREE.WebGLRenderTarget, dst: THREE.WebGLRenderTarget, dx: number, dy: number) {
  const u = blurMat.uniforms;
  u.tSrc.value = src.texture; u.uDir.value.set(dx / src.width, dy / src.height); u.uSize.value.set(dst.width, dst.height);
  passQuad.material = blurMat;
  renderer.setRenderTarget(dst); renderer.render(passScene, postCam);
}
function renderGlow() {
  passQuad.material = extractMat;
  renderer.setRenderTarget(glowA); renderer.render(passScene, postCam);
  // the cells are about twice as tall as wide: spread less vertically so the halo stays round on screen
  blur(glowA, glowB, 1, 0); blur(glowB, glowA, 0, 0.55);
  blur(glowA, wideB, 1.6, 0); blur(wideB, wideA, 0, 0.9);
}

const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tCells: { value: cellRT.texture }, tFont: { value: null }, tCellsA: { value: actorCellRT.texture }, tFontA: { value: null },
    tMask: { value: maskRT.texture }, uRes: { value: bufSize.clone() }, uN: { value: N },
    tScene: { value: rt.texture }, uMode: cellMat.uniforms.uMode, uHit: cellMat.uniforms.uHit, uRim: { value: 1.15 * DPR }, uLight: cellMat.uniforms.uLight,
    uCell: { value: new THREE.Vector2() }, uGlyph: { value: new THREE.Vector2() }, uGrid: { value: new THREE.Vector2() },
    uCellA: { value: new THREE.Vector2() }, uGlyphA: { value: new THREE.Vector2() }, uGridA: { value: new THREE.Vector2() },
    tGlow: { value: glowA.texture }, tGlowW: { value: wideA.texture }, uGlow: flareUniforms.uGlow,
    uSurf: surfaceGlyphs.uSurfGlyph   // 1: the figures carry their letters on their own surface (surface-glyphs.ts)
  },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tCells; uniform sampler2D tFont; uniform sampler2D tCellsA; uniform sampler2D tFontA; uniform sampler2D tMask;
    uniform vec2 uRes; uniform float uN;
    uniform vec2 uCell; uniform vec2 uGlyph; uniform vec2 uGrid; uniform vec2 uCellA; uniform vec2 uGlyphA; uniform vec2 uGridA;
    uniform sampler2D tScene; uniform float uMode; uniform float uHit; uniform float uRim; uniform vec2 uLight;
    uniform sampler2D tGlow; uniform sampler2D tGlowW; uniform float uGlow; uniform float uSurf;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
    vec3 grade(vec3 c){ return pow(aces(c * 1.9), vec3(1.0 / 2.2)); }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float mask(vec2 p){ return texture2D(tMask, p / uRes).r; }
    // solid colour behind the actor characters, one flat tile per actor cell, cel-shaded in bands
    vec3 actorBacking(vec2 fc){
      vec2 p = (floor(fc / uCellA) + 0.5) * uCellA;
      vec3 bc = grade(1.8 * texture2D(tScene, (mask(p) > 0.5 ? p : fc) / uRes).rgb);   // same exposure as the characters
      float l = luma(bc);
      float band = l < 0.06 ? 0.02 : l < 0.14 ? 0.1 : l < 0.26 ? 0.24 : l < 0.42 ? 0.42 : l < 0.62 ? 0.6 : 0.8;
      vec3 tint = bc / max(max(max(bc.r, bc.g), bc.b), 0.03);
      tint = mix(vec3(luma(tint)), tint, 1.15);                   // keep armour colours rich
      vec3 b = tint * band;
      if (uMode > 2.5) b = vec3(0.93) * band;
      else if (uMode > 1.5) b = vec3(1.0, 0.68, 0.22) * band;
      else if (uMode > 0.5) b = vec3(0.25, 1.0, 0.45) * band;
      return mix(b, vec3(1.0, 0.12, 0.08) * max(band, 0.3), uHit * 0.5) * 0.4;   // under the characters: the figure reads as one coloured mass
    }
    // Palette and hit tint for strokes already drawn on a surface in the scene render.
    vec3 surfaceInk(vec3 c){
      float l = luma(c);
      if (uMode > 2.5) c = vec3(0.93) * l;
      else if (uMode > 1.5) c = vec3(1.0, 0.68, 0.22) * l * 1.3;
      else if (uMode > 0.5) c = vec3(0.25, 1.0, 0.45) * l * 1.3;
      return mix(c, vec3(1.0, 0.12, 0.08) * max(l, 0.3), uHit * 0.5);
    }
    // all glyphs of the 3x3 neighbouring cells that cover this pixel; returns (strongest, sum)
    void layer(sampler2D cells, sampler2D font, vec2 C, vec2 Gs, vec2 grid, vec2 fc, bool scatter, out vec3 top, out vec3 sum){
      vec2 cell = floor(fc / C);
      ivec2 G = ivec2(Gs);
      top = vec3(0.0); sum = vec3(0.0);
      for (int dy = -1; dy <= 1; dy++) for (int dx = -1; dx <= 1; dx++) {
        vec2 nc = cell + vec2(dx, dy);
        if (nc.x < 0.0 || nc.y < 0.0 || nc.x >= grid.x || nc.y >= grid.y) continue;
        vec4 cd = texelFetch(cells, ivec2(nc), 0);
        float code = floor(cd.a + 0.5);
        code -= floor(code / ${GLOW_STEP.toFixed(1)}) * ${GLOW_STEP.toFixed(1)};   // drop the glow level
        float row = floor(code / uN), idx = code - row * uN;
        if (idx < 0.5 && abs(row - ${EDGE_ROW.toFixed(1)}) > 0.5) continue;   // blank cell (the edge row has no blank)
        // grass / foliage glyphs get a small fixed scatter so the weave doesn't look like a grid
        vec2 jit = scatter && ((row > 0.5 && row < 1.5) || (row > 3.5 && row < 4.5))
          ? (vec2(hash(nc), hash(nc + 17.3)) - 0.5) * C * 0.5 : vec2(0.0);
        vec2 lp = floor(fc - ((nc + 0.5) * C + jit) + Gs * 0.5);  // pixel inside that cell's glyph box
        if (lp.x < 0.0 || lp.y < 0.0 || lp.x >= Gs.x || lp.y >= Gs.y) continue;
        ivec2 t = ivec2(int(idx) * G.x + int(lp.x), int(row) * G.y + (G.y - 1 - int(lp.y)));
        vec3 v = cd.rgb * texelFetch(font, t, 0).r;
        sum += v; top = max(top, v);
      }
    }
    void main(){
      vec2 fc = gl_FragCoord.xy;
      vec3 et, es, at = vec3(0.0), as = vec3(0.0);
      if (uSurf < 0.5) layer(tCellsA, tFontA, uCellA, uGlyphA, uGridA, fc, false, at, as);
      vec3 actor = mix(at, as, 0.2);
      vec3 col;
      if (mask(fc) > 0.5) {
        // inside a silhouette: the surface letters, or small grid characters over a solid cel-shaded backing
        col = uSurf > 0.5 ? surfaceInk(grade(1.8 * texture2D(tScene, fc / uRes).rgb)) : max(actor, actorBacking(fc));
      } else {
        layer(tCells, tFont, uCell, uGlyph, uGrid, fc, true, et, es);
        col = max(mix(et, es, 0.25), actor);
        vec4 surface = texelFetch(tScene, ivec2(fc / uRes * vec2(textureSize(tScene, 0))), 0);
        if (abs(surface.a - ${CLS.grassBlade.toFixed(2)}) < 0.002) {
          col = max(col, surfaceInk(grade(surface.rgb) * 0.70));
        }
        // dark contour just outside the silhouette
        // a wide dark moat round every figure, so its letters never merge with the ground's
        float r = uRim * 3.6, d = r * 0.7;
        float near = max(max(max(mask(fc + vec2(r, 0.)), mask(fc - vec2(r, 0.))), max(mask(fc + vec2(0., r)), mask(fc - vec2(0., r)))),
                         max(max(mask(fc + vec2(d, d)), mask(fc - vec2(d, d))), max(mask(fc + vec2(d, -d)), mask(fc + vec2(-d, d)))));
        // which way the silhouette is: g points from here towards the actor
        vec2 g = vec2(mask(fc + vec2(r, 0.)) - mask(fc - vec2(r, 0.)), mask(fc + vec2(0., r)) - mask(fc - vec2(0., r)))
               + vec2(mask(fc + vec2(d, d)) - mask(fc - vec2(d, d)) + mask(fc + vec2(d, -d)) - mask(fc + vec2(-d, d)),
                      mask(fc + vec2(d, d)) - mask(fc - vec2(d, d)) - mask(fc + vec2(d, -d)) + mask(fc + vec2(-d, d))) * 0.7;
        float litSide = length(g) > 0.01 ? smoothstep(-0.15, 0.6, dot(normalize(-g), uLight)) : 0.0;
        // deep dark halo on the shadow side, a lighter one where the moon hits (so the bright rim pops)
        col *= 1.0 - near * mix(0.95, 0.6, litSide);
      }
      // glow: the cell grid overhangs the screen a little, so map through its own extent
      vec2 guv = fc / (uGrid * uCell);
      vec3 glow = (texture2D(tGlow, guv).rgb * 0.8 + texture2D(tGlowW, guv).rgb * 1.3) * uGlow;
      float ink = smoothstep(0.02, 0.3, max(col.r, max(col.g, col.b)));
      col += glow * (0.3 + 1.1 * ink);
      vec2 q = fc / uRes - 0.5;
      float vig = 1.0 - dot(q, q) * 0.6;
      gl_FragColor = vec4(col * vig, 1.0);
    }`
});
const postScene = new THREE.Scene();
postScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), postMat));
const postCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
function makeGrid(cw: number, ch: number, ov: number, actor = false): Grid {
  const gw = Math.max(actor ? 3 : 1, Math.round(cw * ov));
  const gh = Math.max(actor ? 5 : 1, Math.round(ch * ov));
  return { cw, ch, gw, gh, cols: Math.ceil(bufSize.x / cw), rows: Math.ceil(bufSize.y / ch), font: buildAtlas(gw, gh, actor) };
}
export function applyDensity() {
  const [w, h] = DENSITY[densityIdx];
  const cw = Math.max(3, Math.round(w * DPR)), ch = Math.max(5, Math.round(h * DPR));
  grids.env?.font.dispose();
  const E = grids.env = makeGrid(cw, ch, OVERLAP);
  envCh = ch;
  asciiGrid.uRtPx.value.set(rt.width, rt.height);                               // the scene render's grid, for world-anchored ASCII art
  asciiGrid.uCellPx.value.set(cw * rt.width / bufSize.x, ch * rt.height / bufSize.y);
  cellRT.setSize(E.cols, E.rows);
  glowA.setSize(E.cols, E.rows); glowB.setSize(E.cols, E.rows);
  const wc = Math.max(1, Math.ceil(E.cols / 2)), wr = Math.max(1, Math.ceil(E.rows / 2));
  wideA.setSize(wc, wr); wideB.setSize(wc, wr);
  cellMat.uniforms.uRes.value.copy(bufSize);
  const u = postMat.uniforms;
  u.uRes.value.copy(bufSize);
  u.uCell.value.set(E.cw, E.ch); u.uGlyph.value.set(E.gw, E.gh); u.uGrid.value.set(E.cols, E.rows); u.tFont.value = E.font;
  buildActorGrid(actorPitch(fitPx > 0 ? fitPx / ACTOR_ROWS : Infinity));
}
/** actor cell height for an ideal (fractional) pitch, kept between legible-but-small and the largest */
function actorPitch(ideal: number) {
  const most = Math.max(5, Math.round(envCh * ACTOR_SCALE)), least = Math.min(most, DPR >= 1.5 ? Math.max(3, Math.round(1.5 * DPR)) : 4);
  return Math.min(most, Math.max(least, Math.round(ideal)));
}
function buildActorGrid(ah: number) {
  grids.actor?.font.dispose();
  const A = grids.actor = makeGrid(Math.max(3, Math.round(ah * 0.58)), ah, ACTOR_OVERLAP, true);
  actorCellRT.setSize(A.cols, A.rows);
  const u = postMat.uniforms;
  u.uCellA.value.set(A.cw, A.ch); u.uGlyphA.value.set(A.gw, A.gh); u.uGridA.value.set(A.cols, A.rows); u.tFontA.value = A.font;
}
/** every frame: the ronin's height on screen (device px) sizes the characters' grid */
export function fitActorGrid(px: number) {
  fitPx = px;
  const ideal = px / ACTOR_ROWS, cur = grids.actor!.ch, want = actorPitch(ideal);
  // a little hysteresis, so zooming across a boundary does not flicker between two fonts
  if (want !== cur && (Math.abs(ideal - cur) > 0.75 || want === actorPitch(Infinity) || want === actorPitch(0))) buildActorGrid(want);
}
applyDensity();

/** + / - : step through DENSITY (negative step = smaller cells, more characters) */
export function changeDensity(step: number) {
  densityIdx = Math.min(DENSITY.length - 1, Math.max(0, densityIdx + step));
  applyDensity();
}

/** scene -> actor mask -> character cells (environment grid + actor grid) -> screen */
export function renderAscii(scene: THREE.Scene, camera: THREE.Camera) {
  projectFlares();
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  // the relief engine's camera: rebuild view-space positions from depth, light them with the moon
  const cu0 = cellMat.uniforms, pc = camera as THREE.PerspectiveCamera;
  cu0.uProjInv.value.copy(pc.projectionMatrixInverse);
  cu0.uProj.value.copy(pc.projectionMatrix);
  cu0.uTime.value = performance.now() / 1000;
  cu0.uProjScale.value.set(pc.projectionMatrix.elements[0] * 0.5, pc.projectionMatrix.elements[5] * 0.5);
  cu0.uViewRot.value.setFromMatrix4(pc.matrixWorld);
  cu0.uMoonV.value.copy(cu0.uMoonW.value).transformDirection(pc.matrixWorldInverse);
  const bg = scene.background;
  scene.background = null; scene.overrideMaterial = maskMat; camera.layers.set(ACTOR_LAYER);
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(maskRT); renderer.clear(); renderer.render(scene, camera);
  scene.background = bg; scene.overrideMaterial = null; camera.layers.set(0);
  const cu = cellMat.uniforms;
  cu.uActor.value = 0; cu.uCell.value.set(grids.env!.cw, grids.env!.ch);
  renderer.setRenderTarget(cellRT); renderer.render(cellScene, postCam);
  if (surfaceGlyphs.uSurfGlyph.value < 0.5) {   // the figures' screen grid (not needed when they wear their letters)
    cu.uActor.value = 1; cu.uCell.value.set(grids.actor!.cw, grids.actor!.ch);
    renderer.setRenderTarget(actorCellRT); renderer.render(cellScene, postCam);
  }
  renderGlow();
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}

/** call after renderer.setSize */
export function resizeAscii() {
  renderer.getDrawingBufferSize(bufSize);
  rt.setSize(bufSize.x * RT_SCALE, bufSize.y * RT_SCALE); maskRT.setSize(bufSize.x, bufSize.y);
  applyDensity();   // grid size + glyph atlas follow the new canvas size
}
