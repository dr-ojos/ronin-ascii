// What the ronin wears, on the body: the armour bought from Masa (armor.ts) as real pieces — breastplate,
// skirt of plates, shoulder guards, a helmet that replaces the kasa — and an aura for the best ones
// (the fox's blue foxfire, Hachiman's golden halo). Every set is built once on the skeleton when the game
// loads and only the one you wear is shown. Also re-applies the chosen look (look.ts) on top.
import * as THREE from 'three';
import { sam } from './avatar';
import { ACTOR_LAYER } from './ascii';
import { CLS, tagMat, tagTree } from './materials';
import { applyLook, opt } from './look';
import { ARMORS, armor, type Armor } from './armor';
import { state } from './state';

const V = THREE.Vector3;
const root = sam.root;
const bones: Record<string, THREE.Object3D> = {};
root.traverse(o => { if (/^mixamorig/.test(o.name)) bones[o.name.replace(/^mixamorig:?/, '')] = o; });
const rigged = !!bones.Spine2;
root.updateMatrixWorld(true);
/** a bone's position in the samurai's own space (+z ahead, +y up) */
const P = (n: string) => root.worldToLocal(bones[n].getWorldPosition(new V()));

const sets = new Map<string, THREE.Object3D[]>();
const auras = new Map<string, THREE.Group>();

/** build `obj` in the samurai's space, then hang it on a bone so it follows the animation */
function hang(id: string, boneName: string, obj: THREE.Object3D) {
  root.add(obj); obj.updateMatrixWorld(true);
  bones[boneName].attach(obj);
  sets.get(id)!.push(obj);
  return obj;
}
function mats(a: Armor) {
  const l = a.look!, g = l.glow ?? 0.04;
  const plate = new THREE.MeshStandardMaterial({ color: l.plate, roughness: 0.32, metalness: l.glow ? 0.55 : 0.2, emissive: l.plate, emissiveIntensity: g, side: THREE.DoubleSide });
  const trim = new THREE.MeshStandardMaterial({ color: l.trim, roughness: 0.4, metalness: 0.6, emissive: l.trim, emissiveIntensity: Math.max(0.25, g), side: THREE.DoubleSide });
  return { plate, trim };
}
const finish = (o: THREE.Object3D) => {
  o.traverse(m => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.layers.enable(ACTOR_LAYER); } });
  return tagTree(o, CLS.actor);
};

function build(a: Armor) {
  const l = a.look!, { plate, trim } = mats(a);
  sets.set(a.id, []);
  const hips = P('Hips'), neck = P('Neck'), lArm = P('LeftArm'), rArm = P('RightArm');
  const sw = Math.abs(lArm.x - rArm.x) / 2, torsoH = neck.y - hips.y;

  // ---- breastplate: a lacquered shell over the chest, trimmed with bands
  {
    const g = new THREE.Group(), r = sw * 1.42, h = torsoH * 0.5;
    const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.9, h, 20, 1, true), plate); g.add(shell);
    for (const y of [-0.5, -0.17, 0.16, 0.5]) { const rb = r * (0.95 + 0.1 * y) * 1.03, b = new THREE.Mesh(new THREE.CylinderGeometry(rb, rb, h * 0.06, 20, 1, true), trim); b.position.y = y * h * 0.96; g.add(b); }
    // the crest on the front (a gold sun for the god of war, a plain disc for the others)
    const crest = new THREE.Mesh(new THREE.CircleGeometry(sw * (l.helmet === 'sun' ? 0.32 : 0.2), 20), trim); crest.position.set(0, h * 0.1, r * 0.83); g.add(crest);
    g.scale.z = 0.8;
    g.position.set(hips.x, hips.y + torsoH * 0.55, hips.z + 0.01);
    hang(a.id, 'Spine2', finish(g));
  }
  // ---- kusazuri: a skirt of hanging plates
  if (l.skirt) {
    const g = new THREE.Group(), r = sw * 1.32, n = 7, ph = 0.2 + l.sode * 0.05;
    for (let i = 0; i < n; i++) {
      const th = -Math.PI * 0.85 + (i / (n - 1)) * Math.PI * 1.7, k = new THREE.Group();
      k.position.set(Math.sin(th) * r, 0, Math.cos(th) * r * 0.85); k.rotation.y = th; k.rotation.x = 0.22; g.add(k);
      const p = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.62, ph, 0.02), plate); p.position.y = -ph / 2; k.add(p);
      const t = new THREE.Mesh(new THREE.BoxGeometry(sw * 0.64, 0.025, 0.025), trim); t.position.y = -ph + 0.012; k.add(t);
    }
    g.position.set(hips.x, hips.y + 0.02, hips.z);
    hang(a.id, 'Hips', finish(g));
  }
  // ---- sode: shoulder guards of stacked plates, lying along the upper arm
  for (const [arm, fore, name] of [['LeftArm', 'LeftForeArm', 'LeftArm'], ['RightArm', 'RightForeArm', 'RightArm']]) {
    const A = P(arm), F = P(fore), d = F.clone().sub(A).normalize();
    const out = new V(A.x - hips.x, 0, 0).normalize();
    const n = out.clone().multiplyScalar(0.7).add(new V(0, 0.75, 0)); n.addScaledVector(d, -n.dot(d)).normalize();
    const zA = new V().crossVectors(d, n).normalize();
    const g = new THREE.Group();
    g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(d, n, zA));
    const len = 0.17 + 0.07 * l.sode, wid = 0.2 + 0.06 * l.sode, lames = l.sode >= 1.3 ? 3 : 2;
    for (let i = 0; i < lames; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(len * (1 - i * 0.08), 0.025, wid), plate);
      p.position.set(len * (0.25 + i * 0.22), -i * 0.035, 0); p.rotation.z = -0.25; g.add(p);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, wid * 1.02), trim);
      t.position.set(len * (0.25 + i * 0.22) + len * 0.48, -i * 0.035 - len * 0.12, 0); g.add(t);
    }
    g.position.copy(A).addScaledVector(n, 0.07);
    hang(a.id, name, finish(g));
  }
  // ---- helmet (replaces the kasa)
  if (l.helmet) {
    const H = P('Head'), T = P('HeadTop_End'), hh = T.distanceTo(H), r = hh * 0.62;
    const g = new THREE.Group();
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(r, 18, 9, 0, Math.PI * 2, 0, Math.PI / 2), plate); g.add(bowl);
    for (let i = 0; i < 8; i++) { const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 1.005, r * 0.03, 4, 20, Math.PI / 2), trim); rib.rotation.set(0, (i / 8) * Math.PI * 2, Math.PI / 2); g.add(rib); }
    const shikoro = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 1.55, r * 0.55, 18, 1, true, Math.PI * 0.35, Math.PI * 1.3), plate);
    shikoro.position.y = -r * 0.25; shikoro.rotation.y = Math.PI; g.add(shikoro);
    const brim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.02, r * 0.06, 4, 24), trim); brim.rotation.x = Math.PI / 2; g.add(brim);
    if (l.helmet === 'kuwagata') for (const s of [-1, 1]) {
      // the golden antlers of a general
      const horn = new THREE.Mesh(new THREE.BoxGeometry(r * 0.12, r * 1.6, r * 0.05), trim);
      horn.position.set(s * r * 0.42, r * 0.75, r * 0.95); horn.rotation.z = -s * 0.42; g.add(horn);
    } else if (l.helmet === 'sun') {
      const sun = new THREE.Mesh(new THREE.CircleGeometry(r * 0.55, 24), trim); sun.position.set(0, r * 0.95, r * 0.9); g.add(sun);
      for (let i = 0; i < 12; i++) { const ray = new THREE.Mesh(new THREE.BoxGeometry(r * 0.06, r * 0.32, r * 0.03), trim); const a2 = (i / 12) * Math.PI * 2; ray.position.set(Math.sin(a2) * r * 0.78, r * 0.95 + Math.cos(a2) * r * 0.78, r * 0.89); ray.rotation.z = -a2; g.add(ray); }
    } else { const m = new THREE.Mesh(new THREE.BoxGeometry(r * 0.3, r * 0.3, r * 0.04), trim); m.position.set(0, r * 0.45, r * 0.98); m.rotation.z = Math.PI / 4; g.add(m); }
    g.position.set(H.x, H.y + hh * 0.42, H.z);
    hang(a.id, 'Head', finish(g));
  }
}

