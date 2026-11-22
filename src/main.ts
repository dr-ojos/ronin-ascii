// Ronin ASCII: entry point. Wires the modules together and runs the frame loop.
import * as THREE from 'three';
import './assets';   // first: shows "cargando..." while the character model loads
import { renderer, scene, camera } from './renderer';
import { cellMat, renderAscii, resizeAscii } from './ascii';
import { animSamurai } from './avatar';
import { updateSparks } from './katana-fx';
import { updateRain, updateWorld, updateSky } from './world';
import { updateMinimap } from './minimap';
import { updateCamera, updateLightDir } from './camera';
import { updateHud } from './hud';
import { update } from './game';
import { state, player } from './state';
import './input';

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  let dt = Math.min(clock.getDelta(), 0.05);
  if (state.hitStop > 0) { state.hitStop -= dt; dt *= 0.1; }
  if (state.photo) { state.time += dt; state.yaw += dt * 0.35; } else update(dt);
  animSamurai(dt);
  updateSparks(dt, !state.dead);
  updateWorld();
  updateRain(dt);
  updateCamera(dt);
  updateSky(camera.position);
  updateLightDir();
  updateHud(dt);
  updateMinimap(dt);
  cellMat.uniforms.uMode.value = state.colorMode;
  if (state.asciiOn) renderAscii(scene, camera);
  else { renderer.setRenderTarget(null); renderer.render(scene, camera); }
}

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  resizeAscii();
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
});

// dev only: lets the browser console move the samurai around the world (__ronin.player.pos.set(x, 0, z))
if (import.meta.env.DEV) Object.assign(window, { __ronin: { state, player, scene, renderer, camera, THREE } });

frame();
