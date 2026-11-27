// Professional cinematic VFX shaders, procedural high-res textures, and fractal lightning system.
// Designed so T-mode (direct 3D WebGL) looks crisp, volumetric, and filmic while remaining
// 100% compatible with the ASCII pass via tagMat(..., CLS.fx).
import * as THREE from 'three';
import { scene } from './renderer';
import { CLS, tagMat } from './materials';
import { surfaceY } from './structures';
import { rnd } from './utils';

// ------------------------------------------------------------ procedural textures (generated once)
function makeCanvasTex(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

/** Soft radial glowing orb for particles & sparks (replaces hard squares in T-mode) */
export const softGlowTex = makeCanvasTex(64, 64, (ctx, w, h) => {
  const cx = w / 2, cy = h / 2, r = w / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0.0, 'rgba(255,255,255,1)');
  g.addColorStop(0.18, 'rgba(255,255,255,0.92)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.36)');
  g.addColorStop(0.78, 'rgba(255,255,255,0.06)');
  g.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
});

/** Cinematic anamorphic optical lens flare (horizontal streak + vertical glint + star + halo) */
export const anamorphicFlareTex = makeCanvasTex(256, 256, (ctx, w, h) => {
  const cx = w / 2, cy = h / 2;
  // Soft circular halo
  const halo = ctx.createRadialGradient(cx, cy, 0, cx, cy, 118);
  halo.addColorStop(0.0, 'rgba(255,255,255,1)');
  halo.addColorStop(0.12, 'rgba(255,255,255,0.75)');
  halo.addColorStop(0.32, 'rgba(255,255,255,0.18)');
  halo.addColorStop(0.65, 'rgba(255,255,255,0.03)');
  halo.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, w, h);

  // Subtle chromatic iris ring
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, 62, 0, Math.PI * 2);
  ctx.stroke();

  // Wide horizontal anamorphic streak
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, 0.085);
  const hStreak = ctx.createRadialGradient(0, 0, 0, 0, 0, 126);
  hStreak.addColorStop(0.0, 'rgba(255,255,255,1)');
  hStreak.addColorStop(0.25, 'rgba(255,255,255,0.65)');
  hStreak.addColorStop(0.7, 'rgba(255,255,255,0.12)');
  hStreak.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = hStreak;
  ctx.beginPath();
  ctx.arc(0, 0, 126, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Crisp vertical star glint
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(0.06, 0.72);
  const vStreak = ctx.createRadialGradient(0, 0, 0, 0, 0, 120);
  vStreak.addColorStop(0.0, 'rgba(255,255,255,0.95)');
  vStreak.addColorStop(0.4, 'rgba(255,255,255,0.32)');
  vStreak.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = vStreak;
  ctx.beginPath();
  ctx.arc(0, 0, 120, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Diagonal 45-deg star needles
  for (const angle of [Math.PI / 4, -Math.PI / 4]) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.scale(0.032, 0.42);
    const dStreak = ctx.createRadialGradient(0, 0, 0, 0, 0, 110);
    dStreak.addColorStop(0.0, 'rgba(255,255,255,0.85)');
    dStreak.addColorStop(0.5, 'rgba(255,255,255,0.2)');
    dStreak.addColorStop(1.0, 'rgba(255,255,255,0)');
    ctx.fillStyle = dStreak;
    ctx.beginPath();
    ctx.arc(0, 0, 110, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
});

/** Ornate sacred Japanese/Buddhist mandala seal texture for magic circles & telegraphs */
export const mandalaTex = makeCanvasTex(512, 512, (ctx, w, h) => {
  const cx = w / 2, cy = h / 2, R = 236;
  ctx.clearRect(0, 0, w, h);

  // Soft outer aura
  const bg = ctx.createRadialGradient(cx, cy, R * 0.65, cx, cy, R * 1.06);
  bg.addColorStop(0.0, 'rgba(255,255,255,0)');
  bg.addColorStop(0.55, 'rgba(255,255,255,0.12)');
  bg.addColorStop(0.82, 'rgba(255,255,255,0.22)');
  bg.addColorStop(1.0, 'rgba(255,255,255,0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(cx, cy, R * 1.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(255,255,255,0.9)';
  ctx.shadowBlur = 10;

  const circle = (r: number, lw: number, alpha = 1) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  };

  circle(R, 4.5, 0.95);
  circle(R * 0.92, 1.8, 0.7);
  circle(R * 0.78, 3.2, 0.9);
  circle(R * 0.73, 1.4, 0.55);
  circle(R * 0.36, 2.5, 0.85);
  circle(R * 0.16, 2.0, 0.75);

  // 24 outer radial ticks & diamond nodes
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    ctx.save();
    ctx.globalAlpha = i % 3 === 0 ? 0.95 : 0.45;
    ctx.lineWidth = i % 3 === 0 ? 2.6 : 1.4;
    ctx.beginPath();
    ctx.moveTo(cx + ca * R * 0.92, cy + sa * R * 0.92);
    ctx.lineTo(cx + ca * R * 1.0, cy + sa * R * 1.0);
    ctx.stroke();
    if (i % 3 === 0) {
      ctx.beginPath();
      ctx.arc(cx + ca * R * 0.96, cy + sa * R * 0.96, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  // Interlaced 8-point sacred star (two rotated squares) + 6-point inner star
  const poly = (sides: number, r: number, rot: number, lw: number, alpha: number) => {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineWidth = lw;
    ctx.beginPath();
    for (let i = 0; i <= sides; i++) {
      const a = rot + (i / sides) * Math.PI * 2;
      const x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  };
  poly(4, R * 0.76, 0, 2.8, 0.85);
  poly(4, R * 0.76, Math.PI / 4, 2.8, 0.85);
  poly(3, R * 0.72, -Math.PI / 2, 1.8, 0.5);
  poly(3, R * 0.72, Math.PI / 2, 1.8, 0.5);

  // 8 lotus petals around center
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(a);
    ctx.beginPath();
    ctx.moveTo(0, -R * 0.16);
    ctx.quadraticCurveTo(R * 0.14, -R * 0.28, 0, -R * 0.36);
    ctx.quadraticCurveTo(-R * 0.14, -R * 0.28, 0, -R * 0.16);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  // 8 arcane kanji glyphs between the outer rings
  const glyphs = ['雷', '風', '炎', '水', '空', '剣', '道', '魂'];
  ctx.font = 'bold 26px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 - Math.PI / 2;
    ctx.save();
    ctx.translate(cx + Math.cos(a) * R * 0.85, cy + Math.sin(a) * R * 0.85);
    ctx.rotate(a + Math.PI / 2);
    ctx.globalAlpha = 0.92;
    ctx.fillText(glyphs[i], 0, 0);
    ctx.restore();
  }
});

/** Scorched / electrified cracked impact ground decal */
export const scorchTex = makeCanvasTex(256, 256, (ctx, w, h) => {
  const cx = w / 2, cy = h / 2, r = w / 2;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
  g.addColorStop(0.0, 'rgba(0,0,0,0.92)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.72)');
  g.addColorStop(0.76, 'rgba(0,0,0,0.22)');
  g.addColorStop(1.0, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Jagged radial burn fissures
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + (i % 3) * 0.12;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    let px = cx, py = cy;
    ctx.moveTo(px, py);
    for (let s = 1; s <= 5; s++) {
      const dist = (s / 5) * r * 0.92;
      const jig = (s % 2 ? 1 : -1) * 0.1;
      px = cx + Math.cos(a + jig) * dist;
      py = cy + Math.sin(a + jig) * dist;
      ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
});

/** Ornate calligraphic ofuda talisman texture for Escudo de Sutras */
export function makeTalismanTex(ch: string) {
  return makeCanvasTex(128, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // Soft glowing parchment body
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(255,244,205,0.42)');
    bg.addColorStop(0.5, 'rgba(255,232,165,0.55)');
    bg.addColorStop(1, 'rgba(255,210,120,0.34)');
    ctx.fillStyle = bg;
    ctx.fillRect(8, 8, w - 16, h - 16);

    // Double ornate border
    ctx.strokeStyle = 'rgba(255,248,220,0.95)';
    ctx.shadowColor = 'rgba(255,220,120,0.9)';
    ctx.shadowBlur = 8;
    ctx.lineWidth = 4;
    ctx.strokeRect(12, 12, w - 24, h - 24);
    ctx.lineWidth = 1.5;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    // Top sacred bar + corner marks
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillRect(28, 30, w - 56, 3);
    ctx.fillRect(28, h - 33, w - 56, 3);

    // Main brushed kanji
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 74px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    ctx.fillText(ch, w / 2, 102);

    // Secondary sacred crest + seal box
    ctx.font = 'bold 34px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    ctx.fillText('卍', w / 2, 174);
    ctx.strokeStyle = 'rgba(255,140,80,0.95)';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(w / 2 - 18, 202, 36, 22);
    ctx.fillStyle = 'rgba(255,150,90,0.9)';
    ctx.font = 'bold 14px serif';
    ctx.fillText('印', w / 2, 214);
  });
}

// ------------------------------------------------------------ cinematic GLSL shader materials
/** Shared shader time uniform (updated every frame by updateVfxArt) */
export const vfxTime = { value: 0 };

const NOISE_GLSL = /* glsl */`
float hash21(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash21(i), b = hash21(i + vec2(1.0, 0.0));
  float c = hash21(i + vec2(0.0, 1.0)), d = hash21(i + vec2(1.0, 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
float pnoise(vec2 p, float per) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  float i0 = mod(i.x, per), i1 = mod(i.x + 1.0, per);
  float a = hash21(vec2(i0, i.y));
  float b = hash21(vec2(i1, i.y));
  float c = hash21(vec2(i0, i.y + 1.0));
  float d = hash21(vec2(i1, i.y + 1.0));
  return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}
`;

/** Volumetric Fresnel shell (domes, energy spheres, crystal prisons, buddha palm aura):
 *  Soft transparent center with luminous glowing rim + animated plasma shimmer. */
export function makeFresnelShellMat(coreColor: THREE.ColorRepresentation, rimColor: THREE.ColorRepresentation, opacity = 0.7, power = 2.1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uRim: { value: new THREE.Color(rimColor) },
      uOpacity: { value: opacity },
      uPower: { value: power },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uRim;
      uniform float uOpacity;
      uniform float uPower;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), uPower);
        float n = vnoise(vUv * vec2(8.0, 5.0) - vec2(0.0, uTime * 3.8));
        float n2 = vnoise(vUv * vec2(16.0, 10.0) + vec2(uTime * 2.2, -uTime * 5.0));
        float energy = 0.72 + 0.28 * (n * 0.65 + n2 * 0.35);
        float rimMask = clamp(0.14 + fresnel * 1.35, 0.0, 1.0);
        vec3 col = mix(uRim, uCore, clamp(fresnel * 1.1 + n * 0.25, 0.0, 1.0)) * (1.15 + 0.55 * fresnel);
        float a = rimMask * energy * uOpacity;
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Volumetric energy pillar with scrolling vertical plasma streaks & soft Fresnel edges */
export function makeEnergyPillarMat(coreColor: THREE.ColorRepresentation, outerColor: THREE.ColorRepresentation, opacity = 0.75) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uOuter: { value: new THREE.Color(outerColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uOuter;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        // Soft cylinder falloff: bright center, feathers to zero at silhouette edge
        float edge = pow(clamp(ndv, 0.0, 1.0), 1.35);
        float vFade = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.18, vUv.y);
        float streak1 = vnoise(vec2(vUv.x * 12.0, vUv.y * 4.0 - uTime * 5.5));
        float streak2 = vnoise(vec2(vUv.x * 24.0 + 3.1, vUv.y * 7.0 - uTime * 9.0));
        float streaks = 0.55 + 0.45 * (streak1 * 0.65 + streak2 * 0.35);
        float hot = pow(edge, 2.2) * (0.7 + 0.5 * streak2);
        vec3 col = mix(uOuter, uCore, clamp(hot, 0.0, 1.0)) * (1.25 + 0.75 * hot);
        float a = edge * vFade * streaks * uOpacity;
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Smooth radial shockwave ring (plane geometry with razor-bright leading front + trailing wash) */
export function makeShockRingMat(coreColor: THREE.ColorRepresentation, outerColor: THREE.ColorRepresentation, opacity = 0.9) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uOuter: { value: new THREE.Color(outerColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uOuter;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x);
        float wave = vnoise(vec2(ang * 4.0, r * 6.0 - uTime * 6.0));
        // Razor-bright leading ring near r = 0.88, soft energy wash trailing inside
        float lead = exp(-pow((r - 0.88) / 0.055, 2.0));
        float wash = smoothstep(0.42, 0.88, r) * smoothstep(1.0, 0.86, r) * (0.45 + 0.55 * wave);
        float intensity = lead * 1.4 + wash * 0.75;
        vec3 col = mix(uOuter, uCore, clamp(lead * 1.15, 0.0, 1.0)) * (1.2 + 0.6 * lead);
        float a = clamp(intensity * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Sweeping anime/cinematic sword crescent slash shader (razor leading edge + speed-streaked tail) */
export function makeCrescentSlashMat(coreColor: THREE.ColorRepresentation, outerColor: THREE.ColorRepresentation, opacity = 0.95) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uOuter: { value: new THREE.Color(outerColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uOuter;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0 || r < 0.32 || p.y < -0.05) discard;
        float ang = atan(p.y, p.x); // 0..PI
        float arcFade = sin(clamp(ang / 3.14159265, 0.0, 1.0) * 3.14159265);
        arcFade = pow(max(0.0, arcFade), 0.55);
        float streaks = vnoise(vec2(ang * 8.0 - uTime * 14.0, r * 14.0));
        // Thickest at center of arc, razor-sharp at tips
        float innerEdge = mix(0.92, 0.45, arcFade);
        float band = smoothstep(innerEdge, 0.93, r) * smoothstep(1.0, 0.94, r);
        float hotEdge = exp(-pow((r - 0.94) / 0.035, 2.0)) * arcFade;
        float intensity = (band * (0.55 + 0.55 * streaks) + hotEdge * 1.65) * arcFade;
        vec3 col = mix(uOuter, uCore, clamp(hotEdge * 1.2 + band * 0.35, 0.0, 1.0)) * 1.45;
        float a = clamp(intensity * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Helical swirling wind/storm funnel shader (for Ojo del Tifón) */
export function makeVortexFunnelMat(coreColor: THREE.ColorRepresentation, outerColor: THREE.ColorRepresentation, opacity = 0.65) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uOuter: { value: new THREE.Color(outerColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uOuter;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float soft = pow(clamp(ndv, 0.0, 1.0), 0.75);
        float vFade = smoothstep(0.0, 0.14, vUv.y) * smoothstep(1.0, 0.72, vUv.y);
        // Spiral wind bands climbing up the funnel
        float spiral = sin((vUv.x * 6.2831853 * 3.0) + vUv.y * 14.0 - uTime * 15.0) * 0.5 + 0.5;
        float n = vnoise(vec2(vUv.x * 10.0 - uTime * 4.5, vUv.y * 6.0 - uTime * 5.0));
        float band = pow(spiral, 1.8) * (0.45 + 0.65 * n);
        float rim = pow(1.0 - clamp(ndv, 0.0, 1.0), 2.0) * 0.65;
        vec3 col = mix(uOuter, uCore, clamp(band * 0.8 + rim, 0.0, 1.0)) * 1.35;
        float a = (band * soft + rim * 0.5) * vFade * uOpacity;
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Volumetric fire slash / flame shader (white-gold core -> orange -> crimson turbulent flames) */
export function makeFireBladeMat(coreColor: THREE.ColorRepresentation, midColor: THREE.ColorRepresentation, edgeColor: THREE.ColorRepresentation, opacity = 0.92) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uMid: { value: new THREE.Color(midColor) },
      uEdge: { value: new THREE.Color(edgeColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        vUv = uv;
        vPos = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uMid;
      uniform vec3 uEdge;
      uniform float uOpacity;
      varying vec2 vUv;
      varying vec3 vPos;
      void main() {
        float n1 = vnoise(vPos.xz * 2.4 - vec2(0.0, uTime * 9.0));
        float n2 = vnoise(vPos.xz * 5.2 + vec2(uTime * 3.5, -uTime * 13.0));
        float flame = n1 * 0.65 + n2 * 0.35;
        float heat = clamp(flame * 1.25 + 0.15, 0.0, 1.0);
        vec3 col = mix(uEdge, uMid, smoothstep(0.15, 0.62, heat));
        col = mix(col, uCore, smoothstep(0.62, 0.96, heat));
        float a = smoothstep(0.08, 0.55, flame) * uOpacity;
        gl_FragColor = vec4(col * 1.45 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Seamless 360-degree volumetric wall-of-fire shader for Anillo de Brasas:
 *  3-octave periodic domain-warped FBM carving licking flame tongues, detached embers & blackbody heat ramp. */
export function makeFireRingWallMat(opts: { opacity?: number; seed?: number; coreBoost?: number; speed?: number } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opts.opacity ?? 0.96 },
      uSeed: { value: opts.seed ?? 0 },
      uCoreBoost: { value: opts.coreBoost ?? 1.0 },
      uSpeed: { value: opts.speed ?? 1.0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSeed;
      uniform float uCoreBoost;
      uniform float uSpeed;
      varying vec2 vUv;
      void main() {
        float t = uTime * uSpeed;
        float y = vUv.y;
        // Domain-warped periodic FBM so flames visibly curl & lick upward with zero 360-deg seam
        float w1 = pnoise(vec2(vUv.x * 16.0 + t * 0.55 + uSeed, y * 2.6 - t * 4.8), 16.0);
        float uWarp = vUv.x + (w1 - 0.5) * 0.042 * (0.3 + y * 1.1);
        float n1 = pnoise(vec2(uWarp * 18.0 + t * 0.42 + uSeed, y * 2.9 - t * 6.2), 18.0);
        float n2 = pnoise(vec2(uWarp * 36.0 - t * 0.95 + uSeed * 1.7, y * 5.8 - t * 10.4), 36.0);
        float n3 = pnoise(vec2(uWarp * 72.0 + t * 1.55 + uSeed * 2.3, y * 10.5 - t * 15.2), 72.0);
        float fbm = n1 * 0.52 + n2 * 0.32 + n3 * 0.16;

        // Tapered licking flame silhouette: solid molten base, ragged dancing tongues near the top
        float shape = (1.0 - y) * 1.12 + (fbm - 0.43) * (0.62 + y * 0.88);
        float body = smoothstep(0.16, 0.46, shape);

        // Detached flickering flame wisps & embers breaking off above the main crown
        float wispNoise = n2 * 0.52 + n3 * 0.48;
        float wisp = smoothstep(0.70, 0.90, wispNoise) * smoothstep(0.22, 0.62, y) * smoothstep(1.0, 0.72, y) * 0.85;

        float baseFade = smoothstep(0.0, 0.065, y);
        float topFade = smoothstep(1.0, 0.88, y);
        float mask = clamp((body + wisp) * baseFade * topFade, 0.0, 1.0);
        if (mask < 0.01) discard;

        // Incandescent ignition ridge where the fire wall meets the ground
        float baseHot = exp(-pow((y - 0.085) / 0.065, 2.0)) * (0.75 + 0.35 * n2);

        // Physical blackbody fire color ramp: deep crimson -> blazing orange -> solar gold -> white-hot core
        float heat = clamp(shape * 0.82 + (1.0 - y) * 0.34 + baseHot * 0.48 + n3 * 0.16 - 0.14, 0.0, 1.0);
        heat = clamp(heat * uCoreBoost, 0.0, 1.0);
        vec3 col = mix(vec3(0.78, 0.06, 0.01), vec3(1.62, 0.34, 0.04), smoothstep(0.05, 0.38, heat));
        col = mix(col, vec3(2.15, 1.02, 0.18), smoothstep(0.36, 0.72, heat));
        col = mix(col, vec3(2.65, 2.38, 1.65), smoothstep(0.70, 0.98, heat));

        // Subtle high-frequency combustion flicker
        float flicker = 0.90 + 0.16 * sin(t * 26.0 + vUv.x * 25.1327 + uSeed * 3.1);
        float a = clamp(mask * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * flicker * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Seamless terrain-hugging molten ember trail & blazing ignition rim under Anillo de Brasas */
export function makeFireRingGroundMat(opacity = 0.92) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        // vUv.x = 0..1 around ring, vUv.y = 0 (inner trailing edge) .. 1 (outer leading heat halo)
        float n1 = pnoise(vec2(vUv.x * 24.0 + uTime * 0.5, vUv.y * 5.0 - uTime * 4.5), 24.0);
        float n2 = pnoise(vec2(vUv.x * 48.0 - uTime * 0.9, vUv.y * 10.0 - uTime * 7.8), 48.0);
        float coals = n1 * 0.58 + n2 * 0.42;

        // Cracked magma / live ember veins trailing behind the fire wall
        float veins = smoothstep(0.40, 0.78, coals);
        float trailEnv = smoothstep(0.0, 0.48, vUv.y) * smoothstep(1.0, 0.80, vUv.y);
        float embers = (0.32 + 0.95 * veins) * trailEnv;

        // Blazing incandescent leading ignition rim right beneath the flame curtain
        float leadRim = exp(-pow((vUv.y - 0.83) / 0.068, 2.0)) * (0.85 + 0.35 * n2);
        // Soft forward heat-glow bleeding slightly ahead of the flames
        float aheadGlow = smoothstep(0.75, 0.86, vUv.y) * smoothstep(1.0, 0.86, vUv.y) * 0.55;

        float intensity = clamp(embers * 0.75 + leadRim * 1.45 + aheadGlow, 0.0, 1.5);
        float heat = clamp(leadRim * 0.95 + veins * 0.55 * vUv.y, 0.0, 1.0);

        vec3 col = mix(vec3(0.72, 0.07, 0.01), vec3(1.55, 0.36, 0.04), smoothstep(0.08, 0.42, heat));
        col = mix(col, vec3(2.1, 1.05, 0.2), smoothstep(0.40, 0.76, heat));
        col = mix(col, vec3(2.6, 2.35, 1.65), smoothstep(0.76, 1.0, heat));

        float a = clamp(intensity * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Instanced 3D sculpted flame tongue shader (per-instance aPhase drives independent licking, sway & erosion) */
export function makeFireTongueMat(opacity = 0.92) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      attribute float aPhase;
      uniform float uTime;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = aPhase;
        vec3 p = position;
        float h = clamp(uv.y, 0.0, 1.0);
        float t = uTime * 9.5 + aPhase;
        // Organic whip & dance stronger towards the flame tip
        float sway = h * h;
        p.x += sin(t * 1.25 + h * 4.5) * 0.24 * sway;
        p.z += cos(t * 1.05 + h * 3.8) * 0.18 * sway - sway * 0.28; // lean back slightly against radial wind
        p.y *= 0.86 + 0.24 * sin(t * 1.6 + aPhase * 0.7);
        vec4 mvPos = modelViewMatrix * instanceMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        // Teardrop flame silhouette inside UV space
        float cx = abs(vUv.x - 0.5) * 2.0;
        float y = vUv.y;
        float n1 = vnoise(vec2(vUv.x * 4.2 + vPhase, y * 4.8 - uTime * 8.5));
        float n2 = vnoise(vec2(vUv.x * 8.5 - vPhase * 1.3, y * 9.5 - uTime * 13.5));
        float fbm = n1 * 0.62 + n2 * 0.38;

        // Taper width as height rises, eroded by upward turbulence
        float width = mix(0.92, 0.06, pow(y, 0.78)) * (0.72 + 0.55 * fbm);
        float edge = 1.0 - smoothstep(width * 0.45, width, cx);
        float tip = smoothstep(1.0, 0.62, y + (0.48 - fbm) * 0.55);
        float base = smoothstep(0.0, 0.12, y);
        float mask = edge * tip * base;
        if (mask < 0.02) discard;

        // Hot white-gold inner heart transitioning to orange & crimson outer licks
        float core = (1.0 - smoothstep(0.0, width * 0.65, cx)) * (1.0 - y * 0.85);
        float heat = clamp(core * 0.95 + (1.0 - y) * 0.35 + fbm * 0.22 - 0.12, 0.0, 1.0);
        vec3 col = mix(vec3(0.85, 0.08, 0.01), vec3(1.7, 0.40, 0.05), smoothstep(0.08, 0.42, heat));
        col = mix(col, vec3(2.2, 1.15, 0.22), smoothstep(0.42, 0.76, heat));
        col = mix(col, vec3(2.7, 2.45, 1.75), smoothstep(0.76, 1.0, heat));

        float a = clamp(mask * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Swirling overhead storm rift / thunderhead portal disc (sky opening for lightning & meteors) */
export function makeStormPortalMat(coreColor: THREE.ColorRepresentation, outerColor: THREE.ColorRepresentation, opacity = 0.85) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uOuter: { value: new THREE.Color(outerColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uOuter;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x);
        float swirl = ang + 2.8 * (1.0 - r) - uTime * 3.2;
        float n1 = vnoise(vec2(swirl * 2.5, r * 5.0 - uTime * 2.5));
        float n2 = vnoise(vec2(cos(swirl) * 3.0 + uTime * 1.5, sin(swirl) * 3.0));
        float cloud = (n1 * 0.6 + n2 * 0.4) * smoothstep(1.0, 0.15, r);
        float eye = exp(-r * r * 14.0);
        float crack = pow(max(0.0, 1.0 - abs(sin(swirl * 3.0 + n1 * 2.0))), 8.0) * smoothstep(0.9, 0.1, r);
        vec3 col = mix(uOuter, uCore, clamp(eye * 1.2 + crack * 0.9, 0.0, 1.0)) * (1.1 + 1.1 * eye + 0.9 * crack);
        float a = clamp((cloud * 0.72 + eye * 1.15 + crack * 0.65) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Soft volumetric plasma beam material (bright white-hot center fading softly to silhouette edges) */
export function makeVolumetricBeamMat(coreColor: THREE.ColorRepresentation, glowColor: THREE.ColorRepresentation, opacity = 1) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uCore: { value: new THREE.Color(coreColor) },
      uGlow: { value: new THREE.Color(glowColor) },
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      uniform float uTime;
      uniform vec3 uCore;
      uniform vec3 uGlow;
      uniform float uOpacity;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec2 vUv;
      void main() {
        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float core = pow(clamp(ndv, 0.0, 1.0), 3.4);
        float halo = pow(clamp(ndv, 0.0, 1.0), 1.15);
        float pulse = 0.88 + 0.12 * sin(vUv.y * 26.0 - uTime * 48.0);
        vec3 col = mix(uGlow, uCore, clamp(core * 1.4, 0.0, 1.0)) * (1.25 + 1.35 * core) * pulse;
        float a = halo * uOpacity;
        gl_FragColor = vec4(col * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

// ------------------------------------------------------------ cinematic fractal lightning system
const PLANE = new THREE.PlaneGeometry(1, 1);
const BOLT_SEG = new THREE.CylinderGeometry(0.82, 1.0, 1, 7, 1, true);
const DOME_GEO = new THREE.SphereGeometry(1, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const UP = new THREE.Vector3(0, 1, 0);
const _d = new THREE.Vector3();
const _mid = new THREE.Vector3();
const _q = new THREE.Quaternion();

interface VfxProp {
  obj: THREE.Object3D;
  mats: THREE.Material[];
  geos?: THREE.BufferGeometry[];
  t: number;
  life: number;
  tick: (p: VfxProp, dt: number) => void;
}
const vfxProps: VfxProp[] = [];

function addVfxProp(obj: THREE.Object3D, mats: THREE.Material[], life: number, tick: VfxProp['tick'], geos?: THREE.BufferGeometry[]) {
  scene.add(obj);
  const p: VfxProp = { obj, mats, geos, t: 0, life, tick };
  vfxProps.push(p);
  return p;
}

function disposeVfxProp(p: VfxProp) {
  scene.remove(p.obj);
  for (const m of p.mats) m.dispose();
  if (p.geos) for (const g of p.geos) g.dispose();
}

/** Midpoint-displacement jagged lightning polyline between `a` and `b` */
function jaggedPath(a: THREE.Vector3, b: THREE.Vector3, steps: number, spread: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= steps; i++) {
    const k = i / steps;
    const p = a.clone().lerp(b, k);
    if (i > 0 && i < steps) {
      // Envelope peaks in the middle, stays anchored at sky & target
      const env = Math.sin(k * Math.PI) * spread;
      const kink = (i % 3 === 0 ? 1.35 : 0.8);
      p.x += rnd(-env, env) * kink;
      p.y += rnd(-env * 0.18, env * 0.18);
      p.z += rnd(-env, env) * kink;
    }
    pts.push(p);
  }
  return pts;
}

/** Build a merged multi-segment tapered tube chain into a Group using shared core + outer halo materials */
function addBoltChain(
  g: THREE.Group,
  pts: THREE.Vector3[],
  baseRadius: number,
  taperEnd: number,
  coreMat: THREE.Material,
  haloMat: THREE.Material,
  coronaMat?: THREE.Material,
) {
  const n = pts.length - 1;
  for (let i = 0; i < n; i++) {
    const a = pts[i], b = pts[i + 1];
    _d.subVectors(b, a);
    const len = _d.length();
    if (len < 0.005) continue;
    _mid.copy(a).addScaledVector(_d, 0.5);
    _q.setFromUnitVectors(UP, _d.normalize());
    const k = i / Math.max(1, n - 1);
    const r = THREE.MathUtils.lerp(baseRadius, baseRadius * taperEnd, k);
    // Slightly overlap segments (1.06x) so sharp bends have no cracks
    const segLen = len * 1.06;

    const core = new THREE.Mesh(BOLT_SEG, coreMat);
    core.position.copy(_mid);
    core.quaternion.copy(_q);
    core.scale.set(r, segLen, r);
    g.add(core);

    const halo = new THREE.Mesh(BOLT_SEG, haloMat);
    halo.position.copy(_mid);
    halo.quaternion.copy(_q);
    halo.scale.set(r * 3.6, segLen, r * 3.6);
    g.add(halo);

    if (coronaMat) {
      const corona = new THREE.Mesh(BOLT_SEG, coronaMat);
      corona.position.copy(_mid);
      corona.quaternion.copy(_q);
      corona.scale.set(r * 8.5, segLen, r * 8.5);
      g.add(corona);
    }
  }
}

export interface BoltOpts {
  coreColor?: number;
  glowColor?: number;
  outerColor?: number;
  skyHeight?: number;
  life?: number;
  radius?: number;
  branches?: number;
  groundImpact?: boolean;
  skyPortal?: boolean;
}

/** Spawns a cinematic, film-grade fractal lightning bolt from the sky to `to`:
 *  - Swirling storm portal overhead
 *  - 20-segment fractal main trunk with 3-tier volumetric plasma glow (white core + electric halo + wide soft aura)
 *  - Recursive primary forks & fine secondary twigs
 *  - Realistic double-strike flicker & re-ionization pulse
 *  - Ground impact: electromagnetic dome, double shockwave rings, jagged electric ground tendrils, scorch decal */
export function spawnCinematicBolt(to: THREE.Vector3, opts: BoltOpts = {}) {
  const coreCol = opts.coreColor ?? 0xffffff;
  const glowCol = opts.glowColor ?? 0x76b8ff;
  const outerCol = opts.outerColor ?? 0x3b68ff;
  const skyH = opts.skyHeight ?? 32;
  const life = opts.life ?? 0.58;
  const radius = opts.radius ?? 0.14;
  const branches = opts.branches ?? 4;
  const groundImpact = opts.groundImpact ?? true;
  const skyPortal = opts.skyPortal ?? true;

  const g = new THREE.Group();
  const coreMat = makeVolumetricBeamMat(coreCol, glowCol, 1.0);
  const haloMat = makeVolumetricBeamMat(glowCol, outerCol, 0.62);
  const coronaMat = makeVolumetricBeamMat(outerCol, 0x1e3599, 0.28);
  const mats: THREE.Material[] = [coreMat, haloMat, coronaMat];

  const top = new THREE.Vector3(to.x + rnd(-4.5, 4.5), to.y + skyH, to.z + rnd(-4.5, 4.5));
  const trunk = jaggedPath(top, to, 18, 2.6);
  addBoltChain(g, trunk, radius * 1.15, 0.65, coreMat, haloMat, coronaMat);

  // Secondary parallel plasma filament hugging the main trunk for extra cinematic energy
  const filament = jaggedPath(top.clone().add(new THREE.Vector3(rnd(-0.8, 0.8), 0, rnd(-0.8, 0.8))), to, 12, 1.4);
  addBoltChain(g, filament, radius * 0.42, 0.3, coreMat, haloMat);

  // Recursive primary forks & fine secondary twigs off the upper/mid trunk
  for (let b = 0; b < branches; b++) {
    const startIdx = Math.min(trunk.length - 4, 2 + Math.floor(rnd(0, trunk.length * 0.62)));
    const a = trunk[startIdx];
    const dirAngle = rnd(0, Math.PI * 2);
    const reach = rnd(4.2, 8.8);
    const drop = rnd(5.5, 11.5);
    const end = new THREE.Vector3(
      a.x + Math.cos(dirAngle) * reach,
      Math.max(to.y + 0.4, a.y - drop),
      a.z + Math.sin(dirAngle) * reach,
    );
    const forkPts = jaggedPath(a, end, 6, 1.15);
    addBoltChain(g, forkPts, radius * 0.52, 0.18, coreMat, haloMat);

    // Sub-twig splitting off the fork
    if (b < 3) {
      const subStart = forkPts[2];
      const subA = dirAngle + rnd(-0.9, 0.9);
      const subEnd = new THREE.Vector3(
        subStart.x + Math.cos(subA) * rnd(2.2, 4.4),
        Math.max(to.y + 0.2, subStart.y - rnd(2.5, 5.2)),
        subStart.z + Math.sin(subA) * rnd(2.2, 4.4),
      );
      addBoltChain(g, jaggedPath(subStart, subEnd, 4, 0.55), radius * 0.28, 0.12, coreMat, haloMat);
    }
  }

  // Animate the bolt with realistic double-strike re-ionization flicker
  addVfxProp(g, mats, life, p => {
    const u = p.t / p.life;
    // Intense initial flash, brief dip, dramatic secondary re-strike around u = 0.24, then crackling decay
    const restrike = Math.exp(-Math.pow((u - 0.24) / 0.075, 2)) * 0.85;
    const baseEnv = Math.pow(Math.max(0, 1 - u), 1.45) + restrike * (1 - u);
    const crackle = Math.random() < 0.78 ? 1.0 : 0.32;
    const v = Math.min(1.35, baseEnv) * crackle;
    coreMat.uniforms.uOpacity.value = v;
    haloMat.uniforms.uOpacity.value = 0.62 * v;
    coronaMat.uniforms.uOpacity.value = 0.28 * Math.pow(Math.max(0, 1 - u), 1.2);
  });

  // Overhead swirling storm rift portal where the bolt rips through the clouds
  if (skyPortal) {
    const pMat = makeStormPortalMat(coreCol, glowCol, 0.9);
    const portal = new THREE.Mesh(PLANE, pMat);
    portal.rotation.x = Math.PI / 2;
    portal.position.set(top.x, top.y - 0.4, top.z);
    portal.scale.setScalar(2.5);
    addVfxProp(portal, [pMat], life + 0.35, (p, dt) => {
      const u = p.t / p.life;
      const open = Math.min(1, p.t / 0.08);
      portal.rotation.z += dt * 3.4;
      portal.scale.setScalar((3.2 + 5.2 * (1 - (1 - open) ** 3)) * (1 + u * 0.35));
      pMat.uniforms.uOpacity.value = 0.9 * (1 - u) ** 1.3;
    });
  }

  // Ground impact spectacle: scorch, double shockwave, plasma dome, crawling ground tendrils
  if (groundImpact) {
    const gy = surfaceY(to.x, to.z);
    const groundAt = new THREE.Vector3(to.x, gy + 0.09, to.z);

    // 1. Charred scorch decal on the ground
    const sMat = tagMat(new THREE.MeshBasicMaterial({
      map: scorchTex, transparent: true, opacity: 0.72, depthWrite: false,
    }), CLS.ground);
    const scorch = new THREE.Mesh(PLANE, sMat);
    scorch.rotation.x = -Math.PI / 2;
    scorch.rotation.z = rnd(0, Math.PI * 2);
    scorch.position.set(to.x, gy + 0.05, to.z);
    scorch.scale.setScalar(3.4);
    addVfxProp(scorch, [sMat], 3.2, p => {
      const fade = Math.min(1, (p.life - p.t) / 0.9);
      sMat.opacity = 0.72 * fade;
    });

    // 2. Double expanding electromagnetic shockwave rings
    const ringMat1 = makeShockRingMat(coreCol, glowCol, 0.95);
    const ring1 = new THREE.Mesh(PLANE, ringMat1);
    ring1.rotation.x = -Math.PI / 2;
    ring1.position.copy(groundAt);
    addVfxProp(ring1, [ringMat1], 0.48, p => {
      const u = p.t / p.life;
      const s = 0.8 + 7.2 * (1 - (1 - u) ** 3);
      ring1.scale.setScalar(s);
      ringMat1.uniforms.uOpacity.value = 0.95 * (1 - u) ** 1.3;
    });

    const ringMat2 = makeShockRingMat(glowCol, outerCol, 0.7);
    const ring2 = new THREE.Mesh(PLANE, ringMat2);
    ring2.rotation.x = -Math.PI / 2;
    ring2.position.set(to.x, gy + 0.13, to.z);
    addVfxProp(ring2, [ringMat2], 0.65, p => {
      const u = p.t / p.life;
      const s = 0.5 + 10.5 * (1 - (1 - u) ** 2.4);
      ring2.scale.setScalar(s);
      ringMat2.uniforms.uOpacity.value = 0.7 * (1 - u) ** 1.6;
    });

    // 3. Expanding Fresnel electromagnetic plasma dome
    const dMat = makeFresnelShellMat(coreCol, glowCol, 0.72, 2.2);
    const domeMesh = new THREE.Mesh(DOME_GEO, dMat);
    domeMesh.position.set(to.x, gy, to.z);
    addVfxProp(domeMesh, [dMat], 0.42, p => {
      const u = p.t / p.life, e = 1 - (1 - u) ** 3;
      const r = 0.3 + 3.6 * e;
      domeMesh.scale.set(r, r * (0.85 - 0.35 * u), r);
      dMat.uniforms.uOpacity.value = 0.72 * (1 - u) ** 1.5;
    });

    // 4. Jagged electric tendrils racing outward along the terrain
    spawnGroundTendrils(groundAt, coreCol, glowCol, 5, 3.8);
  }
}

/** Crawling electric tendrils radiating outward across the ground from an impact point */
export function spawnGroundTendrils(at: THREE.Vector3, coreCol = 0xffffff, glowCol = 0x76b8ff, count = 5, maxReach = 3.8) {
  const g = new THREE.Group();
  const cMat = makeVolumetricBeamMat(coreCol, glowCol, 0.95);
  const hMat = makeVolumetricBeamMat(glowCol, 0x3b68ff, 0.5);
  for (let i = 0; i < count; i++) {
    const baseAngle = (i / count) * Math.PI * 2 + rnd(-0.35, 0.35);
    const pts: THREE.Vector3[] = [at.clone()];
    let cur = at.clone();
    const segs = 5;
    for (let s = 1; s <= segs; s++) {
      const a = baseAngle + rnd(-0.45, 0.45);
      const step = (maxReach / segs) * rnd(0.75, 1.25);
      const nx = cur.x + Math.cos(a) * step;
      const nz = cur.z + Math.sin(a) * step;
      cur = new THREE.Vector3(nx, surfaceY(nx, nz) + rnd(0.08, 0.28), nz);
      pts.push(cur);
    }
    addBoltChain(g, pts, 0.055, 0.15, cMat, hMat);
  }
  addVfxProp(g, [cMat, hMat], 0.38, p => {
    const u = p.t / p.life;
    const flick = Math.random() < 0.75 ? 1 : 0.25;
    cMat.uniforms.uOpacity.value = (1 - u) * flick;
    hMat.uniforms.uOpacity.value = 0.5 * (1 - u) * flick;
  });
}

/** Volumetric jagged lightning arc between any two 3D points (chain lightning, fissures, iaijutsu trails) */
export function spawnMiniArc(
  a: THREE.Vector3,
  b: THREE.Vector3,
  coreCol = 0xffffff,
  glowCol = 0x7ec8ff,
  opts: { steps?: number; spread?: number; radius?: number; life?: number; fork?: boolean } = {},
) {
  const g = new THREE.Group();
  const cMat = makeVolumetricBeamMat(coreCol, glowCol, 0.98);
  const hMat = makeVolumetricBeamMat(glowCol, 0x3b68ff, 0.48);
  const pts = jaggedPath(a, b, opts.steps ?? 7, opts.spread ?? 0.55);
  const r = opts.radius ?? 0.05;
  addBoltChain(g, pts, r, 0.65, cMat, hMat);
  if (opts.fork && pts.length > 4) {
    const mid = pts[Math.floor(pts.length * 0.45)];
    const off = new THREE.Vector3(rnd(-1.4, 1.4), rnd(-0.9, 1.1), rnd(-1.4, 1.4));
    addBoltChain(g, jaggedPath(mid, mid.clone().add(off), 3, 0.35), r * 0.55, 0.2, cMat, hMat);
  }
  addVfxProp(g, [cMat, hMat], opts.life ?? 0.3, p => {
    const u = p.t / p.life;
    const flick = Math.random() < 0.8 ? 1 : 0.28;
    cMat.uniforms.uOpacity.value = (1 - u) * flick;
    hMat.uniforms.uOpacity.value = 0.48 * (1 - u) * flick;
  });
}

/** Pulsing electric targeting seal + thin ionization beam on an enemy about to be struck by lightning */
export function spawnLightningTelegraph(targetPos: THREE.Vector3, duration: number, color = 0xaacbff) {
  const gy = surfaceY(targetPos.x, targetPos.z);
  const sealMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color, transparent: true, opacity: 0.78,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const seal = new THREE.Mesh(PLANE, sealMat);
  seal.rotation.x = -Math.PI / 2;
  seal.position.set(targetPos.x, gy + 0.1, targetPos.z);
  seal.scale.setScalar(0.5);

  const beamMat = makeEnergyPillarMat(0xffffff, color, 0.45);
  const ionBeam = new THREE.Mesh(BOLT_SEG, beamMat);
  ionBeam.position.set(targetPos.x, gy + 14, targetPos.z);
  ionBeam.scale.set(0.14, 28, 0.14);

  const group = new THREE.Group();
  group.add(seal, ionBeam);

  addVfxProp(group, [sealMat, beamMat], duration, (p, dt) => {
    const u = Math.min(1, p.t / p.life);
    const ty = surfaceY(targetPos.x, targetPos.z);
    seal.position.set(targetPos.x, ty + 0.1, targetPos.z);
    seal.rotation.z += dt * (4 + u * 8);
    // Contracts tightly onto the target right before impact
    seal.scale.setScalar(2.6 - 1.2 * u);
    sealMat.opacity = (0.35 + 0.6 * u) * (0.85 + 0.15 * Math.sin(p.t * 45));

    ionBeam.position.set(targetPos.x, ty + 14, targetPos.z);
    const bw = 0.08 + 0.16 * u * u;
    ionBeam.scale.set(bw, 28, bw);
    beamMat.uniforms.uOpacity.value = (0.2 + 0.65 * u) * (Math.random() < 0.85 ? 1 : 0.45);
  });
}

/** Wide dramatic storm cloud canopy overhead during Rayo de Raijin */
export function spawnStormCanopy(center: THREE.Vector3, duration = 1.4, color = 0x76b8ff) {
  const mat = makeStormPortalMat(0xdbeeff, color, 0.72);
  const disc = new THREE.Mesh(PLANE, mat);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(center.x, center.y + 30, center.z);
  disc.scale.setScalar(4);
  addVfxProp(disc, [mat], duration, (p, dt) => {
    const open = Math.min(1, p.t / 0.18);
    const close = Math.min(1, (p.life - p.t) / 0.45);
    disc.rotation.z += dt * 1.4;
    disc.scale.setScalar(6 + 22 * (1 - (1 - open) ** 3));
    mat.uniforms.uOpacity.value = 0.72 * Math.min(open, close) * (0.85 + 0.15 * Math.sin(p.t * 28));
  });
}

// Persistent fire light for Anillo de Brasas (always in the scene so zero shader recompiles)
const fireRingLight = new THREE.PointLight(0xff741e, 0, 42, 1.45);
scene.add(fireRingLight);
let fireLightT = 0, fireLightMax = 0.85, fireLightPeak = 0;

/** Cinematic ignition spectacle for Anillo de Brasas:
 *  - Expanding incandescent fireball Fresnel dome
 *  - Charred scorch decal at the epicenter that lingers and fades
 *  - Dual blazing heat-shockwave rings racing along the ground
 *  - Flickering warm PointLight illuminating the surrounding terrain & combatants */
export function spawnFireRingIgnition(origin: THREE.Vector3, maxRadius = 10) {
  const gy = surfaceY(origin.x, origin.z);

  // 1. Dynamic flickering firelight at the epicenter
  fireRingLight.position.set(origin.x, gy + 2.4, origin.z);
  fireRingLight.color.set(0xff7a22);
  fireLightPeak = 135;
  fireLightT = fireLightMax = 0.92;

  // 2. Charred ground scorch decal at the epicenter
  const sMat = tagMat(new THREE.MeshBasicMaterial({
    map: scorchTex, transparent: true, opacity: 0.78, depthWrite: false,
  }), CLS.ground);
  const scorch = new THREE.Mesh(PLANE, sMat);
  scorch.rotation.x = -Math.PI / 2;
  scorch.rotation.z = rnd(0, Math.PI * 2);
  scorch.position.set(origin.x, gy + 0.05, origin.z);
  scorch.scale.setScalar(1.2);
  addVfxProp(scorch, [sMat], 3.2, p => {
    const grow = Math.min(1, p.t / 0.28);
    scorch.scale.setScalar(1.4 + 6.4 * (1 - (1 - grow) ** 3));
    const fade = Math.min(1, (p.life - p.t) / 1.1);
    sMat.opacity = 0.76 * fade;
  });

  // 3. Expanding molten Fresnel fireball dome that erupts at cast & dissolves into the fire ring
  const domeMat = makeFresnelShellMat(0xfff5c8, 0xff4500, 0.85, 1.9);
  const dome = new THREE.Mesh(DOME_GEO, domeMat);
  dome.position.set(origin.x, gy + 0.02, origin.z);
  addVfxProp(dome, [domeMat], 0.36, p => {
    const u = p.t / p.life;
    const e = 1 - (1 - u) ** 2.6;
    const r = 0.5 + 4.4 * e;
    dome.scale.set(r, r * (0.95 - 0.52 * u), r);
    domeMat.uniforms.uOpacity.value = 0.85 * (1 - u) ** 1.45;
  });

  // 4. Razor-bright white-gold primary heat shockwave racing ahead of the flames
  const ringMat1 = makeShockRingMat(0xfff6cf, 0xff6b1a, 0.96);
  const ring1 = new THREE.Mesh(PLANE, ringMat1);
  ring1.rotation.x = -Math.PI / 2;
  ring1.position.set(origin.x, gy + 0.11, origin.z);
  addVfxProp(ring1, [ringMat1], 0.52, p => {
    const u = p.t / p.life;
    const s = 1.2 + (maxRadius * 2.18) * (1 - (1 - u) ** 2.2);
    ring1.scale.setScalar(s);
    ringMat1.uniforms.uOpacity.value = 0.96 * (1 - u) ** 1.35;
  });

  // 5. Secondary deep ember-red heat wash trailing behind
  const ringMat2 = makeShockRingMat(0xff9b38, 0xc81c00, 0.72);
  const ring2 = new THREE.Mesh(PLANE, ringMat2);
  ring2.rotation.x = -Math.PI / 2;
  ring2.position.set(origin.x, gy + 0.08, origin.z);
  addVfxProp(ring2, [ringMat2], 0.74, p => {
    const u = p.t / p.life;
    const s = 0.8 + (maxRadius * 1.98) * (1 - (1 - u) ** 1.85);
    ring2.scale.setScalar(s);
    ringMat2.uniforms.uOpacity.value = 0.72 * (1 - u) ** 1.5;
  });
}

// ------------------------------------------------------------ fluid water shaders & tidal splash VFX
const WATER_CAUSTIC_GLSL = /* glsl */`
float waterCaustic(vec2 uv, float t) {
  vec2 p1 = uv * 6.0 + vec2(t * 0.9, -t * 1.6);
  vec2 p2 = uv * 9.5 + vec2(-t * 1.3, -t * 2.1);
  float a = abs(vnoise(p1) * 2.0 - 1.0);
  float b = abs(vnoise(p2) * 2.0 - 1.0);
  float c = pow(1.0 - min(a, b), 3.4);
  return clamp(c, 0.0, 1.0);
}
`;

/** Volumetric breaking tsunami / tidal wave body shader:
 *  Deep ocean indigo base -> luminous cerulean swell -> dancing caustics -> lacy white sea-foam at the curling crest. */
export function makeWaterWaveBodyMat(opts: { opacity?: number; seed?: number; fanFade?: boolean } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opts.opacity ?? 0.94 },
      uSeed: { value: opts.seed ?? 0 },
      uFanFade: { value: opts.fanFade === false ? 0.0 : 1.0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      ${WATER_CAUSTIC_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSeed;
      uniform float uFanFade;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float t = uTime * 1.45 + uSeed;
        // Flowing water coordinates climbing up the wave face toward the breaking lip
        vec2 flowUv = vec2(vUv.x * 4.2, vUv.y * 1.6);
        float swell = vnoise(flowUv * vec2(2.4, 3.2) + vec2(sin(t * 0.7) * 0.4, -t * 2.8));
        float detail = vnoise(flowUv * vec2(6.5, 8.0) + vec2(swell * 1.3, -t * 5.2));
        float caust = waterCaustic(flowUv + vec2(swell * 0.25, 0.0), t);

        // Fresnel moonlight sheen across curved water surface
        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 2.1);

        // Deep abyssal blue -> rich ocean cerulean -> luminous aqua -> frothy white sea-foam lip
        vec3 deepCol = vec3(0.03, 0.20, 0.56);
        vec3 midCol  = vec3(0.09, 0.58, 0.94);
        vec3 aquaCol = vec3(0.32, 0.88, 1.00);
        vec3 foamCol = vec3(0.95, 0.99, 1.00);

        float grad = clamp(vUv.y * 1.1 + swell * 0.22 - 0.08, 0.0, 1.0);
        vec3 col = mix(deepCol, midCol, smoothstep(0.0, 0.48, grad));
        col = mix(col, aquaCol, smoothstep(0.42, 0.84, grad));

        // Shimmering caustic web & specular water streaks
        col += vec3(0.45, 0.92, 1.0) * caust * (0.42 + 0.45 * vUv.y);
        col += vec3(0.75, 0.96, 1.0) * fresnel * 0.65;

        // Churning lacy white sea-foam at the curling crest (vUv.y > 0.66) + subtle trough foam
        float foamNoise = detail * 0.65 + swell * 0.35;
        float crestFoam = smoothstep(0.60, 0.90, vUv.y + (foamNoise - 0.45) * 0.28);
        float lace = smoothstep(0.46, 0.78, foamNoise) * smoothstep(0.32, 0.78, vUv.y);
        float foam = clamp(crestFoam + lace * 0.55, 0.0, 1.0);
        col = mix(col, foamCol, foam);

        // Soft feathery edge fade at fan tips & ragged foam lip breakup at the very top
        float fanMask = mix(1.0, pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 0.48), uFanFade);
        float baseFade = smoothstep(0.0, 0.14, vUv.y);
        float topEdge = smoothstep(1.0, 0.84 - foamNoise * 0.12, vUv.y);
        float alpha = clamp((0.68 + 0.32 * foam + 0.18 * fresnel) * baseFade * topEdge * fanMask * uOpacity, 0.0, 1.0);
        if (alpha < 0.01) discard;
        gl_FragColor = vec4(col * (1.05 + 0.35 * foam), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Trailing wet tidal wash hugging the ground behind a wave: dancing caustics + receding sea-foam streaks */
export function makeWaterGroundMat(opacity = 0.85) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      ${WATER_CAUSTIC_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float t = uTime * 1.4;
        vec2 q = vec2(vUv.x * 5.5, vUv.y * 2.2);
        float n = vnoise(q * vec2(2.2, 3.0) + vec2(0.0, -t * 2.6));
        float streaks = vnoise(vec2(vUv.x * 16.0, vUv.y * 5.0 - t * 4.5));
        float caust = waterCaustic(q, t);

        // Leading edge (vUv.y near 1) is bright white surf; trailing wash is glowing caustic turquoise
        float leadSurf = exp(-pow((vUv.y - 0.86) / 0.11, 2.0)) * (0.65 + 0.5 * streaks);
        float trailFade = smoothstep(0.0, 0.45, vUv.y) * smoothstep(1.0, 0.91, vUv.y);
        float fanMask = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 0.55);

        vec3 waterCol = mix(vec3(0.06, 0.42, 0.86), vec3(0.32, 0.88, 1.0), caust * 0.75 + n * 0.35);
        vec3 col = mix(waterCol, vec3(0.95, 0.99, 1.0), clamp(leadSurf + caust * 0.35, 0.0, 1.0));
        float a = clamp((trailFade * (0.42 + 0.45 * caust + 0.22 * streaks) + leadSurf * 0.85) * fanMask * uOpacity, 0.0, 1.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col * 1.25 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Instanced 3D curling water spray plumes & foam claws leaping off a breaking wave or splash crown */
export function makeWaterSplashPlumeMat(opacity = 0.9) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      attribute float aPhase;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        vUv = uv;
        vPhase = aPhase;
        vec3 p = position;
        // Organic liquid whip along the arching spray plume
        float t = aPhase + p.y * 3.5;
        p.x += sin(t * 2.2) * 0.08 * p.y;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      varying float vPhase;
      void main() {
        float x = vUv.x * 2.0 - 1.0;
        float y = vUv.y;
        // Tapered water-claw silhouette: wider liquid base tapering into lacy droplets at the tip
        float halfW = mix(0.88, 0.18, pow(y, 0.85));
        float n1 = vnoise(vec2(vUv.x * 5.0 + vPhase, y * 5.0 - uTime * 7.5));
        float n2 = vnoise(vec2(vUv.x * 11.0 - vPhase, y * 9.0 - uTime * 11.0));
        float spray = n1 * 0.6 + n2 * 0.4;
        float shape = smoothstep(halfW, halfW * 0.25, abs(x) + (spray - 0.5) * 0.35);
        float tipFade = smoothstep(1.0, 0.68, y) * smoothstep(0.0, 0.14, y);
        // Translucent cyan water body turning into pure white frothy foam at the tip
        vec3 col = mix(vec3(0.18, 0.72, 1.0), vec3(0.95, 0.99, 1.0), smoothstep(0.28, 0.82, y + spray * 0.25));
        float a = clamp(shape * tipFade * (0.55 + 0.55 * spray) * uOpacity, 0.0, 1.0);
        if (a < 0.02) discard;
        gl_FragColor = vec4(col * 1.25 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Vertex-displaced living liquid water sphere shader (for Esfera de Agua):
 *  Physically undulates and ripples in 3D with deep sapphire core, dancing caustics, and glossy Fresnel rim. */
export function makeLiquidOrbMat(opacity = 0.92) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      varying float vDisp;
      void main() {
        float t = uTime * 5.2;
        vec3 p = position;
        // Multi-directional harmonic liquid sloshing & surface ripples
        float w1 = sin(p.x * 4.5 + t) * cos(p.y * 4.2 - t * 0.85);
        float w2 = sin(p.z * 5.4 - t * 1.2) * sin(p.y * 3.6 + t * 0.7);
        float disp = (w1 * 0.6 + w2 * 0.4) * 0.11;
        p += normal * disp;
        vDisp = disp;
        vLocalPos = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        // Perturb normal slightly to catch moving liquid highlights
        vec3 nPerturb = normalize(normal + vec3(w2, w1, -w1) * 0.28);
        vNormalW = normalize(mat3(modelMatrix) * nPerturb);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      ${WATER_CAUSTIC_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      varying float vDisp;
      void main() {
        vec3 N = normalize(vNormalW);
        vec3 V = normalize(vViewDir);
        float ndv = abs(dot(N, V));
        float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 1.9);

        // Spherical caustic projection flowing around the living water orb
        vec2 sphUv = vec2(atan(vLocalPos.z, vLocalPos.x) * 0.35, vLocalPos.y * 0.65);
        float caust = waterCaustic(sphUv, uTime * 1.6);
        float foamCrest = smoothstep(0.04, 0.11, vDisp) * (0.55 + 0.45 * caust);

        vec3 deepCol = vec3(0.04, 0.26, 0.72);
        vec3 aquaCol = vec3(0.22, 0.82, 1.00);
        vec3 rimCol  = vec3(0.85, 0.98, 1.00);

        vec3 col = mix(deepCol, aquaCol, clamp(0.32 + caust * 0.65 + fresnel * 0.55, 0.0, 1.0));
        col = mix(col, rimCol, clamp(fresnel * 0.85 + foamCrest * 0.75, 0.0, 1.0));
        float a = clamp((0.68 + 0.32 * fresnel + 0.2 * foamCrest) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * (1.15 + 0.45 * fresnel), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Expanding circular pool of liquid water with multiple concentric traveling ripples & caustic reflections */
export function makeWaterRipplePoolMat(opacity = 0.9) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
      uProgress: { value: 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      ${WATER_CAUSTIC_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      uniform float uProgress;
      varying vec2 vUv;
      void main() {
        vec2 p = vUv * 2.0 - 1.0;
        float r = length(p);
        if (r > 1.0) discard;
        float ang = atan(p.y, p.x);
        // Three concentric traveling water ripples radiating outward
        float rip1 = exp(-pow((r - 0.88) / 0.05, 2.0));
        float rip2 = exp(-pow((r - 0.64) / 0.045, 2.0)) * 0.72;
        float rip3 = exp(-pow((r - 0.40) / 0.04, 2.0)) * 0.48;
        float ripples = rip1 + rip2 + rip3;

        float caust = waterCaustic(p * 1.4, uTime * 1.5);
        float splashFoam = vnoise(vec2(ang * 5.0, r * 8.0 - uTime * 6.0));
        float pool = smoothstep(1.0, 0.72, r) * (0.28 + 0.55 * caust);

        vec3 waterCol = mix(vec3(0.06, 0.46, 0.92), vec3(0.35, 0.90, 1.0), caust);
        vec3 col = mix(waterCol, vec3(0.95, 0.99, 1.0), clamp(ripples * (0.75 + 0.35 * splashFoam), 0.0, 1.0));
        float a = clamp((pool * 0.65 + ripples * 0.95) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * 1.25 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

// Sculpted curved liquid plume geometry for crown splashes
const SPLASH_JET_GEO = (() => {
  const g = new THREE.PlaneGeometry(0.9, 1.0, 3, 6);
  g.translate(0, 0.5, 0);
  const pos = g.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    // Arching outward parabola like a real water splash crown
    const arch = y * y * 0.55;
    const cup = (0.12 - x * x * 0.3) * Math.sin(y * Math.PI);
    pos.setZ(i, arch + cup);
  }
  g.computeVertexNormals();
  return g;
})();
const _splashDummy = new THREE.Object3D();

/** Spawns a cinematic crashing tidal crown splash at `at` (for Esfera de Agua impact & Marea Lunar surge):
 *  - Expanding concentric water-ripple caustic pool on the ground
 *  - 14 ballistic 3D liquid crown jets arching outward & cascading down
 *  - Translucent foaming hydro-dome swelling and breaking into sea-spray */
export function spawnWaterSplashCrown(at: THREE.Vector3, radius = 4.5) {
  const gy = surfaceY(at.x, at.z);

  // 1. Expanding concentric water-ripple caustic pool on the ground
  const poolMat = makeWaterRipplePoolMat(0.94);
  const pool = new THREE.Mesh(PLANE, poolMat);
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(at.x, gy + 0.09, at.z);
  addVfxProp(pool, [poolMat], 0.72, p => {
    const u = p.t / p.life;
    const e = 1 - (1 - u) ** 2.6;
    pool.scale.setScalar(0.8 + radius * 2.55 * e);
    poolMat.uniforms.uProgress.value = u;
    poolMat.uniforms.uOpacity.value = 0.94 * (1 - u) ** 1.35;
  });

  // 2. Foaming translucent hydro-dome swelling outward
  const domeMat = makeWaterWaveBodyMat({ opacity: 0.78, seed: Math.random() * 10, fanFade: false });
  const hydroDome = new THREE.Mesh(DOME_GEO, domeMat);
  hydroDome.position.set(at.x, gy, at.z);
  addVfxProp(hydroDome, [domeMat], 0.52, p => {
    const u = p.t / p.life, e = 1 - (1 - u) ** 2.8;
    const r = 0.35 + radius * 0.95 * e;
    // Rises quickly into a liquid bell, then collapses downward like real water under gravity
    const h = r * (0.92 * Math.sin(Math.min(1, u * 1.45) * Math.PI * 0.5) * (1 - 0.52 * u * u));
    hydroDome.scale.set(r, Math.max(0.05, h), r);
    domeMat.uniforms.uOpacity.value = 0.78 * (1 - u) ** 1.4;
  });

  // 3. 14 ballistic 3D water crown splash plumes arching outward and splashing down
  const jetCount = 14;
  const jetGeo = SPLASH_JET_GEO.clone();
  const phases = new Float32Array(jetCount);
  const seeds = Array.from({ length: jetCount }, (_, i) => {
    phases[i] = i * 1.9 + Math.random() * 6.28;
    return {
      angle: (i / jetCount) * Math.PI * 2 + rnd(-0.14, 0.14),
      dist: radius * rnd(0.55, 0.92),
      peakH: radius * rnd(0.52, 0.85),
      width: rnd(0.75, 1.35),
      pitch: rnd(0.18, 0.42),
    };
  });
  jetGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const jetMat = makeWaterSplashPlumeMat(0.92);
  const jets = new THREE.InstancedMesh(jetGeo, jetMat, jetCount);
  jets.frustumCulled = false;

  addVfxProp(jets, [jetMat], 0.58, p => {
    const u = p.t / p.life;
    // Parabolic ballistic rise & fall of a real liquid crown splash
    const rise = Math.sin(Math.min(1, u * 1.15) * Math.PI * 0.82);
    const spread = 1 - (1 - u) ** 2.2;
    for (let i = 0; i < jetCount; i++) {
      const s = seeds[i];
      const r = 0.35 + s.dist * spread;
      const x = at.x + Math.cos(s.angle) * r;
      const z = at.z + Math.sin(s.angle) * r;
      const y = surfaceY(x, z) + 0.04;
      _splashDummy.position.set(x, y, z);
      _splashDummy.rotation.set(s.pitch + u * 0.55, -s.angle + Math.PI * 0.5, 0, 'YXZ');
      _splashDummy.scale.set(s.width * (0.55 + 0.65 * spread), Math.max(0.08, s.peakH * rise), 1);
      _splashDummy.updateMatrix();
      jets.setMatrixAt(i, _splashDummy.matrix);
    }
    jets.instanceMatrix.needsUpdate = true;
    jetMat.uniforms.uOpacity.value = 0.92 * (1 - u) ** 1.25;
  }, [jetGeo]);
}

// ------------------------------------------------------------ wind, fire-orb, lightning-orb, bell & sakura shaders
/** Aerodynamic razor-wind gale shader (Corte del Vendaval & Ciclón de Viento):
 *  High-speed slipstream shear lines, razor-white pressurized leading edge, translucent emerald-jade tail. */
export function makeWindGaleMat(opts: { opacity?: number; seed?: number } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opts.opacity ?? 0.92 },
      uSeed: { value: opts.seed ?? 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSeed;
      varying vec2 vUv;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      void main() {
        float t = uTime * 3.8 + uSeed;
        // High-speed aerodynamic slipstream streaks shooting backward from the razor edge
        float s1 = vnoise(vec2(vUv.x * 14.0, vUv.y * 5.0 - t * 3.2));
        float s2 = vnoise(vec2(vUv.x * 28.0 + 2.4, vUv.y * 9.0 - t * 5.8));
        float shear = s1 * 0.6 + s2 * 0.4;

        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 1.8);

        // Razor-hot pressurized leading edge near vUv.y = 0.85, trailing emerald vacuum wake behind
        float lead = exp(-pow((vUv.y - 0.85) / 0.08, 2.0));
        float fanMask = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 0.45);
        float trailFade = smoothstep(0.0, 0.35, vUv.y) * smoothstep(1.0, 0.90, vUv.y);

        vec3 deepJade = vec3(0.06, 0.62, 0.46);
        vec3 mintWind = vec3(0.42, 1.00, 0.82);
        vec3 razorCol = vec3(0.95, 1.00, 0.98);

        vec3 col = mix(deepJade, mintWind, clamp(shear * 0.85 + vUv.y * 0.45, 0.0, 1.0));
        col = mix(col, razorCol, clamp(lead * 1.25 + fresnel * 0.45, 0.0, 1.0));

        float a = clamp((trailFade * (0.35 + 0.65 * shear) + lead * 1.15) * fanMask * uOpacity, 0.0, 1.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col * (1.25 + 0.55 * lead) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Acoustic bronze sound-wave shader (Campana del Templo):
 *  Standing harmonic sine-wave bands & shimmering golden-bronze dharma resonance. */
export function makeAcousticWaveMat(opts: { opacity?: number; seed?: number } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opts.opacity ?? 0.9 },
      uSeed: { value: opts.seed ?? 0 },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      uniform float uSeed;
      varying vec2 vUv;
      void main() {
        float t = uTime * 2.4 + uSeed;
        // Standing harmonic acoustic bands vibrating vertically
        float harmonic = sin(vUv.y * 22.0 - t * 9.0) * 0.5 + 0.5;
        float ripple = sin(vUv.x * 37.699 + t * 5.0) * 0.5 + 0.5;
        float shimmer = vnoise(vec2(vUv.x * 16.0, vUv.y * 6.0 - t * 3.0));
        float band = pow(harmonic, 2.2) * (0.65 + 0.35 * ripple);

        float vFade = smoothstep(0.0, 0.16, vUv.y) * smoothstep(1.0, 0.25, vUv.y);
        float rim = exp(-pow((vUv.y - 0.78) / 0.09, 2.0));

        vec3 bronze = vec3(0.82, 0.48, 0.12);
        vec3 gold   = vec3(1.00, 0.82, 0.38);
        vec3 core   = vec3(1.00, 0.98, 0.88);

        vec3 col = mix(bronze, gold, clamp(band * 0.9 + shimmer * 0.35, 0.0, 1.0));
        col = mix(col, core, clamp(rim * 1.1 + pow(band, 3.0) * 0.5, 0.0, 1.0));

        float a = clamp((vFade * (0.28 + 0.65 * band) + rim * 0.95) * uOpacity, 0.0, 1.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col * 1.3 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Swirling sakura blossom wind-curtain shader (Tormenta de Pétalos):
 *  Silky rose-pink & moonlit-white helical wind ribbons swirling radially. */
export function makePetalVortexMat(opacity = 0.86) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec2 vUv;
      void main() {
        float t = uTime * 2.2;
        float ribbon = sin(vUv.x * 25.1327 + vUv.y * 9.0 - t * 8.0) * 0.5 + 0.5;
        float silk = vnoise(vec2(vUv.x * 12.0 - t * 2.5, vUv.y * 5.0 - t * 3.5));
        float band = pow(ribbon, 1.9) * (0.45 + 0.65 * silk);
        float vFade = smoothstep(0.0, 0.18, vUv.y) * smoothstep(1.0, 0.2, vUv.y);

        vec3 rose  = vec3(1.00, 0.42, 0.68);
        vec3 blush = vec3(1.00, 0.78, 0.88);
        vec3 white = vec3(1.00, 0.96, 0.98);

        vec3 col = mix(rose, blush, clamp(band + silk * 0.3, 0.0, 1.0));
        col = mix(col, white, smoothstep(0.65, 0.98, band));

        float a = clamp(vFade * (0.22 + 0.85 * band) * uOpacity, 0.0, 1.0);
        if (a < 0.01) discard;
        gl_FragColor = vec4(col * 1.3 * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Vertex-displaced living solar fireball shader (for Bola de Fuego):
 *  Physically roiling molten plasma surface with white-gold convection core, orange flames & crimson crust. */
export function makeSolarOrbMat(opacity = 0.96) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      varying float vDisp;
      void main() {
        float t = uTime * 6.5;
        vec3 p = position;
        float f1 = sin(p.x * 5.2 + t) * cos(p.y * 5.0 - t * 1.1);
        float f2 = sin(p.z * 6.4 - t * 1.4) * sin(p.y * 4.5 + t * 0.9);
        float disp = (f1 * 0.55 + f2 * 0.45) * 0.13;
        p += normal * disp;
        vDisp = disp;
        vLocalPos = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normalize(normal + vec3(f2, -f1, f1) * 0.25));
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      varying float vDisp;
      void main() {
        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 1.6);
        vec2 uv = vec2(atan(vLocalPos.z, vLocalPos.x) * 0.5, vLocalPos.y * 0.85);
        float n1 = vnoise(uv * 5.0 - vec2(0.0, uTime * 4.2));
        float n2 = vnoise(uv * 11.0 + vec2(uTime * 2.4, -uTime * 6.5));
        float heat = clamp(n1 * 0.6 + n2 * 0.4 + vDisp * 2.8 + 0.12, 0.0, 1.0);

        vec3 crimson = vec3(0.88, 0.12, 0.02);
        vec3 orange  = vec3(1.00, 0.46, 0.06);
        vec3 gold    = vec3(1.00, 0.88, 0.36);
        vec3 white   = vec3(1.00, 0.99, 0.90);

        vec3 col = mix(crimson, orange, smoothstep(0.12, 0.48, heat));
        col = mix(col, gold, smoothstep(0.45, 0.76, heat));
        col = mix(col, white, smoothstep(0.75, 0.98, heat + fresnel * 0.25));
        float a = clamp((0.78 + 0.22 * fresnel) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * (1.28 + 0.55 * fresnel), a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Vertex-displaced high-voltage plasma sphere shader (for Orbe de Rayo):
 *  Crackling electric veins arcing across a jagged pulsing plasma core. */
export function makePlasmaOrbMat(opacity = 0.95) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uTime: vfxTime,
      uOpacity: { value: opacity },
    },
    vertexShader: /* glsl */`
      uniform float uTime;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        float t = uTime * 16.0;
        vec3 p = position;
        float snap = sin(p.x * 8.0 + t) * cos(p.y * 7.5 - t * 1.2) * sin(p.z * 8.5 + t * 0.7);
        p += normal * snap * 0.09;
        vLocalPos = p;
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vNormalW = normalize(mat3(modelMatrix) * normal);
        vViewDir = normalize(cameraPosition - wp.xyz);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */`
      ${NOISE_GLSL}
      uniform float uTime;
      uniform float uOpacity;
      varying vec3 vNormalW;
      varying vec3 vViewDir;
      varying vec3 vLocalPos;
      void main() {
        float ndv = abs(dot(normalize(vNormalW), normalize(vViewDir)));
        float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 1.75);
        vec2 uv = vec2(atan(vLocalPos.z, vLocalPos.x) * 0.65, vLocalPos.y * 1.1);
        float a1 = abs(vnoise(uv * 6.0 + vec2(uTime * 5.0, -uTime * 7.0)) * 2.0 - 1.0);
        float a2 = abs(vnoise(uv * 11.0 + vec2(-uTime * 8.0, uTime * 4.5)) * 2.0 - 1.0);
        float arc = pow(1.0 - min(a1, a2), 5.0);

        vec3 indigo = vec3(0.12, 0.28, 0.95);
        vec3 cyan   = vec3(0.46, 0.86, 1.00);
        vec3 white  = vec3(1.00, 1.00, 1.00);

        vec3 col = mix(indigo, cyan, clamp(fresnel * 1.15 + arc * 0.6, 0.0, 1.0));
        col = mix(col, white, clamp(arc * 1.35 + pow(fresnel, 2.4) * 0.75, 0.0, 1.0));
        float a = clamp((0.55 + 0.45 * fresnel + 0.55 * arc) * uOpacity, 0.0, 1.0);
        gl_FragColor = vec4(col * (1.35 + 0.9 * arc) * a, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return tagMat(mat, CLS.fx);
}

/** Majestic phantom Japanese temple bell (bonshō) that rings overhead during Campana del Templo */
const BELL_BODY_GEO = new THREE.CylinderGeometry(0.62, 0.98, 1.85, 20, 1, true);
const BELL_CROWN_GEO = new THREE.SphereGeometry(0.62, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2);
const BELL_LIP_GEO = new THREE.TorusGeometry(0.98, 0.08, 8, 28);

export function spawnPhantomBell(origin: THREE.Vector3) {
  const gy = surfaceY(origin.x, origin.z);
  const g = new THREE.Group();
  const bodyMat = makeFresnelShellMat(0xfff6d2, 0xffb83c, 0.85, 1.7);
  const lipMat = makeAcousticWaveMat({ opacity: 0.95 });

  const body = new THREE.Mesh(BELL_BODY_GEO, bodyMat);
  body.position.y = 0.92;
  const crown = new THREE.Mesh(BELL_CROWN_GEO, bodyMat);
  crown.position.y = 1.84;
  const lip = new THREE.Mesh(BELL_LIP_GEO, lipMat);
  lip.rotation.x = Math.PI / 2;
  lip.position.y = 0.04;

  // Golden mandala halo behind the bell
  const haloMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color: 0xffcf6e, transparent: true, opacity: 0.8,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const halo = new THREE.Mesh(PLANE, haloMat);
  halo.rotation.x = -Math.PI / 2;
  halo.position.y = 0.08;
  halo.scale.setScalar(3.4);

  g.add(body, crown, lip, halo);
  g.position.set(origin.x, gy + 2.6, origin.z);
  g.scale.setScalar(0.2);

  addVfxProp(g, [bodyMat, lipMat, haloMat], 1.15, (p, dt) => {
    const u = p.t / p.life;
    const open = Math.min(1, p.t / 0.14);
    const fade = Math.min(1, (p.life - p.t) / 0.45);
    // Swells into place and vibrates softly as it resonates
    const vib = 1 + Math.sin(p.t * 48) * 0.04 * (1 - u);
    const sc = (0.2 + 1.05 * (1 - (1 - open) ** 3)) * vib;
    g.scale.setScalar(sc);
    g.position.y = gy + 2.6 + u * 0.9;
    halo.rotation.z += dt * 1.8;
    bodyMat.uniforms.uOpacity.value = 0.85 * fade;
    lipMat.uniforms.uOpacity.value = 0.95 * fade;
    haloMat.opacity = 0.8 * fade;
  });
}

/** Fiery crown detonation for Bola de Fuego (sculpted leaping flames + molten scorch + shockwave) */
export function spawnFireOrbDetonation(at: THREE.Vector3, radius = 4.2) {
  const gy = surfaceY(at.x, at.z);
  // 1. Charred scorch decal
  const sMat = tagMat(new THREE.MeshBasicMaterial({
    map: scorchTex, transparent: true, opacity: 0.72, depthWrite: false,
  }), CLS.ground);
  const scorch = new THREE.Mesh(PLANE, sMat);
  scorch.rotation.x = -Math.PI / 2;
  scorch.rotation.z = rnd(0, Math.PI * 2);
  scorch.position.set(at.x, gy + 0.05, at.z);
  scorch.scale.setScalar(radius * 1.45);
  addVfxProp(scorch, [sMat], 2.8, p => {
    sMat.opacity = 0.72 * Math.min(1, (p.life - p.t) / 0.85);
  });

  // 2. Incandescent magma dome
  const dMat = makeFresnelShellMat(0xfff5c0, 0xff5a12, 0.82, 1.6);
  const dom = new THREE.Mesh(DOME_GEO, dMat);
  dom.position.set(at.x, gy, at.z);
  addVfxProp(dom, [dMat], 0.48, p => {
    const u = p.t / p.life, e = 1 - (1 - u) ** 2.6;
    const r = 0.35 + radius * 1.02 * e;
    dom.scale.set(r, r * (0.88 - 0.32 * u), r);
    dMat.uniforms.uOpacity.value = 0.82 * (1 - u) ** 1.4;
  });

  // 3. 12 instanced 3D leaping flame tongues bursting outward in a fiery crown
  const count = 12;
  const tGeo = SPLASH_JET_GEO.clone();
  const phases = new Float32Array(count);
  const seeds = Array.from({ length: count }, (_, i) => {
    phases[i] = i * 2.1 + Math.random() * 6.28;
    return {
      angle: (i / count) * Math.PI * 2 + rnd(-0.15, 0.15),
      dist: radius * rnd(0.45, 0.88),
      height: radius * rnd(0.55, 0.92),
      width: rnd(0.85, 1.4),
    };
  });
  tGeo.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  const tMat = makeFireTongueMat(0.95);
  const flames = new THREE.InstancedMesh(tGeo, tMat, count);
  flames.frustumCulled = false;

  addVfxProp(flames, [tMat], 0.56, p => {
    const u = p.t / p.life;
    const rise = Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.78);
    const spread = 1 - (1 - u) ** 2.1;
    for (let i = 0; i < count; i++) {
      const s = seeds[i];
      const r = 0.3 + s.dist * spread;
      const x = at.x + Math.cos(s.angle) * r;
      const z = at.z + Math.sin(s.angle) * r;
      _splashDummy.position.set(x, surfaceY(x, z) + 0.04, z);
      _splashDummy.rotation.set(0.2 + u * 0.35, -s.angle + Math.PI * 0.5, 0, 'YXZ');
      _splashDummy.scale.set(s.width * (0.6 + 0.5 * spread), Math.max(0.1, s.height * rise), 1);
      _splashDummy.updateMatrix();
      flames.setMatrixAt(i, _splashDummy.matrix);
    }
    flames.instanceMatrix.needsUpdate = true;
    tMat.uniforms.uOpacity.value = 0.95 * (1 - u) ** 1.3;
  }, [tGeo]);

  // 4. Expanding double heat shockwave ring
  const rMat = makeShockRingMat(0xfff2ba, 0xff5a12, 0.95);
  const ring = new THREE.Mesh(PLANE, rMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(at.x, gy + 0.1, at.z);
  addVfxProp(ring, [rMat], 0.5, p => {
    const u = p.t / p.life;
    ring.scale.setScalar(0.8 + radius * 2.5 * (1 - (1 - u) ** 2.6));
    rMat.uniforms.uOpacity.value = 0.95 * (1 - u) ** 1.35;
  });
}

/** Pressurized aerodynamic wind burst (for Corte del Vendaval launch & Ciclón de Viento end) */
export function spawnWindGaleBurst(at: THREE.Vector3, forward: THREE.Vector3, scale = 1) {
  const gy = surfaceY(at.x, at.z);
  const rMat = makeShockRingMat(0xf0fff8, 0x4dffb8, 0.88);
  const ring = new THREE.Mesh(PLANE, rMat);
  ring.position.set(at.x, gy + 1.15, at.z);
  ring.lookAt(at.x + forward.x, gy + 1.15, at.z + forward.z);
  addVfxProp(ring, [rMat], 0.38, p => {
    const u = p.t / p.life;
    ring.scale.setScalar((0.6 + 4.4 * (1 - (1 - u) ** 2.6)) * scale);
    rMat.uniforms.uOpacity.value = 0.88 * (1 - u) ** 1.4;
  });

  const gMat = makeShockRingMat(0xc8ffe8, 0x26d496, 0.72);
  const gRing = new THREE.Mesh(PLANE, gMat);
  gRing.rotation.x = -Math.PI / 2;
  gRing.position.set(at.x, gy + 0.09, at.z);
  addVfxProp(gRing, [gMat], 0.48, p => {
    const u = p.t / p.life;
    gRing.scale.setScalar((0.8 + 5.8 * (1 - (1 - u) ** 2.4)) * scale);
    gMat.uniforms.uOpacity.value = 0.72 * (1 - u) ** 1.4;
  });
}

// ------------------------------------------------------------ per-frame update & cleanup
export function updateVfxArt(dt: number) {
  vfxTime.value += dt;
  if (fireLightT > 0) {
    fireLightT = Math.max(0, fireLightT - dt);
    const k = fireLightT / fireLightMax;
    const flick = 0.82 + 0.18 * Math.sin(vfxTime.value * 44.0);
    fireRingLight.intensity = fireLightPeak * k * k * flick;
  } else if (fireRingLight.intensity !== 0) {
    fireRingLight.intensity = 0;
  }
  for (let i = vfxProps.length - 1; i >= 0; i--) {
    const p = vfxProps[i];
    p.t += dt;
    if (p.t < p.life) p.tick(p, dt);
    if (p.t >= p.life) {
      vfxProps.splice(i, 1);
      disposeVfxProp(p);
    }
  }
}

export function clearVfxArt() {
  fireLightT = 0;
  fireRingLight.intensity = 0;
  for (const p of vfxProps) disposeVfxProp(p);
  vfxProps.length = 0;
}
