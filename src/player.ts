// The player's moves: walking, dashing and the katana combo, hit detection included.
import { onPlayerHit, spirit } from './battle';
import { bossHit, damageTaken } from './boss-mechanics';
import * as THREE from 'three';
import { sam } from './avatar';
import { sparkBurst } from './katana-fx';
import { enemies, KINDS } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { showMsg } from './hud';
import { dmgMult, dashCdMult, runMult } from './upgrades';
import { weapon, type Weapon } from './weapons';
import { charge } from './special';
import { critMult, rollCrit } from './progression';
import { hitChests, chestInReach } from './loot';
import { burst, dashGhost, dashRing, impactRing } from './fx';
import { sfx, panOf } from './sfx';
import { collide } from './physics';
import { surfaceY, wadeDepth } from './structures';
import { ripple, splash, wader, WADE_SINK } from './water';
import { rimLight } from './world';
import { player, state, keys } from './state';
import { angDiff } from './utils';

import type { WeaponForm } from './types';

/** `daze`: seconds the oni struck stays dazed (the sōhei's staff), scaled by the weapon's own `daze` */
interface Strike { at: number; arc: number; power: number; offset?: number; quake?: boolean; daze?: number }
interface Move {
  duration: number; reach: number; strikes: readonly Strike[];
  /** forward speed (m/s) while the move carries you, and when (attack progress) */
  lunge: number; lungeAt?: readonly [number, number];
  /** leaps (weapon-poses.ts `rise`): untouchable while in the air */
  air?: boolean;
}
// Each weapon has a chain of three cuts on K (index 0..2) and its own heavy attack on L (index 3).
// Strike times match the impact keyframes of the animations (samurai.ts, weapon-poses.ts).
const doubleCut = (first: number): Move => ({
  duration: 0.52, lunge: 3.2, reach: 2.7, strikes: [
    { at: 0.36, arc: 1.13, offset: first * 0.23, power: 0.62 },
    { at: 0.60, arc: 1.13, offset: -first * 0.23, power: 0.61 }
  ]
});
const moves: Record<WeaponForm, readonly [Move, Move, Move, Move]> = {
  katana: [
    { duration: 0.38, lunge: 3, reach: 2.8, strikes: [{ at: 0.45, arc: 1.35, power: 1 }] },                    // kesa-giri
    { duration: 0.4, lunge: 3, reach: 2.8, strikes: [{ at: 0.43, arc: 1.35, power: 1.05 }] },                   // kiriage
    { duration: 0.55, lunge: 3, reach: 3.3, strikes: [{ at: 0.5, arc: Math.PI, power: 1.8 }] },                // full turn
    { duration: 0.78, lunge: 15, lungeAt: [0.3, 0.46], reach: 3.4, strikes: [{ at: 0.45, arc: 1.25, power: 2.6 }] }  // iai
  ],
  spear: [
    { duration: 0.42, lunge: 3.8, reach: 2.8, strikes: [{ at: 0.41, arc: 0.40, power: 1 }] },
    { duration: 0.5, lunge: 3.4, reach: 2.8, strikes: [{ at: 0.28, arc: 0.40, power: 0.65 }, { at: 0.52, arc: 0.40, power: 0.75 }] },
    { duration: 0.59, lunge: 2.1, reach: 2.9, strikes: [{ at: 0.48, arc: 1.55, power: 1.62 }] },
    { duration: 0.95, lunge: 12, lungeAt: [0.62, 0.76], reach: 3.1,
      strikes: [{ at: 0.36, arc: Math.PI, power: 0.9 }, { at: 0.72, arc: 0.42, power: 2.3 }] }
  ],
  broad: [
    { duration: 0.46, lunge: 2.2, reach: 2.85, strikes: [{ at: 0.52, arc: 1.57, power: 1 }] },
    { duration: 0.46, lunge: 2.2, reach: 2.85, strikes: [{ at: 0.52, arc: 1.57, power: 1 }] },
    { duration: 0.7, lunge: 1.5, reach: 3.2, strikes: [{ at: 0.52, arc: Math.PI, power: 2 }] },
    { duration: 0.92, lunge: 7, lungeAt: [0.14, 0.5], reach: 3.4, air: true, strikes: [{ at: 0.55, arc: Math.PI, power: 2.9, quake: true }] }
  ],
  dual: [
    doubleCut(-1), doubleCut(1),
    { duration: 0.62, lunge: 3.2, reach: 2.9, strikes: [{ at: 0.49, arc: 1.7, power: 1.2 }, { at: 0.7, arc: 1.7, power: 0.7 }] },
    { duration: 1.05, lunge: 5, lungeAt: [0.16, 0.7], reach: 2.9, air: true, strikes: [
      { at: 0.34, arc: Math.PI, power: 0.55 }, { at: 0.5, arc: Math.PI, power: 0.55 }, { at: 0.66, arc: Math.PI, power: 0.55 },
      { at: 0.82, arc: Math.PI, power: 1.4, quake: true }] }
  ],
  // the bō: wide swings, an overhead blow and the wheel; every blow dazes the oni it lands on
  staff: [
    { duration: 0.46, lunge: 2.8, reach: 3.0, strikes: [{ at: 0.48, arc: 1.45, power: 0.95, daze: 0.45 }] },
    { duration: 0.46, lunge: 2.8, reach: 3.0, strikes: [{ at: 0.48, arc: 1.45, power: 0.95, daze: 0.45 }] },
    { duration: 0.62, lunge: 2.4, reach: 3.2, strikes: [{ at: 0.54, arc: 0.9, power: 1.7, daze: 1.2 }] },
    { duration: 1.0, lunge: 4, lungeAt: [0.55, 0.7], reach: 3.3, strikes: [
      { at: 0.3, arc: Math.PI, power: 0.8, daze: 0.5 }, { at: 0.72, arc: Math.PI, power: 2.2, quake: true, daze: 1.8 }] }
  ]
};

