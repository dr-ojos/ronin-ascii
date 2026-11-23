// Keyboard and mouse.
import * as THREE from 'three';
import { canvas } from './renderer';
import { changeDensity } from './ascii';
import { tryAttack, tryDash } from './player';
import { reset } from './encounters';
import { tryOpen } from './loot';
import { trySpecial } from './special';
import { cycleTechnique } from './techniques';
import { tryTalkTemple } from './temples';
import { tryTalk } from './shop';
import { menuKey } from './menu';
import { cycleWeapon, resetWeapons } from './weapons';
import { resetArmor } from './armor';
import { dressUp } from './outfit';
import { sfx } from './sfx';
import { toggleRain } from './world';
import { showMsg, overlay } from './hud';
import { state, keys } from './state';

/** camera heading when photo mode was switched on */
let photoYaw = 0;
addEventListener('keydown', e => {
  if (menuKey(e)) return;   // an open menu takes the keys
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
  if (e.code === 'KeyM') sfx.setMuted(!sfx.muted);
  if (e.code === 'KeyR') toggleRain();
  if (e.code === 'KeyN') state.bigMap = !state.bigMap;
  if (e.code === 'KeyF') {
    // photo mode orbits the camera; leaving it puts the camera (and the minimap's north) back where it was
    if (state.photo) state.yaw = photoYaw; else photoYaw = state.yaw;
    state.photo = !state.photo; showMsg(state.photo ? 'MODO FOTO · F para volver' : '', state.photo ? 2 : 0.01); }
  if (e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') changeDensity(-1);
  if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') changeDensity(1);
});
addEventListener('keyup', e => { keys[e.code] = false; });
// camera is fixed: the mouse no longer rotates the view
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!state.playing || state.dead || state.menu) return;
  if (e.button === 0) tryAttack();
});
addEventListener('wheel', e => {
  if (state.menu) return;
  if (state.photo) state.photoDist = THREE.MathUtils.clamp(state.photoDist + e.deltaY * 0.01, 2, 40);
  else state.camDistUser = THREE.MathUtils.clamp(state.camDistUser + e.deltaY * 0.01, 3, 34);
}, { passive: true });
overlay.addEventListener('click', () => {
  sfx.init(); overlay.style.display = 'none';
  if (state.dead || !state.playing) { reset(); resetWeapons(); resetArmor(); dressUp(); }
  state.playing = true;
});

