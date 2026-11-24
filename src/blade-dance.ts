// Danza de los Mil Tajos, the technique every ronin starts with: a string of flashes from oni to
// oni, cutting straight through each one (and anyone standing in the way), then a last ring of
// light on everyone cut as the blade goes back into its sheath: the three weakest fall, the rest are left
// badly hurt for the katana to finish.
import * as THREE from 'three';
import { sam } from './avatar';
import { enemies, KINDS } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { burst, dashGhost, dashRing } from './fx';
import { sparkBurst } from './katana-fx';
import { collide } from './physics';
import { panOf, sfx } from './sfx';
import { player, state } from './state';
import { surfaceY } from './structures';
import { TECHNIQUES } from './techniques';
import type { Enemy } from './types';
import { dmgMult } from './upgrades';
import { specialDamage } from './special-damage';
import { weapon } from './weapons';

const RANGE = 13;          // metres: who the dance can reach
const MAX_TARGETS = 6;
const STEP = 0.13;         // seconds per flash
const CUT = 1.5;           // damage of one cut (× upgrades × weapon)
const CLEAVE = 1.9;        // anyone this close to the path of a flash is cut too
const FINISH = 2;          // the sheathing blow on a boss or guardian that was cut
const KILLS = 3;           // the sheathing blow kills this many common foes (the weakest)...
const LEFT = 0.15;         // ...and leaves the other common ones with this much life
const LEFT_BIG = 0.3;      // ...or this much, the heavy ones
const FINISH_DELAY = 0.22;
const SPIN_R = 2.6;        // with nobody around, the flashes trace a star this wide
const COLOR = TECHNIQUES.tajos.color;

interface Dance {
  targets: Enemy[];
  cuts: number;            // how many flashes this dance has
  cut: number;             // the current one
  t: number;               // time inside the current flash
  from: THREE.Vector3;
  to: THREE.Vector3;
  centre: THREE.Vector3;
  struck: boolean;         // the current flash already cut
  ghost: number;           // metres until the next after-image
  hits: Set<Enemy>;        // everyone cut at least once (for the finishing blow)
  finish: number;          // countdown to the finishing blow once the flashes are over
}
let dance: Dance | null = null;

const alive = (e: Enemy) => e.hp > 0 && enemies.includes(e);
const reachOf = (e: Enemy) => 0.9 * e.scale + 1.1;

/** P with the dance equipped */
export function startBladeDance() {
  const targets = enemies.flatMap(e => {
    const d = Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z);
    return d < RANGE && e.hp > 0 ? [{ e, d }] : [];
  }).sort((a, b) => a.d - b.d).slice(0, MAX_TARGETS).map(t => t.e);
  // one flash for each oni, then the ones left standing get a second visit (5 to 9 flashes)
  const cuts = targets.length ? Math.min(9, Math.max(5, targets.length + 3)) : 6;
  dance = { targets, cuts, cut: -1, t: 0, from: new THREE.Vector3(), to: new THREE.Vector3(), centre: player.pos.clone(),
    struck: true, ghost: 0, hits: new Set(), finish: -1 };
  player.dancing = true;
  player.invuln = Math.max(player.invuln, cuts * STEP + 0.5);
  state.hitStop = 0.06;
  dashRing(player.pos);
  sfx.dash();
  nextFlash(dance);
}

function nextFlash(d: Dance) {
  d.cut++; d.t = 0; d.struck = false;
  d.from.copy(player.pos);
  const left = d.targets.filter(alive);
  if (left.length) {
    // through the oni and out the other side
    const target = left[d.cut % left.length], p = target.g.position;
    const dir = new THREE.Vector3(p.x - player.pos.x, 0, p.z - player.pos.z);
    if (dir.lengthSq() < 0.04) dir.set(Math.sin(player.face), 0, Math.cos(player.face));
    dir.normalize();
    d.to.set(p.x, 0, p.z).addScaledVector(dir, reachOf(target));
  } else {
    // nobody (left) to cut: the flashes draw a star around where the dance began
    const a = player.face + Math.PI + (d.cut % 2 ? 0.6 : -0.6);
    d.to.set(d.centre.x + Math.sin(a) * SPIN_R, 0, d.centre.z + Math.cos(a) * SPIN_R);
  }
  player.face = Math.atan2(d.to.x - d.from.x, d.to.z - d.from.z);
  // the katana alternates cuts, and the last one is the wide finisher
  Object.assign(player, { combo: d.cut === d.cuts - 1 ? 2 : d.cut % 2, attackT: 0, attackDur: STEP * 1.7, hitDone: true });
  sfx.swing({ power: d.cut === d.cuts - 1 ? 1.35 : 0.95, pan: d.cut % 2 ? 0.35 : -0.35 });
}

