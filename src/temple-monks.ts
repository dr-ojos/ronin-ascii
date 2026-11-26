// Sculpted elemental temple masters (Haru, Enji, Nami, Shiden) with bespoke procedural PBR
// textile maps (albedo, tangent-space normal, roughness, emissive), layered monastic vestments
// (pleated hakama, kosode, overlapping collars, brocade patchwork kesa, obijime cord, juzu beads,
// elemental headwear, sacred staffs, ground mandalas), and gentle meditative animation.
import * as THREE from 'three';
import { ACTOR_LAYER } from './ascii';
import { headAsset } from './assets';
import { braidedSilkPBR, forgedMetalPBR, heightToNormalTex } from './class-armor';
import { mangaFinish } from './manga-art';
import { CLS, M, shadowTree, tagMat, tagTree } from './materials';
import type { TemplePlace } from './map';
import { realHead, SCAN } from './real-head';
import { TECHNIQUES } from './techniques';
import { mandalaTex, softGlowTex } from './vfx-art';

const TAU = Math.PI * 2;
const UP = new THREE.Vector3(0, 1, 0);
const V = THREE.Vector3;

type ElementKey = 'viento' | 'fuego' | 'agua' | 'rayo';

interface MonkPalette {
  key: ElementKey;
  robeBase: string;
  robeDark: string;
  robeMotif: string;
  kesaBase: string;
  kesaPatchA: string;
  kesaPatchB: string;
  kesaBorder: string;
  obiBase: string;
  obiAccent: string;
  collar: number;
  cord: number;
  tassel: number;
  wood: number;
  metal: number;
  accent: number;
  skinTint: number;
  hair: number;
  beard?: number;
  topknot?: boolean;
}

const PALETTES: Record<ElementKey, MonkPalette> = {
  // Haru — elder wind abbot in deep pine-jade linen, celadon-gold brocade kesa, bamboo shakujō
  viento: {
    key: 'viento',
    robeBase: '#203b36', robeDark: '#12221f', robeMotif: '#5ab89d',
    kesaBase: '#336b58', kesaPatchA: '#42836c', kesaPatchB: '#285647', kesaBorder: '#e2c474',
    obiBase: '#1b2c2a', obiAccent: '#9cf2d4',
    collar: 0xebe4d2, cord: 0xd9c38c, tassel: 0x4db896,
    wood: 0x5c3e26, metal: 0xd9b86c, accent: 0x81ffcc,
    skinTint: 0xe3c3a8, hair: 0x9b9690, beard: 0xaba59d, topknot: false,
  },
  // Enji — yamabushi fire ascetic in charred-crimson robes, saffron-gold flame kesa, vajra-brazier staff
  fuego: {
    key: 'fuego',
    robeBase: '#3b1815', robeDark: '#1f0c0a', robeMotif: '#d66838',
    kesaBase: '#9c3c1c', kesaPatchA: '#ba4f24', kesaPatchB: '#7a2b14', kesaBorder: '#f0bc5e',
    obiBase: '#241210', obiAccent: '#ffaa55',
    collar: 0xeadcc7, cord: 0xc93b24, tassel: 0xd94826,
    wood: 0x3b1f16, metal: 0xe2a84b, accent: 0xff993f,
    skinTint: 0xdab496, hair: 0x241d1c, beard: 0x2e2523, topknot: false,
  },
  // Nami — lunar tide priestess/monk in deep indigo silk, silver-azure seigaiha kesa, crescent staff
  agua: {
    key: 'agua',
    robeBase: '#182840', robeDark: '#0e1829', robeMotif: '#69a8d8',
    kesaBase: '#29517a', kesaPatchA: '#356799', kesaPatchB: '#1f3e5e', kesaBorder: '#c9dff2',
    obiBase: '#162033', obiAccent: '#8fd2ff',
    collar: 0xf0f2f7, cord: 0xaecae6, tassel: 0x5aa6e0,
    wood: 0x3b3136, metal: 0xcbd9e8, accent: 0x76c5ff,
    skinTint: 0xebd1be, hair: 0x1b1d26, topknot: true,
  },
  // Shiden — thunder grandmaster in storm-violet robes, royal-gold raimon kesa, Raijin vajra staff
  rayo: {
    key: 'rayo',
    robeBase: '#221f38', robeDark: '#121021', robeMotif: '#8a9ee6',
    kesaBase: '#3d396e', kesaPatchA: '#4e498a', kesaPatchB: '#2d2a54', kesaBorder: '#f0cf73',
    obiBase: '#19172b', obiAccent: '#b8d0ff',
    collar: 0xeae8f2, cord: 0xe6d6a8, tassel: 0x7ca2f2,
    wood: 0x2b2330, metal: 0xe0c46c, accent: 0xaacbff,
    skinTint: 0xdfbfa6, hair: 0x4c4a57, beard: 0x615e6b, topknot: false,
  },
};

export interface TempleMonkRig {
  root: THREE.Group;
  body: THREE.Group;
  head: THREE.Group;
  staff: THREE.Group;
  halo: THREE.Group;
  mandala: THREE.Mesh;
  motes: THREE.Group;
  swayParts: THREE.Object3D[];
  glowMats: THREE.MeshBasicMaterial[];
  phase: number;
}

// ------------------------------------------------------------ procedural PBR textile generators
interface TextilePBR {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  emissive?: THREE.CanvasTexture;
}

const robeCache = new Map<ElementKey, TextilePBR>();
const kesaCache = new Map<ElementKey, TextilePBR>();
const obiCache = new Map<ElementKey, TextilePBR>();
let cachedWoodTex: THREE.CanvasTexture | null = null;
let cachedStrawTex: THREE.CanvasTexture | null = null;

function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function makeCanvas(w: number, h: number) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, x: c.getContext('2d')! };
}

