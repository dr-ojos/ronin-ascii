// HUD text, centre-screen messages and the title / death overlay.
import { battleLine, battleStatus } from './battle';
import { affixLabel, bossHud } from './boss-mechanics';
import { liberationHud, liberationStatus, liberatedCount } from './liberation';
import { dungeonHud, dungeonStatus } from './dungeon';
import { activeWorldEvent, worldEventHud } from './world-events';
import { player, state } from './state';
import { camps, discovered, placeCount, chestsLeft } from './encounters';
import { upgradeList } from './upgrades';
import { look } from './look';
import { weapon } from './weapons';
import { weaponDisplayName } from './weapon-upgrades';
import { armor } from './armor';
import { threatLabel } from './equipment-threat';
import { enemies, KINDS } from './enemies';
import { sfx } from './sfx';
import { TECHNIQUES } from './techniques';
import { MAX_RANGED_CHARGES, ORB_INFO } from './elemental-orb';
import { companionStatuses } from './companions';
import { cls } from './classes';
import { freePoints, level, MAX_LEVEL, xpFrac } from './progression';

const hud = document.getElementById('hud')!, msgEl = document.getElementById('msg')!, promptEl = document.getElementById('prompt')!;
export const overlay = document.getElementById('overlay')!;

const esc = (t: string) => t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));
const fmt = (n: number) => Math.floor(n).toLocaleString('es-ES');

// Inline SVG icons for the Modo T (3D) HUD ledger and equipped gear
const ICON_SCORE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5l1.9 4.2 4.6.5-3.4 3.1.9 4.5L8 11.5 4 13.8l.9-4.5L1.5 6.2l4.6-.5L8 1.5z" fill="#e6ebf5" opacity=".88"/></svg>';
const ICON_MON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.5" stroke="#ffd27a" stroke-width="1.6"/><rect x="6" y="6" width="4" height="4" stroke="#ffd27a" stroke-width="1.3"/></svg>';
const ICON_JADE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.5L13.5 8 8 14.5 2.5 8 8 1.5z" stroke="#87efbd" stroke-width="1.5" fill="rgba(135,239,189,.2)"/></svg>';
const ICON_WEAPON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M13.5 2.5L6.2 9.8M4.8 8.4l2.8 2.8M3 13l2.2-2.2" stroke="#8fb4ff" stroke-width="1.6" stroke-linecap="round"/></svg>';
const ICON_ARMOR = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 2l5 2v4.2c0 2.9-2.1 5-5 5.8-2.9-.8-5-2.9-5-5.8V4l5-2z" stroke="#cfd8ea" stroke-width="1.4" fill="rgba(207,216,234,.12)"/></svg>';

type THudRefs = {
  crest: HTMLElement; name: HTMLElement; lv: HTMLElement; pts: HTMLElement; weaponTxt: HTMLElement; armorTxt: HTMLElement;
  vital: HTMLElement; hpNum: HTMLElement; hpMax: HTMLElement; hpBar: HTMLProgressElement;
  xpBar: HTMLProgressElement; xpTxt: HTMLElement;
  score: HTMLElement; mult: HTMLElement; best: HTMLElement; mon: HTMLElement; jade: HTMLElement; gain: HTMLElement;
  slot1: HTMLElement; slot1Name: HTMLElement; slot1Bar: HTMLProgressElement; slot1Val: HTMLElement;
  slot2: HTMLElement; slot2Name: HTMLElement; slot2Bar: HTMLProgressElement; slot2Val: HTMLElement;
  compSlot: HTMLElement; compName: HTMLElement; compBar: HTMLProgressElement; compVal: HTMLElement;
  compSlot2: HTMLElement; compName2: HTMLElement; compBar2: HTMLProgressElement; compVal2: HTMLElement;
  orbSlot: HTMLElement; orbSub: HTMLElement; orbName: HTMLElement; orbDots: HTMLElement[]; orbBar: HTMLProgressElement; orbVal: HTMLElement;
  dash: HTMLElement; dashTxt: HTMLElement; snare: HTMLElement; mute: HTMLElement;
  meta: HTMLElement; ups: HTMLElement;
  mission: HTMLElement; mTitle: HTMLElement; mBar: HTMLProgressElement; mSub: HTMLElement;
  eventCard: HTMLElement; evKanji: HTMLElement; evTitle: HTMLElement; evBoss: HTMLElement; evWhere: HTMLElement;
  battleCard: HTMLElement; bCombo: HTMLElement; bSpirit: HTMLElement; bInfo: HTMLElement;
  bossCard: HTMLElement; bossName: HTMLElement; bossPhase: HTMLElement; bossAffix: HTMLElement;
  bossHp: HTMLProgressElement; bossStgRow: HTMLElement; bossStg: HTMLProgressElement; bossDazed: HTMLElement;
};

