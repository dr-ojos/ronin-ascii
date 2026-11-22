// Katana effects: blade light, sparks shed by the edge, and the vapour trail of each cut.
import * as THREE from 'three';
import { scene } from './renderer';
import { CLS } from './materials';
import { sam, bladeMat } from './avatar';
import { player, state } from './state';
import { rnd } from './utils';

// soft personal glow + a cold light that rides on the blade
const samGlow = new THREE.PointLight(0xffe6c0, 0.8, 3.6, 2);
const bladeLight = new THREE.PointLight(0xa6dcff, 3, 6, 1.6);
scene.add(samGlow, bladeLight);

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
    // steel-white at the edge, faint near the hilt
    trCol[j] = 0.05 * fade; trCol[j + 1] = 0.06 * fade; trCol[j + 2] = 0.07 * fade;
    trCol[j + 3] = 0.4 * fade; trCol[j + 4] = 0.45 * fade; trCol[j + 5] = 0.52 * fade;
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
  sam.katana.updateMatrixWorld(true);
  bladeBase.set(0, 0, 0.24); sam.katana.localToWorld(bladeBase);
  bladeTip.set(0, 0, 0.86); sam.katana.localToWorld(bladeTip);
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
    spVel[j + 1] -= 9 * dt;
    const drag = Math.exp(-2.2 * dt);
    spVel[j] *= drag; spVel[j + 1] *= drag; spVel[j + 2] *= drag;
    spPos[j] += spVel[j] * dt; spPos[j + 1] += spVel[j + 1] * dt; spPos[j + 2] += spVel[j + 2] * dt;
    if (spPos[j + 1] < 0.03) { spPos[j + 1] = 0.03; spVel[j + 1] *= -0.35; spVel[j] *= 0.6; spVel[j + 2] *= 0.6; }
    const flick = 0.75 + Math.random() * 0.5;
    // soft yellow → amber as it cools
    const e = Math.min(1, t * 3) * 0.8;
    spCol[j] = (0.85 + 0.15 * t) * e * flick;
    spCol[j + 1] = (0.38 + 0.42 * t) * e * flick;
    spCol[j + 2] = (0.03 + 0.12 * t * t) * e * flick;
  }
  spGeo.attributes.position.needsUpdate = true;
  spGeo.attributes.color.needsUpdate = true;
  // the blade and its light pulse with the heat of the cut
  const fl = 0.85 + Math.random() * 0.3;
  // polished steel at rest; the edge catches light in proportion to how fast it is moving
  bladeMat.emissiveIntensity = (0.4 + swingS * 1.8 + bladeHeat * 0.5) * (0.92 + Math.random() * 0.16);
  bladeLight.position.lerpVectors(bladeBase, bladeTip, 0.6);
  bladeLight.intensity = (0.5 + swingS * 4 + bladeHeat * 1.5) * fl;
  // sits between the samurai and the camera, chest high: lights his front, barely touches the grass
  samGlow.position.set(player.pos.x + Math.sin(state.yaw) * 0.9, 1.55, player.pos.z + Math.cos(state.yaw) * 0.9);
}
