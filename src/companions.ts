// Companion / Summon system (Compañeros) inspired by Minecraft Dungeons & Diablo 4:
//   - Press R to summon your equipped companion(s) (Lobo, Guerrero Esqueleto, Águila, León, Gólem).
//   - Press SHIFT+R to cycle between unlocked companions (or manage slots in Inventory / Masa's shop).
//   - At Level 50+, a 2nd companion slot unlocks so you can field 2 companions simultaneously!
//   - Companions autonomously follow you, seek enemies, attack (the Eagle flies & dive-bombs),
//     draw aggro (especially the Golem), take damage from enemies, and can die.
//   - Once a companion dies, its slot's summon charge resets to 0 and must recharge (over time + kills)
//     before it can be summoned again.
import * as THREE from 'three';
import { camera, scene } from './renderer';
import { createCompanionModel, type CompanionKind, type CompanionModel } from './companion-models';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { addStagger, damageTaken } from './boss-mechanics';
import { burst, dashRing, impactRing } from './fx';
import { flare } from './flare';
import { sparkBurst } from './katana-fx';
import { collide } from './physics';
import { panOf, sfx } from './sfx';
import { showMsg } from './hud';
import { player, state } from './state';
import { surfaceY, wadeDepth } from './structures';
import { WADE_SINK } from './water';
import { dmgMult } from './upgrades';
import { weapon } from './weapons';
import { weaponDmg } from './weapon-upgrades';
import { level } from './progression';
import { readVault, saveVault } from './vault';
import { angDiff } from './utils';
import type { Enemy } from './types';

export type CompanionId = CompanionKind;
export type CompanionSlot = 1 | 2;
export const COMPANION_IDS: readonly CompanionId[] = ['lobo', 'esqueleto', 'aguila', 'leon', 'golem'];
export const DUAL_COMPANION_LEVEL = 50;

export interface CompanionDef {
  id: CompanionId;
  name: string;
  short: string;
  kanji: string;
  role: string;
  desc: string;
  price: number;
  minLevel: number;
  color: number;
  maxHp: number;
  dmg: number;
  speed: number;
  reach: number;
  windup: number;
  attackCd: number;
  rechargeTime: number;
  scale: number;
  radius: number;
  flying?: boolean;
  flyHeight?: number;
  aoeRadius?: number;
  tauntRadius?: number;
  stagger?: number;
}

export const COMPANIONS: Record<CompanionId, CompanionDef> = {
  lobo: {
    id: 'lobo', name: 'Lobo Guardián', short: 'Lobo', kanji: '狼', role: 'Cazador ágil',
    desc: 'Rápido y feroz. Persigue y muerde a los enemigos con recarga corta.',
    price: 2500, minLevel: 3, color: 0x68d8ff,
    maxHp: 115, dmg: 1.35, speed: 9.8, reach: 2.1, windup: 0.22, attackCd: 0.95, rechargeTime: 20,
    scale: 1.0, radius: 0.55, stagger: 0.35,
  },
  esqueleto: {
    id: 'esqueleto', name: 'Guerrero Esqueleto', short: 'Esqueleto', kanji: '骸', role: 'Espadachín',
    desc: 'Guerrero de huesos con katana y escudo. Equilibrado en vida y tajos constantes.',
    price: 4800, minLevel: 8, color: 0x72f5c8,
    maxHp: 155, dmg: 1.65, speed: 7.5, reach: 2.45, windup: 0.28, attackCd: 1.0, rechargeTime: 24,
    scale: 1.0, radius: 0.55, stagger: 0.45,
  },
  aguila: {
    id: 'aguila', name: 'Águila Imperial', short: 'Águila', kanji: '鷲', role: 'Ataque aéreo',
    desc: 'Vuela sobre el campo de batalla y se lanza en picada para desgarrar enemigos.',
    price: 7500, minLevel: 14, color: 0xffd66b,
    maxHp: 95, dmg: 1.6, speed: 12.6, reach: 2.3, windup: 0.2, attackCd: 1.35, rechargeTime: 24,
    scale: 1.08, radius: 0.6, flying: true, flyHeight: 3.4, stagger: 0.4,
  },
  leon: {
    id: 'leon', name: 'León Dorado', short: 'León', kanji: '獅', role: 'Depredador',
    desc: 'Fuerte y valiente. Sus zarpazos y embestidas infligen gran daño en área y aturden.',
    price: 11000, minLevel: 22, color: 0xffa838,
    maxHp: 200, dmg: 2.2, speed: 8.8, reach: 2.55, windup: 0.30, attackCd: 1.15, rechargeTime: 28,
    scale: 1.08, radius: 0.68, aoeRadius: 2.35, stagger: 0.65,
  },
  golem: {
    id: 'golem', name: 'Gólem de Piedra', short: 'Gólem', kanji: '岩', role: 'Tanque colosal',
    desc: 'Resistencia enorme. Atrae la atención de los onis y golpea el suelo en área.',
    price: 15500, minLevel: 30, color: 0x8ef06e,
    maxHp: 350, dmg: 2.4, speed: 5.4, reach: 3.0, windup: 0.44, attackCd: 1.65, rechargeTime: 36,
    scale: 1.12, radius: 0.85, aoeRadius: 3.85, tauntRadius: 11.5, stagger: 0.95,
  },
};

