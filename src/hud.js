// HUD text, centre-screen messages and the title / death overlay.
import { player, state } from './state.js';
import { enemies } from './enemies.js';
import { sfx } from './sfx.js';

const hud = document.getElementById('hud'), msgEl = document.getElementById('msg');
export const overlay = document.getElementById('overlay');

let msgTimer = 0;
export function showMsg(t, d = 1.8) { msgEl.textContent = t; msgEl.style.opacity = 1; msgTimer = d; }
export function updateMsg(dt) {
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.style.opacity = 0; }
}

let hudT = 0;
export function updateHud(dt) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  const n = 24, f = Math.round(player.hp / 100 * n);
  const bar = '#'.repeat(f) + '-'.repeat(n - f);
  const modes = ['color', 'fósforo', 'ámbar', 'papel'];
  hud.innerHTML =
    `<span class="r">浪人</span> RONIN ASCII\n` +
    `VIDA  [<span class="${player.hp < 30 ? 'r' : 'y'}">${bar}</span>] ${Math.ceil(player.hp)}\n` +
    `OLEADA ${state.wave}   BAJAS ${state.kills}   ONIS ${enemies.length}\n` +
    `<span class="d">esquiva ${player.dashCd > 0 ? '·'.repeat(Math.ceil(player.dashCd * 8)) : 'lista'}  ·  paleta ${modes[state.colorMode]}${sfx.muted ? '  ·  sin sonido' : ''}</span>`;
}

export function showDeathScreen() {
  document.exitPointerLock?.();
  overlay.querySelector('.k').textContent = '散';
  overlay.querySelector('.sub').textContent = `Has caído en la oleada ${state.wave} · ${state.kills} onis abatidos`;
  document.getElementById('go').textContent = '[ clic para volver a empezar ]';
  overlay.style.display = 'flex';
}
