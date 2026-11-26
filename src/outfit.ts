// What the ronin wears, on the body: the armour bought from Masa (armor.ts), built the way real samurai armour
// is — rows of lacquered plates (lames) bound with silk lacing (odoshi), with metal fittings:
//   · dō: the cuirass, shaped like the torso, with its top plate, a crest and the waist cord;
//   · kusazuri: the skirt of laced panels; sode: big shoulder guards hanging from the shoulders;
//   · suneate: splinted shin guards (the heavier sets);
//   · the helmet, which replaces the kasa: a kabuto (riveted bowl, visor, flaring neck guard of lames,
//     turned-back wings and a crest on the front: crescent, golden antlers or Hachiman's sun) or, for the
//     ashigaru, a jingasa. The best sets also carry an aura (the fox's blue fire, Hachiman's golden halo).
// Every set is built once on the skeleton when the game loads and only the one you wear is shown.
import * as THREE from 'three';
import { sam } from './avatar';
import { ACTOR_LAYER } from './ascii';
import { CLS, tagMat, tagTree } from './materials';
import { applyLook, opt } from './look';
import { ARMORS, armor, type Armor } from './armor';
import { state } from './state';
import type { ClassId } from './classes';
import { mangaFinish, roninRobe } from './manga-art';
import {
  buildClassArmor, brocadeKesaTex, cloudSilkTex, plumSilkTex, tronPlateMaps,
  roninLamellarPBR, roninHachiPBR, roninMonTex,
  forgedMetalPBR, urushiLacquerPBR, braidedSilkPBR,
  buildContouredTorso, ellipseArcTube, buildForearmVambrace, buildContouredGreave, buildTassetPanel,
  type NewClassId
} from './class-armor';
import { makeFresnelShellMat, softGlowTex, anamorphicFlareTex } from './vfx-art';

const V = THREE.Vector3;
const TAU = Math.PI * 2;
const root = sam.root;
const bones: Record<string, THREE.Object3D> = {};
root.traverse(o => {
  if (o.userData.outfitBone) bones[o.userData.outfitBone] = o;
  else if (/^mixamorig/.test(o.name)) bones[o.name.replace(/^mixamorig:?/, '')] = o;
});
root.updateMatrixWorld(true);
// Snapshot the bind/rest pose once so class armors built lazily on demand attach identically
// regardless of the character's current animation frame.
const restRootWorld = root.matrixWorld.clone();
const restPos: Record<string, THREE.Vector3> = {};
const restWorldInv: Record<string, THREE.Matrix4> = {};
for (const [name, b] of Object.entries(bones)) {
  restPos[name] = root.worldToLocal(b.getWorldPosition(new V()));
  restWorldInv[name] = b.matrixWorld.clone().invert();
}
/** a bone's rest-pose position in the samurai's own space (+z ahead, +y up, its left on +x) */
const P = (n: string) => restPos[n].clone();

const sets = new Map<string, THREE.Object3D[]>();
const auras = new Map<string, THREE.Group>();
interface HingedPanel { pivot: THREE.Group; dirX: number; dirZ: number; restPitch: number }
const skirtPanels = new Map<string, HingedPanel[]>();

const baseLayers: THREE.Object3D[] = [];
root.traverse(o => { if (o.userData.equipmentLayer) baseLayers.push(o); });
const rigChest = baseLayers.find(o => o.userData.equipmentLayer === 'chest');
const rigWaist = baseLayers.find(o => o.userData.equipmentLayer === 'waist');
// the straw kasa (rig.ts), already fitted on the scanned head: the jingasa is built in its frame
let kasaMesh: THREE.Mesh | undefined;
root.traverse(o => { const m = o as THREE.Mesh; if (!kasaMesh && m.isMesh && m.userData.part === 'hat' && (m.geometry as THREE.ConeGeometry).type === 'ConeGeometry' && (m.geometry as THREE.ConeGeometry).parameters.radius > 0.2) kasaMesh = m; });
// the simulated robe (rig.ts): its colour follows the armour worn
const robeMesh = root.getObjectByName('robe') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
const robeMat = robeMesh?.material, robeMap = robeMat?.map ?? null;
// avatar.ts makes the waves glow faintly too (emissiveMap): plain robes drop both
const robeGlowMap = robeMat?.emissiveMap ?? null;
/** put `obj` beside `twin` (same bone, same place, turn and size), so it follows it exactly */
function overlay(id: string, twin: THREE.Object3D, obj: THREE.Object3D) {
  finish(obj);
  obj.position.copy(twin.position); obj.quaternion.copy(twin.quaternion); obj.scale.copy(twin.scale);
  twin.parent!.add(obj);
  sets.get(id)!.push(obj);
}
/** build `obj` in the samurai's rest space, then hang it on a bone so it follows the animation */
function hang(id: string, boneName: string, obj: THREE.Object3D) {
  finish(obj);
  obj.updateMatrix();
  const localMat = restWorldInv[boneName].clone().multiply(restRootWorld).multiply(obj.matrix);
  localMat.decompose(obj.position, obj.quaternion, obj.scale);
  bones[boneName].add(obj);
  sets.get(id)!.push(obj);
}
function finish(o: THREE.Object3D) {
  o.traverse(m => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.layers.enable(ACTOR_LAYER); } });
  mangaFinish(o);   // the same finish as the body: rim and form light, and the letters on the surface
  return tagTree(o, CLS.actor);
}

// ------------------------------------------------------------ textures
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------ geometry helpers
/** a strip of tube along an arc of a circle in the xz plane (θ = 0 at +z, like the cylinder sections) */
function arcTube(r: number, y: number, th0: number, len: number, tube: number, m: THREE.Material) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) { const t = th0 + len * i / 24; pts.push(new V(Math.sin(t) * r, y, Math.cos(t) * r)); }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, tube, 5, false), m);
}
const extrude = (s: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.25, bevelSegments: 1, curveSegments: 16 }).translate(0, 0, -depth / 2);

