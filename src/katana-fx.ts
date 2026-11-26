// Katana effects: blade light, sparks shed by the edge, and the vapour trail of each cut.
import { LOOK_PROFILE } from './blade-looks';
import { MANGA_PROFILE } from './manga-swords';
import * as THREE from 'three';
import { scene } from './renderer';
import { BLADE_SHEEN_ALPHA, BLADE_SPARK_ALPHA, CLS, tagMat } from './materials';
import { sam, bladeMat } from './avatar';
import { BELLY_POW, BLADE_PROFILE, bladeSection } from './samurai';
import { BLADE_LAYOUT } from './weapon-models';
import { displayedWeapon, tipZ, type Weapon } from './weapons';
import { player, state } from './state';
import { rnd } from './utils';
import { shopStageActive } from './shop-stage';

// soft personal glow + a cold light that rides on the blade
const samGlow = new THREE.PointLight(0xffe6c0, 0.8, 3.6, 2);
const bladeLight = new THREE.PointLight(0xa6dcff, 3, 6, 1.6);
scene.add(samGlow, bladeLight);

// Paint the moving reflections into the steel. Blade-space coordinates keep them on the bevel
// even when the shop preview changes the length or a swing turns the katana edge-on.
const bladeSheen = {
  uBladeStrength: { value: 0 },
  uBladeCurve: new THREE.Uniform<number>(BLADE_PROFILE.curve),
  uBladeWidth: new THREE.Uniform<number>(BLADE_PROFILE.width),
  uBladeTaper: new THREE.Uniform<number>(BLADE_PROFILE.taper),
  uBladeBelly: new THREE.Uniform<number>(BLADE_PROFILE.belly),
  uBladeGlints: { value: new THREE.Vector3() },
  uBladeColors: { value: [new THREE.Color(), new THREE.Color(), new THREE.Color()] }
};
{
  const compile = bladeMat.onBeforeCompile;
  const cacheKey = bladeMat.customProgramCacheKey.bind(bladeMat);
  bladeMat.onBeforeCompile = (shader, renderer) => {
    compile.call(bladeMat, shader, renderer);
    Object.assign(shader.uniforms, bladeSheen);
    shader.vertexShader = 'varying vec2 vBlade;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>', '#include <begin_vertex>\nvBlade = position.yz;'
    );
    shader.fragmentShader = /* glsl */`
      varying vec2 vBlade;
      uniform float uBladeStrength;
      uniform float uBladeCurve;
      uniform float uBladeWidth;
      uniform float uBladeTaper;
      uniform float uBladeBelly;
      uniform vec3 uBladeGlints;
      uniform vec3 uBladeColors[3];
    ` + shader.fragmentShader.replace('#include <emissivemap_fragment>', /* glsl */`
      #include <emissivemap_fragment>
      if (uBladeStrength > 0.0) {
        float along = clamp((vBlade.y - ${BLADE_PROFILE.base.toFixed(3)}) / ${BLADE_PROFILE.length.toFixed(3)}, 0.0, 1.0);
        float belly = uBladeBelly * sin(3.14159265 * pow(along, ${BELLY_POW.toFixed(2)}));
        float width = uBladeWidth - uBladeTaper * along + belly;
        float center = uBladeCurve * along * along - belly * 0.5;
        float across = (vBlade.x - center) / width + 0.5;
        float bevel = 1.0 - smoothstep(0.08, 0.59, across);
        vec3 d = abs(vec3(along + across * 0.027) - uBladeGlints);
        vec3 flashes = 1.0 - smoothstep(vec3(0.006), vec3(0.115), d);
        flashes *= flashes;
        vec3 glints = flashes.x * uBladeColors[0] + flashes.y * uBladeColors[1] + flashes.z * uBladeColors[2];
        vec3 tint = mix(uBladeColors[0], uBladeColors[1], smoothstep(0.12, 0.85, along));
        float grain = 0.9 + 0.1 * sin(along * 121.0 + across * 8.0);
        totalEmissiveRadiance *= mix(0.28, 0.50, bevel);
        totalEmissiveRadiance += uBladeStrength * (tint * bevel * grain * 0.48 + glints * (0.24 + bevel * 1.55));
      }
    `).replace('#include <opaque_fragment>', /* glsl */`
      if (uBladeStrength > 0.0) {
        // Keep the forge lights from bleaching the coloured steel while preserving its reflections.
        outgoingLight = mix(totalEmissiveRadiance, outgoingLight, 0.25);
      }
      #include <opaque_fragment>
    `).replace(/}\s*$/, `  if (uBladeStrength > 0.0) gl_FragColor.a = ${BLADE_SHEEN_ALPHA.toFixed(2)};\n}`);
  };
  bladeMat.customProgramCacheKey = () => cacheKey() + '|blade-sheen';
}

