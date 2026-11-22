// Ronin ASCII: entry point. Wires the modules together and runs the frame loop.
import * as THREE from 'three';
import './assets.js';   // first: shows "cargando..." while the character model loads
import { renderer, scene, camera } from './renderer.js';
import { cellMat, renderAscii, resizeAscii } from './ascii.js';
import { animSamurai } from './avatar.js';
import { updateSparks } from './katana-fx.js';
import { updateRain } from './world.js';
import { updateCamera, updateLightDir } from './camera.js';
import { updateHud } from './hud.js';
import { update } from './game.js';
import { state } from './state.js';
import './input.js';

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (state.hitStop > 0) { state.hitStop -= dt; dt *= 0.1; }
  if (state.photo) { state.time += dt; state.yaw += dt * 0.35; } else update(dt);
  animSamurai(dt);
  updateSparks(dt, !state.dead);
  updateRain(dt);
  updateCamera(dt);
  updateLightDir();
  updateHud(dt);
  cellMat.uniforms.uMode.value = state.colorMode;
  if (state.asciiOn) renderAscii(scene, camera);
  else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  resizeAscii();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

frame();