// ------------------------------------------------------------ one armour
function build(a: Armor) {
  const l = a.look!, glow = l.glow ?? 0.06, isNeon = l.neon !== undefined;
  sets.set(a.id, []);
  const tronPbr = isNeon ? tronPlateMaps(l.neon) : null;
  const fullPbr = isNeon ? null : roninLamellarPBR(l, a.id);
  const lacPbr = urushiLacquerPBR();
  const metPbr = forgedMetalPBR();
  const silkPbr = braidedSilkPBR();

  const lam = (rx: number, ry: number) => {
    if (isNeon && tronPbr) {
      const t = tronPbr.map.clone(); t.repeat.set(rx, ry); t.needsUpdate = true;
      const em = tronPbr.emissive!.clone(); em.repeat.set(rx, ry); em.needsUpdate = true;
      const bump = tronPbr.bump.clone(); bump.repeat.set(rx, ry); bump.needsUpdate = true;
      const rough = tronPbr.rough.clone(); rough.repeat.set(rx, ry); rough.needsUpdate = true;
      return new THREE.MeshPhysicalMaterial({
        map: t, bumpMap: bump, bumpScale: 0.016, roughnessMap: rough,
        emissiveMap: em, emissive: l.neon!, emissiveIntensity: 2.3,
        roughness: 0.24, metalness: 0.62, clearcoat: 0.72, clearcoatRoughness: 0.14, side: THREE.DoubleSide
      });
    }
    const p = fullPbr!;
    const t = p.map.clone(); t.repeat.set(rx, ry); t.needsUpdate = true;
    const norm = p.normal.clone(); norm.repeat.set(rx, ry); norm.needsUpdate = true;
    const rough = p.rough.clone(); rough.repeat.set(rx, ry); rough.needsUpdate = true;
    const met = p.metal.clone(); met.repeat.set(rx, ry); met.needsUpdate = true;
    const em = p.emissive ? p.emissive.clone() : null;
    if (em) { em.repeat.set(rx, ry); em.needsUpdate = true; }
    return new THREE.MeshPhysicalMaterial({
      map: t, normalMap: norm, normalScale: new THREE.Vector2(1.15, 1.15),
      roughnessMap: rough, metalnessMap: met,
      roughness: 0.86, metalness: 0.90, clearcoat: 0.88, clearcoatRoughness: 0.14,
      emissiveMap: em, emissive: em ? 0xffffff : 0x000000, emissiveIntensity: em ? 0.85 : 0,
      side: THREE.DoubleSide
    });
  };
  const lacquer = new THREE.MeshPhysicalMaterial({
    color: l.lame, normalMap: lacPbr.normal, normalScale: new THREE.Vector2(0.75, 0.75),
    roughnessMap: lacPbr.rough, roughness: isNeon ? 0.22 : 0.30, metalness: isNeon ? 0.56 : 0.28,
    clearcoat: isNeon ? 0.75 : 0.90, clearcoatRoughness: 0.12,
    emissive: l.lame, emissiveIntensity: isNeon ? 0.04 : Math.min(0.08, glow * 0.35), side: THREE.DoubleSide
  });
  const metal = new THREE.MeshPhysicalMaterial({
    color: isNeon ? l.neon! : l.metal,
    normalMap: isNeon ? null : metPbr.normal, normalScale: new THREE.Vector2(0.85, 0.85),
    roughnessMap: isNeon ? null : metPbr.rough,
    roughness: isNeon ? 0.12 : 0.26, metalness: isNeon ? 0.18 : 0.94,
    clearcoat: isNeon ? 0.2 : 0.38, clearcoatRoughness: 0.18,
    emissive: isNeon ? l.neon! : l.metal, emissiveIntensity: isNeon ? 2.4 : Math.max(0.14, glow * 0.9), side: THREE.DoubleSide
  });
  if (isNeon) metal.userData.noGlyphs = true;
  const lace = new THREE.MeshPhysicalMaterial({
    color: isNeon ? 0xdceeff : l.lace,
    normalMap: isNeon ? null : silkPbr.normal, normalScale: new THREE.Vector2(0.95, 0.95),
    roughness: isNeon ? 0.2 : 0.86, metalness: 0.0, clearcoat: 0.0,
    emissive: isNeon ? l.neon! : l.lace, emissiveIntensity: isNeon ? 1.55 : 0.09, side: THREE.DoubleSide
  });
  if (isNeon) lace.userData.noGlyphs = true;

  const hips = P('Hips');

  // Armor replaces the travel outfit at the same attachment points, with an anatomically sculpted dō cuirass.
  if (rigChest) {
    const g = new THREE.Group();
    g.name = `cuirass-${a.id}`;
    const torsoSpec = { chestW: 1.02, waistW: 0.96, depth: 0.97, pecSwell: 0.013, hemDip: 0.018, neckDip: 0.018 };
    g.add(new THREE.Mesh(buildContouredTorso(torsoSpec), lam(5.0, 1.3)));
    // muna-ita upper collar rim, pectoral accent, lower gilded rim, and waist cord
    g.add(ellipseArcTube(0.118 * torsoSpec.chestW, 0.096 * torsoSpec.depth, 0.252, 0, TAU, 0.0065, metal, 36));
    g.add(ellipseArcTube(0.220 * torsoSpec.chestW, 0.158 * torsoSpec.depth, 0.145, -1.05, 2.1, 0.0045, metal, 28));
    g.add(ellipseArcTube(0.181 * torsoSpec.waistW, 0.132 * torsoSpec.depth, -0.262, 0, TAU, 0.0055, metal, 36));
    g.add(ellipseArcTube(0.182 * torsoSpec.waistW, 0.134 * torsoSpec.depth, -0.244, 0, TAU, 0.0085, lace, 36));
    // embossed clan crest (mon) medallion on the chest
    const monR = a.tier >= 2.2 ? 0.048 : 0.040;
    const monMat = new THREE.MeshPhysicalMaterial({
      map: roninMonTex(l, a.id), roughness: 0.24, metalness: 0.84, clearcoat: 0.65, clearcoatRoughness: 0.14,
      emissive: l.metal, emissiveIntensity: Math.max(0.10, glow * 0.7)
    });
    const mon = new THREE.Group(); mon.position.set(0, 0.068, 0.172 * torsoSpec.depth); mon.rotation.x = -0.07; g.add(mon);
    const monDisc = new THREE.Mesh(new THREE.CylinderGeometry(monR, monR * 1.04, 0.010, 28), monMat);
    monDisc.rotation.x = Math.PI / 2; mon.add(monDisc);
    const monBezel = new THREE.Mesh(new THREE.TorusGeometry(monR, 0.0055, 7, 28), metal);
    monBezel.position.z = 0.004; mon.add(monBezel);
    // watagami: contoured shoulder straps over the trapezius with gilded studs
    for (const s of [-1, 1]) {
      const strapCurve = new THREE.CatmullRomCurve3([
        new V(0.104 * s, 0.165, 0.138 * torsoSpec.depth),
        new V(0.116 * s, 0.236, 0.055),
        new V(0.116 * s, 0.244, -0.045),
        new V(0.104 * s, 0.172, -0.132 * torsoSpec.depth),
      ]);
      g.add(new THREE.Mesh(new THREE.TubeGeometry(strapCurve, 18, 0.013, 6), lacquer));
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.011, 10, 8), metal);
      stud.position.set(0.104 * s, 0.178, 0.144 * torsoSpec.depth); g.add(stud);
    }
    // Tasteful ceremonial Agemaki silk bow on the backplate (tier >= 1.5)
    if (a.tier >= 1.5 && !isNeon) {
      const bow = new THREE.Group(); bow.position.set(0, 0.115, -0.158 * torsoSpec.depth);
      bow.add(new THREE.Mesh(new THREE.TorusGeometry(0.016, 0.004, 6, 16), metal));
      for (const s of [-1, 1]) {
        const loop = new THREE.Mesh(new THREE.TorusGeometry(0.024, 0.007, 6, 16), lace);
        loop.position.set(s * 0.030, 0.004, -0.005); loop.scale.set(1.2, 0.7, 0.6); bow.add(loop);
        const tail = new THREE.CatmullRomCurve3([
          new V(s * 0.013, -0.008, -0.006), new V(s * 0.028, -0.085, -0.012), new V(s * 0.034, -0.168, -0.006)
        ]);
        bow.add(new THREE.Mesh(new THREE.TubeGeometry(tail, 10, 0.0048, 5), lace));
        const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.012, 0.042, 8, 1, true), lace);
        tassel.position.set(s * 0.034, -0.192, -0.006); bow.add(tassel);
      }
      g.add(bow);
    }
    if (isNeon) {
      // TRON glowing front rails & Identity Disc on the Ronin's back
      for (const s of [-1, 1]) {
        const rail = new THREE.CatmullRomCurve3([
          new V(0.072 * s, 0.228, 0.114 * torsoSpec.depth), new V(0.095 * s, 0.115, 0.168 * torsoSpec.depth),
          new V(0.076 * s, -0.045, 0.156 * torsoSpec.depth), new V(0.068 * s, -0.245, 0.132 * torsoSpec.depth)
        ]);
        g.add(new THREE.Mesh(new THREE.TubeGeometry(rail, 22, 0.0042, 5), metal));
      }
      const discGrp = new THREE.Group(); discGrp.position.set(0, 0.092, -0.168 * torsoSpec.depth); discGrp.rotation.x = 0.08;
      const core = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.078, 0.012, 32), lacquer); core.rotation.x = Math.PI / 2; discGrp.add(core);
      const outerR = new THREE.Mesh(new THREE.TorusGeometry(0.078, 0.007, 8, 36), metal); outerR.position.z = -0.004; discGrp.add(outerR);
      const innerR = new THREE.Mesh(new THREE.TorusGeometry(0.046, 0.0045, 6, 32), lace); innerR.position.z = -0.006; discGrp.add(innerR);
      g.add(discGrp);
    }
    overlay(a.id, rigChest, g);
  }
  // ---- kusazuri: hinged leg-aware overlapping tasset panels with generous Z clearance so legs NEVER poke through!
  if (rigWaist) {
    const g = new THREE.Group(), R = 0.208, hemR = R * 1.24, h = 0.20 + 0.026 * l.sode, n = 7, L = TAU / n * 0.89;
    g.name = `skirt-${a.id}`;
    const obiBand = new THREE.Mesh(new THREE.CylinderGeometry(R, R * 1.01, 0.062, 36, 1, true), lace);
    obiBand.scale.z = 0.84; obiBand.position.y = 0.036; g.add(obiBand);
    for (const dy of [0.064, 0.008]) g.add(ellipseArcTube(R * 1.01, R * 0.84 * 1.01, dy, 0, TAU, 0.0045, metal, 36));
    const panels: HingedPanel[] = [];
    for (let i = 0; i < n; i++) {
      const midTh = i * TAU / n;
      const dirX = Math.sin(midTh), dirZ = Math.cos(midTh);
      // Mount each tasset on a waist hinge pivot oriented outward along midTh so it swings cleanly ahead of the legs
      const pivot = new THREE.Group();
      pivot.position.set(dirX * (R * 1.01), 0.030, dirZ * (R * 0.88));
      pivot.rotation.y = midTh;
      const restPitch = -0.14;
      pivot.rotation.x = restPitch;
      const panelHolder = new THREE.Group();
      panelHolder.position.set(0, -h * 0.5, -R * 1.01);
      panelHolder.add(buildTassetPanel(R * 1.01, hemR, h, -L / 2, L, 0.014, lam(1.6, 1.05)));
      panelHolder.add(ellipseArcTube(hemR + 0.002, hemR + 0.002, -h * 0.5, -L / 2, L, 0.0042, metal, 12));
      panelHolder.add(ellipseArcTube(R * 1.02, R * 1.02, h * 0.5 - 0.01, -L / 2 + 0.05, L - 0.1, 0.0055, lace, 10));
      pivot.add(panelHolder);
      g.add(pivot);
      panels.push({ pivot, dirX, dirZ, restPitch });
    }
    skirtPanels.set(a.id, panels);
    overlay(a.id, rigWaist, g);
  }
  // ---- sode: multi-tiered sculpted shoulder guards with kanmuri-ita cap & gilded piping
  for (const side of ['Left', 'Right']) {
    const A = P(side + 'Arm'), F = P(side + 'ForeArm'), d = F.clone().sub(A).normalize();
    const out = new V(Math.sign(A.x - hips.x) || 1, 0.25, 0);
    const Z = out.addScaledVector(d, -out.dot(d)).normalize(), Y = d.clone().negate(), X = new V().crossVectors(Y, Z);
    const g = new THREE.Group(); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    g.name = `shoulder-${a.id}-${side}`;
    const Rc = 0.124, w = 0.148 + 0.028 * l.sode, th = w / Rc, totalH = 0.135 + 0.044 * l.sode, off = 0.064;
    const tiers = a.tier >= 2.0 ? 3 : 2;
    const capH = totalH * 0.34;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(Rc * 0.94, Rc * 1.01, capH, 14, 1, true, -th / 2, th), lacquer);
    cap.position.set(0, 0.050 - capH * 0.5, off - Rc); g.add(cap);
    const bar = arcTube(Rc * 0.96, 0.050, -th / 2, th, 0.0075, lacquer); bar.position.z = off - Rc; g.add(bar);
    const bar2 = arcTube(Rc * 0.98, 0.056, -th / 2, th, 0.0045, metal); bar2.position.z = off - Rc; g.add(bar2);
    if (a.tier >= 1.5) {
      const boss = new THREE.Mesh(new THREE.SphereGeometry(0.018, 12, 8), metal);
      boss.scale.set(1.15, 0.85, 0.52); boss.position.set(0, 0.032, off + 0.002); g.add(boss);
      const bRing = new THREE.Mesh(new THREE.TorusGeometry(0.020, 0.0032, 6, 18), lace);
      bRing.position.set(0, 0.032, off + 0.004); g.add(bRing);
    }
    const lameH = (totalH * 0.72) / tiers;
    for (let t = 0; t < tiers; t++) {
      const f0 = t / tiers, rTop = Rc * (1.0 + f0 * 0.04), rBot = rTop + 0.007;
      const tSpan = th * (0.98 - f0 * 0.05);
      const yC = 0.050 - capH * 0.82 - t * (lameH * 0.82) - lameH * 0.45;
      const panel = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, lameH, 12, 1, true, -tSpan / 2, tSpan), lam(1.5, 0.52));
      panel.position.set(0, yC, off - Rc); g.add(panel);
      const hem = arcTube(rBot + 0.002, yC - lameH * 0.5, -tSpan / 2, tSpan, t === tiers - 1 ? 0.0048 : 0.0032, metal);
      hem.position.z = off - Rc; g.add(hem);
    }
    g.position.copy(A);
    hang(a.id, side + 'Arm', g);
  }
  // ---- kote: fitted forearm vambraces on higher-tier armors (tier >= 1.5)
  if (a.tier >= 1.5) for (const side of ['Left', 'Right']) {
    if (!bones[side + 'Hand']) continue;
    const F = P(side + 'ForeArm'), H = P(side + 'Hand'), len = F.distanceTo(H);
    if (len < 0.08) continue;
    const g = buildForearmVambrace(len, lam(1.4, 1.1), lacquer, metal, lace, a.tier);
    g.name = `kote-${a.id}-${side}`;
    g.position.copy(F).lerp(H, 0.52);
    g.quaternion.setFromUnitVectors(new V(0, 1, 0), F.clone().sub(H).normalize());
    hang(a.id, side + 'ForeArm', g);
  }
  // ---- suneate: contoured shin greaves with domed kneecaps
  if (l.shins) for (const side of ['Left', 'Right']) {
    const K = P(side + 'Leg'), Fo = P(side + 'Foot'), len = K.distanceTo(Fo);
    const g = buildContouredGreave(len, lam(1.3, 1.2), lacquer, metal, lace);
    g.position.copy(K).lerp(Fo, 0.52);
    g.quaternion.setFromUnitVectors(new V(0, 1, 0), K.clone().sub(Fo).normalize());
    hang(a.id, side + 'Leg', g);
  }
  // ---- the helmet
  if (l.helmet) {
    // r is the bowl's radius: a little over the real head's (real-head.ts), its rim resting on the brow
    const H = P('Head'), T = P('HeadTop_End'), hh = T.distanceTo(H), jingasa = l.helmet === 'jingasa', r = hh * (jingasa ? 0.42 : 0.39);
    const g = new THREE.Group();
    if (l.helmet === 'jingasa' && kasaMesh) {
      // the foot soldier's lacquered iron hat, with the clan's crest. Built in the straw kasa's own frame
      // (rig.ts fits that one on the scanned head: crown inside the cone, brim on the brow), so it is worn,
      // not perched: same brim height, a little wider and shallower
      const R = 0.25, Hc = 0.088, base = -0.066;
      const hat = new THREE.Mesh(new THREE.ConeGeometry(R, Hc, 28, 1, true), lacquer); hat.position.y = base + Hc / 2; g.add(hat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.006, 5, 40), metal); rim.rotation.x = Math.PI / 2; rim.position.y = base; g.add(rim);
      // the crest lies on the slope of the cone, facing up and out
      const slope = Math.atan2(Hc, R), y0 = base + Hc * 0.45, rad = R * (1 - (y0 - base) / Hc);
      const nrm = new V(0, Math.cos(slope), Math.sin(slope));
      const mon = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), metal);
      mon.position.set(0, y0, rad).addScaledVector(nrm, 0.003); mon.rotation.x = -(Math.PI / 2 - slope); g.add(mon);
      const monIn = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 24), lacquer); monIn.position.copy(mon.position).addScaledVector(nrm, 0.0015); monIn.rotation.x = mon.rotation.x; g.add(monIn);
      g.userData.helmet = true;   // the sōhei keeps his hood instead (dressUp)
      overlay(a.id, kasaMesh, g);
      return;
    } else {
      // hachi: riveted 24-gore dome with PBR Sobel normal map & urushi clearcoat
      const ht = roninHachiPBR(l);
      const dome: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12 * Math.PI / 2; dome.push(new THREE.Vector2(Math.cos(t) * r * (1 + 0.04 * Math.sin(t * 2)), Math.sin(t) * r * 0.95)); }
      dome[12].x = r * 0.1;
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(dome, 48), new THREE.MeshPhysicalMaterial({
        map: ht.map, normalMap: ht.normal, normalScale: new THREE.Vector2(1.1, 1.1), roughnessMap: ht.rough,
        clearcoat: 0.90, clearcoatRoughness: 0.12, roughness: 0.28, metalness: 0.48, side: THREE.DoubleSide
      }));
      g.add(bowl);
      const tehen = new THREE.Mesh(new THREE.TorusGeometry(r * 0.11, r * 0.035, 6, 20), metal); tehen.rotation.x = Math.PI / 2; tehen.position.y = r * 0.94; g.add(tehen);
      const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.04, 6, 40), metal); band.rotation.x = Math.PI / 2; g.add(band);
      // mabizashi: the visor over the eyes, only at the front
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 1.38, r * 0.2, 20, 1, true, -1.05, 2.1), lacquer); visor.position.y = -r * 0.1; g.add(visor);
      g.add(arcTube(r * 1.38, -r * 0.2, -1.05, 2.1, r * 0.03, metal));
      // shikoro: four flaring lames round the back and sides, the face left open
      const L = TAU * 0.68;
      for (let i = 0; i < 4; i++) {
        const rt = r * (1.0 + i * 0.13), rb = rt + r * 0.16, lh = r * 0.27, y = -r * 0.02 - i * r * 0.22 - lh / 2;
        const lame = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, lh, 28, 1, true, Math.PI - L / 2, L), lam(7, 0.25));
        lame.position.y = y; g.add(lame);
        if (i === 3) g.add(arcTube(rb, y - lh / 2, Math.PI - L / 2, L, r * 0.025, metal));
      }
      // fukigaeshi: the top lame turned back at both front ends, each with a small crest
      for (const s of [-1, 1]) {
        const th = s * (Math.PI - L / 2), wing = new THREE.Group();
        wing.position.set(Math.sin(th) * r * 1.08, -r * 0.12, Math.cos(th) * r * 1.08); wing.rotation.y = th - s * 0.85; g.add(wing);
        const p = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.42, r * 0.035), lacquer); wing.add(p);
        const e = new THREE.Mesh(new THREE.BoxGeometry(r * 0.54, r * 0.46, r * 0.02), metal); e.position.z = -r * 0.012; wing.add(e);
        const mon = new THREE.Mesh(new THREE.CircleGeometry(r * 0.11, 16), metal); mon.position.z = r * 0.02; wing.add(mon);
      }
      // the crest on the front
      const front = new THREE.Group(); front.position.set(0, r * 0.32, r * 1.0); front.rotation.x = -0.12; g.add(front);
      const base = new THREE.Mesh(new THREE.BoxGeometry(r * 0.34, r * 0.22, r * 0.06), metal); front.add(base);   // haraidate
      if (l.helmet === 'crescent') {
        // a thin crescent moon, horns up, like the one-eyed dragon's
        const Ro = r * 1.35, s = new THREE.Shape(), Ri = Ro * 0.94, dy = Ro * 0.13;
        for (let i = 0; i <= 32; i++) { const t = Math.PI + 0.1 + (Math.PI - 0.2) * i / 32; const p = [Math.cos(t) * Ro, Math.sin(t) * Ro]; if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); }
        for (let i = 32; i >= 0; i--) { const t = Math.PI + 0.18 + (Math.PI - 0.36) * i / 32; s.lineTo(Math.cos(t) * Ri, Math.sin(t) * Ri + dy); }
        const moon = new THREE.Mesh(extrude(s, r * 0.04), metal); moon.position.set(0, Ro * 0.92, r * 0.02); front.add(moon);
      } else {
        // kuwagata: two golden antler blades rising and opening outwards
        for (const sx of [-1, 1]) {
          const s = new THREE.Shape(), N = 16, Hh = r * (l.helmet === 'sun' ? 2.0 : 2.3), spread = r * 0.95;
          const c = (t: number) => [sx * (r * 0.1 + spread * Math.pow(t, 1.7)), Hh * t];
          const wdt = (t: number) => r * (0.16 * (1 - t) + 0.035);
          for (let i = 0; i <= N; i++) { const t = i / N, [x, y] = c(t); if (i) s.lineTo(x - wdt(t), y); else s.moveTo(x - wdt(t), y); }
          for (let i = N; i >= 0; i--) { const t = i / N, [x, y] = c(t); s.lineTo(x + wdt(t), y); }
          const horn = new THREE.Mesh(extrude(s, r * 0.035), metal); horn.position.y = r * 0.08; front.add(horn);
        }
        if (l.helmet === 'sun') {
          // Hachiman's sun between the antlers: a sixteen-pointed golden star round a scarlet disc
          const star = new THREE.Shape(), k = 32;
          for (let i = 0; i <= k; i++) { const t = i / k * TAU, rr = (i % 2 ? r * 0.36 : r * 0.62); const x = Math.sin(t) * rr, y = Math.cos(t) * rr; if (i) star.lineTo(x, y); else star.moveTo(x, y); }
          const sun = new THREE.Group(); sun.position.set(0, r * 0.95, r * 0.05); front.add(sun);
          sun.add(new THREE.Mesh(extrude(star, r * 0.04), metal));
          const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 32), new THREE.MeshStandardMaterial({ color: l.lace, emissive: l.lace, emissiveIntensity: 0.6, roughness: 0.4 })); disc.position.z = r * 0.04; sun.add(disc);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.3, r * 0.03, 6, 32), metal); ring.position.z = r * 0.045; sun.add(ring);
        }
      }
      g.position.set(H.x, H.y + hh * 0.51, H.z + 0.01);   // rim on the brow line, the bowl over the crown
    g.userData.helmet = true;
    hang(a.id, 'Head', g);
    }
  }
}

