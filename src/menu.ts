// The keyboard and pointer menus drawn in HTML on top of the game.
// While one is open the fight is paused (game.ts) and input.ts sends the keys here first.
import { state, keys, type MenuId } from './state';

export interface MenuRow {
  label: string;
  /** a section title: drawn apart and skipped by the cursor */
  head?: boolean;
  /** right-hand value; with left/right it is drawn as ‹ value › */
  value?: string;
  /** a second, dimmer line under the row */
  note?: string;
  /** inventory thumbnail; the row's label already names the item */
  image?: string;
  /** css class for the value: y (gold), r (red), d (dim), b (blue) */
  cls?: string;
  sparkColors?: readonly number[];
  /** a text field instead of a value (the ronin's name) */
  input?: { value: string; max: number; set(v: string): void };
  act?(): void;
  preview?(): void;
  left?(): void;
  right?(): void;
}
export interface MenuDef {
  id: MenuId;
  title: string;
  /** line under the title (the purse, for the shop) */
  sub?(): string;
  rows(): MenuRow[];
  foot: string;
  onClose?(): void;
}

const el = document.getElementById('menu')!;
let cur: MenuDef | null = null, sel = 0, status = '', statusT = 0;

const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const scrolls = (id: MenuId) => id === 'shop' || id === 'inventory';

export function openMenu(def: MenuDef, at = 0) {
  cur = def; sel = at; status = ''; statusT = 0; state.menu = def.id;
  el.dataset.menu = def.id;
  document.body.dataset.menu = def.id;
  for (const k in keys) keys[k] = false;   // nobody keeps walking while the menu is open
  el.style.display = scrolls(def.id) ? 'flex' : 'block';
  if (def.id === 'inventory') {
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'inventory-title');
  }
  render(true);
}
export function closeMenu() {
  if (!cur) return;
  const d = cur; cur = null; state.menu = null; el.style.display = 'none';
  delete document.body.dataset.menu;
  if (d.id === 'inventory') {
    el.removeAttribute('role');
    el.removeAttribute('aria-modal');
    el.removeAttribute('aria-labelledby');
  }
  (document.activeElement as HTMLElement | null)?.blur?.();
  d.onClose?.();
}
/** a short line at the bottom of the menu ("te faltan 300 mon") */
export function menuStatus(t: string) { status = t; statusT = 2.5; render(); }
export function updateMenu(dt: number) { if (statusT > 0 && (statusT -= dt) <= 0) { status = ''; render(); } }

