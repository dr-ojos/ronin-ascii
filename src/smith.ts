import * as THREE from 'three';
import { M } from './materials';
import { grp, mesh } from './samurai';
import { mangaFinish } from './manga-art';
import { realHead, SCAN } from './real-head';
import { headAsset } from './assets';

const skin = M(0xa97d60, { roughness: 0.79 });
const skinShade = M(0x724b3f);
skin.userData.asciiSkin = skinShade.userData.asciiSkin = true;
const grey = M(0x746d65, { roughness: 0.92 });
// indigo work shirt quilted with white sashiko stitching
const sashiko = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#a3afbe'; x.fillRect(0, 0, 64, 64);
  x.strokeStyle = 'rgba(255,255,255,0.8)'; x.lineWidth = 1.2; x.setLineDash([3, 5]);
  for (let i = 0; i < 64; i += 8) {
    x.beginPath(); x.moveTo(i + 4, 0); x.lineTo(i + 4, 64); x.stroke();
    x.beginPath(); x.moveTo(0, i + 4); x.lineTo(64, i + 4); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2.5, 1.5);
  return t;
})();
const indigo = M(0x41587a, { roughness: 0.94, map: sashiko });
const hachimaki = M(0xb3261e, { roughness: 0.8, side: THREE.DoubleSide });
const towel = M(0xd9d0be, { roughness: 1 });
const binding = M(0x555e64, { roughness: 1 });
const pants = M(0x292933, { roughness: 1 });
const leather = M(0x67452e, { roughness: 0.86 });
const leatherEdge = M(0x997358, { roughness: 0.88 });
const iron = M(0x494851, { metalness: 0.68, roughness: 0.47 });
const steel = M(0x929097, { metalness: 0.54, roughness: 0.4 });
const brass = M(0xa68b60, { metalness: 0.51, roughness: 0.49 });

type Point = [x: number, y: number, z: number];
type Profile = [radius: number, height: number][];
const up = new THREE.Vector3(0, 1, 0);
const ball = new THREE.SphereGeometry(1, 20, 14);
const shirt: Profile = [[0.17, 0.88], [0.216, 0.99], [0.211, 1.14], [0.256, 1.35],
  [0.28, 1.465], [0.25, 1.535], [0.08, 1.589]];

function oval(parent: THREE.Object3D, material: THREE.Material, at: Point, size: Point) {
  const part = mesh(ball, material, parent, ...at);
  part.scale.set(...size);
  return part;
}

function profile(parent: THREE.Group, material: THREE.Material, rings: Profile, depth: number, arc = Math.PI * 2) {
  const geometry = new THREE.LatheGeometry(rings.map(([r, y]) => new THREE.Vector2(r, y)), 28, -arc / 2, arc);
  const part = mesh(geometry, material, parent);
  part.scale.z = depth;
  return part;
}

function tapered(parent: THREE.Group, material: THREE.Material, from: Point, to: Point, base: number, tip: number) {
  const a = new THREE.Vector3(...from), b = new THREE.Vector3(...to), axis = b.clone().sub(a);
  const part = mesh(new THREE.CylinderGeometry(tip, base, axis.length(), 12), material, parent);
  part.position.copy(a).lerp(b, 0.5);
  part.quaternion.setFromUnitVectors(up, axis.normalize());
  return part;
}

function lapel(parent: THREE.Group, topX: number, bottomX: number, bottomY: number) {
  const geometry = new THREE.PlaneGeometry(1, 1, 2, 12);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i) + 0.5;
    const x = THREE.MathUtils.lerp(bottomX, topX, t) + p.getX(i) * 0.029;
    const y = THREE.MathUtils.lerp(bottomY, 1.58, t);
    const ring = shirt.findIndex(([, height]) => height >= y);
    const [r0, y0] = shirt[ring - 1], [r1, y1] = shirt[ring];
    const r = THREE.MathUtils.lerp(r0, r1, (y - y0) / (y1 - y0));
    p.setXYZ(i, x, y, Math.sqrt(r * r - x * x) * 0.665 + 0.01);
  }
  geometry.computeVertexNormals();
  mesh(geometry, binding, parent);
}

