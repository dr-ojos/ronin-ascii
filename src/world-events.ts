// Random colossal boss world events ("Eventos de Calamidad"):
// Periodically, while exploring the wilds, a mythic titan descends in a pillar of light
// with a glowing ritual seal, visible on the horizon and marked on the map. Approaching it
// triggers a cinematic camera reveal, kanji title card, two-phase boss fight and rich rewards.
import * as THREE from 'three';
import { scene } from './renderer';
import { CLS, tagMat } from './materials';
import { addLight, removeLights, type LightAnchor } from './lights';
import { enemies, spawnEnemy, despawn } from './enemies';
import { summon } from './boss-mechanics';
import { camps } from './encounters';
import { collide, isFree } from './physics';
import { WORLD_R, PLACES, RIVER, inLake, lineDist } from './map';
import { surfaceY } from './structures';
import { burst, impactRing } from './fx';
import { bolt, skyFlash } from './special';
import { bossEventBanner, impactFlash } from './cinematic';
import { showMsg } from './hud';
import { addPoints } from './score';
import { dropLoot } from './loot';
import { grant, rollUpgrade, UPGRADES } from './upgrades';
import { sfx, panOf } from './sfx';
import { player, state } from './state';
import { rnd } from './utils';
import type { Camp, Enemy, EnemyKind } from './types';

export type WorldEventId = 'eclipse' | 'tempestad' | 'forja';

export interface WorldEventDef {
  id: WorldEventId;
  name: string;
  boss: EnemyKind;
  bossTitle: string;
  escort: EnemyKind[];
  phase2Wave: EnemyKind[];
  phase3Wave: EnemyKind[];
  kanji: string;
  subtitle: string;
  phase2Sub: string;
  phase3Sub: string;
  color: number;
  colorHex: string;
  rewardPoints: number;
  rewardJade: number;
  storm?: boolean;
}

export const WORLD_EVENTS: readonly WorldEventDef[] = [
  {
    id: 'eclipse',
    name: 'Eclipse Carmesí',
    boss: 'gashadokuro',
    bossTitle: 'Gashadokuro, Soberano del Eclipse',
    escort: ['oni', 'ashigaru', 'arquero', 'acechador'],
    phase2Wave: ['oni', 'escudero', 'acechador', 'guadanero', 'arquero'],
    phase3Wave: ['oni', 'oni', 'ashigaru', 'escudero', 'acechador', 'guadanero', 'arquero'],
    kanji: '蝕',
    subtitle: 'El cielo se tiñe de sangre · un soberano colosal despierta',
    phase2Sub: 'La luna sangrienta invoca una nueva oleada de guerreros',
    phase3Sub: 'Eclipse total · la horda final surge de las sombras',
    color: 0xff2848,
    colorHex: '#ff3b58',
    rewardPoints: 3400,
    rewardJade: 2
  },
  {
    id: 'tempestad',
    name: 'Tormenta del Dios Tronante',
    boss: 'susanooTempestad',
    bossTitle: 'Susanoo, Titán de la Tempestad',
    escort: ['ashigaru', 'arquero', 'oni', 'escudero'],
    phase2Wave: ['ashigaru', 'arquero', 'guadanero', 'oni', 'hechicero'],
    phase3Wave: ['ashigaru', 'ashigaru', 'arquero', 'escudero', 'guadanero', 'oni', 'hechicero'],
    kanji: '嵐',
    subtitle: 'Los cielos se desgarran · el titán desciende entre relámpagos',
    phase2Sub: 'Sus tambores convocan refuerzos bajo la tormenta',
    phase3Sub: 'Furia del cielo · la tempestad desata su legión final',
    color: 0x5ce1ff,
    colorHex: '#5ce1ff',
    rewardPoints: 3300,
    rewardJade: 2,
    storm: true
  },
  {
    id: 'forja',
    name: 'Forja del Cataclismo',
    boss: 'amaterasuCeniza',
    bossTitle: 'Kijin Kōtei, Emperador de la Forja',
    escort: ['oni', 'escudero', 'bruto', 'arquero'],
    phase2Wave: ['oni', 'escudero', 'piromante', 'bruto', 'ashigaru'],
    phase3Wave: ['oni', 'oni', 'escudero', 'bruto', 'piromante', 'ashigaru', 'arquero'],
    kanji: '劫',
    subtitle: 'La tierra ruge bajo ceniza ardiente · el coloso solar emerge',
    phase2Sub: 'La forja ardiente despierta más sirvientes de ceniza',
    phase3Sub: 'Cataclismo solar · el ejército de brasas rodea la arena',
    color: 0xff9828,
    colorHex: '#ff9e3d',
    rewardPoints: 3800,
    rewardJade: 2
  }
];

