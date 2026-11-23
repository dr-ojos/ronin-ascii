// Realistic heads from a 3D scan: "Infinite, 3D Head Scan" by Lee Perry-Smith (CC BY 3.0, based on a work
// at www.triplegangers.com; see public/models/head/LeePerrySmith_License.txt), the head that ships with
// the three.js examples. The scan is a bust: it is cut below the neck, its colour map and tangent-space
// normal map give the skin, and the hair is painted onto the scalp with vertex colours (a real hairline:
// forehead, temples, nape) so it follows the skull exactly. Each wearer can change skin tone, hair and
// beard. A menpo (lower face guard) is grown out of the face itself, so it fits.
// Units: the scan's own, about 4.9 cm each (crown y = 3.97, nose tip y = 1.1, mouth y = 0.25, chin y = -0.75,
// ears at x = +-1.9, nose towards +z). Callers scale it.
import * as THREE from 'three';
import { headAsset } from './assets';

/** an open eye painted on a small curved patch (the scan has its eyes closed): almond of white, a
 *  brown iris with its pupil and a catch-light, a heavy upper lash line and a fine lower lid */
let eyeTex: THREE.CanvasTexture | null = null;
function eyeTexture() {
  if (eyeTex) return eyeTex;
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d')!;
  const almond = () => {
    x.beginPath(); x.moveTo(14, 70);
    x.bezierCurveTo(60, 14, 190, 10, 242, 58);
    x.bezierCurveTo(200, 104, 70, 112, 14, 70); x.closePath();
  };
  x.fillStyle = '#c4b2a2'; almond(); x.fill();
  x.save(); almond(); x.clip();
  const g = x.createRadialGradient(126, 64, 4, 126, 64, 48);
  g.addColorStop(0, '#2a160c'); g.addColorStop(0.35, '#5a3418'); g.addColorStop(0.85, '#3a2010'); g.addColorStop(1, '#1a0e08');
  x.fillStyle = g; x.beginPath(); x.arc(126, 64, 47, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#080404'; x.beginPath(); x.arc(126, 64, 17, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.5)'; x.fillRect(0, 0, 256, 50);               // the upper lid's shadow
  x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(112, 56, 6, 0, Math.PI * 2); x.fill();
  x.restore();
  x.strokeStyle = '#1a1210'; x.lineCap = 'round';
  x.lineWidth = 9; x.beginPath(); x.moveTo(10, 72); x.bezierCurveTo(60, 12, 190, 8, 246, 56); x.stroke();
  x.lineWidth = 3; x.strokeStyle = 'rgba(60,30,25,0.8)'; x.beginPath(); x.moveTo(30, 80); x.bezierCurveTo(80, 108, 190, 102, 236, 64); x.stroke();
  eyeTex = new THREE.CanvasTexture(c); eyeTex.colorSpace = THREE.SRGBColorSpace; eyeTex.anisotropy = 4;
  return eyeTex;
}

export interface RealHeadOpts {
  /** multiplies the scanned skin colour (0xffffff = as scanned) */
  tint?: number;
  hair: number;
  /** grey stubble and a short beard along the jaw */
  beard?: number;
  /** a samurai topknot (chonmage) on the crown */
  topknot?: boolean;
}

export const SCAN = { crown: 3.97, chin: -0.75, neckCut: -1.55 };

let base: THREE.BufferGeometry | null = null;
/** the scan cut below the neck (shared, without colours) */
function headGeometry() {
  if (base) return base;
  const src = headAsset!.geo.index ? headAsset!.geo.toNonIndexed() : headAsset!.geo.clone();
  const p = src.attributes.position, keep: number[] = [];
  for (let t = 0; t < p.count; t += 3) {
    if (p.getY(t) > SCAN.neckCut && p.getY(t + 1) > SCAN.neckCut && p.getY(t + 2) > SCAN.neckCut) keep.push(t, t + 1, t + 2);
  }
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) {
    const a = src.attributes[name]; if (!a) continue;
    const out = new Float32Array(keep.length * a.itemSize);
    keep.forEach((v, i) => { for (let k = 0; k < a.itemSize; k++) out[i * a.itemSize + k] = a.array[v * a.itemSize + k]; });
    g.setAttribute(name, new THREE.BufferAttribute(out, a.itemSize));
  }
  return (base = g);
}

