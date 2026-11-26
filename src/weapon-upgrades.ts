// Weapon improvement over time: every weapon grows stronger (+0 to +10) through combat mastery
// (hits, kills, and time wielded) and can also be tempered directly at Masa's forge for mon.
// Progress persists per weapon in the class vault (vault.ts).
import * as THREE from 'three';
import { player, state } from './state';
import { saveVault } from './vault';
import { burst, impactRing } from './fx';
import { sfx } from './sfx';
import { showMsg } from './hud';
import type { Weapon } from './weapons';

export const MAX_WEAPON_LEVEL = 10;

export const weaponLevel = (id: string) => Math.min(MAX_WEAPON_LEVEL, Math.max(0, state.weaponLevels[id] || 0));
export const weaponXp = (id: string) => Math.max(0, state.weaponXp[id] || 0);
export const weaponXpNeed = (lv: number) => lv >= MAX_WEAPON_LEVEL ? 0 : Math.round((80 + 70 * Math.pow(lv + 1, 1.45)) / 10) * 10;
export const weaponXpFrac = (id: string) => {
  const lv = weaponLevel(id);
  if (lv >= MAX_WEAPON_LEVEL) return 1;
  const need = weaponXpNeed(lv);
  return need > 0 ? Math.min(1, weaponXp(id) / need) : 1;
};

/** mon cost to temper a weapon one level immediately at Masa's forge */
export function weaponUpgradeCost(w: Weapon) {
  const lv = weaponLevel(w.id);
  const base = 350 + Math.max(w.price, w.tier * 2500) * 0.14;
  return Math.round((base * (1 + lv * 0.6)) / 50) * 50;
}

// Effective combat stats including weapon upgrade level
export const weaponDmg = (w: Weapon) => w.dmg * (1 + 0.06 * weaponLevel(w.id));
export const weaponReach = (w: Weapon) => w.reach + 0.04 * weaponLevel(w.id);
export const weaponSpeed = (w: Weapon) => w.speed * Math.max(0.85, 1 - 0.015 * weaponLevel(w.id));
export const weaponHeal = (w: Weapon) => (w.heal ? w.heal + Math.floor(weaponLevel(w.id) / 5) : 0);
export const weaponCharge = (w: Weapon) => (w.charge ? w.charge * (1 + 0.05 * weaponLevel(w.id)) : 0);
export const weaponDaze = (w: Weapon) => (w.daze ?? 1) * (1 + 0.05 * weaponLevel(w.id));

export const weaponDisplayName = (w: Weapon) => {
  const lv = weaponLevel(w.id);
  return lv > 0 ? `${w.name} +${lv}` : w.name;
};

export function weaponMasteryText(id: string) {
  const lv = weaponLevel(id);
  if (lv >= MAX_WEAPON_LEVEL) return `temple +${MAX_WEAPON_LEVEL} · MÁX`;
  const pct = Math.floor(weaponXpFrac(id) * 100);
  return `temple +${lv} · ${pct}% para +${lv + 1}`;
}

export function weaponNextBonusText(w: Weapon) {
  const lv = weaponLevel(w.id);
  if (lv >= MAX_WEAPON_LEVEL) return 'temple máximo alcanzado';
  const nextLv = lv + 1;
  const parts = [`daño +${nextLv * 6}%`, `alcance +${(nextLv * 0.04).toFixed(2)} m`, `vel. +${Math.round(nextLv * 1.5)}%`];
  if (w.heal && nextLv % 5 === 0) parts.push(`cura +1`);
  return `al +${nextLv}: ${parts.join(' · ')}`;
}

/** add mastery XP to the currently equipped weapon (or a specific weapon); levels up automatically */
export function gainWeaponXp(amount: number, w: Weapon, onLevelUp?: () => void): boolean {
  if (amount <= 0) return false;
  let lv = weaponLevel(w.id);
  if (lv >= MAX_WEAPON_LEVEL) return false;
  let xp = weaponXp(w.id) + amount;
  let leveled = false;
  while (lv < MAX_WEAPON_LEVEL) {
    const need = weaponXpNeed(lv);
    if (xp < need) break;
    xp -= need;
    lv++;
    leveled = true;
  }
  if (lv >= MAX_WEAPON_LEVEL) xp = 0;
  state.weaponLevels[w.id] = lv;
  state.weaponXp[w.id] = Math.floor(xp);
  if (leveled) {
    saveVault();
    onLevelUp?.();
    const at = new THREE.Vector3(player.pos.x, player.pos.y + 1.25, player.pos.z);
    burst(at, w.glow, 48, 6.5, 0.14);
    burst(at, 0xffd27a, 24, 4.5, 0.12);
    impactRing(player.pos, w.glow, 3.6);
    sfx.chime(true);
    showMsg(`✦ ${w.name.toUpperCase()} +${lv} ✦\nEl arma mejora con el uso · daño +${lv * 6}%`, 2.4);
  }
  return leveled;
}

/** temper a weapon immediately at Masa's forge for mon */
export function forgeWeapon(w: Weapon, onUpgraded?: () => void): 'ok' | 'poor' | 'max' {
  const lv = weaponLevel(w.id);
  if (lv >= MAX_WEAPON_LEVEL) return 'max';
  const cost = weaponUpgradeCost(w);
  if (state.mon < cost) return 'poor';
  state.mon -= cost;
  state.weaponLevels[w.id] = lv + 1;
  state.weaponXp[w.id] = 0;
  saveVault();
  onUpgraded?.();
  return 'ok';
}

// Gentle passive tempering over time while wielding the weapon during an active run
let passiveTimer = 0;
export function updateWeaponMastery(dt: number, currentWeapon: Weapon, onLevelUp?: () => void) {
  if (!state.playing || state.dead || state.menu || state.indoors) return;
  if (weaponLevel(currentWeapon.id) >= MAX_WEAPON_LEVEL) return;
  passiveTimer += dt;
  if (passiveTimer >= 4) {
    passiveTimer -= 4;
    gainWeaponXp(2, currentWeapon, onLevelUp);
  }
}
