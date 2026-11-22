// Realistic characters: a motion-captured human skeleton (Idle / Walk / Run) wearing
// procedural samurai armour bolted onto its bones, with two-handed katana IK on top of the mocap.
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import {
  softBlobTex, MAT, laceMat, curvedPanel, openCyl, bladeGeometry, hornGeometry, mesh, grp,
  DASH, ATTACKS, sampleKeys, sampleScalar, smooth, clamp, key
} from './samurai';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Avatar, AvatarInput, OniWarrior } from './types';

const V = THREE.Vector3, Q = THREE.Quaternion, TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const UP = new V(0, 1, 0);

// ------------------------------------------------------------ bone helpers
const _q1 = new Q(), _q2 = new Q(), _qd = new Q();
function rotateBoneTo(bone: THREE.Object3D, from: THREE.Vector3, to: THREE.Vector3) {
  _qd.setFromUnitVectors(from.normalize(), to.normalize());
  bone.getWorldQuaternion(_q1).premultiply(_qd);
  bone.parent!.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q1));
  bone.updateMatrixWorld(true);
}
function rotateBoneWorld(bone: THREE.Object3D, axis: THREE.Vector3, ang: number) {
  if (!ang) return;
  _qd.setFromAxisAngle(axis, ang);
  bone.getWorldQuaternion(_q1).premultiply(_qd);
  bone.parent!.getWorldQuaternion(_q2).invert();
  bone.quaternion.copy(_q2.multiply(_q1));
  bone.updateMatrixWorld(true);
}
// analytic two-bone IK in world space; keeps each bone's twist from the animation
function ik2(up: THREE.Object3D, lo: THREE.Object3D, end: THREE.Object3D, target: THREE.Vector3, pole: THREE.Vector3, weight = 1) {
  const a = up.getWorldPosition(new V()), b = lo.getWorldPosition(new V()), c = end.getWorldPosition(new V());
  const l1 = a.distanceTo(b), l2 = b.distanceTo(c);
  const toT = target.clone().sub(a);
  const d = clamp(toT.length(), 0.05, l1 + l2 - 0.002), dir = toT.normalize();
  const cosA = clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1);
  const axis = new V().crossVectors(dir, pole).normalize();
  const u = dir.clone().applyAxisAngle(axis, Math.acos(cosA));
  const cur = b.clone().sub(a).normalize();
  rotateBoneTo(up, cur.clone(), cur.clone().lerp(u, weight));
  const b2 = lo.getWorldPosition(new V()), c2 = end.getWorldPosition(new V());
  const reach = a.clone().addScaledVector(dir, d);
  const curF = c2.clone().sub(b2).normalize();
  rotateBoneTo(lo, curF.clone(), curF.clone().lerp(reach.sub(b2).normalize(), weight));
}
function boneMap(model: THREE.Object3D) {
  const b: Record<string, THREE.Object3D> = {};
  model.traverse(o => { if (/^mixamorig/.test(o.name)) b[o.name.replace(/^mixamorig:?/, '')] = o; });
  return b;
}

// Clone the rigged model, face it to +z, put it in bind pose and return helpers.
function prepareRig(gltf: GLTF, tint: THREE.ColorRepresentation, scale?: THREE.Vector3) {
  const root = new THREE.Group();
  const body = grp(root);
  const holder = grp(body);
  const model = SkeletonUtils.clone(gltf.scene);
  holder.add(model);
  if (scale) holder.scale.copy(scale);
  const B = boneMap(model);
  type SkinnedLit = THREE.SkinnedMesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
  let skinned = null as SkinnedLit | null;
  model.traverse(obj => {
    const o = obj as SkinnedLit;
    if (o.isSkinnedMesh) {
      if (/visor/i.test(o.name)) o.visible = false;
      else skinned = o;
      o.frustumCulled = false;
    }
  });
  if (!skinned) throw new Error('el modelo no tiene malla con esqueleto');
  skinned.material = skinned.material.clone();
  skinned.material.color.set(tint);
  skinned.material.roughness = 0.85; skinned.material.metalness = 0.05;
  skinned.skeleton.pose();
  root.updateMatrixWorld(true);
  const P = (n: string) => B[n].getWorldPosition(new V());
  // make sure the character looks down +z (toes ahead of the feet) with its left side on +x
  if (P('LeftToe_End').z < P('LeftFoot').z) { holder.rotation.y = Math.PI; root.updateMatrixWorld(true); }
  const side = Math.sign(P('LeftArm').x) || 1;
  const mixer = new THREE.AnimationMixer(model);
  const clip = (n: string) => gltf.animations.find(a => a.name === n);
  const act: Partial<Record<'Idle' | 'Walk' | 'Run', THREE.AnimationAction>> = {};
  for (const n of ['Idle', 'Walk', 'Run'] as const) { const c = clip(n); if (c) { const a = act[n] = mixer.clipAction(c); a.play(); a.setEffectiveWeight(0); } }
  act.Idle?.setEffectiveWeight(1);
  // world-space attach in bind pose: build the prop in root space, then reparent onto the bone
  const attach = <T extends THREE.Object3D>(boneName: string, obj: T): T => { root.add(obj); obj.updateMatrixWorld(true); B[boneName].attach(obj); return obj; };
  return { root, body, holder, model, B, P, side, mixer, act, attach, skinned };
}
function finish(rig: ReturnType<typeof prepareRig>) {
  rig.root.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  rig.skinned.skeleton.pose();
}