interface ActiveEvent {
  def: WorldEventDef;
  camp: Camp;
  x: number;
  z: number;
  timeLeft: number;
  revealed: boolean;
  fxGroup: THREE.Group;
  beacon: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  outerRing: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  innerRing: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  orbits: THREE.Group;
  light: LightAnchor;
  pulseT: number;
}

const SAFE_R = 95;
const EVENT_DURATION = 210;    // seconds before an unengaged event fades away
const REVEAL_DIST = 34;        // distance at which the cinematic boss reveal triggers

let active: ActiveEvent | null = null;
let nextEventT = rnd(40, 62);  // first calamity arrives after exploring the wilds for a bit
let lastEventId: WorldEventId | null = null;

function compassDir(dx: number, dz: number): string {
  // In this world, -Z is North (see minimap.ts: North at -Z, +X is East)
  const a = Math.atan2(dx, -dz);
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  return dirs[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

function buildArenaFx(x: number, z: number, color: number) {
  const y = surfaceY(x, z);
  const fxGroup = new THREE.Group();
  fxGroup.position.set(x, y, z);

  // Towering sky-beacon pillar visible across the open world
  const beaconGeo = new THREE.CylinderGeometry(0.45, 2.6, 90, 16, 1, true);
  const beaconMat = tagMat(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.24, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }), CLS.fx);
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.position.y = 45;
  fxGroup.add(beacon);

  // Core beam inside the beacon
  const coreGeo = new THREE.CylinderGeometry(0.16, 0.75, 90, 12, 1, true);
  const coreMat = tagMat(new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.28, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }), CLS.fx);
  const core = new THREE.Mesh(coreGeo, coreMat);
  core.position.y = 45;
  fxGroup.add(core);

  // Concentric ritual seal rings on the ground
  const outerMat = tagMat(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.55, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending
  }), CLS.fx);
  const outerRing = new THREE.Mesh(new THREE.RingGeometry(8.8, 9.6, 48), outerMat);
  outerRing.rotation.x = -Math.PI / 2;
  outerRing.position.y = 0.14;
  fxGroup.add(outerRing);

  const innerMat = tagMat(new THREE.MeshBasicMaterial({
    color: 0xfff2d6, transparent: true, opacity: 0.42, side: THREE.DoubleSide,
    depthWrite: false, blending: THREE.AdditiveBlending
  }), CLS.fx);
  const innerRing = new THREE.Mesh(new THREE.RingGeometry(5.6, 6.0, 36), innerMat);
  innerRing.rotation.x = -Math.PI / 2;
  innerRing.position.y = 0.16;
  fxGroup.add(innerRing);

  // Floating orbiting runic crystals around the calamity site
  const orbits = new THREE.Group();
  const runeGeo = new THREE.OctahedronGeometry(0.42);
  const runeMat = tagMat(new THREE.MeshBasicMaterial({
    color, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false
  }), CLS.fx);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const m = new THREE.Mesh(runeGeo, runeMat);
    m.position.set(Math.cos(a) * 7.4, 2.8 + (i % 2) * 1.4, Math.sin(a) * 7.4);
    m.scale.set(0.65, 1.5, 0.65);
    orbits.add(m);
  }
  fxGroup.add(orbits);

  scene.add(fxGroup);
  const light = addLight({ x, y: y + 4.5, z, color, intensity: 6.5, distance: 26, decay: 1.3, flicker: 0.5, owner: fxGroup });
  return { fxGroup, beacon, outerRing, innerRing, orbits, light };
}

