import * as THREE from 'three';
import { M } from './materials';
import { grp, mesh } from './samurai';

const skin = M(0xa97d60, { roughness: 0.79 });
const skinShade = M(0x724b3f);
const hair = M(0x494646, { roughness: 0.91 });
const grey = M(0x746d65, { roughness: 0.92 });
const eye = M(0x262421);
const sclera = M(0x9b8c78);
const indigo = M(0x303f4e, { roughness: 0.94 });
const binding = M(0x555e64, { roughness: 1 });
const pants = M(0x292933, { roughness: 1 });
const cloth = M(0x393e42, { roughness: 1 });
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

const softPeak = (x: number) => Math.exp(-(x * x));

function sculptHead(head: THREE.Group) {
  const contour = [[0, -0.119], [0.049, -0.115], [0.076, -0.093], [0.085, -0.059], [0.089, -0.024],
    [0.094, 0.017], [0.092, 0.055], [0.082, 0.093], [0.053, 0.113], [0, 0.121]];
  const spline = new THREE.SplineCurve(contour.map(([r, y]) => new THREE.Vector2(r, y)));
  const sculpture = new THREE.LatheGeometry(spline.getPoints(64), 72, -Math.PI, Math.PI * 2);
  const v = sculpture.attributes.position;
  const skinColor = skin.color, salt = new THREE.Color(0x686561), shadow = new THREE.Color(0x684b42), color = new THREE.Color();
  const colors: number[] = [];
  for (let i = 0; i < v.count; i++) {
    const x = v.getX(i), y = v.getY(i), z = v.getZ(i);
    const front = THREE.MathUtils.smoothstep(z, 0.023, 0.076), cheek = Math.abs(x);
    const socket = softPeak((cheek - 0.042) / 0.027) * softPeak((y - 0.013) / 0.016);
    const bridge = softPeak(x / 0.019) * softPeak((y + 0.003) / 0.041);
    const tip = softPeak(x / 0.02) * softPeak((y + 0.032) / 0.014);
    const zygoma = softPeak((cheek - 0.060) / 0.022) * softPeak((y + 0.016) / 0.022);
    const lip = softPeak(x / 0.029) * softPeak((y + 0.057) / 0.015);
    v.setZ(i, z * 0.96 + front * (0.021 * bridge + 0.022 * tip - 0.014 * socket + 0.011 * zygoma + 0.009 * lip));
    const stubble = THREE.MathUtils.smoothstep(-0.079 + cheek * 0.55 - y, -0.008, 0.017);
    const mottling = 0.035 * Math.sin(x * 860 + Math.sin(y * 392)) * Math.cos(z * 510 - y * 720);
    color.copy(skinColor).lerp(shadow, 0.24 * socket * front);
    color.lerp(salt, stubble * THREE.MathUtils.smoothstep(z, -0.016, 0.04) * (0.9 + 0.08 * Math.sin(x * 900 + y * 640)));
    color.multiplyScalar(1 + mottling);
    colors.push(color.r, color.g, color.b);
  }
  sculpture.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  sculpture.computeVertexNormals();
  mesh(sculpture, M(0xffffff, { vertexColors: true, roughness: 0.81 }), head);

  const scalp = profile(head, hair, [[0.094, 0.048], [0.098, 0.068], [0.094, 0.089], [0.083, 0.11],
    [0.064, 0.126], [0.023, 0.136], [0, 0.134]], 0.99);
  scalp.position.z = -0.006;
  const strands = scalp.geometry.attributes.position;
  for (let i = 0; i < strands.count; i++) {
    const x = strands.getX(i), z = strands.getZ(i);
    const r = 1 + 0.021 * Math.cos(Math.atan2(x, z) * 15 + strands.getY(i) * 23);
    strands.setX(i, x * r); strands.setZ(i, z * r);
  }
  scalp.geometry.computeVertexNormals();
  oval(head, hair, [0, 0.067, -0.104], [0.036, 0.022, 0.036]);
  profile(head, cloth, [[0.094, 0.039], [0.098, 0.049], [0.097, 0.063]], 0.99).position.z = -0.004;
  profile(head, binding, [[0.097, 0.051], [0.098, 0.054]], 0.998).position.z = -0.003;
  oval(head, skinShade, [0, -0.063, 0.093], [0.022, 0.0026, 0.004]);
  for (const side of [-1, 1]) {
    oval(head, skin, [side * 0.09, -0.015, -0.006], [0.013, 0.025, 0.017]);
    oval(head, skinShade, [side * 0.098, -0.011, 0.001], [0.007, 0.012, 0.007]);
    oval(head, grey, [side * 0.085, 0.029, 0.007], [0.012, 0.027, 0.037]).rotation.x = -0.25;
    oval(head, skinShade, [side * 0.04, 0.012, 0.076], [0.019, 0.006, 0.008]).rotation.y = side * 0.36;
    oval(head, sclera, [side * 0.04, 0.012, 0.082], [0.016, 0.0038, 0.004]).rotation.y = side * 0.36;
    oval(head, eye, [side * 0.038, 0.012, 0.086], [0.005, 0.0048, 0.003]);
    oval(head, hair, [side * 0.043, 0.03, 0.084], [0.024, 0.0042, 0.006]).rotation.z = side * 0.095;
    oval(head, grey, [side * 0.017, -0.049, 0.093], [0.019, 0.0055, 0.004]).rotation.z = side * -0.23;
    tapered(head, skinShade, [side * 0.060, 0.002, 0.077], [side * 0.071, -0.006, 0.073], 0.0019, 0.0009);
    tapered(head, skinShade, [side * 0.024, -0.047, 0.094], [side * 0.034, -0.066, 0.08], 0.0016, 0.001);
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
  const forge = new THREE.Shape();
  forge.moveTo(-0.075, -0.027); forge.lineTo(0.066, -0.027); forge.lineTo(0.071, -0.016);
  forge.lineTo(0.071, 0.023); forge.lineTo(0.052, 0.032); forge.lineTo(-0.075, 0.032); forge.closePath();
  mesh(new THREE.ExtrudeGeometry(forge, { depth: 0.058, bevelThickness: 0.006, bevelSize: 0.008, bevelSegments: 2 }),
    iron, hammer, 0, 0.05, 0.251);
  mesh(new THREE.BoxGeometry(0.026, 0.075, 0.072), steel, hammer, -0.076, 0.05, 0.28);
  mesh(new THREE.CylinderGeometry(0.027, 0.034, 0.036, 8).rotateZ(Math.PI / 2), steel, hammer, 0.084, 0.05, 0.28);
  return { root, body, head, armR, armL };
}
