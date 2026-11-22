import { ARMORS } from './armor';
import { WEAPONS } from './weapons';
import { state } from './state';
import { lvl, roman } from './upgrades';

export interface EquipmentThreat {
  offense: number;
  defense: number;
  rank: number;
}

/** Use the best gear acquired this run, so cycling equipment never changes the threat. */
export function equipmentThreat(): EquipmentThreat {
  const blade = Math.max(0, ...WEAPONS.filter(w => state.owned.includes(w.id)).map(w => w.tier));
  const armor = Math.max(0, ...ARMORS.filter(a => state.ownedArmor.includes(a.id)).map(a => a.tier));
  const offense = Math.min(3, blade + lvl('filo') * 0.5);
  const defense = Math.min(3, armor + lvl('armadura') * 0.25 + lvl('ofuda') * 0.35);
  return { offense, defense, rank: Math.floor(Math.max(offense, defense)) };
}

export function threatLabel() {
  const { rank } = equipmentThreat();
  return rank ? `Amenaza ${roman(rank)}` : 'Amenaza inicial';
}
