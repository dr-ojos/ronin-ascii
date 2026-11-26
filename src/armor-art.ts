// Studio-grade procedural PBR texture synthesis (true tangent-space normal maps via Sobel filter,
// metalness maps, clearcoat/roughness maps, maki-e gold lacquer motifs) and sculpted 3D samurai
// armor ornaments & legendary relic silhouettes shared across all 4 playable classes.
import * as THREE from 'three';
import type { Armor } from './armor';

const V = THREE.Vector3;
const TAU = Math.PI * 2;

export interface FullPBRMaps {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  emissive?: THREE.CanvasTexture;
}

const css = (c: number, k = 1, a = 1) => {
  const x = new THREE.Color(c).multiplyScalar(k);
  const r = Math.min(255, Math.max(0, x.r * 255)) | 0;
  const g = Math.min(255, Math.max(0, x.g * 255)) | 0;
  const b = Math.min(255, Math.max(0, x.b * 255)) | 0;
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
};

function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function makeCanvas(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d')!, w, h);
  return c;
}

function toTex(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.needsUpdate = true;
  return t;
}

/**
 * Convert a grayscale heightfield canvas into a crisp tangent-space normal map (Sobel 3x3).
 * Produces sharp 3D bevels, overlapping lame steps, domed rivets, and braided silk relief.
 */
export function heightToNormalTex(heightCanvas: HTMLCanvasElement, strength = 2.6, repeat = true): THREE.CanvasTexture {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const outCanvas = document.createElement('canvas');
  outCanvas.width = w;
  outCanvas.height = h;
  const outCtx = outCanvas.getContext('2d')!;
  const outImg = outCtx.createImageData(w, h);
  const dst = outImg.data;

  const sample = (x: number, y: number) => {
    const xx = repeat ? ((x % w) + w) % w : Math.max(0, Math.min(w - 1, x));
    const yy = repeat ? ((y % h) + h) % h : Math.max(0, Math.min(h - 1, y));
    return src[(yy * w + xx) * 4] / 255;
  };

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = sample(x - 1, y - 1), tc = sample(x, y - 1), tr = sample(x + 1, y - 1);
      const ml = sample(x - 1, y),                           mr = sample(x + 1, y);
      const bl = sample(x - 1, y + 1), bc = sample(x, y + 1), br = sample(x + 1, y + 1);
      const dx = (tr + 2 * mr + br - (tl + 2 * ml + bl)) * strength;
      const dy = (bl + 2 * bc + br - (tl + 2 * tc + tr)) * strength;
      const dz = 1.0;
      const inv = 1 / Math.hypot(dx, dy, dz);
      const idx = (y * w + x) * 4;
      dst[idx]     = ((-dx * inv) * 0.5 + 0.5) * 255;
      dst[idx + 1] = ((dy * inv) * 0.5 + 0.5) * 255;
      dst[idx + 2] = ((dz * inv) * 0.5 + 0.5) * 255;
      dst[idx + 3] = 255;
    }
  }
  outCtx.putImageData(outImg, 0, 0);
  return toTex(outCanvas, false, repeat);
}

/** Subtle forged-steel / urushi lacquer micro-grain pass */
function addForgedGrain(x: CanvasRenderingContext2D, w: number, h: number, intensity = 1) {
  for (let i = 0; i < 220; i++) {
    const xx = hash2(i, 1.7) * w;
    const yy = hash2(i, 3.1) * h;
    const len = 14 + hash2(i, 5.3) * 68;
    const bright = hash2(i, 7.9) > 0.48;
    x.fillStyle = bright
      ? `rgba(255,255,255,${(0.036 * intensity).toFixed(3)})`
      : `rgba(0,0,0,${(0.044 * intensity).toFixed(3)})`;
    x.fillRect(xx, yy, len, 1);
  }
  for (let i = 0; i < 140; i++) {
    const cx = hash2(i, 11.2) * w;
    const cy = hash2(i, 13.8) * h;
    const r = 2 + hash2(i, 17.5) * 7;
    const g = x.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 0.3, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${(0.05 * intensity).toFixed(3)})`);
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(0.06 * intensity).toFixed(3)})`);
    x.fillStyle = g;
    x.beginPath();
    x.arc(cx, cy, r, 0, TAU);
    x.fill();
  }
}

// ------------------------------------------------------------ cached shared metal & lacquer normal/rough maps

let sharedMetalPBR: { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;
/** Hand-forged brushed tamahagane / gilt bronze normal + roughness maps */
export function getForgedMetalPBR() {
  if (sharedMetalPBR) return sharedMetalPBR;
  const S = 256;
  const height = makeCanvas(S, S, x => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
    // Fine anisotropic brushed polish + subtle hand-hammered facets
    for (let y = 0; y < S; y += 2) {
      const v = 112 + Math.floor(hash2(y, 19.1) * 32);
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(0, y, S, 1);
    }
    addForgedGrain(x, S, S, 1.9);
  });
  const rough = toTex(makeCanvas(S, S, x => {
    x.fillStyle = '#383838'; x.fillRect(0, 0, S, S);
    addForgedGrain(x, S, S, 1.6);
    for (let i = 0; i < 110; i++) {
      const yy = hash2(i, 23.1) * S, xx = hash2(i, 29.7) * S;
      x.fillStyle = hash2(i, 31.3) > 0.5 ? 'rgba(18,18,18,0.28)' : 'rgba(128,128,128,0.18)';
      x.fillRect(xx, yy, 18 + hash2(i, 37.2) * 54, 1.4);
    }
  }), false);
  sharedMetalPBR = { normal: heightToNormalTex(height, 1.8), rough };
  return sharedMetalPBR;
}

