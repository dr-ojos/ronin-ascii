import { ARMORS, armorStats, ownsArmor, wearArmor } from './armor';
import { closeMenu, menuStatus, openMenu, type MenuRow } from './menu';
import { dressUp } from './outfit';
import { sfx } from './sfx';
import { state } from './state';
import { TECHNIQUES } from './techniques';
import { UPGRADES, lvl, roman, type UpgradeId } from './upgrades';
import { WEAPONS, equip, owns, weaponStats } from './weapons';

export const inventoryButton = document.querySelector<HTMLButtonElement>('#inventory-btn')!;
const ownedWeapons = () => WEAPONS.filter(w => owns(w.id));
const itemImage = (group: string, id: string) => `${import.meta.env.BASE_URL}inventory/${group}/${id}.webp`;

function inventoryRows(): MenuRow[] {
  const rows: MenuRow[] = [{ label: 'ARMAS', head: true }];
  for (const w of ownedWeapons()) {
    const equipped = state.weapon === w.id;
    rows.push({
      label: w.name, value: equipped ? 'equipada' : 'equipar', cls: equipped ? 'y' : 'b',
      image: itemImage('armas', w.id),
      note: `${w.desc} · ${weaponStats(w)}`,
      act() {
        if (equipped) return menuStatus('Ya llevas esta arma.');
        equip(w.id);
        sfx.swing({ power: 0.8, pan: 0 });
        menuStatus(`Arma equipada · ${w.name}`);
      }
    });
  }
  rows.push({ label: 'ARMADURAS', head: true });
  for (const a of ARMORS.filter(a => ownsArmor(a.id))) {
    const equipped = state.armor === a.id;
    rows.push({
      label: a.name, value: equipped ? 'puesta' : 'ponerse', cls: equipped ? 'y' : 'b',
      image: itemImage('armaduras', a.id),
      note: `${a.desc} · ${armorStats(a)}`,
      act() {
        if (equipped) return menuStatus('Ya llevas esta prenda.');
        wearArmor(a.id);
        dressUp();
        sfx.dash();
        menuStatus(`Vestimenta equipada · ${a.name}`);
      }
    });
  }
  rows.push({ label: 'TÉCNICAS', head: true });
  for (const id of state.learnedTechniques) {
    const move = TECHNIQUES[id], equipped = state.technique === id;
    rows.push({
      label: move.name, value: equipped ? 'equipada' : 'equipar', cls: equipped ? 'y' : 'b',
      image: itemImage('tecnicas', id),
      note: move.description,
      act() {
        if (!equipped) {
          state.technique = id;
          sfx.chime(false);
        }
        menuStatus('Pulsa P cuando se llene la carga.');
      }
    });
  }
  const upgrades = (Object.keys(UPGRADES) as UpgradeId[]).filter(id => lvl(id) > 0);
  if (upgrades.length) rows.push({ label: 'MEJORAS PASIVAS', head: true });
  for (const id of upgrades) {
    const { name, desc } = UPGRADES[id];
    rows.push({ label: name, value: `Nivel ${roman(lvl(id))}`, cls: 'y', note: desc, image: itemImage('mejoras', id) });
  }
  return rows;
}

export function updateInventoryButton() {
  const hidden = !state.playing || state.dead || state.photo;
  if (inventoryButton.hidden !== hidden) inventoryButton.hidden = hidden;
}

export function toggleInventory(restoreFocus = false) {
  if (state.menu === 'inventory') return closeMenu();
  if (!state.playing || state.dead || state.photo || state.menu) return;
  inventoryButton.setAttribute('aria-expanded', 'true');
  openMenu({
    id: 'inventory', title: 'INVENTARIO', rows: inventoryRows,
    sub: () => `<span class="y">${state.mon} mon</span> · <span class="b">${state.jade} ${state.jade === 1 ? 'sello' : 'sellos'} de jade</span>`,
    foot: '↑ ↓ elegir · E / ENTER equipar · I / ESC cerrar',
    onClose() {
      inventoryButton.setAttribute('aria-expanded', 'false');
      if (restoreFocus) inventoryButton.focus();
    }
  }, 1 + Math.max(0, ownedWeapons().findIndex(w => w.id === state.weapon)));
}

inventoryButton.addEventListener('click', e => toggleInventory(e.detail === 0));