function apron(parent: THREE.Group) {
  const geometry = new THREE.PlaneGeometry(2, 1, 12, 12);
  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = p.getY(i) + 0.5;
    const width = v > 0.62 ? THREE.MathUtils.lerp(0.225, 0.128, (v - 0.62) / 0.38) : 0.204 + v * 0.034;
    p.setXYZ(i, u * width, 0.54 + v * 0.87 + 0.026 * u * u * (1 - v), 0.205 - 0.057 * u * u + 0.009 * Math.cos(u * 12 + v * 3) * (1 - v));
  }
  geometry.computeVertexNormals();
  const material = leather.clone();
  material.side = THREE.DoubleSide;
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 192;
  const paint = canvas.getContext('2d')!;
  const shade = paint.createLinearGradient(0, 0, 128, 72);
  shade.addColorStop(0, '#746252'); shade.addColorStop(0.18, '#c1b09c');
  shade.addColorStop(0.47, '#96816f'); shade.addColorStop(0.69, '#bca897'); shade.addColorStop(1, '#65564c');
  paint.fillStyle = shade;
  paint.fillRect(0, 0, 128, 192);
  paint.strokeStyle = 'rgba(73,52,38,0.13)';
  for (let i = 0; i < 117; i++) {
    const x = (i * 83) % 126, y = (i * 49) % 192;
    paint.beginPath();
    paint.moveTo(x, y);
    paint.lineTo(x + 1 + (i % 5), y + 0.5 + (i % 4));
    paint.stroke();
  }
  paint.strokeStyle = '#c5ae91';
  paint.setLineDash([2, 3]);
  paint.strokeRect(5, 5, 118, 182);
  material.map = new THREE.CanvasTexture(canvas);
  material.map.colorSpace = THREE.SRGBColorSpace;
  paint.setLineDash([]);
  // Small, pressed workshop stamp that holds up in the conversation close-up.
  paint.translate(77, 29);
  paint.rotate(Math.PI / 4);
  paint.strokeStyle = '#625344';
  paint.lineWidth = 2.4;
  paint.strokeRect(-9, -9, 18, 18);
  paint.rotate(-Math.PI / 4);
  for (let x = -5; x <= 5; x += 5) {
    paint.beginPath(); paint.moveTo(x - 2, 4); paint.lineTo(x + 2, -4); paint.stroke();
  }
  material.color.setHex(0x8a6b54);
  mesh(geometry, material, parent);
  const tie = profile(parent, leatherEdge, [[0.213, 0.975], [0.222, 0.989], [0.222, 1.018], [0.208, 1.028]], 0.73);
  tie.position.z = 0.021;
  for (const side of [-1, 1]) {
    tapered(parent, leatherEdge, [side * 0.117, 1.39, 0.189], [side * 0.105, 1.492, 0.164], 0.015, 0.014);
    tapered(parent, leatherEdge, [side * 0.105, 1.492, 0.164], [side * 0.087, 1.55, 0.131], 0.014, 0.013);
    const buckle = mesh(new THREE.BoxGeometry(0.047, 0.033, 0.009), brass, parent, side * 0.108, 1.38, 0.2);
    buckle.rotation.z = side * 0.12;
    mesh(new THREE.BoxGeometry(0.03, 0.016, 0.01), leather, parent, side * 0.108, 1.381, 0.203).rotation.z = side * 0.12;
  }

  const pocket = mesh(new THREE.BoxGeometry(0.108, 0.116, 0.023), leather, parent, -0.112, 1.096, 0.205);
  pocket.rotation.y = -0.16;
  const welt = mesh(new THREE.BoxGeometry(0.116, 0.019, 0.018), leatherEdge, parent, -0.112, 1.153, 0.215);
  welt.rotation.y = pocket.rotation.y;
  tapered(parent, leatherEdge, [-0.131, 1.119, 0.21], [-0.144, 1.235, 0.216], 0.014, 0.011);
  tapered(parent, iron, [-0.144, 1.235, 0.216], [-0.153, 1.283, 0.222], 0.011, 0.004);
}


function sculptHead(head: THREE.Group) {
  // a real face (real-head.ts, the same scan as the ronin's): weathered skin, grey hair and a short grey
  // beard; sized to sit inside his cropped scalp and the hachimaki
  if (headAsset) {
    const face = realHead({ tint: 0xe2c2a8, hair: 0x5e5a56, beard: 0x77726c });
    const k = 0.054;
    face.group.scale.setScalar(k); face.group.position.set(0, 0.13 - SCAN.crown * k, -0.01);
    head.add(face.group);
  } else oval(head, skin, [0, 0, 0], [0.09, 0.12, 0.095]);   // the scan failed to load

  // his cropped grey hair is painted on the scanned scalp (real-head.ts); the hachimaki follows the skull's
  // oval (longer front to back than it is wide)
  // red hachimaki: a twisted band round the brow, knotted at the back with two tails
  const band = profile(head, hachimaki, [[0.094, 0.037], [0.1, 0.048], [0.099, 0.064]], 1.16); band.position.z = -0.006; band.scale.x = 0.95;
  const twist = profile(head, M(0x7a1712), [[0.1, 0.05], [0.101, 0.053]], 1.17); twist.position.z = -0.006; twist.scale.x = 0.955;
  oval(head, hachimaki, [0, 0.052, -0.124], [0.024, 0.019, 0.016]);
  for (const side of [-1, 1]) {
    const tail = mesh(new THREE.PlaneGeometry(0.03, 0.15, 1, 4).translate(0, -0.075, 0), hachimaki, head, side * 0.012, 0.048, -0.13);
    tail.rotation.set(0.35, side * 0.25, side * 0.28);
  }
  for (const side of [-1, 1]) oval(head, grey, [side * 0.088, 0.029, 0.004], [0.012, 0.027, 0.034]).rotation.x = -0.25;   // sideburns
}