const SEEK_RANGE = 22;
const FLY_SEEK_RANGE = 26;
const TELEPORT_DIST = 44;
const KILL_RECHARGE_BONUS = 0.07;

type CompState = 'follow' | 'chase' | 'windup' | 'strike' | 'dive' | 'climb';

interface ActiveCompanion {
  slot: 0 | 1;
  id: CompanionId;
  def: CompanionDef;
  model: CompanionModel;
  pos: THREE.Vector3;
  face: number;
  hp: number;
  maxHp: number;
  state: CompState;
  t: number;
  attackCd: number;
  invuln: number;
  flash: number;
  lastHurt: number;
  knock: THREE.Vector3;
  target: Enemy | null;
  orbitAngle: number;
  altitude: number;
  hitDone: boolean;
}

const actives: [ActiveCompanion | null, ActiveCompanion | null] = [null, null];
const tmp = new THREE.Vector3();

const getSlotId = (slot: 0 | 1) => (slot === 0 ? state.companion : state.companion2);
const setSlotId = (slot: 0 | 1, id: CompanionId | null) => {
  if (slot === 0) state.companion = id;
  else state.companion2 = id;
};
const getSlotCharge = (slot: 0 | 1) => (slot === 0 ? state.companionCharge : state.companionCharge2);
const setSlotCharge = (slot: 0 | 1, v: number) => {
  if (slot === 0) state.companionCharge = v;
  else state.companionCharge2 = v;
};

// ------------------------------------------------------------ Ownership & Shop/Inventory API
export const maxCompanionSlots = () => (level() >= DUAL_COMPANION_LEVEL ? 2 : 1);
export const companionDef = (id: CompanionId | null = state.companion) => (id ? COMPANIONS[id] : null);
export const ownsCompanion = (id: CompanionId) => state.ownedCompanions.includes(id);

export function companionSlotOf(id: CompanionId): CompanionSlot | 0 {
  if (state.companion === id) return 1;
  if (maxCompanionSlots() >= 2 && state.companion2 === id) return 2;
  return 0;
}

export function companionStats(d: CompanionDef): string {
  const hp = scaledMaxHp(d);
  const parts = [d.role, `${hp} vida`, `recarga ${d.rechargeTime}s`];
  if (d.flying) parts.push('vuela');
  if (d.tauntRadius) parts.push('atrae enemigos');
  else if (d.aoeRadius) parts.push('daño en área');
  return parts.join(' · ');
}

function scaledMaxHp(d: CompanionDef): number {
  return Math.round(d.maxHp * (1 + (level() - 1) * 0.035));
}

export function buyCompanion(d: CompanionDef): 'ok' | 'owned' | 'poor' | 'level' {
  if (ownsCompanion(d.id)) return 'owned';
  if (level() < d.minLevel) return 'level';
  if (state.mon < d.price) return 'poor';
  state.mon -= d.price;
  state.ownedCompanions.push(d.id);
  // Auto-equip into an empty slot if available (Slot 1 first, then Slot 2 at level 50+)
  if (!state.companion) equipCompanion(d.id, 1);
  else if (maxCompanionSlots() >= 2 && !state.companion2) equipCompanion(d.id, 2);
  else equipCompanion(d.id, 1);
  saveVault();
  return 'ok';
}

export function equipCompanion(id: CompanionId, targetSlot?: CompanionSlot) {
  if (!ownsCompanion(id)) return;
  const dual = maxCompanionSlots() >= 2;
  let slot: 0 | 1;
  if (targetSlot === 2 && dual) slot = 1;
  else if (targetSlot === 1) slot = 0;
  else if (dual) {
    if (!state.companion) slot = 0;
    else if (!state.companion2 && state.companion !== id) slot = 1;
    else if (state.companion === id) slot = 1;
    else slot = 0;
  } else {
    slot = 0;
  }

  const other: 0 | 1 = slot === 0 ? 1 : 0;
  const prev = getSlotId(slot);
  if (prev === id) return;

  // Never duplicate the same companion in both slots: swap cleanly
  if (dual && getSlotId(other) === id) {
    setSlotId(other, prev);
    if (actives[other] && actives[other]!.id !== prev) {
      dismissSlot(other, false);
      setSlotCharge(other, Math.min(getSlotCharge(other), 0.5));
    }
  }

  setSlotId(slot, id);
  if (actives[slot] && actives[slot]!.id !== id) {
    dismissSlot(slot, false);
    setSlotCharge(slot, Math.min(getSlotCharge(slot), 0.5));
  }
  saveVault();
}

