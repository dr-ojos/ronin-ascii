// Ronin ASCII: entry point. Wires the modules together and runs the frame loop.
import * as THREE from 'three';
import './assets';   // first: shows "cargando..." while the character model loads
import { renderer, scene, camera } from './renderer';
import { cellMat, renderAscii, resizeAscii, fitActorGrid } from './ascii';
import { animSamurai, sam } from './avatar';
import { updateOutfit } from './outfit';
import { updateSparks } from './katana-fx';
import { displayedWeapon } from './weapons';
import { updateRain, updateWorld, updateSky, setSunsetLighting } from './world';
import { updateMinimap } from './minimap';
import { updateCamera, updateLightDir } from './camera';
import { updateHud } from './hud';
import { updatePickupTags } from './loot';
import { updateInventoryButton } from './inventory';
import { updateInfoButton } from './info';
import { updateTeleport } from './teleport';
import { syncQuality } from './apply-quality';
import { update } from './game';
import { cineTimeScale, updateCinematic } from './cinematic';
import { state, player } from './state';
import { setDetailedSurfaces } from './surfaces';
import { fitGlyphs } from './surface-glyphs';
import './input';
import './class-select';
import './level-menu';
import './account';
import './title';
import { devSetLevel, gainXp } from './progression';
import { activeWorldEvent, resetWorldEvents, showcaseWorldEvent, triggerWorldEvent } from './world-events';
import { enemies } from './enemies';

const clock = new THREE.Clock();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  // a technique's cinematic slows time (cinematic.ts), on its own clock
  updateCinematic(dt);
  if (!state.menu) dt *= cineTimeScale();
  if (state.hitStop > 0) { state.hitStop -= dt; dt *= 0.1; }
  // photo mode freezes the game: never leave the ronin hidden mid-blink
  if (state.photo) { state.time += dt; state.yaw += dt * 0.35; sam.root.visible = true; } else update(dt);
  setSunsetLighting(!state.asciiOn);
  animSamurai(dt, displayedWeapon().form ?? 'katana');
  updateOutfit();
  updateSparks(dt, !state.dead);
  updateWorld();
  updateRain(dt);
  updateCamera(dt);
  updateSky(camera.position);
  updateLightDir();
  updateHud(dt);
  updatePickupTags();
  updateInventoryButton();
  updateInfoButton();
  updateTeleport(dt);
  updateMinimap(dt);
  cellMat.uniforms.uMode.value = state.colorMode;
  cellMat.uniforms.uRain.value = state.rainAmt;
  syncQuality();   // T mode runs at Baja quality, ASCII at the player's choice (apply-quality.ts)
  setDetailedSurfaces(!state.asciiOn);
  if (state.asciiOn) {
    // how tall the ronin stands on screen sizes the characters' letters (ascii.ts)
    const fr = sam.root.position;
    _a.set(fr.x, fr.y, fr.z).project(camera); _b.set(fr.x, fr.y + 1.8, fr.z).project(camera);
    const tall = Math.abs(_b.y - _a.y) * 0.5 * renderer.domElement.height;
    fitActorGrid(tall); fitGlyphs(tall);
    renderAscii(scene, camera);
  }
  else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  if (state.asciiOn) resizeAscii();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// dev only: lets the browser console move the samurai around the world (__ronin.player.pos.set(x, 0, z))
if (import.meta.env.DEV) {
  Object.assign(window, { __ronin: { state, player, scene, renderer, camera, THREE, enemies, progress: { gainXp, setLevel: devSetLevel }, triggerEvent: triggerWorldEvent, showcaseEvent: showcaseWorldEvent, activeEvent: activeWorldEvent, resetEvents: resetWorldEvents } });
  // Dev-only hotkeys (7 / 8 / 9) to summon and inspect each colossal world-event boss right in front of you
  addEventListener('keydown', e => {
    if (e.repeat || !state.playing || state.dead || state.menu) return;
    if (e.code === 'Digit7') showcaseWorldEvent('eclipse');
    else if (e.code === 'Digit8') showcaseWorldEvent('tempestad');
    else if (e.code === 'Digit9') showcaseWorldEvent('forja');
  });
}

frame();
