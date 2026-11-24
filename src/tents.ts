// Camp tents: a ridge tent of canvas (the ronin camp) or of stitched hides (the oni camps). The cloth
// sags between the poles and bellies in between ridge and hem, falls in folds that deepen towards the
// ground, is pegged at the hem and scalloped in between; a front flap hangs loose and the other is
// gathered back and tied, so the dark inside shows. Seams, patches, a mended tear, water stains,
// mud splashed up from the ground and a frayed hem are painted into a procedural texture; uprights,
// guy ropes and stakes finish it. Built once per variant and shared: three draw calls per tent.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { M, CLS, tagMat } from './materials';
import { surfaceMaterial } from './surfaces';
import { seeded } from './map';

export type TentKind = 'canvas' | 'hide';
type V3 = [number, number, number];

const H = 2.5, W = 1.6, HL = 2.1, OV = 0.12;     // ridge height, half width at the hem, half length, overhang
const NL = 10, NS = 5;                            // panel grid: along the ridge, ridge to hem

// ------------------------------------------------------------ textures
const smooth = (a: number, b: number, v: number) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
/** value noise on a grid of n cells, wrapping horizontally */
function noise2(r: () => number, n: number) {
  const g = Array.from({ length: (n + 1) * (n + 1) }, r);
  return (u: number, v: number) => {
    const x = u * n, y = v * n, i = Math.floor(x), j = Math.floor(y), fx = x - i, fy = y - j;
    const at = (a: number, b: number) => g[(Math.min(b, n)) * (n + 1) + (a % n)];
    const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    return (at(i, j) * (1 - sx) + at(i + 1, j) * sx) * (1 - sy) + (at(i, j + 1) * (1 - sx) + at(i + 1, j + 1) * sx) * sy;
  };
}

function stitches(x: CanvasRenderingContext2D, pts: [number, number][], col: string, dash = [3, 3], w = 1) {
  x.strokeStyle = col; x.lineWidth = w; x.setLineDash(dash);
  x.beginPath(); x.moveTo(...pts[0]); for (const p of pts.slice(1)) x.lineTo(...p); x.stroke(); x.setLineDash([]);
}

