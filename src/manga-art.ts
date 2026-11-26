// Illustrated finish for the characters, after the hand-painted heroes of Vorpal Arena: the mocap body
// (a soldier in fatigues underneath) is repainted as kimono, hakama, skin and embroidery, region by
// region from its bind pose, and every actor material gets a cool painted rim light on its contour.
// Materials are cloned freely by the game (and three.js does not copy onBeforeCompile), so this runs
// on the finished tree, just before the materials are tagged for the ASCII pass.
import * as THREE from 'three';
import { tagMat } from './materials';
import { glyphShader } from './surface-glyphs';
import { detailedSurfaces, sunsetSunDir } from './surfaces';

// ASCII sub-classes of the actor class (ascii.ts picks a character ramp from them)
export const ACTOR_CLOTH = 0.6, ACTOR_METAL = 0.62, ACTOR_SKIN = 0.64;

export type BodyKind = 'ronin' | 'oni';
export interface BodyPaint {
  kind: BodyKind;
  skin: number;       // face / hands (ronin) or demon skin (oni)
  hakama: number;     // trousers
  trim: number;       // embroidered thread
  under: number;      // under-collar (ronin) or tiger-skin loincloth (oni)
  wrap: number;       // hand and foot bindings
}

export const roninRobe = {
  uRoninOutfit: { value: 0 },
  uRoninLinen: { value: new THREE.Color() }
};

/** Live animated elemental surface shader uniforms for Fire (1), Electricity (2), Black Fire (3), White Fire (4), and Neon (5) */
export const armorElemFX = {
  uArmorElem: { value: 0 },
  uElemTime: { value: 0 },
};

/** mark a skinned body material for repainting (the paint is installed by mangaFinish) */
export function paintBody(mat: THREE.MeshStandardMaterial, paint: BodyPaint) {
  mat.map = null; mat.normalMap = null; mat.emissiveMap = null;
  mat.userData.bodyPaint = { ...paint };
  mat.needsUpdate = true;
}

const BODY_COMMON = /* glsl */`
#define PIXEL_CLS
float pixelCls = 0.0;
varying vec3 vBind;
uniform vec3 uSkin, uHakama, uTrim, uUnder, uWrap;
float band(float d, float w) { float a = fwidth(d) + 0.2; return 1.0 - smoothstep(w * 0.5, w * 0.5 + a, abs(d)); }
// seigaiha: overlapping rows of concentric waves, one scale per unit
float seigaiha(vec2 p) {
  float j0 = floor(p.y * 2.0), v = 0.0, d = 1.0;
  for (int k = 2; k >= -1; k--) {
    float j = j0 + float(k), off = mod(j, 2.0) * 0.5;
    vec2 c = vec2(floor(p.x - off + 0.5) + off, j * 0.5);
    float e = length(p - c);
    if (e < 0.5) d = e;
  }
  float r = fract(d * 6.0);
  return smoothstep(0.55, 0.7, r) * step(d, 0.49);
}
`;

const RONIN_UNIFORMS = /* glsl */`
uniform float uRoninOutfit;
uniform vec3 uRoninLinen;
`;

