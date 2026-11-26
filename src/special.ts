// Two technique slots, each with its own charge: P spends the first, J the second. Raijin's bolts also serve
// the thunder oni. Every class starts with two techniques of its own (classes.ts); the lightning is won at the
// Templo del Rayo, the rest are taught at the temples for jade seals. The newer ones live in arts.ts.
import * as THREE from 'three';
import { scene } from './renderer';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { burst } from './fx';
import { sfx, panOf } from './sfx';
import { showMsg } from './hud';
import { CLS, tagMat } from './materials';
import { dmgMult } from './upgrades';
import { specialDamage } from './special-damage';
import { player, state } from './state';
import { clearBladeDance, startBladeDance, updateBladeDance } from './blade-dance';
import { clearFourFlames, startFourFlames, updateFourFlames } from './four-flames';
import { clearTechniqueWaves, startTechniqueWave, updateTechniqueWaves } from './technique-waves';
import { SLOT_KEY, slotTechnique, TECHNIQUES, type Slot, type TechniqueId } from './techniques';
import { chargeAura, clearArts, isArt, startArt, updateArts } from './arts';
import { beginCast, clearCinematic, release } from './cinematic';
import { rnd } from './utils';
import { clearFlares, flare, updateFlares } from './flare';
import { clearSutras, startSutras, updateSutras } from './sutra-shield';
import { clearFlyingSwords, startFlyingSwords, updateFlyingSwords } from './flying-swords';
import { chargeRanged, clearElementalOrbs, MAX_RANGED_CHARGES, updateElementalOrbs } from './elemental-orb';
import { cls } from './classes';
import { chargeMult } from './progression';
import { readVault } from './vault';

const CHARGE_TIME = 45;     // seconds to fill the charge from empty
const KILL_BONUS = 0.04;    // each kill fills this much more
const RANGE = 15;           // metres around you the lightning reaches
const MAX_BOLTS = 8;
const GATHER = 0.24;        // game seconds the power gathers (slowed down: most of a real second)

/** fill both charges (time passing, or a kill); each fills at the pace of its own technique's rank */
export function charge(amount: number) {
  for (const slot of [1, 2] as const) {
    const key = slot === 1 ? 'special' : 'special2';
    if (state[key] >= 1) continue;
    state[key] = Math.min(1, state[key] + amount * chargeMult(slotTechnique(slot)));
    if (state[key] >= 1) { sfx.chime(false); showMsg(`— ${TECHNIQUES[slotTechnique(slot)].name.toUpperCase()} —\nCarga lista · pulsa ${SLOT_KEY[slot]}`, 1.6); }
  }
}
export const chargeKill = () => { charge(KILL_BONUS); chargeRanged(0.3); };

