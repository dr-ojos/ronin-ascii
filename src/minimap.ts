// The world drawn in characters: a minimap in the corner (follows the player) and a full map (N).
// Only what you have explored shows up: a fog-of-war grid is uncovered around the samurai as you walk
// (further from high ground), and places you discover are uncovered whole. Under the characters lies a
// dim shaded relief (2 m per pixel), painted lazily the first time each patch is uncovered.
// Both maps are drawn at the screen's device pixel ratio so the characters stay crisp.
// Also announces each place as you walk into it (the first time, it counts as discovered and gives points).
// What you uncover stays uncovered from one run to the next (and across reloads): map-memory.ts keeps it.
import { HALF, SIZE, WORLD_R, PLACES, ROADS, RIVER, TEMPLE_GLYPH, TORII_PATH, BRIDGES, biomeAt, groundAt, treeBlocked, rockZone, rockyGround, onMesaCliff, type Place } from './map';
import { groundY } from './terrain';
import { enemies, KINDS } from './enemies';
import { showMsg } from './hud';
import { discovered, camps } from './encounters';
import { isTownLiberated, isTownMissionStarted, townCampsOf, type TownId } from './liberation';
import { activeWorldEvent } from './world-events';
import { POIS } from './landmarks';
import { chests } from './loot';
import { smithPos } from './shop';
import type { Camp, Wildlife } from './types';
import { addPoints, POINTS } from './score';
import { player, state } from './state';
import { loadFog, storeFog } from './map-memory';

const FONT = '"Courier New", Courier, monospace';
const BG = '#05060a';
const COL = {
  grass: '#2c4a3a', contour: '#3d5e4c', water: '#5b93d4', road: '#c2aa7c', built: '#e0dccf', sakura: '#f2a5c4',
  pine: '#5c9a66', cypress: '#46805a', bamboo: '#9ccd66', rock: '#858a98', snow: '#d2dbee', place: '#ffd27a', temple: '#87efbd', you: '#ffffff', oni: '#ff5a4a',
  unknown: '#151a25'
};
const WILDLIFE_MARK: Record<Wildlife, string> = { lobos: 'w', oso: 'U', jabalies: 'j', aranas: '8', escorpiones: 'c' };
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
const clamp = (v: number, a: number, b: number) => v < a ? a : v > b ? b : v;
const smooth = (v: number, a: number, b: number) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const dprNow = () => Math.min(3, Math.max(1, window.devicePixelRatio || 1));

// ------------------------------------------------------------ fog of war (4 m cells, 0 = unknown, 255 = seen)
const FOG_M = 4, FN = SIZE / FOG_M;
const fog = new Uint8Array(FN * FN);
/** cells in the fog grid (account.ts merges two stored maps of this size) */
export const FOG_CELLS = FN * FN;
let fogVersion = 0, explored = 0, explorable = 0, fogDirty = false;
for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++) if (Math.hypot(-HALF + (i + 0.5) * FOG_M, -HALF + (j + 0.5) * FOG_M) < WORLD_R) explorable++;
/** fog at a point, nearest cell */
function fogAt(x: number, z: number) {
  const i = Math.floor((x + HALF) / FOG_M), j = Math.floor((z + HALF) / FOG_M);
  return i < 0 || j < 0 || i >= FN || j >= FN ? 0 : fog[j * FN + i];
}
/** fog at a point, bilinear (soft edges for the relief) */
function fogSoft(x: number, z: number) {
  const gx = (x + HALF) / FOG_M - 0.5, gz = (z + HALF) / FOG_M - 0.5;
  const i = clamp(Math.floor(gx), 0, FN - 2), j = clamp(Math.floor(gz), 0, FN - 2), fx = clamp(gx - i, 0, 1), fz = clamp(gz - j, 0, 1);
  const k = j * FN + i, a = fog[k], b = fog[k + 1], c = fog[k + FN], d = fog[k + FN + 1];
  return (a + (b - a) * fx) * (1 - fz) + (c + (d - c) * fx) * fz;
}
/** uncover a disc of the map (soft rim of `soft` metres) */
function reveal(x: number, z: number, R: number, soft = 16) {
  const i0 = clamp(Math.floor((x - R + HALF) / FOG_M), 0, FN - 1), i1 = clamp(Math.floor((x + R + HALF) / FOG_M), 0, FN - 1);
  const j0 = clamp(Math.floor((z - R + HALF) / FOG_M), 0, FN - 1), j1 = clamp(Math.floor((z + R + HALF) / FOG_M), 0, FN - 1);
  let changed = false;
  for (let j = j0; j <= j1; j++) {
    const cz = -HALF + (j + 0.5) * FOG_M;
    for (let i = i0; i <= i1; i++) {
      const cx = -HALF + (i + 0.5) * FOG_M, d = Math.hypot(cx - x, cz - z);
      if (d >= R) continue;
      const v = Math.min(255, Math.round((R - d) / soft * 255)), k = j * FN + i;
      if (v <= fog[k]) continue;
      if (fog[k] < 128 && v >= 128 && Math.hypot(cx, cz) < WORLD_R) explored++;
      fog[k] = v; changed = true;
    }
  }
  if (changed) { fogVersion++; fogDirty = true; paintRelief(x - R - FOG_M, z - R - FOG_M, x + R + FOG_M, z + R + FOG_M); }
}

