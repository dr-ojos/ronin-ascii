// Ronin ASCII: entry point. Wires the modules together and runs the frame loop.
import * as THREE from 'three';
import './assets';   // first: shows "cargando..." while the character model loads
import { renderer, scene, camera, DPR } from './renderer';
import { cellMat, renderAscii, resizeAscii, fitActorGrid } from './ascii';
import { animSamurai, sam } from './avatar';
import { updateOutfit } from './outfit';
import { updateSparks } from './katana-fx';
import { displayedWeapon } from './weapons';
import { updateRain, updateWorld, updateSky } from './world';
import { updateMinimap } from './minimap';
import { updateCamera, updateLightDir } from './camera';
import { updateHud } from './hud';
import { updatePickupTags } from './loot';
import { updateInventoryButton } from './inventory';
import { updateInfoButton } from './info';
import { update } from './game';
import { state, player } from './state';
import { setDetailedSurfaces } from './surfaces';
import { fitGlyphs } from './surface-glyphs';
import './input';
import './class-select';
import './level-menu';
import './account';
import './title';
import { devSetLevel, gainXp } from './progression';

const clock = new THREE.Clock();
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
const MODE_T_DPR = Math.min(DPR, 1.25);
let lastAsciiOn = state.asciiOn;
function syncPixelRatio() {
  renderer.setPixelRatio(state.asciiOn ? DPR : MODE_T_DPR);
  renderer.setSize(innerWidth, innerHeight);
}
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (state.hitStop > 0) { state.hitStop -= dt; dt *= 0.1; }
  // photo mode freezes the game: never leave the ronin hidden mid-blink
  if (state.photo) { state.time += dt; state.yaw += dt * 0.35; sam.root.visible = true; } else update(dt);
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
  updateMinimap(dt);
  cellMat.uniforms.uMode.value = state.colorMode;
  if (state.asciiOn !== lastAsciiOn) {
    lastAsciiOn = state.asciiOn;
    syncPixelRatio();
    if (state.asciiOn) resizeAscii();
  }
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
  syncPixelRatio();
  if (state.asciiOn) resizeAscii();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// dev only: lets the browser console move the samurai around the world (__ronin.player.pos.set(x, 0, z))
if (import.meta.env.DEV) Object.assign(window, { __ronin: { state, player, scene, renderer, camera, THREE, progress: { gainXp, setLevel: devSetLevel } } });

frame();
