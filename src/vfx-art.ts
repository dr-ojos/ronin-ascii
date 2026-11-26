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

// ------------------------------------------------------------ per-frame update & cleanup
export function updateVfxArt(dt: number) {
  vfxTime.value += dt;
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
  for (const p of vfxProps) disposeVfxProp(p);
  vfxProps.length = 0;
}