export function cycleCompanion() {
  if (state.ownedCompanions.length === 0) {
    showMsg('Aún no tienes compañeros · Masa los recluta en su tienda (desde 2.500 mon)', 2.4);
    return;
  }
  const dual = maxCompanionSlots() >= 2;
  if (state.ownedCompanions.length === 1) {
    const only = COMPANIONS[state.ownedCompanions[0]];
    showMsg(`Solo tienes a ${only.name} · Masa recluta más compañeros en su tienda`, 2.2);
    return;
  }
  if (dual && state.ownedCompanions.length === 2) {
    // Ensure both are equipped in Slot 1 & Slot 2
    const [a, b] = state.ownedCompanions;
    if (!state.companion2) {
      equipCompanion(state.companion === a ? b : a, 2);
      showMsg(`R · 2 COMPAÑEROS LISTOS: ${COMPANIONS[state.companion!].short} y ${COMPANIONS[state.companion2!].short}`, 1.8);
    } else {
      showMsg(`Llevas a ${COMPANIONS[state.companion!].short} y ${COMPANIONS[state.companion2].short} · Recluta más en Masa para rotar`, 2.0);
    }
    return;
  }
  // Pick next owned companion not already in the other slot
  const idx = state.companion ? state.ownedCompanions.indexOf(state.companion) : -1;
  let next = state.ownedCompanions[(idx + 1) % state.ownedCompanions.length];
  if (dual && next === state.companion2) {
    next = state.ownedCompanions[(idx + 2) % state.ownedCompanions.length];
  }
  equipCompanion(next, 1);
  const d = COMPANIONS[next];
  sfx.chime(false);
  showMsg(`R · COMPAÑERO${dual ? ' 1' : ''}: ${d.kanji} ${d.name.toUpperCase()}\n${d.role}`, 1.6);
}

function clearSlot(slot: 0 | 1) {
  const c = actives[slot];
  if (!c) return;
  scene.remove(c.model.root);
  c.model.dispose();
  actives[slot] = null;
}

export function clearCompanion() {
  clearSlot(0);
  clearSlot(1);
}

export function resetCompanions() {
  clearCompanion();
  const v = readVault();
  const saved = (v.companions ?? []).filter((id): id is CompanionId => id in COMPANIONS);
  state.ownedCompanions = [...new Set<CompanionId>(saved)];
  state.companion = v.companion && state.ownedCompanions.includes(v.companion)
    ? v.companion
    : (state.ownedCompanions[0] ?? null);

  if (maxCompanionSlots() >= 2) {
    const saved2 = v.companion2 && state.ownedCompanions.includes(v.companion2) && v.companion2 !== state.companion
      ? v.companion2
      : (state.ownedCompanions.find(id => id !== state.companion) ?? null);
    state.companion2 = saved2;
  } else {
    state.companion2 = null;
  }
  state.companionCharge = 1;
  state.companionCharge2 = 1;
}

// ------------------------------------------------------------ Public status for HUD & Enemy AI
export interface CompanionStatus {
  slot: CompanionSlot;
  id: CompanionId;
  def: CompanionDef;
  alive: boolean;
  hp: number;
  maxHp: number;
  charge: number;
}

export function companionStatuses(): CompanionStatus[] {
  const out: CompanionStatus[] = [];
  const slots = maxCompanionSlots();
  for (let s = 0; s < slots; s++) {
    const slot = s as 0 | 1;
    const act = actives[slot];
    const def = companionDef(act ? act.id : getSlotId(slot));
    if (!def) continue;
    out.push({
      slot: (slot + 1) as CompanionSlot,
      id: def.id,
      def,
      alive: !!act,
      hp: act ? Math.max(0, Math.ceil(act.hp)) : 0,
      maxHp: act ? act.maxHp : scaledMaxHp(def),
      charge: getSlotCharge(slot),
    });
  }
  return out;
}

export interface CompanionTarget {
  slot: 0 | 1;
  pos: THREE.Vector3;
  radius: number;
  tauntRadius: number;
  flying: boolean;
  altitude: number;
}

/** Exposes all active companions so enemy-ai.ts can target and damage them. */
export function getActiveCompanionTargets(): CompanionTarget[] {
  const out: CompanionTarget[] = [];
  for (let s = 0; s < 2; s++) {
    const c = actives[s];
    if (!c || c.hp <= 0) continue;
    out.push({
      slot: c.slot,
      pos: c.pos,
      radius: c.def.radius,
      tauntRadius: c.def.tauntRadius ?? 0,
      flying: !!c.def.flying,
      altitude: c.altitude,
    });
  }
  return out;
}

