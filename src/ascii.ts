// ASCII post-process: turns the rendered scene into real text-mode output (one printable ASCII
// character per cell), with a finer character grid for the actors and light-aware contours.
import * as THREE from 'three';
import { renderer, DPR } from './renderer';

export const bufSize = new THREE.Vector2();
renderer.getDrawingBufferSize(bufSize);
const RT_SCALE = bufSize.x * bufSize.y > 4e6 ? 0.6 : 1;
const sceneDepth = new THREE.DepthTexture(bufSize.x * RT_SCALE, bufSize.y * RT_SCALE, THREE.UnsignedIntType);
const rt = new THREE.WebGLRenderTarget(bufSize.x * RT_SCALE, bufSize.y * RT_SCALE, { type: THREE.HalfFloatType, depthTexture: sceneDepth });

// Real text-mode output: the screen is a grid of small cells and every cell holds ONE printable
// ASCII character (0x20-0x7E) in ONE colour, on black. Glyphs are drawn larger than their cell
// (OVERLAP) so neighbouring characters overlap and weave denser textures, but everything on
// screen is still made of characters: no image shows through between the strokes.
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
  " .:-=+szSZN#%@"          // 6 actor
];
const ACTOR_CHARS = " .':;=+xzo#@"; // punctuation and short strokes stay distinct on the smallest grid
const EDGE_CHARS = '|\\-/';  // row 7: outline strokes, picked by edge direction
for (const s of [...CLASS_CHARS, ACTOR_CHARS, EDGE_CHARS]) for (const ch of s) {
  const k = ch.charCodeAt(0);
  if (k < 0x20 || k > 0x7e) throw new Error(`glyph no ASCII: ${JSON.stringify(ch)}`);
}
const N = 12, ROWS = CLASS_CHARS.length + 1, EDGE_ROW = CLASS_CHARS.length;
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
  return CLASS_CHARS.map(set => {
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
  RAMPS.forEach((ramp, r) => [...(actor && r === 6 ? ACTOR_CHARS : ramp)].forEach((c, i) => put(c, i, r)));
  [...EDGE_CHARS].forEach((c, i) => put(c, i, EDGE_ROW));
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
// Characters use a finer grid with enough overlap for narrow ASCII strokes to stay legible.
const ACTOR_SCALE = 0.29, ACTOR_OVERLAP = 1.65;
interface Grid { cw: number; ch: number; gw: number; gh: number; cols: number; rows: number; font: THREE.CanvasTexture }
const grids: { env: Grid | null; actor: Grid | null } = { env: null, actor: null };
export const cellMat = new THREE.ShaderMaterial({
  uniforms: {
    tScene: { value: rt.texture }, tMask: { value: maskRT.texture },
    uRes: { value: bufSize.clone() }, uCell: { value: new THREE.Vector2() },
    uN: { value: N }, uEdgeRow: { value: EDGE_ROW }, uMode: { value: 0 }, uHit: { value: 0 }, uTime: { value: 0 }, uActor: { value: 0 },
    uLight: { value: new THREE.Vector2(0, 1) }   // moonlight direction on screen (unit, pixels, y up)
  },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tScene; uniform sampler2D tMask;
    uniform vec2 uRes; uniform vec2 uCell; uniform float uN; uniform float uEdgeRow; uniform float uMode; uniform float uHit; uniform float uActor;
    uniform vec2 uLight;
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
    vec3 grade(vec3 c){ return pow(aces(c * 1.9), vec3(1.0 / 2.2)); }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float Mk(vec2 uv){ return texture2D(tMask, uv).r; }
    vec3 cellCol(vec2 uv, vec2 cs){
      vec2 o = cs * 0.3;
      return (texture2D(tScene, uv).rgb * 2.0 + texture2D(tScene, uv + o).rgb + texture2D(tScene, uv - o).rgb
        + texture2D(tScene, uv + vec2(o.x, -o.y)).rgb + texture2D(tScene, uv + vec2(-o.x, o.y)).rgb) / 6.0;
    }
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
      vec2 dx = vec2(cs.x * 0.3, 0.0), dy = vec2(0.0, cs.y * 0.3);
      float center = Mk(uv);
      vec4 sides = vec4(Mk(uv + dx), Mk(uv - dx), Mk(uv + dy), Mk(uv - dy));
      float coverage = center * 2.0 + dot(sides, vec4(1.0));
      if (uActor > 0.5) {
        if (coverage < 1.0) { gl_FragColor = vec4(0.0); return; }
        // ---- actors: silhouette drawn with | \\ - / strokes, creases too, body filled with the actor ramp
        // Sample actor colours only, so a narrow horn or blade keeps its colour at the edge.
        vec3 ac = grade((texture2D(tScene, uv).rgb * (2.0 * center)
          + texture2D(tScene, uv + dx).rgb * sides.x + texture2D(tScene, uv - dx).rgb * sides.y
          + texture2D(tScene, uv + dy).rgb * sides.z + texture2D(tScene, uv - dy).rgb * sides.w) / coverage);
        float al = min(pow(luma(ac), 0.58), 0.999);
        vec2 e = cs;
        float m0 = M(uv, e, -1., 1.), m1 = M(uv, e, 0., 1.), m2 = M(uv, e, 1., 1.), m3 = M(uv, e, -1., 0.);
        float m5 = M(uv, e, 1., 0.), m6 = M(uv, e, -1., -1.), m7 = M(uv, e, 0., -1.), m8 = M(uv, e, 1., -1.);
        vec2 mg = vec2((m2 + 2.*m5 + m8) - (m0 + 2.*m3 + m6), (m0 + 2.*m1 + m2) - (m6 + 2.*m7 + m8));
        float a0 = L(uv, e, -1., 1.), a1 = L(uv, e, 0., 1.), a2 = L(uv, e, 1., 1.), a3 = L(uv, e, -1., 0.);
        float a5 = L(uv, e, 1., 0.), a6 = L(uv, e, -1., -1.), a7 = L(uv, e, 0., -1.), a8 = L(uv, e, 1., -1.);
        vec2 gl = vec2((a2 + 2.*a5 + a8) - (a0 + 2.*a3 + a6), (a0 + 2.*a1 + a2) - (a6 + 2.*a7 + a8));
        bool outline = length(mg) > 1.8;
        if (outline) { row = uEdgeRow; idx = bin(mg); }
        else if (length(gl) > 0.7) { row = uEdgeRow; idx = bin(gl); }
        else { row = 6.0; idx = max(floor(al * uN), 3.0); }   // shadows keep their punctuation texture
        vec3 tint = ac / max(max(max(ac.r, ac.g), ac.b), 0.03);
        // stronger light / shadow: dim strokes in the shade (the solid backing carries the form there),
        // white-hot strokes where the light hits
        c = mix(tint, vec3(1.0), 0.04 + 0.12 * al * al) * (0.29 + 0.89 * al);
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
        c = modeCol(c, al);
      } else {
        if (coverage / 6.0 > 0.35) { gl_FragColor = vec4(0.0); return; }
        // ---- environment: glyph ramp chosen per material class (stored in alpha)
        vec4 s0 = texture2D(tScene, uv);
        vec3 col = grade(cellCol(uv, cs));
        float cls = floor(s0.a * 10.0 + 0.5);
        row = 0.0;
        if (cls > 8.5) row = 0.0;
        else if (cls < 1.5) row = 1.0;
        else if (cls < 2.5) row = 2.0;
        else if (cls < 3.5) row = 3.0;
        else if (cls < 4.5) row = 4.0;
        else if (cls < 5.5) row = 5.0;
        else if (cls < 6.5) row = 6.0;
        else row = 5.0;
        bool light = abs(row - 5.0) < 0.1;
        float l = luma(col);
        // muted night palette: desaturate and push towards indigo; lights stay warm and saturated
        bool grassRow = row > 0.5 && row < 1.5;
        bool foliageRow = row > 3.5 && row < 4.5;
        if (grassRow) col = mix(vec3(l), col, 0.85) * vec3(0.8, 1.05, 0.95);          // dark teal-green woven grass
        else if (foliageRow) col = mix(vec3(l), col, 1.15) * vec3(0.95, 0.95, 1.05);  // canopies keep their colour: pink sakura, green pine
        else if (!light) col = mix(vec3(l), col, 0.5) * vec3(0.86, 0.9, 1.12);        // indigo stone / wood
        float gain = light ? 1.4 : (grassRow ? 0.95 : (row < 3.5 && row > 1.5 ? 1.0 : 1.05));
        l = clamp(luma(col) * gain, 0.0, 0.999);
        l = smoothstep(0.0, 1.0, l) * 0.55 + l * 0.45;                 // contrast curve: shadows sink, lit areas pop
        if (row > 0.5 && row < 4.5) l = max(l, 0.1);   // shadows keep a faint woven texture
        idx = floor(l * uN);
        vec3 tint = col / max(max(max(col.r, col.g), col.b), 0.04);
        c = light ? mix(tint, vec3(1.0), 0.25) * (0.75 + 0.6 * l) : tint * (0.2 + 0.6 * l);
        c = modeCol(c, l);
      }
      c = mix(c, hurt * max(luma(c), 0.5), uHit * 0.6);   // damage flash tints the characters, not the background
      gl_FragColor = vec4(c, row * uN + idx);
    }`
});
const cellScene = new THREE.Scene();
cellScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), cellMat));

const postMat = new THREE.ShaderMaterial({
  uniforms: {
    tCells: { value: cellRT.texture }, tFont: { value: null }, tCellsA: { value: actorCellRT.texture }, tFontA: { value: null },
    tMask: { value: maskRT.texture }, uRes: { value: bufSize.clone() }, uN: { value: N },
    tScene: { value: rt.texture }, uMode: cellMat.uniforms.uMode, uHit: cellMat.uniforms.uHit, uRim: { value: 1.15 * DPR }, uLight: cellMat.uniforms.uLight,
    uCell: { value: new THREE.Vector2() }, uGlyph: { value: new THREE.Vector2() }, uGrid: { value: new THREE.Vector2() },
    uCellA: { value: new THREE.Vector2() }, uGlyphA: { value: new THREE.Vector2() }, uGridA: { value: new THREE.Vector2() }
  },
  vertexShader: `void main(){ gl_Position = vec4(position.xy, 0.0, 1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tCells; uniform sampler2D tFont; uniform sampler2D tCellsA; uniform sampler2D tFontA; uniform sampler2D tMask;
    uniform vec2 uRes; uniform float uN;
    uniform vec2 uCell; uniform vec2 uGlyph; uniform vec2 uGrid; uniform vec2 uCellA; uniform vec2 uGlyphA; uniform vec2 uGridA;
    uniform sampler2D tScene; uniform float uMode; uniform float uHit; uniform float uRim; uniform vec2 uLight;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
    vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
    vec3 grade(vec3 c){ return pow(aces(c * 1.9), vec3(1.0 / 2.2)); }
    float luma(vec3 c){ return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
    float mask(vec2 p){ return texture2D(tMask, p / uRes).r; }
    // solid colour behind the actor characters, one flat tile per actor cell, cel-shaded in bands
    vec3 actorBacking(vec2 fc){
      vec2 p = (floor(fc / uCellA) + 0.5) * uCellA;
      vec3 bc = grade(texture2D(tScene, (mask(p) > 0.5 ? p : fc) / uRes).rgb);
      float l = luma(bc);
      float band = l < 0.05 ? 0.03 : l < 0.14 ? 0.15 : l < 0.28 ? 0.3 : l < 0.48 ? 0.48 : 0.68;
      vec3 tint = bc / max(max(max(bc.r, bc.g), bc.b), 0.03);
      tint = mix(vec3(luma(tint)), tint, 1.15);                   // keep armour colours rich
      vec3 b = tint * band;
      if (uMode > 2.5) b = vec3(0.93) * band;
      else if (uMode > 1.5) b = vec3(1.0, 0.68, 0.22) * band;
      else if (uMode > 0.5) b = vec3(0.25, 1.0, 0.45) * band;
      return mix(b, vec3(1.0, 0.12, 0.08) * max(band, 0.3), uHit * 0.5) * 0.2;   // faint: the characters must stay the main read
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
        float row = floor(code / uN), idx = code - row * uN;
        if (idx < 0.5 && row < 7.5) continue;                       // blank cell
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
      vec3 et, es, at, as;
      layer(tCellsA, tFontA, uCellA, uGlyphA, uGridA, fc, false, at, as);
      vec3 actor = mix(at, as, 0.2);
      vec3 col;
      if (mask(fc) > 0.5) {
        // inside a silhouette: small actor characters over a solid cel-shaded backing
        vec3 back = actorBacking(fc);
        col = max(actor, back);
      } else {
        layer(tCells, tFont, uCell, uGlyph, uGrid, fc, true, et, es);
        col = max(mix(et, es, 0.25), actor);
        // dark contour just outside the silhouette
        float r = uRim * 1.5, d = r * 0.7;
        float near = max(max(max(mask(fc + vec2(r, 0.)), mask(fc - vec2(r, 0.))), max(mask(fc + vec2(0., r)), mask(fc - vec2(0., r)))),
                         max(max(mask(fc + vec2(d, d)), mask(fc - vec2(d, d))), max(mask(fc + vec2(d, -d)), mask(fc + vec2(-d, d)))));
        // which way the silhouette is: g points from here towards the actor
        vec2 g = vec2(mask(fc + vec2(r, 0.)) - mask(fc - vec2(r, 0.)), mask(fc + vec2(0., r)) - mask(fc - vec2(0., r)))
               + vec2(mask(fc + vec2(d, d)) - mask(fc - vec2(d, d)) + mask(fc + vec2(d, -d)) - mask(fc + vec2(-d, d)),
                      mask(fc + vec2(d, d)) - mask(fc - vec2(d, d)) - mask(fc + vec2(d, -d)) + mask(fc + vec2(-d, d))) * 0.7;
        float litSide = length(g) > 0.01 ? smoothstep(-0.15, 0.6, dot(normalize(-g), uLight)) : 0.0;
        // deep dark halo on the shadow side, a lighter one where the moon hits (so the bright rim pops)
        col *= 1.0 - near * mix(0.92, 0.4, litSide);
      }
      vec2 q = fc / uRes - 0.5;
      float vig = 1.0 - dot(q, q) * 1.1;
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
  grids.env?.font.dispose(); grids.actor?.font.dispose();
  const E = grids.env = makeGrid(cw, ch, OVERLAP);
  // Half-pixel pitch packs in more detail at 1x without shaving pixels off the font atlas.
  const aw = Math.max(1.5, Math.round(cw * ACTOR_SCALE * 2) / 2);
  const ah = Math.max(2.5, Math.round(ch * ACTOR_SCALE * 2) / 2);
  const A = grids.actor = makeGrid(aw, ah, ACTOR_OVERLAP, true);
  cellRT.setSize(E.cols, E.rows); actorCellRT.setSize(A.cols, A.rows);
  cellMat.uniforms.uRes.value.copy(bufSize);
  const u = postMat.uniforms;
  u.uRes.value.copy(bufSize);
  u.uCell.value.set(E.cw, E.ch); u.uGlyph.value.set(E.gw, E.gh); u.uGrid.value.set(E.cols, E.rows); u.tFont.value = E.font;
  u.uCellA.value.set(A.cw, A.ch); u.uGlyphA.value.set(A.gw, A.gh); u.uGridA.value.set(A.cols, A.rows); u.tFontA.value = A.font;
}
applyDensity();

/** + / - : step through DENSITY (negative step = smaller cells, more characters) */
export function changeDensity(step: number) {
  densityIdx = Math.min(DENSITY.length - 1, Math.max(0, densityIdx + step));
  applyDensity();
}

/** scene -> actor mask -> character cells (environment grid + actor grid) -> screen */
export function renderAscii(scene: THREE.Scene, camera: THREE.Camera) {
  renderer.setRenderTarget(rt); renderer.render(scene, camera);
  const bg = scene.background;
  scene.background = null; scene.overrideMaterial = maskMat; camera.layers.set(ACTOR_LAYER);
  renderer.setClearColor(0x000000, 1);
  renderer.setRenderTarget(maskRT); renderer.clear(); renderer.render(scene, camera);
  scene.background = bg; scene.overrideMaterial = null; camera.layers.set(0);
  const cu = cellMat.uniforms;
  cu.uActor.value = 0; cu.uCell.value.set(grids.env!.cw, grids.env!.ch);
  renderer.setRenderTarget(cellRT); renderer.render(cellScene, postCam);
  cu.uActor.value = 1; cu.uCell.value.set(grids.actor!.cw, grids.actor!.ch);
  renderer.setRenderTarget(actorCellRT); renderer.render(cellScene, postCam);
  renderer.setRenderTarget(null); renderer.render(postScene, postCam);
}

/** call after renderer.setSize */
export function resizeAscii() {
  renderer.getDrawingBufferSize(bufSize);
  rt.setSize(bufSize.x * RT_SCALE, bufSize.y * RT_SCALE); maskRT.setSize(bufSize.x, bufSize.y);
  applyDensity();   // grid size + glyph atlas follow the new canvas size
}
