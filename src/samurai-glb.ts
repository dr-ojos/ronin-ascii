// Real 3D CC0 rigged Samurai armor integration (public/models/samurai-armor.glb):
// - Retargets Soldier.glb's live mocap skeleton (Idle, Walk, Run, Jump, Dash, Attacks) onto the
//   Samurai's 54-joint skinned skeleton in real time using root-space delta quaternions with
//   automatic A-pose-to-T-pose arm alignment.
// - Preserves the real baked 1K Tangent-Space Normal Map and Metallic-Roughness Map while
//   regrading the baked Base Color texture per armor (lame, metal, lace, neon) so every armor
//   in the game has its own distinct palette on the sculpted 41k-triangle mesh.
import * as THREE from 'three';
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Armor } from './armor';
import { ACTOR_LAYER } from './ascii';
import { CLS, tagTree } from './materials';
import { mangaFinish } from './manga-art';

const V = THREE.Vector3;
const Q = THREE.Quaternion;

/** Exact top-down bone mapping from Soldier.glb (src) -> samurai-armor.glb (dst) */
const BONE_MAP: readonly [string, string][] = [
  ['Hips', 'Hips'],
  ['Spine', 'Spine02'],
  ['Spine1', 'Spine01'],
  ['Spine2', 'Spine'],
  ['Neck', 'neck'],
  ['Head', 'Head'],
  ['LeftShoulder', 'LeftShoulder'],
  ['LeftArm', 'LeftArm'],
  ['LeftForeArm', 'LeftForeArm'],
  ['LeftHand', 'LeftHand'],
  ['RightShoulder', 'RightShoulder'],
  ['RightArm', 'RightArm'],
  ['RightForeArm', 'RightForeArm'],
  ['RightHand', 'RightHand'],
  ['LeftUpLeg', 'LeftUpLeg'],
  ['LeftLeg', 'LeftLeg'],
  ['LeftFoot', 'LeftFoot'],
  ['LeftToeBase', 'LeftToeBase'],
  ['RightUpLeg', 'RightUpLeg'],
  ['RightLeg', 'RightLeg'],
  ['RightFoot', 'RightFoot'],
  ['RightToeBase', 'RightToeBase'],
];

interface MappedBone {
  src: THREE.Object3D;
  dst: THREE.Object3D;
  /** Q_offset = inv(Q_src_rest) * Q_dst_rest (in character root space) */
  offset: THREE.Quaternion;
}

export interface SamuraiGlbRig {
  root: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  setArmor: (a: Armor) => void;
  setVisible: (v: boolean) => void;
  sync: () => void;
}

/** Recolor the baked red-and-gold Samurai basecolor texture to any armor's (lame, metal, lace) palette */
function recolorBaseTexture(baseTex: THREE.Texture, a: Armor): THREE.CanvasTexture {
  const img = baseTex.image as HTMLImageElement | HTMLCanvasElement | ImageBitmap;
  const w = img.width || 1024, h = img.height || 1024;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.drawImage(img, 0, 0, w, h);

  const l = a.look!;
  const isNeon = l.neon !== undefined;
  const lameCol = new THREE.Color(l.lame);
  const metalCol = new THREE.Color(isNeon ? l.neon! : l.metal);
  const laceCol = new THREE.Color(l.lace);

  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const sat = max > 0.001 ? (max - min) / max : 0;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;

    // 1. Red lacquered armor plates (dominant R, low G & B) -> regrade to armor's lame color
    if (r > g * 1.28 && r > b * 1.28 && sat > 0.22) {
      const wPlate = Math.min(1, (r - Math.max(g, b)) * 3.2);
      // Preserve baked AO/shading intensity from original red channel
      const shade = Math.min(1.45, (r * 0.85 + lum * 0.35) * 1.55);
      const nr = lameCol.r * shade;
      const ng = lameCol.g * shade;
      const nb = lameCol.b * shade;
      d[i]     = Math.min(255, (r * (1 - wPlate) + nr * wPlate) * 255);
      d[i + 1] = Math.min(255, (g * (1 - wPlate) + ng * wPlate) * 255);
      d[i + 2] = Math.min(255, (b * (1 - wPlate) + nb * wPlate) * 255);
    }
    // 2. Warm gold/brass trim & kabuto crest (high R & G, lower B) -> regrade to armor's metal color
    else if (r > 0.32 && g > 0.24 && r > b * 1.35 && g > b * 1.22 && sat > 0.20) {
      const wGold = Math.min(1, ((r + g) * 0.5 - b) * 3.0);
      const shade = Math.min(1.5, lum * 1.55);
      const nr = metalCol.r * shade;
      const ng = metalCol.g * shade;
      const nb = metalCol.b * shade;
      d[i]     = Math.min(255, (r * (1 - wGold) + nr * wGold) * 255);
      d[i + 1] = Math.min(255, (g * (1 - wGold) + ng * wGold) * 255);
      d[i + 2] = Math.min(255, (b * (1 - wGold) + nb * wGold) * 255);
    }
    // 3. Dark cloth/sash/underclothes -> subtly harmonize with lace/obsidian tone
    else if (lum < 0.26) {
      const tint = isNeon ? 0.08 : 0.14;
      d[i]     = Math.min(255, (r * (1 - tint) + laceCol.r * lum * 1.1 * tint) * 255);
      d[i + 1] = Math.min(255, (g * (1 - tint) + laceCol.g * lum * 1.1 * tint) * 255);
      d[i + 2] = Math.min(255, (b * (1 - tint) + laceCol.b * lum * 1.1 * tint) * 255);
    }
  }
  ctx.putImageData(imgData, 0, 0);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.flipY = false;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Mount the CC0 rigged Samurai GLB onto `samRoot` and bind it to `srcBones` (from Soldier.glb).
 */