export function createSmith() {
  const root = new THREE.Group(), body = grp(root);
  root.name = 'Masa';
  const head = grp(body, 0, 1.722, 0.048);
  sculptHead(head);
  tapered(body, skin, [0, 1.52, 0.023], [0, 1.655, 0.042], 0.066, 0.05);   // a neck that fits the manga jaw
  // tenugui towel slung round the neck, its ends tucked into the shirt
  const tw = mesh(new THREE.TorusGeometry(0.093, 0.024, 8, 24), towel, body, 0, 1.57, 0.03); tw.rotation.x = Math.PI / 2 + 0.25; tw.scale.set(1, 0.86, 1);
  for (const side of [-1, 1]) tapered(body, towel, [side * 0.05, 1.55, 0.115], [side * 0.07, 1.42, 0.17], 0.022, 0.018);
  profile(body, indigo, shirt, 0.665);
  lapel(body, -0.079, 0.066, 1.37);
  lapel(body, 0.079, -0.028, 1.437);
  apron(body);

  const arms = [-1, 1].map(side => {
    const x = side * 0.128, z = side * 0.06;
    tapered(body, pants, [x, 0.97, 0], [x + side * 0.033, 0.51, z], 0.122, 0.128).scale.z = 0.92;
    tapered(body, pants, [x + side * 0.033, 0.53, z], [x + side * 0.054, 0.16, z + 0.019], 0.13, 0.078).scale.z = 0.9;
    tapered(body, binding, [x + side * 0.052, 0.205, z], [x + side * 0.054, 0.06, z + 0.021], 0.075, 0.062);
    oval(body, leather, [x + side * 0.056, 0.047, z + 0.068], [0.069, 0.048, 0.126]);

    const arm = grp(body, side * 0.244, 1.464);
    oval(arm, indigo, [side * 0.03, -0.07, 0], [0.09, 0.11, 0.09]);
    tapered(arm, indigo, [side * 0.036, -0.05, 0], [side * 0.074, -0.237, -0.011], 0.085, 0.078);
    tapered(arm, binding, [side * 0.071, -0.202, -0.01], [side * 0.076, -0.239, -0.008], 0.084, 0.081);
    const elbow = grp(arm, side * 0.074, -0.241, -0.009);
    oval(elbow, skin, [0, -0.026, 0.002], [0.063, 0.088, 0.063]);
    tapered(elbow, skin, [0, -0.048, 0.003], [-side * 0.016, -0.26, 0.108], 0.062, 0.038);
    tapered(elbow, leather, [-side * 0.012, -0.218, 0.087], [-side * 0.019, -0.284, 0.118], 0.047, 0.041);
    oval(elbow, skin, [-side * 0.020, -0.310, 0.131], [0.048, 0.068, 0.039]).rotation.x = -0.42;
    oval(elbow, skin, [-side * 0.060, -0.292, 0.143], [0.018, 0.04, 0.019]).rotation.z = side * 0.3;
    return { shoulder: arm, elbow };
  });

  const [{ shoulder: armR, elbow: elbowR }, { shoulder: armL, elbow: elbowL }] = arms;
  const hammer = grp(elbowR, 0.021, -0.305, 0.123);
  tapered(hammer, leather, [0, 0, -0.115], [0, 0.054, 0.302], 0.022, 0.025);
  const forge = new THREE.Shape();
  forge.moveTo(-0.075, -0.027); forge.lineTo(0.066, -0.027); forge.lineTo(0.071, -0.016);
  forge.lineTo(0.071, 0.023); forge.lineTo(0.052, 0.032); forge.lineTo(-0.075, 0.032); forge.closePath();
  mesh(new THREE.ExtrudeGeometry(forge, { depth: 0.058, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2 }),
    iron, hammer, 0, 0.05, 0.251);
  mesh(new THREE.BoxGeometry(0.026, 0.075, 0.072), steel, hammer, -0.076, 0.05, 0.28);
  mesh(new THREE.CylinderGeometry(0.027, 0.034, 0.036, 8).rotateZ(Math.PI / 2), steel, hammer, 0.084, 0.05, 0.28);
  mangaFinish(root);
  return { root, body, head, armR, armL, elbowR, elbowL };
}