/** Canvas y = 0 is the ridge (v = 1), the bottom row is the hem (v = 0); u runs along the tent. */
function clothTexture(kind: TentKind) {
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const x = c.getContext('2d')!, r = seeded(kind === 'canvas' ? 515 : 616);
  const blot = noise2(r, 6), fine = noise2(r, 22), tide = noise2(r, 4), mud = noise2(r, 30);
  // hide pieces: a few cells, each its own animal
  const cells = Array.from({ length: 9 }, () => ({ x: r() * S, y: r() * S * 0.92, tone: 0.78 + r() * 0.42, fur: r() < 0.4 }));
  const img = x.createImageData(S, S), d = img.data;
  const base = kind === 'canvas' ? [214, 202, 174] : [158, 118, 86];
  for (let py = 0; py < S; py++) for (let px = 0; px < S; px++) {
    const u = px / S, v = 1 - py / S, k = (py * S + px) * 4;
    let tone = 1, seam = 0;
    if (kind === 'canvas') {
      const weave = ((px & 1) ^ (py & 1)) ? 0.04 : -0.04;
      tone = 1 + weave + 0.14 * (blot(u, v) - 0.5) + 0.08 * (fine(u, v) - 0.5);
      // water stains: a darker tide line round paler blooms
      const t = tide(u, v * 0.8);
      tone *= 1 - 0.18 * (1 - smooth(0.0, 0.03, Math.abs(t - 0.62))) - 0.05 * smooth(0.62, 0.7, t);
      // smoke from the fire greys the ridge
      tone *= 1 - 0.16 * smooth(0.78, 1, v) * (0.5 + blot(u * 2, v));
    } else {
      let d1 = 1e9, d2 = 1e9, ci = 0;
      for (let i = 0; i < cells.length; i++) {
        const dx = Math.min(Math.abs(px - cells[i].x), S - Math.abs(px - cells[i].x)), dd = Math.hypot(dx, (py - cells[i].y) * 1.3);
        if (dd < d1) { d2 = d1; d1 = dd; ci = i; } else if (dd < d2) d2 = dd;
      }
      const cell = cells[ci];
      seam = 1 - smooth(1.5, 3.5, d2 - d1);
      tone = cell.tone * (1 + 0.3 * (blot(u, v) - 0.5) + 0.12 * (fine(u, v) - 0.5));
      if (cell.fur) tone *= 0.8 + 0.5 * fine(u * 3.1, v * 3.1) * ((px * 7 + py * 13) % 5 < 2 ? 1.3 : 0.8);
      tone *= 1 - 0.55 * seam;
    }
    // painted drape: tension wrinkles fanning down from the tops of the uprights, soft folds at the hem
    for (const cu of [0, 1]) {
      const du = (u - cu) * 1.5, dv = 1 - v, rr = Math.hypot(du, dv);
      tone *= 1 + 0.13 * Math.sin(Math.atan2(dv, Math.abs(du)) * 16 + fine(u, v) * 2) * Math.exp(-rr * 2.6) * smooth(0.02, 0.1, rr);
    }
    tone *= 1 + 0.09 * Math.sin(u * Math.PI * 2 * 9 + fine(u, v * 0.3) * 4) * smooth(0.55, 0.05, v);
    // mud splashed up from the ground, thickest at the hem
    const splash = Math.pow(smooth(0.32, 0.0, v), 1.4) * (0.45 + 0.75 * mud(u, v)) + (mud(u * 1.7, v * 1.7) > 0.8 && v < 0.3 ? 0.35 : 0);
    const dirt = Math.min(1, splash);
    const mc = kind === 'canvas' ? [86, 66, 44] : [44, 32, 22];
    for (let ch = 0; ch < 3; ch++) d[k + ch] = Math.max(0, Math.min(255, base[ch] * tone * (1 - dirt) + mc[ch] * dirt));
    d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);

  if (kind === 'canvas') {
    // ridge tape and hem band, each held by a row of stitches
    x.fillStyle = 'rgba(70,52,34,0.35)'; x.fillRect(0, 0, S, 9);
    stitches(x, [[0, 11], [S, 11]], 'rgba(60,44,30,0.7)');
    x.fillStyle = 'rgba(70,52,34,0.22)'; x.fillRect(0, S - 26, S, 12);
    stitches(x, [[0, S - 27], [S, S - 27]], 'rgba(60,44,30,0.6)');
    // panel seams: a darker felled seam with stitching either side
    for (const sx of [64, 128, 192]) {
      const j = (r() - 0.5) * 4;
      x.fillStyle = 'rgba(60,44,30,0.4)'; x.fillRect(sx + j - 1.5, 0, 3, S);
      x.fillStyle = 'rgba(255,248,230,0.18)'; x.fillRect(sx + j + 1.5, 0, 2, S);
      stitches(x, [[sx + j - 4, 0], [sx + j - 4, S]], 'rgba(60,44,30,0.55)', [2, 3]);
      stitches(x, [[sx + j + 5, 0], [sx + j + 5, S]], 'rgba(60,44,30,0.55)', [2, 3]);
    }
    // patches sewn on over old holes: newer canvas, an indigo offcut, a scrap of old sail
    const fills = ['rgba(236,226,200,0.92)', 'rgba(52,62,86,0.9)', 'rgba(150,128,96,0.9)', 'rgba(226,214,186,0.9)'];
    for (let i = 0; i < 4; i++) {
      const w = 22 + r() * 26, h = 18 + r() * 24, cx = 20 + r() * (S - 40), cy = 40 + r() * (S - 110);
      x.save(); x.translate(cx, cy); x.rotate((r() - 0.5) * 0.3);
      x.fillStyle = 'rgba(40,30,20,0.35)'; x.fillRect(-w / 2 + 1.5, -h / 2 + 2, w, h);    // the patch's thickness
      x.fillStyle = fills[i]; x.fillRect(-w / 2, -h / 2, w, h);
      x.globalAlpha = 0.18; x.fillStyle = '#000';
      for (let s = 0; s < 40; s++) x.fillRect(-w / 2 + r() * w, -h / 2 + r() * h, 1 + r() * 3, 1);
      x.globalAlpha = 1;
      x.strokeStyle = 'rgba(40,28,18,0.75)'; x.lineWidth = 1; x.setLineDash([2, 2]); x.strokeRect(-w / 2 + 2.5, -h / 2 + 2.5, w - 5, h - 5); x.setLineDash([]);
      x.restore();
    }
    // a mended tear: a ragged dark rent closed with cross stitches
    const tx = 30 + r() * 180, ty = 70 + r() * 90;
    const tear: [number, number][] = []; for (let i = 0; i <= 8; i++) tear.push([tx + i * 4, ty + Math.sin(i * 1.7) * 2.5 + i * 1.2]);
    x.strokeStyle = 'rgba(30,22,14,0.8)'; x.lineWidth = 1.6; x.beginPath(); x.moveTo(...tear[0]); for (const p of tear) x.lineTo(...p); x.stroke();
    x.strokeStyle = 'rgba(70,50,30,0.85)'; x.lineWidth = 1;
    for (const [px, py] of tear) { x.beginPath(); x.moveTo(px - 2, py - 3); x.lineTo(px + 2, py + 3); x.moveTo(px + 2, py - 3); x.lineTo(px - 2, py + 3); x.stroke(); }
  } else {
    // crude cross stitches of sinew along the seams between the hides
    x.strokeStyle = 'rgba(214,190,140,0.85)'; x.lineWidth = 1.2;
    for (let i = 0; i < 2600; i++) {
      const px = Math.floor(r() * S), py = Math.floor(r() * S), k = (py * S + px) * 4;
      if (py > S * 0.8 || d[k] > 95 || ((px * 31 + py * 17) % 7)) continue;   // only on the dark seams, thinned out
      x.beginPath(); x.moveTo(px - 2.5, py - 2.5); x.lineTo(px + 2.5, py + 2.5); x.moveTo(px + 2.5, py - 2.5); x.lineTo(px - 2.5, py + 2.5); x.stroke();
    }
    // the war band's mark daubed in red ochre, rough and dripping
    x.strokeStyle = 'rgba(150,26,18,0.85)'; x.fillStyle = 'rgba(150,26,18,0.85)'; x.lineCap = 'round';
    for (const cx of [64, 192]) {
      const cy = 96;
      x.lineWidth = 6; x.beginPath(); x.arc(cx, cy, 24, 0.3, Math.PI * 2 - 0.2); x.stroke();
      x.lineWidth = 5; x.beginPath(); x.moveTo(cx - 12, cy - 14); x.lineTo(cx + 3, cy + 16); x.moveTo(cx + 12, cy - 14); x.lineTo(cx - 3, cy + 16); x.stroke();
      for (let i = 0; i < 5; i++) { const dx = cx - 20 + r() * 40, dy = cy + 18 + r() * 8; x.fillRect(dx, dy, 2, 6 + r() * 16); }
    }
    x.lineCap = 'butt';
  }

  // frayed hem: torn notches, loose threads hanging in them (the material cuts with alphaTest)
  const hem = x.getImageData(0, 0, S, S), hd = hem.data;
  const rag = noise2(r, 40);
  for (let px = 0; px < S; px++) {
    const deep = rag(px / S, 0.5) > 0.72 ? 6 + rag(px / S, 0.9) * 10 : 0;
    const cut = Math.floor(2 + rag(px / S, 0.2) * 5 + deep + (kind === 'hide' ? 4 : 0));
    const thread = (px * 37) % 11 === 0 || (px * 53) % 17 === 0;
    for (let py = S - cut; py < S; py++) {
      const k = (py * S + px) * 4;
      if (thread && py < S - 1) { hd[k] *= 0.8; hd[k + 1] *= 0.8; hd[k + 2] *= 0.8; continue; }
      hd[k + 3] = 0;
    }
  }
  x.putImageData(hem, 0, 0);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------ geometry
class Mesher {
  pos: number[] = []; uv: number[] = []; col: number[] = []; idx: number[] = [];
  v(p: V3, u: number, w: number, shade = 1) { this.pos.push(...p); this.uv.push(u, w); this.col.push(shade, shade, shade); return this.pos.length / 3 - 1; }
  /** a triangle, wound so its face looks along `out` */
  tri(a: number, b: number, c: number, out: V3) {
    const P = (i: number) => new THREE.Vector3(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2]);
    const A = P(a), n = P(b).sub(A).cross(P(c).sub(A));
    if (n.dot(new THREE.Vector3(...out)) < 0) this.idx.push(a, c, b); else this.idx.push(a, b, c);
  }
  quad(a: number, b: number, c: number, d: number, out: V3) { this.tri(a, b, c, out); this.tri(a, c, d, out); }
  geometry() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx); g.computeVertexNormals();
    return g;
  }
}