function disposeEventFx(ev: ActiveEvent) {
  scene.remove(ev.fxGroup);
  removeLights(ev.fxGroup);
  ev.fxGroup.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    m.geometry.dispose();
    (m.material as THREE.Material).dispose();
  });
}

function findEventSpot(allowNearShrine = false): [number, number] | null {
  const px = player.pos.x, pz = player.pos.z;
  for (let k = 0; k < 28; k++) {
    // Prefer ahead of where the player is looking for the first half of attempts
    const spread = k < 14 ? rnd(-0.85, 0.85) : rnd(-Math.PI, Math.PI);
    const a = player.face + spread;
    const dist = rnd(44, 76);
    const x = px + Math.sin(a) * dist, z = pz + Math.cos(a) * dist;
    const r0 = Math.hypot(x, z);
    if (r0 > WORLD_R - 34) continue;
    if (!allowNearShrine && r0 < SAFE_R) continue;
    if (inLake(x, z, 6) || lineDist(x, z, RIVER) < 12) continue;
    if (!isFree(x, z, 3.2)) continue;
    if (PLACES.some(p => p.flat > 0 && Math.hypot(p.x - x, p.z - z) < p.r + 14)) continue;
    if (camps.some(c => c.roster.length && Math.hypot(c.x - x, c.z - z) < 34)) continue;
    return [x, z];
  }
  return null;
}

/** Spawn a random (or specific) colossal boss world event near the player. */
export function triggerWorldEvent(forcedId?: WorldEventId, forceNear = false): boolean {
  if (active || state.dead) return false;
  const spot = findEventSpot(forceNear);
  if (!spot) return false;
  const [x, z] = spot;
  const pool = forcedId ? WORLD_EVENTS.filter(e => e.id === forcedId)
    : WORLD_EVENTS.filter(e => e.id !== lastEventId);
  const def = pool[Math.floor(Math.random() * pool.length)] ?? WORLD_EVENTS[0];
  lastEventId = def.id;

  const tier = Math.max(0.55, Math.min(1, Math.hypot(x, z) / WORLD_R));
  const kinds: EnemyKind[] = [def.boss, ...def.escort];
  const camp: Camp = {
    x, z, r: 14, leash: 44, size: kinds.length,
    boss: def.boss, kinds, roster: kinds.slice(),
    tier, active: true, clearedAt: -1,
    name: def.name, temp: true, worldEvent: def.id
  };
  camps.push(camp);

  // Spawn the colossal boss at the center and its vanguard in a ceremonial arc around it
  const bossPos = { x, z }; collide(bossPos, 1.1);
  spawnEnemy(camp, def.boss, bossPos.x, bossPos.z);
  const boss = enemies[enemies.length - 1];
  boss.g.rotation.y = Math.atan2(player.pos.x - bossPos.x, player.pos.z - bossPos.z);

  def.escort.forEach((kind, idx) => {
    const a = (idx / def.escort.length) * Math.PI * 2 + 0.5;
    const ex = x + Math.cos(a) * 5.2, ez = z + Math.sin(a) * 5.2;
    const ep = { x: ex, z: ez }; collide(ep, 0.7);
    spawnEnemy(camp, kind, ep.x, ep.z);
  });

  const fx = buildArenaFx(bossPos.x, bossPos.z, def.color);
  active = {
    def, camp, x: bossPos.x, z: bossPos.z,
    timeLeft: EVENT_DURATION, revealed: false, pulseT: 0, ...fx
  };

  // Dramatic world-wide herald
  const y = surfaceY(bossPos.x, bossPos.z);
  const at = new THREE.Vector3(bossPos.x, y + 1.8, bossPos.z);
  burst(at, def.color, 130, 11, 0.22);
  impactRing(new THREE.Vector3(bossPos.x, y + 0.1, bossPos.z), def.color, 9);
  if (def.storm) {
    bolt(at.clone());
    state.raining = true;
    state.rainT = Math.max(state.rainT, 65);
  }
  skyFlash(0.5);
  impactFlash(def.color, 0.32);
  state.shake = Math.max(state.shake, 0.55);
  sfx.waveStart(true);
  sfx.taiko(1.15);
  sfx.roar({ big: true, pan: panOf(bossPos.x, bossPos.z) });

  const dx = bossPos.x - player.pos.x, dz = bossPos.z - player.pos.z;
  const dist = Math.round(Math.hypot(dx, dz));
  showMsg(
    `✦ EVENTO DE CALAMIDAD · ${def.name.toUpperCase()} ✦\n${def.bossTitle}\n${compassDir(dx, dz)} · ${dist} m · sigue el pilar de luz`,
    4.2
  );
  return true;
}

