// Katana effects: blade light, sparks shed by the edge, and the vapour trail of each cut.
import * as THREE from 'three';
import { scene } from './renderer';
import { CLS } from './materials';
import { sam, bladeMat } from './avatar';
import { tipZ, weapon } from './weapons';
import { tagMat } from './materials';
import { player, state } from './state';
import { rnd } from './utils';

// soft personal glow + a cold light that rides on the blade
const samGlow = new THREE.PointLight(0xffe6c0, 0.8, 3.6, 2);
const bladeLight = new THREE.PointLight(0xa6dcff, 3, 6, 1.6);
scene.add(samGlow, bladeLight);

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
const C1 = new THREE.Color(), C2 = new THREE.Color(), CG = new THREE.Color();
let fxId = '';
/** the blade's colours changed (another weapon in hand) */
function setWeaponFx() {
  const w = weapon(); fxId = w.id;
  CG.set(w.fx.glow); C1.set(w.fx.hot); C2.set(w.fx.cool);
  haloMat.color.copy(CG); haloCore.color.copy(CG).lerp(new THREE.Color(0xffffff), 0.35); bladeLight.color.copy(CG);
  const len = tipZ() - 0.17, r = 0.035 * w.fx.halo;
  const outer = halo.getObjectByName('outer')!, inner = halo.getObjectByName('inner')!;
  outer.scale.set(r, r * 0.55, len / 2); inner.scale.set(r * 0.35, r * 0.2, len / 2);
  halo.position.set(0, 0.004, 0.17 + len / 2);
}

