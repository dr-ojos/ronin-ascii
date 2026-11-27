// Bespoke, ultra-detailed 3D character models, 1024x1024 procedural PBR textures, sculpted anime/ink hair,
// and signature atmospheric auras for the two fixed-outfit characters:
//   1. Monarca (Solo Leveling / Shadow Monarch style): sleek high-collar black hunter trenchcoat over a
//      tailored compression turtleneck, metallic silver-obsidian clasps, flowing leg-aware split coat tails,
//      combat boots, layered swept jet-black anime hair, glowing electric cyan-blue eyes, and swirling
//      abyssal shadow-mist aura.
//   2. Vagabundo (Miyamoto Musashi / Vagabond style, faithful to the reference artwork): weathered dark
//      slate-indigo sumi-e kimono worn open at the chest, wide draped sleeves, charcoal-indigo pleated
//      hakama, dark obi with hanging braided maroon/indigo sageo cords, authentic daishō (katana + wakizashi)
//      tucked diagonally at the left hip, wild spiky chasen-gami tied-up hair with thin forehead headband,
//      rugged stubble/goatee, and woven straw waraji sandals.
import * as THREE from 'three';
import { realHead } from './real-head';
import {
  heightToNormalTex, forgedMetalPBR, braidedSilkPBR,
  ellipseArcTube, buildTassetPanel, type ArmorBuildCtx
} from './class-armor';
import { CLS, tagMat } from './materials';
import { softGlowTex } from './vfx-art';

const V = THREE.Vector3;
const TAU = Math.PI * 2;

export interface HeroHingedPanel {
  pivot: THREE.Group;
  dirX: number;
  dirZ: number;
  restPitch: number;
}

function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function makeCanvasTex(
  w: number, h: number,
  draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void,
  color = true, repeat = true
) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// ============================================================ SCULPTED 3D HAIR RIBBON GEOMETRY
/**
 * Builds a volumetric beveled 3D hair lock along a 3D Catmull-Rom curve.
 * Uses a diamond/ridge cross-section (4 vertices per ring) so every lock catches crisp directional
 * sheen and rim highlights instead of looking like flat paper cards.
 */
function buildHairLockGeo(
  pts: THREE.Vector3[],
  rootW: number,
  tipW: number,
  thick: number,
  segs = 10
): THREE.BufferGeometry {
  const curve = new THREE.CatmullRomCurve3(pts);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  const p = new V(), side = new V(), up = new V(), out = new V(), radial = new V();

  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    curve.getPointAt(t, p);
    // Smooth taper: fuller near root/mid, razor-sharp tip
    const taper = Math.pow(1 - t, 0.72) * (0.72 + 0.28 * Math.sin(Math.min(1, t * 2.5) * Math.PI * 0.5));
    const w = THREE.MathUtils.lerp(tipW, rootW, taper);
    const th = thick * Math.pow(1 - t, 0.85);

    // Orient flat face outward away from head center (0, 2.0, 0)
    radial.set(p.x, p.y - 1.9, p.z).normalize();
    const tan = frames.tangents[i];
    side.crossVectors(tan, radial);
    if (side.lengthSq() < 1e-4) side.copy(frames.normals[i]);
    else side.normalize();
    up.crossVectors(side, tan).normalize();

    // 4-point diamond cross-section: outer ridge, right edge, inner ridge, left edge
    const ring = [
      out.copy(p).addScaledVector(up, th).clone(),
      out.copy(p).addScaledVector(side, w).clone(),
      out.copy(p).addScaledVector(up, -th * 0.65).clone(),
      out.copy(p).addScaledVector(side, -w).clone(),
    ];
    for (let k = 0; k < 4; k++) {
      pos.push(ring[k].x, ring[k].y, ring[k].z);
      uv.push(k / 3, t);
    }
  }
  for (let i = 0; i < segs; i++) {
    const a = i * 4, b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      idx.push(a + k, b + k, b + k2, a + k, b + k2, a + k2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

let cachedHairTex: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } | null = null;
function hairStrandMaps() {
  if (cachedHairTex) return cachedHairTex;
  const W = 256, H = 512;
  const map = makeCanvasTex(W, H, (x) => {
    // Rich dark graphite-black hair strands (subtle tonal variation, never washed-out silver!)
    x.fillStyle = '#222632'; x.fillRect(0, 0, W, H);
    for (let i = 0; i < 160; i++) {
      const xx = hash2(i, 1.3) * W, w = 1 + hash2(i, 2.7) * 3.5;
      const v = 22 + Math.floor(hash2(i, 5.1) * 44);
      x.fillStyle = `rgb(${v},${v + 2},${Math.min(255, v + 8)})`;
      x.fillRect(xx, 0, w, H);
    }
    const g = x.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,0.55)');
    g.addColorStop(0.32, 'rgba(120,150,220,0.14)');
    g.addColorStop(0.7, 'rgba(0,0,0,0.18)');
    g.addColorStop(1, 'rgba(0,0,0,0.68)');
    x.fillStyle = g; x.fillRect(0, 0, W, H);
  });
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H;
  const hx = hc.getContext('2d')!;
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, W, H);
  for (let i = 0; i < 180; i++) {
    const xx = hash2(i, 1.3) * W, w = 1 + hash2(i, 2.7) * 3;
    const v = 40 + Math.floor(hash2(i, 9.4) * 195);
    hx.fillStyle = `rgb(${v},${v},${v})`; hx.fillRect(xx, 0, w, H);
  }
  cachedHairTex = { map, normal: heightToNormalTex(hc, 2.2) };
  return cachedHairTex;
}

// ============================================================ HIGH-RES 1024x1024 PROCEDURAL PBR TEXTURES

interface HeroPBR {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  emissive?: THREE.CanvasTexture;
}

let cachedMonarcaCoatPBR: HeroPBR | null = null;
/** Tailored dark obsidian-charcoal hunter trenchcoat fabric (1024x1024): micro-twill, tailored stitch seams, subtle abyssal violet-blue trim */
function monarcaCoatPBR(): HeroPBR {
  if (cachedMonarcaCoatPBR) return cachedMonarcaCoatPBR;
  const S = 1024;
  const map = makeCanvasTex(S, S, x => {
    const bg = x.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, '#131624');
    bg.addColorStop(0.45, '#0c0e18');
    bg.addColorStop(0.85, '#080a12');
    bg.addColorStop(1, '#0c1022');
    x.fillStyle = bg; x.fillRect(0, 0, S, S);
    // Fine luxury diagonal twill / gabardine weave
    x.strokeStyle = 'rgba(130,155,215,0.036)'; x.lineWidth = 1.4;
    for (let i = -S; i < S * 2; i += 8) {
      x.beginPath(); x.moveTo(i, 0); x.lineTo(i + S, S); x.stroke();
    }
    x.strokeStyle = 'rgba(0,0,0,0.22)'; x.lineWidth = 1.2;
    for (let i = -S; i < S * 2; i += 12) {
      x.beginPath(); x.moveTo(i + 4, 0); x.lineTo(i - S + 4, S); x.stroke();
    }
    // Tailored princess/panel seams with crisp topstitching
    for (const sx of [128, 384, 640, 896]) {
      x.fillStyle = 'rgba(0,0,0,0.62)'; x.fillRect(sx - 2, 0, 4, S);
      x.fillStyle = 'rgba(140,175,235,0.18)'; x.fillRect(sx + 2, 0, 1.8, S);
      x.fillStyle = 'rgba(165,195,255,0.28)';
      for (let yy = 6; yy < S; yy += 16) x.fillRect(sx - 7, yy, 2, 7);
      for (let yy = 6; yy < S; yy += 16) x.fillRect(sx + 6, yy, 2, 7);
    }
    // Subtle dark leather grain
    for (let i = 0; i < 420; i++) {
      const cx = hash2(i, 3.1) * S, cy = hash2(i, 7.3) * S, r = 6 + hash2(i, 11.7) * 28;
      const g = x.createRadialGradient(cx, cy, 1, cx, cy, r);
      g.addColorStop(0, hash2(i, 15.1) > 0.5 ? 'rgba(95,120,190,0.045)' : 'rgba(0,0,0,0.09)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.fillStyle = g; x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
    }
    // Subtle dark-violet & electric-blue shadow-rune hem border near bottom
    const hemY = S - 58;
    const hemG = x.createLinearGradient(0, hemY - 30, 0, S);
    hemG.addColorStop(0, 'rgba(0,0,0,0)');
    hemG.addColorStop(0.7, 'rgba(42,68,165,0.18)');
    hemG.addColorStop(1, 'rgba(72,140,255,0.28)');
    x.fillStyle = hemG; x.fillRect(0, hemY - 30, S, 88);
    x.strokeStyle = 'rgba(128,176,255,0.34)'; x.lineWidth = 2.4;
    x.beginPath(); x.moveTo(0, hemY + 26); x.lineTo(S, hemY + 26); x.stroke();
  });

  const hc = document.createElement('canvas'); hc.width = hc.height = S;
  const hx = hc.getContext('2d')!;
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  hx.strokeStyle = '#929292'; hx.lineWidth = 1.5;
  for (let i = -S; i < S * 2; i += 8) { hx.beginPath(); hx.moveTo(i, 0); hx.lineTo(i + S, S); hx.stroke(); }
  for (const sx of [128, 384, 640, 896]) {
    hx.fillStyle = '#383838'; hx.fillRect(sx - 2, 0, 4, S);
    hx.fillStyle = '#c8c8c8';
    for (let yy = 6; yy < S; yy += 16) { hx.fillRect(sx - 7, yy, 2, 7); hx.fillRect(sx + 6, yy, 2, 7); }
  }
  const rough = makeCanvasTex(S, S, x => {
    x.fillStyle = '#8e8e8e'; x.fillRect(0, 0, S, S);
    for (const sx of [128, 384, 640, 896]) {
      x.fillStyle = '#484848'; x.fillRect(sx - 3, 0, 6, S);
    }
    x.fillStyle = '#525252'; x.fillRect(0, S - 42, S, 42);
  }, false);

  const emissive = makeCanvasTex(S, S, x => {
    x.fillStyle = '#000000'; x.fillRect(0, 0, S, S);
    // Razor-fine luminous cyan-violet shadow line along the bottom hem & subtle vertical seam glints
    const g = x.createLinearGradient(0, S - 64, 0, S);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.6, 'rgba(60,85,220,0.22)');
    g.addColorStop(1, 'rgba(65,180,255,0.45)');
    x.fillStyle = g; x.fillRect(0, S - 64, S, 64);
    x.strokeStyle = '#5ac8ff'; x.lineWidth = 3;
    x.beginPath(); x.moveTo(0, S - 30); x.lineTo(S, S - 30); x.stroke();
  });

  cachedMonarcaCoatPBR = { map, normal: heightToNormalTex(hc, 1.9), rough, emissive };
  return cachedMonarcaCoatPBR;
}

