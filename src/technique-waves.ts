import * as THREE from 'three';
import { provoke, staggerEnemy } from './enemy-ai';
import { enemies } from './enemies';
import { burst, impactRing } from './fx';
import { CLS, tagMat } from './materials';
import { scene } from './renderer';
import { panOf, sfx } from './sfx';
import { player, state } from './state';
import { surfaceY } from './structures';
import { TECHNIQUES, type WaveTechniqueId } from './techniques';
import type { Enemy } from './types';
import { dmgMult } from './upgrades';
import { specialDamage } from './special-damage';
import { flare } from './flare';
import { makeFireRingGroundMat, makeFireRingWallMat, makeFireTongueMat, spawnFireRingIgnition } from './vfx-art';

const WAVES = {
  viento: { range: 24, time: 0.62, damage: 7.5, stagger: 0.75, knock: 5, halfArc: 0 },
  fuego: { range: 10, time: 0.48, damage: 8, stagger: 1.15, knock: 11, halfArc: Math.PI },
  agua: { range: 12, time: 0.62, damage: 5, stagger: 1.3, knock: 6, halfArc: Math.PI / 3 },
  // the temple bell: a ring of sound all round you that dazes longer than anything else
  campana: { range: 11, time: 0.7, damage: 4.5, stagger: 2.4, knock: 9, halfArc: Math.PI },
  // the hwarang's storm of petals: a whirling ring that wounds, dazes and heals him for every oni it touches
  petalos: { range: 10, time: 0.75, damage: 6, stagger: 1.1, knock: 7, halfArc: Math.PI },
} as const;
/** waves that run out all round you, not ahead */
const ROUND = (id: WaveTechniqueId) => id === 'fuego' || id === 'campana' || id === 'petalos';
const WIND_WIDTH = 3.1;
const SEGMENTS = 48;
const FADE = 0.25;
const FIRE_FADE = 0.44;
const FIRE_SEGMENTS = 80;
const FIRE_WALL_ROWS = 5;
const FIRE_GROUND_ROWS = 4;
const FIRE_TONGUES = 32;

// Shared sculpted 3D flame tongue geometry (curved vertically + slightly cupped for rich 3D silhouette)
const TONGUE_GEO = (() => {
  const geo = new THREE.PlaneGeometry(1.15, 1.0, 3, 6);
  // Shift base to y = 0 so scaling Y grows cleanly upward from the ground
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // Gentle outward belly near the bottom & graceful inward curl at the tip
    const cup = (0.14 - x * x * 0.26) * Math.sin(y * Math.PI);
    const curl = -y * y * 0.18;
    pos.setZ(i, cup + curl);
  }
  geo.computeVertexNormals();
  return geo;
})();
const _dummy = new THREE.Object3D();

interface FireRingFx {
  group: THREE.Group;
  outerGeo: THREE.BufferGeometry;
  innerGeo: THREE.BufferGeometry;
  groundGeo: THREE.BufferGeometry;
  outerMat: THREE.ShaderMaterial;
  innerMat: THREE.ShaderMaterial;
  groundMat: THREE.ShaderMaterial;
  tongueMat: THREE.ShaderMaterial;
  tongues: THREE.InstancedMesh;
  tongueSeeds: { angle: number; height: number; width: number; radialOff: number; tilt: number }[];
}

interface Wave {
  id: WaveTechniqueId;
  origin: THREE.Vector3;
  forward: THREE.Vector3;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  fire?: FireRingFx;
  time: number;
  hits: Set<Enemy>;
  healed: number;
  /** the bell's reverberation: fainter rings after the first that strike nobody */
  echo?: boolean;
}
const waves: Wave[] = [];

