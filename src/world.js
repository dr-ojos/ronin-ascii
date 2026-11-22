// The clearing: lights, moon and stars, stone path, torii, shrine, fence, nature, petals and rain.
import * as THREE from 'three';
import { renderer, scene } from './renderer.js';
import { M, CLS, tagMat, tagTree, shadowTree, box } from './materials.js';
import { buildNature } from './nature.js';
import { player, state } from './state.js';
import { rnd } from './utils.js';

export const colliders = [];
export const camBlockers = [];
export const WORLD_R = 42;

// sky fill: brighter blue from above, warm bounce from the ground so shadows aren't pitch black
scene.add(new THREE.HemisphereLight(0x8a9ad8, 0x2a1f14, 1.05));
export const moonDir = new THREE.Vector3(-0.55, 0.7, -0.45).normalize();
const moonLight = new THREE.DirectionalLight(0xd2dcff, 5.0);
export const rimLight = new THREE.DirectionalLight(0x9fc0ff, 3.0);
scene.add(rimLight, rimLight.target);
moonLight.position.copy(moonDir).multiplyScalar(50);
moonLight.castShadow = true;
// tighter frustum around the player = sharper shadows with the same 4096 map
const SHADOW_HALF = 24, SHADOW_MAP = 4096, SHADOW_TEXEL = (SHADOW_HALF * 2) / SHADOW_MAP;
moonLight.shadow.mapSize.set(SHADOW_MAP, SHADOW_MAP);
Object.assign(moonLight.shadow.camera, { left: -SHADOW_HALF, right: SHADOW_HALF, top: SHADOW_HALF, bottom: -SHADOW_HALF, near: 1, far: 110 });
moonLight.shadow.bias = -0.0003; moonLight.shadow.normalBias = 0.025;
scene.add(moonLight, moonLight.target);
// light-space axes: the shadow camera is snapped to whole texels so shadows don't shimmer while walking
const shLX = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), moonDir).normalize();
const shLY = new THREE.Vector3().crossVectors(moonDir, shLX).normalize();
const shSnap = new THREE.Vector3();
export function placeMoonShadow(p) {
  const a = Math.round(p.dot(shLX) / SHADOW_TEXEL) * SHADOW_TEXEL;
  const b = Math.round(p.dot(shLY) / SHADOW_TEXEL) * SHADOW_TEXEL;
  shSnap.set(0, 0, 0).addScaledVector(shLX, a).addScaledVector(shLY, b).addScaledVector(moonDir, p.dot(moonDir));
  moonLight.target.position.copy(shSnap);
  moonLight.position.copy(shSnap).addScaledVector(moonDir, 45);
}
{ // night environment map so lacquer, gold and steel get real reflections
  const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
  es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: `varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
    fragmentShader: `varying vec3 vP; void main(){ float h = normalize(vP).y; gl_FragColor = vec4(mix(vec3(0.01,0.012,0.012), vec3(0.09,0.12,0.24), smoothstep(-0.15,0.6,h)), 1.); }`
  })));
  const md = new THREE.Mesh(new THREE.SphereGeometry(1.1, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(7, 7, 6.4) }));
  md.position.copy(moonDir).multiplyScalar(8); es.add(md);
  const lw = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.4, 0.4) }));
  lw.position.set(4, 0.8, -6); es.add(lw);
  scene.environment = pm.fromScene(es, 0.03).texture;
}
export const keyLight = new THREE.PointLight(0xdde6ff, 7, 12, 1.2);
scene.add(keyLight);

// moon + halo + stars
const moon = new THREE.Mesh(new THREE.SphereGeometry(7, 24, 16), new THREE.MeshBasicMaterial({ color: 0xf4efdc, fog: false }));
moon.position.copy(moonDir).multiplyScalar(150);
tagMat(moon.material, CLS.light);
scene.add(moon);
{
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d'); const g = x.createRadialGradient(64, 64, 10, 64, 64, 64);
  g.addColorStop(0, 'rgba(200,215,255,0.55)'); g.addColorStop(1, 'rgba(200,215,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), fog: false, depthWrite: false, blending: THREE.AdditiveBlending }));
  tagMat(halo.material, CLS.sky); halo.scale.set(48, 48, 1); halo.position.copy(moon.position); scene.add(halo);
  const n = 900, p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.acos(rnd(0.08, 1));
    p.set([Math.sin(ph) * Math.cos(th) * 200, Math.cos(ph) * 200, Math.sin(ph) * Math.sin(th) * 200], i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(sg, tagMat(new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, fog: false }), CLS.sky)));
}

// layout helpers
const inCompound = (x, z, m = 0) => Math.abs(x) < 12 + m && z < -15 + m && z > -31 - m;
const onPath = (x, z) => Math.abs(x) < 1.6 && z > -16 && z < 7;

// ground
// pure black soil under the grass: unlit, no fog, and tagged as "sky" so the ASCII pass leaves it blank
// (only the blades themselves turn into characters)
const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 48), tagMat(new THREE.MeshBasicMaterial({ color: 0x000000, fog: false }), CLS.sky));
ground.rotation.x = -Math.PI / 2; scene.add(ground);

// stone path + gravel courtyard
{
  const slab = tagMat(M(0x5c5e66, { roughness: 0.32, metalness: 0.15 }), CLS.ground);
  for (let z = 6.2; z > -15.5; z -= rnd(0.85, 1.0)) {
    const b = box(rnd(1.9, 2.4), 0.08, rnd(0.65, 0.8), slab);
    b.position.set(rnd(-0.12, 0.12), 0.04, z); b.rotation.y = rnd(-0.08, 0.08); b.receiveShadow = true; scene.add(b);
  }
  const gravel = new THREE.Mesh(new THREE.PlaneGeometry(24, 16), tagMat(M(0x33374a, { roughness: 0.4, metalness: 0.1 }), CLS.ground));
  gravel.rotation.x = -Math.PI / 2; gravel.position.set(0, 0.02, -23); gravel.receiveShadow = true; scene.add(gravel);
}

// torii + stone lanterns
{
  const red = tagMat(M(0xb3261e, { roughness: 0.6 }), CLS.wood), blk = tagMat(M(0x16141a), CLS.wood);
  const g = new THREE.Group(); g.position.set(0, 0, -11);
  for (const sx of [-2.3, 2.3]) {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 4.4, 10), red); p.position.set(sx, 2.2, 0); g.add(p);
    colliders.push({ x: sx, z: -11, r: 0.35 });
  }
  const top = box(6.6, 0.32, 0.55, blk); top.position.y = 4.5; g.add(top);
  const top2 = box(6.0, 0.25, 0.45, red); top2.position.y = 4.22; g.add(top2);
  const nuki = box(5.4, 0.22, 0.3, red); nuki.position.y = 3.55; g.add(nuki);
  const gaku = box(0.25, 0.55, 0.2, blk); gaku.position.y = 3.9; g.add(gaku);
  scene.add(shadowTree(g)); camBlockers.push(g);
  const stone = tagMat(M(0x6e6f75, { roughness: 1 }), CLS.ground);
  const fire = tagMat(M(0xffb050, { emissive: 0xff9530, emissiveIntensity: 2.4 }), CLS.light);
  for (const sx of [-3.8, 3.8]) {
    const l = new THREE.Group(); l.position.set(sx, 0, -8.5);
    const b = box(0.7, 0.25, 0.7, stone); b.position.y = 0.12; l.add(b);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.9, 8), stone); post.position.y = 0.7; l.add(post);
    const fb = box(0.55, 0.45, 0.55, fire); fb.position.y = 1.38; l.add(fb);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(0.62, 0.45, 4), stone); roof.position.y = 1.83; roof.rotation.y = Math.PI / 4; l.add(roof);
    shadowTree(l); fb.castShadow = false;
    const pl = new THREE.PointLight(0xff9a40, 6, 14, 1.4); pl.position.y = 1.4; l.add(pl);
    scene.add(l); colliders.push({ x: sx, z: -8.5, r: 0.5 });
  }
}

// shrine with glowing shoji
{
  const shojiTex = (() => {
    const c = document.createElement('canvas'); c.width = 128; c.height = 160;
    const x = c.getContext('2d');
    const g = x.createRadialGradient(64, 90, 10, 64, 80, 110); g.addColorStop(0, '#ffd08a'); g.addColorStop(1, '#e07a2a');
    x.fillStyle = g; x.fillRect(0, 0, 128, 160);
    x.fillStyle = '#2a170d';
    for (let i = 0; i <= 128; i += 32) x.fillRect(i - 3, 0, 6, 160);
    for (let j = 0; j <= 160; j += 26) x.fillRect(0, j - 2, 128, 4);
    x.fillRect(0, 0, 128, 8); x.fillRect(0, 152, 128, 8);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const wood = tagMat(M(0x3e2b22, { roughness: 0.9 }), CLS.wood), woodL = tagMat(M(0x6a4630, { roughness: 0.8 }), CLS.wood);
  const roofM = tagMat(M(0x2b3246, { roughness: 0.6, metalness: 0.25 }), CLS.wood), roofL = tagMat(M(0x5a6478, { roughness: 0.6, metalness: 0.3 }), CLS.wood);
  const stoneB = tagMat(M(0x5d6068, { roughness: 1 }), CLS.ground);
  const shoji = tagMat(new THREE.MeshStandardMaterial({ map: shojiTex, emissiveMap: shojiTex, emissive: 0xffffff, emissiveIntensity: 1.5, color: 0x333333 }), CLS.light);
  const chochin = tagMat(M(0xff6a2a, { emissive: 0xff5a1a, emissiveIntensity: 2.2 }), CLS.light);
  const g = new THREE.Group(); g.position.set(0, 0, -24);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  add(new THREE.BoxGeometry(10, 0.7, 7), stoneB, 0, 0.35, 0);
  add(new THREE.BoxGeometry(9.4, 0.15, 6.4), wood, 0, 0.78, 0);
  add(new THREE.BoxGeometry(7.9, 2.6, 5), wood, 0, 2.15, -0.1);
  for (const x of [-3, -1, 1, 3]) add(new THREE.PlaneGeometry(1.85, 2.2), shoji, x, 2.0, 2.42);
  for (const x of [-4, -2, 0, 2, 4]) add(new THREE.CylinderGeometry(0.14, 0.15, 2.9, 8), woodL, x, 2.2, 2.55);
  for (const z of [-2.6, 2.55]) for (const x of [-4, 4]) add(new THREE.CylinderGeometry(0.14, 0.15, 2.9, 8), woodL, x, 2.2, z);
  add(new THREE.BoxGeometry(8.3, 0.35, 0.2), woodL, 0, 3.35, 2.55);
  add(new THREE.BoxGeometry(8.3, 0.12, 0.18), woodL, 0, 0.95, 2.55);
  add(new THREE.BoxGeometry(9.6, 0.12, 1.3), wood, 0, 0.86, 3.3);
  for (let i = 0; i < 3; i++) add(new THREE.BoxGeometry(2.6, 0.24, 0.45), stoneB, 0, 0.12 + i * 0.24, 4.55 - i * 0.4);
  for (const sgn of [1, -1]) {
    const panel = add(new THREE.BoxGeometry(11, 0.22, 4.7), roofM, 0, 4.15, 2.06 * sgn); panel.rotation.x = 0.5 * sgn;
    for (let k = -5; k <= 5; k++) { const rib = add(new THREE.BoxGeometry(0.08, 0.06, 4.7), roofL, k, 4.29, 2.06 * sgn); rib.rotation.x = 0.5 * sgn; rib.position.y += 0.02; }
    add(new THREE.BoxGeometry(11.2, 0.14, 0.22), roofL, 0, 3.05, 4.1 * sgn);
    const lan = add(new THREE.SphereGeometry(0.32, 14, 10), chochin, 2.6 * sgn, 2.95, 3.55); lan.scale.y = 1.35;
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), wood, 2.6 * sgn, 3.42, 3.55);
    add(new THREE.CylinderGeometry(0.2, 0.2, 0.08, 10), wood, 2.6 * sgn, 2.5, 3.55);
  }
  add(new THREE.BoxGeometry(11.4, 0.38, 0.45), roofM, 0, 5.25, 0);
  for (const x of [-5.3, 5.3]) for (const r of [0.6, -0.6]) { const c = add(new THREE.BoxGeometry(0.1, 1.1, 0.1), roofM, x, 5.6, 0); c.rotation.z = r; }
  shadowTree(g);
  g.traverse(o => { if (o.material === shoji || o.material === chochin) o.castShadow = false; });
  const pl = new THREE.PointLight(0xffa050, 9, 16, 1.3); pl.position.set(0, 2.2, 5); g.add(pl);
  scene.add(g); camBlockers.push(g);
  colliders.push({ rect: [-5, 5, -27.5, -19.4] });
}

// wooden fence around the shrine compound, golden caps on every few posts
{
  const fenceM = tagMat(M(0x4a4774, { roughness: 0.8 }), CLS.wood);
  const capM = tagMat(M(0xffd060, { emissive: 0xffb030, emissiveIntensity: 1.6 }), CLS.light);
  const g = new THREE.Group();
  const run = (x0, z0, x1, z1) => {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.round(len / 1.1), ang = Math.atan2(x1 - x0, z1 - z0);
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t;
      const post = box(0.13, 1.15, 0.13, fenceM); post.position.set(x, 0.575, z); g.add(post);
      if (i % 3 === 0) { const c = box(0.2, 0.16, 0.2, capM); c.position.set(x, 1.23, z); g.add(c); }
    }
    for (const y of [0.45, 0.95]) {
      const rail = box(0.07, 0.09, len, fenceM); rail.position.set((x0 + x1) / 2, y, (z0 + z1) / 2); rail.rotation.y = ang; g.add(rail);
    }
    colliders.push({ rect: [Math.min(x0, x1) - 0.1, Math.max(x0, x1) + 0.1, Math.min(z0, z1) - 0.1, Math.max(z0, z1) + 0.1] });
  };
  run(-12, -15.2, -2.2, -15.2); run(2.2, -15.2, 12, -15.2);
  run(-12, -15.2, -12, -31); run(12, -15.2, 12, -31); run(-12, -31, 12, -31);
  shadowTree(g); g.traverse(o => { if (o.material === capM) o.castShadow = false; });
  scene.add(g);
}

// trees, grass, bushes, flowers, pond, fireflies (nature.js)
export const updateNature = buildNature(scene, { tagMat, CLS, colliders, camBlockers, inCompound, onPath });

// falling petals
const PETALS = 700;
const petalPos = new Float32Array(PETALS * 3), petalSeed = new Float32Array(PETALS);
for (let i = 0; i < PETALS; i++) { petalPos.set([rnd(-22, 22), rnd(0, 12), rnd(-22, 22)], i * 3); petalSeed[i] = Math.random() * 10; }
const petalGeo = new THREE.BufferGeometry(); petalGeo.setAttribute('position', new THREE.BufferAttribute(petalPos, 3));
const petals = new THREE.Points(petalGeo, tagMat(new THREE.PointsMaterial({ color: 0xffc2d8, size: 0.13 }), CLS.foliage));
petals.frustumCulled = false; scene.add(petals);

tagTree(scene, CLS.ground); // anything left untagged

// rain: streaks that follow the player (toggle with R)
const RAIN = 2600;
const rainPos = new Float32Array(RAIN * 6), rainSpd = new Float32Array(RAIN);
for (let i = 0; i < RAIN; i++) {
  const x = rnd(-22, 22), y = rnd(0, 16), z = rnd(-22, 22);
  rainPos.set([x, y, z, x - 0.05, y + 0.55, z], i * 6); rainSpd[i] = rnd(16, 22);
}
const rainGeo = new THREE.BufferGeometry(); rainGeo.setAttribute('position', new THREE.BufferAttribute(rainPos, 3));
const rain = new THREE.LineSegments(rainGeo, tagMat(new THREE.LineBasicMaterial({ color: 0x9fb2d8, transparent: true, opacity: 0.55, depthWrite: false }), CLS.fx));
rain.frustumCulled = false; scene.add(rain);
export function updateRain(dt) {
  rain.visible = state.raining; if (!state.raining) return;
  for (let i = 0; i < RAIN; i++) {
    const j = i * 6; let y = rainPos[j + 1] - rainSpd[i] * dt;
    let x = rainPos[j] - 0.9 * dt, z = rainPos[j + 2];
    if (y < 0 || Math.abs(x - player.pos.x) > 22 || Math.abs(z - player.pos.z) > 22) { x = player.pos.x + rnd(-22, 22); z = player.pos.z + rnd(-22, 22); y = rnd(10, 16); }
    rainPos[j] = x; rainPos[j + 1] = y; rainPos[j + 2] = z; rainPos[j + 3] = x + 0.05; rainPos[j + 4] = y + 0.55; rainPos[j + 5] = z;
  }
  rainGeo.attributes.position.needsUpdate = true;
}

// petals follow the player area
export function updatePetals(dt) {
  for (let i = 0; i < PETALS; i++) {
    const j = i * 3, s = petalSeed[i];
    petalPos[j] += (Math.sin(state.time * 0.9 + s) * 0.6 + 0.5) * dt;
    petalPos[j + 1] -= (0.5 + (s % 1) * 0.6) * dt;
    petalPos[j + 2] += Math.cos(state.time * 0.7 + s * 2) * 0.4 * dt;
    if (petalPos[j + 1] < 0 || Math.abs(petalPos[j] - player.pos.x) > 24 || Math.abs(petalPos[j + 2] - player.pos.z) > 24) {
      petalPos[j] = player.pos.x + rnd(-22, 22); petalPos[j + 1] = rnd(6, 12); petalPos[j + 2] = player.pos.z + rnd(-22, 22);
    }
  }
  petalGeo.attributes.position.needsUpdate = true;
}