const RONIN_CLOTH = /* glsl */`
{
  vec3 b = vBind; float ax = abs(b.x), z = b.z;
  vec3 cloth = diffuseColor.rgb, col;
  float fold = 0.5 + 0.5 * sin(b.x * 0.23 + z * 0.11 + 2.0 * sin(z * 0.05 + b.y * 0.2));
  if (ax > 67.0) {
    // hands: leather bindings crossing over the knuckles
    float strap = step(0.55, fract((ax + z * 0.8) * 0.33));
    col = uWrap * (0.7 + 0.5 * strap);
  } else if (z > 154.0 && ax < 14.0) {
    if (z > 158.5) discard;   // the soldier's head: the scanned head (real-head.ts) takes its place
    col = (z > 171.0 || b.y < -3.0) ? vec3(0.025, 0.022, 0.03) : uSkin;
    if (z <= 171.0 && b.y >= -3.0) pixelCls = 0.64;
  } else if (z > 124.0 && ax > 20.0) {
    // sleeves: wave weave, embroidered cuff
    col = cloth * (0.8 + 0.3 * fold);
    col *= 1.0 + 0.22 * (seigaiha(vec2(ax, z) / 6.5) - 0.4);
    col = mix(col, uTrim, band(ax - 61.5, 2.0) * 0.95);
    if (band(ax - 61.5, 2.0) > 0.5) pixelCls = 0.62;
    col = mix(col, uTrim * 0.7, band(ax - 58.0, 0.6) * 0.8);
    col = mix(col, uUnder, band(ax - 64.6, 1.4));
  } else if (z > 100.0) {
    // kimono: tone-on-tone waves, crossed collar in front, collar band round the back of the neck
    col = cloth * (0.82 + 0.26 * fold);
    col *= 1.0 + 0.22 * (seigaiha(vec2(b.x, z) / 7.0) - 0.4);
    float d = ax - (z - 112.0) * 0.2;
    if (b.y > 0.0 && z > 108.0) {
      if (d < -2.2) col = cloth * 0.45;
      else if (d < 0.0) col = uUnder;
      else if (d < 3.4) col = mix(vec3(0.03), uTrim * 0.35, 0.25);
      col = mix(col, uTrim, band(d - 3.7, 0.8));
    } else if (b.y <= 0.0 && z > 147.0) col = mix(vec3(0.03), uTrim, band(z - 147.4, 0.7));
  } else if (z > 9.0) {
    // hakama: deep pleats and fine pinstripes
    float pleat = 0.5 + 0.5 * sin(b.x * 0.75 + b.y * 0.3);
    col = uHakama * (0.7 + 0.55 * pleat);
    col += uHakama * 0.9 * band(fract(b.x / 3.2) - 0.5, 0.06);
  } else col = uWrap;
  bool lining = z > 22.0 && z < 159.0 && ax < 64.5 && !(z > 154.0 && ax < 12.0);
  if (lining && (uRoninOutfit > 1.5 || (uRoninOutfit > 0.5 && z > 100.0 && ax < 27.0))) {
    // The robe's lining covers the old uniform between the sleeves, hems and collar.
    col = uRoninLinen * (0.47 + 0.33 * fold);
    pixelCls = 0.0;
  }
  // painted occlusion in the armpits and between the legs
  float ao = 1.0 - 0.35 * exp(-pow((ax - 20.0) / 5.0, 2.0) - pow((z - 130.0) / 7.0, 2.0))
                 - 0.3 * exp(-pow(ax / 6.0, 2.0) - pow((z - 92.0) / 7.0, 2.0));
  diffuseColor.rgb = col * (0.96 + 0.04 * sin(b.x * 5.1) * sin(z * 5.3)) * ao;
}
`;