function revealBossCinematic(ev: ActiveEvent, boss: Enemy) {
  ev.revealed = true;
  const { def } = ev;
  const p = boss.g.position;
  burst(new THREE.Vector3(p.x, p.y + 2.4, p.z), def.color, 110, 9, 0.2);
  impactRing(new THREE.Vector3(p.x, p.y + 0.12, p.z), def.color, 7.5);
  if (def.storm) bolt(p.clone());
  skyFlash(0.45);
  impactFlash(def.color, 0.42);
  state.shake = Math.max(state.shake, 0.65);
  sfx.roar({ big: true, pan: panOf(p.x, p.z) });
  sfx.taiko(1.3);
  bossEventBanner({
    eyebrow: `EVENTO DE CALAMIDAD · ${def.name.toUpperCase()}`,
    kanji: def.kanji,
    title: def.bossTitle,
    subtitle: def.subtitle,
    color: def.color,
    hold: 2.9,
    slow: 0.34,
    slowDur: 1.55,
    focus: p,
    slashes: 1,
    gather: true
  });
}

/** Called from enemy-ai.ts when a colossal 3-phase world-event boss enters Phase II (66% HP) or Phase III (33% HP). */
export function onWorldEventBossPhase(boss: Enemy, phase: 2 | 3) {
  if (!active || boss.camp !== active.camp) return;
  const { def } = active;
  const p = boss.g.position;
  const wave = phase === 3 ? def.phase3Wave : def.phase2Wave;
  summon(boss, wave, wave.length);
  impactRing(new THREE.Vector3(p.x, p.y + 0.14, p.z), def.color, phase === 3 ? 12 : 9.5);
  burst(new THREE.Vector3(p.x, p.y + 2.6, p.z), def.color, phase === 3 ? 160 : 110, phase === 3 ? 11 : 8.5, 0.2);
  if (def.storm || phase === 3) bolt(p.clone());
  skyFlash(phase === 3 ? 0.72 : 0.55);
  impactFlash(def.color, phase === 3 ? 0.62 : 0.5);
  state.shake = Math.max(state.shake, phase === 3 ? 0.9 : 0.75);
  sfx.waveStart(true);
  sfx.taiko(phase === 3 ? 1.45 : 1.35);
  bossEventBanner({
    eyebrow: phase === 3 ? `FASE III · IRA FINAL (+${wave.length} ENEMIGOS)` : `FASE II · DESPERTAR COLOSAL (+${wave.length} ENEMIGOS)`,
    kanji: def.kanji,
    title: def.bossTitle,
    subtitle: phase === 3 ? def.phase3Sub : def.phase2Sub,
    color: def.color,
    hold: phase === 3 ? 2.2 : 1.9,
    slow: phase === 3 ? 0.28 : 0.32,
    slowDur: phase === 3 ? 1.05 : 0.9,
    focus: p,
    slashes: phase === 3 ? 3 : 2,
    gather: true
  });
}