let cachedVagabondKimonoPBR: HeroPBR | null = null;
/** Painterly sumi-e dark indigo-slate weathered kimono PBR maps (1024x1024) matching the Vagabond artwork */
export function vagabondKimonoPBR(): HeroPBR {
  if (cachedVagabondKimonoPBR) return cachedVagabondKimonoPBR;
  const S = 1024;
  const map = makeCanvasTex(S, S, x => {
    // Rich dark slate-teal / Prussian indigo watercolor base
    const bg = x.createLinearGradient(0, 0, S, S);
    bg.addColorStop(0, '#2a414c');
    bg.addColorStop(0.35, '#1e313c');
    bg.addColorStop(0.7, '#273c46');
    bg.addColorStop(1, '#16242d');
    x.fillStyle = bg; x.fillRect(0, 0, S, S);

    // Broad sumi-e ink brush strokes & organic draped shadow folds (like Takehiko Inoue's watercolor washes)
    for (let i = 0; i < 64; i++) {
      const x0 = hash2(i, 1.7) * S, y0 = hash2(i, 2.9) * S;
      const len = 140 + hash2(i, 4.3) * 380;
      const w = 18 + hash2(i, 6.1) * 62;
      const ang = (hash2(i, 8.3) - 0.5) * 0.65 + (i % 3 === 0 ? 0.22 : -0.15);
      const dark = hash2(i, 10.7) > 0.36;
      x.save();
      x.translate(x0, y0);
      x.rotate(ang);
      const g = x.createLinearGradient(-w, 0, w, len);
      if (dark) {
        g.addColorStop(0, 'rgba(8,14,19,0)');
        g.addColorStop(0.3, 'rgba(8,14,19,0.52)');
        g.addColorStop(0.7, 'rgba(11,18,24,0.44)');
        g.addColorStop(1, 'rgba(8,14,19,0)');
      } else {
        g.addColorStop(0, 'rgba(84,122,134,0)');
        g.addColorStop(0.4, 'rgba(82,118,132,0.34)');
        g.addColorStop(1, 'rgba(84,122,134,0)');
      }
      x.fillStyle = g;
      x.beginPath();
      x.moveTo(-w * 0.4, 0);
      x.quadraticCurveTo(-w, len * 0.45, -w * 0.25, len);
      x.lineTo(w * 0.35, len);
      x.quadraticCurveTo(w * 0.9, len * 0.55, w * 0.45, 0);
      x.closePath();
      x.fill();
      x.restore();
    }

    // Fine raw woven hemp / cotton slub texture
    for (let y = 0; y < S; y += 4) {
      const a = 0.03 + hash2(y, 13.1) * 0.04;
      x.fillStyle = (y & 4) ? `rgba(210,230,235,${a.toFixed(3)})` : `rgba(5,10,14,${(a * 1.4).toFixed(3)})`;
      x.fillRect(0, y, S, 1.5);
    }
    for (let xx = 0; xx < S; xx += 5) {
      const a = 0.025 + hash2(xx, 19.4) * 0.035;
      x.fillStyle = `rgba(12,18,22,${a.toFixed(3)})`;
      x.fillRect(xx, 0, 1.4, S);
    }
    // Dry-brush pale distressed scuffs along weathered fabric
    x.strokeStyle = 'rgba(145,175,182,0.14)'; x.lineWidth = 1.6;
    for (let i = 0; i < 95; i++) {
      const sx = hash2(i, 21.1) * S, sy = hash2(i, 25.3) * S, sl = 18 + hash2(i, 29.7) * 58;
      x.beginPath(); x.moveTo(sx, sy); x.lineTo(sx + sl * 0.25, sy + sl); x.stroke();
    }
  });

  const hc = document.createElement('canvas'); hc.width = hc.height = S;
  const hx = hc.getContext('2d')!;
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  for (let i = 0; i < 48; i++) {
    const x0 = hash2(i, 1.7) * S, y0 = hash2(i, 2.9) * S, w = 22 + hash2(i, 6.1) * 55, len = 160 + hash2(i, 4.3) * 340;
    const g = hx.createLinearGradient(x0 - w, y0, x0 + w, y0);
    g.addColorStop(0, '#808080'); g.addColorStop(0.45, '#a8a8a8'); g.addColorStop(0.55, '#585858'); g.addColorStop(1, '#808080');
    hx.fillStyle = g; hx.fillRect(x0 - w, y0, w * 2, len);
  }
  for (let y = 0; y < S; y += 4) { hx.fillStyle = (y & 4) ? '#909090' : '#707070'; hx.fillRect(0, y, S, 1.5); }

  const rough = makeCanvasTex(S, S, x => {
    x.fillStyle = '#dcdcdc'; x.fillRect(0, 0, S, S);
    for (let i = 0; i < 40; i++) {
      x.fillStyle = 'rgba(255,255,255,0.12)';
      x.fillRect(hash2(i, 3.3) * S, hash2(i, 5.5) * S, 40, 120);
    }
  }, false);

  cachedVagabondKimonoPBR = { map, normal: heightToNormalTex(hc, 2.0), rough };
  return cachedVagabondKimonoPBR;
}