const ONI_PAINT = /* glsl */`
{
  vec3 b = vBind; float ax = abs(b.x), z = b.z;
  vec3 col;
  if (z > 120.0 && ax > 19.0) {
    // bare demon arms: swelling muscles, iron cuffs, black claws
    float bulge = 0.5 + 0.5 * sin(ax * 0.17 - 0.6);
    col = uSkin * (0.62 + 0.5 * bulge) * (0.85 + 0.2 * smoothstep(-6.0, 10.0, z - 140.0 + b.y * 0.3));
    float cuff = step(57.0, ax) * step(ax, 66.0);
    col = mix(col, uHakama * 0.9 + 0.02, cuff);
    col = mix(col, uTrim, band(ax - 57.6, 0.9) + band(ax - 65.4, 0.9));
    col = mix(col, vec3(0.03, 0.02, 0.02), step(85.0, ax));
    pixelCls = cuff > 0.5 ? 0.62 : 0.64;
  } else if (z > 150.0) {
    col = uSkin * 0.75; pixelCls = 0.64;
  } else if (z > 106.0) {
    pixelCls = 0.64;
    // bare chest: pectorals and a ridged belly in front, spine down the back
    col = uSkin * (0.78 + 0.25 * smoothstep(100.0, 150.0, z));
    if (b.y > 0.0) {
      float pec = band(z - (132.0 - ax * 0.18), 1.6) * step(ax, 17.0);
      float abs_ = (band(b.x, 0.9) + band(fract((z - 104.0) / 6.5) - 0.5, 0.06) * step(ax, 8.0)) * step(z, 128.0);
      col *= 1.0 - 0.38 * clamp(pec + abs_, 0.0, 1.0);
    } else col *= 1.0 - 0.3 * band(b.x, 1.3);
  } else if (z > 82.0) {
    // tiger-skin loincloth: ochre with brushed black stripes and a rope belt
    float s = sin(b.x * 0.45 + sin(z * 0.35 + b.y * 0.2) * 1.6 + z * 0.12);
    col = mix(uUnder, uUnder * 0.15, smoothstep(0.45, 0.6, s));
    col = mix(col, uTrim * 0.8, band(z - 104.0, 2.2));
  } else if (z > 9.0) {
    float pleat = 0.5 + 0.5 * sin(b.x * 0.7 + b.y * 0.35);
    col = uHakama * (0.7 + 0.55 * pleat);
    col = mix(col, uWrap, step(z, 34.0) * (0.6 + 0.4 * step(0.5, fract(z / 4.0))));
  } else col = uWrap * 0.6;
  float ao = 1.0 - 0.35 * exp(-pow((ax - 19.0) / 5.0, 2.0) - pow((z - 130.0) / 7.0, 2.0));
  diffuseColor.rgb = col * ao;
}
`;

// Animated elemental cloth & armor surface FX (runs directly on the fabric & armor plates — no floating orbs!)
const ELEM_HELPERS = /* glsl */`
varying vec3 vElemPos;
uniform float uArmorElem;
uniform float uElemTime;
float ehash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float enoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(ehash(i), ehash(i + vec2(1.0, 0.0)), f.x),
             mix(ehash(i + vec2(0.0, 1.0)), ehash(i + vec2(1.0, 1.0)), f.x), f.y);
}
`;