function makeDynamicRingGeo(segments: number, rows: number) {
  const verts = (segments + 1) * rows;
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array(verts * 3), 3).setUsage(THREE.DynamicDrawUsage);
  const uvs = new Float32Array(verts * 2);
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    for (let r = 0; r < rows; r++) {
      const idx = i * rows + r;
      uvs[idx * 2] = u;
      uvs[idx * 2 + 1] = r / (rows - 1);
    }
    if (i < segments) {
      for (let r = 0; r < rows - 1; r++) {
        const a = i * rows + r;
        const b = (i + 1) * rows + r;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  geometry.setAttribute('position', position);
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  return geometry;
}

function makeFireRingFx(): FireRingFx {
  const group = new THREE.Group();
  group.name = TECHNIQUES.fuego.name;

  const outerGeo = makeDynamicRingGeo(FIRE_SEGMENTS, FIRE_WALL_ROWS);
  const innerGeo = makeDynamicRingGeo(FIRE_SEGMENTS, FIRE_WALL_ROWS);
  const groundGeo = makeDynamicRingGeo(FIRE_SEGMENTS, FIRE_GROUND_ROWS);

  const outerMat = makeFireRingWallMat({ opacity: 0.96, seed: 0, coreBoost: 1.0, speed: 1.05 });
  const innerMat = makeFireRingWallMat({ opacity: 0.92, seed: 6.7, coreBoost: 1.28, speed: 1.38 });
  const groundMat = makeFireRingGroundMat(0.92);
  const tongueMat = makeFireTongueMat(0.94);

  const outerMesh = new THREE.Mesh(outerGeo, outerMat);
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  outerMesh.frustumCulled = innerMesh.frustumCulled = groundMesh.frustumCulled = false;

  // Instanced 3D flame tongues leaping around the ring (1 draw call for all 32 tongues)
  const tongueGeo = TONGUE_GEO.clone();
  const phases = new Float32Array(FIRE_TONGUES);
  const tongueSeeds: FireRingFx['tongueSeeds'] = [];
  for (let i = 0; i < FIRE_TONGUES; i++) {
    phases[i] = i * 2.17 + Math.random() * 6.28;
    tongueSeeds.push({
      angle: (i / FIRE_TONGUES) * Math.PI * 2 + (Math.random() - 0.5) * 0.14,
      height: 1.7 + (i % 3 === 0 ? 1.15 : 0.45) + Math.random() * 0.7,
      width: 0.85 + Math.random() * 0.65,
      radialOff: (i % 2 === 0 ? 0.08 : -0.34) + (Math.random() - 0.5) * 0.18,
      tilt: (i % 2 === 0 ? 1 : -1) * (0.28 + Math.random() * 0.35),
    });
  }
  tongueGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const tongues = new THREE.InstancedMesh(tongueGeo, tongueMat, FIRE_TONGUES);
  tongues.frustumCulled = false;

  group.add(groundMesh, outerMesh, innerMesh, tongues);
  return { group, outerGeo, innerGeo, groundGeo, outerMat, innerMat, groundMat, tongueMat, tongues, tongueSeeds };
}

function drawFireRing(wave: Wave, radius: number, fade: number) {
  const fire = wave.fire!;
  const { origin, time } = wave;
  const expandK = Math.min(1, radius / WAVES.fuego.range);
  // Flames surge tall quickly on ignition, stay blazing through expansion, then settle down as they fade
  const surge = Math.sin(Math.min(1, expandK * 1.45) * Math.PI * 0.5);
  const settle = 0.48 + 0.52 * fade;
  const outerH = (1.35 + 1.45 * surge) * settle;
  const innerH = (0.9 + 0.82 * surge) * settle;

  const oPos = fire.outerGeo.attributes.position as THREE.BufferAttribute;
  const iPos = fire.innerGeo.attributes.position as THREE.BufferAttribute;
  const gPos = fire.groundGeo.attributes.position as THREE.BufferAttribute;

  const trailWidth = Math.min(radius, 3.35);
  const rInnerGround = Math.max(0.05, radius - trailWidth);
  const rOuterGround = radius + 0.65;

  for (let i = 0; i <= FIRE_SEGMENTS; i++) {
    const u = i / FIRE_SEGMENTS;
    const ang = u * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);

    // Subtle organic radial billow around the circumference so the ring feels alive, not geometrically rigid
    const billow = 0.22 * Math.sin(ang * 7 + time * 14) + 0.14 * Math.cos(ang * 13 - time * 19);
    const rBase = Math.max(0.15, radius + billow * expandK);
    const bx = origin.x + ca * rBase, bz = origin.z + sa * rBase;
    const gy = surfaceY(bx, bz);

    // Outer flame curtain: leans slightly inward at the top (wind shear from outward rush)
    const crestBoost = 1 + 0.22 * Math.sin(ang * 9 + time * 18) + 0.14 * Math.sin(ang * 17 - time * 24);
    for (let row = 0; row < FIRE_WALL_ROWS; row++) {
      const v = row / (FIRE_WALL_ROWS - 1);
      // Slight belly outward near bottom, swept back near top
      const lean = Math.sin(v * Math.PI) * 0.26 - v * v * 0.62 * expandK;
      const r = Math.max(0.08, rBase + lean);
      const x = origin.x + ca * r, z = origin.z + sa * r;
      const y = gy + 0.04 + v * outerH * crestBoost;
      oPos.setXYZ(i * FIRE_WALL_ROWS + row, x, y, z);
    }

    // Inner incandescent core curtain: tighter radius, hotter white-gold core
    const rCoreBase = Math.max(0.08, rBase - 0.42 * expandK);
    const cy = surfaceY(origin.x + ca * rCoreBase, origin.z + sa * rCoreBase);
    for (let row = 0; row < FIRE_WALL_ROWS; row++) {
      const v = row / (FIRE_WALL_ROWS - 1);
      const flareOut = v * 0.24 * expandK;
      const r = Math.max(0.05, rCoreBase + flareOut);
      const x = origin.x + ca * r, z = origin.z + sa * r;
      const y = cy + 0.05 + v * innerH * (0.9 + 0.2 * Math.cos(ang * 11 + time * 22));
      iPos.setXYZ(i * FIRE_WALL_ROWS + row, x, y, z);
    }

    // Molten ember carpet hugging the terrain
    for (let row = 0; row < FIRE_GROUND_ROWS; row++) {
      const v = row / (FIRE_GROUND_ROWS - 1);
      const r = THREE.MathUtils.lerp(rInnerGround, rOuterGround, v);
      const x = origin.x + ca * r, z = origin.z + sa * r;
      gPos.setXYZ(i * FIRE_GROUND_ROWS + row, x, surfaceY(x, z) + 0.08 + (row === 2 ? 0.03 : 0), z);
    }
  }
  oPos.needsUpdate = true;
  iPos.needsUpdate = true;
  gPos.needsUpdate = true;

  // Position all 32 sculpted 3D flame tongues along the expanding perimeter
  const tongueScale = (0.45 + 0.72 * surge) * settle;
  for (let i = 0; i < FIRE_TONGUES; i++) {
    const s = fire.tongueSeeds[i];
    const ang = s.angle + time * 0.35; // gentle fire vortex rotation
    const r = Math.max(0.2, radius + s.radialOff * expandK);
    const x = origin.x + Math.cos(ang) * r;
    const z = origin.z + Math.sin(ang) * r;
    const y = surfaceY(x, z) + 0.03;
    _dummy.position.set(x, y, z);
    // Face outward radially + staggered yaw tilt so flames look full and volumetric from any viewing angle
    _dummy.rotation.set(0, -ang + Math.PI * 0.5 + s.tilt, 0);
    _dummy.scale.set(s.width * (0.6 + 0.55 * expandK), s.height * tongueScale, 1);
    _dummy.updateMatrix();
    fire.tongues.setMatrixAt(i, _dummy.matrix);
  }
  fire.tongues.instanceMatrix.needsUpdate = true;

  // Smooth fire opacity fade (wall & tongues fade slightly faster, molten ground coals linger a beat longer)
  fire.outerMat.uniforms.uOpacity.value = 0.96 * fade;
  fire.innerMat.uniforms.uOpacity.value = 0.92 * fade * fade;
  fire.tongueMat.uniforms.uOpacity.value = 0.94 * fade;
  fire.groundMat.uniforms.uOpacity.value = 0.92 * Math.pow(fade, 0.72);
}