/** Called by enemy-ai.ts when an enemy attack, projectile, slam, or hazard hits a companion. */
export function hurtCompanion(slot: 0 | 1, dmg: number, fromPos?: THREE.Vector3): boolean {
  const c = actives[slot];
  if (!c || c.hp <= 0 || c.invuln > 0) return false;
  const reduced = Math.max(1, dmg * (c.def.id === 'golem' ? 0.8 : 1));
  c.hp -= reduced;
  c.invuln = 0.35;
  c.flash = 1;
  c.lastHurt = state.time;

  const hitAt = new THREE.Vector3(c.pos.x, c.pos.y + (c.def.flying ? 0.2 : 1.0), c.pos.z);
  burst(hitAt, 0xff6250, 14, 4.5, 0.12);
  sfx.hit({ heavy: false, pan: panOf(c.pos.x, c.pos.z) });

  if (fromPos && !c.def.flying) {
    const dx = c.pos.x - fromPos.x, dz = c.pos.z - fromPos.z;
    const d = Math.hypot(dx, dz);
    if (d > 0.05) {
      const kb = c.def.id === 'golem' ? 1.8 : 4.6;
      c.knock.set(dx / d, 0, dz / d).multiplyScalar(kb);
    }
  }

  if (c.hp <= 0) dismissSlot(slot, true);
  return true;
}

function dismissSlot(slot: 0 | 1, killed: boolean) {
  const c = actives[slot];
  if (!c) return;
  const at = new THREE.Vector3(c.pos.x, c.pos.y + (c.def.flying ? 0.2 : 1.1), c.pos.z);
  burst(at, killed ? 0xff4c40 : c.def.color, killed ? 95 : 45, killed ? 7.5 : 5, 0.16);
  burst(at, 0xfff0d0, 26, 4.5, 0.12);
  impactRing(c.pos, killed ? 0xff4c40 : c.def.color, 3.6);
  if (killed) {
    sfx.death({ big: c.def.id === 'golem', pan: panOf(c.pos.x, c.pos.z) });
    setSlotCharge(slot, 0);
    showMsg(`¡ TU ${c.def.name.toUpperCase()} HA CAÍDO !\nRecargando invocación (${c.def.rechargeTime}s)...`, 2.4);
  }
  clearSlot(slot);
}

/** Boosts recharging companion slots on every enemy kill. */
export function chargeCompanionKill() {
  const slots = maxCompanionSlots();
  for (let s = 0; s < slots; s++) {
    const slot = s as 0 | 1;
    const id = getSlotId(slot);
    if (actives[slot] || !id || getSlotCharge(slot) >= 1) continue;
    setSlotCharge(slot, Math.min(1, getSlotCharge(slot) + KILL_RECHARGE_BONUS));
    if (getSlotCharge(slot) >= 1) notifyReady(id);
  }
}

function notifyReady(id: CompanionId) {
  const d = COMPANIONS[id];
  sfx.chime(false);
  showMsg(`— ${d.kanji} ${d.name.toUpperCase()} LISTO —\nPulsa R para invocar`, 1.7);
}

// ------------------------------------------------------------ Summoning (Key R)
function spawnSlot(slot: 0 | 1, d: CompanionDef) {
  const side = slot === 0 ? 1 : -1;
  const angle = player.face + side * 0.95;
  const sx = player.pos.x + Math.sin(angle) * 2.4;
  const sz = player.pos.z + Math.cos(angle) * 2.4;
  const p = new THREE.Vector3(sx, 0, sz);
  if (!d.flying) collide(p, d.radius);
  const gy = surfaceY(p.x, p.z);
  const altitude = d.flying ? (d.flyHeight ?? 3.4) : 0;
  p.y = gy + altitude;

  const model = createCompanionModel(d.id, d.color);
  model.root.scale.setScalar(d.scale);
  model.root.position.copy(p);
  model.root.rotation.y = player.face;
  scene.add(model.root);

  const maxHp = scaledMaxHp(d);
  model.setHpFrac(1);

  actives[slot] = {
    slot,
    id: d.id,
    def: d,
    model,
    pos: p,
    face: player.face,
    hp: maxHp,
    maxHp,
    state: 'follow',
    t: 0,
    attackCd: 0.25,
    invuln: 0.6,
    flash: 0.5,
    lastHurt: -99,
    knock: new THREE.Vector3(),
    target: null,
    orbitAngle: slot * Math.PI,
    altitude,
    hitDone: false,
  };

  const fxPos = new THREE.Vector3(p.x, gy + 0.2, p.z);
  impactRing(fxPos, d.color, 3.8);
  dashRing(fxPos);
  burst(new THREE.Vector3(p.x, p.y + (d.flying ? 0 : 1.0), p.z), d.color, 52, 6.2, 0.16);
  burst(new THREE.Vector3(p.x, p.y + (d.flying ? 0 : 1.1), p.z), 0xffffff, 22, 4.5, 0.12);
  flare(new THREE.Vector3(p.x, p.y + 1.4, p.z), d.color, { size: 0.95, life: 0.45 });

  if (d.id === 'lobo') sfx.howl(panOf(p.x, p.z));
  else if (d.id === 'leon') sfx.growl(panOf(p.x, p.z), true);
  else if (d.id === 'golem') sfx.taiko(0.85);
  else sfx.chime(true);
}