let cachedVagabondHakamaPBR: HeroPBR | null = null;
/** Deeply pleated charcoal-black & sumi-e ink-wash hakama PBR maps (1024x1024) matching the photo */
export function vagabondHakamaPBR(): HeroPBR {
  if (cachedVagabondHakamaPBR) return cachedVagabondHakamaPBR;
  const S = 1024, pleats = 16, pw = S / pleats;
  const map = makeCanvasTex(S, S, x => {
    // Deep charcoal-slate hakama vertical pleats with painterly watercolor gradient
    for (let i = 0; i < pleats; i++) {
      const x0 = i * pw;
      const g = x.createLinearGradient(x0, 0, x0 + pw, 0);
      g.addColorStop(0.0, '#0a0b10');
      g.addColorStop(0.14, '#1a1c25');
      g.addColorStop(0.48, '#30323e');
      g.addColorStop(0.78, '#1e202b');
      g.addColorStop(1.0, '#08090e');
      x.fillStyle = g; x.fillRect(x0, 0, pw, S);
      // Soft indigo-charcoal sheen along pleat crest
      x.fillStyle = 'rgba(135,148,175,0.12)';
      x.fillRect(x0 + pw * 0.42, 0, pw * 0.14, S);
    }
    // Painterly dark ink brush-washes breaking up mechanical uniformity
    for (let i = 0; i < 48; i++) {
      const cx = hash2(i, 4.1) * S, cy = hash2(i, 8.7) * S, rw = 26 + hash2(i, 12.3) * 65, rh = 120 + hash2(i, 16.9) * 320;
      const g = x.createRadialGradient(cx, cy, 4, cx, cy, rh * 0.5);
      g.addColorStop(0, hash2(i, 20.1) > 0.45 ? 'rgba(8,9,13,0.44)' : 'rgba(64,72,90,0.22)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      x.save(); x.translate(cx, cy); x.scale(rw / (rh * 0.5), 1);
      x.fillStyle = g; x.beginPath(); x.arc(0, 0, rh * 0.5, 0, TAU); x.fill();
      x.restore();
    }
    // Dusty weathered watercolor fade near the very bottom hem (matches the photo's soft lower wash)
    const hem = x.createLinearGradient(0, S * 0.72, 0, S);
    hem.addColorStop(0, 'rgba(65,68,78,0)');
    hem.addColorStop(0.75, 'rgba(72,74,84,0.22)');
    hem.addColorStop(1, 'rgba(88,88,96,0.34)');
    x.fillStyle = hem; x.fillRect(0, S * 0.72, S, S * 0.28);
  });

  const hc = document.createElement('canvas'); hc.width = hc.height = S;
  const hx = hc.getContext('2d')!;
  for (let i = 0; i < pleats; i++) {
    const x0 = i * pw;
    const g = hx.createLinearGradient(x0, 0, x0 + pw, 0);
    g.addColorStop(0.0, '#181818');
    g.addColorStop(0.45, '#e8e8e8');
    g.addColorStop(0.85, '#686868');
    g.addColorStop(1.0, '#181818');
    hx.fillStyle = g; hx.fillRect(x0, 0, pw, S);
  }
  const rough = makeCanvasTex(S, S, x => {
    x.fillStyle = '#e4e4e4'; x.fillRect(0, 0, S, S);
  }, false);

  cachedVagabondHakamaPBR = { map, normal: heightToNormalTex(hc, 2.6), rough };
  return cachedVagabondHakamaPBR;
}

let cachedTsukaItoTex: THREE.CanvasTexture | null = null;
/** Classic diamond-wrapped katana hilt (tsuka-ito) texture with pale samegawa rayskin glimpses */
function tsukaItoTex() {
  if (cachedTsukaItoTex) return cachedTsukaItoTex;
  const W = 128, H = 256;
  cachedTsukaItoTex = makeCanvasTex(W, H, x => {
    x.fillStyle = '#d4d0c6'; x.fillRect(0, 0, W, H);
    // Rayskin nodules
    x.fillStyle = 'rgba(80,75,70,0.45)';
    for (let i = 0; i < 240; i++) { x.beginPath(); x.arc(hash2(i, 1.1) * W, hash2(i, 2.2) * H, 1.3, 0, TAU); x.fill(); }
    // Tight dark brown-black braided silk cross-wrap
    x.strokeStyle = '#191418'; x.lineWidth = 22;
    for (let y = -H; y < H * 2; y += H / 7) {
      x.beginPath(); x.moveTo(0, y); x.lineTo(W, y + H / 7); x.stroke();
      x.beginPath(); x.moveTo(W, y); x.lineTo(0, y + H / 7); x.stroke();
    }
    x.strokeStyle = 'rgba(255,255,255,0.12)'; x.lineWidth = 2;
    for (let y = -H; y < H * 2; y += H / 7) {
      x.beginPath(); x.moveTo(0, y - 6); x.lineTo(W, y + H / 7 - 6); x.stroke();
    }
  });
  return cachedTsukaItoTex;
}

// ============================================================ 1. MONARCA HEAD (SOLO LEVELING)
/**
 * Builds Sung Jinwoo-inspired head inside rig.ts's head group (`hg`):
 * realistic 3D head scan + pale sharp complexion + glowing electric cyan-blue eyes + subtle eye glint +
 * 36 individually sculpted 3D beveled jet-black anime hair locks (parted swept bangs, crown volume, side locks & nape).
 */
export function buildMonarcaHead(): THREE.Group {
  const { group } = realHead({
    tint: 0xf4ece8,
    hair: 0x0b0c14,
    eyeStyle: 'monarch',
    topknot: false
  });
  group.userData.part = 'head-monarca';

  const hTex = hairStrandMaps();
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0x161a28,
    map: hTex.map,
    normalMap: hTex.normal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughness: 0.48,
    metalness: 0.04,
    clearcoat: 0.16,
    clearcoatRoughness: 0.42,
    sheen: 0.25,
    sheenColor: new THREE.Color(0x284080),
    sheenRoughness: 0.65,
    side: THREE.DoubleSide
  });

  // Fitted inner hair skull cap so there are zero scalp gaps between sculpted locks
  const capGeo = new THREE.SphereGeometry(2.04, 28, 18, 0, TAU, 0, Math.PI * 0.60);
  const cap = new THREE.Mesh(capGeo, hairMat);
  cap.scale.set(0.96, 1.01, 1.11);
  cap.position.set(0, 2.02, -0.22);
  cap.rotation.x = -0.18;
  group.add(cap);

  // Sharp sculpted dark anime eyebrows angled subtly inward for intensity
  const browMat = new THREE.MeshStandardMaterial({ color: 0x090b12, roughness: 0.75 });
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(
      buildHairLockGeo([
        new V(s * 0.24, 2.04, 2.02),
        new V(s * 0.62, 2.15, 1.98),
        new V(s * 1.06, 2.12, 1.66)
      ], 0.09, 0.03, 0.035, 5),
      browMat
    );
    group.add(brow);
  }

  // ---- Sculpted multi-layered anime hair locks (parted cleanly above the glowing blue eyes!)
  const addLock = (pts: [number, number, number][], rootW: number, tipW: number, thick: number, segs = 10) => {
    const m = new THREE.Mesh(buildHairLockGeo(pts.map(([x, y, z]) => new V(x, y, z)), rootW, tipW, thick, segs), hairMat);
    group.add(m);
  };

  // Front parted bangs sweeping cleanly to the sides of the forehead (leaving his piercing glowing blue eyes 100% visible!)
  const bangs: [number, number, number][][] = [
    [[0.18, 3.85, 0.85], [-0.22, 3.45, 1.82], [-0.72, 2.86, 2.12], [-1.14, 2.34, 1.98]],
    [[0.36, 3.84, 0.82], [0.58, 3.42, 1.84], [0.96, 2.82, 2.08], [1.26, 2.26, 1.92]],
    [[-0.25, 3.82, 0.78], [-0.78, 3.36, 1.68], [-1.28, 2.74, 1.92], [-1.52, 2.12, 1.78]],
    [[0.62, 3.76, 0.68], [1.06, 3.28, 1.64], [1.46, 2.66, 1.86], [1.62, 2.04, 1.72]],
    [[-0.68, 3.68, 0.55], [-1.22, 3.16, 1.48], [-1.60, 2.48, 1.66], [-1.72, 1.78, 1.50]],
    [[0.82, 3.66, 0.52], [1.34, 3.10, 1.44], [1.66, 2.42, 1.60], [1.74, 1.74, 1.46]],
    // Delicate sharp center strand ending right above the bridge of the nose
    [[0.08, 3.78, 1.06], [0.02, 3.24, 1.98], [-0.08, 2.68, 2.22], [-0.14, 2.32, 2.14]],
  ];
  for (const b of bangs) addLock(b, 0.42, 0.05, 0.14, 10);

  // Crown & upper layered sleek swept locks
  for (let i = 0; i < 12; i++) {
    const u = (i / 11) * 2 - 1;
    const ang = u * 1.32;
    const x0 = Math.sin(ang) * 0.45, z0 = 0.25 - Math.abs(u) * 0.35;
    const x1 = Math.sin(ang) * 1.48, z1 = 0.85 - Math.abs(u) * 0.95;
    const x2 = Math.sin(ang) * 2.15, z2 = 0.20 - Math.abs(u) * 1.65;
    const lift = 0.36 + 0.18 * Math.cos(u * 2.1);
    addLock([
      [x0, 4.02, z0],
      [x1, 3.92 + lift, z1],
      [x2 * 0.98, 3.20 + lift * 0.3, z2],
      [x2 * 1.04, 2.25, z2 - 0.35]
    ], 0.56, 0.08, 0.20, 9);
  }

  // Side locks framing temples and cheekbones (left & right)
  for (const s of [-1, 1]) {
    addLock([[s * 1.2, 3.3, 0.4], [s * 1.98, 2.6, 0.65], [s * 2.04, 1.72, 0.85], [s * 1.76, 0.88, 0.98]], 0.46, 0.06, 0.16, 9);
    addLock([[s * 1.35, 3.15, -0.15], [s * 2.06, 2.35, 0.0], [s * 2.06, 1.42, 0.18], [s * 1.82, 0.55, 0.36]], 0.50, 0.07, 0.17, 9);
    addLock([[s * 1.3, 3.0, -0.68], [s * 2.02, 2.15, -0.68], [s * 1.96, 1.15, -0.58], [s * 1.65, 0.22, -0.35]], 0.52, 0.08, 0.18, 9);
  }

  // Back & layered nape locks tapering crisply down toward the upturned coat collar
  for (let i = 0; i < 11; i++) {
    const u = (i / 10) * 2 - 1;
    const ang = Math.PI + u * 1.08;
    const sx = Math.sin(ang), cz = Math.cos(ang);
    const flare = 0.22 + 0.16 * (i % 2);
    addLock([
      [sx * 1.05, 3.65, cz * 1.15],
      [sx * 2.05, 2.75, cz * 2.22],
      [sx * (2.06 + flare * 0.3), 1.48, cz * (2.28 + flare * 0.4)],
      [sx * (1.72 + flare * 0.4), 0.18 - (i % 2) * 0.25, cz * (1.96 + flare * 0.6)]
    ], 0.58, 0.07, 0.19, 9);
  }

  return group;
}

// ============================================================ 2. VAGABUNDO HEAD (MUSASHI / VAGABOND)
/**
 * Builds Miyamoto Musashi's iconic head from the uploaded Vagabond artwork:
 * weathered tanned skin, intense focused dark eyes, rugged goatee/jawline stubble & mustache,
 * thin dark forehead cloth cord (hachimaki), and wild spiky tied-up chasen-gami hair bun with
 * asymmetric radiating spiky hair tufts!
 */