// ------------------------------------------------------------ monks' habits
// Two habits are cut from the same pattern: the sōhei's own (what the warrior monk wears with no plated
// armour on: ink-dark, its colours from his look) and the wandering monk's robe sold by Masa (ochre
// linen, anyone can wear it). A habit over the body (the simulated robe and sleeves below it take its
// colour), a kesa of sewn patches over the left shoulder with gilded hems and a gold ring, a white
// collar, a broad sash with a cord belt and a band of warm neon, a long rosary of big wooden beads whose
// master bead glows, and a kanji in neon on the back. The sōhei's hood is rig.ts's.
const SOHEI = 'sohei-garb';
interface HabitColours { habit: number; kesa: number; belt: number; cord: number; mark: string; roles?: boolean }
const NEON_CORE = 0xfff1d6;
const neonHalo = (o: THREE.MeshBasicMaterialParameters) => tagMat(new THREE.MeshBasicMaterial({
  color: 0xffb54a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, ...o }), CLS.fx);
function buildHabit(id: string, c: HabitColours) {
  if (!rigChest || !rigWaist) return;
  const glows: THREE.Mesh[] = [];
  sets.set(id, []);
  const cloth = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.94, emissive: color, emissiveIntensity: 0.12, side: THREE.DoubleSide, ...o });
  const habit = cloth(c.habit), kesa = cloth(c.kesa, { map: brocadeKesaTex }), collar = cloth(0xe6e0d0), cord = cloth(c.cord), sash = cloth(c.belt);
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2316, roughness: 0.45, metalness: 0.05 }), tassel = cloth(0xb3241c);
  const gilt = new THREE.MeshStandardMaterial({ color: 0xe0b450, metalness: 0.85, roughness: 0.3 });
  // the sōhei's colours come from his look (look.ts): habit = "cloth", kesa = "lacquer"
  if (c.roles) { habit.userData.role = 'cloth'; kesa.userData.role = 'lacquer'; }
  const body = new THREE.Group(); body.name = `${id}-habit`;
  const torso = new THREE.Mesh(new THREE.LatheGeometry([
    [0.178, -0.268], [0.184, -0.16], [0.213, -0.03], [0.221, 0.09], [0.205, 0.168], [0.148, 0.234], [0.094, 0.262]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 32), habit);
  torso.scale.z = 0.74;
  body.add(torso);
  const tube = (q: THREE.Vector3[], radius: number, mat: THREE.Material) => {
    const path = new THREE.CatmullRomCurve3(q);
    body.add(new THREE.Mesh(new THREE.TubeGeometry(path, 24, radius, 6), mat));
    return path;
  };
  // the white under-collar crossing left over right
  tube([new V(-0.080, 0.258, 0.026), new V(-0.084, 0.207, 0.103), new V(-0.047, 0.139, 0.146), new V(0.039, 0.062, 0.166)], 0.014, collar);
  tube([new V(0.078, 0.256, 0.029), new V(0.083, 0.193, 0.116), new V(0.039, 0.126, 0.162), new V(-0.068, -0.025, 0.154)], 0.015, collar);
  // the kesa: a broad band of patches from the left shoulder down across the chest to the right hip,
  // and round the back the same way
  for (const back of [false, true]) {
    const z = back ? -1 : 1;
    const path = new THREE.CatmullRomCurve3([
      new V(0.13, 0.262, 0), new V(0.128, 0.205, 0.13 * z), new V(0.07, 0.09, 0.184 * z), new V(-0.06, -0.03, 0.184 * z), new V(-0.178, -0.17, 0.122 * z)
    ]);
    const strip = new THREE.PlaneGeometry(1, 1, 4, 30), v = strip.attributes.position;
    for (let i = 0; i < v.count; i++) {
      const side = v.getX(i), t = v.getY(i) + 0.5, p = path.getPoint(t), d = path.getTangent(t), span = 0.15 - t * 0.02;
      v.setXYZ(i, p.x + d.y * side * span, p.y - d.x * side * span, p.z - z * 0.014 * Math.abs(2 * side));
    }
    strip.computeVertexNormals();
    body.add(new THREE.Mesh(strip, kesa));
    // gilded thread along both hems of the band
    for (const side of [-0.5, 0.5]) {
      const hem: THREE.Vector3[] = [];
      for (let k = 0; k <= 12; k++) {
        const t = k / 12, p = path.getPoint(t), d = path.getTangent(t), span = 0.15 - t * 0.02;
        hem.push(new V(p.x + d.y * side * span, p.y - d.x * side * span, p.z - z * 0.012));
      }
      body.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(hem), 30, 0.0045, 5), gilt));
    }
  }
  // the gilded ring that fastens the kesa on the shoulder, with its cord
  const clasp = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.0075, 8, 22), gilt);
  clasp.position.set(0.1, 0.2, 0.15); clasp.rotation.set(0.3, 0.5, 0); body.add(clasp);
  tube([new V(0.1, 0.2, 0.15), new V(0.07, 0.17, 0.17), new V(0.04, 0.12, 0.18)], 0.004, cord);
  // the juzu: big beads round the neck hanging down to the belly, a bigger bead and a red tassel at the bottom
  const beads = new THREE.CatmullRomCurve3([
    new V(-0.09, 0.275, -0.03), new V(-0.115, 0.2, 0.125), new V(-0.075, 0.07, 0.2), new V(0, 0.0, 0.212),
    new V(0.075, 0.07, 0.2), new V(0.115, 0.2, 0.125), new V(0.09, 0.275, -0.03), new V(0, 0.295, -0.11)
  ], true);
  const bead = new THREE.SphereGeometry(0.0145, 10, 8);
  for (let i = 0; i < 30; i++) { const b = new THREE.Mesh(bead, wood); b.position.copy(beads.getPointAt(i / 30)); body.add(b); }
  const big = new THREE.Mesh(new THREE.SphereGeometry(0.024, 12, 10), new THREE.MeshBasicMaterial({ color: NEON_CORE })); big.position.set(0, -0.015, 0.216); body.add(big);
  const bigGlow = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), neonHalo({ opacity: 0.4 })); bigGlow.position.copy(big.position); body.add(bigGlow); glows.push(bigGlow);
  const fringe = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8, 1, true), tassel); fringe.position.set(0, -0.07, 0.214); body.add(fringe);
  // the habit's mark on the back, in warm neon like the sōhei's brow ring (rig.ts), as the ronin wears 浪
  {
    const draw = (blur: number) => canvasTex(128, 128, x => {
      x.filter = blur ? `blur(${blur}px)` : 'none';
      x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.font = 'bold 92px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
      x.fillText(c.mark, 64, 68);
    });
    const core = new THREE.Mesh(new THREE.PlaneGeometry(0.13, 0.13), new THREE.MeshBasicMaterial({ map: draw(0), color: NEON_CORE, alphaTest: 0.45, side: THREE.DoubleSide }));
    const soft = new THREE.Mesh(new THREE.PlaneGeometry(0.18, 0.18), neonHalo({ map: draw(7), opacity: 0.85, side: THREE.DoubleSide }));
    core.position.set(0.035, -0.1, -0.2); soft.position.set(0.035, -0.1, -0.204);   // low on the back, worn over the kesa like an emblem
    core.rotation.y = soft.rotation.y = Math.PI;
    body.add(core, soft); glows.push(soft);
  }
  overlay(id, rigChest, body);

  const waist = new THREE.Group(); waist.name = `${id}-belt`;
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.198, 0.196, 0.075, 32, 1, true), sash);
  belt.scale.z = 0.78; belt.position.y = 0.005; waist.add(belt);
  const rope = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.011, 6, 40), cord);
  rope.rotation.x = Math.PI / 2; rope.scale.y = 0.78; rope.position.y = 0.022; waist.add(rope);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.022, 0.008, 24, 6), cord);
  knot.position.set(0.1, 0.02, 0.14); waist.add(knot);
  for (const s of [-1, 1]) {   // the cord's two loose ends
    const end = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.16, 6), cord);
    end.position.set(0.1 + s * 0.015, -0.06, 0.15); end.rotation.z = s * 0.12; waist.add(end);
  }
  // a band of warm neon along the lower edge of the belt
  for (const [r, mat, tube] of [[0.2, new THREE.MeshBasicMaterial({ color: NEON_CORE }), 0.0055], [0.2, neonHalo({ opacity: 0.45 }), 0.022]] as const) {
    const band = new THREE.Mesh(new THREE.TorusGeometry(r, tube, 6, 64), mat);
    band.rotation.x = Math.PI / 2; band.scale.y = 0.78; band.position.y = -0.024; waist.add(band);
    if (mat.blending === THREE.AdditiveBlending) glows.push(band);
  }
  overlay(id, rigWaist, waist);

  for (const side of ['Left', 'Right']) {
    const shoulder = P(side + 'Arm'), elbow = P(side + 'ForeArm');
    const sleeve = new THREE.Group(); sleeve.name = `${id}-sleeve-${side}`;
    const h = shoulder.distanceTo(elbow) * 0.94;
    sleeve.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.108, h, 18, 1, true), habit));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.106, 0.006, 5, 22), gilt);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -h / 2; sleeve.add(cuff);
    // the kesa covers the left shoulder
    if (side === 'Left') { const k = new THREE.Mesh(new THREE.CylinderGeometry(0.084, 0.095, h * 0.45, 18, 1, true), kesa); k.position.y = h * 0.27; sleeve.add(k); }
    sleeve.position.copy(shoulder).lerp(elbow, 0.40);
    sleeve.quaternion.setFromUnitVectors(new V(0, 1, 0), shoulder.clone().sub(elbow).normalize());
    hang(id, side + 'Arm', sleeve);
  }
  for (const g of glows) g.castShadow = g.receiveShadow = false;   // halos glow round the figure, out of its mask
}

