// The (i) screen: the graphics quality, then every move and key in one list. Opened with the (i) button in a run, with H, or from the
// title screen (title.ts). It is a menu, so the fight pauses while it is open (game.ts).
import { closeMenu, openMenu, type MenuRow } from './menu';
import { state } from './state';
import { preset, quality, QUALITIES } from './quality';
import { setQuality } from './apply-quality';

const SECTIONS: [string, [string, string][]][] = [
  ['MOVIMIENTO', [
    ['Moverse', 'W A S D'],
    ['Correr', 'SHIFT'],
    ['Saltar', 'ESPACIO'],
    ['Esquivar', 'clic der. / V'],
    ['Acercar o alejar la cámara', 'rueda']
  ]],
  ['COMBATE', [
    ['Combo de tajos', 'clic / K'],
    ['Golpe fuerte', 'L'],
    ['Cambiar de arma', 'Q'],
    ['Usar la técnica cargada', 'P'],
    ['Cambiar de técnica', 'O']
  ]],
  ['MUNDO', [
    ['Hablar · abrir cofres', 'E'],
    ['Mapa grande', 'N'],
    ['Zoom del mapa', '+ / −']
  ]],
  ['TU GUERRERO', [
    ['Inventario', 'I'],
    ['Nivel y atributos', 'U'],
    ['Ajustes y esta ayuda', 'H / (i)']
  ]],
  ['VISTA Y SONIDO', [
    ['Modo foto', 'F'],
    ['Ver sin ASCII (3D)', 'T'],
    ['Letras del guerrero', 'G'],
    ['Paleta de colores', 'C'],
    ['Densidad de letras', '+ / −'],
    ['Lluvia', 'R'],
    ['Sonido', 'M']
  ]]
];

const TIPS = [
  'Los cofres dan mon y sellos de jade.',
  'Con los sellos aprendes técnicas en los templos ◆ del mapa.',
  'Masa, el armero del santuario, vende armas y armaduras.',
  'Cada baja da experiencia: sube hasta el nivel 100.'
];

/** ‹ Alta / Media / Baja ›: the next quality to the left or right (wraps around) */
function stepQuality(d: number) {
  const i = QUALITIES.indexOf(quality);
  setQuality(QUALITIES[(i + d + QUALITIES.length) % QUALITIES.length]);
}

function rows(): MenuRow[] {
  const r: MenuRow[] = [
    { label: 'AJUSTES', head: true },
    { label: 'Calidad gráfica', value: preset().name, cls: 'y', note: preset().note,
      left: () => stepQuality(-1), right: () => stepQuality(1), act: () => stepQuality(1) }
  ];
  for (const [head, keys] of SECTIONS) {
    r.push({ label: head, head: true });
    for (const [what, key] of keys) r.push({ label: what, value: key, cls: 'y' });
  }
  r.push({ label: 'CONSEJOS', head: true });
  for (const t of TIPS) r.push({ label: t });
  r.push({ label: 'Cerrar', act: closeMenu });
  return r;
}

export function toggleInfo(back?: () => void) {
  if (state.menu === 'info') return closeMenu();
  if (state.menu) return;
  infoButton.setAttribute('aria-expanded', 'true');
  openMenu({
    id: 'info', title: '— AJUSTES Y TECLAS —',
    sub: () => 'el juego queda en pausa mientras lees',
    rows, foot: '↑ ↓ mover · ← → cambiar · ESC / H cerrar',
    onClose() { infoButton.setAttribute('aria-expanded', 'false'); back?.(); }
  }, 1);
}

// the (i) button, beside the inventory and level buttons while a run is on
export const infoButton = document.createElement('button');
infoButton.type = 'button'; infoButton.id = 'info-btn'; infoButton.hidden = true;
infoButton.setAttribute('aria-label', 'Ajustes y teclas');
infoButton.setAttribute('aria-keyshortcuts', 'H');
infoButton.setAttribute('aria-haspopup', 'dialog');
infoButton.setAttribute('aria-expanded', 'false');
infoButton.innerHTML = '<span aria-hidden="true">i</span>';
document.body.appendChild(infoButton);
infoButton.addEventListener('click', e => { e.stopPropagation(); infoButton.blur(); toggleInfo(); });

export function updateInfoButton() {
  const hidden = !state.playing || state.dead || state.photo;
  if (infoButton.hidden !== hidden) infoButton.hidden = hidden;
}
