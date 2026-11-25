// The ronin's vault: the blades, armour and techniques won are kept from one run to the next, one vault per
// class, saved in the browser (and in the cloud with an account: account.ts). The resets of a new run
// (weapons.ts, armor.ts, special.ts) read it back, so a run starts with everything already earned; mon,
// jade seals and the passive upgrades still belong to the run.
//
// Saving is a union: an item once in the vault never leaves it, so no ordering of resets can lose one.
// A cheap check every second and a half writes the vault when what the ronin owns or wears has changed.
import { state } from './state';
import type { ClassId } from './classes';
import type { TechniqueId } from './techniques';

export interface Vault {
  weapons: string[]; armors: string[]; techniques: TechniqueId[];
  weapon?: string; armor?: string; technique?: TechniqueId;
}
export const VAULT_PREFIX = 'ronin-ascii.items.';
const key = (id: ClassId) => VAULT_PREFIX + id;
const strings = (v: unknown): string[] => Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
const str = (v: unknown) => typeof v === 'string' ? v : undefined;

/** parses a stored vault, tolerating anything broken */
export function parseVault(raw: string | null): Vault {
  try {
    const v = JSON.parse(raw || 'null');
    if (v && typeof v === 'object') return {
      weapons: strings(v.weapons), armors: strings(v.armors), techniques: strings(v.techniques) as TechniqueId[],
      weapon: str(v.weapon), armor: str(v.armor), technique: str(v.technique) as TechniqueId | undefined
    };
  } catch { /* broken save */ }
  return { weapons: [], armors: [], techniques: [] };
}
export function readVault(id: ClassId = state.cls): Vault {
  try { return parseVault(localStorage.getItem(key(id))); } catch { return parseVault(null); }
}
const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];
/** two vaults into one: every item of either, the gear worn from `b` */
export function mergeVaults(a: Vault, b: Vault): Vault {
  return {
    weapons: union(a.weapons, b.weapons), armors: union(a.armors, b.armors), techniques: union(a.techniques, b.techniques),
    weapon: b.weapon ?? a.weapon, armor: b.armor ?? a.armor, technique: b.technique ?? a.technique
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
  const sig = [state.cls, state.owned, state.ownedArmor, state.learnedTechniques, state.weapon, state.armor, state.technique].join('|');
  if (sig === lastSig) return;
  lastSig = sig;
  const now: Vault = {
    weapons: state.owned.slice(), armors: state.ownedArmor.slice(), techniques: state.learnedTechniques.slice(),
    weapon: state.weapon, armor: state.armor, technique: state.technique
  };
  try { localStorage.setItem(key(state.cls), JSON.stringify(mergeVaults(readVault(), now))); } catch { /* no storage */ }
}
setInterval(saveVault, 1500);
addEventListener('beforeunload', saveVault);
addEventListener('visibilitychange', () => { if (document.hidden) saveVault(); });