// ---------------------------------------------------------------- blade halo
// a soft sleeve of light around the blade in the weapon's own colour: faint at rest, blazing in the cut
const haloMat = tagMat(new THREE.MeshBasicMaterial({ color: 0xbfe4ff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
const haloCore = tagMat(new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.1, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
const halo = new THREE.Group();
{
  const g = new THREE.CapsuleGeometry(1, 1, 4, 10).rotateX(Math.PI / 2);   // axis along z
  const outer = new THREE.Mesh(g, haloMat), inner = new THREE.Mesh(g, haloCore);
  outer.name = 'outer'; inner.name = 'inner'; halo.add(outer, inner);
}
sam.katana.add(halo);
const offhandHalo = halo.clone();
offhandHalo.visible = false;
sam.offhand.add(offhandHalo);

// ---------------------------------------------------------------- blade flames
// Volumetric animated flame sheath wrapping fire blades (extra: 'flames'): two crossed ribbons
// running from guard to past the tip with 2-octave turbulent fire noise & flickering tongues.
const flameUniforms = {
  uTime: { value: 0 },
  uIntensity: { value: 1 },
  uCore: { value: new THREE.Color(0xfff0a8) },
  uMid: { value: new THREE.Color(0xff6218) },
  uEdge: { value: new THREE.Color(0xd81808) }
};
const flameMat = new THREE.ShaderMaterial({
  uniforms: flameUniforms,
  transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor,
  vertexShader: /* glsl */`
    uniform float uTime;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec3 p = position;
      // subtle licking whip along the upper half of the flame sheath
      float whip = smoothstep(0.15, 1.0, uv.y);
      p.x += sin(uv.y * 11.0 - uTime * 13.0) * 0.014 * whip;
      p.y += cos(uv.y * 9.0 - uTime * 11.5) * 0.012 * whip;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }`,
  fragmentShader: /* glsl */`
    uniform float uTime, uIntensity;
    uniform vec3 uCore, uMid, uEdge;
    varying vec2 vUv;
    float fhash(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    float fnoise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      f = f * f * (3.0 - 2.0 * f);
      return mix(mix(fhash(i), fhash(i + vec2(1.0, 0.0)), f.x),
                 mix(fhash(i + vec2(0.0, 1.0)), fhash(i + vec2(1.0, 1.0)), f.x), f.y);
    }
    void main() {
      float across = abs(vUv.x - 0.5) * 2.0;
      float along = vUv.y;
      float n1 = fnoise(vec2(vUv.x * 3.4, along * 5.2 - uTime * 6.2));
      float n2 = fnoise(vec2(vUv.x * 7.2 + uTime * 1.4, along * 10.5 - uTime * 10.8));
      float n = n1 * 0.65 + n2 * 0.35;
      float rootFade = smoothstep(0.0, 0.10, along);
      float tipFade = 1.0 - smoothstep(0.68, 1.0, along);
      float envelope = rootFade * tipFade;
      float tongue = (1.0 - across) * (0.68 + 0.42 * envelope) + (n - 0.46) * (0.58 + 0.35 * along);
      float alpha = smoothstep(0.24, 0.78, tongue) * rootFade * (1.0 - smoothstep(0.86, 1.0, along));
      if (alpha < 0.045) discard;
      float heat = clamp((1.0 - across) * 0.72 + n * 0.55 - along * 0.18, 0.0, 1.0);
      vec3 col = mix(uEdge, uMid, smoothstep(0.18, 0.56, heat));
      col = mix(col, uCore, smoothstep(0.56, 0.90, heat));
      float bright = alpha * uIntensity * (0.95 + 0.35 * n);
      gl_FragColor = vec4(col * bright, ${CLS.light.toFixed(2)});
      #include <colorspace_fragment>
    }`
});
flameMat.userData.cls = CLS.light;
const bladeFlames = new THREE.Group();
bladeFlames.name = 'blade-flames';
{
  // PlaneGeometry(width, length) oriented along +z (vUv.y: 0 at guard -> 1 at tip)
  const gA = new THREE.PlaneGeometry(1, 1, 2, 16).rotateX(Math.PI / 2);
  const gB = new THREE.PlaneGeometry(1, 1, 2, 16).rotateX(Math.PI / 2).rotateZ(Math.PI / 2);
  const gC = new THREE.PlaneGeometry(1, 1, 2, 16).rotateX(Math.PI / 2).rotateZ(Math.PI / 4);
  for (const g of [gA, gB, gC]) {
    const m = new THREE.Mesh(g, flameMat);
    m.frustumCulled = false;
    m.renderOrder = 4;
    bladeFlames.add(m);
  }
}
bladeFlames.visible = false;
sam.katana.add(bladeFlames);
const offhandFlames = bladeFlames.clone();
offhandFlames.visible = false;
sam.offhand.add(offhandFlames);
const C1 = new THREE.Color(), C2 = new THREE.Color(), CG = new THREE.Color();
let fxWeapon: Weapon | undefined;
/** resolved blade metrics for the currently displayed weapon (handles manga models, looks & forms) */
function bladeMetrics(w: Weapon) {
  if (w.mangaModel) {
    return { base: BLADE_PROFILE.base, scale: w.width ?? 1, profile: MANGA_PROFILE[w.mangaModel] };
  }
  const { base, width: baseScale, profile: formProfile } = BLADE_LAYOUT[w.form ?? 'katana'];
  return { base, scale: baseScale * (w.width ?? 1), profile: w.look ? LOOK_PROFILE[w.look] : formProfile };
}
/** the blade's colours changed (another weapon in hand) */
function setWeaponFx(w: Weapon) {
  fxWeapon = w;
  CG.set(w.fx.glow); C1.set(w.fx.hot); C2.set(w.fx.cool);
  haloMat.color.copy(CG); haloCore.color.copy(CG).lerp(WHITE, 0.35); bladeLight.color.copy(CG);
  const { base, scale, profile } = bladeMetrics(w);
  const len = tipZ(w) - base, r = 0.027 * w.fx.halo;
  // the halo is a straight sleeve laid along the chord from the blade's root to its point;
  // broad-bellied twin blades, heavy cleavers and manga broadswords get a wider sleeve
  const width = (w.form === 'dual' || w.form === 'cleaver' || w.mangaModel)
    ? scale * bladeSection(profile, 0.6).width / BLADE_PROFILE.width
    : scale;
  const rise = bladeRise(w, 1);
  for (const glow of [halo, offhandHalo]) {
    const outer = glow.getObjectByName('outer')!, inner = glow.getObjectByName('inner')!;
    outer.scale.set(r, r * 0.55 * width, len / 3); inner.scale.set(r * 0.35, r * 0.2 * width, len / 3);
    glow.position.set(0, 0.004 * width + rise / 2, base + len / 2);
    glow.rotation.x = -Math.atan2(rise, len);
  }
  flameUniforms.uCore.value.copy(C1);
  flameUniforms.uMid.value.copy(CG);
  flameUniforms.uEdge.value.copy(C2);
  const flameLen = len * 1.14, flameW = Math.max(0.11, 0.085 * width * w.fx.halo * 0.65);
  for (const fl of [bladeFlames, offhandFlames]) {
    fl.scale.set(flameW, flameW, flameLen);
    fl.position.set(0, 0.004 * width + rise / 2, base + flameLen * 0.46);
    fl.rotation.x = -Math.atan2(rise, len);
  }
  bladeSheen.uBladeCurve.value = (w.form === 'spear' || w.form === 'rapier') ? 0 : profile.curve;
  bladeSheen.uBladeWidth.value = profile.width;
  bladeSheen.uBladeTaper.value = profile.taper;
  bladeSheen.uBladeBelly.value = profile.belly;
  // every sword gets a 3-colour spark palette so sparks travel the full blade even on starter blades
  const palette: readonly [number, number, number] = w.fx.sparks ?? [w.fx.glow, w.fx.hot, w.fx.cool];
  bladeSheen.uBladeColors.value.forEach((color, i) => color.set(palette[i]));
  for (let i = 0; i < edgeColors.count; i++) {
    edgeColor.set(palette[i % palette.length]);
    edgeColors.setXYZ(i, edgeColor.r, edgeColor.g, edgeColor.b);
  }
  edgeColors.needsUpdate = true;
}

// Travelling flashes live on the cutting edge in blade space. Loose sparks are emitted on contact and on cuts.
const WHITE = new THREE.Color(0xffffff), edgeColor = new THREE.Color();
const BLADE_GLINTS = 3, EDGE_SPARKS = BLADE_GLINTS + 18;
const edgePositions = new THREE.BufferAttribute(new Float32Array(EDGE_SPARKS * 3), 3).setUsage(THREE.DynamicDrawUsage);
const edgePulses = new THREE.BufferAttribute(new Float32Array(EDGE_SPARKS), 1).setUsage(THREE.DynamicDrawUsage);
const edgeColors = new THREE.BufferAttribute(new Float32Array(EDGE_SPARKS * 3), 3);
const edgeGeo = new THREE.BufferGeometry();
edgeGeo.setAttribute('position', edgePositions);
edgeGeo.setAttribute('color', edgeColors);
edgeGeo.setAttribute('aPulse', edgePulses);
const edgeViewport = new THREE.Vector4();
const edgeMat = new THREE.ShaderMaterial({
  uniforms: { uViewportHeight: { value: 1 }, uRasterScale: { value: 1 } },
  vertexColors: true, transparent: true, depthWrite: false, toneMapped: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor,
  vertexShader: `
    uniform float uViewportHeight, uRasterScale;
    attribute float aPulse;
    varying vec3 vTint;
    varying float vPulse;
    void main() {
      vec4 p = modelViewMatrix * vec4(position, 1.0);
      gl_Position = projectionMatrix * p;
      float size = 0.065 * uViewportHeight * projectionMatrix[1][1] / max(1.0, -p.z);
      gl_PointSize = mix(0.66, 1.0, aPulse) * clamp(size, 8.0 * uRasterScale, 17.0 * uRasterScale);
      vPulse = aPulse;
      vTint = color;
    }`,
  fragmentShader: `
    varying vec3 vTint;
    varying float vPulse;
    void main() {
      vec2 p = abs(gl_PointCoord - 0.5) * 2.0;
      float r = length(p);
      float bloom = 0.33 * (1.0 - smoothstep(0.10, 0.85, r));
      float arms = (1.0 - smoothstep(0.04, 0.24, min(p.x, p.y))) * (1.0 - smoothstep(0.14, 0.86, max(p.x, p.y)));
      float center = 1.0 - smoothstep(0.03, 0.19, r);
      float value = vPulse * (bloom + 0.69 * arms + 0.37 * center);
      if (value < 0.045) discard;
      float cls = value > 0.13 ? ${BLADE_SPARK_ALPHA.toFixed(2)} : ${CLS.light.toFixed(2)};
      gl_FragColor = vec4(mix(vTint, vec3(1.0), 0.16 * center) * value, cls);
      #include <colorspace_fragment>
    }`
});
const edgeSparks = new THREE.Points(edgeGeo, edgeMat);
edgeSparks.name = 'blade-sparks';
edgeSparks.frustumCulled = false;
edgeSparks.visible = false;
edgeSparks.renderOrder = 5;
edgeSparks.onBeforeRender = renderer => {
  const height = renderer.getCurrentViewport(edgeViewport).w;
  edgeMat.uniforms.uViewportHeight.value = height;
  edgeMat.uniforms.uRasterScale.value = height / innerHeight;
};
sam.katana.add(edgeSparks);
const offhandSparks = edgeSparks.clone();
offhandSparks.name = 'offhand-sparks';
offhandSparks.onBeforeRender = edgeSparks.onBeforeRender;
sam.offhand.add(offhandSparks);
function cuttingEdge(w: Weapon, t: number) {
  const { scale, profile } = bladeMetrics(w);
  if (w.form === 'spear') return -BLADE_PROFILE.width * 0.52 * Math.pow(Math.sin(Math.PI * t), 0.72) * scale;
  const { center, width } = bladeSection(profile, t);
  return (center - width * 0.5) * scale;
}
/** height of the blade's centre line at `t` (0 root … 1 point): curved blades rise off the hilt's axis */
function bladeRise(w: Weapon, t: number) {
  const { scale, profile } = bladeMetrics(w);
  return (w.form === 'dual' || w.form === 'odachi') ? bladeSection(profile, t).center * scale : 0;
}
const katanaWorldQ = new THREE.Quaternion(), katanaInvQ = new THREE.Quaternion(), localDown = new THREE.Vector3();
function updateEdgeSparks(w: Weapon, heat: number, displaying: boolean) {
  const hasBlade = w.form !== 'staff' || Boolean(w.fx.sparks);
  edgeSparks.visible = hasBlade && !state.dead;
  offhandSparks.visible = edgeSparks.visible && w.form === 'dual';
  bladeSheen.uBladeStrength.value = edgeSparks.visible ? (w.fx.sparks ? 1 : 0.65) + heat * 0.42 : 0;
  if (!edgeSparks.visible) return;
  const { base, scale, profile } = bladeMetrics(w);
  const length = tipZ(w) - base;
  const time = state.time;
  const glints = bladeSheen.uBladeGlints.value;
  const blood = w.fx.extra === 'blood';
  const flames = w.fx.extra === 'flames';
  if (blood || flames) {
    sam.katana.getWorldQuaternion(katanaWorldQ);
    katanaInvQ.copy(katanaWorldQ).invert();
    localDown.set(0, blood ? -1 : 1, 0).applyQuaternion(katanaInvQ);
  }
  for (let i = 0; i < BLADE_GLINTS; i++) {
    const cycle = (time * (0.72 + i * 0.09) + i * 0.34) % 1;
    const travel = cycle * 1.18 - 0.08;
    glints.setComponent(i, travel);
    const along = THREE.MathUtils.clamp(travel, 0.02, 0.98);
    // Straddle the bevel so depth testing keeps the flash on the steel from either side.
    edgePositions.setXYZ(i, 0, cuttingEdge(w, along) - 0.004, base + along * length);
    const fade = THREE.MathUtils.smoothstep(travel, 0.02, 0.14) * (1 - THREE.MathUtils.smoothstep(travel, 0.84, 0.98));
    edgePulses.setX(i, fade * (0.94 + 0.24 * Math.sin(time * 26 + i * 2)));
  }
  const count = EDGE_SPARKS - BLADE_GLINTS;
  for (let i = 0; i < count; i++) {
    const idx = i + BLADE_GLINTS;
    if ((blood || flames) && i % 2 === 0) {
      // Blood-dripping sparks fall straight down; flame sparks dance & rise upward off the blazing blade
      const speed = (flames ? 1.05 : 0.68) + (i % 5) * (flames ? 0.2 : 0.14);
      const dropT = (time * speed + i * 0.371) % 1;
      const along = 0.05 + ((i * 0.618 + Math.floor(time * speed + i * 0.371) * 0.29) % 0.90);
      const sec = bladeSection(profile, along);
      const edgeY = (sec.center - sec.width * (flames ? 0.1 : 0.5)) * scale;
      const fallPhase = Math.max(0, (dropT - (flames ? 0.08 : 0.18)) / (flames ? 0.92 : 0.82));
      const dropDist = (flames ? 0.34 : 0.42) * fallPhase * (flames ? (0.4 + 0.6 * fallPhase) : fallPhase);
      const sway = flames ? Math.sin(time * 14 + i * 2.1) * 0.028 * fallPhase : 0;
      const px = Math.sin(i * 3.1) * 0.01 + sway + localDown.x * dropDist;
      const py = edgeY - (flames ? 0 : 0.005) + localDown.y * dropDist;
      const pz = base + along * length + localDown.z * dropDist;
      edgePositions.setXYZ(idx, px, py, pz);
      const pulse = THREE.MathUtils.smoothstep(dropT, 0, 0.16) * (1 - THREE.MathUtils.smoothstep(dropT, 0.72, 1));
      edgePulses.setX(idx, pulse * (displaying ? 1.2 : 1.0 + 0.25 * heat));
    } else {
      // Travelling sparks racing along the entire length of the blade (edge, face and spine)
      const cycle = time * (0.85 + (i % 5) * 0.22) + i * 0.618;
      const t = cycle % 1, along = 0.02 + t * 0.96;
      const blink = 0.48 + 0.28 * Math.sin(time * 23 + i * 2.39);
      const sec = bladeSection(profile, along);
      // alternate across the blade width so wide manga swords sparkle across their entire surface & edges
      const lane = i % 3 === 0 ? -0.52 : i % 3 === 1 ? 0.0 : 0.48;
      const y = (sec.center + sec.width * lane) * scale - (lane < 0 ? 0.005 + blink * 0.01 : 0);
      edgePositions.setXYZ(idx, Math.sin(i * 2.39) * 0.009, y, base + along * length);
      const fade = THREE.MathUtils.smoothstep(t, 0, 0.10) * (1 - THREE.MathUtils.smoothstep(t, 0.86, 1));
      edgePulses.setX(idx, fade * blink * (displaying ? 1 : 0.86 + 0.18 * heat));
    }
  }
  edgePositions.needsUpdate = true;
  edgePulses.needsUpdate = true;
}

const SPARKS = 900;
const spPos = new Float32Array(SPARKS * 3), spCol = new Float32Array(SPARKS * 3), spVel = new Float32Array(SPARKS * 3);
const spLife = new Float32Array(SPARKS), spMax = new Float32Array(SPARKS).fill(1);
// per spark: how much gravity pulls it (1 = a spark that falls, < 0 = a mote of light that floats up)
const spGrav = new Float32Array(SPARKS).fill(1);
spPos.fill(-999);
const spGeo = new THREE.BufferGeometry();
spGeo.setAttribute('position', new THREE.BufferAttribute(spPos, 3));
spGeo.setAttribute('color', new THREE.BufferAttribute(spCol, 3));
// additive colour, but the alpha channel is overwritten with the "light" class so the ASCII pass
// draws spark cells with the bright light glyph ramp instead of the grass underneath
const sparkMat = new THREE.PointsMaterial({
  size: 0.11, vertexColors: true, transparent: true, depthWrite: false, fog: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor
});
sparkMat.userData.cls = CLS.light;
sparkMat.onBeforeCompile = sh => {
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>
      { vec2 pc = gl_PointCoord - 0.5; if (dot(pc, pc) > 0.25 || max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b) < 0.08) discard; }`)
    .replace(/}\s*$/, `  gl_FragColor.a = ${CLS.light.toFixed(2)};\n}`);
};
const sparkPts = new THREE.Points(spGeo, sparkMat);
sparkPts.frustumCulled = false; scene.add(sparkPts);
let spNext = 0, sparkAcc = 0, moteAcc = 0, bloodAcc = 0, flameAcc = 0, bladeHeat = 0, swingS = 0;
// 0..1: how much the ronin is fighting right now. Running swings the blade too, but only a cut
// (player.attackT >= 0) may draw the white trail, flare the halo or shower sparks.
let fight = 0;
let wasDisplaying = false;
const bladeBase = new THREE.Vector3(), bladeTip = new THREE.Vector3(), prevTip = new THREE.Vector3(), tipVel = new THREE.Vector3(), spTmp = new THREE.Vector3();
const prevBase = new THREE.Vector3();
const leftBase = new THREE.Vector3(), leftTip = new THREE.Vector3(), leftPrevBase = new THREE.Vector3(), leftPrevTip = new THREE.Vector3();

// ---------------------------------------------------------------- katana trail
// Two ribbons follow the edge of every cut, in the blade's own colour:
// · the streak: a narrow, bright band hugging the edge. White-hot where the blade is now, it cools
//   into the weapon's colour, thins towards the tip like a comet and is gone in a fraction of a second.
// · the vapour: wider and fainter, it lingers, rises, spreads and breaks into twinkling grains.
// Drawn with different glyph ramps in the ASCII pass: the streak with the bright light ramp, the vapour with
// the sky ramp ( . ' ` * + ), so a cut reads as a sharp stroke dissolving into dust.
const TRAIL_N = 160, STREAK_LIFE = 0.2, VAPOUR_LIFE = 0.6;
let trailK = 1;
interface TrailPt { b: THREE.Vector3; t: THREE.Vector3; age: number; k: number }
const blend = {
  vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor
} as const;
const trailU = { uT: { value: 0 } };
function ribbon(cls: number, grains: boolean) {
  const pos = new Float32Array(TRAIL_N * 6), col = new Float32Array(TRAIL_N * 6), geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const idx: number[] = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
  geo.setIndex(idx); geo.setDrawRange(0, 0);
  const mat = new THREE.MeshBasicMaterial(blend);
  mat.userData.cls = cls;
  mat.onBeforeCompile = sh => {
    sh.uniforms.uT = trailU.uT;
    sh.fragmentShader = 'uniform float uT;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float f = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
          ${grains ? `// vapour: the fainter the ribbon, the more it breaks into twinkling grains
          vec2 g = floor(gl_FragCoord.xy / 3.0);
          float h = fract(sin(dot(g + floor(uT * 24.0) * vec2(7.13, 3.71), vec2(12.9898, 78.233))) * 43758.5453);
          if (f < 0.015 || h > f * 3.5) discard;
          diffuseColor.rgb *= 0.55 + 0.9 * h;` : `if (f < 0.02) discard;`} }`)
      .replace(/}\s*$/, `  gl_FragColor.a = ${cls.toFixed(2)};\n}`);
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false; scene.add(mesh);
  return { pos, col, geo };
}
const makeTrail = () => ({ points: [] as TrailPt[], streak: ribbon(CLS.light, false), vapour: ribbon(CLS.sky, true) });
const rightTrail = makeTrail(), leftTrail = makeTrail();
const HOT = new THREE.Color(), tmpC = new THREE.Color();
function pushTrail(trail: TrailPt[], b: THREE.Vector3, t: THREE.Vector3, age: number, k: number) {
  trail.unshift({ b: b.clone(), t: t.clone(), age, k });
  if (trail.length > TRAIL_N) trail.pop();
}
function updateTrail(track: ReturnType<typeof makeTrail>, dt: number, emit: boolean, swing: number,
  base: THREE.Vector3, tip: THREE.Vector3, lastBase: THREE.Vector3, lastTip: THREE.Vector3) {
  const { points: trail, streak, vapour } = track;
  const vLife = VAPOUR_LIFE * (0.7 + 0.3 * trailK), sLife = STREAK_LIFE * (0.8 + 0.2 * trailK);
  for (const s of trail) s.age += dt;
  while (trail.length && trail[trail.length - 1].age > vLife) trail.pop();
  if (emit && fight > 0.5 && swing > 0.12) {
    // sub-steps between last frame's blade and this one, so fast cuts draw a smooth arc
    const steps = trail.length ? Math.min(10, Math.max(1, Math.ceil(lastTip.distanceTo(tip) / 0.06))) : 1;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      pushTrail(trail, spTmp.lerpVectors(lastBase, base, f), new THREE.Vector3().lerpVectors(lastTip, tip, f), dt * (1 - f), swing);
    }
  }
  HOT.copy(CG).lerp(tmpC.set(0xffffff), 0.4);
  const n = trail.length;
  for (let i = 0; i < n; i++) {
    const s = trail[i], j = i * 6, dx = s.t.x - s.b.x, dy = s.t.y - s.b.y, dz = s.t.z - s.b.z;
    const end = i === 0 || i === n - 1 ? 0.3 : 1, kk = Math.min(1, s.k * 1.4) * end;
    // streak: from 55 % of the blade to just past the tip; its inner edge slides out as it ages (a thinning crescent)
    const as = Math.min(1, s.age / sLife), inner = 0.74 + 0.24 * as, outer = 1.03;
    streak.pos[j] = s.b.x + dx * inner; streak.pos[j + 1] = s.b.y + dy * inner; streak.pos[j + 2] = s.b.z + dz * inner;
    streak.pos[j + 3] = s.b.x + dx * outer; streak.pos[j + 4] = s.b.y + dy * outer; streak.pos[j + 5] = s.b.z + dz * outer;
    const fs = Math.pow(1 - as, 2.4) * kk * (0.3 + 0.1 * trailK);
    tmpC.copy(HOT).lerp(CG, Math.min(1, as * 4));                     // white-hot → the blade's colour
    streak.col[j] = tmpC.r * fs * 0.25; streak.col[j + 1] = tmpC.g * fs * 0.25; streak.col[j + 2] = tmpC.b * fs * 0.25;
    streak.col[j + 3] = tmpC.r * fs; streak.col[j + 4] = tmpC.g * fs; streak.col[j + 5] = tmpC.b * fs;
    // vapour: the whole blade's sweep, rising, spreading away from the hilt and wobbling as it dissipates
    const av = s.age / vLife, rise = s.age * 0.9, spread = s.age * 0.8, wob = Math.sin(s.age * 16 + i * 0.5) * s.age * 0.22;
    vapour.pos[j] = s.b.x + dx * 0.25 + wob; vapour.pos[j + 1] = s.b.y + dy * 0.25 + rise * 0.5; vapour.pos[j + 2] = s.b.z + dz * 0.25 - wob;
    vapour.pos[j + 3] = s.t.x + dx * spread + wob; vapour.pos[j + 4] = s.t.y + rise; vapour.pos[j + 5] = s.t.z + dz * spread - wob;
    const fv = Math.pow(Math.max(0, 1 - av), 1.6) * kk * 0.3 * (0.6 + 0.4 * trailK) * Math.min(1, s.age / 0.06 + 0.25);
    vapour.col[j] = CG.r * fv * 0.1; vapour.col[j + 1] = CG.g * fv * 0.1; vapour.col[j + 2] = CG.b * fv * 0.1;
    vapour.col[j + 3] = CG.r * fv; vapour.col[j + 4] = CG.g * fv; vapour.col[j + 5] = CG.b * fv;
  }
  // the streak only needs its young part
  let ns = 0; while (ns < n && trail[ns].age < sLife) ns++;
  for (const [r, count] of [[streak, ns], [vapour, n]] as const) {
    r.geo.attributes.position.needsUpdate = true; r.geo.attributes.color.needsUpdate = true;
    r.geo.setDrawRange(0, Math.max(0, count - 1) * 6);
  }
}
function spawnSpark(p: THREE.Vector3, vx: number, vy: number, vz: number, life: number, grav = 1) {
  const i = spNext; spNext = (spNext + 1) % SPARKS;
  spGrav[i] = grav;
  spPos[i * 3] = p.x; spPos[i * 3 + 1] = p.y; spPos[i * 3 + 2] = p.z;
  spVel[i * 3] = vx; spVel[i * 3 + 1] = vy; spVel[i * 3 + 2] = vz;
  spLife[i] = spMax[i] = life;
}
export function sparkBurst(p: THREE.Vector3, n: number, speed = 6) {
  for (let k = 0; k < n; k++) {
    spTmp.set(rnd(-1, 1), rnd(-0.3, 1), rnd(-1, 1)).normalize().multiplyScalar(speed * rnd(0.35, 1));
    spawnSpark(p, spTmp.x, spTmp.y + 1.2, spTmp.z, rnd(0.25, 0.55));
  }
}
export function updateSparks(dt: number, emit: boolean) {
  if (dt <= 0) return;
  const displaying = shopStageActive();
  const staged = displaying || wasDisplaying;
  wasDisplaying = displaying;
  emit &&= !staged;
  const w = displayedWeapon(), grav = w.fx.gravity, dual = w.form === 'dual';
  const changed = w !== fxWeapon;
  if (changed) setWeaponFx(w);
  sparkPts.visible = !displaying;
  trailK = w.fx.trail;
  sam.katana.updateMatrixWorld(true);
  const end = tipZ(w), base = bladeMetrics(w).base;
  const from = base + (end - base) * 0.12, fromY = bladeRise(w, 0.12), endY = bladeRise(w, 1);
  sam.katana.localToWorld(bladeBase.set(0, fromY, from));
  sam.katana.localToWorld(bladeTip.set(0, endY, end));
  tipVel.subVectors(bladeTip, prevTip).divideScalar(dt);
  if (staged || changed) tipVel.setScalar(0);
  if (tipVel.lengthSq() > 900) tipVel.setLength(30); // teleports (reset, first frame)
  const swing = Math.min(1, tipVel.length() / 12);
  // follows the blade's real speed: flares instantly with the cut, settles more slowly
  swingS += (swing - swingS) * Math.min(1, dt * (swing > swingS ? 30 : 7));
  // on at once with the cut, off a moment after it (so the last arc of the cut still finishes its trail)
  const cutting = !staged && player.attackT >= 0;
  fight = cutting ? 1 : Math.max(0, fight - dt * 6);
  const swingF = swingS * fight;   // blade speed that counts: the cut's, never the run's
  bladeHeat += ((cutting ? 1 : swing * 0.6 * fight) - bladeHeat) * Math.min(1, dt * 10);
  if (displaying || changed) rightTrail.points.length = 0;
  trailU.uT.value += dt;
  updateTrail(rightTrail, dt, emit, swingS, bladeBase, bladeTip, prevBase, prevTip);
  prevTip.copy(bladeTip); prevBase.copy(bladeBase);
  if (displaying || changed || !dual) leftTrail.points.length = 0;
  if (dual) {
    sam.offhand.localToWorld(leftBase.set(0, fromY, from));
    sam.offhand.localToWorld(leftTip.set(0, endY, end));
  }
  const leftSwing = dual && !staged && !changed ? Math.min(1, leftTip.distanceTo(leftPrevTip) / (12 * dt)) : 0;
  updateTrail(leftTrail, dt, emit && dual, leftSwing, leftBase, leftTip, leftPrevBase, leftPrevTip);
  leftPrevBase.copy(leftBase); leftPrevTip.copy(leftTip);
  // running (and not fighting) the blade is carried low and behind: its glow would read as a white
  // trail, so it goes quiet — plain steel, no halo — and the ronin sheds a few motes of light instead
  const running = displaying ? 0 : player.moving * (1 - fight), calm = 1 - running;
  // emission: a rare crackle along the edge, a light shower while cutting
  if (emit) {
    sparkAcc += dt * ((w.fx.sparks ? 0 : 3 * calm) + bladeHeat * 55 + swing * fight * 25);
    while (sparkAcc >= 1) {
      sparkAcc -= 1;
      const s = Math.sqrt(Math.random());
      if (dual && spNext % 2 === 0) spTmp.lerpVectors(leftBase, leftTip, s);
      else spTmp.lerpVectors(bladeBase, bladeTip, s);
      const fling = 0.25 + bladeHeat * 0.35;
      spawnSpark(spTmp,
        tipVel.x * s * fling + rnd(-1.4, 1.4),
        tipVel.y * s * fling + rnd(0.2, 2.4),
        tipVel.z * s * fling + rnd(-1.4, 1.4),
        rnd(0.25, 0.55) + bladeHeat * 0.3);
    }
    // continuous falling blood drops off crimson blood blades (even at rest or walking!)
    if (w.fx.extra === 'blood') {
      bloodAcc += dt * (18 + bladeHeat * 45 + swing * fight * 30);
      while (bloodAcc >= 1) {
        bloodAcc -= 1;
        const s = 0.04 + Math.random() * 0.94;
        spTmp.lerpVectors(bladeBase, bladeTip, s);
        spawnSpark(spTmp,
          tipVel.x * s * 0.12 + rnd(-0.18, 0.18),
          rnd(-0.65, -0.05),
          tipVel.z * s * 0.12 + rnd(-0.18, 0.18),
          rnd(0.45, 0.85), 1.45);
      }
    }
    // continuous rising fire embers off flame blades (even at rest or walking, roaring in a cut!)
    if (w.fx.extra === 'flames') {
      flameAcc += dt * (26 + bladeHeat * 65 + swing * fight * 40);
      while (flameAcc >= 1) {
        flameAcc -= 1;
        const s = 0.04 + Math.random() * 0.96;
        spTmp.lerpVectors(bladeBase, bladeTip, s);
        spawnSpark(spTmp,
          tipVel.x * s * 0.16 + rnd(-0.42, 0.42),
          rnd(0.55, 1.55) + bladeHeat * 0.8,
          tipVel.z * s * 0.16 + rnd(-0.42, 0.42),
          rnd(0.35, 0.78), 0.45);
      }
    }
    // motes: a few soft grains of light rising off the body and left behind as it runs
    moteAcc += dt * 7 * running;
    const p = sam.root.position;
    while (moteAcc >= 1) {
      moteAcc -= 1;
      const a = Math.random() * Math.PI * 2, rr = 0.15 + Math.random() * 0.25;
      spTmp.set(p.x + Math.cos(a) * rr, p.y + rnd(0.35, 1.55), p.z + Math.sin(a) * rr);
      spawnSpark(spTmp, rnd(-0.25, 0.25), rnd(0.25, 0.7), rnd(-0.25, 0.25), rnd(0.5, 0.95), -0.08);
    }
  }
  // physics + colour: white-hot → gold → ember red → gone
  for (let i = 0; i < SPARKS; i++) {
    const j = i * 3;
    if (spLife[i] <= 0) { spCol[j] = spCol[j + 1] = spCol[j + 2] = 0; continue; }
    spLife[i] -= dt;
    const t = Math.max(0, spLife[i] / spMax[i]);
    spVel[j + 1] -= grav * spGrav[i] * dt;
    const drag = Math.exp(-2.2 * dt);
    spVel[j] *= drag; spVel[j + 1] *= drag; spVel[j + 2] *= drag;
    spPos[j] += spVel[j] * dt; spPos[j + 1] += spVel[j + 1] * dt; spPos[j + 2] += spVel[j + 2] * dt;
    if (spPos[j + 1] < player.pos.y + 0.03) { spPos[j + 1] = player.pos.y + 0.03; spVel[j + 1] *= -0.35; spVel[j] *= 0.6; spVel[j + 2] *= 0.6; }
    const flick = 0.75 + Math.random() * 0.5;
    // the weapon's hot colour cooling into its cool one
    const e = Math.min(1, t * 3) * 0.85, u = t * t;
    spCol[j] = (C2.r + (C1.r - C2.r) * u) * e * flick;
    spCol[j + 1] = (C2.g + (C1.g - C2.g) * u) * e * flick;
    spCol[j + 2] = (C2.b + (C1.b - C2.b) * u) * e * flick;
  }
  spGeo.attributes.position.needsUpdate = true;
  spGeo.attributes.color.needsUpdate = true;
  // the blade and its light pulse with the heat of the cut
  const fl = 0.85 + Math.random() * 0.3;
  // polished steel at rest; the edge catches light in proportion to how fast it is moving
  const edgeGlow = w.fx.sparks ? 0.42 + 0.09 * Math.sin(state.time * 5.5) : 0;
  bladeMat.emissiveIntensity = (edgeGlow + 0.4 * (0.2 + 0.8 * calm) + swingF * 1.8 + bladeHeat * 0.5) * (0.92 + Math.random() * 0.16);
  bladeLight.position.lerpVectors(bladeBase, bladeTip, 0.6);
  bladeLight.intensity = (0.5 * (0.3 + 0.7 * calm) + swingF * 4 + bladeHeat * 1.5) * fl * (0.8 + w.fx.halo * 0.4);
  // the halo breathes at rest and flares with the cut
  const hk = Math.min(1, swingF * 1.2 + bladeHeat * 0.5);
  haloMat.opacity = (0.1 + 0.05 * Math.sin(state.time * 3)) * w.fx.halo * 0.7 * calm + hk * 0.2 + edgeGlow * 0.14;
  haloCore.opacity = 0.08 * calm + hk * 0.25;
  if (w.fx.sparks) { haloMat.opacity *= 0.65; haloCore.opacity *= 0.45; }
  halo.scale.set(1 + hk * 0.25, 1 + hk * 0.25, 1);
  halo.visible = sam.root.visible && (w.fx.sparks ? !state.dead : !displaying && (calm > 0.03 || hk > 0.01));
  offhandHalo.scale.copy(halo.scale);
  offhandHalo.visible = dual && halo.visible;
  const hasFlames = w.fx.extra === 'flames' && sam.root.visible && !state.dead;
  bladeFlames.visible = hasFlames;
  offhandFlames.visible = dual && hasFlames;
  if (hasFlames) {
    flameUniforms.uTime.value = state.time;
    flameUniforms.uIntensity.value = (displaying ? 1.15 : 0.82 + 0.25 * calm + hk * 0.85) * (0.94 + Math.random() * 0.12);
  }
  updateEdgeSparks(w, hk, displaying);
  // each blade's own flourish
  if (emit && cutting && w.fx.extra) flourish(w.fx.extra, dt, hk);
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.life -= dt;
    if (b.life <= 0 || displaying) { scene.remove(b.l); b.l.geometry.dispose(); bolts.splice(i, 1); }
  }
  // sits between the samurai and the camera, chest high: lights his front, barely touches the grass
  const p = sam.root.position;
  const yaw = displaying ? sam.root.rotation.y : state.yaw;
  samGlow.position.set(p.x + Math.sin(yaw) * 0.9, p.y + 1.55, p.z + Math.cos(yaw) * 0.9);
}

// ---------------------------------------------------------------- flourishes
// Raijin's blade crackles with little bolts, Muramasa drips, the crow's blade sheds dark feathers,
// Masamune leaves stars hanging in the air.
const boltMat = tagMat(new THREE.LineBasicMaterial({ color: 0xbfe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
const bolts: { l: THREE.Line; life: number }[] = [];
let flAcc = 0;
function flourish(kind: 'bolts' | 'blood' | 'feathers' | 'stars' | 'flames', dt: number, hk: number) {
  flAcc += dt * (kind === 'bolts' ? 4 + hk * 30 : kind === 'blood' ? 2 + hk * 40 : kind === 'flames' ? 5 + hk * 45 : kind === 'feathers' ? 1 + hk * 25 : 1.5 + hk * 35);
  while (flAcc >= 1) {
    flAcc -= 1;
    const s = 0.2 + Math.random() * 0.8;
    spTmp.lerpVectors(bladeBase, bladeTip, s);
    if (kind === 'bolts') {
      // a short jagged arc jumping off the blade
      const pts = [spTmp.clone()];
      for (let k = 0; k < 4; k++) pts.push(pts[k].clone().add(new THREE.Vector3(rnd(-0.18, 0.18), rnd(-0.12, 0.18), rnd(-0.18, 0.18))));
      const l = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), boltMat); l.frustumCulled = false;
      scene.add(l); bolts.push({ l, life: 0.09 });
      if (Math.random() < 0.3) spawnSpark(spTmp, rnd(-1, 1), rnd(0, 1.5), rnd(-1, 1), 0.2);
    } else if (kind === 'blood') spawnSpark(spTmp, rnd(-0.3, 0.3) + tipVel.x * 0.1, rnd(-0.5, 0.2), rnd(-0.3, 0.3) + tipVel.z * 0.1, rnd(0.5, 0.9));
    else if (kind === 'flames') spawnSpark(spTmp, rnd(-0.9, 0.9) + tipVel.x * 0.18, rnd(0.7, 2.2), rnd(-0.9, 0.9) + tipVel.z * 0.18, rnd(0.45, 0.95), 0.45);
    else if (kind === 'feathers') spawnSpark(spTmp, rnd(-0.8, 0.8), rnd(0.2, 1.2), rnd(-0.8, 0.8), rnd(0.8, 1.3));
    else spawnSpark(spTmp, rnd(-0.3, 0.3), rnd(0.3, 0.9), rnd(-0.3, 0.3), rnd(0.9, 1.5));
  }
}