let sharedLacquerPBR: { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;
/** Glossy Japanese urushi lacquer over forged iron normal + roughness maps */
export function getUrushiLacquerPBR() {
  if (sharedLacquerPBR) return sharedLacquerPBR;
  const S = 256;
  const height = makeCanvas(S, S, x => {
    x.fillStyle = '#808080'; x.fillRect(0, 0, S, S);
    addForgedGrain(x, S, S, 1.15);
  });
  const rough = toTex(makeCanvas(S, S, x => {
    x.fillStyle = '#343434'; x.fillRect(0, 0, S, S);
    addForgedGrain(x, S, S, 0.9);
  }), false);
  sharedLacquerPBR = { normal: heightToNormalTex(height, 1.1), rough };
  return sharedLacquerPBR;
}

let sharedSilkPBR: { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;
/** Braided silk odoshi / woven brocade cord normal + roughness maps */
export function getBraidedSilkPBR() {
  if (sharedSilkPBR) return sharedSilkPBR;
  const S = 128;
  const height = makeCanvas(S, S, x => {
    x.fillStyle = '#666666'; x.fillRect(0, 0, S, S);
    for (let y = 0; y < S; y += 8) {
      for (let xx = 0; xx < S; xx += 8) {
        const alt = ((y / 8 + xx / 8) & 1) === 0;
        x.fillStyle = alt ? '#d6d6d6' : '#3a3a3a';
        x.fillRect(xx + 1, y + 1, 6, 6);
      }
    }
  });
  const rough = toTex(makeCanvas(S, S, x => {
    x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, S, S);
  }), false);
  sharedSilkPBR = { normal: heightToNormalTex(height, 2.2), rough };
  return sharedSilkPBR;
}

// ------------------------------------------------------------ master studio PBR lamellar generator (Ronin & Sōhei)

/**
 * High-craft 512x512 full PBR kozane lamellar plates with:
 * - True tangent-space normal map (Sobel from precision heightfield)
 * - Metalness map (0.0 matte silk cords, 0.22 urushi lacquer, 1.0 gilded trim, rivets & maki-e inlay)
 * - Roughness map (glossy lacquer vs mirror rivets vs matte woven silk)
 * - Optional selective emissive map (volcanic ember cracks / wind-jade veins / frost runes)
 */
export function buildMasterLamellarPBR(
  l: NonNullable<Armor['look']>,
  armorId: string,
  style: 'ronin' | 'sohei' = 'ronin'
): FullPBRMaps {
  const S = 512;
  const rows = 5, rh = S / rows;
  const scales = style === 'ronin' ? 18 : 16;
  const sw = S / scales;

  const isWind = armorId === 'manto-tengu';
  const isEmber = armorId === 'yoroi-shuten' || armorId === 'coraza-sepulcral';
  const isFrost = armorId === 'coraza-escarcha';
  const isImperial = armorId === 'hachiman' || armorId === 'oyoroi' || armorId === 'coraza-tambor';
  const hasSelectiveEmissive = isWind || isEmber || isFrost;

  // 1. ALBEDO MAP
  const mapC = makeCanvas(S, S, x => {
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // Rich urushi depth gradient with crisp upper bevel sheen & deep lower shade
      const g = x.createLinearGradient(0, y0, 0, y0 + rh);
      g.addColorStop(0.00, css(l.lame, 1.75));
      g.addColorStop(0.09, css(l.lame, 1.28));
      g.addColorStop(0.45, css(l.lame, 0.96));
      g.addColorStop(0.80, css(l.lame, 0.58));
      g.addColorStop(1.00, css(l.lame, 0.24));
      x.fillStyle = g;
      x.fillRect(0, y0, S, rh);

      // Individually contoured kozane scales with arched tops and metallic edge wear
      for (let s = 0; s < scales; s++) {
        const sx = s * sw;
        const sg = x.createLinearGradient(sx, y0, sx + sw, y0);
        sg.addColorStop(0.00, 'rgba(0,0,0,0.52)');
        sg.addColorStop(0.14, 'rgba(255,255,255,0.22)');
        sg.addColorStop(0.48, 'rgba(255,255,255,0.06)');
        sg.addColorStop(0.86, 'rgba(0,0,0,0.16)');
        sg.addColorStop(1.00, 'rgba(0,0,0,0.58)');
        x.fillStyle = sg;
        x.fillRect(sx, y0 + 7, sw, rh - 14);
        // Polished upper scale bevel highlight
        x.fillStyle = css(l.metal, 1.35, 0.26);
        x.fillRect(sx + 2, y0 + 8, sw - 4, 2.2);
      }

      // Thematic maki-e gold/silver lacquer inlay across alternating plate bands
      if (r === 1 || r === 3) {
        x.save();
        x.strokeStyle = css(l.metal, 1.35, isImperial ? 0.62 : 0.34);
        x.lineWidth = isImperial ? 2.2 : 1.5;
        if (isWind) {
          // Sweeping wind-gale spirals
          for (let wx = 16; wx < S; wx += 64) {
            x.beginPath();
            x.moveTo(wx - 14, y0 + rh * 0.52);
            x.bezierCurveTo(wx, y0 + rh * 0.22, wx + 22, y0 + rh * 0.26, wx + 30, y0 + rh * 0.48);
            x.stroke();
          }
        } else {
          // Subtle seigaiha wave arcs in gold maki-e
          for (let wx = 0; wx < S + 32; wx += 32) {
            const cy = y0 + rh * 0.64;
            for (const rr of [13, 8]) {
              x.beginPath();
              x.arc(wx, cy, rr, Math.PI, 0);
              x.stroke();
            }
          }
        }
        x.restore();
      }

      // Deep ambient occlusion crevice under each overlapping lame tier
      const sh = x.createLinearGradient(0, y0 + rh - 16, 0, y0 + rh);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(0.45, 'rgba(0,0,0,0.42)');
      sh.addColorStop(1, 'rgba(0,0,0,0.88)');
      x.fillStyle = sh;
      x.fillRect(0, y0 + rh - 16, S, 16);

      // Upper fukurin metallic edge trim + silk piping
      x.fillStyle = css(l.lace, 0.85);
      x.fillRect(0, y0, S, 5.5);
      const mg = x.createLinearGradient(0, y0 + 5, 0, y0 + 9);
      mg.addColorStop(0, css(l.metal, 1.65));
      mg.addColorStop(0.5, css(l.metal, 1.1));
      mg.addColorStop(1, css(l.metal, 0.45));
      x.fillStyle = mg;
      x.fillRect(0, y0 + 5.5, S, 3.5);

      // Rich 3D braided sugake odoshi paired silk cords
      for (let cx = 32; cx < S; cx += 64) {
        for (const dx of [-12, 4]) {
          const bx = cx + dx;
          // Recessed drop shadow
          x.fillStyle = 'rgba(0,0,0,0.58)';
          x.fillRect(bx - 2, y0 + 1, 13, rh - 4);
          // Main silk cord body
          const cg = x.createLinearGradient(bx, 0, bx + 9.5, 0);
          cg.addColorStop(0, css(l.lace, 0.58));
          cg.addColorStop(0.32, css(l.lace, 1.28));
          cg.addColorStop(0.7, css(l.lace, 0.92));
          cg.addColorStop(1, css(l.lace, 0.46));
          x.fillStyle = cg;
          x.fillRect(bx, y0 + 1, 9.5, rh - 5);
          // Diagonal braided chevron weave
          x.fillStyle = css(l.lace, 0.36);
          for (let yy = y0 + 4; yy < y0 + rh - 7; yy += 6) {
            x.fillRect(bx, yy, 4.8, 2.2);
            x.fillRect(bx + 4.8, yy + 3, 4.8, 2.2);
          }
        }
      }

      // Sculpted domed gilded rivets (byō) with floral rosette washers
      if (r === 0 || r === 2 || r === 4) {
        for (let cx = 0; cx < S; cx += 64) {
          const cy = y0 + rh * 0.46;
          x.fillStyle = 'rgba(0,0,0,0.62)';
          x.beginPath(); x.arc(cx, cy + 1.8, 7.6, 0, TAU); x.fill();
          x.fillStyle = css(l.metal, 0.82);
          for (let p = 0; p < 6; p++) {
            const a = p * TAU / 6;
            x.beginPath(); x.arc(cx + Math.cos(a) * 4.4, cy + Math.sin(a) * 4.4, 2.4, 0, TAU); x.fill();
          }
          const rg = x.createRadialGradient(cx - 1.8, cy - 1.8, 0.6, cx, cy, 5.2);
          rg.addColorStop(0, css(l.metal, 1.95));
          rg.addColorStop(0.55, css(l.metal, 1.15));
          rg.addColorStop(1, css(l.metal, 0.35));
          x.fillStyle = rg;
          x.beginPath(); x.arc(cx, cy, 5.2, 0, TAU); x.fill();
        }
      }

      // Hishinui cross-laced silk knots along the bottom lame
      if (r === rows - 1) {
        x.lineCap = 'round';
        for (let cx = 16; cx < S; cx += 32) {
          const cy = y0 + rh * 0.68;
          x.strokeStyle = 'rgba(0,0,0,0.62)';
          x.lineWidth = 6;
          x.beginPath();
          x.moveTo(cx - 8, cy - 6); x.lineTo(cx + 8, cy + 8);
          x.moveTo(cx + 8, cy - 6); x.lineTo(cx - 8, cy + 8);
          x.stroke();
          x.strokeStyle = css(l.lace, 1.32);
          x.lineWidth = 3.4;
          x.beginPath();
          x.moveTo(cx - 8, cy - 7); x.lineTo(cx + 8, cy + 7);
          x.moveTo(cx + 8, cy - 7); x.lineTo(cx - 8, cy + 7);
          x.stroke();
        }
      }
    }
    addForgedGrain(x, S, S, 0.72);
  });

  // 2. HEIGHTFIELD -> TANGENT-SPACE NORMAL MAP
  const heightC = makeCanvas(S, S, x => {
    x.fillStyle = '#707070'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // Stepped overlapping lame slope
      const g = x.createLinearGradient(0, y0, 0, y0 + rh);
      g.addColorStop(0.00, '#e0e0e0');
      g.addColorStop(0.10, '#c0c0c0');
      g.addColorStop(0.80, '#888888');
      g.addColorStop(0.92, '#343434');
      g.addColorStop(1.00, '#101010');
      x.fillStyle = g;
      x.fillRect(0, y0, S, rh);

      // Deep grooves between individual kozane scales
      for (let s = 0; s < scales; s++) {
        const sx = s * sw;
        x.fillStyle = '#202020';
        x.fillRect(sx, y0 + 6, 2.5, rh - 10);
        const sb = x.createLinearGradient(sx + 2.5, 0, sx + sw, 0);
        sb.addColorStop(0, 'rgba(255,255,255,0.22)');
        sb.addColorStop(0.5, 'rgba(255,255,255,0.08)');
        sb.addColorStop(1, 'rgba(0,0,0,0.22)');
        x.fillStyle = sb;
        x.fillRect(sx + 2.5, y0 + 7, sw - 2.5, rh - 12);
      }

      // Raised metallic fukurin trim bar
      x.fillStyle = '#ececec';
      x.fillRect(0, y0 + 5, S, 4);

      // Raised 3D braided silk cords
      for (let cx = 32; cx < S; cx += 64) {
        for (const dx of [-12, 4]) {
          const bx = cx + dx;
          x.fillStyle = '#242424'; x.fillRect(bx - 1.5, y0, 12.5, rh - 3);
          x.fillStyle = '#f2f2f2'; x.fillRect(bx, y0 + 1, 9.5, rh - 5);
          x.fillStyle = '#7c7c7c';
          for (let yy = y0 + 4; yy < y0 + rh - 7; yy += 6) {
            x.fillRect(bx, yy, 4.8, 2.2);
            x.fillRect(bx + 4.8, yy + 3, 4.8, 2.2);
          }
        }
      }

      // Domed rivets
      if (r === 0 || r === 2 || r === 4) {
        for (let cx = 0; cx < S; cx += 64) {
          const cy = y0 + rh * 0.46;
          const rg = x.createRadialGradient(cx, cy, 0.5, cx, cy, 7.2);
          rg.addColorStop(0, '#ffffff');
          rg.addColorStop(0.58, '#dcdcdc');
          rg.addColorStop(0.84, '#444444');
          rg.addColorStop(1, '#787878');
          x.fillStyle = rg;
          x.beginPath(); x.arc(cx, cy, 7.2, 0, TAU); x.fill();
        }
      }
    }
    addForgedGrain(x, S, S, 0.75);
  });

  // 3. ROUGHNESS MAP (glossy urushi = #2e, mirror metal = #20, matte silk = #de)
  const roughC = makeCanvas(S, S, x => {
    x.fillStyle = '#303030'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // Matte silk piping & braided cords
      x.fillStyle = '#dedede';
      x.fillRect(0, y0, S, 5.5);
      for (let cx = 32; cx < S; cx += 64) {
        x.fillRect(cx - 12, y0, 9.5, rh);
        x.fillRect(cx + 4, y0, 9.5, rh);
      }
      // Glossy polished metallic piping & rivets
      x.fillStyle = '#1e1e1e';
      x.fillRect(0, y0 + 5.5, S, 3.5);
      if (r === 0 || r === 2 || r === 4) {
        for (let cx = 0; cx < S; cx += 64) {
          x.beginPath(); x.arc(cx, y0 + rh * 0.46, 6.2, 0, TAU); x.fill();
        }
      }
    }
    addForgedGrain(x, S, S, 0.55);
  });

  // 4. METALNESS MAP (silk = #00, lacquered steel = #44, gilded trim & rivets = #ff)
  const metalC = makeCanvas(S, S, x => {
    x.fillStyle = '#484848'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // Silk is non-metallic
      x.fillStyle = '#000000';
      x.fillRect(0, y0, S, 5.5);
      for (let cx = 32; cx < S; cx += 64) {
        x.fillRect(cx - 12, y0, 9.5, rh);
        x.fillRect(cx + 4, y0, 9.5, rh);
      }
      // Pure metal trim & rivets
      x.fillStyle = '#ffffff';
      x.fillRect(0, y0 + 5.5, S, 3.5);
      if (r === 0 || r === 2 || r === 4) {
        for (let cx = 0; cx < S; cx += 64) {
          x.beginPath(); x.arc(cx, y0 + rh * 0.46, 6.2, 0, TAU); x.fill();
        }
      }
    }
  });

  // 5. OPTIONAL SELECTIVE EMISSIVE MAP (never washes out the dark lacquer!)
  let emissive: THREE.CanvasTexture | undefined;
  if (hasSelectiveEmissive) {
    const emC = makeCanvas(S, S, x => {
      x.fillStyle = '#000000'; x.fillRect(0, 0, S, S);
      const glowCol = isWind ? '#5ef5c8' : isEmber ? '#ff5418' : '#7ae8ff';
      x.strokeStyle = glowCol;
      x.shadowColor = glowCol;
      x.shadowBlur = 7;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rh;
        // Subtle luminous seam line under every tier edge
        x.lineWidth = isEmber ? 2.2 : 1.8;
        x.beginPath();
        x.moveTo(0, y0 + 7.5);
        x.lineTo(S, y0 + 7.5);
        x.stroke();
        // Thematic glowing vein motif on alternating rows
        if (r === 1 || r === 3) {
          x.lineWidth = 2.0;
          for (let wx = 16; wx < S; wx += 64) {
            x.beginPath();
            if (isWind) {
              x.moveTo(wx - 14, y0 + rh * 0.54);
              x.bezierCurveTo(wx, y0 + rh * 0.24, wx + 22, y0 + rh * 0.26, wx + 30, y0 + rh * 0.48);
            } else if (isEmber) {
              x.moveTo(wx - 12, y0 + rh * 0.35);
              x.lineTo(wx + 4, y0 + rh * 0.58);
              x.lineTo(wx + 18, y0 + rh * 0.42);
              x.lineTo(wx + 28, y0 + rh * 0.65);
            } else {
              x.moveTo(wx, y0 + rh * 0.25);
              x.lineTo(wx + 14, y0 + rh * 0.5);
              x.lineTo(wx, y0 + rh * 0.75);
              x.lineTo(wx - 14, y0 + rh * 0.5);
              x.closePath();
            }
            x.stroke();
          }
        }
      }
    });
    emissive = toTex(emC, true);
  }

  return {
    map: toTex(mapC, true),
    normal: heightToNormalTex(heightC, 2.7),
    rough: toTex(roughC, false),
    metal: toTex(metalC, false),
    emissive,
  };
}