function makeWaveMesh(id: WaveTechniqueId) {
  const geometry = new THREE.BufferGeometry();
  const position = new THREE.BufferAttribute(new Float32Array((SEGMENTS + 1) * 9), 3).setUsage(THREE.DynamicDrawUsage);
  const colors = new Float32Array(position.count * 3), indices: number[] = [];
  const color = new THREE.Color(TECHNIQUES[id].color);
  const shades = [color.clone().multiplyScalar(0.04), color.clone().lerp(new THREE.Color(0xffffff), 0.38).multiplyScalar(1.7), color];
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS, edge = ROUND(id) ? 1 : Math.sin(t * Math.PI) ** 0.42;
    shades.forEach((shade, row) => colors.set([shade.r * edge, shade.g * edge, shade.b * edge], i * 9 + row * 3));
    if (i < SEGMENTS) {
      const a = i * 3;
      indices.push(a, a + 3, a + 1, a + 1, a + 3, a + 4, a + 1, a + 4, a + 2, a + 2, a + 4, a + 5);
    }
  }
  geometry.setAttribute('position', position);
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  const material = tagMat(new THREE.MeshBasicMaterial({ vertexColors: true, opacity: 0.92, transparent: true,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false }), CLS.fx);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  return mesh;
}

function drawWave(wave: Wave, radius: number, fade = 1) {
  if (wave.fire) {
    drawFireRing(wave, radius, fade);
    return;
  }
  const { id, mesh, origin, forward, time } = wave, { halfArc } = WAVES[id];
  const p = mesh.geometry.attributes.position;
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = i / SEGMENTS * 2 - 1, a = t * halfArc;
    for (let row = 0; row < 3; row++) {
      const r = Math.max(0, radius - (2 - row) * (id === 'agua' ? 0.95 : id === 'campana' ? 0.7 : 0.53));
      const side = id === 'viento' ? t * WIND_WIDTH : Math.sin(a) * r;
      const ahead = id === 'viento' ? r - 1.5 * t * t : Math.cos(a) * r;
      const x = origin.x + forward.x * ahead + forward.z * side, z = origin.z + forward.z * ahead - forward.x * side;
      const falloff = Math.max(0, 1 - t * t), peak = row === 1 ? 1 : row === 2 ? 0.52 : 0;
      const crest = id === 'agua' ? falloff * (1.1 + Math.sin(a * 9 - time * 15) * 0.3)
        : id === 'campana' ? 0.5 + 0.18 * Math.sin(a * 8 - time * 12)
        : id === 'petalos' ? 0.55 + 0.35 * Math.sin(a * 11 + time * 18) ** 2 : 0.8 * falloff;
      p.setXYZ(i * 3 + row, x, surfaceY(x, z) + (id === 'viento' ? 0.95 : 0.12) + crest * peak, z);
    }
  }
  p.needsUpdate = true;
}