const ELEM_SURFACE = /* glsl */`
if (uArmorElem > 0.5) {
  vec3 vdE = normalize(vViewPosition);
  float rimE = 1.0 - clamp(dot(normal, vdE), 0.0, 1.0);
  // Cylindrical surface coordinates around the character for seamless rising flames & crackling arcs
  float angE = atan(vElemPos.x, vElemPos.z);
  vec2 spE = vec2(angE * 1.4, vElemPos.y * 3.6);

  if (uArmorElem < 1.5) {
    // 1: FIRE (Armadura de Kagutsuchi) — turbulent rising flames licking across the cloth & armor plates
    float n1 = enoise(spE * vec2(1.5, 1.4) - vec2(0.0, uElemTime * 4.8));
    float n2 = enoise(spE * vec2(3.4, 3.2) + vec2(uElemTime * 1.2, -uElemTime * 8.4));
    float n3 = enoise(spE * vec2(6.5, 5.5) - vec2(uElemTime * 0.9, uElemTime * 11.5));
    float f = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
    float flame = smoothstep(0.36, 0.78, f + rimE * 0.28);
    float core = smoothstep(0.64, 0.90, f + rimE * 0.20);
    vec3 fCol = mix(vec3(0.95, 0.18, 0.02), vec3(1.0, 0.55, 0.08), flame);
    fCol = mix(fCol, vec3(1.0, 0.94, 0.62), core);
    totalEmissiveRadiance += fCol * (flame * 1.35 + pow(rimE, 2.2) * 0.95);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.18, 0.03, 0.01), flame * 0.45);
  } else if (uArmorElem < 2.5) {
    // 2: ELECTRICITY (Armadura de Raijin) — clean crisp white fabric/plates (NO blinking wash!),
    // with only thin razor-sharp cyan-white static arcs tracing the surface while 3D bolts erupt outward
    float snap = floor(uElemTime * 16.0) * 1.73;
    float b1 = 1.0 - abs(enoise(spE * vec2(3.2, 2.8) + vec2(snap, -uElemTime * 2.4)) * 2.0 - 1.0);
    float b2 = 1.0 - abs(enoise(spE * vec2(6.4, 5.6) - vec2(snap * 0.81, uElemTime * 4.2)) * 2.0 - 1.0);
    float thinBolt = pow(b1, 14.0) * 1.15 + pow(b2, 16.0) * 0.95;
    totalEmissiveRadiance += vec3(0.45, 0.86, 1.0) * thinBolt;
  } else if (uArmorElem < 3.5) {
    // 3: BLACK FIRE WITH FINE WHITE NEON CONTOURS (Armadura / Túnica del Fuego Negro)
    // Pitch-black rising abyssal flames across the cloth & plates, traced by razor-thin white neon edges
    float n1 = enoise(spE * vec2(1.6, 1.5) - vec2(0.0, uElemTime * 4.4));
    float n2 = enoise(spE * vec2(3.8, 3.5) + vec2(uElemTime * 1.0, -uElemTime * 7.8));
    float f = n1 * 0.62 + n2 * 0.38;
    float blackMask = smoothstep(0.42, 0.56, f);
    // Razor-thin glowing white neon contour strictly along the edge of each black flame tongue
    float flameEdge = smoothstep(0.42, 0.48, f) * (1.0 - smoothstep(0.48, 0.55, f));
    // Crisp fine white neon silhouette outline hugging the folds of the cloth & armor plates
    float fineRim = smoothstep(0.66, 0.84, rimE);
    diffuseColor.rgb = mix(diffuseColor.rgb * 0.25, vec3(0.008, 0.008, 0.014), blackMask);
    totalEmissiveRadiance *= (1.0 - blackMask * 0.75);
    totalEmissiveRadiance += vec3(0.95, 0.98, 1.0) * (flameEdge * 2.2 + fineRim * 1.75);
  } else if (uArmorElem < 4.5) {
    // 4: WHITE FIRE (Túnica de Fuego Blanco) — incandescent pure-white & ice-cyan celestial flames
    float n1 = enoise(spE * vec2(1.5, 1.4) - vec2(0.0, uElemTime * 4.6));
    float n2 = enoise(spE * vec2(3.4, 3.2) + vec2(uElemTime * 1.1, -uElemTime * 8.2));
    float n3 = enoise(spE * vec2(6.5, 5.5) - vec2(uElemTime * 0.8, uElemTime * 11.0));
    float f = n1 * 0.55 + n2 * 0.30 + n3 * 0.15;
    float flame = smoothstep(0.36, 0.76, f + rimE * 0.28);
    float core = smoothstep(0.60, 0.88, f + rimE * 0.22);
    vec3 fCol = mix(vec3(0.55, 0.84, 1.0), vec3(0.92, 0.97, 1.0), flame);
    fCol = mix(fCol, vec3(1.0, 1.0, 1.0), core);
    totalEmissiveRadiance += fCol * (flame * 1.35 + pow(rimE, 2.0) * 1.10);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.92, 0.96, 1.0), flame * 0.45);
  } else {
    // 5: NEON (Túnica de Neón) — pulsing electric cyan & magenta energy waves and luminous silhouette rim
    float scan = 0.5 + 0.5 * sin(vElemPos.y * 18.0 - uElemTime * 6.0 + angE * 2.0);
    float pulse = pow(scan, 4.0);
    float dual = 0.5 + 0.5 * sin(vElemPos.y * 5.0 - uElemTime * 2.4 + angE);
    vec3 neonCol = mix(vec3(0.18, 0.94, 1.0), vec3(1.0, 0.22, 0.80), dual);
    float fineRim = smoothstep(0.58, 0.86, rimE);
    totalEmissiveRadiance += neonCol * (pulse * 0.75 + fineRim * 1.45);
  }
}
`;