/** cut every oni close to the segment the ronin just crossed */
function cutAlong(d: Dance) {
  const ax = d.from.x, az = d.from.z, bx = player.pos.x, bz = player.pos.z;
  const dx = bx - ax, dz = bz - az, len2 = dx * dx + dz * dz;
  const force = dmgMult() * weapon().dmg;
  let hits = 0, pan = 0;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const p = e.g.position;
    const k = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.z - az) * dz) / len2)) : 0;
    if (Math.hypot(p.x - ax - dx * k, p.z - az - dz * k) > CLEAVE + 0.4 * e.scale) continue;
    specialDamage(e, CUT * force); e.flash = 1;
    provoke(e);
    if (e.state !== 'return') staggerEnemy(e, 0.6);
    e.knock.set(dz, 0, -dx).normalize().multiplyScalar((d.cut % 2 ? 1 : -1) * (e.big ? 1.5 : 4));
    const at = new THREE.Vector3(p.x, p.y + 1.2 * e.scale, p.z);
    burst(at, COLOR, 16, 5, 0.12);
    burst(at, 0xff3a2a, 8, 3.5, 0.1);
    sparkBurst(at, 10, 5);
    d.hits.add(e);
    hits++; pan += panOf(p.x, p.z);
  }
  if (hits) {
    sfx.hit({ heavy: d.cut === d.cuts - 1, pan: pan / hits, count: hits });
    state.hitStop = Math.max(state.hitStop, 0.03);
    state.shake = Math.max(state.shake, 0.18);
  }
}

/** the blade goes back into its sheath: everyone it cut takes one last blow at once. The weakest
 *  KILLS common foes fall; the rest are left badly hurt (bosses and guardians only lose their share). */
function finishingBlow(d: Dance) {
  const force = dmgMult() * weapon().dmg;
  const cut = [...d.hits].filter(alive);
  const strong = (e: Enemy) => !!(KINDS[e.kind].boss || KINDS[e.kind].elite);
  const doomed = new Set(cut.filter(e => !strong(e)).sort((a, b) => a.hp / a.maxHp - b.hp / b.maxHp || a.hp - b.hp).slice(0, KILLS));
  let hits = 0;
  for (const e of cut) {
    const p = e.g.position, at = new THREE.Vector3(p.x, p.y + 1.15 * e.scale, p.z);
    if (doomed.has(e)) e.hp = 0;
    else if (!strong(e)) e.hp = Math.min(e.hp, Math.max(1, e.maxHp * (e.big ? LEFT_BIG : LEFT)));
    else specialDamage(e, FINISH * force);
    e.flash = 1;
    burst(at, 0xffffff, doomed.has(e) ? 40 : 26, 6, 0.14);
    burst(at, COLOR, 22, 4, 0.18);
    hits++;
  }
  if (hits) {
    sfx.hit({ heavy: true, pan: 0, count: hits });
    state.hitStop = doomed.size ? 0.22 : 0.1; state.shake = Math.max(state.shake, 0.5);
  }
}

export function updateBladeDance(dt: number) {
  const d = dance;
  if (!d) return;
  if (d.finish >= 0) {
    if ((d.finish -= dt) < 0) { finishingBlow(d); dance = null; }
    return;
  }
  d.t += dt;
  const k = Math.min(1, d.t / STEP), ease = 1 - (1 - k) ** 3;
  const before = player.pos.clone();
  player.pos.lerpVectors(d.from, d.to, ease);
  collide(player.pos, 0.45);
  player.pos.y = surfaceY(player.pos.x, player.pos.z);
  // after-images every half metre of the flash
  d.ghost -= Math.hypot(player.pos.x - before.x, player.pos.z - before.z);
  while (d.ghost <= 0) { d.ghost += 0.55; dashGhost(player.pos, player.face, 0.75); }
  sam.root.position.copy(player.pos);
  sam.root.rotation.y = player.face;
  if (!d.struck && k >= 0.55) { d.struck = true; cutAlong(d); }
  if (k < 1) return;
  if (d.cut + 1 < d.cuts) { nextFlash(d); return; }
  // the flashes are over: a breath, then the sheathing blow
  player.dancing = false;
  player.invuln = Math.max(player.invuln, 0.35);
  d.finish = FINISH_DELAY;
  if (!d.hits.size) { finishingBlow(d); dance = null; }
}

export function clearBladeDance() {
  dance = null;
  player.dancing = false;
}
