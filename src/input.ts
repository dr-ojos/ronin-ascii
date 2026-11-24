// Keyboard and mouse.
import * as THREE from 'three';
import { canvas } from './renderer';
import { changeDensity } from './ascii';
import { toggleSurfaceGlyphs } from './surface-glyphs';
import { tryAttack, tryDash } from './player';
import { reset } from './encounters';
import { tryOpen } from './loot';
import { trySpecial } from './special';
import { cycleTechnique } from './techniques';
import { tryTalkTemple } from './temples';
import { tryTalk } from './shop';
import { menuKey } from './menu';
import { inventoryButton, toggleInventory } from './inventory';
import { cycleWeapon, resetWeapons } from './weapons';
import { resetArmor } from './armor';
import { dressUp } from './outfit';
import { sfx } from './sfx';
import { toggleRain } from './world';
import { showMsg, overlay } from './hud';
import { state, keys } from './state';
import { resetMinimap, zoomBigMap } from './minimap';

/** camera heading when photo mode was switched on */
let photoYaw = 0;
addEventListener('keydown', e => {
  if (e.code === 'KeyI' && !e.metaKey && !e.ctrlKey && !e.altKey && (!state.menu || state.menu === 'inventory')) {
    if (!e.repeat) toggleInventory(document.activeElement === inventoryButton);
    e.preventDefault();
    return;
  }
  if (menuKey(e)) return;   // an open menu takes the keys
  if (e.target === inventoryButton && (e.code === 'Enter' || e.code === 'Space')) return;
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); tryDash(); }
  if (!e.repeat && e.code === 'KeyK' && state.playing && !state.dead) tryAttack(false);
  if (!e.repeat && e.code === 'KeyL' && state.playing && !state.dead) tryAttack(true);
  if (!e.repeat && e.code === 'KeyE' && !tryTalk() && !tryTalkTemple()) tryOpen();
  if (!e.repeat && e.code === 'KeyQ' && state.playing && !state.dead) {
    const w = cycleWeapon();
    showMsg(w ? `— ${w.name} —` : 'solo tienes esta katana · Masa vende más en la casa del santuario', w ? 1.2 : 2.2);
  }
  if (!e.repeat && e.code === 'KeyP') trySpecial();
  if (!e.repeat && e.code === 'KeyO' && state.playing && !state.dead && !state.photo) {
    if (state.learnedTechniques.length > 1) showMsg(`— ${cycleTechnique().name.toUpperCase()} —`, 1.2);
    else showMsg('Aprende técnicas en los templos ◆ del mapa (N).\nLos cofres contienen sellos de jade.', 2.6);
  }
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
addEventListener('keyup', e => { keys[e.code] = false; });
// camera is fixed: the mouse no longer rotates the view
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!state.playing || state.dead || state.menu) return;
  if (e.button === 0) tryAttack();
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
overlay.addEventListener('click', () => {
  sfx.init(); overlay.style.display = 'none';
  if (state.dead || !state.playing) { reset(); resetMinimap(); resetWeapons(); resetArmor(); dressUp(); }
  state.playing = true;
});