/** Called from enemy-ai.ts when the colossal world-event boss is slain. */
export function onWorldEventBossDefeat(boss: Enemy): boolean {
  if (!active || boss.camp !== active.camp) return false;
  const { def } = active;
  const p = boss.g.position;
  disposeEventFx(active);
  active = null;
  nextEventT = rnd(85, 135);

  // Grand victory cinematic + generous rewards
  addPoints(def.rewardPoints, def.name.toLowerCase());
  state.jade += def.rewardJade;
  player.hp = player.maxHp;

  // Celebratory loot shower + guaranteed random upgrade
  for (let i = 0; i < 3; i++) dropLoot(p.x + rnd(-1.5, 1.5), p.z + rnd(-1.5, 1.5), 1, true);
  const upId = rollUpgrade();
  let upNote = '';
  if (upId) {
    grant(upId);
    upNote = ` · +${UPGRADES[upId].name}`;
  }

  burst(new THREE.Vector3(p.x, p.y + 2.5, p.z), def.color, 180, 12, 0.22);
  burst(new THREE.Vector3(p.x, p.y + 2.0, p.z), 0xffd27a, 140, 10, 0.18);
  impactRing(new THREE.Vector3(p.x, p.y + 0.14, p.z), 0xffd27a, 10);
  skyFlash(0.75);
  impactFlash(0xffd27a, 0.55);
  state.shake = Math.max(state.shake, 0.85);
  sfx.chime(true);
  sfx.taiko(1.4);

  bossEventBanner({
    eyebrow: `CALAMIDAD ABATIDA · ${def.name.toUpperCase()}`,
    kanji: '討',
    title: `${def.bossTitle} Caído`,
    subtitle: `+${def.rewardPoints} pts · +${def.rewardJade} sellos de jade · vida al máximo${upNote}`,
    color: 0xffd27a,
    hold: 2.8,
    slow: 0.24,
    slowDur: 1.25,
    slashes: 3
  });
  return true;
}

function expireEvent() {
  if (!active) return;
  const { camp, def } = active;
  for (let i = enemies.length - 1; i >= 0; i--) {
    if (enemies[i].camp === camp) { despawn(enemies[i]); enemies.splice(i, 1); }
  }
  const idx = camps.indexOf(camp);
  if (idx >= 0) camps.splice(idx, 1);
  disposeEventFx(active);
  active = null;
  nextEventT = rnd(70, 115);
  showMsg(`— ${def.name.toUpperCase()} SE DESVANECE EN LA NIEBLA —`, 2.4);
}

export function updateWorldEvents(dt: number) {
  if (!state.playing || state.dead) return;
  if (!active) {
    // Only tick down the timer while roaming outside the starting clearing
    if (Math.hypot(player.pos.x, player.pos.z) > SAFE_R - 15) {
      nextEventT -= dt;
      if (nextEventT <= 0) {
        if (!triggerWorldEvent()) nextEventT = rnd(8, 15);
      }
    }
    return;
  }

  const boss = enemies.find(e => e.camp === active!.camp && e.kind === active!.def.boss);
  if (!boss) {
    // Safety cleanup if boss vanished or camp was cleared
    disposeEventFx(active);
    active = null;
    nextEventT = rnd(80, 125);
    return;
  }

  // Animate the sky-beacon, ritual seal and orbiting runes
  const t = state.time;
  const d = Math.hypot(player.pos.x - boss.g.position.x, player.pos.z - boss.g.position.z);
  active.outerRing.rotation.z = t * 0.28;
  active.innerRing.rotation.z = -t * 0.45;
  active.orbits.rotation.y = t * 0.55;
  active.orbits.position.y = Math.sin(t * 2.2) * 0.35;
  // Fade the sky beacon gently once fighting up close so it never obscures combat
  const nearFade = THREE.MathUtils.clamp((d - 10) / 18, 0.18, 1);
  active.beacon.material.opacity = (0.18 + 0.08 * Math.sin(t * 3.1)) * nearFade;

  // Ambient boss aura pulses
  active.pulseT -= dt;
  if (active.pulseT <= 0) {
    active.pulseT = active.revealed ? 1.4 : 2.2;
    const bp = boss.g.position;
    burst(new THREE.Vector3(bp.x, bp.y + 2.6, bp.z), active.def.color, 18, 4.2, 0.15);
  }

  // Trigger the cinematic reveal when approaching the titan
  if (!active.revealed && (d < REVEAL_DIST || boss.state !== 'idle')) {
    revealBossCinematic(active, boss);
  }

  // Only count down expiration while the boss is not actively fighting you
  const fighting = boss.state !== 'idle' && boss.state !== 'return';
  if (!fighting) {
    active.timeLeft -= dt;
    if (active.timeLeft <= 0) expireEvent();
  }
}