// rim light: the edge turned away from the camera catches a painted light on its contour.
// In Mode T (sunset), characters get a stronger golden-hour hero rim and subtle shadow lift so
// they never disappear into dark foliage or cast shadows while keeping ground shadows crisp.
const RIM = /* glsl */`
{
  vec3 viewDir = normalize(vViewPosition);
  float rimRaw = 1.0 - clamp(dot(normal, viewDir), 0.0, 1.0);
  if (uHeroSunset > 0.5) {
    vec3 sunV = normalize((viewMatrix * vec4(uHeroSunDir, 0.0)).xyz);
    float sunRim = smoothstep(-0.35, 0.75, dot(normal, sunV));
    float broadRim = pow(rimRaw, 1.9);
    float crispRim = smoothstep(0.42, 0.90, rimRaw);
    vec3 rimCol = mix(vec3(0.88, 0.62, 0.44), vec3(1.0, 0.80, 0.42), sunRim);
    // Warm contour glow + gentle albedo lift so characters stay readable even inside deep shadows
    totalEmissiveRadiance += mix(diffuseColor.rgb, rimCol, 0.62) * (broadRim * 0.72 + crispRim * 0.42 * (0.45 + 0.55 * sunRim));
    totalEmissiveRadiance += diffuseColor.rgb * 0.22 + vec3(0.028, 0.020, 0.014);
  } else {
    float rimF = rimRaw * rimRaw * rimRaw;
    totalEmissiveRadiance += mix(diffuseColor.rgb, vec3(0.55, 0.72, 1.0), 0.55) * rimF * 0.3;
  }
}
`;

// form light: chiaroscuro modelling, so the figure reads as a volume and not a flat cut-out.
// A 3/4 key from the moon's side of the screen (camera.ts keeps it in view space every frame):
// the lit side keeps its colour, the turned-away side sinks into a deep shadow with a darker
// core shadow along the terminator, and the rim (above) still catches the far edge.
export const formKey = { value: new THREE.Vector3(-0.55, 0.55, 0.62).normalize() };
const FORM = /* glsl */`
{
  float ndl = dot(normal, uFormKey);
  float lit = smoothstep(-0.18, 0.42, ndl);                              // soft terminator
  if (uHeroSunset > 0.5) {
    float core = 1.0 - 0.14 * exp(-pow((ndl + 0.02) / 0.16, 2.0));       // gentle volume turn
    float form = mix(0.76, 1.52, lit) * core;
    vec3 litPart = (outgoingLight - totalEmissiveRadiance) * form;
    // Golden sunset sheen on the side facing the key light
    litPart += mix(diffuseColor.rgb, vec3(1.0, 0.78, 0.45), 0.55) * pow(max(ndl, 0.0), 4.5) * 0.36;
    outgoingLight = litPart + totalEmissiveRadiance;
  } else {
    float core = 1.0 - 0.32 * exp(-pow((ndl + 0.02) / 0.14, 2.0));       // core shadow right at the turn
    float form = mix(0.34, 1.22, lit) * core;
    form += 0.14 * pow(max(ndl, 0.0), 6.0);                              // a broad sheen where it faces the key
    outgoingLight = (outgoingLight - totalEmissiveRadiance) * form + totalEmissiveRadiance;
  }
}
`;

const done = new WeakSet<THREE.Material>();
const c3 = (c: number) => new THREE.Color(c);

