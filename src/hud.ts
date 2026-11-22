// HUD text, centre-screen messages and the title / death overlay.
import { player, state } from './state';
import { camps, discovered, placeCount } from './encounters';
import { sfx } from './sfx';

const hud = document.getElementById('hud')!, msgEl = document.getElementById('msg')!;
export const overlay = document.getElementById('overlay')!;

let msgTimer = 0;
export function showMsg(t: string, d = 1.8) { msgEl.textContent = t; msgEl.style.opacity = '1'; msgTimer = d; }
export function updateMsg(dt: number) {
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.style.opacity = '0'; }
}

let hudT = 0;
export function updateHud(dt: number) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  const n = 24, f = Math.round(player.hp / 100 * n);
  const bar = '#'.repeat(f) + '-'.repeat(n - f);
  const modes = ['color', 'fósforo', 'ámbar', 'papel'];
  const streak = state.mult > 1 ? `  <span class="r">x${state.mult}</span> <span class="d">${'·'.repeat(Math.ceil(state.streakT * 2))}</span>` : '';
  const gain = state.gainT > 0 ? `<span class="y" style="opacity:${Math.min(1, state.gainT).toFixed(2)}">${state.gain}</span>` : '';
  const cleared = camps.filter(c => c.left <= 0).length;
  hud.innerHTML =
    `<span class="r">浪人</span> RONIN ASCII\n` +
    `VIDA  [<span class="${player.hp < 30 ? 'r' : 'y'}">${bar}</span>] ${Math.ceil(player.hp)}\n` +
    `PUNTOS <span class="y">${state.score}</span>${streak}   <span class="d">récord ${state.best}</span>\n` +
    `BAJAS ${state.kills}   GUARIDAS ${cleared}/${camps.length}   LUGARES ${discovered.size}/${placeCount}\n` +
    `${gain}\n` +
    `<span class="d">esquiva ${player.dashCd > 0 ? '·'.repeat(Math.ceil(player.dashCd * 8)) : 'lista'}  ·  paleta ${modes[state.colorMode]}${sfx.muted ? '  ·  sin sonido' : ''}</span>`;
}

export function showDeathScreen() {
  document.exitPointerLock?.();
  overlay.querySelector('.k')!.textContent = '散';
  const record = state.score > 0 && state.score >= state.best ? ' · ¡ nuevo récord !' : ` · récord ${state.best}`;
  overlay.querySelector('.sub')!.textContent = `${state.score} puntos · ${state.kills} onis · ${state.campsCleared} guaridas · ${discovered.size} lugares${record}`;
  document.getElementById('go')!.textContent = '[ clic para volver a empezar ]';
  overlay.style.display = 'flex';
}