// ------------------------------------------------------------ samurai armour pieces (in root space)
export function buildHelmet() {
  const head = new THREE.Group();
  const menpo = mesh(new THREE.SphereGeometry(0.106, 24, 12, Math.PI / 2 - 1.15, 2.3, 1.62, 1.0), MAT.redLac, head);
  menpo.scale.set(0.95, 1.08, 1.05);
  const nose = mesh(new THREE.ConeGeometry(0.016, 0.04, 6), MAT.redLac, head, 0, -0.005, 0.11); nose.rotation.x = Math.PI / 2 + 0.5;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) {
    const h = mesh(new THREE.BoxGeometry(0.032, 0.004, 0.004), MAT.white, head, 0.022 * s, -0.03 - i * 0.004, 0.106 - i * 0.002);
    h.rotation.z = (0.35 + i * 0.12) * -s; h.rotation.y = 0.3 * s;
  }
  for (let i = 0; i < 3; i++) mesh(openCyl(0.1 + i * 0.012, 0.115 + i * 0.012, 0.035, -1.3, 2.6, 20), laceMat(0.6, 0.25), head, 0, -0.095 - i * 0.03, 0.0);
  const kab = grp(head, 0, 0.035, -0.005);
  const hachi = mesh(new THREE.SphereGeometry(0.135, 32, 16, 0, TAU, 0, Math.PI / 2), MAT.lacquer, kab); hachi.scale.y = 0.95;
  for (let i = 0; i < 16; i++) { const r = mesh(new THREE.TorusGeometry(0.1355, 0.0032, 4, 28, Math.PI), MAT.iron, kab); r.rotation.y = (i / 16) * Math.PI; r.scale.y = 0.95; }
  mesh(new THREE.TorusGeometry(0.02, 0.006, 6, 14), MAT.gold, kab, 0, 0.127, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.TorusGeometry(0.137, 0.006, 6, 40), MAT.gold, kab, 0, 0.004, 0).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.14, 0.185, 0.05, 28, 1, true, -1.05, 2.1), MAT.lacquer, kab, 0, -0.012, 0);
  for (let i = 0; i < 4; i++) {
    mesh(openCyl(0.148 + i * 0.03, 0.172 + i * 0.03, 0.055, 1.2, TAU - 2.4), laceMat(2.4, 0.25), kab, 0, -0.025 - i * 0.048, 0);
  }
  for (const s of [-1, 1]) {
    const fg = grp(kab, Math.sin(1.2) * 0.16 * s, -0.04, Math.cos(1.2) * 0.16); fg.rotation.y = 0.75 * s;
    mesh(new THREE.BoxGeometry(0.075, 0.075, 0.012), MAT.lacquer, fg);
    mesh(new THREE.BoxGeometry(0.08, 0.08, 0.008), MAT.gold, fg, 0, 0, -0.003);
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.006, 14), MAT.gold, fg, 0, 0, 0.008).rotation.x = Math.PI / 2;
  }
  const hg = hornGeometry();
  const kwd = mesh(new THREE.BoxGeometry(0.06, 0.05, 0.012), MAT.gold, kab, 0, 0.035, 0.128); kwd.rotation.x = -0.25;
  for (const s of [-1, 1]) { const h = mesh(hg, MAT.gold, kab, 0.012 * s, 0.045, 0.13); h.scale.x = s; h.rotation.x = -0.18; }
  mesh(new THREE.CylinderGeometry(0.026, 0.026, 0.008, 20), MAT.gold, kab, 0, 0.09, 0.145).rotation.x = Math.PI / 2 - 0.2;
  return head;
}

