// The open world's layout: size, named places, roads, lakes, the river and its bridges, forest
// biomes, and the rasterised masks (no grass on roads / water / plazas, no trees near them).
// Pure data + a few lookups: terrain.ts, structures.ts, chunks.ts and the minimap all read from here.
import * as THREE from 'three';
import type { JadeTechniqueId, TempleTechniqueId } from './techniques';
import type { EnemyKind } from './types';

/** world square is [-HALF, HALF]²; the walkable area is a disc of radius WORLD_R (mountains beyond) */
export const HALF = 1400, SIZE = HALF * 2;
export const WORLD_R = 1250;

export type P2 = [number, number];

/** places with their own name (HUD + minimap). flat: radius of the levelled ground around it */
export interface Place { id: string; name: string; x: number; z: number; r: number; flat: number; blend: number; level?: number; glyph: string }
export interface TemplePlace extends Place {
  technique: TempleTechniqueId; lessons?: JadeTechniqueId[]; master: string; facing: number; crest: string;
  /** a technique this master only teaches to the sōhei (classes.ts) */
  monkLesson?: JadeTechniqueId;
  /** a temple whose technique is won, not bought: this guardian waits in its courtyard */
  guardian?: EnemyKind;
}
export const TEMPLE_GLYPH = '◆';
export const TEMPLES: TemplePlace[] = [
  { id: 'templo-viento', name: 'TEMPLO DEL VIENTO', x: -181, z: -72, r: 29, flat: 32, blend: 26, glyph: TEMPLE_GLYPH,
    technique: 'viento', lessons: ['tornado'], monkLesson: 'sutras', master: 'Haru', facing: Math.PI / 2, crest: '風' },
  { id: 'templo-brasas', name: 'TEMPLO DE LAS BRASAS', x: 238, z: -21, r: 29, flat: 32, blend: 26, glyph: TEMPLE_GLYPH,
    technique: 'fuego', lessons: ['cuatroLlamas', 'meteoro'], master: 'Enji', facing: -Math.PI / 2, crest: '火' },
  { id: 'templo-marea', name: 'TEMPLO DE LA MAREA', x: 97, z: 272, r: 29, flat: 32, blend: 26, glyph: TEMPLE_GLYPH,
    technique: 'agua', lessons: ['hielo'], master: 'Nami', facing: Math.PI / 2, crest: '水' },
  { id: 'templo-rayo', name: 'TEMPLO DEL RAYO', x: 345, z: -305, r: 29, flat: 32, blend: 26, glyph: TEMPLE_GLYPH,
    technique: 'rayo', lessons: ['tierra'], master: 'Shiden', facing: 0, crest: '雷', guardian: 'guardianRayo' },
];
export const PLACES: Place[] = [
  { id: 'claro', name: 'EL CLARO DEL SANTUARIO', x: 0, z: -8, r: 50, flat: 62, blend: 55, level: 0, glyph: 'H' },
  { id: 'aldea', name: 'ALDEA DE KIRI', x: 240, z: -130, r: 60, flat: 62, blend: 60, glyph: 'A' },
  { id: 'castillo', name: 'CASTILLO KURO', x: 60, z: -540, r: 70, flat: 78, blend: 50, glyph: 'C' },
  { id: 'pagoda', name: 'PAGODA DE LOS CINCO VIENTOS', x: -250, z: -270, r: 36, flat: 36, blend: 60, glyph: 'P' },
  { id: 'lago', name: 'LAGO ESPEJO', x: -310, z: 175, r: 85, flat: 92, blend: 45, glyph: '~' },
  { id: 'inari', name: 'SANTUARIO DE LA CUMBRE', x: 470, z: 390, r: 28, flat: 26, blend: 18, glyph: 'S' },
  { id: 'torii', name: 'SENDA DE LOS MIL TORII', x: 425, z: 300, r: 40, flat: 0, blend: 0, glyph: 'n' },
  { id: 'campamento', name: 'CAMPAMENTO RONIN', x: -520, z: 60, r: 40, flat: 42, blend: 55, glyph: 'X' },
  { id: 'cementerio', name: 'CEMENTERIO DE LAS LINTERNAS', x: 110, z: 490, r: 38, flat: 40, blend: 55, glyph: '+' },
  { id: 'cerezos', name: 'VALLE DE LOS CEREZOS', x: 150, z: 250, r: 120, flat: 0, blend: 0, glyph: '*' },
  { id: 'bambu', name: 'BOSQUE DE BAMBU', x: 390, z: 110, r: 120, flat: 0, blend: 0, glyph: '|' },
  { id: 'pinos', name: 'ALTOS DE LOS PINOS', x: -380, z: -330, r: 180, flat: 0, blend: 0, glyph: 'T' },
  { id: 'pueblo', name: 'PUEBLO DE ASAGIRI', x: 820, z: -260, r: 125, flat: 135, blend: 75, glyph: 'V' },
  { id: 'ruinas', name: 'RUINAS DEL CASTILLO TAKAMORI', x: -560, z: -880, r: 140, flat: 150, blend: 85, glyph: 'R' },
  { id: 'bosquenegro', name: 'BOSQUE NEGRO', x: -900, z: -470, r: 240, flat: 0, blend: 0, glyph: '!' },
  { id: 'llanura', name: 'LLANURA DE LOS SUSURROS', x: 620, z: 700, r: 260, flat: 0, blend: 0, glyph: '"' },
  // rocky country: boulders, needles of rock, crags and bare stone; each hides a maze of canyons
  { id: 'pedregal', name: 'PEDREGAL DE LOS CUERVOS', x: 380, z: 1000, r: 230, flat: 0, blend: 0, glyph: '%' },
  { id: 'riscos', name: 'RISCOS DEL VIENTO', x: -960, z: 180, r: 220, flat: 0, blend: 0, glyph: '%' },
  { id: 'canchal', name: 'CANCHAL DEL NORTE', x: 300, z: -960, r: 220, flat: 0, blend: 0, glyph: '%' },
  // winding canyon paths through the rock, with side trails that end in hidden nooks (canyons.ts)
  { id: 'desfiladero-cuervo', name: 'DESFILADERO DEL CUERVO', x: 380, z: 990, r: 120, flat: 0, blend: 0, glyph: 'D' },
  { id: 'desfiladero-viento', name: 'DESFILADERO DEL VIENTO', x: -960, z: 180, r: 120, flat: 0, blend: 0, glyph: 'D' },
  { id: 'desfiladero-ecos', name: 'DESFILADERO DE LOS ECOS', x: 300, z: -960, r: 120, flat: 0, blend: 0, glyph: 'D' },
  { id: 'desfiladero-zorros', name: 'SENDA DE LOS ZORROS', x: -430, z: 430, r: 95, flat: 0, blend: 0, glyph: 'D' },
  // broken country of plateaus: cliffs you have to walk round, and a few stone ramps up to the top (mesas.ts)
  { id: 'mesetas-ceniza', name: 'MESETAS DE CENIZA', x: 660, z: 330, r: 170, flat: 0, blend: 0, glyph: 'M' },
  { id: 'mesetas-escalones', name: 'ESCALONES DEL SUR', x: -260, z: 860, r: 170, flat: 0, blend: 0, glyph: 'M' },
  { id: 'mesetas-bruma', name: 'TERRAZAS DE BRUMA', x: -700, z: -160, r: 160, flat: 0, blend: 0, glyph: 'M' },
  { id: 'mesetas-halcon', name: 'ALTIPLANO DEL HALCON', x: -170, z: -800, r: 160, flat: 0, blend: 0, glyph: 'M' },
  ...TEMPLES
];
export const place = (id: string) => PLACES.find(p => p.id === id)!;