export function buildVagabundoHead(): THREE.Group {
  const { group } = realHead({
    tint: 0xf4dac2,
    hair: 0x1a1310,
    beard: 0x1b1410,
    beardStrength: 0.92,
    eyeStyle: 'vagabond',
    topknot: false
  });
  group.userData.part = 'head-vagabundo';

  const hTex = hairStrandMaps();
  const hairMat = new THREE.MeshPhysicalMaterial({
    color: 0x221714,
    map: hTex.map,
    normalMap: hTex.normal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: 0.64,
    metalness: 0.02,
    sheen: 0.35,
    sheenColor: new THREE.Color(0x52392d),
    sheenRoughness: 0.6,
    side: THREE.DoubleSide
  });

  // Swept-back textured scalp hair cap pulled tightly toward the high back bun
  const cap = new THREE.Mesh(new THREE.SphereGeometry(2.02, 26, 16, 0, TAU, 0, Math.PI * 0.56), hairMat);
  cap.scale.set(0.95, 0.98, 1.09);
  cap.position.set(0, 2.08, -0.24);
  cap.rotation.x = -0.24;
  group.add(cap);

  // Intense furrowed dark eyebrows
  const browMat = new THREE.MeshStandardMaterial({ color: 0x18110e, roughness: 0.82 });
  for (const s of [-1, 1]) {
    const brow = new THREE.Mesh(
      buildHairLockGeo([
        new V(s * 0.22, 1.98, 2.03),
        new V(s * 0.62, 2.07, 1.99),
        new V(s * 1.04, 2.13, 1.68)
      ], 0.11, 0.04, 0.05, 5),
      browMat
    );
    group.add(brow);
  }

  // Thin dark cloth forehead cord / headband (hachimaki) — exact thin line across Musashi's forehead in the photo!
  const cordMat = new THREE.MeshStandardMaterial({ color: 0x252832, roughness: 0.88 });
  const hachiPts: THREE.Vector3[] = [];
  for (let i = 0; i <= 32; i++) {
    const a = (i / 32) * TAU;
    const rx = 1.66 + 0.04 * Math.cos(a * 2);
    const rz = a > Math.PI * 0.5 && a < Math.PI * 1.5 ? 2.24 : 2.00;
    const y = 2.46 - 0.14 * Math.cos(a);
    hachiPts.push(new V(Math.sin(a) * rx, y, Math.cos(a) * rz - 0.16));
  }
  group.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hachiPts, true), 48, 0.055, 6, true), cordMat));

  // Swept-back hairline strands pulling up from forehead & temples toward the bun
  const bunBase = new V(0, 3.68, -1.36);
  const addLock = (pts: [number, number, number][], rootW: number, tipW: number, thick: number, segs = 8) => {
    group.add(new THREE.Mesh(buildHairLockGeo(pts.map(([x, y, z]) => new V(x, y, z)), rootW, tipW, thick, segs), hairMat));
  };

  for (let i = 0; i < 10; i++) {
    const u = (i / 9) * 2 - 1;
    const ang = u * 1.45;
    addLock([
      [Math.sin(ang) * 1.52, 2.75 - Math.abs(u) * 0.45, Math.cos(ang) * 1.82],
      [Math.sin(ang) * 1.48, 3.66 - Math.abs(u) * 0.25, Math.cos(ang) * 0.85 - 0.35],
      [Math.sin(ang) * 0.52, 3.92, -0.88],
      [bunBase.x + u * 0.18, bunBase.y, bunBase.z]
    ], 0.42, 0.24, 0.14, 7);
  }

  // Gathered high ponytail/bun core + dark indigo tie cord
  const bunCore = new THREE.Mesh(new THREE.SphereGeometry(0.62, 14, 10), hairMat);
  bunCore.scale.set(1.05, 0.95, 1.15);
  bunCore.position.set(0, 3.75, -1.42);
  group.add(bunCore);
  const tie = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.085, 6, 20), new THREE.MeshStandardMaterial({ color: 0x263547, roughness: 0.82 }));
  tie.position.set(0, 3.68, -1.36);
  tie.rotation.set(0.55, 0, 0);
  group.add(tie);

  // Iconic WILD, SPIKY, RADIATING hair tufts fanning out from the bun and sides (exact Vagabond photo silhouette!)
  const spikes: [number, number, number, number][] = [
    // [dx, dy, dz, length] — asymmetric wild bursts sweeping up, right, left, and back!
    [ 0.10,  1.00, -0.25, 1.95], // tall center-top flame-like tuft
    [-0.26,  0.96, -0.18, 1.75],
    [ 0.48,  0.86, -0.22, 1.85],
    [-0.68,  0.76, -0.28, 1.72],
    [ 0.84,  0.58, -0.20, 2.10], // signature long right-flaring wild spikes (seen prominently in photo!)
    [ 0.96,  0.34, -0.16, 2.15],
    [ 0.98,  0.08, -0.12, 1.88],
    [ 0.92, -0.18, -0.18, 1.65],
    [-0.86,  0.48, -0.24, 1.65], // left-side wild tufts
    [-0.95,  0.22, -0.20, 1.55],
    [-0.90, -0.06, -0.22, 1.42],
    [ 0.56,  0.72, -0.62, 1.78],
    [-0.44,  0.68, -0.68, 1.68],
    [ 0.06,  0.62, -0.82, 1.82],
    [ 0.72,  0.26, -0.66, 1.85],
    [-0.68,  0.20, -0.72, 1.62],
    [ 0.42, -0.22, -0.88, 1.65],
    [-0.36, -0.28, -0.86, 1.58],
    [ 0.04, -0.45, -0.88, 1.52],
  ];
  spikes.forEach(([dx, dy, dz, len], i) => {
    const dir = new V(dx, dy, dz).normalize();
    const bend = new V(Math.sin(i * 2.1) * 0.22, 0.24 + (i % 3) * 0.1, -0.12);
    const p0 = bunBase.clone().addScaledVector(dir, 0.22);
    const p1 = bunBase.clone().addScaledVector(dir, len * 0.48).addScaledVector(bend, 0.22);
    const p2 = bunBase.clone().addScaledVector(dir, len * 0.82).addScaledVector(bend, 0.52);
    const p3 = bunBase.clone().addScaledVector(dir, len * 1.08).addScaledVector(bend, 0.78);
    addLock([
      [p0.x, p0.y, p0.z],
      [p1.x, p1.y, p1.z],
      [p2.x, p2.y, p2.z],
      [p3.x, p3.y, p3.z]
    ], 0.28 + (i % 3) * 0.06, 0.03, 0.13, 7);
  });

  // Stray unruly sideburns & loose strands sticking out near the ears and nape (like the photo!)
  for (const s of [-1, 1]) {
    addLock([[s * 1.68, 2.35, 0.15], [s * 2.12, 2.12, 0.05], [s * 2.48, 2.18, -0.15]], 0.24, 0.03, 0.09, 6);
    addLock([[s * 1.72, 1.82, -0.18], [s * 2.18, 1.55, -0.28], [s * 2.52, 1.62, -0.45]], 0.22, 0.03, 0.09, 6);
    addLock([[s * 1.48, 1.25, -0.88], [s * 1.92, 0.82, -1.12], [s * 2.25, 0.65, -1.35]], 0.26, 0.04, 0.10, 6);
  }
  // Nape straggler tufts
  for (let i = -2; i <= 2; i++) {
    addLock([
      [i * 0.48, 1.42, -1.85],
      [i * 0.56, 0.75, -2.02],
      [i * 0.68, 0.15, -2.18]
    ], 0.30, 0.04, 0.11, 6);
  }

  return group;
}

// ============================================================ SHARED CUSTOM TORSO SHELL BUILDER
/**
 * Builds an anatomical torso shell with a configurable open front slit / V-neckline,
 * used for both Monarca's sleek tailored hunter trenchcoat and Vagabundo's open-chest kimono!
 */