const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

interface Variant { cloth: THREE.BufferGeometry; wood: THREE.BufferGeometry; rope: THREE.BufferGeometry }

function buildVariant(seed: number, mirror: number): Variant {
  const r = seeded(seed), ph = [r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28];
  const m = new Mesher(), X = (p: V3): V3 => [p[0] * mirror, p[1], p[2]];
  const len = Math.hypot(H, W), nx = H / len, ny = W / len;

  /** a point on a side panel: t along the tent, s from the ridge (0) to the hem (1); shade from its folds */
  function panel(sg: number, t: number, s: number): { p: V3; shade: number } {
    const z = -HL - OV + t * 2 * (HL + OV), zt = Math.max(-1, Math.min(1, z / HL));
    const ridge = H - 0.17 * (1 - zt * zt);                    // the ridge sags between the uprights
    const peg = Math.abs(Math.sin(Math.PI * 3 * t));           // 0 where the hem is pegged down
    const yh = -0.06 + 0.14 * peg, xh = W + 0.07 * (1 - peg);   // scalloped hem, pulled out at the pegs
    let x = xh * s, y = ridge + (yh - ridge) * s;
    const ph2 = sg > 0 ? ph[0] : ph[1], ph3 = sg > 0 ? ph[2] : ph[3];
    const belly = 0.14 * Math.sin(Math.PI * s) * (1 - Math.pow(2 * t - 1, 4)) + 0.07 * peg * s * s;
    const amp = 0.03 + 0.12 * s * s;                         // folds deepen as the cloth falls
    const fold = amp * Math.sin(z * 4.4 + s * 1.6 + ph2) + 0.035 * Math.sin(z * 2.3 - s * 3.1 + ph3) * Math.sin(Math.PI * s);
    const off = fold - belly;
    x += nx * off; y += ny * off;
    const shade = Math.max(0.62, Math.min(1.08, 0.95 + 2.3 * fold - 0.8 * belly)) * (1 - 0.24 * Math.pow(s, 4));
    return { p: [sg * x, y, z], shade };
  }

  // the two side panels
  for (const sg of [-1, 1]) {
    const out: V3 = [sg * nx * mirror, ny, 0], ids: number[][] = [];
    for (let i = 0; i <= NL; i++) {
      ids.push([]);
      for (let j = 0; j <= NS; j++) {
        const t = i / NL, s = j / NS, { p, shade } = panel(sg, t, s);
        ids[i].push(m.v(X(p), sg > 0 ? t : 1 - t, 1 - s, shade));
      }
    }
    for (let i = 0; i < NL; i++) for (let j = 0; j < NS; j++) m.quad(ids[i][j], ids[i + 1][j], ids[i + 1][j + 1], ids[i][j + 1], out);
  }

  // gables: the flat cloth maps onto the middle of the texture
  const guv = (p: V3, uo: number): [number, number] => [uo + p[0] / W * 0.22, Math.max(0, Math.min(1, p[1] / H))];
  const apex = H - 0.05, gw = W * 0.93;
  // back gable, billowing in a little
  {
    const out: V3 = [0, 0, -1], rows: number[][] = [];
    for (let k = 0; k <= 3; k++) {
      rows.push([]);
      for (let j = 0; j <= k; j++) {
        const f = k / 3, xo = k ? -gw * f + (2 * gw * f) * (j / k) : 0, yo = k === 3 ? -0.06 : apex * (1 - f);
        const inward = 0.1 * Math.sin(Math.PI * f) * (1 - Math.abs(xo) / (gw * f + 0.01));
        const [u, w] = guv([xo, Math.max(0, yo), 0], 0.35);
        rows[k].push(m.v(X([xo, yo, -HL + inward]), u, w, 0.86 - 0.08 * f));
      }
    }
    for (let k = 0; k < 3; k++) for (let j = 0; j <= k; j++) {
      m.tri(rows[k][j], rows[k + 1][j], rows[k + 1][j + 1], out);
      if (j < k) m.tri(rows[k][j], rows[k + 1][j + 1], rows[k][j + 1], out);
    }
  }
  // front: one flap hangs loose, swinging out at the bottom; the other is gathered back and tied
  const out: V3 = [0, 0, 1], zf = HL + 0.01;
  const A: V3 = [0, apex, zf], O: V3 = [0, -0.06, zf];
  const pt = (p: V3, orig: V3, shade: number) => { const [u, w] = guv(orig, 0.65); return m.v(X(p), u, w, shade); };
  {
    const BL: V3 = [-gw, -0.06, zf], D: V3 = [-0.24, -0.06, zf + 0.14];
    const mAB = lerp3(A, BL, 0.5), mAD = add3(lerp3(A, D, 0.5), [-0.04, 0, 0.07]), mBD = add3(lerp3(BL, D, 0.5), [0, 0.02, 0.12]);
    const a = pt(A, A, 0.95), b = pt(BL, BL, 0.8), d = pt(D, O, 0.86);
    const ab = pt(mAB, lerp3(A, BL, 0.5), 0.9), ad = pt(mAD, lerp3(A, O, 0.5), 1.02), bd = pt(mBD, lerp3(BL, O, 0.5), 0.78);
    m.tri(a, ab, ad, out); m.tri(ab, b, bd, out); m.tri(ad, bd, d, out); m.tri(ab, bd, ad, out);
  }
  const T: V3 = [W * 0.72, H * 0.36, zf + 0.22];
  {
    const BR: V3 = [gw, -0.06, zf], e1 = lerp3(A, BR, 1 / 3), e2 = lerp3(A, BR, 2 / 3);
    const c1: V3 = [W * 0.16, H * 0.8, zf + 0.13], c2: V3 = [W * 0.4, H * 0.57, zf + 0.25];
    const a = pt(A, A, 0.95), i1 = pt(e1, e1, 0.82), i2 = pt(e2, e2, 0.8), br = pt(add3(BR, [0.04, 0, 0.1]), BR, 0.74);
    const f1 = pt(c1, lerp3(A, O, 1 / 3), 1.04), f2 = pt(c2, lerp3(A, O, 2 / 3), 1.06), ft = pt(T, O, 0.9);
    m.tri(a, f1, i1, out); m.quad(f1, f2, i2, i1, out); m.quad(f2, ft, br, i2, out);
  }
  const cloth = m.geometry();

  // uprights (poking out above the ridge), stakes and guy ropes
  const wood: THREE.BufferGeometry[] = [], rope: THREE.BufferGeometry[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const rod = (list: THREE.BufferGeometry[], a: V3, b: V3, rad: number, sides: number) => {
    const A = new THREE.Vector3(...X(a)), B = new THREE.Vector3(...X(b)), dir = B.clone().sub(A), l = dir.length();
    const g = new THREE.CylinderGeometry(rad, rad, l, sides, 1, sides < 5);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(up, dir.normalize()));
    g.translate((A.x + B.x) / 2, (A.y + B.y) / 2, (A.z + B.z) / 2);
    list.push(g);
  };
  const stake = (at: V3, away: V3) => {
    const top: V3 = [at[0], 0.2, at[2]], tip: V3 = [at[0] - away[0] * 0.12, -0.25, at[2] - away[2] * 0.12];
    rod(wood, tip, top, 0.035, 4);
    return top;
  };
  const top = H + 0.2;
  for (const e of [-1, 1]) {
    const z = e * (HL + 0.02);
    rod(wood, [0, -0.1, z], [0, top, z], 0.055, 5);
    // a V of guy ropes from the top of each upright
    for (const sx of [-0.7, 0.7]) {
      const st = stake([sx, 0, z + e * (e > 0 ? 1.05 : 1.35)], [sx, 0, e]);
      rod(rope, [0, top - 0.05, z], st, 0.014, 3);
    }
  }
  // side guys from the panels, one ahead and one behind
  for (const sg of [-1, 1]) for (const t of [1 / 3, 2 / 3]) {
    const { p } = panel(sg, t, 0.42), st = stake([sg * (W + 1.0), 0, p[2]], [sg, 0, 0]);
    rod(rope, p, st, 0.014, 3);
  }
  // the tie that holds the open flap back
  const tie = panel(1, 1 - 0.02, 0.55).p;
  rod(rope, add3(T, [-0.05, -0.06, 0]), tie, 0.022, 3);
  rod(rope, add3(T, [-0.04, 0.06, 0.02]), add3(T, [0.06, -0.1, -0.06]), 0.03, 4);

  return { cloth, wood: mergeGeometries(wood)!, rope: mergeGeometries(rope)! };
}

