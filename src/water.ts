// Water: how deep a point of the river is, the ripples that spread wherever something touches the water
// (feet, a dodge, a blow, a falling oni), and the one water shader shared by the river, the lake, the
// castle moat and the shrine pond (rolling swells that bend the moonlight, a current with foam streaks,
// lapping foam on the banks, raindrops, see-through shallows). The ripples live in a small ring buffer of
// uniforms the shader reads, so every water surface (and every road puddle) shows them for free.
// Also: the leaves and petals that drift down the river and across the lake.
import * as THREE from 'three';
import { RIVER, LAKES, lakeRadius, inLake, lineDist } from './map';
import { wind } from './nature';
import { burst } from './fx';
import { sfx, panOf } from './sfx';
import { CLS, tagMat } from './materials';
import { TERRAIN_GLSL, terrainUniforms, groundY, lakeLevel } from './terrain';
import { scene } from './renderer';
import { player, state } from './state';

export const RIPPLES = 24;
/** x, z, start time (wind.uTime), strength */
export const rippleUniforms = { uRip: { value: Array.from({ length: RIPPLES }, () => new THREE.Vector4(0, 0, -99, 0)) } };
let next = 0;
/** a ring of waves spreading from (x, z) */
export function ripple(x: number, z: number, strength = 1) {
  rippleUniforms.uRip.value[next].set(x, z, wind.uTime.value, strength);
  next = (next + 1) % RIPPLES;
}

/** how hard it rains on the water (0..1) and how wet the ground is: it soaks up slowly and dries slower (puddles) */
export const weatherUniforms = { uRain: { value: 0 }, uWet: { value: 0 } };
let soaked = false;
export function updateWaterWeather(dt: number, rain: number) {
  weatherUniforms.uRain.value = rain;
  const w = weatherUniforms.uWet;
  if (!soaked) { w.value = rain; soaked = true; }
  w.value += (rain - w.value) * Math.min(1, dt / (rain > w.value ? 25 : 80));
}

/** 0 on the bank, 1 in the middle of the river (callers rule out the bridges) */
export function riverDepth(x: number, z: number) {
  const d = lineDist(x, z, RIVER), half = RIVER.width / 2;
  return d > half ? 0 : 1 - THREE.MathUtils.smoothstep(d, half * 0.3, half);
}
/** how far the feet sink into the riverbed at full depth */
export const WADE_SINK = 0.5;
/** the river's current, m/s (the shader's foam streaks and the drifting leaves share it) */
export const RIVER_FLOW = 0.85;

/** spray of droplets, a big ring and a splash sound */
export function splash(x: number, y: number, z: number, power = 1) {
  ripple(x, z, 1.4 * power);
  burst(new THREE.Vector3(x, y + 0.15, z), 0x9fd2ff, Math.round(26 * power), 3.2 + power * 1.6, 0.11);
  sfx.splash({ power, pan: panOf(x, z) });
}

/** per-walker bookkeeping: emits ripples while it wades, a splash when it steps in */
export function wader() {
  let gap = 0, was = 0;
  return function step(dt: number, x: number, y: number, z: number, depth: number, moving: number, fast = false) {
    if (depth <= 0.02) { was = 0; return; }
    if (was <= 0.02 && moving > 0.3) splash(x, y, z, 0.7);
    was = depth;
    gap -= dt;
    if (gap > 0) return;
    if (moving > 0.3) { ripple(x, z, 0.5 + depth * 0.5); gap = fast ? 0.12 : 0.2; }
    else { ripple(x, z, 0.25 + depth * 0.15); gap = 0.85; }      // standing still: water lapping at the legs
  };
}