export function mountSamuraiGlb(
  gltf: GLTF,
  samRoot: THREE.Object3D,
  srcBones: Record<string, THREE.Object3D>
): SamuraiGlbRig | null {
  const model = gltf.scene;
  let skinned: THREE.SkinnedMesh | null = null;
  const dstBones: Record<string, THREE.Object3D> = {};

  model.traverse(o => {
    if ((o as THREE.SkinnedMesh).isSkinnedMesh && !skinned) skinned = o as THREE.SkinnedMesh;
    if ((o as THREE.Bone).isBone || o.name) dstBones[o.name] = o;
  });
  if (!skinned) return null;
  const mesh: THREE.SkinnedMesh = skinned;

  // Match height cleanly to Soldier.glb (~1.75 m) and attach inside samRoot
  samRoot.add(model);
  samRoot.updateMatrixWorld(true);

  const rootWorldQ = new Q();
  samRoot.getWorldQuaternion(rootWorldQ);
  const rootWorldQInv = rootWorldQ.clone().invert();
  const rootWorldInv = samRoot.matrixWorld.clone().invert();

  const getRootQ = (obj: THREE.Object3D, out: THREE.Quaternion) => {
    obj.getWorldQuaternion(out);
    return out.premultiply(rootWorldQInv);
  };
  const getRootPos = (obj: THREE.Object3D, out: THREE.Vector3) => {
    obj.getWorldPosition(out);
    return out.applyMatrix4(rootWorldInv);
  };

  // Pre-align Samurai's A-pose upper arms to match Soldier.glb's T-pose arm direction so
  // Idle/Run/Attack arm angles match the katana hand position accurately.
  for (const side of ['Left', 'Right'] as const) {
    const sArm = srcBones[side + 'Arm'], sFore = srcBones[side + 'ForeArm'];
    const dArm = dstBones[side + 'Arm'], dFore = dstBones[side + 'ForeArm'];
    if (!sArm || !sFore || !dArm || !dFore) continue;
    const sDir = getRootPos(sFore, new V()).sub(getRootPos(sArm, new V())).normalize();
    const dDir = getRootPos(dFore, new V()).sub(getRootPos(dArm, new V())).normalize();
    const align = new Q().setFromUnitVectors(dDir, sDir);
    // Apply alignment in dArm's parent space
    const parentQ = getRootQ(dArm.parent!, new Q());
    const curQ = getRootQ(dArm, new Q());
    const targetQ = align.multiply(curQ);
    dArm.quaternion.copy(parentQ.invert().multiply(targetQ));
    model.updateMatrixWorld(true);
  }

  // Snapshot rest-pose bone offsets after A-pose -> T-pose alignment
  const mapped: MappedBone[] = [];
  for (const [srcName, dstName] of BONE_MAP) {
    const src = srcBones[srcName], dst = dstBones[dstName];
    if (!src || !dst) continue;
    const qSrc = getRootQ(src, new Q());
    const qDst = getRootQ(dst, new Q());
    const offset = qSrc.clone().invert().multiply(qDst);
    mapped.push({ src, dst, offset });
  }

  // Snapshot rest Hips positions for smooth vertical jump/run bounce transfer
  const srcHips = srcBones.Hips;
  const dstHips = dstBones.Hips;
  const srcHipsRest = srcHips ? getRootPos(srcHips, new V()) : new V(0, 1, 0);
  const dstHipsRestLocal = dstHips ? dstHips.position.clone() : new V();
  const dstHipsParentInv = dstHips?.parent ? dstHips.parent.matrixWorld.clone().invert().multiply(samRoot.matrixWorld) : new THREE.Matrix4();
  const dstHipsScale = dstHips?.parent ? 1 / (dstHips.parent.getWorldScale(new V()).y || 0.01) : 100;
  void dstHipsParentInv;

  // Prepare base material reference & per-armor cached MeshPhysicalMaterials
  const origMat = mesh.material as THREE.MeshStandardMaterial;
  const origMap = origMat.map!;
  const origNormal = origMat.normalMap;
  const origMR = origMat.roughnessMap; // glTF packs metalness (B) & roughness (G) in same texture

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.layers.enable(ACTOR_LAYER);
  tagTree(model, CLS.actor);

  const matCache = new Map<string, THREE.MeshPhysicalMaterial>();
  let currentArmorId = '';

  const getMatForArmor = (a: Armor): THREE.MeshPhysicalMaterial => {
    const cached = matCache.get(a.id);
    if (cached) return cached;
    const l = a.look!;
    const isNeon = l.neon !== undefined;
    const recolored = recolorBaseTexture(origMap, a);
    const mat = new THREE.MeshPhysicalMaterial({
      map: recolored,
      normalMap: origNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: origMR,
      metalnessMap: origMR,
      roughness: isNeon ? 0.35 : 0.78,
      metalness: isNeon ? 0.65 : 0.85,
      clearcoat: isNeon ? 0.72 : 0.62,
      clearcoatRoughness: 0.18,
      emissive: isNeon ? l.neon! : l.lame,
      emissiveMap: recolored,
      emissiveIntensity: isNeon ? 0.38 : Math.min(0.08, (l.glow ?? 0.06) * 0.4),
      side: THREE.DoubleSide,
    });
    mesh.material = mat;
    mangaFinish(model);
    tagTree(model, CLS.actor);
    matCache.set(a.id, mat);
    return mat;
  };

  model.visible = false;

  // Reusable temporaries for zero-allocation per-frame retargeting
  const tmpRootQInv = new Q();
  const tmpSrcQ = new Q();
  const tmpParentQ = new Q();
  const tmpTargetQ = new Q();
  const tmpCurHips = new V();
  const tmpRootInv = new THREE.Matrix4();

  return {
    root: model,
    mesh,
    setArmor(a: Armor) {
      if (!a.look || currentArmorId === a.id) return;
      currentArmorId = a.id;
      mesh.material = getMatForArmor(a);
    },
    setVisible(v: boolean) {
      model.visible = v;
    },
    sync() {
      if (!model.visible) return;
      samRoot.updateMatrixWorld(true);
      samRoot.getWorldQuaternion(tmpRootQInv).invert();

      // Transfer vertical/lateral Hips motion (walk bob, jump crouch, dash lean)
      if (srcHips && dstHips) {
        tmpRootInv.copy(samRoot.matrixWorld).invert();
        srcHips.getWorldPosition(tmpCurHips).applyMatrix4(tmpRootInv);
        const dy = (tmpCurHips.y - srcHipsRest.y) * dstHipsScale;
        const dx = (tmpCurHips.x - srcHipsRest.x) * dstHipsScale;
        const dz = (tmpCurHips.z - srcHipsRest.z) * dstHipsScale;
        dstHips.position.set(dstHipsRestLocal.x + dx, dstHipsRestLocal.y + dy, dstHipsRestLocal.z + dz);
      }

      // Top-down bone orientation retargeting
      for (let i = 0; i < mapped.length; i++) {
        const m = mapped[i];
        m.src.getWorldQuaternion(tmpSrcQ).premultiply(tmpRootQInv);
        tmpTargetQ.copy(tmpSrcQ).multiply(m.offset);
        m.dst.parent!.getWorldQuaternion(tmpParentQ).premultiply(tmpRootQInv).invert();
        m.dst.quaternion.copy(tmpParentQ).multiply(tmpTargetQ);
        m.dst.updateMatrixWorld(true);
      }
    },
  };
}
