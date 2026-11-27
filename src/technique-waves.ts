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
import {
  makeAcousticWaveMat, makeFireRingGroundMat, makeFireRingWallMat, makeFireTongueMat,
  makePetalVortexMat, makeShockRingMat, makeWaterGroundMat, makeWaterSplashPlumeMat,
  makeWaterWaveBodyMat, makeWindGaleMat, spawnFireRingIgnition, spawnPhantomBell,
  spawnWaterSplashCrown, spawnWindGaleBurst,
} from './vfx-art';

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
const FADE = 0.25;
const FIRE_FADE = 0.44;
const FIRE_SEGMENTS = 80;
const FIRE_WALL_ROWS = 5;
const FIRE_GROUND_ROWS = 4;
const FIRE_TONGUES = 32;

const WATER_FADE = 0.44;
const WATER_SEGMENTS = 64;
const WATER_WALL_ROWS = 7;
const WATER_GROUND_ROWS = 5;
const WATER_PLUMES = 22;

const WIND_SEGMENTS = 56;
const WIND_ROWS = 5;
const WIND_SWIRLS = 16;

const BELL_SEGMENTS = 72;
const BELL_ROWS = 5;

const PETAL_SEGMENTS = 64;
const PETAL_ROWS = 4;
const PETAL_COUNT = 48;

// Sculpted cupped 3D sakura petal geometry (heart-notched blossom silhouette)
const SAKURA_PETAL_GEO = (() => {
  const shape = new THREE.Shape();
  shape.moveTo(0, -0.18);
  shape.bezierCurveTo(0.16, -0.1, 0.2, 0.09, 0.08, 0.22);
  shape.lineTo(0, 0.14); // signature sakura petal notch
  shape.lineTo(-0.08, 0.22);
  shape.bezierCurveTo(-0.2, 0.09, -0.16, -0.1, 0, -0.18);
  const g = new THREE.ShapeGeometry(shape, 8);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    pos.setZ(i, (x * x + y * y) * 0.45); // gentle natural petal cup
  }
  g.computeVertexNormals();
  return g;
})();

// Curved 3D aerodynamic wind ribbon for swirling gale blades
const WIND_RIBBON_GEO = (() => {
  const g = new THREE.PlaneGeometry(0.32, 1.3, 2, 5);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    pos.setZ(i, Math.sin(y * 2.4) * 0.18);
  }
  g.computeVertexNormals();
  return g;
})();

// Sculpted forward-curling sea-foam plume geometry (Hokusai-style breaking wave claws)
const WATER_PLUME_GEO = (() => {
  const geo = new THREE.PlaneGeometry(1.0, 1.0, 3, 6);
  geo.translate(0, 0.5, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // Sweeps upward then curls forward over the wave lip
    const curlForward = y * y * 0.72;
    const cup = (0.14 - x * x * 0.28) * Math.sin(y * Math.PI);
    pos.setZ(i, curlForward + cup);
  }
  geo.computeVertexNormals();
  return geo;
})();

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

interface WaterWaveFx {
  group: THREE.Group;
  crestGeo: THREE.BufferGeometry;
  innerGeo: THREE.BufferGeometry;
  groundGeo: THREE.BufferGeometry;
  crestMat: THREE.ShaderMaterial;
  innerMat: THREE.ShaderMaterial;
  groundMat: THREE.ShaderMaterial;
  plumeMat: THREE.ShaderMaterial;
  plumes: THREE.InstancedMesh;
  plumeSeeds: { t: number; height: number; width: number; rOff: number; pitch: number }[];
}

interface WindSlashFx {
  group: THREE.Group;
  bladeGeo: THREE.BufferGeometry;
  wakeGeo: THREE.BufferGeometry;
  bladeMat: THREE.ShaderMaterial;
  wakeMat: THREE.ShaderMaterial;
  swirlMat: THREE.ShaderMaterial;
  swirls: THREE.InstancedMesh;
  swirlSeeds: { t: number; h: number; back: number; spin: number; scale: number }[];
}

interface BellWaveFx {
  group: THREE.Group;
  wallGeo: THREE.BufferGeometry;
  wallMat: THREE.ShaderMaterial;
  groundMat: THREE.ShaderMaterial;
  groundMesh: THREE.Mesh;
}

