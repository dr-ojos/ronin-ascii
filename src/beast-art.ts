// Sculpted organic geometry builders and painterly fur textures for the wildlife beasts.
// Keeps every silhouette unmistakably readable in both 3D manga shading and the ASCII pass.
import * as THREE from 'three';

export interface LoftRing {
  z: number;
  y: number;
  rx: number;
  ryTop: number;
  ryBot: number;
  /** >0 sharpens the dorsal spine ridge; <0 flattens the back */
  topPinch?: number;
  /** >0 sharpens the ventral chest keel; <0 flattens the belly */
  botPinch?: number;
  /** >0 widens shoulders/flanks toward a muscular boxy cross-section (0..0.45) */
  square?: number;
  /** optional tint multiplier for top / side / belly vertex shading */
  shadeTop?: number;
  shadeSide?: number;
  shadeBot?: number;
}

/**
 * Builds a closed, smoothly shaded organic mesh lofted along Z from anatomical cross-section rings.
 * UVs run u = circumference (0..1), v = length (0..1) so directional fur textures flow head-to-tail.
 * Vertex colors bake subtle dorsal/ventral sculptural shading.
 */
export function loftMesh(rings: LoftRing[], radialSegs = 14): THREE.BufferGeometry {
  const n = rings.length;
  const stride = radialSegs + 1;
  // Add tiny closed pole rings at both ends so the mesh is watertight with smooth normals
  const first = rings[0];
  const last = rings[n - 1];
  const all: LoftRing[] = [
    { z: first.z - 0.015, y: first.y, rx: 0.002, ryTop: 0.002, ryBot: 0.002, shadeTop: first.shadeTop, shadeSide: first.shadeSide, shadeBot: first.shadeBot },
    ...rings,
    { z: last.z + 0.015, y: last.y, rx: 0.002, ryTop: 0.002, ryBot: 0.002, shadeTop: last.shadeTop, shadeSide: last.shadeSide, shadeBot: last.shadeBot }
  ];
  const rows = all.length;
  const positions = new Float32Array(rows * stride * 3);
  const uvs = new Float32Array(rows * stride * 2);
  const colors = new Float32Array(rows * stride * 3);

  for (let i = 0; i < rows; i++) {
    const r = all[i];
    const v = i / (rows - 1);
    const topPinch = r.topPinch ?? 0;
    const botPinch = r.botPinch ?? 0;
    const sq = r.square ?? 0;
    const sTop = r.shadeTop ?? 0.84;
    const sSide = r.shadeSide ?? 1.0;
    const sBot = r.shadeBot ?? 0.78;

    for (let j = 0; j <= radialSegs; j++) {
      const u = j / radialSegs;
      const theta = u * Math.PI * 2;
      // theta = 0 is top (+Y), PI/2 is right (+X), PI is bottom (-Y)
      const sx = Math.sin(theta);
      const cy = Math.cos(theta);
      const ax = Math.abs(sx);
      const ay = Math.abs(cy);

      // Superellipse bulge for muscular backs/shoulders
      let x = sx * r.rx;
      let y = cy >= 0 ? cy * r.ryTop : cy * r.ryBot;
      if (sq > 0) {
        const boost = 1 + sq * (ax * ay * 2.2);
        x *= boost;
        y *= 1 + sq * 0.45 * (ax * ay * 2.0);
      }
      // Dorsal ridge sharpening or flattening
      if (cy > 0 && topPinch !== 0) {
        const ridge = Math.pow(cy, 3);
        y += ridge * r.ryTop * topPinch * 0.32;
        x *= 1 - ridge * topPinch * 0.24;
      }
      // Ventral keel sharpening or flattening
      if (cy < 0 && botPinch !== 0) {
        const keel = Math.pow(-cy, 3);
        y -= keel * r.ryBot * botPinch * 0.28;
        x *= 1 - keel * botPinch * 0.22;
      }

      const idx = i * stride + j;
      positions[idx * 3] = x;
      positions[idx * 3 + 1] = r.y + y;
      positions[idx * 3 + 2] = r.z;

      uvs[idx * 2] = u * 2.0;
      uvs[idx * 2 + 1] = v * 2.2;

      const shade = cy >= 0
        ? THREE.MathUtils.lerp(sSide, sTop, Math.pow(cy, 1.35))
        : THREE.MathUtils.lerp(sSide, sBot, Math.pow(-cy, 1.25));
      colors[idx * 3] = shade;
      colors[idx * 3 + 1] = shade;
      colors[idx * 3 + 2] = shade;
    }
  }

  const indices: number[] = [];
  for (let i = 0; i < rows - 1; i++) {
    for (let j = 0; j < radialSegs; j++) {
      const a = i * stride + j;
      const b = a + stride;
      const c = b + 1;
      const d = a + 1;
      indices.push(a, d, b, b, d, c);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Curved tapered tube along a 3D spline — used for tusks, fangs, claws, and bushy wolf/boar tails.
 */
export function taperTube(
  points: [number, number, number][],
  rStart: number,
  rEnd: number,
  radialSegs = 8,
  tubularSegs = 12,
  profile?: (t: number) => number
): THREE.BufferGeometry {
  const path = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(...p)));
  const geo = new THREE.TubeGeometry(path, tubularSegs, 1, radialSegs, false);
  const pos = geo.attributes.position;
  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const center = path.getPointAt(t);
    const radius = profile ? profile(t) : THREE.MathUtils.lerp(rStart, rEnd, Math.pow(t, 0.85));
    for (let j = 0; j <= radialSegs; j++) {
      const k = i * (radialSegs + 1) + j;
      pos.setXYZ(
        k,
        center.x + (pos.getX(k) - center.x) * radius,
        center.y + (pos.getY(k) - center.y) * radius,
        center.z + (pos.getZ(k) - center.z) * radius
      );
    }
  }
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i <= tubularSegs; i++) {
    const t = i / tubularSegs;
    const shade = THREE.MathUtils.lerp(0.86, 1.08, t);
    for (let j = 0; j <= radialSegs; j++) {
      const k = i * (radialSegs + 1) + j;
      colors[k * 3] = shade;
      colors[k * 3 + 1] = shade;
      colors[k * 3 + 2] = shade;
    }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  return geo;
}

