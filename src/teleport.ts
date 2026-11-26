// Fast-travel teleportation to the outside of Masa's shop (the starting shrine steps).
// Triggered with B or the on-screen HUD button.
import * as THREE from 'three';
import { sam } from './avatar';
import { snapCamera } from './camera';
import { burst, impactRing } from './fx';
import { showMsg } from './hud';
import { sfx } from './sfx';
import { skyFlash } from './special';
import { player, state } from './state';
import { surfaceY } from './structures';

/** right outside the stone steps of Masa's shop, facing the doorway and signboard */
export const SHOP_EXTERIOR = new THREE.Vector3(0, 0, -15.5);
const TELEPORT_CD = 10;

let cooldown = 0;

export const teleportButton = document.createElement('button');
teleportButton.type = 'button';
teleportButton.id = 'teleport-btn';
teleportButton.hidden = true;
teleportButton.setAttribute('aria-label', 'Teletransportarse a las afueras de la tienda de Masa');
teleportButton.setAttribute('aria-keyshortcuts', 'B');
teleportButton.innerHTML = '<kbd aria-hidden="true">B</kbd> <span>Tienda</span>';
document.body.appendChild(teleportButton);

teleportButton.addEventListener('click', e => {
  e.stopPropagation();
  teleportButton.blur();
  tryTeleportToShop();
});

export function resetTeleport() {
  cooldown = 0;
}

export function tryTeleportToShop(): boolean {
  if (!state.playing || state.dead || state.menu || state.photo || player.dancing) return false;
  const dist = Math.hypot(player.pos.x - SHOP_EXTERIOR.x, player.pos.z - SHOP_EXTERIOR.z);
  if (!state.indoors && dist < 7) {
    showMsg('Ya estás frente a la tienda de Masa', 1.4);
    return false;
  }
  if (cooldown > 0) {
    sfx.warn();
    showMsg(`Teletransporte recargando · ${Math.ceil(cooldown)} s`, 1.4);
    return false;
  }

  // Departure talisman burst
  const from = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
  impactRing(player.pos, 0x87efbd, 3.2);
  burst(from, 0x87efbd, 36, 5.5, 0.14);

  // Move player cleanly to the outside of Masa's shop
  player.attackT = -1;
  player.dashT = 0;
  player.snareT = 0;
  player.jumpY = 0;
  player.vy = 0;
  player.airDashUsed = false;
  player.invuln = Math.max(player.invuln, 1.0);

  const y = surfaceY(SHOP_EXTERIOR.x, SHOP_EXTERIOR.z);
  player.pos.set(SHOP_EXTERIOR.x, y, SHOP_EXTERIOR.z);
  player.face = Math.PI;
  state.yaw = 0;
  state.indoors = false;
  sam.root.position.copy(player.pos);
  sam.root.rotation.y = player.face;
  snapCamera();

  // Arrival burst
  const to = new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z);
  impactRing(player.pos, 0xffd27a, 4.2);
  burst(to, 0xffd27a, 48, 6.5, 0.14);
  burst(to, 0x87efbd, 30, 5, 0.12);
  skyFlash(0.2);
  sfx.dash();
  sfx.chime(true);

  cooldown = TELEPORT_CD;
  showMsg('✦ TELETRANSPORTE ✦\nA las afueras de la tienda de Masa', 2.0);
  return true;
}

let lastLabel = '';
export function updateTeleport(dt: number) {
  if (cooldown > 0 && !state.menu && state.playing && !state.dead) {
    cooldown = Math.max(0, cooldown - dt);
  }
  const hidden = !state.playing || state.dead || state.photo;
  if (teleportButton.hidden !== hidden) teleportButton.hidden = hidden;
  const onCd = cooldown > 0;
  teleportButton.classList.toggle('cd', onCd);
  const label = onCd ? `${Math.ceil(cooldown)} s` : 'Tienda';
  if (label !== lastLabel) {
    lastLabel = label;
    const span = teleportButton.querySelector('span');
    if (span) span.textContent = label;
  }
}