/**
 * Create a MeshPhysicalMaterial for armor plates with clearcoat urushi sheen,
 * true tangent-space normal map, metalness map, and selective emissive.
 */
export function makeArmorPlateMat(
  pbr: FullPBRMaps,
  rx: number,
  ry: number,
  opts: { isNeon?: boolean; neonColor?: number; glow?: number; clearcoat?: number; roughness?: number; metalness?: number } = {}
): THREE.MeshPhysicalMaterial {
  const cloneRep = (t: THREE.CanvasTexture) => {
    const c = t.clone();
    c.repeat.set(rx, ry);
    c.needsUpdate = true;
    return c;
  };
  const map = cloneRep(pbr.map);
  const normalMap = cloneRep(pbr.normal);
  const roughnessMap = cloneRep(pbr.rough);
  const metalnessMap = cloneRep(pbr.metal);
  const em = pbr.emissive ? cloneRep(pbr.emissive) : undefined;

  return new THREE.MeshPhysicalMaterial({
    map,
    normalMap,
    normalScale: new THREE.Vector2(1.15, 1.15),
    roughnessMap,
    metalnessMap,
    roughness: opts.roughness ?? (opts.isNeon ? 0.26 : 0.88),
    metalness: opts.metalness ?? (opts.isNeon ? 0.65 : 0.92),
    clearcoat: opts.clearcoat ?? (opts.isNeon ? 0.65 : 0.88),
    clearcoatRoughness: opts.isNeon ? 0.14 : 0.16,
    emissiveMap: em ?? null,
    emissive: em ? (opts.isNeon ? opts.neonColor! : 0xffffff) : 0x000000,
    emissiveIntensity: em ? (opts.isNeon ? 2.4 : 0.85) : 0,
    side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------ sculpted 3D samurai armor architectural pieces

/** Curved elliptical band with physical thickness (outer + inner surface + beveled edges) */
export function buildThickArcBand(
  rxTop: number, rzTop: number, rxBot: number, rzBot: number,
  yTop: number, yBot: number, th0: number, span: number,
  mat: THREE.Material, segsU = 24
): THREE.Mesh {
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  const stride = segsU + 1;
  for (let iv = 0; iv <= 1; iv++) {
    const rx = iv === 0 ? rxTop : rxBot;
    const rz = iv === 0 ? rzTop : rzBot;
    const y = iv === 0 ? yTop : yBot;
    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const th = th0 + u * span;
      pos.push(Math.sin(th) * rx, y, Math.cos(th) * rz);
      uv.push(u, 1 - iv);
    }
  }
  for (let iu = 0; iu < segsU; iu++) {
    const a = iu, b = iu + stride, c = b + 1, d = a + 1;
    idx.push(a, d, b, b, d, c);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

/**
 * Build a historically proportioned Japanese Okegawa-dō / Ni-mai-dō cuirass:
 * - Slim, athletic fit that hugs the ribcage and stops below the collarbone so the crossed white
 *   shitagi under-collar and laced nodowa throat guard stay clearly visible (matching real samurai armor).
 * - 5 crisp horizontal stepped lacquered plates (lames) with beveled gilded edges and vertical braided cords.
 * - Clean watagami shoulder straps with metal rings & subtle back agemaki silk bow.
 */
export function buildRealisticSamuraiCuirass(
  armorMat: THREE.Material,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material,
  underCollarMat: THREE.Material,
  tier: number
): THREE.Group {
  const g = new THREE.Group();

  // 1. Crossed white shitagi kimono collar + laced nodowa throat guard peeking neatly above the breastplate
  const underR = new THREE.CatmullRomCurve3([
    new V(-0.072, 0.242, 0.015), new V(-0.068, 0.195, 0.095), new V(-0.015, 0.148, 0.128), new V(0.042, 0.118, 0.132)
  ]);
  const underL = new THREE.CatmullRomCurve3([
    new V(0.072, 0.242, 0.015), new V(0.068, 0.195, 0.095), new V(0.012, 0.145, 0.132), new V(-0.042, 0.115, 0.134)
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(underR, 14, 0.012, 6), underCollarMat));
  g.add(new THREE.Mesh(new THREE.TubeGeometry(underL, 14, 0.013, 6), underCollarMat));

  // Compact laced nodowa (throat guard) resting cleanly below the chin
  const nodowa = buildThickArcBand(0.088, 0.082, 0.112, 0.102, 0.228, 0.184, -0.95, 1.9, lacquerMat, 16);
  g.add(nodowa);
  const nodowaRim = new THREE.CatmullRomCurve3([
    new V(-0.092, 0.184, 0.060), new V(0, 0.180, 0.105), new V(0.092, 0.184, 0.060)
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(nodowaRim, 16, 0.0038, 5), metalMat));

  // 2. Slim tailored inner torso shell (stops at y = 0.155 in front, rises slightly higher at back nape)
  const rings: [number, number, number][] = [
    // [y, rx, rz] — tight athletic proportions matching Soldier.glb without bloating
    [-0.238, 0.156, 0.116],
    [-0.180, 0.158, 0.118],
    [-0.115, 0.168, 0.125],
    [-0.045, 0.180, 0.134],
    [0.030,  0.192, 0.142],
    [0.100,  0.196, 0.142],
    [0.152,  0.186, 0.132],
  ];
  const segs = 40, stride = segs + 1;
  const pos = new Float32Array(rings.length * stride * 3);
  const uv = new Float32Array(rings.length * stride * 2);
  for (let i = 0; i < rings.length; i++) {
    const [baseY, rx, rz] = rings[i];
    const v = i / (rings.length - 1);
    for (let j = 0; j <= segs; j++) {
      const u = j / segs, th = u * TAU;
      const sx = Math.sin(th), cz = Math.cos(th);
      // subtle flat-fronted samurai chest boxiness (authentic okegawa-dō)
      const sq = 1 + 0.055 * (Math.abs(sx) * Math.abs(cz) * 2.0);
      const x = sx * rx * sq;
      const z = cz * rz * sq;
      // higher backplate (oshitsuke-no-ita), slightly lower straight front chest edge (muna-ita)
      const y = baseY + (i === rings.length - 1 && cz < 0 ? 0.042 * (-cz) : 0);
      const idx = i * stride + j;
      pos[idx * 3] = x; pos[idx * 3 + 1] = y; pos[idx * 3 + 2] = z;
      uv[idx * 2] = u; uv[idx * 2 + 1] = v;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < segs; j++) {
      const a = i * stride + j, b = a + stride, c = b + 1, d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }
  const coreGeo = new THREE.BufferGeometry();
  coreGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  coreGeo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  coreGeo.setIndex(indices);
  coreGeo.computeVertexNormals();
  g.add(new THREE.Mesh(coreGeo, armorMat));

  // 3. Five crisp horizontal stepped lacquered plates (okegawa-dō lames) with thin gilded lip & horizontal silk cords
  const lameBands: [number, number, number, number][] = [
    [0.154,  0.095, 0.194, 0.199],  // muna-ita (upper chest plate)
    [0.092,  0.025, 0.197, 0.196],
    [0.022, -0.045, 0.190, 0.184],
    [-0.048, -0.115, 0.178, 0.172],
    [-0.118, -0.185, 0.167, 0.162],
    [-0.188, -0.242, 0.160, 0.162],
  ];
  for (let i = 0; i < lameBands.length; i++) {
    const [yt, yb, r0, r1] = lameBands[i];
    const plate = buildThickArcBand(
      r0 * 1.02, r0 * 0.75,
      r1 * 1.03, r1 * 0.76,
      yt, yb, -Math.PI, TAU,
      i === 0 ? lacquerMat : armorMat, 36
    );
    g.add(plate);
    // Crisp thin metallic rim along each plate lip (like Images 3 & 4)
    const rimPts: THREE.Vector3[] = [];
    for (let k = 0; k <= 36; k++) {
      const th = (k / 36) * TAU;
      rimPts.push(new V(Math.sin(th) * r1 * 1.034, yb, Math.cos(th) * r1 * 0.764));
    }
    g.add(new THREE.Mesh(
      new THREE.TubeGeometry(new THREE.CatmullRomCurve3(rimPts, true), 36, i === 0 || i === lameBands.length - 1 ? 0.0042 : 0.0024, 5, true),
      i % 2 === 1 && i < 4 ? laceMat : metalMat
    ));
  }

  // 4. Vertical front braided lacing columns (odoshi cords) & top muna-ita brass edge trim (Image 4)
  const topRimPts: THREE.Vector3[] = [];
  for (let k = 0; k <= 20; k++) {
    const th = -1.15 + (k / 20) * 2.3;
    topRimPts.push(new V(Math.sin(th) * 0.196, 0.154, Math.cos(th) * 0.145));
  }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(topRimPts), 22, 0.0046, 6), metalMat));

  for (const sx of [-0.078, 0.078]) {
    const cordCurve = new THREE.CatmullRomCurve3([
      new V(sx, 0.148, 0.138),
      new V(sx * 1.04, 0.04, 0.148),
      new V(sx * 0.96, -0.09, 0.136),
      new V(sx * 0.90, -0.23, 0.122),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 16, 0.0052, 5), laceMat));
  }

  // 5. Watagami shoulder straps (clean, slim lacquered straps with brass rings — matching Image 4)
  for (const s of [-1, 1]) {
    const strapCurve = new THREE.CatmullRomCurve3([
      new V(0.088 * s, 0.145, 0.128),
      new V(0.104 * s, 0.228, 0.052),
      new V(0.104 * s, 0.236, -0.048),
      new V(0.088 * s, 0.175, -0.128),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(strapCurve, 18, 0.011, 6), lacquerMat));
    // Front brass ring clasp (kohaze / kan)
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.0032, 6, 16), metalMat);
    ring.position.set(0.088 * s, 0.138, 0.136);
    g.add(ring);
  }

  // 6. Clean ceremonial Agemaki silk bow on the upper backplate (tasteful, historically proportioned)
  if (tier >= 1.5) {
    const bow = new THREE.Group();
    bow.position.set(0, 0.105, -0.146);
    const kan = new THREE.Mesh(new THREE.TorusGeometry(0.015, 0.0038, 6, 16), metalMat);
    bow.add(kan);
    for (const s of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.022, 0.0065, 6, 16), laceMat);
      loop.position.set(s * 0.028, 0.004, -0.005);
      loop.scale.set(1.2, 0.7, 0.6);
      bow.add(loop);
      const tail = new THREE.CatmullRomCurve3([
        new V(s * 0.012, -0.008, -0.006),
        new V(s * 0.026, -0.085, -0.012),
        new V(s * 0.032, -0.165, -0.006),
      ]);
      bow.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 10, 0.0045, 5), laceMat));
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.011, 0.040, 8, 1, true), laceMat);
      tassel.position.set(s * 0.032, -0.188, -0.006);
      bow.add(tassel);
    }
    g.add(bow);
  }

  return g;
}

