// Escudo de Sutras, the sōhei's guard: six lines of scripture circle you for a while. Each one takes a
// blow meant for you (damage.ts asks absorbHit first) and bursts against the oni around you.
import * as THREE from 'three';
import { scene } from './renderer';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { burst } from './fx';
import { flare } from './flare';
import { CLS, tagMat } from './materials';
import { sfx } from './sfx';
import { specialDamage } from './special-damage';
import { dmgMult } from './upgrades';
import { TECHNIQUES } from './techniques';
import { player, state } from './state';
import { makeTalismanTex, softGlowTex } from './vfx-art';

const COUNT = 6, DURATION = 12, RADIUS = 1.25, BURST_R = 4;
const GLYPHS = ['般', '若', '心', '経', '南', '無'];

const ring = new THREE.Group();
ring.visible = false;
scene.add(ring);
const color = new THREE.Color(TECHNIQUES.sutras.color);
const slips = GLYPHS.map(ch => {
  // an ornate glowing ofuda talisman with crisp calligraphy, border frame, seal stamp & soft golden aura
  const g = new THREE.Group();
  const fx = (o: THREE.MeshBasicMaterialParameters) => tagMat(new THREE.MeshBasicMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false, ...o }), CLS.fx);
  const tex = makeTalismanTex(ch);
  const aura = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 1.18), fx({ map: softGlowTex, color: 0xffc860, opacity: 0.42 }));
  const core = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.72), fx({ map: tex, color: color.clone().multiplyScalar(1.35) }));
  aura.position.z = -0.01;
  g.add(aura, core);
  ring.add(g);
  return g;
});

let left = 0, timeLeft = 0;
export const sutrasActive = () => left > 0 && timeLeft > 0;

export function startSutras() {
  left = COUNT; timeLeft = DURATION;
  slips.forEach(s => { s.visible = true; s.scale.setScalar(0.01); });
  ring.visible = true;
  burst(player.pos.clone().setY(player.pos.y + 1), TECHNIQUES.sutras.color, 50, 4, 0.15);
  flare(player.pos.clone().setY(player.pos.y + 1), TECHNIQUES.sutras.color, { size: 1.1, life: 0.6 });
  sfx.chime(false);
}

/** a blow is coming: a sutra takes it instead and bursts against the oni nearby */
export function absorbHit() {
  if (!sutrasActive()) return false;
  left--;
  const slip = slips.find(s => s.visible);
  if (slip) {
    slip.visible = false;
    const at = slip.getWorldPosition(new THREE.Vector3());
    flare(at, TECHNIQUES.sutras.color, { size: 0.9, life: 0.45 });
    burst(at, 0xfff0b8, 30, 5, 0.13);
  }
  for (const en of enemies) {
    if (en.hp <= 0) continue;
    const dx = en.g.position.x - player.pos.x, dz = en.g.position.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > BURST_R + 0.45 * en.scale) continue;
    specialDamage(en, 2.5 * dmgMult()); en.flash = 1; provoke(en);
    if (en.state !== 'return') staggerEnemy(en, en.big ? 0.4 : 0.9);
    en.knock.set(dx, 0, dz).normalize().multiplyScalar(en.big ? 3 : 9);
  }
  player.invuln = Math.max(player.invuln, 0.45);
  state.shake = Math.max(state.shake, 0.25);
  sfx.coin(true);
  if (!left) end();
  return true;
}
function end() {
  left = 0; timeLeft = 0; ring.visible = false;
}

export function updateSutras(dt: number) {
  if (!ring.visible) return;
  timeLeft -= dt;
  if (timeLeft <= 0 || state.dead) { burst(player.pos.clone().setY(player.pos.y + 1), 0xfff0b8, 20, 3, 0.1); end(); return; }
  const t = state.time, fade = Math.min(1, timeLeft / 1.2);
  ring.position.copy(player.pos);
  slips.forEach((s, i) => {
    const a = t * 1.7 + (i / COUNT) * Math.PI * 2;
    s.position.set(Math.sin(a) * RADIUS, 1.05 + Math.sin(t * 2.2 + i * 1.3) * 0.22, Math.cos(a) * RADIUS);
    s.rotation.y = a;                                    // the scripture faces outwards
    const grow = Math.min(1, s.scale.x + dt * 4);
    s.scale.setScalar(grow * (0.92 + 0.08 * Math.sin(t * 9 + i)) * (0.4 + 0.6 * fade));
  });
}

export function clearSutras() { end(); }