let tRefs: THudRefs | null = null;
let lastAsciiMode: boolean | null = null;

function mountTHud(): THudRefs {
  hud.dataset.mode = 't';
  hud.innerHTML =
    `<section class="th-card th-main" aria-label="Estado del guerrero">` +
      `<div class="th-head">` +
        `<div class="th-crest" data-r="crest"></div>` +
        `<div class="th-id">` +
          `<div class="th-name-row"><span class="th-name" data-r="name"></span><span class="th-lv" data-r="lv"></span><span class="th-pts-badge" data-r="pts" hidden></span></div>` +
        `</div>` +
      `</div>` +
      `<div class="th-gear">` +
        `<span class="th-gear-item th-weapon">${ICON_WEAPON}<span data-r="weaponTxt"></span></span>` +
        `<span class="th-gear-item th-armor">${ICON_ARMOR}<span data-r="armorTxt"></span></span>` +
      `</div>` +
      `<div class="th-vital" data-r="vital">` +
        `<div class="th-row-lbl"><span class="th-lbl">VIDA</span><span class="th-hp-num"><b data-r="hpNum"></b> <span data-r="hpMax"></span></span></div>` +
        `<progress class="th-bar th-hp" data-r="hpBar" max="100" value="100" aria-label="Vida"></progress>` +
        `<div class="th-xp-row"><progress class="th-bar th-xp" data-r="xpBar" max="100" value="0" aria-label="Experiencia"></progress><span class="th-xp-txt" data-r="xpTxt"></span></div>` +
      `</div>` +
      `<div class="th-econ">` +
        `<div class="th-stat th-stat-score"><span class="th-stat-k">${ICON_SCORE}PUNTOS</span><span class="th-stat-v"><span data-r="score">0</span><span class="th-mult" data-r="mult" hidden></span></span><span class="th-stat-sub" data-r="best"></span></div>` +
        `<div class="th-stat th-stat-mon"><span class="th-stat-k">${ICON_MON}MON</span><span class="th-stat-v" data-r="mon">0</span><span class="th-stat-sub">monedas</span></div>` +
        `<div class="th-stat th-stat-jade"><span class="th-stat-k">${ICON_JADE}JADE</span><span class="th-stat-v" data-r="jade">0</span><span class="th-stat-sub">sellos</span></div>` +
      `</div>` +
      `<div class="th-gain" data-r="gain" hidden></div>` +
    `</section>` +
    `<section class="th-card th-techs" aria-label="Técnicas">` +
      `<div class="th-slot" data-r="slot1"><kbd>P</kbd><span class="th-sname" data-r="slot1Name"></span><progress class="th-bar th-tbar" data-r="slot1Bar" max="100" value="0" aria-label="Técnica P"></progress><span class="th-sval" data-r="slot1Val"></span></div>` +
      `<div class="th-slot" data-r="slot2"><kbd>J</kbd><span class="th-sname" data-r="slot2Name"></span><progress class="th-bar th-tbar" data-r="slot2Bar" max="100" value="0" aria-label="Técnica J"></progress><span class="th-sval" data-r="slot2Val"></span></div>` +
      `<div class="th-slot" data-r="compSlot"><kbd>R</kbd><span class="th-sname" data-r="compName"></span><progress class="th-bar th-tbar" data-r="compBar" max="100" value="100" aria-label="Compañero 1"></progress><span class="th-sval" data-r="compVal"></span></div>` +
      `<div class="th-slot" data-r="compSlot2" hidden><kbd>R2</kbd><span class="th-sname" data-r="compName2"></span><progress class="th-bar th-tbar" data-r="compBar2" max="100" value="100" aria-label="Compañero 2"></progress><span class="th-sval" data-r="compVal2"></span></div>` +
      `<div class="th-slot" data-r="orbSlot"><kbd>Ñ</kbd><span class="th-sname" data-r="orbName"></span><div class="th-orbs">${Array.from({ length: MAX_RANGED_CHARGES }, () => '<i class="th-orb-dot"></i>').join('')}</div><span class="th-sval" data-r="orbVal"></span></div>` +
      `<div class="th-orb-sub" data-r="orbSub"><span>⇧Ñ cambiar elemento</span><progress class="th-bar th-tbar" data-r="orbBar" max="100" value="100" aria-label="Carga de orbe"></progress></div>` +
      `<div class="th-foot"><span class="th-dash" data-r="dash"><i></i><span data-r="dashTxt"></span></span><span class="th-flags"><span class="th-snare" data-r="snare" hidden>TELARAÑA</span><span class="th-mute" data-r="mute" hidden>SIN SONIDO</span></span></div>` +
    `</section>` +
    `<section class="th-card th-world" aria-label="Progreso del mundo">` +
      `<div class="th-meta" data-r="meta"></div>` +
      `<div class="th-ups" data-r="ups" hidden></div>` +
    `</section>` +
    `<section class="th-card th-mission" data-r="mission" hidden>` +
      `<div class="th-mtitle" data-r="mTitle"></div>` +
      `<progress class="th-bar th-mbar" data-r="mBar" max="1" value="0" aria-label="Progreso de liberación"></progress>` +
      `<div class="th-msub" data-r="mSub"></div>` +
    `</section>` +
    `<section class="th-card th-event" data-r="eventCard" hidden>` +
      `<div class="th-ev-row"><div class="th-ev-kanji" data-r="evKanji"></div><div class="th-ev-body"><div class="th-ev-title" data-r="evTitle"></div><div class="th-ev-boss" data-r="evBoss"></div><div class="th-ev-where" data-r="evWhere"></div></div></div>` +
    `</section>` +
    `<section class="th-card th-battle" data-r="battleCard" hidden>` +
      `<div><span class="th-bcombo" data-r="bCombo"></span><span class="th-bspirit" data-r="bSpirit"></span></div>` +
      `<span class="th-binfo" data-r="bInfo"></span>` +
    `</section>` +
    `<section class="th-card th-boss" data-r="bossCard" hidden>` +
      `<div class="th-boss-head"><span class="th-boss-name" data-r="bossName"></span><span class="th-boss-phase" data-r="bossPhase"></span></div>` +
      `<div class="th-boss-affix" data-r="bossAffix"></div>` +
      `<progress class="th-bar th-bhp" data-r="bossHp" max="100" value="100" aria-label="Vida del jefe"></progress>` +
      `<div class="th-stagger-row" data-r="bossStgRow"><span class="th-lbl">ATURDIR</span><progress class="th-bar th-bstg" data-r="bossStg" max="100" value="0" aria-label="Aturdimiento"></progress></div>` +
      `<div class="th-dazed" data-r="bossDazed" hidden>¡ ATURDIDO ! · VULNERABLE</div>` +
    `</section>`;
  const q = <T extends HTMLElement>(k: string) => hud.querySelector<T>(`[data-r="${k}"]`)!;
  return {
    crest: q('crest'), name: q('name'), lv: q('lv'), pts: q('pts'), weaponTxt: q('weaponTxt'), armorTxt: q('armorTxt'),
    vital: q('vital'), hpNum: q('hpNum'), hpMax: q('hpMax'), hpBar: q('hpBar'),
    xpBar: q('xpBar'), xpTxt: q('xpTxt'),
    score: q('score'), mult: q('mult'), best: q('best'), mon: q('mon'), jade: q('jade'), gain: q('gain'),
    slot1: q('slot1'), slot1Name: q('slot1Name'), slot1Bar: q('slot1Bar'), slot1Val: q('slot1Val'),
    slot2: q('slot2'), slot2Name: q('slot2Name'), slot2Bar: q('slot2Bar'), slot2Val: q('slot2Val'),
    compSlot: q('compSlot'), compName: q('compName'), compBar: q('compBar'), compVal: q('compVal'),
    compSlot2: q('compSlot2'), compName2: q('compName2'), compBar2: q('compBar2'), compVal2: q('compVal2'),
    orbSlot: q('orbSlot'), orbSub: q('orbSub'), orbName: q('orbName'), orbDots: [...hud.querySelectorAll<HTMLElement>('.th-orb-dot')],
    orbBar: q('orbBar'), orbVal: q('orbVal'),
    dash: q('dash'), dashTxt: q('dashTxt'), snare: q('snare'), mute: q('mute'),
    meta: q('meta'), ups: q('ups'),
    mission: q('mission'), mTitle: q('mTitle'), mBar: q('mBar'), mSub: q('mSub'),
    eventCard: q('eventCard'), evKanji: q('evKanji'), evTitle: q('evTitle'), evBoss: q('evBoss'), evWhere: q('evWhere'),
    battleCard: q('battleCard'), bCombo: q('bCombo'), bSpirit: q('bSpirit'), bInfo: q('bInfo'),
    bossCard: q('bossCard'), bossName: q('bossName'), bossPhase: q('bossPhase'), bossAffix: q('bossAffix'),
    bossHp: q('bossHp'), bossStgRow: q('bossStgRow'), bossStg: q('bossStg'), bossDazed: q('bossDazed')
  };
}

