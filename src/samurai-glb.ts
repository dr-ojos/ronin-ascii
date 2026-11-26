// Multi-model real 3D CC0 rigged armor integration (4 distinct Grab3D CC0 1.0 rigged GLBs):
//   - 'samurai' (samurai-armor.glb): Grand lacquered O-Yoroi samurai with crescent kabuto
//   - 'ninja'   (ninja-armor.glb):   Sleek agile shinobi / wind & shadow warrior
//   - 'leather' (leather-armor.glb): Scout / foot-soldier leather & brigandine armor
//   - 'heavy'   (heavy-armor.glb):   Colossal full-plate juggernaut armor
//
// Features:
// - Real-time root-space delta quaternion retargeting from Soldier.glb onto each 54-joint skeleton
//   with automatic A-pose -> T-pose arm alignment.
// - Exact palm-center weapon snapping (katana & offhand) + natural sword-grip finger curl.
// - Grounded sandal/boot alignment matching Soldier.glb's lowest foot.
// - Per-armor PBR basecolor regrading preserving the real baked 1K Normal & Metallic-Roughness maps.
// - Lazy on-demand loading for secondary GLBs so initial startup stays fast.
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';
import type { Armor } from './armor';
import { ACTOR_LAYER } from './ascii';
import { CLS, tagTree } from './materials';
import { mangaFinish } from './manga-art';

const V = THREE.Vector3;
const Q = THREE.Quaternion;

export type GlbArmorKind = 'samurai' | 'ninja' | 'leather' | 'heavy';

const GLB_META: Record<GlbArmorKind, { url: string; scale: number }> = {
  samurai: { url: './models/samurai-armor.glb', scale: 1.00 },
  ninja:   { url: './models/ninja-armor.glb',   scale: 1.00 },
  leather: { url: './models/leather-armor.glb', scale: 0.946 }, // 1.85 m -> 1.75 m
  heavy:   { url: './models/heavy-armor.glb',   scale: 0.867 }, // 2.10 m -> 1.82 m (imposing heavy plate)
};

/** Pick the distinct 3D silhouette archetype for each plated armor in ARMORS */
export function armorGlbKind(a: Armor): GlbArmorKind {
  switch (a.id) {
    case 'hayate':
    case 'kitsune':
    case 'garza':
    case 'manto-tengu':
    case 'neon':
      return 'ninja';
    case 'ashigaru':
    case 'guardian':
      return 'leather';
    case 'kurogane':
    case 'coraza-sepulcral':
    case 'coraza-escarcha':
      return 'heavy';
    default:
      return 'samurai';
  }
}

/** Exact top-down bone mapping from Soldier.glb (src) -> Grab3D 54-joint skeleton (dst) */
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
  offset: THREE.Quaternion;
}

export interface SamuraiGlbRig {
  root: THREE.Object3D;
  mesh: THREE.SkinnedMesh;
  setArmor: (a: Armor) => void;
  setVisible: (v: boolean) => void;
  sync: (katana?: THREE.Object3D, offhand?: THREE.Object3D) => void;
}

