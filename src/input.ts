// Keyboard and mouse.
import * as THREE from 'three';
import { canvas } from './renderer';
import { changeDensity } from './ascii';
import { toggleSurfaceGlyphs } from './surface-glyphs';
import { tryAttack, tryDash, tryJump } from './player';
import { reset } from './encounters';
import { tryOpen } from './loot';
import { trySpecial } from './special';
import { cycleTechnique } from './techniques';
import { tryTalkTemple } from './temples';
import { tryTalk } from './shop';
import { menuKey } from './menu';
import { inventoryButton, toggleInventory } from './inventory';
import { cycleWeapon, resetWeapons, weapon } from './weapons';
import { resetArmor } from './armor';
import { dressUp } from './outfit';
import { sfx } from './sfx';
import { toggleRain } from './world';
import { showMsg, overlay } from './hud';
import { state, keys } from './state';
import { resetMinimap, zoomBigMap } from './minimap';
import { toggleLevelMenu } from './level-menu';
import { startRun } from './progression';
import { toggleInfo } from './info';

/** camera heading when photo mode was switched on */
let photoYaw = 0;
/** let go of every held key: the ronin stops instead of running on by himself */
function releaseKeys() { for (const k in keys) keys[k] = false; }
const isMeta = (e: KeyboardEvent) => e.key === 'Meta' || e.code === 'MetaLeft' || e.code === 'MetaRight' || e.code === 'OSLeft' || e.code === 'OSRight';
// a key let go while the page has no focus (another window, the address bar, the find bar) never sends its keyup
addEventListener('blur', releaseKeys);
addEventListener('visibilitychange', () => { if (document.hidden) releaseKeys(); });
// ⌘W / ⌘Q (Ctrl+W on Windows) close the tab or the whole browser and the page cannot stop them: the thumb on
// SPACE slides onto ⌘ easily. During a run the browser asks first instead of throwing the game away.
addEventListener('beforeunload', e => {
  if (!state.playing || state.dead) return;
  e.preventDefault();
  e.returnValue = '';
});
addEventListener('keydown', e => {
  // the title screen's fields and buttons keep their keys (typing an email must not mute the sound)
  if (!state.menu && (e.target as HTMLElement | null)?.closest?.('#overlay')) return;
  // macOS sends no keyup for keys let go while ⌘ is held: W would stay "pressed" and the ronin run forever.
  // ⌘ (or Ctrl) + a key is a browser shortcut, never a game key.
  if (isMeta(e)) { releaseKeys(); return; }
  if (e.metaKey || e.ctrlKey) return;
  if (e.code === 'KeyH' && !e.metaKey && !e.ctrlKey && !e.altKey && (!state.menu || state.menu === 'info')) {
    if (!e.repeat && (state.menu === 'info' || (state.playing && !state.dead))) toggleInfo();
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyI' && !e.metaKey && !e.ctrlKey && !e.altKey && (!state.menu || state.menu === 'inventory')) {
    if (!e.repeat) toggleInventory(document.activeElement === inventoryButton);
    e.preventDefault();
    return;
  }
  if (e.code === 'KeyU' && !e.metaKey && !e.ctrlKey && !e.altKey && (!state.menu || state.menu === 'level')) {
    if (!e.repeat) toggleLevelMenu();
    e.preventDefault();
    return;
  }
  if (menuKey(e)) return;   // an open menu takes the keys
  if (e.target === inventoryButton && (e.code === 'Enter' || e.code === 'Space')) return;
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); if (!e.repeat) tryJump(); }
  if (!e.repeat && e.code === 'KeyV') tryDash();
  if (!e.repeat && e.code === 'KeyK' && state.playing && !state.dead) tryAttack(false);
  if (!e.repeat && e.code === 'KeyL' && state.playing && !state.dead) tryAttack(true);
  if (!e.repeat && e.code === 'KeyE' && !tryTalk() && !tryTalkTemple()) tryOpen();
  if (!e.repeat && e.code === 'KeyQ' && state.playing && !state.dead) {
    const w = cycleWeapon();
    showMsg(w ? `— ${w.name} —` : `solo tienes ${weapon().name} · Masa vende más en la casa del santuario`, w ? 1.2 : 2.2);
  }
  if (!e.repeat && e.code === 'KeyP') trySpecial();
  if (!e.repeat && e.code === 'KeyO' && state.playing && !state.dead && !state.photo) {
    if (state.learnedTechniques.length > 1) showMsg(`— ${cycleTechnique().name.toUpperCase()} —`, 1.2);
    else showMsg('Aprende técnicas en los templos ◆ del mapa (N).\nLos cofres contienen sellos de jade.', 2.6);
  }
  // switches act once per press: a held key repeats ~30 times a second, and every T rebuilds the graphics
  // (quality, shadow map, shaders) — holding it froze the game for seconds and could bring the browser down
  if (e.repeat) { if (e.code !== 'Equal' && e.code !== 'Minus' && e.code !== 'NumpadAdd' && e.code !== 'NumpadSubtract' && e.key !== '+' && e.key !== '-') return; }
  if (e.code === 'KeyT') state.asciiOn = !state.asciiOn;
  if (e.code === 'KeyG') toggleSurfaceGlyphs();   // letters on the figures' surface <-> screen-grid characters
  if (e.code === 'KeyM') sfx.setMuted(!sfx.muted);
  if (e.code === 'KeyR') toggleRain();
  if (e.code === 'KeyN') state.bigMap = !state.bigMap;
  if (e.code === 'KeyF') {
    // photo mode orbits the camera; leaving it puts the camera (and the minimap's north) back where it was
    if (state.photo) state.yaw = photoYaw; else photoYaw = state.yaw;
    state.photo = !state.photo; showMsg(state.photo ? 'MODO FOTO · F para volver' : '', state.photo ? 2 : 0.01); }
  const plus = e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd', minus = e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract';
  if (state.bigMap && !state.menu) { if (plus) zoomBigMap(1); if (minus) zoomBigMap(-1); }
  else { if (plus) changeDensity(-1); if (minus) changeDensity(1); }
});
addEventListener('keyup', e => { keys[e.code] = false; if (isMeta(e)) releaseKeys(); });
// camera is fixed: the mouse no longer rotates the view
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!state.playing || state.dead || state.menu) return;
  if (e.button === 0) tryAttack();
  else if (e.button === 2) tryDash();
});
let mapWheel = 0;
addEventListener('wheel', e => {
  if (state.menu) return;
  if (state.bigMap) {   // trackpads send many small steps: one zoom level per notch
    mapWheel += e.deltaY;
    if (Math.abs(mapWheel) > 60) { zoomBigMap(mapWheel < 0 ? 1 : -1); mapWheel = 0; }
    return;
  }
  if (state.photo) state.photoDist = THREE.MathUtils.clamp(state.photoDist + e.deltaY * 0.01, 2, 40);
  else state.camDistUser = THREE.MathUtils.clamp(state.camDistUser + e.deltaY * 0.01, 3, 34);
}, { passive: true });
/** the title screen's start button (title.ts) */
export function startGame() {
  (document.activeElement as HTMLElement | null)?.blur?.();   // the keys go back to the game, not the hidden button
  sfx.init(); overlay.style.display = 'none';
  if (state.dead || !state.playing) { reset(); resetMinimap(); resetWeapons(); resetArmor(); dressUp(); startRun(); }
  state.playing = true;
}
document.getElementById('go')!.addEventListener('click', startGame);