function addWave(id: WaveTechniqueId, delay = 0, echo = false) {
  const origin = player.pos.clone(), forward = new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face));
  if (id === 'fuego') {
    const fire = makeFireRingFx();
    const dummyMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    const wave: Wave = { id, origin, forward, mesh: dummyMesh, fire, time: -delay, hits: new Set(), healed: 0, echo };
    drawFireRing(wave, 0.3, 1);
    fire.group.visible = delay <= 0;
    waves.push(wave);
    scene.add(fire.group);
    return wave;
  }
  const mesh = makeWaveMesh(id);
  mesh.name = TECHNIQUES[id].name;
  const wave: Wave = { id, origin, forward, mesh, time: -delay, hits: new Set(), healed: 0, echo };
  drawWave(wave, 0);
  mesh.visible = delay <= 0;
  waves.push(wave); scene.add(mesh);
  return wave;
}

export function startTechniqueWave(id: WaveTechniqueId) {
  const { origin, forward } = addWave(id);
  const round = ROUND(id);
  if (id === 'fuego') {
    spawnFireRingIgnition(origin, WAVES.fuego.range);
    const coreAt = origin.clone().add(new THREE.Vector3(0, 0.7, 0));
    // Multi-layered fiery ember detonation: incandescent white-gold sparks + blazing orange + deep crimson embers
    burst(coreAt, 0xfff2be, 46, 8.2, 0.14);
    burst(coreAt, 0xff7a1e, 74, 7.2, 0.19);
    burst(coreAt, 0xd82800, 44, 5.4, 0.22);
    const star = origin.clone().add(new THREE.Vector3(0, 2.25, 0));
    flare(star, 0xffaa38, { size: 1.4, life: 0.62 });
    state.shake = Math.max(state.shake, 0.44);
    sfx.swing({ power: 1.65, pan: 0 });
    sfx.taiko(0.65);
    return;
  }
  const at = origin.clone().addScaledVector(forward, round ? 0 : 1.2).add(new THREE.Vector3(0, 0.8, 0));
  burst(at, TECHNIQUES[id].color, round ? 75 : 42, 6, 0.17);
  // the star opens above the ronin's head (ahead of him for the waves that travel), so his own figure never hides its core
  const star = origin.clone().addScaledVector(forward, round ? 0 : 2.4).add(new THREE.Vector3(0, round ? 2.3 : 1.7, 0));
  flare(star, TECHNIQUES[id].color, { size: round ? 1.25 : 1, life: round ? 0.6 : 0.5 });
  impactRing(origin, TECHNIQUES[id].color, round ? WAVES[id].range * 0.95 : 4.5);
  if (id === 'campana') {
    // the bronze keeps ringing: two fainter rings follow the first, and the ground shakes
    addWave(id, 0.22, true); addWave(id, 0.46, true);
    burst(origin.clone().setY(origin.y + 0.2), 0xc9b38a, 45, 5.5, 0.18);
    state.shake = Math.max(state.shake, 0.55);
    sfx.templeBell();
    sfx.taiko(0.9);
    return;
  }
  if (id === 'petalos') {
    burst(origin.clone().setY(origin.y + 1), 0xffb0d0, 90, 7, 0.2);
    burst(origin.clone().setY(origin.y + 0.6), 0xffffff, 30, 5, 0.12);
    player.invuln = Math.max(player.invuln, 1);
    sfx.chime(false);
  }
  sfx.swing({ power: 1.1, pan: 0 });
}