/**
 * Sculpted 3D fur tuft / bristle lock: tapered diamond cross-section that curves gently backward.
 * Gives wolves their cheek ruffs & shoulder manes, bears their shaggy shoulders, and boars their dorsal crest.
 */
export function furLockGeo(length: number, width: number, thickness: number, sweep = 0.28): THREE.BufferGeometry {
  const rings: LoftRing[] = [
    { z: 0, y: 0, rx: width * 0.42, ryTop: thickness * 0.42, ryBot: thickness * 0.35, topPinch: 0.4, shadeTop: 0.78, shadeSide: 0.85, shadeBot: 0.72 },
    { z: -length * 0.28, y: length * sweep * 0.32, rx: width * 0.55, ryTop: thickness * 0.58, ryBot: thickness * 0.42, topPinch: 0.65, shadeTop: 0.92, shadeSide: 0.96, shadeBot: 0.80 },
    { z: -length * 0.65, y: length * sweep * 0.76, rx: width * 0.32, ryTop: thickness * 0.36, ryBot: thickness * 0.24, topPinch: 0.85, shadeTop: 1.04, shadeSide: 1.0, shadeBot: 0.84 },
    { z: -length, y: length * sweep, rx: 0.004, ryTop: 0.004, ryBot: 0.004, shadeTop: 1.12, shadeSide: 1.08, shadeBot: 0.95 }
  ];
  return loftMesh(rings, 8);
}

/**
 * Sculpted 3D concave ear shell (outer furry back + cupped front) — far more expressive than cones or balls.
 */
