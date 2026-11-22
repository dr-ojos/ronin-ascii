// Damage taken by the player, and death.
import * as THREE from 'three';
import { cellMat } from './ascii.js';
import { burst } from './fx.js';
import { sfx } from './sfx.js';
import { showDeathScreen } from './hud.js';
import { player, state } from './state.js';

export function hurtPlayer(dmg) {
  if (player.invuln > 0 || state.dead) return;
  player.hp -= dmg; player.invuln = 0.5; cellMat.uniforms.uHit.value = 1; state.shake = 0.5; sfx.hurt();
  if (player.hp <= 0) {
    player.hp = 0; state.dead = true;
    burst(new THREE.Vector3(player.pos.x, 1.2, player.pos.z), 0xff3030, 120, 8);
    setTimeout(showDeathScreen, 1200);
  }
}
