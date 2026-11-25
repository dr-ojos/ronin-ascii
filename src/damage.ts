// Damage taken by the player, and death.
import { onPlayerHurt } from './battle';
import * as THREE from 'three';
import { cellMat } from './ascii';
import { burst, impactRing } from './fx';
import { sfx } from './sfx';
import { showDeathScreen, showMsg } from './hud';
import { player, state } from './state';
import { breakStreak } from './score';
import { hurtMult } from './upgrades';
import { absorbHit } from './sutra-shield';
import { levelGrace, secondWind } from './progression';
import { skyFlash } from './special';

export function hurtPlayer(dmg: number) {
  if (player.invuln > 0 || levelGrace() || state.dead) return false;
  if (absorbHit()) return false;   // a sutra of the sōhei's shield takes the blow
  player.hp -= dmg * hurtMult(); onPlayerHurt(); player.invuln = 0.5; state.lastHurt = state.time; breakStreak(); cellMat.uniforms.uHit.value = 1; state.shake = 0.5; sfx.hurt();
  if (player.hp <= 0 && secondWind()) {
    // Segundo aliento (level 25): the blow that should have killed you leaves you standing
    player.hp = Math.max(1, Math.round(player.maxHp * 0.3)); player.invuln = 2;
    const at = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
    burst(at, 0xffd27a, 90, 7); burst(at, 0xffffff, 40, 4, 0.1); impactRing(player.pos, 0xffd27a, 6);
    skyFlash(0.35); state.hitStop = 0.25; sfx.chime(true);
    showMsg('— SEGUNDO ALIENTO —\nte levantas una vez más', 2);
    return true;
  }
  if (player.hp <= 0) {
    player.hp = 0; state.dead = true;
    burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), 0xff3030, 120, 8);
    setTimeout(showDeathScreen, 1200);
  }
  return true;
}
