import { showMsg } from './hud';
import { closeMenu, menuStatus, openMenu } from './menu';
import { sfx } from './sfx';
import { player, state } from './state';
import { TECHNIQUES, type TempleTechniqueId } from './techniques';
import { templeMasters } from './temple-grounds';
import { angDiff } from './utils';

const TALK_RANGE = 2.8;
const jadeLabel = (n: number) => `${n} ${n === 1 ? 'sello' : 'sellos'} de jade`;

export function updateTemples(dt: number) {
  for (const { temple, figure, x, z } of templeMasters) {
    const dx = player.pos.x - x, dz = player.pos.z - z, distance = Math.hypot(dx, dz);
    if (distance > 12) continue;
    const heading = distance < 5 ? Math.atan2(dx, dz) - temple.facing : 0;
    figure.rotation.y += angDiff(heading, figure.rotation.y) * Math.min(1, dt * 7);
    if (distance < TALK_RANGE) state.prompt = `[ E ] aprender técnicas con ${temple.master}`;
  }
}

function lessonRow(id: TempleTechniqueId) {
  const move = TECHNIQUES[id], learned = state.learnedTechniques.includes(id), equipped = state.technique === id;
  return {
    label: move.name,
    value: equipped ? 'equipada' : learned ? 'equipar' : jadeLabel(move.cost),
    cls: equipped ? 'y' : learned ? 'b' : state.jade < move.cost ? 'r' : 'y',
    note: move.description,
    act() {
      if (equipped) return menuStatus('Pulsa P cuando se llene la carga.');
      if (!learned && state.jade < move.cost) {
        sfx.warn(); return menuStatus(`Te faltan ${jadeLabel(move.cost - state.jade)}. Búscalos en cofres.`);
      }
      if (!learned) {
        state.jade -= move.cost;
        state.learnedTechniques.push(id);
      }
      state.technique = id;
      sfx.chime(!learned);
      menuStatus(learned ? 'Técnica equipada · P para usarla' : 'Técnica aprendida · P para usarla · O para cambiar');
    },
  };
}

export function tryTalkTemple() {
  if (!state.playing || state.dead || state.menu || state.photo) return false;
  const nearby = templeMasters.find(({ x, z }) => Math.hypot(player.pos.x - x, player.pos.z - z) < TALK_RANGE);
  if (!nearby) return false;
  const { temple } = nearby;
  showMsg('', 0.01);
  openMenu({
    id: 'temple', title: temple.name,
    sub: () => `${temple.master} · <span class="y">${jadeLabel(state.jade)}</span>`,
    foot: '↑ ↓ elegir · E / ENTER confirmar · ESC salir',
    rows: () => [lessonRow(temple.technique), ...(temple.lesson ? [lessonRow(temple.lesson)] : []), {
        label: 'Despedirse',
        note: 'Los sellos de jade se encuentran en cofres del mundo.',
        act: closeMenu,
    }],
  });
  return true;
}
