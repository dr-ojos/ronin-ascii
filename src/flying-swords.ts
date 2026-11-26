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
import { makeFresnelShellMat, makeVolumetricBeamMat } from './vfx-art';

const COUNT = 6, RANGE = 15, SPEED = 30, RISE = 0.28, STAGGER = 0.9, DAMAGE = 5.5;
const color = new THREE.Color(TECHNIQUES.feijian.color);

// one sculpted spirit sword: faceted diamond-section jade blade, ornate crescent guard, pommel gem & volumetric aura
const proto = new THREE.Group();
{
  const glow = (c: THREE.ColorRepresentation, o: number) => tagMat(new THREE.MeshBasicMaterial({
    color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }), CLS.fx);
  const auraMat = makeFresnelShellMat(0xffffff, color, 0.52, 2.0);
  const trailMat = makeVolumetricBeamMat(0xffffff, color, 0.55);

  // Tapered diamond-section jian blade
  const blade = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.036, 0.82, 4), glow(0xf2fff8, 1));
  blade.rotation.x = Math.PI / 2;
  blade.scale.set(1.35, 1, 0.35);
  blade.position.z = 0.3;

  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.18, 4), glow(0xffffff, 1));
  tip.rotation.x = Math.PI / 2;
  tip.scale.set(1.15, 1, 0.45);
  tip.position.z = 0.78;

  // Ornate swept guard + hilt + pommel crystal
  const guard = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.014, 6, 16, Math.PI), glow(color.clone().multiplyScalar(1.35), 1));
  guard.rotation.x = Math.PI / 2;
  guard.position.z = -0.09;
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.016, 0.22, 6), glow(color, 0.95));
  hilt.rotation.x = Math.PI / 2;
  hilt.position.z = -0.22;
  const pommel = new THREE.Mesh(new THREE.OctahedronGeometry(0.032, 0), glow(0xffffff, 1));
  pommel.position.z = -0.35;

  // Soft volumetric Fresnel aura sleeve + trailing energy wake
  const aura = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.95, 5, 10), auraMat);
  aura.rotation.x = Math.PI / 2;
  aura.scale.set(1.2, 1, 0.65);
  aura.position.z = 0.26;
  const wake = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.01, 1.35, 8, 1, true), trailMat);
  wake.rotation.x = Math.PI / 2;
  wake.position.z = -0.82;

  proto.add(blade, tip, guard, hilt, pommel, aura, wake);
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
