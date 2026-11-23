// One simulation step: player, oni, encounters and effects.
import { cellMat } from './ascii';
import { sam } from './avatar';
import { updatePetals } from './world';
import { updatePlayer } from './player';
import { updateEnemies } from './enemy-ai';
import { updateEncounters } from './encounters';
import { updateFx } from './fx';
import { updateSpecial } from './special';
import { updateMsg } from './hud';
import { updateShop } from './shop';
import { updateTemples } from './temples';
import { shopStageActive } from './shop-stage';
import { updateArmor } from './armor';
import { updateMenu } from './menu';
import { state } from './state';

export function update(dt: number) {
  state.time += dt;
  cellMat.uniforms.uTime.value = state.time;
  cellMat.uniforms.uHit.value = Math.max(0, cellMat.uniforms.uHit.value - dt * 3);
  updateMsg(dt);
  updatePetals(dt);
  updateMenu(dt);
  // a menu (the smith's shop, your look) pauses everything; the look menu circles the camera round you
  if (state.menu) {
    sam.root.visible = true;   // a menu can open mid-blink (invulnerable): never leave the ronin hidden
    if (shopStageActive()) updateShop(dt);
    else if (state.menu === 'custom') state.yaw += dt * 0.5;
    return;
  }

  if (!state.playing) { state.yaw += dt * 0.15; return; }
  if (state.dead) { sam.root.rotation.z = Math.min(sam.root.rotation.z + dt * 2, Math.PI / 2); return; }
  sam.root.rotation.z = 0;

  updatePlayer(dt);
  updateEnemies(dt);
  updateEncounters(dt);
  updateShop(dt);
  updateTemples(dt);
  updateArmor(dt);
  updateSpecial(dt);
  updateFx(dt);
}