// ------------------------------------------------------------ materials and the public builder
function clothMaterial(map: THREE.Texture, tint: number) {
  const mat = M(tint, { map, vertexColors: true, roughness: 1, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5 });
  // the inside of the tent stays in shadow (seen through the open door)
  mat.onBeforeCompile = sh => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.3;');
  };
  mat.customProgramCacheKey = () => 'tent-cloth';
  return tagMat(surfaceMaterial(mat, 'cloth'), CLS.wood);
}

let mats: Record<TentKind, THREE.Material[]> | undefined, wood: THREE.Material, rope: THREE.Material;
const variants: Variant[] = [];
let count = 0;

/** a tent with its door (local +z) facing ry, base at (x, y, z) in parent space */
export function tent(parent: THREE.Object3D, kind: TentKind, x: number, y: number, z: number, ry: number, scale = 1) {
  if (!mats) {
    const canvas = clothTexture('canvas'), hide = clothTexture('hide');
    mats = {
      canvas: [0xffffff, 0xeae2d2, 0xdfe2d6].map(c => clothMaterial(canvas, c)),
      hide: [0xffffff, 0xe8d6c4, 0xdcd2c8].map(c => clothMaterial(hide, c))
    };
    wood = tagMat(surfaceMaterial(M(0x4a3628, { roughness: 0.9 }), 'wood'), CLS.wood);
    rope = tagMat(M(0xb8a070, { roughness: 1 }), CLS.wood);
    for (const [s, mirror] of [[11, 1], [23, -1], [37, -1], [51, 1]]) variants.push(buildVariant(s, mirror));
  }
  const n = count++, v = variants[n % variants.length];
  const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(scale);
  g.add(new THREE.Mesh(v.cloth, mats[kind][(n * 7 + 1) % 3]), new THREE.Mesh(v.wood, wood), new THREE.Mesh(v.rope, rope));
  parent.add(g);
  return g;
}