function toTex(c: HTMLCanvasElement, srgb: boolean, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** Fine woven linen/silk robe PBR with elemental damask motifs, vertical pleat shading, and gilded hem */
function robeTextilePBR(p: MonkPalette): TextilePBR {
  const cached = robeCache.get(p.key);
  if (cached) return cached;

  const W = 512, H = 512;
  const alb = makeCanvas(W, H), hgt = makeCanvas(W, H), rgh = makeCanvas(W, H), emi = makeCanvas(W, H);

  // Base vertical gradient (richer at shoulders, gently shadowed near courtyard hem)
  const bg = alb.x.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, p.robeBase);
  bg.addColorStop(0.76, p.robeBase);
  bg.addColorStop(1, p.robeDark);
  alb.x.fillStyle = bg;
  alb.x.fillRect(0, 0, W, H);

  hgt.x.fillStyle = '#787878'; hgt.x.fillRect(0, 0, W, H);
  rgh.x.fillStyle = '#d4d4d4'; rgh.x.fillRect(0, 0, W, H);
  emi.x.fillStyle = '#000000'; emi.x.fillRect(0, 0, W, H);

  // Subtle woven linen slub warp & weft threads
  for (let y = 0; y < H; y += 3) {
    const a = 0.03 + hash2(y, 1.3) * 0.04;
    alb.x.fillStyle = y % 6 === 0 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(0,0,0,${a.toFixed(3)})`;
    alb.x.fillRect(0, y, W, 1.2);
    hgt.x.fillStyle = y % 6 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
    hgt.x.fillRect(0, y, W, 1.2);
  }
  for (let x = 0; x < W; x += 4) {
    const a = 0.025 + hash2(x, 2.7) * 0.035;
    alb.x.fillStyle = x % 8 === 0 ? `rgba(255,255,255,${a.toFixed(3)})` : `rgba(0,0,0,${a.toFixed(3)})`;
    alb.x.fillRect(x, 0, 1.2, H);
    hgt.x.fillStyle = x % 8 === 0 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';
    hgt.x.fillRect(x, 0, 1.2, H);
  }

  // Soft vertical drapery pleat shadows baked into albedo + height
  const pleats = 16;
  for (let i = 0; i < pleats; i++) {
    const cx = (i + 0.5) * (W / pleats);
    const pw = W / pleats;
    const g = alb.x.createLinearGradient(cx - pw * 0.5, 0, cx + pw * 0.5, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.06)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.11)');
    g.addColorStop(0.65, 'rgba(255,255,255,0.05)');
    g.addColorStop(1, 'rgba(0,0,0,0.22)');
    alb.x.fillStyle = g;
    alb.x.fillRect(cx - pw * 0.5, 0, pw, H);

    const hg = hgt.x.createLinearGradient(cx - pw * 0.5, 0, cx + pw * 0.5, 0);
    hg.addColorStop(0, 'rgba(0,0,0,0.28)');
    hg.addColorStop(0.5, 'rgba(255,255,255,0.26)');
    hg.addColorStop(1, 'rgba(0,0,0,0.28)');
    hgt.x.fillStyle = hg;
    hgt.x.fillRect(cx - pw * 0.5, 0, pw, H);
  }

  // Element-specific tone-on-tone damask motifs
  const drawMotif = (ctx: CanvasRenderingContext2D, stroke: string, lw: number) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    if (p.key === 'agua') {
      // Seigaiha (overlapping wave scales)
      const step = 64;
      for (let row = 0; row <= H / 32 + 1; row++) {
        for (let col = -1; col <= W / step + 1; col++) {
          const cx = col * step + (row % 2 ? step * 0.5 : 0);
          const cy = row * 32;
          for (const rad of [28, 20, 12]) {
            ctx.beginPath();
            ctx.arc(cx, cy, rad, Math.PI * 1.08, Math.PI * 1.92);
            ctx.stroke();
          }
        }
      }
    } else if (p.key === 'viento') {
      // Swirling auspicious wind clouds
      for (let r = 0; r < 6; r++) {
        for (let c = 0; c < 4; c++) {
          const cx = (c + (r % 2 ? 0.5 : 0)) * 128 + 36;
          const cy = r * 86 + 38;
          ctx.beginPath();
          ctx.arc(cx - 18, cy, 12, Math.PI * 0.5, Math.PI * 2.1);
          ctx.arc(cx + 2, cy - 8, 16, Math.PI * 1.05, Math.PI * 2.15);
          ctx.arc(cx + 24, cy + 2, 10, Math.PI * 1.25, Math.PI * 0.7);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - 32, cy + 12);
          ctx.quadraticCurveTo(cx, cy + 20, cx + 34, cy + 10);
          ctx.stroke();
        }
      }
    } else if (p.key === 'fuego') {
      // Stylized Buddhist flame scrolls (kaenmon)
      for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
          const cx = (c + (r % 2 ? 0.5 : 0)) * 102 + 28;
          const cy = r * 102 + 54;
          ctx.beginPath();
          ctx.moveTo(cx, cy - 30);
          ctx.bezierCurveTo(cx + 22, cy - 10, cx + 18, cy + 16, cx, cy + 26);
          ctx.bezierCurveTo(cx - 18, cy + 16, cx - 22, cy - 10, cx, cy - 30);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx, cy - 14);
          ctx.bezierCurveTo(cx + 10, cy - 2, cx + 8, cy + 10, cx, cy + 15);
          ctx.bezierCurveTo(cx - 8, cy + 10, cx - 10, cy - 2, cx, cy - 14);
          ctx.stroke();
        }
      }
    } else {
      // Raimon (thunder key spiral fretwork)
      const cell = 64;
      for (let r = 0; r < H / cell; r++) {
        for (let c = 0; c < W / cell; c++) {
          const ox = c * cell + 10, oy = r * cell + 10, s = 44;
          ctx.beginPath();
          ctx.moveTo(ox, oy + s);
          ctx.lineTo(ox, oy);
          ctx.lineTo(ox + s, oy);
          ctx.lineTo(ox + s, oy + s * 0.78);
          ctx.lineTo(ox + s * 0.22, oy + s * 0.78);
          ctx.lineTo(ox + s * 0.22, oy + s * 0.24);
          ctx.lineTo(ox + s * 0.74, oy + s * 0.24);
          ctx.lineTo(ox + s * 0.74, oy + s * 0.56);
          ctx.lineTo(ox + s * 0.44, oy + s * 0.56);
          ctx.stroke();
        }
      }
    }
  };

  alb.x.save(); alb.x.globalAlpha = 0.28; drawMotif(alb.x, p.robeMotif, 2.4); alb.x.restore();
  hgt.x.save(); hgt.x.globalAlpha = 0.22; drawMotif(hgt.x, '#ffffff', 2.4); hgt.x.restore();
  rgh.x.save(); rgh.x.globalAlpha = 0.28; drawMotif(rgh.x, '#686868', 2.6); rgh.x.restore();

  // Ornate woven lower hem trim (satin band + double gold thread piping)
  const hemY = H - 58;
  alb.x.fillStyle = p.kesaPatchB;
  alb.x.fillRect(0, hemY, W, 58);
  alb.x.fillStyle = p.kesaBorder;
  alb.x.fillRect(0, hemY, W, 5);
  alb.x.fillRect(0, hemY + 10, W, 2.5);
  alb.x.fillRect(0, H - 10, W, 4);

  hgt.x.fillStyle = '#d8d8d8';
  hgt.x.fillRect(0, hemY, W, 5);
  hgt.x.fillRect(0, hemY + 10, W, 2.5);
  hgt.x.fillRect(0, H - 10, W, 4);

  rgh.x.fillStyle = '#585858';
  rgh.x.fillRect(0, hemY, W, 58);

  emi.x.fillStyle = p.obiAccent;
  emi.x.globalAlpha = 0.32;
  emi.x.fillRect(0, hemY + 1, W, 3.5);
  emi.x.globalAlpha = 0.22;
  for (let x = 16; x < W; x += 32) {
    emi.x.beginPath();
    emi.x.moveTo(x, hemY + 20);
    emi.x.lineTo(x + 9, hemY + 31);
    emi.x.lineTo(x, hemY + 42);
    emi.x.lineTo(x - 9, hemY + 31);
    emi.x.closePath();
    emi.x.fill();
  }
  alb.x.fillStyle = p.kesaBorder;
  for (let x = 16; x < W; x += 32) {
    alb.x.beginPath();
    alb.x.moveTo(x, hemY + 20);
    alb.x.lineTo(x + 9, hemY + 31);
    alb.x.lineTo(x, hemY + 42);
    alb.x.lineTo(x - 9, hemY + 31);
    alb.x.closePath();
    alb.x.fill();
  }

  const out: TextilePBR = {
    map: toTex(alb.c, true),
    normal: heightToNormalTex(hgt.c, 2.6, true),
    rough: toTex(rgh.c, false),
    emissive: toTex(emi.c, true),
  };
  robeCache.set(p.key, out);
  return out;
}

/** Stitched Buddhist patchwork brocade (funzōe) PBR for the monk's kesa mantle */
function kesaBrocadePBR(p: MonkPalette): TextilePBR {
  const cached = kesaCache.get(p.key);
  if (cached) return cached;

  const W = 256, H = 512;
  const alb = makeCanvas(W, H), hgt = makeCanvas(W, H), rgh = makeCanvas(W, H), emi = makeCanvas(W, H);

  alb.x.fillStyle = p.kesaBase; alb.x.fillRect(0, 0, W, H);
  hgt.x.fillStyle = '#505050'; hgt.x.fillRect(0, 0, W, H);
  rgh.x.fillStyle = '#9c9c9c'; rgh.x.fillRect(0, 0, W, H);
  emi.x.fillStyle = '#000000'; emi.x.fillRect(0, 0, W, H);

  const cols = 3, rows = 8, pw = W / cols, ph = H / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const px = c * pw + 5, py = r * ph + 5, rw = pw - 10, rh = ph - 10;
      alb.x.fillStyle = (r + c) % 2 === 0 ? p.kesaPatchA : p.kesaPatchB;
      alb.x.fillRect(px, py, rw, rh);
      hgt.x.fillStyle = '#989898';
      hgt.x.fillRect(px, py, rw, rh);
      rgh.x.fillStyle = (r + c) % 2 === 0 ? '#787878' : '#a8a8a8';
      rgh.x.fillRect(px, py, rw, rh);

      // Diagonal silk twill inside each patch
      alb.x.strokeStyle = 'rgba(255,255,255,0.1)';
      alb.x.lineWidth = 1;
      for (let d = -rh; d < rw + rh; d += 7) {
        alb.x.beginPath(); alb.x.moveTo(px + d, py); alb.x.lineTo(px + d - 12, py + rh); alb.x.stroke();
      }

      // Gold-thread stitched seam around patch
      alb.x.strokeStyle = p.kesaBorder;
      alb.x.lineWidth = 1.4;
      alb.x.setLineDash([4, 3]);
      alb.x.strokeRect(px + 2, py + 2, rw - 4, rh - 4);
      alb.x.setLineDash([]);

      // Lotus / dharma medallion in each patch
      const cx = px + rw * 0.5, cy = py + rh * 0.5, rad = Math.min(rw, rh) * 0.28;
      for (const [ctx, col, lw] of [
        [alb.x, p.kesaBorder, 1.5],
        [hgt.x, '#e8e8e8', 1.8],
        [emi.x, p.obiAccent, 1.2],
      ] as const) {
        ctx.save();
        if (ctx === emi.x) ctx.globalAlpha = 0.28;
        ctx.strokeStyle = col; ctx.lineWidth = lw;
        ctx.beginPath(); ctx.arc(cx, cy, rad, 0, TAU); ctx.stroke();
        for (let k = 0; k < 6; k++) {
          const a = k * TAU / 6;
          ctx.beginPath();
          ctx.arc(cx + Math.cos(a) * rad * 0.62, cy + Math.sin(a) * rad * 0.62, rad * 0.34, 0, TAU);
          ctx.stroke();
        }
        ctx.restore();
      }
    }
  }

  // Ornate gilded brocade side borders
  for (const bx of [0, W - 12]) {
    alb.x.fillStyle = p.kesaBorder;
    alb.x.fillRect(bx, 0, 12, H);
    alb.x.fillStyle = p.robeDark;
    alb.x.fillRect(bx + 3, 0, 2, H);
    alb.x.fillRect(bx + 7, 0, 2, H);

    hgt.x.fillStyle = '#f0f0f0';
    hgt.x.fillRect(bx, 0, 12, H);
    rgh.x.fillStyle = '#484848';
    rgh.x.fillRect(bx, 0, 12, H);
    emi.x.fillStyle = p.kesaBorder;
    emi.x.globalAlpha = 0.35;
    emi.x.fillRect(bx + 1, 0, 10, H);
    emi.x.globalAlpha = 1;
  }

  const out: TextilePBR = {
    map: toTex(alb.c, true),
    normal: heightToNormalTex(hgt.c, 2.8, true),
    rough: toTex(rgh.c, false),
    emissive: toTex(emi.c, true),
  };
  kesaCache.set(p.key, out);
  return out;
}

/** Geometric asanoha / brocade silk obi PBR */
function obiTextilePBR(p: MonkPalette): TextilePBR {
  const cached = obiCache.get(p.key);
  if (cached) return cached;

  const W = 256, H = 128;
  const alb = makeCanvas(W, H), hgt = makeCanvas(W, H), rgh = makeCanvas(W, H);
  alb.x.fillStyle = p.obiBase; alb.x.fillRect(0, 0, W, H);
  hgt.x.fillStyle = '#707070'; hgt.x.fillRect(0, 0, W, H);
  rgh.x.fillStyle = '#a0a0a0'; rgh.x.fillRect(0, 0, W, H);

  // Diamond brocade weave
  const step = 32;
  for (let y = 0; y < H; y += step) {
    for (let x = 0; x < W; x += step) {
      const cx = x + step * 0.5, cy = y + step * 0.5;
      for (const [ctx, col] of [[alb.x, p.kesaBorder], [hgt.x, '#dcdcdc'], [rgh.x, '#555555']] as const) {
        ctx.strokeStyle = col; ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(cx, y + 3); ctx.lineTo(x + step - 3, cy);
        ctx.lineTo(cx, y + step - 3); ctx.lineTo(x + 3, cy);
        ctx.closePath(); ctx.stroke();
      }
    }
  }
  // Top & bottom gold edging
  alb.x.fillStyle = p.kesaBorder;
  alb.x.fillRect(0, 0, W, 6); alb.x.fillRect(0, H - 6, W, 6);
  hgt.x.fillStyle = '#f0f0f0';
  hgt.x.fillRect(0, 0, W, 6); hgt.x.fillRect(0, H - 6, W, 6);

  const out: TextilePBR = {
    map: toTex(alb.c, true),
    normal: heightToNormalTex(hgt.c, 2.2, true),
    rough: toTex(rgh.c, false),
  };
  obiCache.set(p.key, out);
  return out;
}

function woodGrainTex() {
  if (cachedWoodTex) return cachedWoodTex;
  const { c, x } = makeCanvas(128, 256);
  x.fillStyle = '#b89678'; x.fillRect(0, 0, 128, 256);
  for (let i = 0; i < 64; i++) {
    const gx = i * 2;
    const shade = 140 + Math.sin(i * 0.7) * 28 + hash2(i, 4.1) * 24;
    x.fillStyle = `rgb(${shade | 0},${(shade * 0.8) | 0},${(shade * 0.62) | 0})`;
    x.fillRect(gx, 0, 2, 256);
  }
  cachedWoodTex = toTex(c, true);
  return cachedWoodTex;
}

function wovenStrawTex() {
  if (cachedStrawTex) return cachedStrawTex;
  const { c, x } = makeCanvas(128, 128);
  x.fillStyle = '#c4a66e'; x.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 6) {
    x.fillStyle = y % 12 === 0 ? 'rgba(255,244,210,0.22)' : 'rgba(70,48,22,0.22)';
    x.fillRect(0, y, 128, 3);
  }
  for (let i = 0; i < 128; i += 8) {
    x.strokeStyle = 'rgba(78,52,24,0.28)';
    x.lineWidth = 1.5;
    x.beginPath(); x.moveTo(i, 0); x.lineTo(i, 128); x.stroke();
  }
  cachedStrawTex = toTex(c, true);
  return cachedStrawTex;
}

function kanjiEmblemTex(kanji: string, borderHex: string, glowHex: string) {
  const { c, x } = makeCanvas(256, 256);
  x.clearRect(0, 0, 256, 256);
  x.strokeStyle = borderHex;
  x.lineWidth = 7;
  x.beginPath(); x.arc(128, 128, 108, 0, TAU); x.stroke();
  x.lineWidth = 2.5;
  x.beginPath(); x.arc(128, 128, 94, 0, TAU); x.stroke();

  x.shadowColor = glowHex;
  x.shadowBlur = 14;
  x.fillStyle = borderHex;
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.font = 'bold 124px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  x.fillText(kanji, 128, 134);
  return toTex(c, true, false);
}

// ------------------------------------------------------------ geometry helpers
function tapered(parent: THREE.Object3D, mat: THREE.Material, from: [number, number, number], to: [number, number, number], r0: number, r1: number, segs = 12) {
  const a = new V(...from), b = new V(...to), axis = b.clone().sub(a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r1, r0, axis.length(), segs), mat);
  m.position.copy(a).lerp(b, 0.5);
  m.quaternion.setFromUnitVectors(UP, axis.normalize());
  parent.add(m);
  return m;
}

function tubePath(parent: THREE.Object3D, pts: THREE.Vector3[], radius: number, mat: THREE.Material, segs = 28, radial = 7, closed = false) {
  const curve = new THREE.CatmullRomCurve3(pts, closed);
  const m = new THREE.Mesh(new THREE.TubeGeometry(curve, segs, radius, radial, closed), mat);
  parent.add(m);
  return { mesh: m, curve };
}

/** Sculpted pleated lower robe (hakama / koromo skirt) with radial cloth folds */
function buildPleatedSkirt(mat: THREE.Material) {
  const rings: [r: number, y: number][] = [
    [0.215, 1.00], [0.245, 0.90], [0.278, 0.72], [0.312, 0.48], [0.348, 0.24], [0.378, 0.055],
  ];
  const geo = new THREE.LatheGeometry(rings.map(([r, y]) => new THREE.Vector2(r, y)), 48);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(x, z);
    const t = THREE.MathUtils.clamp((1.0 - y) / 0.95, 0, 1); // 0 at waist, 1 at hem
    // Deep radial pleats that open toward the hem + soft front/back flattening
    const pleat = Math.sin(a * 12) * 0.015 * t + Math.cos(a * 6 + 0.5) * 0.008 * t;
    const r = Math.hypot(x, z) || 1;
    const nr = r + pleat;
    const depth = THREE.MathUtils.lerp(0.74, 0.86, t);
    // Gentle hem wave so the robe sits naturally above the sandals
    const hemWave = Math.sin(a * 5 + 0.4) * 0.008 * t * t;
    pos.setXYZ(i, (x / r) * nr, y + hemWave, (z / r) * nr * depth);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Sculpted upper kimono torso with natural shoulder slope & subtle drapery */
function buildTorso(mat: THREE.Material) {
  const rings: [r: number, y: number][] = [
    [0.215, 0.96], [0.228, 1.08], [0.252, 1.24], [0.272, 1.38], [0.258, 1.46], [0.165, 1.525], [0.095, 1.555],
  ];
  const geo = new THREE.LatheGeometry(rings.map(([r, y]) => new THREE.Vector2(r, y)), 36);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const a = Math.atan2(x, z);
    const fold = Math.sin(a * 8 + y * 9) * 0.0045;
    const r = Math.hypot(x, z) || 1;
    const nr = r + fold;
    pos.setXYZ(i, (x / r) * nr, y, (z / r) * nr * 0.72);
  }
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/** Curved brocade kesa strip hugging the chest & back from left shoulder to right hip */
function buildKesa(parent: THREE.Group, kesaMat: THREE.Material, giltMat: THREE.Material, cordMat: THREE.Material, tasselMat: THREE.Material) {
  for (const back of [false, true]) {
    const zSign = back ? -1 : 1;
    const path = new THREE.CatmullRomCurve3([
      new V(0.165, 1.525, 0.01 * zSign),
      new V(0.175, 1.45, 0.145 * zSign),
      new V(0.085, 1.29, 0.205 * zSign),
      new V(-0.07, 1.13, 0.195 * zSign),
      new V(-0.205, 0.99, 0.125 * zSign),
    ]);
    const strip = new THREE.PlaneGeometry(1, 1, 6, 32);
    const pos = strip.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const side = pos.getX(i), t = pos.getY(i) + 0.5;
      const pt = path.getPoint(t), tan = path.getTangent(t);
      const span = 0.165 - t * 0.025;
      const arch = Math.abs(2 * side);
      pos.setXYZ(
        i,
        pt.x + tan.y * side * span,
        pt.y - tan.x * side * span,
        pt.z - zSign * 0.018 * arch * arch
      );
    }
    strip.computeVertexNormals();
    parent.add(new THREE.Mesh(strip, kesaMat));

    // Raised gilded piping along both edges of the kesa
    for (const side of [-0.5, 0.5]) {
      const hem: THREE.Vector3[] = [];
      for (let k = 0; k <= 16; k++) {
        const t = k / 16, pt = path.getPoint(t), tan = path.getTangent(t), span = 0.165 - t * 0.025;
        hem.push(new V(pt.x + tan.y * side * span, pt.y - tan.x * side * span, pt.z - zSign * 0.012));
      }
      tubePath(parent, hem, 0.0055, giltMat, 28, 6);
    }
  }

  // Kansu: gilded fastening ring on the left chest with silk cord & tassel
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.032, 0.0075, 10, 24), giltMat);
  ring.position.set(0.125, 1.41, 0.18);
  ring.rotation.set(0.28, 0.45, 0.12);
  parent.add(ring);

  tubePath(parent, [
    new V(0.125, 1.41, 0.18),
    new V(0.088, 1.36, 0.205),
    new V(0.055, 1.29, 0.212),
  ], 0.0045, cordMat, 12, 6);

  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.06, 8, 1, true), tasselMat);
  tassel.position.set(0.055, 1.26, 0.212);
  parent.add(tassel);
}

/** Wide monastic sleeve with hanging drape & dark inner lining */
function buildSleeve(
  parent: THREE.Group,
  robeMat: THREE.Material,
  liningMat: THREE.Material,
  giltMat: THREE.Material,
  skinMat: THREE.Material,
  wrapMat: THREE.Material,
  side: -1 | 1,
  pose: 'mudra' | 'staff'
) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * 0.245, 1.45, 0.01);
  parent.add(shoulder);

  // Rounded shoulder cap
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.095, 14, 10), robeMat);
  cap.scale.set(1.0, 1.12, 0.96);
  shoulder.add(cap);

  // Upper sleeve bell (flared koromo sleeve)
  const sleeveGeo = new THREE.CylinderGeometry(0.082, 0.138, 0.42, 18, 4, true);
  const sp = sleeveGeo.attributes.position;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i), y = sp.getY(i), z = sp.getZ(i);
    const t = THREE.MathUtils.clamp((0.21 - y) / 0.42, 0, 1);
    // Gravity drape pulls the underside of the sleeve downward/inward
    const drape = -0.055 * t * t * (z < 0 ? 1.2 : 0.7);
    sp.setXYZ(i, x * (1 + 0.15 * t), y + drape, z * (0.95 + 0.35 * t));
  }
  sleeveGeo.computeVertexNormals();
  const sleeve = new THREE.Mesh(sleeveGeo, robeMat);
  const lining = new THREE.Mesh(sleeveGeo, liningMat);
  lining.scale.set(0.95, 0.99, 0.95);

  const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.132, 0.006, 6, 22), giltMat);
  cuff.rotation.x = Math.PI / 2;
  cuff.position.y = -0.215;

  const armGroup = new THREE.Group();
  armGroup.add(sleeve, lining, cuff);

  if (pose === 'mudra') {
    // Left arm folded serenely across the lower chest in a calm prayer/mudra gesture
    armGroup.position.set(side * 0.055, -0.17, 0.08);
    armGroup.rotation.set(-0.58, 0, side * 0.36);
    shoulder.add(armGroup);

    // Forearm emerging from cuff toward chest center
    tapered(shoulder, wrapMat, [side * 0.05, -0.32, 0.17], [-side * 0.11, -0.29, 0.255], 0.044, 0.036, 10);
    // Hand palm + thumb in serene mudra
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), skinMat);
    hand.scale.set(0.85, 1.25, 0.62);
    hand.position.set(-side * 0.14, -0.275, 0.27);
    hand.rotation.set(-0.2, side * 0.35, -side * 0.25);
    shoulder.add(hand);
  } else {
    // Right arm extended slightly forward & out to hold the temple staff
    armGroup.position.set(side * 0.065, -0.18, 0.06);
    armGroup.rotation.set(-0.42, 0, -side * 0.18);
    shoulder.add(armGroup);

    tapered(shoulder, wrapMat, [side * 0.11, -0.31, 0.14], [side * 0.165, -0.34, 0.235], 0.044, 0.036, 10);
    // Gripping hand around staff shaft (world-ish offset x ~ -0.41 for right hand)
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.046, 12, 10), skinMat);
    hand.scale.set(0.95, 0.92, 1.05);
    hand.position.set(side * 0.18, -0.34, 0.255);
    shoulder.add(hand);
  }
}

/** Element-specific monastic headwear / ornaments on the sculpted head */
function addElementalHeadwear(
  head: THREE.Group,
  body: THREE.Group,
  p: MonkPalette,
  robeMat: THREE.Material,
  giltMat: THREE.Material,
  cordMat: THREE.Material,
  glowMats: THREE.MeshBasicMaterial[],
  swayParts: THREE.Object3D[]
) {
  if (p.key === 'viento') {
    // Haru: woven sedge kasa (sugegasa) slung behind the shoulders with silk cords!
    const kasa = new THREE.Group();
    kasa.position.set(0, 1.38, -0.255);
    kasa.rotation.set(-1.38, 0, 0.08);
    const strawMat = M(0xd2b47c, { map: wovenStrawTex(), roughness: 0.92, side: THREE.DoubleSide });
    const hatCone = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.16, 24, 1, true), strawMat);
    kasa.add(hatCone);
    const hatRim = new THREE.Mesh(new THREE.TorusGeometry(0.358, 0.011, 6, 28), M(0x5a3e22, { roughness: 0.85 }));
    hatRim.rotation.x = Math.PI / 2; hatRim.position.y = -0.078;
    kasa.add(hatRim);
    const hatCrown = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.055, 0.03, 12), giltMat);
    hatCrown.position.y = 0.078;
    kasa.add(hatCrown);
    body.add(kasa);
    // Chin-cord draped over the shoulders holding the slung kasa
    tubePath(body, [
      new V(-0.14, 1.49, -0.18), new V(-0.15, 1.53, 0.04), new V(0, 1.46, 0.155),
      new V(0.15, 1.53, 0.04), new V(0.14, 1.49, -0.18),
    ], 0.006, cordMat, 24, 6);
  } else if (p.key === 'fuego') {
    // Enji: Yamabushi tokin (lacquered octagonal pillbox cap on the forehead) + crimson cord
    const lacq = M(0x181010, { roughness: 0.25, metalness: 0.15 });
    const tokin = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.042, 0.044, 8), lacq);
    tokin.position.set(0, 0.118, 0.076);
    tokin.rotation.x = 0.42;
    head.add(tokin);
    const tokinRim = new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.0045, 6, 8), giltMat);
    tokinRim.position.set(0, 0.11, 0.08);
    tokinRim.rotation.set(Math.PI / 2 + 0.42, 0, 0);
    head.add(tokinRim);
    // Crimson yamabushi forehead cord wrapping around skull
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.007, 6, 28), cordMat);
    band.position.set(0, 0.068, -0.005);
    band.rotation.x = Math.PI / 2 - 0.18;
    band.scale.set(0.96, 1.12, 1);
    head.add(band);
    for (const s of [-1, 1]) {
      const tail = new THREE.Mesh(new THREE.PlaneGeometry(0.022, 0.18, 1, 4).translate(0, -0.09, 0), cordMat);
      tail.position.set(s * 0.018, 0.045, -0.115);
      tail.rotation.set(0.28, s * 0.2, s * 0.22);
      head.add(tail);
      swayParts.push(tail);
    }
  } else if (p.key === 'agua') {
    // Nami: Crescent silver circlet with luminous moon pearl + draped shrine hood-veil
    const circlet = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.006, 8, 28, Math.PI * 1.35), giltMat);
    circlet.position.set(0, 0.078, -0.004);
    circlet.rotation.set(Math.PI / 2 - 0.1, 0, -Math.PI * 0.175);
    circlet.scale.set(0.96, 1.12, 1);
    head.add(circlet);

    // Silver crescent moon crest over the brow
    const crescent = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.005, 8, 18, Math.PI * 1.25), giltMat);
    crescent.position.set(0, 0.105, 0.102);
    crescent.rotation.z = -Math.PI * 0.625;
    head.add(crescent);

    const pearlMat = new THREE.MeshBasicMaterial({ color: 0xe6f6ff });
    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), pearlMat);
    pearl.position.set(0, 0.108, 0.105);
    head.add(pearl);
    glowMats.push(pearlMat);

    // Draped azure-lined shrine veil cascading down the back from the crown
    const veilGeo = new THREE.PlaneGeometry(0.28, 0.56, 6, 10);
    const vp = veilGeo.attributes.position;
    for (let i = 0; i < vp.count; i++) {
      const x = vp.getX(i), y = vp.getY(i);
      const t = (0.28 - y) / 0.56;
      vp.setXYZ(i, x * (0.72 + 0.55 * t), y - 0.26, -0.105 - 0.05 * t - 0.03 * Math.cos(x * 16));
    }
    veilGeo.computeVertexNormals();
    const veil = new THREE.Mesh(veilGeo, robeMat);
    veil.position.set(0, 0.1, 0);
    head.add(veil);
    swayParts.push(veil);
  } else {
    // Shiden: Gilded vajra brow-band + sacred shimenawa shoulder rope with white zigzag shide!
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.008, 8, 28), giltMat);
    band.position.set(0, 0.074, -0.005);
    band.rotation.x = Math.PI / 2 - 0.12;
    band.scale.set(0.96, 1.13, 1);
    head.add(band);

    // Glowing thunder jewel at the brow
    const gemMat = new THREE.MeshBasicMaterial({ color: 0xd8ecff });
    const gem = new THREE.Mesh(new THREE.OctahedronGeometry(0.017), gemMat);
    gem.position.set(0, 0.088, 0.106);
    gem.scale.set(0.85, 1.35, 0.6);
    head.add(gem);
    glowMats.push(gemMat);

    // Sacred braided shimenawa collar rope with 4 white zigzag paper shide
    const shime = new THREE.Mesh(new THREE.TorusGeometry(0.195, 0.024, 8, 28), cordMat);
    shime.position.set(0, 1.505, 0.01);
    shime.rotation.x = Math.PI / 2 + 0.18;
    shime.scale.set(1.06, 0.84, 1);
    body.add(shime);

    const shideMat = M(0xf5f5fa, { roughness: 0.85, side: THREE.DoubleSide });
    const shideShape = new THREE.Shape();
    shideShape.moveTo(-0.015, 0); shideShape.lineTo(0.015, 0);
    shideShape.lineTo(0.015, -0.045); shideShape.lineTo(0.032, -0.045);
    shideShape.lineTo(0.032, -0.095); shideShape.lineTo(0.012, -0.095);
    shideShape.lineTo(0.012, -0.145); shideShape.lineTo(-0.012, -0.145);
    shideShape.lineTo(-0.012, -0.095); shideShape.lineTo(-0.025, -0.095);
    shideShape.lineTo(-0.025, -0.045); shideShape.lineTo(-0.015, -0.045);
    shideShape.closePath();
    const shideGeo = new THREE.ShapeGeometry(shideShape);
    for (const [sx, sy, sz, ry] of [
      [-0.17, 1.49, 0.11, -0.45],
      [0.17, 1.49, 0.11, 0.45],
      [-0.21, 1.48, -0.03, -1.2],
      [0.21, 1.48, -0.03, 1.2],
    ]) {
      const shide = new THREE.Mesh(shideGeo, shideMat);
      shide.position.set(sx, sy, sz);
      shide.rotation.y = ry;
      body.add(shide);
      swayParts.push(shide);
    }
  }
}

/** Unique elemental monastic staff held in the right hand */
function buildStaff(
  p: MonkPalette,
  woodMat: THREE.Material,
  metalMat: THREE.Material,
  cordMat: THREE.Material,
  glowMats: THREE.MeshBasicMaterial[],
  swayParts: THREE.Object3D[]
) {
  const staff = new THREE.Group();
  // Positioned right in the monk's right hand grip, planted on the courtyard floor
  staff.position.set(-0.425, 0.0, 0.265);
  staff.rotation.set(0.05, 0, -0.04);

  // Main lacquered hardwood shaft + brass base ferrule + grip wrap + upper collar
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.021, 1.88, 12), woodMat);
  shaft.position.y = 0.94;
  staff.add(shaft);

  const foot = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.014, 0.12, 12), metalMat);
  foot.position.y = 0.06;
  staff.add(foot);

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.023, 0.023, 0.24, 12), cordMat);
  grip.position.y = 1.11;
  staff.add(grip);

  const collar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.022, 0.08, 12), metalMat);
  collar.position.y = 1.88;
  staff.add(collar);

  const coreMat = new THREE.MeshBasicMaterial({ color: p.accent });
  glowMats.push(coreMat);
  const haloMat = tagMat(new THREE.SpriteMaterial({
    map: softGlowTex, color: p.accent, transparent: true, opacity: 0.65,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }), CLS.fx);

  if (p.key === 'viento') {
    // Classic Buddhist 6-ring shakujō (pewter/gold ringing staff)
    const loop = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.011, 8, 28), metalMat);
    loop.position.y = 2.04;
    loop.scale.set(0.92, 1.15, 1);
    staff.add(loop);

    const spear = new THREE.Mesh(new THREE.OctahedronGeometry(0.032), metalMat);
    spear.scale.set(0.7, 2.2, 0.7);
    spear.position.y = 2.21;
    staff.add(spear);

    // 6 hanging bronze rings
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const a = (i - 1) * 0.42;
        const ring = new THREE.Mesh(new THREE.TorusGeometry(0.034, 0.0055, 6, 16), metalMat);
        ring.position.set(side * (0.105 - Math.abs(a) * 0.02), 2.02 + a * 0.075, 0);
        ring.rotation.y = Math.PI / 2 + side * 0.3;
        staff.add(ring);
        swayParts.push(ring);
      }
    }
    const orb = new THREE.Mesh(new THREE.OctahedronGeometry(0.032), coreMat);
    orb.position.y = 2.04;
    staff.add(orb);
  } else if (p.key === 'fuego') {
    // Yamabushi flame-vajra brazier staff
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const prong = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.009, 6, 16, Math.PI * 0.85), metalMat);
      prong.position.set(Math.cos(a) * 0.02, 2.01, Math.sin(a) * 0.02);
      prong.rotation.set(0, -a, -Math.PI * 0.42);
      staff.add(prong);
    }
    const flame = new THREE.Mesh(new THREE.OctahedronGeometry(0.048), coreMat);
    flame.scale.set(0.8, 1.55, 0.8);
    flame.position.y = 2.04;
    staff.add(flame);
  } else if (p.key === 'agua') {
    // Lunar crescent tide staff with suspended luminous water pearl & cascading ribbon
    const moon = new THREE.Mesh(new THREE.TorusGeometry(0.115, 0.012, 8, 24, Math.PI * 1.35), metalMat);
    moon.position.y = 2.05;
    moon.rotation.z = -Math.PI * 0.675;
    staff.add(moon);

    const pearl = new THREE.Mesh(new THREE.SphereGeometry(0.038, 14, 12), coreMat);
    pearl.position.y = 2.05;
    staff.add(pearl);

    const ribbonMat = M(p.tassel, { roughness: 0.75, side: THREE.DoubleSide });
    const ribbon = new THREE.Mesh(new THREE.PlaneGeometry(0.036, 0.36, 1, 6).translate(0, -0.18, 0), ribbonMat);
    ribbon.position.set(0.03, 1.88, 0);
    ribbon.rotation.z = 0.14;
    staff.add(ribbon);
    swayParts.push(ribbon);
  } else {
    // Raijin double-pronged vajra staff with thunder drum ring
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.01, 8, 28), metalMat);
    ring.position.y = 2.04;
    staff.add(ring);

    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2;
      const spike = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.12, 6), metalMat);
      spike.position.set(Math.cos(a) * 0.155, 2.04 + Math.sin(a) * 0.155, 0);
      spike.rotation.z = a - Math.PI / 2;
      staff.add(spike);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.042), coreMat);
    core.scale.set(0.85, 1.2, 0.85);
    core.position.y = 2.04;
    staff.add(core);
  }

  // Soft optical halo around the staff's elemental finial (always faces camera)
  const flare = new THREE.Sprite(haloMat);
  flare.scale.setScalar(0.38);
  flare.position.set(0, 2.04, 0);
  staff.add(flare);

  return staff;
}

/** Subtle sacred dharma halo / elemental ring behind the monk's shoulders */
function buildElementalHalo(p: MonkPalette, giltMat: THREE.Material, glowMats: THREE.MeshBasicMaterial[]) {
  const halo = new THREE.Group();
  halo.position.set(0, 1.56, -0.22);

  const ringMat = tagMat(new THREE.MeshBasicMaterial({
    color: p.accent, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending,
  }), CLS.fx);
  glowMats.push(ringMat);

  // Outer slender luminous ring
  const outer = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.007, 6, 48), ringMat);
  halo.add(outer);

  // Delicate inner gilded dharma ring
  const inner = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.005, 6, 36), giltMat);
  halo.add(inner);

  // 6 small elemental beads / Raijin tomoe nodes around the halo
  const count = p.key === 'rayo' ? 8 : 6;
  const nodeGeo = p.key === 'fuego' ? new THREE.OctahedronGeometry(0.024) : new THREE.SphereGeometry(0.019, 10, 8);
  const nodeMat = new THREE.MeshBasicMaterial({ color: p.accent });
  glowMats.push(nodeMat);
  for (let i = 0; i < count; i++) {
    const a = (i / count) * TAU;
    const node = new THREE.Mesh(nodeGeo, nodeMat);
    node.position.set(Math.cos(a) * 0.46, Math.sin(a) * 0.46, 0);
    halo.add(node);
  }

  return halo;
}

/** Floating elemental motes gently orbiting the monk */
function buildMotes(p: MonkPalette) {
  const motes = new THREE.Group();
  const mat = tagMat(new THREE.SpriteMaterial({
    map: softGlowTex, color: p.accent, transparent: true, opacity: 0.68,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }), CLS.fx);

  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * TAU;
    const r = 0.56 + (i % 3) * 0.14;
    const y = 0.45 + (i / 8) * 1.45;
    const sp = new THREE.Sprite(mat);
    const sz = 0.095 + (i % 3) * 0.025;
    sp.scale.setScalar(sz);
    sp.position.set(Math.cos(a) * r, y, Math.sin(a) * r);
    sp.userData.baseY = y;
    motes.add(sp);
  }
  return motes;
}

// ------------------------------------------------------------ main builder
export function createTempleMonk(temple: TemplePlace): TempleMonkRig {
  const key = (temple.technique in PALETTES ? temple.technique : 'viento') as ElementKey;
  const p = PALETTES[key];
  const techColor = TECHNIQUES[temple.technique].color;

  const root = new THREE.Group();
  root.name = temple.master;
  const body = new THREE.Group();
  root.add(body);

  const swayParts: THREE.Object3D[] = [];
  const glowMats: THREE.MeshBasicMaterial[] = [];

  // Procedural PBR materials
  const robePbr = robeTextilePBR(p);
  const kesaPbr = kesaBrocadePBR(p);
  const obiPbr = obiTextilePBR(p);
  const metalPbr = forgedMetalPBR();
  const silkPbr = braidedSilkPBR();

  const robeMat = M(0xffffff, {
    map: robePbr.map, normalMap: robePbr.normal, normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: robePbr.rough, roughness: 0.9, metalness: 0.04,
    emissive: 0xffffff, emissiveMap: robePbr.emissive, emissiveIntensity: 0.35,
    side: THREE.DoubleSide,
  });
  const liningMat = M(p.robeDark, { roughness: 0.96, side: THREE.DoubleSide });
  const kesaMat = M(0xffffff, {
    map: kesaPbr.map, normalMap: kesaPbr.normal, normalScale: new THREE.Vector2(1.0, 1.0),
    roughnessMap: kesaPbr.rough, roughness: 0.78, metalness: 0.14,
    emissive: 0xffffff, emissiveMap: kesaPbr.emissive, emissiveIntensity: 0.42,
    side: THREE.DoubleSide,
  });
  const obiMat = M(0xffffff, {
    map: obiPbr.map, normalMap: obiPbr.normal, normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: obiPbr.rough, roughness: 0.82, metalness: 0.1,
  });
  const collarMat = M(p.collar, { roughness: 0.88, side: THREE.DoubleSide });
  const cordMat = M(p.cord, {
    normalMap: silkPbr.normal, normalScale: new THREE.Vector2(0.9, 0.9),
    roughnessMap: silkPbr.rough, roughness: 0.86,
  });
  const tasselMat = M(p.tassel, { roughness: 0.85, side: THREE.DoubleSide });
  const giltMat = M(p.metal, {
    normalMap: metalPbr.normal, normalScale: new THREE.Vector2(0.55, 0.55),
    roughnessMap: metalPbr.rough, metalness: 0.82, roughness: 0.3,
  });
  const woodMat = M(p.wood, { map: woodGrainTex(), roughness: 0.52, metalness: 0.06 });
  const skinMat = M(p.skinTint, { roughness: 0.72, metalness: 0 });
  skinMat.userData.asciiSkin = true;
  const wrapMat = M(0xe5dfd0, { roughness: 0.92 });
  const sandalMat = M(0x7c6340, { map: wovenStrawTex(), roughness: 0.94 });

  // 1. Feet: white tabi socks + woven waraji sandals with toe straps
  for (const side of [-1, 1]) {
    const fx = side * 0.125;
    const tabi = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), wrapMat);
    tabi.scale.set(0.064, 0.048, 0.128);
    tabi.position.set(fx, 0.046, 0.055);
    body.add(tabi);

    const sole = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.074, 0.022, 14), sandalMat);
    sole.scale.set(0.92, 1, 1.9);
    sole.position.set(fx, 0.012, 0.062);
    body.add(sole);

    // Sandal thong strap
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.007, 6, 14, Math.PI), cordMat);
    strap.position.set(fx, 0.032, 0.095);
    strap.rotation.x = 0.2;
    body.add(strap);
  }

  // 2. Sculpted pleated lower robe & upper kimono torso
  body.add(buildPleatedSkirt(robeMat));
  body.add(buildTorso(robeMat));

  // 3. Layered crossed collars (authentic left-over-right kimono overlap)
  // Right side goes under, left side crosses over it
  tubePath(body, [
    new V(-0.088, 1.545, 0.025), new V(-0.092, 1.485, 0.115),
    new V(-0.048, 1.395, 0.168), new V(0.035, 1.315, 0.184),
  ], 0.017, collarMat, 18, 7);
  tubePath(body, [
    new V(0.088, 1.545, 0.025), new V(0.092, 1.485, 0.118),
    new V(0.042, 1.395, 0.174), new V(-0.062, 1.245, 0.184),
  ], 0.019, collarMat, 20, 7);
  // Subtle gilded outer lapel edge
  tubePath(body, [
    new V(0.105, 1.535, 0.02), new V(0.108, 1.475, 0.112),
    new V(0.058, 1.385, 0.172), new V(-0.052, 1.23, 0.185),
  ], 0.0055, giltMat, 20, 6);

  // 4. Sculpted brocade kesa mantle + kansu clasp
  buildKesa(body, kesaMat, giltMat, cordMat, tasselMat);

  // 5. Layered obi sash + twisted braided cord belt + hanging fringed ends
  const obi = new THREE.Mesh(new THREE.CylinderGeometry(0.224, 0.228, 0.145, 36, 1, true), obiMat);
  obi.scale.z = 0.76;
  obi.position.y = 1.015;
  body.add(obi);

  const beltCord = new THREE.Mesh(new THREE.TorusGeometry(0.23, 0.014, 8, 40), cordMat);
  beltCord.rotation.x = Math.PI / 2;
  beltCord.scale.y = 0.76;
  beltCord.position.y = 1.025;
  body.add(beltCord);

  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.026, 0.009, 24, 6), cordMat);
  knot.position.set(0.095, 1.02, 0.175);
  body.add(knot);

  for (const s of [-1, 1]) {
    const hang = new THREE.Group();
    hang.position.set(0.095 + s * 0.016, 1.01, 0.182);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.22, 6), cordMat);
    tail.position.set(s * 0.01, -0.11, 0.005);
    tail.rotation.z = s * 0.09;
    hang.add(tail);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 8, 1, true), tasselMat);
    tip.position.set(s * 0.02, -0.23, 0.008);
    hang.add(tip);
    body.add(hang);
    swayParts.push(hang);
  }

  // 6. Carved wooden juzu (mala prayer beads) with glowing elemental master bead
  const beadCurve = new THREE.CatmullRomCurve3([
    new V(-0.098, 1.535, -0.02), new V(-0.132, 1.44, 0.135), new V(-0.088, 1.29, 0.215),
    new V(0, 1.205, 0.232),
    new V(0.088, 1.29, 0.215), new V(0.132, 1.44, 0.135), new V(0.098, 1.535, -0.02),
    new V(0, 1.545, -0.12),
  ], true);
  const beadGeo = new THREE.SphereGeometry(0.0165, 10, 8);
  for (let i = 0; i < 32; i++) {
    const b = new THREE.Mesh(beadGeo, woodMat);
    b.position.copy(beadCurve.getPointAt(i / 32));
    body.add(b);
  }
  const masterBeadMat = new THREE.MeshBasicMaterial({ color: p.accent });
  glowMats.push(masterBeadMat);
  const masterBead = new THREE.Mesh(new THREE.SphereGeometry(0.026, 12, 10), masterBeadMat);
  masterBead.position.set(0, 1.195, 0.238);
  body.add(masterBead);

  const beadHaloMat = tagMat(new THREE.SpriteMaterial({
    map: softGlowTex, color: p.accent, transparent: true, opacity: 0.52,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }), CLS.fx);
  const beadHalo = new THREE.Sprite(beadHaloMat);
  beadHalo.scale.setScalar(0.16);
  beadHalo.position.set(0, 1.195, 0.25);
  body.add(beadHalo);

  const juzuTassel = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.085, 8, 1, true), tasselMat);
  juzuTassel.position.set(0, 1.135, 0.236);
  body.add(juzuTassel);
  swayParts.push(juzuTassel);

  // 7. Embroidered temple kanji emblem on the back of the robe
  const emblemTex = kanjiEmblemTex(temple.crest, p.kesaBorder, `#${techColor.toString(16).padStart(6, '0')}`);
  const emblemMat = M(0xffffff, {
    map: emblemTex, transparent: true, alphaTest: 0.15, roughness: 0.45, metalness: 0.4,
    emissive: techColor, emissiveMap: emblemTex, emissiveIntensity: 0.45, side: THREE.DoubleSide,
  });
  const emblem = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.24), emblemMat);
  emblem.position.set(0, 1.29, -0.205);
  emblem.rotation.y = Math.PI;
  body.add(emblem);

  // 8. Sculpted sleeves, forearms & hands (left: mudra, right: holding sacred staff)
  buildSleeve(body, robeMat, liningMat, giltMat, skinMat, wrapMat, 1, 'mudra');
  buildSleeve(body, robeMat, liningMat, giltMat, skinMat, wrapMat, -1, 'staff');

  // 9. Neck & sculpted realistic head + elemental headwear
  tapered(body, skinMat, [0, 1.50, 0.015], [0, 1.635, 0.03], 0.062, 0.048, 12);
  const head = new THREE.Group();
  head.position.set(0, 1.69, 0.032);
  body.add(head);

  const face = headAsset && realHead({
    tint: p.skinTint, hair: p.hair, beard: p.beard, topknot: p.topknot,
  });
  if (face) {
    const k = 0.05;
    face.group.scale.setScalar(k);
    face.group.position.set(0, 0.12 - SCAN.crown * k, -0.006);
    head.add(face.group);
  } else {
    const fallback = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), skinMat);
    fallback.scale.set(0.92, 1.18, 0.98);
    head.add(fallback);
  }

  addElementalHeadwear(head, body, p, robeMat, giltMat, cordMat, glowMats, swayParts);

  // 10. Sacred elemental staff, shoulder dharma halo, orbiting motes & ground mandala
  const staff = buildStaff(p, woodMat, giltMat, cordMat, glowMats, swayParts);
  body.add(staff);

  const halo = buildElementalHalo(p, giltMat, glowMats);
  body.add(halo);

  const motes = buildMotes(p);
  root.add(motes);

  const mandalaMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color: p.accent, transparent: true, opacity: 0.24,
    depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  }), CLS.fx);
  glowMats.push(mandalaMat);
  const mandala = new THREE.Mesh(new THREE.PlaneGeometry(1.75, 1.75), mandalaMat);
  mandala.rotation.x = -Math.PI / 2;
  mandala.position.y = 0.018;
  root.add(mandala);

  // Record resting rotation for swaying parts
  for (const part of swayParts) part.userData.baseRotZ = part.rotation.z;

  // Apply illustrated manga rim/form shader, shadows (opaque meshes only), actor layer & ASCII class
  mangaFinish(root);
  tagTree(root, CLS.actor);
  shadowTree(body);
  body.traverse(o => {
    const m = (o as THREE.Mesh).material as THREE.Material | undefined;
    if (m && m.transparent) { o.castShadow = false; o.receiveShadow = false; }
  });
  root.traverse(o => o.layers.enable(ACTOR_LAYER));

  const phase = (temple.x * 0.13 + temple.z * 0.07) % TAU;
  return { root, body, head, staff, halo, mandala, motes, swayParts, glowMats, phase };
}