interface PetalStormFx {
  group: THREE.Group;
  curtainGeo: THREE.BufferGeometry;
  curtainMat: THREE.ShaderMaterial;
  petalMat: THREE.MeshBasicMaterial;
  petals: THREE.InstancedMesh;
  petalSeeds: { angle: number; h: number; rOff: number; spinX: number; spinY: number; spinZ: number; scale: number }[];
}

interface Wave {
  id: WaveTechniqueId;
  origin: THREE.Vector3;
  forward: THREE.Vector3;
  mesh: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  fire?: FireRingFx;
  water?: WaterWaveFx;
  wind?: WindSlashFx;
  bell?: BellWaveFx;
  petal?: PetalStormFx;
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

// ------------------------------------------------------------ Marea Lunar: 3D breaking tsunami wave
function makeWaterWaveFx(): WaterWaveFx {
  const group = new THREE.Group();
  group.name = TECHNIQUES.agua.name;

  const crestGeo = makeDynamicRingGeo(WATER_SEGMENTS, WATER_WALL_ROWS);
  const innerGeo = makeDynamicRingGeo(WATER_SEGMENTS, WATER_WALL_ROWS);
  const groundGeo = makeDynamicRingGeo(WATER_SEGMENTS, WATER_GROUND_ROWS);

  const crestMat = makeWaterWaveBodyMat({ opacity: 0.95, seed: 0, fanFade: true });
  const innerMat = makeWaterWaveBodyMat({ opacity: 0.72, seed: 5.3, fanFade: true });
  const groundMat = makeWaterGroundMat(0.88);
  const plumeMat = makeWaterSplashPlumeMat(0.92);

  const crestMesh = new THREE.Mesh(crestGeo, crestMat);
  const innerMesh = new THREE.Mesh(innerGeo, innerMat);
  const groundMesh = new THREE.Mesh(groundGeo, groundMat);
  crestMesh.frustumCulled = innerMesh.frustumCulled = groundMesh.frustumCulled = false;

  // Instanced curling sea-foam plumes leaping off the breaking tsunami crest
  const plumeGeo = WATER_PLUME_GEO.clone();
  const phases = new Float32Array(WATER_PLUMES);
  const plumeSeeds: WaterWaveFx['plumeSeeds'] = [];
  for (let i = 0; i < WATER_PLUMES; i++) {
    phases[i] = i * 2.4 + Math.random() * 6.28;
    const t = ((i + 0.5) / WATER_PLUMES) * 2 - 1; // -1..1 across the fan
    plumeSeeds.push({
      t: t * 0.92 + (Math.random() - 0.5) * 0.05,
      height: 0.95 + (1 - t * t) * 0.9 + Math.random() * 0.45,
      width: 0.75 + Math.random() * 0.55,
      rOff: (Math.random() - 0.5) * 0.3,
      pitch: 0.22 + Math.random() * 0.35,
    });
  }
  plumeGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const plumes = new THREE.InstancedMesh(plumeGeo, plumeMat, WATER_PLUMES);
  plumes.frustumCulled = false;

  group.add(groundMesh, innerMesh, crestMesh, plumes);
  return { group, crestGeo, innerGeo, groundGeo, crestMat, innerMat, groundMat, plumeMat, plumes, plumeSeeds };
}

function drawWaterWave(wave: Wave, radius: number, fade: number) {
  const water = wave.water!;
  const { origin, forward, time } = wave;
  const { halfArc, range } = WAVES.agua;
  const expandK = Math.min(1, radius / range);
  // Wave swells rapidly into a tall tsunami wall, curls forward as it crests, then collapses into surf on fade
  const surge = Math.sin(Math.min(1, expandK * 1.35) * Math.PI * 0.5);
  const collapse = 0.26 + 0.74 * fade * fade;
  const peakH = (1.55 + 1.35 * surge) * collapse;
  // Breaking lip overhang intensifies as the wave advances
  const curlAmt = (0.45 + 0.85 * expandK) * (0.4 + 0.6 * fade);

  const cPos = water.crestGeo.attributes.position as THREE.BufferAttribute;
  const iPos = water.innerGeo.attributes.position as THREE.BufferAttribute;
  const gPos = water.groundGeo.attributes.position as THREE.BufferAttribute;

  const trailWidth = Math.min(radius, 4.6);
  const rBack = Math.max(0.15, radius - trailWidth);
  const rLead = radius + 0.85;

  for (let i = 0; i <= WATER_SEGMENTS; i++) {
    const u = i / WATER_SEGMENTS;
    const t = u * 2 - 1;
    const a = t * halfArc;
    const falloff = Math.pow(Math.max(0, 1 - t * t), 0.72);
    const sa = Math.sin(a), ca = Math.cos(a);

    // Travelling oceanic swells undulating across the breaking arc
    const swellWave = 0.24 * Math.sin(a * 7 - time * 14) + 0.14 * Math.cos(a * 13 + time * 19);
    const rFront = Math.max(0.25, radius + swellWave * expandK);

    // Main 7-row sculpted breaking tsunami profile (concave face rising into a curling forward lip)
    for (let row = 0; row < WATER_WALL_ROWS; row++) {
      const v = row / (WATER_WALL_ROWS - 1); // 0 = base trough, 0.72 = crest apex, 1.0 = curling breaking lip
      // Sweeps smoothly back at the base, rises steeply, then curls FORWARD over the leading edge!
      const backCurve = -Math.pow(1 - v, 1.65) * 1.45 * expandK;
      const forwardCurl = Math.pow(Math.max(0, v - 0.35) / 0.65, 1.8) * curlAmt;
      const r = Math.max(0.1, rFront + backCurve + forwardCurl);
      const side = sa * r, ahead = ca * r;
      const x = origin.x + forward.x * ahead + forward.z * side;
      const z = origin.z + forward.z * ahead - forward.x * side;
      // Height peaks around v = 0.76, then hooks slightly downward at v = 1.0 like a real breaking barrel!
      const yProf = v < 0.76 ? Math.sin((v / 0.76) * Math.PI * 0.5) : 1.0 - Math.pow((v - 0.76) / 0.24, 1.7) * 0.22;
      const y = surfaceY(x, z) + 0.06 + yProf * peakH * (0.28 + 0.72 * falloff) * (1 + 0.16 * Math.sin(a * 9 - time * 16));
      cPos.setXYZ(i * WATER_WALL_ROWS + row, x, y, z);
    }

    // Secondary rolling swell behind the main breaker for layered oceanic depth
    const rSecond = Math.max(0.12, rFront - 1.35 * expandK);
    for (let row = 0; row < WATER_WALL_ROWS; row++) {
      const v = row / (WATER_WALL_ROWS - 1);
      const r = Math.max(0.08, rSecond - (1 - v) * 0.9 * expandK + Math.max(0, v - 0.5) * 0.45);
      const side = sa * r, ahead = ca * r;
      const x = origin.x + forward.x * ahead + forward.z * side;
      const z = origin.z + forward.z * ahead - forward.x * side;
      const yProf = Math.sin(v * Math.PI * 0.58);
      const y = surfaceY(x, z) + 0.05 + yProf * peakH * 0.62 * (0.22 + 0.78 * falloff) * (1 + 0.18 * Math.cos(a * 11 - time * 18));
      iPos.setXYZ(i * WATER_WALL_ROWS + row, x, y, z);
    }

    // Wet caustic tidal wash hugging the terrain
    for (let row = 0; row < WATER_GROUND_ROWS; row++) {
      const v = row / (WATER_GROUND_ROWS - 1);
      const r = THREE.MathUtils.lerp(rBack, rLead, v);
      const side = sa * r, ahead = ca * r;
      const x = origin.x + forward.x * ahead + forward.z * side;
      const z = origin.z + forward.z * ahead - forward.x * side;
      gPos.setXYZ(i * WATER_GROUND_ROWS + row, x, surfaceY(x, z) + 0.08 + (row === WATER_GROUND_ROWS - 2 ? 0.03 : 0), z);
    }
  }
  cPos.needsUpdate = true;
  iPos.needsUpdate = true;
  gPos.needsUpdate = true;
  water.crestGeo.computeVertexNormals();
  water.innerGeo.computeVertexNormals();

  // Position all 22 curling sea-foam spray plumes along the breaking lip
  const baseYaw = Math.atan2(forward.x, forward.z);
  const plumeScale = (0.45 + 0.75 * surge) * collapse;
  for (let i = 0; i < WATER_PLUMES; i++) {
    const s = water.plumeSeeds[i];
    const a = s.t * halfArc;
    const falloff = Math.pow(Math.max(0, 1 - s.t * s.t), 0.72);
    const r = Math.max(0.3, radius + curlAmt * 0.55 + s.rOff);
    const side = Math.sin(a) * r, ahead = Math.cos(a) * r;
    const x = origin.x + forward.x * ahead + forward.z * side;
    const z = origin.z + forward.z * ahead - forward.x * side;
    const crestY = surfaceY(x, z) + 0.06 + peakH * 0.62 * (0.28 + 0.72 * falloff);
    _dummy.position.set(x, crestY, z);
    // Face outward along the fan direction and pitch forward as the wave breaks
    _dummy.rotation.set(s.pitch + expandK * 0.48, baseYaw - a, 0, 'YXZ');
    _dummy.scale.set(s.width * (0.55 + 0.6 * expandK), s.height * plumeScale, 1);
    _dummy.updateMatrix();
    water.plumes.setMatrixAt(i, _dummy.matrix);
  }
  water.plumes.instanceMatrix.needsUpdate = true;

  water.crestMat.uniforms.uOpacity.value = 0.95 * fade;
  water.innerMat.uniforms.uOpacity.value = 0.72 * fade * fade;
  water.plumeMat.uniforms.uOpacity.value = 0.92 * fade;
  water.groundMat.uniforms.uOpacity.value = 0.88 * Math.pow(fade, 0.72);
}

// ------------------------------------------------------------ Corte del Vendaval: 3D aerodynamic gale crescent
function makeWindSlashFx(): WindSlashFx {
  const group = new THREE.Group();
  group.name = TECHNIQUES.viento.name;

  const bladeGeo = makeDynamicRingGeo(WIND_SEGMENTS, WIND_ROWS);
  const wakeGeo = makeDynamicRingGeo(WIND_SEGMENTS, WIND_ROWS);
  const bladeMat = makeWindGaleMat({ opacity: 0.96, seed: 0 });
  const wakeMat = makeWindGaleMat({ opacity: 0.65, seed: 4.1 });
  const swirlMat = makeWindGaleMat({ opacity: 0.88, seed: 8.5 });

  const bladeMesh = new THREE.Mesh(bladeGeo, bladeMat);
  const wakeMesh = new THREE.Mesh(wakeGeo, wakeMat);
  bladeMesh.frustumCulled = wakeMesh.frustumCulled = false;

  const swirlGeo = WIND_RIBBON_GEO.clone();
  const swirls = new THREE.InstancedMesh(swirlGeo, swirlMat, WIND_SWIRLS);
  swirls.frustumCulled = false;
  const swirlSeeds = Array.from({ length: WIND_SWIRLS }, (_, i) => ({
    t: ((i + 0.5) / WIND_SWIRLS) * 2 - 1,
    h: 0.45 + Math.random() * 1.45,
    back: 0.25 + Math.random() * 2.4,
    spin: (i % 2 ? 1 : -1) * (5 + Math.random() * 7),
    scale: 0.7 + Math.random() * 0.75,
  }));

  group.add(wakeMesh, bladeMesh, swirls);
  return { group, bladeGeo, wakeGeo, bladeMat, wakeMat, swirlMat, swirls, swirlSeeds };
}

function drawWindSlash(wave: Wave, radius: number, fade: number) {
  const wind = wave.wind!;
  const { origin, forward, time } = wave;
  const bPos = wind.bladeGeo.attributes.position as THREE.BufferAttribute;
  const wPos = wind.wakeGeo.attributes.position as THREE.BufferAttribute;
  const width = WIND_WIDTH * (0.85 + 0.35 * Math.min(1, radius / WAVES.viento.range));

  for (let i = 0; i <= WIND_SEGMENTS; i++) {
    const u = i / WIND_SEGMENTS, t = u * 2 - 1;
    const falloff = Math.max(0, 1 - t * t);
    const flutter = Math.sin(t * 9 - time * 26) * 0.12;
    const side = t * width;
    const leadAhead = radius - 1.65 * t * t;

    // Swept forward-leaning aerodynamic crescent blade (5 rows from trailing edge to razor front)
    for (let row = 0; row < WIND_ROWS; row++) {
      const v = row / (WIND_ROWS - 1);
      const ahead = leadAhead - (1 - v) * (2.6 * falloff + 0.5);
      const x = origin.x + forward.x * ahead + forward.z * side;
      const z = origin.z + forward.z * ahead - forward.x * side;
      // Tilted aerodynamic wing profile: dips at leading razor, arches over the middle
      const yOff = 0.85 + Math.sin(v * Math.PI) * 0.65 * falloff + (v - 0.5) * 0.35 + flutter;
      bPos.setXYZ(i * WIND_ROWS + row, x, surfaceY(x, z) + yOff, z);
    }

    // Ground slipstream pressure wake skimming the terrain below the blade
    for (let row = 0; row < WIND_ROWS; row++) {
      const v = row / (WIND_ROWS - 1);
      const ahead = leadAhead - 0.4 - (1 - v) * (3.6 * falloff + 0.8);
      const x = origin.x + forward.x * ahead + forward.z * side * 1.1;
      const z = origin.z + forward.z * ahead - forward.x * side * 1.1;
      wPos.setXYZ(i * WIND_ROWS + row, x, surfaceY(x, z) + 0.14 + v * 0.25 * falloff, z);
    }
  }
  bPos.needsUpdate = true;
  wPos.needsUpdate = true;
  wind.bladeGeo.computeVertexNormals();

  // Position 16 swirling emerald wind ribbons whipping in the slipstream
  const yaw = Math.atan2(forward.x, forward.z);
  for (let i = 0; i < WIND_SWIRLS; i++) {
    const s = wind.swirlSeeds[i];
    const side = s.t * width * 0.92;
    const ahead = Math.max(0.2, radius - 1.5 * s.t * s.t - s.back);
    const x = origin.x + forward.x * ahead + forward.z * side;
    const z = origin.z + forward.z * ahead - forward.x * side;
    _dummy.position.set(x, surfaceY(x, z) + s.h + Math.sin(time * 14 + i) * 0.22, z);
    _dummy.rotation.set(Math.PI * 0.42, yaw, time * s.spin + i, 'YXZ');
    _dummy.scale.setScalar(s.scale * (0.65 + 0.35 * fade));
    _dummy.updateMatrix();
    wind.swirls.setMatrixAt(i, _dummy.matrix);
  }
  wind.swirls.instanceMatrix.needsUpdate = true;

  wind.bladeMat.uniforms.uOpacity.value = 0.96 * fade;
  wind.wakeMat.uniforms.uOpacity.value = 0.65 * fade;
  wind.swirlMat.uniforms.uOpacity.value = 0.88 * fade;
}

// ------------------------------------------------------------ Campana del Templo: bronze acoustic shockwave
const BELL_GROUND_PLANE = new THREE.PlaneGeometry(2, 2);

function makeBellWaveFx(echo: boolean): BellWaveFx {
  const group = new THREE.Group();
  group.name = TECHNIQUES.campana.name;
  const wallGeo = makeDynamicRingGeo(BELL_SEGMENTS, BELL_ROWS);
  const wallMat = makeAcousticWaveMat({ opacity: echo ? 0.52 : 0.92, seed: echo ? 3.5 : 0 });
  const groundMat = makeShockRingMat(0xfff6d2, 0xffb83c, echo ? 0.45 : 0.88);
  const wallMesh = new THREE.Mesh(wallGeo, wallMat);
  wallMesh.frustumCulled = false;
  const groundMesh = new THREE.Mesh(BELL_GROUND_PLANE, groundMat);
  groundMesh.rotation.x = -Math.PI / 2;
  groundMesh.frustumCulled = false;
  group.add(groundMesh, wallMesh);
  return { group, wallGeo, wallMat, groundMat, groundMesh };
}

function drawBellWave(wave: Wave, radius: number, fade: number) {
  const bell = wave.bell!;
  const { origin, time, echo } = wave;
  const expandK = Math.min(1, radius / WAVES.campana.range);
  const h = (echo ? 1.05 : 1.75) * (0.45 + 0.55 * Math.sin(Math.min(1, expandK * 1.4) * Math.PI * 0.5)) * (0.5 + 0.5 * fade);
  const pos = bell.wallGeo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i <= BELL_SEGMENTS; i++) {
    const ang = (i / BELL_SEGMENTS) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const vib = Math.sin(ang * 12 - time * 26) * 0.14 * (1 - expandK * 0.4);
    for (let row = 0; row < BELL_ROWS; row++) {
      const v = row / (BELL_ROWS - 1);
      // Bell-shaped acoustic wavefront bulging slightly outward in the middle
      const bulge = Math.sin(v * Math.PI) * 0.35;
      const r = Math.max(0.15, radius + bulge + vib);
      const x = origin.x + ca * r, z = origin.z + sa * r;
      pos.setXYZ(i * BELL_ROWS + row, x, surfaceY(x, z) + 0.08 + v * h, z);
    }
  }
  pos.needsUpdate = true;
  bell.groundMesh.position.set(origin.x, surfaceY(origin.x, origin.z) + 0.1, origin.z);
  bell.groundMesh.scale.setScalar(Math.max(0.3, radius * 1.1));
  bell.wallMat.uniforms.uOpacity.value = (echo ? 0.52 : 0.92) * fade;
  bell.groundMat.uniforms.uOpacity.value = (echo ? 0.45 : 0.88) * fade;
}

