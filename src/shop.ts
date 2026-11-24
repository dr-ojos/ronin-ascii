// Masa's shop, inside the shrine at the start (world.ts hollows it out and gives it a door): a counter,
// a rack of blades, armour on stands, a lantern, a sign by the steps. Masa hammers at his anvil and turns
// to you when you come to the counter. Press E there: he sells the blades of weapons.ts and the armour
// of armor.ts for mon, and lets you restyle your ronin (custom.ts). The roof hides while you are inside.
import * as THREE from 'three';
import { scene } from './renderer';
import { ACTOR_LAYER } from './ascii';
import { M, CLS, tagMat, tagTree, shadowTree } from './materials';
import { addCollider } from './physics';
import { addLight } from './lights';
import { shrineRoof } from './world';
import { MT } from './structures';
import { sparkBurst } from './katana-fx';
import { sfx, panOf } from './sfx';
import { showMsg } from './hud';
import { openMenu, closeMenu, menuStatus, type MenuRow } from './menu';
import { openCustom } from './custom';
import { dressUp } from './outfit';
import { createSmith } from './smith';
import { SHOP_FLOOR as FY, shopRoninPos, shopStageActive, smithPos } from './shop-stage';
import { forSale, weapon, owns, buy, equip, applyWeapon, weaponStats } from './weapons';
import { cls } from './classes';
import { ARMORS, armor, ownsArmor, buyArmor, wearArmor, armorStats } from './armor';
import { player, state } from './state';
import { threatLabel } from './equipment-threat';
import { level, levelOk, levelReq } from './progression';
import { angDiff } from './utils';

export { smithPos } from './shop-stage';

export const SMITH_NAME = 'Masa';
/** the shrine's room (world coordinates) and the height of its boards */
const ROOM = { x0: -3.95, x1: 3.95, z0: -26.6, z1: -21.6 };
const TALK_R = 2.6;
const inRoom = (x: number, z: number) => x > ROOM.x0 && x < ROOM.x1 && z > ROOM.z0 && z < ROOM.z1;