/** the lakes: wobbly circles (same formula everywhere, so the shore, collision and masks agree) */
export interface Lake { x: number; z: number; R: number; ph: number }
export const LAKES: Lake[] = [{ x: -320, z: 180, R: 62, ph: 0.7 }];
export const lakeRadius = (l: Lake, a: number) => l.R * (1 + Math.sin(a * 3 + l.ph) * 0.09 + Math.sin(a * 7 + 1 + l.ph) * 0.05 + Math.sin(a * 13) * 0.02);

// ------------------------------------------------------------ polylines (roads, river)
/** smooth a few control points into an evenly spaced polyline (step metres apart) */
function smoothLine(ctrl: P2[], step: number): P2[] {
  const curve = new THREE.CatmullRomCurve3(ctrl.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const n = Math.max(2, Math.ceil(curve.getLength() / step));
  return curve.getSpacedPoints(n).map(v => [v.x, v.z] as P2);
}
export interface Line { pts: P2[]; width: number }

export const RIVER: Line = {
  width: 9,
  pts: smoothLine([[-1420, -900], [-1150, -820], [-960, -700], [-820, -560], [-700, -420], [-600, -300], [-500, -170], [-440, -40], [-400, 70], [-365, 140], [-340, 165]], 4)
    .concat(smoothLine([[-292, 236], [-275, 300], [-240, 380], [-180, 470], [-120, 570], [-70, 720], [-20, 900], [60, 1100], [120, 1450]], 4))
};
/** Extra half-width of the river ribbon mesh so irregular banks never clip on the polygon edge. */
export const RIVER_BANK_PAD = 2.6;
/** Organic bank offset (metres, positive = wider) at distance `along` on `side` (-1 left, +1 right). */
export function riverBankOffset(along: number, side: number): number {
  const seed = side < 0 ? 1.7 : 4.9;
  const o = Math.sin(along * 0.051 + seed) * 1.05
    + Math.sin(along * 0.117 + seed * 1.7 + 1.3) * 0.72
    + Math.sin(along * 0.273 + seed * 2.3 + 2.7) * 0.42
    + Math.sin(along * 0.59 + seed * 3.1 + 0.9) * 0.20;
  return THREE.MathUtils.clamp(o, -2.0, 2.0);
}

const ROAD_CTRL: P2[][] = [
  [[0, 7], [0, 40], [22, 110], [85, 195], [150, 255], [175, 350], [125, 455], [110, 470]],          // sur: cerezos y cementerio
  [[3, 9], [25, 14], [70, 5], [150, -60], [215, -110]],                                             // este: aldea
  [[70, 5], [95, -90], [80, -260], [62, -420], [60, -478]],                                         // norte: castillo
  [[-3, 9], [-25, 14], [-80, 25], [-170, 70], [-245, 140]],                                         // oeste: lago
  [[-80, 25], [-120, -60], [-190, -170], [-240, -238]],                                             // pagoda
  [[-262, -298], [-200, -420], [-60, -505], [2, -530]],                                             // pagoda - castillo
  [[262, -110], [320, 0], [360, 150], [392, 238]],                                                  // aldea - bambú - torii
  [[150, 255], [260, 260], [330, 210], [360, 150]],                                                 // cerezos - bambú
  [[-300, 108], [-370, 85], [-440, 75], [-492, 64]],                                                // lago - campamento
  [[-240, -238], [-330, -170], [-420, -110], [-480, -20], [-515, 30]],                              // pagoda - campamento
  [[-262, 232], [-160, 330], [0, 420], [85, 478]],                                                  // lago - cementerio
  [[290, -140], [420, -190], [560, -235], [680, -255], [712, -260]],                                // aldea - pueblo (puerta oeste)
  [[400, 240], [520, 120], [650, -30], [790, -120], [820, -152]],                                   // torii - pueblo (puerta sur)
  [[928, -260], [1010, -80], [990, 250], [820, 560], [520, 730], [270, 610], [128, 500]],           // pueblo - llanura - cementerio
  [[-200, -420], [-300, -580], [-430, -700], [-525, -738], [-560, -748]]                            // hacia las ruinas de Takamori
];
export const ROADS: Line[] = ROAD_CTRL.map(c => ({ pts: smoothLine(c, 2), width: 2.8 }));
/** the stone stairway of the thousand torii (also a road) */
export const TORII_PATH: Line = { pts: smoothLine([[392, 238], [410, 280], [440, 330], [462, 368]], 1.5), width: 2.8 };
const TEMPLE_ROADS: P2[][] = [
  [[-120, -60], [-138, -65], [-159, -72]],
  [[150, -60], [180, -44], [201, -26], [216, -21]],
  [[150, 255], [137, 259], [119, 272]],
  [[352, -165], [348, -225], [345, -283]],
];
export const TEMPLE_PATHS: Line[] = TEMPLE_ROADS.map(points => ({ pts: smoothLine(points, 2), width: 2.8 }));
ROADS.push(TORII_PATH, ...TEMPLE_PATHS);

// ------------------------------------------------------------ canyon paths (built by canyons.ts)
/** a winding path between rock walls: the main way through, side trails, and the nooks they end in */
export interface Canyon { id: string; main: Line; branches: Line[]; nooks: P2[]; width: number }
export const CANYONS: Canyon[] = [];
{
  const specs: { id: string; from: P2; to: P2; approach: P2[]; seed: number }[] = [
    { id: 'desfiladero-viento', from: [-830, 120], to: [-1100, 250], approach: [[-492, 64], [-620, 85], [-760, 108]], seed: 11 },
    { id: 'desfiladero-ecos', from: [255, -840], to: [355, -1085], approach: [[82, -300], [150, -520], [225, -760]], seed: 22 },
    { id: 'desfiladero-cuervo', from: [455, 875], to: [300, 1105], approach: [[520, 730], [480, 815]], seed: 33 },
    { id: 'desfiladero-zorros', from: [-345, 365], to: [-520, 505], approach: [[-200, 318], [-265, 330]], seed: 44 }
  ];
  const W = 2.6;
  /** a path from a to b that snakes from side to side (two waves, so the bends never repeat) */
  const snake = (a: P2, b: P2, amp: number, waves: number, R: () => number): P2[] => {
    const dx = b[0] - a[0], dz = b[1] - a[1], len = Math.hypot(dx, dz), nx = -dz / len, nz = dx / len, ph = R() * 6.28, ph2 = R() * 6.28;
    const pts: P2[] = [];
    for (let i = 0, n = Math.max(4, Math.round(len / 9)); i <= n; i++) {
      const t = i / n, env = Math.sin(t * Math.PI), o = env * amp * (Math.sin(t * waves * 6.28 + ph) + 0.45 * Math.sin(t * waves * 2.3 * 6.28 + ph2));
      pts.push([a[0] + dx * t + nx * o, a[1] + dz * t + nz * o]);
    }
    return smoothLine(pts, 2);
  };
  const tooClose = (p: P2, lines: P2[][], d: number) => lines.some(l => l.some(q => Math.hypot(q[0] - p[0], q[1] - p[1]) < d));
  for (const sp of specs) {
    const R = seeded(sp.seed);
    const main = snake(sp.from, sp.to, 22 + R() * 8, 2.6 + R() * 1.2, R);
    const branches: Line[] = [], nooks: P2[] = [];
    for (let k = 0, tries = 0; k < 5 && tries < 40; tries++) {
      const i = Math.floor(main.length * (0.15 + R() * 0.7)), [px, pz] = main[i], [qx, qz] = main[Math.min(main.length - 1, i + 1)];
      const l = Math.hypot(qx - px, qz - pz) || 1, side = R() < 0.5 ? -1 : 1, len = 30 + R() * 40;
      const a: P2 = [px, pz], b: P2 = [px - (qz - pz) / l * side * len, pz + (qx - px) / l * side * len];
      const path = snake(a, b, 6 + R() * 7, 1 + R() * 1.4, R);
      // cut a side trail short where it would run into the main path or another trail
      let cut = path.length;
      for (let j = 6; j < path.length; j++) if (tooClose(path[j], [main.filter((_, m) => Math.abs(m - i) > 6), ...branches.map(br => br.pts)], 13)) { cut = j - 3; break; }
      if (cut < 12) continue;
      const pts = path.slice(0, cut);
      branches.push({ pts, width: W }); nooks.push(pts[pts.length - 1]); k++;
    }
    CANYONS.push({ id: sp.id, main: { pts: main, width: W }, branches, nooks, width: W });
    ROADS.push({ pts: smoothLine([...sp.approach, sp.from], 2), width: 2.8 }, { pts: main, width: W }, ...branches);
  }
}

// ------------------------------------------------------------ bridges (where a road crosses the river)
export interface Bridge { x: number; z: number; dir: number; len: number; width: number }
function segHit(a: P2, b: P2, c: P2, d: P2): P2 | null {
  const r = [b[0] - a[0], b[1] - a[1]], s = [d[0] - c[0], d[1] - c[1]], den = r[0] * s[1] - r[1] * s[0];
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c[0] - a[0]) * s[1] - (c[1] - a[1]) * s[0]) / den, u = ((c[0] - a[0]) * r[1] - (c[1] - a[1]) * r[0]) / den;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1 ? [a[0] + r[0] * t, a[1] + r[1] * t] : null;
}
export const BRIDGES: Bridge[] = [];
for (const road of ROADS) for (let i = 0; i < road.pts.length - 1; i++) {
  const a = road.pts[i], b = road.pts[i + 1];
  for (let j = 0; j < RIVER.pts.length - 1; j++) {
    const h = segHit(a, b, RIVER.pts[j], RIVER.pts[j + 1]);
    if (h && !BRIDGES.some(br => Math.hypot(br.x - h[0], br.z - h[1]) < 20)) {
      BRIDGES.push({ x: h[0], z: h[1], dir: Math.atan2(b[0] - a[0], b[1] - a[1]), len: RIVER.width + 7, width: road.width + 0.6 });
    }
  }
}