// ---- auras: they ride with the samurai, not with a bone
const fxMat = (c: number, o: number) => tagMat(new THREE.MeshBasicMaterial({
  color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide
}), CLS.light);
const fxSprite = (tex: THREE.Texture, c: number, o: number, scale: number) => {
  const mat = tagMat(new THREE.SpriteMaterial({
    map: tex, color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending
  }), CLS.light);
  const sp = new THREE.Sprite(mat);
  sp.scale.setScalar(scale);
  return sp;
};
function makeOrbitWakeGeo(length: number, maxR: number, curveOffset: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const u = i / 16, ang = u * 0.72;
    pts.push(new V(-Math.sin(ang) * curveOffset * u, Math.sin(u * Math.PI * 1.4) * 0.035 * u, -u * length));
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 18, maxR, 6, false);
  const pos = geo.attributes.position, center = new V(), p = new V(), stride = 7;
  for (let i = 0; i <= 18; i++) {
    const u = i / 18;
    curve.getPointAt(u, center);
    const taper = Math.pow(1 - u, 1.35) * (0.25 + 0.75 * Math.sin(Math.min(1, u * 4.5) * Math.PI * 0.5));
    for (let j = 0; j < stride; j++) {
      const idx = i * stride + j;
      p.fromBufferAttribute(pos, idx).sub(center).multiplyScalar(taper).add(center);
      pos.setXYZ(idx, p.x, p.y, p.z);
    }
  }
  geo.computeVertexNormals();
  return geo;
}
function makeWindBladeMesh(mat: THREE.Material) {
  const s = new THREE.Shape();
  s.moveTo(-0.048, 0);
  s.quadraticCurveTo(0, 0.030, 0.056, 0.004);
  s.quadraticCurveTo(0.004, 0.011, -0.048, 0);
  return new THREE.Mesh(new THREE.ShapeGeometry(s, 10), mat);
}

