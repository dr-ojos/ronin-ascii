// Damage dealt by the special techniques (P): it can wound a whole group, but never wipe it out on its own.
// Each technique can take at most a share of every enemy's life per cast (less from bosses, guardians
// and the big ones); the katana has to finish the job.
import { state } from './state';
import type { Enemy } from './types';

const CAP = 0.55;       // share of its life a common enemy can lose to one technique
const CAP_BIG = 0.25;   // ...a boss, a guardian or a heavy one
const WINDOW = 4;       // seconds a cast lasts for this count (cuts, bolts and burning included)

const taken = new WeakMap<Enemy, { t: number; dmg: number }>();

/** hurt an enemy with a technique, up to its cap; returns the damage actually done */
export function specialDamage(e: Enemy, amount: number) {
  let rec = taken.get(e);
  if (!rec || state.time - rec.t > WINDOW) { rec = { t: state.time, dmg: 0 }; taken.set(e, rec); }
  const cap = e.maxHp * (e.big ? CAP_BIG : CAP);
  const dmg = Math.max(0, Math.min(amount, cap - rec.dmg));
  rec.dmg += dmg; e.hp -= dmg;
  return dmg;
}
