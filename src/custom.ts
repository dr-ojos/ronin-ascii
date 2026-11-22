// The ronin's look: a menu to pick the name and the colours of each part (look.ts holds the choices).
// Opened from the title screen or from the smith's shop. The camera comes close and circles the
// samurai while it is open (camera.ts), and every change shows at once.
import { openMenu, closeMenu, menuStatus, type MenuRow } from './menu';
import { look, LOOK_OPTIONS, LOOK_LABELS, opt, cycleLook, randomLook, saveLook, type LookPart } from './look';
import { dressUp } from './outfit';
import { overlay } from './hud';
import { state } from './state';

function rows(): MenuRow[] {
  const r: MenuRow[] = [{
    label: 'Nombre',
    input: { value: look.name, max: 16, set(v) { look.name = v; saveLook(); } }
  }];
  for (const k of Object.keys(LOOK_OPTIONS) as LookPart[]) {
    const step = (d: number) => () => { cycleLook(k, d); dressUp(); };
    r.push({ label: LOOK_LABELS[k], value: opt(k).name, cls: 'y', left: step(-1), right: step(1), act: step(1) });
  }
  r.push({ label: 'Al azar', note: 'un ronin cualquiera de los caminos', act() { randomLook(); dressUp(); menuStatus('¿ así ?'); } });
  r.push({ label: 'Listo', act: closeMenu });
  return r;
}

/** opens the look menu; `back` runs when it closes (the shop reopens itself) */
export function openCustom(back?: () => void) {
  openMenu({
    id: 'custom', title: '— TU RONIN —',
    sub: () => 'así te verán los onis antes de caer',
    rows,
    foot: '↑ ↓ elegir · ← → cambiar · ESC listo',
    onClose() { if (!look.name.trim()) { look.name = 'Ronin'; saveLook(); } back?.(); }
  }, 1);
}

// the button on the title screen
document.getElementById('custom-btn')!.addEventListener('click', e => {
  e.stopPropagation();
  if (state.menu) return;
  overlay.style.display = 'none';
  openCustom(() => { overlay.style.display = 'flex'; });
});
