// Oni behaviour: chase, wind-up, strike, recover; knockback, crowding, hit flash and death.
import * as THREE from 'three';
import { scene } from './renderer.js';
import { enemies } from './enemies.js';
import { hurtPlayer } from './damage.js';
import { burst } from './fx.js';
import { sfx, panOf } from './sfx.js';
import { showMsg } from './hud.js';
import { collide } from './physics.js';
import { player, state } from './state.js';

const tmp = new THREE.Vector3();
export function updateEnemies(dt) {
  for (let i = enemies.length - 1; i >= 0; i--) {
    const en = enemies[i], g = en.g;
    tmp.subVectors(player.pos, g.position); tmp.y = 0;
    const d = tmp.length(), reach = 1.25 * en.scale + 0.3;
    en.t -= dt;
    if (en.state === 'chase') {
      if (d > reach) g.position.addScaledVector(tmp.clone().normalize(), en.speed * dt);
      else { en.state = 'windup'; en.t = en.big ? 0.75 : 0.55; sfx.warn(panOf(g.position.x, g.position.z)); }
    } else if (en.state === 'windup') {
      if (en.t <= 0) {
        if (d < reach * 1.35) hurtPlayer(en.dmg);
        en.knock.copy(tmp.normalize()).multiplyScalar(5);
        en.state = 'recover'; en.t = 0.7;
      }
    } else if (en.t <= 0) en.state = 'chase';
    g.position.addScaledVector(en.knock, dt);
    en.knock.multiplyScalar(Math.exp(-7 * dt));
    for (const o of enemies) {
      if (o === en) continue;
      const dx = g.position.x - o.g.position.x, dz = g.position.z - o.g.position.z, dd = Math.hypot(dx, dz), m = 0.6 * (en.scale + o.scale);
      if (dd < m && dd > 1e-4) { g.position.x += dx / dd * (m - dd) * 0.5; g.position.z += dz / dd * (m - dd) * 0.5; }
    }
    collide(g.position, 0.5 * en.scale);
    g.rotation.y = Math.atan2(player.pos.x - g.position.x, player.pos.z - g.position.z);
    const wind = en.state === 'windup';
    if (en.oni) {
      en.move += ((en.state === 'chase' && d > reach ? 1 : 0) - en.move) * Math.min(1, dt * 8);
      en.oni.update(dt, { moving: en.move, speed: en.speed, state: wind ? 'windup' : (en.state === 'recover' && en.t > 0.45 ? 'strike' : 'idle') });
    } else {
      g.position.y = 0.08 + Math.sin(state.time * 3 + en.seed) * 0.07;
      g.rotation.x = wind ? -0.25 : (en.state === 'recover' ? 0.15 : 0);
    }
    en.ring.material.opacity = wind ? 0.5 + 0.5 * Math.sin(state.time * 30) : 0;
    en.ring.scale.setScalar(wind ? 1 + (1 - Math.max(0, en.t) / 0.6) * 0.3 : 1);
    en.flash = Math.max(0, en.flash - dt * 6);
    if (en.oni) en.oni.setFlash(en.flash); else { en.robeMat.emissive.setScalar(en.flash); en.maskMat.emissive.setScalar(en.flash); }
    if (en.hp <= 0) {
      const c = new THREE.Vector3(g.position.x, 1.2 * en.scale, g.position.z);
      burst(c, 0xff3a2a, en.big ? 160 : 70, en.big ? 10 : 7);
      burst(c, 0xffe0c0, 30, 4, 0.1);
      scene.remove(g); enemies.splice(i, 1); state.kills++;
      sfx.death({ big: en.big, pan: panOf(g.position.x, g.position.z) });
      if (en.big) { state.shake = 0.6; showMsg('¡ JEFE ABATIDO !', 1.4); }
    }
  }
}