let msgTimer = 0;
export function showMsg(t: string, d = 1.8) { msgEl.textContent = t; msgEl.style.opacity = '1'; msgTimer = d; }
export function updateMsg(dt: number) {
  if (msgTimer > 0) { msgTimer -= dt; if (msgTimer <= 0) msgEl.style.opacity = '0'; }
  if (state.dead) promptEl.textContent = '';
}

function findTrackedFoe() {
  let foe: (typeof enemies)[number] | null = null, fd = 40;
  for (const e of enemies) {
    const def = KINDS[e.kind];
    if ((!def.boss && !def.elite) || e.state === 'idle' || e.state === 'return') continue;
    const d = Math.hypot(e.g.position.x - player.pos.x, e.g.position.z - player.pos.z);
    if (d >= 40 || (foe && KINDS[foe.kind].boss && !def.boss)) continue;
    if (d < fd || (def.boss && foe && !KINDS[foe.kind].boss)) { fd = d; foe = e; }
  }
  return foe;
}

function updateTHud() {
  if (!tRefs) tRefs = mountTHud();
  const r = tRefs;
  const lv = level(), free = freePoints(), xf = xpFrac();
  r.crest.textContent = cls().kanji;
  r.name.textContent = (look.name || cls().name).toUpperCase();
  r.lv.textContent = `NV. ${lv}`;
  r.pts.hidden = !free;
  if (free) r.pts.textContent = `+${free} U`;
  r.weaponTxt.textContent = weaponDisplayName(weapon());
  r.armorTxt.textContent = cls().garbName ?? armor().name;

  const hp = Math.max(0, Math.ceil(player.hp)), maxHp = Math.max(1, Math.round(player.maxHp));
  r.hpNum.textContent = String(hp);
  r.hpMax.textContent = `/ ${maxHp}`;
  r.hpBar.max = maxHp;
  r.hpBar.value = Math.min(maxHp, hp);
  r.vital.dataset.low = player.hp / maxHp < 0.3 ? '1' : '0';

  r.xpBar.max = 100;
  r.xpBar.value = lv >= MAX_LEVEL ? 100 : Math.floor(xf * 100);
  r.xpBar.dataset.max = lv >= MAX_LEVEL ? '1' : '0';
  r.xpTxt.textContent = lv >= MAX_LEVEL ? 'LEYENDA' : `XP ${Math.floor(xf * 100)}%`;

  r.score.textContent = fmt(state.score);
  r.mult.hidden = state.mult <= 1;
  if (state.mult > 1) r.mult.textContent = `×${state.mult}`;
  r.best.textContent = `récord ${fmt(state.best)}`;
  r.mon.textContent = fmt(state.mon);
  r.jade.textContent = fmt(state.jade);
  r.gain.hidden = state.gainT <= 0;
  if (state.gainT > 0) {
    r.gain.textContent = state.gain;
    r.gain.style.opacity = Math.min(1, state.gainT).toFixed(2);
  }

  const syncSlot = (slotEl: HTMLElement, nameEl: HTMLElement, barEl: HTMLProgressElement, valEl: HTMLElement, id: typeof state.technique, charge: number) => {
    const t = TECHNIQUES[id], hex = '#' + t.color.toString(16).padStart(6, '0'), ready = charge >= 1;
    slotEl.dataset.ready = ready ? '1' : '0';
    nameEl.textContent = t.short;
    nameEl.style.color = hex;
    barEl.value = Math.min(100, Math.floor(charge * 100));
    barEl.style.setProperty('--fill', ready ? 'linear-gradient(90deg,#e09f3e,#fff0b3)' : hex);
    valEl.textContent = ready ? 'LISTA' : `${Math.floor(charge * 100)}%`;
  };
  syncSlot(r.slot1, r.slot1Name, r.slot1Bar, r.slot1Val, state.technique, state.special);
  syncSlot(r.slot2, r.slot2Name, r.slot2Bar, r.slot2Val, state.technique2, state.special2);

  const comps = companionStatuses();
  const syncComp = (
    slotEl: HTMLElement, nameEl: HTMLElement, barEl: HTMLProgressElement, valEl: HTMLElement,
    comp: (typeof comps)[number] | undefined
  ) => {
    slotEl.hidden = !comp;
    if (!comp) return;
    const compHex = '#' + comp.def.color.toString(16).padStart(6, '0');
    nameEl.textContent = `${comp.def.kanji} ${comp.def.short}`;
    nameEl.style.color = compHex;
    if (comp.alive) {
      const pct = Math.max(0, Math.min(100, Math.round((comp.hp / Math.max(1, comp.maxHp)) * 100)));
      slotEl.dataset.ready = '0';
      barEl.value = pct;
      barEl.style.setProperty('--fill', pct > 50 ? 'linear-gradient(90deg,#3bc98b,#7cf5b5)' : pct > 25 ? '#ffc957' : '#ff4d40');
      valEl.textContent = `${comp.hp} HP`;
    } else {
      const ready = comp.charge >= 1;
      slotEl.dataset.ready = ready ? '1' : '0';
      barEl.value = Math.min(100, Math.floor(comp.charge * 100));
      barEl.style.setProperty('--fill', ready ? 'linear-gradient(90deg,#e09f3e,#fff0b3)' : compHex);
      valEl.textContent = ready ? 'LISTO' : `${Math.floor(comp.charge * 100)}%`;
    }
  };
  syncComp(r.compSlot, r.compName, r.compBar, r.compVal, comps[0]);
  syncComp(r.compSlot2, r.compName2, r.compBar2, r.compVal2, comps[1]);

  const orbEl = state.rangedElement;
  r.orbSlot.hidden = !orbEl;
  r.orbSub.hidden = !orbEl;
  if (orbEl) {
    const orb = ORB_INFO[orbEl], orbHex = '#' + orb.color.toString(16).padStart(6, '0');
    const orbFull = state.rangedCharges >= MAX_RANGED_CHARGES;
    r.orbSlot.dataset.ready = state.rangedCharges > 0 ? '1' : '0';
    r.orbName.textContent = `${orb.kanji} ${orb.short}`;
    r.orbName.style.color = orbHex;
    r.orbDots.forEach((dot, i) => {
      dot.classList.toggle('on', i < state.rangedCharges);
      dot.style.setProperty('--oc', orbHex);
    });
    r.orbVal.textContent = orbFull ? 'LISTA' : `${Math.floor(state.rangedCharge * 100)}%`;
    r.orbBar.value = orbFull ? 100 : Math.floor(state.rangedCharge * 100);
    r.orbBar.style.setProperty('--fill', orbHex);
  }

  const dashCd = player.dashCd > 0;
  r.dash.dataset.cd = dashCd ? '1' : '0';
  r.dashTxt.textContent = dashCd ? `Esquiva ${player.dashCd.toFixed(1)}s` : 'Esquiva lista';
  r.snare.hidden = player.snareT <= 0;
  r.mute.hidden = !sfx.muted;

  const lairs = camps.filter(c => !c.route && !c.temp && !c.wildlife), cleared = lairs.filter(c => !c.roster.length).length;
  const lib = liberatedCount();
  r.meta.innerHTML =
    `<span>Bajas <b>${state.kills}</b></span>` +
    `<span>Guaridas <b>${cleared}/${lairs.length}</b></span>` +
    `<span>Cofres <b>${state.chests}/${state.chests + chestsLeft()}</b></span>` +
    `<span>Lugares <b>${discovered.size}/${placeCount()}</b></span>` +
    `<span>Pueblos <b class="${lib.done ? 'jade' : ''}">${lib.done}/${lib.total}</b></span>` +
    `<span class="th-threat">${esc(threatLabel())}</span>`;
  const ups = upgradeList();
  r.ups.hidden = !ups;
  if (ups) r.ups.innerHTML = ups.split(' · ').map(u => `<span class="th-up">${esc(u)}</span>`).join('');

  const dng = dungeonStatus();
  const m = dng ? null : liberationStatus();
  r.mission.hidden = !dng && !m;
  if (dng) {
    r.mTitle.textContent = `MAZMORRA · ${dng.name.toUpperCase()}`;
    r.mBar.max = Math.max(1, dng.totalRooms);
    r.mBar.value = dng.clearedRooms;
    const bossTxt = dng.returnPortalOpen ? ' · Portal de regreso abierto' : ` · Jefe: ${dng.bossName}`;
    r.mSub.textContent = `${dng.zone} · Salas ${dng.clearedRooms}/${dng.totalRooms} · Cofres ${dng.openedChests}/${dng.totalChests}${bossTxt}`;
  } else if (m) {
    r.mTitle.textContent = `MISIÓN · LIBERAR ${m.name.toUpperCase()}`;
    r.mBar.max = Math.max(1, m.total);
    r.mBar.value = m.cleared;
    const bossTxt = m.liveBosses.length ? ` · Jefe${m.liveBosses.length > 1 ? 's' : ''}: ${m.liveBosses.join(', ')}` : ' · Jefes abatidos';
    r.mSub.textContent = `Zonas ${m.cleared}/${m.total} · ${m.remainingFoes} oni restantes${bossTxt}`;
  }

  const ev = activeWorldEvent();
  r.eventCard.hidden = !ev;
  if (ev) {
    r.eventCard.style.setProperty('--ev', ev.colorHex);
    r.evKanji.textContent = ev.kanji;
    r.evTitle.textContent = `EVENTO · ${ev.name.toUpperCase()}`;
    r.evBoss.textContent = ev.bossName;
    r.evWhere.textContent = ev.dist > 28 ? `${ev.compass} · ${ev.dist} m · sigue el pilar de luz` : '¡ EN COMBATE COLOSAL !';
  }

  const b = battleStatus();
  r.battleCard.hidden = !b;
  if (b) {
    r.bCombo.textContent = `COMBO ×${b.combo}`;
    r.bSpirit.textContent = b.spirit > 1 ? `ESPÍRITU +${Math.round((b.spirit - 1) * 100)}%` : '';
    r.bInfo.textContent = `bajas ${b.kills} · quedan ${b.left} · remates ${b.finishers}`;
  }

  const foe = findTrackedFoe();
  r.bossCard.hidden = !foe;
  if (foe) {
    const def = KINDS[foe.kind];
    r.bossName.textContent = def.name.toUpperCase();
    r.bossPhase.hidden = !def.boss;
    if (def.boss) r.bossPhase.textContent = `FASE ${foe.phase === 3 ? 'III' : foe.enraged ? 'II' : 'I'}`;
    const affix = affixLabel(foe);
    r.bossAffix.hidden = !affix;
    r.bossAffix.textContent = affix;
    r.bossHp.max = Math.max(1, foe.maxHp);
    r.bossHp.value = Math.max(0, foe.hp);
    const hasStagger = !!(foe.staggerNeed && foe.staggerNeed > 0);
    const dazed = (foe.dazedT ?? 0) > 0;
    r.bossStgRow.hidden = !hasStagger || dazed;
    r.bossDazed.hidden = !dazed;
    if (hasStagger && !dazed) {
      r.bossStg.max = foe.staggerNeed!;
      r.bossStg.value = Math.min(foe.staggerNeed!, foe.stagger ?? 0);
    }
  }
}