function install(mat: THREE.MeshStandardMaterial) {
  if (done.has(mat)) return;
  done.add(mat);
  const paint = mat.userData.bodyPaint as BodyPaint | undefined;
  // which character ramp the material draws with: skin (flagged), metal / lacquer, or cloth
  const phys = mat as THREE.MeshPhysicalMaterial;
  let sub = 0;   // surface-glyph set: 0 cloth, 1 metal, 2 skin
  if (mat.userData.asciiSkin) { tagMat(mat, ACTOR_SKIN); sub = 2; }
  else if (!paint && !mat.transparent && (mat.metalness >= 0.4 || (phys.isMeshPhysicalMaterial && phys.clearcoat > 0.2))) { tagMat(mat, ACTOR_METAL); sub = 1; }
  // glowing pieces (the blade, auras) stay solid light; everything else wears letters on its surface
  const e = mat.emissive, glow = Math.max(e.r, e.g, e.b) * mat.emissiveIntensity;
  const glyphs = !mat.transparent && glow < 0.8 && !mat.userData.noGlyphs;
  const hasElemFx = !!mat.userData.playerElemFx;
  const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    if (paint) {
      Object.assign(sh.uniforms, {
        uSkin: { value: c3(paint.skin) }, uHakama: { value: c3(paint.hakama) }, uTrim: { value: c3(paint.trim) },
        uUnder: { value: c3(paint.under) }, uWrap: { value: c3(paint.wrap) }
      });
      sh.vertexShader = 'varying vec3 vBind;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvBind = position;');
      const isRonin = paint.kind === 'ronin';
      if (isRonin) Object.assign(sh.uniforms, roninRobe);
      sh.fragmentShader = BODY_COMMON + (isRonin ? RONIN_UNIFORMS : '') + sh.fragmentShader.replace('#include <color_fragment>',
        '#include <color_fragment>\n' + (isRonin ? RONIN_CLOTH : ONI_PAINT));
    }
    if (hasElemFx) {
      Object.assign(sh.uniforms, armorElemFX);
      sh.vertexShader = 'varying vec3 vElemPos;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvElemPos = position;');
    }
    sh.uniforms.uFormKey = formKey;
    sh.uniforms.uHeroSunset = detailedSurfaces;
    sh.uniforms.uHeroSunDir = sunsetSunDir;
    sh.fragmentShader = 'uniform vec3 uFormKey;\nuniform float uHeroSunset;\nuniform vec3 uHeroSunDir;\n'
      + (hasElemFx ? ELEM_HELPERS : '')
      + sh.fragmentShader
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n' + RIM + (hasElemFx ? ELEM_SURFACE : ''))
        .replace('#include <opaque_fragment>', FORM + '#include <opaque_fragment>');
    if (glyphs) glyphShader(sh, sub, !!mat.userData.glyphRest);
  };
  mat.customProgramCacheKey = () => prevKey() + '|manga2' + (paint ? '-' + paint.kind : '') + (hasElemFx ? '|elemfx' : '') + (glyphs ? '|glyph' + sub + (mat.userData.glyphRest ? 'r' : '') : '');
  mat.needsUpdate = true;
}

/** install the painted body and the rim light on every lit material of a character */
export function mangaFinish(root: THREE.Object3D) {
  root.traverse(o => {
    const m = (o as THREE.Mesh).material;
    if (!m) return;
    for (const mm of Array.isArray(m) ? m : [m]) if ((mm as THREE.MeshStandardMaterial).isMeshStandardMaterial) install(mm as THREE.MeshStandardMaterial);
  });
}

// ------------------------------------------------------------ painted props (canvas textures)

function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

/** mitsudomoe: three comma-shaped tomoe swirling inside a ring */
function drawTomoe(x: CanvasRenderingContext2D, cx: number, cy: number, r: number, ink: string) {
  x.save(); x.translate(cx, cy);
  x.strokeStyle = ink; x.lineWidth = r * 0.12;
  x.beginPath(); x.arc(0, 0, r * 0.92, 0, Math.PI * 2); x.stroke();
  x.fillStyle = ink;
  for (let i = 0; i < 3; i++) {
    x.save(); x.rotate(i * Math.PI * 2 / 3);
    x.beginPath();
    x.arc(0, -r * 0.33, r * 0.25, 0, Math.PI * 2);
    x.fill();
    x.beginPath();
    x.moveTo(r * 0.25, -r * 0.33);
    x.quadraticCurveTo(r * 0.36, r * 0.2, -r * 0.12, r * 0.62);
    x.quadraticCurveTo(r * 0.12, r * 0.12, -r * 0.25, -r * 0.33);
    x.fill();
    x.restore();
  }
  x.restore();
}

const GOLD = '#e0b04a', GOLD_DARK = '#8a6420';

/** the crest worn on the chest: gold tomoe on a black lacquer disc */
export const monTex = canvasTex(128, 128, x => {
  x.fillStyle = '#0d0c10'; x.beginPath(); x.arc(64, 64, 62, 0, Math.PI * 2); x.fill();
  x.strokeStyle = GOLD_DARK; x.lineWidth = 3; x.beginPath(); x.arc(64, 64, 60, 0, Math.PI * 2); x.stroke();
  drawTomoe(x, 64, 64, 50, GOLD);
});

