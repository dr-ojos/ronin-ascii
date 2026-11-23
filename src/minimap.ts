// The world drawn in characters: a minimap in the corner (follows the player) and a full map (N).
// Both are rendered once from the world data into offscreen canvases; each frame only copies a window
// of them and stamps the samurai and the oni on top. Also announces each place as you walk into it
// (the first time, it counts as discovered and gives points).
import { HALF, SIZE, WORLD_R, PLACES, ROADS, RIVER, TORII_PATH, BRIDGES, biomeAt, groundAt, treeBlocked, type Place } from './map';
import { groundY } from './terrain';
import { enemies, KINDS } from './enemies';
import { showMsg } from './hud';
import { discovered, camps } from './encounters';
import { POIS } from './landmarks';
import { chests } from './loot';
import { smithPos } from './shop';
import type { Camp } from './types';
import { addPoints, POINTS } from './score';
import { player, state } from './state';

const FONT = '"Courier New", Courier, monospace';
const COL = {
  grass: '#2c4a3a', contour: '#3d5e4c', water: '#4f86c6', road: '#b59d72', built: '#d8d4c8', sakura: '#f2a5c4',
  pine: '#4f8a5a', cypress: '#3a6e48', bamboo: '#8fbf5a', rock: '#7a7f8c', snow: '#c9d2e6', place: '#ffd27a', you: '#ffffff', oni: '#ff5a4a'
};
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
/** one map character for a point of the world */
function classify(x: number, z: number, step: number): [string, string] {
  const r = Math.hypot(x, z), h = groundY(x, z);
  if (r > WORLD_R + 8) return h > 85 ? ['^', COL.snow] : [h > 40 ? '^' : 'n', COL.rock];
  const [road, water, built] = groundAt(x, z);
  if (water > 120) return ['~', COL.water];
  if (built > 120) return ['#', COL.built];
  if (road > 120) return ['=', COL.road];
  if (!treeBlocked(x, z) && r > 52) {
    const b = biomeAt(x, z);
    if (hash(x, z) < b.density * 0.8) {
      const tot = b.sakura + b.pine + b.cypress + b.bamboo; let w = hash(z, x) * tot;
      if ((w -= b.sakura) < 0) return ['*', COL.sakura];
      if ((w -= b.pine) < 0) return ['A', COL.pine];
      if ((w -= b.cypress) < 0) return ['!', COL.cypress];
      return ['|', COL.bamboo];
    }
  }
  // contour lines every 4 m of height
  const band = Math.floor(h / 4);
  if (Math.floor(groundY(x + step, z) / 4) !== band || Math.floor(groundY(x, z + step) / 4) !== band) return ['.', COL.contour];
  return hash(z * 3, x * 7) < 0.12 ? ['"', COL.grass] : [' ', COL.grass];
}
interface Atlas { c: HTMLCanvasElement; cols: number; rows: number; cw: number; ch: number; mx: number; mz: number }
function renderAtlas(cols: number, rows: number, cw: number, ch: number, labels: boolean): Atlas {
  const c = document.createElement('canvas'); c.width = cols * cw; c.height = rows * ch;
  const x = c.getContext('2d')!;
  x.fillStyle = '#05060a'; x.fillRect(0, 0, c.width, c.height);
  x.font = `bold ${ch}px ${FONT}`; x.textBaseline = 'top'; x.textAlign = 'left';
  const mx = SIZE / cols, mz = SIZE / rows, byColor = new Map<string, [string, number, number][]>();
  const grid: [string, string][] = [];
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) grid.push(classify(-HALF + (i + 0.5) * mx, -HALF + (j + 0.5) * mz, Math.max(mx, mz)));
  // thin features drawn along their path, so they never fall between two samples
  const along = (pts: [number, number][], cell: [string, string]) => {
    for (const [x, z] of pts) { const i = Math.floor((x + HALF) / mx), j = Math.floor((z + HALF) / mz); if (i >= 0 && j >= 0 && i < cols && j < rows) grid[j * cols + i] = cell; }
  };
  along(RIVER.pts, ['~', COL.water]);
  for (const r of ROADS) along(r.pts, r === TORII_PATH ? ['n', '#ff6a4a'] : ['=', COL.road]);
  along(BRIDGES.map(b => [b.x, b.z]), ['H', '#ff6a4a']);
  grid.forEach(([g, col], k) => {
    if (g === ' ') return;
    let l = byColor.get(col); if (!l) byColor.set(col, l = []); l.push([g, (k % cols) * cw, Math.floor(k / cols) * ch]);
  });
  for (const [col, l] of byColor) { x.fillStyle = col; for (const [g, px, py] of l) x.fillText(g, px, py); }
  // places: their glyph, and their name on the big map
  x.fillStyle = COL.place;
  for (const p of PLACES) {
    const px = (p.x + HALF) / mx * cw, py = (p.z + HALF) / mz * ch;
    x.font = `bold ${Math.round(ch * 1.4)}px ${FONT}`; x.fillText(p.glyph, px - cw * 0.6, py - ch * 0.7);
    if (labels) { x.font = `bold ${Math.round(ch * 0.95)}px ${FONT}`; x.fillText(p.name.toLowerCase(), px + cw * 1.2, py - ch * 0.4); }
  }
  return { c, cols, rows, cw, ch, mx, mz };
}

