// HUD text, centre-screen messages and the title / death overlay.
import { battleLine } from './battle';
import { bossHud } from './boss-mechanics';
import { player, state } from './state';
import { camps, discovered, placeCount, chestsLeft } from './encounters';
import { upgradeList } from './upgrades';
import { look } from './look';
import { weapon } from './weapons';
import { armor } from './armor';
import { threatLabel } from './equipment-threat';
import { enemies, KINDS } from './enemies';
import { sfx } from './sfx';
import { TECHNIQUES } from './techniques';
import { cls } from './classes';
import { freePoints, level, MAX_LEVEL, xpFrac } from './progression';

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
  const streak = state.mult > 1 ? `  <span class="r">x${state.mult}</span> <span class="d">${'·'.repeat(Math.ceil(state.streakT * 2))}</span>` : '';
  const gain = state.gainT > 0 ? `<span class="y" style="opacity:${Math.min(1, state.gainT).toFixed(2)}">${state.gain}</span>` : '';
  const lairs = camps.filter(c => !c.route && !c.temp && !c.wildlife), cleared = lairs.filter(c => !c.roster.length).length;
  const ups = upgradeList();
  // one line per technique slot: its name, its charge, and its key once full
  const slotLine = (id: typeof state.technique, charge: number, key: string) => {
    const t = TECHNIQUES[id], rf = Math.floor(charge * 12);
    return `<span class="d">${key}</span> <span style="color:#${t.color.toString(16).padStart(6, '0')}">${t.short.toUpperCase().padEnd(13)}</span>` + (charge >= 1
      ? `[<span class="y">${'#'.repeat(12)}</span>] <span class="y">lista</span>`
      : `[<span class="b">${'#'.repeat(rf)}</span>${'-'.repeat(12 - rf)}] <span class="d">${Math.floor(charge * 100)} %</span>`);
  };
  const special = `${slotLine(state.technique, state.special, 'P')}\n${slotLine(state.technique2, state.special2, 'J')}`;
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
    ? `<span class="r">${KINDS[foe.kind].name.toUpperCase()}</span>${KINDS[foe.kind].boss ? ` · FASE ${foe.enraged ? 'II' : 'I'}` : ''}\n  [<span class="r">${'#'.repeat(ff)}</span>${'-'.repeat(16 - ff)}]\n${bossHud(foe)}`
    : '';
  // the level and the road to the next one (progression.ts); the bar glows for a moment after a level-up
  const xf = Math.floor(xpFrac() * 14), lv = level(), free = freePoints();
  const xpBar = lv >= MAX_LEVEL
    ? `[<span class="lv">${'#'.repeat(14)}</span>] <span class="lv">LEYENDA</span>`
    : `[<span class="xp">${'#'.repeat(xf)}</span>${'-'.repeat(14 - xf)}] <span class="d">${Math.floor(xpFrac() * 100)} %</span>`;
  const pts = free ? ` <span class="pts">+${free} U</span>` : '';
  hud.innerHTML =
    `<span class="r">${cls().kanji}</span> ${esc(look.name.toUpperCase() || cls().name.toUpperCase())}\n` +
    `<span class="lv">NIVEL ${lv}</span> ${xpBar}${pts}\n` +
    `VIDA  [<span class="${player.hp < 30 ? 'r' : 'y'}">${bar}</span>] ${Math.ceil(player.hp)}\n` +
    `${special}\n` +
    `PUNTOS <span class="y">${state.score}</span>${streak}   <span class="d">récord ${state.best}</span>\n` +
    `MON <span class="y">${state.mon}</span>   <span class="b">${weapon().name}</span>${state.armor !== 'kimono' ? ` · <span class="b">${armor().name}</span>` : ''}\n` +
    `SELLOS DE JADE <span class="jade">${state.jade}</span>\n` +
    `BAJAS ${state.kills}   GUARIDAS ${cleared}/${lairs.length}   <span class="y">${threatLabel()}</span>\n` +
    `COFRES ${state.chests}/${state.chests + chestsLeft()}   LUGARES ${discovered.size}/${placeCount()}\n` +
    (ups ? `<span class="y">${ups}</span>\n` : '') +
    battleLine() + foeBar +
    `${gain}\n` +
    `<span class="d">esquiva ${player.dashCd > 0 ? '·'.repeat(Math.ceil(player.dashCd * 8)) : 'lista'}${sfx.muted ? '  ·  sin sonido' : ''}</span>${player.snareT > 0 ? ' <span class="r">· telaraña</span>' : ''}`;
}

export function showDeathScreen() {
  document.exitPointerLock?.();
  overlay.querySelector('.k')!.textContent = '散';
  const record = state.score > 0 && state.score >= state.best ? ' · ¡ nuevo récord !' : ` · récord ${state.best}`;
  dispatchEvent(new Event('ronin:overlay'));   // class-select.ts refreshes the level under the class
  overlay.querySelector('.sub')!.textContent = `nivel ${level()} · ${state.score} puntos · ${state.kills} bajas · ${state.campsCleared} guaridas · ${state.chests} cofres · ${discovered.size} lugares${record}`;
  document.getElementById('go')!.textContent = '▶ VOLVER A EMPEZAR';
  overlay.style.display = 'flex';
}