export function trySummonCompanion() {
  if (!state.playing || state.dead || state.photo || state.menu) return;
  if (!state.companion) {
    showMsg('Aún no tienes compañeros · Masa los recluta en su tienda (desde 2.500 mon)', 2.4);
    return;
  }

  const slots = maxCompanionSlots();
  const summoned: CompanionDef[] = [];
  for (let s = 0; s < slots; s++) {
    const slot = s as 0 | 1;
    const id = getSlotId(slot);
    if (!id || actives[slot] || getSlotCharge(slot) < 1) continue;
    const d = COMPANIONS[id];
    spawnSlot(slot, d);
    summoned.push(d);
  }

  if (summoned.length > 0) {
    if (summoned.length === 2) {
      showMsg(`— ${summoned[0].kanji} ${summoned[0].short.toUpperCase()} Y ${summoned[1].kanji} ${summoned[1].short.toUpperCase()} INVOCADOS —`, 1.9);
    } else {
      const d = summoned[0];
      showMsg(`— ${d.kanji} ${d.name.toUpperCase()} INVOCADO —\n${d.role} · ${scaledMaxHp(d)} vida`, 1.7);
    }
    return;
  }

  // No slot was ready to summon: either rally active ones or show recharge progress
  const live = actives.filter((c): c is ActiveCompanion => !!c);
  if (live.length > 0) {
    let rallied = false;
    for (const c of live) {
      if (Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z) > 8) {
        c.target = null;
        c.state = 'follow';
        rallied = true;
      }
    }
    if (rallied) sfx.chime(false);
    const summary = live.map(c => `${c.def.kanji} ${c.def.short} ${Math.ceil(c.hp)}/${c.maxHp} HP`).join('  ·  ');
    showMsg(rallied ? `Compañeros a tu lado · ${summary}` : summary, 1.4);
    return;
  }

  // All equipped slots are recharging
  const lines: string[] = [];
  for (let s = 0; s < slots; s++) {
    const slot = s as 0 | 1;
    const id = getSlotId(slot);
    if (!id) continue;
    lines.push(`${COMPANIONS[id].short} ${Math.floor(getSlotCharge(slot) * 100)} %`);
  }
  showMsg(`Recargando · ${lines.join(' · ')}`, 1.2);
}

// ------------------------------------------------------------ Combat helpers
const isAliveEnemy = (e: Enemy | null): e is Enemy => !!e && e.hp > 0 && enemies.includes(e);

function pickEnemy(c: ActiveCompanion): Enemy | null {
  const maxR = c.def.flying ? FLY_SEEK_RANGE : SEEK_RANGE;
  const otherTarget = actives[c.slot === 0 ? 1 : 0]?.target ?? null;
  let best: Enemy | null = null;
  let bestScore = Infinity;
  for (const e of enemies) {
    if (e.hp <= 0 || e.state === 'return') continue;
    const dComp = Math.hypot(e.g.position.x - c.pos.x, e.g.position.z - c.pos.z);
    const dPlayer = Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z);
    if (dComp > maxR && dPlayer > maxR * 0.85) continue;
    const aggroBonus = e.state !== 'idle' ? -4 : 0;
    // Slightly encourage 2 companions to split targets when multiple enemies are present
    const splitPenalty = e === otherTarget ? 2.5 : 0;
    const score = dComp * 0.7 + dPlayer * 0.3 + aggroBonus + splitPenalty;
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function dealCompanionAttack(c: ActiveCompanion) {
  const d = c.def;
  const baseDmg = d.dmg * dmgMult() * (0.65 + 0.35 * weaponDmg(weapon()));
  const aoe = d.aoeRadius ?? 0;
  const hitRange = aoe > 0 ? aoe : d.reach + 0.65;
  const fx = Math.sin(c.face), fz = Math.cos(c.face);
  const pan = panOf(c.pos.x, c.pos.z);

  if (d.id === 'golem') {
    const slamPos = new THREE.Vector3(c.pos.x + fx * 1.1, surfaceY(c.pos.x, c.pos.z) + 0.15, c.pos.z + fz * 1.1);
    impactRing(slamPos, d.color, aoe);
    burst(slamPos, 0xb8b09c, 48, 7.2, 0.16);
    burst(slamPos, d.color, 26, 5.5, 0.14);
    sfx.taiko(0.75);
    state.shake = Math.max(state.shake, 0.24);
  } else if (d.id === 'aguila') {
    burst(c.pos.clone(), d.color, 28, 6.0, 0.13);
    sfx.swing({ power: 1.0, pan });
  } else if (d.id === 'leon') {
    const pawPos = new THREE.Vector3(c.pos.x + fx * 1.0, c.pos.y + 0.9, c.pos.z + fz * 1.0);
    impactRing(new THREE.Vector3(pawPos.x, c.pos.y + 0.1, pawPos.z), d.color, aoe);
    burst(pawPos, d.color, 34, 6.2, 0.14);
    sfx.growl(pan, false);
  } else {
    sfx.swing({ power: 0.85, pan });
  }

  let hits = 0;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const dx = e.g.position.x - c.pos.x, dz = e.g.position.z - c.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > hitRange + 0.45 * e.scale) continue;
    if (aoe === 0 && dist > 0.5 && (dx * fx + dz * fz) / dist < -0.25) continue;

    const dealt = Math.max(0.5, baseDmg * damageTaken(e));
    e.hp -= dealt;
    e.flash = 0.85;
    provoke(e);
    addStagger(e, dealt * (d.id === 'golem' ? 1.8 : 0.9));
    if (e.state !== 'return' && d.stagger) staggerEnemy(e, e.big ? d.stagger * 0.35 : d.stagger);
    if (dist > 0.05) {
      const kb = d.id === 'golem' ? 6.2 : d.id === 'leon' ? 5.0 : 3.4;
      e.knock.set(dx / dist, 0, dz / dist).multiplyScalar(e.big ? kb * 0.35 : kb);
    }
    const hitPos = new THREE.Vector3(e.g.position.x, e.g.position.y + 1.1 * e.scale, e.g.position.z);
    burst(hitPos, d.color, 18, 5.2, 0.13);
    sparkBurst(hitPos, 6, 4.5);
    hits++;
    if (aoe === 0 && hits >= 2) break;
  }
  if (hits > 0) {
    sfx.hit({ heavy: d.id === 'golem' || d.id === 'leon', pan, count: hits });
  }
}

