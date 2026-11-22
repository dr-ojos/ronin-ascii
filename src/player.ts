// The player's moves: walking, dashing and the katana combo, hit detection included.
import * as THREE from 'three';
import { sam } from './avatar';
import { sparkBurst } from './katana-fx';
import { enemies } from './enemies';
import { provoke } from './enemy-ai';
import { dmgMult, dashCdMult, runMult } from './upgrades';
import { burst, slashArc } from './fx';
import { sfx, panOf } from './sfx';
import { collide } from './physics';
import { surfaceY } from './structures';
import { keyLight, rimLight } from './world';
import { player, state, keys } from './state';
import { angDiff } from './utils';

// K = slash combo (diagonal, reverse diagonal, spin) · L = heavy spinning cut · click = slash too
export function tryAttack(heavy = false) {
  if (player.attackT >= 0 && player.attackT < player.attackDur * (heavy ? 0.85 : 0.6)) return;
  if (heavy) player.combo = 2;
  else player.combo = state.time - player.lastAttackEnd < 0.55 ? (player.combo + 1) % 3 : 0;
  player.attackT = 0; player.hitDone = false;
  player.attackDur = player.combo === 2 ? 0.55 : 0.38;
  // auto-aim: turn towards the closest oni in reach, otherwise keep the current heading
  let best = 4.5, aim = null;
  for (const en of enemies) { const d = Math.hypot(en.g.position.x - player.pos.x, en.g.position.z - player.pos.z); if (d < best) { best = d; aim = en; } }
  if (aim) player.face = Math.atan2(aim.g.position.x - player.pos.x, aim.g.position.z - player.pos.z);
  sfx.swing({ power: player.combo === 2 ? 1.35 : 1, pan: player.combo === 1 ? 0.3 : -0.3 });
}
export function tryDash() {
  if (!state.playing || state.dead || player.dashCd > 0) return;
  const mv = moveInput();
  if (mv.lengthSq() < 0.01) mv.set(Math.sin(player.face), 0, Math.cos(player.face));
  player.dashDir.copy(mv.normalize()); player.dashT = 0.2; player.dashCd = 0.75 * dashCdMult(); player.invuln = 0.3;
  player.face = Math.atan2(mv.x, mv.z);
  sfx.dash();
}
export function moveInput() {
  const ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
  const fx = -Math.sin(state.yaw), fz = -Math.cos(state.yaw), rx = Math.cos(state.yaw), rz = -Math.sin(state.yaw);
  const v = new THREE.Vector3(fx * iz + rx * ix, 0, fz * iz + rz * ix);
  return v.lengthSq() > 0 ? v.normalize() : v;
}

const tmp = new THREE.Vector3();
export function updatePlayer(dt: number) {
  player.invuln = Math.max(0, player.invuln - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  const mv = moveInput();
  // Shift: run (to cross the open world); attacking slows you down
  let speed = (keys.ShiftLeft || keys.ShiftRight ? 10 : 5.6) * runMult();
  if (player.attackT >= 0) speed = 5.6 * 0.35;
  if (player.dashT > 0) {
    player.dashT -= dt;
    player.pos.addScaledVector(player.dashDir, 18 * dt);
  } else if (mv.lengthSq() > 0) {
    player.pos.addScaledVector(mv, speed * dt);
    if (player.attackT < 0) player.face += angDiff(Math.atan2(mv.x, mv.z), player.face) * Math.min(1, dt * 12);
  }
  collide(player.pos, 0.45);
  player.pos.y = surfaceY(player.pos.x, player.pos.z);
  player.moving += ((mv.lengthSq() > 0 ? 1 : 0) - player.moving) * Math.min(1, dt * 10);
  player.walk += dt * 10 * player.moving;
  sam.root.position.copy(player.pos);
  sam.root.rotation.y = player.face;
  keyLight.position.set(player.pos.x + Math.sin(state.yaw) * 2.5, player.pos.y + 3.2, player.pos.z + Math.cos(state.yaw) * 2.5);
  rimLight.position.set(player.pos.x - Math.sin(state.yaw) * 8, player.pos.y + 5, player.pos.z - Math.cos(state.yaw) * 8); rimLight.target.position.copy(player.pos);

  if (player.attackT >= 0) {
    player.attackT += dt;
    const p = Math.min(1, player.attackT / player.attackDur);
    const spin = player.combo === 2;
    if (p > 0.2 && p < 0.55) { player.pos.x += Math.sin(player.face) * 3 * dt; player.pos.z += Math.cos(player.face) * 3 * dt; }
    if (!player.hitDone && p > (spin ? 0.4 : 0.45)) {
      player.hitDone = true;
      slashArc(spin, spin, player.combo);
      let hits = 0, hitPan = 0;
      for (const en of enemies) {
        tmp.subVectors(en.g.position, player.pos); tmp.y = 0;
        const d = tmp.length(), reach = (spin ? 3.3 : 2.8) + 0.45 * en.scale;
        const ang = Math.abs(angDiff(Math.atan2(tmp.x, tmp.z), player.face));
        if (d < reach && (spin || ang < 1.35)) {
          hits++; hitPan += panOf(en.g.position.x, en.g.position.z); en.hp -= (spin ? 2 : 1) * dmgMult(); en.flash = 1; provoke(en);
          en.knock.copy(tmp.normalize()).multiplyScalar((spin ? 12 : 8) / (en.big ? 3 : 1));
          if (en.state === 'windup' && !en.big) { en.state = 'recover'; en.t = 0.5; }
          burst(new THREE.Vector3(en.g.position.x, en.g.position.y + 1.3 * en.scale, en.g.position.z), 0xffffff, 18, 5, 0.12);
          sparkBurst(new THREE.Vector3(en.g.position.x, en.g.position.y + 1.25 * en.scale, en.g.position.z).lerp(player.pos.clone().setY(player.pos.y + 1.25), 0.35), spin ? 14 : 9, spin ? 5.5 : 4.5);
        }
      }
      if (hits) { state.hitStop = spin ? 0.09 : 0.06; state.shake = Math.max(state.shake, spin ? 0.35 : 0.2); sfx.hit({ heavy: spin, pan: hitPan / hits, count: hits }); }
    }
    if (p >= 1) { player.attackT = -1; player.lastAttackEnd = state.time; }
  }
  // blink while invulnerable
  sam.root.visible = !(player.invuln > 0 && player.dashT <= 0 && Math.floor(state.time * 20) % 2 === 0);
}
