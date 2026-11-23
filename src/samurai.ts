// Detailed procedural samurai (o-yoroi style) with two-handed katana IK.
import * as THREE from 'three';
import type { Attack, Avatar, AvatarInput, Pose, Vec3 } from './types';

// soft contact shadow: dark in the centre, fading to nothing at the rim (no hard circle edge)
let _blobTex: THREE.CanvasTexture | null = null;
export function softBlobTex() {
  if (_blobTex) return _blobTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!, g = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, '#fff'); g.addColorStop(0.45, '#aaa'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  return (_blobTex = new THREE.CanvasTexture(c));
}


const V = THREE.Vector3, Q = THREE.Quaternion;
const TAU = Math.PI * 2;
const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);

// ------------------------------------------------------------ procedural textures
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
function noise(x: CanvasRenderingContext2D, w: number, h: number, amt: number) {
  const id = x.getImageData(0, 0, w, h);
  for (let k = 0; k < id.data.length; k += 4) { const n = (Math.random() - 0.5) * amt; id.data[k] += n; id.data[k + 1] += n; id.data[k + 2] += n; }
  x.putImageData(id, 0, 0);
}
// lamellar armour: rows of lacquered plates (kozane) laced with silk cords (odoshi)
function drawLamellar(x: CanvasRenderingContext2D, w: number, h: number, height: boolean, c: typeof LACE) {
  const rows = 4, rh = h / rows, cw = 16;
  x.fillStyle = height ? '#000' : '#060507'; x.fillRect(0, 0, w, h);
  for (let r = 0; r < rows; r++) {
    const y0 = r * rh, ph = rh * 0.2;
    if (height) { x.fillStyle = '#9a9a9a'; x.fillRect(0, y0 + 2, w, ph); }
    else {
      const g = x.createLinearGradient(0, y0, 0, y0 + ph + 2);
      g.addColorStop(0, '#5a5560'); g.addColorStop(0.3, c.plate); g.addColorStop(1, '#030204');
      x.fillStyle = g; x.fillRect(0, y0 + 2, w, ph);
      x.fillStyle = '#000'; for (let i = 0; i < w; i += cw / 2) x.fillRect(i, y0 + 2, 1, ph);
      x.fillStyle = c.trim; x.fillRect(0, y0 + 2, w, 1);
    }
    for (let i = 0; i < w; i += cw) {
      const cx = i + 2, cwid = cw - 4, y1 = y0 + ph + 3, y2 = y0 + rh - 1;
      const g = x.createLinearGradient(cx, 0, cx + cwid, 0);
      if (height) { g.addColorStop(0, '#303030'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#303030'); }
      else { g.addColorStop(0, c.laceLo); g.addColorStop(0.5, c.laceHi); g.addColorStop(1, c.laceLo); }
      x.fillStyle = g; x.fillRect(cx, y1, cwid, y2 - y1);
      if (!height) {
        x.strokeStyle = 'rgba(0,0,0,0.28)'; x.lineWidth = 1;
        for (let yy = y1; yy < y2; yy += 4) { x.beginPath(); x.moveTo(cx, yy); x.lineTo(cx + cwid, yy + 3); x.stroke(); }
      }
    }
  }
}
const LACE = { plate: '#18151c', trim: '#7a6a3a', laceLo: '#3c0607', laceHi: '#d23a2e' };
const lamC = canvasTex(256, 256, (x, w, h) => drawLamellar(x, w, h, false, LACE));
const lamH = canvasTex(256, 256, (x, w, h) => drawLamellar(x, w, h, true, LACE), false);
const chainC = canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#1a1f33'; x.fillRect(0, 0, w, h);
  const s = 8; x.lineWidth = 1.6;
  for (let j = 0; j <= h / s; j++) for (let i = 0; i <= w / s; i++) {
    const cx = i * s + (j % 2 ? s / 2 : 0), cy = j * s;
    x.strokeStyle = '#6c6c78'; x.beginPath(); x.ellipse(cx, cy, 3.3, 2.7, 0, 0, TAU); x.stroke();
    x.strokeStyle = 'rgba(255,255,255,0.22)'; x.beginPath(); x.arc(cx - 0.6, cy - 0.6, 2.3, Math.PI, Math.PI * 1.5); x.stroke();
  }
});
const splintC = canvasTex(128, 128, (x, w, h) => {
  x.fillStyle = '#0c0c10'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 16) {
    const g = x.createLinearGradient(i, 0, i + 13, 0);
    g.addColorStop(0, '#15151a'); g.addColorStop(0.45, '#4a4a54'); g.addColorStop(1, '#101014');
    x.fillStyle = g; x.fillRect(i + 1, 0, 13, h);
    x.fillStyle = '#b8954a'; x.beginPath(); x.arc(i + 8, 14, 2, 0, TAU); x.arc(i + 8, h - 14, 2, 0, TAU); x.fill();
  }
});
const hakamaC = canvasTex(256, 256, (x, w, h) => {
  x.fillStyle = '#262f52'; x.fillRect(0, 0, w, h);
  for (let i = 0; i < w; i += 32) {
    const g = x.createLinearGradient(i, 0, i + 32, 0);
    g.addColorStop(0, 'rgba(0,0,0,0.45)'); g.addColorStop(0.55, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(0,0,0,0.15)');
    x.fillStyle = g; x.fillRect(i, 0, 32, h);
  }
  x.fillStyle = 'rgba(170,180,215,0.13)'; for (let i = 6; i < w; i += 8) x.fillRect(i, 0, 1, h);
  noise(x, w, h, 16);
});
const itoC = canvasTex(64, 128, (x, w, h) => {
  x.fillStyle = '#e4dccb'; x.fillRect(0, 0, w, h);
  x.fillStyle = 'rgba(120,110,90,0.5)'; for (let i = 0; i < 160; i++) { x.beginPath(); x.arc(Math.random() * w, Math.random() * h, 1, 0, TAU); x.fill(); }
  x.strokeStyle = '#141218'; x.lineWidth = 13;
  for (let y = -h; y < h * 2; y += h / 4) {
    x.beginPath(); x.moveTo(0, y); x.lineTo(w, y + h / 4); x.stroke();
    x.beginPath(); x.moveTo(w, y); x.lineTo(0, y + h / 4); x.stroke();
  }
});
const flagC = canvasTex(128, 256, (x, w, h) => {
  x.fillStyle = '#ebe5d4'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#b8211b'; x.beginPath(); x.arc(64, 64, 34, 0, TAU); x.fill();
  x.fillStyle = '#16141a'; x.font = 'bold 84px serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('侍', 64, 176);
  x.strokeStyle = '#16141a'; x.lineWidth = 6; x.strokeRect(3, 3, w - 6, h - 6);
  noise(x, w, h, 10);
});
function rep(t: THREE.Texture, rx: number, ry: number) { const c = t.clone(); c.repeat.set(rx, ry); c.needsUpdate = true; return c; }

// ------------------------------------------------------------ materials
const matCache: Record<string, THREE.MeshPhysicalMaterial> = {};
function laceMat(rx: number, ry: number) {
  const k = rx + 'x' + ry;
  return matCache[k] ||= new THREE.MeshPhysicalMaterial({
    map: rep(lamC, rx, ry), bumpMap: rep(lamH, rx, ry), bumpScale: 1.2,
    roughness: 0.55, metalness: 0.05, clearcoat: 0.5, clearcoatRoughness: 0.3, side: THREE.DoubleSide
  });
}
const MAT = {
  lacquer: new THREE.MeshPhysicalMaterial({ color: 0x141218, roughness: 0.35, metalness: 0.1, clearcoat: 1, clearcoatRoughness: 0.06, side: THREE.DoubleSide }),
  redLac: new THREE.MeshPhysicalMaterial({ color: 0x7c1712, roughness: 0.35, metalness: 0.05, clearcoat: 1, clearcoatRoughness: 0.08, side: THREE.DoubleSide }),
  gold: new THREE.MeshStandardMaterial({ color: 0xd2a447, metalness: 1, roughness: 0.28, side: THREE.DoubleSide }),
  iron: new THREE.MeshStandardMaterial({ color: 0x2e2e35, metalness: 0.85, roughness: 0.42 }),
  steel: new THREE.MeshStandardMaterial({ color: 0xe9eff7, metalness: 1, roughness: 0.12, emissive: 0x5a6a80, emissiveIntensity: 0.45, envMapIntensity: 1.6 }),
  skin: new THREE.MeshStandardMaterial({ color: 0xc69b74, roughness: 0.62 }),
  dark: new THREE.MeshStandardMaterial({ color: 0x0a0809, roughness: 0.8 }),
  white: new THREE.MeshStandardMaterial({ color: 0xe8e4dc, roughness: 0.7 }),
  glove: new THREE.MeshStandardMaterial({ color: 0x3b2a1f, roughness: 0.75 }),
  hakama: new THREE.MeshStandardMaterial({ map: rep(hakamaC, 2, 1), roughness: 0.95, side: THREE.DoubleSide }),
  chain: new THREE.MeshStandardMaterial({ map: rep(chainC, 2, 3), bumpMap: rep(chainC, 2, 3), bumpScale: 0.8, metalness: 0.55, roughness: 0.5 }),
  splint: new THREE.MeshStandardMaterial({ map: rep(splintC, 2, 1), metalness: 0.7, roughness: 0.4 }),
  tabi: new THREE.MeshStandardMaterial({ color: 0x232327, roughness: 1 }),
  straw: new THREE.MeshStandardMaterial({ color: 0x8f7d52, roughness: 1 }),
  cord: new THREE.MeshStandardMaterial({ color: 0x5d2c72, roughness: 0.8 }),
  red: new THREE.MeshStandardMaterial({ color: 0xa3161a, roughness: 0.7 }),
  ito: new THREE.MeshStandardMaterial({ map: rep(itoC, 1, 3), roughness: 0.8 }),
  flag: new THREE.MeshStandardMaterial({ map: flagC, roughness: 1, side: THREE.DoubleSide })
};
// the parts the player can restyle (look.ts)
MAT.red.userData.role = 'lacquer'; MAT.cord.userData.role = 'cloth'; MAT.redLac.userData.role = 'mask';

// ------------------------------------------------------------ geometry helpers
const mesh = (g: THREE.BufferGeometry, m: THREE.Material, parent?: THREE.Object3D | null, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(g, m); o.position.set(x, y, z); if (parent) parent.add(o); return o; };
const grp = (parent: THREE.Object3D, x = 0, y = 0, z = 0) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };
function curvedPanel(w: number, h: number, curve: number, m: THREE.Material, sx = 8, sy = 4) {
  const g = new THREE.PlaneGeometry(w, h, sx, sy), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i); p.setZ(i, -curve * x * x); }
  g.computeVertexNormals();
  return new THREE.Mesh(g, m);
}
const openCyl = (rt: number, rb: number, h: number, ts: number, tl: number, seg = 24) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, true, ts, tl);