// ------------------------------------------------------------ distances
export function segDist(px: number, pz: number, a: P2, b: P2) {
  const dx = b[0] - a[0], dz = b[1] - a[1], l2 = dx * dx + dz * dz;
  const t = l2 > 0 ? Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / l2)) : 0;
  return Math.hypot(px - a[0] - dx * t, pz - a[1] - dz * t);
}
export function lineDist(px: number, pz: number, l: Line) {
  let d = Infinity;
  for (let i = 0; i < l.pts.length - 1; i++) {
    const a = l.pts[i];
    if (Math.abs(a[0] - px) > d + 8 || Math.abs(a[1] - pz) > d + 8) continue;
    d = Math.min(d, segDist(px, pz, a, l.pts[i + 1]));
  }
  return d;
}
export function inLake(x: number, z: number, margin = 0) {
  for (const l of LAKES) {
    const d = Math.hypot(x - l.x, z - l.z);
    if (d < l.R * 1.2 + margin && d < lakeRadius(l, Math.atan2(z - l.z, x - l.x)) + margin) return true;
  }
  return false;
}

// ------------------------------------------------------------ noise (shared by terrain and biomes)
function hash2(x: number, z: number) {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export const fbm = (x: number, z: number, oct = 4) => {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { s += vnoise(x * f + i * 17.3, z * f - i * 9.1) * a; a *= 0.5; f *= 2.03; }
  return s / (1 - Math.pow(0.5, oct));
};
/** small seeded PRNG (mulberry32) */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------------------ biomes
export interface Biome { density: number; sakura: number; pine: number; cypress: number; bamboo: number; bush: number; rock: number }
const near = (x: number, z: number, id: string, k = 1) => { const p = place(id); return Math.max(0, 1 - Math.hypot(x - p.x, z - p.z) / (p.r * k)); };
export function biomeAt(x: number, z: number): Biome {
  const r = Math.hypot(x, z);
  const sak = near(x, z, 'cerezos', 1.2), bam = near(x, z, 'bambu', 1.2), pin = near(x, z, 'pinos', 1.1);
  const cem = near(x, z, 'cementerio', 2.5), cas = near(x, z, 'castillo', 2.2);
  const neg = near(x, z, 'bosquenegro', 1.1), lla = near(x, z, 'llanura', 1.1), rui = near(x, z, 'ruinas', 1.8);
  const rz = rockZone(x, z);
  // forests vs open meadows: low-frequency noise, denser towards the mountains
  const n = fbm(x * 0.0065 + 3, z * 0.0065 - 7, 3);
  let density = THREE.MathUtils.smoothstep(n, 0.42, 0.72) * 0.8 + 0.06 + THREE.MathUtils.smoothstep(r, WORLD_R - 320, WORLD_R - 20) * 0.5;
  density = Math.max(density * (1 - lla * 0.85), sak * 0.75, bam * 1.1, pin * 0.9, neg * 1.15) * (1 - rz * 0.6);
  return {
    density: Math.min(1, density),
    sakura: 0.25 + sak * 6 + cas * 0.6,
    pine: 0.35 + pin * 5 + neg * 1.5 + rz * 1.5 + THREE.MathUtils.smoothstep(r, WORLD_R - 420, WORLD_R - 60) * 1.2,
    cypress: 0.3 + cem * 3 + cas * 1.5 + pin * 1 + neg * 7 + rui * 2,
    bamboo: 0.12 + bam * 9,
    bush: 0.5 + sak * 0.8 + lla * 1.2,
    rock: 0.25 + pin * 0.8 + rui * 2 + rz * 4 + THREE.MathUtils.smoothstep(r, WORLD_R - 340, WORLD_R - 60) * 1.5
  };
}

// ------------------------------------------------------------ rocky country and small hills
const ROCKY = ['pedregal', 'riscos', 'canchal'].map(place);
const FLATS = () => PLACES.filter(p => p.flat > 0);
let flats: Place[] | null = null;
/** 0..1: how rocky the land is here (the three rocky regions, plus scattered stony patches everywhere) */
export function rockZone(x: number, z: number) {
  let v = 0;
  for (const p of ROCKY) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.r * 1.15) v = Math.max(v, 1 - THREE.MathUtils.smoothstep(d, p.r * 0.55, p.r * 1.15)); }
  if (v < 0.75) v = Math.max(v, THREE.MathUtils.smoothstep(fbm(x * 0.0045 + 11, z * 0.0045 - 5, 3), 0.63, 0.73) * 0.75);
  if (v <= 0) return 0;
  // never in the towns, temples and shrines
  for (const p of (flats ??= FLATS())) { const d = Math.hypot(x - p.x, z - p.z); if (d < p.flat + p.blend) v *= THREE.MathUtils.smoothstep(d, p.flat, p.flat + p.blend); }
  return v;
}
/** bare rock showing through the ground (no grass), in patches across the rocky country */
export function rockyGround(x: number, z: number) {
  const rz = rockZone(x, z);
  return rz > 0.5 && fbm(x * 0.035 + 3, z * 0.035, 2) > 0.64 - (rz - 0.5) * 0.12;
}
/** plateaus with cliffs all round (a mesa): some have a stone ramp up to the top (and the big ones a
 *  second level with its own ramp), the rest can only be walked round. ramp: angle the ramp leaves at */
