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
 * Add physical 3D articulated abdominal armor tiers, raised pectoral breastplate rim,
 * shoulder-chest guard plates (sendan-no-ita & kyūbi-no-ita), and ceremonial back agemaki bow
 * onto a cuirass group so the armor reads as museum-grade layered 3D craftsmanship from both front & back.
 */
export function addSamuraiTorsoRelief(
  g: THREE.Group,
  spec: { chestW: number; waistW: number; depth: number },
  armorMat: THREE.Material,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material,
  tier: number
) {
  // 1. Physical 3D stepped abdominal armor bands (tateage / kusazuri upper lames) that catch real rim light
  const tiers: [number, number, number, number][] = [
    [-0.075, -0.145, 0.205, 0.212],
    [-0.140, -0.205, 0.192, 0.200],
    [-0.200, -0.264, 0.184, 0.194],
  ];
  for (const [yt, yb, r0, r1] of tiers) {
    const band = buildThickArcBand(
      r0 * spec.waistW, r0 * 0.75 * spec.depth,
      r1 * spec.waistW, r1 * 0.75 * spec.depth,
      yt, yb, -Math.PI, TAU, armorMat, 36
    );
    g.add(band);
    // Crisp gilded lower lip on each 3D stepped tier
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 36; i++) {
      const th = (i / 36) * TAU;
      pts.push(new V(Math.sin(th) * r1 * spec.waistW * 1.005, yb, Math.cos(th) * r1 * 0.75 * spec.depth * 1.005));
    }
    g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 36, 0.0032, 5, true), metalMat));
  }

  // 2. Sculpted upper chest plate (muna-ita) & armored throat guard (nodowa)
  const muna = buildThickArcBand(
    0.175 * spec.chestW, 0.132 * spec.depth,
    0.232 * spec.chestW, 0.168 * spec.depth,
    0.220, 0.128, -1.05, 2.1, lacquerMat, 22
  );
  g.add(muna);
  // Gilded V-contour chest trim framing the pectoral plate
  const chestTrim = new THREE.CatmullRomCurve3([
    new V(-0.185 * spec.chestW, 0.155, 0.092 * spec.depth),
    new V(-0.110 * spec.chestW, 0.125, 0.158 * spec.depth),
    new V(0, 0.112, 0.174 * spec.depth),
    new V(0.110 * spec.chestW, 0.125, 0.158 * spec.depth),
    new V(0.185 * spec.chestW, 0.155, 0.092 * spec.depth),
  ]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(chestTrim, 24, 0.0048, 6, false), metalMat));

  // 3. Sendan-no-ita (right) & Kyūbi-no-ita (left) — iconic chest-shoulder guard plates
  if (tier >= 1.5) {
    for (const s of [-1, 1]) {
      const guard = new THREE.Group();
      guard.position.set(0.112 * s, 0.142, 0.154 * spec.depth);
      guard.rotation.set(-0.16, s * 0.34, -s * 0.08);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.056, 0.095, 0.012), s > 0 ? lacquerMat : armorMat);
      guard.add(plate);
      const frame = new THREE.Mesh(new THREE.BoxGeometry(0.062, 0.101, 0.007), metalMat);
      frame.position.z = -0.003;
      guard.add(frame);
      const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.0085, 8, 6), metalMat);
      rivet.position.set(0, 0.028, 0.008);
      guard.add(rivet);
      g.add(guard);
    }
  }

  // 4. Sculpted backplate spine ridge + ceremonial Agemaki silk bow & hanging tassels (crucial for 3rd-person camera!)
  const spinePlate = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.30, 0.018), lacquerMat);
  spinePlate.position.set(0, 0.035, -0.156 * spec.depth);
  g.add(spinePlate);
  const spineRim = new THREE.Mesh(new THREE.BoxGeometry(0.080, 0.31, 0.010), metalMat);
  spineRim.position.set(0, 0.035, -0.152 * spec.depth);
  g.add(spineRim);

  if (tier >= 1.2) {
    const bowGrp = new THREE.Group();
    bowGrp.position.set(0, 0.125, -0.172 * spec.depth);
    // Gilded mounting ring (agemaki-no-kan)
    const kan = new THREE.Mesh(new THREE.TorusGeometry(0.019, 0.005, 7, 18), metalMat);
    bowGrp.add(kan);
    // Double ceremonial silk bow loops
    for (const s of [-1, 1]) {
      const loop = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.0085, 7, 18), laceMat);
      loop.position.set(s * 0.036, 0.005, -0.006);
      loop.scale.set(1.25, 0.72, 0.65);
      loop.rotation.z = -s * 0.25;
      bowGrp.add(loop);
      // Hanging braided silk cord + golden cap + tassel
      const cordCurve = new THREE.CatmullRomCurve3([
        new V(s * 0.016, -0.01, -0.008),
        new V(s * 0.038, -0.095, -0.018),
        new V(s * 0.048, -0.195, -0.010),
      ]);
      bowGrp.add(new THREE.Mesh(new THREE.TubeGeometry(cordCurve, 12, 0.006, 5), laceMat));
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.011, 0.018, 8), metalMat);
      cap.position.set(s * 0.048, -0.195, -0.010);
      bowGrp.add(cap);
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.015, 0.056, 8, 1, true), laceMat);
      tassel.position.set(s * 0.048, -0.228, -0.010);
      bowGrp.add(tassel);
    }
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), laceMat);
    knot.position.z = -0.008;
    bowGrp.add(knot);
    g.add(bowGrp);
  }
}