// ---- auras: they ride with the samurai, not with a bone
const fxMat = (c: number, o: number) => tagMat(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
function buildAura(kind: 'foxfire' | 'gold') {
  const g = new THREE.Group(); g.name = kind;
  if (kind === 'foxfire') {
    // three wisps of blue fox-fire circling you
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fxMat(0xd0f4ff, 0.9)));
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fxMat(0x30a8ff, 0.35)); outer.scale.y = 1.5; w.add(outer);
      g.add(w);
    }
  } else {
    // Hachiman's blessing: a golden halo behind the head, a ring of light at the feet
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 40), fxMat(0xffd040, 0.85)); halo.name = 'halo'; g.add(halo);
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.4, 40), fxMat(0xffb020, 0.25)); disc.name = 'disc'; g.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 48), fxMat(0xffc830, 0.5)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.name = 'ring'; g.add(ring);
  }
  g.visible = false; root.add(g);
  return g;
}

if (rigged) for (const a of ARMORS) if (a.look) build(a);
for (const a of ARMORS) if (a.look?.aura) auras.set(a.id, buildAura(a.look.aura));

/** show the armour you wear (and its helmet instead of the kasa), with your chosen colours */
export function dressUp() {
  applyLook(root);
  const cur = armor();
  for (const [id, list] of sets) for (const o of list) o.visible = id === cur.id;
  for (const [id, g] of auras) g.visible = id === cur.id;
  const helmet = rigged && !!cur.look?.helmet;
  root.traverse(o => { if (o.userData.part === 'hat') o.visible = !helmet && !opt('hat').hidden; });
}
dressUp();

/** every frame: the auras move */
export function updateOutfit() {
  const g = auras.get(state.armor);
  if (!g) return;
  const t = state.time;
  if (g.name === 'foxfire') g.children.forEach((w, i) => {
    const a = t * 1.6 + i * (Math.PI * 2 / 3);
    w.position.set(Math.sin(a) * 0.85, 1.05 + Math.sin(t * 2.3 + i) * 0.25, Math.cos(a) * 0.85);
    w.scale.setScalar(0.85 + Math.sin(t * 9 + i * 2) * 0.15);
  });
  else {
    const halo = g.getObjectByName('halo')!, disc = g.getObjectByName('disc')!, ring = g.getObjectByName('ring')! as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    for (const o of [halo, disc]) o.position.set(0, 1.78, -0.22);
    halo.rotation.z = t * 0.6;
    ring.rotation.z = t * 0.8; ring.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
    ring.material.opacity = 0.35 + Math.sin(t * 2) * 0.15;
  }
}
