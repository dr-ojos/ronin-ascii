import * as THREE from 'three';
import { CLS, tagMat } from './materials';
import { state } from './state';

export const illustrationMaskScene = new THREE.Scene();
export const actorDepth = {
  uSceneDepth: { value: null as THREE.DepthTexture | null },
  uMaskSize: { value: new THREE.Vector2() },
  uDepthMargin: { value: 0 }
};

export function depthMask(material: THREE.MeshBasicMaterial) {
  material.onBeforeCompile = shader => {
    Object.assign(shader.uniforms, actorDepth);
    shader.fragmentShader = `uniform sampler2D uSceneDepth;
uniform vec2 uMaskSize;
uniform float uDepthMargin;
` + shader.fragmentShader.replace('#include <tonemapping_fragment>', `
      float depth = texture2D(uSceneDepth, gl_FragCoord.xy / uMaskSize).r;
      float margin = 1e-6 + fwidth(gl_FragCoord.z) * uDepthMargin;
      if (gl_FragCoord.z > depth + margin) discard;
      gl_FragColor.rgb = vec3(1.0);
      #include <tonemapping_fragment>
    `);
  };
  return material;
}

type Cells = readonly [string, number, number, number];
const images = {
  masa: ['masa-manga.webp', 1, 1, 0],
  oni: ['oni-manga.webp', 2, 2, 0],
  spear: ['oni-manga.webp', 2, 2, 1],
  bow: ['oni-manga.webp', 2, 2, 2],
  shadow: ['oni-manga.webp', 2, 2, 3],
  shield: ['oni-jefes-manga.webp', 2, 2, 0],
  ritual: ['oni-jefes-manga.webp', 2, 2, 1],
  tengu: ['oni-jefes-manga.webp', 2, 2, 2],
  heavy: ['oni-jefes-manga.webp', 2, 2, 3],
  kuro: ['oni-leyendas-manga.webp', 2, 2, 0],
  raijin: ['oni-leyendas-manga.webp', 2, 2, 1],
  coloso: ['oni-leyendas-manga.webp', 2, 2, 2],
  tambor: ['oni-leyendas-manga.webp', 2, 2, 3]
} satisfies Record<string, Cells>;
export type Illustration = keyof typeof images;

interface Frame { map: THREE.Texture; aspect: number; footing: number }
const sheets = new Map<string, Promise<Frame[]>>();
const loader = new THREE.TextureLoader();

function readFrames(texture: THREE.Texture, columns: number, rows: number) {
  const source = texture.image as HTMLImageElement;
  const canvas = document.createElement('canvas');
  canvas.width = source.width; canvas.height = source.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(source, 0, 0);
  const { data } = ctx.getImageData(0, 0, source.width, source.height);
  return Array.from({ length: rows * columns }, (_, frame) => {
    const x0 = Math.round((frame % columns) * source.width / columns);
    const x1 = Math.round((frame % columns + 1) * source.width / columns) - 1;
    const y0 = Math.round(Math.floor(frame / columns) * source.height / rows);
    const y1 = Math.round((Math.floor(frame / columns) + 1) * source.height / rows) - 1;
    let l = x1, r = x0, t = y1, b = y0, ink = 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (data[(y * source.width + x) * 4 + 3] < 160) continue;
      l = Math.min(l, x); r = Math.max(r, x); t = Math.min(t, y); b = Math.max(b, y); ink++;
    }
    if (!ink || ink >= (x1 - x0 + 1) * (y1 - y0 + 1) * 0.95) throw Error('La ilustración no tiene una silueta recortada');
    l = Math.max(x0, l - 2); r = Math.min(x1, r + 2); t = Math.max(y0, t - 2); b = Math.min(y1, b + 2);
    const w = r - l + 1, h = b - t + 1, map = texture.clone();
    map.offset.set(l / source.width, 1 - (b + 1) / source.height);
    map.repeat.set(w / source.width, h / source.height);
    // Place the painted stance around the collider, even when a weapon extends to one side.
    let feet = 0, footing = 0;
    for (let y = b - Math.floor(h * 0.105); y <= b; y++) for (let x = l; x <= r; x++) {
      if (data[(y * source.width + x) * 4 + 3] < 160) continue;
      footing += (x - l) / w;
      feet++;
    }
    return { map, aspect: w / h, footing: feet ? THREE.MathUtils.clamp(footing / feet, 0.37, 0.63) : 0.5 };
  });
}