function buildOpenFrontTorso(opts: {
  chestW: number;
  waistW: number;
  depth: number;
  /** half-angle (radians from +z front center) of the front opening at top (v=1) and bottom (v=0) */
  gapTop: number;
  gapBot: number;
  /** if true, closes below v = closeBelow (for a V-neck kimono crossed at mid-chest) */
  vNeckBottom?: number;
  collarRise?: number;
  /** sleek athletic flat-front profile (no barrel-chest swell) for tailored coats */
  slim?: boolean;
}, radialSegs = 44): THREE.BufferGeometry {
  const rings: [number, number, number][] = opts.slim
    ? [
        // Slim, flat-fronted athletic V-taper sitting cleanly 1.5cm outside fittedBody with zero clipping or barrel bulge
        [-0.270, 0.184 * opts.waistW, 0.128 * opts.depth],
        [-0.210, 0.182 * opts.waistW, 0.126 * opts.depth],
        [-0.145, 0.188 * (opts.waistW * 0.7 + opts.chestW * 0.3), 0.130 * opts.depth],
        [-0.075, 0.197 * (opts.waistW * 0.4 + opts.chestW * 0.6), 0.135 * opts.depth],
        [0.005,  0.207 * opts.chestW, 0.140 * opts.depth],
        [0.085,  0.214 * opts.chestW, 0.143 * opts.depth],
        [0.150,  0.214 * opts.chestW, 0.140 * opts.depth],
        [0.200,  0.192 * opts.chestW, 0.128 * opts.depth],
        [0.235,  0.156 * opts.chestW, 0.110 * opts.depth],
        [0.262,  0.114 * opts.chestW, 0.092 * opts.depth],
      ]
    : [
        [-0.270, 0.178 * opts.waistW, 0.124 * opts.depth],
        [-0.210, 0.176 * opts.waistW, 0.122 * opts.depth],
        [-0.145, 0.184 * (opts.waistW * 0.6 + opts.chestW * 0.4), 0.128 * opts.depth],
        [-0.075, 0.198 * (opts.waistW * 0.3 + opts.chestW * 0.7), 0.136 * opts.depth],
        [0.005,  0.212 * opts.chestW, 0.144 * opts.depth],
        [0.085,  0.218 * opts.chestW, 0.148 * opts.depth],
        [0.150,  0.210 * opts.chestW, 0.142 * opts.depth],
        [0.200,  0.186 * opts.chestW, 0.128 * opts.depth],
        [0.235,  0.152 * opts.chestW, 0.108 * opts.depth],
        [0.262,  0.116 * opts.chestW, 0.092 * opts.depth],
      ];
  const rows = rings.length;
  const stride = radialSegs + 1;
  const pos = new Float32Array(rows * stride * 3);
  const uv = new Float32Array(rows * stride * 2);

  for (let i = 0; i < rows; i++) {
    const [baseY, rx, rz] = rings[i];
    const v = i / (rows - 1);
    let gap: number;
    if (opts.vNeckBottom !== undefined) {
      const vt = THREE.MathUtils.clamp((v - opts.vNeckBottom) / (1 - opts.vNeckBottom), 0, 1);
      gap = opts.gapBot + (opts.gapTop - opts.gapBot) * Math.pow(vt, 0.85);
    } else {
      gap = THREE.MathUtils.lerp(opts.gapBot, opts.gapTop, v);
    }
    const span = TAU - gap * 2;
    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const th = gap + u * span; // starts at right front lapel edge (+gap) and sweeps around back to left edge (TAU - gap)
      const sx = Math.sin(th), cz = Math.cos(th);
      // Tailored flat-front / crisp shoulder contour (no puffy barrel swell)
      const sq = opts.slim ? (1 + 0.025 * Math.abs(sx) * Math.abs(cz) * 2.0) : (1 + 0.045 * Math.abs(sx) * Math.abs(cz) * 2.0);
      let x = sx * rx * sq;
      let z = cz * rz * sq;
      // Gently flatten front sternum & back spine for a lean anatomical jacket fit
      if (opts.slim && Math.abs(cz) > 0.5) {
        const flat = (Math.abs(cz) - 0.5) * 2.0;
        z *= 1 - 0.06 * flat;
      }
      let y = baseY;
      if (opts.collarRise && v > 0.82 && cz < 0.25) {
        y += opts.collarRise * ((v - 0.82) / 0.18) * THREE.MathUtils.clamp((0.25 - cz) / 1.25, 0, 1);
      }
      const idx = i * stride + j;
      pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z;
      uv[idx * 2] = u; uv[idx * 2 + 1] = v;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j, b = a + stride, c = b + 1, d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

// ============================================================ 3. MONARCA OUTFIT (SOLO LEVELING)
export function buildMonarcaOutfit(
  setId: string,
  ctx: ArmorBuildCtx,
  skirtPanels: Map<string, HeroHingedPanel[]>
) {
  const { P, rigChest, rigWaist, overlay, hang } = ctx;
  const pbr = monarcaCoatPBR();
  const metPbr = forgedMetalPBR();

  const makeCoatMat = (rx: number, ry: number, withHemEmissive = false) => {
    const map = pbr.map.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
    const norm = pbr.normal.clone(); norm.repeat.set(rx, ry); norm.needsUpdate = true;
    const rough = pbr.rough.clone(); rough.repeat.set(rx, ry); rough.needsUpdate = true;
    const em = withHemEmissive && pbr.emissive ? pbr.emissive.clone() : null;
    if (em) { em.repeat.set(rx, ry); em.needsUpdate = true; }
    return new THREE.MeshPhysicalMaterial({
      map, normalMap: norm, normalScale: new THREE.Vector2(1.05, 1.05),
      roughnessMap: rough, roughness: 0.72, metalness: 0.14,
      clearcoat: 0.18, clearcoatRoughness: 0.45,
      sheen: 0.55, sheenColor: new THREE.Color(0x3a58a8), sheenRoughness: 0.55,
      emissiveMap: em, emissive: em ? 0xffffff : 0x090c18, emissiveIntensity: em ? 0.9 : 0.08,
      side: THREE.DoubleSide
    });
  };

  const underSuitMat = new THREE.MeshPhysicalMaterial({
    color: 0x0b0d14, roughness: 0.82, metalness: 0.08,
    sheen: 0.25, sheenColor: new THREE.Color(0x283558), sheenRoughness: 0.7,
    emissive: 0x060812, emissiveIntensity: 0.08, side: THREE.DoubleSide
  });

  const trimMetal = new THREE.MeshPhysicalMaterial({
    color: 0xb8c8e2, normalMap: metPbr.normal, normalScale: new THREE.Vector2(0.5, 0.5),
    roughness: 0.24, metalness: 0.92, clearcoat: 0.4,
    emissive: 0x2a4578, emissiveIntensity: 0.22
  });

  const manaGlow = new THREE.MeshStandardMaterial({
    color: 0x76e0ff, roughness: 0.15, metalness: 0.2,
    emissive: 0x42b4ff, emissiveIntensity: 2.1
  });
  manaGlow.userData.noGlyphs = true;

  const leatherMat = new THREE.MeshPhysicalMaterial({
    color: 0x090b11, roughness: 0.36, metalness: 0.18,
    clearcoat: 0.55, clearcoatRoughness: 0.24,
    emissive: 0x05070e, emissiveIntensity: 0.05, side: THREE.DoubleSide
  });

  // ---- TORSO: sleek slim athletic V-taper open-front hunter overcoat (skin-tight turtleneck rendered directly on skinned body!)
  if (rigChest) {
    const g = new THREE.Group();
    g.name = 'monarca-coat-torso';

    // Slim fitted matte-black turtleneck neck collar hugging the neck cleanly (no bulky inner torso barrel!)
    const turtleneck = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.084, 0.088, 24, 1, true), underSuitMat);
    turtleneck.scale.z = 0.88; turtleneck.position.set(0, 0.274, 0.002);
    g.add(turtleneck);

    // Outer sleek slim tailored hunter trenchcoat torso (flat athletic front, trim waist, sharp shoulders)
    const coatShell = new THREE.Mesh(
      buildOpenFrontTorso({ chestW: 1.0, waistW: 0.98, depth: 0.98, gapTop: 0.48, gapBot: 0.34, collarRise: 0.018, slim: true }, 44),
      makeCoatMat(2.4, 1.4, false)
    );
    g.add(coatShell);

    // Crisp slim upturned standing coat collar (hugs the neck cleanly without funnel-bulging!)
    const collarGeo = new THREE.CylinderGeometry(0.114, 0.104, 0.104, 32, 3, true, 0.62, TAU - 1.24);
    const cPos = collarGeo.attributes.position;
    for (let i = 0; i < cPos.count; i++) {
      const y = cPos.getY(i), z = cPos.getZ(i);
      const topF = (y + 0.052) / 0.104;
      cPos.setX(i, cPos.getX(i) * (1 + 0.06 * topF));
      cPos.setZ(i, z * (0.88 + 0.05 * topF));
      if (z > 0.03) cPos.setY(i, y - 0.022 * topF * (z / 0.11));
    }
    collarGeo.computeVertexNormals();
    const collarMesh = new THREE.Mesh(collarGeo, makeCoatMat(1.4, 0.6, false));
    collarMesh.position.set(0, 0.292, -0.004);
    g.add(collarMesh);
    // Razor-thin metallic-silver piping along the upturned collar rim
    g.add(ellipseArcTube(0.121, 0.106, 0.342, 0.64, TAU - 1.28, 0.0032, trimMetal, 28));

    // Flush-contoured sculpted lapel edges hugging the slim coat opening + small metallic buttons
    const lapelMat = makeCoatMat(1.2, 1.0, false);
    for (const s of [-1, 1]) {
      // Main open-front edge trim following the exact slim torso contour
      const edgeCurve = new THREE.CatmullRomCurve3([
        new V(s * 0.068, 0.256, 0.082),
        new V(s * 0.096, 0.145, 0.126),
        new V(s * 0.084, 0.015, 0.128),
        new V(s * 0.066, -0.145, 0.120),
        new V(s * 0.062, -0.268, 0.116),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 22, 0.0068, 6), lapelMat));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(edgeCurve, 22, 0.0024, 5), trimMetal));

      // Sleek flat folded lapel ridge flush on the upper chest (follows body curve, zero chest protrusion!)
      const foldCurve = new THREE.CatmullRomCurve3([
        new V(s * 0.072, 0.252, 0.084),
        new V(s * 0.132, 0.175, 0.116),
        new V(s * 0.124, 0.102, 0.125),
        new V(s * 0.086, 0.018, 0.128),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(foldCurve, 16, 0.0065, 6), lapelMat));

      // Subtle brushed-titanium double-breasted buttons sitting flush on the jacket front
      for (const [bx, by, bz] of [[0.108, 0.065, 0.129], [0.100, -0.055, 0.124], [0.092, -0.165, 0.118]] as const) {
        const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.005, 14), trimMetal);
        btn.rotation.x = Math.PI / 2;
        btn.position.set(s * bx, by, bz);
        g.add(btn);
      }

      // Slim flat shoulder epaulet strap with tiny brushed-silver stud
      const epCurve = new THREE.CatmullRomCurve3([
        new V(s * 0.102, 0.254, 0.008),
        new V(s * 0.154, 0.232, 0.004),
        new V(s * 0.208, 0.186, -0.002),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(epCurve, 12, 0.0085, 6), leatherMat));
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.0065, 10, 8), trimMetal);
      stud.position.set(s * 0.124, 0.246, 0.012); g.add(stud);
    }

    overlay(setId, rigChest, g);
  }

  // ---- WAIST: slim leather hunter belt + glowing mana buckle + 6 sleek vertical open-front trenchcoat tails!
  if (rigWaist) {
    const g = new THREE.Group();
    g.name = 'monarca-coat-tails';
    const R = 0.188;

    // Slim dark leather waist belt hugging the narrow waist cleanly
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.01, 0.048, 36, 1, true), leatherMat);
    belt.scale.z = 0.74; belt.position.y = 0.032; g.add(belt);
    for (const dy of [0.054, 0.010]) g.add(ellipseArcTube(R * 1.01, R * 0.74 * 1.01, dy, 0, TAU, 0.0030, trimMetal, 36));

    // Sleek metallic rectangular hunter belt buckle with electric-blue mana slit
    const buckle = new THREE.Group(); buckle.position.set(0, 0.032, R * 0.755);
    buckle.add(new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.042, 0.012), trimMetal));
    const core = new THREE.Mesh(new THREE.BoxGeometry(0.032, 0.012, 0.015), manaGlow);
    buckle.add(core);
    g.add(buckle);

    // 6 sleek straight-draping hinged trenchcoat tails (slim vertical fall, open front for pants/boots, center back vent!)
    const tailMat = makeCoatMat(0.95, 1.45, true);
    const tailSpec: [number, number, number, number][] = [
      // [midTh, angularSpan, length, flareRatio] — minimal flare so it hangs like a sharp tailored trenchcoat, NOT a bell skirt!
      [ 0.64, 0.68, 0.62, 1.15], // left-front coat flap
      [-0.64, 0.68, 0.62, 1.15], // right-front coat flap
      [ 1.42, 0.72, 0.66, 1.18], // left-side panel
      [-1.42, 0.72, 0.66, 1.18], // right-side panel
      [ 2.48, 1.02, 0.72, 1.24], // left-back long coat tail
      [-2.48, 1.02, 0.72, 1.24], // right-back long coat tail
    ];
    const panels: HeroHingedPanel[] = [];
    for (const [midTh, span, h, flare] of tailSpec) {
      const dirX = Math.sin(midTh), dirZ = Math.cos(midTh);
      const pivot = new THREE.Group();
      pivot.position.set(dirX * (R * 1.01), 0.018, dirZ * (R * 0.78));
      pivot.rotation.y = midTh;
      const restPitch = Math.cos(midTh) < -0.2 ? -0.07 : -0.04; // straight vertical drape!
      pivot.rotation.x = restPitch;

      const holder = new THREE.Group();
      holder.position.set(0, -h * 0.5, -R * 1.01);
      holder.add(buildTassetPanel(R * 1.01, R * flare, h, -span / 2, span, 0.018, tailMat));
      // Fine silver-blue hem trim along bottom of every coat tail
      holder.add(ellipseArcTube(R * flare + 0.002, R * flare + 0.002, -h * 0.5, -span / 2, span, 0.0032, trimMetal, 14));
      pivot.add(holder);
      g.add(pivot);
      panels.push({ pivot, dirX, dirZ, restPitch });
    }
    skirtPanels.set(setId, panels);
    overlay(setId, rigWaist, g);
  }

  // ---- WRIST CUFFS ONLY (the organically skinned mocap arms render the smooth tailored coat sleeves with zero elbow seams/pinching!)
  for (const side of ['Left', 'Right']) {
    const E = P(side + 'ForeArm'), H = P(side + 'Hand');
    const foreLen = E.distanceTo(H);
    if (foreLen > 0.08) {
      const fg = new THREE.Group();
      fg.name = `monarca-cuff-${side}`;
      const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.045, 0.042, 16, 1, true), leatherMat);
      fg.add(cuff);
      const cuffRim = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0030, 6, 20), trimMetal);
      cuffRim.rotation.x = Math.PI / 2; cuffRim.position.y = -0.021; fg.add(cuffRim);
      for (const dy of [-0.008, 0.009]) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(0.0045, 8, 6), trimMetal);
        b.position.set(0, dy, 0.047); fg.add(b);
      }
      fg.position.copy(E).lerp(H, 0.84);
      fg.quaternion.setFromUnitVectors(new V(0, 1, 0), E.clone().sub(H).normalize());
      hang(setId, side + 'ForeArm', fg);
    }
  }

  // ---- COMBAT BOOTS: sleek fitted dark leather hunter boots on LeftFoot & RightFoot
  for (const side of ['Left', 'Right']) {
    const Ft = P(side + 'Foot');
    const bg = new THREE.Group();
    bg.name = `monarca-boot-${side}`;
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.056, 0.051, 0.155, 16), leatherMat);
    shaft.position.set(0, 0.048, -0.005); bg.add(shaft);
    const vamp = new THREE.Mesh(new THREE.BoxGeometry(0.088, 0.064, 0.215), leatherMat);
    vamp.position.set(0, -0.036, 0.055); bg.add(vamp);
    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.043, 12, 10), leatherMat);
    toe.scale.set(1.02, 0.70, 1.12); toe.position.set(0, -0.042, 0.148); bg.add(toe);
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.094, 0.020, 0.232), new THREE.MeshStandardMaterial({ color: 0x151822, roughness: 0.7, metalness: 0.3 }));
    sole.position.set(0, -0.072, 0.058); bg.add(sole);
    for (const sy of [0.022, 0.082]) {
      const strap = new THREE.Mesh(new THREE.TorusGeometry(0.056, 0.0055, 6, 20), leatherMat);
      strap.rotation.x = Math.PI / 2; strap.position.set(0, sy, -0.005); bg.add(strap);
      const clasp = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.010), trimMetal);
      clasp.position.set(side === 'Left' ? 0.056 : -0.056, sy, 0.010); bg.add(clasp);
    }
    bg.position.copy(Ft);
    hang(setId, side + 'Foot', bg);
  }
}

