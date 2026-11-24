// Camp aggro, enemy attack cycles, projectiles, retreat and rewards.
import * as THREE from 'three';
import { scene } from './renderer';
import { enemies, KINDS, despawn } from './enemies';
import { chargeBlocked, clearEnemyAttack, moveDef, prepareEnemyAttack, removeEnemyWarning, type EnemyAttack } from './enemy-moves';
import { hurtPlayer } from './damage';
import { burst } from './fx';
import { sfx, panOf } from './sfx';
import { showMsg } from './hud';
import { collide } from './physics';
import { surfaceY, wadeDepth } from './structures';
import { navTarget } from './navigation';
import { wader, splash, WADE_SINK } from './water';
import { addPoints, POINTS } from './score';
import { dropLoot, unseal } from './loot';
import { lifesteal } from './upgrades';
import { chargeKill, bolt, skyFlash } from './special';
import { circle, onEnrage, onKill, takeTurn } from './battle';
import { affixLabel } from './boss-mechanics';
import { earnTechnique, TECHNIQUES } from './techniques';
import { CLS, tagMat } from './materials';
import { player, state } from './state';
import { angDiff, rnd } from './utils';
import type { Camp, Enemy, Wildlife } from './types';

const nav = { x: 0, z: 0 };
const WILDLIFE_NAMES: Record<Wildlife, string> = {
  lobos: 'JAURÍA DE LOBOS', oso: 'OSO PARDO', jabalies: 'JABALÍES', aranas: 'ARAÑAS DE SEDA'
};

/** every idle oni of the camp starts fighting (one roar for the whole camp) */
export function alertCamp(camp: Camp) {
  let alert: Enemy | undefined;
  for (const o of enemies) {
    if (o.camp !== camp || (o.state !== 'idle' && o.state !== 'return')) continue;
    o.state = 'chase'; o.t = rnd(0, 0.4);
    alert ??= o;
  }
  if (!alert) return;
  const pan = panOf(alert.g.position.x, alert.g.position.z);
  if (camp.wildlife) {
    if (camp.wildlife === 'lobos') sfx.howl(pan);
    else if (camp.wildlife !== 'aranas') sfx.growl(pan, camp.wildlife === 'oso');
    showMsg(`¡ ${WILDLIFE_NAMES[camp.wildlife]} !`, 1.5);
    return;
  }
  sfx.roar({ big: !!(camp.boss || camp.elite), pan });
  const leader = enemies.find(e => e.camp === camp && (e.kind === camp.boss || e.kind === camp.elite));
  const traits = leader ? affixLabel(leader) : '';
  if (camp.boss && camp.roster.includes(camp.boss)) { sfx.waveStart(true); showMsg(`¡ ${KINDS[camp.boss].name.toUpperCase()} !${traits ? `\n${traits}` : ''}`, 2.2); }
  else if (camp.elite) { sfx.waveStart(true); showMsg(`¡ ${KINDS[camp.elite].name.toUpperCase()} !\n${camp.route ? 'el capitán de la patrulla' : 'el guardián del cofre'}${traits ? ` · ${traits}` : ''}`, 2.2); }
}
/** the player hit this oni: it fights back unless you are already out of its camp's reach */
export function provoke(en: Enemy) {
  if ((en.state === 'idle' || en.state === 'return') && Math.hypot(player.pos.x - en.camp.x, player.pos.z - en.camp.z) < en.camp.leash) alertCamp(en.camp);
}

export function staggerEnemy(en: Enemy, duration: number) {
  clearEnemyAttack(en);
  en.state = 'recover';
  en.t = Math.max(duration, en.dazedT ?? 0);   // a light stagger does not cut a stun short
  en.strikeT = 0;
}

function pickWander(en: Enemy) {
  // a guardian never strays from its chest
  const chest = KINDS[en.kind].elite && en.camp.chest, cx = chest ? chest.x : en.camp.x, cz = chest ? chest.z : en.camp.z;
  const a = Math.random() * Math.PI * 2, r = chest ? 1.6 + Math.random() * 1.6 : Math.sqrt(Math.random()) * en.camp.r * 0.75;
  en.wander.x = cx + Math.cos(a) * r; en.wander.z = cz + Math.sin(a) * r;
}