function illustration(key: Illustration) {
  const [file, columns, rows, cell] = images[key];
  let sheet = sheets.get(file);
  if (!sheet) {
    sheet = loader.loadAsync(`${import.meta.env.BASE_URL}characters/${file}`).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = 4;
      return readFrames(texture, columns, rows);
    });
    sheets.set(file, sheet);
  }
  return sheet.then(frames => frames[cell]);
}

export interface IllustrationPose { moving?: boolean; brace?: number; strike?: number; hit?: number }
type Joint = { node: THREE.Object3D; at?: THREE.Vector3 };
type JointOffsets = THREE.Vector3[];
type Driver = (result: JointOffsets) => void;
type Grip = readonly [number, number, number, number];

// Right and left wrists in each painting, UV coordinates with the feet at v=0.
const grips: Record<Illustration, Grip> = {
  masa: [0.18, 0.50, 0.77, 0.61], oni: [0.45, 0.49, 0.73, 0.59],
  spear: [0.35, 0.46, 0.71, 0.71], bow: [0.49, 0.53, 0.82, 0.5],
  shadow: [0.31, 0.4, 0.88, 0.48], shield: [0.24, 0.46, 0.77, 0.49],
  ritual: [0.74, 0.63, 0.81, 0.52], tengu: [0.49, 0.36, 0.83, 0.51],
  heavy: [0.22, 0.42, 0.68, 0.56], kuro: [0.25, 0.44, 0.53, 0.5],
  raijin: [0.27, 0.45, 0.68, 0.56], coloso: [0.24, 0.4, 0.72, 0.50],
  tambor: [0.26, 0.7, 0.71, 0.47]
};

// Capture neutral anchors in actor space. The same animated joints that drive the 3D rig
// then drive the illustrated wrists, steps and head, independent of camera or root movement.
function jointDriver(root: THREE.Object3D, joints: (Joint | null)[]): Driver {
  const inverse = new THREE.Matrix4();
  function local(joint: Joint, point: THREE.Vector3) {
    joint.node.updateWorldMatrix(true, false);
    if (joint.at) point.copy(joint.at).applyMatrix4(joint.node.matrixWorld);
    else point.setFromMatrixPosition(joint.node.matrixWorld);
    return point.applyMatrix4(inverse);
  }
  root.updateWorldMatrix(true, false);
  inverse.copy(root.matrixWorld).invert();
  const rest = joints.map(joint => joint ? local(joint, new THREE.Vector3()) : new THREE.Vector3());
  return result => {
    inverse.copy(root.matrixWorld).invert();
    joints.forEach((joint, i) => {
      if (joint) local(joint, result[i]).sub(rest[i]);
      else result[i].setScalar(0);
    });
  };
}

function skeletonDriver(root: THREE.Object3D) {
  const bones = new Map<string, THREE.Object3D>();
  root.traverse(node => {
    if ((node as THREE.Bone).isBone) bones.set(node.name.replace(/^mixamorig:?/, ''), node);
  });
  if (!bones.has('RightHand')) return;
  return jointDriver(root, ['RightHand', 'LeftHand', 'RightFoot', 'LeftFoot', 'Head'].map(name => {
    const node = bones.get(name);
    return node ? { node } : null;
  }));
}