// ------------------------------------------------------------ Tormenta de Pétalos: 3D swirling sakura storm
function makePetalStormFx(): PetalStormFx {
  const group = new THREE.Group();
  group.name = TECHNIQUES.petalos.name;
  const curtainGeo = makeDynamicRingGeo(PETAL_SEGMENTS, PETAL_ROWS);
  const curtainMat = makePetalVortexMat(0.86);
  const curtainMesh = new THREE.Mesh(curtainGeo, curtainMat);
  curtainMesh.frustumCulled = false;

  const petalGeo = SAKURA_PETAL_GEO.clone();
  const petalMat = tagMat(new THREE.MeshBasicMaterial({
    color: 0xffb8d8, transparent: true, opacity: 0.95,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const petals = new THREE.InstancedMesh(petalGeo, petalMat, PETAL_COUNT);
  petals.frustumCulled = false;
  const petalSeeds = Array.from({ length: PETAL_COUNT }, (_, i) => ({
    angle: (i / PETAL_COUNT) * Math.PI * 2 + Math.random() * 0.2,
    h: 0.2 + Math.random() * 2.1,
    rOff: (Math.random() - 0.5) * 1.6,
    spinX: (Math.random() - 0.5) * 12,
    spinY: (Math.random() - 0.5) * 12,
    spinZ: (Math.random() - 0.5) * 12,
    scale: 0.65 + Math.random() * 0.9,
  }));

  group.add(curtainMesh, petals);
  return { group, curtainGeo, curtainMat, petalMat, petals, petalSeeds };
}

function drawPetalStorm(wave: Wave, radius: number, fade: number) {
  const ps = wave.petal!;
  const { origin, time } = wave;
  const expandK = Math.min(1, radius / WAVES.petalos.range);
  const h = (1.35 + 0.95 * Math.sin(Math.min(1, expandK * 1.35) * Math.PI * 0.5)) * (0.55 + 0.45 * fade);
  const pos = ps.curtainGeo.attributes.position as THREE.BufferAttribute;

  for (let i = 0; i <= PETAL_SEGMENTS; i++) {
    const ang = (i / PETAL_SEGMENTS) * Math.PI * 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    const waveMod = 0.25 * Math.sin(ang * 8 - time * 14);
    for (let row = 0; row < PETAL_ROWS; row++) {
      const v = row / (PETAL_ROWS - 1);
      const r = Math.max(0.2, radius + v * 0.55 - 0.35 + waveMod * v);
      const x = origin.x + ca * r, z = origin.z + sa * r;
      pos.setXYZ(i * PETAL_ROWS + row, x, surfaceY(x, z) + 0.1 + v * h, z);
    }
  }
  pos.needsUpdate = true;

  // Whirl 48 sculpted 3D sakura petals around the expanding tempest
  for (let i = 0; i < PETAL_COUNT; i++) {
    const s = ps.petalSeeds[i];
    const ang = s.angle + time * 4.2;
    const r = Math.max(0.25, radius + s.rOff * expandK);
    const x = origin.x + Math.cos(ang) * r;
    const z = origin.z + Math.sin(ang) * r;
    const y = surfaceY(x, z) + s.h + Math.sin(time * 7 + i) * 0.28;
    _dummy.position.set(x, y, z);
    _dummy.rotation.set(time * s.spinX + i, time * s.spinY, time * s.spinZ);
    _dummy.scale.setScalar(s.scale * (0.45 + 0.55 * fade));
    _dummy.updateMatrix();
    ps.petals.setMatrixAt(i, _dummy.matrix);
  }
  ps.petals.instanceMatrix.needsUpdate = true;
  ps.curtainMat.uniforms.uOpacity.value = 0.86 * fade;
  ps.petalMat.opacity = 0.95 * fade;
}

function drawWave(wave: Wave, radius: number, fade = 1) {
  if (wave.fire) { drawFireRing(wave, radius, fade); return; }
  if (wave.water) { drawWaterWave(wave, radius, fade); return; }
  if (wave.wind) { drawWindSlash(wave, radius, fade); return; }
  if (wave.bell) { drawBellWave(wave, radius, fade); return; }
  if (wave.petal) { drawPetalStorm(wave, radius, fade); return; }
}

function addWave(id: WaveTechniqueId, delay = 0, echo = false): Wave {
  const origin = player.pos.clone(), forward = new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face));
  const dummyMesh = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
  if (id === 'fuego') {
    const fire = makeFireRingFx();
    const wave: Wave = { id, origin, forward, mesh: dummyMesh, fire, time: -delay, hits: new Set(), healed: 0, echo };
    drawFireRing(wave, 0.3, 1);
    fire.group.visible = delay <= 0;
    waves.push(wave);
    scene.add(fire.group);
    return wave;
  }
  if (id === 'agua') {
    const water = makeWaterWaveFx();
    const wave: Wave = { id, origin, forward, mesh: dummyMesh, water, time: -delay, hits: new Set(), healed: 0, echo };
    drawWaterWave(wave, 0.4, 1);
    water.group.visible = delay <= 0;
    waves.push(wave);
    scene.add(water.group);
    return wave;
  }
  if (id === 'viento') {
    const wind = makeWindSlashFx();
    const wave: Wave = { id, origin, forward, mesh: dummyMesh, wind, time: -delay, hits: new Set(), healed: 0, echo };
    drawWindSlash(wave, 0.6, 1);
    wind.group.visible = delay <= 0;
    waves.push(wave);
    scene.add(wind.group);
    return wave;
  }
  if (id === 'campana') {
    const bell = makeBellWaveFx(echo);
    const wave: Wave = { id, origin, forward, mesh: dummyMesh, bell, time: -delay, hits: new Set(), healed: 0, echo };
    drawBellWave(wave, 0.4, 1);
    bell.group.visible = delay <= 0;
    waves.push(wave);
    scene.add(bell.group);
    return wave;
  }
  const petal = makePetalStormFx();
  const wave: Wave = { id, origin, forward, mesh: dummyMesh, petal, time: -delay, hits: new Set(), healed: 0, echo };
  drawPetalStorm(wave, 0.4, 1);
  petal.group.visible = delay <= 0;
  waves.push(wave);
  scene.add(petal.group);
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
  if (id === 'agua') {
    const launchAt = origin.clone().addScaledVector(forward, 1.4);
    spawnWaterSplashCrown(launchAt, 3.6);
    burst(launchAt.clone().add(new THREE.Vector3(0, 0.9, 0)), 0x45d8ff, 52, 7.2, 0.16);
    burst(launchAt.clone().add(new THREE.Vector3(0, 1.1, 0)), 0xf0fcff, 34, 6.4, 0.13);
    const star = origin.clone().addScaledVector(forward, 2.4).add(new THREE.Vector3(0, 1.85, 0));
    flare(star, TECHNIQUES.agua.color, { size: 1.2, life: 0.55 });
    state.shake = Math.max(state.shake, 0.32);
    sfx.splash({ power: 1.45, pan: 0 });
    sfx.swing({ power: 1.15, pan: 0 });
    return;
  }
  const at = origin.clone().addScaledVector(forward, round ? 0 : 1.2).add(new THREE.Vector3(0, 0.8, 0));
  burst(at, TECHNIQUES[id].color, round ? 75 : 42, 6, 0.17);
  // the star opens above the ronin's head (ahead of him for the waves that travel), so his own figure never hides its core
  const star = origin.clone().addScaledVector(forward, round ? 0 : 2.4).add(new THREE.Vector3(0, round ? 2.3 : 1.7, 0));
  flare(star, TECHNIQUES[id].color, { size: round ? 1.25 : 1, life: round ? 0.6 : 0.5 });
  impactRing(origin, TECHNIQUES[id].color, round ? WAVES[id].range * 0.95 : 4.5);
  if (id === 'viento') {
    spawnWindGaleBurst(origin.clone().addScaledVector(forward, 1.2), forward, 1.15);
  }
  if (id === 'campana') {
    // a majestic phantom bronze temple bell rings overhead, and two reverberation waves follow
    spawnPhantomBell(origin);
    addWave(id, 0.22, true); addWave(id, 0.46, true);
    burst(origin.clone().setY(origin.y + 0.2), 0xffcf6e, 48, 6, 0.18);
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
    } else if (id === 'agua') {
      burst(strike, 0x3ecfff, 30, 6.4, 0.16);
      burst(strike, 0xf2fcff, 18, 5.2, 0.12);
      sfx.splash({ power: 0.85, pan: panOf(p.x, p.z) });
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
  } else if (wave.water) {
    scene.remove(wave.water.group);
    wave.water.crestGeo.dispose();
    wave.water.innerGeo.dispose();
    wave.water.groundGeo.dispose();
    wave.water.plumes.geometry.dispose();
    wave.water.crestMat.dispose();
    wave.water.innerMat.dispose();
    wave.water.groundMat.dispose();
    wave.water.plumeMat.dispose();
  } else if (wave.wind) {
    scene.remove(wave.wind.group);
    wave.wind.bladeGeo.dispose();
    wave.wind.wakeGeo.dispose();
    wave.wind.swirls.geometry.dispose();
    wave.wind.bladeMat.dispose();
    wave.wind.wakeMat.dispose();
    wave.wind.swirlMat.dispose();
  } else if (wave.bell) {
    scene.remove(wave.bell.group);
    wave.bell.wallGeo.dispose();
    wave.bell.wallMat.dispose();
    wave.bell.groundMat.dispose();
  } else if (wave.petal) {
    scene.remove(wave.petal.group);
    wave.petal.curtainGeo.dispose();
    wave.petal.petals.geometry.dispose();
    wave.petal.curtainMat.dispose();
    wave.petal.petalMat.dispose();
  } else {
    scene.remove(wave.mesh);
  }
  wave.mesh.geometry.dispose();
  wave.mesh.material.dispose();
}

export function updateTechniqueWaves(dt: number) {
  for (let i = waves.length - 1; i >= 0; i--) {
    const wave = waves[i], { range, time } = WAVES[wave.id];
    const fadeDur = wave.id === 'fuego' ? FIRE_FADE : wave.id === 'agua' ? WATER_FADE : FADE;
    const before = Math.min(1, wave.time / time) * range;
    wave.time += dt;
    if (wave.time < 0) continue;                         // an echo still waiting for its turn
    const custom = wave.fire?.group ?? wave.water?.group ?? wave.wind?.group ?? wave.bell?.group ?? wave.petal?.group;
    if (custom) custom.visible = true;
    else wave.mesh.visible = true;
    const radius = Math.min(1, wave.time / time) * range;
    if (before < range && !wave.echo) hitEnemies(wave, Math.max(0, before), radius);
    if (wave.time >= time + fadeDur) { removeWave(wave); waves.splice(i, 1); continue; }
    const fade = 1 - Math.max(0, wave.time - time) / fadeDur;
    if (!custom) wave.mesh.material.opacity = (wave.echo ? 0.45 : 0.92) * fade;
    drawWave(wave, radius, fade);
    // Live emerald wind-shear sparks streaming off Corte del Vendaval
    if (wave.id === 'viento' && wave.time < time) {
      for (let k = 0; k < 3; k++) {
        const side = (Math.random() * 2 - 1) * WIND_WIDTH * 0.9;
        const ahead = Math.max(0.2, radius - 1.2 * (side / WIND_WIDTH) ** 2);
        const x = wave.origin.x + wave.forward.x * ahead + wave.forward.z * side;
        const z = wave.origin.z + wave.forward.z * ahead - wave.forward.x * side;
        burst(new THREE.Vector3(x, surfaceY(x, z) + 0.5 + Math.random() * 1.1, z), k === 0 ? 0xf0fff8 : 0x5effbe, 3, 3.2, 0.11);
      }
    }
    // Live sea-spray & white foam droplets flying off the breaking crest of Marea Lunar
    if (wave.id === 'agua' && wave.time < time + fadeDur * 0.45) {
      const count = wave.time < time ? 4 : 2;
      const { halfArc } = WAVES.agua;
      for (let k = 0; k < count; k++) {
        const a = (Math.random() * 2 - 1) * halfArc * 0.95;
        const r = Math.max(0.4, radius + (Math.random() - 0.35) * 0.8);
        const side = Math.sin(a) * r, ahead = Math.cos(a) * r;
        const x = wave.origin.x + wave.forward.x * ahead + wave.forward.z * side;
        const z = wave.origin.z + wave.forward.z * ahead - wave.forward.x * side;
        const col = k === 0 ? 0xf2fcff : k === 1 ? 0x5be0ff : 0x1ca2ff;
        burst(new THREE.Vector3(x, surfaceY(x, z) + 0.55 + Math.random() * 1.4, z), col, 5, 4.2, k === 0 ? 0.11 : 0.15);
      }
    }
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
