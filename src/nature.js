// Landscape: infinite dense grass, procedural trees (sakura, black pine, cypress, bamboo), bushes,
// wildflowers, fallen petals, mossy rocks, a rippling pond and fireflies — all swaying in one wind field.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const V = THREE.Vector3, TAU = Math.PI * 2, UP = new V(0, 1, 0);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = a => a[(Math.random() * a.length) | 0];
// cheap ambient occlusion: darker towards the inside / underside of a canopy
const ao = (hex, k) => new THREE.Color(hex).multiplyScalar(THREE.MathUtils.clamp(k, 0.35, 1.1));
// canopies are brighter on the side facing the moon (same direction as the moonlight in index.html)
const MOON = new V(-0.55, 0.7, -0.45).normalize();
const moonLit = u => 0.8 + 0.32 * (u.lengthSq() > 1e-6 ? u.clone().normalize().dot(MOON) : 0);

// ------------------------------------------------------------ wind
export const wind = {
  uTime: { value: 0 },
  uCenter: { value: new THREE.Vector2() },                                   // grass tile follows the player
  uPush: { value: Array.from({ length: 8 }, () => new THREE.Vector4(-999, -999, 0.001, 0)) } // x, z, radius
};
export const POND = { x: -15, z: 13, r: 4.6 };

const WIND_GLSL = /* glsl */`
uniform float uTime;
// smooth value noise (sin-free hash, stays precise at large coordinates)
float wHash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float wNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p), u = f * f * (3.0 - 2.0 * f);
  return mix(mix(wHash(i), wHash(i + vec2(1.0, 0.0)), u.x), mix(wHash(i + vec2(0.0, 1.0)), wHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// soft gust patches rolling across the meadow + gentle local sway + a little flutter.
// h01 = 0 at the root, 1 at the tip.
vec3 windAt(vec3 wp, float h01, float amp, float flutter) {
  // the wind direction drifts slowly instead of always blowing the same way
  float a = 0.34 + 0.32 * sin(uTime * 0.045) + 0.12 * sin(uTime * 0.11 + 1.3);
  vec2 dir = vec2(cos(a), sin(a)), side = vec2(-dir.y, dir.x);
  // gust field: two octaves of noise carried downwind -> organic patches, never a regular stripe
  vec2 q = wp.xz - dir * uTime * 2.4;
  float gust = wNoise(q * 0.055) * 0.65 + wNoise(q * 0.16 + 7.3) * 0.35;
  gust = smoothstep(0.2, 0.85, gust);
  float breath = 0.78 + 0.22 * sin(uTime * 0.19) * sin(uTime * 0.071 + 2.0);   // whole wind slowly rises and calms
  // local sway: neighbours share a phase (so clumps move together) but drift apart smoothly
  float ph = wNoise(wp.xz * 0.3) * 6.2832;
  float sway = sin(uTime * 1.7 + ph) * (0.3 + 0.7 * gust);
  float cross = sin(uTime * 1.15 + ph * 1.6) * (0.4 + 0.6 * gust);
  float bend = (0.25 + gust * 0.95) * breath;
  vec2 d = (dir * (bend + sway * 0.2) + side * cross * 0.09) * amp * h01 * h01;
  vec3 o = vec3(d.x, -dot(d, d) * 0.45, d.y);   // tips dip as they bend, so blades don't stretch
  float fp = dot(wp, vec3(3.1, 5.7, 4.3));
  o += flutter * (0.3 + gust) * vec3(sin(uTime * 4.2 + fp), sin(uTime * 5.3 + fp * 1.3) * 0.4, cos(uTime * 4.7 + fp * 0.7));
  return o;
}
`;

