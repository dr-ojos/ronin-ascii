// Oni behaviour. Each oni guards its camp: it ambles around its territory (idle), notices you when you
// come close (the whole camp joins in), then fights in its own way:
//  - oni: walks up, winds up, strikes in front          - lancero: fast, lunges from further away
//  - arquero: keeps its distance and shoots arrows       - bruto: slams the ground all around it
//  - jefe: strikes, and every third attack slams the ground
// They are leashed to the camp: lead them too far from home (or run away) and they give up, walk back
// and heal. Also arrows in flight, knockback, crowding, hit flash, death, drops and the points they give.
import * as THREE from 'three';
import { scene } from './renderer';
import { enemies, KINDS } from './enemies';
import { hurtPlayer } from './damage';
import { burst } from './fx';
import { sfx, panOf } from './sfx';
import { showMsg } from './hud';
import { collide } from './physics';
import { surfaceY, wadeDepth } from './structures';
import { wader, splash, WADE_SINK } from './water';
import { addPoints, POINTS } from './score';
import { dropLoot, unseal } from './loot';
import { lifesteal } from './upgrades';
import { chargeKill } from './special';
import { CLS, tagMat } from './materials';
import { player, state } from './state';
import { angDiff, rnd } from './utils';
import type { Camp, Enemy } from './types';

/** every idle oni of the camp starts fighting (one roar for the whole camp) */
export function alertCamp(camp: Camp) {
  let roared = false;
  for (const o of enemies) {
    if (o.camp !== camp || (o.state !== 'idle' && o.state !== 'return')) continue;
    o.state = 'chase'; o.t = rnd(0, 0.4);
    if (!roared) { roared = true; sfx.roar({ big: camp.boss, pan: panOf(o.g.position.x, o.g.position.z) }); }
  }
  if (camp.boss && roared) { sfx.waveStart(true); showMsg('¡ un oni gigante te ha visto !', 1.6); }
}
/** the player hit this oni: it fights back unless you are already out of its camp's reach */
export function provoke(en: Enemy) {
  if ((en.state === 'idle' || en.state === 'return') && Math.hypot(player.pos.x - en.camp.x, player.pos.z - en.camp.z) < en.camp.leash) alertCamp(en.camp);
}

function pickWander(en: Enemy) {
  const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * en.camp.r * 0.75;
  en.wander.x = en.camp.x + Math.cos(a) * r; en.wander.z = en.camp.z + Math.sin(a) * r;
}

// ------------------------------------------------------------ arrows
const ARROW = new THREE.CylinderGeometry(0.025, 0.025, 0.9, 4).rotateX(Math.PI / 2);
const arrowMat = tagMat(new THREE.MeshBasicMaterial({ color: 0xffe2a0 }), CLS.fx);
const arrows: { m: THREE.Mesh; v: THREE.Vector3; life: number; dmg: number }[] = [];
function shoot(en: Enemy) {
  const from = new THREE.Vector3(en.g.position.x, en.g.position.y + 1.4 * en.scale, en.g.position.z);
  // aim where you will be (a little), at chest height
  const to = new THREE.Vector3(player.pos.x, player.pos.y + 1.1, player.pos.z);
  const flight = from.distanceTo(to) / 24;
  if (player.moving > 0.5) to.addScaledVector(lastMove, 5.6 * flight * 0.6);
  const v = to.sub(from).normalize().multiplyScalar(24);
  const m = new THREE.Mesh(ARROW, arrowMat); m.position.copy(from); m.lookAt(from.clone().add(v)); scene.add(m);
  arrows.push({ m, v, life: 1.4, dmg: en.dmg });
  sfx.arrow(panOf(from.x, from.z));
}
const lastMove = new THREE.Vector3(), prevPos = new THREE.Vector3();
function updateArrows(dt: number) {
  if (dt > 0) { lastMove.subVectors(player.pos, prevPos).setY(0); if (lastMove.lengthSq() > 1e-6) lastMove.normalize(); prevPos.copy(player.pos); }
  for (let i = arrows.length - 1; i >= 0; i--) {
    const a = arrows[i];
    a.m.position.addScaledVector(a.v, dt); a.life -= dt;
    const p = a.m.position, dx = p.x - player.pos.x, dz = p.z - player.pos.z, dy = p.y - (player.pos.y + 1.1);
    let gone = a.life <= 0 || p.y < surfaceY(p.x, p.z);
    if (!gone && dx * dx + dz * dz < 0.5 && Math.abs(dy) < 1.1) {
      gone = true;
      if (player.invuln > 0) burst(p.clone(), 0xffffff, 10, 3, 0.08);   // dodged through it
      else hurtPlayer(a.dmg);
    }
    if (gone) { scene.remove(a.m); arrows.splice(i, 1); }
  }
}
export function clearArrows() { for (const a of arrows) scene.remove(a.m); arrows.length = 0; }

