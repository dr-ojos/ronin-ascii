// Campfires: a ring of sooty stones, a bed of embers that breathes, logs leaning into a teepee whose
// tips burn, a crown of flame tongues that lick and break off at the top, sparks popping out of the
// fire and a thin smoke drifting away with the wind. Everything moves in the shaders (one shared
// clock, wind.uTime), so a hundred fires cost no CPU at all.
import * as THREE from 'three';
import { M, CLS, tagMat } from './materials';
import { wind } from './nature';
import { addCollider } from './physics';
import { addLight } from './lights';

const TAU = Math.PI * 2;

// shared GLSL: cheap value noise + the wind direction used by the grass (nature.ts)
const NOISE = /* glsl */`
float fHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float fNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(fHash(i), fHash(i + vec2(1.0, 0.0)), u.x), mix(fHash(i + vec2(0.0, 1.0)), fHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
vec2 fWind(float t) { float a = 0.34 + 0.32 * sin(t * 0.045) + 0.12 * sin(t * 0.11 + 1.3); return vec2(cos(a), sin(a)); }
`;

// ------------------------------------------------------------ flame tongues
// a teardrop lathed around y (0 at the base, 1 at the tip)
const FLAME = (() => {
  const pts: THREE.Vector2[] = [];
  for (let i = 0; i <= 14; i++) {
    const h = i / 14, r = Math.pow(Math.sin(Math.min(1, h * 1.25 + 0.08) * Math.PI * 0.5 + 0.0001), 0.6) * Math.pow(1 - h, 1.3) * 0.5;
    pts.push(new THREE.Vector2(Math.max(0.001, r), h));
  }
  return new THREE.LatheGeometry(pts, 12);
})();

const flameMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, side: THREE.DoubleSide });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = `uniform float uTime; varying float vH; varying float vPh; varying vec3 vWN; varying vec3 vWP; varying vec2 vAng;
      ${NOISE}` + sh.vertexShader.replace('#include <begin_vertex>', /* glsl */`
        vec3 transformed = position;
        vec3 o = modelMatrix[3].xyz;
        float ph = fract(sin(dot(o.xz, vec2(12.9898, 78.233))) * 43758.5) * 40.0;
        float t = uTime, h = position.y;
        vH = h; vPh = ph; vAng = position.xz;
        // the whole tongue breathes: taller and thinner, then low and wide
        float lick = 0.82 + 0.13 * sin(t * 8.3 + ph) + 0.09 * sin(t * 13.7 + ph * 1.9) + 0.12 * (fNoise(vec2(t * 3.1, ph)) - 0.5);
        transformed.y *= lick;
        transformed.xz *= (1.0 + 0.16 * sin(t * 11.0 + h * 7.0 + ph)) / sqrt(lick);
        // sway: the tip whips around, the base stays in the logs, and the wind bends it all
        float s = h * h;
        transformed.x += s * (0.16 * sin(t * 5.3 + ph + h * 3.0) + 0.06 * sin(t * 12.1 + ph * 2.0));
        transformed.z += s * (0.16 * cos(t * 4.7 + ph * 1.3 + h * 2.6) + 0.06 * cos(t * 10.3 + ph));
        vec3 wp = (modelMatrix * vec4(transformed, 1.0)).xyz;
        wp.xz += fWind(t) * s * 0.22;
        vWP = wp; vWN = normalize(mat3(modelMatrix) * normal);
      `).replace('#include <project_vertex>', `vec4 mvPosition = viewMatrix * vec4(vWP, 1.0); gl_Position = projectionMatrix * mvPosition;`);
    sh.fragmentShader = `uniform float uTime; varying float vH; varying float vPh; varying vec3 vWN; varying vec3 vWP; varying vec2 vAng;
      ${NOISE}` + sh.fragmentShader.replace('#include <color_fragment>', /* glsl */`
        // tongues break off at the top: a noise scrolling upwards eats the tip
        float ang = atan(vAng.y, vAng.x);
        float n = fNoise(vec2(ang * 1.6 + vPh, vH * 4.5 - uTime * 4.2)) * 0.65 + fNoise(vec2(ang * 3.5 - vPh, vH * 9.0 - uTime * 7.0)) * 0.35;
        if (vH > 0.42 + n * 0.62) discard;
        // white-hot core, yellow body, orange then deep red at the tips and the edges of the silhouette
        float rim = 1.0 - abs(dot(normalize(vWN), normalize(cameraPosition - vWP)));
        float k = clamp(vH * 1.05 + rim * 0.55 - n * 0.18, 0.0, 1.0);
        vec3 col = mix(vec3(2.0, 1.55, 0.7), vec3(1.75, 0.82, 0.16), smoothstep(0.0, 0.28, k));
        col = mix(col, vec3(1.25, 0.36, 0.05), smoothstep(0.3, 0.62, k));
        col = mix(col, vec3(0.6, 0.09, 0.02), smoothstep(0.62, 0.95, k));
        col *= 0.88 + 0.24 * fNoise(vec2(uTime * 9.0 + vPh, vH * 3.0));
        diffuseColor.rgb = col;
      `);
  };
  m.customProgramCacheKey = () => 'campfire-flame';
  return tagMat(m, CLS.light);
})();

