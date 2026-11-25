// U: the level menu. Spend the attribute points each level gives, see the skills the road has opened (and the
// ones still ahead), and the legendary gear Masa keeps for the seasoned. A button by the inventory's opens it
// too, and glows while there are points to spend.
import { closeMenu, menuStatus, openMenu, render, type MenuRow } from './menu';
import { sfx } from './sfx';
import { state } from './state';
import { WEAPONS } from './weapons';
import { ARMORS } from './armor';
import { canWield } from './classes';
import { TECHNIQUES, type TechniqueId } from './techniques';
import {
  freePoints, LEVEL_REQ, level, MAX_LEVEL, PERKS, respec, respecCost, spendPoint, stat, STAT_CAP, STAT_IDS, STATS,
  totalXp, xp, xpFrac, xpNeed, hasPerk, critChance, secondWindIn,
  MAX_RANK, rank, rankCost, rankCharge, rankPower, ROMAN, upgradeTechnique
} from './progression';

const btn = document.createElement('button');
btn.type = 'button'; btn.id = 'level-btn';
btn.setAttribute('aria-keyshortcuts', 'U'); btn.hidden = true;
document.getElementById('inventory-btn')!.after(btn);

const meter = (n: number) => '■'.repeat(Math.round(n / STAT_CAP * 10)).padEnd(10, '·');
const num = (n: number) => n.toLocaleString('es-ES');
let confirmRespec = false;
const pctUp = (k: number) => `+${Math.round((k - 1) * 100)} %`;

/** one row per technique you know: its rank, what it gives, and the price of the next (also in the inventory) */
export function techniqueRows(image?: (id: TechniqueId) => string): MenuRow[] {
  const free = freePoints();
  const r: MenuRow[] = [{ label: `MEJORAR TÉCNICAS · ${free} ${free === 1 ? 'PUNTO' : 'PUNTOS'}`, head: true }];
  for (const id of state.learnedTechniques) {
    const t = TECHNIQUES[id], k = rank(id), top = k >= MAX_RANK, cost = rankCost(k);
    const now = k > 1 ? `daño ${pctUp(rankPower(k))} · carga ${pctUp(rankCharge(k))}` : 'rango base';
    const next = top ? 'rango máximo' : `siguiente (${ROMAN[k + 1]}): daño ${pctUp(rankPower(k + 1))} · carga ${pctUp(rankCharge(k + 1))}`;
    const upgrade = () => {
      const res = upgradeTechnique(id);
      if (res === 'max') return menuStatus(`${t.name} ya está en el rango ${ROMAN[MAX_RANK]}.`);
      if (res === 'none') { sfx.warn(); return menuStatus(`Necesitas ${cost} puntos (tienes ${freePoints()}). Sube de nivel.`); }
      sfx.chime(false); menuStatus(`${t.name} · rango ${ROMAN[rank(id)]}`);
    };
    r.push({
      label: `${t.name} · ${ROMAN[k]}`, image: image?.(id),
      value: top ? 'máximo' : `mejorar · ${cost} pts`, cls: top ? 'y' : free >= cost ? 'y' : 'd',
      note: `${'◆'.repeat(k)}${'◇'.repeat(MAX_RANK - k)} ${now} · ${next}${state.technique === id ? ' · equipada' : ''}`,
      act: upgrade, right: upgrade
    });
  }
  return r;
}