export const BLADE_PROFILE = { base: 0.162, length: 0.72, curve: 0.022, width: 0.031, taper: 0.008 } as const;
function bladeGeometry() {
  const { base, length: L, curve, width, taper } = BLADE_PROFILE;
  const sh = new THREE.Shape(), N = 24;
  const w = (s: number) => width - taper * (s / L);
  const c = (s: number) => curve * Math.pow(s / L, 2);
  sh.moveTo(0, c(0) - w(0) / 2);
  for (let i = 1; i <= N; i++) { const s = (i / N) * (L - 0.05); sh.lineTo(s, c(s) - w(s) / 2); }
  sh.quadraticCurveTo(L - 0.012, c(L) - w(L) * 0.2, L, c(L) + w(L) * 0.35); // kissaki
  for (let i = N; i >= 0; i--) { const s = (i / N) * (L - 0.04); sh.lineTo(s, c(s) + w(s) / 2); }
  const depth = 0.004;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.0022, bevelSize: 0.0016, bevelSegments: 1, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, base);
  g.computeVertexNormals();
  return g;
}
function hornGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 0);
  s.quadraticCurveTo(0.015, 0.17, 0.1, 0.31);
  s.lineTo(0.118, 0.305);
  s.quadraticCurveTo(0.05, 0.16, 0.034, 0.0);
  s.lineTo(0, 0);
  return new THREE.ExtrudeGeometry(s, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
}