/** a ground slam: hurts you anywhere inside the radius */
function slam(en: Enemy, r: number) {
  const g = en.g;
  burst(new THREE.Vector3(g.position.x, g.position.y + 0.2, g.position.z), 0xb8a890, 90, 9, 0.18);
  state.shake = Math.max(state.shake, 0.45); sfx.taiko(0.7);
  if (Math.hypot(player.pos.x - g.position.x, player.pos.z - g.position.z) < r) hurtPlayer(en.dmg);
}

// ------------------------------------------------------------ every frame
const tmp = new THREE.Vector3(), step = new THREE.Vector3();
export function updateEnemies(dt: number) {
  updateArrows(dt);
  for (let i = enemies.length - 1; i >= 0; i--) {
    const en = enemies[i], g = en.g, camp = en.camp, def = KINDS[en.kind];
    tmp.subVectors(player.pos, g.position); tmp.y = 0;
    const d = tmp.length(), reach = en.kind === 'arquero' ? en.reach : en.reach * en.scale + 0.3;
    const fromHome = Math.hypot(g.position.x - camp.x, g.position.z - camp.z);
    const youFromHome = Math.hypot(player.pos.x - camp.x, player.pos.z - camp.z);
    let walk = 0, heading: number | null = null;   // speed this frame (for the walk cycle) and where it looks
    const speed = en.speed * (1 - 0.4 * wadeDepth(g.position.x, g.position.z));   // the river slows them down too
    en.t -= dt;
    const slamming = en.kind === 'bruto' || (en.kind === 'jefe' && en.swings % 3 === 2);

    if (en.state === 'idle' || en.state === 'return') {
      const home = en.state === 'return';
      const tx = home ? camp.x : en.wander.x, tz = home ? camp.z : en.wander.z;
      step.set(tx - g.position.x, 0, tz - g.position.z);
      const left = step.length();
      if (home) en.hp = Math.min(en.maxHp, en.hp + en.maxHp * 0.4 * dt);
      if (home && fromHome < camp.r * 0.5) { en.state = 'idle'; en.hp = en.maxHp; pickWander(en); en.t = rnd(1, 3); }
      else if (left > 0.6 && (home || en.t <= 0)) {
        walk = speed * (home ? 1.2 : 0.32);
        g.position.addScaledVector(step.multiplyScalar(1 / left), Math.min(left, walk * dt));
        heading = Math.atan2(step.x, step.z);
      } else if (!home && en.t <= 0) { pickWander(en); en.t = rnd(1.5, 5); }   // got there: rest a while, then pick a new spot
      // notice the player (only while idle: a returning oni ignores you until it is home)
      const sight = (en.kind === 'arquero' ? 16 : def.heavy ? 14 : 11) * (state.dead ? 0 : 1);
      if (!home && d < sight && youFromHome < camp.leash) alertCamp(camp);
    } else if (fromHome > camp.leash || youFromHome > camp.leash + 4 || state.dead) {
      en.state = 'return';   // too far from home: give up
    } else if (en.state === 'chase') {
      if (en.kind === 'arquero') {
        // keep a shooting distance: back off when you get close, come closer when you are out of range
        const want = d < 6 ? -1 : d > reach ? 1 : 0;
        if (want) { walk = speed * (want < 0 ? 0.9 : 1); g.position.addScaledVector(step.copy(tmp).normalize(), want * walk * dt); }
        if (d < reach + 1 && en.t <= 0) { en.state = 'windup'; en.t = en.windup; }
      } else if (d > reach) { walk = speed; g.position.addScaledVector(step.copy(tmp).normalize(), speed * dt); }
      else if (en.t <= 0) { en.state = 'windup'; en.t = en.windup * (slamming ? 1.25 : 1); sfx.warn(panOf(g.position.x, g.position.z)); }
    } else if (en.state === 'windup') {
      if (en.t <= 0) {
        en.swings++;
        if (en.kind === 'arquero') { shoot(en); en.state = 'recover'; en.t = rnd(1.1, 1.6); }
        else {
          if (slamming) slam(en, 2.9 * en.scale);
          else if (d < reach * 1.35) hurtPlayer(en.dmg);
          // the spearman lunges, everyone else steps into the blow
          en.knock.copy(tmp).normalize().multiplyScalar(en.kind === 'ashigaru' ? 11 : slamming ? 0 : 5);
          en.state = 'recover'; en.t = en.kind === 'ashigaru' ? 0.55 : 0.7;
        }
      }
    } else if (en.t <= 0) { en.state = 'chase'; en.t = en.kind === 'arquero' ? 0 : rnd(0.05, 0.3); }

    g.position.addScaledVector(en.knock, dt);
    en.knock.multiplyScalar(Math.exp(-7 * dt));
    for (const o of enemies) {
      if (o === en) continue;
      const dx = g.position.x - o.g.position.x, dz = g.position.z - o.g.position.z, dd = Math.hypot(dx, dz), m = 0.6 * (en.scale + o.scale);
      if (dd < m && dd > 1e-4) { g.position.x += dx / dd * (m - dd) * 0.5; g.position.z += dz / dd * (m - dd) * 0.5; }
    }
    collide(g.position, 0.5 * en.scale);
    const wd = wadeDepth(g.position.x, g.position.z), gy = surfaceY(g.position.x, g.position.z) - wd * WADE_SINK;
    g.position.y = gy;
    let w = waders.get(en); if (!w) waders.set(en, w = wader());
    w(dt, g.position.x, gy + wd * WADE_SINK, g.position.z, wd, walk > 0 || en.knock.lengthSq() > 4 ? 1 : 0);
    const fighting = en.state === 'chase' || en.state === 'windup' || en.state === 'recover';
    if (fighting) heading = Math.atan2(tmp.x, tmp.z);
    if (heading !== null) g.rotation.y += angDiff(heading, g.rotation.y) * Math.min(1, dt * (fighting ? 14 : 5));
    const wind = en.state === 'windup';
    if (en.oni) {
      en.move += ((walk > 0 ? 1 : 0) - en.move) * Math.min(1, dt * 8);
      en.oni.update(dt, { moving: en.move, speed: Math.max(walk, 1), state: wind ? 'windup' : (en.state === 'recover' && en.t > 0.45 ? 'strike' : 'idle') });
    } else {
      g.position.y = gy + 0.08 + Math.sin(state.time * 3 + en.seed) * 0.07;
      g.rotation.x = wind ? -0.25 : (en.state === 'recover' ? 0.15 : 0);
    }
    // the warning ring: wide for a slam, faint for an arrow being drawn
    en.ring.material.opacity = wind ? (en.kind === 'arquero' ? 0.3 : 0.5 + 0.5 * Math.sin(state.time * 30)) : 0;
    en.ring.scale.setScalar(wind ? (slamming ? 2.9 / 1.05 : 1 + (1 - Math.max(0, en.t) / en.windup) * 0.3) : 1);
    en.flash = Math.max(0, en.flash - dt * 6);
    if (en.oni) en.oni.setFlash(en.flash); else { en.robeMat.emissive.setScalar(en.flash); en.maskMat.emissive.setScalar(en.flash); }
    if (en.hp <= 0) kill(en, i, gy);
  }
}

