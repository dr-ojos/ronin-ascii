// Points (and the mon you spend at the smith's, which grow more slowly: MON_RATE): oni slain, camps cleared, places and corners discovered, mon from chests and drops.
// Kills close together build a streak (x2, x3 ... up to x5); getting hit breaks it. The best score is kept in the browser.
import { state } from './state';
import { streakBonus } from './upgrades';
import { gainXp, maxStreak, monMult } from './progression';

const STREAK_WINDOW = 6;   // seconds to land the next kill and keep the streak
const BEST_KEY = 'ronin-ascii.best';
try { state.best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* no storage: best lives only this session */ }

export const POINTS = { camp: 150, bossCamp: 800, eliteCamp: 500, place: 250, corner: 75 };
/** share of the points earned that also go to the purse (mon found in chests and drops goes in whole) */
export const MON_RATE = 0.5;

/** add points (and MON_RATE of them as mon, or `monRate`) and as much experience (progression.ts);
 *  `streak` ones are multiplied and extend the streak */
export function addPoints(n: number, label: string, streak = false, monRate = MON_RATE) {
  if (streak) {
    n *= state.mult;
    state.mult = Math.min(maxStreak(), state.mult + 1);
    state.streakT = STREAK_WINDOW + streakBonus();
  }
  state.score += n; state.mon += Math.round(n * monRate * monMult() / 5) * 5;
  // every point won fighting or exploring is also experience (mon picked up is only money)
  if (monRate !== 1) gainXp(n);
  state.gain = `+${n} ${label}`; state.gainT = 2.2;
  if (state.score > state.best) {
    state.best = state.score;
    try { localStorage.setItem(BEST_KEY, String(state.best)); } catch { /* ignore */ }
  }
}

export function breakStreak() { state.mult = 1; state.streakT = 0; }

export function updateScore(dt: number) {
  state.gainT = Math.max(0, state.gainT - dt);
  if (state.streakT > 0) { state.streakT -= dt; if (state.streakT <= 0) breakStreak(); }
}

export function resetScore() { state.score = 0; state.mon = 0; state.kills = 0; state.campsCleared = 0; state.gainT = 0; breakStreak(); }