// ------------------------------------------------------------ arrows
const ARROW = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4).rotateX(Math.PI / 2);
const arrowMat = tagMat(new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), CLS.fx);
const CRESCENT = new THREE.RingGeometry(1.32, 1.58, 32, 1, -2.55, 1.96).rotateX(-Math.PI / 2).translate(0, 0, -0.93);
const crescentMat = tagMat(new THREE.MeshBasicMaterial({ color: 0x9aeaff, transparent: true, opacity: 0.86, side: THREE.DoubleSide, depthWrite: false }), CLS.fx);
const projectiles: { m: THREE.Mesh; v: THREE.Vector3; life: number; dmg: number; waveWidth?: number }[] = [];
function shoot(en: Enemy, yaw = 0, target?: THREE.Vector3, dmg = en.dmg) {
  const from = new THREE.Vector3(en.g.position.x, en.g.position.y + 1.4 * en.scale, en.g.position.z);
  // aim where you will be (a little), at chest height
  const to = (target ?? player.pos).clone().addScaledVector(UP, 1.1);
  const flight = from.distanceTo(to) / 24;
  if (!target && player.moving > 0.5) to.addScaledVector(lastMove, 5.6 * flight * 0.6);
  const v = to.sub(from).normalize().multiplyScalar(24).applyAxisAngle(UP, yaw);
  const m = new THREE.Mesh(ARROW, arrowMat); m.position.copy(from); m.lookAt(from.clone().add(v)); scene.add(m);
  projectiles.push({ m, v, life: 1.4, dmg });
  if (yaw === 0) sfx.arrow(panOf(from.x, from.z));
}
const UP = new THREE.Vector3(0, 1, 0);
const lastMove = new THREE.Vector3(), prevPos = new THREE.Vector3();
function castCrescent(attack: EnemyAttack, width: number, dmg: number) {
  if (attack.length <= 0) return;
  const v = new THREE.Vector3(Math.sin(attack.yaw), 0, Math.cos(attack.yaw)).multiplyScalar(10.5);
  const m = new THREE.Mesh(CRESCENT, crescentMat);
  m.position.copy(attack.origin); m.position.y += 0.55;
  m.rotation.y = attack.yaw; m.scale.x = width / 1.32; scene.add(m);
  projectiles.push({ m, v, life: attack.length / v.length(), dmg, waveWidth: width });
  sfx.swing({ power: 0.9, pan: panOf(m.position.x, m.position.z) });
}

function updateProjectiles(dt: number) {
  if (dt > 0) { lastMove.subVectors(player.pos, prevPos).setY(0); if (lastMove.lengthSq() > 1e-6) lastMove.normalize(); prevPos.copy(player.pos); }
  for (let i = projectiles.length - 1; i >= 0; i--) {
    const a = projectiles[i];
    a.m.position.addScaledVector(a.v, dt); a.life -= dt;
    const p = a.m.position, dx = p.x - player.pos.x, dz = p.z - player.pos.z, dy = p.y - (player.pos.y + 1.1);
    let gone = a.life <= 0 || p.y < surfaceY(p.x, p.z);
    let hits = dx * dx + dz * dz < 0.5 && Math.abs(dy) < 1.1;
    if (a.waveWidth) {
      p.y = surfaceY(p.x, p.z) + 0.55;
      const speed = a.v.length(), forward = (dx * a.v.x + dz * a.v.z) / speed, side = (dx * a.v.z - dz * a.v.x) / speed;
      gone = a.life <= 0;
      hits = Math.abs(forward) < 0.65 && Math.abs(side) < a.waveWidth;
    }
    if (!gone && hits) {
      gone = true;
      if (player.invuln > 0) burst(p.clone(), 0xffffff, 10, 3, 0.08);   // dodged through it
      else hurtPlayer(a.dmg);
    }
    if (gone) { scene.remove(a.m); projectiles.splice(i, 1); }
  }
}
export function clearEnemyHazards() {
  for (const a of projectiles) scene.remove(a.m); projectiles.length = 0;
  for (const k of marks) { scene.remove(k.m); k.m.material.dispose(); }
  marks.length = 0;
  for (const patch of fires) removeEnemyWarning(patch.warning);
  fires.length = 0;
}