/**
 * Sculpted fierce samurai Menpō (armored lower-face mask) hung below the kabuto brow on tier >= 2.0.
 */
export function buildMenpoMask(lacquerMat: THREE.Material, metalMat: THREE.Material, laceMat: THREE.Material, r: number): THREE.Group {
  const m = new THREE.Group();
  // Contoured cheek & jaw armor shell
  const jaw = new THREE.Mesh(
    new THREE.CylinderGeometry(r * 0.88, r * 0.72, r * 0.64, 16, 1, true, -1.05, 2.1),
    lacquerMat
  );
  jaw.position.set(0, -r * 0.62, r * 0.14);
  m.add(jaw);
  // Gilded nose-bridge & fierce cheekbone ridges
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(r * 0.85, r * 0.028, 6, 20, 1.9), metalMat);
  ridge.rotation.x = Math.PI / 2;
  ridge.rotation.z = -Math.PI / 2 - 0.95;
  ridge.position.set(0, -r * 0.34, r * 0.16);
  m.add(ridge);
  // Fierce upturned gilded grin / fang bar
  const grin = new THREE.Mesh(new THREE.TorusGeometry(r * 0.30, r * 0.022, 6, 14, Math.PI * 0.85), metalMat);
  grin.position.set(0, -r * 0.64, r * 0.88);
  grin.rotation.z = Math.PI + 0.24;
  m.add(grin);
  // 2-tier yodare-kake (laced throat bib below the chin)
  for (let i = 0; i < 2; i++) {
    const bib = new THREE.Mesh(
      new THREE.CylinderGeometry(r * (0.76 + i * 0.10), r * (0.86 + i * 0.10), r * 0.22, 14, 1, true, -0.85, 1.7),
      i === 0 ? lacquerMat : laceMat
    );
    bib.position.set(0, -r * (0.98 + i * 0.18), r * (0.16 + i * 0.02));
    m.add(bib);
  }
  return m;
}

// ------------------------------------------------------------ bespoke legendary armor 3D signatures (back + shoulders)

/**
 * Attach unmistakable bespoke 3D architectural ornaments for boss-drop & legendary armors
 * onto the chest/backplate so every legendary set has an iconic silhouette across ALL 4 classes.
 */