// ============================================================ 4. VAGABUNDO OUTFIT (MUSASHI / VAGABOND)
export function buildVagabundoOutfit(setId: string, ctx: ArmorBuildCtx) {
  const { P, rigChest, rigWaist, overlay, hang } = ctx;
  const kimPbr = vagabondKimonoPBR();
  const hakPbr = vagabondHakamaPBR();
  const silkPbr = braidedSilkPBR();

  const makeKimonoMat = (rx: number, ry: number) => {
    const map = kimPbr.map.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
    const norm = kimPbr.normal.clone(); norm.repeat.set(rx, ry); norm.needsUpdate = true;
    const rough = kimPbr.rough.clone(); rough.repeat.set(rx, ry); rough.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({
      map, normalMap: norm, normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: rough, roughness: 0.90, metalness: 0.0,
      sheen: 0.22, sheenColor: new THREE.Color(0x4b6a78), sheenRoughness: 0.85,
      emissive: 0x0b1218, emissiveIntensity: 0.08, side: THREE.DoubleSide
    });
  };

  const makeHakamaMat = (rx: number, ry: number) => {
    const map = hakPbr.map.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
    const norm = hakPbr.normal.clone(); norm.repeat.set(rx, ry); norm.needsUpdate = true;
    return new THREE.MeshStandardMaterial({
      map, normalMap: norm, normalScale: new THREE.Vector2(1.25, 1.25),
      roughness: 0.94, metalness: 0.0,
      emissive: 0x08090f, emissiveIntensity: 0.07, side: THREE.DoubleSide
    });
  };

  const obiMat = new THREE.MeshStandardMaterial({
    color: 0x1d2432, normalMap: silkPbr.normal, normalScale: new THREE.Vector2(0.8, 0.8),
    roughness: 0.88, emissive: 0x080c14, emissiveIntensity: 0.06, side: THREE.DoubleSide
  });
  const indigoKnotMat = new THREE.MeshStandardMaterial({
    color: 0x263b5e, normalMap: silkPbr.normal, normalScale: new THREE.Vector2(0.9, 0.9),
    roughness: 0.86, side: THREE.DoubleSide
  });
  const maroonCordMat = new THREE.MeshStandardMaterial({
    color: 0x5c2329, normalMap: silkPbr.normal, normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.82, emissive: 0x1c080a, emissiveIntensity: 0.08, side: THREE.DoubleSide
  });
  const navyCordMat = new THREE.MeshStandardMaterial({
    color: 0x23385c, normalMap: silkPbr.normal, normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.82, side: THREE.DoubleSide
  });

  // ---- TORSO: weathered dark slate-indigo kimono with deep open V-neck exposing the bare chest!
  if (rigChest) {
    const g = new THREE.Group();
    g.name = 'vagabundo-kimono-torso';
    const kimMat = makeKimonoMat(2.0, 1.2);

    // Open-chest draped kimono torso (deep V-opening from collar down to mid-sternum exposing bare tanned chest!)
    g.add(new THREE.Mesh(
      buildOpenFrontTorso({ chestW: 1.0, waistW: 0.98, depth: 0.98, gapTop: 0.56, gapBot: 0.06, vNeckBottom: 0.20 }, 44),
      kimMat
    ));

    // Thick folded weathered kimono lapels (eri) crossing left-over-right like the Vagabond photo
    const lapelMat = makeKimonoMat(0.8, 1.4);
    const tube = (pts: [number, number, number][], r: number, mat: THREE.Material) => {
      const curve = new THREE.CatmullRomCurve3(pts.map(([x, y, z]) => new V(x, y, z)));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, r, 7), mat));
    };
    // Right lapel (underneath, curving down from right side of neck across lower chest)
    tube([
      [-0.082, 0.258, 0.025], [-0.095, 0.195, 0.118], [-0.062, 0.095, 0.168],
      [0.012, -0.025, 0.168], [0.095, -0.155, 0.148]
    ], 0.020, lapelMat);
    // Left lapel (overlapping on top, framing the bare chest V-gap cleanly)
    tube([
      [0.084, 0.258, 0.025], [0.096, 0.190, 0.122], [0.064, 0.082, 0.172],
      [-0.022, -0.055, 0.168], [-0.118, -0.195, 0.144]
    ], 0.022, lapelMat);
    // Back neck collar band
    g.add(ellipseArcTube(0.118, 0.104, 0.260, Math.PI * 0.55, Math.PI * 0.90, 0.016, lapelMat, 20));

    // Broad loose kimono shoulder drapes connecting naturally into the wide sleeves
    for (const s of [-1, 1]) {
      const drape = new THREE.Mesh(
        new THREE.CylinderGeometry(0.115, 0.135, 0.14, 16, 1, true, -0.95, 1.9),
        kimMat
      );
      drape.position.set(s * 0.185, 0.172, 0.0);
      drape.rotation.z = s * 0.42;
      g.add(drape);
    }

    overlay(setId, rigChest, g);
  }

  // ---- WAIST: layered charcoal-indigo obi, loose front knot, hanging maroon & indigo sageo cords,
  //      authentic DAISHŌ (Katana + Wakizashi tucked diagonally at the left hip!) & upper hakama pleats!
  if (rigWaist) {
    const g = new THREE.Group();
    g.name = 'vagabundo-obi-daisho';
    const R = 0.214;

    // Wrapped cloth obi sash with organic folded cloth rings
    const obi = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.04, 0.105, 36, 1, true), obiMat);
    obi.scale.z = 0.84; obi.position.y = 0.025; g.add(obi);
    for (const [dy, rad] of [[0.062, 0.014], [0.022, 0.013], [-0.018, 0.014]] as const) {
      g.add(ellipseArcTube(R * 1.02, R * 0.85, dy, 0, TAU, rad, obiMat, 36));
    }

    // Loose warrior's obi knot (front-left) with hanging dark-blue cloth tails
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.026, 0.011, 28, 6), indigoKnotMat);
    knot.position.set(0.02, 0.008, R * 0.86); knot.scale.set(1.2, 0.85, 0.75); g.add(knot);
    for (const [dx, len, sway] of [[-0.022, 0.24, -0.08], [0.026, 0.29, 0.06]] as const) {
      const tailGeo = new THREE.PlaneGeometry(0.044, len, 2, 6);
      tailGeo.translate(0, -len / 2, 0);
      const tPos = tailGeo.attributes.position;
      for (let i = 0; i < tPos.count; i++) {
        const yy = -tPos.getY(i) / len;
        tPos.setZ(i, Math.sin(yy * 2.6) * 0.014 + 0.012 * yy);
        tPos.setX(i, tPos.getX(i) * (1 + 0.28 * yy) + sway * yy);
      }
      tailGeo.computeVertexNormals();
      const tail = new THREE.Mesh(tailGeo, indigoKnotMat);
      tail.position.set(0.02 + dx, -0.008, R * 0.88);
      g.add(tail);
    }

    // Upper hakama koshi-ita (back board) & sculpted waist pleats seamlessly meeting the simulated hakama
    const koshi = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.10, 0.022), makeHakamaMat(0.6, 0.5));
    koshi.position.set(0, 0.062, -R * 0.84); koshi.rotation.x = 0.08; g.add(koshi);
    const upperSkirt = new THREE.Mesh(new THREE.CylinderGeometry(R * 1.02, R * 1.18, 0.14, 32, 1, true), makeHakamaMat(2.2, 0.45));
    upperSkirt.scale.z = 0.86; upperSkirt.position.y = -0.085; g.add(upperSkirt);

    // ---- DAISHŌ: Katana & Wakizashi tucked diagonally at the left hip (iconic Vagabond photo centerpiece!)
    const sayaMat = new THREE.MeshPhysicalMaterial({
      color: 0x121218, roughness: 0.26, metalness: 0.14, clearcoat: 0.92, clearcoatRoughness: 0.12
    });
    const ironTsubaMat = new THREE.MeshStandardMaterial({ color: 0x2d2e35, metalness: 0.84, roughness: 0.42 });
    const silverCapMat = new THREE.MeshStandardMaterial({ color: 0xd8dce4, metalness: 0.90, roughness: 0.24 });
    const itoMat = new THREE.MeshStandardMaterial({ map: tsukaItoTex(), roughness: 0.82 });

    const buildTuckedSword = (sayaLen: number, hiltLen: number, curveAmt: number) => {
      const sg = new THREE.Group();
      // Gently curved lacquered scabbard (saya) extending along -z
      const sPts: THREE.Vector3[] = [];
      for (let i = 0; i <= 10; i++) {
        const u = i / 10;
        sPts.push(new V(0, curveAmt * u * u, -u * sayaLen));
      }
      const sayaMesh = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(sPts), 16, 0.0175, 10), sayaMat);
      sayaMesh.scale.x = 0.68;
      sg.add(sayaMesh);
      // Kojiri (scabbard end cap) & koiguchi (mouth collar)
      const mouth = new THREE.Mesh(new THREE.CylinderGeometry(0.0185, 0.0185, 0.022, 12), ironTsubaMat);
      mouth.rotation.x = Math.PI / 2; mouth.scale.x = 0.72; mouth.position.z = 0.005; sg.add(mouth);
      // Circular iron tsuba guard with subtle inner cutout ring
      const tsuba = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.007, 22), ironTsubaMat);
      tsuba.rotation.x = Math.PI / 2; tsuba.scale.x = 0.88; tsuba.position.z = 0.022; sg.add(tsuba);
      const tsubaRim = new THREE.Mesh(new THREE.TorusGeometry(0.036, 0.003, 6, 22), silverCapMat);
      tsubaRim.scale.x = 0.88; tsubaRim.position.z = 0.022; sg.add(tsubaRim);
      // Diamond-wrapped tsuka-ito hilt extending along +z
      const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.0155, 0.0175, hiltLen, 12), itoMat);
      hilt.rotation.x = Math.PI / 2; hilt.scale.x = 0.76; hilt.position.z = 0.028 + hiltLen * 0.5; sg.add(hilt);
      // Bright metallic kashira (pommel cap — catches the light just like the bright white-silver hilt ends in the photo!)
      const kashira = new THREE.Mesh(new THREE.SphereGeometry(0.017, 10, 8), silverCapMat);
      kashira.scale.set(0.76, 1.0, 0.85); kashira.position.z = 0.030 + hiltLen; sg.add(kashira);
      return sg;
    };

    // Upper Katana: steeply angled up across the chest-left, long scabbard protruding back-right behind hip!
    const katanaHip = buildTuckedSword(0.78, 0.27, 0.026);
    katanaHip.position.set(0.175, 0.038, 0.125);
    katanaHip.rotation.set(-0.62, -0.56, 0.14);
    g.add(katanaHip);

    // Lower Wakizashi: tucked slightly lower & flatter right underneath the katana hilt (exact Vagabond double-sword look!)
    const wakiHip = buildTuckedSword(0.56, 0.21, 0.018);
    wakiHip.position.set(0.165, -0.006, 0.155);
    wakiHip.rotation.set(-0.24, -0.78, 0.08);
    g.add(wakiHip);

    // Braided dark crimson-maroon & deep-indigo hanging sageo cords dangling gracefully from the swords down the hip
    const cordStrands: [THREE.Vector3[], THREE.Material, number][] = [
      [[new V(0.14, 0.04, 0.165), new V(0.12, -0.08, 0.188), new V(0.105, -0.22, 0.185), new V(0.115, -0.34, 0.172)], maroonCordMat, 0.0075],
      [[new V(0.155, 0.03, 0.158), new V(0.148, -0.10, 0.180), new V(0.142, -0.25, 0.176), new V(0.156, -0.36, 0.162)], maroonCordMat, 0.0068],
      [[new V(0.125, 0.02, 0.172), new V(0.095, -0.07, 0.194), new V(0.092, -0.19, 0.192)], navyCordMat, 0.0065],
      [[new V(0.14, 0.04, 0.165), new V(0.165, -0.02, 0.178), new V(0.145, -0.11, 0.184), new V(0.12, -0.04, 0.182)], maroonCordMat, 0.006],
    ];
    for (const [pts, mat, rad] of cordStrands) {
      g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 18, rad, 6), mat));
    }

    overlay(setId, rigWaist, g);
  }

  // ---- WIDE DRAPED KIMONO UPPER SLEEVES (matching the loose flowing sleeves of the photo without elbow pinching)
  const sleeveMat = makeKimonoMat(1.1, 1.0);
  for (const side of ['Left', 'Right']) {
    const S = P(side + 'Arm'), E = P(side + 'ForeArm');
    const len = S.distanceTo(E);
    if (len > 0.08) {
      const sg = new THREE.Group();
      sg.name = `vagabundo-sleeve-${side}`;
      // Generously wide, loosely draped kimono upper sleeve ending cleanly just above the elbow bend
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.132, len * 0.84, 20, 1, true), sleeveMat);
      body.scale.z = 1.12;
      sg.add(body);
      sg.position.copy(S).lerp(E, 0.39);
      sg.quaternion.setFromUnitVectors(new V(0, 1, 0), S.clone().sub(E).normalize());
      hang(setId, side + 'Arm', sg);
    }
  }

  // ---- TRADITIONAL WEATHERED WARAJI SANDALS & OLIVE-GREY TABI (exact footwear from the photo!)
  const tabiMat = new THREE.MeshStandardMaterial({ color: 0x5c665d, roughness: 0.92 });
  const strawMat = new THREE.MeshStandardMaterial({ color: 0x9b8656, roughness: 0.96 });
  for (const side of ['Left', 'Right']) {
    const Ft = P(side + 'Foot');
    const fg = new THREE.Group();
    fg.name = `vagabundo-sandal-${side}`;
    // Olive-grey weathered cloth tabi foot sock
    const sock = new THREE.Mesh(new THREE.BoxGeometry(0.090, 0.058, 0.215), tabiMat);
    sock.position.set(0, -0.036, 0.056); fg.add(sock);
    const ankle = new THREE.Mesh(new THREE.CylinderGeometry(0.054, 0.056, 0.11, 12), tabiMat);
    ankle.position.set(0, 0.024, -0.002); fg.add(ankle);
    // Woven straw waraji sole
    const sole = new THREE.Mesh(new THREE.BoxGeometry(0.106, 0.020, 0.248), strawMat);
    sole.position.set(0, -0.072, 0.062); fg.add(sole);
    // Braided V-shaped straw hanao toe-straps (seen clearly on the front foot in the photo!)
    for (const s of [-1, 1]) {
      const strap = new THREE.CatmullRomCurve3([
        new V(0, -0.055, 0.158),
        new V(s * 0.034, -0.006, 0.105),
        new V(s * 0.050, -0.060, 0.035),
      ]);
      fg.add(new THREE.Mesh(new THREE.TubeGeometry(strap, 10, 0.0075, 5), strawMat));
    }
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.058, 0.0065, 5, 16), strawMat);
    tie.rotation.x = Math.PI / 2; tie.position.set(0, 0.004, 0.0); fg.add(tie);
    fg.position.copy(Ft);
    hang(setId, side + 'Foot', fg);
  }
}

