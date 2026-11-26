// The world: lights, moon and stars, terrain, the clearing (stone path, torii, shrine, fence, nature),
// every landmark of the open world (structures.ts), the streamed forest (chunks.ts), petals and rain.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { renderer, scene } from './renderer';
import { M, CLS, tagMat, tagTree, shadowTree, box } from './materials';
import { buildNature } from './nature';
import { preset } from './quality';
import { addCollider, isFree } from './physics';
import { addLight, updateLights } from './lights';
import { buildTerrainMesh, buildSkyline } from './terrain';
import { buildStructures, updateStructures, blockers, floors, MT } from './structures';
import { addRoundedSurface, showSurfaceDetail, sunsetSunDir, surfaceMaterial } from './surfaces';
import { updateChunks, chunkBlockers } from './chunks';
import { buildMasks } from './map';
import { buildLandmarks } from './landmarks';
import { buildSettlements } from './settlements';
import { buildCanyons } from './canyons';
import { buildMesas } from './mesas';
import { buildTemples } from './temple-grounds';
import { player, state } from './state';
import { rnd } from './utils';
import { sfx } from './sfx';
import { buildDrift, updateDrift, updateWaterWeather } from './water';

/** objects of the clearing the camera pulls in front of (the rest of the world: structures.ts / chunks.ts) */
const camBlockers: THREE.Object3D[] = [];

// sky fill: brighter blue from above, warm bounce from the ground so shadows aren't pitch black
const hemiLight = new THREE.HemisphereLight(0x8a9ad8, 0x2a1f14, 1.05);
scene.add(hemiLight);
const NIGHT_DIR = new THREE.Vector3(-0.55, 0.7, -0.45).normalize();
// low golden-hour sun angle: casts long, dramatic shadows across the clearing in T (3D) mode
const SUNSET_DIR = sunsetSunDir.value;
export const moonDir = NIGHT_DIR.clone();
const moonLight = new THREE.DirectionalLight(0xd2dcff, 5.0);
export const rimLight = new THREE.DirectionalLight(0x9fc0ff, 3.0);
scene.add(rimLight, rimLight.target);
moonLight.position.copy(moonDir).multiplyScalar(50);
moonLight.castShadow = true;
// tighter frustum around the player = sharper shadows with the same map (4096 at high quality, quality.ts)
const SHADOW_HALF = 24;
let SHADOW_TEXEL = 1;
let shadowDist = 45;
/** the moon's shadow map side; the old map is dropped and three.js builds the new one on the next frame */
export function setMoonShadowMap(size: number) {
  moonLight.shadow.mapSize.set(size, size);
  moonLight.shadow.map?.dispose(); moonLight.shadow.map = null;
  SHADOW_TEXEL = (SHADOW_HALF * 2) / size;
}
setMoonShadowMap(preset().shadowMap);
Object.assign(moonLight.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 110 });
moonLight.shadow.bias = -0.0003; moonLight.shadow.normalBias = 0.025;
scene.add(moonLight, moonLight.target);
// light-space axes: the shadow camera is snapped to whole texels so shadows don't shimmer while walking
const shLX = new THREE.Vector3();
const shLY = new THREE.Vector3();
const shSnap = new THREE.Vector3();
function syncShadowAxes() {
  shLX.crossVectors(THREE.Object3D.DEFAULT_UP, moonDir).normalize();
  shLY.crossVectors(moonDir, shLX).normalize();
}
syncShadowAxes();
export function placeMoonShadow(p: THREE.Vector3) {
  const a = Math.round(p.dot(shLX) / SHADOW_TEXEL) * SHADOW_TEXEL;
  const b = Math.round(p.dot(shLY) / SHADOW_TEXEL) * SHADOW_TEXEL;
  shSnap.set(0, 0, 0).addScaledVector(shLX, a).addScaledVector(shLY, b).addScaledVector(moonDir, p.dot(moonDir));
  moonLight.target.position.copy(shSnap);
  moonLight.position.copy(shSnap).addScaledVector(moonDir, shadowDist);
}
// environment maps so lacquer, gold, steel and water get real reflections (night for ASCII, sunset for T mode)
const [nightEnv, sunsetEnv] = (() => {
  const pm = new THREE.PMREMGenerator(renderer);
  const nightScene = new THREE.Scene();
  nightScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.01,0.012,0.012), vec3(0.09,0.12,0.24), smoothstep(-0.15,0.6,h)), 1.); }`
  })));
  const md = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 7, 6.4) }));
  md.position.copy(NIGHT_DIR).multiplyScalar(8); nightScene.add(md);
  const lw = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.4) }));
  lw.position.set(4, 0.8, -6); nightScene.add(lw);
  const nightTex = pm.fromScene(nightScene, 0.03).texture;

  const sunsetScene = new THREE.Scene();
  sunsetScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uSunDir: { value: SUNSET_DIR } },
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; uniform vec3 uSunDir; void main(){
      vec3 d = normalize(vP); float h = d.y;
      vec3 col = mix(vec3(0.14, 0.13, 0.10), vec3(0.62, 0.72, 0.80), smoothstep(-0.12, 0.08, h));
      col = mix(col, vec3(0.24, 0.48, 0.82), smoothstep(0.08, 0.40, h));
      col = mix(col, vec3(0.11, 0.28, 0.62), smoothstep(0.40, 0.85, h));
      col += pow(max(dot(d, uSunDir), 0.0), 8.0) * vec3(0.55, 0.45, 0.28);
      gl_FragColor = vec4(col, 1.);
    }`
  })));
  const sd = new THREE.Mesh(new THREE.SphereGeometry(1.4, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(12, 10.8, 8.2) }));
  sd.position.copy(SUNSET_DIR).multiplyScalar(8); sunsetScene.add(sd);
  const sunsetTex = pm.fromScene(sunsetScene, 0.04).texture;
  pm.dispose();
  return [nightTex, sunsetTex] as const;
})();
scene.environment = nightEnv;
export const keyLight = new THREE.PointLight(0xdde6ff, 7, 12, 1.2);
scene.add(keyLight);