// ------------------------------------------------------------ shaded relief (2 m / px), painted where the fog lifts
const TM = 2, TN = SIZE / TM, TILE = 32, TT = Math.ceil(TN / TILE);
const relief = document.createElement('canvas'); relief.width = relief.height = TN;
const reliefX = relief.getContext('2d')!;
const base = new Uint8ClampedArray(TN * TN * 3);
const tileDone = new Uint8Array(TT * TT);
const mixc = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const RGB = {
  grass: [27, 45, 35], high: [56, 58, 50], pine: [20, 46, 31], cypress: [16, 37, 28], bamboo: [42, 66, 30], sakura: [70, 42, 57],
  water: [24, 52, 92], built: [88, 84, 76], road: [84, 71, 50], rock: [60, 62, 70], snow: [146, 156, 178]
};
const LX = -0.55, LY = 0.62, LZ = -0.55;   // light from the north-west (top-left of the map)
function reliefRGB(x: number, z: number): number[] {
  const r = Math.hypot(x, z), h = groundY(x, z);
  const hx = groundY(x + TM, z), hz = groundY(x, z + TM), hw = groundY(x - TM, z), hn = groundY(x, z - TM);
  const [road, water, built] = groundAt(x, z);
  let c: number[];
  let lines = true;
  if (water > 120) { c = RGB.water; lines = false; }
  else if (built > 120) { c = RGB.built; lines = false; }
  else if (road > 120) { c = RGB.road; lines = false; }
  else {
    c = mixc(RGB.grass, RGB.high, smooth(h, 18, 70));
    if (!treeBlocked(x, z) && r > 52 && r < WORLD_R + 10) {
      const b = biomeAt(x, z), tot = b.sakura + b.pine + b.cypress + b.bamboo;
      const f = [0, 0, 0];
      for (const [w, col] of [[b.sakura, RGB.sakura], [b.pine, RGB.pine], [b.cypress, RGB.cypress], [b.bamboo, RGB.bamboo]] as [number, number[]][]) {
        f[0] += col[0] * w / tot; f[1] += col[1] * w / tot; f[2] += col[2] * w / tot;
      }
      c = mixc(c, f, Math.min(1, b.density * 0.9));
    }
    c = mixc(c, mixc(RGB.rock, RGB.snow, smooth(h, 70, 100)), smooth(r, WORLD_R - 30, WORLD_R + 40));
  }
  // hillshade (exaggerated) and contour lines every 4 m, stronger every 20 m
  const k = 1.8, nx = -(hx - hw) / (2 * TM) * k, nz = -(hz - hn) / (2 * TM) * k, nl = Math.hypot(nx, 1, nz);
  const lam = (nx * LX + LY + nz * LZ) / nl / Math.hypot(LX, LY, LZ);
  let s = clamp(1 + (lam - LY / Math.hypot(LX, LY, LZ)) * 1.7, 0.42, 1.6);
  if (lines) {
    if (Math.floor(hx / 20) !== Math.floor(h / 20) || Math.floor(hz / 20) !== Math.floor(h / 20)) s *= 0.6;
    else if (Math.floor(hx / 4) !== Math.floor(h / 4) || Math.floor(hz / 4) !== Math.floor(h / 4)) s *= 0.8;
  } else if (water > 120) s = 0.9 + hash(x * 0.3, z * 0.3) * 0.12;
  s *= 0.95 + hash(x, z) * 0.1;
  return [c[0] * s, c[1] * s, c[2] * s];
}
function ensureTile(ti: number, tj: number) {
  if (tileDone[tj * TT + ti]) return;
  tileDone[tj * TT + ti] = 1;
  for (let py = tj * TILE; py < Math.min(TN, (tj + 1) * TILE); py++) for (let px = ti * TILE; px < Math.min(TN, (ti + 1) * TILE); px++) {
    const c = reliefRGB(-HALF + (px + 0.5) * TM, -HALF + (py + 0.5) * TM), k = (py * TN + px) * 3;
    base[k] = c[0]; base[k + 1] = c[1]; base[k + 2] = c[2];
  }
}
/** repaint the relief over a world rectangle, faded by the fog */
function paintRelief(x0: number, z0: number, x1: number, z1: number) {
  const a0 = clamp(Math.floor((x0 + HALF) / TM), 0, TN - 1), a1 = clamp(Math.floor((x1 + HALF) / TM), 0, TN - 1);
  const b0 = clamp(Math.floor((z0 + HALF) / TM), 0, TN - 1), b1 = clamp(Math.floor((z1 + HALF) / TM), 0, TN - 1);
  for (let tj = Math.floor(b0 / TILE); tj <= Math.floor(b1 / TILE); tj++) for (let ti = Math.floor(a0 / TILE); ti <= Math.floor(a1 / TILE); ti++) ensureTile(ti, tj);
  const w = a1 - a0 + 1, h = b1 - b0 + 1, img = reliefX.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const px = a0 + x, py = b0 + y, k = (py * TN + px) * 3, o = (y * w + x) * 4;
    const f = fogSoft(-HALF + (px + 0.5) * TM, -HALF + (py + 0.5) * TM);
    d[o] = base[k]; d[o + 1] = base[k + 1]; d[o + 2] = base[k + 2]; d[o + 3] = f < 4 ? 0 : f;
  }
  reliefX.putImageData(img, a0, b0);
}

