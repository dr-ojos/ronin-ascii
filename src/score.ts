// Points: oni slain, camps cleared, places and corners discovered, mon from chests and drops.
// Kills close together build a streak (x2, x3 ... up to x5); getting hit breaks it. The best score is kept in the browser.
import { state } from './state';
import { streakBonus } from './upgrades';

const STREAK_WINDOW = 6;   // seconds to land the next kill and keep the streak
const BEST_KEY = 'ronin-ascii.best';
try { state.best = Number(localStorage.getItem(BEST_KEY)) || 0; } catch { /* no storage: best lives only this session */ }

export const POINTS = { camp: 150, bossCamp: 800, place: 250, corner: 75 };

/** add points; `streak` ones are multiplied and extend the streak */
export function addPoints(n: number, label: string, streak = false) {
  if (streak) {
    n *= state.mult;
    state.mult = Math.min(5, state.mult + 1);
    state.streakT = STREAK_WINDOW + streakBonus();
  }
  state.score += n;
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

export function resetScore() { state.score = 0; state.kills = 0; state.campsCleared = 0; state.gainT = 0; breakStreak(); }