// moon/sun + halo + stars + afternoon sky dome + far mountains: a sky dome that travels with the camera
const sky = new THREE.Group(); scene.add(sky);
const sunsetDomeMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { uSunDir: { value: SUNSET_DIR }, uRain: { value: 0 } },
  vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `varying vec3 vDir; uniform vec3 uSunDir; uniform float uRain; void main(){
    vec3 d = normalize(vDir); float h = d.y;
    vec3 col = mix(vec3(0.74, 0.80, 0.82), vec3(0.84, 0.86, 0.82), smoothstep(-0.08, 0.03, h));
    col = mix(col, vec3(0.46, 0.68, 0.90), smoothstep(0.03, 0.24, h));
    col = mix(col, vec3(0.22, 0.48, 0.84), smoothstep(0.24, 0.55, h));
    col = mix(col, vec3(0.10, 0.28, 0.64), smoothstep(0.55, 0.92, h));
    float sun = max(dot(d, uSunDir), 0.0);
    col += pow(sun, 3.0) * smoothstep(0.65, -0.05, abs(h - 0.30)) * vec3(0.32, 0.26, 0.12);
    col += pow(sun, 32.0) * vec3(1.05, 0.92, 0.62);
    // Rain overcast: mute the clear afternoon sky into cool storm grey-blue clouds
    vec3 storm = mix(vec3(0.28, 0.36, 0.44), vec3(0.40, 0.48, 0.56), smoothstep(-0.08, 0.18, h));
    storm = mix(storm, vec3(0.22, 0.30, 0.38), smoothstep(0.18, 0.72, h));
    storm += pow(sun, 4.0) * vec3(0.14, 0.16, 0.18);
    col = mix(col, storm, uRain * 0.88);
    gl_FragColor = vec4(col, 1.0);
  }`
});
const sunsetDome = new THREE.Mesh(new THREE.SphereGeometry(248, 32, 20), sunsetDomeMat);
sunsetDome.frustumCulled = false; sunsetDome.renderOrder = -2; sunsetDome.visible = false;
tagMat(sunsetDome.material, CLS.sky);
sky.add(sunsetDome);
const moonMat = new THREE.MeshBasicMaterial({ color: 0xf4efdc, fog: false });
const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), moonMat);
moon.position.copy(moonDir).multiplyScalar(150);
tagMat(moonMat, CLS.light);
sky.add(moon);
const skyline = buildSkyline(); tagMat(skyline.material, CLS.ground); sky.add(skyline);
export function updateSky(cam: THREE.Vector3) { sky.position.set(cam.x, Math.max(cam.y - 12, player.pos.y - 6), cam.z); }
let halo!: THREE.Sprite;
let haloMat!: THREE.SpriteMaterial;
let stars!: THREE.Points;
let starsMat!: THREE.PointsMaterial;
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d')!; const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  haloMat = new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), color: 0xc8d7ff, fog: false, depthWrite: false, blending: THREE.AdditiveBlending });
  halo = new THREE.Sprite(haloMat);
  tagMat(haloMat, CLS.sky); halo.scale.set(48, 48, 1); halo.position.copy(moon.position); sky.add(halo);
  const n = 900, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(rnd(0.08, 1));
    p.set([Math.sin(ph) * Math.cos(th) * 200, Math.cos(ph) * 200, Math.sin(ph) * Math.sin(th) * 200], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  starsMat = tagMat(new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, fog: false, transparent: true, opacity: 1 }), CLS.sky);
  stars = new THREE.Points(sg, starsMat);
  stars.frustumCulled = false; sky.add(stars);
}