/** Gentle living meditative idle animation + warm head tracking when the player is near */
export function animateTempleMonk(rig: TempleMonkRig, time: number, headYawTarget: number, nearFactor: number) {
  const t = time + rig.phase;

  // Calm breathing
  rig.body.position.y = Math.sin(t * 1.45) * 0.008;
  rig.body.scale.set(1 + Math.sin(t * 1.45) * 0.004, 1 + Math.sin(t * 1.45) * 0.005, 1);

  // Gentle head tracking + welcoming micro-nod when the player approaches
  rig.head.rotation.y += (THREE.MathUtils.clamp(headYawTarget, -0.45, 0.45) - rig.head.rotation.y) * 0.12;
  rig.head.rotation.x = Math.sin(t * 0.9) * 0.025 + nearFactor * 0.06;

  // Subtle wind sway on tassels, shide talismans, veil, and shakujō rings
  for (let i = 0; i < rig.swayParts.length; i++) {
    const part = rig.swayParts[i];
    const baseZ = (part.userData.baseRotZ as number) || 0;
    part.rotation.z = baseZ + Math.sin(t * 2.1 + i * 1.3) * 0.065;
  }

  // Slow meditative rotation of dharma halo & sacred ground mandala
  rig.halo.rotation.z = t * 0.22;
  rig.halo.position.y = 1.56 + Math.sin(t * 1.45) * 0.015;
  rig.mandala.rotation.z = -t * 0.16;

  // Orbiting elemental motes
  rig.motes.rotation.y = t * 0.35;
  for (let i = 0; i < rig.motes.children.length; i++) {
    const sp = rig.motes.children[i];
    sp.position.y = (sp.userData.baseY as number) + Math.sin(t * 1.8 + i * 0.9) * 0.08;
  }
}
