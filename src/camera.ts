// Third-person camera (zoom, photo mode, shake, pulled in front of buildings) and the on-screen
// moonlight direction used by the ASCII pass for lit / shadowed contours.
import * as THREE from 'three';
import { camera } from './renderer';
import { bufSize, cellMat } from './ascii';
import { nearBlockers, moonDir, keyLight } from './world';
import { formKey } from './manga-art';
import { groundY } from './terrain';
import { shopCameraPos, shopFocus, shopStageActive } from './shop-stage';
import { player, state } from './state';
import { rnd } from './utils';
import { bossFocus, cineCam } from './cinematic';

const tmp = new THREE.Vector3();
const camTarget = new THREE.Vector3();
const shopRight = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const camRay = new THREE.Raycaster();
/** snap the camera target immediately to the player (used after teleports so the camera never whips across the map) */
export function snapCamera() {
  camTarget.set(player.pos.x, player.pos.y + 1.5, player.pos.z);
}
export function updateCamera(dt: number) {
  // the look menu (custom.ts) and the title screen frame the samurai close up, like the photo mode
  const dress = state.menu === 'custom' || (state.showcase && !state.menu);
  // photo mode close up (F + wheel): the camera comes down to eye level and frames the face
  const close = state.photo ? THREE.MathUtils.clamp((5 - state.photoDist) / 3, 0, 1) : 0;
  camTarget.lerp(tmp.set(player.pos.x, player.pos.y + (state.photo || dress ? 1.3 + 0.3 * close : 1.5), player.pos.z), Math.min(1, dt * 10));
  const narrowShop = state.menu === 'shop' && !state.photo && innerWidth <= 680;
  const zoom = narrowShop ? Math.min(0.66, camera.aspect * 1.2) : 1;
  if (camera.zoom !== zoom) { camera.zoom = zoom; camera.updateProjectionMatrix(); }
  if (shopStageActive() && !state.photo) {
    camera.position.copy(shopCameraPos);
    const halfHeight = camera.position.distanceTo(shopFocus) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) / zoom;
    const halfWidth = halfHeight * camera.aspect;
    shopRight.set(shopCameraPos.z - shopFocus.z, 0, shopFocus.x - shopCameraPos.x).normalize();
    if (narrowShop) {
      camera.lookAt(tmp.copy(shopFocus).addScaledVector(shopRight, -halfWidth * 0.24).addScaledVector(camera.up, -halfHeight * 0.32));
      return;
    }
    const occupied = Math.min(440, innerWidth * 0.41) + 24;
    camera.lookAt(tmp.copy(shopFocus).addScaledVector(shopRight, halfWidth * occupied / innerWidth));
    return;
  }
  // a technique's cinematic pushes the camera in, a little lower (cinematic.ts)
  const cine = state.photo || dress ? null : cineCam();
  const focus = state.photo || dress ? null : bossFocus();
  const fw = focus ? focus.weight : 0;
  const basePt = state.photo ? (0.3 + Math.min(0.5, (state.photoDist - 3.2) * 0.025)) * (1 - close) - 0.03 * close : dress ? 0.32 : state.pitch + (cine?.pitch ?? 0);
  const pt = THREE.MathUtils.lerp(basePt, 0.22, fw), cp = Math.cos(pt);
  // inside Masa's shop the camera comes in closer (its roof is hidden, shop.ts)
  const camDist = (state.photo ? state.photoDist : dress ? 4.4 : state.indoors ? Math.min(state.camDistUser, 11) : state.camDistUser) * (cine?.dist ?? 1) * (1 + 0.15 * fw);
  camera.position.set(
    camTarget.x + Math.sin(state.yaw) * cp * camDist,
    camTarget.y + Math.sin(pt) * camDist,
    camTarget.z + Math.cos(state.yaw) * cp * camDist
  );
  if (state.shake > 0) {
    camera.position.x += rnd(-1, 1) * state.shake * 0.25; camera.position.y += rnd(-1, 1) * state.shake * 0.25;
    state.shake = Math.max(0, state.shake - dt * 2.5);
  }
  camRay.camera = camera;
  camRay.set(camTarget, tmp.subVectors(camera.position, camTarget).normalize());
  camRay.far = camDist;
  const hit = camRay.intersectObjects(nearBlockers(player.pos.x, player.pos.z), true)[0];
  if (hit && pt < 0.55) camera.position.copy(camTarget).addScaledVector(tmp, Math.max(1.5, hit.distance - 0.4));
  // never dig into a hillside
  const gy = groundY(camera.position.x, camera.position.z) + 1.2;
  if (camera.position.y < gy) camera.position.y = gy;
  // the title screen keeps its panel on the left: aim a little left of the warrior so he stands on the right
  if (state.showcase && !state.menu && innerWidth > 820) {
    const halfWidth = camDist * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    camera.lookAt(tmp.set(Math.cos(state.yaw), 0, -Math.sin(state.yaw)).multiplyScalar(-halfWidth * 0.42).add(camTarget));
    return;
  }
  if (fw > 0.002 && focus) {
    lookTarget.copy(camTarget).lerp(tmp.set(focus.pos.x, focus.pos.y + 3.1, focus.pos.z), fw * 0.78);
    camera.lookAt(lookTarget);
  } else {
    camera.lookAt(camTarget);
  }
  if (cine?.roll) camera.rotateZ(cine.roll);   // a slight Dutch angle while a technique or boss reveal plays
}

const _l0 = new THREE.Vector3(), _l1 = new THREE.Vector3();
export function updateLightDir() {
  _l0.set(player.pos.x, player.pos.y + 1.2, player.pos.z).project(camera);
  _l1.set(player.pos.x, player.pos.y + 1.2, player.pos.z).addScaledVector(moonDir, 1.5).project(camera);
  const dx = (_l1.x - _l0.x) * bufSize.x, dy = (_l1.y - _l0.y) * bufSize.y, len = Math.hypot(dx, dy);
  if (len > 1e-3) cellMat.uniforms.uLight.value.set(dx / len, dy / len);
  // the figures' key light: a 3/4 light from the moon's side of the screen, a little above and in
  // front, so one side of the body is lit and the other turns into shadow (manga-art.ts FORM)
  cellMat.uniforms.uMoonW.value.copy(moonDir);   // the relief engine re-lights the scene with the same moon (ascii.ts)
  const L = cellMat.uniforms.uLight.value;
  const k = formKey.value.set(L.x * 0.78, Math.max(L.y, -0.2) * 0.62 + 0.38, 0.62).normalize();
  _l0.copy(k).transformDirection(camera.matrixWorld);
  keyLight.position.set(player.pos.x, player.pos.y + 1.1, player.pos.z).addScaledVector(_l0, 3);
}