// Dry and rainy atmosphere palettes (preallocated so rain transitions never allocate per frame)
const ATMOS = {
  nightDry: {
    moon: new THREE.Color(0xd2dcff), moonI: 5.0,
    hemi: new THREE.Color(0x8a9ad8), ground: new THREE.Color(0x2a1f14), hemiI: 1.05,
    rim: new THREE.Color(0x9fc0ff), rimI: 3.0,
    key: new THREE.Color(0xdde6ff), keyI: 7.0,
    bg: new THREE.Color(0x060912), fog: new THREE.Color(0x131b34), fogD: 0.016,
    skyline: new THREE.Color(0x141b33),
    disc: new THREE.Color(0xf4efdc), halo: new THREE.Color(0xc8d7ff),
    exposure: 1.2
  },
  nightRain: {
    moon: new THREE.Color(0x6b98b8), moonI: 2.9,
    hemi: new THREE.Color(0x426e84), ground: new THREE.Color(0x111d24), hemiI: 1.15,
    rim: new THREE.Color(0x5fa6c4), rimI: 2.2,
    key: new THREE.Color(0x94c4dc), keyI: 5.6,
    bg: new THREE.Color(0x040c12), fog: new THREE.Color(0x0d2330), fogD: 0.024,
    skyline: new THREE.Color(0x0b1c28),
    disc: new THREE.Color(0x94b8c8), halo: new THREE.Color(0x528aa4),
    exposure: 1.14
  },
  sunsetDry: {
    moon: new THREE.Color(0xfff0d4), moonI: 6.8,
    hemi: new THREE.Color(0x7db2e8), ground: new THREE.Color(0x4a4232), hemiI: 1.15,
    rim: new THREE.Color(0xffe5b8), rimI: 0.95,
    key: new THREE.Color(0xfff1dc), keyI: 2.2,
    bg: new THREE.Color(0x7aa8d8), fog: new THREE.Color(0xa8c4dc), fogD: 0.0085,
    skyline: new THREE.Color(0x6480a2),
    disc: new THREE.Color(0xfff8e2), halo: new THREE.Color(0xffe6a8),
    exposure: 1.06
  },
  sunsetRain: {
    moon: new THREE.Color(0xa8becf), moonI: 3.4,
    hemi: new THREE.Color(0x6c88a0), ground: new THREE.Color(0x26323a), hemiI: 1.15,
    rim: new THREE.Color(0x9cc0d8), rimI: 0.90,
    key: new THREE.Color(0xbcd4e6), keyI: 2.0,
    bg: new THREE.Color(0x3b4e5e), fog: new THREE.Color(0x526778), fogD: 0.017,
    skyline: new THREE.Color(0x3c5060),
    disc: new THREE.Color(0xd0dce4), halo: new THREE.Color(0x8ca4b8),
    exposure: 1.02
  }
};
let atmosRain = -1;
function applyAtmosphere(r: number) {
  atmosRain = r;
  const a = sunsetMode ? ATMOS.sunsetDry : ATMOS.nightDry;
  const b = sunsetMode ? ATMOS.sunsetRain : ATMOS.nightRain;
  const lerp = THREE.MathUtils.lerp;
  moonLight.color.copy(a.moon).lerp(b.moon, r);
  moonLight.intensity = lerp(a.moonI, b.moonI, r);
  hemiLight.color.copy(a.hemi).lerp(b.hemi, r);
  hemiLight.groundColor.copy(a.ground).lerp(b.ground, r);
  hemiLight.intensity = lerp(a.hemiI, b.hemiI, r);
  rimLight.color.copy(a.rim).lerp(b.rim, r);
  rimLight.intensity = lerp(a.rimI, b.rimI, r);
  keyLight.color.copy(a.key).lerp(b.key, r);
  keyLight.intensity = lerp(a.keyI, b.keyI, r);
  renderer.toneMappingExposure = lerp(a.exposure, b.exposure, r);
  (scene.background as THREE.Color).copy(a.bg).lerp(b.bg, r);
  if (scene.fog instanceof THREE.FogExp2) {
    scene.fog.color.copy(a.fog).lerp(b.fog, r);
    scene.fog.density = lerp(a.fogD, b.fogD, r);
  }
  moonMat.color.copy(a.disc).lerp(b.disc, r);
  haloMat.color.copy(a.halo).lerp(b.halo, r);
  (skyline.material as THREE.MeshBasicMaterial).color.copy(a.skyline).lerp(b.skyline, r);
  sunsetDomeMat.uniforms.uRain.value = r;
  starsMat.opacity = 1 - r * 0.92;
  stars.visible = !sunsetMode && starsMat.opacity > 0.05;
}