// ------------------------------------------------------------ the room
const W = {
  wood: MT.woodL, dark: MT.wood,
  steel: tagMat(M(0xdfe6ee, { metalness: 0.9, roughness: 0.2, emissive: 0x3a4a5a, emissiveIntensity: 0.6 }), CLS.light),
  black: tagMat(M(0x16141a, { roughness: 0.4 }), CLS.wood), gold: tagMat(M(0xffd060, { emissive: 0xb07a10, emissiveIntensity: 1.2, metalness: 0.7 }), CLS.light),
  cord: tagMat(M(0xb3261e, { roughness: 0.7 }), CLS.wood), paper: tagMat(M(0xf2eee0, { roughness: 1, side: THREE.DoubleSide, emissive: 0x2a1a10 }), CLS.wood),
  chochin: tagMat(M(0xff6a2a, { emissive: 0xff5a1a, emissiveIntensity: 2.2 }), CLS.light),
  noren: tagMat(M(0x1c2a4a, { roughness: 1, side: THREE.DoubleSide }), CLS.wood)
};
const room = new THREE.Group();
const B = (p: THREE.Object3D, w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number, ry = 0) => {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); o.position.set(x, y + h / 2, z); o.rotation.y = ry; p.add(o); return o;
};
const C = (p: THREE.Object3D, r: number, h: number, m: THREE.Material, x: number, y: number, z: number) => {
  const o = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 10), m); o.position.set(x, y + h / 2, z); p.add(o); return o;
};
// counter, with a blade laid out on a cloth
B(room, 3.8, 0.95, 0.6, W.wood, 0, FY, -25.0); B(room, 4.0, 0.07, 0.75, W.dark, 0, FY + 0.95, -25.0);
B(room, 1.6, 0.01, 0.4, W.cord, -0.6, FY + 1.02, -25.0); B(room, 1.2, 0.03, 0.05, W.steel, -0.55, FY + 1.03, -25.0); B(room, 0.28, 0.05, 0.06, W.black, -1.3, FY + 1.03, -25.0);
addCollider({ seg: [-1.9, -25.0, 1.9, -25.0], r: 0.35 });
// the rack on the back wall: blades of every length, and two spears
const rackX = 1.29;
const rackSteel = tagMat(M(0x9299a1, { metalness: 0.69, roughness: 0.44, emissive: 0x343137, emissiveIntensity: 0.22 }), CLS.wood);
for (let i = 0; i < 4; i++) {
  const hy = FY + 0.9 + i * 0.42, len = 0.9 + i * 0.3;
  B(room, len, 0.04, 0.03, rackSteel, rackX, hy, -26.38);
  B(room, 0.32, 0.06, 0.05, W.black, rackX - len / 2 - 0.16, hy - 0.01, -26.38);
  B(room, 0.03, 0.12, 0.09, W.cord, rackX - len / 2, hy - 0.04, -26.38);
}
for (const x of [rackX - 0.36, rackX + 0.36]) B(room, 0.07, 1.4, 0.1, W.dark, x, FY + 0.85, -26.48);
for (const x of [-3.0, 3.1]) { C(room, 0.025, 2.4, W.dark, x, FY, -26.3); const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 4), W.steel); tip.position.set(x, FY + 2.55, -26.3); room.add(tip); }
// the smith's anvil, to his right
C(room, 0.28, 0.55, W.dark, 1.25, FY, -25.85); B(room, 0.6, 0.18, 0.28, W.black, 1.25, FY + 0.55, -25.85); B(room, 0.3, 0.1, 0.2, W.black, 1.25, FY + 0.48, -25.85);
const hotMat = tagMat(M(0xff8a3a, { emissive: 0xff5a10, emissiveIntensity: 2.2 }), CLS.light);
const hot = B(room, 0.5, 0.02, 0.05, hotMat, 1.25, FY + 0.73, -25.85);
// armour on stands along the side walls, the kind he sells
function stand(x: number, z: number, ry: number, lac: number, trim: number, horns: boolean) {
  const g = new THREE.Group(); g.position.set(x, FY, z); g.rotation.y = ry; room.add(g);
  const lacM = tagMat(M(lac, { roughness: 0.35, metalness: 0.15 }), CLS.wood), trimM = tagMat(M(trim, { roughness: 0.6 }), CLS.wood);
  C(g, 0.04, 1.1, W.dark, 0, 0, 0); B(g, 0.7, 0.06, 0.06, W.dark, 0, 1.2, 0);
  const cuirass = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.22, 0.5, 12), lacM); cuirass.position.y = 1.05; cuirass.scale.z = 0.75; g.add(cuirass);
  for (let k = 0; k < 3; k++) B(g, 0.5 - k * 0.02, 0.025, 0.38, trimM, 0, 0.85 + k * 0.14, 0);
  for (const s of [-1, 1]) { const sode = B(g, 0.2, 0.32, 0.26, lacM, s * 0.38, 1.0, 0); sode.rotation.z = s * 0.25; }
  for (let k = 0; k < 5; k++) { const kz = B(g, 0.11, 0.3, 0.03, lacM, (k - 2) * 0.1, 0.5, 0.17); kz.rotation.x = -0.15; }
  const kabuto = new THREE.Mesh(new THREE.SphereGeometry(0.17, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), lacM); kabuto.position.y = 1.4; g.add(kabuto);
  const shikoro = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.25, 0.12, 14, 1, true), lacM); shikoro.position.y = 1.36; g.add(shikoro);
  if (horns) for (const s of [-1, 1]) { const h = B(g, 0.03, 0.3, 0.02, W.gold, s * 0.08, 1.45, 0.16); h.rotation.z = -s * 0.45; }
  else B(g, 0.06, 0.1, 0.02, W.gold, 0, 1.47, 0.17);
  addCollider({ x, z, r: 0.42 });
}
stand(-3.25, -22.6, Math.PI / 2, 0x5a3e28, 0x2a1a10, false);      // ashigaru
stand(-3.25, -24.3, Math.PI / 2, 0xe8e4dc, 0xb3261e, false);      // fox
stand(3.25, -22.6, -Math.PI / 2, 0x141216, 0xb3261e, true);       // lacquered
stand(3.25, -24.3, -Math.PI / 2, 0x22336e, 0xffd060, true);       // the general's
// hanging lantern, and the noren over the door
{
  const lan = new THREE.Mesh(new THREE.SphereGeometry(0.28, 14, 10), W.chochin); lan.scale.y = 1.3; lan.position.set(-2.4, FY + 2.15, -25.7); room.add(lan);
  C(room, 0.01, 0.35, W.dark, -2.4, FY + 2.5, -25.7);
  addLight({ x: -1.5, y: FY + 2.0, z: -24.2, color: 0xffa050, intensity: 7, distance: 9, decay: 1.3 });
  addLight({ x: 1.25, y: FY + 1.0, z: -25.6, color: 0xff7a2a, intensity: 3, distance: 4, decay: 1.5, flicker: 0.6 });
  for (const s of [-1, 1]) { const n = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 0.55), W.noren); n.position.set(s * 0.88, FY + 2.0, -21.5); room.add(n); }
}
// a signboard at the foot of the steps
{
  const c = document.createElement('canvas'); c.width = 128; c.height = 256;
  const x = c.getContext('2d')!;
  x.fillStyle = '#e8e0cc'; x.fillRect(0, 0, 128, 256); x.fillStyle = '#16141a';
  x.font = 'bold 84px serif'; x.textAlign = 'center'; x.fillText('武', 64, 96); x.fillText('具', 64, 190);
  x.font = 'bold 15px monospace'; x.fillText('ARMAS', 64, 220); x.fillText('Y ARMADURAS', 64, 240);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Group(); sign.position.set(2.3, 0, -18.7); sign.rotation.y = -0.25; room.add(sign);
  for (const s of [-1, 1]) C(sign, 0.04, 1.7, W.dark, s * 0.32, 0, 0);
  const board = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 1.1), tagMat(new THREE.MeshStandardMaterial({ map: t, roughness: 1, side: THREE.DoubleSide }), CLS.wood));
  board.position.set(0, 1.0, 0.05); sign.add(board);
  B(sign, 0.8, 0.06, 0.12, W.dark, 0, 1.58, 0);
  addCollider({ x: 2.3, z: -18.7, r: 0.4 });
}
shadowTree(room); hot.castShadow = false;
scene.add(room);