const SPARKS = 900;
const spPos = new Float32Array(SPARKS * 3), spCol = new Float32Array(SPARKS * 3), spVel = new Float32Array(SPARKS * 3);
const spLife = new Float32Array(SPARKS), spMax = new Float32Array(SPARKS).fill(1);
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
      { vec2 pc = gl_PointCoord - 0.5; if (dot(pc, pc) > 0.25 || diffuseColor.r + diffuseColor.g < 0.12) discard; }`)
    .replace(/}\s*$/, `  gl_FragColor.a = ${CLS.light.toFixed(2)};\n}`);
};
const sparkPts = new THREE.Points(spGeo, sparkMat);
sparkPts.frustumCulled = false; scene.add(sparkPts);
let spNext = 0, sparkAcc = 0, bladeHeat = 0, swingS = 0;
const bladeBase = new THREE.Vector3(), bladeTip = new THREE.Vector3(), prevTip = new THREE.Vector3(), tipVel = new THREE.Vector3(), spTmp = new THREE.Vector3();
const prevBase = new THREE.Vector3();

// ---------------------------------------------------------------- katana trail
// a ribbon of light that follows the edge while it moves, then breaks into grains and drifts off like vapour
const TRAIL_N = 48, TRAIL_LIFE = 0.34;
let trailK = 1;
const trail: { b: THREE.Vector3; t: THREE.Vector3; age: number; k: number }[] = [];   // newest first: { b, t, age, k }
const trPos = new Float32Array(TRAIL_N * 6), trCol = new Float32Array(TRAIL_N * 6);
const trGeo = new THREE.BufferGeometry();
trGeo.setAttribute('position', new THREE.BufferAttribute(trPos, 3));
trGeo.setAttribute('color', new THREE.BufferAttribute(trCol, 3));
{ const idx = []; for (let i = 0; i < TRAIL_N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } trGeo.setIndex(idx); }
trGeo.setDrawRange(0, 0);
const trailU = { uT: { value: 0 } };
const trailMat = new THREE.MeshBasicMaterial({
  vertexColors: true, side: THREE.DoubleSide, transparent: true, depthWrite: false, fog: false,
  blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
  blendSrc: THREE.OneFactor, blendDst: THREE.OneFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.ZeroFactor
});
trailMat.userData.cls = CLS.sky;   // drawn with the sky ramp ( . ' ` * + ): a dotted, vaporous haze
trailMat.onBeforeCompile = sh => {
  sh.uniforms.uT = trailU.uT;
  sh.fragmentShader = 'uniform float uT;\n' + sh.fragmentShader
    .replace('#include <color_fragment>', `#include <color_fragment>
      { // vapour: the fainter the ribbon, the more it breaks into twinkling grains
        float f = max(max(diffuseColor.r, diffuseColor.g), diffuseColor.b);
        vec2 g = floor(gl_FragCoord.xy / 3.0);
        float h = fract(sin(dot(g + floor(uT * 24.0) * vec2(7.13, 3.71), vec2(12.9898, 78.233))) * 43758.5453);
        if (f < 0.02 || h > f * 4.0) discard;
        diffuseColor.rgb *= 0.55 + 0.9 * h; }`)
    .replace(/}\s*$/, `  gl_FragColor.a = ${CLS.sky.toFixed(2)};\n}`);
};
const trailMesh = new THREE.Mesh(trGeo, trailMat);
trailMesh.frustumCulled = false; scene.add(trailMesh);
function pushTrail(b: THREE.Vector3, t: THREE.Vector3, age: number, k: number) {
  trail.unshift({ b: b.clone(), t: t.clone(), age, k });
  if (trail.length > TRAIL_N) trail.pop();
}
function updateTrail(dt: number, emit: boolean) {
  trailU.uT.value += dt;
  for (const s of trail) s.age += dt;
  while (trail.length && trail[trail.length - 1].age > TRAIL_LIFE) trail.pop();
  if (emit && swingS > 0.16) {
    // sub-steps between last frame's blade and this one, so fast cuts draw a smooth arc
    const steps = trail.length ? Math.min(5, Math.max(1, Math.ceil(prevTip.distanceTo(bladeTip) / 0.1))) : 1;
    for (let k = 1; k <= steps; k++) {
      const f = k / steps;
      pushTrail(spTmp.lerpVectors(prevBase, bladeBase, f), new THREE.Vector3().lerpVectors(prevTip, bladeTip, f), dt * (1 - f), swingS);
    }
  }
  const n = trail.length;
  for (let i = 0; i < n; i++) {
    const s = trail[i], j = i * 6, a = s.age / TRAIL_LIFE;
    // drift: rises, spreads away from the hilt and wobbles as it dissipates
    const rise = s.age * 0.9, spread = s.age * 0.7, wob = Math.sin(s.age * 18 + i * 0.7) * s.age * 0.25;
    const dx = s.t.x - s.b.x, dz = s.t.z - s.b.z;
    trPos[j] = s.b.x + wob; trPos[j + 1] = s.b.y + rise * 0.5; trPos[j + 2] = s.b.z - wob;
    trPos[j + 3] = s.t.x + dx * spread + wob; trPos[j + 4] = s.t.y + rise; trPos[j + 5] = s.t.z + dz * spread - wob;
    const fade = Math.pow(Math.max(0, 1 - a), 1.7) * Math.min(1, s.k * 1.3) * (i === 0 ? 0.6 : 1);
    // the weapon's colour at the edge, faint near the hilt
    const tb = 0.48 * fade * trailK;
    trCol[j] = CG.r * tb * 0.15; trCol[j + 1] = CG.g * tb * 0.15; trCol[j + 2] = CG.b * tb * 0.15;
    trCol[j + 3] = CG.r * tb; trCol[j + 4] = CG.g * tb; trCol[j + 5] = CG.b * tb;
  }
  trGeo.attributes.position.needsUpdate = true;
  trGeo.attributes.color.needsUpdate = true;
  trGeo.setDrawRange(0, Math.max(0, n - 1) * 6);
}
function spawnSpark(p: THREE.Vector3, vx: number, vy: number, vz: number, life: number) {
  const i = spNext; spNext = (spNext + 1) % SPARKS;
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
  if (weapon().id !== fxId) setWeaponFx();
  const w = weapon(), grav = w.fx.gravity;
  trailK = w.fx.trail;
  sam.katana.updateMatrixWorld(true);
  bladeBase.set(0, 0, 0.24); sam.katana.localToWorld(bladeBase);
  bladeTip.set(0, 0, tipZ()); sam.katana.localToWorld(bladeTip);
  tipVel.subVectors(bladeTip, prevTip).divideScalar(dt);
  if (tipVel.lengthSq() > 900) tipVel.setLength(30); // teleports (reset, first frame)
  const swing = Math.min(1, tipVel.length() / 12);
  // follows the blade's real speed: flares instantly with the cut, settles more slowly
  swingS += (swing - swingS) * Math.min(1, dt * (swing > swingS ? 30 : 7));
  bladeHeat += ((player.attackT >= 0 ? 1 : swing * 0.6) - bladeHeat) * Math.min(1, dt * 10);
  updateTrail(dt, emit);
  prevTip.copy(bladeTip); prevBase.copy(bladeBase);
  // emission: a rare crackle along the edge, a light shower while cutting
  if (emit) {
    sparkAcc += dt * (3 + player.moving * 3 + bladeHeat * 55 + swing * 25);
    while (sparkAcc >= 1) {
      sparkAcc -= 1;
      const s = Math.sqrt(Math.random());
      spTmp.lerpVectors(bladeBase, bladeTip, s);
      const fling = 0.25 + bladeHeat * 0.35;
      spawnSpark(spTmp,
        tipVel.x * s * fling + rnd(-1.4, 1.4),
        tipVel.y * s * fling + rnd(0.2, 2.4),
        tipVel.z * s * fling + rnd(-1.4, 1.4),
        rnd(0.25, 0.55) + bladeHeat * 0.3);
    }
  }
  // physics + colour: white-hot → gold → ember red → gone
  for (let i = 0; i < SPARKS; i++) {
    const j = i * 3;
    if (spLife[i] <= 0) { spCol[j] = spCol[j + 1] = spCol[j + 2] = 0; continue; }
    spLife[i] -= dt;
    const t = Math.max(0, spLife[i] / spMax[i]);
    spVel[j + 1] -= grav * dt;
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
  bladeMat.emissiveIntensity = (0.4 + swingS * 1.8 + bladeHeat * 0.5) * (0.92 + Math.random() * 0.16);
  bladeLight.position.lerpVectors(bladeBase, bladeTip, 0.6);
  bladeLight.intensity = (0.5 + swingS * 4 + bladeHeat * 1.5) * fl * (0.8 + w.fx.halo * 0.4);
  // the halo breathes at rest and flares with the cut
  const hk = Math.min(1, swingS * 1.2 + bladeHeat * 0.5);
  haloMat.opacity = (0.1 + 0.05 * Math.sin(state.time * 3)) * w.fx.halo * 0.7 + hk * 0.55;
  haloCore.opacity = 0.08 + hk * 0.45;
  halo.scale.set(1 + hk * 0.8, 1 + hk * 0.8, 1 + hk * 0.06);
  halo.visible = sam.root.visible;
  // each blade's own flourish
  if (emit && w.fx.extra) flourish(w.fx.extra, dt, hk);
  // sits between the samurai and the camera, chest high: lights his front, barely touches the grass
  samGlow.position.set(player.pos.x + Math.sin(state.yaw) * 0.9, player.pos.y + 1.55, player.pos.z + Math.cos(state.yaw) * 0.9);
}

// ---------------------------------------------------------------- flourishes
// Raijin's blade crackles with little bolts, Muramasa drips, the crow's blade sheds dark feathers,
// Masamune leaves stars hanging in the air.
const boltMat = tagMat(new THREE.LineBasicMaterial({ color: 0xbfe0ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
const bolts: { l: THREE.Line; life: number }[] = [];
let flAcc = 0;
function flourish(kind: 'bolts' | 'blood' | 'feathers' | 'stars', dt: number, hk: number) {
  flAcc += dt * (kind === 'bolts' ? 4 + hk * 30 : kind === 'blood' ? 2 + hk * 40 : kind === 'feathers' ? 1 + hk * 25 : 1.5 + hk * 35);
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
    else if (kind === 'feathers') spawnSpark(spTmp, rnd(-0.8, 0.8), rnd(0.2, 1.2), rnd(-0.8, 0.8), rnd(0.8, 1.3));
    else spawnSpark(spTmp, rnd(-0.3, 0.3), rnd(0.3, 0.9), rnd(-0.3, 0.3), rnd(0.9, 1.5));
  }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.life -= dt;
    if (b.life <= 0) { scene.remove(b.l); b.l.geometry.dispose(); bolts.splice(i, 1); }
  }
}