// ------------------------------------------------------------ Per-frame Simulation
function updateFlyingCompanion(c: ActiveCompanion, dt: number) {
  const d = c.def;
  const cruiseH = d.flyHeight ?? 3.4;
  c.attackCd = Math.max(0, c.attackCd - dt);
  c.orbitAngle += dt * 1.35;

  if (!isAliveEnemy(c.target) || Math.hypot(c.target.g.position.x - player.pos.x, c.target.g.position.z - player.pos.z) > FLY_SEEK_RANGE + 6) {
    c.target = pickEnemy(c);
  }

  let moving = 1;
  let animState: 'idle' | 'windup' | 'strike' | 'dive' = 'idle';

  if (c.state === 'dive' && isAliveEnemy(c.target)) {
    animState = 'dive';
    const ex = c.target.g.position.x, ez = c.target.g.position.z;
    const ey = c.target.g.position.y + 1.05 * c.target.scale;
    const dx = ex - c.pos.x, dy = ey - c.pos.y, dz = ez - c.pos.z;
    const dist3 = Math.hypot(dx, dy, dz);
    const diveSpeed = d.speed * 1.55;
    if (dist3 > 0.1) {
      const step = Math.min(dist3, diveSpeed * dt);
      c.pos.x += (dx / dist3) * step;
      c.pos.y += (dy / dist3) * step;
      c.pos.z += (dz / dist3) * step;
      c.face += angDiff(Math.atan2(dx, dz), c.face) * Math.min(1, dt * 14);
    }
    if (!c.hitDone && dist3 < 1.85) {
      c.hitDone = true;
      dealCompanionAttack(c);
      c.state = 'climb';
      c.t = 0.55;
      c.attackCd = d.attackCd;
    } else if ((c.t -= dt) <= 0) {
      c.state = 'climb';
      c.t = 0.45;
      c.attackCd = d.attackCd * 0.6;
    }
  } else if (c.state === 'climb') {
    animState = 'windup';
    c.t -= dt;
    const gy = surfaceY(c.pos.x, c.pos.z);
    const fx = Math.sin(c.face), fz = Math.cos(c.face);
    c.pos.x += fx * d.speed * 0.72 * dt;
    c.pos.z += fz * d.speed * 0.72 * dt;
    c.pos.y = THREE.MathUtils.lerp(c.pos.y, gy + cruiseH, Math.min(1, dt * 5.2));
    if (c.t <= 0) c.state = c.target ? 'chase' : 'follow';
  } else if (isAliveEnemy(c.target)) {
    c.state = 'chase';
    const ex = c.target.g.position.x, ez = c.target.g.position.z;
    const dx = ex - c.pos.x, dz = ez - c.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 7.2 && c.attackCd <= 0) {
      c.state = 'dive';
      c.hitDone = false;
      c.t = 1.2;
      c.face = Math.atan2(dx, dz);
    } else {
      const tx = ex + Math.cos(c.orbitAngle) * 4.2;
      const tz = ez + Math.sin(c.orbitAngle) * 4.2;
      const mdx = tx - c.pos.x, mdz = tz - c.pos.z;
      const md = Math.hypot(mdx, mdz);
      if (md > 0.2) {
        c.pos.x += (mdx / md) * Math.min(md, d.speed * dt);
        c.pos.z += (mdz / md) * Math.min(md, d.speed * dt);
        c.face += angDiff(Math.atan2(mdx, mdz), c.face) * Math.min(1, dt * 8);
      }
      const gy = surfaceY(c.pos.x, c.pos.z);
      c.pos.y = THREE.MathUtils.lerp(c.pos.y, gy + cruiseH + Math.sin(state.time * 2.4) * 0.25, Math.min(1, dt * 4));
    }
  } else {
    c.state = 'follow';
    const tx = player.pos.x + Math.cos(c.orbitAngle * 0.85) * 3.2;
    const tz = player.pos.z + Math.sin(c.orbitAngle * 0.85) * 3.2;
    const mdx = tx - c.pos.x, mdz = tz - c.pos.z;
    const md = Math.hypot(mdx, mdz);
    const spd = md > 8 ? d.speed * 1.15 : d.speed * 0.65;
    if (md > 0.2) {
      c.pos.x += (mdx / md) * Math.min(md, spd * dt);
      c.pos.z += (mdz / md) * Math.min(md, spd * dt);
      c.face += angDiff(Math.atan2(mdx, mdz), c.face) * Math.min(1, dt * 7);
    }
    const gy = surfaceY(c.pos.x, c.pos.z);
    c.pos.y = THREE.MathUtils.lerp(c.pos.y, gy + cruiseH + Math.sin(state.time * 2.1) * 0.28, Math.min(1, dt * 4));
  }

  const gy = surfaceY(c.pos.x, c.pos.z);
  c.altitude = Math.max(0, c.pos.y - gy);
  c.model.ring.position.y = (gy - c.pos.y + 0.06) / d.scale;
  const turnRate = dt > 1e-4 ? angDiff(c.face, c.model.root.rotation.y) / dt : 0;
  c.model.update(dt, { moving, speed: d.speed, state: animState, turnRate });
}