// ------------------------------------------------------------ the shader
/** GLSL shared by every water surface and the road puddles: hashing, swells, raindrops, touch ripples */
export const WATER_GLSL = /* glsl */`
uniform float uWTime, uRain, uWet; uniform vec4 uRip[${RIPPLES}];
float wHash(vec2 p) { vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), f.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), f.x), f.y);
}
// one travelling swell: adds its slope (xy) and height (z)
void wSwell(inout vec3 s, vec2 q, float t, vec2 d, float k, float a, float w) {
  float ph = dot(d, q) * k - t * w;
  s += vec3(d * (a * k * cos(ph)), a * sin(ph));
}
// wind and current: six swells from different directions, crests bent so they never look ruled
vec3 waterSwells(vec2 q, float t) {
  q += vec2(sin(q.y * 0.23 + t * 0.21), cos(q.x * 0.19 - t * 0.17)) * 1.3;
  vec3 s = vec3(0.0);
  wSwell(s, q, t, vec2(0.96, 0.28), 0.8, 0.06, 0.9);
  wSwell(s, q, t, vec2(-0.39, 0.92), 1.5, 0.035, 1.3);
  wSwell(s, q, t, vec2(0.62, -0.78), 2.7, 0.018, 1.9);
  wSwell(s, q, t, vec2(-0.91, -0.41), 4.6, 0.010, 2.6);
  wSwell(s, q, t, vec2(0.17, 0.98), 7.9, 0.006, 3.4);
  wSwell(s, q, t, vec2(0.83, 0.55), 13.0, 0.003, 4.5);
  return s;
}
// raindrops: a ring opens wherever a drop lands (a jittered grid, two layers, a new spot every drop).
// slope xy, brightness z
vec3 rainRings(vec2 p, float t, float amt) {
  vec3 r = vec3(0.0);
  if (amt < 0.02) return r;
  for (int L = 0; L < 2; L++) {
    float sc = L == 0 ? 1.05 : 1.6;                               // cells of ~1 m and ~0.6 m
    vec2 g = p * sc + float(L) * 7.31, id = floor(g), f = g - id;
    float ph = t * (1.2 + 0.6 * wHash(id + 3.1)) + wHash(id) * 9.0, cyc = floor(ph), age = fract(ph);
    vec2 seed = id + cyc * vec2(1.37, 2.71);
    if (wHash(seed + 0.5) > amt * 0.9) continue;                  // a drizzle drops on fewer cells
    vec2 c = 0.3 + 0.4 * vec2(wHash(seed), wHash(seed + 11.0));
    vec2 dv = f - c; float d = length(dv) + 1e-4;
    float x = d - age * 0.3;                                      // the ring never leaves its cell
    float env = exp(-x * x * 500.0) * (1.0 - age) * (1.0 - age);
    float wave = sin(x * 70.0 + 1.2);
    r.xy += dv / d * cos(x * 70.0 + 1.2) * env * 0.5 * sc;
    r.z += max(wave, 0.0) * env;
  }
  return r * amt;
}
// rings where a foot, a blade or a body touched the water: a few crests behind a front at ~2 m/s
vec3 touchRipples(vec2 p, float t) {
  vec3 r = vec3(0.0);
  for (int i = 0; i < ${RIPPLES}; i++) {
    vec4 R = uRip[i]; float age = t - R.z;
    if (age < 0.0 || age > 2.4) continue;
    vec2 dv = p - R.xy; float d = length(dv) + 1e-4, x = d - (0.2 + age * 2.1);
    float env = smoothstep(-1.4, -0.05, x) * (1.0 - smoothstep(-0.05, 0.2, x));
    float k = 1.0 - age / 2.4, a = R.w * k * k / (1.0 + d * 0.5) * env;
    r.xy += dv / d * (-sin(x * 9.0)) * a * 0.35;
    r.z += max(0.0, cos(x * 9.0)) * a;
  }
  return r;
}
`;

export interface WaterLook {
  /** program cache key */
  key: string;
  /** GLSL that sets: float shore (metres to the bank), vec2 q (swell space, metres), float flow (0..1: current
   *  streaks), vec2 q2 (streak space, along the current in y). p = world xz and t = time are already set. */
  shore: string;
  /** extra GLSL declarations (functions the shore code needs) */
  head?: string;
  /** how strong the swells are (the mirror lake is calm, the river choppy) */
  swell?: number;
  /** how much foam laps at the bank */
  foam?: number;
  /** how far the bed shows through, metres from the bank */
  clear?: number;
  colour?: THREE.ColorRepresentation;
}