// ------------------------------------------------------------ the thunder oni's lightning
// each strike is marked on the ground (a blue ring closing in) a moment before the bolt falls
const MARK = new THREE.RingGeometry(0.15, 1.8, 32).rotateX(-Math.PI / 2);
const marks: { m: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial>; t: number; max: number; dmg: number }[] = [];
function callThunder(en: Enemy) {
  const n = en.camp.tier > 0.6 ? 5 : 3;
  for (let i = 0; i < n; i++) {
    // the first one right where you are, the others around it
    const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : rnd(2.2, 4.5);
    const x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
    const mat = tagMat(new THREE.MeshBasicMaterial({ color: 0x9fc0ff, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }), CLS.fx);
    const m = new THREE.Mesh(MARK, mat); m.position.set(x, surfaceY(x, z) + 0.06, z); scene.add(m);
    const t = 0.95 + i * 0.18;
    marks.push({ m, t, max: t, dmg: en.dmg });
  }
  sfx.warn(panOf(en.g.position.x, en.g.position.z));
}
function updateMarks(dt: number) {
  for (let i = marks.length - 1; i >= 0; i--) {
    const k = marks[i]; k.t -= dt;
    const p = 1 - Math.max(0, k.t) / k.max;
    k.m.material.opacity = 0.25 + 0.55 * p * (0.7 + 0.3 * Math.sin(state.time * 40));
    k.m.scale.setScalar(1.25 - p * 0.25);
    if (k.t <= 0) {
      const pos = k.m.position;
      bolt(pos.clone()); skyFlash(0.2); state.shake = Math.max(state.shake, 0.35);
      sfx.thunder(panOf(pos.x, pos.z), false);
      if (Math.hypot(player.pos.x - pos.x, player.pos.z - pos.z) < 1.9) hurtPlayer(k.dmg);
      scene.remove(k.m); k.m.material.dispose(); marks.splice(i, 1);
    }
  }
}

/** The tengu withdraws. The shadow instead approaches from one side. */
export function blink(en: Enemy, flank = false) {
  const g = en.g, from = g.position.clone();
  const bearing = Math.atan2(g.position.x - player.pos.x, g.position.z - player.pos.z);
  const color = flank ? 0xbc93ff : 0xe8e8f0;
  for (let k = 0; k < 10; k++) {
    const offset = flank ? (k % 2 ? -1 : 1) * rnd(1.45, 2.15) : rnd(-1.2, 1.2);
    const a = bearing + offset, r = flank ? rnd(3.1, 3.7) : rnd(8, 11);
    const x = player.pos.x + Math.sin(a) * r, z = player.pos.z + Math.cos(a) * r;
    if (Math.hypot(x - en.camp.x, z - en.camp.z) > en.camp.leash - 3) continue;
    const p = new THREE.Vector3(x, 0, z); collide(p, 0.6);
    if (flank && Math.hypot(p.x - x, p.z - z) > 0.05) continue;
    g.position.set(p.x, surfaceY(p.x, p.z), p.z);
    burst(from.setY(from.y + 1.2), color, 50, 6, 0.16);
    burst(new THREE.Vector3(p.x, g.position.y + 1.2, p.z), color, 40, 5, 0.14);
    sfx.warn(panOf(p.x, p.z));
    en.cd = flank ? rnd(5, 7) : rnd(3.5, 5);
    en.state = 'recover'; en.t = flank ? 0.48 : 0.35;
    return;
  }
  en.cd = 1;   // nowhere to go: try again in a moment
}

/** a ground slam: hurts you anywhere inside the radius */
function slam(en: Enemy, r: number) {
  const g = en.g;
  burst(new THREE.Vector3(g.position.x, g.position.y + 0.2, g.position.z), 0xb8a890, 90, 9, 0.18);
  state.shake = Math.max(state.shake, 0.45); sfx.taiko(0.7);
  if (Math.hypot(player.pos.x - g.position.x, player.pos.z - g.position.z) < r) hurtPlayer(en.dmg);
}

const CHARGE_T = 0.36;
const moveDamage = (en: Enemy, attack: EnemyAttack) => Math.round(en.dmg * attack.move.power * (en.enraged ? 1.18 : 1));

interface FirePatch {
  owner: Enemy;
  centers: THREE.Vector3[];
  warning: EnemyAttack['warning'];
  radius: number;
  damage: number;
  life: number;
  pulse: number;
}
const fires: FirePatch[] = [];

function updateFire(dt: number) {
  for (let i = fires.length - 1; i >= 0; i--) {
    const p = fires[i];
    p.life -= dt;
    if (p.life <= 0 || p.owner.hp <= 0 || !p.owner.g.parent || p.owner.state === 'return' || state.dead) {
      removeEnemyWarning(p.warning);
      fires.splice(i, 1);
      continue;
    }
    p.warning.material.opacity = Math.min(1, p.life * 4) * (0.79 + 0.11 * Math.sin(state.time * 12));
    p.pulse -= dt;
    if (p.pulse > 0) continue;
    p.pulse = 0.55;
    for (const center of p.centers) burst(center, 0xff793c, 20, 4, 0.14);
    if (p.centers.some(center => Math.hypot(player.pos.x - center.x, player.pos.z - center.z) < p.radius)) hurtPlayer(p.damage);
  }
}