function buildAura(kind: 'foxfire' | 'wind' | 'fire' | 'lightning' | 'gold' | 'neon') {
  const g = new THREE.Group(); g.name = kind;
  if (kind === 'fire') {
    // Armadura de Kagutsuchi: 3 blazing solar-magma flame orbs + rising ember sparks + molten ground ring
    const orbGroup = new THREE.Group(); orbGroup.name = 'orbs'; g.add(orbGroup);
    const fresnelMat = makeFresnelShellMat(0xfff4b8, 0xff4208, 0.90, 1.85);
    const wakeGeo = makeOrbitWakeGeo(0.52, 0.028, 0.22);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(new THREE.SphereGeometry(0.060, 14, 10), fxMat(0xfff6cc, 0.95)));
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.115, 20, 14), fresnelMat);
      shell.scale.y = 1.25; w.add(shell);
      const tongue = new THREE.Mesh(new THREE.ConeGeometry(0.072, 0.26, 10, 1, true), fxMat(0xff6a18, 0.52));
      tongue.position.y = 0.16; tongue.name = 'tongue'; w.add(tongue);
      w.add(fxSprite(softGlowTex, 0xff6a1a, 0.66, 0.64));
      const flare = fxSprite(anamorphicFlareTex, 0xffe49e, 0.42, 0.44); flare.name = 'flare'; w.add(flare);
      w.add(new THREE.Mesh(wakeGeo, fxMat(0xff5210, 0.46)));
      orbGroup.add(w);
    }
    const embers = new THREE.Group(); embers.name = 'embers'; g.add(embers);
    for (let i = 0; i < 6; i++) {
      embers.add(fxSprite(softGlowTex, i % 2 ? 0xffb838 : 0xff5a14, 0.82, 0.14));
    }
    const fireRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.84, 56), fxMat(0xff5a14, 0.42));
    fireRing.rotation.x = -Math.PI / 2; fireRing.position.y = 0.045; fireRing.name = 'fireRing'; g.add(fireRing);
    const fireOuter = new THREE.Mesh(new THREE.RingGeometry(0.84, 1.02, 56), fxMat(0xffa428, 0.20));
    fireOuter.rotation.x = -Math.PI / 2; fireOuter.position.y = 0.042; fireOuter.name = 'fireOuter'; g.add(fireOuter);
  } else if (kind === 'lightning') {
    // Armadura de Raijin: 3 crackling storm-charge plasma nodes + snapping 3D lightning arcs + voltage ring
    const orbGroup = new THREE.Group(); orbGroup.name = 'orbs'; g.add(orbGroup);
    const fresnelMat = makeFresnelShellMat(0xffffff, 0x38bcff, 0.92, 2.0);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.052, 0), fxMat(0xffffff, 0.98));
      core.name = 'core'; w.add(core);
      w.add(new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), fresnelMat));
      w.add(fxSprite(softGlowTex, 0x48c4ff, 0.64, 0.56));
      const flare = fxSprite(anamorphicFlareTex, 0xe8faff, 0.62, 0.58); flare.name = 'flare'; w.add(flare);
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.142, 0.005, 5, 28), fxMat(0xb8eeff, 0.85));
      ringA.name = 'ringA'; w.add(ringA);
      const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.172, 0.0038, 5, 28), fxMat(0x38b6ff, 0.65));
      ringB.name = 'ringB'; w.add(ringB);
      orbGroup.add(w);
    }
    // 3 snapping jagged electric arc lines jumping between the 3 orbiting storm nodes
    const arcs = new THREE.Group(); arcs.name = 'arcs'; g.add(arcs);
    const arcMat = tagMat(new THREE.LineBasicMaterial({ color: 0xb8f0ff, transparent: true, opacity: 0.92, blending: THREE.AdditiveBlending }), CLS.light);
    for (let i = 0; i < 3; i++) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(9 * 3), 3));
      arcs.add(new THREE.Line(geo, arcMat));
    }
    const boltRing = new THREE.Mesh(new THREE.RingGeometry(0.72, 0.79, 48), fxMat(0x68d4ff, 0.50));
    boltRing.rotation.x = -Math.PI / 2; boltRing.position.y = 0.045; boltRing.name = 'boltRing'; g.add(boltRing);
    const boltOuter = new THREE.Mesh(new THREE.RingGeometry(0.80, 0.94, 48), fxMat(0xd4f6ff, 0.24));
    boltOuter.rotation.x = -Math.PI / 2; boltOuter.position.y = 0.042; boltOuter.name = 'boltOuter'; g.add(boltOuter);
  } else if (kind === 'wind') {
    // Armadura de los Cinco Vientos: 3 luminous jade-emerald wind-spirit orbs with faceted crystal cores,
    // volumetric Fresnel plasma shells, counter-rotating cyclone rings, crescent wind-blades, glow halos & wakes
    const orbGroup = new THREE.Group(); orbGroup.name = 'orbs'; g.add(orbGroup);
    const fresnelMat = makeFresnelShellMat(0xeafff6, 0x28e5a8, 0.88, 1.95);
    const wakeGeoMain = makeOrbitWakeGeo(0.58, 0.030, 0.24);
    const wakeGeoSub = makeOrbitWakeGeo(0.44, 0.015, 0.16);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.050, 0), fxMat(0xf4fff9, 0.95));
      crystal.name = 'crystal'; w.add(crystal);
      w.add(new THREE.Mesh(new THREE.SphereGeometry(0.064, 16, 12), fxMat(0xafffe2, 0.78)));
      w.add(new THREE.Mesh(new THREE.SphereGeometry(0.118, 22, 16), fresnelMat));
      w.add(fxSprite(softGlowTex, 0x48f2bc, 0.62, 0.62));
      const flare = fxSprite(anamorphicFlareTex, 0xd8fff0, 0.44, 0.46); flare.name = 'flare'; w.add(flare);
      const ringA = new THREE.Mesh(new THREE.TorusGeometry(0.152, 0.0055, 6, 36), fxMat(0x98ffe0, 0.72));
      ringA.rotation.set(0.75 + i * 0.4, 0.3, 0.4); ringA.name = 'ringA'; w.add(ringA);
      const ringB = new THREE.Mesh(new THREE.TorusGeometry(0.186, 0.0038, 6, 36), fxMat(0x30d4a0, 0.52));
      ringB.rotation.set(-0.65, 0.8 + i * 0.5, -0.5); ringB.name = 'ringB'; w.add(ringB);
      const blades = new THREE.Group(); blades.name = 'blades';
      const bladeMat = fxMat(0xb8ffe8, 0.72);
      for (let b = 0; b < 3; b++) {
        const ba = (b / 3) * TAU;
        const bm = makeWindBladeMesh(bladeMat);
        bm.position.set(Math.cos(ba) * 0.145, (b - 1) * 0.028, Math.sin(ba) * 0.145);
        bm.rotation.set(0.35, -ba, 0.25);
        blades.add(bm);
      }
      w.add(blades);
      w.add(new THREE.Mesh(wakeGeoMain, fxMat(0x52ebb8, 0.44)));
      const wakeSub = new THREE.Mesh(wakeGeoSub, fxMat(0xd0fff0, 0.62)); wakeSub.position.set(0.018, 0.018, 0); w.add(wakeSub);
      orbGroup.add(w);
    }
    const groundRing = new THREE.Mesh(new THREE.RingGeometry(0.76, 0.84, 56), fxMat(0x56f0be, 0.34));
    groundRing.rotation.x = -Math.PI / 2; groundRing.position.y = 0.045; groundRing.name = 'windRing'; g.add(groundRing);
    const groundOuter = new THREE.Mesh(new THREE.RingGeometry(0.84, 0.98, 56), fxMat(0x28b88c, 0.16));
    groundOuter.rotation.x = -Math.PI / 2; groundOuter.position.y = 0.042; groundOuter.name = 'windOuter'; g.add(groundOuter);
  } else if (kind === 'foxfire') {
    const fresnelMat = makeFresnelShellMat(0xe8faff, 0x2c9cff, 0.84, 1.9);
    const wakeGeo = makeOrbitWakeGeo(0.42, 0.024, 0.18);
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(new THREE.SphereGeometry(0.062, 14, 10), fxMat(0xe0f8ff, 0.92)));
      const shell = new THREE.Mesh(new THREE.SphereGeometry(0.115, 18, 14), fresnelMat); shell.scale.y = 1.32; w.add(shell);
      const tip = new THREE.Mesh(new THREE.ConeGeometry(0.068, 0.22, 12, 1, true), fxMat(0x4eb8ff, 0.45)); tip.position.y = 0.14; w.add(tip);
      w.add(fxSprite(softGlowTex, 0x38aeff, 0.56, 0.56));
      w.add(new THREE.Mesh(wakeGeo, fxMat(0x40b2ff, 0.38)));
      g.add(w);
    }
  } else if (kind === 'neon') {
    // TRON white-light ring: crisp luminous circuit halo at the feet and soft identity-disc pulse
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.68, 0.74, 64), fxMat(0xffffff, 0.65));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.04; ring.name = 'ring'; g.add(ring);
    const outer = new THREE.Mesh(new THREE.RingGeometry(0.74, 0.86, 64), fxMat(0xcce8ff, 0.22));
    outer.rotation.x = -Math.PI / 2; outer.position.y = 0.038; outer.name = 'outer'; g.add(outer);
  } else {
    // Hachiman's blessing: a golden halo behind the head, a ring of light at the feet
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 40), fxMat(0xffd040, 0.85)); halo.name = 'halo'; g.add(halo);
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.4, 40), fxMat(0xffb020, 0.25)); disc.name = 'disc'; g.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 48), fxMat(0xffc830, 0.5)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.name = 'ring'; g.add(ring);
  }
  g.visible = false; root.add(g);
  return g;
}

