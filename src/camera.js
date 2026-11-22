// Third-person camera (zoom, photo mode, shake, pulled in front of buildings) and the on-screen
// moonlight direction used by the ASCII pass for lit / shadowed contours.
import * as THREE from 'three';
import { camera } from './renderer.js';
import { bufSize, cellMat } from './ascii.js';
import { camBlockers, moonDir } from './world.js';
import { player, state } from './state.js';
import { rnd } from './utils.js';

const tmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const camRay = new THREE.Raycaster();
export function updateCamera(dt) {
  camTarget.lerp(tmp.set(player.pos.x, state.photo ? 1.3 : 1.5, player.pos.z), Math.min(1, dt * 10));
  const pt = state.photo ? 0.3 + Math.min(0.5, (state.photoDist - 3.2) * 0.025) : state.pitch, cp = Math.cos(pt), camDist = state.photo ? state.photoDist : state.camDistUser;
  camera.position.set(
    camTarget.x + Math.sin(state.yaw) * cp * camDist,
    camTarget.y + Math.sin(pt) * camDist,
    camTarget.z + Math.cos(state.yaw) * cp * camDist
  );
  if (state.shake > 0) {
    camera.position.x += rnd(-1, 1) * state.shake * 0.25; camera.position.y += rnd(-1, 1) * state.shake * 0.25;
    state.shake = Math.max(0, state.shake - dt * 2.5);
  }
  camRay.set(camTarget, tmp.subVectors(camera.position, camTarget).normalize());
  camRay.far = camDist;
  const hit = camRay.intersectObjects(camBlockers, true)[0];
  if (hit && pt < 0.55) camera.position.copy(camTarget).addScaledVector(tmp, Math.max(1.5, hit.distance - 0.4));
  camera.lookAt(camTarget);
}

const _l0 = new THREE.Vector3(), _l1 = new THREE.Vector3();
export function updateLightDir() {
  _l0.set(player.pos.x, 1.2, player.pos.z).project(camera);
  _l1.set(player.pos.x, 1.2, player.pos.z).addScaledVector(moonDir, 1.5).project(camera);
  const dx = (_l1.x - _l0.x) * bufSize.x, dy = (_l1.y - _l0.y) * bufSize.y, len = Math.hypot(dx, dy);
  if (len > 1e-3) cellMat.uniforms.uLight.value.set(dx / len, dy / len);
}