function rallyTarget(healer: Enemy, ally: Enemy, origin: THREE.Vector3, radius: number) {
  const def = KINDS[ally.kind];
  return ally !== healer && ally.camp === healer.camp && ally.hp > 0 && ally.hp < ally.maxHp
    && ally.state !== 'return' && !def.boss && !def.elite
    && Math.hypot(ally.g.position.x - origin.x, ally.g.position.z - origin.z) < radius;
}

function pullPlayer(dx: number, dz: number, distance: number, strength: number) {
  const shift = Math.min(strength, distance - 0.7);
  if (shift <= 0 || state.dead) return;
  const steps = Math.ceil(shift / 0.25);
  for (let i = 0; i < steps; i++) {
    player.pos.x -= dx / distance * shift / steps;
    player.pos.z -= dz / distance * shift / steps;
    collide(player.pos, 0.45);
  }
}

function finishMove(en: Enemy, attack: EnemyAttack) {
  clearEnemyAttack(en);
  en.state = 'recover';
  en.t = attack.move.recovery * (en.enraged ? 0.9 : 1);
}

function executeMove(en: Enemy, attack: EnemyAttack) {
  const { move, origin, yaw, target, zones } = attack, dmg = moveDamage(en, attack);
  en.swings++;
  en.strikeT = 0.24;
  if (move.shape === 'charge') {
    en.state = 'charge';
    en.t = move.duration ?? CHARGE_T;
    sfx.dash();
    return;
  }
  if (move.shape === 'wave') {
    castCrescent(attack, move.width, dmg);
  } else if (move.shape === 'volley') {
    for (let i = 0; i < move.arrows; i++) {
      shoot(en, move.angle * (2 * i / (move.arrows - 1) - 1), target, dmg);
    }
  } else if (move.shape === 'arc' && move.heal) {
    for (const ally of enemies) {
      if (!rallyTarget(en, ally, origin, move.radius)) continue;
      ally.hp = Math.min(ally.maxHp, ally.hp + Math.min(3, ally.maxHp * move.heal));
      burst(ally.g.position.clone().add(new THREE.Vector3(0, 0.7, 0)), move.color, 26, 3, 0.12);
    }
    burst(origin.clone().add(new THREE.Vector3(0, 0.75, 0)), move.color, 45, 6, 0.16);
    sfx.taiko(0.8);
  } else if (move.shape === 'arc') {
    const dx = player.pos.x - origin.x, dz = player.pos.z - origin.z;
    const distance = Math.hypot(dx, dz);
    if (distance >= (move.innerRadius ?? 0) && distance < move.radius && Math.abs(angDiff(Math.atan2(dx, dz), yaw)) <= move.angle) {
      if (hurtPlayer(dmg) && move.pull) pullPlayer(dx, dz, distance, move.pull);
    }
    const edge = origin.clone().add(new THREE.Vector3(Math.sin(yaw), 0.24, Math.cos(yaw)).multiplyScalar(move.angle < Math.PI ? move.radius * 0.55 : 1));
    burst(edge, move.color, 80, 8, 0.16);
    state.shake = Math.max(state.shake, move.angle === Math.PI ? 0.6 : 0.3);
    sfx.taiko(0.7);
  } else {
    const centers = zones.map(({ x, z }) => new THREE.Vector3(x, surfaceY(x, z) + 0.12, z));
    for (const p of centers) {
      if (move.effect === 'thunder') bolt(p);
      else burst(p, move.color, 54, 8, 0.18);
    }
    if (centers.some(p => Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < move.radius)) {
      if (hurtPlayer(dmg) && move.effect === 'web' && !state.dead) player.snareT = Math.max(player.snareT, 1.9);
    }
    if (move.effect === 'fire') {
      fires.push({ owner: en, centers, warning: attack.warning, radius: move.radius, damage: Math.max(1, Math.round(dmg * 0.48)), life: 2.55, pulse: 0.6 });
      en.attack = undefined;   // the fire keeps its own ground marker until it expires
    }
    if (move.effect === 'thunder') { skyFlash(0.35); sfx.thunder(panOf(target.x, target.z), en.enraged); }
    else sfx.taiko(0.45);
  }
  finishMove(en, attack);
}