// ------------------------------------------------------------ the ronin (stylised: straw kasa, black armour, vermilion stripes, teal cloth)
const RONIN = { red: '#e4573d', redDark: '#8e2a1c', black: '#0d0c0f', teal: 0x2b7f8c, tan: 0xd9a35a };
function stripeTex(vertical: boolean, cols = 6) {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const x = c.getContext('2d')!;
  x.fillStyle = RONIN.black; x.fillRect(0, 0, 128, 128);
  const n = cols, w = 128 / n;
  for (let i = 0; i < n; i++) {
    const g = vertical ? x.createLinearGradient(i * w, 0, i * w + w, 0) : x.createLinearGradient(0, i * w, 0, i * w + w);
    g.addColorStop(0, RONIN.redDark); g.addColorStop(0.25, RONIN.red); g.addColorStop(0.7, RONIN.red); g.addColorStop(1, RONIN.redDark);
    x.fillStyle = g;
    if (vertical) x.fillRect(i * w + w * 0.18, 4, w * 0.62, 120); else x.fillRect(0, i * w + w * 0.2, 128, w * 0.55);
    // brush-like notches, like the ink illustration
    x.fillStyle = RONIN.black;
    for (let k = 0; k < 5; k++) {
      if (vertical) x.fillRect(i * w + w * (0.25 + Math.random() * 0.5), 100 + Math.random() * 20, 1.5, 28);
      else x.fillRect(Math.random() * 128, i * w + w * 0.55, 2, w * 0.25);
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function hatTex() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 64;
  const x = c.getContext('2d')!;
  x.fillStyle = '#121114'; x.fillRect(0, 0, 256, 64);
  for (let i = 0; i < 60; i++) {
    const px = Math.random() * 256, len = 14 + Math.random() * 40, a = 0.15 + Math.random() * 0.45;
    x.strokeStyle = `rgba(225,225,230,${a})`; x.lineWidth = 0.8 + Math.random() * 1.6;
    x.beginPath(); x.moveTo(px, 64); x.lineTo(px + (Math.random() - 0.5) * 3, 64 - len); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping; return t;
}
const lacq = (map: THREE.Texture, rx: number, ry: number) => { const m = map.clone(); m.repeat.set(rx, ry); m.needsUpdate = true; return new THREE.MeshPhysicalMaterial({ map: m, roughness: 0.45, clearcoat: 0.6, clearcoatRoughness: 0.25, side: THREE.DoubleSide }); };

export function createRealSamurai(gltf: GLTF): Avatar {
  const rig = prepareRig(gltf, RONIN.teal, new V(0.95, 1.03, 0.95));
  const { root, body, B, P, side, attach, act, mixer } = rig;
  const hips = P('Hips'), neck = P('Neck'), head = P('Head'), top = P('HeadTop_End');
  const lArm = P('LeftArm'), rArm = P('RightArm'), lFore = P('LeftForeArm'), rFore = P('RightForeArm'), lHand = P('LeftHand'), rHand = P('RightHand');
  const sw = Math.abs(lArm.x - rArm.x) / 2, torsoH = neck.y - hips.y, hh = top.y - head.y;
  const H = stripeTex(false, 5), Vt = stripeTex(true, 6);
  const black = new THREE.MeshPhysicalMaterial({ color: 0x0f0e12, roughness: 0.4, clearcoat: 0.7, side: THREE.DoubleSide });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x111317, roughness: 0.95, side: THREE.DoubleSide });
  const teal = new THREE.MeshStandardMaterial({ color: RONIN.teal, roughness: 0.85, side: THREE.DoubleSide });
  const tan = new THREE.MeshStandardMaterial({ color: RONIN.tan, roughness: 0.9 });
  const red = new THREE.MeshStandardMaterial({ color: 0xe4573d, roughness: 0.55 });
  const hair = new THREE.MeshStandardMaterial({ color: 0x0b0a0c, roughness: 0.6, side: THREE.DoubleSide });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc8955a, roughness: 0.6 });

  // ---- straw kasa + long hair + half mask
  const hg = new THREE.Group();
  const kasa = mesh(new THREE.ConeGeometry(0.3, 0.16, 40, 1, true), new THREE.MeshStandardMaterial({ map: hatTex(), roughness: 0.9, side: THREE.DoubleSide }), hg, 0, 0.15, 0);
  kasa.rotation.x = 0.14;
  mesh(new THREE.TorusGeometry(0.3, 0.008, 4, 48), black, hg, 0, 0.07, 0.02).rotation.x = Math.PI / 2 + 0.14;
  mesh(new THREE.ConeGeometry(0.04, 0.04, 8), new THREE.MeshStandardMaterial({ color: 0xd8d8de, roughness: 0.6 }), hg, 0, 0.245, -0.012);
  const mask = mesh(new THREE.SphereGeometry(0.1, 18, 10, Math.PI / 2 - 0.9, 1.8, 1.45, 0.9), skin, hg, 0, -0.03, 0.012); mask.scale.set(0.95, 1.1, 1.05);
  mesh(new THREE.BoxGeometry(0.05, 0.006, 0.01), hair, hg, 0, -0.06, 0.112);
  const strands: { g: THREE.Group; ph: number; base: number; st: THREE.Mesh }[] = [];
  for (let i = 0; i < 34; i++) {
    const a = Math.PI * 0.35 + (i / 33) * Math.PI * 1.3, len = rnd(0.35, 0.62);
    const sg = new THREE.Group(); sg.position.set(Math.cos(a) * 0.095, 0.02, Math.sin(a) * -0.095 - 0.01); sg.rotation.y = -a + Math.PI / 2;
    const st = new THREE.Mesh(new THREE.PlaneGeometry(rnd(0.025, 0.045), len, 1, 4), hair);
    st.geometry.translate(0, -len / 2, 0); st.rotation.x = rnd(0.05, 0.25); sg.add(st); hg.add(sg);
    strands.push({ g: sg, ph: Math.random() * 6, base: st.rotation.x, st });
  }
  hg.scale.setScalar(hh / 0.215);
  hg.position.set(head.x, head.y + hh * 0.45, head.z + 0.01);
  attach('Head', hg);

  // ---- cuirass with bold horizontal vermilion bands
  const doPts = [[0.2, -0.27], [0.215, -0.18], [0.235, -0.05], [0.245, 0.06], [0.235, 0.15], [0.205, 0.22], [0.15, 0.25]].map(([r, y]) => new THREE.Vector2(r, y));
  const chest = new THREE.Group();
  mesh(new THREE.LatheGeometry(doPts, 40), lacq(H, 3, 1.1), chest).scale.z = 0.74;
  for (const s of [-1, 1]) mesh(new THREE.BoxGeometry(0.07, 0.03, 0.3), black, chest, 0.13 * s, 0.255, -0.01);
  const cs = (sw / 0.2) * 1.02;
  chest.scale.set(cs, (torsoH * 0.82) / 0.52, cs * 1.05);
  chest.position.set(hips.x, hips.y + torsoH * 0.52, hips.z - 0.005);
  attach('Spine1', chest);

  // ---- long black scarf streaming behind
  const scarf = new THREE.Group();
  const ribbons: { geo: THREE.PlaneGeometry; base: Float32Array; len: number; ph: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const len = rnd(1.2, 1.9), w = rnd(0.07, 0.15), geo = new THREE.PlaneGeometry(w, len, 1, 18);
    geo.rotateX(Math.PI / 2); geo.translate(0, 0, -len / 2);              // lies along -z (behind the neck)
    const m = new THREE.Mesh(geo, hair); m.position.set((i - 1.5) * 0.05, 0, 0); scarf.add(m);
    ribbons.push({ geo, base: Float32Array.from(geo.attributes.position.array), len, ph: Math.random() * 6 });
  }
  mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 20), hair, scarf, 0, -0.02, 0.06).rotation.x = Math.PI / 2;
  scarf.position.set(neck.x, neck.y - 0.02, neck.z - 0.06);
  attach('Spine2', scarf);

  // ---- teal obi, kusazuri with vertical stripes, red tassels
  const waist = new THREE.Group();
  const obi = mesh(new THREE.TorusGeometry(0.205, 0.03, 8, 32), teal, waist, 0, 0.035, 0); obi.rotation.x = Math.PI / 2; obi.scale.y = 0.78;
  mesh(new THREE.TorusKnotGeometry(0.025, 0.01, 24, 5), teal, waist, 0.12, 0.03, 0.15);
  const kusa: THREE.Group[] = [];
  for (const th of [-2.6, -1.95, -1.3, -0.65, 0, 0.65, 1.3, 1.95, 2.6]) {
    const g = grp(waist, Math.sin(th) * 0.215, 0.02, Math.cos(th) * 0.17); g.rotation.y = th; g.rotation.x = -0.2;
    const p = curvedPanel(0.15, 0.42, 0.9, lacq(Vt, 0.5, 1)); p.position.y = -0.21; g.add(p);
    mesh(new THREE.BoxGeometry(0.155, 0.025, 0.012), black, g, 0, 0, -0.005);
    for (const sx of [-0.06, 0.06]) { const t = mesh(new THREE.ConeGeometry(0.014, 0.07, 6), red, g, sx, -0.44, 0.005); t.rotation.z = Math.PI; }
    kusa.push(g);
  }
  {
    const s = grp(waist, 0.2, 0.02, 0.04); s.rotation.set(-0.35, 0.18, 0.1);
    mesh(new THREE.CylinderGeometry(0.018, 0.015, 0.78, 10), black, s, 0, 0, -0.3).rotation.x = Math.PI / 2;
    mesh(new THREE.CylinderGeometry(0.017, 0.018, 0.24, 8), tan, s, 0, 0, 0.2).rotation.x = Math.PI / 2;
  }
  waist.scale.set(cs, 1, cs);
  waist.position.set(hips.x, hips.y + 0.04, hips.z);
  attach('Hips', waist);

  // ---- big striped sode, striped forearm guards, red gloves
  for (const [nm, a, f, s, isLeft] of [['LeftArm', lArm, lFore, side, true], ['RightArm', rArm, rFore, -side, false]] as [string, THREE.Vector3, THREE.Vector3, number, boolean][]) {
    const g = new THREE.Group(), len = a.distanceTo(f);
    const panel = curvedPanel(0.27, Math.min(0.36, len * 1.1), 1.5, lacq(H, 1, 1.3)); panel.rotation.set(-Math.PI / 2, 0, Math.PI / 2); g.add(panel);
    mesh(new THREE.BoxGeometry(0.03, 0.03, 0.28), black, g, -s * len * 0.5, 0.01, 0);
    g.position.set(a.x + s * len * 0.42, a.y + 0.08, a.z);
    attach(nm, g);
    const h = isLeft ? lHand : rHand, fl = f.distanceTo(h);
    const k = new THREE.Group();
    const sleeve = mesh(new THREE.CylinderGeometry(0.052, 0.046, fl * 0.85, 12, 1, true), lacq(Vt, 1.5, 1), k); sleeve.rotation.z = Math.PI / 2;
    k.position.set((f.x + h.x) / 2, f.y, f.z);
    attach(isLeft ? 'LeftForeArm' : 'RightForeArm', k);
    const glove = new THREE.Group(); mesh(new THREE.BoxGeometry(0.09, 0.03, 0.085), red, glove, s * 0.045, 0.03, 0);
    glove.position.copy(h); attach(isLeft ? 'LeftHand' : 'RightHand', glove);
  }

  // ---- black hakama legs, striped shin guards, tan foot wraps
  for (const pre of ['Left', 'Right']) {
    const u = P(pre + 'UpLeg'), l = P(pre + 'Leg'), ft = P(pre + 'Foot'), toe = P(pre + 'ToeBase');
    const th = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.12, 0.17, u.distanceTo(l) + 0.04, 14, 1, true), cloth, th);
    th.position.copy(u).lerp(l, 0.5); attach(pre + 'UpLeg', th);
    const sh = new THREE.Group(), sl = l.distanceTo(ft);
    mesh(new THREE.CylinderGeometry(0.17, 0.15, sl * 0.3, 14, 1, true), teal, sh, 0, sl * 0.32, 0);
    mesh(new THREE.CylinderGeometry(0.064, 0.055, sl * 0.62, 14, 1, true), lacq(Vt, 1.6, 1), sh, 0, -sl * 0.1, 0.004);
    sh.position.copy(l).lerp(ft, 0.5); attach(pre + 'Leg', sh);
    const fw = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.055, 0.06, 0.1, 10), tan, fw, 0, 0.02, 0);
    const foot = mesh(new THREE.BoxGeometry(0.1, 0.06, 0.2), tan, fw, 0, -0.04, 0.08); void foot;
    fw.position.copy(ft); attach(pre + 'Foot', fw);
    void toe;
  }

  // ---- katana (tan-wrapped hilt): one hand at rest, both hands when cutting
  const katana = grp(body);
  mesh(new THREE.CylinderGeometry(0.016, 0.017, 0.26, 10), tan, katana).rotation.x = Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.043, 0.043, 0.008, 28), black, katana, 0, 0, 0.137).rotation.x = Math.PI / 2;
  mesh(new THREE.BoxGeometry(0.012, 0.034, 0.028), MAT.gold, katana, 0, -0.001, 0.155);
  mesh(bladeGeometry(), MAT.steel, katana);

  const blob = new THREE.Mesh(new THREE.CircleGeometry(0.55, 20), new THREE.MeshBasicMaterial({ color: 0, alphaMap: softBlobTex(), transparent: true, opacity: 0.6, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = 0.03; root.add(blob);
  finish(rig);
  blob.castShadow = false;

  const ky = ((lArm.y + rArm.y) / 2) / 1.39;
  // relaxed one-handed carry: blade low, pointing down and forward like the illustration
  const LOW = key([-0.3, 0.9, 0.2], [-0.18, -0.6, 0.78], [0, -0.35, 1]);
  const LOW_RUN = key([-0.3, 0.95, 0.12], [-0.25, -0.45, 0.86], [0, -0.3, 1]);
  const tPos = new V(), tQ = new Q(), hand = new V(), pole = new V(), bq = new Q();
  const POLE_R = new V(-0.8 * side, -0.5, -0.3).normalize(), POLE_L = new V(0.8 * side, -0.5, -0.3).normalize();
  let look = 0, leftW = 0;
  katana.position.copy(LOW.pos).multiply(new V(1, ky, 1)); katana.quaternion.copy(LOW.q);

  // ---- locomotion: Idle / Walk / Run blended by the real ground speed, legs driven by distance
  // (not by the clock) so the feet don't skate. Measured from the clips: one gait cycle covers
  // ~1.45 m walking and ~2.75 m running; these offsets put both clips at the same foot (phase 0 =
  // right foot forward, right hand back), so walk and run cross-fade without the legs scissoring.
  const WALK_STRIDE = 1.45, RUN_STRIDE = 2.75, WALK_OFF = 0.783, RUN_OFF = 0.75;
  for (const n of ['Walk', 'Run'] as const) if (act[n]) act[n].timeScale = 0;
  const loco = { init: false, px: 0, pz: 0, yaw: 0, lag: 0, spd: 0, acc: 0, turn: 0, phase: 0, lean: 0, bank: 0, step: 0 };
  const angWrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));
  const ease = (rate: number, dt: number) => 1 - Math.exp(-dt * rate);
  const AX_X = new V(1, 0, 0), axis = new V(), swQ = new Q();

  function locomotion(dt: number, atk: AvatarInput['attack']) {
    const dts = Math.max(dt, 1e-4);
    if (!loco.init) { loco.init = true; loco.px = root.position.x; loco.pz = root.position.z; loco.yaw = root.rotation.y; }
    // speed, acceleration and turn rate, measured from how the root really moved this frame
    let raw = Math.hypot(root.position.x - loco.px, root.position.z - loco.pz) / dts;
    if (raw > 40) raw = loco.spd;                                   // respawn / teleport
    loco.px = root.position.x; loco.pz = root.position.z;
    const prev = loco.spd;
    loco.spd += (raw - loco.spd) * ease(10, dt);
    loco.acc += ((loco.spd - prev) / dts - loco.acc) * ease(6, dt);
    const dyaw = angWrap(root.rotation.y - loco.yaw); loco.yaw = root.rotation.y;
    loco.turn += (dyaw / dts - loco.turn) * ease(10, dt);
    // the body eases into a new heading instead of snapping (also softens the auto-aim snap)
    loco.lag = angWrap(loco.lag + dyaw) * Math.exp(-dt * (atk ? 26 : 15));

    const v = loco.spd;
    let idleW = 1 - smooth(clamp((v - 0.12) / 0.9, 0, 1));
    const runW = smooth(clamp((v - 2.2) / 2.2, 0, 1));
    // turning on the spot: small steps instead of pivoting on frozen feet
    const spinning = atk && atk.combo === 2;
    const stepT = spinning ? 0 : clamp((Math.abs(loco.turn) - 1.0) / 3, 0, 1) * (1 - clamp(v / 1.2, 0, 1));
    loco.step += (stepT - loco.step) * ease(10, dt);
    idleW *= 1 - loco.step * 0.75;
    act.Idle?.setEffectiveWeight(idleW);
    act.Walk?.setEffectiveWeight((1 - idleW) * (1 - runW));
    act.Run?.setEffectiveWeight((1 - idleW) * runW);
    const stride = WALK_STRIDE + (RUN_STRIDE - WALK_STRIDE) * runW;
    const cps = Math.max(Math.min(v / stride, 2.6), loco.step * 1.5);     // cycles per second (dash capped)
    loco.phase = (loco.phase + cps * dt) % 1;
    if (act.Walk) act.Walk.time = ((loco.phase + WALK_OFF) % 1) * act.Walk.getClip().duration;
    if (act.Run) act.Run.time = ((loco.phase + RUN_OFF) % 1) * act.Run.getClip().duration;

    // lean forward when speeding up, back when braking; bank into curves (more the faster you go)
    const leanT = clamp(loco.acc * 0.02, -0.14, 0.18) + runW * 0.05;
    loco.lean += (leanT - loco.lean) * ease(7, dt);
    const bankT = clamp(-loco.turn * Math.max(v, 1.2) * 0.02, -0.26, 0.26) * (spinning ? 0 : 1);
    loco.bank += (bankT - loco.bank) * ease(8, dt);
    return { idleW, runW, move: 1 - idleW };
  }

  function update(dt: number, s: AvatarInput) {
    const atk = s.attack, p = atk ? clamp(atk.p, 0, 1) : 0, m = s.moving, t = s.time;
    const L = locomotion(dt, atk);
    mixer.update(dt);
    const spin = atk && atk.combo === 2 ? smooth(clamp((p - 0.25) / 0.55, 0, 1)) * TAU : 0;
    body.rotation.set(0, spin - loco.lag, loco.bank);
    root.updateMatrixWorld(true);
    body.getWorldQuaternion(bq);
    const leftAxis = axis.copy(AX_X).applyQuaternion(bq);             // +x is the samurai's left; +angle leans forward

    const twist = atk ? sampleScalar(ATTACKS[atk.combo].twist, p) : 0;
    // upper body: attack twist + chest and head leading into the turn
    const lead = clamp(loco.lag * 0.5 + loco.turn * 0.03, -0.35, 0.35);
    rotateBoneWorld(B.Spine, UP, twist * 0.6 + lead * 0.35);
    rotateBoneWorld(B.Spine1, UP, twist * 0.4 + lead * 0.25);
    rotateBoneWorld(B.Spine, leftAxis, loco.lean + (s.dash ? 0.35 : 0));
    look += ((clamp((s.look ?? 0) + lead * 0.8, -0.9, 0.9) - twist * 0.5) - look) * (1 - Math.exp(-dt * 6));
    rotateBoneWorld(B.Neck, UP, look);
    // keep the head steadier than the torso when leaning (eyes stay level)
    rotateBoneWorld(B.Neck, leftAxis, -loco.lean * 0.5);

    if (atk) sampleKeys(ATTACKS[atk.combo].keys, p, tPos, tQ);
    else if (s.dash) { tPos.copy(DASH.pos); tQ.copy(DASH.q); }
    else {
      tPos.lerpVectors(LOW.pos, LOW_RUN.pos, m); tQ.slerpQuaternions(LOW.q, LOW_RUN.q, m);
      tPos.y += Math.sin(t * 1.9) * 0.008 * (1 - L.move);             // breathing at rest
      // sword arm swings with the stride: forward with the left foot, back with the right
      const g = -Math.cos(TAU * loco.phase), amp = L.move * (0.07 + 0.06 * L.runW);
      tPos.z += g * amp;
      tPos.y += (Math.abs(Math.sin(TAU * loco.phase)) - 0.5) * 0.025 * L.move + g * amp * 0.25;
      swQ.setFromAxisAngle(AX_X, -g * (0.16 + 0.1 * L.runW) * L.move);
      tQ.premultiply(swQ);
    }
    tPos.y *= ky;
    const k = 1 - Math.exp(-dt * (atk ? 32 : 18));
    katana.position.lerp(tPos, k); katana.quaternion.slerp(tQ, k);
    katana.updateMatrixWorld(true);

    body.getWorldQuaternion(bq);
    ik2(B.RightArm, B.RightForeArm, B.RightHand, katana.localToWorld(hand.set(0, 0, atk ? 0.065 : 0.0)), pole.copy(POLE_R).applyQuaternion(bq));
    leftW += ((atk ? 1 : 0) - leftW) * (1 - Math.exp(-dt * 18));
    if (leftW > 0.01) ik2(B.LeftArm, B.LeftForeArm, B.LeftHand, katana.localToWorld(hand.set(0, 0, -0.075)), pole.copy(POLE_L).applyQuaternion(bq), leftW);

    // scarf ribbons: travelling wave, streaming further back when running
    for (const r of ribbons) {
      const pa = r.geo.attributes.position;
      for (let i = 0; i < pa.count; i++) {
        const bz = r.base[i * 3 + 2], sN = Math.min(1, -bz / r.len);
        const wave = Math.sin(t * 6 - sN * 7 + r.ph) * 0.12 * sN + Math.sin(t * 2.3 + r.ph) * 0.05 * sN;
        pa.setX(i, r.base[i * 3] + wave * (1 + m) + sN * sN * 0.35);
        pa.setY(i, r.base[i * 3 + 1] - sN * sN * (0.9 - m * 0.7) + Math.cos(t * 5 - sN * 6 + r.ph) * 0.05 * sN);
        pa.setZ(i, bz * (0.75 + m * 0.25));
      }
      pa.needsUpdate = true;
    }
    // hair sways in the wind
    for (const h of strands) { h.st.rotation.x = h.base + 0.08 * Math.sin(t * 3 + h.ph) + m * 0.35; h.st.rotation.z = 0.06 * Math.sin(t * 2.1 + h.ph); }
    for (const g of kusa) g.rotation.x = -0.2 - Math.abs(Math.sin(t * 9)) * 0.08 * m;
  }
  return { root, update, katana, realistic: true };
}