export function render(revealSelection = false) {
  if (!cur) return;
  const inventory = cur.id === 'inventory';
  const focusClose = inventory && !revealSelection && document.activeElement?.matches('.mclose');
  const scroll = el.querySelector<HTMLElement>('.mrows')?.scrollTop ?? 0;
  const rows = cur.rows();
  sel = Math.max(0, Math.min(rows.length - 1, sel));
  rows[sel]?.preview?.();
  el.innerHTML =
    (inventory
      ? `<div class="mheader"><h2 class="mt" id="inventory-title">${esc(cur.title)}</h2><button class="mclose" type="button" aria-label="Cerrar inventario">×</button></div>`
      : `<div class="mt">${esc(cur.title)}</div>`) +
    (cur.sub ? `<div class="ms">${cur.sub()}</div>` : '') +
    '<div class="mrows">' + rows.map((r, i) => {
      if (r.head) return `<div class="mh">${esc(r.label)}</div>`;
      const val = r.input
        ? `<input class="mi" maxlength="${r.input.max}" value="${esc(r.input.value)}" spellcheck="false">`
        : r.value !== undefined
          ? (r.left ? `<span class="ma" data-d="-1">‹</span> ` : '') + `<span class="${r.cls || ''}">${esc(r.value)}</span>` + (r.right ? ` <span class="ma" data-d="1">›</span>` : '')
          : '';
      const sparks = r.sparkColors ? `<span class="msparks" aria-hidden="true">${r.sparkColors.map(color => `<i style="color:#${color.toString(16).padStart(6, '0')}"></i>`).join('')}</span>` : '';
      const rowClass = `mr${i === sel ? ' on' : ''}`;
      const value = `<span class="mv">${val}</span>`;
      if (inventory) {
        const image = r.image ? `<img class="mthumb" src="${esc(r.image)}" alt="" width="144" height="144" loading="lazy" decoding="async">` : '';
        const label = `<span class="ml">${esc(r.label)}${sparks}</span>`;
        const content = `${image}${label}${value}${r.note ? `<span class="mn">${esc(r.note)}</span>` : ''}`;
        return r.act
          ? `<button class="${rowClass}" data-i="${i}" type="button">${content}</button>`
          : `<div class="${rowClass}">${content}</div>`;
      }
      return `<div class="${rowClass}" data-i="${i}">${value}<span class="ml">${i === sel ? '›' : ' '} ${esc(r.label)}${sparks}</span>` +
        (r.note ? `<div class="mn">${esc(r.note)}</div>` : '') + `</div>`;
    }).join('') + '</div>' +
    `<div class="mst">${esc(status)}</div><div class="mf">${esc(cur.foot)}</div>`;
  if (scrolls(cur.id)) {
    const list = el.querySelector<HTMLElement>('.mrows')!;
    list.scrollTop = scroll;
    if (revealSelection) list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
  if (inventory) el.querySelector<HTMLElement>(focusClose ? '.mclose' : '.mr.on')?.focus({ preventScroll: true });
  // the name field keeps focus while you type
  const input = el.querySelector<HTMLInputElement>('.mi');
  if (input) {
    const row = rows.find(r => r.input)!;
    input.addEventListener('input', () => row.input!.set(input.value));
    input.addEventListener('focus', () => { sel = rows.indexOf(row); el.querySelectorAll<HTMLElement>('.mr').forEach(n => n.classList.toggle('on', Number(n.dataset.i) === sel)); });
    if (rows[sel] === row) { input.focus(); input.setSelectionRange(input.value.length, input.value.length); }
  }
}

function move(d: number) {
  if (!cur) return;
  const rows = cur.rows(), n = rows.length;
  for (let k = 0; k < n; k++) { sel = (sel + d + n) % n; if (!rows[sel].head) break; }
  render(true);
}
function act(i = sel) { const r = cur?.rows()[i]; if (!r || r.head) return; sel = i; if (r.act) r.act(); else if (r.right) r.right(); render(); }
function side(d: number) { const r = cur?.rows()[sel]; if (!r) return; (d < 0 ? r.left : r.right)?.(); render(); }

/** input.ts asks first: true when the menu used the key */
export function menuKey(e: KeyboardEvent) {
  if (!cur) return false;
  const typing = (e.target as HTMLElement)?.tagName === 'INPUT';
  const c = e.code;
  if (c === 'Escape') { closeMenu(); e.preventDefault(); return true; }
  if (cur.id === 'inventory') {
    const previous = c === 'ArrowUp' || c === 'KeyW';
    const next = c === 'ArrowDown' || c === 'KeyS';
    const focused = document.activeElement;
    if (c === 'Tab' || previous || next) {
      const buttons = [...el.querySelectorAll<HTMLButtonElement>(c === 'Tab' ? 'button' : 'button[data-i]')];
      const i = buttons.indexOf(focused as HTMLButtonElement);
      const reverse = c === 'Tab' ? e.shiftKey : previous;
      const start = i < 0 && reverse ? 0 : i;
      buttons[(start + (reverse ? -1 : 1) + buttons.length) % buttons.length].focus();
      e.preventDefault();
    } else if (c === 'KeyE') {
      if (!e.repeat && focused instanceof HTMLButtonElement && el.contains(focused)) focused.click();
      e.preventDefault();
    } else if (e.repeat && (c === 'Enter' || c === 'Space')) e.preventDefault();
    return true;
  }
  if (c === 'ArrowUp' || (!typing && c === 'KeyW')) { move(-1); e.preventDefault(); return true; }
  if (c === 'ArrowDown' || (!typing && c === 'KeyS') || c === 'Tab') { move(e.shiftKey && c === 'Tab' ? -1 : 1); e.preventDefault(); return true; }
  if (typing) { if (c === 'Enter') move(1); return true; }
  if (c === 'ArrowLeft' || c === 'KeyA') { side(-1); return true; }
  if (c === 'ArrowRight' || c === 'KeyD') { side(1); return true; }
  if (c === 'Enter' || c === 'Space' || c === 'KeyE') { if (!e.repeat) act(); e.preventDefault(); return true; }
  return true;   // swallow everything else while a menu is open
}

el.addEventListener('mousedown', e => e.stopPropagation());
addEventListener('resize', () => {
  if (cur && scrolls(cur.id)) el.querySelector('.mr.on')?.scrollIntoView({ block: 'nearest' });
});
el.addEventListener('click', e => {
  e.stopPropagation();
  const t = e.target as HTMLElement;
  if (t.closest('.mclose')) return closeMenu();
  if (t.tagName === 'INPUT') return;
  const rowEl = t.closest<HTMLElement>('.mr[data-i]'); if (!rowEl) return;
  const i = Number(rowEl.dataset.i);
  if (t.classList.contains('ma')) { sel = i; side(Number(t.dataset.d)); return; }
  act(i);
});
el.addEventListener('focusin', e => {
  if (cur?.id !== 'inventory') return;
  const rowEl = (e.target as HTMLElement).closest<HTMLElement>('button[data-i]');
  if (!rowEl) return;
  sel = Number(rowEl.dataset.i);
  el.querySelector('.mr.on')?.classList.remove('on');
  rowEl.classList.add('on');
});
el.addEventListener('mousemove', e => {
  if (cur?.id === 'inventory') return;
  const rowEl = (e.target as HTMLElement).closest<HTMLElement>('.mr'); if (!rowEl) return;
  const i = Number(rowEl.dataset.i);
  if (i !== sel && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') { sel = i; render(); }
});
