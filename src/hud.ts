// HUD text, centre-screen messages and the title / death overlay.
import { player, state } from './state';
import { camps, discovered, placeCount, chestsLeft } from './encounters';
import { upgradeList } from './upgrades';
import { look } from './look';
import { weapon } from './weapons';
import { armor } from './armor';
import { threatLabel } from './equipment-threat';
import { enemies, KINDS } from './enemies';
import { sfx } from './sfx';

const hud = document.getElementById('hud')!, msgEl = document.getElementById('msg')!, promptEl = document.getElementById('prompt')!;
export const overlay = document.getElementById('overlay')!;

const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

let msgTimer = 0;
export function showMsg(t: string, d = 1.8) { msgEl.textContent = t; msgEl.style.opacity = '1'; msgTimer = d; }
export function updateMsg(dt: number) {
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.style.opacity = '0'; }
  if (state.dead) promptEl.textContent = '';
}

let hudT = 0;
export function updateHud(dt: number) {
  hudT -= dt; if (hudT > 0) return; hudT = 0.1;
  promptEl.textContent = state.menu ? '' : state.prompt;
  const n = Math.round(24 * player.maxHp / 100), f = Math.round(player.hp / player.maxHp * n);
  const bar = '#'.repeat(f) + '-'.repeat(n - f);
  const modes = ['color', 'fósforo', 'ámbar', 'papel'];
  const streak = state.mult > 1 ? `  <span class="r">x${state.mult}</span> <span class="d">${'·'.repeat(Math.ceil(state.streakT * 2))}</span>` : '';
  const gain = state.gainT > 0 ? `<span class="y" style="opacity:${Math.min(1, state.gainT).toFixed(2)}">${state.gain}</span>` : '';
  const lairs = camps.filter(c => !c.route && !c.temp), cleared = lairs.filter(c => !c.roster.length).length;
  const ups = upgradeList();
  const rf = Math.floor(state.special * 12);
  const rayo = state.special >= 1
    ? `RAYO  [<span class="y">${'#'.repeat(12)}</span>] ${state.time % 0.8 < 0.5 ? '<span class="y">¡ listo !  pulsa P</span>' : ''}`
    : `RAYO  [<span class="b">${'#'.repeat(rf)}</span>${'-'.repeat(12 - rf)}] <span class="d">${Math.floor(state.special * 100)} %</span>`;
  // Major boss health takes priority when a nearby guardian is also fighting.
  let foe: (typeof enemies)[number] | null = null, fd = 40;
  for (const e of enemies) {
    const def = KINDS[e.kind];
    if ((!def.boss && !def.elite) || e.state === 'idle' || e.state === 'return') continue;
    const d = Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z);
    if (d >= 40 || (foe && KINDS[foe.kind].boss && !def.boss)) continue;
    if (d < fd || (def.boss && foe && !KINDS[foe.kind].boss)) { fd = d; foe = e; }
  }
  const ff = foe ? Math.max(0, Math.ceil(foe.hp / foe.maxHp * 16)) : 0;
  const foeBar = foe
    ? `<span class="r">${KINDS[foe.kind].name.toUpperCase()}</span>${KINDS[foe.kind].boss ? ` · FASE ${foe.enraged ? 'II' : 'I'}` : ''}\n  [<span class="r">${'#'.repeat(ff)}</span>${'-'.repeat(16 - ff)}]\n`
    : '';
  hud.innerHTML =
    `<span class="r">浪人</span> ${esc(look.name.toUpperCase() || 'RONIN')}\n` +
    `VIDA  [<span class="${player.hp < 30 ? 'r' : 'y'}">${bar}</span>] ${Math.ceil(player.hp)}\n` +
    `${rayo}\n` +
    `PUNTOS <span class="y">${state.score}</span>${streak}   <span class="d">récord ${state.best}</span>\n` +
    `MON <span class="y">${state.mon}</span>   <span class="b">${weapon().name}</span>${state.armor !== 'kimono' ? ` · <span class="b">${armor().name}</span>` : ''}\n` +
    `BAJAS ${state.kills}   GUARIDAS ${cleared}/${lairs.length}   <span class="y">${threatLabel()}</span>\n` +
    `COFRES ${state.chests}/${state.chests + chestsLeft()}   LUGARES ${discovered.size}/${placeCount()}\n` +
    (ups ? `<span class="y">${ups}</span>\n` : '') +
    foeBar +
    `${gain}\n` +
    `<span class="d">esquiva ${player.dashCd > 0 ? '·'.repeat(Math.ceil(player.dashCd * 8)) : 'lista'}  ·  paleta ${modes[state.colorMode]}${sfx.muted ? '  ·  sin sonido' : ''}</span>`;
}

export function showDeathScreen() {
  document.exitPointerLock?.();
  overlay.querySelector('.k')!.textContent = '散';
  const record = state.score > 0 && state.score >= state.best ? ' · ¡ nuevo récord !' : ` · récord ${state.best}`;
  overlay.querySelector('.sub')!.textContent = `${state.score} puntos · ${state.kills} onis · ${state.campsCleared} guaridas · ${state.chests} cofres · ${discovered.size} lugares${record}`;
  document.getElementById('go')!.textContent = '[ clic para volver a empezar ]';
  overlay.style.display = 'flex';
}