function advanceCharge(en: Enemy, attack: EnemyAttack) {
  const { move, origin, yaw, length } = attack, p = en.g.position;
  if (move.shape !== 'charge') return;
  const fx = Math.sin(yaw), fz = Math.cos(yaw), distance = length * (1 - Math.max(en.t, 0) / (move.duration ?? CHARGE_T));
  const prev = (p.x - origin.x) * fx + (p.z - origin.z) * fz;
  const x = origin.x + distance * fx, z = origin.z + distance * fz;
  const blocked = chargeBlocked(en, x, z);
  if (!blocked) {
    p.x = x; p.z = z;
    const dx = player.pos.x - origin.x, dz = player.pos.z - origin.z;
    const forward = dx * fx + dz * fz;
    if (!attack.hit && length > 0 && forward >= prev - 0.2 && forward <= distance && Math.abs(dx * fz - dz * fx) < move.width) {
      attack.hit = true;
      hurtPlayer(moveDamage(en, attack));
    }
  }
  if (blocked || en.t <= 0) finishMove(en, attack);
}

// ------------------------------------------------------------ every frame
const tmp = new THREE.Vector3(), step = new THREE.Vector3();
/** does this chaser have to go the long way round (nav holds where to)? Archers in range just shoot. */
function detour(en: Enemy, d: number, shootRange: number) {
  const g = en.g;
  navTarget(g.position.x, g.position.z, player.pos.x, player.pos.z, nav);
  const roundabout = Math.abs(nav.x - player.pos.x) > 0.01 || Math.abs(nav.z - player.pos.z) > 0.01;
  if (shootRange > 0 && d < shootRange + 1) return false;
  return roundabout;
}

