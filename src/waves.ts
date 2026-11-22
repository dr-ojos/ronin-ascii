// Waves of oni, and starting a new run.
import { scene } from './renderer';
import { enemies, spawnOni } from './enemies';
import { sfx } from './sfx';
import { showMsg } from './hud';
import { player, state } from './state';

export function reset() {
  for (const e of enemies) scene.remove(e.g);
  enemies.length = 0;
  Object.assign(player, { hp: 100, attackT: -1, combo: 0, dashT: 0, dashCd: 0, invuln: 1 });
  player.pos.set(0, 0, 4); state.wave = 0; state.kills = 0; state.waveTimer = 1.2; state.dead = false;
}

export function updateWaves(dt: number) {
  if (enemies.length === 0) {
    state.waveTimer -= dt;
    if (state.waveTimer <= 0) {
      state.wave++;
      const n = 2 + state.wave * 2;
      for (let i = 0; i < n; i++) spawnOni(state.wave % 3 === 0 && i === 0);
      sfx.waveStart(state.wave % 3 === 0);
      showMsg(state.wave % 3 === 0 ? `— OLEADA ${state.wave} —\n¡ un oni gigante se acerca !` : `— OLEADA ${state.wave} —`);
      player.hp = Math.min(100, player.hp + 15);
      state.waveTimer = 2.5;
    }
  }
}