function hitEnemies(wave: Wave, before: number, radius: number) {
  const { id, origin, forward } = wave, effect = WAVES[id];
  const strike = new THREE.Vector3();
  let hits = 0, pan = 0;
  for (const enemy of enemies) {
    if (enemy.hp <= 0 || wave.hits.has(enemy)) continue;
    const p = enemy.g.position, dx = p.x - origin.x, dz = p.z - origin.z;
    const pad = 0.45 * enemy.scale, range = Math.hypot(dx, dz), ahead = dx * forward.x + dz * forward.z;
    const side = dx * forward.z - dz * forward.x;
    const front = id === 'viento' ? ahead + 1.5 * (side / WIND_WIDTH) ** 2 : range;
    if (front < before - pad || front > radius + pad) continue;
    if (id === 'viento' && (ahead < -pad || Math.abs(side) > WIND_WIDTH + pad)) continue;
    if (id === 'agua' && ahead < range * Math.cos(effect.halfArc) - pad) continue;
    wave.hits.add(enemy);
    specialDamage(enemy, effect.damage * dmgMult()); enemy.flash = 1;
    provoke(enemy);
    if (enemy.state !== 'return') staggerEnemy(enemy, effect.stagger);
    if (id === 'viento') enemy.knock.copy(forward);
    else enemy.knock.set(dx, 0, dz).normalize();
    enemy.knock.multiplyScalar(effect.knock / (enemy.big ? 2.6 : 1));
    strike.set(p.x, p.y + 1.1 * enemy.scale, p.z);
    if (id === 'fuego') {
      burst(strike, 0xff6e1a, 28, 6.2, 0.17);
      burst(strike, 0xfff0b0, 14, 4.4, 0.12);
    } else {
      burst(strike, TECHNIQUES[id].color, 25, 5, 0.14);
    }
    if (id === 'agua' || id === 'petalos') {
      const heal = id === 'agua' ? Math.min(8, 24 - wave.healed, player.maxHp - player.hp) : Math.min(4, player.maxHp - player.hp);
      wave.healed += heal; player.hp += heal;
      if (heal > 0) burst(player.pos.clone().setY(player.pos.y + 0.8), 0xa3ffd7, 12, 3, 0.12);
    }
    hits++; pan += panOf(p.x, p.z);
  }
  if (hits) {
    sfx.hit({ heavy: ROUND(id), pan: pan / hits, count: hits });
    state.shake = Math.max(state.shake, ROUND(id) ? 0.45 : 0.23);
  }
}