// ------------------------------------------------------------ katana poses
function key(p: Vec3, d: Vec3, e: Vec3): Pose {
  const z = new V(...d).normalize(), ed = new V(...e);
  ed.addScaledVector(z, -ed.dot(z)).normalize();
  const y = ed.negate(), x = new V().crossVectors(y, z);
  return { pos: new V(...p), q: new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z)) };
}
const mx = (a: Vec3): Vec3 => [-a[0], a[1], a[2]];
const IDLE = key([-0.02, 1.07, 0.34], [0, 0.55, 0.84], [0, -1, 0]);
const RUN = key([-0.06, 0.98, 0.3], [-0.05, 0.3, 0.95], [0, -1, 0]);
const DASH = key([-0.22, 0.98, 0.04], [-0.25, -0.3, -0.92], [0, -1, 0]);
export const SHOW_WEAPON = key([-0.22, 1.07, 0.27], [0.77, 0.62, 0.16], [0, -0.12, 1]);
function kesa(m: boolean): Attack {
  const f = m ? mx : (a: Vec3) => a;
  const W = key(f([-0.2, 1.6, 0.1]), f([-0.15, 0.8, -0.58]), f([0.3, 0.5, 0.66]));
  const M = key(f([-0.02, 1.27, 0.42]), f([0.35, 0.2, 0.9]), f([0.75, -0.5, 0.4]));
  const E = key(f([0.1, 0.98, 0.3]), f([0.75, -0.5, 0.4]), f([0.6, -0.8, -0.3]));
  return { keys: [[0, W], [0.2, W], [0.45, M], [0.72, E], [1, E]], twist: [[0, -0.45], [0.2, -0.5], [0.45, 0.05], [0.72, 0.45], [1, 0.4]].map(([t, v]): [number, number] => [t, m ? -v : v]) };
}
const ATTACKS: Attack[] = [kesa(false), kesa(true), ((): Attack => {
  const W = key([-0.28, 1.2, 0.22], [-0.85, 0.1, 0.5], [0.3, 0, 1]);
  const M = key([0, 1.2, 0.42], [0, 0.05, 1], [1, 0, 0]);
  const E = key([0.28, 1.2, 0.22], [0.85, 0.1, 0.5], [0.6, 0, -0.8]);
  return { keys: [[0, W], [0.2, W], [0.35, M], [0.8, M], [1, E]], twist: [[0, -0.5], [0.2, -0.55], [0.35, 0], [0.8, 0], [1, 0.45]] };
})()];
function sampleKeys(keys: [number, Pose][], p: number, outPos: THREE.Vector3, outQ: THREE.Quaternion) {
  let i = 0; while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  const t = smooth(clamp((p - t0) / Math.max(1e-4, t1 - t0), 0, 1));
  outPos.lerpVectors(a.pos, b.pos, t); outQ.slerpQuaternions(a.q, b.q, t);
}
function sampleScalar(keys: [number, number][], p: number) {
  let i = 0; while (i < keys.length - 2 && p > keys[i + 1][0]) i++;
  const [t0, a] = keys[i], [t1, b] = keys[i + 1];
  return lerp(a, b, smooth(clamp((p - t0) / Math.max(1e-4, t1 - t0), 0, 1)));
}