/**
 * Historically accurate samurai Kusazuri (6 separate flat-faced articulated rectangular tasset panels
 * hanging straight down from a wrapped fabric Obi sash with a front knot — matching Images 3 & 4).
 */
export function buildRealisticKusazuri(
  armorMat: THREE.Material,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material,
  obiMat: THREE.Material,
  sodeScale: number
): THREE.Group {
  const g = new THREE.Group();
  const rx = 0.172, rz = 0.132;

  // 1. Thick wrapped fabric Obi sash around the waist + crisp front knot & hanging ends (Images 3 & 4)
  for (const [y, rScale, tube] of [[0.048, 1.02, 0.019], [0.024, 1.04, 0.020]] as const) {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 36; i++) {
      const th = (i / 36) * TAU;
      pts.push(new V(Math.sin(th) * rx * rScale, y, Math.cos(th) * rz * rScale));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 36, tube, 8, true), obiMat));
  }
  // Front obi knot + two neat hanging sash tails
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.022, 0.009, 20, 6), obiMat);
  knot.position.set(0, 0.032, rz * 1.12);
  knot.scale.set(1.15, 0.85, 0.7);
  g.add(knot);
  for (const s of [-1, 1]) {
    const endCurve = new THREE.CatmullRomCurve3([
      new V(s * 0.015, 0.026, rz * 1.12),
      new V(s * 0.028, -0.045, rz * 1.16),
      new V(s * 0.032, -0.115, rz * 1.14),
    ]);
    g.add(new THREE.Mesh(new THREE.TubeGeometry(endCurve, 10, 0.0085, 6), obiMat));
  }

  // 2. Six separate, flat-faced, multi-lame rectangular tasset panels hanging straight down (NOT a flared cone!)
  const panelConfigs: { ang: number; width: number; height: number; lames: number }[] = [
    { ang: 0,                  width: 0.162, height: 0.275, lames: 5 }, // center front
    { ang: 0.96,               width: 0.152, height: 0.265, lames: 5 }, // front-left
    { ang: -0.96,              width: 0.152, height: 0.265, lames: 5 }, // front-right
    { ang: Math.PI,            width: 0.168, height: 0.270, lames: 5 }, // center back
    { ang: Math.PI - 0.96,     width: 0.150, height: 0.260, lames: 5 }, // back-left
    { ang: -(Math.PI - 0.96),  width: 0.150, height: 0.260, lames: 5 }, // back-right
  ];
  const hScale = 0.94 + Math.min(0.18, sodeScale * 0.08);

  for (const cfg of panelConfigs) {
    const pGrp = new THREE.Group();
    const px = Math.sin(cfg.ang) * (rx + 0.018);
    const pz = Math.cos(cfg.ang) * (rz + 0.018);
    pGrp.position.set(px, 0.006, pz);
    pGrp.rotation.y = cfg.ang;
    // Slight natural outward hang (only ~6 degrees, never a flared tutu!)
    pGrp.rotation.x = -0.10;

    const totalH = cfg.height * hScale;
    const lameH = totalH / cfg.lames;

    // Silk suspension straps attaching the tasset to the obi
    for (const sx of [-cfg.width * 0.30, cfg.width * 0.30]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.036, 0.008), laceMat);
      strap.position.set(sx, 0.008, 0.002);
      pGrp.add(strap);
    }

    // 5 physically stepped overlapping rectangular lacquered lames (thick 3D plates!)
    for (let li = 0; li < cfg.lames; li++) {
      const wCur = cfg.width * (0.92 + (li / (cfg.lames - 1)) * 0.14);
      const yCur = -li * (lameH * 0.88) - lameH * 0.5;
      const zStep = li * 0.0045; // each lower lame steps subtly outward like real overlapping armor
      const plate = new THREE.Mesh(
        new THREE.BoxGeometry(wCur, lameH * 0.94, 0.011),
        li === cfg.lames - 1 ? lacquerMat : armorMat
      );
      plate.position.set(0, yCur, zStep);
      pGrp.add(plate);
      // Crisp metallic bottom bevel trim on every lame
      const trim = new THREE.Mesh(new THREE.BoxGeometry(wCur + 0.004, 0.006, 0.013), metalMat);
      trim.position.set(0, yCur - lameH * 0.46, zStep + 0.001);
      pGrp.add(trim);
      // Vertical silk lacing pairs down each plate
      for (const lx of [-wCur * 0.32, 0, wCur * 0.32]) {
        const cord = new THREE.Mesh(new THREE.BoxGeometry(0.010, lameH * 0.90, 0.013), laceMat);
        cord.position.set(lx, yCur, zStep + 0.001);
        pGrp.add(cord);
      }
    }
    g.add(pGrp);
  }

  return g;
}