// ------------------------------------------------------------ ember bed: ash with live coals that breathe
const bedMat = (() => {
  const m = new THREE.MeshBasicMaterial({ color: 0xffffff });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = 'varying vec2 vUv2; varying vec2 vO;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vUv2 = position.xy; vO = modelMatrix[3].xz;`);
    sh.fragmentShader = `uniform float uTime; varying vec2 vUv2; varying vec2 vO;\n${NOISE}` + sh.fragmentShader.replace('#include <color_fragment>', /* glsl */`
        float r = length(vUv2);
        vec2 p = vUv2 * 6.0 + vO;
        float coal = fNoise(p) * 0.6 + fNoise(p * 2.3 + 7.0) * 0.4;
        float breathe = 0.55 + 0.45 * fNoise(vec2(uTime * 1.7, 0.0) + p * 0.35);
        float hot = smoothstep(0.42, 0.8, coal) * (1.0 - smoothstep(0.35, 1.0, r)) * breathe;
        vec3 ash = mix(vec3(0.05, 0.045, 0.045), vec3(0.17, 0.15, 0.14), smoothstep(0.55, 1.0, r) * fNoise(p * 3.0));
        diffuseColor.rgb = ash + vec3(1.9, 0.6, 0.12) * hot * hot * 1.6 + vec3(0.35, 0.08, 0.0) * (1.0 - r) * breathe;
      `);
  };
  m.customProgramCacheKey = () => 'campfire-bed';
  return tagMat(m, CLS.light);
})();

