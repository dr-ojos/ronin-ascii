// The class picker on the title (and death) screen: one card per class. Picking one re-arms and re-dresses the
// avatar at once, so the figure behind the title shows who you are about to play; the run itself starts
// with the usual reset (input.ts).
import { CLASSES, CLASS_IDS, cls, storeClass, type ClassId } from './classes';
import { loadLook } from './look';
import { resetWeapons } from './weapons';
import { resetArmor } from './armor';
import { dressUp } from './outfit';
import { resetSpecial } from './special';
import { TECHNIQUES } from './techniques';
import { player, state } from './state';
import { baseHp, level, loadProgress, xpFrac } from './progression';

const pick = document.getElementById('class-pick')!;
const desc = document.getElementById('class-desc')!;
const customBtn = document.getElementById('custom-btn')!;

/** the level each class has reached (progression.ts keeps one profile per class) */
function classLevel(id: ClassId) {
  if (id === state.cls) return level();
  try { return Math.max(1, Math.floor(Number(JSON.parse(localStorage.getItem(`ronin-ascii.progress.${id}`) || 'null')?.level) || 1)); } catch { return 1; }
}

function render() {
  pick.innerHTML = CLASS_IDS.map(id => {
    const c = CLASSES[id], on = id === state.cls;
    return `<button type="button" class="cls${on ? ' on' : ''}" data-cls="${id}" role="radio" aria-checked="${on}">` +
      `<span class="kj" aria-hidden="true">${c.kanji}</span><span class="nm">${c.name}</span><span class="lv">nivel ${classLevel(id)}</span></button>`;
  }).join('');
  desc.innerHTML = `${cls().desc}<br><span style="color:#ffd27a">nivel ${level()}</span> <span style="color:#6c7488">· ${Math.floor(xpFrac() * 100)} % al siguiente · empiezas con <b style="color:#e8e3d3">${TECHNIQUES[cls().technique].name}</b> (P) y <b style="color:#e8e3d3">${TECHNIQUES[cls().technique2].name}</b> (J)</span>`;
  customBtn.textContent = cls().fixedArmor ? `nombre de ${cls().name.toLowerCase()}` : `personalizar ${cls().name.toLowerCase()}`;
  dispatchEvent(new Event('ronin:class'));   // title.ts names the warrior beside the figure
}

/** arm and dress the avatar as the stored class (on load, and after a pick) */
function outfitClass() {
  loadProgress();
  loadLook();
  resetWeapons();
  resetSpecial();
  player.maxHp = player.hp = baseHp();
  resetArmor();
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
  const id = (e.target as HTMLElement).closest<HTMLElement>('[data-cls]')?.dataset.cls;
  if (!id || !(id in CLASSES)) return;
  chooseClass(id as ClassId);
  pick.querySelector<HTMLElement>('.on')?.focus();   // the cards are drawn again: keep the keyboard on the chosen one
});
outfitClass();
// the death screen shows again: the level may have grown during the run
addEventListener('ronin:overlay', render);