export function updateEnemies(dt: number) {
  updateProjectiles(dt);
  updateMarks(dt);
  updateFire(dt);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const en = enemies[i], g = en.g, camp = en.camp, def = KINDS[en.kind];
    if (en.hp <= 0) { kill(en, i, surfaceY(g.position.x, g.position.z) - wadeDepth(g.position.x, g.position.z) * WADE_SINK); continue; }
    tmp.subVectors(player.pos, g.position); tmp.y = 0;
    const ranged = !!def.ranged, d = tmp.length(), reach = ranged ? en.reach : en.reach * en.scale + 0.3;
    const fromHome = Math.hypot(g.position.x - camp.x, g.position.z - camp.z);
    const youFromHome = Math.hypot(player.pos.x - camp.x, player.pos.z - camp.z);
    let walk = 0, heading: number | null = null;   // speed this frame (for the walk cycle) and where it looks
    const leaving = fromHome > camp.leash || youFromHome > camp.leash + 4 || state.dead;
    if (def.boss && !en.enraged && en.hp <= en.maxHp * 0.5 && en.state !== 'idle' && en.state !== 'return' && !leaving) {
      en.enraged = true;
      burst(g.position.clone().add(new THREE.Vector3(0, 1.25, 0)), def.boss.aura, 90, 7, 0.16);
      if (en.aura) en.aura.intensity = 4;
      sfx.roar({ big: true, pan: panOf(g.position.x, g.position.z) });
      onEnrage(en);
      showMsg(`¡ ${def.name.toUpperCase()} ENFURECIDO !\nllama a sus refuerzos`, 2);
    }
    const speed = en.speed * (en.enraged ? 1.13 : 1) * (1 - 0.4 * wadeDepth(g.position.x, g.position.z));
    en.t -= dt; en.cd -= dt;
    en.strikeT = Math.max(0, en.strikeT - dt);
    const slamming = en.kind === 'bruto' || (en.kind === 'raijin' && en.swings % 3 === 2);
    const thunder = en.kind === 'raijin' && en.swings % 3 === 1;   // calls lightning from afar
    const combo = en.kind === 'kensei' && en.swings % 3 !== 0;     // the 2nd and 3rd lunge of a combo

    if (en.state === 'idle' || en.state === 'return') {
      const home = en.state === 'return';
      // going home finds its way round the plateaus (and down from them) like a chase does
      if (home) navTarget(g.position.x, g.position.z, camp.x, camp.z, nav);
      const tx = home ? nav.x : en.wander.x, tz = home ? nav.z : en.wander.z;
      step.set(tx - g.position.x, 0, tz - g.position.z);
      const left = step.length();
      if (home) en.hp = Math.min(en.maxHp, en.hp + en.maxHp * 0.4 * dt);
      if (home && fromHome < camp.r * 0.5) {
        en.state = 'idle'; en.hp = en.maxHp; en.enraged = false; en.swings = 0;
        if (en.aura) en.aura.intensity = 2.6;
        pickWander(en); en.t = rnd(1, 3);
      }
      else if (left > 0.6 && (home || en.t <= 0)) {
        walk = speed * (home ? 1.2 : 0.32);
        g.position.addScaledVector(step.multiplyScalar(1 / left), Math.min(left, walk * dt));
        heading = Math.atan2(step.x, step.z);
      } else if (!home && en.t <= 0) { pickWander(en); en.t = rnd(1.5, 5); }   // got there: rest a while, then pick a new spot
      // notice the player (only while idle: a returning oni ignores you until it is home)
      const sight = (def.boss || ranged || camp.wildlife === 'lobos' ? 16 : def.heavy || def.elite ? 14 : 11) * (state.dead ? 0 : 1);
      if (!home && d < sight && youFromHome < camp.leash) alertCamp(camp);
    } else if (leaving) {
      clearEnemyAttack(en);
      en.state = 'return';
    } else if (en.state === 'chase' && detour(en, d, ranged ? en.reach : 0)) {
      // a cliff is in the way (or you are up where it can't reach yet): walk the way round, don't strike
      step.set(nav.x - g.position.x, 0, nav.z - g.position.z);
      const left = step.length();
      walk = speed;
      if (left > 0.3) { g.position.addScaledVector(step.multiplyScalar(1 / left), Math.min(left, speed * dt)); heading = Math.atan2(step.x, step.z); }
    } else if (en.state === 'chase') {
      const cycle = en.enraged ? def.boss?.enraged : def.moves;
      if (en.kind === 'sombra' && d > 5 && d < 12 && en.cd <= 0) blink(en, true);
      else if (cycle) {
        const planned = moveDef(cycle[en.swings % cycle.length]);
        const move = planned.shape === 'arc' && planned.heal
          && !enemies.some(ally => rallyTarget(en, ally, g.position, planned.radius)) ? moveDef('staffStrike') : planned;
        const pack = camp.wildlife === 'lobos' && camp.roster.length > 1;
        const waiting = pack && enemies.some(o => o !== en && o.camp === camp && (o.state === 'windup' || o.state === 'charge'));
        const turn = takeTurn(en);
        if (d <= move.range && en.t <= 0 && !waiting && turn) {
          en.attack = prepareEnemyAttack(en, move, player.pos, Math.atan2(tmp.x, tmp.z));
          en.state = 'windup'; en.t = en.attack.windup; en.knock.set(0, 0, 0);
          if (def.beast) {
            if (def.beast.species !== 'spider') sfx.growl(panOf(g.position.x, g.position.z), def.beast.species === 'bear');
          } else sfx.warn(panOf(g.position.x, g.position.z));
        } else if (!turn && d < move.range + 4) {
          walk = circle(en, tmp.x, tmp.z, d, speed, dt);   // not its turn: circle and wait (battle.ts)
        } else if (pack && d < 11 && fromHome < camp.leash - 3) {
          // Move along different arcs. The next wolf closes in as the attacker starts recovering.
          const side = Math.floor(en.seed * 10) % 2 === 0 ? 1 : -1;
          const closing = d > move.range;
          const radial = closing ? 1.75 : d < 2.4 ? -0.65 : 0.12;
          step.set(tmp.x * radial - tmp.z * side, 0, tmp.z * radial + tmp.x * side).normalize();
          walk = closing ? speed : speed * 0.76;
          g.position.addScaledVector(step, walk * dt);
        } else if (d > move.range || (ranged && d < 5 && fromHome < camp.leash - 2)) {
          walk = speed;
          g.position.addScaledVector(step.copy(tmp).normalize(), (d > move.range ? 1 : -0.85) * speed * dt);
        }
      } else if (en.kind === 'tengu' && d < 3.5 && en.cd <= 0) blink(en);
      else if (ranged) {
        // keep a shooting distance: back off when you get close, come closer when you are out of range
        const want = d < 6 ? -1 : d > reach ? 1 : 0;
        if (want) { walk = speed * (want < 0 ? 0.9 : 1); g.position.addScaledVector(step.copy(tmp).normalize(), want * walk * dt); }
        if (d < reach + 1 && en.t <= 0) { en.state = 'windup'; en.t = en.windup; }
      } else if (!takeTurn(en) && d < reach + 4) walk = circle(en, tmp.x, tmp.z, d, speed, dt);   // not its turn (battle.ts)
      else if (d > reach && !(thunder && d < 13)) { walk = speed; g.position.addScaledVector(step.copy(tmp).normalize(), speed * dt); }
      else if (en.t <= 0) { en.state = 'windup'; en.t = en.windup * (slamming ? 1.25 : combo ? 0.55 : 1); sfx.warn(panOf(g.position.x, g.position.z)); }
    } else if (en.state === 'windup') {
      if (en.t <= 0 && en.attack) executeMove(en, en.attack);
      else if (en.t <= 0) {
        en.swings++;
        if (en.kind === 'tengu') {
          // a fan of three arrows, and every third time a wide one of five
          const fan = en.swings % 3 === 0 ? [-0.36, -0.18, 0, 0.18, 0.36] : [-0.16, 0, 0.16];
          for (const y of fan) shoot(en, y);
          en.state = 'recover'; en.t = rnd(1.0, 1.4);
        } else if (ranged) { shoot(en); en.state = 'recover'; en.t = rnd(1.1, 1.6); }
        else if (thunder) { callThunder(en); en.state = 'recover'; en.t = 1.1; }
        else {
          if (slamming) slam(en, 2.9 * en.scale);
          else if (d < reach * 1.35) hurtPlayer(en.dmg);
          // the spearman lunges, everyone else steps into the blow
          const lunge = en.kind === 'ashigaru' || en.kind === 'kensei';
          en.knock.copy(tmp).normalize().multiplyScalar(lunge ? (en.kind === 'kensei' ? 13 : 11) : slamming ? 0 : 5);
          // the kensei chains its lunges, then stands still for a long moment after the third
          en.state = 'recover'; en.t = en.kind === 'kensei' ? (en.swings % 3 !== 0 ? 0.2 : 1.35) : en.kind === 'ashigaru' ? 0.55 : 0.7;
        }
      }
    } else if (en.state === 'charge' && en.attack) {
      const move = en.attack.move;
      walk = move.shape === 'charge' ? en.attack.length / (move.duration ?? CHARGE_T) : 0;
      advanceCharge(en, en.attack);
    } else if (en.t <= 0) {
      en.state = 'chase';
      en.t = ranged ? (def.moves ? 0.32 : 0) : combo ? 0 : rnd(0.05, 0.3);
    }

    if (!en.attack) g.position.addScaledVector(en.knock, dt);
    en.knock.multiplyScalar(Math.exp(-7 * dt));
    for (const o of enemies) {
      if (o === en || en.attack) continue;
      const dx = g.position.x - o.g.position.x, dz = g.position.z - o.g.position.z, dd = Math.hypot(dx, dz), m = 0.6 * (en.scale + o.scale);
      if (dd < m && dd > 1e-4) { g.position.x += dx / dd * (m - dd) * 0.5; g.position.z += dz / dd * (m - dd) * 0.5; }
    }
    collide(g.position, 0.5 * en.scale);
    const wd = wadeDepth(g.position.x, g.position.z), gy = surfaceY(g.position.x, g.position.z) - wd * WADE_SINK;
    g.position.y = gy;
    let w = waders.get(en); if (!w) waders.set(en, w = wader());
    w(dt, g.position.x, gy + wd * WADE_SINK, g.position.z, wd, walk > 0 || en.knock.lengthSq() > 4 ? 1 : 0);
    const fighting = en.state !== 'idle' && en.state !== 'return';
    if (fighting) heading = en.attack ? en.attack.yaw : Math.atan2(tmp.x, tmp.z);
    if (heading !== null) g.rotation.y += angDiff(heading, g.rotation.y) * Math.min(1, dt * (fighting ? 14 : 5));
    const wind = en.state === 'windup';
    if (en.model) {
      en.move += ((walk > 0 ? 1 : 0) - en.move) * Math.min(1, dt * 8);
      const strike = def.moves ? en.strikeT > 0 || en.state === 'charge' : en.state === 'recover' && en.t > 0.45;
      en.model.update(dt, { moving: en.move, speed: Math.max(walk, 1), state: wind ? 'windup' : strike ? 'strike' : 'idle' });
    } else {
      g.position.y = gy + 0.08 + Math.sin(state.time * 3 + en.seed) * 0.07;
      g.rotation.x = wind ? -0.25 : (en.state === 'recover' ? 0.15 : 0);
    }
    // the warning ring: wide for a slam, faint for an arrow being drawn
    if (en.attack) {
      const progress = wind ? 1 - Math.max(0, en.t) / en.attack.windup : 1;
      en.attack.warning.material.opacity = 0.76 + 0.24 * progress;
    }
    en.ring.material.opacity = wind && !en.attack ? (ranged || thunder ? 0.3 : 0.5 + 0.5 * Math.sin(state.time * 30)) : 0;
    en.ring.scale.setScalar(wind ? (slamming ? 2.9 / 1.05 : 1 + (1 - Math.max(0, en.t) / en.windup) * 0.3) : 1);
    en.flash = Math.max(0, en.flash - dt * 6);
    if (en.model) en.model.setFlash(en.flash); else { en.robeMat.emissive.setScalar(en.flash); en.maskMat.emissive.setScalar(en.flash); }
    if (en.aura) { en.aura.x = g.position.x; en.aura.y = gy + 2.2 * en.scale; en.aura.z = g.position.z; }
  }
}

