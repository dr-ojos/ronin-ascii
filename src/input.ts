// Keyboard and mouse.
import * as THREE from 'three';
import { canvas } from './renderer';
import { changeDensity } from './ascii';
import { tryAttack, tryDash } from './player';
import { reset } from './encounters';
import { tryOpen } from './loot';
import { tryLightning } from './special';
import { sfx } from './sfx';
import { showMsg, overlay } from './hud';
import { state, keys } from './state';

addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'Space') { e.preventDefault(); tryDash(); }
  if (!e.repeat && e.code === 'KeyK' && state.playing && !state.dead) tryAttack(false);
  if (!e.repeat && e.code === 'KeyL' && state.playing && !state.dead) tryAttack(true);
  if (!e.repeat && e.code === 'KeyE') tryOpen();
  if (!e.repeat && e.code === 'KeyP') tryLightning();
  if (e.code === 'KeyC') state.colorMode = (state.colorMode + 1) % 4;
  if (e.code === 'KeyT') state.asciiOn = !state.asciiOn;
  if (e.code === 'KeyM') sfx.setMuted(!sfx.muted);
  if (e.code === 'KeyR') { state.raining = !state.raining; sfx.setRain(state.raining); }
  if (e.code === 'KeyN') state.bigMap = !state.bigMap;
  if (e.code === 'KeyF') { state.photo = !state.photo; showMsg(state.photo ? 'MODO FOTO · F para volver' : '', state.photo ? 2 : 0.01); }
  if (e.key === '+' || e.code === 'Equal' || e.code === 'NumpadAdd') changeDensity(-1);
  if (e.key === '-' || e.code === 'Minus' || e.code === 'NumpadSubtract') changeDensity(1);
});
addEventListener('keyup', e => { keys[e.code] = false; });
// camera is fixed: the mouse no longer rotates the view
addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  if (!state.playing || state.dead) return;
  if (e.button === 0) tryAttack();
});
addEventListener('wheel', e => {
  if (state.photo) state.photoDist = THREE.MathUtils.clamp(state.photoDist + e.deltaY * 0.01, 2, 40);
  else state.camDistUser = THREE.MathUtils.clamp(state.camDistUser + e.deltaY * 0.01, 3, 34);
}, { passive: true });
overlay.addEventListener('click', () => {
  sfx.init(); overlay.style.display = 'none';
  if (state.dead || !state.playing) reset();
  state.playing = true;
});