const waders = new WeakMap<Enemy, ReturnType<typeof wader>>();

function kill(en: Enemy, i: number, gy: number) {
  const g = en.g, camp = en.camp, def = KINDS[en.kind];
  const wd = wadeDepth(g.position.x, g.position.z);
  if (wd > 0.1) splash(g.position.x, gy + wd * WADE_SINK, g.position.z, en.big ? 1.8 : 1.2);
  const c = new THREE.Vector3(g.position.x, gy + 1.2 * en.scale, g.position.z);
  burst(c, 0xff3a2a, en.big ? 160 : 70, en.big ? 10 : 7);
  burst(c, 0xffe0c0, 30, 4, 0.1);
  scene.remove(g); enemies.splice(i, 1); state.kills++;
  sfx.death({ big: en.big, pan: panOf(g.position.x, g.position.z) });
  addPoints(Math.round(def.points * (1 + camp.tier * 0.5) / 10) * 10, def.name, true);
  chargeKill();
  if (lifesteal()) player.hp = Math.min(player.maxHp, player.hp + lifesteal());
  if (en.big) state.shake = 0.6;
  dropLoot(g.position.x, g.position.z, camp.tier, en.kind === 'jefe');
  const r = camp.roster.indexOf(en.kind); if (r >= 0) camp.roster.splice(r, 1);
  if (camp.roster.length === 0) campCleared(camp);
}

function campCleared(camp: Camp) {
  camp.clearedAt = state.time; state.campsCleared++;
  const bonus = camp.boss ? POINTS.bossCamp : POINTS.camp * camp.size;
  addPoints(bonus, camp.temp ? 'emboscada superada' : camp.route ? 'patrulla abatida' : 'guarida limpia');
  player.hp = Math.min(player.maxHp, player.hp + 20);
  sfx.taiko(1.1);
  const title = camp.boss ? '¡ JEFE ABATIDO !' : camp.temp ? '— EMBOSCADA SUPERADA —' : camp.route ? '— PATRULLA ABATIDA —' : '— GUARIDA LIMPIA —';
  const chest = camp.chest && camp.chest.state === 'sealed' ? '\nel cofre se ha abierto' : '';
  if (camp.chest) unseal(camp.chest);
  showMsg(`${title}\n+${bonus}  ·  +20 vida${chest}`, 2.2);
}