const waders = new WeakMap<Enemy, ReturnType<typeof wader>>();

function kill(en: Enemy, i: number, gy: number) {
  const g = en.g, camp = en.camp, def = KINDS[en.kind];
  const wd = wadeDepth(g.position.x, g.position.z);
  if (wd > 0.1) splash(g.position.x, gy + wd * WADE_SINK, g.position.z, en.big ? 1.8 : 1.2);
  const c = new THREE.Vector3(g.position.x, gy + (def.beast ? 0.7 : 1.2) * en.scale, g.position.z);
  burst(c, 0xff3a2a, en.big ? 160 : 70, en.big ? 10 : 7);
  burst(c, 0xffe0c0, 30, 4, 0.1);
  despawn(en); enemies.splice(i, 1); state.kills++; onKill(en);
  const pan = panOf(g.position.x, g.position.z);
  if (def.beast) sfx.hit({ heavy: en.big, pan });
  else sfx.death({ big: en.big, pan });
  addPoints(Math.round(def.points * (1 + camp.tier * 0.5) * (1 + (camp.threat?.rank ?? 0) * 0.08) / 10) * 10, def.name, true);
  chargeKill();
  if (lifesteal()) player.hp = Math.min(player.maxHp, player.hp + lifesteal());
  if (en.big) state.shake = 0.6;
  dropLoot(g.position.x, g.position.z, camp.tier, !!(def.boss || def.elite));
  const r = camp.roster.indexOf(en.kind); if (r >= 0) camp.roster.splice(r, 1);
  if (camp.roster.length === 0) campCleared(camp, en.kind);
  else if (def.boss) {
    const escort = camp.chest?.state === 'sealed' ? '\nel cofre se abrirá cuando caiga su escolta' : '';
    showMsg(`¡ ${def.name.toUpperCase()} ABATIDO !${escort}`, 2.2);
  }
  else if (def.elite && camp.chest && camp.chest.state === 'sealed') {   // the guardian fell: its chest opens even if its escort lives
    unseal(camp.chest); sfx.taiko(1); addPoints(POINTS.eliteCamp, def.name);
    showMsg(`¡ ${def.name.toUpperCase()} ABATIDO !\n+${POINTS.eliteCamp}  ·  el cofre se ha abierto`, 2.2);
  }
}