/** Recolor any Grab3D baked 1K basecolor texture to an armor's (lame, metal, lace, neon) palette */
function recolorBaseTexture(baseTex: THREE.Texture, a: Armor, kind: GlbArmorKind): THREE.CanvasTexture {
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

    if (kind === 'samurai') {
      // Red lacquered plates -> lame, gold trim -> metal, dark cloth -> subtle lace harmony
      if (r > g * 1.28 && r > b * 1.28 && sat > 0.22) {
        const wPlate = Math.min(1, (r - Math.max(g, b)) * 3.2);
        const shade = Math.min(1.45, (r * 0.85 + lum * 0.35) * 1.55);
        d[i]     = Math.min(255, (r * (1 - wPlate) + lameCol.r * shade * wPlate) * 255);
        d[i + 1] = Math.min(255, (g * (1 - wPlate) + lameCol.g * shade * wPlate) * 255);
        d[i + 2] = Math.min(255, (b * (1 - wPlate) + lameCol.b * shade * wPlate) * 255);
      } else if (r > 0.32 && g > 0.24 && r > b * 1.35 && g > b * 1.22 && sat > 0.20) {
        const wGold = Math.min(1, ((r + g) * 0.5 - b) * 3.0);
        const shade = Math.min(1.5, lum * 1.55);
        d[i]     = Math.min(255, (r * (1 - wGold) + metalCol.r * shade * wGold) * 255);
        d[i + 1] = Math.min(255, (g * (1 - wGold) + metalCol.g * shade * wGold) * 255);
        d[i + 2] = Math.min(255, (b * (1 - wGold) + metalCol.b * shade * wGold) * 255);
      } else if (lum < 0.26) {
        const tint = 0.14;
        d[i]     = Math.min(255, (r * (1 - tint) + laceCol.r * lum * 1.1 * tint) * 255);
        d[i + 1] = Math.min(255, (g * (1 - tint) + laceCol.g * lum * 1.1 * tint) * 255);
        d[i + 2] = Math.min(255, (b * (1 - tint) + laceCol.b * lum * 1.1 * tint) * 255);
      }
    } else if (kind === 'ninja') {
      // Preserve natural skin tones (eyes/face) while recoloring dark shinobi garb, wraps, and metallic plates
      const isSkin = r > 0.36 && g > 0.22 && b > 0.14 && r > g * 1.12 && g > b * 1.08 && sat > 0.18 && sat < 0.55;
      if (isSkin) continue;
      if (lum > 0.42 && sat < 0.22) {
        // Bright metallic fittings / blades / wraps -> metal or neon accent
        const shade = Math.min(1.45, lum * 1.25);
        const wM = 0.72;
        d[i]     = Math.min(255, (r * (1 - wM) + metalCol.r * shade * wM) * 255);
        d[i + 1] = Math.min(255, (g * (1 - wM) + metalCol.g * shade * wM) * 255);
        d[i + 2] = Math.min(255, (b * (1 - wM) + metalCol.b * shade * wM) * 255);
      } else if (sat > 0.16 && r > b) {
        // Accent sashes / cords -> lace color
        const shade = Math.min(1.4, lum * 1.65 + 0.12);
        d[i]     = Math.min(255, laceCol.r * shade * 255);
        d[i + 1] = Math.min(255, laceCol.g * shade * 255);
        d[i + 2] = Math.min(255, laceCol.b * shade * 255);
      } else {
        // Main shinobi armor / cloth -> lame color preserving baked AO
        const shade = Math.min(1.55, lum * 2.1 + 0.08);
        const wL = isNeon ? 0.85 : 0.78;
        d[i]     = Math.min(255, (r * (1 - wL) + lameCol.r * shade * wL) * 255);
        d[i + 1] = Math.min(255, (g * (1 - wL) + lameCol.g * shade * wL) * 255);
        d[i + 2] = Math.min(255, (b * (1 - wL) + lameCol.b * shade * wL) * 255);
      }
    } else if (kind === 'leather') {
      // Preserve natural skin tones, regrade warm leather plates -> lame, metal studs -> metal
      const isSkin = r > 0.42 && g > 0.26 && b > 0.18 && r > g * 1.1 && g > b * 1.06 && sat > 0.16 && sat < 0.48 && lum > 0.34;
      if (isSkin) continue;
      if (lum > 0.45 && sat < 0.18) {
        const shade = Math.min(1.4, lum * 1.25);
        d[i]     = Math.min(255, (r * 0.3 + metalCol.r * shade * 0.7) * 255);
        d[i + 1] = Math.min(255, (g * 0.3 + metalCol.g * shade * 0.7) * 255);
        d[i + 2] = Math.min(255, (b * 0.3 + metalCol.b * shade * 0.7) * 255);
      } else {
        const shade = Math.min(1.45, lum * 1.75 + 0.06);
        const wL = 0.72;
        d[i]     = Math.min(255, (r * (1 - wL) + lameCol.r * shade * wL) * 255);
        d[i + 1] = Math.min(255, (g * (1 - wL) + lameCol.g * shade * wL) * 255);
        d[i + 2] = Math.min(255, (b * (1 - wL) + lameCol.b * shade * wL) * 255);
      }
    } else {
      // 'heavy' full-plate steel -> regrade steel plates to lame, bright edges to metal, dark joints to lace
      if (lum > 0.46) {
        const shade = Math.min(1.45, lum * 1.3);
        const target = lum > 0.65 ? metalCol : lameCol;
        const wH = 0.76;
        d[i]     = Math.min(255, (r * (1 - wH) + target.r * shade * wH) * 255);
        d[i + 1] = Math.min(255, (g * (1 - wH) + target.g * shade * wH) * 255);
        d[i + 2] = Math.min(255, (b * (1 - wH) + target.b * shade * wH) * 255);
      } else if (lum < 0.22) {
        const shade = lum * 1.45 + 0.04;
        d[i]     = Math.min(255, (r * 0.65 + laceCol.r * shade * 0.35) * 255);
        d[i + 1] = Math.min(255, (g * 0.65 + laceCol.g * shade * 0.35) * 255);
        d[i + 2] = Math.min(255, (b * 0.65 + laceCol.b * shade * 0.35) * 255);
      } else {
        const shade = Math.min(1.5, lum * 1.75);
        const wH = 0.78;
        d[i]     = Math.min(255, (r * (1 - wH) + lameCol.r * shade * wH) * 255);
        d[i + 1] = Math.min(255, (g * (1 - wH) + lameCol.g * shade * wH) * 255);
        d[i + 2] = Math.min(255, (b * (1 - wH) + lameCol.b * shade * wH) * 255);
      }
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
 * Mount a Grab3D CC0 rigged GLB onto `samRoot` and bind it to `srcBones` (from Soldier.glb).
 */
export function mountSamuraiGlb(
  gltf: GLTF,
  samRoot: THREE.Object3D,
  srcBones: Record<string, THREE.Object3D>,
  kind: GlbArmorKind = 'samurai'
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

  model.scale.setScalar(GLB_META[kind].scale);
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

  // Pre-align Grab3D A-pose upper arms to match Soldier.glb's T-pose arm direction
  for (const side of ['Left', 'Right'] as const) {
    const sArm = srcBones[side + 'Arm'], sFore = srcBones[side + 'ForeArm'];
    const dArm = dstBones[side + 'Arm'], dFore = dstBones[side + 'ForeArm'];
    if (!sArm || !sFore || !dArm || !dFore) continue;
    const sDir = getRootPos(sFore, new V()).sub(getRootPos(sArm, new V())).normalize();
    const dDir = getRootPos(dFore, new V()).sub(getRootPos(dArm, new V())).normalize();
    const align = new Q().setFromUnitVectors(dDir, sDir);
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

  const srcHips = srcBones.Hips;
  const dstHips = dstBones.Hips;
  const srcHipsRest = srcHips ? getRootPos(srcHips, new V()) : new V(0, 1, 0);
  const dstHipsRestLocal = dstHips ? dstHips.position.clone() : new V();
  const dstHipsScale = dstHips?.parent ? 1 / (dstHips.parent.getWorldScale(new V()).y || 0.01) : 100;

  const srcRightHand = srcBones.RightHand, srcRightMid = srcBones.RightHandMiddle1;
  const dstRightHand = dstBones.RightHand, dstRightMid = dstBones.RightHandMiddle1;
  const srcLeftHand = srcBones.LeftHand, srcLeftMid = srcBones.LeftHandMiddle1;
  const dstLeftHand = dstBones.LeftHand, dstLeftMid = dstBones.LeftHandMiddle1;

  const dstLeftToe = dstBones.LeftToeBase ?? dstBones.LeftFoot;
  const dstRightToe = dstBones.RightToeBase ?? dstBones.RightFoot;
  const srcLeftToe = srcBones.LeftToeBase ?? srcBones.LeftFoot;
  const srcRightToe = srcBones.RightToeBase ?? srcBones.RightFoot;
  const dstFootRestY = Math.min(
    dstLeftToe ? getRootPos(dstLeftToe, new V()).y : 0.04,
    dstRightToe ? getRootPos(dstRightToe, new V()).y : 0.04
  );

  const rightFingers: { bone: THREE.Object3D; rest: THREE.Quaternion; curl: THREE.Quaternion }[] = [];
  const leftFingers: { bone: THREE.Object3D; rest: THREE.Quaternion; curl: THREE.Quaternion }[] = [];
  for (const [side, list] of [['Right', rightFingers], ['Left', leftFingers]] as const) {
    const sign = side === 'Right' ? 1 : -1;
    for (const digit of ['Index', 'Middle', 'Ring', 'Pinky']) {
      for (let j = 1; j <= 3; j++) {
        const b = dstBones[`${side}Hand${digit}${j}`];
        if (!b) continue;
        const rest = b.quaternion.clone();
        const angle = j === 1 ? 0.72 : j === 2 ? 0.92 : 0.55;
        const curl = rest.clone().multiply(new Q().setFromAxisAngle(new V(0, 0, sign), angle));
        list.push({ bone: b, rest, curl });
      }
    }
  }

  const origMat = mesh.material as THREE.MeshStandardMaterial;
  const origMap = origMat.map!;
  const origNormal = origMat.normalMap;
  const origMR = origMat.roughnessMap;

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
    const recolored = recolorBaseTexture(origMap, a, kind);
    const mat = new THREE.MeshPhysicalMaterial({
      map: recolored,
      normalMap: origNormal,
      normalScale: new THREE.Vector2(1.1, 1.1),
      roughnessMap: origMR,
      metalnessMap: origMR,
      roughness: isNeon ? 0.35 : kind === 'heavy' ? 0.58 : kind === 'leather' ? 0.85 : 0.78,
      metalness: isNeon ? 0.65 : kind === 'heavy' ? 0.95 : kind === 'leather' ? 0.45 : 0.85,
      clearcoat: isNeon ? 0.72 : kind === 'samurai' ? 0.65 : kind === 'heavy' ? 0.45 : 0.15,
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

  const tmpRootQInv = new Q();
  const tmpSrcQ = new Q();
  const tmpParentQ = new Q();
  const tmpTargetQ = new Q();
  const tmpCurHips = new V();
  const tmpRootInv = new THREE.Matrix4();
  const tmpSrcPalm = new V();
  const tmpDstPalm = new V();
  const tmpMid = new V();
  const tmpDelta = new V();
  const tmpFootL = new V();
  const tmpFootR = new V();
  const tmpSrcFootL = new V();
  const tmpSrcFootR = new V();

  const computePalmWorld = (hand: THREE.Object3D, mid: THREE.Object3D | undefined, out: THREE.Vector3) => {
    hand.getWorldPosition(out);
    if (mid) {
      mid.getWorldPosition(tmpMid);
      out.lerp(tmpMid, 0.55);
    }
    return out;
  };

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
    sync(katana?: THREE.Object3D, offhand?: THREE.Object3D) {
      if (!model.visible) return;
      samRoot.updateMatrixWorld(true);
      samRoot.getWorldQuaternion(tmpRootQInv).invert();
      tmpRootInv.copy(samRoot.matrixWorld).invert();

      if (srcHips && dstHips) {
        srcHips.getWorldPosition(tmpCurHips).applyMatrix4(tmpRootInv);
        const dy = (tmpCurHips.y - srcHipsRest.y) * dstHipsScale;
        const dx = (tmpCurHips.x - srcHipsRest.x) * dstHipsScale;
        const dz = (tmpCurHips.z - srcHipsRest.z) * dstHipsScale;
        dstHips.position.set(dstHipsRestLocal.x + dx, dstHipsRestLocal.y + dy, dstHipsRestLocal.z + dz);
      }

      for (let i = 0; i < mapped.length; i++) {
        const m = mapped[i];
        m.src.getWorldQuaternion(tmpSrcQ).premultiply(tmpRootQInv);
        tmpTargetQ.copy(tmpSrcQ).multiply(m.offset);
        m.dst.parent!.getWorldQuaternion(tmpParentQ).premultiply(tmpRootQInv).invert();
        m.dst.quaternion.copy(tmpParentQ).multiply(tmpTargetQ);
        m.dst.updateMatrixWorld(true);
      }

      if (dstHips && dstLeftToe && dstRightToe && srcLeftToe && srcRightToe) {
        dstLeftToe.getWorldPosition(tmpFootL).applyMatrix4(tmpRootInv);
        dstRightToe.getWorldPosition(tmpFootR).applyMatrix4(tmpRootInv);
        srcLeftToe.getWorldPosition(tmpSrcFootL).applyMatrix4(tmpRootInv);
        srcRightToe.getWorldPosition(tmpSrcFootR).applyMatrix4(tmpRootInv);
        const dstMinY = Math.min(tmpFootL.y, tmpFootR.y);
        const srcMinY = Math.min(tmpSrcFootL.y, tmpSrcFootR.y);
        const targetMinY = Math.max(dstFootRestY, srcMinY);
        const footFix = targetMinY - dstMinY;
        if (Math.abs(footFix) > 0.002) {
          dstHips.position.y += footFix * dstHipsScale;
          dstHips.updateMatrixWorld(true);
        }
      }

      for (const f of rightFingers) f.bone.quaternion.copy(f.curl);
      const holdingOffhand = !!offhand && offhand.visible;
      for (const f of leftFingers) f.bone.quaternion.copy(holdingOffhand ? f.curl : f.rest);
      if (dstRightHand) dstRightHand.updateMatrixWorld(true);
      if (dstLeftHand) dstLeftHand.updateMatrixWorld(true);

      if (katana && katana.parent && srcRightHand && dstRightHand) {
        computePalmWorld(srcRightHand, srcRightMid, tmpSrcPalm);
        computePalmWorld(dstRightHand, dstRightMid, tmpDstPalm);
        const dist = tmpDstPalm.distanceTo(tmpSrcPalm);
        if (dist > 0.0005) {
          tmpDelta.copy(tmpDstPalm).sub(tmpSrcPalm);
          const invParent = tmpRootInv.copy(katana.parent.matrixWorld).invert();
          tmpDelta.transformDirection(invParent).multiplyScalar(dist);
          katana.position.add(tmpDelta);
          katana.updateMatrixWorld(true);
        }
      }
      if (offhand && offhand.visible && offhand.parent && srcLeftHand && dstLeftHand) {
        computePalmWorld(srcLeftHand, srcLeftMid, tmpSrcPalm);
        computePalmWorld(dstLeftHand, dstLeftMid, tmpDstPalm);
        const dist = tmpDstPalm.distanceTo(tmpSrcPalm);
        if (dist > 0.0005) {
          tmpDelta.copy(tmpDstPalm).sub(tmpSrcPalm);
          const invParent = tmpRootInv.copy(offhand.parent.matrixWorld).invert();
          tmpDelta.transformDirection(invParent).multiplyScalar(dist);
          offhand.position.add(tmpDelta);
          offhand.updateMatrixWorld(true);
        }
      }
    },
  };
}

/**
 * Manager for all 4 rigged CC0 armor GLBs (samurai preloaded; ninja/leather/heavy lazy-loaded on demand).
 */
export function createGlbArmorManager(
  samRoot: THREE.Object3D,
  srcBones: Record<string, THREE.Object3D>,
  initialSamurai: GLTF | null,
  onReady: () => void
) {
  const rigs = new Map<GlbArmorKind, SamuraiGlbRig>();
  const loading = new Set<GlbArmorKind>();
  const loader = new GLTFLoader();
  let activeRig: SamuraiGlbRig | null = null;

  if (initialSamurai) {
    const r = mountSamuraiGlb(initialSamurai, samRoot, srcBones, 'samurai');
    if (r) rigs.set('samurai', r);
  }

  function ensureLoaded(kind: GlbArmorKind) {
    if (rigs.has(kind) || loading.has(kind)) return;
    loading.add(kind);
    loader.loadAsync(GLB_META[kind].url).then(gltf => {
      const r = mountSamuraiGlb(gltf, samRoot, srcBones, kind);
      if (r) {
        rigs.set(kind, r);
        onReady();
      }
    }).catch(err => {
      console.warn(`No se pudo cargar ${GLB_META[kind].url}`, err);
    });
  }

  return {
    /** Select the right GLB silhouette for `a`, returning true if a GLB rig is active right now */
    apply(a: Armor, enabled: boolean): boolean {
      for (const r of rigs.values()) r.setVisible(false);
      activeRig = null;
      if (!enabled || !a.look) return false;
      const kind = armorGlbKind(a);
      ensureLoaded(kind);
      // Use the exact archetype rig if loaded; fall back to samurai while the secondary GLB streams in
      const rig = rigs.get(kind) ?? rigs.get('samurai') ?? null;
      if (!rig) return false;
      rig.setArmor(a);
      rig.setVisible(true);
      activeRig = rig;
      return true;
    },
    sync(katana?: THREE.Object3D, offhand?: THREE.Object3D) {
      activeRig?.sync(katana, offhand);
    },
  };
}