function updateGroundCompanion(c: ActiveCompanion, dt: number) {
  const d = c.def;
  c.attackCd = Math.max(0, c.attackCd - dt);

  if (!isAliveEnemy(c.target) || Math.hypot(c.target.g.position.x - player.pos.x, c.target.g.position.z - player.pos.z) > SEEK_RANGE + 8) {
    c.target = pickEnemy(c);
  }

  let moving = 0;
  let animState: 'idle' | 'windup' | 'strike' | 'dive' = 'idle';

  if (c.state === 'windup') {
    animState = 'windup';
    c.t -= dt;
    if (isAliveEnemy(c.target)) {
      const heading = Math.atan2(c.target.g.position.x - c.pos.x, c.target.g.position.z - c.pos.z);
      c.face += angDiff(heading, c.face) * Math.min(1, dt * 14);
    }
    if (c.t <= 0) {
      dealCompanionAttack(c);
      c.state = 'strike';
      c.t = 0.26;
      c.attackCd = d.attackCd;
    }
  } else if (c.state === 'strike') {
    animState = 'strike';
    c.t -= dt;
    c.pos.x += Math.sin(c.face) * 2.6 * dt;
    c.pos.z += Math.cos(c.face) * 2.6 * dt;
    if (c.t <= 0) c.state = c.target ? 'chase' : 'follow';
  } else if (isAliveEnemy(c.target)) {
    c.state = 'chase';
    const ex = c.target.g.position.x, ez = c.target.g.position.z;
    const dx = ex - c.pos.x, dz = ez - c.pos.z;
    const dist = Math.hypot(dx, dz);
    const reach = d.reach + 0.35 * c.target.scale;
    const heading = Math.atan2(dx, dz);
    c.face += angDiff(heading, c.face) * Math.min(1, dt * 12);

    if (dist <= reach && c.attackCd <= 0) {
      c.state = 'windup';
      c.t = d.windup;
    } else if (dist > reach * 0.85) {
      moving = 1;
      const spd = d.speed * (1 - 0.35 * wadeDepth(c.pos.x, c.pos.z));
      const step = Math.min(dist - reach * 0.7, spd * dt);
      if (step > 0) {
        c.pos.x += (dx / dist) * step;
        c.pos.z += (dz / dist) * step;
      }
    }
  } else {
    c.state = 'follow';
    // Flank left or right depending on slot so 2 companions march beside the warrior cleanly
    const flank = player.face + (c.slot === 0 ? 1.15 : -1.15);
    const tx = player.pos.x + Math.sin(flank) * 2.6;
    const tz = player.pos.z + Math.cos(flank) * 2.6;
    const dx = tx - c.pos.x, dz = tz - c.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 1.2) {
      moving = 1;
      const spd = dist > 7 ? d.speed * 1.22 : d.speed * 0.88;
      const step = Math.min(dist - 0.8, spd * dt);
      if (step > 0) {
        c.pos.x += (dx / dist) * step;
        c.pos.z += (dz / dist) * step;
      }
      c.face += angDiff(Math.atan2(dx, dz), c.face) * Math.min(1, dt * 9);
    } else {
      c.face += angDiff(player.face, c.face) * Math.min(1, dt * 4);
    }
  }

  c.pos.addScaledVector(c.knock, dt);
  c.knock.multiplyScalar(Math.exp(-8 * dt));
  collide(c.pos, d.radius);

  // Soft separation from player
  tmp.set(c.pos.x - player.pos.x, 0, c.pos.z - player.pos.z);
  const pd = tmp.length();
  const minSep = d.radius + 0.55;
  if (pd < minSep && pd > 1e-4) {
    c.pos.x += (tmp.x / pd) * (minSep - pd) * 0.5;
    c.pos.z += (tmp.z / pd) * (minSep - pd) * 0.5;
  }

  // Soft separation from the other active ground companion
  const other = actives[c.slot === 0 ? 1 : 0];
  if (other && !other.def.flying) {
    const ox = c.pos.x - other.pos.x, oz = c.pos.z - other.pos.z;
    const od = Math.hypot(ox, oz);
    const minOther = d.radius + other.def.radius + 0.35;
    if (od < minOther && od > 1e-4) {
      c.pos.x += (ox / od) * (minOther - od) * 0.5;
      c.pos.z += (oz / od) * (minOther - od) * 0.5;
    }
  }

  const wd = wadeDepth(c.pos.x, c.pos.z);
  c.pos.y = surfaceY(c.pos.x, c.pos.z) - wd * WADE_SINK;
  c.altitude = 0;
  const turnRate = dt > 1e-4 ? angDiff(c.face, c.model.root.rotation.y) / dt : 0;
  c.model.update(dt, { moving, speed: d.speed, state: animState, turnRate });
}

