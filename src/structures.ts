// Everything built by hand across the open world: roads with stone lanterns, the river and its arched
// bridges, the mirror lake with its floating torii, the village, the castle, the five-storey pagoda,
// the path of a thousand torii up to the summit shrine, the ronin camp and the lantern cemetery.
import * as THREE from 'three';
import { scene } from './renderer';
import { M, CLS, tagMat, shadowTree } from './materials';
import { POND, POND_SHORE_GLSL, pondDepth, wind } from './nature';
import { addRoundedSurface, surfaceMaterial } from './surfaces';
import { addCollider } from './physics';
import { addLight } from './lights';
import { campfire } from './campfire';
import { groundY, lakeLevel } from './terrain';
import { riverDepth, lakeWater, ribbonWater, RIVER_FLOW, WATER_GLSL, rippleUniforms, weatherUniforms } from './water';
import { ROADS, RIVER, LAKES, BRIDGES, TORII_PATH, FOOTPRINTS, lakeRadius, lineDist, place, seeded, type P2, type Line } from './map';

const TAU = Math.PI * 2;
let R = seeded(7331);
const rnd = (a: number, b: number) => a + R() * (b - a);

// ------------------------------------------------------------ materials
export const MT = {
  wood: tagMat(surfaceMaterial(M(0x3e2b22, { roughness: 0.9 }), 'wood'), CLS.wood),
  siding: tagMat(surfaceMaterial(M(0x3e2b22, { roughness: 0.9 }), 'siding'), CLS.wood),
  woodL: tagMat(surfaceMaterial(M(0x6a4630, { roughness: 0.8 }), 'wood'), CLS.wood),
  red: tagMat(surfaceMaterial(M(0xb3261e, { roughness: 0.6 }), 'wood'), CLS.wood),
  vermilion: tagMat(surfaceMaterial(M(0xd8381c, { roughness: 0.55, emissive: 0x5a1004, emissiveIntensity: 1 }), 'wood'), CLS.wood),
  black: tagMat(surfaceMaterial(M(0x16141a), 'wood'), CLS.wood),
  roof: tagMat(surfaceMaterial(M(0x2b3246, { roughness: 0.6, metalness: 0.25 }), 'tiles'), CLS.wood),
  roofL: tagMat(surfaceMaterial(M(0x5a6478, { roughness: 0.6, metalness: 0.3 }), 'clay'), CLS.wood),
  thatch: tagMat(surfaceMaterial(M(0x5e5038, { roughness: 1 }), 'thatch'), CLS.wood),
  plaster: tagMat(surfaceMaterial(M(0xc9c6bc, { roughness: 0.9 }), 'plaster'), CLS.wood),
  stone: tagMat(surfaceMaterial(M(0x6e6f75, { roughness: 1 }), 'stone'), CLS.ground),
  foundation: tagMat(surfaceMaterial(M(0x6e6f75, { roughness: 1 }), 'masonry'), CLS.ground),
  stoneD: tagMat(surfaceMaterial(M(0x4d4f57, { roughness: 1, flatShading: true }), 'masonry'), CLS.ground),
  gravel: tagMat(surfaceMaterial(M(0x33374a, { roughness: 0.4, metalness: 0.1 }), 'gravel'), CLS.ground),
  lane: tagMat(surfaceMaterial(M(0x33374a, { roughness: 0.4, metalness: 0.1 }), 'lane'), CLS.ground),
  pavers: tagMat(surfaceMaterial(M(0x33374a, { roughness: 0.4, metalness: 0.1 }), 'pavers'), CLS.ground),
  fire: tagMat(M(0xffb050, { emissive: 0xff9530, emissiveIntensity: 2.4 }), CLS.light),
  chochin: tagMat(M(0xff6a2a, { emissive: 0xff5a1a, emissiveIntensity: 2.2 }), CLS.light),
  gold: tagMat(M(0xffd060, { emissive: 0xffb030, emissiveIntensity: 1.6, metalness: 0.6 }), CLS.light),
  cloth: tagMat(surfaceMaterial(M(0xd8d0b8, { roughness: 1, side: THREE.DoubleSide }), 'cloth'), CLS.wood),
  banner: [0xb3261e, 0xe8e0cc, 0x1c2a4a].map(c => tagMat(M(c, { roughness: 1, side: THREE.DoubleSide }), CLS.wood)),
  water: lakeWater(),
  river: ribbonWater('river', RIVER.width, RIVER_FLOW),
  moat: ribbonWater('moat', 9, 0, { colour: 0x07120f, clear: 1.2 }),
  road: roadMaterial(),
  lily: tagMat(M(0x2f5a2a, { roughness: 0.7, side: THREE.DoubleSide }), CLS.foliage),
  reed: tagMat(M(0x4f6a3a, { roughness: 0.8 }), CLS.grass),
  shoji: tagMat(surfaceMaterial(new THREE.MeshStandardMaterial({ map: shojiTexture(), emissiveMap: shojiTexture(), emissive: 0xffffff, emissiveIntensity: 1.4, color: 0x333333 }), 'paper'), CLS.light),
  shojiDark: tagMat(surfaceMaterial(new THREE.MeshStandardMaterial({ map: shojiTexture(true), color: 0x8a8478, roughness: 0.9 }), 'paper'), CLS.wood)
};

