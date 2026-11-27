// The ronin's vault: the blades, armour, techniques and jade seals won are kept from one run to the next, one vault per
// class, saved in the browser (and in the cloud with an account: account.ts). The resets of a new run
// (weapons.ts, armor.ts, special.ts) read it back, so a run starts with everything already earned; mon
// and the passive chest upgrades still belong to the run.
//
// Saving is a union: an item once in the vault never leaves it, so no ordering of resets can lose one.
// A cheap check every second and a half writes the vault when what the ronin owns or wears has changed.
import { state } from './state';
import type { ClassId } from './classes';
import type { TechniqueId } from './techniques';
import type { OrbElement } from './elemental-orb';
import type { CompanionId } from './companions';

export interface Vault {
  weapons: string[]; armors: string[]; techniques: TechniqueId[];
  orbs?: OrbElement[]; rangedElement?: OrbElement;
  companions?: CompanionId[]; companion?: CompanionId; companion2?: CompanionId;
  weapon?: string; armor?: string; technique?: TechniqueId; technique2?: TechniqueId;
  weaponLevels?: Record<string, number>; weaponXp?: Record<string, number>;
  jade?: number;
}
export const VAULT_PREFIX = 'ronin-ascii.items.';
const key = (id: ClassId) => VAULT_PREFIX + id;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const str = (v: unknown) => typeof v === 'string' ? v : undefined;
const numMap = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    for (const [k, n] of Object.entries(v as Record<string, unknown>)) {
      if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[k] = Math.floor(n);
    }
  }
  return out;
};

/** parses a stored vault, tolerating anything broken */
export function parseVault(raw: string | null): Vault {
  try {
    const v = JSON.parse(raw || 'null');
    if (v && typeof v === 'object') return {
      weapons: strings(v.weapons), armors: strings(v.armors), techniques: strings(v.techniques) as TechniqueId[],
      orbs: strings(v.orbs) as OrbElement[], rangedElement: str(v.rangedElement) as OrbElement | undefined,
      companions: strings(v.companions) as CompanionId[], companion: str(v.companion) as CompanionId | undefined,
      companion2: str(v.companion2) as CompanionId | undefined,
      weapon: str(v.weapon), armor: str(v.armor), technique: str(v.technique) as TechniqueId | undefined,
      technique2: str(v.technique2) as TechniqueId | undefined,
      weaponLevels: numMap(v.weaponLevels), weaponXp: numMap(v.weaponXp),
      jade: typeof v.jade === 'number' && Number.isFinite(v.jade) && v.jade >= 0 ? Math.floor(v.jade) : undefined
    };
  } catch { /* broken save */ }
  return { weapons: [], armors: [], techniques: [], orbs: [], weaponLevels: {}, weaponXp: {} };
}
export function readVault(id: ClassId = state.cls): Vault {
  try { return parseVault(localStorage.getItem(key(id))); } catch { return parseVault(null); }
}
const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];
function mergeWeaponProgress(
  aLv: Record<string, number> | undefined, aXp: Record<string, number> | undefined,
  bLv: Record<string, number> | undefined, bXp: Record<string, number> | undefined
) {
  const levels: Record<string, number> = {};
  const xp: Record<string, number> = {};
  const ids = new Set([...Object.keys(aLv ?? {}), ...Object.keys(bLv ?? {}), ...Object.keys(aXp ?? {}), ...Object.keys(bXp ?? {})]);
  for (const id of ids) {
    const la = aLv?.[id] ?? 0, lb = bLv?.[id] ?? 0;
    const xa = aXp?.[id] ?? 0, xb = bXp?.[id] ?? 0;
    const lv = Math.max(la, lb);
    const curXp = la > lb ? xa : lb > la ? xb : Math.max(xa, xb);
    if (lv > 0) levels[id] = lv;
    if (curXp > 0) xp[id] = curXp;
  }
  return { weaponLevels: levels, weaponXp: xp };
}
/** two vaults into one: every item of either, the gear worn from `b` */
export function mergeVaults(a: Vault, b: Vault): Vault {
  return {
    weapons: union(a.weapons, b.weapons), armors: union(a.armors, b.armors), techniques: union(a.techniques, b.techniques),
    orbs: union(a.orbs ?? [], b.orbs ?? []), rangedElement: b.rangedElement ?? a.rangedElement,
    companions: union(a.companions ?? [], b.companions ?? []), companion: b.companion ?? a.companion,
    companion2: b.companion2 ?? a.companion2,
    weapon: b.weapon ?? a.weapon, armor: b.armor ?? a.armor, technique: b.technique ?? a.technique,
    technique2: b.technique2 ?? a.technique2,
    jade: b.jade ?? a.jade,
    ...mergeWeaponProgress(a.weaponLevels, a.weaponXp, b.weaponLevels, b.weaponXp)
  };
}

// nothing is saved until a reset has read the vault back for the current class (class-select.ts does it on load)
let ready = false, lastSig = '';
/** the resets call this once the vault is back in `state` */
export function vaultReady() { ready = true; lastSig = ''; }
/** stops saving (account.ts, before reloading the page with what came from the cloud) */
export function holdVault() { ready = false; }

export function saveVault() {
  if (!ready) return;
  const sig = [
    state.cls, state.owned, state.ownedArmor, state.learnedTechniques, state.learnedOrbs,
    state.ownedCompanions, state.companion ?? '', state.companion2 ?? '',
    state.weapon, state.armor, state.technique, state.technique2, state.rangedElement ?? '',
    state.jade,
    JSON.stringify(state.weaponLevels), JSON.stringify(state.weaponXp)
  ].join('|');
  if (sig === lastSig) return;
  lastSig = sig;
  const now: Vault = {
    weapons: state.owned.slice(), armors: state.ownedArmor.slice(), techniques: state.learnedTechniques.slice(),
    orbs: state.learnedOrbs.slice(), rangedElement: state.rangedElement ?? undefined,
    companions: state.ownedCompanions.slice(), companion: state.companion ?? undefined, companion2: state.companion2 ?? undefined,
    weapon: state.weapon, armor: state.armor, technique: state.technique, technique2: state.technique2,
    weaponLevels: { ...state.weaponLevels }, weaponXp: { ...state.weaponXp },
    jade: Math.max(0, Math.floor(state.jade))
  };
  try { localStorage.setItem(key(state.cls), JSON.stringify(mergeVaults(readVault(), now))); } catch { /* no storage */ }
}
setInterval(saveVault, 1500);
addEventListener('beforeunload', saveVault);
addEventListener('visibilitychange', () => { if (document.hidden) saveVault(); });