export function attachArmorSignature(
  chestGroup: THREE.Group,
  a: Armor,
  depthScale: number,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material
) {
  const id = a.id;
  const backZ = -0.168 * depthScale;

  if (id === 'manto-tengu') {
    // ARMADURA DE LOS CINCO VIENTOS: twin swept aerodynamic Tengu feather-wing mantle fins + luminous jade veins
    const jadeGlow = new THREE.MeshBasicMaterial({
      color: 0x7effd4, transparent: true, opacity: 0.78, side: THREE.DoubleSide
    });
    const wingBase = new THREE.Group();
    wingBase.position.set(0, 0.13, backZ);
    for (const s of [-1, 1]) {
      const wing = new THREE.Group();
      wing.position.set(s * 0.08, 0.02, -0.01);
      wing.rotation.set(0.18, -s * 0.42, s * 0.22);
      // 4 layered overlapping sculpted Tengu feather-blades per wing
      for (let f = 0; f < 4; f++) {
        const len = 0.34 - f * 0.055;
        const w = 0.052 - f * 0.006;
        const sh = new THREE.Shape();
        sh.moveTo(0, 0);
        sh.quadraticCurveTo(s * len * 0.48, w * 1.1, s * len, w * 0.22);
        sh.quadraticCurveTo(s * len * 0.55, -w * 0.45, 0, -w * 0.35);
        sh.closePath();
        const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
        const feather = new THREE.Mesh(geo, f % 2 === 0 ? lacquerMat : metalMat);
        feather.position.set(0, -f * 0.036, -f * 0.010);
        feather.rotation.z = -s * (f * 0.16);
        wing.add(feather);
        // Luminous wind-jade spine vein along each feather
        const vein = new THREE.Mesh(new THREE.BoxGeometry(len * 0.78, 0.005, 0.011), jadeGlow);
        vein.position.set(s * len * 0.42, -f * 0.036 + w * 0.18, -f * 0.010 + 0.003);
        vein.rotation.z = -s * (f * 0.16 - 0.08);
        wing.add(vein);
      }
      wingBase.add(wing);
    }
    // Central Tengu wind-vortex crest boss on the upper back
    const crest = new THREE.Mesh(new THREE.TorusGeometry(0.044, 0.007, 8, 24), metalMat);
    crest.position.z = -0.015;
    wingBase.add(crest);
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.022, 0), jadeGlow);
    core.position.z = -0.018;
    wingBase.add(core);
    chestGroup.add(wingBase);

  } else if (id === 'coraza-tambor') {
    // CORAZA DEL TAMBOR CARMESÍ: iconic Raijin sacred war-drum halo ring behind the shoulders (5 gilded taiko drums)
    const halo = new THREE.Group();
    halo.position.set(0, 0.24, backZ - 0.03);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.24, 0.0085, 8, 40), metalMat);
    halo.add(ring);
    const drumSkin = new THREE.MeshStandardMaterial({ color: 0xf4e8cc, roughness: 0.5, emissive: 0xd9a036, emissiveIntensity: 0.25 });
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI * 0.22 + (i / 4) * Math.PI * 1.44;
      const dGrp = new THREE.Group();
      dGrp.position.set(Math.cos(a) * 0.24, Math.sin(a) * 0.24, 0);
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.036, 16), lacquerMat);
      body.rotation.x = Math.PI / 2;
      dGrp.add(body);
      const face = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.040, 16), drumSkin);
      face.rotation.x = Math.PI / 2;
      dGrp.add(face);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.005, 6, 18), metalMat);
      rim.position.z = -0.018;
      dGrp.add(rim);
      halo.add(dGrp);
    }
    chestGroup.add(halo);

  } else if (id === 'coraza-escarcha') {
    // CORAZA DE ESCARCHA ETERNA: faceted crystalline frost-mantle shards fanning from the upper back
    const iceMat = new THREE.MeshPhysicalMaterial({
      color: 0xb8f2ff, emissive: 0x38c8ff, emissiveIntensity: 0.65,
      roughness: 0.08, metalness: 0.15, clearcoat: 1.0, clearcoatRoughness: 0.05,
      transparent: true, opacity: 0.86
    });
    const frost = new THREE.Group();
    frost.position.set(0, 0.16, backZ - 0.01);
    const shards: [number, number, number, number, number][] = [
      [0, 0.11, 0.22, 0.036, 0],
      [-0.08, 0.07, 0.20, 0.032, 0.42],
      [0.08, 0.07, 0.20, 0.032, -0.42],
      [-0.14, 0.01, 0.16, 0.026, 0.82],
      [0.14, 0.01, 0.16, 0.026, -0.82],
    ];
    for (const [x, y, h, r, rz] of shards) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 5), iceMat);
      c.position.set(x, y, -0.01);
      c.rotation.set(-0.28, 0, rz);
      frost.add(c);
    }
    chestGroup.add(frost);

  } else if (id === 'yoroi-shuten' || id === 'coraza-sepulcral') {
    // O-YOROI DEL REY ONI / CORAZA SEPULCRAL: twin jagged demonic shoulder horns + glowing ember core on the back
    const emberMat = new THREE.MeshBasicMaterial({ color: id === 'yoroi-shuten' ? 0xff4418 : 0xff9238 });
    const crest = new THREE.Group();
    crest.position.set(0, 0.15, backZ - 0.01);
    for (const s of [-1, 1]) {
      const hornCurve = new THREE.CatmullRomCurve3([
        new V(s * 0.06, 0.01, 0),
        new V(s * 0.16, 0.09, -0.04),
        new V(s * 0.23, 0.21, -0.02),
      ]);
      crest.add(new THREE.Mesh(new THREE.TubeGeometry(hornCurve, 14, 0.014, 6), metalMat));
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.055, 6), metalMat);
      tip.position.set(s * 0.24, 0.23, -0.015);
      tip.rotation.z = -s * 0.35;
      crest.add(tip);
    }
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.026, 0), emberMat);
    core.position.set(0, 0.02, -0.015);
    crest.add(core);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.042, 0.006, 7, 20), metalMat);
    ring.position.set(0, 0.02, -0.012);
    crest.add(ring);
    chestGroup.add(crest);

  } else if (id === 'hachiman') {
    // ARMADURA DE HACHIMAN: radiant gilded sunburst back-plate emblem
    const sun = new THREE.Group();
    sun.position.set(0, 0.12, backZ - 0.016);
    const star = new THREE.Shape();
    const k = 24;
    for (let i = 0; i <= k; i++) {
      const t = (i / k) * TAU;
      const rr = i % 2 ? 0.056 : 0.096;
      const px = Math.sin(t) * rr, py = Math.cos(t) * rr;
      if (i === 0) star.moveTo(px, py); else star.lineTo(px, py);
    }
    const geo = new THREE.ExtrudeGeometry(star, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    sun.add(new THREE.Mesh(geo, metalMat));
    const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.012, 24), laceMat);
    disc.rotation.x = Math.PI / 2;
    disc.position.z = -0.002;
    sun.add(disc);
    chestGroup.add(sun);

  } else if (id === 'kitsune') {
    // ARMADURA DEL ZORRO: sacred twisted shimenawa rope across the upper back with twin crimson shrine tassels
    const ropeCurve = new THREE.CatmullRomCurve3([
      new V(-0.15, 0.16, backZ + 0.02),
      new V(-0.07, 0.11, backZ - 0.02),
      new V(0.07, 0.11, backZ - 0.02),
      new V(0.15, 0.16, backZ + 0.02),
    ]);
    chestGroup.add(new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 22, 0.016, 8), laceMat));
    for (const sx of [-0.08, 0, 0.08]) {
      const shide = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.058, 0.005), metalMat);
      shide.position.set(sx, 0.075, backZ - 0.025);
      shide.rotation.z = sx * 1.4;
      chestGroup.add(shide);
    }
  }
}