for (const a of ARMORS) {
  // the wandering monk's robe: ochre linen, a darker mantle for the kesa, 禅 (zen) on the back
  if (a.robe) buildHabit(a.id, { habit: a.robe.linen, kesa: a.robe.mantle, belt: a.robe.sash, cord: 0xdcc79a, mark: '禅' });
  else if (a.look) build(a);
}
// the sōhei's own habit, coloured by his look, 僧 (monk) on the back
buildHabit(SOHEI, { habit: 0x1c1d24, kesa: 0xd8a630, belt: 0x23222a, cord: 0xd9cfb4, mark: '僧', roles: true });

// ------------------------------------------------------------ the swordsmen from across the sea
// The xiákè's hanfu: a robe crossed left over right with broad bordered lapels (the look's "lacquer"), a wide
// sash with a jade bi disc and its tassel, jade neon and 侠 on the back. The hwarang's dopo: a long robe
// with a dark collar band and its white strip, the sejodae cord tied high on the chest with its tasselled
// ends hanging down the front (the look's "lacquer"), plum-blossom neon and 花 on the back. Both wear the
// simulated robe and sleeves below in the robe's colour (the look's "cloth"); their hats are rig.ts's.
const XIA = 'xia-garb', HWARANG = 'hwarang-garb';
const neonPair = (core: number, halo: number) => [new THREE.MeshBasicMaterial({ color: core }), neonHalo({ color: halo, opacity: 0.45 })] as const;
function neonMark(parent: THREE.Object3D, ch: string, [core, halo]: readonly [THREE.MeshBasicMaterial, THREE.MeshBasicMaterial], glows: THREE.Mesh[], y = 0.03) {
  const draw = (blur: number) => canvasTex(128, 128, x => {
    x.filter = blur ? `blur(${blur}px)` : 'none';
    x.fillStyle = '#fff'; x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = 'bold 92px "Hiragino Mincho ProN", "Yu Mincho", "Noto Serif JP", serif';
    x.fillText(ch, 64, 68);
  });
  const c = new THREE.Mesh(new THREE.PlaneGeometry(0.14, 0.14), new THREE.MeshBasicMaterial({ map: draw(0), color: core.color, alphaTest: 0.45, side: THREE.DoubleSide }));
  const h = new THREE.Mesh(new THREE.PlaneGeometry(0.19, 0.19), neonHalo({ map: draw(7), color: halo.color, opacity: 0.85, side: THREE.DoubleSide }));
  c.position.set(0, y, -0.172); h.position.set(0, y, -0.176);
  c.rotation.y = h.rotation.y = Math.PI;
  parent.add(c, h); glows.push(h);
}
function buildSwordsman(id: string, kind: 'xia' | 'hwarang') {
  if (!rigChest || !rigWaist) return;
  const glows: THREE.Mesh[] = [];
  sets.set(id, []);
  const cloth = (color: number, o: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.88, emissive: color, emissiveIntensity: 0.12, side: THREE.DoubleSide, ...o });
  const silkTex = (kind === 'xia' ? cloudSilkTex : plumSilkTex).clone();
  silkTex.repeat.set(2.5, 2.5); silkTex.needsUpdate = true;
  const robe = cloth(0x4a5e2a, { map: silkTex }), trim = cloth(kind === 'xia' ? 0xd8a630 : 0xe4573d, { roughness: 0.6 }), white = cloth(0xeeeae0);
  robe.userData.role = 'cloth'; trim.userData.role = 'lacquer';
  const gilt = new THREE.MeshStandardMaterial({ color: 0xe0b450, metalness: 0.85, roughness: 0.3 });
  const neon = kind === 'xia' ? neonPair(0xe6fff2, 0x4dffa6) : neonPair(0xffeef5, 0xff6aa8);
  const body = new THREE.Group(); body.name = `${id}-robe`;
  const torso = new THREE.Mesh(new THREE.LatheGeometry([
    [0.176, -0.268], [0.182, -0.16], [0.21, -0.03], [0.218, 0.09], [0.203, 0.168], [0.146, 0.234], [0.092, 0.262]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 32), robe);
  torso.scale.z = 0.74;
  body.add(torso);
  const tube = (q: THREE.Vector3[], radius: number, mat: THREE.Material, parent: THREE.Object3D = body) => {
    const path = new THREE.CatmullRomCurve3(q);
    parent.add(new THREE.Mesh(new THREE.TubeGeometry(path, 28, radius, 7), mat));
    return path;
  };
  // the two lapels, the left one over the right, each with its border and the white collar inside
  const under = [new V(-0.078, 0.258, 0.03), new V(-0.084, 0.2, 0.112), new V(-0.04, 0.13, 0.158), new V(0.05, 0.05, 0.168)];
  const over = [new V(0.08, 0.258, 0.03), new V(0.086, 0.195, 0.118), new V(0.04, 0.12, 0.166), new V(-0.075, -0.03, 0.158), new V(-0.13, -0.1, 0.13)];
  tube(under.map(v => v.clone().add(new V(0.008, 0.006, -0.004))), 0.011, white);
  tube(over.map(v => v.clone().add(new V(-0.008, 0.006, -0.004))), 0.011, white);
  if (kind === 'xia') {
    // broad bordered lapels, the hanfu's mark
    tube(under, 0.019, trim); tube(over, 0.021, trim);
    tube(over.map(v => v.clone().add(new V(0.012, -0.006, 0.012))), 0.004, gilt);
  } else {
    // the dopo's dark collar band (git) with its white strip (dongjeong)
    const band = cloth(0x23222a);
    tube(under, 0.019, band); tube(over, 0.02, band);
    tube(over.slice(0, 3).map(v => v.clone().add(new V(-0.004, 0.012, 0.006))), 0.008, white);
    // the sejodae: a cord round the chest, knotted on the right, its two ends hanging down with tassels
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.008, 6, 48), trim);
    ring.rotation.x = Math.PI / 2; ring.scale.y = 0.76; ring.position.y = -0.02; body.add(ring);
    const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.018, 0.0065, 28, 6), trim);
    knot.position.set(-0.1, -0.02, 0.15); body.add(knot);
    for (const [dx, len] of [[-0.012, 0.42], [0.014, 0.36]] as const) {
      const end = tube([new V(-0.1 + dx, -0.03, 0.155), new V(-0.104 + dx, -0.2, 0.17), new V(-0.11 + dx, -len, 0.18)], 0.005, trim);
      const t = new THREE.Mesh(new THREE.ConeGeometry(0.013, 0.06, 8, 1, true), trim);
      t.position.copy(end.getPoint(1)).add(new V(0, -0.03, 0)); body.add(t);
    }
    // a band of plum-blossom neon along the cord
    for (const [mat, r] of [[neon[0], 0.0045], [neon[1], 0.018]] as const) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.212, r, 6, 64), mat);
      b.rotation.x = Math.PI / 2; b.scale.y = 0.76; b.position.y = -0.036; body.add(b);
      if (mat === neon[1]) glows.push(b);
    }
  }
  neonMark(body, kind === 'xia' ? '侠' : '花', neon, glows, kind === 'xia' ? 0.06 : 0.1);
  overlay(id, rigChest, body);

  const waist = new THREE.Group(); waist.name = `${id}-sash`;
  if (kind === 'xia') {
    // the wide sash, a gilded edge top and bottom, a band of jade neon, and the jade bi disc with its tassel
    const sash = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.198, 0.095, 32, 1, true), trim);
    sash.scale.z = 0.78; waist.add(sash);
    for (const y of [0.047, -0.047]) { const e = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.004, 5, 48), gilt); e.rotation.x = Math.PI / 2; e.scale.y = 0.78; e.position.y = y; waist.add(e); }
    for (const [mat, r] of [[neon[0], 0.0055], [neon[1], 0.022]] as const) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.203, r, 6, 64), mat);
      b.rotation.x = Math.PI / 2; b.scale.y = 0.78; waist.add(b);
      if (mat === neon[1]) glows.push(b);
    }
    const jade = new THREE.MeshStandardMaterial({ color: 0x3fbf86, roughness: 0.2, metalness: 0.1, emissive: 0x1a6a46, emissiveIntensity: 0.4 });
    const cord = new THREE.MeshStandardMaterial({ color: 0xb3241c, roughness: 0.7, side: THREE.DoubleSide });
    const hang = new THREE.Group(); hang.position.set(0.11, -0.05, 0.15); waist.add(hang);
    const string = new THREE.Mesh(new THREE.CylinderGeometry(0.003, 0.003, 0.07, 5), cord); string.position.y = -0.02; hang.add(string);
    const bi = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.012, 8, 24), jade); bi.position.y = -0.07; hang.add(bi);
    const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.014, 0.08, 10, 1, true), cord); tassel.position.y = -0.13; hang.add(tassel);
  } else {
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.197, 0.195, 0.05, 32, 1, true), robe);
    belt.scale.z = 0.78; waist.add(belt);
  }
  overlay(id, rigWaist, waist);

  for (const side of ['Left', 'Right']) {
    const shoulder = P(side + 'Arm'), elbow = P(side + 'ForeArm');
    const sleeve = new THREE.Group(); sleeve.name = `${id}-sleeve-${side}`;
    const h = shoulder.distanceTo(elbow) * 0.94;
    sleeve.add(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.11, h, 18, 1, true), robe));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.108, kind === 'xia' ? 0.012 : 0.007, 6, 22), kind === 'xia' ? trim : white);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -h / 2; sleeve.add(cuff);
    sleeve.position.copy(shoulder).lerp(elbow, 0.40);
    sleeve.quaternion.setFromUnitVectors(new V(0, 1, 0), shoulder.clone().sub(elbow).normalize());
    hang(id, side + 'Arm', sleeve);
  }
  for (const g of glows) g.castShadow = g.receiveShadow = false;
}
buildSwordsman(XIA, 'xia');
buildSwordsman(HWARANG, 'hwarang');
/** what each class wears when it has no armour of its own on (the ronin wears his kimono and armour) */
const GARB: Partial<Record<ClassId, string>> = { sohei: SOHEI, xia: XIA, hwarang: HWARANG };
/** each class's own headwear (rig.ts), worn whatever the armour */
const HEADWEAR: Partial<Record<ClassId, string>> = { sohei: 'hood', xia: 'douli', hwarang: 'gat' };
for (const a of ARMORS) if (a.look?.aura) auras.set(a.id, buildAura(a.look.aura));