// ------------------------------------------------------------ the characters, classified lazily on square cells
const GLYPHS: [string, string][] = [];
const GIDX = new Map<string, number>();
function gid(g: string, col: string) { const key = g + col; let i = GIDX.get(key); if (i === undefined) { i = GLYPHS.length; GLYPHS.push([g, col]); GIDX.set(key, i); } return i; }
const BLANK = gid(' ', COL.grass), UNKNOWN = gid('·', COL.unknown);
/** one map character for a point of the world */
function classify(x: number, z: number, step: number): number {
  const r = Math.hypot(x, z), h = groundY(x, z);
  if (r > WORLD_R + 8) return h > 85 ? gid('^', COL.snow) : gid(h > 40 ? '^' : 'n', COL.rock);
  const [road, water, built] = groundAt(x, z);
  if (water > 120) return gid(hash(x, z) < 0.5 ? '~' : '≈', COL.water);
  if (built > 120) {
    // in the rocky country, "built" is bare stone or the rock walls of a canyon
    if (rockZone(x, z) > 0.3 || PLACES.some(p => p.id.startsWith('desfiladero') && Math.hypot(x - p.x, z - p.z) < p.r) || onMesaCliff(x, z)) return gid(rockyGround(x, z) ? ':' : '#', COL.rock);
    return gid('#', COL.built);
  }
  if (road > 120) return gid('=', COL.road);
  if (!treeBlocked(x, z) && r > 52) {
    const b = biomeAt(x, z);
    if (hash(x, z) < b.density * 0.8) {
      const tot = b.sakura + b.pine + b.cypress + b.bamboo; let w = hash(z, x) * tot;
      if ((w -= b.sakura) < 0) return gid('*', COL.sakura);
      if ((w -= b.pine) < 0) return gid('A', COL.pine);
      if ((w -= b.cypress) < 0) return gid('!', COL.cypress);
      return gid('|', COL.bamboo);
    }
  }
  // contour lines every 4 m of height
  const band = Math.floor(h / 4);
  if (Math.floor(groundY(x + step, z) / 4) !== band || Math.floor(groundY(x, z + step) / 4) !== band) return gid('.', COL.contour);
  return hash(z * 3, x * 7) < 0.12 ? gid('"', COL.grass) : BLANK;
}
class Grid {
  readonly n: number;
  /** glyph id + 1 per cell, 0 = not classified yet */
  readonly code: Uint16Array;
  constructor(readonly m: number) {
    this.n = Math.ceil(SIZE / m); this.code = new Uint16Array(this.n * this.n);
    // thin features drawn along their path, so they never fall between two samples
    const along = (pts: [number, number][], id: number) => {
      for (const [x, z] of pts) { const i = Math.floor((x + HALF) / m), j = Math.floor((z + HALF) / m); if (i >= 0 && j >= 0 && i < this.n && j < this.n) this.code[j * this.n + i] = id + 1; }
    };
    along(RIVER.pts, gid('~', COL.water));
    for (const r of ROADS) along(r.pts, r === TORII_PATH ? gid('n', '#ff6a4a') : gid('=', COL.road));
    along(BRIDGES.map(b => [b.x, b.z]), gid('H', '#ff6a4a'));
  }
  c(i: number) { return -HALF + (i + 0.5) * this.m; }
  at(i: number, j: number) {
    const k = j * this.n + i;
    let c = this.code[k];
    if (!c) c = this.code[k] = classify(this.c(i), this.c(j), this.m) + 1;
    return c - 1;
  }
}
/** glyphs bucketed by id and fade level, so each colour is set once per draw */
const buckets = new Map<number, number[]>();
function bucket(id: number, lvl: number, sx: number, sy: number) {
  const key = id * 2 + lvl; let l = buckets.get(key); if (!l) buckets.set(key, l = []); l.push(sx, sy);
}
function flush(ctx: CanvasRenderingContext2D) {
  for (const [key, l] of buckets) {
    if (!l.length) continue;
    ctx.fillStyle = GLYPHS[key >> 1][1]; ctx.globalAlpha = key & 1 ? 1 : 0.5;
    const g = GLYPHS[key >> 1][0];
    for (let n = 0; n < l.length; n += 2) ctx.fillText(g, l[n], l[n + 1]);
    l.length = 0;
  }
  ctx.globalAlpha = 1;
}
/** the glyph (and its fade level) for a cell, or -1 to leave it empty */
function cellGlyph(g: Grid, i: number, j: number): [number, number] | null {
  const f = fogAt(g.c(i), g.c(j));
  if (f < 70) return hash(i * 1.37, j * 2.11) < 0.06 ? [UNKNOWN, 1] : null;
  const id = g.at(i, j);
  return id === BLANK ? null : [id, f >= 190 ? 1 : 0];
}