const JUMP_VEL = 9.4;
const GRAVITY = 26;

function doJump(groundBase: number) {
  player.vy = JUMP_VEL * (1 - 0.15 * depth);
  player.jumpY = Math.max(player.jumpY, 0.01);
  player.jumpBuf = 0;
  player.landT = 0;
  player.airDashUsed = false;
  sfx.jump();
  if (depth > 0.1) {
    splash(player.pos.x, groundBase + depth * WADE_SINK, player.pos.z, 0.75);
    ripple(player.pos.x, player.pos.z, 1.0);
  } else {
    burst(new THREE.Vector3(player.pos.x, groundBase + 0.08, player.pos.z), 0xc9b38a, 10, 2.4, 0.1);
  }
}

export function tryJump() {
  if (!state.playing || state.dead || player.dancing) return;
  if (player.jumpY <= 0.02 && player.vy <= 0) {
    const groundBase = surfaceY(player.pos.x, player.pos.z) - depth * WADE_SINK;
    doJump(groundBase);
  } else {
    player.jumpBuf = 0.14;
  }
}

// K / click chain the current weapon's three cuts; L is the weapon's own heavy attack.
export function tryAttack(heavy = false) {
  if (player.dancing) return;
  const w = weapon();
  if (player.attackT >= 0 && (player.attackT < player.attackDur * (heavy ? 0.85 : 0.6) || (w.form === 'dual' && !player.hitDone))) return;
  const chained = player.attackT >= 0 || state.time - player.lastAttackEnd < 0.55;
  if (heavy) player.combo = 3;
  else player.combo = chained && player.combo < 2 ? player.combo + 1 : 0;
  player.attackT = 0; player.hitDone = false;
  const move = moves[w.form ?? 'katana'][player.combo];
  player.attackDur = move.duration * w.speed;
  if (move.air) player.invuln = Math.max(player.invuln, player.attackDur * 0.6);
  // brief air hang when striking mid-jump
  if (player.jumpY > 0.05) player.vy = Math.max(player.vy, 2.2);
  // auto-aim: turn towards the closest oni in reach, otherwise keep the current heading
  let best = 4.5 + w.reach, aim = null;
  for (const en of enemies) { const d = Math.hypot(en.g.position.x - player.pos.x, en.g.position.z - player.pos.z); if (d < best) { best = d; aim = en; } }
  if (aim) player.face = Math.atan2(aim.g.position.x - player.pos.x, aim.g.position.z - player.pos.z);
  else { const c = chestInReach(player.pos.x, player.pos.z, 3.2 + w.reach); if (c) player.face = Math.atan2(c.x - player.pos.x, c.z - player.pos.z); }
  sfx.swing({ power: heavy ? 1.6 : player.combo === 2 ? 1.35 : 1, pan: heavy ? 0 : player.combo === 1 ? 0.3 : -0.3 });
}
export function tryDash() {
  if (!state.playing || state.dead || player.dashCd > 0 || player.dancing) return;
  const airborne = player.jumpY > 0.05;
  if (airborne && player.airDashUsed) return;
  const mv = moveInput();
  if (mv.lengthSq() < 0.01) mv.set(Math.sin(player.face), 0, Math.cos(player.face));
  player.dashDir.copy(mv.normalize()); player.dashT = 0.2; player.dashCd = 0.75 * dashCdMult(); player.invuln = 0.3;
  player.snareT = 0;
  if (airborne) { player.airDashUsed = true; player.vy = Math.max(0, player.vy * 0.25); }
  player.face = Math.atan2(mv.x, mv.z);
  dashRing(player.pos);
  sfx.dash();
  if (!airborne && depth > 0.1) splash(player.pos.x, player.pos.y + depth * WADE_SINK, player.pos.z, 0.9);
}
export function moveInput() {
  const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
  const v = new THREE.Vector3(fx * iz + rx * ix, 0, fz * iz + rz * ix);
  return v.lengthSq() > 0 ? v.normalize() : v;
}

