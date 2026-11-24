// The class picker on the title (and death) screen: ronin or sōhei. Picking one re-arms and re-dresses the
// avatar at once, so the figure behind the title shows who you are about to play; the run itself starts
// with the usual reset (input.ts).
import { CLASSES, CLASS_IDS, cls, storeClass, type ClassId } from './classes';
import { loadLook } from './look';
import { resetWeapons } from './weapons';
import { dressUp } from './outfit';
import { resetSpecial } from './special';
import { TECHNIQUES } from './techniques';
import { player, state } from './state';

const pick = document.getElementById('class-pick')!;
const desc = document.getElementById('class-desc')!;
const startTech = document.getElementById('start-tech');
const customBtn = document.getElementById('custom-btn')!;

function render() {
  pick.innerHTML = CLASS_IDS.map(id => {
    const c = CLASSES[id], on = id === state.cls;
    return `<span class="cls${on ? ' on' : ''}" data-cls="${id}" role="radio" aria-checked="${on}" tabindex="0">[ ${c.kanji} ${c.name} ]</span>`;
  }).join('');
  desc.textContent = cls().desc;
  if (startTech) startTech.innerHTML = `empiezas con <b>${TECHNIQUES[cls().technique].name}</b>`;
  customBtn.textContent = `[ personalizar ${cls().name.toLowerCase()} ]`;
}

/** arm and dress the avatar as the stored class (on load, and after a pick) */
function outfitClass() {
  loadLook();
  resetWeapons();
  resetSpecial();
  player.maxHp = player.hp = cls().hp;
  dressUp();
  render();
}

export function chooseClass(id: ClassId) {
  if (state.playing && !state.dead) return;     // only between runs
  if (id === state.cls) return;
  storeClass(id);
  outfitClass();
}

pick.addEventListener('click', e => {
  e.stopPropagation();                           // a click on the overlay itself starts the run
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-cls]')?.dataset.cls;
  if (id && id in CLASSES) chooseClass(id as ClassId);
});
pick.addEventListener('keydown', e => {
  const id = (e.target as HTMLElement).dataset?.cls;
  if ((e.key === 'Enter' || e.key === ' ') && id && id in CLASSES) { e.preventDefault(); e.stopPropagation(); chooseClass(id as ClassId); }
});

outfitClass();