let sunsetMode = false;
/** Switch between night moonlight (ASCII mode) and warm mid-afternoon daylight (T mode). */
export function setSunsetLighting(enabled: boolean) {
  if (sunsetMode === enabled) return;
  sunsetMode = enabled;
  moonDir.copy(enabled ? SUNSET_DIR : NIGHT_DIR);
  syncShadowAxes();
  shadowDist = enabled ? 50 : 45;
  moonLight.shadow.camera.far = enabled ? 125 : 110;
  moonLight.shadow.camera.updateProjectionMatrix();

  if (enabled) {
    keyLight.distance = 7;
    keyLight.decay = 1.8;
    scene.environment = sunsetEnv;
    moon.scale.setScalar(1.05);
    halo.scale.set(58, 58, 1);
    sunsetDome.visible = true;
  } else {
    keyLight.distance = 12;
    keyLight.decay = 1.2;
    scene.environment = nightEnv;
    moon.scale.setScalar(1);
    halo.scale.set(48, 48, 1);
    sunsetDome.visible = false;
  }
  applyAtmosphere(state.rainAmt);
  moon.position.copy(moonDir).multiplyScalar(150);
  halo.position.copy(moon.position);
  placeMoonShadow(player.pos);
}

// layout helpers
const inCompound = (x: number, z: number, m = 0) => Math.abs(x) < 12 + m && z < -15 + m && z > -31 - m;
const onPath = (x: number, z: number) => Math.abs(x) < 1.6 && z > -16 && z < 7;

// ground: black soil under the grass, left blank by the ASCII pass (only the blades turn into
// characters); bare rock on the mountains around the world
scene.add(buildTerrainMesh());

// the rest of the world: landmarks, roads, water. They register the footprints the masks are drawn from.
buildStructures();
buildSettlements();   // the town of Asagiri and the ruins of Takamori
buildCanyons();       // winding paths between walls of rock in the rocky country
buildMesas();         // plateaus with cliffs, some with a stone ramp up
buildTemples();
buildLandmarks();   // oni camps and corners of the wilds
buildDrift();       // leaves riding the river, petals on the lake
buildMasks();

function wornFlagstone(width: number, depth: number, index: number) {
  const outline = [[-0.50, -0.23], [-0.39, -0.47], [-0.11, -0.48], [0.22, -0.46], [0.44, -0.39],
    [0.49, 0.01], [0.37, 0.42], [0.10, 0.47], [-0.23, 0.45], [-0.46, 0.31]];
  const points = outline.map(([x, y], i) => new THREE.Vector2(
    width * (x + 0.055 * Math.sin(index * 2.3 + i * 3.1)),
    depth * (y + 0.10 * Math.sin(index * 1.7 + i * 1.8))
  ));
  const shape = new THREE.Shape();
  points.forEach((p, i) => {
    const start = p.clone().lerp(points[(i + points.length - 1) % points.length], 0.27);
    const end = p.clone().lerp(points[(i + 1) % points.length], 0.27);
    if (i === 0) shape.moveTo(start.x, start.y); else shape.lineTo(start.x, start.y);
    shape.quadraticCurveTo(p.x, p.y, end.x, end.y);
  });
  shape.closePath();
  const stone = new THREE.ExtrudeGeometry(shape, {
    depth: 0.04, bevelThickness: 0.02, bevelSize: 0.043, bevelSegments: 2, curveSegments: 3
  });
  return stone.rotateX(-Math.PI / 2).translate(0, -0.02, 0);
}