/** the front tabard (maedare): black silk with gold embroidered border, waves and the crest */
/** grey-scale cloth weaves, tinted by their material's colour */
export const pleatTex = (() => {
  const t = canvasTex(128, 128, x => {
    for (let i = 0; i < 16; i++) {
      const g = x.createLinearGradient(i * 8, 0, i * 8 + 8, 0);
      g.addColorStop(0, '#5a5a5a'); g.addColorStop(0.35, '#d8d8d8'); g.addColorStop(0.8, '#9a9a9a'); g.addColorStop(1, '#3a3a3a');
      x.fillStyle = g; x.fillRect(i * 8, 0, 8, 128);
    }
    x.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 16; i += 2) x.fillRect(i * 8 + 3, 0, 1, 128);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();
export const waveTex = (() => {
  const t = canvasTex(128, 128, x => {
    x.fillStyle = '#b8b8b8'; x.fillRect(0, 0, 128, 128);
    for (let row = -1; row < 9; row++) for (let col = -1; col < 5; col++) {
      const cx = col * 32 + (row % 2 ? 16 : 0), cy = row * 16;
      x.fillStyle = '#b8b8b8'; x.beginPath(); x.arc(cx, cy + 16, 16, Math.PI, 0); x.fill();
      x.strokeStyle = '#ffffff'; x.lineWidth = 2;
      for (const r of [15, 11, 7, 3]) { x.beginPath(); x.arc(cx, cy + 16, r, Math.PI, 0); x.stroke(); }
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
})();

export const tabardTex = canvasTex(128, 256, x => {
  x.fillStyle = '#141218'; x.fillRect(0, 0, 128, 256);
  // tone-on-tone seigaiha in the weave
  x.strokeStyle = 'rgba(120,110,140,0.22)'; x.lineWidth = 1.2;
  for (let row = 0; row < 24; row++) for (let col = -1; col < 9; col++) {
    const cx = col * 16 + (row % 2) * 8, cy = row * 8 + 4;
    for (const rr of [7, 4.5, 2]) { x.beginPath(); x.arc(cx, cy + 8, rr, Math.PI, 0); x.stroke(); }
  }
  // embroidered border: double gold rule, running stitches between
  x.strokeStyle = GOLD; x.lineWidth = 3; x.strokeRect(6, 4, 116, 236);
  x.strokeStyle = GOLD_DARK; x.lineWidth = 1.5; x.strokeRect(13, 11, 102, 222);
  x.strokeStyle = GOLD; x.lineWidth = 1.2; x.setLineDash([3, 4]); x.strokeRect(9.5, 7.5, 109, 229); x.setLineDash([]);
  // corner knots
  for (const [cx, cy] of [[13, 11], [115, 11], [13, 233], [115, 233]]) { x.fillStyle = GOLD; x.beginPath(); x.arc(cx, cy, 4, 0, Math.PI * 2); x.fill(); }
  // crest in a lacquer-red roundel
  x.fillStyle = '#7a1a14'; x.beginPath(); x.arc(64, 92, 34, 0, Math.PI * 2); x.fill();
  drawTomoe(x, 64, 92, 30, GOLD);
  // vertical gold scrollwork down the lower half
  x.strokeStyle = GOLD; x.lineWidth = 2;
  for (let y = 140; y < 220; y += 20) {
    x.beginPath(); x.moveTo(64, y); x.bezierCurveTo(84, y + 4, 84, y + 16, 64, y + 20); x.bezierCurveTo(44, y + 16, 44, y + 4, 64, y); x.stroke();
  }
  // tattered hem: notches cut out of the cloth (the material uses alphaTest)
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 128; i += 8) { x.beginPath(); x.moveTo(i, 257); x.lineTo(i + 4, 243 + (i * 7) % 9); x.lineTo(i + 8, 257); x.fill(); }
  x.globalCompositeOperation = 'source-over';
});
