// A small keyboard + mouse menu drawn in HTML on top of the game (the smith's shop, the ronin's look).
// While one is open the fight is paused (game.ts) and input.ts sends the keys here first.
import { state, keys } from './state';

export interface MenuRow {
  label: string;
  /** a section title: drawn apart and skipped by the cursor */
  head?: boolean;
  /** right-hand value; with left/right it is drawn as ‹ value › */
  value?: string;
  /** a second, dimmer line under the row */
  note?: string;
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
  id: 'shop' | 'custom';
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

export function openMenu(def: MenuDef, at = 0) {
  cur = def; sel = at; status = ''; state.menu = def.id;
  el.dataset.menu = def.id;
  document.body.dataset.menu = def.id;
  for (const k in keys) keys[k] = false;   // nobody keeps walking while the menu is open
  el.style.display = def.id === 'shop' ? 'flex' : 'block';
  render(true);
}
export function closeMenu() {
  if (!cur) return;
  const d = cur; cur = null; state.menu = null; el.style.display = 'none';
  delete document.body.dataset.menu;
  (document.activeElement as HTMLElement | null)?.blur?.();
  d.onClose?.();
}
/** a short line at the bottom of the menu ("te faltan 300 mon") */
export function menuStatus(t: string) { status = t; statusT = 2.5; render(); }
export function updateMenu(dt: number) { if (statusT > 0 && (statusT -= dt) <= 0) { status = ''; render(); } }

export function render(revealSelection = false) {
  if (!cur) return;
  const scroll = el.querySelector<HTMLElement>('.mrows')?.scrollTop ?? 0;
  const rows = cur.rows();
  sel = Math.max(0, Math.min(rows.length - 1, sel));
  rows[sel]?.preview?.();
  el.innerHTML =
    `<div class="mt">${esc(cur.title)}</div>` +
    (cur.sub ? `<div class="ms">${cur.sub()}</div>` : '') +
    '<div class="mrows">' + rows.map((r, i) => {
      if (r.head) return `<div class="mh">${esc(r.label)}</div>`;
      const val = r.input
        ? `<input class="mi" maxlength="${r.input.max}" value="${esc(r.input.value)}" spellcheck="false">`
        : r.value !== undefined
          ? (r.left ? `<span class="ma" data-d="-1">‹</span> ` : '') + `<span class="${r.cls || ''}">${esc(r.value)}</span>` + (r.right ? ` <span class="ma" data-d="1">›</span>` : '')
          : '';
      const sparks = r.sparkColors ? `<span class="msparks" aria-hidden="true">${r.sparkColors.map(color => `<i style="color:#${color.toString(16).padStart(6, '0')}"></i>`).join('')}</span>` : '';
      return `<div class="mr${i === sel ? ' on' : ''}" data-i="${i}"><span class="mv">${val}</span><span class="ml">${i === sel ? '›' : ' '} ${esc(r.label)}${sparks}</span>` +
        (r.note ? `<div class="mn">${esc(r.note)}</div>` : '') + `</div>`;
    }).join('') + '</div>' +
    `<div class="mst">${esc(status)}</div><div class="mf">${esc(cur.foot)}</div>`;
  if (cur.id === 'shop') {
    const list = el.querySelector<HTMLElement>('.mrows')!;
    list.scrollTop = scroll;
    if (revealSelection) list.querySelector('.on')?.scrollIntoView({ block: 'nearest' });
  }
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
  if (cur?.id === 'shop') el.querySelector('.mr.on')?.scrollIntoView({ block: 'nearest' });
});
el.addEventListener('click', e => {
  e.stopPropagation();
  const t = e.target as HTMLElement;
  if (t.tagName === 'INPUT') return;
  const rowEl = t.closest<HTMLElement>('.mr'); if (!rowEl) return;
  const i = Number(rowEl.dataset.i);
  if (t.classList.contains('ma')) { sel = i; side(Number(t.dataset.d)); return; }
  act(i);
});
el.addEventListener('mousemove', e => {
  const rowEl = (e.target as HTMLElement).closest<HTMLElement>('.mr'); if (!rowEl) return;
  const i = Number(rowEl.dataset.i);
  if (i !== sel && (document.activeElement as HTMLElement)?.tagName !== 'INPUT') { sel = i; render(); }
});