function paintedRig(frame: Frame, grip: Grip) {
  const geometry = new THREE.PlaneGeometry(1, 1, 16, 20).translate(0.5 - frame.footing, 0.5, 0);
  const position = (geometry.attributes.position as THREE.BufferAttribute).setUsage(THREE.DynamicDrawUsage);
  const original = new Float32Array(position.array);
  const uv = geometry.attributes.uv;
  const weights = new Float32Array(position.count * 5);
  const [rx, ry, lx, ly] = grip;
  const envelope = (x: number, center: number, width: number) => Math.exp(-(((x - center) / width) ** 2));
  for (let i = 0; i < uv.count; i++) {
    const x = uv.getX(i), y = uv.getY(i), w = 5 * i;
    const legs = 1 - THREE.MathUtils.smoothstep(y, 0.17, 0.43);
    const side = THREE.MathUtils.smoothstep(x, frame.footing - 0.14, frame.footing + 0.14);
    const arm = THREE.MathUtils.smoothstep(y, 0.16, 0.36) * (1 - THREE.MathUtils.smoothstep(y, 0.71, 0.98));
    const right = envelope(x, rx, 0.23) * envelope(y, ry, 0.26);
    const left = envelope(x, lx, 0.23) * envelope(y, ly, 0.26);
    weights[w] = arm * right * (1 - left * 0.56);
    weights[w + 1] = arm * left * (1 - right * 0.56);
    weights[w + 2] = legs * (1 - side);
    weights[w + 3] = legs * side;
    weights[w + 4] = THREE.MathUtils.smoothstep(y, 0.59, 0.93) * 0.75;
  }
  // Keep culling bounds stable while a leg or arm swings past the neutral crop.
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.5, 0), 1.06);
  return { geometry, position, original, weights };
}

interface IllustrationActor {
  root: THREE.Object3D;
  sprite: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  mask: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  frame: Frame;
  pose: () => IllustrationPose;
  height: number;
  mirror: boolean;
  facing: number;
  rig: ReturnType<typeof paintedRig>;
  driver?: Driver;
  motion: Float32Array;
  lastTime: number;
  lean: number;
}
const actors = new Map<THREE.Object3D, IllustrationActor | null>();

export function mountIllustration(root: THREE.Object3D, key: Illustration, height: number, original: THREE.Object3D[],
  pose: () => IllustrationPose, smithArms?: [Joint, Joint]) {
  const driver = smithArms ? jointDriver(root, [...smithArms, null, null, null]) : skeletonDriver(root);
  actors.set(root, null);
  illustration(key).then(frame => {
    if (!actors.has(root)) return;
    const material = tagMat(new THREE.MeshBasicMaterial({ map: frame.map, alphaTest: 0.51, color: 0xd3c9bd, toneMapped: false }), CLS.actor);
    const maskMaterial = depthMask(new THREE.MeshBasicMaterial({ map: frame.map, alphaTest: material.alphaTest, fog: false }));
    const rig = paintedRig(frame, grips[key]);
    const sprite = new THREE.Mesh(rig.geometry, material), mask = new THREE.Mesh(rig.geometry, maskMaterial);
    sprite.name = 'Ilustración manga';
    mask.matrixAutoUpdate = false;
    illustrationMaskScene.add(mask);
    root.add(sprite);
    original.forEach(part => { part.visible = false; });
    actors.set(root, { root, sprite, mask, frame, pose, height, mirror: key !== 'masa', facing: 1,
      rig, driver, motion: new Float32Array(10), lastTime: state.time, lean: 0 });
  }).catch(error => console.warn(`No se pudo cargar el arte de ${key}`, error));
}

export function removeIllustration(root: THREE.Object3D) {
  const actor = actors.get(root);
  if (actor) {
    actor.mask.removeFromParent();
    actor.sprite.removeFromParent();
    actor.mask.material.dispose();
    actor.sprite.material.dispose();
    actor.rig.geometry.dispose();
  }
  actors.delete(root);
}

const at = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), view = new THREE.Quaternion(), rotation = new THREE.Quaternion();
const litArt = new THREE.Color(0xd3c9bd), hurtArt = new THREE.Color(0xff9c80);
const clip = new THREE.Matrix4(), frustum = new THREE.Frustum(), volume = new THREE.Sphere();
const offsets: JointOffsets = Array.from({ length: 5 }, () => new THREE.Vector3());

