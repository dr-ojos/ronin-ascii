import { showMsg } from './hud';
import { closeMenu, menuStatus, openMenu } from './menu';
import { sfx } from './sfx';
import { player, state } from './state';
import { KINDS } from './enemies';
import type { TemplePlace } from './map';
import { equipTechnique, SLOT_KEY, slotOf, TECHNIQUES, type Slot, type TempleTechniqueId } from './techniques';
import { MAX_RANGED_CHARGES, ORB_INFO, type OrbElement } from './elemental-orb';
import { templeMasters } from './temple-grounds';
import { animateTempleMonk } from './temple-monks';
import { angDiff } from './utils';
import { saveVault } from './vault';

const TALK_RANGE = 2.8;
const jadeLabel = (n: number) => `${n} ${n === 1 ? 'sello' : 'sellos'} de jade`;
let monkClock = 0;

export function updateTemples(dt: number) {
  monkClock += dt;
  for (const { temple, figure, rig, x, z } of templeMasters) {
    const dx = player.pos.x - x, dz = player.pos.z - z, distance = Math.hypot(dx, dz);
    if (distance > 32) continue;
    const heading = distance < 6.5 ? Math.atan2(dx, dz) - temple.facing : 0;
    const turnDiff = angDiff(heading, figure.rotation.y);
    figure.rotation.y += turnDiff * Math.min(1, dt * 5.5);
    const nearFactor = Math.max(0, 1 - distance / 6.5);
    animateTempleMonk(rig, monkClock, distance < 10 ? angDiff(Math.atan2(dx, dz) - temple.facing, figure.rotation.y) : 0, nearFactor);
    if (distance < TALK_RANGE) state.prompt = `[ E ] aprender técnicas con ${temple.master}`;
  }
}

function lessonRow(id: TempleTechniqueId, temple: TemplePlace) {
  const move = TECHNIQUES[id], learned = state.learnedTechniques.includes(id), slot = slotOf(id);
  // a technique without a price in jade is won by beating the temple's guardian
  const cost = 'cost' in move ? move.cost : 0, trial = !cost && temple.guardian;
  return {
    label: move.name,
    value: slot ? `en ${SLOT_KEY[slot]} · cambiar` : learned ? 'equipar en P' : trial ? 'vence al guardián' : jadeLabel(cost),
    cls: slot ? 'y' : learned ? 'b' : trial || state.jade < cost ? 'r' : 'y',
    note: move.description,
    act() {
      if (!learned && trial) {
        sfx.warn(); return menuStatus(`${KINDS[trial].name} custodia el patio. Derrótalo y ${move.name} será tuya.`);
      }
      if (!learned && state.jade < cost) {
        sfx.warn(); return menuStatus(`Te faltan ${jadeLabel(cost - state.jade)}. Búscalos en cofres.`);
      }
      if (!learned) {
        state.jade -= cost;
        state.learnedTechniques.push(id);
        saveVault();
      }
      // E again moves it between the two slots
      const to: Slot = slot === 1 ? 2 : 1;
      equipTechnique(id, to);
      sfx.chime(!learned);
      menuStatus(`${learned ? 'Técnica equipada' : 'Técnica aprendida'} en ${SLOT_KEY[to]} · pulsa ${SLOT_KEY[to]} cuando se llene la carga · E otra vez para cambiarla de tecla`);
    },
  };
}

function orbRow(el: OrbElement) {
  const orb = ORB_INFO[el], learned = state.learnedOrbs.includes(el), active = state.rangedElement === el;
  return {
    label: `Ñ · ${orb.kanji} ${orb.name}`,
    value: active ? 'en Ñ · activa' : learned ? 'equipar en Ñ' : jadeLabel(orb.cost),
    cls: active ? 'y' : learned ? 'b' : state.jade < orb.cost ? 'r' : 'y',
    note: orb.desc,
    act() {
      if (!learned && state.jade < orb.cost) {
        sfx.warn(); return menuStatus(`Te faltan ${jadeLabel(orb.cost - state.jade)}. Búscalos en cofres.`);
      }
      const first = !state.rangedElement;
      if (!learned) {
        state.jade -= orb.cost;
        state.learnedOrbs.push(el);
        saveVault();
      }
      state.rangedElement = el;
      if (first) { state.rangedCharges = MAX_RANGED_CHARGES; state.rangedCharge = 0; }
      sfx.chime(!learned);
      menuStatus(`${learned ? 'Orbe equipado' : 'Orbe aprendido'} en Ñ · pulsa Ñ para cargar y lanzar · ⇧Ñ cambia de elemento`);
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
    rows: () => [
      lessonRow(temple.technique, temple),
      ...(temple.lessons ?? []).map(id => lessonRow(id, temple)),
      ...(temple.monkLesson && state.cls === 'sohei' ? [lessonRow(temple.monkLesson, temple)] : []),
      orbRow(temple.orb),
      {
        label: 'Despedirse',
        note: temple.guardian
          ? (temple.technique === 'rayo' ? 'El rayo se gana en combate; el resto se aprende con sellos de jade.' : 'Vence al guardián del patio para ganar su técnica principal, o aprende con sellos de jade.')
          : 'Los sellos de jade se encuentran en cofres del mundo.',
        act: closeMenu,
    }],
  });
  return true;
}