function campCleared(camp: Camp, last: Enemy['kind']) {
  camp.clearedAt = state.time;
  if (camp.wildlife) {
    const bonus = 55 * camp.size;
    addPoints(bonus, WILDLIFE_NAMES[camp.wildlife].toLowerCase());
    player.hp = Math.min(player.maxHp, player.hp + 10);
    showMsg(`— ENCUENTRO SUPERADO —\n+${bonus}  ·  +10 vida`, 1.7);
    return;
  }
  state.campsCleared++;
  // (a guardian killed before its escort was already paid for)
  const eliteLast = camp.elite && camp.chest?.state === 'sealed';
  const bonus = camp.boss ? POINTS.bossCamp : eliteLast ? POINTS.eliteCamp + POINTS.camp * (camp.size - 1) : POINTS.camp * camp.size;
  addPoints(bonus, camp.temp ? 'emboscada superada' : camp.route ? 'patrulla abatida' : 'guarida limpia');
  player.hp = Math.min(player.maxHp, player.hp + 20);
  sfx.taiko(1.1);
  const title = (camp.boss === last || (eliteLast && camp.elite === last)) ? `¡ ${KINDS[last].name.toUpperCase()} ABATIDO !` : camp.temp ? '— EMBOSCADA SUPERADA —' : camp.route ? '— PATRULLA ABATIDA —' : '— GUARIDA LIMPIA —';
  const chest = camp.chest && camp.chest.state === 'sealed' ? '\nel cofre se ha abierto' : '';
  if (camp.chest) unseal(camp.chest);
  if (camp.technique && earnTechnique(camp.technique)) {
    sfx.chime(true); skyFlash(0.6);
    showMsg(`${title}\n— HAS GANADO ${TECHNIQUES[camp.technique].name.toUpperCase()} —\nequipada · P para usarla · O para cambiar`, 3.6);
    return;
  }
  showMsg(`${title}\n+${bonus}  ·  +20 vida${chest}`, 2.2);
}