export interface Mesa { x: number; z: number; R: number; H: number; ph: number; ph2: number; ramp: number | null; L: number; W: number; base: number }
export const MESAS: Mesa[] = [];
export const mesaRadius = (m: Mesa, a: number) => m.R * (1 + 0.16 * Math.sin(3 * a + m.ph) + 0.09 * Math.sin(5 * a + m.ph2));
{
  const R = seeded(7777);
  const fits = (x: number, z: number, reach: number) => {
    const d = Math.hypot(x, z);
    if (d < 150 || d > WORLD_R - 110) return false;
    if (PLACES.some(p => p.flat > 0 && Math.hypot(x - p.x, z - p.z) < p.flat + p.blend + reach + 8)) return false;
    if (MESAS.some(m => m.base === 0 && Math.hypot(m.x - x, m.z - z) < m.R * 1.3 + m.L + reach + 10)) return false;
    return !(inLake(x, z, reach + 15) || lineDist(x, z, RIVER) < reach + 16 || ROADS.some(rd => lineDist(x, z, rd) < reach + 12));
  };
  const add = (x: number, z: number, big: boolean) => {
    const Rr = big ? 24 + R() * 14 : 12 + R() * 14, H = 4 + R() * (big ? 5 : 4), climb = big || R() < 0.4;
    const L = H * 3.4, W = 6.5;
    if (!fits(x, z, Rr * 1.3 + (climb ? L : 0))) return false;
    const m: Mesa = { x, z, R: Rr, H, ph: R() * 6.28, ph2: R() * 6.28, ramp: climb ? R() * 6.28 : null, L, W, base: 0 };
    MESAS.push(m);
    // a second level on the big ones you can climb, with its own ramp starting on the first
    if (big && Rr > 28 && R() < 0.7) {
      const H2 = 3 + R() * 2.5, R2 = Rr * 0.32, L2 = H2 * 3.2, kid: Mesa = { x, z, R: R2, H: H2, ph: R() * 6.28, ph2: R() * 6.28, ramp: 0, L: L2, W: 5.5, base: H };
      // its ramp must come down onto the first level, well inside that level's rim
      let best = -1, room = -Infinity;
      for (let k = 0; k < 16; k++) {
        const ang = (k / 16) * Math.PI * 2 + R() * 0.2, free = mesaRadius(m, ang) - (mesaRadius(kid, ang) + L2 + 5);
        if (free > room) { room = free; best = ang; }
      }
      if (room > 2) { kid.ramp = best; MESAS.push(kid); }
    }
    return true;
  };
  // the four zones of broken country
  for (const id of ['mesetas-ceniza', 'mesetas-escalones', 'mesetas-bruma', 'mesetas-halcon']) {
    const p = place(id);
    for (let t = 0, n = 0; n < 8 && t < 400; t++) {
      const a = R() * Math.PI * 2, d = Math.sqrt(R()) * p.r;
      if (add(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, n < 3)) n++;
    }
  }
  // and some lone ones anywhere
  for (let t = 0, n = 0; n < 24 && t < 3000; t++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * WORLD_R;
    if (add(Math.cos(a) * d, Math.sin(a) * d, R() < 0.3)) n++;
  }
}
const MB = 120, mesaBuckets = new Map<number, Mesa[]>();
for (const m of MESAS) {
  const reach = m.R * 1.3 + m.L + 8;
  for (let i = Math.floor((m.x - reach) / MB); i <= Math.floor((m.x + reach) / MB); i++)
    for (let j = Math.floor((m.z - reach) / MB); j <= Math.floor((m.z + reach) / MB); j++) {
      const k = (i + 64) * 128 + (j + 64); let l = mesaBuckets.get(k); if (!l) mesaBuckets.set(k, l = []); l.push(m);
    }
}
const mesasAt = (x: number, z: number) => mesaBuckets.get((Math.floor(x / MB) + 64) * 128 + Math.floor(z / MB) + 64) ?? [];
/** the ramp of a mesa: unit direction out of the mesa, and the point on the rim where it starts */
export function mesaRamp(m: Mesa) {
  const a = m.ramp!, ux = Math.cos(a), uz = Math.sin(a), rim = mesaRadius(m, a);
  return { ux, uz, rim, x0: m.x + ux * rim, z0: m.z + uz * rim };
}
/** height the plateaus add here: a cliff 5 m wide round the rim, and the ramp down from it */
export function mesaHeight(x: number, z: number) {
  let v = 0;
  for (const m of mesasAt(x, z)) {
    const dx = x - m.x, dz = z - m.z, d = Math.hypot(dx, dz);
    if (d > m.R * 1.3 + m.L + 6) continue;
    const rr = mesaRadius(m, Math.atan2(dz, dx));
    let p = m.H * (1 - THREE.MathUtils.smoothstep(d, rr, rr + 5));
    if (d < rr) p += m.H * 0.1 * (1 - (d / rr) ** 2);                          // a slight dome on top
    if (m.ramp !== null) {
      const { ux, uz, rim } = mesaRamp(m), s = dx * ux + dz * uz - rim, lat = Math.abs(-dx * uz + dz * ux);
      if (s > -4 && s < m.L + 5 && lat < m.W / 2 + 5) {
        const t = Math.min(1, Math.max(0, s / m.L)), fade = 1 - THREE.MathUtils.smoothstep(lat, m.W / 2, m.W / 2 + 4);
        p = Math.max(p, m.H * (1 - t) * fade);
      }
    }
    if (p > 0.001) v = Math.max(v, m.base + p);
  }
  return v;
}
/** on the cliff of a plateau (for the minimap) */
export function onMesaCliff(x: number, z: number) {
  for (const m of mesasAt(x, z)) {
    const d = Math.hypot(x - m.x, z - m.z), rr = mesaRadius(m, Math.atan2(z - m.z, x - m.x));
    if (Math.abs(d - rr - 2.5) < 3.5) return true;
  }
  return false;
}