// stone path + gravel courtyard
{
  const slab = tagMat(surfaceMaterial(M(0x5c5e66, { roughness: 0.32, metalness: 0.15 }), 'flagstone'), CLS.ground);
  for (let z = 6.2, i = 0; z > -15.5; z -= rnd(0.85, 1.0), i++) {
    const w = rnd(1.9, 2.4), d = rnd(0.65, 0.8);
    const b = box(w, 0.08, d, slab);
    addRoundedSurface(b, wornFlagstone(w, d, i));
    b.position.set(rnd(-0.12, 0.12), 0.04, z); b.rotation.y = rnd(-0.08, 0.08); b.receiveShadow = true; scene.add(b);
  }
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), MT.gravel);
  gravel.rotation.x = -Math.PI / 2; gravel.position.set(0, 0.02, -23); gravel.receiveShadow = true; scene.add(gravel);
}

// torii + stone lanterns
{
  const { red, black: blk, stone } = MT;
  const g = new THREE.Group(); g.position.set(0, 0, -11);
  for (const sx of [-2.3, 2.3]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 10), red); p.position.set(sx, 2.2, 0); g.add(p);
    addCollider({ x: sx, z: -11, r: 0.35 });
  }
  const top = box(6.6, 0.32, 0.55, blk); top.position.y = 4.5; g.add(top);
  const top2 = box(6.0, 0.25, 0.45, red); top2.position.y = 4.22; g.add(top2);
  const nuki = box(5.4, 0.22, 0.3, red); nuki.position.y = 3.55; g.add(nuki);
  const gaku = box(0.25, 0.55, 0.2, blk); gaku.position.y = 3.9; g.add(gaku);
  scene.add(shadowTree(g)); camBlockers.push(g);
  const fire = tagMat(M(0xffb050, { emissive: 0xff9530, emissiveIntensity: 2.4 }), CLS.light);
  for (const sx of [-3.8, 3.8]) {
    const l = new THREE.Group(); l.position.set(sx, 0, -8.5);
    const b = box(0.7, 0.25, 0.7, stone); b.position.y = 0.12; l.add(b);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.9, 8), stone); post.position.y = 0.7; l.add(post);
    const fb = box(0.55, 0.45, 0.55, fire); fb.position.y = 1.38; l.add(fb);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 4), stone); roof.position.y = 1.83; roof.rotation.y = Math.PI / 4; l.add(roof);
    shadowTree(l); fb.castShadow = false;
    addLight({ x: sx, y: 1.4, z: -8.5, color: 0xff9a40, intensity: 6, distance: 14, decay: 1.4 });
    scene.add(l); addCollider({ x: sx, z: -8.5, r: 0.5 });
  }
}

// shrine with glowing shoji: hollow, with the middle doors slid open. Inside is Masa's shop (shop.ts);
// its roof hides while you are in, so the camera sees you
export const shrineRoof = new THREE.Group();
const shrineEaveRise = (x: number, z: number) =>
  0.28 * Math.pow(Math.abs(x) / 5.5, 6) + 0.33 * Math.pow(THREE.MathUtils.clamp(z / 4.7 + 0.5, 0, 1), 2.5);