function rows(): MenuRow[] {
  const free = freePoints();
  const r: MenuRow[] = [{ label: free ? `ATRIBUTOS · ${free} ${free === 1 ? 'PUNTO LIBRE' : 'PUNTOS LIBRES'}` : 'ATRIBUTOS · 1 PUNTO CADA UNO', head: true }];
  for (const id of STAT_IDS) {
    const s = STATS[id], n = stat(id), full = n >= STAT_CAP;
    const add = () => {
      const res = spendPoint(id);
      if (res === 'none') { sfx.warn(); return menuStatus('Sin puntos libres: sube de nivel para ganar más.'); }
      if (res === 'max') { sfx.warn(); return menuStatus(`${s.name} ya está al máximo (${STAT_CAP}).`); }
      sfx.coin(); menuStatus(`${s.kanji} ${s.name} ${stat(id)} · ${s.effect(stat(id))}`);
    };
    r.push({
      label: `${s.kanji}  ${s.name}`, value: `${meter(n)} ${String(n).padStart(2)}`, cls: full ? 'y' : free ? 'y' : 'b',
      note: `${n ? s.effect(n) : 'sin entrenar'}${full ? ' · al máximo' : ` · siguiente punto: ${s.per}`}`,
      act: add, right: add
    });
  }
  r.push(...techniqueRows());
  r.push({ label: 'HABILIDADES DE NIVEL', head: true });
  for (const p of PERKS) {
    const on = hasPerk(p.id);
    let note = p.desc;
    if (on && p.id === 'aliento') note += secondWindIn() > 0 ? ` · listo en ${Math.ceil(secondWindIn())} s` : ' · listo';
    r.push({ label: `${on ? '★' : '·'} ${p.name}`, value: on ? 'activa' : `nivel ${p.level}`, cls: on ? 'y' : 'd', note });
  }
  r.push({ label: 'ARSENAL DE LEYENDA · TIENDA DE MASA', head: true });
  const gear = Object.entries(LEVEL_REQ)
    .map(([id, lv]) => ({ id, lv, w: WEAPONS.find(w => w.id === id), a: ARMORS.find(a => a.id === id) }))
    .filter(g => g.a || (g.w && canWield(g.w)))
    .sort((a, b) => a.lv - b.lv);
  for (const g of gear) {
    const open = level() >= g.lv, item = (g.w ?? g.a)!;
    r.push({
      label: `${g.lv >= 40 ? '✦' : '·'} ${item.name}`, value: open ? 'disponible' : `nivel ${g.lv}`, cls: open ? 'y' : 'd',
      note: `${g.w ? 'arma' : 'armadura'} · ${num(item.price)} mon · ${item.desc}`
    });
  }
  r.push({ label: 'OTROS', head: true });
  r.push({
    label: 'Redistribuir los puntos', value: `${num(respecCost())} mon`, cls: state.mon >= respecCost() ? '' : 'r',
    note: confirmRespec ? 'pulsa otra vez para confirmar' : 'devuelve los puntos de atributos y técnicas para repartirlos de nuevo',
    act() {
      if (!confirmRespec) { confirmRespec = true; sfx.warn(); return menuStatus('¿Seguro? Pulsa otra vez para redistribuir.'); }
      confirmRespec = false;
      const res = respec();
      if (res === 'empty') return menuStatus('No has repartido ningún punto todavía.');
      if (res === 'poor') { sfx.warn(); return menuStatus(`Te faltan ${num(respecCost() - state.mon)} mon.`); }
      sfx.chime(true); menuStatus('Puntos devueltos: repártelos de nuevo.');
    }
  });
  r.push({ label: 'Cerrar', act: closeMenu });
  return r;
}

function sub() {
  const lv = level(), f = Math.floor(xpFrac() * 24);
  const bar = `[<span class="y">${'#'.repeat(f)}</span>${'-'.repeat(24 - f)}]`;
  const road = lv >= MAX_LEVEL ? '<span class="y">LEYENDA</span>' : `${num(xp())} / ${num(xpNeed())} xp`;
  return `<span class="y" style="font-size:18px;letter-spacing:.12em">NIVEL ${lv}</span>  ${bar}<br>${road}` +
    ` · <span class="d">total ${num(totalXp())} xp · crítico ${Math.round(critChance() * 100)} %</span> · <span class="y">${num(state.mon)} mon</span>`;
}

export function toggleLevelMenu() {
  if (state.menu === 'level') return closeMenu();
  if (!state.playing || state.dead || state.photo || state.menu) return;
  confirmRespec = false;
  btn.setAttribute('aria-expanded', 'true');
  openMenu({
    id: 'level', title: '— CAMINO DEL GUERRERO —', sub, rows,
    foot: '↑ ↓ elegir · E / ENTER / → mejorar · U / ESC cerrar',
    onClose() { btn.setAttribute('aria-expanded', 'false'); }
  }, 1);
}

// the button: shown while playing, with the free points as a glowing badge
let shown = '';
function updateButton() {
  requestAnimationFrame(updateButton);
  const hidden = !state.playing || state.dead || state.photo;
  if (btn.hidden !== hidden) btn.hidden = hidden;
  const free = freePoints(), key = `${level()}|${free}`;
  if (key === shown) return;
  shown = key;
  btn.innerHTML = `<kbd aria-hidden="true">U</kbd> Nivel ${level()}${free ? ` <b>+${free}</b>` : ''}`;
  btn.classList.toggle('ready', free > 0);
  btn.setAttribute('aria-label', `Nivel ${level()}${free ? `, ${free} puntos sin asignar` : ''}`);
  if (state.menu === 'level') render();
}
updateButton();
btn.addEventListener('mousedown', e => e.stopPropagation());
btn.addEventListener('click', e => { e.stopPropagation(); toggleLevelMenu(); });