// ------------------------------------------------------------ Masa
const { root: smith, body, head, armR, armL, elbowR, elbowL } = createSmith();
smith.position.copy(smithPos);
shadowTree(smith);
smith.traverse(o => { if ((o as THREE.Mesh).isMesh) o.layers.enable(ACTOR_LAYER); });
tagTree(smith, CLS.actor);
scene.add(smith);

const ANVIL_FACE = Math.atan2(1.25, 0);   // he turns to the anvil (to his right) to hammer
let face = 0, beat = 0, greeted = false;
const anvil = new THREE.Vector3(1.25, FY + 0.78, -25.85);
/** every frame while playing: hammer, or turn to you at the counter; the roof; the "press E" hint */
export function updateShop(dt: number) {
  state.indoors = inRoom(player.pos.x, player.pos.z);
  shrineRoof.visible = !state.indoors;
  const dx = player.pos.x - smithPos.x, dz = player.pos.z - smithPos.z, d = Math.hypot(dx, dz);
  const vis = d < 160; smith.visible = room.visible = vis;
  if (!vis) return;
  const trading = shopStageActive(), near = trading || d < 3.8;
  const target = trading ? shopRoninPos : player.pos;
  const facing = near ? Math.atan2(target.x - smithPos.x, target.z - smithPos.z) : ANVIL_FACE;
  face += angDiff(facing, face) * (1 - Math.exp(-5 * dt));
  smith.rotation.y = face;
  const t = state.time;
  head.rotation.y = THREE.MathUtils.damp(head.rotation.y, THREE.MathUtils.clamp(angDiff(facing, face), -0.55, 0.55), 13, dt);
  // he works in bouts (seven strokes, then a breath), so the clearing isn't one long clang
  const working = !near && t % 9 < 5.6;
  if (!working) {
    armR.rotation.x = THREE.MathUtils.damp(armR.rotation.x, near ? -0.12 : -0.24, 8, dt);
    elbowR.rotation.x = THREE.MathUtils.damp(elbowR.rotation.x, near ? -0.29 : -0.12, 9, dt);
    head.rotation.x = THREE.MathUtils.damp(head.rotation.x, near ? -0.016 + 0.032 * Math.sin(t * 1.3) : 0.12, 7, dt);
    beat = 0;
  } else {
    // a slow lift, a quick fall onto the anvil; sparks and a clang at every strike
    const ph = (t * 1.25) % 1, k = ph < 0.7 ? Math.sin(ph / 0.7 * Math.PI / 2) : 1 - Math.pow((ph - 0.7) / 0.3, 2);
    armR.rotation.x = -0.46 - 1.22 * k;
    elbowR.rotation.x = -0.12 - 0.61 * k;
    head.rotation.x = THREE.MathUtils.damp(head.rotation.x, 0.28 - 0.14 * k, 9, dt);
    if (ph < beat) {
      if (d < 60) sparkBurst(anvil, 10, 3.5);
      sfx.anvil(panOf(anvil.x, anvil.z), 0.7 * Math.max(0, 1 - d / 28));
    }
    beat = ph;
  }
  armL.rotation.x = -0.20 + Math.sin(t * 0.8) * 0.032;
  elbowL.rotation.x = -0.27 + Math.sin(t * 1.2) * 0.042;
  body.position.y = Math.sin(t * 2) * 0.007;
  hotMat.emissiveIntensity = 1.8 + Math.sin(t * 5) * 0.4;
  if (d < TALK_R && !state.dead && !state.prompt) state.prompt = `[ E ] hablar con ${SMITH_NAME}: armas y armaduras`;
  if (state.indoors && !greeted) { greeted = true; showMsg(`${SMITH_NAME}, el armero:\n«¿Buscas acero, ${cls().address}?»`, 2.4); }
  if (d > 30) greeted = false;
}