let hudT = 0;
export function updateHud(dt: number) {
  const modeChanged = lastAsciiMode !== state.asciiOn;
  hudT -= dt;
  if (!modeChanged && hudT > 0) return;
  hudT = 0.1;
  lastAsciiMode = state.asciiOn;
  promptEl.textContent = state.menu ? '' : state.prompt;

  if (!state.asciiOn) {
    updateTHud();
    return;
  }
  if (tRefs) {
    tRefs = null;
    delete hud.dataset.mode;
  }

  const n = Math.round(24 * player.maxHp / 100), f = Math.round(player.hp / player.maxHp * n);
  const bar = '#'.repeat(f) + '-'.repeat(n - f);
  const streak = state.mult > 1 ? `  <span class="r">x${state.mult}</span> <span class="d">${'·'.repeat(Math.ceil(state.streakT * 2))}</span>` : '';
  const gain = state.gainT > 0 ? `<span class="y" style="opacity:${Math.min(1, state.gainT).toFixed(2)}">${state.gain}</span>` : '';
  const lairs = camps.filter(c => !c.route && !c.temp && !c.wildlife), cleared = lairs.filter(c => !c.roster.length).length;
  const ups = upgradeList();
  // one line per technique slot: its name, its charge, and its key once full
  const slotLine = (id: typeof state.technique, charge: number, key: string) => {
    const t = TECHNIQUES[id], rf = Math.floor(charge * 12);
    return `<span class="d">${key}</span> <span style="color:#${t.color.toString(16).padStart(6, '0')}">${t.short.toUpperCase().padEnd(13)}</span>` + (charge >= 1
      ? `[<span class="y">${'#'.repeat(12)}</span>] <span class="y">lista</span>`
      : `[<span class="b">${'#'.repeat(rf)}</span>${'-'.repeat(12 - rf)}] <span class="d">${Math.floor(charge * 100)} %</span>`);
  };
  const orbEl = state.rangedElement;
  let rangedLine = '';
  if (orbEl) {
    const orb = ORB_INFO[orbEl];
    const orbHex = '#' + orb.color.toString(16).padStart(6, '0');
    const orbLabel = `${orb.kanji} ${orb.short.toUpperCase()}`.padEnd(13);
    const orbsStr = Array.from({ length: MAX_RANGED_CHARGES }, (_, i) => i < state.rangedCharges
      ? `<span style="color:${orbHex}">●</span>`
      : '<span class="d">○</span>').join(' ');
    const orbBar = state.rangedCharges >= MAX_RANGED_CHARGES
      ? '<span class="y">lista</span>'
      : `[<span style="color:${orbHex}">${'#'.repeat(Math.floor(state.rangedCharge * 6))}</span>${'-'.repeat(6 - Math.floor(state.rangedCharge * 6))}] <span class="d">${Math.floor(state.rangedCharge * 100)} %</span>`;
    rangedLine = `\n<span class="d">Ñ</span> <span style="color:${orbHex}">${orbLabel}</span>${orbsStr} ${orbBar} <span class="d">· ⇧Ñ</span>`;
  }
  const comps = companionStatuses();
  let compLine = '';
  for (const comp of comps) {
    const compHex = '#' + comp.def.color.toString(16).padStart(6, '0');
    const compLabel = `${comp.def.kanji} ${comp.def.short.toUpperCase()}`.padEnd(13);
    const keyLbl = comp.slot === 1 ? 'R' : 'R2';
    if (comp.alive) {
      const cf = Math.max(0, Math.round((comp.hp / Math.max(1, comp.maxHp)) * 12));
      compLine += `\n<span class="d">${keyLbl}</span> <span style="color:${compHex}">${compLabel}</span>[<span class="${cf < 4 ? 'r' : 'jade'}">${'#'.repeat(cf)}</span>${'-'.repeat(12 - cf)}] <span class="jade">${comp.hp} HP</span>`;
    } else {
      const cf = Math.floor(comp.charge * 12);
      compLine += `\n<span class="d">${keyLbl}</span> <span style="color:${compHex}">${compLabel}</span>` + (comp.charge >= 1
        ? `[<span class="y">${'#'.repeat(12)}</span>] <span class="y">listo</span>`
        : `[<span class="b">${'#'.repeat(cf)}</span>${'-'.repeat(12 - cf)}] <span class="d">${Math.floor(comp.charge * 100)} %</span>`);
    }
  }
  const special = `${slotLine(state.technique, state.special, 'P')}\n${slotLine(state.technique2, state.special2, 'J')}${compLine}${rangedLine}`;
  const foe = findTrackedFoe();
  const ff = foe ? Math.max(0, Math.ceil(foe.hp / foe.maxHp * 16)) : 0;
  const foeBar = foe
    ? `<span class="r">${KINDS[foe.kind].name.toUpperCase()}</span>${KINDS[foe.kind].boss ? ` · FASE ${foe.phase === 3 ? 'III' : foe.enraged ? 'II' : 'I'}` : ''}\n  [<span class="r">${'#'.repeat(ff)}</span>${'-'.repeat(16 - ff)}]\n${bossHud(foe)}`
    : '';
  // the level and the road to the next one (progression.ts); the bar glows for a moment after a level-up
  const xf = Math.floor(xpFrac() * 14), lv = level(), free = freePoints();
  const xpBar = lv >= MAX_LEVEL
    ? `[<span class="lv">${'#'.repeat(14)}</span>] <span class="lv">LEYENDA</span>`
    : `[<span class="xp">${'#'.repeat(xf)}</span>${'-'.repeat(14 - xf)}] <span class="d">${Math.floor(xpFrac() * 100)} %</span>`;
  const pts = free ? ` <span class="pts">+${free} U</span>` : '';
  const lib = liberatedCount();
  const towns = `PUEBLOS <span class="${lib.done ? 'jade' : 'd'}">${lib.done}/${lib.total}</span>`;
  hud.innerHTML =
    `<span class="r">${cls().kanji}</span> ${esc(look.name.toUpperCase() || cls().name.toUpperCase())}\n` +
    `<span class="lv">NIVEL ${lv}</span> ${xpBar}${pts}\n` +
    `VIDA  [<span class="${player.hp < 30 ? 'r' : 'y'}">${bar}</span>] ${Math.ceil(player.hp)}\n` +
    `${special}\n` +
    `PUNTOS <span class="y">${state.score}</span>${streak}   <span class="d">récord ${state.best}</span>\n` +
    `MON <span class="y">${state.mon}</span>   <span class="b">${weaponDisplayName(weapon())}</span>${state.armor !== 'kimono' ? ` · <span class="b">${armor().name}</span>` : ''}\n` +
    `SELLOS DE JADE <span class="jade">${state.jade}</span>\n` +
    `BAJAS ${state.kills}   GUARIDAS ${cleared}/${lairs.length}   <span class="y">${threatLabel()}</span>\n` +
    `COFRES ${state.chests}/${state.chests + chestsLeft()}   LUGARES ${discovered.size}/${placeCount()}   ${towns}\n` +
    (ups ? `<span class="y">${ups}</span>\n` : '') +
    (state.inDungeon ? dungeonHud() : liberationHud() + worldEventHud()) + battleLine() + foeBar +
    `${gain}\n` +
    `<span class="d">esquiva ${player.dashCd > 0 ? '·'.repeat(Math.ceil(player.dashCd * 8)) : 'lista'}${sfx.muted ? '  ·  sin sonido' : ''}</span>${player.snareT > 0 ? ' <span class="r">· telaraña</span>' : ''}`;
}

export function showDeathScreen() {
  document.exitPointerLock?.();
  overlay.querySelector('.k')!.textContent = '散';
  const record = state.score > 0 && state.score >= state.best ? ' · ¡ nuevo récord !' : ` · récord ${state.best}`;
  dispatchEvent(new Event('ronin:overlay'));   // class-select.ts refreshes the level under the class
  const lib = liberatedCount();
  const libTxt = lib.done ? ` · ${lib.done}/${lib.total} pueblos liberados` : '';
  overlay.querySelector('.sub')!.textContent = `nivel ${level()} · ${state.score} puntos · ${state.kills} bajas · ${state.campsCleared} guaridas · ${state.chests} cofres · ${discovered.size} lugares${libTxt}${record}`;
  document.getElementById('go')!.textContent = '▶ VOLVER A EMPEZAR';
  overlay.style.display = 'flex';
}
