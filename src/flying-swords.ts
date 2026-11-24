// Espadas Voladoras (飛劍), the xiákè's technique: six swords of jade light rise from his back in a fan, turn
// towards the nearest oni (up to six, 15 m) and fly to them one after another, homing on them as they move.
// Each one wounds (special-damage.ts caps it), dazes and throws its oni back. With nobody near they fly out
// ahead in a fan and fade.
import * as THREE from 'three';
import { scene } from './renderer';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { burst } from './fx';
import { flare } from './flare';
import { CLS, tagMat } from './materials';
import { panOf, sfx } from './sfx';
import { specialDamage } from './special-damage';
import { TECHNIQUES } from './techniques';
import { dmgMult } from './upgrades';
import { player, state } from './state';
import type { Enemy } from './types';

const COUNT = 6, RANGE = 15, SPEED = 30, RISE = 0.28, STAGGER = 0.9, DAMAGE = 5.5;
const color = new THREE.Color(TECHNIQUES.feijian.color);

// one sword: a white-jade blade, a guard and a soft green halo (built once, cloned per cast)
const proto = new THREE.Group();
{
  const glow = (c: THREE.ColorRepresentation, o: number) => tagMat(new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.012, 0.72), glow(0xeafff4, 1));
  blade.position.z = 0.26;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.024, 0.12, 4), glow(0xeafff4, 1));
  tip.rotation.x = Math.PI / 2; tip.position.z = 0.68;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.02, 0.03), glow(color.clone().multiplyScalar(1.3), 1));
  guard.position.z = -0.11;
  const hilt = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.03, 0.2), glow(color, 0.9));
  hilt.position.z = -0.22;
  const halo = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 1.1), glow(color, 0.28));
  halo.position.z = 0.2;
  proto.add(blade, tip, guard, hilt, halo);
}

interface Sword { g: THREE.Group; target?: Enemy; dir: THREE.Vector3; t: number; wait: number; life: number }
const swords: Sword[] = [];
const tmp = new THREE.Vector3(), aim = new THREE.Vector3(), look = new THREE.Vector3();

export function startFlyingSwords() {
  const targets = enemies
    .filter(e => e.hp > 0 && e.state !== 'return')
    .map(e => ({ e, d: Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z) }))
    .filter(t => t.d < RANGE).sort((a, b) => a.d - b.d).slice(0, COUNT);
  const face = player.face;
  for (let i = 0; i < COUNT; i++) {
    // a fan behind the shoulders, points up
    const k = i / (COUNT - 1) - 0.5, a = face + Math.PI + k * 2.2;
    const g = proto.clone();
    g.position.set(player.pos.x + Math.sin(a) * 0.7, player.pos.y + 1.6 + (1 - Math.abs(k) * 2) * 0.35, player.pos.z + Math.cos(a) * 0.7);
    g.lookAt(g.position.x, g.position.y + 5, g.position.z);
    g.scale.setScalar(0.01);
    scene.add(g);
    const target = targets.length ? targets[i % targets.length].e : undefined;
    const dir = new THREE.Vector3(Math.sin(face + k * 1.2), 0.05, Math.cos(face + k * 1.2));
    swords.push({ g, target, dir, t: 0, wait: RISE + i * 0.07, life: 1.6 });
  }
  burst(player.pos.clone().setY(player.pos.y + 1.7), TECHNIQUES.feijian.color, 50, 4, 0.15);
  flare(player.pos.clone().setY(player.pos.y + 2.3), TECHNIQUES.feijian.color, { size: 1.15, life: 0.55 });
  sfx.swing({ power: 1.5, pan: 0 });
}

function strike(s: Sword, e: Enemy) {
  const p = e.g.position;
  specialDamage(e, DAMAGE * dmgMult()); e.flash = 1; provoke(e);
  if (e.state !== 'return') staggerEnemy(e, e.big ? STAGGER * 0.4 : STAGGER);
  e.knock.copy(s.dir).setY(0).normalize().multiplyScalar(e.big ? 3 : 9);
  const at = new THREE.Vector3(p.x, p.y + 1.15 * e.scale, p.z);
  burst(at, TECHNIQUES.feijian.color, 26, 5, 0.14);
  flare(at, TECHNIQUES.feijian.color, { size: 0.75, life: 0.4 });
  sfx.hit({ heavy: false, pan: panOf(p.x, p.z), count: 1 });
  state.shake = Math.max(state.shake, 0.18);
}

export function updateFlyingSwords(dt: number) {
  for (let i = swords.length - 1; i >= 0; i--) {
    const s = swords[i];
    s.t += dt;
    if (s.t < s.wait) {
      // rising into the fan, then turning towards its oni
      s.g.scale.setScalar(Math.min(1, s.t / 0.15));
      s.g.position.y += dt * 0.6;
      if (s.target && enemies.includes(s.target)) {
        aim.copy(s.target.g.position).setY(s.target.g.position.y + 1.1 * s.target.scale);
        look.set(0, 5, 0).lerp(aim.sub(s.g.position), Math.min(1, s.t / s.wait));
        s.g.lookAt(tmp.copy(s.g.position).add(look));
      }
      continue;
    }
    // flying: homing on the oni (or straight on when it has none, or it is gone)
    if (s.target && enemies.includes(s.target) && s.target.hp > 0) {
      aim.copy(s.target.g.position).setY(s.target.g.position.y + 1.1 * s.target.scale);
      s.dir.subVectors(aim, s.g.position);
      const d = s.dir.length();
      s.dir.normalize();
      if (d < SPEED * dt + 0.4) { strike(s, s.target); remove(i); continue; }
    } else s.target = undefined;
    s.g.position.addScaledVector(s.dir, SPEED * dt);
    s.g.lookAt(tmp.copy(s.g.position).add(s.dir));
    if (Math.random() < 0.5) burst(s.g.position.clone(), TECHNIQUES.feijian.color, 2, 0.6, 0.08);
    s.life -= dt;
    if (s.life <= 0) remove(i);
  }
}

function remove(i: number) {
  const s = swords[i];
  scene.remove(s.g);
  swords.splice(i, 1);
}

export function clearFlyingSwords() {
  for (let i = swords.length - 1; i >= 0; i--) remove(i);
}