// ------------------------------------------------------------ logs: wood that chars and glows towards the burning end
const logMat = (() => {
  const m = M(0x3a281e, { roughness: 1, flatShading: true });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = 'varying vec3 vLp; varying vec3 vO;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLp = position; vO = modelMatrix[3].xyz;`);
    sh.fragmentShader = `uniform float uTime; varying vec3 vLp; varying vec3 vO;\n${NOISE}` + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        float burnt = smoothstep(-0.05, 0.35, vLp.y);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.035, 0.03, 0.03), burnt);`)
      .replace('#include <emissivemap_fragment>', /* glsl */`#include <emissivemap_fragment>
        {
          float crack = fNoise(vec2(atan(vLp.z, vLp.x) * 2.5, vLp.y * 9.0) + vO.xz * 3.0);
          float glow = smoothstep(0.15, 0.5, vLp.y) * smoothstep(0.45, 0.75, crack);
          float pulse = 0.6 + 0.4 * fNoise(vec2(uTime * 2.3 + vO.x, vLp.y * 4.0));
          totalEmissiveRadiance += vec3(1.6, 0.45, 0.08) * glow * pulse + vec3(0.5, 0.1, 0.0) * smoothstep(0.38, 0.5, vLp.y) * pulse;
        }`);
  };
  m.customProgramCacheKey = () => 'campfire-log';
  return tagMat(m, CLS.wood);
})();
const LOG = new THREE.CylinderGeometry(0.5, 0.5, 1, 7);
const STONE = new THREE.IcosahedronGeometry(0.5, 1);
const stoneMat = tagMat(M(0x5d5f66, { roughness: 1, flatShading: true }), CLS.ground);
const sootMat = tagMat(M(0x2c2a2c, { roughness: 1, flatShading: true }), CLS.ground);

// ------------------------------------------------------------ sparks and smoke: points that live in the vertex shader
function particleMat(kind: 'spark' | 'smoke') {
  const spark = kind === 'spark';
  const m = new THREE.PointsMaterial({ color: 0xffffff, size: spark ? 0.09 : 0.42, fog: !spark });
  m.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = `uniform float uTime; attribute vec3 aSeed; varying float vLife; varying float vAlive;\n${NOISE}` + sh.vertexShader
      .replace('#include <begin_vertex>', spark ? /* glsl */`
        // each spark: shot up from the coals, slows down, drifts with the wind and dies (some cycles skip: the fire pops)
        float sp = 0.55 + aSeed.y * 0.5, cyc = uTime * sp + aSeed.x * 17.0, life = fract(cyc);
        vLife = life; vAlive = step(0.45, fHash(vec2(floor(cyc), aSeed.z * 31.0)));
        float a = aSeed.z * 6.2832, up = (1.0 - (1.0 - life) * (1.0 - life)) * (1.6 + aSeed.y * 2.4);
        vec3 transformed = vec3(cos(a) * (0.15 + life * 0.55 * aSeed.x), 0.3 + up, sin(a) * (0.15 + life * 0.55 * aSeed.x));
        transformed.x += sin(uTime * 6.0 + aSeed.z * 40.0) * 0.12 * life;
        transformed.z += cos(uTime * 5.0 + aSeed.x * 40.0) * 0.12 * life;
        transformed.xz += fWind(uTime) * life * life * 1.2;
      ` : /* glsl */`
        // smoke: slow, widening, bending away with the wind
        float cyc = uTime * (0.12 + aSeed.y * 0.06) + aSeed.x * 9.0, life = fract(cyc);
        vLife = life; vAlive = 1.0;
        float a = aSeed.z * 6.2832;
        vec3 transformed = vec3(cos(a) * 0.2, 1.5 + life * 5.5, sin(a) * 0.2);
        transformed.xz += vec2(cos(a), sin(a)) * life * 0.9 + fWind(uTime) * life * life * 3.5;
        transformed.x += sin(uTime * 0.7 + aSeed.z * 20.0) * 0.4 * life;
      `)
      .replace('gl_PointSize = size;', spark ? 'gl_PointSize = size * (1.2 - vLife * 0.7);' : 'gl_PointSize = size * (0.5 + vLife * 1.6);');
    sh.fragmentShader = 'varying float vLife; varying float vAlive;\n' + sh.fragmentShader.replace('#include <color_fragment>', spark ? /* glsl */`
        if (vAlive < 0.5 || vLife > 0.92 || length(gl_PointCoord - 0.5) > 0.5) discard;
        diffuseColor.rgb = mix(vec3(2.4, 1.9, 0.9), vec3(1.2, 0.25, 0.05), smoothstep(0.1, 0.85, vLife)) * (1.0 - vLife * 0.6);
      ` : /* glsl */`
        // stippled, so the puff reads as a thin veil (and as scattered dots in ASCII)
        float fade = smoothstep(0.0, 0.15, vLife) * (1.0 - smoothstep(0.55, 1.0, vLife));
        float rr = length(gl_PointCoord - 0.5) * 2.0;
        vec2 q = floor(gl_FragCoord.xy * 0.5);
        float dither = fract(sin(dot(q, vec2(12.9898, 78.233))) * 43758.5453);
        if (rr > 1.0 || dither > fade * (1.0 - rr * rr) * 0.55) discard;
        diffuseColor.rgb = vec3(0.13, 0.12, 0.13);
      `);
  };
  m.customProgramCacheKey = () => 'campfire-' + kind;
  return tagMat(m, spark ? CLS.light : CLS.ground);
}
const sparkMat = particleMat('spark'), smokeMat = particleMat('smoke');
function particles(n: number, mat: THREE.PointsMaterial, seed: number, radius: number) {
  const geo = new THREE.BufferGeometry(), s = new Float32Array(n * 3);
  let h = seed * 9301 + 49297;
  const r = () => ((h = (h * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n * 3; i++) s[i] = r();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(s, 3));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, radius * 0.5, 0), radius);
  const p = new THREE.Points(geo, mat); p.castShadow = false;
  return p;
}

// ------------------------------------------------------------ the whole fire
/** a campfire at local (0, 0, 0) of group g, which stands at world (wx, wy, wz); k scales it */
export function campfire(g: THREE.Object3D, wx: number, wy: number, wz: number, k = 1, color = 0xff6a20) {
  const f = new THREE.Group(); f.scale.setScalar(k); g.add(f);
  const seed = Math.abs(Math.floor(wx * 13.7 + wz * 7.3)) % 1000;
  let h = seed + 1; const r = () => ((h = (h * 16807) % 2147483647) / 2147483647);
  // ring of stones, the ones facing the fire blackened by soot
  const N = 10;
  for (let i = 0; i < N; i++) {
    const a = (i / N) * TAU + (r() - 0.5) * 0.25, d = 1.05 + (r() - 0.5) * 0.12;
    const s = new THREE.Mesh(STONE, r() < 0.45 ? sootMat : stoneMat);
    s.position.set(Math.cos(a) * d, 0.08, Math.sin(a) * d);
    s.scale.set(0.42 + r() * 0.16, 0.26 + r() * 0.14, 0.34 + r() * 0.14);
    s.rotation.set(r() * 0.5, -a, r() * 0.5);
    s.castShadow = s.receiveShadow = true; f.add(s);
  }
  // ash and coals
  const bed = new THREE.Mesh(new THREE.CircleGeometry(0.92, 20), bedMat);
  bed.rotation.x = -Math.PI / 2; bed.position.y = 0.025; bed.receiveShadow = true; f.add(bed);
  // a teepee of logs leaning into the flames (local +y of each log is its burning end) and two lying across
  const T = 6;
  for (let i = 0; i < T; i++) {
    const a = (i / T) * TAU + r() * 0.3, len = 1.15 + r() * 0.25, tilt = 0.62 + r() * 0.12;
    const log = new THREE.Mesh(LOG, logMat);
    log.scale.set(0.13 + r() * 0.04, len, 0.13 + r() * 0.04);
    const dir = new THREE.Vector3(-Math.cos(a) * Math.sin(tilt), Math.cos(tilt), -Math.sin(a) * Math.sin(tilt));
    log.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    log.position.set(Math.cos(a) * 0.62, 0.02, Math.sin(a) * 0.62).addScaledVector(dir, len / 2);
    log.castShadow = true; f.add(log);
  }
  for (let i = 0; i < 2; i++) {
    const a = r() * TAU, log = new THREE.Mesh(LOG, logMat);
    log.scale.set(0.15, 1.5, 0.15); log.rotation.order = 'YXZ';
    log.rotation.set(Math.PI / 2 - 0.08, a, 0);
    log.position.set(0, 0.1 + i * 0.12, 0); f.add(log);
  }
  // flames: a tall central tongue, a ring of smaller ones, a low hot core
  const tongue = (x: number, z: number, w: number, hgt: number) => {
    const fl = new THREE.Mesh(FLAME, flameMat);
    fl.position.set(x, 0.12, z); fl.scale.set(w, hgt, w); fl.castShadow = false; fl.receiveShadow = false; f.add(fl);
  };
  tongue(0, 0, 0.95, 1.85);
  for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + r(); tongue(Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0.5 + r() * 0.2, 0.9 + r() * 0.6); }
  tongue(0, 0, 1.25, 0.55);
  f.add(particles(28, sparkMat, seed, 4));
  f.add(particles(12, smokeMat, seed + 7, 9));
  addCollider({ x: wx, z: wz, r: 1.25 * k });
  addLight({ x: wx, y: wy + 1.2 * k, z: wz, color, intensity: 9.5, distance: 19, decay: 1.4, flicker: 1 });
  return f;
}