function roadMaterial() {
  const mat = surfaceMaterial(new THREE.MeshStandardMaterial({
    vertexColors: true, map: gravelTexture(), roughness: 0.9, metalness: 0
  }), 'track');
  const compile = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, renderer) => {
    compile.call(mat, sh, renderer);
    sh.fragmentShader = POND_SHORE_GLSL + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
      float roadFringe = 0.0;
      if (uDetailedSurfaces > 0.5) {
        vec2 fromPond = vSurfacePosition.xz - vec2(${POND.x.toFixed(2)}, ${POND.z.toFixed(2)});
        if (length(fromPond) < pondRadius(fromPond * vec2(1.0, -1.0))) discard;
        float edge = min(vMapUv.x, 1.0 - vMapUv.x);
        vec3 wear = texture2D(uSurfaceTile, vSurfacePosition.xz * 0.27).rgb;
        roadFringe = 0.012 + smoothstep(0.33, 0.74, wear.r) * 0.129 + wear.g * 0.028;
        if (edge < roadFringe) discard;
      }`);
    // rain soaks the road dark and glossy, then puddles gather in the low spots and the cart ruts,
    // pocked by raindrops and reflecting the moon; they shrink again as it dries (weatherUniforms.uWet)
    Object.assign(sh.uniforms, { uWTime: wind.uTime, uRip: rippleUniforms.uRip }, weatherUniforms);
    sh.vertexShader = 'varying vec3 vRoadWp;\n' + sh.vertexShader.replace('#include <project_vertex>',
      '#include <project_vertex>\nvRoadWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = `#define PIXEL_CLS\nfloat pixelCls = 0.0;\nvarying vec3 vRoadWp;\n${WATER_GLSL}\n` + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
      if (uWet > 0.01) {
        vec2 p = vRoadWp.xz; float across = vMapUv.x;
        float rut = max(1.0 - smoothstep(0.0, 0.1, abs(across - 0.3)), 1.0 - smoothstep(0.0, 0.1, abs(across - 0.7)));
        float dip = wNoise(p * 0.55) * 0.6 + wNoise(p * 1.5 + 4.0) * 0.28 + rut * 0.1 * wNoise(p * 0.9 + 2.0);
        float level = 1.02 - 0.4 * uWet;                            // the wetter, the higher the water climbs
        float puddle = smoothstep(level, level + 0.035, dip) * smoothstep(0.05, 0.14, min(across, 1.0 - across));
        float damp = uWet * (0.6 + 0.4 * smoothstep(level - 0.2, level, dip));   // darker and glossier round the puddles
        diffuseColor.rgb *= 1.0 - 0.45 * damp;
        roughnessFactor = mix(roughnessFactor, 0.35, damp * 0.8);
        if (puddle > 0.0) {
          vec3 rr = rainRings(p, uWTime, uRain), tr = touchRipples(p, uWTime);
          vec2 slope = rr.xy + tr.xy + vec2(sin(p.x * 6.0 + uWTime * 2.3), cos(p.y * 5.0 - uWTime * 1.9)) * 0.012;
          vec3 nW = normalize(vec3(-slope.x, 1.0, -slope.y));
          normal = normalize(mix(normal, (viewMatrix * vec4(nW, 0.0)).xyz, puddle));
          float edge = puddle * (1.0 - puddle) * 4.0;                // a muddy lip round each puddle
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.03, 0.04, 0.06), puddle) * (1.0 - edge * 0.4);
          roughnessFactor = mix(roughnessFactor, 0.04, puddle);
          metalnessFactor = mix(metalnessFactor, 0.6, puddle);
          totalEmissiveRadiance += puddle * (vec3(0.005, 0.01, 0.018) + vec3(0.16, 0.24, 0.34) * min(rr.z, 1.0) + vec3(0.22, 0.34, 0.5) * min(tr.z, 1.5));
          if (puddle > 0.5) pixelCls = ${CLS.water.toFixed(2)};
        }
      }`);
  };
  const key = mat.customProgramCacheKey;
  mat.customProgramCacheKey = () => key() + '|puddles';
  return tagMat(mat, CLS.ground);
}
/** packed earth with pebbles and ruts: gives the road's characters some grain */
function gravelTexture() {
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!, r = seeded(99);
  x.fillStyle = '#6a6a6a'; x.fillRect(0, 0, S, S);
  for (let i = 0; i < 900; i++) {
    const v = Math.floor(40 + r() * 170); x.fillStyle = `rgb(${v},${v},${v})`;
    x.beginPath(); x.arc(r() * S, r() * S, 0.6 + r() * 2.4, 0, TAU); x.fill();
  }
  x.fillStyle = 'rgba(20,20,20,0.5)';                       // two cart ruts
  for (const u of [0.3, 0.7]) x.fillRect(u * S - 5, 0, 10, S);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function shojiTexture(dark = false) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 160;
  const x = c.getContext('2d')!;
  const g = x.createRadialGradient(64, 90, 10, 64, 80, 110);
  g.addColorStop(0, dark ? '#8c8576' : '#ffd08a'); g.addColorStop(1, dark ? '#5e584c' : '#e07a2a');
  x.fillStyle = g; x.fillRect(0, 0, 128, 160);
  x.fillStyle = '#2a170d';
  for (let i = 0; i <= 128; i += 32) x.fillRect(i - 3, 0, 6, 160);
  for (let j = 0; j <= 160; j += 26) x.fillRect(0, j - 2, 128, 4);
  x.fillRect(0, 0, 128, 8); x.fillRect(0, 152, 128, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ------------------------------------------------------------ geometry helpers (unit shapes, scaled per mesh)
export const G = {
  box: new THREE.BoxGeometry(1, 1, 1),
  cyl: new THREE.CylinderGeometry(0.5, 0.5, 1, 10),
  cyl6: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
  pyr: (() => { const g = new THREE.ConeGeometry(Math.SQRT1_2, 1, 4); g.rotateY(Math.PI / 4); g.translate(0, 0.5, 0); return g; })(),
  sphere: new THREE.SphereGeometry(0.5, 12, 8),
  plane: new THREE.PlaneGeometry(1, 1)
};

// Hipped roof with a raised ridge and a slight outward sweep at the eaves.
const thatchedHip = (() => {
  const rings = [
    [[-0.50, 0, -0.50], [-0.50, 0, 0.50], [0.50, 0, 0.50], [0.50, 0, -0.50]],
    [[-0.40, 0.28, -0.35], [-0.40, 0.28, 0.35], [0.40, 0.28, 0.35], [0.40, 0.28, -0.35]],
    [[-0.23, 1, 0], [-0.23, 1, 0], [0.23, 1, 0], [0.23, 1, 0]],
  ];
  const vertices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const j = (i + 1) % 4;
    const [a, b] = [rings[0][i], rings[0][j]];
    const [c, d] = [rings[1][i], rings[1][j]];
    const [e, f] = [rings[2][i], rings[2][j]];
    vertices.push(...a, ...b, ...d, ...a, ...d, ...c, ...c, ...d, ...f);
    if (e[0] !== f[0]) vertices.push(...c, ...f, ...e);
  }
  vertices.push(...rings[0][0], ...rings[0][2], ...rings[0][1], ...rings[0][0], ...rings[0][3], ...rings[0][2]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.computeVertexNormals();
  return geometry;
})();
// a ridge tent: triangular prism along local z, apex up
export const TENT = new THREE.CylinderGeometry(1.8, 1.8, 4.2, 3, 1, true).rotateX(-Math.PI / 2).translate(0, 0.9, 0);
export type Obj = THREE.Object3D;
export function add(parent: Obj, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.rotation.y = ry; parent.add(m); return m;
}
export const box = (p: Obj, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => add(p, G.box, mat, x, y + h / 2, z, w, h, d, ry);
export const post = (p: Obj, r: number, h: number, mat: THREE.Material, x: number, y: number, z: number) => add(p, G.cyl, mat, x, y + h / 2, z, r * 2, h, r * 2);
/** hip roof / pyramid: footprint w x d, height h, base at y */
export const pyr = (p: Obj, w: number, h: number, d: number, mat: THREE.Material, x: number, y: number, z: number, ry = 0) => add(p, G.pyr, mat, x, y, z, w, h, d, ry);

/** world-space helpers for a group placed at (x, y, z) rotated by ry */
export function toWorld(gx: number, gz: number, ry: number, lx: number, lz: number): P2 {
  const c = Math.cos(ry), s = Math.sin(ry);
  return [gx + lx * c + lz * s, gz - lx * s + lz * c];
}
/** a rotated rectangle as a capsule along its long side (+ its footprint in the masks) */
export function solidBox(x: number, z: number, w: number, d: number, ry: number, footprint = true) {
  const long = Math.max(w, d), short = Math.min(w, d), along = w >= d;
  const [ax, az] = toWorld(x, z, ry, along ? -(long - short) / 2 : 0, along ? 0 : -(long - short) / 2);
  const [bx, bz] = toWorld(x, z, ry, along ? (long - short) / 2 : 0, along ? 0 : (long - short) / 2);
  addCollider({ seg: [ax, az, bx, bz], r: short / 2 });
  if (footprint) FOOTPRINTS.rects.push([x, z, w, d, ry]);
}
export function disc(x: number, z: number, r: number) { FOOTPRINTS.discs.push([x, z]); FOOTPRINTS.discR.push(r); }

/** big things far from the player are hidden outright (cheaper than letting three cull every mesh) */
const sites: { o: Obj; x: number; z: number; r: number }[] = [];
export const blockers: { o: Obj; x: number; z: number; r: number }[] = [];
export function site(o: Obj, x: number, z: number, r: number, blocker = true) {
  shadowTree(o); scene.add(o); sites.push({ o, x, z, r });
  if (blocker) blockers.push({ o, x, z, r });
  o.traverse(c => { const m = (c as THREE.Mesh).material; if (m && ((m as THREE.Material) === MT.fire || m === MT.chochin || m === MT.shoji || m === MT.gold)) c.castShadow = false; });
  return o;
}
export function updateStructures(px: number, pz: number) {
  for (const s of sites) s.o.visible = Math.hypot(s.x - px, s.z - pz) < s.r + 190;
}

// ------------------------------------------------------------ small props
export function stoneLantern(p: Obj, x: number, y: number, z: number, wx: number, wz: number, k = 1, light = true) {
  const l = new THREE.Group(); l.position.set(x, y, z); l.scale.setScalar(k); p.add(l);
  box(l, 0.7, 0.25, 0.7, MT.stone, 0, 0, 0);
  post(l, 0.15, 0.9, MT.stone, 0, 0.25, 0);
  box(l, 0.55, 0.45, 0.55, MT.fire, 0, 1.15, 0);
  pyr(l, 0.9, 0.45, 0.9, MT.stone, 0, 1.6, 0);
  addCollider({ x: wx, z: wz, r: 0.45 * k });
  if (light) addLight({ x: wx, y: groundY(wx, wz) + 1.4 * k, z: wz, color: 0xff9a40, intensity: 5, distance: 13, decay: 1.4 });
}
export function hangingLantern(p: Obj, x: number, y: number, z: number, s = 1) {
  const l = add(p, G.sphere, MT.chochin, x, y, z, 0.5 * s, 0.68 * s, 0.5 * s);
  add(p, G.cyl, MT.wood, x, y + 0.36 * s, z, 0.42 * s, 0.07 * s, 0.42 * s);
  add(p, G.cyl, MT.wood, x, y - 0.36 * s, z, 0.42 * s, 0.07 * s, 0.42 * s);
  return l;
}
export function torii(p: Obj, x: number, y: number, z: number, ry: number, k = 1) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(k); p.add(g);
  for (const sx of [-2.3, 2.3]) add(g, G.cyl, MT.red, sx, 2.2, 0, 0.48, 4.4, 0.48);
  box(g, 6.6, 0.32, 0.55, MT.black, 0, 4.35, 0);
  box(g, 6.0, 0.25, 0.45, MT.red, 0, 4.1, 0);
  box(g, 5.4, 0.22, 0.3, MT.red, 0, 3.45, 0);
  box(g, 0.25, 0.55, 0.2, MT.black, 0, 3.62, 0);
  return g;
}
/** a small shrine hall (the main one, scaled down) */
export function miniShrine(p: Obj, x: number, y: number, z: number, ry: number, k: number) {
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(k); p.add(g);
  box(g, 10, 0.7, 7, MT.foundation, 0, 0, 0);
  box(g, 7.9, 2.6, 5, MT.siding, 0, 0.85, -0.1);
  for (const sx of [-3, -1, 1, 3]) add(g, G.plane, MT.shoji, sx, 2.0, 2.42, 1.85, 2.2, 1);
  for (const sx of [-4, -2, 0, 2, 4]) post(g, 0.15, 2.9, MT.woodL, sx, 0.75, 2.55);
  for (const sgn of [1, -1]) { const r = box(g, 11, 0.22, 4.7, MT.roof, 0, 3.95, 2.06 * sgn); r.rotation.x = 0.5 * sgn; }
  box(g, 11.4, 0.38, 0.45, MT.roof, 0, 5.05, 0);
  for (const sgn of [1, -1]) hangingLantern(g, 2.6 * sgn, 2.95, 3.55, 0.64);
  return g;
}

// ------------------------------------------------------------ roads (draped ribbons) + lanterns along them
export function ribbon(line: Line, width: number, mat: THREE.Material, lift: number, colorAt?: (x: number, z: number, side: number) => THREE.Color) {
  const pts = line.pts, n = pts.length, pos = new Float32Array(n * 2 * 3), col = new Float32Array(n * 2 * 3), uv = new Float32Array(n * 2 * 2), idx: number[] = [];
  let along = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    for (let s = 0; s < 2; s++) {
      const side = s ? 1 : -1, x = pts[i][0] - dz * side * width / 2, z = pts[i][1] + dx * side * width / 2;
      pos.set([x, groundY(x, z) + lift, z], (i * 2 + s) * 3);
      uv.set([s, along / width], (i * 2 + s) * 2);
      if (colorAt) { const c = colorAt(x, z, side); col.set([c.r, c.g, c.b], (i * 2 + s) * 3); }
    }
    if (i < n - 1) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); along += Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (colorAt) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const m = new THREE.Mesh(geo, mat); m.receiveShadow = true; scene.add(m);
  return m;
}
function buildRoads() {
  const c = new THREE.Color();
  for (const road of ROADS) ribbon(road, road.width, MT.road, 0.05, (x, z) => {
    const v = 0.5 + Math.sin(x * 1.7 + z * 0.9) * 0.08 + Math.sin(x * 0.37 - z * 1.3) * 0.08;
    return c.setRGB(0.3 * v, 0.29 * v, 0.31 * v);
  });
  // stone lanterns every ~38 m, alternating sides; none inside places, on bridges or by the lake
  const lanterns = new THREE.Group(); lanterns.name = 'road-lanterns';
  let side = 1;
  for (const road of ROADS) {
    if (road === TORII_PATH) continue;
    for (let i = 10; i < road.pts.length - 10; i += 19) {
      const [x0, z0] = road.pts[i], [x1, z1] = road.pts[i + 1];
      const dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
      const x = x0 - dz / l * side * (road.width / 2 + 1.3), z = z0 + dx / l * side * (road.width / 2 + 1.3);
      side = -side;
      if (Math.hypot(x, z) < 70 || BRIDGES.some(b => Math.hypot(b.x - x, b.z - z) < 14) || lineDist(x, z, RIVER) < 8) continue;
      if (LAKES.some(lk => Math.hypot(lk.x - x, lk.z - z) < lk.R * 1.25)) continue;
      if (ROADS.some(r => r !== road && lineDist(x, z, r) < r.width / 2 + 0.8)) continue;
      stoneLantern(lanterns, x, groundY(x, z), z, x, z, 0.95);
    }
  }
  shadowTree(lanterns); lanterns.traverse(o => { if ((o as THREE.Mesh).material === MT.fire) o.castShadow = false; });
  scene.add(lanterns);
}

// ------------------------------------------------------------ water: lake, river, bridges
function buildWater() {
  LAKES.forEach((l, li) => {
    const y = lakeLevel[li] - 0.15, N = 160, shape = new THREE.Shape();
    // shape y = -world z, so that after lying it flat (facing up) the shore matches lakeRadius()
    for (let i = 0; i < N; i++) { const a = (i / N) * TAU, r = lakeRadius(l, a) + 0.6; i ? shape.lineTo(Math.cos(a) * r, -Math.sin(a) * r) : shape.moveTo(Math.cos(a) * r, -Math.sin(a) * r); }
    const w = new THREE.Mesh(new THREE.ShapeGeometry(shape, 1), MT.water);
    w.rotation.x = -Math.PI / 2; w.position.set(l.x, y, l.z); w.receiveShadow = true; scene.add(w);
    const g = new THREE.Group();
    // lily pads, lotus and reeds along the shore
    const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.5, 10, 0.3, TAU - 0.5), MT.lily, 160);
    const reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.07, 1.8, 4).translate(0, 0.9, 0), MT.reed, 900);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
    for (let i = 0; i < 160; i++) {
      const a = rnd(0, TAU), r = lakeRadius(l, a) * rnd(0.55, 0.93);
      e.set(-Math.PI / 2, 0, rnd(0, TAU)); q.setFromEuler(e);
      pads.setMatrixAt(i, m4.compose(new THREE.Vector3(l.x + Math.cos(a) * r, y + 0.03, l.z + Math.sin(a) * r), q, new THREE.Vector3().setScalar(rnd(0.7, 1.6))));
    }
    for (let i = 0; i < 900; i++) {
      const a = rnd(0, TAU), r = lakeRadius(l, a) + rnd(-1.8, 0.8), x = l.x + Math.cos(a) * r, z = l.z + Math.sin(a) * r;
      e.set(rnd(-0.2, 0.2), 0, rnd(-0.2, 0.2)); q.setFromEuler(e);
      reeds.setMatrixAt(i, m4.compose(new THREE.Vector3(x, Math.max(y - 0.3, groundY(x, z) - 0.1), z), q, new THREE.Vector3(1, rnd(0.6, 1.4), 1)));
    }
    pads.frustumCulled = reeds.frustumCulled = false;
    g.add(pads, reeds);
    // the floating torii, standing in the water
    const ta = 2.6, tr = lakeRadius(l, ta) * 0.55;
    torii(g, l.x + Math.cos(ta) * tr, y - 0.4, l.z + Math.sin(ta) * tr, -ta + Math.PI / 2, 1.5);
    // a pavilion on the shore where the road arrives
    const pa = Math.atan2(140 - l.z, -245 - l.x), pr = lakeRadius(l, pa) + 6, px = l.x + Math.cos(pa) * pr, pz = l.z + Math.sin(pa) * pr;
    const pav = new THREE.Group(); pav.position.set(px, groundY(px, pz), pz); pav.rotation.y = -pa - Math.PI / 2; g.add(pav);
    box(pav, 6.4, 0.45, 6.4, MT.stone, 0, 0, 0);
    for (const sx of [-2.6, 2.6]) for (const sz of [-2.6, 2.6]) post(pav, 0.16, 3, MT.red, sx, 0.45, sz);
    pyr(pav, 8.2, 2.6, 8.2, MT.roof, 0, 3.4, 0);
    box(pav, 7, 0.25, 7, MT.red, 0, 3.25, 0);
    hangingLantern(pav, 0, 2.6, 0, 0.8);
    addLight({ x: px, y: pav.position.y + 2.6, z: pz, color: 0xff8a3a, intensity: 6, distance: 14, decay: 1.4 });
    solidBox(px, pz, 6.4, 6.4, pav.rotation.y, true);
    for (const s of [-1, 1]) {
      const [lx, lz] = toWorld(px, pz, pav.rotation.y, 4.6 * s, 4.5);
      stoneLantern(g, lx, groundY(lx, lz), lz, lx, lz);
    }
    site(g, l.x, l.z, l.R + 20, false);
  });

  // the river: a dark ribbon following the valley. Shallow enough to wade (water.ts), or cross dry over the bridges
  ribbon(RIVER, RIVER.width, MT.river, 0.12);
  // reeds along the banks
  const reeds = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.03, 0.07, 1.6, 4).translate(0, 0.8, 0), MT.reed, 2400);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(); let n = 0;
  for (let i = 0; i < RIVER.pts.length - 1 && n < 2400; i += 1) {
    const [x0, z0] = RIVER.pts[i], [x1, z1] = RIVER.pts[i + 1], dx = x1 - x0, dz = z1 - z0, l = Math.hypot(dx, dz) || 1;
    for (let k = 0; k < 3 && n < 2400; k++) {
      const side = R() < 0.5 ? -1 : 1, off = RIVER.width / 2 + rnd(-0.6, 0.8), t = R();
      const x = x0 + dx * t - dz / l * side * off, z = z0 + dz * t + dx / l * side * off;
      if (BRIDGES.some(b => Math.hypot(b.x - x, b.z - z) < 6)) continue;
      e.set(rnd(-0.25, 0.25), 0, rnd(-0.25, 0.25)); q.setFromEuler(e);
      reeds.setMatrixAt(n++, m4.compose(new THREE.Vector3(x, groundY(x, z) - 0.05, z), q, new THREE.Vector3(1, rnd(0.6, 1.3), 1)));
    }
  }
  reeds.count = n; reeds.computeBoundingSphere(); scene.add(reeds);

  // red arched bridges (taiko-bashi) where the roads cross
  for (const b of BRIDGES) {
    const g = new THREE.Group(), y0 = Math.max(groundY(b.x, b.z), (bridgeEndY(b, -1) + bridgeEndY(b, 1)) / 2);
    g.position.set(b.x, y0, b.z); g.rotation.y = b.dir;
    const segs = 14;
    for (let i = 0; i < segs; i++) {
      const t0 = i / segs - 0.5, t1 = (i + 1) / segs - 0.5, z0 = t0 * b.len, z1 = t1 * b.len;
      const y = (archY(b, (t0 + t1) / 2 * b.len)), slope = Math.atan2(archY(b, z1) - archY(b, z0), z1 - z0);
      const plank = box(g, b.width, 0.16, (z1 - z0) * 1.04, MT.woodL, 0, y - 0.08, (z0 + z1) / 2); plank.rotation.x = -slope;
      for (const sx of [-1, 1]) {
        const rail = box(g, 0.14, 0.12, (z1 - z0) * 1.04, MT.red, sx * b.width / 2, y + 0.95, (z0 + z1) / 2); rail.rotation.x = -slope;
        if (i % 2 === 0) post(g, 0.08, 1.05, MT.red, sx * b.width / 2, y - 0.05, z0);
      }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) { post(g, 0.14, 1.4, MT.red, sx * b.width / 2, archY(b, sz * b.len / 2) - 0.1, sz * b.len / 2); add(g, G.sphere, MT.gold, sx * b.width / 2, archY(b, sz * b.len / 2) + 1.4, sz * b.len / 2, 0.3, 0.3, 0.3); }
    for (const sx of [-1, 1]) {
      const [ax, az] = toWorld(b.x, b.z, b.dir, sx * (b.width / 2 + 0.1), -b.len / 2), [bx, bz] = toWorld(b.x, b.z, b.dir, sx * (b.width / 2 + 0.1), b.len / 2);
      addCollider({ seg: [ax, az, bx, bz], r: 0.2 });
    }
    site(g, b.x, b.z, 20, false);
  }
}
function bridgeEndY(b: typeof BRIDGES[number], s: number) { const [x, z] = toWorld(b.x, b.z, b.dir, 0, s * b.len / 2); return groundY(x, z); }
/** height of the deck along a bridge (local z), relative to its centre ground */
function archY(b: typeof BRIDGES[number], lz: number) { const t = lz / (b.len / 2); return 0.15 + 0.75 * (1 - t * t); }
/** raised floors you can walk onto (the shrine's boards, shop.ts): height at (x, z), or null outside */
export const floors: ((x: number, z: number) => number | null)[] = [];
/** walkable surface: the ground, a raised floor, or the deck of a bridge */
export function surfaceY(x: number, z: number) {
  const gy = groundY(x, z);
  for (const f of floors) { const y = f(x, z); if (y !== null) return Math.max(gy, y); }
  for (const b of BRIDGES) {
    const dx = x - b.x, dz = z - b.z; if (dx * dx + dz * dz > b.len * b.len) continue;
    const c = Math.cos(b.dir), s = Math.sin(b.dir), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (Math.abs(lx) < b.width / 2 + 0.3 && Math.abs(lz) < b.len / 2) {
      const y0 = Math.max(groundY(b.x, b.z), (bridgeEndY(b, -1) + bridgeEndY(b, 1)) / 2);
      return Math.max(gy, y0 + archY(b, lz));
    }
  }
  return gy;
}
/** how deep in the water (the river, or the shallow pond of the shrine) a walker stands (0..1), 0 on a bridge or dry land */
export function wadeDepth(x: number, z: number) {
  const d = riverDepth(x, z);
  if (d <= 0) return pondDepth(x, z);
  return surfaceY(x, z) > groundY(x, z) + 0.2 ? 0 : d;
}

// ------------------------------------------------------------ the village of Kiri
function house(p: Obj, x: number, z: number, ry: number, w: number, d: number, lit: boolean) {
  const y = groundY(x, z), g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; p.add(g);
  box(g, w + 0.8, 0.45, d + 0.8, MT.foundation, 0, -0.1, 0);
  box(g, w, 2.5, d, MT.siding, 0, 0.35, 0);
  const n = Math.max(2, Math.floor(w / 1.6));
  for (let i = 0; i < n; i++) add(g, G.plane, lit && i % 3 !== 1 ? MT.shoji : MT.shojiDark, (i - (n - 1) / 2) * (w / n), 1.5, d / 2 + 0.02, w / n * 0.86, 1.9, 1);
  for (const sx of [-w / 2, w / 2]) for (const sz of [-d / 2, d / 2]) post(g, 0.13, 2.85, MT.woodL, sx, 0.35, sz);
  box(g, w + 0.6, 0.12, 1.2, MT.woodL, 0, 0.5, d / 2 + 0.7);                  // engawa veranda
  const roof = pyr(g, w + 2.4, 3.1, d + 2.4, MT.thatch, 0, 2.75, 0);
  addRoundedSurface(roof, thatchedHip);
  box(g, w * 0.5, 0.3, 0.5, MT.thatch, 0, 5.7, 0);
  if (lit) { post(g, 0.06, 2.2, MT.wood, w / 2 + 1.6, 0, d / 2 + 1.7); box(g, 0.08, 0.08, 0.9, MT.wood, w / 2 + 1.6, 2.1, d / 2 + 1.35); hangingLantern(g, w / 2 + 1.6, 1.75, d / 2 + 1.0, 0.6); const [lx, lz] = toWorld(x, z, ry, 0, d / 2 + 1.6); addLight({ x: lx, y: y + 2, z: lz, color: 0xffa050, intensity: 5, distance: 12, decay: 1.4 }); }
  solidBox(x, z, w + 0.8, d + 0.8, ry);
}
function buildVillage() {
  const pl = place('aldea'), y = pl.level!, g = new THREE.Group();
  // paved plaza with a central well and strings of lanterns
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(15, 40), MT.pavers); plaza.rotation.x = -Math.PI / 2; plaza.position.set(pl.x, y + 0.06, pl.z); plaza.receiveShadow = true; g.add(plaza);
  disc(pl.x, pl.z, 15.5);
  const well = new THREE.Group(); well.position.set(pl.x, y, pl.z); g.add(well);
  add(well, G.cyl, MT.stone, 0, 0.45, 0, 2.2, 0.9, 2.2);
  for (const s of [-1, 1]) post(well, 0.08, 2.4, MT.wood, s * 0.9, 0, 0);
  pyr(well, 2.6, 0.9, 2, MT.roof, 0, 2.3, 0);
  addCollider({ x: pl.x, z: pl.z, r: 1.3 });
  const ring: THREE.Vector3[] = [];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU + 0.2, x = pl.x + Math.cos(a) * 13, z = pl.z + Math.sin(a) * 13;
    post(g, 0.1, 3.6, MT.wood, x, y, z); addCollider({ x, z, r: 0.2 }); ring.push(new THREE.Vector3(x, y + 3.4, z));
  }
  for (let i = 0; i < 8; i++) {
    const a = ring[i], b = ring[(i + 1) % 8];
    for (let k = 1; k < 5; k++) { const t = k / 5, s = Math.sin(t * Math.PI) * 0.7; hangingLantern(g, a.x + (b.x - a.x) * t, a.y - s, a.z + (b.z - a.z) * t, 0.42); }
  }
  addLight({ x: pl.x, y: y + 3, z: pl.z, color: 0xff9040, intensity: 8, distance: 22, decay: 1.3, flicker: 0.4 });
  // houses facing the plaza, keeping the roads clear
  let made = 0;
  for (let t = 0; t < 200 && made < 14; t++) {
    const a = rnd(0, TAU), r = rnd(23, 46), x = pl.x + Math.cos(a) * r, z = pl.z + Math.sin(a) * r;
    if (ROADS.some(rd => lineDist(x, z, rd) < rd.width / 2 + 6.5)) continue;
    if (FOOTPRINTS.rects.some(([fx, fz]) => Math.hypot(fx - x, fz - z) < 12)) continue;
    const w = rnd(6, 9), d = rnd(5, 6.5), ry = Math.atan2(pl.x - x, pl.z - z);
    house(g, x, z, ry, w, d, R() < 0.65); made++;
    // a few barrels and a rack by the door
    const [bx, bz] = toWorld(x, z, ry, w / 2 + 0.9, d / 2 - 0.5);
    add(g, G.cyl, MT.woodL, bx, groundY(bx, bz) + 0.4, bz, 0.7, 0.8, 0.7); addCollider({ x: bx, z: bz, r: 0.4 });
  }
  site(g, pl.x, pl.z, 60);
}

// ------------------------------------------------------------ Kuro castle
function buildCastle() {
  const pl = place('castillo'), y = pl.level!, cx = pl.x, cz = pl.z, g = new THREE.Group(); g.position.set(cx, y, cz);
  // outer stone wall (gate to the south, where the road arrives), corner towers
  const H = 50, wallH = 4.2, th = 2.2, gate = 6;
  const wall = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(x1 - x0, z1 - z0);
    box(g, th, wallH, len, MT.stoneD, (x0 + x1) / 2, 0, (z0 + z1) / 2, ang);
    box(g, th + 0.5, 0.5, len, MT.roof, (x0 + x1) / 2, wallH, (z0 + z1) / 2, ang);
    box(g, th - 0.6, 0.8, len, MT.plaster, (x0 + x1) / 2, wallH - 0.3, (z0 + z1) / 2, ang);
    addCollider({ seg: [cx + x0, cz + z0, cx + x1, cz + z1], r: th / 2 });
  };
  wall(-H, -H, H, -H); wall(-H, -H, -H, H); wall(H, -H, H, H);
  wall(-H, H, -gate, H); wall(gate, H, H, H);
  for (const sx of [-H, H]) for (const sz of [-H, H]) {
    box(g, 7, 5, 7, MT.stoneD, sx, 0, sz); box(g, 6, 3.2, 6, MT.plaster, sx, 5, sz); pyr(g, 8.4, 2.8, 8.4, MT.roof, sx, 8.1, sz);
    solidBox(cx + sx, cz + sz, 7, 7, 0, true);
  }
  // gatehouse
  for (const s of [-1, 1]) { box(g, 3, 6, 4, MT.stoneD, s * (gate + 1.2), 0, H); }
  box(g, gate * 2 + 5, 2.2, 4.4, MT.plaster, 0, 6, H); pyr(g, gate * 2 + 8, 2.4, 7, MT.roof, 0, 8.1, H);
  for (const s of [-1, 1]) { hangingLantern(g, s * 3.2, 4.4, H + 2.4, 0.8); addLight({ x: cx + s * 3.2, y: y + 4.4, z: cz + H + 2.6, color: 0xff8a3a, intensity: 6, distance: 15, decay: 1.4 }); }
  // ishigaki: the sloped stone base of the keep
  const base = new THREE.Mesh(new THREE.CylinderGeometry(15 * Math.SQRT2, 19 * Math.SQRT2, 8, 4, 1).rotateY(Math.PI / 4), MT.stoneD);
  base.position.set(0, 4, -8); g.add(base);
  solidBox(cx - 9.5, cz - 8, 19, 38, 0, false); solidBox(cx + 9.5, cz - 8, 19, 38, 0, false);
  FOOTPRINTS.rects.push([cx, cz - 8, 40, 40, 0]);
  // the keep: three white tiers, dark roofs, golden fish on the ridge, lit windows
  const tiers = [[24, 6.5, 22], [18, 5.5, 16], [12, 5, 10]];
  let ty = 8;
  tiers.forEach(([w, h, d], i) => {
    box(g, w, h, d, MT.plaster, 0, ty, -8);
    box(g, w + 0.3, 0.6, d + 0.3, MT.black, 0, ty, -8);
    for (let k = 0; k < 4; k++) add(g, G.plane, k % 2 ? MT.shoji : MT.shojiDark, (k - 1.5) * w / 4.6, ty + h * 0.55, -8 + d / 2 + 0.02, 1.4, 1.6, 1);
    pyr(g, w + 5, i === 2 ? 4.5 : 2.6, d + 5, MT.roof, 0, ty + h - 0.2, -8);
    box(g, w + 5.2, 0.25, d + 5.2, MT.roofL, 0, ty + h - 0.35, -8);
    ty += h + (i === 2 ? 0 : 1.6);
  });
  for (const s of [-1, 1]) { const f = box(g, 0.5, 1.4, 0.9, MT.gold, s * 2.4, ty + 3.6, -8); f.rotation.z = s * 0.3; }
  addLight({ x: cx, y: y + 10, z: cz + 6, color: 0xffa050, intensity: 9, distance: 24, decay: 1.3 });
  // approach: banners and lanterns
  for (let i = 0; i < 6; i++) for (const s of [-1, 1]) {
    const lz = H + 6 + i * 7, lx = s * 5.5;
    post(g, 0.07, 5, MT.black, lx, 0, lz);
    const ban = add(g, G.plane, MT.banner[(i + (s > 0 ? 1 : 0)) % 3], lx, 3.1, lz, 0.9, 3.2, 1, Math.PI / 2); ban.position.x += s * 0.5;
    addCollider({ x: cx + lx, z: cz + lz, r: 0.2 });
  }
  for (const s of [-1, 1]) stoneLantern(g, s * 4, 0, 10, cx + s * 4, cz + 10, 1.2);
  // inner garden: gravel court in front of the keep
  const court = new THREE.Mesh(new THREE.PlaneGeometry(30, 22), MT.gravel); court.rotation.x = -Math.PI / 2; court.position.set(0, 0.03, 23); g.add(court);
  FOOTPRINTS.rects.push([cx, cz + 23, 30, 22, 0]);
  site(g, cx, cz, 75);
}

// ------------------------------------------------------------ pagoda of the five winds
function buildPagoda() {
  const pl = place('pagoda'), y = pl.level!, g = new THREE.Group(); g.position.set(pl.x, y, pl.z);
  box(g, 14, 1.2, 14, MT.stone, 0, 0, 0);
  for (let i = 0; i < 3; i++) box(g, 4, 0.4, 0.8, MT.stone, 0, i * 0.4, 7.4 + (2 - i) * 0.8);
  let ty = 1.2;
  for (let i = 0; i < 5; i++) {
    const s = 8 - i * 1.1, h = 2.7 - i * 0.12;
    box(g, s, h, s, MT.red, 0, ty, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) post(g, 0.18, h, MT.woodL, sx * s / 2, ty, sz * s / 2);
    add(g, G.plane, i % 2 ? MT.shoji : MT.shojiDark, 0, ty + h * 0.5, s / 2 + 0.02, s * 0.4, h * 0.6, 1);
    const rw = s + 4.4 - i * 0.2;
    pyr(g, rw, 1.25, rw, MT.roof, 0, ty + h - 0.1, 0);
    box(g, rw * 0.98, 0.22, rw * 0.98, MT.roofL, 0, ty + h - 0.2, 0);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) hangingLantern(g, sx * rw * 0.47, ty + h - 0.75, sz * rw * 0.47, 0.42);
    ty += h + 0.9;
  }
  post(g, 0.14, 6.5, MT.black, 0, ty, 0);
  for (let i = 0; i < 9; i++) add(g, G.cyl, MT.gold, 0, ty + 0.9 + i * 0.5, 0, 0.75 - i * 0.04, 0.09, 0.75 - i * 0.04);
  add(g, G.sphere, MT.gold, 0, ty + 6.6, 0, 0.5, 0.6, 0.5);
  solidBox(pl.x, pl.z, 14, 14, 0);
  addLight({ x: pl.x, y: y + 3, z: pl.z + 9, color: 0xffa050, intensity: 8, distance: 18, decay: 1.3 });
  // gravel court, stone lanterns and a torii at the entrance
  const court = new THREE.Mesh(new THREE.PlaneGeometry(30, 34), MT.gravel); court.rotation.x = -Math.PI / 2; court.position.set(0, 0.03, 4); g.add(court);
  FOOTPRINTS.rects.push([pl.x, pl.z + 4, 30, 34, 0]);
  for (const sx of [-6, 6]) for (const sz of [10, 15]) stoneLantern(g, sx, 0, sz, pl.x + sx, pl.z + sz);
  torii(g, 0, 0, 19, 0, 1); for (const sx of [-2.3, 2.3]) addCollider({ x: pl.x + sx, z: pl.z + 19, r: 0.35 });
  site(g, pl.x, pl.z, 35);
}

// ------------------------------------------------------------ the thousand torii + the summit shrine
function buildToriiPath() {
  const pts = TORII_PATH.pts, step = 1.4, list: [number, number, number][] = [];
  let acc = 0;
  for (let i = 1; i < pts.length; i++) {
    acc += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    if (acc < step || i > pts.length - 6) continue;
    acc = 0;
    list.push([pts[i][0], pts[i][1], Math.atan2(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])]);
  }
  const pillar = new THREE.InstancedMesh(G.cyl, MT.vermilion, list.length * 2), top = new THREE.InstancedMesh(G.box, MT.black, list.length);
  const beam = new THREE.InstancedMesh(G.box, MT.vermilion, list.length * 2);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3();
  list.forEach(([x, z, ry], i) => {
    const y = groundY(x, z); q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry);
    for (let k = 0; k < 2; k++) {
      const [px, pz] = toWorld(x, z, ry, k ? 1.95 : -1.95, 0), py = groundY(px, pz);
      pillar.setMatrixAt(i * 2 + k, m4.compose(v.set(px, py + 1.8, pz), q, s.set(0.36, 3.8, 0.36)));
      addCollider({ x: px, z: pz, r: 0.28 });
    }
    top.setMatrixAt(i, m4.compose(v.set(x, y + 3.75, z), q, s.set(5.2, 0.28, 0.42)));
    beam.setMatrixAt(i * 2, m4.compose(v.set(x, y + 3.45, z), q, s.set(4.7, 0.2, 0.34)));
    beam.setMatrixAt(i * 2 + 1, m4.compose(v.set(x, y + 2.95, z), q, s.set(4.3, 0.18, 0.26)));
  });
  for (const im of [pillar, top, beam]) { im.computeBoundingSphere(); im.castShadow = im.receiveShadow = true; scene.add(im); }
  const [sx, sz] = pts[0];
  for (const s2 of [-1, 1]) { const x = sx + s2 * 3, z = sz - 2; const lg = new THREE.Group(); stoneLantern(lg, x, groundY(x, z), z, x, z, 1.15); shadowTree(lg); scene.add(lg); }
  // summit shrine with its fox guardians
  const pl = place('inari'), g = new THREE.Group(), y = pl.level!;
  g.position.set(pl.x, y, pl.z);
  const ry = Math.atan2(pts[0][0] - pl.x, pts[0][1] - pl.z);
  miniShrine(g, 0, 0, 0, ry, 0.75);
  solidBox(pl.x, pl.z, 7.5, 5.3, ry);
  for (const s2 of [-1, 1]) {
    const [fx, fz] = toWorld(0, 0, ry, s2 * 3.2, 7);
    const fox = new THREE.Group(); fox.position.set(fx, 0, fz); fox.rotation.y = ry; g.add(fox);
    box(fox, 0.9, 0.9, 0.9, MT.stone, 0, 0, 0);
    add(fox, G.sphere, MT.plaster, 0, 1.4, 0, 0.6, 1.0, 0.7); add(fox, G.sphere, MT.plaster, 0, 2.05, 0.12, 0.45, 0.45, 0.5);
    for (const e of [-1, 1]) { const ear = add(fox, G.pyr, MT.plaster, e * 0.13, 2.2, 0.1, 0.14, 0.35, 0.1); ear.rotation.z = -e * 0.2; }
    add(fox, G.box, MT.red, 0, 1.75, 0.3, 0.5, 0.12, 0.2);
    addCollider({ x: pl.x + fx, z: pl.z + fz, r: 0.6 });
  }
  addLight({ x: pl.x, y: y + 2.5, z: pl.z, color: 0xffa050, intensity: 7, distance: 16, decay: 1.3 });
  const court = new THREE.Mesh(new THREE.CircleGeometry(12, 32), MT.gravel); court.rotation.x = -Math.PI / 2; court.position.y = 0.03; g.add(court);
  disc(pl.x, pl.z, 12.5);
  site(g, pl.x, pl.z, 25);
}

// ------------------------------------------------------------ ronin camp
function buildCamp() {
  const pl = place('campamento'), y = pl.level!, g = new THREE.Group(); g.position.set(pl.x, y, pl.z);
  // campfire
  campfire(g, pl.x, y, pl.z, 1.05, 0xff7a2a);
  // tents around the fire
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.4, r = 11, x = Math.cos(a) * r, z = Math.sin(a) * r, ry = Math.atan2(-x, -z);
    const t = new THREE.Group(); t.position.set(x, groundY(pl.x + x, pl.z + z) - y, z); t.rotation.y = ry; g.add(t);
    add(t, TENT, MT.cloth, 0, 0, 0, 1, 1, 1);
    post(t, 0.06, 2.6, MT.wood, 0, 0, -2.2); post(t, 0.06, 2.6, MT.wood, 0, 0, 2.2);
    solidBox(pl.x + x, pl.z + z, 3.2, 4.4, ry);
  }
  // banners and a palisade of sharpened logs, open towards the river and the roads
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU, x = Math.cos(a) * 17, z = Math.sin(a) * 17;
    post(g, 0.07, 5.5, MT.black, x, groundY(pl.x + x, pl.z + z) - y, z);
    add(g, G.plane, MT.banner[i % 3], x, groundY(pl.x + x, pl.z + z) - y + 3.6, z, 0.9, 3.2, 1, a);
    addCollider({ x: pl.x + x, z: pl.z + z, r: 0.2 });
  }
  for (let i = 0; i < 70; i++) {
    const a = (i / 70) * TAU, x = Math.cos(a) * 24, z = Math.sin(a) * 24, wx = pl.x + x, wz = pl.z + z;
    if (ROADS.some(rd => lineDist(wx, wz, rd) < rd.width / 2 + 3)) continue;
    const log = add(g, G.cyl6, MT.wood, x, groundY(wx, wz) - y + 1.3, z, 0.4, 2.8, 0.4); log.rotation.x = 0.15 * Math.sin(a * 7);
    add(g, new THREE.ConeGeometry(0.2, 0.5, 6), MT.woodL, x, groundY(wx, wz) - y + 2.95, z, 1, 1, 1);
    addCollider({ x: wx, z: wz, r: 0.3 });
  }
  disc(pl.x, pl.z, 4);
  site(g, pl.x, pl.z, 30);
}

// ------------------------------------------------------------ cemetery of the lanterns
function buildCemetery() {
  const pl = place('cementerio'), y = pl.level!, g = new THREE.Group(); g.position.set(pl.x, y, pl.z);
  const graves = new THREE.InstancedMesh(G.box, MT.stone, 200), caps = new THREE.InstancedMesh(G.box, MT.stoneD, 200);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(); let n = 0;
  for (let row = -4; row <= 4; row++) for (let col = -7; col <= 7; col++) {
    if (Math.abs(col) < 2) continue;                              // central aisle
    const x = col * 2.6 + rnd(-0.3, 0.3), z = row * 3.2 + rnd(-0.3, 0.3);
    if (Math.hypot(x, z) > 30 || R() < 0.15) continue;
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd(-0.12, 0.12));
    const h = rnd(1.0, 1.7);
    graves.setMatrixAt(n, m4.compose(v.set(x, h / 2 + 0.3, z), q, s.set(0.55, h, 0.45)));
    caps.setMatrixAt(n, m4.compose(v.set(x, 0.15, z), q, s.set(1.1, 0.3, 0.9)));
    addCollider({ x: pl.x + x, z: pl.z + z, r: 0.55 }); n++;
  }
  graves.count = caps.count = n; g.add(graves, caps);
  // a lantern at the end of every other row + a little hall at the back
  for (let row = -4; row <= 4; row += 2) for (const sx of [-1.5, 1.5]) stoneLantern(g, sx, 0, row * 3.2, pl.x + sx, pl.z + row * 3.2, 0.8, row % 4 === 0);
  miniShrine(g, 0, 0, -22, 0, 0.6); solidBox(pl.x, pl.z - 22, 6, 4.2, 0);
  // jizo statues with red bibs
  for (let i = 0; i < 7; i++) {
    const x = -9 + i * 3, z = 17;
    add(g, G.cyl, MT.stone, x, 0.4, z, 0.6, 0.8, 0.6); add(g, G.sphere, MT.stone, x, 1.0, z, 0.45, 0.45, 0.45);
    add(g, G.cyl, MT.red, x, 0.7, z + 0.05, 0.66, 0.2, 0.6);
    addCollider({ x: pl.x + x, z: pl.z + z, r: 0.4 });
  }
  const court = new THREE.Mesh(new THREE.PlaneGeometry(4, 50), MT.gravel); court.rotation.x = -Math.PI / 2; court.position.y = 0.03; g.add(court);
  FOOTPRINTS.rects.push([pl.x, pl.z, 4, 50, 0]);
  site(g, pl.x, pl.z, 35);
}

/** build everything; registers colliders, lights and the mask footprints (call before buildMasks) */
export function buildStructures() {
  R = seeded(7331);
  buildRoads();
  buildWater();
  buildVillage();
  buildCastle();
  buildPagoda();
  buildToriiPath();
  buildCamp();
  buildCemetery();
}