function removeWave(wave: Wave) {
  if (wave.fire) {
    scene.remove(wave.fire.group);
    wave.fire.outerGeo.dispose();
    wave.fire.innerGeo.dispose();
    wave.fire.groundGeo.dispose();
    wave.fire.tongues.geometry.dispose();
    wave.fire.outerMat.dispose();
    wave.fire.innerMat.dispose();
    wave.fire.groundMat.dispose();
    wave.fire.tongueMat.dispose();
  } else {
    scene.remove(wave.mesh);
  }
  wave.mesh.geometry.dispose();
  wave.mesh.material.dispose();
}

export function updateTechniqueWaves(dt: number) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const wave = waves[i], { range, time } = WAVES[wave.id];
    const fadeDur = wave.id === 'fuego' ? FIRE_FADE : FADE;
    const before = Math.min(1, wave.time / time) * range;
    wave.time += dt;
    if (wave.time < 0) continue;                         // an echo still waiting for its turn
    if (wave.fire) wave.fire.group.visible = true;
    else wave.mesh.visible = true;
    const radius = Math.min(1, wave.time / time) * range;
    if (before < range && !wave.echo) hitEnemies(wave, Math.max(0, before), radius);
    if (wave.time >= time + fadeDur) { removeWave(wave); waves.splice(i, 1); continue; }
    const fade = 1 - Math.max(0, wave.time - time) / fadeDur;
    if (!wave.fire) wave.mesh.material.opacity = (wave.echo ? 0.45 : 0.92) * fade;
    drawWave(wave, radius, fade);
    // Live sparks & glowing embers whipping upward off the expanding Ring of Fire
    if (wave.id === 'fuego' && wave.time < time + fadeDur * 0.45) {
      const count = wave.time < time ? 4 : 2;
      for (let k = 0; k < count; k++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.max(0.3, radius - Math.random() * 0.9);
        const x = wave.origin.x + Math.cos(a) * r, z = wave.origin.z + Math.sin(a) * r;
        const col = k === 0 ? 0xfff0b8 : k === 1 ? 0xff8c24 : 0xe83400;
        burst(new THREE.Vector3(x, surfaceY(x, z) + 0.35 + Math.random() * 1.4, z), col, 5, 3.8, k === 0 ? 0.11 : 0.15);
      }
    }
    // petals whirl off the ring as it spreads
    if (wave.id === 'petalos' && wave.time < time) for (let k = 0; k < 3; k++) {
      const a = Math.random() * Math.PI * 2, x = wave.origin.x + Math.sin(a) * radius, z = wave.origin.z + Math.cos(a) * radius;
      burst(new THREE.Vector3(x, surfaceY(x, z) + 0.4 + Math.random(), z), k ? 0xff9ac4 : 0xffffff, 4, 2, 0.12);
    }
  }
}

export function clearTechniqueWaves() {
  for (const wave of waves) removeWave(wave);
  waves.length = 0;
}