// patch any lit material (and its shadow depth material) so vertices move with the wind
export function addWind(mat, { height = 6, amp = 0.3, flutter = 0 } = {}) {
  const inject = sh => {
    sh.uniforms.uTime = wind.uTime;
    sh.vertexShader = WIND_GLSL + sh.vertexShader
      .replace('#include <project_vertex>', /* glsl */`
        #ifdef USE_INSTANCING
          vec4 wPos = modelMatrix * instanceMatrix * vec4(transformed, 1.0);
        #else
          vec4 wPos = modelMatrix * vec4(transformed, 1.0);
        #endif
        wPos.xyz += windAt(wPos.xyz, clamp(wPos.y / ${height.toFixed(2)}, 0.0, 1.0), ${amp.toFixed(3)}, ${flutter.toFixed(3)});
        vec4 mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wPos;');
  };
  const key = `wind_${height}_${amp}_${flutter}`;
  mat.onBeforeCompile = inject;
  mat.customProgramCacheKey = () => key;
  const depth = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
  depth.onBeforeCompile = inject;
  depth.customProgramCacheKey = () => key + '_d';
  return depth;
}

// ------------------------------------------------------------ helpers
function tube(start, end, r0, r1, seg = 6, color) {
  const d = end.clone().sub(start), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()));
  g.translate(start.x, start.y, start.z);
  if (color !== undefined) {
    // darker + mossy near the ground, lighter on thin twigs, a little random variation per piece
    const base = new THREE.Color(color), moss = new THREE.Color(0x2c3a24), c = new THREE.Color();
    const pos = g.attributes.position, col = new Float32Array(pos.count * 3), v = rnd(0.88, 1.12);
    const thin = THREE.MathUtils.clamp(1.25 - r0 * 2.5, 0.75, 1.25);
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      c.copy(base).lerp(moss, THREE.MathUtils.clamp(0.55 - y * 0.6, 0, 0.55)).multiplyScalar(THREE.MathUtils.clamp(0.5 + y * 0.18, 0.5, 1.1) * thin * v);
      col.set([c.r, c.g, c.b], i * 3);
    }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  return g;
}
const perp = d => { const p = new V(1, 0, 0); if (Math.abs(d.x) > 0.9) p.set(0, 0, 1); return p.cross(d).normalize(); };
function jitter(geo, amt) {
  const p = geo.attributes.position, seen = new Map();
  for (let i = 0; i < p.count; i++) {
    const k = `${p.getX(i).toFixed(3)},${p.getY(i).toFixed(3)},${p.getZ(i).toFixed(3)}`;
    if (!seen.has(k)) seen.set(k, [rnd(-amt, amt), rnd(-amt, amt), rnd(-amt, amt)]);
    const j = seen.get(k); p.setXYZ(i, p.getX(i) + j[0], p.getY(i) + j[1], p.getZ(i) + j[2]);
  }
  geo.computeVertexNormals(); return geo;
}
// collects instances of one blob geometry and emits a single InstancedMesh
class Batch {
  constructor(geo, mat) { this.geo = geo; this.mat = mat; this.m = []; this.c = []; }
  add(pos, scale, rotY = Math.random() * TAU, color, rot) {
    const q = rot || new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(-0.4, 0.4), rotY, rnd(-0.4, 0.4)));
    this.m.push(new THREE.Matrix4().compose(pos, q, scale.isVector3 ? scale : new V(scale, scale, scale)));
    this.c.push(new THREE.Color(color));
  }
  build() {
    const im = new THREE.InstancedMesh(this.geo, this.mat, Math.max(1, this.m.length));
    this.m.forEach((m, i) => { im.setMatrixAt(i, m); im.setColorAt(i, this.c[i]); });
    im.count = this.m.length; im.frustumCulled = false;
    return im;
  }
}

// ------------------------------------------------------------ main
export function buildNature(scene, ctx) {
  const { tagMat, CLS, colliders, camBlockers, inCompound, onPath } = ctx;
  const free = (minR, maxR, gap = 3) => {
    for (let t = 0; t < 120; t++) {
      const a = Math.random() * TAU, r = rnd(minR, maxR), x = Math.cos(a) * r, z = Math.sin(a) * r;
      if (Math.abs(x) < 4.5 && z < 8 && z > -16) continue;
      if (inCompound(x, z, 2.5)) continue;
      if (Math.hypot(x - POND.x, z - POND.z) < POND.r + 2) continue;
      if (colliders.every(c => c.rect || Math.hypot(c.x - x, c.z - z) > c.r + gap)) return [x, z];
    }
    return null;
  };
  const addMesh = (mesh, depth, cls, blocker) => {
    tagMat(mesh.material, cls);
    if (depth) mesh.customDepthMaterial = depth;
    mesh.castShadow = true; mesh.receiveShadow = true;
    scene.add(mesh); if (blocker) camBlockers.push(mesh);
    return mesh;
  };

  // ---------------- pond (placed first so everything else avoids it)
  colliders.push({ x: POND.x, z: POND.z, r: POND.r - 0.4 });
  const waterGeo = new THREE.CircleGeometry(POND.r, 64, 0, TAU);
  { // irregular shoreline
    const p = waterGeo.attributes.position;
    for (let i = 1; i < p.count; i++) {
      const a = Math.atan2(p.getY(i), p.getX(i)), k = 1 + Math.sin(a * 3) * 0.08 + Math.sin(a * 7 + 1) * 0.05;
      p.setXY(i, p.getX(i) * k, p.getY(i) * k);
    }
  }
  const pondGrid = new THREE.PlaneGeometry(POND.r * 2.3, POND.r * 2.3, 48, 48);
  const water = new THREE.Mesh(pondGrid, new THREE.MeshStandardMaterial({ color: 0x050c16, metalness: 0.9, roughness: 0.07, envMapIntensity: 2.2 }));
  water.rotation.x = -Math.PI / 2; water.position.set(POND.x, 0.06, POND.z);
  // clip the square ripple grid to the shoreline with a stencil-free trick: discard outside the shore radius
  water.material.onBeforeCompile = sh => {
    sh.vertexShader = 'varying vec2 vLocal;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvLocal = position.xy;');
    sh.fragmentShader = 'varying vec2 vLocal;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      float a = atan(vLocal.y, vLocal.x), r = length(vLocal);
      if (r > ${POND.r.toFixed(2)} * (1.0 + sin(a * 3.0) * 0.08 + sin(a * 7.0 + 1.0) * 0.05)) discard;`);
  };
  water.material.customProgramCacheKey = () => 'pond';
  tagMat(water.material, CLS.ground); water.receiveShadow = true; scene.add(water);
  const pondBase = Float32Array.from(pondGrid.attributes.position.array);
  const bed = new THREE.Mesh(waterGeo, tagMat(new THREE.MeshStandardMaterial({ color: 0x0b1410, roughness: 1 }), CLS.ground));
  bed.rotation.x = -Math.PI / 2; bed.position.set(POND.x, 0.03, POND.z); scene.add(bed);
  const lily = new Batch(new THREE.CircleGeometry(0.28, 12, 0.3, TAU - 0.5), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide }));
  for (let i = 0; i < 14; i++) {
    const a = rnd(0, TAU), r = rnd(0.8, POND.r - 0.8);
    lily.add(new V(POND.x + Math.cos(a) * r, 0.09, POND.z + Math.sin(a) * r), rnd(0.7, 1.3), 0, pick([0x2f5a2a, 0x3c6b31, 0x284d27]),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rnd(0, TAU))));
  }
  addMesh(lily.build(), null, CLS.foliage).castShadow = false;
  const lotus = new Batch(new THREE.IcosahedronGeometry(0.09, 0), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x401020, roughness: 0.5 }));
  for (let i = 0; i < 5; i++) { const a = rnd(0, TAU), r = rnd(1, POND.r - 1); lotus.add(new V(POND.x + Math.cos(a) * r, 0.14, POND.z + Math.sin(a) * r), 1, 0, 0xf6c2d6); }
  addMesh(lotus.build(), null, CLS.foliage);

  // ---------------- mossy rocks (incl. the pond rim)
  const rockMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const rockGeos = [];
  const rock = (x, z, k) => {
    const g = jitter(new THREE.IcosahedronGeometry(k, 1), k * 0.22);
    g.scale(1, rnd(0.45, 0.75), 1);
    g.computeVertexNormals();
    const n = g.attributes.normal, cols = [];
    for (let i = 0; i < n.count; i++) {
      const moss = THREE.MathUtils.smoothstep(n.getY(i), 0.35, 0.85) * rnd(0.7, 1);
      const c = new THREE.Color(0x5a5d66).lerp(new THREE.Color(0x3d5a2e), moss).multiplyScalar(rnd(0.8, 1.15));
      cols.push(c.r, c.g, c.b);
    }
    g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    g.rotateY(rnd(0, TAU)); g.translate(x, k * 0.2, z);
    rockGeos.push(g);
  };
  for (let i = 0; i < 22; i++) { const a = (i / 22) * TAU + rnd(-0.1, 0.1), r = POND.r * (1 + Math.sin(a * 3) * 0.08 + Math.sin(a * 7 + 1) * 0.05) + rnd(0.05, 0.35); rock(POND.x + Math.cos(a) * r, POND.z + Math.sin(a) * r, rnd(0.25, 0.55)); }
  for (let i = 0; i < 26; i++) { const s = free(8, 44, 2); if (!s) continue; const k = rnd(0.35, 1.2); rock(s[0], s[1], k); colliders.push({ x: s[0], z: s[1], r: k * 0.85 }); }
  addMesh(new THREE.Mesh(mergeGeometries(rockGeos), rockMat), null, CLS.ground);

  // ---------------- trees
  // bark carries per-vertex colour: dark mossy roots, lighter thin twigs, a slight tint per tree
  const barkMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, vertexColors: true });
  const barkDepth = addWind(barkMat, { height: 12, amp: 0.25, flutter: 0 });
  const bark = [];
  const blobGeo = jitter(new THREE.IcosahedronGeometry(0.2, 1), 0.03);
  const blossomMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, emissive: 0x2a0a18 });
  const needleMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });
  const blossoms = new Batch(blobGeo, blossomMat), needles = new Batch(blobGeo, needleMat);
  const petals = new Batch(new THREE.PlaneGeometry(0.07, 0.05), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide }));
  const PINK = [0xf4b3c8, 0xe993b1, 0xfcd6e2, 0xd97a9e, 0xf7c4d4];
  const GREEN = [0x1d3b27, 0x24452c, 0x2d5233, 0x183322];
  const petalSources = [];   // canopy points that shed falling petals

  // a branch made of a few slightly bent segments, so limbs curve instead of being straight sticks
  function bentTube(start, dir, len, r0, r1, bend, color, parts = 3) {
    let p = start.clone(), d = dir.clone().normalize();
    const axis = perp(d).applyAxisAngle(d, rnd(0, TAU));
    for (let i = 0; i < parts; i++) {
      const e = p.clone().addScaledVector(d, len / parts);
      const ra = THREE.MathUtils.lerp(r0, r1, i / parts), rb = THREE.MathUtils.lerp(r0, r1, (i + 1) / parts);
      bark.push(tube(p, e, ra * 1.04, rb, ra > 0.07 ? 8 : 5, color));
      p = e; d = d.clone().applyAxisAngle(axis, (bend * rnd(-0.5, 1)) / parts).normalize();
    }
    return [p, d];
  }
  // buttress roots splaying into the soil
  function roots(base, r, color) {
    const n = 5 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + rnd(-0.3, 0.3), reach = r * rnd(2.6, 3.8);
      const s = new V(base.x, r * rnd(1.2, 2.0), base.z), e = new V(base.x + Math.cos(a) * reach, -0.06, base.z + Math.sin(a) * reach);
      bark.push(tube(s, e, r * 0.5, r * 0.1, 6, color));
    }
  }

  function sakura(x, z) {
    const k = rnd(0.85, 1.25), tips = [], weeping = Math.random() < 0.3;
    const barkCol = pick([0x4a2f29, 0x52342c, 0x3f2824]);
    const branch = (s, d, len, r, depth) => {
      const [e, ed] = bentTube(s, d, len, r, r * 0.66, depth > 2 ? 0.3 : 0.55, barkCol);
      if (depth === 0) { tips.push(e); return; }
      const n = depth > 2 ? 2 : 3;
      for (let i = 0; i < n; i++) {
        const nd = ed.clone().applyAxisAngle(perp(ed), rnd(0.35, 0.85)).applyAxisAngle(ed, (i / n) * TAU + rnd(-0.5, 0.5));
        nd.y = Math.max(nd.y, depth > 2 ? 0.25 : (weeping ? -0.1 : 0.04)); nd.normalize();
        branch(e, nd, len * rnd(0.62, 0.8), r * 0.64, depth - 1);
      }
    };
    const base = new V(x, 0, z);
    roots(base, 0.25 * k, barkCol);
    branch(base, new V(rnd(-0.2, 0.2), 1, rnd(-0.2, 0.2)).normalize(), 1.7 * k, 0.27 * k, 4);
    const cTop = tips.reduce((m, t) => Math.max(m, t.y), 0), cBot = tips.reduce((m, t) => Math.min(m, t.y), 99);
    const span = Math.max(0.5, cTop - cBot);
    // cloud-like puffs around every twig tip: flattened, lit on the moon side, darker underneath
    for (const t of tips) {
      const c = t.clone(); c.y += 0.12 * k;
      for (let i = 0; i < 26; i++) {
        const u = new V(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); if (u.lengthSq() > 1) { i--; continue; }
        const off = new V(u.x * 0.72, u.y * 0.42, u.z * 0.72).multiplyScalar(k);
        const p = c.clone().add(off);
        const shade = (0.6 + 0.4 * (p.y - cBot) / span) * moonLit(u) * (0.8 + 0.3 * u.length());
        blossoms.add(p, rnd(0.45, 0.85) * k, undefined, Math.random() < 0.07 ? ao(0xffffff, shade) : ao(pick(PINK), shade));
      }
      if (Math.random() < 0.35) petalSources.push(c);
      // weeping cherry: strands of blossom hanging from the tips
      if (weeping) for (let s = 0; s < 2; s++) {
        const drift = new V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(0.06 * k);
        const p = c.clone().add(new V(rnd(-0.4, 0.4), -0.2, rnd(-0.4, 0.4)).multiplyScalar(k)), n = 5 + ((Math.random() * 5) | 0);
        for (let j = 0; j < n && p.y > 0.6; j++) {
          blossoms.add(p.clone(), rnd(0.3, 0.45) * k * (1 - j / (n * 1.6)), undefined, ao(pick(PINK), (0.75 - j * 0.03) * moonLit(drift)));
          p.y -= 0.24 * k; p.add(drift);
        }
      }
    }
    for (let i = 0; i < 140; i++) {
      const a = rnd(0, TAU), r = Math.sqrt(Math.random()) * 4.2 * k;
      const px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r;
      if (onPath(px, pz)) continue;
      petals.add(new V(px, 0.05, pz), rnd(0.8, 1.4), 0, pick(PINK), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + rnd(-0.3, 0.3), 0, rnd(0, TAU))));
    }
    colliders.push({ x, z, r: 0.35 * k });
  }
  function pine(x, z) {
    const k = rnd(0.9, 1.3), barkCol = pick([0x34302d, 0x3a3430, 0x2e2a28]);
    let p = new V(x, 0, z), d = new V(rnd(-0.3, 0.3), 1, rnd(-0.3, 0.3)).normalize(), r = 0.27 * k;
    const lean = new V(rnd(-1, 1), 0, rnd(-1, 1)).normalize();
    roots(p, r, barkCol);
    for (let s = 0; s < 5; s++) {
      const [e] = bentTube(p, d, 1.1 * k, r, r * 0.82, 0.35, barkCol, 2);
      if (s >= 1) {
        for (let b = 0; b < 2; b++) {
          // limbs droop out of the trunk, then the tip turns up under its pad (bonsai "cloud" style)
          const bd = new V(Math.cos(rnd(0, TAU)), rnd(-0.15, 0.1), Math.sin(rnd(0, TAU))).normalize();
          const bl = rnd(1.2, 2.2) * k * (1 - s * 0.12);
          const [be] = bentTube(e, bd, bl, r * 0.45, r * 0.16, -0.6, barkCol, 3);
          // flat needle pad: wide, thin, bright on top and on the moon side, dark underneath
          for (let i = 0; i < 46; i++) {
            const u = new V(rnd(-1, 1), rnd(-0.4, 1), rnd(-1, 1));
            const off = new V(u.x * 0.85, u.y * 0.16 + 0.12, u.z * 0.85).multiplyScalar(k), q = be.clone().add(off);
            needles.add(q, new V(rnd(0.8, 1.3), rnd(0.32, 0.5), rnd(0.8, 1.3)).multiplyScalar(k), undefined, ao(pick(GREEN), (0.62 + u.y * 0.3 + Math.hypot(u.x, u.z) * 0.15) * moonLit(u)));
          }
        }
      }
      p = e; d = d.clone().addScaledVector(lean, 0.25).add(new V(rnd(-0.15, 0.15), 0, rnd(-0.15, 0.15))).normalize(); r *= 0.8;
    }
    for (let i = 0; i < 64; i++) {
      const u = new V(rnd(-1, 1), rnd(-0.5, 1), rnd(-1, 1)), off = new V(u.x, u.y * 0.3, u.z).multiplyScalar(k);
      needles.add(p.clone().add(off), new V(1.1, 0.42, 1.1).multiplyScalar(k * rnd(0.8, 1.2)), undefined, ao(pick(GREEN), (0.66 + u.y * 0.3 + off.length() * 0.15) * moonLit(u)));
    }
    colliders.push({ x, z, r: 0.4 * k });
  }
  function cypress(x, z) {
    const H = rnd(8, 12.5), base = rnd(1.3, 1.9), barkCol = 0x3d2c24;
    roots(new V(x, 0, z), 0.2, barkCol);
    bark.push(tube(new V(x, 0, z), new V(x, H * 0.92, z), 0.22, 0.05, 8, barkCol));
    for (let y = 1.2; y < H; y += 0.2) {
      const t = y / H, rad = base * Math.pow(1 - t, 0.85) + 0.15, n = Math.max(4, Math.round(rad * 11));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + rnd(-0.3, 0.3) + y * 1.7, f = rnd(0.45, 1), rr = rad * f;
        const u = new V(Math.cos(a), 0.3, Math.sin(a));
        needles.add(new V(x + Math.cos(a) * rr, y + rnd(-0.1, 0.1), z + Math.sin(a) * rr), rnd(1.0, 1.6) * (0.6 + rad * 0.4), undefined, ao(pick([0x1a3321, 0x203c28, 0x27472e]), (0.45 + f * 0.6 + t * 0.2) * moonLit(u)));
      }
    }
    colliders.push({ x, z, r: 0.45 });
  }
  const culmMat = new THREE.MeshStandardMaterial({ color: 0x5d8a35, roughness: 0.5 });
  const culmDepth = addWind(culmMat, { height: 10, amp: 0.55, flutter: 0 });
  const culms = [];
  const bambooLeaf = new THREE.PlaneGeometry(0.06, 0.34); bambooLeaf.translate(0, -0.17, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.7, side: THREE.DoubleSide });
  const leaves = new Batch(bambooLeaf, leafMat);
  function bamboo(x, z) {
    for (let j = 0; j < 9; j++) {
      const h = rnd(6.5, 10.5), bx = x + rnd(-1.5, 1.5), bz = z + rnd(-1.5, 1.5), tilt = new V(rnd(-0.06, 0.06), 1, rnd(-0.06, 0.06)).normalize();
      const top = new V(bx, 0, bz).addScaledVector(tilt, h);
      culms.push(tube(new V(bx, 0, bz), top, 0.085, 0.06, 7));
      for (let y = 0.45; y < h; y += rnd(0.42, 0.55)) {
        const ring = new THREE.TorusGeometry(0.08 - y * 0.002, 0.012, 4, 10); ring.rotateX(Math.PI / 2);
        const c = new V(bx, 0, bz).addScaledVector(tilt, y); ring.translate(c.x, c.y, c.z); culms.push(ring);
      }
      for (let i = 0; i < 42; i++) {
        const y = rnd(h * 0.45, h), c = new V(bx, 0, bz).addScaledVector(tilt, y), a = rnd(0, TAU), r = rnd(0.1, 0.9) * (1.2 - y / h);
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(0.6, 1.4), a, rnd(-0.3, 0.3)));
        leaves.add(new V(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r), rnd(0.9, 1.4), 0, pick([0x6f9a3c, 0x7da845, 0x5c8a33, 0x8db24f]), q);
      }
    }
    colliders.push({ x, z, r: 1.7 });
  }
  for (let i = 0; i < 18; i++) { const s = free(8, 40, 3.5); if (s) sakura(s[0], s[1]); }
  for (let i = 0; i < 12; i++) { const s = free(10, 42, 3.5); if (s) pine(s[0], s[1]); }
  for (let i = 0; i < 22; i++) { const s = free(18, 47, 2.5); if (s) cypress(s[0], s[1]); }
  for (let i = 0; i < 10; i++) { const s = free(14, 45, 3.5); if (s) bamboo(s[0], s[1]); }

  addMesh(new THREE.Mesh(mergeGeometries(bark), barkMat), barkDepth, CLS.wood, true);
  addMesh(new THREE.Mesh(mergeGeometries(culms), culmMat), culmDepth, CLS.foliage, true);
  const blossomDepth = addWind(blossomMat, { height: 7, amp: 0.3, flutter: 0.03 });
  addMesh(blossoms.build(), blossomDepth, CLS.foliage, true);
  const needleDepth = addWind(needleMat, { height: 12, amp: 0.28, flutter: 0.012 });
  addMesh(needles.build(), needleDepth, CLS.foliage, true);
  const leafDepth = addWind(leafMat, { height: 10, amp: 0.55, flutter: 0.05 });
  addMesh(leaves.build(), leafDepth, CLS.foliage);
  addMesh(petals.build(), null, CLS.foliage).castShadow = false;

  // ---------------- bushes with blossoms
  const bushMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
  const bushes = new Batch(jitter(new THREE.IcosahedronGeometry(0.32, 1), 0.06), bushMat);
  const flowerMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x181018 });
  const blooms = new Batch(new THREE.IcosahedronGeometry(0.05, 0), flowerMat);
  for (let i = 0; i < 55; i++) {
    const s = free(6, 44, 1.2); if (!s) continue;
    const n = (rnd(16, 28)) | 0, k = rnd(0.7, 1.3), flower = Math.random() < 0.45 ? pick([0xff7aa8, 0xffffff, 0xd46cff]) : 0;
    for (let j = 0; j < n; j++) {
      const off = new V(rnd(-0.75, 0.75), rnd(0.1, 0.7), rnd(-0.75, 0.75)).multiplyScalar(k);
      off.y *= 1 - Math.hypot(off.x, off.z) / (1.3 * k);              // dome shape
      const p = new V(s[0] + off.x, Math.max(0.1, off.y), s[1] + off.z);
      bushes.add(p, new V(rnd(0.5, 0.85), rnd(0.4, 0.65), rnd(0.5, 0.85)).multiplyScalar(k), undefined, ao(pick([0x2a4a2c, 0x335a31, 0x24412a, 0x3d6634]), 0.45 + p.y * 1.0));
      if (flower && p.y > 0.3 * k) for (let f = 0; f < 3; f++) blooms.add(p.clone().add(new V(rnd(-0.2, 0.2), rnd(0.08, 0.2), rnd(-0.2, 0.2)).multiplyScalar(k)), rnd(0.7, 1.2), undefined, flower);
    }
    colliders.push({ x: s[0], z: s[1], r: 0.6 * k });
  }
  addMesh(bushes.build(), addWind(bushMat, { height: 1.6, amp: 0.08, flutter: 0.012 }), CLS.foliage);
  addMesh(blooms.build(), addWind(flowerMat, { height: 1.6, amp: 0.08, flutter: 0.015 }), CLS.light).castShadow = false;

  // ---------------- wildflowers in the grass
  const wildMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, emissive: 0x101010 });
  const wild = new Batch(new THREE.IcosahedronGeometry(0.04, 0), wildMat);
  for (let i = 0; i < 3200; i++) {
    const a = rnd(0, TAU), r = Math.sqrt(Math.random()) * 44, x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (onPath(x, z) || inCompound(x, z, 0.5) || Math.hypot(x - POND.x, z - POND.z) < POND.r + 0.4) continue;
    // flowers grow in drifts
    if (Math.sin(x * 0.21) * Math.sin(z * 0.17 + 1.3) < 0.15) continue;
    wild.add(new V(x, rnd(0.45, 0.8), z), rnd(0.8, 1.4), undefined, pick([0x6f8dff, 0x8aa6ff, 0xffffff, 0xf2e27a, 0x9a7bff]));
  }
  addMesh(wild.build(), addWind(wildMat, { height: 0.8, amp: 0.32, flutter: 0.01 }), CLS.light).castShadow = false;

  // ---------------- dense infinite grass
  buildGrass(scene, ctx);

  // ---------------- sakura petals drifting down from the canopies
  const PF = Math.min(420, petalSources.length * 6), pfPos = new Float32Array(PF * 3), pfSeed = [];
  for (let i = 0; i < PF; i++) pfSeed.push({ src: petalSources[i % petalSources.length], ox: rnd(-0.7, 0.7), oz: rnd(-0.7, 0.7), sp: rnd(0.28, 0.5), ph: Math.random() * 40, sw: rnd(0.8, 1.6) });
  const pfGeo = new THREE.BufferGeometry(); pfGeo.setAttribute('position', new THREE.BufferAttribute(pfPos, 3));
  const pfMat = tagMat(new THREE.PointsMaterial({ color: 0xf7c6d6, size: 0.075 }), CLS.foliage);
  const fallingPetals = new THREE.Points(pfGeo, pfMat); fallingPetals.frustumCulled = false;
  if (PF) scene.add(fallingPetals);

  // ---------------- fireflies
  const FF = 140, ffPos = new Float32Array(FF * 3), ffSeed = new Float32Array(FF * 3);
  for (let i = 0; i < FF; i++) { ffSeed.set([rnd(-24, 24), rnd(0.4, 2.4), rnd(-24, 24)], i * 3); }
  const ffGeo = new THREE.BufferGeometry(); ffGeo.setAttribute('position', new THREE.BufferAttribute(ffPos, 3));
  const ffMat = tagMat(new THREE.PointsMaterial({ color: 0xd8ff7a, size: 0.12, transparent: true, opacity: 1, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
  const fireflies = new THREE.Points(ffGeo, ffMat); fireflies.frustumCulled = false; scene.add(fireflies);

  let frame = 0;
  return function update(t, center) {
    wind.uTime.value = t;
    wind.uCenter.value.set(center.x, center.z);
    for (let i = 0; i < FF; i++) {
      const sx = ffSeed[i * 3], sy = ffSeed[i * 3 + 1], sz = ffSeed[i * 3 + 2];
      let x = sx + Math.sin(t * 0.3 + i) * 1.5, z = sz + Math.cos(t * 0.25 + i * 1.7) * 1.5;
      x = center.x + ((x - center.x + 24) % 48 + 48) % 48 - 24; z = center.z + ((z - center.z + 24) % 48 + 48) % 48 - 24;
      ffPos.set([x, sy + Math.sin(t * 0.8 + i * 2.1) * 0.3, z], i * 3);
    }
    ffGeo.attributes.position.needsUpdate = true;
    // petals: fall from their canopy, carried downwind and fluttering side to side, then respawn
    const wa = 0.34 + 0.32 * Math.sin(t * 0.045) + 0.12 * Math.sin(t * 0.11 + 1.3), wx = Math.cos(wa), wz = Math.sin(wa);
    for (let i = 0; i < PF; i++) {
      const s = pfSeed[i], H = s.src.y, life = H / s.sp + 2.0, a = ((t + s.ph) % life) / life;
      const fall = a * H, y = Math.max(0.04, H - fall), flut = Math.sin((t + s.ph) * s.sw * 2.2) * 0.35;
      const carry = Math.min(fall, H) * 0.55;
      pfPos[i * 3] = s.src.x + s.ox + wx * carry - wz * flut;
      pfPos[i * 3 + 1] = y;
      pfPos[i * 3 + 2] = s.src.z + s.oz + wz * carry + wx * flut;
    }
    if (PF) pfGeo.attributes.position.needsUpdate = true;
    ffMat.opacity = 0.55 + 0.45 * Math.sin(t * 2.3);
    if ((frame++ & 1) === 0) { // pond ripples
      const p = pondGrid.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = pondBase[i * 3], y = pondBase[i * 3 + 1];
        p.setZ(i, Math.sin(x * 2.1 + t * 1.6) * 0.018 + Math.sin(y * 2.7 - t * 1.3) * 0.015 + Math.sin((x + y) * 4.3 + t * 2.4) * 0.007);
      }
      p.needsUpdate = true; pondGrid.computeVertexNormals();
    }
  };
}

// ------------------------------------------------------------ grass
function buildGrass(scene, { tagMat, CLS }) {
  const TILE = 84, N = 210000;
  const geo = new THREE.PlaneGeometry(0.075, 0.7, 1, 4);
  geo.translate(0, 0.35, 0);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setX(i, pos.getX(i) * Math.pow(1 - pos.getY(i) / 0.72, 0.8));
  const nrm = geo.attributes.normal; for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);
  const mat = new THREE.MeshLambertMaterial({ color: 0x5f9a72, side: THREE.DoubleSide });
  mat.onBeforeCompile = sh => {
    sh.uniforms.uTime = wind.uTime; sh.uniforms.uCenter = wind.uCenter; sh.uniforms.uPush = wind.uPush;
    sh.vertexShader = WIND_GLSL + `
      uniform vec2 uCenter; uniform vec4 uPush[8];
      varying float vH; varying float vVar; varying float vSheen;
      float grassKeep(vec2 p) {
        if (abs(p.x) < 1.55 && p.y > -16.0 && p.y < 7.0) return 0.0;                 // stone path
        if (abs(p.x) < 12.3 && p.y < -14.7 && p.y > -31.3) return 0.0;               // shrine courtyard
        if (length(p - vec2(${POND.x.toFixed(1)}, ${POND.z.toFixed(1)})) < ${(POND.r + 0.15).toFixed(2)}) return 0.0; // pond
        if (length(p) > 49.0) return 0.0;
        return 1.0;
      }
    ` + sh.vertexShader
      .replace('#include <project_vertex>', /* glsl */`
        vH = uv.y;
        vec3 o = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
        vec2 base = uCenter + mod(o.xz - uCenter + ${(TILE / 2).toFixed(1)}, ${TILE.toFixed(1)}) - ${(TILE / 2).toFixed(1)};
        vVar = fract(sin(dot(o.xz, vec2(12.9898, 78.233))) * 43758.5453);
        // clumps: taller, lusher patches
        float clump = 0.65 + 0.55 * (0.5 + 0.5 * sin(base.x * 0.33 + sin(base.y * 0.21) * 2.0) * sin(base.y * 0.29 + 1.7));
        vec3 lp = transformed;
        lp.y *= clump;
        lp.z += (vVar - 0.35) * 0.32 * vH * vH;                                    // natural curl
        vec3 local = mat3(instanceMatrix) * lp * grassKeep(base);
        vec4 wPos = vec4(base.x + local.x, local.y, base.y + local.z, 1.0);
        vec3 w = windAt(wPos.xyz, vH, 0.42 * (0.7 + vVar * 0.6), 0.006);
        wPos.xyz += w;
        vSheen = clamp(length(w.xz) * 2.2, 0.0, 1.0);
        for (int i = 0; i < 8; i++) {
          vec2 d = wPos.xz - uPush[i].xy;
          float push = smoothstep(uPush[i].z, 0.0, length(d)) * vH;
          wPos.xz += normalize(d + 1e-4) * push * 0.75;
          wPos.y -= push * 0.42;
        }
        vec4 mvPosition = viewMatrix * wPos;
        gl_Position = projectionMatrix * mvPosition;`)
      .replace('#include <worldpos_vertex>', 'vec4 worldPosition = wPos;');
    sh.fragmentShader = 'varying float vH; varying float vVar; varying float vSheen;\n' + sh.fragmentShader
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= mix(0.07, 1.0, vH) * (0.55 + 0.8 * vVar);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.6, 0.36) * vH, step(0.94, vVar) * 0.55);   // dry tips
        diffuseColor.rgb += vec3(0.05, 0.09, 0.07) * vSheen * vH;                                         // wind sheen`)
      .replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n  normal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => 'grass-infinite';
  tagMat(mat, CLS.grass);
  const grass = new THREE.InstancedMesh(geo, mat, N);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new V(), p = new V(), e = new THREE.Euler();
  for (let i = 0; i < N; i++) {
    p.set(rnd(-TILE / 2, TILE / 2), 0, rnd(-TILE / 2, TILE / 2));
    e.set(rnd(-0.25, 0.25), Math.random() * TAU, rnd(-0.25, 0.25)); q.setFromEuler(e);
    const sc = rnd(0.7, 1.3); s.set(sc * rnd(0.8, 1.3), sc * rnd(0.6, 1.5), sc);
    grass.setMatrixAt(i, m4.compose(p, q, s));
  }
  grass.frustumCulled = false; grass.receiveShadow = true;
  scene.add(grass);
}