// ============================================================ 5. SIGNATURE ATMOSPHERIC AURAS
const fxBasic = (color: number, opacity: number, blending: THREE.Blending = THREE.AdditiveBlending) =>
  tagMat(new THREE.MeshBasicMaterial({ color, transparent: true, opacity, depthWrite: false, blending, side: THREE.DoubleSide }), CLS.light);

/**
 * Shadow Monarch Aura (Solo Leveling):
 * - Breathing dark-indigo & electric-cyan geometric mana ring on the ground
 * - 6 swirling dark-violet / electric-blue shadow-mist ribbons curling upward around the coat hem
 * - 14 rising tiny glowing shadow embers
 */
export function buildShadowMonarchAura(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'shadow-monarch';

  // Faint abyssal ground shadow ring + thin crisp cyan inner circuit ring
  const innerRing = new THREE.Mesh(new THREE.RingGeometry(0.60, 0.635, 64), fxBasic(0x52c8ff, 0.58));
  innerRing.rotation.x = -Math.PI / 2; innerRing.position.y = 0.042; innerRing.name = 'smInner'; g.add(innerRing);

  const outerRing = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.86, 64), fxBasic(0x5a2eff, 0.24));
  outerRing.rotation.x = -Math.PI / 2; outerRing.position.y = 0.038; outerRing.name = 'smOuter'; g.add(outerRing);

  // Subtle low-hanging cobalt & deep-violet shadow wisps swirling cleanly near his coat hem (never blocking face!)
  const wisps = new THREE.Group(); wisps.name = 'smWisps'; g.add(wisps);
  const wispMatBlue = fxBasic(0x2884ff, 0.24);
  const wispMatViolet = fxBasic(0x5a24e8, 0.28);
  for (let i = 0; i < 5; i++) {
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 12; k++) {
      const u = k / 12;
      const a = u * 1.45;
      pts.push(new V(Math.cos(a) * (0.46 + u * 0.16), u * 0.68, Math.sin(a) * (0.46 + u * 0.16)));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, 16, 0.014, 5, false);
    const pos = geo.attributes.position, c = new V(), v = new V();
    for (let s = 0; s <= 16; s++) {
      const u = s / 16;
      curve.getPointAt(u, c);
      const tap = Math.sin(u * Math.PI) * (1 - u * 0.35);
      for (let j = 0; j < 6; j++) {
        const idx = s * 6 + j;
        v.fromBufferAttribute(pos, idx).sub(c).multiplyScalar(tap).add(c);
        pos.setXYZ(idx, v.x, v.y, v.z);
      }
    }
    geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, i % 2 === 0 ? wispMatBlue : wispMatViolet);
    m.rotation.y = (i / 5) * TAU;
    wisps.add(m);
  }

  // Fine, tiny abyssal shadow micro-sparks staying cleanly near the ground & coat hem (zero big white dots!)
  const motes = new THREE.Group(); motes.name = 'smMotes'; g.add(motes);
  for (let i = 0; i < 8; i++) {
    const mat = tagMat(new THREE.SpriteMaterial({
      map: softGlowTex, color: i % 2 === 0 ? 0x3ba4ff : 0x7238ff, transparent: true, opacity: 0.48,
      depthWrite: false, blending: THREE.AdditiveBlending
    }), CLS.light);
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(0.036 + (i % 3) * 0.012);
    motes.add(sp);
  }

  g.visible = false;
  return g;
}

