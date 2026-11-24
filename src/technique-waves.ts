import * as THREE from 'three';
import { provoke, staggerEnemy } from './enemy-ai';
import { enemies } from './enemies';
import { burst } from './fx';
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

const WAVES = {
  viento: { range: 24, time: 0.62, damage: 7.5, stagger: 0.75, knock: 5, halfArc: 0 },
  fuego: { range: 10, time: 0.48, damage: 8, stagger: 1.15, knock: 11, halfArc: Math.PI },
  agua: { range: 12, time: 0.62, damage: 5, stagger: 1.3, knock: 6, halfArc: Math.PI / 3 },
  // the temple bell: a ring of sound all round you that dazes longer than anything else
  campana: { range: 11, time: 0.7, damage: 4.5, stagger: 2.4, knock: 9, halfArc: Math.PI },
} as const;
/** waves that run out all round you, not ahead */
const ROUND = (id: WaveTechniqueId) => id === 'fuego' || id === 'campana';
const WIND_WIDTH = 3.1;
const SEGMENTS = 48;
const FADE = 0.25;

interface Wave {
  id: WaveTechniqueId;
  origin: THREE.Vector3;
  forward: THREE.Vector3;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  time: number;
  hits: Set<Enemy>;
  healed: number;
  /** the bell's reverberation: fainter rings after the first that strike nobody */
  echo?: boolean;
}
const waves: Wave[] = [];

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

function drawWave(wave: Wave, radius: number) {
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
        : id === 'fuego' ? 0.45 + Math.sin(a * 13 + time * 21) ** 4 * 0.7
        : id === 'campana' ? 0.5 + 0.18 * Math.sin(a * 8 - time * 12) : 0.8 * falloff;
      p.setXYZ(i * 3 + row, x, surfaceY(x, z) + (id === 'viento' ? 0.95 : 0.12) + crest * peak, z);
    }
  }
  p.needsUpdate = true;
}

function addWave(id: WaveTechniqueId, delay = 0, echo = false) {
  const mesh = makeWaveMesh(id);
  mesh.name = TECHNIQUES[id].name;
  const origin = player.pos.clone(), forward = new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face));
  const wave: Wave = { id, origin, forward, mesh, time: -delay, hits: new Set(), healed: 0, echo };
  drawWave(wave, 0);
  mesh.visible = delay <= 0;
  waves.push(wave); scene.add(mesh);
  return wave;
}

export function startTechniqueWave(id: WaveTechniqueId) {
  const { origin, forward } = addWave(id);
  const round = ROUND(id);
  const at = origin.clone().addScaledVector(forward, round ? 0 : 1.2).add(new THREE.Vector3(0, 0.8, 0));
  burst(at, TECHNIQUES[id].color, round ? 75 : 42, 6, 0.17);
  flare(at, TECHNIQUES[id].color, { size: round ? 1.25 : 1, life: round ? 0.6 : 0.5 });
  if (id === 'campana') {
    // the bronze keeps ringing: two fainter rings follow the first, and the ground shakes
    addWave(id, 0.22, true); addWave(id, 0.46, true);
    burst(origin.clone().setY(origin.y + 0.2), 0xc9b38a, 40, 5, 0.15);
    state.shake = Math.max(state.shake, 0.55);
    sfx.templeBell();
    sfx.taiko(0.9);
    return;
  }
  sfx.swing({ power: id === 'fuego' ? 1.6 : 1.1, pan: 0 });
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
    burst(strike, TECHNIQUES[id].color, 25, 5, 0.14);
    if (id === 'agua') {
      const heal = Math.min(8, 24 - wave.healed, player.maxHp - player.hp);
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
  scene.remove(wave.mesh); wave.mesh.geometry.dispose(); wave.mesh.material.dispose();
}

export function updateTechniqueWaves(dt: number) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const wave = waves[i], { range, time } = WAVES[wave.id];
    const before = Math.min(1, wave.time / time) * range;
    wave.time += dt;
    if (wave.time < 0) continue;                         // an echo still waiting for its turn
    wave.mesh.visible = true;
    const radius = Math.min(1, wave.time / time) * range;
    if (before < range && !wave.echo) hitEnemies(wave, Math.max(0, before), radius);
    if (wave.time >= time + FADE) { removeWave(wave); waves.splice(i, 1); continue; }
    wave.mesh.material.opacity = (wave.echo ? 0.45 : 0.92) * (1 - Math.max(0, wave.time - time) / FADE);
    drawWave(wave, radius);
  }
}

export function clearTechniqueWaves() {
  for (const wave of waves) removeWave(wave);
  waves.length = 0;
}