// ------------------------------------------------------------ minimap (always on, top right)
const mini = document.getElementById('minimap') as HTMLCanvasElement;
const miniX = mini.getContext('2d')!;
const zone = document.getElementById('zone')!;
const MINI = renderAtlas(Math.round(SIZE / 5), Math.round(SIZE / 8.333), 6, 10, false);   // 5 m per column, 8.3 m per row
let big: Atlas | null = null;
const bigEl = document.getElementById('bigmap') as HTMLCanvasElement;
const bigX = bigEl.getContext('2d')!;

const arrow = () => { const a = ((player.face % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2), k = Math.round(a / (Math.PI / 2)) % 4; return ['v', '>', '^', '<'][k]; };
function stamp(ctx: CanvasRenderingContext2D, a: Atlas, ox: number, oy: number, s: number, isBig = false) {
  const toPx = (x: number, z: number): [number, number] => [ox + (x + HALF) / a.mx * a.cw * s, oy + (z + HALF) / a.mz * a.ch * s];
  ctx.font = `bold ${Math.round(a.ch * 1.2 * Math.max(1, s))}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const near = (x: number, z: number, r: number) => isBig || Math.hypot(x - player.pos.x, z - player.pos.z) < r;
  const seenChests = new Set<unknown>(); if (isBig) for (const c of seen) if (c.chest) seenChests.add(c.chest);
  // corners you have found, camps you have seen (red while guarded), chests nearby (gold, dim while sealed)
  ctx.fillStyle = COL.place;
  POIS.forEach((p, i) => { if (discovered.has('poi' + i) && near(p.x, p.z, 400)) { const [px, py] = toPx(p.x, p.z); ctx.fillText(p.glyph, px, py); } });
  for (const c of camps) {
    if (c.route || c.temp || !seen.has(c) || !near(c.x, c.z, 260)) continue;
    const [px, py] = toPx(c.x, c.z);
    ctx.fillStyle = c.roster.length ? '#c0483a' : '#5c6478'; ctx.fillText(c.roster.length ? (c.boss ? 'X' : c.elite ? '!' : 'x') : '.', px, py);
  }
  for (const c of chests) {
    if (c.state === 'open' || !near(c.x, c.z, c.kind === 'oculto' ? 45 : 140)) continue;
    if (isBig && c.kind === 'oculto' && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 45) continue;
    // in a world this big, the full map only shows the chests of lairs you have found (and those around you)
    if (isBig && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) > 300 && !seenChests.has(c)) continue;
    const [px, py] = toPx(c.x, c.z);
    ctx.fillStyle = c.kind === 'guardian' ? (c.state === 'sealed' ? '#7a5a9a' : '#d0a0ff') : c.state === 'sealed' ? '#8a7440' : '#ffd060'; ctx.fillText('$', px, py);
  }
  // Masa's shop, in the shrine at the start
  if (near(smithPos.x, smithPos.z, 400)) { const [sx, sy] = toPx(smithPos.x, smithPos.z); ctx.fillStyle = '#8fb4ff'; ctx.fillText('†', sx, sy); }
  ctx.fillStyle = COL.oni;
  for (const e of enemies) { const [px, py] = toPx(e.g.position.x, e.g.position.z); ctx.fillText(KINDS[e.kind].glyph, px, py); }
  const [px, py] = toPx(player.pos.x, player.pos.z);
  ctx.fillStyle = '#000'; ctx.fillRect(px - 5, py - 6, 10, 12);
  ctx.fillStyle = COL.you; ctx.fillText(state.time % 1 < 0.75 ? arrow() : '@', px, py);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
}
let t = 0, lastPlace: Place | null = null, placeT = 1.5;
/** heading the minimap is turned to: follows the camera, but holds still while photo mode orbits it */
let mapYaw = 0;
/** camps you have come close to (shown on the maps from then on) */
const seen = new Set<Camp>();
export function updateMinimap(dt: number) {
  t -= dt; placeT -= dt;
  if (t > 0) return; t = 0.1;
  // where am I? (smallest named place that contains the player)
  let here: Place | null = null;
  for (const p of PLACES) if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < p.r && (!here || p.r < here.r)) here = p;
  if (here !== lastPlace) {
    if (here && state.playing && !state.dead && !discovered.has(here.id)) {
      discovered.add(here.id); addPoints(POINTS.place, 'lugar descubierto');
      showMsg(`— ${here.name} —\n+${POINTS.place} lugar descubierto`, 2.6);
    } else if (here && placeT <= 0 && state.playing) showMsg(`— ${here.name} —`, 2.4);
    lastPlace = here; placeT = 0;
  }
  zone.textContent = here ? here.name.toLowerCase() : 'tierras salvajes';
  if (!state.playing) seen.clear();
  for (const c of camps) if (!seen.has(c) && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 140) seen.add(c);
  // the corners of the wilds count as discovered when you walk up to them
  POIS.forEach((p, i) => {
    if (state.playing && !state.dead && !discovered.has('poi' + i) && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 11) {
      discovered.add('poi' + i); addPoints(POINTS.corner, 'rincón descubierto');
      showMsg(`— ${p.name.toUpperCase()} —\n+${POINTS.corner}`, 2);
    }
  });
  // minimap window around the player, turned with the camera so "up" is always straight ahead
  if (!state.photo) mapYaw = state.yaw;
  const W = mini.width, H = mini.height, D = Math.ceil(Math.hypot(W, H));
  const cx = (player.pos.x + HALF) / MINI.mx * MINI.cw, cy = (player.pos.z + HALF) / MINI.mz * MINI.ch;
  miniX.fillStyle = '#05060a'; miniX.fillRect(0, 0, W, H);
  miniX.save(); miniX.translate(W / 2, H / 2); miniX.rotate(mapYaw);
  miniX.drawImage(MINI.c, cx - D / 2, cy - D / 2, D, D, -D / 2, -D / 2, D, D);
  stamp(miniX, MINI, -cx, -cy, 1);
  miniX.restore();
  // north marker on the rim
  const nx = Math.sin(mapYaw), ny = -Math.cos(mapYaw), k = Math.min((W / 2 - 8) / Math.max(1e-3, Math.abs(nx)), (H / 2 - 8) / Math.max(1e-3, Math.abs(ny)));
  miniX.font = `bold 12px ${FONT}`; miniX.textAlign = 'center'; miniX.textBaseline = 'middle';
  miniX.fillStyle = COL.place; miniX.fillText('N', W / 2 + nx * k, H / 2 + ny * k);
  miniX.textAlign = 'left'; miniX.textBaseline = 'top';
  // the big map, when open
  if (state.bigMap) {
    if (!big) big = renderAtlas(150, 91, 7, 11.5, true);
    const s = Math.min((innerWidth - 40) / big.c.width, (innerHeight - 80) / big.c.height, 1.4);
    bigEl.width = Math.round(big.c.width * s); bigEl.height = Math.round(big.c.height * s);
    bigX.imageSmoothingEnabled = true;
    bigX.drawImage(big.c, 0, 0, bigEl.width, bigEl.height);
    stamp(bigX, big, 0, 0, s, true);
  }
  bigEl.style.display = state.bigMap ? 'block' : 'none';
}