/** lazily build a class-specific sculpted armor set for one of Masa's plated armors */
function ensureClassArmor(clsId: NewClassId, cur: Armor): string {
  const setId = `${clsId}:${cur.id}`;
  if (!sets.has(setId)) {
    sets.set(setId, []);
    buildClassArmor(clsId, setId, cur, { bones, P, rigChest, rigWaist, overlay, hang });
  }
  return setId;
}

/** show the armour you wear (and its helmet instead of the kasa), with your chosen colours */
let activeAura: THREE.Group | undefined;
let activeSkirt: HingedPanel[] | undefined;
export function dressUp(cur = armor()) {
  applyLook(root);
  // every class but the ronin wears its own garb when it has no armour of its own on, its own culturally
  // distinct sculpted armor sets for Masa's plated armors, and always its own headwear (hood, douli, gat)
  const own = GARB[state.cls], headwear = HEADWEAR[state.cls];
  const sohei = state.cls === 'sohei';
  let worn: string;
  if (own && cur.look) worn = ensureClassArmor(state.cls as NewClassId, cur);
  else if (own && !sets.has(cur.id)) worn = own;
  else worn = cur.id;
  for (const [id, list] of sets) for (const o of list) o.visible = id === worn;
  for (const [id, g] of auras) g.visible = id === cur.id;
  activeAura = auras.get(cur.id);
  activeSkirt = skirtPanels.get(worn);
  const helmet = !!cur.look?.helmet && !own;
  const garbed = worn === own, dressed = sets.has(worn), monk = dressed && (!!cur.robe || garbed);
  sam.fitOutfit?.(dressed);
  roninRobe.uRoninOutfit.value = monk ? 2 : dressed ? 1 : 0;
  const habit = garbed ? opt('cloth').c : undefined;
  if (dressed) roninRobe.uRoninLinen.value.set(habit ?? cur.robe?.linen ?? cur.look!.lame);
  for (const o of baseLayers) {
    const layer = o.userData.equipmentLayer;
    // the long cloth robe stays under every set (a long hakama under the armour, the monk's habit);
    // the hanging kimono sleeves only show without plates on the arms
    o.visible = layer === 'robe' ? true : layer === 'sleeves' ? !dressed || monk
      : layer === 'scarf' || layer === 'wrapping' ? !monk && !own : !dressed;
  }
  if (dressed && robeMat) {
    if (habit !== undefined) robeMat.color.set(habit);
    else if (monk) robeMat.color.set(cur.robe!.linen);
    else if (cur.look!.neon !== undefined) robeMat.color.set(0x06070b);
    else robeMat.color.set(cur.look!.lame).multiplyScalar(0.42).lerp(new THREE.Color(cur.look!.lace), 0.22);
    robeMat.map = robeMat.emissiveMap = null; robeMat.emissive.copy(robeMat.color); robeMat.needsUpdate = true;
  } else if (robeMat && robeMap) {
    robeMat.map = robeMap; robeMat.emissiveMap = robeGlowMap;
    if (robeGlowMap) robeMat.emissive.set(0xffffff);
    robeMat.needsUpdate = true;
  }
  root.traverse(o => {
    const part = o.userData.part;
    if (part === 'hat') o.visible = !helmet && !monk && !own && !opt('hat').hidden;
    if ((monk || own) && part === 'mask') o.visible = false;
    if (part === 'topknot') o.visible = !helmet && !sohei;   // the helmet covers the knot; the monk is shaven
    if (part === 'hood' || part === 'douli' || part === 'gat') o.visible = part === headwear;
    if (o.userData.helmet) o.visible = !own && o.visible;
  });
}
dressUp();