/** small hills all over the world: gentle knolls, and steep rocky ones with crags on top */
export interface Hill { x: number; z: number; R: number; H: number; rocky: boolean }
export const HILLS: Hill[] = [];
{
  const R = seeded(5151);
  for (let t = 0; HILLS.length < 360 && t < 9000; t++) {
    const a = R() * Math.PI * 2, d = Math.sqrt(R()) * (WORLD_R - 70), x = Math.cos(a) * d, z = Math.sin(a) * d;
    const rz = rockZone(x, z), rocky = rz > 0.35 || R() < 0.18;
    const r = rocky ? 16 + R() * 20 : 24 + R() * 34, H = rocky ? 9 + R() * 14 : 5 + R() * 9;
    if (d < 90 || PLACES.some(p => p.flat > 0 && Math.hypot(x - p.x, z - p.z) < p.flat + p.blend + r)) continue;
    if (HILLS.some(h => Math.hypot(h.x - x, h.z - z) < (h.R + r) * 0.85)) continue;
    if (MESAS.some(m => Math.hypot(m.x - x, m.z - z) < m.R * 1.3 + m.L + r + 6)) continue;
    if (inLake(x, z, r * 1.4 + 10) || lineDist(x, z, RIVER) < r * 1.4 + 10 || ROADS.some(rd => lineDist(x, z, rd) < r * 1.35 + 6)) continue;
    HILLS.push({ x, z, R: r, H, rocky });
  }
}
const HB = 120, hillBuckets = new Map<number, Hill[]>();
for (const h of HILLS) for (let i = Math.floor((h.x - h.R * 2) / HB); i <= Math.floor((h.x + h.R * 2) / HB); i++)
  for (let j = Math.floor((h.z - h.R * 2) / HB); j <= Math.floor((h.z + h.R * 2) / HB); j++) {
    const k = (i + 64) * 128 + (j + 64); let l = hillBuckets.get(k); if (!l) hillBuckets.set(k, l = []); l.push(h);
  }