// ------------------------------------------------------------ markers on top (upright, crisp)
type Proj = (x: number, z: number) => [number, number];
const placeKnown = (p: Place) => discovered.has(p.id) || fogAt(p.x, p.z) >= 128;
function drawPlayer(ctx: CanvasRenderingContext2D, sx: number, sy: number, dx: number, dy: number, size: number) {
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(Math.atan2(dx, -dy));
  ctx.beginPath(); ctx.moveTo(0, -size); ctx.lineTo(size * 0.72, size * 0.78); ctx.lineTo(0, size * 0.36); ctx.lineTo(-size * 0.72, size * 0.78); ctx.closePath();
  ctx.lineJoin = 'round'; ctx.lineWidth = 2.2; ctx.strokeStyle = '#000'; ctx.stroke();
  ctx.fillStyle = COL.you; ctx.fill();
  ctx.restore();
  // a slow ring, so the samurai is easy to find
  const k = (state.time % 1.6) / 1.6;
  ctx.globalAlpha = (1 - k) * 0.55; ctx.strokeStyle = COL.you; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.arc(sx, sy, size * (1 + k * 1.4), 0, Math.PI * 2); ctx.stroke(); ctx.globalAlpha = 1;
}
function stamp(ctx: CanvasRenderingContext2D, proj: Proj, fs: number, isBig: boolean, rot = 0) {
  ctx.font = `bold ${fs}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const dist = (x: number, z: number) => Math.hypot(x - player.pos.x, z - player.pos.z);
  const near = (x: number, z: number, r: number) => isBig || dist(x, z) < r;
  const text = (g: string, x: number, z: number) => { const [px, py] = proj(x, z); ctx.fillText(g, px, py); };
  // named places you know of (the big map writes their names itself)
  if (!isBig) for (const p of PLACES) {
    if (!placeKnown(p) || dist(p.x, p.z) > 260) continue;
    ctx.fillStyle = p.glyph === TEMPLE_GLYPH ? COL.temple : COL.place; ctx.globalAlpha = discovered.has(p.id) ? 1 : 0.55;
    text(p.glyph, p.x, p.z);
  }
  ctx.globalAlpha = 1;
  const seenChests = new Set<unknown>(); if (isBig) for (const c of seen) if (c.chest) seenChests.add(c.chest);
  // corners you have found, camps you have seen (red while guarded), chests nearby (gold, dim while sealed)
  ctx.fillStyle = COL.place;
  POIS.forEach((p, i) => { if (discovered.has('poi' + i) && near(p.x, p.z, 400)) text(p.glyph, p.x, p.z); });
  for (const c of camps) {
    if (c.route || c.temp || !seen.has(c) || !near(c.x, c.z, 260)) continue;
    const wildlife = c.wildlife && WILDLIFE_MARK[c.wildlife];
    ctx.fillStyle = c.roster.length ? (wildlife ? '#ce9d61' : '#c0483a') : '#5c6478';
    text(c.roster.length ? (wildlife || (c.boss ? 'X' : c.elite ? '!' : 'x')) : '.', c.x, c.z);
  }
  for (const c of chests) {
    if (c.state === 'open' || !near(c.x, c.z, c.kind === 'oculto' ? 45 : 140) || fogAt(c.x, c.z) < 128) continue;
    if (isBig && c.kind === 'oculto' && dist(c.x, c.z) > 45) continue;
    // in a world this big, the full map only shows the chests of lairs you have found (and those around you)
    if (isBig && dist(c.x, c.z) > 300 && !seenChests.has(c)) continue;
    ctx.fillStyle = c.kind === 'guardian' ? (c.state === 'sealed' ? '#7a5a9a' : '#d0a0ff') : c.state === 'sealed' ? '#8a7440' : '#ffd060';
    text('$', c.x, c.z);
  }
  // Masa's shop, in the shrine at the start
  if (near(smithPos.x, smithPos.z, 400) && fogAt(smithPos.x, smithPos.z) >= 128) { ctx.fillStyle = '#8fb4ff'; text('†', smithPos.x, smithPos.z); }
  // what moves: only what is close enough to see
  for (const e of enemies) {
    const x = e.g.position.x, z = e.g.position.z;
    if (dist(x, z) > (isBig ? 120 : 160) || fogAt(x, z) < 70) continue;
    const kind = KINDS[e.kind];
    ctx.fillStyle = kind.beast ? '#ffc381' : COL.oni;
    text(kind.glyph, x, z);
  }
  // active random calamity boss event: always visible with a pulsing beacon ring (even in fog)
  const ev = activeWorldEvent();
  if (ev) {
    const [ex, ey] = proj(ev.x, ev.z);
    const pulse = (state.time * 0.9) % 1;
    ctx.save();
    ctx.strokeStyle = ev.colorHex;
    ctx.lineWidth = isBig ? 2.2 : 1.8;
    ctx.globalAlpha = (1 - pulse) * 0.85;
    ctx.beginPath();
    ctx.arc(ex, ey, fs * (0.7 + pulse * 1.4), 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#05060a';
    ctx.beginPath();
    ctx.arc(ex, ey, fs * 0.62, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = ev.colorHex;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = ev.colorHex;
    ctx.font = `bold ${Math.round(fs * 0.95)}px ${FONT}`;
    ctx.fillText(ev.kanji, ex, ey);
    ctx.restore();
  }
  // the samurai: an arrow pointing where they face (map rotated by `rot`)
  const [px, py] = proj(player.pos.x, player.pos.z);
  const u = Math.sin(player.face), v = Math.cos(player.face), cr = Math.cos(rot), sr = Math.sin(rot);
  drawPlayer(ctx, px, py, u * cr - v * sr, u * sr + v * cr, fs * 0.55);
  ctx.textBaseline = 'top'; ctx.textAlign = 'left';
}

// ------------------------------------------------------------ minimap (always on, top right)
const mini = document.getElementById('minimap') as HTMLCanvasElement;
const miniX = mini.getContext('2d')!;
const zone = document.getElementById('zone')!;
const MW = mini.width, MH = mini.height;   // CSS size
const MINI_PX = 0.8;                        // metres per CSS pixel
const MINI_CELL = 6;                        // CSS pixels per character
let miniGrid: Grid | null = null;

function drawMinimap() {
  const dpr = dprNow();
  if (mini.width !== Math.round(MW * dpr)) { mini.width = Math.round(MW * dpr); mini.height = Math.round(MH * dpr); }
  const g = miniGrid ??= new Grid(MINI_PX * MINI_CELL);
  const ctx = miniX, W = MW, H = MH, D = Math.ceil(Math.hypot(W, H)) + 8;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1; ctx.fillStyle = BG; ctx.fillRect(0, 0, W, H);
  const px0 = player.pos.x, pz0 = player.pos.z, cr = Math.cos(mapYaw), sr = Math.sin(mapYaw);
  // relief, turned with the camera
  ctx.save(); ctx.translate(W / 2, H / 2); ctx.rotate(mapYaw);
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  const half = D / 2 * MINI_PX, sx = (px0 - half + HALF) / TM, sy = (pz0 - half + HALF) / TM, sw = D * MINI_PX / TM;
  ctx.drawImage(relief, sx, sy, sw, sw, -D / 2, -D / 2, D, D);
  ctx.restore();
  // characters: world-aligned cells, drawn upright where they land
  const proj: Proj = (x, z) => { const u = (x - px0) / MINI_PX, v = (z - pz0) / MINI_PX; return [W / 2 + u * cr - v * sr, H / 2 + u * sr + v * cr]; };
  const rc = Math.ceil(D / 2 / MINI_CELL) + 1;
  const ci = Math.floor((px0 + HALF) / g.m), cj = Math.floor((pz0 + HALF) / g.m);
  for (let j = Math.max(0, cj - rc); j <= Math.min(g.n - 1, cj + rc); j++) for (let i = Math.max(0, ci - rc); i <= Math.min(g.n - 1, ci + rc); i++) {
    const cell = cellGlyph(g, i, j); if (!cell) continue;
    const [x, y] = proj(g.c(i), g.c(j));
    if (x < -6 || y < -6 || x > W + 6 || y > H + 6) continue;
    bucket(cell[0], cell[1], x, y);
  }
  ctx.font = `bold 9px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  flush(ctx);
  stamp(ctx, proj, 12, false, mapYaw);
  // if a colossal world event is outside the minimap frame, pin a pulsing directional indicator on the rim
  const ev = activeWorldEvent();
  if (ev) {
    const [ex, ey] = proj(ev.x, ev.z);
    const dx = ex - W / 2, dy = ey - H / 2;
    if (Math.abs(dx) > W / 2 - 12 || Math.abs(dy) > H / 2 - 12) {
      const kEv = Math.min((W / 2 - 11) / Math.max(1e-3, Math.abs(dx)), (H / 2 - 11) / Math.max(1e-3, Math.abs(dy)));
      const rx = W / 2 + dx * kEv, ry = H / 2 + dy * kEv;
      ctx.save();
      ctx.fillStyle = '#05060a';
      ctx.strokeStyle = ev.colorHex;
      ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(rx, ry, 7.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.font = `bold 10px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = ev.colorHex; ctx.fillText(ev.kanji, rx, ry);
      ctx.restore();
    }
  }
  // north marker on the rim
  const nx = Math.sin(mapYaw), ny = -Math.cos(mapYaw), k = Math.min((W / 2 - 8) / Math.max(1e-3, Math.abs(nx)), (H / 2 - 8) / Math.max(1e-3, Math.abs(ny)));
  ctx.font = `bold 12px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = '#000'; ctx.fillRect(W / 2 + nx * k - 6, H / 2 + ny * k - 7, 12, 14);
  ctx.fillStyle = COL.place; ctx.fillText('N', W / 2 + nx * k, H / 2 + ny * k);
  ctx.textAlign = 'left'; ctx.textBaseline = 'top';
}

// ------------------------------------------------------------ the full map (N), with zoom
const bigEl = document.getElementById('bigmap') as HTMLCanvasElement;
const bigX = bigEl.getContext('2d')!;
const ZOOMS = [1, 2, 4, 8];
let zoomI = 1;
/** the big map's layout: a square of `side` CSS px showing `span` metres around (vx, vz) */
interface BigView { side: number; dpr: number; zoom: number; span: number; vx: number; vz: number; pxm: number; cell: number }
let view: BigView | null = null;
const cache = document.createElement('canvas');
let cacheFogV = -1, cacheT = -99, wasOpen = false;
const grids = new Map<number, Grid>();
/** wheel / + − while the big map is open */
export function zoomBigMap(dir: number) {
  const n = clamp(zoomI + dir, 0, ZOOMS.length - 1);
  if (n !== zoomI) { zoomI = n; view = null; }
}

function bigView(): BigView {
  const side = Math.max(320, Math.floor(Math.min(innerWidth - 40, innerHeight - 70))), dpr = dprNow(), zoom = ZOOMS[zoomI];
  const span = SIZE / zoom, lim = HALF - span / 2;
  // centred on the samurai; it only shifts when they walk out of the middle of the view
  const keep = view && view.side === side && view.dpr === dpr && view.zoom === zoom
    && Math.abs(player.pos.x - view.vx) < span * 0.3 && Math.abs(player.pos.z - view.vz) < span * 0.3;
  if (keep) return view!;
  const vx = clamp(player.pos.x, -lim, lim), vz = clamp(player.pos.z, -lim, lim), pxm = side / span;
  cacheFogV = -1;
  return view = { side, dpr, zoom, span, vx, vz, pxm, cell: clamp(side / 150, 5.5, 8) };
}
function bigProj(V: BigView): Proj { return (x, z) => [(x - V.vx) * V.pxm + V.side / 2, (z - V.vz) * V.pxm + V.side / 2]; }
function renderBig(V: BigView) {
  if (cache.width !== Math.round(V.side * V.dpr)) { cache.width = cache.height = Math.round(V.side * V.dpr); }
  const ctx = cache.getContext('2d')!, S = V.side, proj = bigProj(V);
  const m = V.cell / V.pxm, key = Math.round(m * 1000);
  let g = grids.get(key); if (!g) grids.set(key, g = new Grid(m));
  ctx.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  ctx.fillStyle = BG; ctx.fillRect(0, 0, S, S);
  const x0 = V.vx - V.span / 2, z0 = V.vz - V.span / 2;
  // a faint survey grid, so even the unknown has a shape
  const step = V.zoom >= 4 ? 100 : 200;
  ctx.strokeStyle = '#0e121c'; ctx.lineWidth = 1; ctx.beginPath();
  for (let w = Math.ceil((x0 + HALF) / step) * step - HALF; w < x0 + V.span; w += step) { const p = Math.round(proj(w, 0)[0]) + 0.5; ctx.moveTo(p, 0); ctx.lineTo(p, S); }
  for (let w = Math.ceil((z0 + HALF) / step) * step - HALF; w < z0 + V.span; w += step) { const p = Math.round(proj(0, w)[1]) + 0.5; ctx.moveTo(0, p); ctx.lineTo(S, p); }
  ctx.stroke();
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(relief, (x0 + HALF) / TM, (z0 + HALF) / TM, V.span / TM, V.span / TM, 0, 0, S, S);
  ctx.font = `bold ${Math.round(V.cell * 1.45)}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  const i0 = Math.max(0, Math.floor((x0 + HALF) / g.m)), i1 = Math.min(g.n - 1, Math.ceil((x0 + V.span + HALF) / g.m));
  const j0 = Math.max(0, Math.floor((z0 + HALF) / g.m)), j1 = Math.min(g.n - 1, Math.ceil((z0 + V.span + HALF) / g.m));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
    const cell = cellGlyph(g, i, j); if (!cell) continue;
    const [px, py] = proj(g.c(i), g.c(j));
    bucket(cell[0], cell[1], px, py);
  }
  flush(ctx);
  // places you know of: their glyph, and their name once you have been there
  const fs = Math.round(V.cell * 1.6);
  ctx.strokeStyle = '#000'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
  for (const p of PLACES) {
    if (!placeKnown(p)) continue;
    const [px, py] = proj(p.x, p.z), temple = p.glyph === TEMPLE_GLYPH, been = discovered.has(p.id);
    if (px < -200 || py < -20 || px > S + 200 || py > S + 20) continue;
    const isTown = p.id === 'aldea' || p.id === 'pueblo';
    const townFree = isTown && isTownLiberated(p.id as TownId);
    ctx.fillStyle = temple || townFree ? COL.temple : COL.place;
    ctx.font = `bold ${Math.round(fs * 1.25)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.globalAlpha = been ? 1 : 0.6;
    ctx.strokeText(p.glyph, px, py); ctx.fillText(p.glyph, px, py);
    const left = temple && p.x < 100, label = been ? p.name.toLowerCase() + (townFree ? ' ✓' : '') : '?';
    ctx.font = `bold ${fs}px ${FONT}`; ctx.textAlign = left ? 'right' : 'left';
    const lx = px + fs * (left ? -0.9 : 0.9), ly = py + (temple && !left ? fs * 0.55 : 0);
    ctx.strokeText(label, lx, ly); ctx.fillText(label, lx, ly);
    ctx.globalAlpha = 1;
  }
  // north, legend, scale
  ctx.textBaseline = 'top'; ctx.textAlign = 'left'; ctx.font = `bold 13px ${FONT}`;
  if (TEMPLE_PLACES.some(placeKnown)) { ctx.fillStyle = COL.temple; ctx.fillText(`${TEMPLE_GLYPH} Templos · sellos de jade en cofres`, 14, 12); }
  ctx.fillStyle = COL.place; ctx.textAlign = 'center'; ctx.fillText('N', S / 2, 10);
  ctx.textAlign = 'left'; ctx.textBaseline = 'bottom'; ctx.fillStyle = '#9aa3b5'; ctx.font = `bold 12px ${FONT}`;
  const known = PLACES.filter(p => discovered.has(p.id)).length;
  ctx.fillText(`explorado ${(explored / explorable * 100).toFixed(1)}%  ·  lugares ${known}/${PLACES.length}`, 14, S - 26);
  ctx.fillStyle = '#6c7488';
  ctx.fillText(`zoom x${V.zoom}  [rueda / + −]  ·  [N] cerrar`, 14, S - 10);
  const bar = step * V.pxm;
  ctx.strokeStyle = '#9aa3b5'; ctx.lineWidth = 1; ctx.beginPath();
  ctx.moveTo(S - 14 - bar, S - 14.5); ctx.lineTo(S - 14, S - 14.5); ctx.moveTo(S - 14 - bar + 0.5, S - 18); ctx.lineTo(S - 14 - bar + 0.5, S - 11); ctx.moveTo(S - 14.5, S - 18); ctx.lineTo(S - 14.5, S - 11); ctx.stroke();
  ctx.textAlign = 'right'; ctx.fillStyle = '#9aa3b5'; ctx.fillText(`${step} m`, S - 14, S - 20);
  cacheFogV = fogVersion; cacheT = state.time;
}
const TEMPLE_PLACES = PLACES.filter(p => p.glyph === TEMPLE_GLYPH);

function drawBigMap() {
  const V = bigView();
  if (bigEl.width !== Math.round(V.side * V.dpr)) {
    bigEl.width = bigEl.height = Math.round(V.side * V.dpr);
    bigEl.style.width = bigEl.style.height = `${V.side}px`;
  }
  // the static layer is rebuilt when it is stale (at most twice a second while you walk)
  if (cacheFogV < 0 || !wasOpen || (cacheFogV !== fogVersion && Math.abs(state.time - cacheT) > 0.5)) renderBig(V);
  bigX.setTransform(1, 0, 0, 1, 0, 0); bigX.drawImage(cache, 0, 0);
  bigX.setTransform(V.dpr, 0, 0, V.dpr, 0, 0);
  bigX.save(); bigX.beginPath(); bigX.rect(0, 0, V.side, V.side); bigX.clip();
  stamp(bigX, bigProj(V), Math.round(V.cell * 1.9), true);
  bigX.restore();
}

// ------------------------------------------------------------ per frame
let t = 0, lastPlace: Place | null = null, placeT = 1.5;
/** heading the minimap is turned to: follows the camera, but holds still while photo mode orbits it */
let mapYaw = 0;
/** camps you have come close to (shown on the maps from then on) */
const seen = new Set<Camp>();
/** a new run: the camps are new, but the land you have mapped stays mapped */
export function resetMinimap() {
  seen.clear();
}

// ------------------------------------------------------------ the map you remember
// Loaded once: the explored count is recounted and the relief under the uncovered land is queued, a few
// tiles per tick so the load does not stall the first frames.
const reliefQueue: [number, number][] = [];
if (loadFog(fog)) {
  for (let j = 0; j < FN; j++) for (let i = 0; i < FN; i++)
    if (fog[j * FN + i] >= 128 && Math.hypot(-HALF + (i + 0.5) * FOG_M, -HALF + (j + 0.5) * FOG_M) < WORLD_R) explored++;
  const per = TILE * TM / FOG_M;   // fog cells along one relief tile
  for (let tj = 0; tj < TT; tj++) for (let ti = 0; ti < TT; ti++) {
    let any = false;
    for (let j = Math.max(0, tj * per - 1); !any && j < Math.min(FN, (tj + 1) * per + 1); j++)
      for (let i = Math.max(0, ti * per - 1); i < Math.min(FN, (ti + 1) * per + 1); i++) if (fog[j * FN + i]) { any = true; break; }
    if (any) reliefQueue.push([ti, tj]);
  }
  fogVersion++;
}
function paintQueued(n: number) {
  if (!reliefQueue.length) return;
  for (const [ti, tj] of reliefQueue.splice(0, n)) {
    const x0 = -HALF + ti * TILE * TM, z0 = -HALF + tj * TILE * TM;
    paintRelief(x0, z0, x0 + TILE * TM - TM, z0 + TILE * TM - TM);
  }
  fogVersion++;
}
let saveT = 0;
/** writes the map if it has changed since the last write (account.ts calls it before a push) */
export function saveMinimap() {
  if (!fogDirty) return;
  fogDirty = false; storeFog(fog);
}
addEventListener('beforeunload', saveMinimap);
addEventListener('visibilitychange', () => { if (document.hidden) saveMinimap(); });
export function updateMinimap(dt: number) {
  t -= dt; placeT -= dt; saveT -= dt;
  if (t > 0) return; t = 0.05;
  paintQueued(6);
  if (saveT <= 0) { saveT = 4; saveMinimap(); }
  // where am I? (smallest named place that contains the player)
  let here: Place | null = null;
  for (const p of PLACES) if (Math.hypot(player.pos.x - p.x, player.pos.z - p.z) < p.r && (!here || p.r < here.r)) here = p;
  if (here !== lastPlace) {
    const isTown = !!here && (here.id === 'aldea' || here.id === 'pueblo');
    const townFree = isTown && isTownLiberated(here!.id as TownId);
    if (here && state.playing && !state.dead && !discovered.has(here.id)) {
      discovered.add(here.id); addPoints(POINTS.place, 'lugar descubierto');
      const note = isTown && !townFree ? '\nmisión: libera el pueblo de los oni' : '';
      showMsg(`— ${here.name} —\n+${POINTS.place} lugar descubierto${note}`, 3.0);
    } else if (here && placeT <= 0 && state.playing) {
      if (!(isTown && !townFree && !isTownMissionStarted(here.id as TownId))) {
        showMsg(`— ${here.name}${townFree ? ' (LIBERADO)' : ''} —`, 2.4);
      }
    }
    lastPlace = here; placeT = 0;
  }
  const hereFree = here && (here.id === 'aldea' || here.id === 'pueblo') && isTownLiberated(here.id as TownId);
  zone.textContent = here ? `${here.name.toLowerCase()}${hereFree ? ' · liberado' : ''}` : 'tierras salvajes';
  if (!state.playing) seen.clear();
  for (const tid of ['aldea', 'pueblo'] as TownId[]) {
    if (isTownMissionStarted(tid)) for (const c of townCampsOf(tid)) seen.add(c);
  }
  
  // the corners of the wilds count as discovered when you walk up to them
  POIS.forEach((p, i) => {
    if (state.playing && !state.dead && !discovered.has('poi' + i) && Math.hypot(p.x - player.pos.x, p.z - player.pos.z) < 11) {
      discovered.add('poi' + i); addPoints(POINTS.corner, 'rincón descubierto');
      showMsg(`— ${p.name.toUpperCase()} —\n+${POINTS.corner}`, 2);
    }
  });
  // lift the fog: you see further from high ground; a settlement you enter is mapped whole
  const h = groundY(player.pos.x, player.pos.z);
  reveal(player.pos.x, player.pos.z, 80 + clamp(h - 6, 0, 70) * 0.9);
  for (const p of PLACES) if (p.flat > 0 && discovered.has(p.id) && fogAt(p.x, p.z) < 255) reveal(p.x, p.z, p.r + 18);
  // camps count as seen once they stand on ground you have uncovered
  for (const c of camps) if (!seen.has(c) && Math.hypot(c.x - player.pos.x, c.z - player.pos.z) < 140 && fogAt(c.x, c.z) >= 70) seen.add(c);
  // minimap window around the player, turned with the camera so "up" is always straight ahead
  if (!state.photo) mapYaw = state.yaw;
  drawMinimap();
  // the big map, when open
  const mapOpen = state.bigMap && !state.menu;
  if (mapOpen) drawBigMap();
  wasOpen = mapOpen;
  bigEl.style.display = mapOpen ? 'block' : 'none';
}
