import * as THREE from 'three';
import { M } from './materials';
import { grp, mesh } from './samurai';

const skin = M(0xab7854, { roughness: 0.78 });
const skinShade = M(0x82573f);
const hair = M(0x423d3a, { roughness: 0.92 });
const grey = M(0x79746d, { roughness: 0.92 });
const eye = M(0x251f1c);
const indigo = M(0x354558, { roughness: 0.94 });
const binding = M(0x596575, { roughness: 1 });
const pants = M(0x292933, { roughness: 1 });
const cloth = M(0xc6b49a, { roughness: 1 });
const leather = M(0x67452e, { roughness: 0.86 });
const leatherEdge = M(0x997358, { roughness: 0.88 });
const iron = M(0x494851, { metalness: 0.68, roughness: 0.47 });
const steel = M(0x929097, { metalness: 0.54, roughness: 0.4 });

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
  const shade = paint.createRadialGradient(65, 82, 20, 52, 86, 115);
  shade.addColorStop(0, '#e3d6c2'); shade.addColorStop(1, '#9b8d7c');
  paint.fillStyle = shade;
  paint.fillRect(0, 0, 128, 192);
  paint.strokeStyle = 'rgba(73,52,38,0.13)';
  for (let i = 0; i < 68; i++) {
    const x = (i * 83) % 126, y = (i * 43) % 192;
    paint.beginPath();
    paint.moveTo(x, y);
    paint.lineTo(x + 1 + (i % 5), y + 0.5 + (i % 4));
    paint.stroke();
  }
  paint.strokeStyle = '#bfae93';
  paint.setLineDash([2, 3]);
  paint.strokeRect(5, 5, 118, 182);
  material.map = new THREE.CanvasTexture(canvas);
  material.map.colorSpace = THREE.SRGBColorSpace;
  material.color.setHex(0x896347);
  mesh(geometry, material, parent);
  const tie = profile(parent, leatherEdge, [[0.213, 0.975], [0.222, 0.989], [0.222, 1.018], [0.208, 1.028]], 0.73);
  tie.position.z = 0.021;
  for (const side of [-1, 1]) {
    tapered(parent, leatherEdge, [side * 0.117, 1.39, 0.189], [side * 0.105, 1.492, 0.164], 0.015, 0.014);
    tapered(parent, leatherEdge, [side * 0.105, 1.492, 0.164], [side * 0.087, 1.55, 0.131], 0.014, 0.013);
    oval(parent, iron, [side * 0.106, 1.365, 0.198], [0.012, 0.012, 0.005]);
  }
}

function sculptHead(head: THREE.Group) {
  profile(head, skin, [[0, -0.118], [0.044, -0.118], [0.071, -0.095], [0.085, -0.059], [0.091, -0.019],
    [0.094, 0.018], [0.091, 0.058], [0.080, 0.093], [0.055, 0.113], [0, 0.122]], 0.96);
  profile(head, grey, [[0.043, -0.119], [0.061, -0.107], [0.077, -0.084], [0.087, -0.056]], 1.015, 2.67);
  profile(head, hair, [[0.095, 0.055], [0.096, 0.074], [0.091, 0.092], [0.078, 0.112],
    [0.052, 0.127], [0, 0.135]], 0.99).position.z = -0.003;
  oval(head, hair, [0, 0.077, -0.101], [0.041, 0.026, 0.038]);   // hair gathered low at the back
  profile(head, cloth, [[0.094, 0.045], [0.097, 0.055], [0.093, 0.076]], 0.995).position.z = -0.004;
  oval(head, skin, [0, 0.001, 0.091], [0.014, 0.042, 0.018]).rotation.x = -0.28;
  oval(head, skin, [0, -0.027, 0.104], [0.019, 0.011, 0.018]);
  oval(head, skinShade, [0, -0.065, 0.081], [0.034, 0.005, 0.01]);
  for (const side of [-1, 1]) {
    oval(head, skin, [side * 0.09, -0.015, -0.006], [0.015, 0.024, 0.016]);
    oval(head, grey, [side * 0.086, 0.012, 0.016], [0.011, 0.032, 0.033]);
    oval(head, skinShade, [side * 0.039, -0.001, 0.079], [0.026, 0.011, 0.008]);
    oval(head, eye, [side * 0.039, 0.006, 0.081], [0.021, 0.004, 0.008]).rotation.y = side * 0.36;
    oval(head, hair, [side * 0.039, 0.021, 0.084], [0.028, 0.007, 0.009]).rotation.z = side * 0.16;
    oval(head, grey, [side * 0.023, -0.052, 0.087], [0.025, 0.009, 0.008]).rotation.z = side * -0.23;
  }
}

export function createSmith() {
  const root = new THREE.Group(), body = grp(root);
  root.name = 'Masa';
  const head = grp(body, 0, 1.722, 0.048);
  sculptHead(head);
  tapered(body, skin, [0, 1.52, 0.023], [0, 1.655, 0.042], 0.082, 0.069);
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
    oval(arm, skin, [side * 0.075, -0.267, -0.007], [0.063, 0.097, 0.063]);
    tapered(arm, skin, [side * 0.074, -0.296, -0.006], [side * 0.058, -0.501, 0.099], 0.062, 0.038);
    tapered(arm, leather, [side * 0.062, -0.459, 0.078], [side * 0.055, -0.525, 0.109], 0.047, 0.041);
    oval(arm, skin, [side * 0.054, -0.551, 0.122], [0.048, 0.068, 0.039]).rotation.x = -0.42;
    oval(arm, skin, [side * 0.014, -0.533, 0.134], [0.018, 0.04, 0.019]).rotation.z = side * 0.3;
    return arm;
  });

  const [armR, armL] = arms;
  const hammer = grp(armR, -0.053, -0.546, 0.114);
  tapered(hammer, leather, [0, 0, -0.115], [0, 0.054, 0.302], 0.022, 0.025);
  mesh(new THREE.BoxGeometry(0.154, 0.079, 0.079), iron, hammer, 0, 0.05, 0.28);
  mesh(new THREE.BoxGeometry(0.026, 0.075, 0.072), steel, hammer, -0.076, 0.05, 0.28);
  mesh(new THREE.CylinderGeometry(0.027, 0.034, 0.036, 8).rotateZ(Math.PI / 2), steel, hammer, 0.084, 0.05, 0.28);
  return { root, body, head, armR, armL };
}