export function updateCompanions(dt: number) {
  const slots = maxCompanionSlots();
  // Auto-fill Slot 2 when the player reaches Level 50 mid-run and already owns 2+ companions
  if (slots >= 2 && !state.companion2 && state.ownedCompanions.length >= 2) {
    const spare = state.ownedCompanions.find(id => id !== state.companion) ?? null;
    if (spare) {
      state.companion2 = spare;
      state.companionCharge2 = 1;
      saveVault();
      showMsg(`¡ NIVEL ${DUAL_COMPANION_LEVEL} · 2 COMPAÑEROS DESBLOQUEADO !\n${COMPANIONS[spare].kanji} ${COMPANIONS[spare].name} listo en ranura 2 (R)`, 2.8);
    }
  }

  for (let s = 0; s < slots; s++) {
    const slot = s as 0 | 1;
    const c = actives[slot];
    if (!c) {
      const id = getSlotId(slot);
      if (id && getSlotCharge(slot) < 1) {
        const def = COMPANIONS[id];
        setSlotCharge(slot, Math.min(1, getSlotCharge(slot) + dt / def.rechargeTime));
        if (getSlotCharge(slot) >= 1) notifyReady(id);
      }
      continue;
    }

    c.invuln = Math.max(0, c.invuln - dt);
    c.flash = Math.max(0, c.flash - dt * 6);
    c.model.setFlash(c.flash);

    const distPlayer = Math.hypot(c.pos.x - player.pos.x, c.pos.z - player.pos.z);
    if (distPlayer > TELEPORT_DIST) {
      const a = player.face + (slot === 0 ? 0.95 : -0.95);
      c.pos.set(player.pos.x + Math.sin(a) * 2.4, 0, player.pos.z + Math.cos(a) * 2.4);
      if (!c.def.flying) collide(c.pos, c.def.radius);
      c.pos.y = surfaceY(c.pos.x, c.pos.z) + (c.def.flying ? (c.def.flyHeight ?? 3.4) : 0);
      c.target = null;
      c.state = 'follow';
    }

    const fighting = !!c.target || enemies.some(e => e.state !== 'idle' && e.state !== 'return');
    if (!fighting && state.time - c.lastHurt > 6 && c.hp < c.maxHp) {
      c.hp = Math.min(c.maxHp, c.hp + c.maxHp * 0.03 * dt);
    }

    if (c.def.flying) updateFlyingCompanion(c, dt);
    else updateGroundCompanion(c, dt);

    c.model.root.position.copy(c.pos);
    c.model.root.rotation.y = c.face;
    c.model.ring.rotation.z = state.time * 0.9;
    c.model.setHpFrac(c.hp / c.maxHp);
    c.model.hpBarGroup.quaternion.copy(camera.quaternion);
  }
}