/** hills whose slopes reach this point */
export const hillsAt = (x: number, z: number) => hillBuckets.get((Math.floor(x / HB) + 64) * 128 + Math.floor(z / HB) + 64) ?? [];

// ------------------------------------------------------------ masks
// ground mask (3072², ~0.9 m / px): R = road, G = water, B = built (plazas, floors). No grass on any of them.
// tree mask (1536², ~1.8 m / px): anything > 0 keeps trees and rocks away (roads, water, places).
export const MASK_RES = 3072, TREE_RES = 1536;
/** footprints added by structures.ts / landmarks.ts before the masks are drawn: [x, z, w, d, rotY] rectangles and [x, z, r] discs
 *  (both bare ground), and clearings [x, z, r] that only keep trees and rocks away */
export const FOOTPRINTS: { rects: [number, number, number, number, number][]; discs: P2[]; discR: number[]; clearings: [number, number, number][] } = { rects: [], discs: [], discR: [], clearings: [] };

function drawLine(ctx: CanvasRenderingContext2D, pts: P2[], w: number) {
  ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.beginPath(); pts.forEach(([x, z], i) => i ? ctx.lineTo(x, z) : ctx.moveTo(x, z)); ctx.stroke();
}
function drawRiverMask(ctx: CanvasRenderingContext2D, pad: number) {
  const pts = RIVER.pts, n = pts.length, half = RIVER.width / 2;
  let along = 0, left: P2[] = [], right: P2[] = [];
  const flush = () => {
    if (left.length < 2) { left = []; right = []; return; }
    ctx.beginPath();
    ctx.moveTo(left[0][0], left[0][1]);
    for (let k = 1; k < left.length; k++) ctx.lineTo(left[k][0], left[k][1]);
    for (let k = right.length - 1; k >= 0; k--) ctx.lineTo(right[k][0], right[k][1]);
    ctx.closePath(); ctx.fill();
    left = []; right = [];
  };
  for (let i = 0; i < n; i++) {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
    let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const wl = half + riverBankOffset(along, -1) + pad;
    const wr = half + riverBankOffset(along, 1) + pad;
    left.push([pts[i][0] + dz * wl, pts[i][1] - dx * wl]);
    right.push([pts[i][0] - dz * wr, pts[i][1] + dx * wr]);
    if (i < n - 1) {
      const step = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]);
      along += step;
      if (step > 12) flush();
    }
  }
  flush();
}
function drawLake(ctx: CanvasRenderingContext2D, l: Lake, m: number) {
  ctx.beginPath();
  for (let i = 0; i <= 128; i++) { const a = (i / 128) * Math.PI * 2, r = lakeRadius(l, a) + m; ctx.lineTo(l.x + Math.cos(a) * r, l.z + Math.sin(a) * r); }
  ctx.fill();
}
function canvasFor(res: number) {
  const c = document.createElement('canvas'); c.width = c.height = res;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, res, res);
  const s = res / SIZE; ctx.setTransform(s, 0, 0, s, HALF * s, HALF * s);   // draw in world metres, +x right, +z down
  return ctx;
}

