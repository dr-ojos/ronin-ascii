// Damage taken by the player, and death.
import * as THREE from 'three';
import { cellMat } from './ascii';
import { burst } from './fx';
import { sfx } from './sfx';
import { showDeathScreen } from './hud';
import { player, state } from './state';
import { breakStreak } from './score';
import { hurtMult } from './upgrades';

export function hurtPlayer(dmg: number) {
  if (player.invuln > 0 || state.dead) return false;
  player.hp -= dmg * hurtMult(); player.invuln = 0.5; state.lastHurt = state.time; breakStreak(); cellMat.uniforms.uHit.value = 1; state.shake = 0.5; sfx.hurt();
  if (player.hp <= 0) {
    player.hp = 0; state.dead = true;
    burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), 0xff3030, 120, 8);
    setTimeout(showDeathScreen, 1200);
  }
  return true;
}