// ------------------------------------------------------------ build
export function createSamurai(): Avatar {
  const root = new THREE.Group();
  const body = grp(root);

  // ---------- hips + legs
  const hips = grp(body, 0, 0.9, 0);
  mesh(new THREE.CylinderGeometry(0.19, 0.24, 0.24, 16, 1, true), MAT.hakama, hips, 0, -0.1, 0);
  // obi + agemaki
  const obi = mesh(new THREE.TorusGeometry(0.205, 0.022, 8, 32), MAT.red, hips, 0, 0.035, 0);
  obi.rotation.x = Math.PI / 2; obi.scale.y = 0.78;
  // kusazuri (tassets)
  const kusa: { g: THREE.Group; th: number }[] = [];
  for (const th of [-2.55, -1.7, -0.85, 0, 0.85, 1.7, 2.55]) {
    const g = grp(hips, Math.sin(th) * 0.215, 0.02, Math.cos(th) * 0.17);
    g.rotation.y = th;
    const p = curvedPanel(0.175, 0.3, 0.9, laceMat(0.8, 1.25)); p.position.y = -0.15; g.add(p);
    const top = mesh(new THREE.BoxGeometry(0.18, 0.025, 0.012), MAT.lacquer, g, 0, 0, 0);
    mesh(new THREE.BoxGeometry(0.182, 0.006, 0.014), MAT.gold, g, 0, -0.297, -0.012);
    top.position.z = -0.005;
    kusa.push({ g, th });
  }
  function leg(side: number) {
    const thigh = grp(hips, 0.1 * side, -0.03, 0);
    mesh(new THREE.CylinderGeometry(0.11, 0.16, 0.46, 14, 1, true), MAT.hakama, thigh, 0, -0.23, 0);
    const hd = curvedPanel(0.17, 0.25, 1.5, MAT.chain, 6, 3); hd.position.set(0, -0.2, 0.125); hd.rotation.x = -0.12; thigh.add(hd);
    const knee = grp(thigh, 0, -0.45, 0);
    mesh(new THREE.CylinderGeometry(0.16, 0.185, 0.22, 14, 1, true), MAT.hakama, knee, 0, -0.07, 0);
    const shin = mesh(new THREE.CylinderGeometry(0.056, 0.046, 0.3, 12), MAT.splint, knee, 0, -0.22, 0.008);
    const kc = mesh(new THREE.SphereGeometry(0.05, 10, 8, 0, TAU, 0, Math.PI / 2), MAT.lacquer, knee, 0, -0.06, 0.03); kc.rotation.x = Math.PI / 2; kc.scale.set(1, 1, 0.6);
    mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), MAT.cord, knee, 0, -0.12, 0.005).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.046, 0.008, 6, 16), MAT.cord, knee, 0, -0.33, 0.005).rotation.x = Math.PI / 2;
    const foot = grp(knee, 0, -0.38, 0);
    mesh(new THREE.BoxGeometry(0.085, 0.065, 0.22), MAT.tabi, foot, 0, -0.025, 0.045);
    mesh(new THREE.BoxGeometry(0.1, 0.018, 0.25), MAT.straw, foot, 0, -0.064, 0.05);
    mesh(new THREE.TorusGeometry(0.045, 0.006, 4, 12), MAT.white, foot, 0, -0.02, 0.06).rotation.x = Math.PI / 2;
    void shin;
    return { thigh, knee, foot };
  }
  const legR = leg(-1), legL = leg(1);

  // swords at the hip (empty katana saya + wakizashi)
  {
    const s = grp(hips, 0.2, 0.02, 0.04); s.rotation.set(-0.35, 0.18, 0.1);
    mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.78, 10), MAT.lacquer, s, 0, 0, -0.3).rotation.x = Math.PI / 2;
    mesh(new THREE.TorusGeometry(0.019, 0.004, 4, 10), MAT.gold, s, 0, 0, 0.09);
    const sageo = mesh(new THREE.TorusGeometry(0.05, 0.005, 4, 12, Math.PI), MAT.cord, s, -0.01, -0.03, -0.02); sageo.rotation.z = Math.PI;
    const w = grp(hips, 0.16, 0.06, 0.08); w.rotation.set(-0.25, 0.32, 0.05);
    mesh(new THREE.CylinderGeometry(0.016, 0.014, 0.5, 10), MAT.lacquer, w, 0, 0, -0.2).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.006, 16), MAT.iron, w, 0, 0, 0.06).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.014, 0.015, 0.16, 8), MAT.ito, w, 0, 0, 0.14).rotation.x = Math.PI / 2;
    mesh(new THREE.SphereGeometry(0.016, 8, 6), MAT.gold, w, 0, 0, 0.22);
  }

  // ---------- torso
  const spine = grp(hips, 0, 0.05, 0);
  const chest = grp(spine, 0, 0.24, 0);
  const doPts = [[0.2, -0.27], [0.215, -0.18], [0.235, -0.05], [0.245, 0.06], [0.235, 0.15], [0.205, 0.22], [0.15, 0.25]].map(([r, y]) => new THREE.Vector2(r, y));
  const doM = mesh(new THREE.LatheGeometry(doPts, 40), laceMat(5.5, 1.75), chest);
  doM.scale.z = 0.74;
  for (const y of [-0.27, 0.22]) {
    const r = mesh(new THREE.TorusGeometry(y > 0 ? 0.205 : 0.2, 0.008, 6, 40), MAT.gold, chest, 0, y, 0);
    r.rotation.x = Math.PI / 2; r.scale.y = 0.74;
  }
  const muna = mesh(new THREE.BoxGeometry(0.26, 0.075, 0.03), MAT.lacquer, chest, 0, 0.2, 0.155); muna.rotation.x = -0.35;
  mesh(new THREE.BoxGeometry(0.272, 0.012, 0.034), MAT.gold, muna, 0, 0.038, 0);
  for (const s of [-1, 1]) {
    const k = mesh(new THREE.SphereGeometry(0.012, 8, 6), MAT.gold, muna, 0.09 * s, 0, 0.016);
    void k;
    mesh(new THREE.BoxGeometry(0.07, 0.03, 0.3), MAT.lacquer, chest, 0.13 * s, 0.255, -0.01);
  }
  const nodowa = mesh(openCyl(0.085, 0.11, 0.06, -1.1, 2.2, 16), laceMat(0.6, 0.25), chest, 0, 0.27, 0.0);
  void nodowa;
  const agemaki = mesh(new THREE.TorusGeometry(0.035, 0.01, 6, 14), MAT.red, chest, 0, -0.06, -0.185); void agemaki;
  for (const s of [-1, 1]) { const t = mesh(new THREE.ConeGeometry(0.018, 0.16, 6), MAT.red, chest, 0.025 * s, -0.15, -0.19); t.rotation.z = Math.PI + 0.15 * s; }

  // sashimono banner
  const pole = mesh(new THREE.CylinderGeometry(0.01, 0.012, 1.45, 6), MAT.lacquer, chest, 0, 0.55, -0.21);
  void pole;
  mesh(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6), MAT.lacquer, chest, 0, 1.26, -0.36).rotation.x = Math.PI / 2;
  const flagGeo = new THREE.PlaneGeometry(0.28, 0.56, 8, 12);
  flagGeo.rotateY(Math.PI / 2);
  const flag = mesh(flagGeo, MAT.flag, chest, 0, 0.98, -0.36);
  const flagBase = Float32Array.from(flagGeo.attributes.position.array);

  // ---------- head
  const headG = grp(chest, 0, 0.31, 0.02);
  mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.1, 10), MAT.skin, headG, 0, 0.0, 0);
  const head = grp(headG, 0, 0.1, 0);
  const face = mesh(new THREE.SphereGeometry(0.1, 20, 16), MAT.skin, head); face.scale.set(0.9, 1.08, 0.98);
  for (const s of [-1, 1]) {
    mesh(new THREE.SphereGeometry(0.011, 8, 6), MAT.dark, head, 0.034 * s, 0.018, 0.085);
    const b = mesh(new THREE.BoxGeometry(0.035, 0.007, 0.01), MAT.dark, head, 0.034 * s, 0.036, 0.088); b.rotation.z = -0.25 * s;
  }
  // menpo (face mask) with nose and moustache
  const menpo = mesh(new THREE.SphereGeometry(0.106, 24, 12, Math.PI / 2 - 1.15, 2.3, 1.62, 1.0), MAT.redLac, head);
  menpo.scale.set(0.92, 1.08, 1.02);
  const nose = mesh(new THREE.ConeGeometry(0.016, 0.04, 6), MAT.redLac, head, 0, -0.005, 0.108); nose.rotation.x = Math.PI / 2 + 0.5;
  for (const s of [-1, 1]) {
    for (let i = 0; i < 3; i++) {
      const h = mesh(new THREE.BoxGeometry(0.032, 0.004, 0.004), MAT.white, head, 0.022 * s, -0.03 - i * 0.004, 0.103 - i * 0.002);
      h.rotation.z = (0.35 + i * 0.12) * -s; h.rotation.y = 0.3 * s;
    }
  }
  for (let i = 0; i < 3; i++) mesh(openCyl(0.1 + i * 0.012, 0.115 + i * 0.012, 0.035, -1.3, 2.6, 20), laceMat(0.6, 0.25), head, 0, -0.095 - i * 0.03, 0.0);
  // kabuto
  const kab = grp(head, 0, 0.035, -0.005);
  const hachi = mesh(new THREE.SphereGeometry(0.135, 32, 16, 0, TAU, 0, Math.PI / 2), MAT.lacquer, kab); hachi.scale.y = 0.95;
  for (let i = 0; i < 16; i++) {
    const r = mesh(new THREE.TorusGeometry(0.1355, 0.0032, 4, 28, Math.PI), MAT.iron, kab);
    r.rotation.y = (i / 16) * Math.PI; r.scale.y = 0.95;
  }
  mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 14), MAT.gold, kab, 0, 0.127, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.137, 0.006, 6, 40), MAT.gold, kab, 0, 0.004, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.14, 0.185, 0.05, 28, 1, true, -1.05, 2.1), MAT.lacquer, kab, 0, -0.012, 0);
  for (let i = 0; i < 4; i++) {
    mesh(openCyl(0.148 + i * 0.03, 0.172 + i * 0.03, 0.055, 1.2, TAU - 2.4), laceMat(2.4, 0.25), kab, 0, -0.025 - i * 0.048, 0);
    mesh(new THREE.TorusGeometry(0.172 + i * 0.03, 0.003, 4, 30, TAU - 2.4), MAT.gold, kab, 0, -0.052 - i * 0.048, 0).rotation.set(Math.PI / 2, 0, -Math.PI / 2 + 1.2);
  }
  for (const s of [-1, 1]) {
    const fg = grp(kab, Math.sin(1.2) * 0.16 * s, -0.04, Math.cos(1.2) * 0.16);
    fg.rotation.y = 0.75 * s;
    mesh(new THREE.BoxGeometry(0.075, 0.075, 0.012), MAT.lacquer, fg);
    mesh(new THREE.BoxGeometry(0.08, 0.08, 0.008), MAT.gold, fg, 0, 0, -0.003);
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 14), MAT.gold, fg, 0, 0, 0.008).rotation.x = Math.PI / 2;
  }
  const hg = hornGeometry();
  const kwd = mesh(new THREE.BoxGeometry(0.06, 0.05, 0.012), MAT.gold, kab, 0, 0.035, 0.128); kwd.rotation.x = -0.25;
  for (const s of [-1, 1]) {
    const h = mesh(hg, MAT.gold, kab, 0.012 * s, 0.045, 0.13); h.scale.x = s; h.rotation.x = -0.18;
  }
  mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 20), MAT.gold, kab, 0, 0.09, 0.145).rotation.x = Math.PI / 2 - 0.2;

  // ---------- arms (IK chains)
  function arm(side: number) {
    const shoulder = grp(chest, 0.185 * side, 0.18, 0);
    mesh(new THREE.SphereGeometry(0.058, 10, 8), MAT.chain, shoulder);
    mesh(new THREE.CylinderGeometry(0.055, 0.047, 0.31, 12), MAT.chain, shoulder, 0, -0.155, 0);
    const elbow = grp(shoulder, 0, -0.31, 0);
    mesh(new THREE.SphereGeometry(0.047, 10, 8), MAT.iron, elbow);
    mesh(new THREE.CylinderGeometry(0.046, 0.037, 0.29, 12), MAT.chain, elbow, 0, -0.145, 0);
    for (let i = -1; i <= 1; i++) {
      const sp = mesh(new THREE.BoxGeometry(0.018, 0.25, 0.008), MAT.lacquer, elbow, 0, -0.15, 0);
      const a = Math.PI / 2 * side + i * 0.55;
      sp.position.x = Math.sin(a) * 0.045; sp.position.z = Math.cos(a) * 0.045; sp.rotation.y = a;
    }
    mesh(new THREE.TorusGeometry(0.04, 0.006, 4, 12), MAT.gold, elbow, 0, -0.28, 0).rotation.x = Math.PI / 2;
    const wrist = grp(elbow, 0, -0.29, 0);
    mesh(new THREE.BoxGeometry(0.075, 0.09, 0.07), MAT.glove, wrist, 0, -0.045, 0);
    const tk = mesh(new THREE.BoxGeometry(0.008, 0.07, 0.06), MAT.lacquer, wrist, 0.04 * side, -0.035, 0); void tk;
    // sode (great shoulder guard)
    const sode = grp(chest, 0.245 * side, 0.23, -0.01);
    const sp = curvedPanel(0.22, 0.32, 1.3, laceMat(1.1, 1.6)); sp.rotation.y = Math.PI / 2 * side; sp.position.set(0.04 * side, -0.17, 0); sode.add(sp);
    const kb = mesh(new THREE.BoxGeometry(0.028, 0.03, 0.24), MAT.lacquer, sode, 0.045 * side, -0.005, 0);
    mesh(new THREE.BoxGeometry(0.03, 0.006, 0.245), MAT.gold, kb, 0, 0.017, 0);
    return { shoulder, elbow, wrist, sode, side, l1: 0.31, l2: 0.31 };
  }
  const armR = arm(-1), armL = arm(1);

  // ---------- katana
  const katana = grp(body);
  mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.26, 10), MAT.ito, katana).rotation.x = Math.PI / 2;
  katana.children[0].scale.x = 0.85;
  mesh(new THREE.CylinderGeometry(0.019, 0.019, 0.02, 10), MAT.gold, katana, 0, 0, -0.135).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.019, 0.018, 0.012, 10), MAT.gold, katana, 0, 0, 0.127).rotation.x = Math.PI / 2;
  const tsuba = mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.008, 28), MAT.iron, katana, 0, 0, 0.137); tsuba.rotation.x = Math.PI / 2; tsuba.scale.x = 0.88;
  const tr = mesh(new THREE.TorusGeometry(0.043, 0.003, 4, 28), MAT.gold, katana, 0, 0, 0.137); tr.scale.x = 0.88;
  mesh(new THREE.BoxGeometry(0.012, 0.034, 0.028), MAT.gold, katana, 0, -0.001, 0.155);
  mesh(bladeGeometry(), MAT.steel, katana);

  // blob shadow (grass hides the real one)
  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0, alphaMap: softBlobTex(), transparent: true, opacity: 0.6, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; root.add(blob);

  root.traverse(o => { if ((o as THREE.Mesh).isMesh && o !== blob) { o.castShadow = true; o.receiveShadow = true; } });
  katana.position.copy(IDLE.pos); katana.quaternion.copy(IDLE.q);

  // ------------------------------------------------------------ IK
  const Y_NEG = new V(0, -1, 0), tA = new V(), tB = new V(), tC = new V(), qInv = new Q();
  function solveArm(a: ReturnType<typeof arm>, target: THREE.Vector3, pole: THREE.Vector3) {
    const toT = tA.copy(target).sub(a.shoulder.position);
    const d = clamp(toT.length(), 0.08, a.l1 + a.l2 - 0.002);
    const dir = toT.normalize();
    const cosA = (a.l1 * a.l1 + d * d - a.l2 * a.l2) / (2 * a.l1 * d);
    const axis = tB.crossVectors(dir, pole).normalize();
    const u = tC.copy(dir).applyAxisAngle(axis, Math.acos(clamp(cosA, -1, 1)));
    a.shoulder.quaternion.setFromUnitVectors(Y_NEG, u);
    const elbowPos = u.clone().multiplyScalar(a.l1).add(a.shoulder.position);
    const reach = dir.multiplyScalar(d).add(a.shoulder.position);
    const f = reach.sub(elbowPos).normalize().applyQuaternion(qInv.copy(a.shoulder.quaternion).invert());
    a.elbow.quaternion.setFromUnitVectors(Y_NEG, f);
    // lift the sode with the arm
    const lift = clamp(1 + u.y, 0, 1.3);
    a.sode.rotation.z = a.side * (0.12 + lift * 0.55);
    a.sode.rotation.x = clamp(-u.z * 0.4, -0.5, 0.5);
  }
  const POLE_R = new V(-0.8, -0.5, -0.3).normalize(), POLE_L = new V(0.8, -0.5, -0.3).normalize();
  const hand = new V(), tPos = new V(), tQ = new Q();

  let look = 0;
  function update(dt: number, s: AvatarInput) {
    const t = s.time, m = s.moving;
    const atk = s.attack;
    const p = atk ? clamp(atk.p, 0, 1) : 0;
    const env = atk ? Math.sin(p * Math.PI) : 0;

    // spin (third combo hit)
    body.rotation.y = atk && atk.combo === 2 ? smooth(clamp((p - 0.25) / 0.55, 0, 1)) * TAU : 0;

    // legs: kamae stance (right foot forward) blended into a walk cycle
    const ph = s.walk, sw = Math.sin(ph);
    let thR = lerp(-0.28, -sw * 0.6, m), thL = lerp(0.14, sw * 0.6, m);
    let knR = lerp(0.32, 0.1 + Math.max(0, Math.cos(ph)) * 1.05, m), knL = lerp(0.42, 0.1 + Math.max(0, -Math.cos(ph)) * 1.05, m);
    let hipY = lerp(0.865, 0.885 + (1 - Math.abs(sw)) * 0.03, m);
    if (atk) { thR -= 0.35 * env; knR += 0.25 * env; thL += 0.3 * env; knL += 0.15 * env; hipY -= 0.05 * env; }
    if (s.dash) { thR = -0.7; knR = 0.6; thL = 0.5; knL = 0.5; hipY = 0.8; }
    legR.thigh.rotation.x = thR; legR.knee.rotation.x = knR; legR.foot.rotation.x = -(thR + knR) * 0.85;
    legL.thigh.rotation.x = thL; legL.knee.rotation.x = knL; legL.foot.rotation.x = -(thL + knL) * 0.85;
    legR.thigh.rotation.z = -0.04; legL.thigh.rotation.z = 0.04;
    hips.position.y = hipY;
    hips.rotation.y = sw * 0.12 * m + (atk ? 0 : -0.12 * (1 - m));
    for (const k of kusa) {
      const front = Math.cos(k.th), side = Math.sin(k.th);
      const lift = Math.min(0, side < 0 ? thR : thL) * Math.max(0, front);
      k.g.rotation.x = -0.14 + lift * 0.75 - Math.max(0, -front) * 0.05;
    }

    // spine / chest
    const twist = atk ? sampleScalar(ATTACKS[atk.combo].twist, p) : 0;
    spine.rotation.y = lerp(spine.rotation.y, twist - hips.rotation.y * 0.8, 1 - Math.exp(-dt * 25));
    spine.rotation.x = s.dash ? 0.45 : (atk ? 0.04 + env * 0.18 : 0.05 + 0.08 * m);
    chest.position.y = 0.24 + Math.sin(t * 1.9) * 0.004;
    chest.scale.set(1 + Math.sin(t * 1.9) * 0.008, 1, 1 + Math.sin(t * 1.9) * 0.01);
    look = lerp(look, clamp(s.look ?? 0, -0.9, 0.9) - spine.rotation.y * 0.5, 1 - Math.exp(-dt * 6));
    headG.rotation.y = look; headG.rotation.x = 0.06 - spine.rotation.x * 0.4;

    // katana pose
    if (atk) sampleKeys(ATTACKS[atk.combo].keys, p, tPos, tQ);
    else if (s.showWeapon) { tPos.copy(SHOW_WEAPON.pos); tQ.copy(SHOW_WEAPON.q); }
    else if (s.dash) { tPos.copy(DASH.pos); tQ.copy(DASH.q); }
    else { tPos.lerpVectors(IDLE.pos, RUN.pos, m); tQ.slerpQuaternions(IDLE.q, RUN.q, m); tPos.y += Math.sin(t * 1.9) * 0.006 + Math.abs(Math.cos(ph)) * 0.02 * m; }
    // the katana is posed in body space but should follow the hips' height and the spine twist
    tPos.y += hipY - 0.865;
    const k = 1 - Math.exp(-dt * (atk ? 32 : 12));
    katana.position.lerp(tPos, k); katana.quaternion.slerp(tQ, k);

    // flag cloth
    const fp = flagGeo.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      const z = flagBase[i * 3 + 2], y = flagBase[i * 3 + 1], w = (0.14 - z) / 0.28;
      fp.setX(i, Math.sin(t * 4.2 + z * 14 + y * 4) * 0.035 * w + Math.sin(t * 2.1 + y * 6) * 0.012 * w);
    }
    fp.needsUpdate = true; flagGeo.computeVertexNormals();
    flag.rotation.y = -spine.rotation.y * 0.3;

    // arms follow the sword
    root.updateMatrixWorld(true);
    solveArm(armR, chest.worldToLocal(katana.localToWorld(hand.set(0, 0, 0.065))), POLE_R);
    solveArm(armL, chest.worldToLocal(katana.localToWorld(hand.set(0, 0, -0.075))), POLE_L);
  }

  return { root, update, katana };
}

// shared building blocks for the realistic (skinned) characters in rig.js
export { MAT, laceMat, curvedPanel, openCyl, bladeGeometry, hornGeometry, mesh, grp, IDLE, RUN, DASH, ATTACKS, sampleKeys, sampleScalar, smooth, clamp, lerp, key };