export function earGeo(height: number, width: number, depth: number, rounded: boolean): THREE.BufferGeometry {
  const segU = 8, segV = 8;
  const g = new THREE.BoxGeometry(1, 1, 1, segU, segV, 2);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i);       // -0.5 .. 0.5
    const vy = p.getY(i) + 0.5; // 0 (base) .. 1 (tip)
    const wz = p.getZ(i);       // -0.5 (back) .. 0.5 (front)

    // Width profile along ear height
    const taper = rounded
      ? Math.sin(Math.pow(vy, 0.78) * Math.PI * 0.88 + 0.16)
      : Math.pow(Math.max(0.02, 1 - vy * 0.94), 0.72) * (0.68 + 0.38 * Math.sin(vy * Math.PI));

    const x = ux * width * taper;
    const y = vy * height;
    // Cup the front face inward and thicken the rim/base
    const edgeFactor = Math.min(1, Math.abs(ux) * 2);
    const cup = (1 - edgeFactor * edgeFactor) * Math.sin(vy * Math.PI) * depth * 0.65;
    const thick = depth * (0.48 - vy * 0.30) * (0.55 + 0.45 * edgeFactor);
    const z = wz * thick - cup + (rounded ? -vy * vy * depth * 0.2 : -vy * vy * depth * 0.35);

    p.setXYZ(i, x, y, z);
    const shade = THREE.MathUtils.lerp(0.95, 0.72, vy);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

/**
 * Sculpted organic upper/lower limb segment with rounded joint ends and natural muscular taper
 * (thicker muscular upper/calf, leaner ankle/wrist, smooth rounded elbow/knee/hock).
 */