// ------------------------------------------------------------ the shop
const price = (n: number, mine: boolean, on: boolean, word: string) => on ? word : mine ? (word === 'equipada' ? 'equipar' : 'ponerse') : `${n} mon`;
/** gear above your level (progression.ts): shown, previewed, but not sold */
const locked = (id: string, mine: boolean) => !mine && !levelOk(id);
const lockNote = (id: string) => `requiere nivel ${levelReq(id)} (tienes ${level()}) · `;
const legend = (id: string) => levelReq(id) >= 40 ? '✦ ' : '';
function refuse(id: string) {
  sfx.warn();
  menuStatus(`«Esta pieza pide más camino, ${cls().address}.» · nivel ${levelReq(id)}`);
}
function restoreGear() { applyWeapon(); dressUp(); }
function shopRows(): MenuRow[] {
  const rows: MenuRow[] = [{ label: 'ARMAS', head: true }];
  for (const w of forSale()) {
    const mine = owns(w.id), on = state.weapon === w.id, shut = locked(w.id, mine);
    rows.push({
      label: legend(w.id) + w.name, value: shut ? `nivel ${levelReq(w.id)}` : price(w.price, mine, on, 'equipada'),
      cls: on ? 'y' : mine ? 'b' : shut ? 'd' : state.mon >= w.price ? '' : 'r',
      sparkColors: w.fx.sparks,
      note: `${shut ? lockNote(w.id) + `${w.price} mon · ` : ''}${w.desc} · ${weaponStats(w)}`,
      preview() { applyWeapon(w); dressUp(); },
      act() {
        if (on) return menuStatus('ya la llevas en la mano');
        if (shut) return refuse(w.id);
        if (mine) { equip(w.id); sfx.swing({ power: 0.8, pan: 0 }); return menuStatus(`${w.form === 'staff' ? 'empuñas' : 'desenvainas'} ${w.name}`); }
        if (buy(w) === 'poor') { sfx.warn(); return menuStatus(`te faltan ${w.price - state.mon} mon`); }
        sfx.chime(true); menuStatus(`«Que te sirva bien.» · ${w.name} es tuya`);
      }
    });
  }
  rows.push({ label: 'ARMADURAS', head: true });
  for (const a of ARMORS) {
    const mine = ownsArmor(a.id), on = state.armor === a.id, shut = locked(a.id, mine);
    rows.push({
      label: legend(a.id) + a.name, value: shut ? `nivel ${levelReq(a.id)}` : price(a.price, mine, on, 'puesta'),
      cls: on ? 'y' : mine ? 'b' : shut ? 'd' : state.mon >= a.price ? '' : 'r',
      note: `${shut ? lockNote(a.id) + `${a.price} mon · ` : ''}${a.desc} · ${armorStats(a)}`,
      preview() { dressUp(a); applyWeapon(); },
      act() {
        if (on) return menuStatus('ya la llevas puesta');
        if (shut) return refuse(a.id);
        if (mine) { wearArmor(a.id); dressUp(); sfx.dash(); return menuStatus(`te pones ${a.name}`); }
        if (buyArmor(a) === 'poor') { sfx.warn(); return menuStatus(`te faltan ${a.price - state.mon} mon`); }
        dressUp();
        sfx.chime(true); menuStatus(`«Te queda como hecha a medida.» · ${a.name}`);
      }
    });
  }
  rows.push({ label: 'OTROS', head: true });
  rows.push({
    label: 'Cambiar de aspecto', note: 'nombre, lacado, kimono, bufanda, sombrero y máscara', preview: restoreGear,
    act() { restoreGear(); openCustom(() => openShop(rows.length - 2)); }
  });
  rows.push({ label: 'Despedirse', preview: restoreGear, act: closeMenu });
  return rows;
}
export function openShop(at = 1) {
  showMsg('', 0.01);
  openMenu({
    id: 'shop', title: `— TIENDA DE ${SMITH_NAME.toUpperCase()} —`,
    sub: () => `nivel <span class="y">${level()}</span> · bolsa <span class="y">${state.mon} mon</span> · <span class="b">${weapon().name}</span> · <span class="b">${armor().name}</span> · <span class="y">${threatLabel()}</span>`,
    rows: shopRows,
    foot: '↑ ↓ previsualizar · E / ENTER comprar o equipar · ESC salir',
    onClose: restoreGear
  }, at);
}
/** E pressed: talk to Masa if you are at his counter (true when you were) */
export function tryTalk() {
  if (!state.playing || state.dead || state.menu) return false;
  if (Math.hypot(player.pos.x - smithPos.x, player.pos.z - smithPos.z) > TALK_R) return false;
  // start on the first thing you could buy now, else on the first you don't have
  const rows = shopRows();
  let at = rows.findIndex(r => !r.head && /mon$/.test(r.value || '') && state.mon >= parseInt(r.value!));
  if (at < 0) at = rows.findIndex(r => !r.head && /mon$/.test(r.value || ''));
  openShop(at < 0 ? 1 : at);
  return true;
}