function deformIllustration(art: IllustrationActor, dt: number, sway: number, moving: boolean, brace: number, strike: number) {
  if (!dt) return;
  const { driver, height, frame, rig, motion } = art;
  if (driver) driver(offsets);
  else {
    offsets[0].set(-0.15 * strike, 0.24 * brace + 0.09 * strike, 0.16 * strike);
    offsets[1].set(0.056 * sway, 0.11 * brace, -0.04 * strike);
    offsets[2].set(moving ? sway * 0.16 : 0, moving ? Math.max(0, sway) * 0.116 : 0, 0);
    offsets[3].set(moving ? -sway * 0.16 : 0, moving ? Math.max(0, -sway) * 0.116 : 0, 0);
    offsets[4].set(sway * 0.018, -brace * 0.06, 0);
  }
  const mix = 1 - Math.exp(-dt * 22), maxStep = dt * 1.7;
  const width = height * frame.aspect;
  for (let i = 0; i < offsets.length; i++) {
    const { x, y, z } = offsets[i], index = 2 * i;
    const dx = THREE.MathUtils.clamp((x * 0.81 + z * 0.49) / width, -0.17, 0.17);
    const dy = THREE.MathUtils.clamp(y / height, -0.13, 0.16);
    motion[index] += THREE.MathUtils.clamp((dx - motion[index]) * mix, -maxStep, maxStep);
    motion[index + 1] += THREE.MathUtils.clamp((dy - motion[index + 1]) * mix, -maxStep, maxStep);
  }
  for (let i = 0; i < rig.position.count; i++) {
    let x = rig.original[i * 3], y = rig.original[i * 3 + 1];
    for (let j = 0; j < 5; j++) {
      const w = rig.weights[i * 5 + j];
      x += w * motion[j * 2];
      y += w * motion[j * 2 + 1];
    }
    rig.position.setXY(i, x, y);
  }
  rig.position.needsUpdate = true;
}

export function updateIllustrations(scene: THREE.Scene, camera: THREE.Camera) {
  camera.updateMatrixWorld();
  frustum.setFromProjectionMatrix(clip.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  let visible = false;
  for (const art of actors.values()) {
    if (!art) continue;
    const { root, sprite, mask, pose, frame, height } = art;
    let ancestor: THREE.Object3D | null = root;
    while (ancestor && ancestor.visible && ancestor !== scene) ancestor = ancestor.parent;
    sprite.visible = mask.visible = ancestor === scene;
    if (!mask.visible) continue;
    root.getWorldPosition(at);
    const size = height * Math.max(root.scale.x, root.scale.y, root.scale.z);
    volume.center.copy(at).y += size * 0.5;
    volume.radius = size * Math.max(frame.aspect, 0.72);
    sprite.visible = mask.visible = frustum.intersectsSphere(volume);
    if (!mask.visible) continue;
    visible = true;
    const yaw = Math.atan2(camera.position.x - at.x, camera.position.z - at.z);
    if (art.mirror) {
      const side = Math.sin(root.rotation.y - yaw);
      if (Math.abs(side) > 0.14) art.facing = Math.sign(side);
    }
    const { moving, brace = 0, strike = 0, hit = 0 } = pose();
    const dt = THREE.MathUtils.clamp(state.time - art.lastTime, 0, 0.05);
    art.lastTime = state.time;
    const beat = state.time * (moving ? 13 : 2) + root.id * 1.71;
    const sway = Math.sin(beat);
    view.setFromAxisAngle(up, yaw);
    root.getWorldQuaternion(rotation);
    sprite.quaternion.copy(rotation.invert()).multiply(view);
    art.lean = THREE.MathUtils.damp(art.lean, art.facing * (0.012 * sway - brace * 0.046 + strike * 0.083), 20, dt);
    sprite.rotateZ(art.lean);
    sprite.scale.set(height * frame.aspect * art.facing, height * (1 + sway * 0.006), 1);
    deformIllustration(art, dt, sway, !!moving, brace, strike);
    sprite.material.color.copy(litArt).lerp(hurtArt, hit * 0.55);
    sprite.updateWorldMatrix(false, false);
    mask.matrix.copy(sprite.matrixWorld);
    mask.matrixWorldNeedsUpdate = true;
  }
  return visible;
}
