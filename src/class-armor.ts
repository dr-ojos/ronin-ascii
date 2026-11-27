// Sculpted, culturally distinct 3D armor sets and high-detail procedural PBR textures for the three
// non-ronin classes (sōhei, xiákè, hwarang) when previewing or wearing Masa's merchant armors.
// Each class keeps its unmistakable silhouette and iconic motifs across every armor tier while
// fitting snugly to the mocap skeleton (anatomical torso loft, cupped deltoid pauldrons, fitted
// forearm vambraces, overlapping hip tassets, and contoured shin greaves with kneecaps).
import * as THREE from 'three';
import type { Armor, RobeTheme } from './armor';

const V = THREE.Vector3;
const TAU = Math.PI * 2;

export type NewClassId = 'sohei' | 'xia' | 'hwarang';

export interface ArmorBuildCtx {
  bones: Record<string, THREE.Object3D>;
  P: (name: string) => THREE.Vector3;
  rigChest?: THREE.Object3D;
  rigWaist?: THREE.Object3D;
  overlay: (id: string, twin: THREE.Object3D, obj: THREE.Object3D) => void;
  hang: (id: string, boneName: string, obj: THREE.Object3D) => void;
}

// ------------------------------------------------------------ colour & canvas helpers
const css = (c: number, k = 1, a = 1) => {
  const x = new THREE.Color(c).multiplyScalar(k);
  const r = Math.min(255, Math.max(0, x.r * 255)) | 0;
  const g = Math.min(255, Math.max(0, x.g * 255)) | 0;
  const b = Math.min(255, Math.max(0, x.b * 255)) | 0;
  return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`;
};

function makeTex(
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
  t.anisotropy = 4;
  return t;
}

interface PBRMaps { map: THREE.CanvasTexture; bump: THREE.CanvasTexture; rough: THREE.CanvasTexture; emissive?: THREE.CanvasTexture }

export interface FullPBRMaps {
  map: THREE.CanvasTexture;
  normal: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
  metal: THREE.CanvasTexture;
  emissive?: THREE.CanvasTexture;
}

function hash2(x: number, y: number) {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function addForgedGrain(x: CanvasRenderingContext2D, w: number, h: number, intensity = 1) {
  for (let i = 0; i < 180; i++) {
    const xx = hash2(i, 1.7) * w, yy = hash2(i, 3.1) * h, len = 14 + hash2(i, 5.3) * 64;
    x.fillStyle = hash2(i, 7.9) > 0.48
      ? `rgba(255,255,255,${(0.036 * intensity).toFixed(3)})`
      : `rgba(0,0,0,${(0.044 * intensity).toFixed(3)})`;
    x.fillRect(xx, yy, len, 1);
  }
  for (let i = 0; i < 110; i++) {
    const cx = hash2(i, 11.2) * w, cy = hash2(i, 13.8) * h, r = 2 + hash2(i, 17.5) * 6.5;
    const g = x.createRadialGradient(cx - r * 0.25, cy - r * 0.25, 0.3, cx, cy, r);
    g.addColorStop(0, `rgba(255,255,255,${(0.048 * intensity).toFixed(3)})`);
    g.addColorStop(0.6, 'rgba(0,0,0,0)');
    g.addColorStop(1, `rgba(0,0,0,${(0.056 * intensity).toFixed(3)})`);
    x.fillStyle = g;
    x.beginPath(); x.arc(cx, cy, r, 0, TAU); x.fill();
  }
}

/** Convert a heightfield canvas into a crisp tangent-space normal map via 3x3 Sobel filter */
export function heightToNormalTex(heightCanvas: HTMLCanvasElement, strength = 2.4, repeat = true): THREE.CanvasTexture {
  const w = heightCanvas.width, h = heightCanvas.height;
  const src = heightCanvas.getContext('2d')!.getImageData(0, 0, w, h).data;
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const ctx = out.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const dst = img.data;
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
      const inv = 1 / Math.hypot(dx, dy, 1.0);
      const idx = (y * w + x) * 4;
      dst[idx]     = ((-dx * inv) * 0.5 + 0.5) * 255;
      dst[idx + 1] = ((dy * inv) * 0.5 + 0.5) * 255;
      dst[idx + 2] = (inv * 0.5 + 0.5) * 255;
      dst[idx + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(out);
  t.colorSpace = THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

let cachedMetalPBR: { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;
export function forgedMetalPBR() {
  if (cachedMetalPBR) return cachedMetalPBR;
  const S = 256;
  const hc = document.createElement('canvas'); hc.width = hc.height = S;
  const hx = hc.getContext('2d')!;
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 2) {
    const v = 114 + Math.floor(hash2(y, 19.1) * 28);
    hx.fillStyle = `rgb(${v},${v},${v})`; hx.fillRect(0, y, S, 1);
  }
  addForgedGrain(hx, S, S, 1.7);
  const rough = makeTex(S, S, x => {
    x.fillStyle = '#3c3c3c'; x.fillRect(0, 0, S, S);
    addForgedGrain(x, S, S, 1.4);
  }, false);
  cachedMetalPBR = { normal: heightToNormalTex(hc, 1.7), rough };
  return cachedMetalPBR;
}

let cachedLacquerPBR: { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;
export function urushiLacquerPBR() {
  if (cachedLacquerPBR) return cachedLacquerPBR;
  const S = 256;
  const hc = document.createElement('canvas'); hc.width = hc.height = S;
  const hx = hc.getContext('2d')!;
  hx.fillStyle = '#808080'; hx.fillRect(0, 0, S, S);
  addForgedGrain(hx, S, S, 1.1);
  const rough = makeTex(S, S, x => {
    x.fillStyle = '#343434'; x.fillRect(0, 0, S, S);
    addForgedGrain(x, S, S, 0.85);
  }, false);
  cachedLacquerPBR = { normal: heightToNormalTex(hc, 1.1), rough };
  return cachedLacquerPBR;
}

let cachedSilkPBR: { normal: THREE.CanvasTexture; rough: THREE.CanvasTexture } | null = null;
export function braidedSilkPBR() {
  if (cachedSilkPBR) return cachedSilkPBR;
  const S = 128;
  const hc = document.createElement('canvas'); hc.width = hc.height = S;
  const hx = hc.getContext('2d')!;
  hx.fillStyle = '#686868'; hx.fillRect(0, 0, S, S);
  for (let y = 0; y < S; y += 8) for (let xx = 0; xx < S; xx += 8) {
    hx.fillStyle = ((y / 8 + xx / 8) & 1) === 0 ? '#d8d8d8' : '#3a3a3a';
    hx.fillRect(xx + 1, y + 1, 6, 6);
  }
  const rough = makeTex(S, S, x => { x.fillStyle = '#dcdcdc'; x.fillRect(0, 0, S, S); }, false);
  cachedSilkPBR = { normal: heightToNormalTex(hc, 2.1), rough };
  return cachedSilkPBR;
}

/** High-detail 512x512 full PBR kozane lamellar plates with Sobel normal map, metalness map & maki-e inlay */
export function roninLamellarPBR(l: NonNullable<Armor['look']>, armorId: string): FullPBRMaps {
  const S = 512, rows = 5, rh = S / rows, scales = 20, sw = S / scales;
  const isWind = armorId === 'manto-tengu';
  const isEmber = armorId === 'kagutsuchi' || armorId === 'yoroi-shuten' || armorId === 'coraza-sepulcral';
  const isLightning = armorId === 'raijin';
  const isFrost = armorId === 'coraza-escarcha';
  const isImperial = armorId === 'hachiman' || armorId === 'oyoroi' || armorId === 'coraza-tambor';

  const map = makeTex(S, S, x => {
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      const g = x.createLinearGradient(0, y0, 0, y0 + rh);
      g.addColorStop(0.0, css(l.lame, 1.72));
      g.addColorStop(0.10, css(l.lame, 1.24));
      g.addColorStop(0.50, css(l.lame, 0.94));
      g.addColorStop(0.84, css(l.lame, 0.56));
      g.addColorStop(1.0, css(l.lame, 0.24));
      x.fillStyle = g; x.fillRect(0, y0, S, rh);

      for (let s = 0; s < scales; s++) {
        const sx = s * sw;
        const sg = x.createLinearGradient(sx, y0, sx + sw, y0);
        sg.addColorStop(0, 'rgba(0,0,0,0.48)');
        sg.addColorStop(0.16, 'rgba(255,255,255,0.20)');
        sg.addColorStop(0.55, 'rgba(255,255,255,0.04)');
        sg.addColorStop(1, 'rgba(0,0,0,0.54)');
        x.fillStyle = sg; x.fillRect(sx, y0 + 7, sw, rh - 14);
        x.fillStyle = css(l.metal, 1.35, 0.25);
        x.fillRect(sx + 2, y0 + 8, sw - 4, 2.2);
      }

      // Subtle maki-e gold/silver lacquer motifs on alternating rows
      if (r === 1 || r === 3) {
        x.save();
        x.strokeStyle = css(l.metal, 1.35, isImperial ? 0.58 : 0.30);
        x.lineWidth = isImperial ? 2.0 : 1.4;
        if (isWind) {
          for (let wx = 16; wx < S; wx += 64) {
            x.beginPath();
            x.moveTo(wx - 14, y0 + rh * 0.54);
            x.bezierCurveTo(wx, y0 + rh * 0.22, wx + 22, y0 + rh * 0.24, wx + 30, y0 + rh * 0.48);
            x.stroke();
          }
        } else {
          for (let wx = 0; wx < S + 32; wx += 32) {
            for (const rr of [12, 7.5]) { x.beginPath(); x.arc(wx, y0 + rh * 0.64, rr, Math.PI, 0); x.stroke(); }
          }
        }
        x.restore();
      }

      // Deep ambient occlusion under overlapping lame
      const sh = x.createLinearGradient(0, y0 + rh - 14, 0, y0 + rh);
      sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.5, 'rgba(0,0,0,0.40)'); sh.addColorStop(1, 'rgba(0,0,0,0.86)');
      x.fillStyle = sh; x.fillRect(0, y0 + rh - 14, S, 14);

      // Top silk braid + metallic fukurin trim
      x.fillStyle = css(l.lace, 0.85); x.fillRect(0, y0, S, 5);
      x.fillStyle = css(l.metal, 1.35); x.fillRect(0, y0 + 5, S, 3.2);

      // Braided sugake odoshi paired silk cords
      for (let cx = 32; cx < S; cx += 64) {
        for (const dx of [-11, 4]) {
          const bx = cx + dx;
          x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(bx - 1.5, y0 + 1, 12, rh - 4);
          const cg = x.createLinearGradient(bx, 0, bx + 9, 0);
          cg.addColorStop(0, css(l.lace, 0.55)); cg.addColorStop(0.32, css(l.lace, 1.28)); cg.addColorStop(1, css(l.lace, 0.48));
          x.fillStyle = cg; x.fillRect(bx, y0 + 1, 9, rh - 5);
          x.fillStyle = css(l.lace, 0.38);
          for (let yy = y0 + 4; yy < y0 + rh - 6; yy += 6) {
            x.fillRect(bx, yy, 4.5, 2.2); x.fillRect(bx + 4.5, yy + 3, 4.5, 2.2);
          }
        }
      }

      // Domed gilded rivets (byō) with floral rosette washers
      if (r === 0 || r === 2 || r === 4) {
        for (let cx = 0; cx < S; cx += 64) {
          const cy = y0 + rh * 0.46;
          x.fillStyle = 'rgba(0,0,0,0.58)'; x.beginPath(); x.arc(cx, cy + 1.5, 7, 0, TAU); x.fill();
          const rg = x.createRadialGradient(cx - 1.6, cy - 1.6, 0.6, cx, cy, 5.2);
          rg.addColorStop(0, css(l.metal, 1.9)); rg.addColorStop(0.6, css(l.metal, 1.1)); rg.addColorStop(1, css(l.metal, 0.35));
          x.fillStyle = rg; x.beginPath(); x.arc(cx, cy, 5.2, 0, TAU); x.fill();
        }
      }

      // Hishinui cross-knots along bottom lame
      if (r === rows - 1) {
        x.lineCap = 'round';
        for (let cx = 16; cx < S; cx += 32) {
          const cy = y0 + rh * 0.68;
          x.strokeStyle = 'rgba(0,0,0,0.6)'; x.lineWidth = 5.5;
          x.beginPath(); x.moveTo(cx - 7, cy - 5); x.lineTo(cx + 7, cy + 7); x.moveTo(cx + 7, cy - 5); x.lineTo(cx - 7, cy + 7); x.stroke();
          x.strokeStyle = css(l.lace, 1.3); x.lineWidth = 3.2;
          x.beginPath(); x.moveTo(cx - 7, cy - 6); x.lineTo(cx + 7, cy + 6); x.moveTo(cx + 7, cy - 6); x.lineTo(cx - 7, cy + 6); x.stroke();
        }
      }
    }
    addForgedGrain(x, S, S, 0.65);
  });

  const heightC = document.createElement('canvas'); heightC.width = heightC.height = S;
  const hx = heightC.getContext('2d')!;
  hx.fillStyle = '#707070'; hx.fillRect(0, 0, S, S);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh;
    const g = hx.createLinearGradient(0, y0, 0, y0 + rh);
    g.addColorStop(0, '#e0e0e0'); g.addColorStop(0.10, '#c0c0c0'); g.addColorStop(0.82, '#888888'); g.addColorStop(1, '#121212');
    hx.fillStyle = g; hx.fillRect(0, y0, S, rh);
    for (let s = 0; s < scales; s++) {
      hx.fillStyle = '#242424'; hx.fillRect(s * sw, y0 + 6, 2.4, rh - 10);
      hx.fillStyle = '#e6e6e6'; hx.fillRect(s * sw + 3, y0 + 7, sw - 6, 3.5);
    }
    hx.fillStyle = '#ececec'; hx.fillRect(0, y0 + 5, S, 3.5);
    for (let cx = 32; cx < S; cx += 64) {
      for (const dx of [-11, 4]) {
        const bx = cx + dx;
        hx.fillStyle = '#f2f2f2'; hx.fillRect(bx, y0 + 1, 9, rh - 5);
        hx.fillStyle = '#7e7e7e';
        for (let yy = y0 + 4; yy < y0 + rh - 6; yy += 6) {
          hx.fillRect(bx, yy, 4.5, 2.2); hx.fillRect(bx + 4.5, yy + 3, 4.5, 2.2);
        }
      }
    }
    if (r === 0 || r === 2 || r === 4) {
      for (let cx = 0; cx < S; cx += 64) {
        const cy = y0 + rh * 0.46;
        const rg = hx.createRadialGradient(cx, cy, 0.5, cx, cy, 6.5);
        rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.6, '#d8d8d8'); rg.addColorStop(1, '#363636');
        hx.fillStyle = rg; hx.beginPath(); hx.arc(cx, cy, 6.5, 0, TAU); hx.fill();
      }
    }
  }
  addForgedGrain(hx, S, S, 0.7);

  const rough = makeTex(S, S, x => {
    x.fillStyle = '#323232'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      x.fillStyle = '#dcdcdc'; x.fillRect(0, y0, S, 5);
      for (let cx = 32; cx < S; cx += 64) { x.fillRect(cx - 11, y0, 9, rh); x.fillRect(cx + 4, y0, 9, rh); }
      x.fillStyle = '#1e1e1e'; x.fillRect(0, y0 + 5, S, 3.2);
      if (r === 0 || r === 2 || r === 4) for (let cx = 0; cx < S; cx += 64) { x.beginPath(); x.arc(cx, y0 + rh * 0.46, 5.5, 0, TAU); x.fill(); }
    }
  }, false);

  const metal = makeTex(S, S, x => {
    x.fillStyle = '#444444'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      x.fillStyle = '#000000'; x.fillRect(0, y0, S, 5);
      for (let cx = 32; cx < S; cx += 64) { x.fillRect(cx - 11, y0, 9, rh); x.fillRect(cx + 4, y0, 9, rh); }
      x.fillStyle = '#ffffff'; x.fillRect(0, y0 + 5, S, 3.2);
      if (r === 0 || r === 2 || r === 4) for (let cx = 0; cx < S; cx += 64) { x.beginPath(); x.arc(cx, y0 + rh * 0.46, 5.5, 0, TAU); x.fill(); }
    }
  }, false);

  let emissive: THREE.CanvasTexture | undefined;
  if (isWind || isEmber || isLightning || isFrost) {
    const glowCol = isWind ? '#5ef5c8' : isEmber ? '#ff5a18' : isLightning ? '#66dcff' : '#7ae8ff';
    emissive = makeTex(S, S, x => {
      x.fillStyle = '#000000'; x.fillRect(0, 0, S, S);
      x.strokeStyle = glowCol; x.shadowColor = glowCol; x.shadowBlur = isLightning ? 9 : 7;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rh;
        x.lineWidth = isEmber || isLightning ? 2.2 : 1.8;
        x.beginPath(); x.moveTo(0, y0 + 7); x.lineTo(S, y0 + 7); x.stroke();
        if (r === 1 || r === 3) {
          x.lineWidth = isLightning ? 2.4 : 2.0;
          for (let wx = 16; wx < S; wx += 64) {
            x.beginPath();
            if (isWind) {
              x.moveTo(wx - 14, y0 + rh * 0.54);
              x.bezierCurveTo(wx, y0 + rh * 0.24, wx + 22, y0 + rh * 0.26, wx + 30, y0 + rh * 0.48);
            } else if (isLightning) {
              // Crisp jagged thunderbolt forks across the storm-steel plates
              x.moveTo(wx - 16, y0 + rh * 0.26);
              x.lineTo(wx - 2, y0 + rh * 0.48);
              x.lineTo(wx - 8, y0 + rh * 0.54);
              x.lineTo(wx + 12, y0 + rh * 0.78);
              x.moveTo(wx - 2, y0 + rh * 0.48);
              x.lineTo(wx + 16, y0 + rh * 0.36);
            } else if (isEmber) {
              x.moveTo(wx - 14, y0 + rh * 0.34); x.lineTo(wx + 2, y0 + rh * 0.60); x.lineTo(wx + 14, y0 + rh * 0.40); x.lineTo(wx + 28, y0 + rh * 0.64);
            } else {
              x.moveTo(wx, y0 + rh * 0.26); x.lineTo(wx + 12, y0 + rh * 0.5); x.lineTo(wx, y0 + rh * 0.74); x.lineTo(wx - 12, y0 + rh * 0.5); x.closePath();
            }
            x.stroke();
          }
        }
      }
    });
  }

  return { map, normal: heightToNormalTex(heightC, 2.6), rough, metal, emissive };
}

/** Kabuto bowl 24-gore suji-bachi PBR maps (map + Sobel normal + rough) */
export function roninHachiPBR(l: NonNullable<Armor['look']>) {
  const W = 512, H = 256, n = 24, gw = W / n;
  const map = makeTex(W, H, x => {
    for (let i = 0; i < n; i++) {
      const x0 = i * gw;
      const g = x.createLinearGradient(x0, 0, x0 + gw, 0);
      g.addColorStop(0, css(l.lame, 0.48)); g.addColorStop(0.5, css(l.lame, 1.48)); g.addColorStop(1, css(l.lame, 0.45));
      x.fillStyle = g; x.fillRect(x0, 0, gw, H);
      x.fillStyle = css(l.metal, 1.15); x.fillRect(x0 - 1.2, 0, 2.4, H);
      for (let y = 18; y < H - 16; y += 22) {
        const cx = x0 + gw * 0.5;
        const rg = x.createRadialGradient(cx - 1, y - 1, 0.4, cx, y, 2.8);
        rg.addColorStop(0, css(l.metal, 1.85)); rg.addColorStop(0.65, css(l.metal, 1.1)); rg.addColorStop(1, css(l.metal, 0.4));
        x.fillStyle = rg; x.beginPath(); x.arc(cx, y, 2.8, 0, TAU); x.fill();
      }
    }
    const rim = x.createLinearGradient(0, 0, 0, 26);
    rim.addColorStop(0, 'rgba(0,0,0,0.58)'); rim.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = rim; x.fillRect(0, 0, W, 26);
    addForgedGrain(x, W, H, 0.6);
  });
  const hc = document.createElement('canvas'); hc.width = W; hc.height = H;
  const hx = hc.getContext('2d')!;
  hx.fillStyle = '#707070'; hx.fillRect(0, 0, W, H);
  for (let i = 0; i < n; i++) {
    const x0 = i * gw;
    const g = hx.createLinearGradient(x0, 0, x0 + gw, 0);
    g.addColorStop(0, '#303030'); g.addColorStop(0.5, '#c6c6c6'); g.addColorStop(1, '#303030');
    hx.fillStyle = g; hx.fillRect(x0, 0, gw, H);
    hx.fillStyle = '#f2f2f2'; hx.fillRect(x0 - 1.2, 0, 2.4, H);
    for (let y = 18; y < H - 16; y += 22) {
      const cx = x0 + gw * 0.5;
      const rg = hx.createRadialGradient(cx, y, 0.4, cx, y, 3.4);
      rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.7, '#d8d8d8'); rg.addColorStop(1, '#404040');
      hx.fillStyle = rg; hx.beginPath(); hx.arc(cx, y, 3.4, 0, TAU); hx.fill();
    }
  }
  const rough = makeTex(W, H, x => {
    x.fillStyle = '#404040'; x.fillRect(0, 0, W, H);
    x.fillStyle = '#202020';
    for (let i = 0; i < n; i++) {
      x.fillRect(i * gw - 1.2, 0, 2.4, H);
      for (let y = 18; y < H - 16; y += 22) { x.beginPath(); x.arc(i * gw + gw * 0.5, y, 3, 0, TAU); x.fill(); }
    }
  }, false);
  return { map, normal: heightToNormalTex(hc, 2.4), rough };
}

/** Embossed Ronin chest medallion (5-wind swirling crest for Cinco Vientos, mitsudomoe for all other Ronin sets) */
export function roninMonTex(l: NonNullable<Armor['look']>, armorId?: string) {
  return makeTex(256, 256, (x, w, h) => {
    const cx = w / 2, cy = h / 2;
    const bg = x.createRadialGradient(cx - 24, cy - 24, 10, cx, cy, 124);
    bg.addColorStop(0, css(l.lame, 1.35)); bg.addColorStop(0.7, css(l.lame, 0.72)); bg.addColorStop(1, css(l.lame, 0.32));
    x.fillStyle = bg; x.beginPath(); x.arc(cx, cy, 124, 0, TAU); x.fill();
    x.strokeStyle = css(l.metal, 1.35); x.lineWidth = 10; x.beginPath(); x.arc(cx, cy, 114, 0, TAU); x.stroke();
    x.strokeStyle = css(l.lace, 0.95); x.lineWidth = 4; x.beginPath(); x.arc(cx, cy, 98, 0, TAU); x.stroke();
    x.fillStyle = css(l.metal, 1.75);
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16;
      x.beginPath(); x.arc(cx + Math.cos(a) * 106, cy + Math.sin(a) * 106, 3.8, 0, TAU); x.fill();
    }
    const blades = armorId === 'manto-tengu' ? 5 : 3;
    const r = 74;
    x.save(); x.translate(cx, cy);
    for (let i = 0; i < blades; i++) {
      x.save(); x.rotate(i * TAU / blades);
      const tg = x.createRadialGradient(0, -r * 0.36, 3, 0, -r * 0.36, r * 0.34);
      tg.addColorStop(0, css(l.metal, 1.85)); tg.addColorStop(0.65, css(l.metal, 1.12)); tg.addColorStop(1, css(l.metal, 0.58));
      x.fillStyle = tg;
      const bw = r * (blades === 5 ? 0.19 : 0.25);
      x.beginPath(); x.arc(0, -r * 0.38, bw, 0, TAU); x.fill();
      x.beginPath(); x.moveTo(bw, -r * 0.38); x.quadraticCurveTo(r * 0.38, r * 0.18, -r * 0.12, r * 0.58); x.quadraticCurveTo(r * 0.12, r * 0.12, -bw, -r * 0.38); x.fill();
      x.restore();
    }
    x.restore();
  }, true, false);
}

/** Pitch-black abyssal flame plates with razor-thin white neon contours & flame filigree */
export function blackFirePlateMaps(): PBRMaps {
  const S = 512, rows = 5, rh = S / rows, scales = 10, sw = S / scales;
  const traceFineContours = (x: CanvasRenderingContext2D, lineW: number, stroke: string) => {
    x.strokeStyle = stroke;
    x.lineWidth = lineW;
    x.lineCap = 'round';
    x.lineJoin = 'round';
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // Razor-thin horizontal white neon tier contour
      x.beginPath(); x.moveTo(0, y0 + 2); x.lineTo(S, y0 + 2); x.stroke();
      // Fine overlapping arched flame-scale outlines
      for (let s = 0; s < scales; s++) {
        const x0 = s * sw, cx = x0 + sw * 0.5;
        x.beginPath();
        x.moveTo(x0 + 3, y0 + rh - 4);
        x.quadraticCurveTo(x0 + 3, y0 + 16, cx, y0 + 7);
        x.quadraticCurveTo(x0 + sw - 3, y0 + 16, x0 + sw - 3, y0 + rh - 4);
        x.stroke();
        // Delicate licking black-flame curl rimmed in white neon on alternating scales
        if ((r + s) % 2 === 0) {
          x.beginPath();
          x.moveTo(cx, y0 + rh - 10);
          x.bezierCurveTo(cx - 10, y0 + rh * 0.56, cx + 8, y0 + rh * 0.42, cx - 2, y0 + 18);
          x.stroke();
        }
      }
    }
  };
  const map = makeTex(S, S, x => {
    const bg = x.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, '#07070c'); bg.addColorStop(0.5, '#030306'); bg.addColorStop(1, '#010103');
    x.fillStyle = bg; x.fillRect(0, 0, S, S);
    addForgedGrain(x, S, S, 0.45);
    traceFineContours(x, 3.2, 'rgba(220,238,255,0.28)');
    traceFineContours(x, 1.35, '#ffffff');
  });
  const emissive = makeTex(S, S, x => {
    x.fillStyle = '#000000'; x.fillRect(0, 0, S, S);
    traceFineContours(x, 3.6, 'rgba(210,235,255,0.34)');
    traceFineContours(x, 1.45, '#ffffff');
  });
  const bump = makeTex(S, S, x => {
    x.fillStyle = '#505050'; x.fillRect(0, 0, S, S);
    traceFineContours(x, 3.2, '#e8e8e8');
  }, false);
  const rough = makeTex(S, S, x => {
    x.fillStyle = '#262626'; x.fillRect(0, 0, S, S);
    traceFineContours(x, 2.2, '#101010');
  }, false);
  return { map, bump, rough, emissive };
}

/** TRON-style dark obsidian carbon armor plates bordered by razor-sharp glowing white neon circuits */
export function tronPlateMaps(neonColor = 0xffffff): PBRMaps {
  const S = 512;
  const neonHex = css(neonColor, 1);
  const softGlow = css(neonColor, 1, 0.32);

  const traceCircuits = (x: CanvasRenderingContext2D, lineW: number, stroke: string, nodeR: number) => {
    x.strokeStyle = stroke;
    x.fillStyle = stroke;
    x.lineWidth = lineW;
    x.lineJoin = 'miter';
    const rows = 4, rh = S / rows;
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh, y1 = y0 + rh;
      // crisp horizontal neon rail dividing each armor tier
      x.beginPath(); x.moveTo(0, y0 + 4); x.lineTo(S, y0 + 4); x.stroke();
      // angular chamfered TRON panel dividers & recessed circuit traces
      for (let c = 0; c < 4; c++) {
        const x0 = c * 128;
        const cx = x0 + 64;
        // outer angled plate border
        x.beginPath();
        x.moveTo(x0 + 14, y0 + 14);
        x.lineTo(x0 + 114, y0 + 14);
        x.lineTo(x0 + 122, y0 + 24);
        x.lineTo(x0 + 122, y1 - 16);
        x.lineTo(x0 + 112, y1 - 8);
        x.lineTo(x0 + 16, y1 - 8);
        x.lineTo(x0 + 6, y1 - 16);
        x.lineTo(x0 + 6, y0 + 24);
        x.closePath();
        x.stroke();
        // internal glowing circuit bar + corner nodes
        x.beginPath();
        x.moveTo(cx - 26, y0 + rh * 0.52);
        x.lineTo(cx - 12, y0 + rh * 0.38);
        x.lineTo(cx + 12, y0 + rh * 0.38);
        x.lineTo(cx + 26, y0 + rh * 0.52);
        x.stroke();
        if (nodeR > 0) {
          for (const [nx, ny] of [[cx - 26, y0 + rh * 0.52], [cx + 26, y0 + rh * 0.52]]) {
            x.beginPath(); x.arc(nx, ny, nodeR, 0, TAU); x.fill();
          }
        }
      }
    }
  };

  const map = makeTex(S, S, x => {
    // deep jet-obsidian satin armor base
    const bg = x.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, '#0b0e16');
    bg.addColorStop(0.5, '#07090f');
    bg.addColorStop(1, '#040509');
    x.fillStyle = bg;
    x.fillRect(0, 0, S, S);
    // subtle carbon micro-weave texture
    x.fillStyle = 'rgba(255,255,255,0.028)';
    for (let y = 0; y < S; y += 8) for (let xx = (y % 16 ? 4 : 0); xx < S; xx += 8) x.fillRect(xx, y, 3, 3);
    // soft bloom halo around neon seams + razor-sharp white neon core
    traceCircuits(x, 7, softGlow, 4.5);
    traceCircuits(x, 2.8, neonHex, 2.6);
  });

  const emissive = makeTex(S, S, x => {
    x.fillStyle = '#000000';
    x.fillRect(0, 0, S, S);
    traceCircuits(x, 8, softGlow, 5);
    traceCircuits(x, 3.2, neonHex, 3);
  });

  const bump = makeTex(S, S, x => {
    x.fillStyle = '#b4b4b4'; x.fillRect(0, 0, S, S);
    traceCircuits(x, 9, '#242424', 0);
    traceCircuits(x, 3.5, '#f0f0f0', 3.5);
  }, false);

  const rough = makeTex(S, S, x => {
    x.fillStyle = '#4a4a4a'; x.fillRect(0, 0, S, S); // sleek satin-gloss obsidian
    traceCircuits(x, 5, '#141414', 3.5); // mirror-bright neon channels
  }, false);

  return { map, bump, rough, emissive };
}

const cachedSpecialRobeMaps = new Map<RobeTheme, PBRMaps>();
/** Procedural 512x512 glowing elemental / neon silk maps for the special tunics of Sōhei, Xiákè and Hwarang */
export function specialRobeMaps(theme: RobeTheme): PBRMaps {
  const hit = cachedSpecialRobeMaps.get(theme);
  if (hit) return hit;
  const S = 512;

  const drawFlameSilk = (
    x: CanvasRenderingContext2D,
    strokeMain: string,
    strokeSoft: string,
    emberCol: string,
    lineMain: number,
    lineSoft: number
  ) => {
    x.lineCap = 'round';
    x.lineJoin = 'round';
    // Flowing vertical flame ribbons and curled fire-crests woven into the silk
    for (let col = 0; col < 8; col++) {
      const cx = (col + 0.5) * (S / 8);
      for (const [lw, colStr] of [[lineSoft, strokeSoft], [lineMain, strokeMain]] as const) {
        x.strokeStyle = colStr;
        x.lineWidth = lw;
        x.beginPath();
        x.moveTo(cx, S);
        for (let y = S - 32; y >= 0; y -= 32) {
          const wave = Math.sin(y * 0.036 + col * 1.45) * 18;
          x.lineTo(cx + wave, y);
        }
        x.stroke();
        // Licking side tongues along each ribbon
        for (let row = 0; row < 4; row++) {
          const y0 = row * 128 + ((col & 1) ? 48 : 16);
          const dir = ((col + row) & 1) ? 1 : -1;
          x.beginPath();
          x.moveTo(cx, y0 + 54);
          x.bezierCurveTo(cx + dir * 24, y0 + 28, cx - dir * 10, y0 + 12, cx + dir * 16, y0 - 10);
          x.stroke();
        }
      }
    }
    // Glowing ember sparks / celestial motes drifting across the weave
    x.fillStyle = emberCol;
    for (let i = 0; i < 42; i++) {
      const ex = hash2(i, 2.3) * S, ey = hash2(i, 6.7) * S, r = 1.6 + hash2(i, 9.1) * 3.0;
      x.beginPath(); x.arc(ex, ey, r, 0, TAU); x.fill();
    }
  };

  let res: PBRMaps;
  if (theme === 'fire') {
    const map = makeTex(S, S, x => {
      const bg = x.createLinearGradient(0, 0, 0, S);
      bg.addColorStop(0, '#3a0a06'); bg.addColorStop(0.55, '#591108'); bg.addColorStop(1, '#8c1e0a');
      x.fillStyle = bg; x.fillRect(0, 0, S, S);
      x.fillStyle = 'rgba(255,190,110,0.05)';
      for (let y = 0; y < S; y += 4) x.fillRect(0, y, S, 1.5);
      drawFlameSilk(x, '#ffb838', 'rgba(255,78,16,0.48)', '#ffe88a', 2.4, 7.5);
    });
    const emissive = makeTex(S, S, x => {
      x.fillStyle = '#0e0200'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#ffaa28', 'rgba(255,66,10,0.55)', '#fff0a6', 2.8, 9.0);
    });
    const bump = makeTex(S, S, x => {
      x.fillStyle = '#686868'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#dcdcdc', '#989898', '#f0f0f0', 3.0, 7.0);
    }, false);
    const rough = makeTex(S, S, x => {
      x.fillStyle = '#9c9c9c'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#383838', '#686868', '#222222', 3.0, 7.0);
    }, false);
    res = { map, bump, rough, emissive };
  } else if (theme === 'whitefire') {
    const map = makeTex(S, S, x => {
      const bg = x.createLinearGradient(0, 0, 0, S);
      bg.addColorStop(0, '#d8e6f4'); bg.addColorStop(0.5, '#eef5fc'); bg.addColorStop(1, '#ffffff');
      x.fillStyle = bg; x.fillRect(0, 0, S, S);
      x.fillStyle = 'rgba(140,195,255,0.09)';
      for (let y = 0; y < S; y += 4) x.fillRect(0, y, S, 1.5);
      drawFlameSilk(x, '#ffffff', 'rgba(155,220,255,0.55)', '#ffffff', 2.6, 8.5);
    });
    const emissive = makeTex(S, S, x => {
      x.fillStyle = '#1b2736'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#ffffff', 'rgba(150,220,255,0.58)', '#ffffff', 3.0, 9.5);
    });
    const bump = makeTex(S, S, x => {
      x.fillStyle = '#707070'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#ececec', '#a8a8a8', '#ffffff', 3.0, 7.0);
    }, false);
    const rough = makeTex(S, S, x => {
      x.fillStyle = '#787878'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#1e1e1e', '#4c4c4c', '#141414', 3.0, 7.0);
    }, false);
    res = { map, bump, rough, emissive };
  } else if (theme === 'blackfire') {
    const map = makeTex(S, S, x => {
      const bg = x.createLinearGradient(0, 0, 0, S);
      bg.addColorStop(0, '#06060b'); bg.addColorStop(0.5, '#030306'); bg.addColorStop(1, '#010103');
      x.fillStyle = bg; x.fillRect(0, 0, S, S);
      x.fillStyle = 'rgba(255,255,255,0.022)';
      for (let y = 0; y < S; y += 5) x.fillRect(0, y, S, 1.2);
      drawFlameSilk(x, '#ffffff', 'rgba(205,232,255,0.30)', '#ffffff', 1.4, 3.8);
    });
    const emissive = makeTex(S, S, x => {
      x.fillStyle = '#000000'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#ffffff', 'rgba(200,232,255,0.36)', '#ffffff', 1.55, 4.2);
    });
    const bump = makeTex(S, S, x => {
      x.fillStyle = '#585858'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#e6e6e6', '#8a8a8a', '#ffffff', 2.4, 5.0);
    }, false);
    const rough = makeTex(S, S, x => {
      x.fillStyle = '#626262'; x.fillRect(0, 0, S, S);
      drawFlameSilk(x, '#161616', '#3c3c3c', '#101010', 2.4, 5.0);
    }, false);
    res = { map, bump, rough, emissive };
  } else {
    // 'neon': obsidian cyber-silk with sharp electric cyan & magenta glowing circuit geometry
    const drawNeonSilk = (x: CanvasRenderingContext2D, cyanMain: string, cyanSoft: string, magMain: string, magSoft: string) => {
      x.lineJoin = 'miter';
      const rows = 4, rh = S / rows;
      for (let r = 0; r < rows; r++) {
        const y0 = r * rh;
        const isMag = (r & 1) === 1;
        const mainC = isMag ? magMain : cyanMain;
        const softC = isMag ? magSoft : cyanSoft;
        for (const [lw, col] of [[6.5, softC], [2.2, mainC]] as const) {
          x.strokeStyle = col; x.lineWidth = lw;
          x.beginPath(); x.moveTo(0, y0 + 6); x.lineTo(S, y0 + 6); x.stroke();
          for (let c = 0; c < 4; c++) {
            const x0 = c * 128, cx = x0 + 64;
            x.beginPath();
            x.moveTo(x0 + 12, y0 + 22);
            x.lineTo(cx, y0 + 46);
            x.lineTo(x0 + 116, y0 + 22);
            x.moveTo(cx, y0 + 46);
            x.lineTo(cx, y0 + rh - 22);
            x.lineTo(x0 + 96, y0 + rh - 12);
            x.moveTo(cx, y0 + rh - 22);
            x.lineTo(x0 + 32, y0 + rh - 12);
            x.stroke();
          }
        }
        x.fillStyle = isMag ? cyanMain : magMain;
        for (let c = 0; c < 4; c++) {
          const cx = c * 128 + 64;
          x.beginPath(); x.arc(cx, y0 + 46, 3.6, 0, TAU); x.fill();
        }
      }
    };
    const map = makeTex(S, S, x => {
      const bg = x.createLinearGradient(0, 0, 0, S);
      bg.addColorStop(0, '#090d1a'); bg.addColorStop(0.5, '#060914'); bg.addColorStop(1, '#04060d');
      x.fillStyle = bg; x.fillRect(0, 0, S, S);
      x.fillStyle = 'rgba(100,220,255,0.035)';
      for (let y = 0; y < S; y += 6) x.fillRect(0, y, S, 1.5);
      drawNeonSilk(x, '#4cf5ff', 'rgba(0,225,255,0.34)', '#ff52d4', 'rgba(255,40,200,0.32)');
    });
    const emissive = makeTex(S, S, x => {
      x.fillStyle = '#000000'; x.fillRect(0, 0, S, S);
      drawNeonSilk(x, '#4cf5ff', 'rgba(0,225,255,0.44)', '#ff52d4', 'rgba(255,40,200,0.42)');
    });
    const bump = makeTex(S, S, x => {
      x.fillStyle = '#707070'; x.fillRect(0, 0, S, S);
      drawNeonSilk(x, '#f0f0f0', '#303030', '#f0f0f0', '#303030');
    }, false);
    const rough = makeTex(S, S, x => {
      x.fillStyle = '#505050'; x.fillRect(0, 0, S, S);
      drawNeonSilk(x, '#141414', '#2a2a2a', '#141414', '#2a2a2a');
    }, false);
    res = { map, bump, rough, emissive };
  }

  cachedSpecialRobeMaps.set(theme, res);
  return res;
}

// ------------------------------------------------------------ procedural PBR armor textures (512x512)

/** Sōhei: refined 6-tier lacquered kozane lamellar with braided silk odoshi, rivets, and hishinui knots */
function soheiLamellarMaps(l: NonNullable<Armor['look']>): PBRMaps {
  const S = 512, rows = 6, rh = S / rows, scales = 20, sw = S / scales;
  const map = makeTex(S, S, x => {
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // lacquered base plate gradient
      const g = x.createLinearGradient(0, y0, 0, y0 + rh);
      g.addColorStop(0, css(l.lame, 1.55));
      g.addColorStop(0.14, css(l.lame, 1.18));
      g.addColorStop(0.68, css(l.lame, 0.86));
      g.addColorStop(1, css(l.lame, 0.44));
      x.fillStyle = g;
      x.fillRect(0, y0, S, rh);

      // individual overlapping rounded kozane scales
      for (let s = 0; s < scales; s++) {
        const sx = s * sw;
        const sg = x.createLinearGradient(sx, y0, sx + sw, y0);
        sg.addColorStop(0, 'rgba(0,0,0,0.34)');
        sg.addColorStop(0.25, 'rgba(255,255,255,0.14)');
        sg.addColorStop(0.75, 'rgba(255,255,255,0.04)');
        sg.addColorStop(1, 'rgba(0,0,0,0.42)');
        x.fillStyle = sg;
        x.fillRect(sx, y0 + 4, sw, rh - 8);
        // subtle specular top bead on each scale
        x.fillStyle = css(l.lame, 1.8, 0.35);
        x.fillRect(sx + 2, y0 + 5, sw - 5, 2.5);
      }
      // deep overlap shadow under each tier
      const sh = x.createLinearGradient(0, y0 + rh - 10, 0, y0 + rh);
      sh.addColorStop(0, 'rgba(0,0,0,0)');
      sh.addColorStop(1, 'rgba(0,0,0,0.72)');
      x.fillStyle = sh;
      x.fillRect(0, y0 + rh - 10, S, 10);

      // top silk edge braid + metallic piping
      x.fillStyle = css(l.lace, 0.85);
      x.fillRect(0, y0, S, 5);
      x.fillStyle = css(l.metal, 1.1, 0.65);
      x.fillRect(0, y0 + 5, S, 2);

      // sugake odoshi paired braided silk cords
      for (let cx = 32; cx < S; cx += 64) {
        for (const dx of [-10, 4]) {
          const bx = cx + dx;
          x.fillStyle = css(l.lace, 0.96);
          x.fillRect(bx, y0 + 1, 9, rh - 5);
          // chevron braid weave
          x.fillStyle = css(l.lace, 0.5);
          for (let yy = y0 + 4; yy < y0 + rh - 6; yy += 7) {
            x.fillRect(bx, yy, 4, 2);
            x.fillRect(bx + 5, yy + 3, 4, 2);
          }
          x.fillStyle = css(l.lace, 1.45, 0.65);
          x.fillRect(bx + 2, y0 + 1, 2, rh - 6);
        }
      }
      // gilded rivet bosses on alternating tiers & hishinui cross-knots on bottom tier
      if (r === 0 || r === 3) {
        for (let cx = 0; cx < S; cx += 64) {
          const rg = x.createRadialGradient(cx - 1.5, y0 + rh * 0.45 - 1.5, 1, cx, y0 + rh * 0.45, 5.5);
          rg.addColorStop(0, css(l.metal, 1.7));
          rg.addColorStop(0.65, css(l.metal, 1.0));
          rg.addColorStop(1, css(l.metal, 0.35));
          x.fillStyle = rg;
          x.beginPath(); x.arc(cx, y0 + rh * 0.45, 5.5, 0, TAU); x.fill();
        }
      }
      if (r === rows - 1) {
        x.strokeStyle = css(l.lace, 1.2);
        x.lineWidth = 3.5;
        for (let cx = 16; cx < S; cx += 32) {
          const cy = y0 + rh * 0.68;
          x.beginPath();
          x.moveTo(cx - 7, cy - 6); x.lineTo(cx + 7, cy + 6);
          x.moveTo(cx + 7, cy - 6); x.lineTo(cx - 7, cy + 6);
          x.stroke();
        }
      }
    }
  });

  const bump = makeTex(S, S, x => {
    x.fillStyle = '#707070'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      const g = x.createLinearGradient(0, y0, 0, y0 + rh);
      g.addColorStop(0, '#c8c8c8'); g.addColorStop(0.82, '#888888'); g.addColorStop(1, '#242424');
      x.fillStyle = g; x.fillRect(0, y0, S, rh);
      for (let s = 0; s < scales; s++) {
        x.fillStyle = '#383838'; x.fillRect(s * sw, y0, 2, rh);
        x.fillStyle = '#dcdcdc'; x.fillRect(s * sw + 4, y0 + 5, sw - 9, 4);
      }
      for (let cx = 32; cx < S; cx += 64) {
        for (const dx of [-10, 4]) {
          x.fillStyle = '#e8e8e8'; x.fillRect(cx + dx, y0 + 1, 9, rh - 5);
          x.fillStyle = '#909090';
          for (let yy = y0 + 4; yy < y0 + rh - 6; yy += 7) x.fillRect(cx + dx, yy, 9, 2);
        }
      }
    }
  }, false);

  const rough = makeTex(S, S, x => {
    x.fillStyle = '#555555'; x.fillRect(0, 0, S, S); // glossy lacquer base
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      x.fillStyle = '#c8c8c8'; // matte silk cords
      x.fillRect(0, y0, S, 5);
      for (let cx = 32; cx < S; cx += 64) {
        x.fillRect(cx - 10, y0, 9, rh);
        x.fillRect(cx + 4, y0, 9, rh);
      }
    }
  }, false);

  return { map, bump, rough };
}

/** Xiákè: authentic interlocking Shanwenjia (山文甲 mountain-pattern scales) with gilt trim */
function xiaShanwenMaps(l: NonNullable<Armor['look']>): PBRMaps {
  const S = 512;
  const cols = 12, rows = 12, cw = S / cols, ch = S / rows;

  const drawScale = (
    x: CanvasRenderingContext2D, cx: number, cy: number,
    w: number, h: number, mode: 'diffuse' | 'bump' | 'rough'
  ) => {
    // Inverted-Y mountain-pattern scale (山文) with 3 crisp faceted arms
    x.save();
    x.translate(cx, cy);
    const armW = w * 0.23, topH = h * 0.56, legW = w * 0.52, legH = h * 0.48;
    x.beginPath();
    x.moveTo(-armW, -topH);
    x.lineTo(armW, -topH);
    x.lineTo(armW, -h * 0.06);
    x.lineTo(legW, legH * 0.52);
    x.lineTo(legW * 0.62, legH);
    x.lineTo(0, h * 0.28);
    x.lineTo(-legW * 0.62, legH);
    x.lineTo(-legW, legH * 0.52);
    x.lineTo(-armW, -h * 0.06);
    x.closePath();

    if (mode === 'diffuse') {
      const g = x.createLinearGradient(-legW, -topH, legW, legH);
      g.addColorStop(0, css(l.lame, 1.55));
      g.addColorStop(0.38, css(l.lame, 1.12));
      g.addColorStop(0.75, css(l.lame, 0.78));
      g.addColorStop(1, css(l.lame, 0.48));
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = css(l.lame, 0.28);
      x.lineWidth = 2.2;
      x.stroke();
      // central faceted metallic spine ridge
      x.strokeStyle = css(l.metal, 1.35, 0.55);
      x.lineWidth = 1.6;
      x.beginPath();
      x.moveTo(0, -topH + 3); x.lineTo(0, h * 0.12);
      x.moveTo(0, h * 0.12); x.lineTo(legW * 0.58, legH * 0.72);
      x.moveTo(0, h * 0.12); x.lineTo(-legW * 0.58, legH * 0.72);
      x.stroke();
      // central rivet pin
      x.fillStyle = css(l.metal, 1.45);
      x.beginPath(); x.arc(0, h * 0.08, 2.3, 0, TAU); x.fill();
    } else if (mode === 'bump') {
      const g = x.createLinearGradient(0, -topH, 0, legH);
      g.addColorStop(0, '#ededed');
      g.addColorStop(0.6, '#b0b0b0');
      g.addColorStop(1, '#585858');
      x.fillStyle = g;
      x.fill();
      x.strokeStyle = '#181818';
      x.lineWidth = 2.6;
      x.stroke();
      x.strokeStyle = '#ffffff';
      x.lineWidth = 2;
      x.beginPath();
      x.moveTo(0, -topH + 3); x.lineTo(0, h * 0.12);
      x.moveTo(0, h * 0.12); x.lineTo(legW * 0.55, legH * 0.68);
      x.moveTo(0, h * 0.12); x.lineTo(-legW * 0.55, legH * 0.68);
      x.stroke();
    } else {
      x.fillStyle = '#484848';
      x.fill();
      x.strokeStyle = '#b0b0b0';
      x.lineWidth = 2.4;
      x.stroke();
    }
    x.restore();
  };

  const renderPass = (mode: 'diffuse' | 'bump' | 'rough') => makeTex(S, S, x => {
    x.fillStyle = mode === 'diffuse' ? css(l.lace, 0.35) : mode === 'bump' ? '#242424' : '#b8b8b8';
    x.fillRect(0, 0, S, S);
    for (let r = -1; r <= rows; r++) {
      const off = (r & 1) ? cw * 0.5 : 0;
      for (let c = -1; c <= cols; c++) {
        drawScale(x, c * cw + off, r * ch + ch * 0.5, cw * 0.98, ch * 0.98, mode);
      }
    }
    // ornate horizontal silk-and-gold trim bands every 6 rows
    for (const bandY of [0, S * 0.5]) {
      if (mode === 'diffuse') {
        x.fillStyle = css(l.lace, 0.85);
        x.fillRect(0, bandY, S, 10);
        x.fillStyle = css(l.metal, 1.3);
        x.fillRect(0, bandY, S, 2.5);
        x.fillRect(0, bandY + 8, S, 2.5);
      } else if (mode === 'bump') {
        x.fillStyle = '#dcdcdc';
        x.fillRect(0, bandY, S, 10);
      } else {
        x.fillStyle = '#a8a8a8';
        x.fillRect(0, bandY, S, 10);
      }
    }
  }, mode === 'diffuse');

  return { map: renderPass('diffuse'), bump: renderPass('bump'), rough: renderPass('rough') };
}

/** Hwarang: Korean Dujeong-gap (studded silk-faced brigandine) + gilded Silla floral rivets & borders */
function hwarangBrigandineMaps(l: NonNullable<Armor['look']>): PBRMaps {
  const S = 512, rows = 8, rh = S / rows, cols = 8, cw = S / cols;

  const map = makeTex(S, S, x => {
    // rich woven silk-faced brigandine base
    const bg = x.createLinearGradient(0, 0, 0, S);
    bg.addColorStop(0, css(l.lame, 1.15));
    bg.addColorStop(0.5, css(l.lame, 0.95));
    bg.addColorStop(1, css(l.lame, 0.78));
    x.fillStyle = bg;
    x.fillRect(0, 0, S, S);

    // fine woven silk twill grain
    x.fillStyle = 'rgba(255,255,255,0.045)';
    for (let y = 0; y < S; y += 4) x.fillRect(0, y, S, 1.5);
    x.fillStyle = 'rgba(0,0,0,0.06)';
    for (let xx = 0; xx < S; xx += 6) x.fillRect(xx, 0, 1.5, S);

    // quilted rectangular internal iron plate outlines + domed brass dujeong studs
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      // subtle internal plate bevel
      const pg = x.createLinearGradient(0, y0, 0, y0 + rh);
      pg.addColorStop(0, 'rgba(255,255,255,0.14)');
      pg.addColorStop(0.18, 'rgba(255,255,255,0.03)');
      pg.addColorStop(0.82, 'rgba(0,0,0,0.06)');
      pg.addColorStop(1, 'rgba(0,0,0,0.36)');
      x.fillStyle = pg;
      x.fillRect(0, y0, S, rh);

      // horizontal quilted stitching seam
      x.fillStyle = css(l.lace, 0.75, 0.7);
      x.fillRect(0, y0, S, 2.5);

      for (let c = 0; c < cols; c++) {
        const cx = (c + 0.5) * cw + (r % 2 ? cw * 0.5 : 0);
        const cy = y0 + rh * 0.52;
        const drawBoss = (bx: number) => {
          // recessed silk dimple shadow around stud
          x.fillStyle = 'rgba(0,0,0,0.45)';
          x.beginPath(); x.arc(bx, cy + 1.5, 9.5, 0, TAU); x.fill();
          // decorative 5-petal floral washer
          x.fillStyle = css(l.metal, 0.85);
          for (let p = 0; p < 5; p++) {
            const a = p * TAU / 5 - Math.PI / 2;
            x.beginPath(); x.arc(bx + Math.cos(a) * 5.2, cy + Math.sin(a) * 5.2, 3.3, 0, TAU); x.fill();
          }
          // gleaming domed boss center
          const rg = x.createRadialGradient(bx - 2, cy - 2, 1, bx, cy, 5.8);
          rg.addColorStop(0, css(l.metal, 1.85));
          rg.addColorStop(0.55, css(l.metal, 1.12));
          rg.addColorStop(1, css(l.metal, 0.42));
          x.fillStyle = rg;
          x.beginPath(); x.arc(bx, cy, 5.8, 0, TAU); x.fill();
        };
        drawBoss(cx % S);
        if (cx > S - 16) drawBoss(cx - S);
      }
    }
    // gilded decorative border band at bottom of repeat
    const by = S - 24;
    x.fillStyle = css(l.lace, 0.88);
    x.fillRect(0, by, S, 24);
    x.fillStyle = css(l.metal, 1.3);
    x.fillRect(0, by, S, 3);
    x.fillRect(0, by + 21, S, 3);
    // Silla scrollwork dots along border
    x.fillStyle = css(l.metal, 1.45);
    for (let xx = 16; xx < S; xx += 32) {
      x.beginPath(); x.arc(xx, by + 12, 3.5, 0, TAU); x.fill();
    }
  });

  const bump = makeTex(S, S, x => {
    x.fillStyle = '#787878'; x.fillRect(0, 0, S, S);
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      const pg = x.createLinearGradient(0, y0, 0, y0 + rh);
      pg.addColorStop(0, '#a8a8a8'); pg.addColorStop(0.88, '#808080'); pg.addColorStop(1, '#343434');
      x.fillStyle = pg; x.fillRect(0, y0, S, rh);
      for (let c = 0; c < cols; c++) {
        const cx = ((c + 0.5) * cw + (r % 2 ? cw * 0.5 : 0)) % S;
        const cy = y0 + rh * 0.52;
        const rg = x.createRadialGradient(cx, cy, 1, cx, cy, 9.5);
        rg.addColorStop(0, '#ffffff');
        rg.addColorStop(0.58, '#d4d4d4');
        rg.addColorStop(0.85, '#303030');
        rg.addColorStop(1, '#787878');
        x.fillStyle = rg;
        x.beginPath(); x.arc(cx, cy, 9.5, 0, TAU); x.fill();
      }
    }
  }, false);

  const rough = makeTex(S, S, x => {
    x.fillStyle = '#b4b4b4'; x.fillRect(0, 0, S, S); // matte silk fabric
    for (let r = 0; r < rows; r++) {
      const y0 = r * rh;
      for (let c = 0; c < cols; c++) {
        const cx = ((c + 0.5) * cw + (r % 2 ? cw * 0.5 : 0)) % S;
        const cy = y0 + rh * 0.52;
        x.fillStyle = '#262626'; // shiny metal bosses
        x.beginPath(); x.arc(cx, cy, 7.5, 0, TAU); x.fill();
      }
    }
    x.fillStyle = '#383838';
    x.fillRect(0, S - 24, S, 3);
    x.fillRect(0, S - 3, S, 3);
  }, false);

  return { map, bump, rough };
}

/** Rich woven brocade patchwork for Sōhei's kesa (grayscale-tinted so it takes any armor or look colour) */
export const brocadeKesaTex = makeTex(256, 512, (x, w, h) => {
  x.fillStyle = '#525252'; x.fillRect(0, 0, w, h);
  const cols = 3, rows = 8, pw = w / cols, ph = h / rows;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = 166 + ((r * 7 + c * 13) % 5) * 16;
      const px = c * pw + 4, py = r * ph + 4, rw = pw - 8, rh = ph - 8;
      x.fillStyle = `rgb(${v},${v},${v})`;
      x.fillRect(px, py, rw, rh);
      // fine diagonal silk weave
      x.strokeStyle = 'rgba(255,255,255,0.12)';
      x.lineWidth = 1;
      for (let d = -rh; d < rw + rh; d += 8) {
        x.beginPath(); x.moveTo(px + d, py); x.lineTo(px + d - 12, py + rh); x.stroke();
      }
      // subtle lotus medallion in each patch
      const cx = px + rw * 0.5, cy = py + rh * 0.5;
      x.strokeStyle = 'rgba(255,255,255,0.34)';
      x.lineWidth = 1.6;
      x.beginPath(); x.arc(cx, cy, Math.min(rw, rh) * 0.24, 0, TAU); x.stroke();
      for (let p = 0; p < 6; p++) {
        const a = p * TAU / 6;
        x.beginPath();
        x.arc(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, 4.5, 0, TAU);
        x.stroke();
      }
    }
  }
  // bright brocade borders along both edges
  x.fillStyle = '#f5f5f5';
  x.fillRect(0, 0, 7, h); x.fillRect(w - 7, 0, 7, h);
  x.fillStyle = '#9a9a9a';
  x.fillRect(7, 0, 3, h); x.fillRect(w - 10, 0, 3, h);
});

/** Cloud-damask silk texture for Xiákè's hanfu & trims */
export const cloudSilkTex = makeTex(256, 256, (x, w, h) => {
  x.fillStyle = '#d4d4d4'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(255,255,255,0.09)';
  for (let y = 0; y < h; y += 4) x.fillRect(0, y, w, 1.5);
  // swirling auspicious clouds (祥云)
  x.strokeStyle = 'rgba(255,255,255,0.32)';
  x.lineWidth = 2.2;
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cx = (c + (r % 2 ? 0.5 : 0)) * 64 + 24, cy = r * 64 + 32;
      x.beginPath();
      x.arc(cx - 10, cy, 9, Math.PI * 0.6, Math.PI * 2.1);
      x.arc(cx + 2, cy - 5, 11, Math.PI * 1.1, Math.PI * 2.2);
      x.arc(cx + 14, cy + 1, 7, Math.PI * 1.3, Math.PI * 0.7);
      x.stroke();
    }
  }
});

/** Plum-blossom (maehwa) damask silk texture for Hwarang's dopo & trims */
export const plumSilkTex = makeTex(256, 256, (x, w, h) => {
  x.fillStyle = '#d8d8d8'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(0,0,0,0.06)';
  for (let xx = 0; xx < w; xx += 5) x.fillRect(xx, 0, 1.2, h);
  x.fillStyle = 'rgba(255,255,255,0.28)';
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      const cx = (c + (r % 2 ? 0.5 : 0)) * 64 + 28, cy = r * 64 + 30;
      for (let p = 0; p < 5; p++) {
        const a = p * TAU / 5 - Math.PI / 2;
        x.beginPath();
        x.arc(cx + Math.cos(a) * 7.5, cy + Math.sin(a) * 7.5, 4.8, 0, TAU);
        x.fill();
      }
      x.fillStyle = 'rgba(210,210,210,0.6)';
      x.beginPath(); x.arc(cx, cy, 3.2, 0, TAU); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.28)';
    }
  }
});

/** Embossed bronze/gold Huxinjing (护心镜 heart-protecting mirror) disc for Xiákè */
function xiaMirrorTex(l: NonNullable<Armor['look']>) {
  return makeTex(256, 256, (x, w, h) => {
    const cx = w / 2, cy = h / 2;
    const bg = x.createRadialGradient(cx - 22, cy - 22, 12, cx, cy, 124);
    bg.addColorStop(0, css(l.metal, 1.75));
    bg.addColorStop(0.55, css(l.metal, 1.15));
    bg.addColorStop(0.84, css(l.metal, 0.75));
    bg.addColorStop(1, css(l.metal, 0.35));
    x.fillStyle = bg;
    x.beginPath(); x.arc(cx, cy, 124, 0, TAU); x.fill();
    // outer engraved cloud ring
    x.strokeStyle = css(l.lame, 0.7);
    x.lineWidth = 6;
    x.beginPath(); x.arc(cx, cy, 108, 0, TAU); x.stroke();
    x.strokeStyle = css(l.metal, 1.55);
    x.lineWidth = 3;
    x.beginPath(); x.arc(cx, cy, 94, 0, TAU); x.stroke();
    // 16 raised pearl beads around rim
    x.fillStyle = css(l.metal, 1.8);
    for (let i = 0; i < 16; i++) {
      const a = i * TAU / 16;
      x.beginPath(); x.arc(cx + Math.cos(a) * 101, cy + Math.sin(a) * 101, 4.2, 0, TAU); x.fill();
    }
    // lacquered accent ring
    x.strokeStyle = css(l.lace, 0.95);
    x.lineWidth = 5;
    x.beginPath(); x.arc(cx, cy, 82, 0, TAU); x.stroke();
    // mirror sheen highlight
    const sheen = x.createRadialGradient(cx - 26, cy - 28, 4, cx - 16, cy - 18, 60);
    sheen.addColorStop(0, 'rgba(255,255,255,0.68)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = sheen;
    x.beginPath(); x.arc(cx, cy, 76, 0, TAU); x.fill();
  }, true, false);
}

/** Embossed Silla royal plum-blossom medallion for Hwarang */
function hwarangCrestTex(l: NonNullable<Armor['look']>) {
  return makeTex(256, 256, (x, w, h) => {
    const cx = w / 2, cy = h / 2;
    x.fillStyle = css(l.lame, 0.55);
    x.beginPath(); x.arc(cx, cy, 124, 0, TAU); x.fill();
    x.strokeStyle = css(l.metal, 1.35);
    x.lineWidth = 10;
    x.beginPath(); x.arc(cx, cy, 114, 0, TAU); x.stroke();
    x.strokeStyle = css(l.lace, 1.0);
    x.lineWidth = 5;
    x.beginPath(); x.arc(cx, cy, 98, 0, TAU); x.stroke();
    // 5-petal royal maehwa flower
    for (let p = 0; p < 5; p++) {
      const a = p * TAU / 5 - Math.PI / 2;
      const px = cx + Math.cos(a) * 44, py = cy + Math.sin(a) * 44;
      const pg = x.createRadialGradient(px - 6, py - 6, 4, px, py, 34);
      pg.addColorStop(0, css(l.metal, 1.8));
      pg.addColorStop(0.7, css(l.metal, 1.1));
      pg.addColorStop(1, css(l.metal, 0.55));
      x.fillStyle = pg;
      x.beginPath(); x.arc(px, py, 32, 0, TAU); x.fill();
    }
    // crimson/lace center stamen ring
    x.fillStyle = css(l.lace, 1.15);
    x.beginPath(); x.arc(cx, cy, 22, 0, TAU); x.fill();
    x.fillStyle = css(l.metal, 1.85);
    x.beginPath(); x.arc(cx, cy, 10, 0, TAU); x.fill();
  }, true, false);
}

// ------------------------------------------------------------ anatomical sculpted geometry builders

interface TorsoSpec {
  /** width multiplier at chest / shoulders */
  chestW: number;
  /** width multiplier at waist (smaller = stronger V-taper) */
  waistW: number;
  /** depth multiplier (z) */
  depth: number;
  /** subtle pectoral fullness (+z) */
  pecSwell: number;
  /** subtle front belly dip at lower hem */
  hemDip: number;
  /** lower front neckline cutout */
  neckDip: number;
}

/**
 * Anatomically contoured torso cuirass shell in rigChest local space (+z front, +y up, +x left).
 * Replaces a plain squashed cylinder with sculpted pectorals, waist taper, lumbar back hollow,
 * collarbone slope, and overlapping front hem so armor fits the figure cleanly with zero gaps.
 */
export function buildContouredTorso(spec: TorsoSpec, radialSegs = 48): THREE.BufferGeometry {
  // 13 vertical rings from waist overlap (-0.268) to neck/collar (+0.256)
  const rings: [number, number, number, number][] = [
    // [y, rx, rz, pecWeight]
    [-0.268, 0.178 * spec.waistW, 0.130 * spec.depth, -0.04],
    [-0.220, 0.174 * spec.waistW, 0.126 * spec.depth, -0.06],
    [-0.165, 0.179 * spec.waistW, 0.130 * spec.depth, -0.02],
    [-0.100, 0.194 * (spec.waistW * 0.6 + spec.chestW * 0.4), 0.140 * spec.depth, 0.15],
    [-0.035, 0.212 * (spec.waistW * 0.3 + spec.chestW * 0.7), 0.153 * spec.depth, 0.45],
    [0.030,  0.225 * spec.chestW, 0.163 * spec.depth, 0.85],
    [0.090,  0.228 * spec.chestW, 0.165 * spec.depth, 1.00],
    [0.145,  0.218 * spec.chestW, 0.156 * spec.depth, 0.78],
    [0.192,  0.192 * spec.chestW, 0.138 * spec.depth, 0.35],
    [0.228,  0.155 * spec.chestW, 0.114 * spec.depth, 0.08],
    [0.256,  0.114 * spec.chestW, 0.092 * spec.depth, 0.00],
  ];
  const rows = rings.length;
  const stride = radialSegs + 1;
  const pos = new Float32Array(rows * stride * 3);
  const uv = new Float32Array(rows * stride * 2);

  for (let i = 0; i < rows; i++) {
    const [baseY, rx, rz, pec] = rings[i];
    const v = i / (rows - 1);
    const botFactor = Math.max(0, 1 - v * 3.5);
    const topFactor = Math.max(0, (v - 0.78) / 0.22);

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const th = u * TAU; // 0 = +z (front), PI/2 = +x (left), PI = -z (back)
      const sx = Math.sin(th), cz = Math.cos(th);
      const ax = Math.abs(sx);

      // slightly squared athletic ribcage (superellipse)
      const sq = 1 + 0.065 * (ax * Math.abs(cz) * 2.0) * (0.4 + 0.6 * Math.max(0, pec));
      let x = sx * rx * sq;
      let z = cz * rz * sq;

      // anatomical front chest swell + subtle sternum contour
      if (cz > 0 && pec > 0) {
        const chestArch = Math.pow(cz, 1.5);
        const pecSide = Math.sin(Math.min(1, ax * 1.45) * Math.PI);
        z += spec.pecSwell * pec * chestArch * (0.7 + 0.35 * pecSide);
      }
      // anatomical lumbar hollow in lower back (-z) so armor hugs the spine
      if (cz < 0 && baseY < 0.04 && baseY > -0.23) {
        const lumbar = Math.sin(((baseY + 0.23) / 0.27) * Math.PI);
        z += 0.011 * lumbar * Math.pow(-cz, 2.2);
      }
      // contoured front neckline dip + slight nape rise, and gentle front belly hem dip
      let y = baseY;
      if (topFactor > 0) y -= spec.neckDip * topFactor * cz;
      if (botFactor > 0 && cz > 0) y -= spec.hemDip * botFactor * Math.pow(cz, 1.6);

      const idx = i * stride + j;
      pos[idx * 3] = x;
      pos[idx * 3 + 1] = y;
      pos[idx * 3 + 2] = z;
      uv[idx * 2] = u;
      uv[idx * 2 + 1] = v;
    }
  }
  const indices: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j, b = a + stride, c = b + 1, d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/** Curved tube along an elliptical arc in the xz plane */
export function ellipseArcTube(
  rx: number, rz: number, y: number, th0: number, len: number, tube: number, mat: THREE.Material, segs = 28
) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = th0 + len * (i / segs);
    pts.push(new V(Math.sin(t) * rx, y, Math.cos(t) * rz));
  }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), segs, tube, 6, len >= TAU - 0.01), mat);
}

/**
 * Sculpted anatomical shoulder pauldron that cups the deltoid smoothly at the top (curving inward
 * over the shoulder joint) and tapers in overlapping armored tiers down the upper arm.
 */
function buildSculptedPauldron(
  style: NewClassId,
  sodeScale: number,
  armorMat: THREE.Material,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material,
  tier: number
): THREE.Group {
  const g = new THREE.Group();
  const tiers = style === 'xia' ? (tier >= 2.2 ? 3 : 2) : (tier >= 2.0 ? 3 : 2);
  const baseW = (style === 'xia' ? 0.145 : style === 'hwarang' ? 0.16 : 0.155) + 0.024 * sodeScale;
  const totalH = (style === 'xia' ? 0.145 : 0.155) + 0.042 * sodeScale;
  const Rc = 0.118;
  const off = 0.068;

  // 1. Upper cupped deltoid dome cap (hugs the top of the shoulder so it never floats)
  const capSegsU = 14, capSegsV = 6;
  const capGeo = new THREE.BufferGeometry();
  const capPos: number[] = [], capUv: number[] = [], capIdx: number[] = [];
  const capTh = (baseW * 1.04) / Rc;
  const capH = totalH * 0.44;
  for (let iv = 0; iv <= capSegsV; iv++) {
    const v = iv / capSegsV; // 0 = top inward cup, 1 = lower rim of cap
    // curve smoothly inward at top toward the collarbone/neck
    const inward = Math.pow(1 - v, 1.85) * 0.042;
    const rCur = Rc * (0.86 + 0.16 * Math.sin(v * Math.PI * 0.62));
    const yCur = 0.066 - v * capH;
    const span = capTh * (0.76 + 0.24 * v);
    for (let iu = 0; iu <= capSegsU; iu++) {
      const u = iu / capSegsU;
      const th = (u - 0.5) * span;
      const x = Math.sin(th) * rCur;
      const z = Math.cos(th) * rCur + (off - Rc) - inward;
      // subtle lotus/scallop point at center of lower edge for xiákè & hwarang
      const point = (style === 'xia' ? 0.018 : style === 'hwarang' ? 0.012 : 0) * v * Math.cos(th / (span * 0.5) * Math.PI * 0.5);
      capPos.push(x, yCur - point, z);
      capUv.push(u * 1.2, v * 0.6);
    }
  }
  const stride = capSegsU + 1;
  for (let iv = 0; iv < capSegsV; iv++) {
    for (let iu = 0; iu < capSegsU; iu++) {
      const a = iv * stride + iu, b = a + stride, c = b + 1, d = a + 1;
      capIdx.push(a, d, b, b, d, c);
    }
  }
  capGeo.setAttribute('position', new THREE.Float32BufferAttribute(capPos, 3));
  capGeo.setAttribute('uv', new THREE.Float32BufferAttribute(capUv, 2));
  capGeo.setIndex(capIdx);
  capGeo.computeVertexNormals();
  g.add(new THREE.Mesh(capGeo, style === 'hwarang' ? armorMat : lacquerMat));

  // gilded upper rim & shoulder crest ridge
  const topRim = ellipseArcTube(Rc * 0.96, Rc * 0.96, 0.056, -capTh * 0.42, capTh * 0.84, 0.0055, metalMat, 16);
  topRim.position.z = off - Rc - 0.022;
  g.add(topRim);

  // central embossed shoulder boss (beast-head/lotus crest on xiákè, floral boss on hwarang, kanmuri stud on sōhei)
  if (tier >= 1.5) {
    const boss = new THREE.Mesh(new THREE.SphereGeometry(style === 'xia' ? 0.022 : 0.018, 12, 8), metalMat);
    boss.scale.set(1.15, 0.85, 0.55);
    boss.position.set(0, 0.032, off + 0.002);
    g.add(boss);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(style === 'xia' ? 0.024 : 0.02, 0.0035, 6, 18), laceMat);
    ring.position.set(0, 0.032, off + 0.004);
    g.add(ring);
  }

  // 2. Overlapping tiered armored lames below the deltoid cap
  const lameH = (totalH * 0.66) / tiers;
  for (let t = 0; t < tiers; t++) {
    const f0 = t / tiers;
    const rTop = Rc * (1.0 + f0 * 0.045);
    const rBot = rTop + 0.008;
    const th = (baseW * (0.98 - f0 * 0.06)) / rTop;
    const yCenter = 0.066 - capH * 0.86 - t * (lameH * 0.82) - lameH * 0.45;
    const panel = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, lameH, 12, 1, true, -th / 2, th), armorMat);
    panel.position.set(0, yCenter, off - Rc);
    g.add(panel);
    const hem = ellipseArcTube(rBot + 0.002, rBot + 0.002, yCenter - lameH * 0.5, -th / 2, th, t === tiers - 1 ? 0.005 : 0.0032, metalMat, 14);
    hem.position.z = off - Rc;
    g.add(hem);
  }

  return g;
}

/**
 * Fitted forearm vambrace (kote / hubi / tohsu) oriented along the forearm bone from elbow to wrist.
 */
export function buildForearmVambrace(
  len: number,
  armorMat: THREE.Material,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material,
  tier: number
): THREE.Group {
  const g = new THREE.Group();
  const h = len * 0.72;
  // tapered sleeve guard hugging cleanly outside the mocap forearm sleeve
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.068, 0.053, h, 16, 1, true), armorMat);
  g.add(sleeve);
  // raised dorsal splint plate along the outer forearm
  const splint = new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.057, h * 0.88, 12, 1, true, -0.85, 1.7), lacquerMat);
  g.add(splint);
  // gilded wrist & elbow cuffs
  for (const [y, r, thick] of [[h * 0.48, 0.069, 0.005], [-h * 0.48, 0.054, 0.0055]] as const) {
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(r, thick, 6, 22), metalMat);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = y; g.add(cuff);
  }
  // silk binding band mid-forearm
  const bind = new THREE.Mesh(new THREE.TorusGeometry(0.062, 0.0045, 5, 20), laceMat);
  bind.rotation.x = Math.PI / 2; g.add(bind);
  if (tier >= 2.2) {
    // gilded ridge strip along dorsal splint
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.009, h * 0.82, 0.009), metalMat);
    ridge.position.set(0, 0, 0.066);
    g.add(ridge);
  }
  return g;
}

/**
 * Contoured shin greave with sculpted domed kneecap (tateage / knee-cop) and ankle guard.
 */
export function buildContouredGreave(
  len: number,
  armorMat: THREE.Material,
  lacquerMat: THREE.Material,
  metalMat: THREE.Material,
  laceMat: THREE.Material
): THREE.Group {
  const g = new THREE.Group();
  const h = len * 0.66;
  // main contoured shin plate sized cleanly outside the baggy hakama/baji trousers
  const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.088, 0.069, h, 16, 1, true, -1.4, 2.8), armorMat);
  g.add(shin);
  // central protective vertical ridge + side splints
  for (const [ang, w] of [[0, 0.016], [-0.75, 0.012], [0.75, 0.012]] as const) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(w, h * 0.94, 0.010), ang === 0 ? metalMat : lacquerMat);
    s.position.set(Math.sin(ang) * 0.081, 0, Math.cos(ang) * 0.081);
    s.rotation.y = ang;
    g.add(s);
  }
  // sculpted domed kneecap above the shin guard
  const knee = new THREE.Mesh(new THREE.SphereGeometry(0.060, 14, 10, -Math.PI * 0.45, Math.PI * 0.9, Math.PI * 0.2, Math.PI * 0.65), lacquerMat);
  knee.scale.set(1.02, 1.15, 0.88);
  knee.position.set(0, h * 0.56, 0.036);
  g.add(knee);
  const kneeRim = new THREE.Mesh(new THREE.TorusGeometry(0.052, 0.005, 6, 18), metalMat);
  kneeRim.position.set(0, h * 0.56, 0.070);
  g.add(kneeRim);
  // lacing cords top & bottom
  for (const [y, r] of [[h * 0.46, 0.089], [-h * 0.46, 0.071]] as const) {
    g.add(ellipseArcTube(r, r, y, -1.4, 2.8, 0.006, laceMat, 16));
  }
  return g;
}

/**
 * Custom sculpted curved tasset panel (waist armor skirt piece) with optional pointed/scalloped hem.
 */
export function buildTassetPanel(
  rTop: number, rBot: number, h: number, th0: number, span: number,
  pointDrop: number, mat: THREE.Material
): THREE.Mesh {
  const segsU = 10, segsV = 5;
  const pos: number[] = [], uv: number[] = [], idx: number[] = [];
  for (let iv = 0; iv <= segsV; iv++) {
    const v = iv / segsV; // 0 = top, 1 = bottom
    const r = THREE.MathUtils.lerp(rTop, rBot, v);
    const yBase = (0.5 - v) * h;
    for (let iu = 0; iu <= segsU; iu++) {
      const u = iu / segsU;
      const th = th0 + u * span;
      const center = Math.sin(u * Math.PI); // 1 at middle of panel, 0 at edges
      const y = yBase - pointDrop * v * center;
      pos.push(Math.sin(th) * r, y, Math.cos(th) * r);
      uv.push(u, 1 - v);
    }
  }
  const stride = segsU + 1;
  for (let iv = 0; iv < segsV; iv++) {
    for (let iu = 0; iu < segsU; iu++) {
      const a = iv * stride + iu, b = a + stride, c = b + 1, d = a + 1;
      idx.push(a, d, b, b, d, c);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return new THREE.Mesh(geo, mat);
}

// ------------------------------------------------------------ shared material factory per armor + class
function makeClassMaterials(cls: NewClassId, a: Armor) {
  const l = a.look!, glow = l.glow ?? 0.06, isNeon = l.neon !== undefined;
  const pbr = isNeon
    ? (a.id === 'fuego-negro' ? blackFirePlateMaps() : tronPlateMaps(l.neon))
    : cls === 'sohei' ? soheiLamellarMaps(l) : cls === 'xia' ? xiaShanwenMaps(l) : hwarangBrigandineMaps(l);
  const normalTex = heightToNormalTex(pbr.bump.image as HTMLCanvasElement, cls === 'xia' ? 2.6 : 2.3);
  const isClothFaced = !isNeon && cls === 'hwarang';
  const lacPbr = urushiLacquerPBR();
  const metPbr = forgedMetalPBR();
  const silkPbr = braidedSilkPBR();

  const patterned = (rx: number, ry: number) => {
    const map = pbr.map.clone(); map.repeat.set(rx, ry); map.needsUpdate = true;
    const norm = normalTex.clone(); norm.repeat.set(rx, ry); norm.needsUpdate = true;
    const rough = pbr.rough.clone(); rough.repeat.set(rx, ry); rough.needsUpdate = true;
    const em = pbr.emissive ? pbr.emissive.clone() : null;
    if (em) { em.repeat.set(rx, ry); em.needsUpdate = true; }
    return new THREE.MeshPhysicalMaterial({
      map,
      normalMap: norm,
      normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: rough,
      roughness: isNeon ? 0.24 : isClothFaced ? 0.66 : 0.36,
      metalness: isNeon ? 0.62 : cls === 'xia' ? 0.62 : isClothFaced ? 0.24 : 0.34,
      clearcoat: isNeon ? 0.72 : isClothFaced ? 0.14 : 0.84,
      clearcoatRoughness: 0.15,
      emissiveMap: em,
      emissive: em ? l.neon! : 0x000000,
      emissiveIntensity: em ? 2.3 : 0,
      side: THREE.DoubleSide
    });
  };
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: l.lame,
    normalMap: lacPbr.normal,
    normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: lacPbr.rough,
    roughness: isNeon ? 0.22 : 0.30,
    metalness: isNeon ? 0.56 : cls === 'xia' ? 0.44 : 0.28,
    clearcoat: isNeon ? 0.75 : 0.90,
    clearcoatRoughness: 0.13,
    emissive: l.lame,
    emissiveIntensity: isNeon ? 0.04 : Math.min(0.08, glow * 0.35),
    side: THREE.DoubleSide
  });
  const metal = new THREE.MeshPhysicalMaterial({
    color: isNeon ? l.neon! : l.metal,
    normalMap: isNeon ? null : metPbr.normal,
    normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: isNeon ? null : metPbr.rough,
    roughness: isNeon ? 0.12 : 0.26,
    metalness: isNeon ? 0.18 : 0.94,
    clearcoat: isNeon ? 0.2 : 0.38,
    clearcoatRoughness: 0.18,
    emissive: isNeon ? l.neon! : l.metal,
    emissiveIntensity: isNeon ? 2.4 : Math.max(0.14, glow * 0.9),
    side: THREE.DoubleSide
  });
  if (isNeon) metal.userData.noGlyphs = true;
  const lace = new THREE.MeshPhysicalMaterial({
    color: isNeon ? 0xdceeff : l.lace,
    normalMap: isNeon ? null : silkPbr.normal,
    normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: isNeon ? 0.2 : 0.86,
    metalness: 0.0,
    clearcoat: 0.0,
    emissive: isNeon ? l.neon! : l.lace,
    emissiveIntensity: isNeon ? 1.55 : 0.09,
    side: THREE.DoubleSide
  });
  if (isNeon) lace.userData.noGlyphs = true;
  const silk = (color: number, tex: THREE.Texture, rx = 2, ry = 2) => {
    const t = tex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true;
    return new THREE.MeshPhysicalMaterial({
      color,
      map: t,
      normalMap: silkPbr.normal,
      normalScale: new THREE.Vector2(0.45, 0.45),
      roughness: 0.82,
      metalness: 0.0,
      sheen: 0.5,
      sheenRoughness: 0.45,
      emissive: color,
      emissiveIntensity: 0.08,
      side: THREE.DoubleSide
    });
  };
  return { patterned, lacquer, metal, lace, silk, l, glow, isNeon };
}

// ------------------------------------------------------------ main builder for all 3 new classes

export function buildClassArmor(cls: NewClassId, setId: string, a: Armor, ctx: ArmorBuildCtx) {
  const { patterned, lacquer, metal, lace, silk, l, isNeon } = makeClassMaterials(cls, a);
  const { P, rigChest, rigWaist, overlay, hang, bones } = ctx;
  const hips = P('Hips');

  // ---- 1. ANATOMICAL TORSO CUIRASS (rigChest)
  if (rigChest) {
    const g = new THREE.Group();
    g.name = `${cls}-cuirass-${a.id}`;

    const torsoSpec: TorsoSpec =
      cls === 'xia'
        ? { chestW: 1.01, waistW: 0.93, depth: 0.96, pecSwell: 0.013, hemDip: 0.022, neckDip: 0.022 }
        : cls === 'hwarang'
          ? { chestW: 1.02, waistW: 0.96, depth: 0.98, pecSwell: 0.011, hemDip: 0.018, neckDip: 0.020 }
          : { chestW: 1.04, waistW: 0.99, depth: 1.00, pecSwell: 0.012, hemDip: 0.016, neckDip: 0.015 };

    const torsoGeo = buildContouredTorso(torsoSpec);
    const repeatX = cls === 'xia' ? 4.5 : cls === 'hwarang' ? 3.5 : 5.0;
    const repeatY = cls === 'xia' ? 2.2 : cls === 'hwarang' ? 1.8 : 1.5;
    g.add(new THREE.Mesh(torsoGeo, patterned(repeatX, repeatY)));

    // Fitted armored collar / gorget rim framing the neck smoothly
    const collarRim = ellipseArcTube(0.118 * torsoSpec.chestW, 0.096 * torsoSpec.depth, 0.252, 0, TAU, 0.0065, metal, 32);
    g.add(collarRim);
    // Lower cuirass gilded rim overlapping the waist belt cleanly
    const botRim = ellipseArcTube(0.181 * torsoSpec.waistW, 0.132 * torsoSpec.depth, -0.264, 0, TAU, 0.0055, metal, 36);
    g.add(botRim);

    // Shoulder straps (watagami / shoulder yokes) contoured to the trapezius slope
    for (const s of [-1, 1]) {
      const strapCurve = new THREE.CatmullRomCurve3([
        new V(0.105 * s, 0.165, 0.138 * torsoSpec.depth),
        new V(0.118 * s, 0.236, 0.055),
        new V(0.118 * s, 0.244, -0.045),
        new V(0.105 * s, 0.172, -0.132 * torsoSpec.depth),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(strapCurve, 18, 0.013, 6), lacquer));
      if (isNeon) {
        const edge = new THREE.Mesh(new THREE.TubeGeometry(strapCurve, 18, 0.0042, 5), metal);
        edge.position.set(0.012 * s, 0.006, 0);
        g.add(edge);
      }
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), metal);
      stud.position.set(0.105 * s, 0.178, 0.145 * torsoSpec.depth);
      g.add(stud);
    }

    // TRON-style twin glowing front circuit rails + luminous Identity Disc mounted on the upper back
    if (isNeon) {
      for (const s of [-1, 1]) {
        const rail = new THREE.CatmullRomCurve3([
          new V(0.072 * s, 0.228, 0.114 * torsoSpec.depth),
          new V(0.095 * s, 0.115, 0.168 * torsoSpec.depth),
          new V(0.076 * s, -0.045, 0.156 * torsoSpec.depth),
          new V(0.068 * s, -0.245, 0.132 * torsoSpec.depth)
        ]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(rail, 22, 0.0042, 5), metal));
      }
      const discGrp = new THREE.Group();
      discGrp.position.set(0, 0.095, -0.168 * torsoSpec.depth);
      discGrp.rotation.x = 0.08;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.012, 32), lacquer);
      core.rotation.x = Math.PI / 2;
      discGrp.add(core);
      const outerRing = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.007, 8, 36), metal);
      outerRing.position.z = -0.004;
      discGrp.add(outerRing);
      const innerRing = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0045, 6, 32), lace);
      innerRing.position.z = -0.006;
      discGrp.add(innerRing);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.018, 6, 36), new THREE.MeshBasicMaterial({
        color: 0xdcf0ff, transparent: true, opacity: 0.34, depthWrite: false, blending: THREE.AdditiveBlending
      }));
      halo.position.z = -0.006;
      halo.castShadow = halo.receiveShadow = false;
      discGrp.add(halo);
      g.add(discGrp);
    }

    // ---- CLASS-SPECIFIC TORSO SIGNATURE ELEMENTS
    if (cls === 'sohei') {
      // High lacquered nodowa (throat guard) that meets the hood cowl with zero gap
      const nodowa = new THREE.Mesh(new THREE.CylinderGeometry(0.112, 0.148, 0.048, 28, 1, true), lacquer);
      nodowa.scale.z = 0.84;
      nodowa.position.y = 0.236;
      g.add(nodowa);

      // Quilted brocade KESA stole draped diagonally over the left shoulder across the cuirass
      const kesaColor = isNeon ? 0x0b0e15 : new THREE.Color(l.lace).lerp(new THREE.Color(l.metal), 0.22).getHex();
      const kesaMat = silk(kesaColor, brocadeKesaTex, 1, 2.2);
      for (const back of [false, true]) {
        const z = back ? -1 : 1;
        const path = new THREE.CatmullRomCurve3([
          new V(0.135, 0.262, 0),
          new V(0.132, 0.202, 0.136 * z),
          new V(0.072, 0.088, 0.186 * z),
          new V(-0.062, -0.032, 0.182 * z),
          new V(-0.182, -0.175, 0.122 * z)
        ]);
        const strip = new THREE.PlaneGeometry(1, 1, 4, 28), v = strip.attributes.position;
        for (let i = 0; i < v.count; i++) {
          const side = v.getX(i), t = v.getY(i) + 0.5, p = path.getPoint(t), d = path.getTangent(t);
          const span = 0.135 - t * 0.018;
          v.setXYZ(i, p.x + d.y * side * span, p.y - d.x * side * span, p.z - z * 0.013 * Math.abs(2 * side));
        }
        strip.computeVertexNormals();
        g.add(new THREE.Mesh(strip, kesaMat));
        for (const side of [-0.5, 0.5]) {
          const hemPts: THREE.Vector3[] = [];
          for (let k = 0; k <= 12; k++) {
            const t = k / 12, p = path.getPoint(t), d = path.getTangent(t), span = 0.135 - t * 0.018;
            hemPts.push(new V(p.x + d.y * side * span, p.y - d.x * side * span, p.z - z * 0.011));
          }
          g.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hemPts), 24, 0.0042, 5), metal));
        }
      }
      // Sculpted gilded kansu ring fastening the kesa
      const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.028, 0.007, 8, 22), metal);
      clasp.position.set(0.102, 0.198, 0.156);
      clasp.rotation.set(0.28, 0.48, 0);
      g.add(clasp);

      // Iconic wooden juzu prayer beads resting cleanly over the breastplate
      const woodMat = new THREE.MeshStandardMaterial({ color: 0x3b2214, roughness: 0.42, metalness: 0.08 });
      const beadsCurve = new THREE.CatmullRomCurve3([
        new V(-0.092, 0.272, -0.025), new V(-0.118, 0.20, 0.132), new V(-0.078, 0.075, 0.205),
        new V(0, 0.005, 0.214), new V(0.078, 0.075, 0.205), new V(0.118, 0.20, 0.132),
        new V(0.092, 0.272, -0.025), new V(0, 0.292, -0.112)
      ], true);
      const beadGeo = new THREE.SphereGeometry(0.0135, 10, 8);
      for (let i = 0; i < 28; i++) {
        const b = new THREE.Mesh(beadGeo, woodMat);
        b.position.copy(beadsCurve.getPointAt(i / 28));
        g.add(b);
      }
      const masterBead = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 10), metal);
      masterBead.position.set(0, -0.01, 0.218);
      g.add(masterBead);
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.062, 8, 1, true), lace);
      tassel.position.set(0, -0.06, 0.216);
      g.add(tassel);

    } else if (cls === 'xia') {
      // Crisp crossed hanfu silk collar peeking above the armored gorget
      const collarSilk = silk(0xf0ece0, cloudSilkTex, 1.5, 1.5);
      const trimSilk = silk(l.lace, cloudSilkTex, 1.5, 1.5);
      const colL = new THREE.CatmullRomCurve3([
        new V(0.088, 0.264, 0.028), new V(0.082, 0.215, 0.112), new V(0.028, 0.155, 0.156), new V(-0.045, 0.088, 0.168)
      ]);
      const colR = new THREE.CatmullRomCurve3([
        new V(-0.086, 0.264, 0.028), new V(-0.080, 0.215, 0.110), new V(-0.025, 0.160, 0.152), new V(0.038, 0.108, 0.164)
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(colR, 18, 0.012, 6), collarSilk));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(colL, 18, 0.013, 6), collarSilk));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(colL, 18, 0.016, 6), trimSilk)).position.set(0.008, -0.006, 0.004);

      // Embossed Huxinjing (护心镜 — heart-protecting mirror) on the center chest
      const mirrorRadius = a.tier >= 2.2 ? 0.068 : 0.058;
      const mirrorMat = new THREE.MeshStandardMaterial({
        map: xiaMirrorTex(l),
        roughness: 0.22,
        metalness: 0.85,
        emissive: l.metal,
        emissiveIntensity: Math.max(0.14, (l.glow ?? 0.06) * 1.2)
      });
      const mirrorGrp = new THREE.Group();
      mirrorGrp.position.set(0, 0.072, 0.172 * torsoSpec.depth);
      mirrorGrp.rotation.x = -0.07;
      // slightly convex mirror plate + raised metallic bezel
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(mirrorRadius, mirrorRadius * 1.04, 0.012, 28), mirrorMat);
      disc.rotation.x = Math.PI / 2;
      mirrorGrp.add(disc);
      const bezel = new THREE.Mesh(new THREE.TorusGeometry(mirrorRadius, 0.0065, 8, 28), metal);
      bezel.position.z = 0.005;
      mirrorGrp.add(bezel);
      g.add(mirrorGrp);

      // Crossed leather/gilt harness straps anchoring the mirror plate to shoulders & waist
      for (const s of [-1, 1]) {
        const harness = new THREE.CatmullRomCurve3([
          new V(0.042 * s, 0.105, 0.168 * torsoSpec.depth),
          new V(0.098 * s, 0.175, 0.146 * torsoSpec.depth),
          new V(0.118 * s, 0.234, 0.055)
        ]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(harness, 14, 0.006, 5), lace));
      }
      // Sculpted V-shaped sternum rib trim below the mirror
      const vTrim = new THREE.CatmullRomCurve3([
        new V(-0.14, 0.02, 0.142 * torsoSpec.depth),
        new V(0, -0.045, 0.164 * torsoSpec.depth),
        new V(0.14, 0.02, 0.142 * torsoSpec.depth)
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(vTrim, 20, 0.0055, 6), metal));

    } else {
      // HWARANG: crisp dark git & white dongjeong collar peeking neatly above the royal brigandine
      const darkCollar = silk(0x1c1b22, plumSilkTex, 1.5, 1.5);
      const whiteStrip = new THREE.MeshStandardMaterial({ color: 0xf4f0e6, roughness: 0.8 });
      const gitL = new THREE.CatmullRomCurve3([
        new V(0.088, 0.264, 0.026), new V(0.082, 0.215, 0.114), new V(0.032, 0.155, 0.156), new V(-0.038, 0.095, 0.168)
      ]);
      const gitR = new THREE.CatmullRomCurve3([
        new V(-0.086, 0.264, 0.026), new V(-0.080, 0.215, 0.112), new V(-0.028, 0.158, 0.152), new V(0.034, 0.112, 0.164)
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(gitR, 18, 0.015, 6), darkCollar));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(gitL, 18, 0.016, 6), darkCollar));
      const dong = new THREE.Mesh(new THREE.TubeGeometry(gitL, 18, 0.0075, 6), whiteStrip);
      dong.position.set(-0.005, 0.008, 0.006);
      g.add(dong);

      // Embossed Silla royal plum-blossom chest medallion (hyungbae)
      const crestR = a.tier >= 2.2 ? 0.062 : 0.052;
      const crestMat = new THREE.MeshStandardMaterial({
        map: hwarangCrestTex(l),
        roughness: 0.3,
        metalness: 0.72,
        emissive: l.metal,
        emissiveIntensity: Math.max(0.12, (l.glow ?? 0.06) * 1.15)
      });
      const crest = new THREE.Group();
      crest.position.set(0, 0.082, 0.174 * torsoSpec.depth);
      crest.rotation.x = -0.08;
      const disc = new THREE.Mesh(new THREE.CylinderGeometry(crestR, crestR * 1.03, 0.010, 28), crestMat);
      disc.rotation.x = Math.PI / 2;
      crest.add(disc);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(crestR, 0.006, 7, 28), metal);
      ring.position.z = 0.004;
      crest.add(ring);
      g.add(crest);

      // Iconic high-tied Sejodae braided silk cord around the lower chest with asymmetric knot & twin tassels
      const cordRing = ellipseArcTube(0.212 * torsoSpec.chestW, 0.158 * torsoSpec.depth, -0.045, 0, TAU, 0.0085, lace, 40);
      g.add(cordRing);
      const giltPiping = ellipseArcTube(0.214 * torsoSpec.chestW, 0.160 * torsoSpec.depth, -0.058, 0, TAU, 0.0038, metal, 40);
      g.add(giltPiping);
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.018, 0.0062, 24, 6), lace);
      knot.position.set(-0.105, -0.045, 0.154 * torsoSpec.depth);
      g.add(knot);
      for (const [dx, len] of [[-0.012, 0.34], [0.014, 0.29]] as const) {
        const endCurve = new THREE.CatmullRomCurve3([
          new V(-0.105 + dx, -0.055, 0.158 * torsoSpec.depth),
          new V(-0.110 + dx, -0.18, 0.168 * torsoSpec.depth),
          new V(-0.115 + dx, -len, 0.175 * torsoSpec.depth)
        ]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(endCurve, 14, 0.005, 5), lace));
        const tip = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.055, 8, 1, true), lace);
        tip.position.copy(endCurve.getPoint(1)).add(new V(0, -0.026, 0));
        g.add(tip);
        const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.009, 0.014, 8), metal);
        cap.position.copy(endCurve.getPoint(1));
        g.add(cap);
      }
    }

    overlay(setId, rigChest, g);
  }

  // ---- 2. TAILORED WAIST BELT & ARMORED TASSETS (rigWaist)
  if (rigWaist) {
    const g = new THREE.Group();
    g.name = `${cls}-waist-${a.id}`;
    const R = 0.204, rzScale = 0.77;
    const h = (cls === 'xia' ? 0.22 : 0.21) + 0.028 * l.sode;

    // Fitted armored waist belt
    const beltBand = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.01, 0.068, 36, 1, true), cls === 'sohei' ? lace : lacquer);
    beltBand.scale.z = rzScale;
    beltBand.position.y = 0.036;
    g.add(beltBand);
    for (const dy of [0.068, 0.004]) {
      const trim = ellipseArcTube(R * 1.01, R * rzScale * 1.01, dy, 0, TAU, 0.0048, metal, 36);
      g.add(trim);
    }

    const sk = new THREE.Group();
    // Generous Z clearance so thighs never clip through the waist tassets when sprinting
    sk.scale.z = 0.94;
    sk.position.y = 0.012 - h * 0.5;
    g.add(sk);

    if (cls === 'sohei') {
      // Braided monk rope over the belt + 6 overlapping kusazuri panels + front brocade-trimmed apron
      const rope = ellipseArcTube(R * 1.04, R * rzScale * 1.04, 0.038, 0, TAU, 0.012, lace, 36);
      g.add(rope);
      const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.021, 0.007, 22, 6), lace);
      knot.position.set(0.105, 0.038, R * rzScale * 1.02);
      g.add(knot);

      const n = 6, span = (TAU / n) * 0.88;
      for (let i = 0; i < n; i++) {
        const th = i * (TAU / n) - span * 0.5;
        sk.add(buildTassetPanel(R * 1.03, R * 1.24, h, th, span, 0.012, patterned(1.6, 1.0)));
        sk.add(ellipseArcTube(R * 1.245, R * 1.245, -h * 0.5, th, span, 0.0042, metal, 12));
      }
      // Brocade front apron panel over center tasset
      const kesaMat = silk(isNeon ? 0x0b0e15 : new THREE.Color(l.lace).lerp(new THREE.Color(l.metal), 0.22).getHex(), brocadeKesaTex, 0.65, 1.1);
      sk.add(buildTassetPanel(R * 1.05, R * 1.26, h * 1.12, -0.34, 0.68, 0.03, kesaMat));
      sk.add(ellipseArcTube(R * 1.265, R * 1.265, -h * 0.56, -0.34, 0.68, 0.0045, metal, 12));

    } else if (cls === 'xia') {
      // Ornate imperial belt buckle (daikou) + hanging jade bi disc & crimson tassel
      const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.072, 0.052, 0.018), metal);
      buckle.position.set(0, 0.038, R * rzScale + 0.006);
      g.add(buckle);
      const buckleGem = new THREE.Mesh(new THREE.SphereGeometry(0.015, 10, 8), new THREE.MeshStandardMaterial({
        color: 0x38c88a, roughness: 0.18, metalness: 0.12, emissive: 0x1a7048, emissiveIntensity: 0.45
      }));
      buckleGem.scale.set(1.15, 0.85, 0.45);
      buckleGem.position.set(0, 0.038, R * rzScale + 0.016);
      g.add(buckleGem);

      // Jade bi pendant hanging cleanly at the left hip
      const jadeMat = new THREE.MeshStandardMaterial({ color: 0x3fbf86, roughness: 0.2, metalness: 0.1, emissive: 0x1a6a46, emissiveIntensity: 0.4 });
      const cordMat = new THREE.MeshStandardMaterial({ color: 0xb3241c, roughness: 0.7, side: THREE.DoubleSide });
      const hangGrp = new THREE.Group();
      hangGrp.position.set(0.125, 0.0, R * rzScale * 0.96);
      g.add(hangGrp);
      const bi = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.010, 8, 22), jadeMat);
      bi.position.y = -0.055; hangGrp.add(bi);
      const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.075, 8, 1, true), cordMat);
      tassel.position.y = -0.115; hangGrp.add(tassel);

      // Sculpted Chinese zhajia / qunjia: pointed central front & back aprons + overlapping flared hip tassets
      const panels: [number, number, number, number][] = [
        [-0.44, 0.88, h * 1.15, 0.048],          // front pointed armored apron
        [Math.PI - 0.44, 0.88, h * 1.12, 0.042], // back apron
        [0.48, 1.05, h * 1.0, 0.032],            // left hip tasset
        [1.56, 1.05, h * 1.0, 0.028],            // left-back hip tasset
        [-1.53, 1.05, h * 1.0, 0.032],           // right hip tasset
        [-2.61, 1.05, h * 1.0, 0.028],           // right-back hip tasset
      ];
      for (const [th0, sp, ph, drop] of panels) {
        const panelMat = patterned(1.5, 1.1);
        const p = buildTassetPanel(R * 1.03, R * 1.25, ph, th0, sp, drop, panelMat);
        p.position.y = (h - ph) * 0.5;
        sk.add(p);
        sk.add(ellipseArcTube(R * 1.255, R * 1.255, -ph + h * 0.5, th0, sp, 0.0042, metal, 12));
      }

    } else {
      // HWARANG: Silla gwadae articulated gilded plaque belt + scalloped sangap riding tassets
      for (let i = 0; i < 12; i++) {
        const aAng = i * (TAU / 12);
        const plaque = new THREE.Mesh(new THREE.BoxGeometry(0.038, 0.042, 0.012), metal);
        plaque.position.set(Math.sin(aAng) * (R + 0.004), 0.036, Math.cos(aAng) * (R * rzScale + 0.004));
        plaque.rotation.y = aAng;
        g.add(plaque);
      }
      // 6 scalloped royal tassets (split cleanly at front & sides for riding grace)
      const n = 6, span = (TAU / n) * 0.90;
      for (let i = 0; i < n; i++) {
        const th = i * (TAU / n) + 0.04;
        const ph = (i === 0 || i === 5) ? h * 1.08 : h * 1.02;
        const p = buildTassetPanel(R * 1.03, R * 1.25, ph, th, span, 0.034, patterned(1.4, 1.05));
        p.position.y = (h - ph) * 0.5;
        sk.add(p);
        sk.add(ellipseArcTube(R * 1.255, R * 1.255, -ph + h * 0.5, th, span, 0.0045, metal, 12));
      }
    }

    overlay(setId, rigWaist, g);
  }

  // ---- 3. SCULPTED ANATOMICAL PAULDRONS (LeftArm / RightArm)
  for (const side of ['Left', 'Right'] as const) {
    const A = P(side + 'Arm'), F = P(side + 'ForeArm');
    const d = F.clone().sub(A).normalize();
    const out = new V(Math.sign(A.x - hips.x) || 1, 0.28, 0);
    const Z = out.addScaledVector(d, -out.dot(d)).normalize();
    const Y = d.clone().negate();
    const X = new V().crossVectors(Y, Z);

    const g = buildSculptedPauldron(cls, l.sode, patterned(1.5, 1.15), lacquer, metal, lace, a.tier);
    g.name = `${cls}-pauldron-${a.id}-${side}`;
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    g.position.copy(A);
    hang(setId, side + 'Arm', g);
  }

  // ---- 4. FITTED FOREARM VAMBRACES (LeftForeArm / RightForeArm, tier >= 1.5)
  if (a.tier >= 1.5) {
    for (const side of ['Left', 'Right'] as const) {
      if (!bones[side + 'Hand']) continue;
      const F = P(side + 'ForeArm'), H = P(side + 'Hand');
      const len = F.distanceTo(H);
      if (len < 0.08) continue;
      const dir = F.clone().sub(H).normalize(); // +Y points from wrist up to elbow
      const g = buildForearmVambrace(len, patterned(1.4, 1.1), lacquer, metal, lace, a.tier);
      g.name = `${cls}-vambrace-${a.id}-${side}`;
      g.position.copy(F).lerp(H, 0.52);
      g.quaternion.setFromUnitVectors(new V(0, 1, 0), dir);
      hang(setId, side + 'ForeArm', g);
    }
  }

  // ---- 5. CONTOURED SHIN GREAVES + KNEECAPS (LeftLeg / RightLeg)
  if (l.shins) {
    for (const side of ['Left', 'Right'] as const) {
      const K = P(side + 'Leg'), Fo = P(side + 'Foot');
      const len = K.distanceTo(Fo);
      const dir = K.clone().sub(Fo).normalize();
      const g = buildContouredGreave(len, patterned(1.3, 1.2), lacquer, metal, lace);
      g.name = `${cls}-greave-${a.id}-${side}`;
      g.position.copy(K).lerp(Fo, 0.52);
      g.quaternion.setFromUnitVectors(new V(0, 1, 0), dir);
      hang(setId, side + 'Leg', g);
    }
  }
}