function bendShrineRoof(geometry: THREE.BufferGeometry, sign: number, atEave?: number) {
  const pos = geometry.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const z = atEave ?? pos.getZ(i);
    pos.setY(i, pos.getY(i) + shrineEaveRise(pos.getX(i), sign * z));
  }
  geometry.computeVertexNormals();
  return geometry;
}
{
  const shojiTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160;
    const x = c.getContext('2d')!;
    const g = x.createRadialGradient(64, 90, 10, 64, 80, 110); g.addColorStop(0, '#ffd08a'); g.addColorStop(1, '#e07a2a');
    x.fillStyle = g; x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#2a170d';
    for (let i = 0; i <= 128; i += 32) x.fillRect(i - 3, 0, 6, 160);
    for (let j = 0; j <= 160; j += 26) x.fillRect(0, j - 2, 128, 4);
    x.fillRect(0, 0, 128, 8); x.fillRect(0, 152, 128, 8);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const { wood, woodL, siding, roof: roofM, roofL } = MT;
  const roofPanel = tagMat(surfaceMaterial(M(0x2b3246, { roughness: 0.6, metalness: 0.25 }), 'sweptTiles'), CLS.wood);
  const boards = tagMat(surfaceMaterial(M(0x3e2b22, { roughness: 0.9 }), 'boards'), CLS.wood);
  const stoneB = tagMat(surfaceMaterial(M(0x5d6068, { roughness: 1 }), 'stone'), CLS.ground);
  const stoneBase = tagMat(surfaceMaterial(M(0x5d6068, { roughness: 1 }), 'masonry'), CLS.ground);
  const shoji = tagMat(surfaceMaterial(new THREE.MeshStandardMaterial({
    map: shojiTex, emissiveMap: shojiTex, emissive: 0xffffff, emissiveIntensity: 1.5, color: 0x333333, side: THREE.DoubleSide
  }), 'paper'), CLS.light);
  const chochin = tagMat(M(0xff6a2a, { emissive: 0xff5a1a, emissiveIntensity: 2.2 }), CLS.light);
  const g = new THREE.Group(); g.position.set(0, 0, -24);
  g.add(shrineRoof);
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, y: number, z: number, p: THREE.Object3D = g) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); p.add(o); return o; };
  const foundation = add(new THREE.BoxGeometry(10, 0.7, 7), stoneBase, 0, 0.35, 0);
  addRoundedSurface(foundation, new RoundedBoxGeometry(10, 0.7, 7, 1, 0.07));
  add(new THREE.BoxGeometry(9.4, 0.15, 6.4), boards, 0, 0.78, 0);
  // walls (back, sides), a ceiling that goes with the roof; the two middle shoji slid aside make the door
  add(new THREE.BoxGeometry(7.9, 2.6, 0.15), siding, 0, 2.15, -2.53);
  for (const x of [-3.88, 3.88]) add(new THREE.BoxGeometry(0.15, 2.6, 5), siding, x, 2.15, -0.1);
  add(new THREE.BoxGeometry(7.9, 0.1, 5), wood, 0, 3.42, -0.1, shrineRoof);
  for (const x of [-3, 3]) add(new THREE.PlaneGeometry(1.85, 2.2), shoji, x, 2.0, 2.42);
  for (const x of [-2.75, 2.75]) add(new THREE.PlaneGeometry(1.85, 2.2), shoji, x, 2.0, 2.36);
  for (const x of [-4, -2, 2, 4]) add(new THREE.CylinderGeometry(0.14, 0.15, 2.9, 8), woodL, x, 2.2, 2.55);
  for (const z of [-2.6, 2.55]) for (const x of [-4, 4]) add(new THREE.CylinderGeometry(0.14, 0.15, 2.9, 8), woodL, x, 2.2, z);
  add(new THREE.BoxGeometry(8.3, 0.35, 0.2), woodL, 0, 3.35, 2.55);
  add(new THREE.BoxGeometry(8.3, 0.12, 0.18), woodL, 0, 0.95, 2.55);
  add(new THREE.BoxGeometry(9.6, 0.12, 1.3), boards, 0, 0.86, 3.3);
  const wornStep = new RoundedBoxGeometry(2.6, 0.24, 0.45, 1, 0.043);
  for (let i = 0; i < 3; i++) {
    const step = add(new THREE.BoxGeometry(2.6, 0.24, 0.45), stoneB, 0, 0.12 + i * 0.24, 4.55 - i * 0.4);
    addRoundedSurface(step, wornStep);
  }
  const eaveTile = new THREE.SphereGeometry(0.117, 10, 6).scale(1, 0.74, 0.68);
  const endTileTransform = new THREE.Matrix4();
  for (const sgn of [1, -1]) {
    const panel = add(new THREE.BoxGeometry(11, 0.22, 4.7), roofPanel, 0, 4.15, 2.06 * sgn, shrineRoof); panel.rotation.x = 0.5 * sgn;
    addRoundedSurface(panel, bendShrineRoof(new THREE.BoxGeometry(11, 0.22, 4.7, 24, 1, 10), sgn));
    for (let k = -5; k <= 5; k++) {
      const rib = add(new THREE.BoxGeometry(0.08, 0.06, 4.7), roofL, k, 4.31, 2.06 * sgn, shrineRoof);
      rib.rotation.x = 0.5 * sgn;
      showSurfaceDetail(rib, false);
    }
    showSurfaceDetail(add(new THREE.BoxGeometry(11.2, 0.14, 0.22), roofL, 0, 3.05, 4.1 * sgn, shrineRoof), false);
    const fascia = bendShrineRoof(new THREE.BoxGeometry(11.14, 0.13, 0.16, 24), sgn, 2.34 * sgn);
    showSurfaceDetail(add(fascia, woodL, 0, -0.117, sgn * 2.30, panel));
    const endTiles = new THREE.InstancedMesh(eaveTile, roofL, 26);
    for (let i = 0; i < endTiles.count; i++) {
      const x = (i - (endTiles.count - 1) / 2) * 0.42;
      endTiles.setMatrixAt(i, endTileTransform.makeTranslation(x, 0.115 + shrineEaveRise(x, 2.35), sgn * 2.34));
    }
    panel.add(endTiles);
    showSurfaceDetail(endTiles);
    const lan = add(new THREE.SphereGeometry(0.32, 14, 10), chochin, 2.6 * sgn, 2.95, 3.55); lan.scale.y = 1.35;
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), wood, 2.6 * sgn, 3.42, 3.55);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), wood, 2.6 * sgn, 2.5, 3.55);
  }
  add(new THREE.BoxGeometry(11.4, 0.38, 0.45), roofM, 0, 5.25, 0, shrineRoof);
  for (const x of [-5.3, 5.3]) for (const r of [0.6, -0.6]) { const c = add(new THREE.BoxGeometry(0.1, 1.1, 0.1), roofM, x, 5.6, 0, shrineRoof); c.rotation.z = r; }
  shadowTree(g);
  g.traverse(o => { if ((o as THREE.Mesh).material === shoji || (o as THREE.Mesh).material === chochin) o.castShadow = false; });
  addLight({ x: 0, y: 2.2, z: -19, color: 0xffa050, intensity: 9, distance: 16, decay: 1.3 });
  scene.add(g); camBlockers.push(g);
  // you go in by the steps: edges of the platform, the walls, the door posts
  const seg = (x0: number, z0: number, x1: number, z1: number, r = 0.1) => addCollider({ seg: [x0, z0, x1, z1], r });
  seg(-5, -27.5, 5, -27.5); seg(-5, -27.5, -5, -20.05); seg(5, -27.5, 5, -20.05);
  seg(-5, -20.05, -1.4, -20.05); seg(1.4, -20.05, 5, -20.05); seg(-1.4, -20.05, -1.4, -19.2); seg(1.4, -20.05, 1.4, -19.2);
  seg(-3.95, -26.6, 3.95, -26.6); seg(-3.95, -26.6, -3.95, -21.6); seg(3.95, -26.6, 3.95, -21.6);
  seg(-3.95, -21.6, -1.85, -21.6); seg(1.85, -21.6, 3.95, -21.6);
  for (const x of [-4, -2, 2, 4]) addCollider({ x, z: -21.45, r: 0.18 });
  // the boards you walk on, and the stone steps up to them
  floors.push((x, z) => {
    if (Math.abs(x) < 5 && z > -27.5 && z < -20.05) return 0.88;
    if (Math.abs(x) < 1.4 && z >= -20.05 && z < -19.2) return 0.88 * (-19.2 - z) / 0.85;
    return null;
  });
}