/** dark water that moves: swells bend the moon's highlight, the current drags foam streaks, the banks lap,
 *  rain pocks it with rings and footsteps send rings across it (drawn with . - ~ = * in ASCII) */
export function waterMaterial(o: WaterLook) {
  const m = new THREE.MeshStandardMaterial({ color: o.colour ?? 0x050f1c, metalness: 0.1, roughness: 0.1, envMapIntensity: 1.25 });
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uWTime: wind.uTime, uRip: rippleUniforms.uRip, uHeight: terrainUniforms.uHeight }, weatherUniforms);
    sh.vertexShader = 'varying vec3 vWp; varying vec2 vWUv;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz; vWUv = uv;');
    sh.fragmentShader = `varying vec3 vWp; varying vec2 vWUv;\n${WATER_GLSL}\n${TERRAIN_GLSL}\n${o.head ?? ''}\n` + sh.fragmentShader
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      {
        vec2 p = vWp.xz; float t = uWTime;
        float shore = 99.0, flow = 0.0; vec2 q = p, q2 = p;
        ${o.shore}
        if (shore < 0.0) discard;
        float calm = ${(o.swell ?? 1).toFixed(2)} * (0.35 + 0.65 * smoothstep(0.0, 2.5, shore));   // the shallows settle
        vec3 sw = waterSwells(q, t) * calm;
        vec3 rr = rainRings(p, t, uRain);
        vec3 tr = touchRipples(p, t);
        // the current: long foam streaks and darker eddies dragged downstream (two speeds, so it never shears)
        float streak = 0.0, eddy = 0.0;
        if (flow > 0.0) {
          float s1 = wNoise(vec2(q2.x * 1.4, q2.y * 0.13)), s2 = wNoise(vec2(q2.x * 2.3 + 5.0, q.y * 0.21));
          streak = smoothstep(0.7, 0.95, s1 * 0.7 + s2 * 0.3) * flow * smoothstep(0.35, 0.65, wNoise(q2 * vec2(0.8, 0.35) + 9.0));
          eddy = smoothstep(0.55, 0.85, wNoise(q * 0.35 + vec2(0.0, 3.0))) * flow;
          sw.xy += vec2(s1 - 0.5, 0.0) * 0.08 * flow;
        }
        vec2 slope = sw.xy + rr.xy + tr.xy;
        vec3 nW = normalize(vec3(-slope.x, 1.0, -slope.y));
        normal = normalize((viewMatrix * vec4(nW, 0.0)).xyz);
        float facing = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
        float fres = pow(1.0 - facing, 4.0);
        // the bank: wet stones and lapping foam that runs up the shore and slides back
        float shallow = 1.0 - smoothstep(0.0, ${(o.clear ?? 1.6).toFixed(2)}, shore);
        float wob = wNoise(p * 1.9 + vec2(t * 0.15, 0.0)) - 0.5;
        float lace = smoothstep(0.35, 0.75, wNoise(p * 3.1 + vec2(0.0, t * 0.4)) * 0.6 + wNoise(p * 7.3 - t * 0.2) * 0.4);   // foam is lacy, never a solid band
        float lap = smoothstep(0.55, 0.95, sin(shore * 4.5 + wob * 3.0 - t * 1.6)) * (1.0 - smoothstep(0.2, 1.2, shore));
        float rim = 1.0 - smoothstep(0.0, 0.18 + wob * 0.16, shore);
        float foam = clamp((lap * 0.6 + rim * 0.8) * lace * ${(o.foam ?? 1).toFixed(2)} + streak * 0.5, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb * (1.0 - eddy * 0.35), vec3(0.05, 0.065, 0.05), shallow * 0.75);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.48, 0.52), foam * 0.5);
        roughnessFactor = mix(0.05 + shallow * 0.1, 0.6, foam);
        metalnessFactor = mix(0.04, 0.3, fres) * (1.0 - foam);
        float crest = smoothstep(0.04, 0.1, sw.z / max(calm, 0.2));
        totalEmissiveRadiance += vec3(0.006, 0.013, 0.024) * (1.0 - shallow * 0.5)              // faint body, so ASCII has texture
          + vec3(0.03, 0.05, 0.085) * crest * (0.4 + 0.6 * calm)                                  // moonlit crests
          + vec3(0.06, 0.08, 0.1) * foam
          + vec3(0.16, 0.24, 0.34) * min(rr.z, 1.0)
          + vec3(0.22, 0.34, 0.5) * min(tr.z, 1.5);
      }`);
  };
  m.customProgramCacheKey = () => 'water:' + o.key;
  return tagMat(m, CLS.water);
}

/** the river and the moat: a ribbon (uv.x across, uv.y along in widths); the river flows, the moat stands */
export function ribbonWater(key: string, width: number, flow: number, look: Partial<WaterLook> = {}) {
  return waterMaterial({
    key, swell: flow ? 1 : 0.6, foam: flow ? 1 : 0.4, clear: 1.6, ...look,
    shore: `float W = ${width.toFixed(2)}, across = (vWUv.x - 0.5) * W, along = vWUv.y * W;
      shore = (0.5 - abs(vWUv.x - 0.5)) * W;
      float centre = 1.0 - abs(vWUv.x - 0.5) * 2.0;
      q = vec2(across, along - t * ${flow.toFixed(2)});
      q2 = vec2(across, along - t * ${(flow * 1.3).toFixed(2)});
      flow = ${flow > 0 ? '0.35 + 0.65 * centre' : '0.0'};`
  });
}

/** the lake: the shore is wherever the basin rises to the surface */
export const lakeWater = () => waterMaterial({
  key: 'lake', swell: 0.55, foam: 0.6, clear: 2.2, colour: 0x061422,
  shore: 'shore = max(0.0, vWp.y - terrainH(p) + 0.12) * 3.5; q = p * 0.85;'
});

// ------------------------------------------------------------ drifting leaves and petals
const DRIFT = 90, DRIFT_R = 46;
interface Drift { live: boolean; river: boolean; seg: number; t: number; off: number; x: number; z: number; spin: number; rot: number; sp: number; ph: number }
let drift: { mesh: THREE.InstancedMesh; d: Drift[] } | null = null;

export function buildDrift() {
  const geo = new THREE.CircleGeometry(0.16, 6).scale(1, 1.6, 1).rotateX(-Math.PI / 2);
  const mat = tagMat(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.75, side: THREE.DoubleSide }), CLS.foliage);
  const mesh = new THREE.InstancedMesh(geo, mat, DRIFT);
  const cols = [0xf2b4c8, 0xf7c6d6, 0xd9a441, 0xb9692e, 0x8a5a2b, 0xe9d6a0].map(c => new THREE.Color(c));
  for (let i = 0; i < DRIFT; i++) mesh.setColorAt(i, cols[i % cols.length]);
  mesh.frustumCulled = false; mesh.count = DRIFT; scene.add(mesh);
  drift = { mesh, d: Array.from({ length: DRIFT }, () => ({ live: false, river: true, seg: 0, t: 0, off: 0, x: 0, z: 0, spin: 0, rot: 0, sp: 1, ph: 0 })) };
}

const m4 = new THREE.Matrix4(), qt = new THREE.Quaternion(), eu = new THREE.Euler(), pos = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
function nearestSeg(x: number, z: number) {
  let best = 0, bd = Infinity; const P = RIVER.pts;
  for (let i = 0; i < P.length; i += 2) { const d = (P[i][0] - x) ** 2 + (P[i][1] - z) ** 2; if (d < bd) { bd = d; best = i; } }
  return { seg: best, dist: Math.sqrt(bd) };
}

/** leaves ride the current downstream, petals idle across the lake; all of them live near the player */
export function updateDrift(dt: number) {
  if (!drift) return;
  const t = wind.uTime.value, px = player.pos.x, pz = player.pos.z, P = RIVER.pts, half = RIVER.width / 2;
  const near = nearestSeg(px, pz), lake = LAKES.find(l => Math.hypot(l.x - px, l.z - pz) < l.R + DRIFT_R);
  const wa = 0.34 + 0.32 * Math.sin(t * 0.045), wx = Math.cos(wa) * 0.12, wz = Math.sin(wa) * 0.12;
  drift.d.forEach((d, i) => {
    if (d.live && (Math.hypot(d.x - px, d.z - pz) > DRIFT_R || (!d.river && !inLake(d.x, d.z, -1.5)))) d.live = false;
    if (!d.live && Math.random() < 0.08) {             // respawn somewhere on the nearby water
      if (near.dist < DRIFT_R + 10 && (!lake || Math.random() < 0.6)) {
        d.river = true; d.seg = Math.min(P.length - 2, Math.max(0, near.seg + Math.floor((Math.random() - 0.5) * 22)));
        d.t = Math.random(); d.off = (Math.random() * 2 - 1) * (half - 0.9); d.live = true;
      } else if (lake) {
        const a = Math.random() * Math.PI * 2, r = lakeRadius(lake, a) * Math.sqrt(Math.random()) * 0.9;
        d.river = false; d.x = lake.x + Math.cos(a) * r; d.z = lake.z + Math.sin(a) * r; d.live = true;
      }
      d.rot = Math.random() * 6.3; d.spin = (Math.random() - 0.5) * 0.6; d.sp = 0.8 + Math.random() * 0.5; d.ph = Math.random() * 9;
    }
    if (!d.live) { drift!.mesh.setMatrixAt(i, hidden); return; }
    let y: number;
    if (d.river) {
      const a = P[d.seg], b = P[d.seg + 1], dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
      if (L > 8) { d.live = false; drift!.mesh.setMatrixAt(i, hidden); return; }   // the gap where the river runs through the lake
      const centre = 1 - Math.abs(d.off) / half;
      d.t += RIVER_FLOW * d.sp * (0.7 + 0.6 * centre) * dt / L;
      d.off += Math.sin(t * 0.4 + d.ph) * 0.15 * dt;
      d.off = THREE.MathUtils.clamp(d.off, -half + 0.7, half - 0.7);
      if (d.t >= 1) { d.t -= 1; d.seg++; if (d.seg >= P.length - 1) { d.live = false; drift!.mesh.setMatrixAt(i, hidden); return; } }
      const nx = -dz / L, nz = dx / L;
      const cx = a[0] + dx * d.t, cz = a[1] + dz * d.t;
      d.x = cx + nx * d.off; d.z = cz + nz * d.off;
      // the ribbon's surface: each bank's ground + 0.12, interpolated across
      const yl = groundY(cx - nx * half, cz - nz * half), yr = groundY(cx + nx * half, cz + nz * half);
      y = yl + (yr - yl) * (d.off / RIVER.width + 0.5) + 0.14;
      d.rot += d.spin * dt;
    } else {
      d.x += (wx + Math.sin(t * 0.3 + d.ph) * 0.05) * dt; d.z += (wz + Math.cos(t * 0.27 + d.ph) * 0.05) * dt;
      y = lakeLevel[LAKES.indexOf(lake ?? LAKES[0])] - 0.13;
      d.rot += d.spin * 0.3 * dt;
    }
    const bob = Math.sin(t * 1.7 + d.ph) * 0.012;
    eu.set(Math.sin(t * 1.3 + d.ph) * 0.12, d.rot, Math.cos(t * 1.1 + d.ph) * 0.12); qt.setFromEuler(eu);
    drift!.mesh.setMatrixAt(i, m4.compose(pos.set(d.x, y + bob, d.z), qt, one));
  });
  drift.mesh.instanceMatrix.needsUpdate = true;
  drift.mesh.visible = !state.indoors;
}
