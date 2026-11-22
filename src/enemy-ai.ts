// Oni behaviour. Each oni guards its camp: it ambles around its territory (idle), notices you when you
// come close (the whole camp joins in), then chase, wind-up, strike, recover. They are leashed to the
// camp: once you lead them too far from home (or run away) they give up, walk back and heal.
// Also knockback, crowding, hit flash, death and the points it gives.
import * as THREE from 'three';
import { scene } from './renderer';
import { enemies } from './enemies';
import { hurtPlayer } from './damage';
import { burst } from './fx';
import { sfx, panOf } from './sfx';
import { showMsg } from './hud';
import { collide } from './physics';
import { surfaceY } from './structures';
import { addPoints, POINTS } from './score';
import { player, state } from './state';
import { angDiff, rnd } from './utils';
import type { Camp, Enemy } from './types';

/** every idle oni of the camp starts fighting (one roar for the whole camp) */
export function alertCamp(camp: Camp) {
  let roared = false;
  for (const o of enemies) {
    if (o.camp !== camp || (o.state !== 'idle' && o.state !== 'return')) continue;
    o.state = 'chase';
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

const tmp = new THREE.Vector3(), step = new THREE.Vector3();
export function updateEnemies(dt: number) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const en = enemies[i], g = en.g, camp = en.camp;
    tmp.subVectors(player.pos, g.position); tmp.y = 0;
    const d = tmp.length(), reach = 1.25 * en.scale + 0.3;
    const fromHome = Math.hypot(g.position.x - camp.x, g.position.z - camp.z);
    const youFromHome = Math.hypot(player.pos.x - camp.x, player.pos.z - camp.z);
    let walk = 0, heading: number | null = null;   // speed this frame (for the walk cycle) and where it looks
    en.t -= dt;

    if (en.state === 'idle' || en.state === 'return') {
      const home = en.state === 'return';
      const tx = home ? camp.x : en.wander.x, tz = home ? camp.z : en.wander.z;
      step.set(tx - g.position.x, 0, tz - g.position.z);
      const left = step.length();
      if (home) en.hp = Math.min(en.maxHp, en.hp + en.maxHp * 0.4 * dt);
      if (home && fromHome < camp.r * 0.5) { en.state = 'idle'; en.hp = en.maxHp; pickWander(en); en.t = rnd(1, 3); }
      else if (left > 0.6 && (home || en.t <= 0)) {
        walk = en.speed * (home ? 1.2 : 0.32);
        g.position.addScaledVector(step.multiplyScalar(1 / left), Math.min(left, walk * dt));
        heading = Math.atan2(step.x, step.z);
      } else if (!home && en.t <= 0) { pickWander(en); en.t = rnd(1.5, 5); }   // got there: rest a while, then pick a new spot
      // notice the player (only while idle: a returning oni ignores you until it is home)
      const sight = (en.big ? 14 : 11) * (state.dead ? 0 : 1);
      if (!home && d < sight && youFromHome < camp.leash) alertCamp(camp);
    } else if (fromHome > camp.leash || youFromHome > camp.leash + 4 || state.dead) {
      en.state = 'return';   // too far from home: give up
    } else if (en.state === 'chase') {
      if (d > reach) { walk = en.speed; g.position.addScaledVector(step.copy(tmp).normalize(), en.speed * dt); }
      else { en.state = 'windup'; en.t = en.big ? 0.75 : 0.55; sfx.warn(panOf(g.position.x, g.position.z)); }
    } else if (en.state === 'windup') {
      if (en.t <= 0) {
        if (d < reach * 1.35) hurtPlayer(en.dmg);
        en.knock.copy(tmp).normalize().multiplyScalar(5);
        en.state = 'recover'; en.t = 0.7;
      }
    } else if (en.t <= 0) en.state = 'chase';

    g.position.addScaledVector(en.knock, dt);
    en.knock.multiplyScalar(Math.exp(-7 * dt));
    for (const o of enemies) {
      if (o === en) continue;
      const dx = g.position.x - o.g.position.x, dz = g.position.z - o.g.position.z, dd = Math.hypot(dx, dz), m = 0.6 * (en.scale + o.scale);
      if (dd < m && dd > 1e-4) { g.position.x += dx / dd * (m - dd) * 0.5; g.position.z += dz / dd * (m - dd) * 0.5; }
    }
    collide(g.position, 0.5 * en.scale);
    const gy = surfaceY(g.position.x, g.position.z);
    g.position.y = gy;
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
    en.ring.material.opacity = wind ? 0.5 + 0.5 * Math.sin(state.time * 30) : 0;
    en.ring.scale.setScalar(wind ? 1 + (1 - Math.max(0, en.t) / 0.6) * 0.3 : 1);
    en.flash = Math.max(0, en.flash - dt * 6);
    if (en.oni) en.oni.setFlash(en.flash); else { en.robeMat.emissive.setScalar(en.flash); en.maskMat.emissive.setScalar(en.flash); }
    if (en.hp <= 0) {
      const c = new THREE.Vector3(g.position.x, gy + 1.2 * en.scale, g.position.z);
      burst(c, 0xff3a2a, en.big ? 160 : 70, en.big ? 10 : 7);
      burst(c, 0xffe0c0, 30, 4, 0.1);
      scene.remove(g); enemies.splice(i, 1); state.kills++;
      sfx.death({ big: en.big, pan: panOf(g.position.x, g.position.z) });
      addPoints(en.big ? POINTS.boss : POINTS.oni, en.big ? 'jefe oni' : 'oni', true);
      if (en.big) state.shake = 0.6;
      if (--camp.left <= 0) campCleared(camp);
    }
  }
}

function campCleared(camp: Camp) {
  camp.clearedAt = state.time; state.campsCleared++;
  const bonus = camp.boss ? POINTS.bossCamp : POINTS.camp * camp.size;
  addPoints(bonus, 'guarida limpia');
  player.hp = Math.min(100, player.hp + 25);
  sfx.taiko(1.1);
  showMsg(`${camp.boss ? '¡ JEFE ABATIDO !' : '— GUARIDA LIMPIA —'}\n+${bonus}  ·  +25 vida`, 2);
}