const tmp = new THREE.Vector3();
let ghostGap = 0, depth = 0;
const wade = wader();
export function updatePlayer(dt: number) {
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.snareT = Math.max(0, player.snareT - dt);
  player.jumpBuf = Math.max(0, player.jumpBuf - dt);
  player.landT = Math.max(0, player.landT - dt);
  const mv = moveInput();
  const airborne = player.jumpY > 0.02 || player.vy > 0;
  // Shift: run (to cross the open world); attacking slows you down
  let speed = (keys.ShiftLeft || keys.ShiftRight ? 10 : 5.6) * runMult();
  if (player.attackT >= 0) speed = 5.6 * (airborne ? 0.55 : 0.35);
  if (player.snareT > 0) speed *= 0.53;
  if (!airborne) speed *= 1 - 0.4 * depth;      // wading through the river is slow
  if (player.dancing) {
    // the sword dance moves you (blade-dance.ts)
    player.jumpY = 0; player.vy = 0; player.airDashUsed = false;
  } else if (player.dashT > 0) {
    player.dashT -= dt;
    player.pos.addScaledVector(player.dashDir, 18 * (airborne ? 1 : 1 - 0.3 * depth) * dt);
    // the halo: an after-image every few centimetres, brighter at the start of the dodge
    if ((ghostGap -= 18 * dt) <= 0) { ghostGap = 0.45; dashGhost(player.pos, player.face, 0.4 + player.dashT * 3); }
  } else if (mv.lengthSq() > 0) {
    player.pos.addScaledVector(mv, speed * dt);
    if (player.attackT < 0) player.face += angDiff(Math.atan2(mv.x, mv.z), player.face) * Math.min(1, dt * 12);
  }
  collide(player.pos, 0.45);
  // in the river the feet sink into the bed, so the water comes up to the knees
  const want = wadeDepth(player.pos.x, player.pos.z);
  depth += (want - depth) * Math.min(1, dt * 8);
  const groundBase = surfaceY(player.pos.x, player.pos.z) - depth * WADE_SINK;
  if (player.jumpY > 0 || player.vy > 0) {
    if (player.dashT > 0) {
      player.vy = 0;
    } else {
      const g = player.attackT >= 0 ? GRAVITY * 0.55 : player.vy < 0 ? GRAVITY * 1.15 : GRAVITY;
      player.vy -= g * dt;
    }
    player.jumpY += player.vy * dt;
    if (player.jumpY <= 0) {
      const impact = Math.min(1, -player.vy / 12);
      player.jumpY = 0; player.vy = 0; player.airDashUsed = false; player.landT = 0.16;
      sfx.land(impact);
      if (depth > 0.1) {
        splash(player.pos.x, groundBase + depth * WADE_SINK, player.pos.z, 0.65 + impact * 0.45);
        ripple(player.pos.x, player.pos.z, 0.9 + impact * 0.4);
      } else {
        burst(new THREE.Vector3(player.pos.x, groundBase + 0.08, player.pos.z), 0xc9b38a, Math.round(10 + impact * 10), 2.5 + impact * 1.5, 0.11);
      }
      if (player.jumpBuf > 0) doJump(groundBase);
    }
  }
  player.pos.y = groundBase + player.jumpY;
  player.moving += ((mv.lengthSq() > 0 ? 1 : 0) - player.moving) * Math.min(1, dt * 10);
  if (player.jumpY <= 0.05) {
    wade(dt, player.pos.x + mv.x * 0.35, player.pos.y + depth * WADE_SINK, player.pos.z + mv.z * 0.35, want, player.dashT > 0 ? 1 : player.moving, keys.ShiftLeft || keys.ShiftRight || player.dashT > 0);
    player.walk += dt * 10 * player.moving;
  }
  sam.root.position.copy(player.pos);
  sam.root.rotation.y = player.face;
  rimLight.position.set(player.pos.x - Math.sin(state.yaw) * 8, player.pos.y + 5, player.pos.z - Math.cos(state.yaw) * 8); rimLight.target.position.copy(player.pos);

  if (player.attackT >= 0) {
    const previous = player.attackT / player.attackDur;
    player.attackT += dt;
    const p = Math.min(1, player.attackT / player.attackDur);
    const w = weapon(), move = moves[w.form ?? 'katana'][player.combo];
    const [from, to] = move.lungeAt ?? [0.2, 0.55];
    if (p > from && p < to && !player.dancing) {
      player.pos.x += Math.sin(player.face) * move.lunge * dt;
      player.pos.z += Math.cos(player.face) * move.lunge * dt;
      collide(player.pos, 0.45);
    }
    if (!player.hitDone) {
      for (const [i, strike] of move.strikes.entries()) if (previous <= strike.at && p > strike.at) {
        if (i) sfx.swing({ power: 0.7, pan: strike.offset ?? 0 });
        strikeWith(w, strike, move.reach + w.reach, player.combo >= 2);
        if (strike.quake) quake(player.pos.clone().addScaledVector(tmp.set(Math.sin(player.face), 0, Math.cos(player.face)), 0.9));
        if (i === move.strikes.length - 1) player.hitDone = true;
      }
    }
    if (p >= 1) { player.attackT = -1; player.lastAttackEnd = state.time; }
  }
  // blink while invulnerable
  sam.root.visible = !(player.invuln > 0 && player.dashT <= 0 && Math.floor(state.time * 20) % 2 === 0);
}