export function updateShadowMonarchAura(g: THREE.Group, t: number) {
  const inner = g.getObjectByName('smInner') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
  const outer = g.getObjectByName('smOuter') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
  if (inner) {
    inner.rotation.z = t * 0.55;
    inner.scale.setScalar(1 + Math.sin(t * 2.4) * 0.035);
    inner.material.opacity = 0.42 + Math.sin(t * 3.1) * 0.14;
  }
  if (outer) {
    outer.rotation.z = -t * 0.35;
    outer.scale.setScalar(1 + Math.sin(t * 2.4 - 0.8) * 0.055);
    outer.material.opacity = 0.16 + Math.sin(t * 2.4) * 0.06;
  }
  const wisps = g.getObjectByName('smWisps');
  if (wisps) {
    wisps.children.forEach((w, i) => {
      w.rotation.y = (i / 5) * TAU + t * (0.65 + (i % 2) * 0.25);
      w.position.y = 0.05 + ((t * 0.36 + i * 0.27) % 1) * 0.24;
      const fade = Math.sin(((t * 0.36 + i * 0.27) % 1) * Math.PI);
      w.scale.set(0.85 + fade * 0.20, 0.75 + fade * 0.35, 0.85 + fade * 0.20);
    });
  }
  const motes = g.getObjectByName('smMotes');
  if (motes) {
    motes.children.forEach((m, i) => {
      const life = (t * (0.38 + (i % 4) * 0.08) + i * 0.31) % 1;
      const a = i * 2.399 + t * 0.55;
      const r = 0.48 + (i % 4) * 0.08;
      m.position.set(Math.cos(a) * r, 0.06 + life * 0.78, Math.sin(a) * r);
      const sp = m as THREE.Sprite;
      sp.material.opacity = Math.sin(life * Math.PI) * 0.55;
    });
  }
}

/**
 * Vagabond Atmospheric Ink-Wind Aura:
 * Tasteful, subtle drifting sumi-e dust/ink motes swirling lazily in the wind around Musashi.
 */
export function buildVagabondAura(): THREE.Group {
  const g = new THREE.Group();
  g.name = 'vagabond-ink';
  const motes = new THREE.Group(); motes.name = 'vgMotes'; g.add(motes);
  for (let i = 0; i < 10; i++) {
    const mat = tagMat(new THREE.SpriteMaterial({
      map: softGlowTex, color: i % 3 === 0 ? 0xd8e0e8 : 0x5c7c8c, transparent: true, opacity: 0.35,
      depthWrite: false, blending: THREE.AdditiveBlending
    }), CLS.light);
    const sp = new THREE.Sprite(mat);
    sp.scale.setScalar(0.065 + (i % 3) * 0.02);
    motes.add(sp);
  }
  g.visible = false;
  return g;
}

export function updateVagabondAura(g: THREE.Group, t: number) {
  const motes = g.getObjectByName('vgMotes');
  if (!motes) return;
  motes.children.forEach((m, i) => {
    const life = (t * (0.28 + (i % 3) * 0.06) + i * 0.41) % 1;
    const a = i * 2.1 + t * 0.42;
    const r = 0.45 + (i % 4) * 0.12 + Math.sin(t + i) * 0.08;
    m.position.set(Math.cos(a) * r, 0.12 + life * 1.55, Math.sin(a) * r);
    const sp = m as THREE.Sprite;
    sp.material.opacity = Math.sin(life * Math.PI) * 0.34;
  });
}
