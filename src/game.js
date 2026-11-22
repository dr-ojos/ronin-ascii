// One simulation step: player, oni, waves and effects.
import { cellMat } from './ascii.js';
import { sam } from './avatar.js';
import { updatePetals } from './world.js';
import { updatePlayer } from './player.js';
import { updateEnemies } from './enemy-ai.js';
import { updateWaves } from './waves.js';
import { updateFx } from './fx.js';
import { updateMsg } from './hud.js';
import { state } from './state.js';

export function update(dt) {
  state.time += dt;
  cellMat.uniforms.uTime.value = state.time;
  cellMat.uniforms.uHit.value = Math.max(0, cellMat.uniforms.uHit.value - dt * 3);
  updateMsg(dt);
  updatePetals(dt);

  if (!state.playing) { state.yaw += dt * 0.15; return; }
  if (state.dead) { sam.root.rotation.z = Math.min(sam.root.rotation.z + dt * 2, Math.PI / 2); return; }
  sam.root.rotation.z = 0;

  updatePlayer(dt);
  updateEnemies(dt);
  updateWaves(dt);
  updateFx(dt);
}