// wooden fence around the shrine compound, golden caps on every few posts
{
  const fenceM = tagMat(surfaceMaterial(M(0x4a4774, { roughness: 0.8 }), 'wood'), CLS.wood);
  const capM = tagMat(M(0xffd060, { emissive: 0xffb030, emissiveIntensity: 1.6 }), CLS.light);
  const g = new THREE.Group();
  const run = (x0: number, z0: number, x1: number, z1: number) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.1), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const post = box(0.13, 1.15, 0.13, fenceM); post.position.set(x, 0.575, z); g.add(post);
      if (i % 3 === 0) { const c = box(0.2, 0.16, 0.2, capM); c.position.set(x, 1.23, z); g.add(c); }
    }
    for (const y of [0.45, 0.95]) {
      const rail = box(0.07, 0.09, len, fenceM); rail.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); rail.rotation.y = ang; g.add(rail);
    }
    addCollider({ rect: [Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1] });
  };
  run(-12, -15.2, -2.2, -15.2); run(2.2, -15.2, 12, -15.2);
  run(-12, -15.2, -12, -31); run(12, -15.2, 12, -31); run(-12, -31, 12, -31);
  shadowTree(g); g.traverse(o => { if ((o as THREE.Mesh).material === capM) o.castShadow = false; });
  scene.add(g);
}

// trees, grass, bushes, flowers, pond, fireflies (nature.js)
export const updateNature = buildNature(scene, { addCollider: c => addCollider(c), isFree, camBlockers, inCompound, onPath });
// the forest around the clearing, grown before the first frame
updateChunks(player.pos.x, player.pos.z, 99);

/** per frame: stream forest chunks, hide far landmarks, hand the lantern lights to the nearest lanterns */
export function updateWorld() {
  updateChunks(player.pos.x, player.pos.z, 1);
  updateStructures(player.pos.x, player.pos.z);
  updateLights(player.pos.x, player.pos.z, state.time);
}
/** what the camera may have to pull in front of, around the player */
const near: THREE.Object3D[] = [];
export function nearBlockers(x: number, z: number) {
  near.length = 0;
  if (Math.hypot(x, z) < 90) near.push(...camBlockers);
  for (const b of blockers) if (b.o.visible && Math.hypot(b.x - x, b.z - z) < b.r + 30) near.push(b.o);
  chunkBlockers(x, z, near);
  return near;
}