export let groundMask: Uint8Array<ArrayBuffer> = new Uint8Array(4);
let treeMask: Uint8Array = new Uint8Array(1);
/** draw both masks; call once structures.ts has registered its footprints */
export function buildMasks() {
  const g = canvasFor(MASK_RES);
  g.globalCompositeOperation = 'lighter';
  g.strokeStyle = '#ff0000'; for (const r of ROADS) drawLine(g, r.pts, r.width - 0.2);
  g.strokeStyle = g.fillStyle = '#00ff00';
  drawRiverMask(g, 0.4);
  for (const l of LAKES) drawLake(g, l, 0.8);
  g.fillStyle = '#0000ff';
  for (const [x, z, w, d, ry] of FOOTPRINTS.rects) { g.save(); g.translate(x, z); g.rotate(-ry); g.fillRect(-w / 2, -d / 2, w, d); g.restore(); }
  FOOTPRINTS.discs.forEach(([x, z], i) => { g.beginPath(); g.arc(x, z, FOOTPRINTS.discR[i], 0, Math.PI * 2); g.fill(); });
  // bare rock: looked for on a coarse grid first, then in 4 m steps where the land is rocky enough
  g.fillStyle = '#0000c0';
  for (let bx = -HALF; bx < HALF; bx += 32) for (let bz = -HALF; bz < HALF; bz += 32) {
    if (Math.max(rockZone(bx + 16, bz + 16), rockZone(bx, bz), rockZone(bx + 32, bz + 32)) < 0.45) continue;
    for (let x = bx; x < bx + 32; x += 4) for (let z = bz; z < bz + 32; z += 4) if (rockyGround(x + 2, z + 2)) g.fillRect(x - 0.4, z - 0.4, 4.8, 4.8);
  }
  groundMask = new Uint8Array(g.getImageData(0, 0, MASK_RES, MASK_RES).data);

  const t = canvasFor(TREE_RES);
  t.strokeStyle = t.fillStyle = '#fff';
  for (const r of ROADS) drawLine(t, r.pts, r.width + 7);
  drawLine(t, RIVER.pts, RIVER.width + 8); for (const l of LAKES) drawLake(t, l, 6);
  for (const p of PLACES) if (p.flat > 0 && p.id !== 'claro') { t.beginPath(); t.arc(p.x, p.z, p.r, 0, Math.PI * 2); t.fill(); }
  for (const [x, z, w, d, ry] of FOOTPRINTS.rects) { t.save(); t.translate(x, z); t.rotate(-ry); t.fillRect(-w / 2 - 3, -d / 2 - 3, w + 6, d + 6); t.restore(); }
  FOOTPRINTS.discs.forEach(([x, z], i) => { t.beginPath(); t.arc(x, z, FOOTPRINTS.discR[i] + 3, 0, Math.PI * 2); t.fill(); });
  for (const [x, z, r] of FOOTPRINTS.clearings) { t.beginPath(); t.arc(x, z, r, 0, Math.PI * 2); t.fill(); }
  const td = t.getImageData(0, 0, TREE_RES, TREE_RES).data;
  treeMask = new Uint8Array(TREE_RES * TREE_RES);
  for (let i = 0; i < treeMask.length; i++) treeMask[i] = td[i * 4];
}
const px = (v: number, res: number) => Math.max(0, Math.min(res - 1, Math.floor((v + HALF) / SIZE * res)));
/** ground mask channels at a point: [road, water, built] in 0..255 */
export function groundAt(x: number, z: number): [number, number, number] {
  const i = (px(z, MASK_RES) * MASK_RES + px(x, MASK_RES)) * 4;
  return [groundMask[i], groundMask[i + 1], groundMask[i + 2]];
}
/** true where no tree / rock / bush should grow */
export const treeBlocked = (x: number, z: number) => treeMask[px(z, TREE_RES) * TREE_RES + px(x, TREE_RES)] > 40;
