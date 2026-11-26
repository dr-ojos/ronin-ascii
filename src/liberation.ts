// Town liberation mini-missions (Aldea de Kiri & Pueblo de Asagiri):
// Entering an occupied town starts its liberation mission. Defeat every oni squad and warlord
// occupying the streets and squares to free the town permanently for the run and claim a reward.
import { place } from './map';
import { KINDS } from './enemies';
import { burst, impactRing } from './fx';
import { showMsg } from './hud';
import { addPoints } from './score';
import { sfx } from './sfx';
import { skyFlash } from './special';
import { player, state } from './state';
import type { Camp } from './types';

export type TownId = 'aldea' | 'pueblo';

interface TownDef {
  id: TownId;
  name: string;
  rewardPoints: number;
  rewardJade: number;
}

const TOWN_DEFS: TownDef[] = [
  { id: 'aldea', name: 'Aldea de Kiri', rewardPoints: 1500, rewardJade: 1 },
  { id: 'pueblo', name: 'Pueblo de Asagiri', rewardPoints: 3000, rewardJade: 2 }
];

interface TownMission extends TownDef {
  camps: Camp[];
  started: boolean;
  liberated: boolean;
}

const missions = new Map<TownId, TownMission>(
  TOWN_DEFS.map(def => [def.id, { ...def, camps: [], started: false, liberated: false }])
);

/** register an occupation camp belonging to a town (called from encounters.ts buildCamps) */
export function registerTownCamp(camp: Camp) {
  if (!camp.town) return;
  const m = missions.get(camp.town);
  if (m && !m.camps.includes(camp)) m.camps.push(camp);
}

export const townCampsOf = (id: TownId): readonly Camp[] => missions.get(id)?.camps ?? [];
export const isTownLiberated = (id: TownId) => missions.get(id)?.liberated ?? false;
export const isTownMissionStarted = (id: TownId) => missions.get(id)?.started ?? false;

export function liberatedCount() {
  let done = 0;
  for (const m of missions.values()) if (m.liberated) done++;
  return { done, total: missions.size };
}

function progressOf(m: TownMission) {
  const total = m.camps.length;
  let cleared = 0, remainingFoes = 0;
  const liveBosses: string[] = [];
  for (const c of m.camps) {
    if (c.roster.length === 0) cleared++;
    else {
      remainingFoes += c.roster.length;
      if (c.boss && c.roster.includes(c.boss)) liveBosses.push(KINDS[c.boss].name);
    }
  }
  return { cleared, total, remainingFoes, liveBosses };
}

/** start a town liberation mission (when entering the town or provoking one of its squads) */
export function startTownMission(id: TownId, announce = true) {
  const m = missions.get(id);
  if (!m || m.liberated || m.started || !m.camps.length) return false;
  m.started = true;
  if (announce) {
    const { cleared, total, remainingFoes } = progressOf(m);
    sfx.taiko(0.95);
    showMsg(
      `— MISIÓN: LIBERAR ${m.name.toUpperCase()} —\nDerrota a los grupos oni y a sus jefes (${cleared}/${total} · ${remainingFoes} enemigos)`,
      3.4
    );
  }
  return true;
}

/** called when an occupation camp is cleared; returns liberation status for the victory toast */
export function onTownCampCleared(camp: Camp): { liberated: boolean; note: string } {
  if (!camp.town) return { liberated: false, note: '' };
  const m = missions.get(camp.town);
  if (!m || m.liberated || !m.camps.length) return { liberated: false, note: '' };
  m.started = true;
  const { cleared, total, remainingFoes } = progressOf(m);
  if (cleared < total) {
    return {
      liberated: false,
      note: `\nLiberación de ${m.name}: ${cleared}/${total} zonas · quedan ${remainingFoes} oni`
    };
  }
  // All squads and bosses in the town have fallen: the town is free!
  m.liberated = true;
  addPoints(m.rewardPoints, `${m.name.toLowerCase()} liberado`);
  state.jade += m.rewardJade;
  player.hp = player.maxHp;
  sfx.chime(true);
  sfx.taiko(1.3);
  skyFlash(0.65);
  const at = player.pos.clone();
  burst(at.clone().setY(at.y + 1.4), 0x87efbd, 120, 8, 0.16);
  burst(at.clone().setY(at.y + 1.6), 0xffd27a, 100, 7, 0.14);
  impactRing(at.clone().setY(at.y + 0.1), 0x87efbd, 5.5);
  const jadeTxt = `+${m.rewardJade} sello${m.rewardJade > 1 ? 's' : ''} de jade`;
  showMsg(
    `✦ ¡ ${m.name.toUpperCase()} LIBERADO ! ✦\n+${m.rewardPoints} puntos · ${jadeTxt} · vida al máximo`,
    4.2
  );
  return { liberated: true, note: '' };
}

let checkT = 0;
export function updateLiberation(dt: number) {
  if ((checkT -= dt) > 0) return;
  checkT = 0.25;
  for (const m of missions.values()) {
    if (m.liberated || m.started || !m.camps.length) continue;
    const p = place(m.id);
    if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < p.r + 12) {
      startTownMission(m.id, true);
    }
  }
}

/** the town mission currently relevant to display in the HUD (when inside or near an occupied town) */
export function activeTownMission(): TownMission | null {
  let best: TownMission | null = null, bestD = Infinity;
  for (const m of missions.values()) {
    if (m.liberated || !m.camps.length) continue;
    const p = place(m.id);
    const d = Math.hypot(player.pos.x - p.x, player.pos.z - p.z);
    if (d < p.r + (m.started ? 70 : 12) && d < bestD) { best = m; bestD = d; }
  }
  return best;
}

/** structured status for the active town liberation mission (used by Modo T HUD) */
export function liberationStatus() {
  const m = activeTownMission();
  if (!m) return null;
  return { name: m.name, ...progressOf(m) };
}

/** HUD block for the active town liberation mission */
export function liberationHud(): string {
  const m = activeTownMission();
  if (!m) return '';
  const { cleared, total, remainingFoes, liveBosses } = progressOf(m);
  const bar = '#'.repeat(cleared) + '-'.repeat(Math.max(0, total - cleared));
  const bossLine = liveBosses.length
    ? `\n  <span class="r">jefe${liveBosses.length > 1 ? 's' : ''}:</span> ${liveBosses.join(' · ')}`
    : '\n  <span class="jade">jefes abatidos · limpia los últimos oni</span>';
  return `<span class="jade">MISIÓN · LIBERAR ${m.name.toUpperCase()}</span>\n` +
    `  zonas [<span class="jade">${bar}</span>] ${cleared}/${total}  <span class="d">quedan ${remainingFoes} oni</span>${bossLine}\n`;
}

export function resetLiberation() {
  for (const m of missions.values()) { m.started = false; m.liberated = false; }
  checkT = 0;
}