// falling petals
const PETALS = 700;
const petalPos = new Float32Array(PETALS * 3), petalSeed = new Float32Array(PETALS);
for (let i = 0; i < PETALS; i++) { petalPos.set([rnd(-22, 22), rnd(0, 12), rnd(-22, 22)], i * 3); petalSeed[i] = Math.random() * 10; }
const petalGeo = new THREE.BufferGeometry(); petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
const petals = new THREE.Points(petalGeo, tagMat(new THREE.PointsMaterial({ color: 0xffc2d8, size: 0.13 }), CLS.foliage));
petals.frustumCulled = false; scene.add(petals);

tagTree(scene, CLS.ground); // anything left untagged

// rain: streaks that follow the player. Brief showers come and go at random on their own.
const RAIN = 2600;
const rainPos = new Float32Array(RAIN * 6), rainSpd = new Float32Array(RAIN);
for (let i = 0; i < RAIN; i++) {
  const x = rnd(-22, 22), y = rnd(0, 16), z = rnd(-22, 22);
  rainPos.set([x, y, z, x - 0.05, y + 0.55, z], i * 6); rainSpd[i] = rnd(16, 22);
}
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, tagMat(new THREE.LineBasicMaterial({ color: 0x9fb2d8, transparent: true, opacity: 0.55, depthWrite: false }), CLS.fx));
rain.frustumCulled = false; scene.add(rain);
const SHOWER = [15, 35], DRY = [180, 420], FADE = 6; // seconds: brief shower, random dry spell, easing in / out
let rainSent = -1;
function toggleWeather() { // the cycle's own change: eases in / out instead of snapping
  state.raining = !state.raining;
  state.rainT = state.raining ? rnd(SHOWER[0], SHOWER[1]) : rnd(DRY[0], DRY[1]);
}
export function updateRain(dt: number) {
  state.rainT -= dt;
  if (state.rainT <= 0) toggleWeather();
  const target = state.raining ? 1 : 0, step = dt / FADE;
  state.rainAmt = state.rainAmt < target ? Math.min(target, state.rainAmt + step) : Math.max(target, state.rainAmt - step);
  if (Math.abs(state.rainAmt - atmosRain) > 1e-4) applyAtmosphere(state.rainAmt);
  if (Math.abs(state.rainAmt - rainSent) > 0.01 || (state.rainAmt === target && rainSent !== target)) { rainSent = state.rainAmt; sfx.setRain(rainSent); }
  updateWaterWeather(dt, state.rainAmt);   // raindrops on the water, puddles on the roads
  updateDrift(dt);
  // fewer streaks in a drizzle: only the first `count` are drawn and moved
  const count = Math.round(RAIN * state.rainAmt);
  rain.visible = count > 0; if (!count) return;
  rainGeo.setDrawRange(0, count * 2);
  for (let i = 0; i < count; i++) {
    const j = i * 6; let y = rainPos[j + 1] - rainSpd[i] * dt;
    let x = rainPos[j] - 0.9 * dt, z = rainPos[j + 2];
    if (y < player.pos.y - 4 || Math.abs(x - player.pos.x) > 22 || Math.abs(z - player.pos.z) > 22) { x = player.pos.x + rnd(-22, 22); z = player.pos.z + rnd(-22, 22); y = player.pos.y + rnd(10, 16); }
    rainPos[j] = x; rainPos[j + 1] = y; rainPos[j + 2] = z; rainPos[j + 3] = x + 0.05; rainPos[j + 4] = y + 0.55; rainPos[j + 5] = z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// petals follow the player area
export function updatePetals(dt: number) {
  for (let i = 0; i < PETALS; i++) {
    const j = i * 3, s = petalSeed[i];
    petalPos[j] += (Math.sin(state.time * 0.9 + s) * 0.6 + 0.5) * dt;
    petalPos[j + 1] -= (0.5 + (s % 1) * 0.6) * dt;
    petalPos[j + 2] += Math.cos(state.time * 0.7 + s * 2) * 0.4 * dt;
    if (petalPos[j + 1] < player.pos.y - 3 || Math.abs(petalPos[j] - player.pos.x) > 24 || Math.abs(petalPos[j + 2] - player.pos.z) > 24) {
      petalPos[j] = player.pos.x + rnd(-22, 22); petalPos[j + 1] = player.pos.y + rnd(6, 12); petalPos[j + 2] = player.pos.z + rnd(-22, 22);
    }
  }
  petalGeo.attributes.position.needsUpdate = true;
}