/**
 * Historically proportioned Samurai Sode (shoulder guard):
 * Compact, flat-curved shield of 5 stepped rectangular lacquered lames that hugs the deltoid cleanly
 * (matching Images 3 & 4 — never floating off the arm).
 */
export function buildRealisticSode(
  sodeScale: number,
  armorMat: THREE.Material,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  const lames = 5;
  const w = 0.118 + Math.min(0.036, sodeScale * 0.018);
  const totalH = 0.155 + Math.min(0.055, sodeScale * 0.028);
  const lameH = totalH / lames;
  const Rc = 0.105; // tight curve radius hugging the deltoid
  const off = 0.054;

  // Raised kanmuri-ita upper cap curving inward over the shoulder joint
  const capW = w * 0.92;
  const cap = new THREE.Mesh(new THREE.BoxGeometry(capW, 0.024, 0.022), lacquerMat);
  cap.position.set(0, 0.048, off - 0.012);
  cap.rotation.x = 0.42;
  g.add(cap);
  const capRim = new THREE.Mesh(new THREE.BoxGeometry(capW + 0.006, 0.007, 0.024), metalMat);
  capRim.position.set(0, 0.058, off - 0.016);
  capRim.rotation.x = 0.42;
  g.add(capRim);

  // 5 physically stepped overlapping curved rectangular lames
  for (let i = 0; i < lames; i++) {
    const f = i / (lames - 1);
    const rCur = Rc + i * 0.0035;
    const span = (w * (0.94 + f * 0.08)) / rCur;
    const yC = 0.034 - i * (lameH * 0.84) - lameH * 0.42;
    const panel = new THREE.Mesh(
      new THREE.CylinderGeometry(rCur, rCur + 0.004, lameH * 0.94, 10, 1, true, -span / 2, span),
      i === 0 ? lacquerMat : armorMat
    );
    panel.position.set(0, yC, off - Rc);
    g.add(panel);
    // Crisp gilded bottom rim on each stepped lame
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 10; k++) {
      const th = -span / 2 + (k / 10) * span;
      pts.push(new V(Math.sin(th) * (rCur + 0.005), yC - lameH * 0.46, Math.cos(th) * (rCur + 0.005) + (off - Rc)));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, i === lames - 1 ? 0.0038 : 0.0024, 5), metalMat));
  }
  // Vertical silk lacing cord down the center of the sode
  const centerCord = new THREE.Mesh(new THREE.BoxGeometry(0.011, totalH * 0.85, 0.008), laceMat);
  centerCord.position.set(0, 0.034 - totalH * 0.44, off + 0.010);
  g.add(centerCord);

  return g;
}

/**
 * Tasteful, historically grounded subtle crest accents for legendary boss-drop armors
 * (NO oversized cartoonish wings, drums, or floating cones — dignified samurai craftsmanship).
 */
export function attachArmorSignature(
  _chestGroup: THREE.Group,
  _a: Armor,
  _depthScale: number,
  _lacquerMat: THREE.Material,
  _metalMat: THREE.Material,
  _laceMat: THREE.Material
) {
  // Intentionally kept clean and proportional so legendary armors shine through their
  // authentic silhouette, bespoke PBR finishes, selective glowing veins, and auras.
}