const smooth = THREE.MathUtils.smoothstep;
// the hairline round the head: height (y) by the angle from the front (|atan2(x, z)|): high over the
// forehead, receding at the temples, sideburns in front of the ears, over the ears, low at the nape
const HAIRLINE: [number, number][] = [[0, 2.85], [0.55, 2.75], [0.95, 2.2], [1.22, 1.35], [1.42, 1.3], [1.58, 2.0], [1.95, 1.9], [2.35, 0.45], [Math.PI, 0.05]];
function hairline(a: number) {
  for (let i = 1; i < HAIRLINE.length; i++) {
    const [a0, y0] = HAIRLINE[i - 1], [a1, y1] = HAIRLINE[i];
    if (a <= a1) return y0 + (y1 - y0) * (a - a0) / (a1 - a0);
  }
  return HAIRLINE[HAIRLINE.length - 1][1];
}
/** 1 where hair grows on the scalp, 0 on the face, ears and neck (the scan's units) */
function hairAmount(x: number, y: number, z: number) {
  return smooth(y, hairline(Math.abs(Math.atan2(x, z))) - 0.1, hairline(Math.abs(Math.atan2(x, z))) + 0.1);
}
/** a short beard: jaw and chin, and a moustache over the lip */
function beardAmount(x: number, y: number, z: number) {
  const a = Math.abs(Math.atan2(x, z));
  if (a > 1.45) return 0;
  const jaw = smooth(y, -1.0, -0.8) * (1 - smooth(y, 0.15, 0.4)) * (1 - smooth(a, 1.2, 1.45));
  const lip = Math.abs(x) < 0.75 && y > 0.38 && y < 0.62 && z > 1.7 ? 1 : 0;
  return Math.max(jaw * (Math.abs(x) < 0.45 && y > -0.1 && z > 2.0 ? 0.3 : 1), lip);
}

export function realHead(o: RealHeadOpts) {
  const geo = headGeometry().clone();
  const p = geo.attributes.position, colors = new Float32Array(p.count * 3);
  const tint = new THREE.Color(o.tint ?? 0xffffff), hair = new THREE.Color(o.hair), beard = new THREE.Color(o.beard ?? o.hair), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    // the colour map multiplies this: hair pushes it to the hair colour, skin keeps the scan's tone
    c.copy(tint);
    if (o.beard !== undefined) c.lerp(beard.clone().multiplyScalar(1.6), beardAmount(x, y, z) * 0.85);
    const h = hairAmount(x, y, z);
    // combed strands: a faint ripple running back over the skull
    const strand = 0.85 + 0.15 * Math.sin(x * 9 + z * 2.5);
    c.lerp(hair.clone().multiplyScalar(1.6 * strand), h);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const mat = new THREE.MeshStandardMaterial({
    map: headAsset!.map, normalMap: headAsset!.normal, normalScale: new THREE.Vector2(0.8, 0.8),
    vertexColors: true, roughness: 0.62, metalness: 0
  });
  mat.userData.asciiSkin = true;
  const group = new THREE.Group();
  group.add(new THREE.Mesh(geo, mat));
  // open eyes over the scanned (closed) lids, turned with the face's curve
  const eyeMat = new THREE.MeshStandardMaterial({ map: eyeTexture(), alphaTest: 0.5, roughness: 0.35 });
  eyeMat.userData.asciiSkin = true;
  const eyeGeo = new THREE.SphereGeometry(1, 24, 12, Math.PI / 2 - 0.5, 1.0, Math.PI / 2 - 0.25, 0.5);
  for (const s of [-1, 1]) {
    const e = new THREE.Mesh(eyeGeo, eyeMat);
    // the sphere patch faces +z; it is laid on the lid, with its centre at the lid's front
    e.scale.set(0.5, 0.4, 0.16);
    e.position.set(s * 0.61, 1.71, 1.83);
    e.rotation.set(0.05, s * 0.32, s * -0.06);
    group.add(e);
  }
  if (o.topknot) {
    // chonmage: the hair gathered at the crown, folded forward and tied with a white cord
    const hm = new THREE.MeshStandardMaterial({ color: o.hair, roughness: 0.45 });
    const knot = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.1, 4, 10), hm);
    knot.position.set(0, SCAN.crown - 0.05, -0.35); knot.rotation.x = Math.PI / 2 - 0.25; knot.scale.set(1, 1, 0.8);
    knot.userData.part = 'topknot'; group.add(knot);
    const tie = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.07, 6, 16), new THREE.MeshStandardMaterial({ color: 0xe8e2d4, roughness: 0.7 }));
    tie.position.set(0, SCAN.crown - 0.02, -0.75); tie.userData.part = 'topknot'; group.add(tie);
  }
  return { group, mat };
}

/** a menpo grown from the scanned face: the lower face (below the eyes), pushed out along its normals */
export function realMenpoGeometry() {
  const g = headGeometry(), p = g.attributes.position, n = g.attributes.normal, keep: number[] = [];
  const inMask = (i: number) => p.getZ(i) > 0.3 && p.getY(i) < 1.3 && p.getY(i) > SCAN.chin - 0.25 && Math.abs(p.getX(i)) < 1.75;
  for (let t = 0; t < p.count; t += 3) if (inMask(t) && inMask(t + 1) && inMask(t + 2)) keep.push(t, t + 1, t + 2);
  const pos = new Float32Array(keep.length * 3);
  keep.forEach((v, i) => pos.set([p.getX(v) + n.getX(v) * 0.14, p.getY(v) + n.getY(v) * 0.14, p.getZ(v) + n.getZ(v) * 0.14], i * 3));
  const out = new THREE.BufferGeometry(); out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.computeVertexNormals();
  return out;
}