// ------------------------------------------------------------ oni warrior
const oniMats = {
  horn: new THREE.MeshStandardMaterial({ color: 0xd9ccaa, roughness: 0.55 }),
  fang: new THREE.MeshStandardMaterial({ color: 0xf2ecdc, roughness: 0.4 }),
  hair: new THREE.MeshStandardMaterial({ color: 0x0c0b0d, roughness: 1 }),
  club: new THREE.MeshStandardMaterial({ color: 0x2a2a2f, metalness: 0.8, roughness: 0.45 }),
  stud: new THREE.MeshStandardMaterial({ color: 0x8a8a92, metalness: 0.9, roughness: 0.3 }),
  rope: new THREE.MeshStandardMaterial({ color: 0x9a8352, roughness: 1 })
};
/** how one kind of oni looks: body tint, mask colour, weapon */
export interface OniLook { big: boolean; tint: number; mask: number; eye?: number; weapon: 'club' | 'spear' | 'bow' | 'bigclub' }
const maskMats = new Map<number, THREE.MeshPhysicalMaterial>(), eyeMats = new Map<number, THREE.MeshBasicMaterial>();
const maskMat = (c: number) => { let m = maskMats.get(c); if (!m) maskMats.set(c, m = new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.4, clearcoat: 0.8, clearcoatRoughness: 0.2 })); return m; };
const eyeMat = (c: number) => { let m = eyeMats.get(c); if (!m) eyeMats.set(c, m = new THREE.MeshBasicMaterial({ color: c })); return m; };
const bowMats = { wood: new THREE.MeshStandardMaterial({ color: 0x3a2214, roughness: 0.6 }), string: new THREE.MeshBasicMaterial({ color: 0xd8d0b8 }), steel: new THREE.MeshStandardMaterial({ color: 0xb8bcc8, metalness: 0.9, roughness: 0.25 }) };
export function createOniWarrior(gltf: GLTF, look: OniLook): OniWarrior {
  const big = look.big, mMask = maskMat(look.mask), mEye = eyeMat(look.eye ?? 0xffd040);
  const rig = prepareRig(gltf, look.tint);
  const { root, B, P, side, attach, act, mixer } = rig;
  const head = P('Head'), top = P('HeadTop_End'), hips = P('Hips'), neck = P('Neck');
  const rHand = P('RightHand'), rArm = P('RightArm'), lArm = P('LeftArm');
  const sw = Math.abs(lArm.x - rArm.x) / 2;

  // hannya-style mask, horns, fangs and wild hair
  const h = new THREE.Group();
  const face = mesh(new THREE.SphereGeometry(0.112, 24, 14, Math.PI / 2 - 1.3, 2.6, 0.5, 2.1), mMask, h);
  face.scale.set(1, 1.12, 1.08);
  for (const s of [-1, 1]) {
    const brow = mesh(new THREE.BoxGeometry(0.06, 0.018, 0.03), mMask, h, 0.04 * s, 0.045, 0.105); brow.rotation.z = 0.45 * s;
    mesh(new THREE.SphereGeometry(0.014, 8, 6), mEye, h, 0.037 * s, 0.022, 0.112);
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.26, 8), oniMats.horn);
    horn.geometry.translate(0, 0.13, 0);
    horn.position.set(0.06 * s, 0.09, 0.03); horn.rotation.set(-0.35, 0, -0.55 * s); h.add(horn);
    for (let i = 0; i < 2; i++) { const f = mesh(new THREE.ConeGeometry(0.008, 0.04, 5), oniMats.fang, h, (0.022 + i * 0.022) * s, -0.06, 0.1); f.rotation.x = Math.PI; }
  }
  const mouth = mesh(new THREE.BoxGeometry(0.08, 0.012, 0.02), oniMats.hair, h, 0, -0.045, 0.108); void mouth;
  for (let i = 0; i < 26; i++) {
    const a = Math.PI * 0.55 + (i / 25) * Math.PI * 0.9, len = 0.18 + Math.random() * 0.22;
    const strand = new THREE.Mesh(new THREE.BoxGeometry(0.018, len, 0.01), oniMats.hair);
    strand.geometry.translate(0, -len / 2, 0);
    strand.position.set(Math.cos(a) * 0.1, 0.06 + Math.random() * 0.04, Math.sin(a) * -0.1 - 0.01);
    strand.rotation.set(-0.25 - Math.random() * 0.3, 0, Math.cos(a) * 0.4); h.add(strand);
  }
  h.scale.setScalar((top.y - head.y) / 0.215);
  h.position.set(head.x, head.y + (top.y - head.y) * 0.45, head.z + 0.01);
  attach('Head', h);

  // simple iron plates over the shoulders and a rope belt with a tattered apron
  const ch = new THREE.Group();
  for (const s of [-1, 1]) { const pl = curvedPanel(0.2, 0.16, 2.2, MAT.iron, 6, 2); pl.rotation.set(-Math.PI / 2 + 0.3, 0, 0); pl.position.set(sw * 0.75 * s, 0.02, 0); ch.add(pl); }
  ch.position.set(neck.x, neck.y - 0.04, neck.z); attach('Spine2', ch);
  const belt = new THREE.Group();
  const rope = mesh(new THREE.TorusGeometry(0.2, 0.02, 6, 28), oniMats.rope, belt); rope.rotation.x = Math.PI / 2; rope.scale.y = 0.8;
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * TAU, len = 0.3 + Math.random() * 0.15;
    const st = mesh(new THREE.BoxGeometry(0.1, len, 0.01), big ? mMask : MAT.hakama, belt, Math.sin(a) * 0.21, -len / 2, Math.cos(a) * 0.17);
    st.rotation.y = a; st.rotation.x = -0.15;
  }
  belt.scale.set(sw / 0.2, 1, sw / 0.2);
  belt.position.set(hips.x, hips.y + 0.03, hips.z); attach('Hips', belt);

  if (look.weapon === 'club' || look.weapon === 'bigclub') {
    // kanabo (studded iron club) in the right hand
    const club = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.06, 0.03, 0.95, 10), oniMats.club, club, 0, 0.42, 0);
    for (let r = 0; r < 6; r++) for (let j = 0; j < 8; j++) {
      const a = (j / 8) * TAU + r * 0.4, y = 0.25 + r * 0.11, rad = 0.035 + (y / 0.95) * 0.028;
      const st = mesh(new THREE.ConeGeometry(0.011, 0.03, 5), oniMats.stud, club, Math.cos(a) * rad, y, Math.sin(a) * rad);
      st.lookAt(Math.cos(a) * 2, y, Math.sin(a) * 2); st.rotateX(Math.PI / 2);
    }
    if (look.weapon === 'bigclub') club.scale.set(1.7, 1.35, 1.7);
    club.rotation.x = Math.PI / 2; // points forward from the fist
    club.position.set(rHand.x - side * 0.05, rHand.y - 0.02, rHand.z - 0.12);
    attach('RightHand', club);
  } else if (look.weapon === 'spear') {
    // yari: a long shaft with a steel blade, held forward
    const yari = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.016, 0.016, 2.1, 6), bowMats.wood, yari, 0, 0.55, 0);
    mesh(new THREE.ConeGeometry(0.03, 0.28, 4), bowMats.steel, yari, 0, 1.74, 0);
    mesh(new THREE.BoxGeometry(0.12, 0.02, 0.02), bowMats.steel, yari, 0, 1.6, 0);
    yari.rotation.x = Math.PI / 2;
    yari.position.set(rHand.x - side * 0.03, rHand.y, rHand.z);
    attach('RightHand', yari);
  } else {
    // yumi: a tall asymmetric bow in the left hand, and a quiver on the back
    const lHand = P('LeftHand'), yumi = new THREE.Group();
    const arc = mesh(new THREE.TorusGeometry(0.75, 0.014, 5, 24, Math.PI * 0.75), bowMats.wood, yumi); arc.rotation.z = Math.PI * 0.625; arc.position.x = -0.55;
    mesh(new THREE.CylinderGeometry(0.003, 0.003, 1.38, 3), bowMats.string, yumi, -0.27, 0.05, 0);
    yumi.rotation.y = Math.PI / 2;
    yumi.position.set(lHand.x, lHand.y + 0.1, lHand.z + 0.05);
    attach('LeftHand', yumi);
    const quiver = new THREE.Group();
    mesh(new THREE.CylinderGeometry(0.06, 0.05, 0.55, 8), oniMats.rope, quiver);
    for (let i = 0; i < 5; i++) mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.3, 3), bowMats.string, quiver, Math.cos(i) * 0.03, 0.4, Math.sin(i) * 0.03);
    quiver.rotation.z = 0.5 * side; quiver.position.set(neck.x, neck.y - 0.25, neck.z - 0.15);
    attach('Spine2', quiver);
  }

  const ring = new THREE.Mesh(new THREE.RingGeometry(0.85, 1.05, 28), new THREE.MeshBasicMaterial({ color: 0xff3020, transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending }));
  ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; root.add(ring);
  finish(rig);
  ring.castShadow = false;

  const flashMats: THREE.MeshStandardMaterial[] = [];
  root.traverse(obj => { const o = obj as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>; if (o.isMesh && o.material && 'emissive' in o.material && !flashMats.includes(o.material)) { if (o.material !== MAT.iron && o.material !== MAT.hakama) { o.material = o.material.clone(); flashMats.push(o.material); } } });
  const pole = new V(), bq = new Q(), tgt = new V();
  let lift = 0;
  act.Run && (act.Run.time = Math.random() * 2);
  function update(dt: number, s: Parameters<OniWarrior['update']>[1]) {
    const run = clamp(s.moving, 0, 1);
    act.Idle?.setEffectiveWeight(1 - run);
    act.Run?.setEffectiveWeight(run);
    if (act.Run) act.Run.timeScale = s.speed / 4.2;
    mixer.update(dt);
    root.updateMatrixWorld(true);
    // overhead wind-up, then smash down in front
    const want = s.state === 'windup' ? 1 : (s.state === 'strike' ? 2 : 0);
    lift += ((want === 1 ? 1 : 0) - lift) * (1 - Math.exp(-dt * 10));
    root.getWorldQuaternion(bq);
    if (want === 1 || lift > 0.02) {
      tgt.set(-side * 0.25, 2.05, -0.05).applyQuaternion(bq).add(root.position);
      ik2(B.RightArm, B.RightForeArm, B.RightHand, tgt, pole.set(-side, 0, -0.5).applyQuaternion(bq), lift);
      rotateBoneWorld(B.Spine, new V(1, 0, 0).applyQuaternion(bq), -0.25 * lift);
    }
    if (want === 2) {
      tgt.set(-side * 0.1, 0.8, 0.85).applyQuaternion(bq).add(root.position);
      ik2(B.RightArm, B.RightForeArm, B.RightHand, tgt, pole.set(-side, -0.5, 0).applyQuaternion(bq), 1);
      rotateBoneWorld(B.Spine, new V(1, 0, 0).applyQuaternion(bq), 0.4);
    }
  }
  function setFlash(f: number) { for (const m of flashMats) m.emissive.setScalar(f * 0.9); }
  return { root, update, setFlash, ring };
}
