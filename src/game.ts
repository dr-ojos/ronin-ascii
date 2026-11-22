// One simulation step: player, oni, waves and effects.
import { cellMat } from './ascii';
import { sam } from './avatar';
import { updatePetals } from './world';
import { updatePlayer } from './player';
import { updateEnemies } from './enemy-ai';
import { updateWaves } from './waves';
import { updateFx } from './fx';
import { updateMsg } from './hud';
import { state } from './state';

export function update(dt: number) {
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