/** a heavy landing: a ring of dust and light runs along the ground and the camera shakes */
function quake(at: THREE.Vector3) {
  impactRing(at, 0xffd9a0, 4.2);
  burst(at.clone().setY(at.y + 0.2), 0xc9b38a, 46, 6, 0.16);
  burst(at.clone().setY(at.y + 0.4), 0xffffff, 18, 4, 0.12);
  state.shake = Math.max(state.shake, 0.65);
  sfx.taiko(0.8);
}

function strikeWith(w: Weapon, strike: Strike, reach: number, heavy: boolean) {
  if (depth > 0.1) ripple(player.pos.x + Math.sin(player.face) * 1.2, player.pos.z + Math.cos(player.face) * 1.2, heavy ? 1.3 : 0.9);
  const heading = player.face + (strike.offset ?? 0);
  let hits = 0, hitPan = 0, crits = 0;
  for (const en of enemies) {
    if (en.hp <= 0) continue;
    tmp.subVectors(en.g.position, player.pos); tmp.y = 0;
    const d = tmp.length();
    const ang = Math.abs(angDiff(Math.atan2(tmp.x, tmp.z), heading));
    if (d >= reach + 0.45 * en.scale || ang > strike.arc) continue;
    const incoming = Math.atan2(-tmp.x, -tmp.z);
    const guarding = KINDS[en.kind].look?.shield && (en.state === 'idle' || en.state === 'chase')
      && Math.abs(angDiff(incoming, en.g.rotation.y)) < 1.05;
    const attack = en.attack;
    const parrying = en.state === 'windup' && attack?.move.shape === 'arc' && attack.move.parry
      && Math.abs(angDiff(incoming, attack.yaw)) < attack.move.angle;
    const blocked = (guarding || parrying) && !heavy;
    hits++; hitPan += panOf(en.g.position.x, en.g.position.z);
    // a critical blow (progression.ts): more damage, a golden spray and a harder stop
    const crit = !blocked && rollCrit();
    if (crit) crits++;
    const dealt = strike.power * (blocked ? 0.2 : 1) * (crit ? critMult() : 1) * dmgMult() * w.dmg * spirit() * damageTaken(en);
    en.hp -= dealt;
    if (!blocked) { onPlayerHit(en); bossHit(en, dealt, heavy); }
    en.flash = blocked ? 0.35 : 1;
    provoke(en);
    const push = heavy ? 12 : strike.power < 0.9 ? 4 : 8;
    en.knock.copy(tmp.normalize()).multiplyScalar(push / (en.big || blocked ? 3 : 1));
    if (guarding && heavy) {
      staggerEnemy(en, 0.9);
      showMsg('¡ GUARDIA ROTA !', 0.9);
    } else if (parrying && blocked) {
      if (en.t > 0.24) showMsg('¡ EL DUELISTA CONTRAATACA !', 0.7);
      en.t = Math.min(en.t, 0.24);
    } else if (strike.daze && !blocked && en.state !== 'return') {
      // the staff rings the oni's head: big ones and bosses shake it off sooner
      const daze = strike.daze * (w.daze ?? 1) * (en.big ? 0.35 : 1);
      staggerEnemy(en, daze);
      if (daze > 0.9) burst(new THREE.Vector3(en.g.position.x, en.g.position.y + 2 * en.scale, en.g.position.z), 0xffe27a, 10, 1.6, 0.1);
    } else if ((en.state === 'windup' || en.state === 'charge') && !en.big) staggerEnemy(en, 0.5);
    burst(new THREE.Vector3(en.g.position.x, en.g.position.y + 1.3 * en.scale, en.g.position.z), blocked ? 0xffd889 : 0xffffff, 18, 5, 0.12);
    if (crit) {
      const at = new THREE.Vector3(en.g.position.x, en.g.position.y + 1.4 * en.scale, en.g.position.z);
      burst(at, 0xffc23a, 34, 7.5, 0.15); impactRing(en.g.position, 0xffc23a, 2.2);
    }
    sparkBurst(new THREE.Vector3(en.g.position.x, en.g.position.y + 1.25 * en.scale, en.g.position.z).lerp(player.pos.clone().setY(player.pos.y + 1.25), 0.35), heavy ? 14 : 9, heavy ? 5.5 : 4.5);
  }
  const struck = hitChests(player.pos.x, player.pos.z, heading, reach, strike.arc === Math.PI, strike.arc);
  if (struck && !hits) { state.hitStop = 0.05; state.shake = Math.max(state.shake, 0.15); sfx.hit({ heavy: false, pan: 0, count: 1 }); }
  if (!hits) return;
  if (w.heal) player.hp = Math.min(player.maxHp, player.hp + w.heal * hits);
  if (w.charge) charge(w.charge * hits);
  state.hitStop = (heavy ? 0.09 : strike.power < 0.9 ? 0.035 : 0.06) + (crits ? 0.05 : 0);
  if (crits) { state.gain = '¡ CRÍTICO !'; state.gainT = 0.9; }
  state.shake = Math.max(state.shake, heavy ? 0.35 : strike.power < 0.9 ? 0.12 : 0.2);
  sfx.hit({ heavy, pan: hitPan / hits, count: hits });
  if (w.form === 'staff') sfx.rings(hitPan / hits);
}