const tmpHip = new V(), tmpKneeL = new V(), tmpKneeR = new V();
/** every frame: swing hinged kusazuri skirt panels ahead of striding legs and animate the auras */
export function updateOutfit() {
  // Dynamically hinge each kusazuri tasset outward when either leg swings toward it so legs never clip the skirt
  if (activeSkirt && bones.Hips && bones.LeftLeg && bones.RightLeg) {
    root.worldToLocal(bones.Hips.getWorldPosition(tmpHip));
    root.worldToLocal(bones.LeftLeg.getWorldPosition(tmpKneeL)).sub(tmpHip);
    root.worldToLocal(bones.RightLeg.getWorldPosition(tmpKneeR)).sub(tmpHip);
    for (const p of activeSkirt) {
      const pushL = Math.max(0, tmpKneeL.x * p.dirX + tmpKneeL.z * p.dirZ - 0.04);
      const pushR = Math.max(0, tmpKneeR.x * p.dirX + tmpKneeR.z * p.dirZ - 0.04);
      const push = Math.max(pushL, pushR);
      const target = p.restPitch - Math.min(0.68, push * 2.1);
      p.pivot.rotation.x += (target - p.pivot.rotation.x) * 0.35;
    }
  }
  const g = activeAura;
  if (!g) return;
  const t = state.time;
  if (g.name === 'fire') {
    const orbs = g.getObjectByName('orbs');
    orbs?.children.forEach((w, i) => {
      const a = t * 1.9 + i * (TAU / 3);
      const rad = 0.86 + Math.sin(t * 2.8 + i * 2.1) * 0.07;
      const y = 1.06 + Math.sin(t * 3.1 + i * 2.09) * 0.22;
      w.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      w.rotation.set(0, a + Math.PI / 2, 0);
      w.scale.setScalar(0.92 + Math.sin(t * 8.5 + i * 2.3) * 0.11);
      const tongue = w.getObjectByName('tongue');
      if (tongue) { tongue.scale.set(1, 0.85 + Math.sin(t * 14 + i * 3) * 0.28, 1); tongue.rotation.y = t * 5 + i; }
      const flare = w.getObjectByName('flare') as THREE.Sprite | undefined;
      if (flare) flare.scale.setScalar(0.40 + Math.sin(t * 9.5 + i * 2) * 0.10);
    });
    const embers = g.getObjectByName('embers');
    embers?.children.forEach((sp, i) => {
      const p = (t * 0.65 + i / 6) % 1;
      const a = t * 1.4 + i * (TAU / 6) + p * 1.5;
      const r = 0.72 * (1 - p * 0.35);
      sp.position.set(Math.sin(a) * r, 0.15 + p * 1.65, Math.cos(a) * r);
      sp.scale.setScalar(0.15 * Math.sin(p * Math.PI));
    });
    const fr = g.getObjectByName('fireRing') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    const fo = g.getObjectByName('fireOuter') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (fr) { fr.rotation.z = t * 1.2; fr.scale.setScalar(1 + Math.sin(t * 4.2) * 0.05); fr.material.opacity = 0.34 + Math.sin(t * 6.5) * 0.12; }
    if (fo) { fo.rotation.z = -t * 0.8; fo.scale.setScalar(1 + Math.sin(t * 4.2 - 0.8) * 0.08); }
  } else if (g.name === 'lightning') {
    const orbs = g.getObjectByName('orbs');
    const pts: THREE.Vector3[] = [];
    orbs?.children.forEach((w, i) => {
      const a = t * 2.55 + i * (TAU / 3);
      const rad = 0.84 + Math.sin(t * 6.5 + i * 2.4) * 0.06;
      const y = 1.08 + Math.sin(t * 3.8 + i * 2.09) * 0.26;
      w.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      pts.push(w.position);
      const snap = Math.floor(t * 18 + i * 3);
      const core = w.getObjectByName('core');
      if (core) core.rotation.set(t * 6 + i, t * 8, 0);
      const ringA = w.getObjectByName('ringA');
      if (ringA) ringA.rotation.set(snap * 1.1 + i, t * 7, snap * 0.7);
      const ringB = w.getObjectByName('ringB');
      if (ringB) ringB.rotation.set(-snap * 0.9, -t * 6 + i, snap * 1.3);
      const flare = w.getObjectByName('flare') as THREE.Sprite | undefined;
      if (flare) flare.scale.setScalar(0.46 + (Math.sin(t * 28 + i * 4.1) > 0.2 ? 0.22 : 0));
    });
    const arcs = g.getObjectByName('arcs');
    if (arcs && pts.length === 3) {
      const tick = Math.floor(t * 22);
      arcs.children.forEach((obj, i) => {
        const line = obj as THREE.Line;
        const pos = line.geometry.attributes.position as THREE.BufferAttribute;
        const p0 = pts[i], p1 = pts[(i + 1) % 3];
        for (let s = 0; s < 9; s++) {
          const u = s / 8;
          const env = Math.sin(u * Math.PI);
          const jx = env * Math.sin(tick * 13.7 + i * 5.3 + s * 4.1) * 0.16;
          const jy = env * Math.cos(tick * 17.3 + i * 3.7 + s * 5.9) * 0.16;
          const jz = env * Math.sin(tick * 11.1 + i * 7.1 + s * 3.3) * 0.16;
          pos.setXYZ(s, p0.x + (p1.x - p0.x) * u + jx, p0.y + (p1.y - p0.y) * u + jy, p0.z + (p1.z - p0.z) * u + jz);
        }
        pos.needsUpdate = true;
      });
    }
    const br = g.getObjectByName('boltRing') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    const bo = g.getObjectByName('boltOuter') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (br) { br.rotation.z = t * 2.8; br.material.opacity = 0.35 + (Math.sin(t * 24) > 0 ? 0.28 : 0.05); }
    if (bo) { bo.rotation.z = -t * 1.9; bo.scale.setScalar(1 + Math.sin(t * 12) * 0.05); }
  } else if (g.name === 'wind') {
    const orbs = g.getObjectByName('orbs');
    orbs?.children.forEach((w, i) => {
      const a = t * 1.85 + i * (TAU / 3);
      const rad = 0.88 + Math.sin(t * 2.1 + i * 2.09) * 0.08;
      const y = 1.08 + Math.sin(t * 2.4 + i * 2.09) * 0.24;
      w.position.set(Math.sin(a) * rad, y, Math.cos(a) * rad);
      w.rotation.set(Math.cos(t * 2.4 + i * 2.09) * 0.18, a + Math.PI / 2, Math.sin(t * 2.1 + i) * 0.14);
      w.scale.setScalar(0.94 + Math.sin(t * 5.2 + i * 2.1) * 0.08);
      const crystal = w.getObjectByName('crystal');
      if (crystal) { crystal.rotation.y = t * 3.4 + i; crystal.rotation.x = t * 2.1 + i; }
      const ringA = w.getObjectByName('ringA');
      if (ringA) { ringA.rotation.z = t * 4.2 + i; ringA.rotation.x = 0.75 + Math.sin(t * 1.9 + i) * 0.35; }
      const ringB = w.getObjectByName('ringB');
      if (ringB) { ringB.rotation.z = -t * 3.3 + i; ringB.rotation.y = t * 2.4 + i; }
      const blades = w.getObjectByName('blades');
      if (blades) { blades.rotation.y = -t * 5.6 + i; blades.rotation.z = Math.sin(t * 2.8 + i) * 0.28; }
      const flare = w.getObjectByName('flare') as THREE.Sprite | undefined;
      if (flare) flare.scale.setScalar(0.42 + Math.sin(t * 6.5 + i * 1.7) * 0.09);
    });
    const wr = g.getObjectByName('windRing') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    const wo = g.getObjectByName('windOuter') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial> | undefined;
    if (wr) { wr.rotation.z = t * 1.4; wr.scale.setScalar(1 + Math.sin(t * 2.6) * 0.05); wr.material.opacity = 0.28 + Math.sin(t * 2.6) * 0.1; }
    if (wo) { wo.rotation.z = -t * 0.9; wo.scale.setScalar(1 + Math.sin(t * 2.6 - 0.7) * 0.07); }
  } else if (g.name === 'foxfire') g.children.forEach((w, i) => {
    const a = t * 1.6 + i * (TAU / 3);
    w.position.set(Math.sin(a) * 0.85, 1.05 + Math.sin(t * 2.3 + i) * 0.25, Math.cos(a) * 0.85);
    w.rotation.set(0, a + Math.PI / 2, 0);
    w.scale.setScalar(0.9 + Math.sin(t * 7.5 + i * 2) * 0.1);
  });
  else if (g.name === 'neon') {
    const ring = g.getObjectByName('ring')! as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const outer = g.getObjectByName('outer')! as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    const pulse = 1 + Math.sin(t * 2.6) * 0.04;
    ring.scale.setScalar(pulse);
    outer.scale.setScalar(1 + Math.sin(t * 2.6 - 0.6) * 0.08);
    ring.material.opacity = 0.55 + Math.sin(t * 2.6) * 0.18;
    outer.material.opacity = 0.18 + Math.sin(t * 2.6) * 0.08;
  } else {
    const halo = g.getObjectByName('halo')!, disc = g.getObjectByName('disc')!, ring = g.getObjectByName('ring')! as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    for (const o of [halo, disc]) o.position.set(0, 1.78, -0.26);
    halo.rotation.z = t * 0.6;
    ring.rotation.z = t * 0.8; ring.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
    ring.material.opacity = 0.35 + Math.sin(t * 2) * 0.15;
  }
}