// ------------------------------------------------------------ bolts
const SEG = new THREE.CylinderGeometry(1, 1, 1, 5);
const coreMat = tagMat(new THREE.MeshBasicMaterial({ color: 0xf4f8ff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx);
const glowMat = tagMat(new THREE.MeshBasicMaterial({ color: 0x7fa8ff, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.fx);
const UP = new THREE.Vector3(0, 1, 0);
interface Bolt { g: THREE.Group; life: number; max: number; core: THREE.MeshBasicMaterial; glow: THREE.MeshBasicMaterial }
const bolts: Bolt[] = [];
const pending: { t: number; fn: () => void }[] = [];

function segment(g: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, r: number, core: THREE.Material, glow: THREE.Material) {
  const d = new THREE.Vector3().subVectors(b, a), len = d.length(), mid = a.clone().addScaledVector(d, 0.5);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, d.normalize());
  for (const [m, k] of [[core, r], [glow, r * 3.2]] as const) {
    const s = new THREE.Mesh(SEG, m); s.position.copy(mid); s.quaternion.copy(q); s.scale.set(k, len, k); g.add(s);
  }
}
/** a jagged bolt from the sky to `to`, with a couple of forks (also the thunder oni's, enemy-ai.ts).
 *  `star`: Raijin's own bolts open a character flare where they land. */
export function bolt(to: THREE.Vector3, star = 0) {
  const g = new THREE.Group(), core = coreMat.clone(), glow = glowMat.clone();
  const top = new THREE.Vector3(to.x + rnd(-4, 4), to.y + 30, to.z + rnd(-4, 4));
  const n = 12, pts: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const k = i / n, p = top.clone().lerp(to, k), j = Math.sin(k * Math.PI) * 2.2;
    if (i > 0 && i < n) p.add(new THREE.Vector3(rnd(-j, j), rnd(-0.5, 0.5), rnd(-j, j)));
    pts.push(p);
  }
  for (let i = 0; i < n; i++) segment(g, pts[i], pts[i + 1], 0.09, core, glow);
  for (let f = 0; f < 2; f++) {   // forks off the upper half
    let a = pts[2 + Math.floor(Math.random() * 5)];
    for (let i = 0; i < 3; i++) { const b = a.clone().add(new THREE.Vector3(rnd(-2.5, 2.5), -rnd(1.5, 3), rnd(-2.5, 2.5))); segment(g, a, b, 0.05, core, glow); a = b; }
  }
  scene.add(g);
  bolts.push({ g, life: 0.45, max: 0.45, core, glow });
  burst(to.clone(), 0xcfe0ff, 50, 8, 0.14);
  burst(to.clone(), 0xffffff, 20, 4, 0.2);
  if (star) flare(to, TECHNIQUES.rayo.color, { size: star, life: 0.5 });
}

// a light that lights up the whole scene for an instant (always in the scene: no shader recompiles)
const flash = new THREE.PointLight(0xcfe0ff, 0, 60, 1);
scene.add(flash);
let flashT = 0;
/** light the sky for an instant */
export const skyFlash = (k = 0.25) => { flashT = Math.max(flashT, k); };

/** P (slot 1) or J (slot 2) pressed */
export function trySpecial(slot: Slot = 1) {
  if (!state.playing || state.dead || state.photo || state.menu) return;
  const key = slot === 1 ? 'special' : 'special2', id = slotTechnique(slot);
  if (state[key] < 1) { showMsg(`Cargando ${TECHNIQUES[id].name} · ${Math.floor(state[key] * 100)} %`, 1.2); return; }
  if (player.dancing) return;
  state[key] = 0;
  // the cinematic (cinematic.ts): a breath of slow motion while the power gathers round you, then the technique
  const t = TECHNIQUES[id];
  beginCast(t.name, t.kanji, t.color);
  showMsg('', 0.01);
  player.dancing = true;
  player.invuln = Math.max(player.invuln, GATHER + 0.7);
  Object.assign(player, { combo: 3, attackT: 0, attackDur: 1.2, hitDone: true });
  chargeAura(id, GATHER);
  sfx.taiko(0.7);
  pending.push({ t: GATHER, fn: () => {
    player.dancing = false;
    release(t.color);
    state.casting = id;   // its rank sets the damage (progression.ts)
    cast(id);
  } });
}

function cast(id: TechniqueId) {
  if (id === 'tajos') { startBladeDance(); return; }
  if (isArt(id)) { startArt(id); return; }
  Object.assign(player, { combo: id === 'viento' || id === 'sutras' ? 0 : id === 'agua' ? 1 : 2, attackT: 0, attackDur: id === 'campana' ? 0.62 : 0.55,
    hitDone: true, invuln: Math.max(player.invuln, id === 'rayo' ? 0.8 : 0.48) });
  if (id === 'sutras') { startSutras(); return; }
  if (id === 'feijian') { state.hitStop = 0.06; startFlyingSwords(); return; }
  if (id !== 'rayo') {
    state.hitStop = 0.07;
    if (id === 'cuatroLlamas') startFourFlames();
    else startTechniqueWave(id);
    return;
  }
  castLightning();
}

function castLightning() {
  state.hitStop = 0.12; state.shake = 0.9; flashT = 0.5;
  const targets = enemies
    .map(e => ({ e, d: Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z) }))
    .filter(t => t.d < RANGE).sort((a, b) => a.d - b.d).slice(0, MAX_BOLTS);
  targets.forEach(({ e }, i) => {
    // aviso: a thin beam drops onto each oni about to be struck (long enough to be seen), then the bolt
    const t = 0.2 + i * 0.07;
    flare(e.g.position, TECHNIQUES.rayo.color, { pre: t, life: 0, lift: 1.1 * e.scale, follow: true });
    pending.push({ t, fn: () => {
      if (!enemies.includes(e)) return;
      const p = e.g.position;
      bolt(new THREE.Vector3(p.x, p.y + 1.1 * e.scale, p.z), 1.1);
      specialDamage(e, 6 * dmgMult()); e.flash = 1; provoke(e);
      e.knock.set(p.x - player.pos.x, 0, p.z - player.pos.z).normalize().multiplyScalar(e.big ? 5 : 12);
      if (e.state !== 'return') staggerEnemy(e, 1.4);
      sfx.thunder(panOf(p.x, p.z), i === 0);
      flashT = Math.max(flashT, 0.25);
    } });
  });
  // a few more bolts crash around you for show (all of them if nobody is near)
  for (let i = 0; i < Math.max(3, 6 - targets.length); i++) pending.push({ t: rnd(0, 0.5), fn: () => {
    const a = rnd(0, Math.PI * 2), r = rnd(3, 10), x = player.pos.x + Math.cos(a) * r, z = player.pos.z + Math.sin(a) * r;
    bolt(new THREE.Vector3(x, player.pos.y, z), i === 0 && !targets.length ? 0.9 : 0);
    if (!targets.length && i === 0) sfx.thunder(0, true);
  } });
  if (!targets.length) showMsg('el rayo cae sobre la tierra vacía', 1.2);
}

export function updateSpecial(dt: number) {
  if (state.playing && !state.dead) charge(dt / CHARGE_TIME);
  updateBladeDance(dt);
  updateTechniqueWaves(dt);
  updateFourFlames(dt);
  updateFlares(dt);
  updateSutras(dt);
  updateFlyingSwords(dt);
  updateElementalOrbs(dt);
  updateArts(dt);
  for (let i = pending.length - 1; i >= 0; i--) { const p = pending[i]; if ((p.t -= dt) <= 0) { pending.splice(i, 1); p.fn(); } }
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i]; b.life -= dt;
    const k = Math.max(0, b.life / b.max), on = Math.random() < 0.8 ? 1 : 0.25;   // crackle
    b.core.opacity = k * on; b.glow.opacity = 0.35 * k * on;
    if (b.life <= 0) { removeBolt(b); bolts.splice(i, 1); }
  }
  flashT = Math.max(0, flashT - dt);
  flash.position.set(player.pos.x, player.pos.y + 14, player.pos.z);
  flash.intensity = flashT > 0 ? 120 * flashT * (Math.random() < 0.7 ? 1 : 0.4) : 0;
}

function removeBolt(b: Bolt) { scene.remove(b.g); b.core.dispose(); b.glow.dispose(); }

export function resetSpecial() {
  // the class's own two techniques and every one already learnt (vault.ts); the jade seals belong to the run
  const start = cls().technique, start2 = cls().technique2, v = readVault();
  const learned = [start, start2, ...v.techniques.filter(t => t !== start && t !== start2 && t in TECHNIQUES)];
  const technique = v.technique && learned.includes(v.technique) ? v.technique : start;
  let technique2 = v.technique2 && learned.includes(v.technique2) ? v.technique2 : start2;
  if (technique2 === technique) technique2 = technique === start2 ? start : start2;
  Object.assign(state, { special: 0, special2: 0, rangedCharges: MAX_RANGED_CHARGES, rangedCharge: 0, jade: 0, technique, technique2, casting: technique, learnedTechniques: learned });
  clearArts();
  clearElementalOrbs();
  clearCinematic();
  clearSutras();
  clearFlyingSwords();
  clearBladeDance();
  clearTechniqueWaves();
  clearFourFlames();
  clearFlares();
  for (const b of bolts) removeBolt(b);
  bolts.length = pending.length = 0;
  flashT = flash.intensity = 0;
}