export function resetWorldEvents() {
  if (active) {
    const { camp } = active;
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].camp === camp) { despawn(enemies[i]); enemies.splice(i, 1); }
    }
    const idx = camps.indexOf(camp);
    if (idx >= 0) camps.splice(idx, 1);
    disposeEventFx(active);
    active = null;
  }
  nextEventT = rnd(40, 62);
}

/** Dev-only showcase helper: summon a colossal event boss right in front of the player to inspect its art & cinematic. */
export function showcaseWorldEvent(id: WorldEventId) {
  if (!state.playing || state.dead) return false;
  resetWorldEvents();
  const def = WORLD_EVENTS.find(e => e.id === id) ?? WORLD_EVENTS[0];
  lastEventId = def.id;
  // Place the colossal boss 11 m straight ahead of the camera view
  const dirX = -Math.sin(state.yaw), dirZ = -Math.cos(state.yaw);
  const bx = player.pos.x + dirX * 11, bz = player.pos.z + dirZ * 11;
  const bossPos = { x: bx, z: bz }; collide(bossPos, 1.1);
  const kinds: EnemyKind[] = [def.boss, ...def.escort];
  const camp: Camp = {
    x: bossPos.x, z: bossPos.z, r: 14, leash: 44, size: kinds.length,
    boss: def.boss, kinds, roster: kinds.slice(),
    tier: 0.85, active: true, clearedAt: -1,
    name: def.name, temp: true, worldEvent: def.id
  };
  camps.push(camp);
  spawnEnemy(camp, def.boss, bossPos.x, bossPos.z);
  const boss = enemies[enemies.length - 1];
  boss.g.rotation.y = Math.atan2(player.pos.x - bossPos.x, player.pos.z - bossPos.z);

  def.escort.forEach((kind, idx) => {
    const a = (idx / def.escort.length) * Math.PI * 2 + 0.6;
    const ep = { x: bossPos.x + Math.cos(a) * 6.5, z: bossPos.z + Math.sin(a) * 6.5 };
    collide(ep, 0.7);
    spawnEnemy(camp, kind, ep.x, ep.z);
  });

  const fx = buildArenaFx(bossPos.x, bossPos.z, def.color);
  active = {
    def, camp, x: bossPos.x, z: bossPos.z,
    timeLeft: EVENT_DURATION, revealed: false, pulseT: 0, ...fx
  };
  if (def.storm) { state.raining = true; state.rainT = Math.max(state.rainT, 65); }
  state.pitch = 0.24;
  state.camDistUser = 13.5;
  player.invuln = Math.max(player.invuln, 15);
  revealBossCinematic(active, boss);
  return true;
}

/** Snapshot of the active world event for the HUD and minimap. */
export function activeWorldEvent() {
  if (!active) return null;
  const boss = enemies.find(e => e.camp === active!.camp && e.kind === active!.def.boss);
  const x = boss ? boss.g.position.x : active.x;
  const z = boss ? boss.g.position.z : active.z;
  const dx = x - player.pos.x, dz = z - player.pos.z;
  return {
    id: active.def.id,
    name: active.def.name,
    bossName: active.def.bossTitle,
    kanji: active.def.kanji,
    color: active.def.color,
    colorHex: active.def.colorHex,
    x, z,
    dist: Math.round(Math.hypot(dx, dz)),
    compass: compassDir(dx, dz),
    revealed: active.revealed,
    timeLeft: Math.ceil(active.timeLeft),
    bossHpFrac: boss ? Math.max(0, boss.hp / boss.maxHp) : 0,
    enraged: boss ? boss.enraged : false
  };
}

/** HUD block for the active random calamity boss event. */
export function worldEventHud(): string {
  const ev = activeWorldEvent();
  if (!ev) return '';
  const where = ev.dist > 28
    ? `  <span class="y">${ev.compass} · ${ev.dist} m</span> <span class="d">· sigue el pilar de luz</span>\n`
    : `  <span class="r">¡ EN COMBATE COLOSAL !</span>\n`;
  return `<span style="color:${ev.colorHex}">✦ EVENTO · ${ev.kanji} ${ev.name.toUpperCase()}</span>\n` +
    `  <span class="y">${ev.bossName}</span>\n` + where;
}