export function limbGeo(len: number, rTop: number, rMid: number, rBot: number, zBulge = 0.08): THREE.BufferGeometry {
  const segR = 12, segH = 12;
  const g = new THREE.SphereGeometry(1, segR, segH);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const halfLen = len * 0.58;
  for (let i = 0; i < p.count; i++) {
    const ux = p.getX(i);
    const uy = p.getY(i); // -1 (bottom) .. +1 (top)
    const uz = p.getZ(i);
    const t = (1 - uy) * 0.5; // 0 at top, 1 at bottom
    // Keep cross-section radius full along the shaft and round smoothly only at the very tips
    const radial = Math.hypot(ux, uz);
    const cap = radial > 0.001 ? Math.min(1, Math.sin(Math.acos(THREE.MathUtils.clamp(uy, -1, 1))) * 1.32) : 0;
    const baseR = t < 0.45
      ? THREE.MathUtils.lerp(rTop, rMid, t / 0.45)
      : THREE.MathUtils.lerp(rMid, rBot, (t - 0.45) / 0.55);
    const r = baseR * (radial > 0.001 ? cap / radial : 0);
    const muscle = Math.sin(t * Math.PI);
    const nx = ux * r * 0.90;
    const ny = uy * halfLen;
    const nz = uz * r * (1.08 + zBulge * muscle) - muscle * baseR * zBulge * 0.35;
    p.setXYZ(i, nx, ny, nz);
    const shade = THREE.MathUtils.lerp(0.98, 0.78, t);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------ Painterly procedural fur textures

function makeCanvasTex(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void, bump = false): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  draw(c.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  if (!bump) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function seededRand(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

export interface FurTextures {
  map: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
}

const furCache = new Map<string, FurTextures>();

/**
 * Generates and caches directional painterly fur/bristle albedo + bump textures per species.
 * Values stay bright-neutral so MeshStandardMaterial.color tints them cleanly without muddying.
 */
export function getFurTextures(kind: 'wolf' | 'bear' | 'boar'): FurTextures {
  const existing = furCache.get(kind);
  if (existing) return existing;

  const drawFur = (ctx: CanvasRenderingContext2D, s: number, isBump: boolean) => {
    const rnd = seededRand(kind === 'wolf' ? 107 : kind === 'bear' ? 211 : 317);
    ctx.fillStyle = isBump ? '#808080' : (kind === 'wolf' ? '#d4d6d9' : kind === 'bear' ? '#cec8c0' : '#c9c4bc');
    ctx.fillRect(0, 0, s, s);

    const strands = kind === 'bear' ? 680 : kind === 'boar' ? 540 : 620;
    for (let i = 0; i < strands; i++) {
      const x = rnd() * s;
      const y = rnd() * s;
      const len = kind === 'bear' ? (18 + rnd() * 26) : kind === 'boar' ? (20 + rnd() * 34) : (24 + rnd() * 30);
      const w = kind === 'bear' ? (2.2 + rnd() * 2.8) : kind === 'boar' ? (1.1 + rnd() * 1.6) : (1.5 + rnd() * 2.1);
      const drift = (rnd() - 0.5) * (kind === 'bear' ? 10 : 5);
      const light = rnd();

      let shade: number;
      if (isBump) {
        shade = Math.round(70 + light * 155);
      } else if (kind === 'boar') {
        // Coarse bristles: strong dark guard hairs + pale dusty tips
        shade = light < 0.36 ? Math.round(118 + rnd() * 34) : Math.round(196 + rnd() * 48);
      } else if (kind === 'bear') {
        // Thick shaggy clumps with warm depth
        shade = light < 0.42 ? Math.round(128 + rnd() * 36) : Math.round(198 + rnd() * 46);
      } else {
        // Sleek layered wolf pelt
        shade = light < 0.32 ? Math.round(145 + rnd() * 32) : Math.round(205 + rnd() * 44);
      }

      ctx.strokeStyle = `rgb(${shade},${shade},${shade})`;
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      // Draw wrapped across vertical seams for seamless tiling
      for (const oy of [-s, 0, s]) {
        ctx.beginPath();
        ctx.moveTo(x, y + oy);
        ctx.quadraticCurveTo(x + drift * 0.5, y + oy + len * 0.5, x + drift, y + oy + len);
        ctx.stroke();
      }
    }

    // Subtle organic grain / dapple variation
    if (!isBump) {
      for (let i = 0; i < 45; i++) {
        const x = rnd() * s, y = rnd() * s, r = 12 + rnd() * 28;
        const g = ctx.createRadialGradient(x, y, 2, x, y, r);
        const dark = rnd() < 0.55;
        g.addColorStop(0, dark ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.08)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
      }
    }
  };

  const result: FurTextures = {
    map: makeCanvasTex(256, (ctx, s) => drawFur(ctx, s, false), false),
    bump: makeCanvasTex(256, (ctx, s) => drawFur(ctx, s, true), true)
  };
  furCache.set(kind, result);
  return result;
}

// ------------------------------------------------------------ Faceted crystal geometry (Crystal Scorpions)

/**
 * Sharp faceted crystal shard / prism spike (6-sided jewel cut with pointed apex and beveled base).
 * Non-indexed so flatShading produces razor-crisp planar crystal facets.
 */
export function crystalShardGeo(length: number, radius: number, sides = 6): THREE.BufferGeometry {
  const g = loftMesh([
    { z: 0,             y: 0, rx: radius * 0.48, ryTop: radius * 0.44, ryBot: radius * 0.44, shadeTop: 0.78, shadeSide: 0.90, shadeBot: 0.72 },
    { z: length * 0.24, y: 0, rx: radius,        ryTop: radius * 0.88, ryBot: radius * 0.82, shadeTop: 1.00, shadeSide: 1.08, shadeBot: 0.85 },
    { z: length * 0.72, y: 0, rx: radius * 0.56, ryTop: radius * 0.50, ryBot: radius * 0.46, shadeTop: 1.12, shadeSide: 1.15, shadeBot: 0.92 },
    { z: length,        y: 0, rx: 0.004,         ryTop: 0.004,         ryBot: 0.004,         shadeTop: 1.25, shadeSide: 1.25, shadeBot: 1.25 }
  ], sides);
  const nonIndexed = g.toNonIndexed();
  g.dispose();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

/**
 * Faceted crystal loft: converts a lofted ring profile into a flat-shaded jewel-cut mesh.
 */
export function crystalLoft(rings: LoftRing[], sides = 6): THREE.BufferGeometry {
  const g = loftMesh(rings, sides);
  const nonIndexed = g.toNonIndexed();
  g.dispose();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}

/**
 * Faceted curved crystal blade / stinger / pincer claw along a 3D spline.
 */
export function crystalBladeGeo(
  points: [number, number, number][],
  rStart: number,
  rEnd: number,
  sides = 5,
  tubularSegs = 9
): THREE.BufferGeometry {
  const g = taperTube(points, rStart, rEnd, sides, tubularSegs);
  const nonIndexed = g.toNonIndexed();
  g.dispose();
  nonIndexed.computeVertexNormals();
  return nonIndexed;
}
