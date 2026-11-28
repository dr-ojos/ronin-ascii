// Japanese Manga / Dark-Fantasy Yokai-Samurai 3D sculpted models, 512px procedural PBR
// textures with real tangent-space normal maps, sumi-e ink outlines, and damped fluid
// animations for all 5 player companions:
//   1. Lobo Guardián      (Ōkami spirit wolf with sacred shimenawa rope & swaying shide talismans)
//   2. León Dorado        (Imperial Komainu/Shishi with flame-swept manga mane & brass temple bell)
//   3. Águila Imperial    (Tengu-Washi raptor with cambered scimitar wings & sumi-e plumage)
//   4. Guerrero Esqueleto (Undead Samurai with curved ribcage, soul-fire core, kabuto & ō-yoroi)
//   5. Gólem de Piedra    (Ancient Niō Temple Colossus with sculpted stone anatomy, halo & 3-hit combo)
import * as THREE from 'three';
import { ACTOR_LAYER } from './ascii';
import { createBeast } from './beasts';
import { earGeo, furLockGeo, getFurTextures, limbGeo, loftMesh, taperTube } from './beast-art';
import {
  braidedSilkPBR, buildTassetPanel, forgedMetalPBR, heightToNormalTex, urushiLacquerPBR
} from './class-armor';
import { mangaFinish } from './manga-art';
import { CLS, M, markCombatFx, shadowTree, tagMat, tagTree } from './materials';
import { mandalaTex } from './vfx-art';

export type CompanionKind = 'lobo' | 'esqueleto' | 'aguila' | 'leon' | 'golem';

export interface CompanionAnimInput {
  moving: number;
  speed: number;
  state: 'idle' | 'windup' | 'strike' | 'dive';
  turnRate?: number;
  attackStyle?: number;
  attackProg?: number;
  /** 0 = walking, 1 = full sprint (matched to player sprint / catch-up speed) */
  sprinting?: number;
}

export interface CompanionModel {
  root: THREE.Group;
  ring: THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
  hpBarGroup: THREE.Group;
  hpFill: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;
  hpBarY: number;
  update(dt: number, o: CompanionAnimInput): void;
  setFlash(v: number): void;
  setHpFrac(frac: number): void;
  dispose(): void;
}

const damp = THREE.MathUtils.damp;
const h2 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function withWhiteColors(g: THREE.BufferGeometry) {
  const c = new Float32Array(g.attributes.position.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// ============================================================ Shared Manga Ink Outline Material
const INK_OUTLINE_MAT = tagMat(new THREE.MeshBasicMaterial({
  color: 0x090b12,
  side: THREE.BackSide,
  depthWrite: true,
}), CLS.actor);

/** Adds crisp Japanese manga sumi-e ink contour shells to sculpted meshes (skipping tiny FX/eyes). */
function addMangaInkOutlines(root: THREE.Object3D, thickness = 1.032) {
  const targets: THREE.Mesh[] = [];
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (!m.isMesh || m.userData.noOutline) return;
    const mat = m.material as THREE.Material;
    if (!mat || (mat as THREE.MeshBasicMaterial).isMeshBasicMaterial) return;
    targets.push(m);
  });
  for (const m of targets) {
    const shell = new THREE.Mesh(m.geometry, INK_OUTLINE_MAT);
    shell.scale.setScalar(thickness);
    shell.castShadow = false;
    shell.receiveShadow = false;
    shell.userData.noOutline = true;
    shell.layers.enable(ACTOR_LAYER);
    m.add(shell);
  }
}

// ============================================================ High-Res Procedural PBR Texture Cache
interface PbrSet { map: THREE.CanvasTexture; normal: THREE.CanvasTexture }
const pbrCache = new Map<string, PbrSet>();

function makePbrSet(
  key: string,
  size: number,
  normalStrength: number,
  draw: (ac: CanvasRenderingContext2D, hc: CanvasRenderingContext2D, s: number) => void
): PbrSet {
  const hit = pbrCache.get(key);
  if (hit) return hit;

  const aCan = document.createElement('canvas'); aCan.width = aCan.height = size;
  const hCan = document.createElement('canvas'); hCan.width = hCan.height = size;
  draw(aCan.getContext('2d')!, hCan.getContext('2d')!, size);

  const map = new THREE.CanvasTexture(aCan);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  map.needsUpdate = true;

  const normal = heightToNormalTex(hCan, normalStrength, true);
  const set = { map, normal };
  pbrCache.set(key, set);
  return set;
}

/** 512px Weathered sandstone / desert limestone with deep tectonic fracture cracks (faithful to reference). */
function getSandstoneGolemPBR(): PbrSet {
  return makePbrSet('golem-sandstone-v1', 512, 3.6, (ac, hc, s) => {
    // Warm sun-baked travertine / sandstone base
    ac.fillStyle = '#c8ac7d'; ac.fillRect(0, 0, s, s);
    hc.fillStyle = '#888888'; hc.fillRect(0, 0, s, s);

    // Broad warm ochre / dusty shadow mottling & stone weathering
    for (let i = 0; i < 4200; i++) {
      const x = h2(i * 3.1) * s, y = h2(i * 7.3) * s;
      const rx = 1.4 + h2(i * 11.7) * 10.5, ry = 1.1 + h2(i * 13.9) * 6.0;
      const t = h2(i * 5.9);
      const r = Math.floor(156 + t * 76);
      const g = Math.floor(132 + t * 68);
      const b = Math.floor(92 + t * 52);
      ac.fillStyle = `rgba(${r},${g},${b},0.24)`;
      ac.beginPath(); ac.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); ac.fill();
      const bv = Math.floor(72 + t * 114);
      hc.fillStyle = `rgba(${bv},${bv},${bv},0.30)`;
      hc.beginPath(); hc.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); hc.fill();
    }

    // Fine rocky pitting & porous limestone dimples
    for (let i = 0; i < 950; i++) {
      const x = h2(i * 29.3) * s, y = h2(i * 37.1) * s, r = 0.8 + h2(i * 13.1) * 2.6;
      ac.fillStyle = 'rgba(72,56,36,0.34)';
      ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
      hc.fillStyle = 'rgba(34,34,34,0.65)';
      hc.beginPath(); hc.arc(x, y, r, 0, Math.PI * 2); hc.fill();
    }

    // Subtle weathered grey-olive moss & mineral stains in pockets (like the reference shoulders/knees)
    for (let m = 0; m < 26; m++) {
      const x = h2(m * 53.3) * s, y = h2(m * 61.1) * s, r = 8 + h2(m * 17.9) * 22;
      const g = ac.createRadialGradient(x, y, 1, x, y, r);
      const moss = m % 3 === 0;
      g.addColorStop(0, moss ? 'rgba(88,104,64,0.34)' : 'rgba(92,84,74,0.28)');
      g.addColorStop(1, 'rgba(88,104,64,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
    }

    // Signature deep dark tectonic fracture web crisscrossing the stone body!
    for (let c = 0; c < 38; c++) {
      let x = h2(c * 19.1) * s, y = h2(c * 23.7) * s;
      const w = 1.6 + h2(c * 4.3) * 2.6;
      // Subtle light sandstone bevel along crack lip
      ac.strokeStyle = 'rgba(238,218,176,0.38)'; ac.lineWidth = w + 2.4;
      ac.beginPath(); ac.moveTo(x + 1.5, y + 1.5);
      const pts: [number, number][] = [[x, y]];
      for (let k = 0; k < 7; k++) {
        x += (h2(c * 31 + k * 7) - 0.5) * 64;
        y += (h2(c * 41 + k * 13) - 0.5) * 64;
        pts.push([x, y]);
        ac.lineTo(x + 1.5, y + 1.5);
      }
      ac.stroke();

      // Deep dark charcoal fissure line
      ac.strokeStyle = 'rgba(24,19,14,0.88)'; ac.lineWidth = w;
      hc.strokeStyle = '#080808'; hc.lineWidth = w + 1.4;
      ac.beginPath(); hc.beginPath();
      ac.moveTo(pts[0][0], pts[0][1]); hc.moveTo(pts[0][0], pts[0][1]);
      for (let k = 1; k < pts.length; k++) {
        ac.lineTo(pts[k][0], pts[k][1]);
        hc.lineTo(pts[k][0], pts[k][1]);
      }
      ac.stroke(); hc.stroke();
    }
  });
}

/** 256px Patinated antique temple bronze with verdigris recesses & rivets. */
function getMangaBronzePBR(): PbrSet {
  return makePbrSet('manga-bronze', 256, 2.2, (ac, hc, s) => {
    ac.fillStyle = '#9a773c'; ac.fillRect(0, 0, s, s);
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, s, s);
    for (let i = 0; i < 360; i++) {
      const y = h2(i * 11.3) * s;
      ac.strokeStyle = h2(i * 3.1) > 0.5 ? 'rgba(240,206,126,0.16)' : 'rgba(42,26,12,0.20)';
      ac.lineWidth = 1.2; ac.beginPath(); ac.moveTo(0, y); ac.lineTo(s, y); ac.stroke();
    }
    for (let i = 0; i < 28; i++) {
      const x = h2(i * 29.7) * s, y = h2(i * 41.3) * s, r = 6 + h2(i * 9.1) * 16;
      const g = ac.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(66,154,122,0.36)'); g.addColorStop(1, 'rgba(66,154,122,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
    }
    for (let i = 0; i < 8; i++) {
      const rx = (i + 0.5) * (s / 8);
      for (const ry of [28, 228]) {
        ac.fillStyle = '#d8b264'; ac.beginPath(); ac.arc(rx, ry, 5, 0, Math.PI * 2); ac.fill();
        hc.fillStyle = '#ececec'; hc.beginPath(); hc.arc(rx, ry, 5, 0, Math.PI * 2); hc.fill();
      }
    }
  });
}

/** 512px Aged ivory bone with ink striations & anatomical shading. */
function getMangaBonePBR(): PbrSet {
  return makePbrSet('manga-bone', 512, 2.0, (ac, hc, s) => {
    ac.fillStyle = '#ece3d0'; ac.fillRect(0, 0, s, s);
    hc.fillStyle = '#848484'; hc.fillRect(0, 0, s, s);
    for (let i = 0; i < 650; i++) {
      const x = h2(i * 9.7) * s, y = h2(i * 13.3) * s, len = 24 + h2(i * 21.1) * 80;
      const light = h2(i * 4.7) > 0.48;
      ac.strokeStyle = light ? 'rgba(255,252,244,0.28)' : 'rgba(110,94,74,0.26)';
      ac.lineWidth = 1.4; ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x + (h2(i) - 0.5) * 4, y + len); ac.stroke();
      hc.strokeStyle = light ? 'rgba(176,176,176,0.34)' : 'rgba(84,84,84,0.34)';
      hc.beginPath(); hc.moveTo(x, y); hc.lineTo(x, y + len); hc.stroke();
    }
    for (let i = 0; i < 40; i++) {
      const x = h2(i * 37.3) * s, y = h2(i * 43.1) * s, r = 8 + h2(i * 11.1) * 22;
      const g = ac.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(96,82,64,0.28)'); g.addColorStop(1, 'rgba(96,82,64,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
    }
  });
}

/** 512px Sumi-e illustrated raptor plumage (overlapping bronze-chestnut scalloped feathers). */
function getMangaFeatherPBR(): PbrSet {
  return makePbrSet('manga-feather', 512, 2.8, (ac, hc, s) => {
    ac.fillStyle = '#482a16'; ac.fillRect(0, 0, s, s);
    hc.fillStyle = '#686868'; hc.fillRect(0, 0, s, s);
    const cols = 8, rows = 10, cw = s / cols, rh = s / rows;
    for (let r = -1; r <= rows; r++) {
      for (let c = -1; c <= cols; c++) {
        const cx = (c + (r % 2 === 0 ? 0 : 0.5)) * cw;
        const cy = r * rh;
        const jit = (h2(r * 19 + c * 7) - 0.5) * 18;
        const g = ac.createLinearGradient(cx, cy - rh, cx, cy + rh * 0.92);
        g.addColorStop(0, `rgb(${44 + jit},${24 + jit * 0.5},${14 + jit * 0.3})`);
        g.addColorStop(0.65, `rgb(${98 + jit},${58 + jit * 0.6},${28 + jit * 0.4})`);
        g.addColorStop(0.92, `rgb(${188 + jit},${138 + jit * 0.6},${76 + jit * 0.4})`);
        g.addColorStop(1, '#120b06');
        ac.fillStyle = g;
        ac.beginPath(); ac.ellipse(cx, cy, cw * 0.58, rh * 0.90, 0, 0, Math.PI * 2); ac.fill();
        // Bold manga ink outline on each feather scallop
        ac.strokeStyle = 'rgba(14,8,4,0.75)'; ac.lineWidth = 2.0; ac.stroke();
        // Golden central rachis quill line
        ac.strokeStyle = 'rgba(235,194,126,0.42)'; ac.lineWidth = 1.6;
        ac.beginPath(); ac.moveTo(cx, cy - rh * 0.72); ac.lineTo(cx, cy + rh * 0.78); ac.stroke();

        const bg = hc.createLinearGradient(cx, cy - rh, cx, cy + rh * 0.9);
        bg.addColorStop(0, '#444444'); bg.addColorStop(0.65, '#c4c4c4'); bg.addColorStop(1, '#f0f0f0');
        hc.fillStyle = bg;
        hc.beginPath(); hc.ellipse(cx, cy, cw * 0.55, rh * 0.86, 0, 0, Math.PI * 2); hc.fill();
        hc.strokeStyle = '#242424'; hc.lineWidth = 2.0; hc.stroke();
      }
    }
  });
}

/** Extruded zigzag Japanese paper shide talisman geometry. */
function makeShideGeo(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.025, 0); s.lineTo(0.025, 0); s.lineTo(0.032, -0.07);
  s.lineTo(-0.008, -0.07); s.lineTo(0.026, -0.14); s.lineTo(-0.024, -0.14);
  s.lineTo(0.012, -0.22); s.lineTo(-0.038, -0.22); s.lineTo(-0.012, -0.13);
  s.lineTo(-0.036, -0.13); s.lineTo(-0.014, -0.06); s.lineTo(-0.025, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: false });
  g.computeVertexNormals();
  return g;
}
const SHIDE_GEO = makeShideGeo();

// ============================================================ Shared Primitives & Finalizer
const SPHERE = withWhiteColors(new THREE.SphereGeometry(1, 16, 12));
const CONE = withWhiteColors(new THREE.ConeGeometry(1, 1, 8));
const OCTA = withWhiteColors(new THREE.OctahedronGeometry(1, 0));
const DODECA = withWhiteColors(new THREE.DodecahedronGeometry(1, 1));
const SEAL_GEO = new THREE.PlaneGeometry(2, 2);
const HP_BG_GEO = new THREE.PlaneGeometry(1.22, 0.13);
const HP_FILL_GEO = new THREE.PlaneGeometry(1.14, 0.08);
HP_FILL_GEO.translate(0.57, 0, 0);

function addMesh(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  parent.add(m);
  return m;
}

function part(parent: THREE.Object3D, geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.scale.set(sx, sy, sz);
  parent.add(m);
  return m;
}

function finalizeCompanionRoot(root: THREE.Group, color: number, hpBarY: number, ringScale = 0.95, inkThickness = 1.032) {
  addMangaInkOutlines(root, inkThickness);
  shadowTree(root);
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.layers.enable(ACTOR_LAYER);
  });
  tagTree(root, CLS.actor);

  const ringMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color, transparent: true, opacity: 0.44,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const ring = new THREE.Mesh(SEAL_GEO, ringMat);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.06;
  ring.scale.setScalar(ringScale);
  markCombatFx(ring);
  root.add(ring);

  const hpBarGroup = new THREE.Group();
  hpBarGroup.position.y = hpBarY;
  const bgMat = tagMat(new THREE.MeshBasicMaterial({
    color: 0x090c14, transparent: true, opacity: 0.82, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
  }), CLS.fx);
  const bg = new THREE.Mesh(HP_BG_GEO, bgMat);
  bg.renderOrder = 20;
  const fillMat = tagMat(new THREE.MeshBasicMaterial({
    color: 0x62f2a8, transparent: true, opacity: 0.96, depthTest: false, depthWrite: false, side: THREE.DoubleSide, toneMapped: false,
  }), CLS.fx);
  const hpFill = new THREE.Mesh(HP_FILL_GEO, fillMat);
  hpFill.position.set(-0.57, 0, 0.004);
  hpFill.renderOrder = 21;
  hpBarGroup.add(bg, hpFill);
  markCombatFx(hpBarGroup);
  root.add(hpBarGroup);

  const setHpFrac = (frac: number) => {
    const f = THREE.MathUtils.clamp(frac, 0, 1);
    hpFill.scale.x = Math.max(0.001, f);
    if (f > 0.55) fillMat.color.setHex(0x62f2a8);
    else if (f > 0.25) fillMat.color.setHex(0xffc957);
    else fillMat.color.setHex(0xff4c4c);
  };

  return { ring, hpBarGroup, hpFill, setHpFrac, disposeUi: () => { ringMat.dispose(); bgMat.dispose(); fillMat.dispose(); } };
}

// ============================================================ 1. LOBO GUARDIÁN (ŌKAMI ESPÍRITU)
const wolfSpiritFlameGeo = taperTube(
  [[0, 0, 0], [0.05, 0.08, -0.14], [0.02, 0.14, -0.34], [-0.02, 0.09, -0.52]],
  0.045, 0.006, 7, 10
);

function buildWolf(color: number): CompanionModel {
  const beast = createBeast({ species: 'wolf', coat: 0xe6effa, trim: 0x5c82b8, eye: 0x6ef4ff, alpha: true });
  const root = new THREE.Group();
  root.add(beast.root);
  beast.ring.visible = false;

  const silk = braidedSilkPBR();
  const crimsonMat = M(0xb82428, { roughness: 0.65, normalMap: silk.normal, roughnessMap: silk.rough });
  const paperMat = M(0xf8f4e8, { roughness: 0.85, side: THREE.DoubleSide });
  const spiritMat = tagMat(new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, toneMapped: false }), CLS.fx);

  // Sacred Japanese Shimenawa braided collar + 3 hanging zigzag Shide paper talismans
  const collarGroup = new THREE.Group();
  collarGroup.position.set(0, 0.95, 0.54);
  beast.root.add(collarGroup);

  const ropeGeo = new THREE.TorusGeometry(0.205, 0.044, 9, 24);
  const rope = new THREE.Mesh(ropeGeo, crimsonMat);
  rope.rotation.x = Math.PI / 2 - 0.34;
  collarGroup.add(rope);

  const spiritTrimGeo = new THREE.TorusGeometry(0.212, 0.014, 6, 24);
  const spiritTrim = new THREE.Mesh(spiritTrimGeo, spiritMat);
  spiritTrim.rotation.x = Math.PI / 2 - 0.34;
  spiritTrim.position.z = 0.025;
  spiritTrim.userData.noOutline = true;
  markCombatFx(spiritTrim);
  collarGroup.add(spiritTrim);

  const shides: THREE.Group[] = [];
  for (const [ax, az, ry] of [[0, 0.19, 0], [-0.15, 0.12, -0.6], [0.15, 0.12, 0.6]] as const) {
    const piv = new THREE.Group();
    piv.position.set(ax, -0.14, az);
    piv.rotation.y = ry;
    collarGroup.add(piv);
    const m = new THREE.Mesh(SHIDE_GEO, paperMat);
    m.userData.noOutline = true;
    piv.add(m);
    shides.push(piv);
  }

  // Twin sweeping Okami spirit-flame ribbons streaming from the wolf's shoulders!
  const flames: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const fl = addMesh(beast.root, wolfSpiritFlameGeo, spiritMat, s * 0.22, 0.96, 0.36, 0.1, s * 0.25, 0);
    fl.scale.x = s;
    fl.userData.noOutline = true;
    markCombatFx(fl);
    flames.push(fl);
  }

  const ui = finalizeCompanionRoot(root, color, 1.72, 1.0, 1.028);
  let t = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 1.72,
    update(dt, o) {
      t += dt * (o.moving > 0.1 ? 8.5 : 3.2);
      beast.update(dt, { moving: o.moving, speed: o.speed, state: o.state === 'dive' ? 'strike' : o.state });
      const swingX = o.moving * 0.52 + Math.sin(t) * (0.12 + o.moving * 0.22);
      const swingZ = THREE.MathUtils.clamp((o.turnRate ?? 0) * 0.16, -0.48, 0.48);
      for (let i = 0; i < shides.length; i++) {
        shides[i].rotation.x = damp(shides[i].rotation.x, swingX + Math.sin(t + i) * 0.08, 12, dt);
        shides[i].rotation.z = damp(shides[i].rotation.z, swingZ, 10, dt);
      }
      for (let i = 0; i < flames.length; i++) {
        flames[i].rotation.x = damp(flames[i].rotation.x, 0.12 + Math.sin(t * 1.4 + i) * 0.16, 10, dt);
      }
    },
    setFlash(v) { beast.setFlash(v); crimsonMat.emissive.setScalar(v); },
    setHpFrac: ui.setHpFrac,
    dispose() {
      beast.dispose?.();
      crimsonMat.dispose(); paperMat.dispose(); spiritMat.dispose();
      ropeGeo.dispose(); spiritTrimGeo.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 2. LEÓN DORADO (SHISHI / KOMAINU MANGA)
const lionGeo = {
  torso: loftMesh([
    { z: -0.78, y: 0.85, rx: 0.15, ryTop: 0.15, ryBot: 0.13, shadeTop: 0.84, shadeSide: 0.98, shadeBot: 0.84 },
    { z: -0.48, y: 0.89, rx: 0.24, ryTop: 0.21, ryBot: 0.18, shadeTop: 0.84, shadeSide: 1.00, shadeBot: 0.88 },
    { z: -0.14, y: 0.86, rx: 0.185, ryTop: 0.185, ryBot: 0.135, botPinch: 0.28, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.94 },
    { z:  0.22, y: 0.93, rx: 0.295, ryTop: 0.265, ryBot: 0.285, square: 0.25, shadeTop: 0.82, shadeSide: 1.00, shadeBot: 0.96 },
    { z:  0.54, y: 0.99, rx: 0.32, ryTop: 0.30, ryBot: 0.28, square: 0.26, shadeTop: 0.80, shadeSide: 0.98, shadeBot: 0.96 },
    { z:  0.72, y: 1.01, rx: 0.20, ryTop: 0.19, ryBot: 0.18, shadeTop: 0.84, shadeSide: 0.98, shadeBot: 1.00 }
  ], 16),
  skull: loftMesh([
    { z: -0.11, y: 0.05, rx: 0.19, ryTop: 0.18, ryBot: 0.14, square: 0.22, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.92 },
    { z:  0.08, y: 0.07, rx: 0.21, ryTop: 0.18, ryBot: 0.13, square: 0.26, shadeTop: 0.84, shadeSide: 1.00, shadeBot: 0.95 },
    { z:  0.25, y: 0.02, rx: 0.145, ryTop: 0.115, ryBot: 0.085, square: 0.18, shadeTop: 0.88, shadeSide: 1.00, shadeBot: 0.96 },
    { z:  0.38, y: 0.01, rx: 0.105, ryTop: 0.084, ryBot: 0.064, square: 0.14, shadeTop: 0.86, shadeSide: 0.98, shadeBot: 0.92 }
  ], 14),
  jaw: loftMesh([
    { z: 0.00, y: 0.00, rx: 0.108, ryTop: 0.034, ryBot: 0.052 },
    { z: 0.18, y: -0.01, rx: 0.084, ryTop: 0.028, ryBot: 0.042 },
    { z: 0.31, y: -0.005, rx: 0.060, ryTop: 0.022, ryBot: 0.028 }
  ], 10),
  ear: earGeo(0.15, 0.135, 0.055, true),
  // Dramatic manga flame-swept curved mane tendrils (Komainu style!)
  flameCurlOuter: taperTube([[0, 0, 0], [0, 0.16, -0.12], [0, 0.34, -0.34], [0, 0.44, -0.58]], 0.115, 0.012, 8, 12),
  flameCurlMid: taperTube([[0, 0, 0], [0, 0.14, -0.06], [0, 0.26, -0.22], [0, 0.30, -0.40]], 0.095, 0.010, 7, 10),
  flameTuft: taperTube([[0, 0, 0], [0, 0.06, -0.14], [0, 0.14, -0.32]], 0.055, 0.008, 6, 8),
  upperFront: limbGeo(0.46, 0.142, 0.112, 0.084, 0.16),
  lowerFront: limbGeo(0.43, 0.080, 0.066, 0.058, 0.06),
  upperBack: limbGeo(0.48, 0.165, 0.118, 0.086, 0.22),
  lowerBack: limbGeo(0.45, 0.080, 0.064, 0.056, 0.08),
  paw: loftMesh([
    { z: -0.06, y: 0.040, rx: 0.070, ryTop: 0.042, ryBot: 0.036 },
    { z:  0.04, y: 0.038, rx: 0.088, ryTop: 0.046, ryBot: 0.038, square: 0.28 },
    { z:  0.16, y: 0.030, rx: 0.074, ryTop: 0.032, ryBot: 0.028 }
  ], 10),
  claw: taperTube([[0, 0, 0], [0, -0.004, 0.036], [0, -0.026, 0.060]], 0.012, 0.002, 5, 5),
  tail: taperTube(
    [[0, 0, 0], [0, 0.06, -0.22], [0, 0.22, -0.46], [0, 0.42, -0.66], [0, 0.56, -0.82]],
    0.042, 0.024, 8, 14
  ),
};

function buildLion(color: number): CompanionModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const neck = new THREE.Group();
  const head = new THREE.Group();
  const jaw = new THREE.Group();
  const tail = new THREE.Group();
  root.add(body);
  body.add(neck, tail);
  neck.add(head);

  const fur = getFurTextures('wolf');
  const silk = braidedSilkPBR();
  const bronze = getMangaBronzePBR();

  const coatMat = M(0xe8ac46, { roughness: 0.80, vertexColors: true, map: fur.map, bumpMap: fur.bump, bumpScale: 0.022 });
  const maneGoldMat = M(0xd8761c, { roughness: 0.84, map: fur.map, bumpMap: fur.bump, bumpScale: 0.026 });
  const maneCrimsonMat = M(0x8c2414, { roughness: 0.86, map: fur.map, bumpMap: fur.bump, bumpScale: 0.028 });
  const ropeMat = M(0xb81e24, { roughness: 0.66, normalMap: silk.normal, roughnessMap: silk.rough });
  const goldMat = M(0xffcf54, { roughness: 0.28, metalness: 0.82, normalMap: bronze.normal });
  const noseMat = M(0x20100e, { roughness: 0.48 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe860, toneMapped: false });
  const ivoryMat = M(0xf8f0dc, { roughness: 0.28 });

  addMesh(body, lionGeo.torso, coatMat);

  // Sacred Komainu braided crimson neck rope + swinging antique brass temple bell!
  const ropeGeo = new THREE.TorusGeometry(0.27, 0.046, 9, 24);
  const neckRope = new THREE.Mesh(ropeGeo, ropeMat);
  neckRope.position.set(0, 0.96, 0.52);
  neckRope.rotation.x = Math.PI / 2 - 0.35;
  body.add(neckRope);

  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, 0.72, 0.66);
  body.add(bellPivot);
  part(bellPivot, SPHERE, goldMat, 0, -0.08, 0, 0.085, 0.085, 0.085);

  // Sweeping manga flame-mane (2 concentric whorls of curved Komainu locks)
  neck.position.set(0, 1.04, 0.58);
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2;
    const mat = i % 2 === 0 ? maneCrimsonMat : maneGoldMat;
    const lock = addMesh(neck, lionGeo.flameCurlOuter, mat, Math.sin(a) * 0.22, Math.cos(a) * 0.22, -0.02, 0, 0, -a);
    lock.rotation.x = -0.18;
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.16;
    addMesh(neck, lionGeo.flameCurlMid, maneGoldMat, Math.sin(a) * 0.16, Math.cos(a) * 0.16, 0.12, -0.08, 0, -a);
  }

  head.position.set(0, 0.08, 0.19);
  addMesh(head, lionGeo.skull, coatMat);
  // Sculpted imperial brow crest
  const crownGeo = taperTube([[-0.14, 0.15, 0.14], [0, 0.21, 0.18], [0.14, 0.15, 0.14]], 0.026, 0.026, 7, 10);
  addMesh(head, crownGeo, goldMat);
  jaw.position.set(0, -0.032, 0.08);
  addMesh(jaw, lionGeo.jaw, coatMat);
  head.add(jaw);
  part(head, SPHERE, noseMat, 0, 0.04, 0.39, 0.056, 0.040, 0.036);
  for (const s of [-1, 1]) {
    addMesh(head, lionGeo.ear, coatMat, s * 0.16, 0.18, -0.02, 0.1, s * 0.25, -s * 0.35);
    // Fierce angled anime slit eyes
    const eye = part(head, SPHERE, eyeMat, s * 0.10, 0.098, 0.19, 0.036, 0.018, 0.022);
    eye.rotation.z = -s * 0.28;
    eye.userData.noOutline = true;
    part(head, CONE, ivoryMat, s * 0.06, -0.024, 0.30, 0.016, 0.068, 0.016).rotation.x = Math.PI;
  }

  // Upward-curling Komainu tail with flame-scroll plume!
  tail.position.set(0, 0.88, -0.75);
  addMesh(tail, lionGeo.tail, coatMat);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    addMesh(tail, lionGeo.flameTuft, i % 2 === 0 ? maneCrimsonMat : maneGoldMat,
      Math.sin(a) * 0.05, 0.56 + Math.cos(a) * 0.04, -0.82, 0.3, a, 0);
  }

  const legs: { joint: THREE.Group; lower: THREE.Group; phase: number; front: boolean; side: number }[] = [];
  const legDefs: [number, number, number, boolean, number, number][] = [
    [-0.23, 0.86,  0.43, true,  0,               -1],
    [ 0.23, 0.86,  0.43, true,  Math.PI,          1],
    [-0.22, 0.86, -0.49, false, Math.PI * 0.85,  -1],
    [ 0.22, 0.86, -0.49, false, -Math.PI * 0.15,  1],
  ];
  for (const [x, y, z, front, phase, side] of legDefs) {
    const joint = new THREE.Group();
    joint.position.set(x, y, z);
    body.add(joint);
    addMesh(joint, front ? lionGeo.upperFront : lionGeo.upperBack, coatMat);
    // Swept Komainu flame tuft on each elbow/hock
    addMesh(joint, lionGeo.flameTuft, maneGoldMat, side * 0.06, -0.34, -0.06, -0.15, side * 0.2, 0).scale.setScalar(0.75);
    const lower = new THREE.Group();
    lower.position.set(0, front ? -0.43 : -0.45, 0);
    joint.add(lower);
    addMesh(lower, front ? lionGeo.lowerFront : lionGeo.lowerBack, coatMat);
    const paw = addMesh(lower, lionGeo.paw, coatMat, 0, front ? -0.43 : -0.45, 0.02);
    for (let c = -1; c <= 1; c++) addMesh(paw, lionGeo.claw, ivoryMat, c * 0.032, 0.024, 0.12);
    legs.push({ joint, lower, phase, front, side });
  }

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 1.96, 1.15, 1.03);
  let phaseT = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 1.96,
    update(dt, o) {
      phaseT += dt * (o.moving > 0.1 ? 3.6 + o.speed * 0.95 : 2.1);
      const stride = o.moving * 0.64;
      const windup = o.state === 'windup';
      const strike = o.state === 'strike';

      for (const l of legs) {
        const s = Math.sin(phaseT + l.phase);
        const targetUpper = windup ? (l.front ? 0.26 : -0.36) : strike ? (l.front ? -0.98 + l.side * 0.14 : 0.46) : s * stride;
        const targetLower = windup ? (l.front ? -0.46 : 0.46) : strike ? (l.front ? 0.16 : -0.24) : Math.max(0, -Math.cos(phaseT + l.phase)) * stride * 0.72;
        l.joint.rotation.x = damp(l.joint.rotation.x, targetUpper, 14, dt);
        l.lower.rotation.x = damp(l.lower.rotation.x, targetLower, 14, dt);
      }

      body.position.y = damp(body.position.y, windup ? -0.11 : strike ? 0.22 : o.moving * Math.abs(Math.sin(phaseT)) * 0.10 + Math.sin(phaseT) * 0.014, 13, dt);
      body.rotation.x = damp(body.rotation.x, windup ? 0.24 : strike ? -0.25 : -o.moving * 0.05, 12, dt);
      body.rotation.z = damp(body.rotation.z, THREE.MathUtils.clamp(-(o.turnRate ?? 0) * 0.09, -0.22, 0.22), 9, dt);
      neck.rotation.x = damp(neck.rotation.x, windup ? -0.26 : strike ? 0.20 : Math.sin(phaseT * 0.5) * 0.04, 12, dt);
      neck.rotation.y = damp(neck.rotation.y, THREE.MathUtils.clamp((o.turnRate ?? 0) * 0.14, -0.35, 0.35), 10, dt);
      jaw.rotation.x = damp(jaw.rotation.x, windup || strike ? 0.62 : 0.06 + Math.sin(phaseT * 0.7) * 0.025, 14, dt);
      tail.rotation.y = damp(tail.rotation.y, Math.sin(phaseT * 0.9) * 0.36 - (o.turnRate ?? 0) * 0.16, 8, dt);
      bellPivot.rotation.x = damp(bellPivot.rotation.x, o.moving * 0.45 + Math.sin(phaseT * 2) * 0.22, 12, dt);
    },
    setFlash(v) {
      for (const m of [coatMat, maneGoldMat, maneCrimsonMat, ropeMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [coatMat, maneGoldMat, maneCrimsonMat, ropeMat, goldMat, noseMat, eyeMat, ivoryMat]) m.dispose();
      ropeGeo.dispose(); crownGeo.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 3. ÁGUILA IMPERIAL (TENGU-WASHI MANGA)
const eagleGeo = {
  body: loftMesh([
    { z: -0.58, y: 0.00, rx: 0.075, ryTop: 0.055, ryBot: 0.052, shadeTop: 0.84, shadeSide: 0.94, shadeBot: 0.82 },
    { z: -0.24, y: 0.02, rx: 0.195, ryTop: 0.155, ryBot: 0.15, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.86 },
    { z:  0.14, y: 0.06, rx: 0.23, ryTop: 0.185, ryBot: 0.195, botPinch: 0.32, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.92 },
    { z:  0.42, y: 0.10, rx: 0.15, ryTop: 0.138, ryBot: 0.128, shadeTop: 0.92, shadeSide: 1.00, shadeBot: 0.94 },
    { z:  0.58, y: 0.14, rx: 0.10, ryTop: 0.10, ryBot: 0.09, shadeTop: 0.96, shadeSide: 1.00, shadeBot: 0.96 }
  ], 16),
  // Sculpted aerodynamic cambered wing airfoil (ZERO flat boxes!)
  wingInnerL: loftMesh([
    { z: -0.18, y: 0.00, rx: 0.38, ryTop: 0.028, ryBot: 0.012 },
    { z:  0.00, y: 0.01, rx: 0.42, ryTop: 0.048, ryBot: 0.022 },
    { z:  0.16, y: 0.00, rx: 0.36, ryTop: 0.032, ryBot: 0.016 },
  ], 10),
  beak: taperTube([[0, 0, 0], [0, 0.005, 0.12], [0, -0.095, 0.22]], 0.060, 0.005, 8, 10),
  crestPlume: taperTube([[0, 0, 0], [0, 0.09, -0.14], [0, 0.12, -0.32]], 0.045, 0.006, 6, 8),
  feather: furLockGeo(0.64, 0.15, 0.028, 0.12),
  primary: furLockGeo(0.90, 0.13, 0.024, 0.20),
  tailFeather: furLockGeo(0.68, 0.14, 0.024, 0.06),
  talon: taperTube([[0, 0, 0], [0, -0.04, 0.05], [0, -0.11, 0.04]], 0.016, 0.003, 5, 6),
};

function buildEagle(color: number): CompanionModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const fPbr = getMangaFeatherPBR();
  const bronze = getMangaBronzePBR();
  const brownMat = M(0x6e4426, { roughness: 0.78, vertexColors: true, map: fPbr.map, normalMap: fPbr.normal });
  const tipMat = M(0x281910, { roughness: 0.84, vertexColors: true, map: fPbr.map, normalMap: fPbr.normal });
  const headMat = M(0xf8f4ec, { roughness: 0.72, vertexColors: true, normalMap: fPbr.normal });
  const goldMat = M(0xf8c238, { roughness: 0.26, metalness: 0.45, normalMap: bronze.normal });
  const crimsonMat = M(0xb82226, { roughness: 0.65 });
  const obsidianMat = M(0x16181e, { roughness: 0.35, metalness: 0.5 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe858, toneMapped: false });

  addMesh(body, eagleGeo.body, brownMat);

  // Fierce Japanese Manga Raptor Head with swept white-gold crest plumes
  const head = new THREE.Group();
  head.position.set(0, 0.16, 0.54);
  body.add(head);
  part(head, SPHERE, headMat, 0, 0.02, 0.04, 0.145, 0.13, 0.17);
  for (let i = -1; i <= 1; i++) {
    const pl = addMesh(head, eagleGeo.crestPlume, i === 0 ? goldMat : headMat, i * 0.065, 0.09, -0.04, 0.05, i * 0.28, 0);
    pl.scale.setScalar(i === 0 ? 1.15 : 0.9);
  }
  addMesh(head, eagleGeo.beak, goldMat, 0, -0.01, 0.16);
  for (const s of [-1, 1]) {
    const eye = part(head, SPHERE, eyeMat, s * 0.092, 0.048, 0.11, 0.032, 0.018, 0.022);
    eye.rotation.z = -s * 0.25;
    eye.userData.noOutline = true;
  }

  // Curved scimitar 3-stage articulated wings (airfoil body + overlapping scalloped feathers)
  const buildWing = (side: number) => {
    const inner = new THREE.Group();
    inner.position.set(side * 0.16, 0.12, 0.12);
    body.add(inner);

    const camber = addMesh(inner, eagleGeo.wingInnerL, brownMat, side * 0.36, 0, 0.02, 0, -side * 0.10, 0);
    camber.scale.set(1.0, 1.0, 1.0);
    for (let i = 0; i < 6; i++) {
      const f = addMesh(inner, eagleGeo.feather, i < 3 ? brownMat : tipMat, side * (0.12 + i * 0.125), -0.01, -0.14, 0, side * 0.08, 0);
      f.rotation.x = Math.PI * 0.5;
      f.rotation.z = side * (0.06 + i * 0.04);
    }

    const outer = new THREE.Group();
    outer.position.set(side * 0.72, 0, -0.04);
    inner.add(outer);
    const outerCamber = addMesh(outer, eagleGeo.wingInnerL, tipMat, side * 0.28, 0, -0.04, 0, -side * 0.20, 0);
    outerCamber.scale.set(0.78, 0.72, 0.74);
    for (let i = 0; i < 7; i++) {
      const p = addMesh(outer, eagleGeo.primary, i % 2 === 0 ? tipMat : brownMat, side * (0.06 + i * 0.115), 0, -0.05 - i * 0.02, 0, 0, 0);
      p.rotation.x = Math.PI * 0.5;
      p.rotation.z = -side * (0.28 + i * 0.16);
    }
    return { inner, outer };
  };
  const wingL = buildWing(-1);
  const wingR = buildWing(1);

  // Layered spreading tail fan
  const tail = new THREE.Group();
  tail.position.set(0, 0.01, -0.52);
  body.add(tail);
  const tailFeathers: { m: THREE.Mesh; idx: number }[] = [];
  for (let i = -2; i <= 2; i++) {
    const tf = addMesh(tail, eagleGeo.tailFeather, Math.abs(i) === 2 ? tipMat : headMat, i * 0.058, 0, -0.04, Math.PI * 0.52, i * 0.20, 0);
    tf.scale.setScalar(0.92);
    tailFeathers.push({ m: tf, idx: i });
  }

  // Feathered legs, crimson shimenawa leg rings & curved obsidian talons
  const talons = new THREE.Group();
  talons.position.set(0, -0.14, 0.08);
  body.add(talons);
  const legRingGeo = new THREE.TorusGeometry(0.036, 0.012, 6, 12);
  for (const s of [-1, 1]) {
    part(talons, SPHERE, brownMat, s * 0.088, -0.02, 0, 0.068, 0.084, 0.068);
    const lr = new THREE.Mesh(legRingGeo, crimsonMat);
    lr.position.set(s * 0.088, -0.09, 0); lr.rotation.x = Math.PI / 2;
    talons.add(lr);
    for (let c = -1; c <= 1; c++) {
      addMesh(talons, eagleGeo.talon, obsidianMat, s * 0.088 + c * 0.028, -0.12, 0.02, 0, c * 0.25, 0);
    }
  }

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 0.92, 0.90, 1.028);
  let flapT = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 0.92,
    update(dt, o) {
      const diving = o.state === 'dive' || o.state === 'strike';
      const climbing = o.state === 'windup';
      flapT += dt * (climbing ? 15.5 : diving ? 12 : 7.2);

      const targetInnerZ = diving ? -0.44 + Math.sin(flapT) * 0.14 : climbing ? Math.sin(flapT) * 0.80 : Math.sin(flapT) * 0.52;
      const targetInnerY = diving ? 0.52 : 0;
      const targetOuterZ = diving ? -0.26 : Math.sin(flapT - 0.75) * (climbing ? 0.58 : 0.42);

      wingL.inner.rotation.z = damp(wingL.inner.rotation.z, -targetInnerZ, 12, dt);
      wingR.inner.rotation.z = damp(wingR.inner.rotation.z, targetInnerZ, 12, dt);
      wingL.inner.rotation.y = damp(wingL.inner.rotation.y, -targetInnerY, 10, dt);
      wingR.inner.rotation.y = damp(wingR.inner.rotation.y, targetInnerY, 10, dt);
      wingL.outer.rotation.z = damp(wingL.outer.rotation.z, -targetOuterZ, 12, dt);
      wingR.outer.rotation.z = damp(wingR.outer.rotation.z, targetOuterZ, 12, dt);

      const targetRoll = THREE.MathUtils.clamp(-(o.turnRate ?? 0) * 0.24, -0.64, 0.64);
      body.rotation.x = damp(body.rotation.x, diving ? 0.54 : climbing ? -0.35 : 0.04, 10, dt);
      body.rotation.z = damp(body.rotation.z, targetRoll, 8, dt);
      body.position.y = damp(body.position.y, Math.sin(flapT) * (diving ? 0.03 : 0.10), 10, dt);
      head.rotation.x = damp(head.rotation.x, -body.rotation.x * 0.55, 10, dt);
      talons.rotation.x = damp(talons.rotation.x, diving ? -0.98 : 0.28, 12, dt);
      tail.rotation.x = damp(tail.rotation.x, diving ? -0.28 : 0.08 + Math.sin(flapT * 0.5) * 0.05, 9, dt);
      const spread = diving ? 0.32 : 0.19;
      for (const tf of tailFeathers) tf.m.rotation.y = damp(tf.m.rotation.y, tf.idx * spread, 9, dt);
    },
    setFlash(v) {
      for (const m of [brownMat, tipMat, headMat, goldMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [brownMat, tipMat, headMat, goldMat, crimsonMat, obsidianMat, eyeMat]) m.dispose();
      legRingGeo.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 4. GUERRERO ESQUELETO (RONIN NO-MUERTO MANGA)
const skelGeo = {
  cranium: loftMesh([
    { z: -0.15, y: 0.08, rx: 0.125, ryTop: 0.135, ryBot: 0.095 },
    { z: -0.02, y: 0.09, rx: 0.158, ryTop: 0.155, ryBot: 0.105 },
    { z:  0.10, y: 0.07, rx: 0.142, ryTop: 0.132, ryBot: 0.090, square: 0.24 }, // cheekbones
    { z:  0.17, y: 0.04, rx: 0.095, ryTop: 0.085, ryBot: 0.068, square: 0.22 }, // maxilla
  ], 14),
  ribL: taperTube([[0, 0, -0.04], [0.14, 0.02, -0.01], [0.17, 0.0, 0.08], [0.06, -0.02, 0.14]], 0.018, 0.012, 6, 10),
  ribR: taperTube([[0, 0, -0.04], [-0.14, 0.02, -0.01], [-0.17, 0.0, 0.08], [-0.06, -0.02, 0.14]], 0.018, 0.012, 6, 10),
  hornL: taperTube([[0, 0, 0], [0.12, 0.10, 0.04], [0.22, 0.28, 0.02], [0.18, 0.42, -0.02]], 0.028, 0.005, 6, 10),
  hornR: taperTube([[0, 0, 0], [-0.12, 0.10, 0.04], [-0.22, 0.28, 0.02], [-0.18, 0.42, -0.02]], 0.028, 0.005, 6, 10),
  boneLimb: limbGeo(0.38, 0.042, 0.028, 0.038, 0.08),
  katanaBlade: taperTube([[0, 0, 0], [0, 0.34, 0.015], [0, 0.72, 0.055], [0, 1.06, 0.115]], 0.026, 0.004, 5, 10),
};

function buildSkeleton(color: number): CompanionModel {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  const torso = new THREE.Group();
  root.add(hips);
  hips.add(torso);

  const bPbr = getMangaBonePBR();
  const metal = forgedMetalPBR();
  const lac = urushiLacquerPBR();
  const silk = braidedSilkPBR();

  const boneMat = M(0xeee5d4, { roughness: 0.58, map: bPbr.map, normalMap: bPbr.normal });
  const darkBoneMat = M(0x9e927f, { roughness: 0.72, map: bPbr.map, normalMap: bPbr.normal });
  const lacquerMat = M(0x1b2232, { roughness: 0.30, metalness: 0.62, normalMap: lac.normal, roughnessMap: lac.rough });
  const steelMat = M(0x465264, { roughness: 0.36, metalness: 0.82, normalMap: metal.normal, roughnessMap: metal.rough });
  const clothMat = M(0x152c3e, { roughness: 0.86, side: THREE.DoubleSide, normalMap: silk.normal, roughnessMap: silk.rough });
  const goldMat = M(0xffcf5c, { roughness: 0.26, metalness: 0.86, normalMap: metal.normal });
  const bladeMat = M(0xe6fcff, { roughness: 0.12, metalness: 0.92, emissive: color, emissiveIntensity: 0.72 });
  const soulMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.92, toneMapped: false });
  const recessMat = M(0x090a0e, { roughness: 0.95 });

  // ---- Pelvis & curved samurai kusazuri tassets + tattered ronin sash
  hips.position.set(0, 0.92, 0);
  part(hips, DODECA, darkBoneMat, 0, 0, 0, 0.19, 0.09, 0.13);
  const tassets: THREE.Mesh[] = [];
  for (let i = 0; i < 4; i++) {
    const th0 = i * (Math.PI / 2) - Math.PI / 4;
    const panel = buildTassetPanel(0.22, 0.28, 0.34, th0, Math.PI * 0.42, 0.06, i % 2 === 0 ? lacquerMat : clothMat);
    panel.position.y = -0.16;
    hips.add(panel);
    tassets.push(panel);
  }

  // ---- Sculpted curved ribcage + vertebral spine + blazing soul flame core!
  torso.position.set(0, 0.06, 0);
  for (let v = 0; v < 5; v++) {
    part(torso, SPHERE, darkBoneMat, 0, 0.08 + v * 0.105, -0.05, 0.044, 0.048, 0.048);
  }
  for (let r = 0; r < 5; r++) {
    const ry = 0.14 + r * 0.088;
    const sc = r === 0 ? 0.80 : r === 4 ? 0.88 : 1.0 + (r === 2 ? 0.08 : 0);
    addMesh(torso, skelGeo.ribL, boneMat, 0, ry, 0).scale.setScalar(sc);
    addMesh(torso, skelGeo.ribR, boneMat, 0, ry, 0).scale.setScalar(sc);
  }
  // Soul-fire core burning inside the ribcage!
  const soulCore = part(torso, OCTA, soulMat, 0, 0.34, 0.03, 0.09, 0.15, 0.08);
  soulCore.userData.noOutline = true;
  // Tattered ronin back cape
  const cape = buildTassetPanel(0.24, 0.36, 0.68, Math.PI * 0.62, Math.PI * 0.76, 0.14, clothMat);
  cape.position.set(0, 0.20, -0.04);
  torso.add(cape);

  // ---- Anatomical Sculpted Skull + Samurai Kabuto Helmet + Sweeping Kuwagata Horns
  const head = new THREE.Group();
  head.position.set(0, 0.66, 0.02);
  torso.add(head);
  addMesh(head, skelGeo.cranium, boneMat);
  const jaw = new THREE.Group();
  jaw.position.set(0, -0.02, 0.05);
  head.add(jaw);
  part(jaw, DODECA, boneMat, 0, -0.03, 0.04, 0.095, 0.058, 0.095);
  // Deep recessed eye sockets with fierce glowing anime slit eyes
  for (const s of [-1, 1]) {
    part(head, SPHERE, recessMat, s * 0.058, 0.058, 0.128, 0.038, 0.032, 0.026).userData.noOutline = true;
    const eye = part(head, SPHERE, soulMat, s * 0.058, 0.058, 0.148, 0.028, 0.014, 0.016);
    eye.rotation.z = -s * 0.25;
    eye.userData.noOutline = true;
  }
  const kabutoGeo = new THREE.SphereGeometry(0.19, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.56);
  const kabuto = new THREE.Mesh(kabutoGeo, lacquerMat);
  kabuto.position.y = 0.11;
  head.add(kabuto);
  const shikoro = buildTassetPanel(0.19, 0.27, 0.14, Math.PI * 0.35, Math.PI * 1.3, 0.02, lacquerMat);
  shikoro.position.y = 0.06;
  head.add(shikoro);
  // Sweeping golden Kuwagata samurai horns!
  addMesh(head, skelGeo.hornL, goldMat, 0.02, 0.18, 0.16);
  addMesh(head, skelGeo.hornR, goldMat, -0.02, 0.18, 0.16);

  // ---- Right Arm: Layered curved sode pauldron + anatomical bones + curved manga katana
  const armR = new THREE.Group();
  armR.position.set(-0.28, 0.52, 0);
  torso.add(armR);
  const sodeR = buildTassetPanel(0.13, 0.18, 0.28, -Math.PI * 0.85, Math.PI * 0.72, 0.03, lacquerMat);
  sodeR.position.set(-0.04, -0.02, 0);
  armR.add(sodeR);
  addMesh(armR, skelGeo.boneLimb, boneMat, 0, 0, 0);
  const foreR = new THREE.Group();
  foreR.position.set(0, -0.36, 0);
  armR.add(foreR);
  part(foreR, SPHERE, darkBoneMat, 0, 0, 0, 0.046, 0.046, 0.046);
  addMesh(foreR, skelGeo.boneLimb, boneMat, 0, 0, 0, -0.28, 0, 0).scale.setScalar(0.88);
  const sword = new THREE.Group();
  sword.position.set(0, -0.30, 0.12);
  sword.rotation.x = Math.PI * 0.34;
  foreR.add(sword);
  const tsukaGeo = new THREE.CylinderGeometry(0.020, 0.024, 0.26, 8);
  addMesh(sword, tsukaGeo, clothMat, 0, -0.13, 0);
  const tsubaGeo = new THREE.CylinderGeometry(0.072, 0.072, 0.022, 14);
  addMesh(sword, tsubaGeo, goldMat, 0, 0.01, 0);
  const blade = addMesh(sword, skelGeo.katanaBlade, bladeMat, 0, 0.02, 0);
  blade.scale.set(0.45, 1.0, 1.45);

  // ---- Left Arm: Layered sode + hexagonal samurai buckler with embossed mon crest
  const armL = new THREE.Group();
  armL.position.set(0.28, 0.52, 0);
  torso.add(armL);
  const sodeL = buildTassetPanel(0.13, 0.18, 0.28, Math.PI * 0.13, Math.PI * 0.72, 0.03, lacquerMat);
  sodeL.position.set(0.04, -0.02, 0);
  armL.add(sodeL);
  addMesh(armL, skelGeo.boneLimb, boneMat, 0, 0, 0);
  const foreL = new THREE.Group();
  foreL.position.set(0, -0.36, 0);
  armL.add(foreL);
  addMesh(foreL, skelGeo.boneLimb, boneMat, 0, 0, 0, -0.45, 0, 0).scale.setScalar(0.88);
  const shield = new THREE.Group();
  shield.position.set(0.09, -0.22, 0.18);
  shield.rotation.y = 0.44;
  foreL.add(shield);
  const shieldGeo = new THREE.CylinderGeometry(0.32, 0.32, 0.055, 6);
  const shieldDisc = addMesh(shield, shieldGeo, steelMat, 0, 0, 0, Math.PI / 2, 0, 0);
  const rimGeo = new THREE.TorusGeometry(0.31, 0.026, 7, 6);
  addMesh(shield, rimGeo, goldMat);
  part(shield, OCTA, soulMat, 0, 0, 0.04, 0.08, 0.08, 0.04).userData.noOutline = true;

  // ---- Articulated 2-segment legs with armored shin greaves
  const makeLeg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.13, -0.04, 0);
    hips.add(hip);
    addMesh(hip, skelGeo.boneLimb, boneMat, 0, 0, 0).scale.set(1.05, 1.12, 1.05);
    const knee = new THREE.Group();
    knee.position.set(0, -0.42, 0);
    hip.add(knee);
    part(knee, SPHERE, steelMat, 0, 0, 0.03, 0.068, 0.065, 0.065);
    addMesh(knee, skelGeo.boneLimb, boneMat, 0, 0, 0).scale.set(0.95, 1.08, 0.95);
    const greave = buildTassetPanel(0.072, 0.058, 0.30, -Math.PI * 0.42, Math.PI * 0.84, 0.02, lacquerMat);
    greave.position.y = -0.22;
    knee.add(greave);
    part(knee, DODECA, darkBoneMat, 0, -0.42, 0.06, 0.07, 0.045, 0.12);
    return { hip, knee };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 2.38, 0.95, 1.032);
  let walkT = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 2.38,
    update(dt, o) {
      walkT += dt * (o.moving > 0.1 ? 3.9 + o.speed * 1.1 : 2.1);
      const sw = Math.sin(walkT) * o.moving * 0.68;
      const windup = o.state === 'windup';
      const strike = o.state === 'strike';

      legL.hip.rotation.x = damp(legL.hip.rotation.x, sw, 14, dt);
      legR.hip.rotation.x = damp(legR.hip.rotation.x, -sw, 14, dt);
      legL.knee.rotation.x = damp(legL.knee.rotation.x, Math.max(0, -Math.cos(walkT)) * o.moving * 0.75, 14, dt);
      legR.knee.rotation.x = damp(legR.knee.rotation.x, Math.max(0, Math.cos(walkT)) * o.moving * 0.75, 14, dt);

      hips.position.y = damp(hips.position.y, 0.92 + Math.abs(Math.sin(walkT)) * o.moving * 0.08 + Math.sin(walkT) * 0.015, 13, dt);
      torso.rotation.y = damp(torso.rotation.y, windup ? -0.62 : strike ? 0.72 : sw * 0.24, 15, dt);
      torso.rotation.x = damp(torso.rotation.x, windup ? -0.14 : strike ? 0.24 : o.moving * 0.14, 13, dt);

      armR.rotation.x = damp(armR.rotation.x, windup ? -2.35 : strike ? 0.72 : -0.45 - sw * 0.55, 16, dt);
      armR.rotation.z = damp(armR.rotation.z, windup ? -0.44 : strike ? 0.55 : -0.08, 15, dt);
      foreR.rotation.x = damp(foreR.rotation.x, windup ? -0.58 : strike ? 0.26 : -0.22, 15, dt);

      armL.rotation.x = damp(armL.rotation.x, windup ? -0.68 : strike ? -0.98 : -0.38 + sw * 0.35, 13, dt);
      armL.rotation.y = damp(armL.rotation.y, strike ? -0.38 : 0, 12, dt);

      head.rotation.y = damp(head.rotation.y, -torso.rotation.y * 0.65 + Math.sin(walkT * 0.4) * 0.08, 12, dt);
      jaw.rotation.x = damp(jaw.rotation.x, windup || strike ? 0.32 : 0.04, 12, dt);
      cape.rotation.x = damp(cape.rotation.x, o.moving * 0.38 + (strike ? 0.28 : 0) + Math.sin(walkT * 1.6) * 0.08, 9, dt);
      soulCore.rotation.y += dt * 2.8;
      const pulse = 1 + Math.sin(walkT * 2.5) * 0.12;
      soulCore.scale.set(0.09 * pulse, 0.15 * pulse, 0.08 * pulse);
      void shieldDisc; void tassets;
    },
    setFlash(v) {
      for (const m of [boneMat, darkBoneMat, lacquerMat, steelMat, clothMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [boneMat, darkBoneMat, lacquerMat, steelMat, clothMat, goldMat, bladeMat, soulMat, recessMat]) m.dispose();
      kabutoGeo.dispose(); tsukaGeo.dispose(); tsubaGeo.dispose(); shieldGeo.dispose(); rimGeo.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 5. GÓLEM DE PIEDRA (SANDSTONE BRUTE - REFERENCE FAITHFUL)
const golemGeo = {
  // Massive hunched muscular rock torso with huge trapezius & barrel ribcage
  chest: loftMesh([
    { z: -0.46, y: 0.44, rx: 0.56, ryTop: 0.52, ryBot: 0.28, square: 0.24, shadeTop: 0.94, shadeSide: 0.96, shadeBot: 0.72 },
    { z: -0.16, y: 0.56, rx: 0.88, ryTop: 0.66, ryBot: 0.36, square: 0.30, shadeTop: 1.00, shadeSide: 1.00, shadeBot: 0.74 },
    { z:  0.16, y: 0.54, rx: 0.90, ryTop: 0.62, ryBot: 0.36, square: 0.32, shadeTop: 0.98, shadeSide: 1.00, shadeBot: 0.76 },
    { z:  0.42, y: 0.46, rx: 0.64, ryTop: 0.44, ryBot: 0.30, square: 0.28, shadeTop: 0.94, shadeSide: 0.96, shadeBot: 0.80 },
  ], 16),
  // Thick muscular stone waist & pelvis
  waist: loftMesh([
    { z: -0.30, y: 0.14, rx: 0.42, ryTop: 0.20, ryBot: 0.16, square: 0.22 },
    { z:  0.00, y: 0.14, rx: 0.52, ryTop: 0.24, ryBot: 0.19, square: 0.26 },
    { z:  0.28, y: 0.14, rx: 0.42, ryTop: 0.20, ryBot: 0.16, square: 0.22 },
  ], 14),
  // Massive brute limbs (long heavy gorilla-like arms & thick rocky legs)
  bicep: limbGeo(0.56, 0.27, 0.24, 0.21, 0.16),
  forearm: limbGeo(0.58, 0.24, 0.29, 0.23, 0.14),
  thigh: limbGeo(0.54, 0.30, 0.26, 0.21, 0.18),
  calf: limbGeo(0.46, 0.22, 0.26, 0.21, 0.14),
  // Bald craggy brute head (sits forward & low between huge traps, just like reference!)
  head: loftMesh([
    { z: -0.22, y: 0.16, rx: 0.22, ryTop: 0.23, ryBot: 0.16, square: 0.14, shadeTop: 1.00, shadeSide: 0.96, shadeBot: 0.78 },
    { z:  0.00, y: 0.17, rx: 0.26, ryTop: 0.26, ryBot: 0.19, square: 0.18, shadeTop: 1.00, shadeSide: 0.98, shadeBot: 0.80 },
    { z:  0.18, y: 0.14, rx: 0.24, ryTop: 0.21, ryBot: 0.17, square: 0.26, shadeTop: 0.96, shadeSide: 0.98, shadeBot: 0.82 },
    { z:  0.29, y: 0.10, rx: 0.18, ryTop: 0.13, ryBot: 0.13, square: 0.24, shadeTop: 0.92, shadeSide: 0.95, shadeBot: 0.84 },
  ], 16),
  // Huge bare rocky foot with arched instep
  foot: loftMesh([
    { z: -0.20, y: 0.00, rx: 0.21, ryTop: 0.12, ryBot: 0.06, square: 0.26 },
    { z:  0.06, y: 0.00, rx: 0.27, ryTop: 0.13, ryBot: 0.06, square: 0.30 },
    { z:  0.26, y: -0.02, rx: 0.26, ryTop: 0.09, ryBot: 0.05, square: 0.28 },
  ], 12),
  // Thick curled rocky finger & stone toe
  finger: taperTube([[0, 0, 0], [0, -0.14, 0.05], [0, -0.26, 0.01], [0, -0.34, -0.07]], 0.062, 0.044, 7, 8),
  thumb: taperTube([[0, 0, 0], [0, -0.10, 0.08], [0, -0.22, 0.10]], 0.068, 0.048, 7, 7),
  toe: taperTube([[0, 0, 0], [0, -0.01, 0.09], [0, -0.03, 0.16]], 0.048, 0.034, 6, 6),
};

function buildGolem(color: number): CompanionModel {
  const root = new THREE.Group();
  const hips = new THREE.Group();
  const waist = new THREE.Group();
  const chest = new THREE.Group();
  root.add(hips);
  hips.add(waist);
  waist.add(chest);

  const rock = getSandstoneGolemPBR();
  const stoneMat = M(0xd2b889, {
    roughness: 0.88, metalness: 0.04, vertexColors: true,
    map: rock.map, normalMap: rock.normal,
  });
  const darkRockMat = M(0x9a825c, {
    roughness: 0.92, metalness: 0.05,
    map: rock.map, normalMap: rock.normal,
  });
  const creviceMat = M(0x3a2f22, { roughness: 0.96 });
  const teethMat = M(0xf0e4c8, { roughness: 0.55 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xfff4c2, toneMapped: false });

  // ---- Muscular stone pelvis & glutes
  hips.position.set(0, 0.98, 0);
  addMesh(hips, golemGeo.waist, stoneMat, 0, -0.06, 0).scale.set(1.16, 1.25, 1.15);
  part(hips, DODECA, darkRockMat, 0, -0.16, 0.10, 0.24, 0.22, 0.24); // groin/pelvic stone mass

  // ---- Thick lower waist & sculpted abdominal rock slabs
  waist.position.set(0, 0.16, 0);
  addMesh(waist, golemGeo.waist, stoneMat, 0, 0, 0).scale.set(1.06, 1.15, 1.05);
  for (let row = 0; row < 2; row++) {
    for (const s of [-1, 1]) {
      part(waist, DODECA, stoneMat, s * 0.16, 0.06 + row * 0.18, 0.28, 0.17, 0.12, 0.14);
    }
  }

  // ---- Massive hunched brute chest, high trapezius ridge & pectoral rock slabs
  chest.position.set(0, 0.26, 0);
  addMesh(chest, golemGeo.chest, stoneMat);
  // Towering hunched trapezius boulders flanking the head (signature Hulk/Golem silhouette!)
  for (const s of [-1, 1]) {
    part(chest, DODECA, stoneMat, s * 0.44, 0.94, -0.06, 0.44, 0.34, 0.42);
    // Thick bulging pectoral slabs
    const pec = part(chest, DODECA, stoneMat, s * 0.36, 0.54, 0.38, 0.36, 0.26, 0.24);
    pec.rotation.y = -s * 0.20;
    // Lat flanks
    part(chest, DODECA, darkRockMat, s * 0.58, 0.38, -0.02, 0.28, 0.34, 0.32);
  }
  part(chest, DODECA, stoneMat, 0, 0.98, -0.22, 0.50, 0.30, 0.38); // hunched upper back crown

  // ---- Low-set, forward-thrust bald stone head (grimacing mouth + glowing white-gold eyes)
  const neck = new THREE.Group();
  neck.position.set(0, 0.78, 0.30);
  chest.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 0.08, 0.12);
  neck.add(head);
  addMesh(head, golemGeo.head, stoneMat);
  // Heavy furrowed overhanging brow ridge
  part(head, DODECA, stoneMat, 0, 0.23, 0.22, 0.23, 0.085, 0.14);
  // Broad sculpted stone nose
  part(head, DODECA, stoneMat, 0, 0.12, 0.29, 0.075, 0.068, 0.078);
  // Deep-set glowing white-gold eyes under the brow
  for (const s of [-1, 1]) {
    part(head, SPHERE, creviceMat, s * 0.085, 0.18, 0.245, 0.052, 0.030, 0.028).userData.noOutline = true;
    const eye = part(head, SPHERE, eyeMat, s * 0.085, 0.18, 0.268, 0.032, 0.017, 0.018);
    eye.rotation.z = -s * 0.22;
    eye.userData.noOutline = true;
  }
  // Articulated heavy square stone jaw + clenched gritted teeth grimace!
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.04, 0.08);
  head.add(jaw);
  part(jaw, DODECA, stoneMat, 0, -0.04, 0.12, 0.22, 0.10, 0.17);
  // Grimacing clenched teeth strip recessed between lips
  const teeth = part(jaw, DODECA, teethMat, 0, 0.015, 0.235, 0.135, 0.028, 0.04);
  teeth.userData.noOutline = true;

  // ---- Massive Gorilla-Proportioned Arms (huge boulder deltoids + long forearms + giant curled rocky hands)
  const makeArm = (sx: number) => {
    const clavicle = new THREE.Group();
    clavicle.position.set(sx * 0.88, 0.74, 0.02);
    chest.add(clavicle);

    // Huge segmented rounded rock deltoid
    part(clavicle, DODECA, stoneMat, sx * 0.08, 0.08, 0, 0.46, 0.42, 0.44);
    part(clavicle, DODECA, darkRockMat, sx * 0.18, -0.14, 0.04, 0.34, 0.28, 0.34);

    const upper = new THREE.Group();
    upper.position.set(sx * 0.20, -0.12, 0);
    clavicle.add(upper);
    addMesh(upper, golemGeo.bicep, stoneMat);
    part(upper, DODECA, darkRockMat, sx * 0.06, -0.32, 0.04, 0.28, 0.26, 0.28);

    const fore = new THREE.Group();
    fore.position.set(0, -0.54, 0);
    upper.add(fore);
    addMesh(fore, golemGeo.forearm, stoneMat);
    part(fore, DODECA, stoneMat, sx * 0.06, -0.26, 0.04, 0.32, 0.30, 0.32);

    const wrist = new THREE.Group();
    wrist.position.set(0, -0.58, 0.04);
    fore.add(wrist);
    // Colossal rocky palm / back of hand
    part(wrist, DODECA, stoneMat, 0, -0.12, 0.04, 0.30, 0.25, 0.24);

    // 4 thick curled stone fingers + opposing thumb (just like reference!)
    const fingers = new THREE.Group();
    fingers.position.set(0, -0.24, 0.08);
    wrist.add(fingers);
    for (let k = 0; k < 4; k++) {
      const f = addMesh(fingers, golemGeo.finger, stoneMat, (k - 1.5) * 0.115, 0, 0, 0, 0, (k - 1.5) * 0.06);
      f.scale.setScalar(k === 1 || k === 2 ? 1.06 : 0.94);
    }
    const thumb = addMesh(wrist, golemGeo.thumb, stoneMat, -sx * 0.22, -0.16, 0.14, 0.18, sx * 0.35, sx * 0.55);
    thumb.scale.setScalar(1.08);

    return { clavicle, upper, fore, wrist, fingers };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ---- Thick Muscular Bent-Knee Rock Legs & Wide 5-Toed Bare Stone Feet
  const makeLeg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.40, -0.06, 0);
    hips.add(hip);
    addMesh(hip, golemGeo.thigh, stoneMat);
    part(hip, DODECA, stoneMat, sx * 0.04, -0.24, 0.08, 0.32, 0.28, 0.30); // bulky quad slab
    part(hip, DODECA, darkRockMat, 0, -0.48, 0.14, 0.24, 0.20, 0.20);      // craggy kneecap

    const shin = new THREE.Group();
    shin.position.set(0, -0.52, 0);
    hip.add(shin);
    addMesh(shin, golemGeo.calf, stoneMat);
    part(shin, DODECA, darkRockMat, 0, -0.24, -0.08, 0.26, 0.26, 0.24);    // bulky calf rock

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.44, 0.04);
    shin.add(ankle);
    addMesh(ankle, golemGeo.foot, stoneMat);
    // 5 individual sculpted stone toes!
    for (let t = 0; t < 5; t++) {
      const tx = (t - 2) * 0.092;
      const toe = addMesh(ankle, golemGeo.toe, stoneMat, tx, -0.03, 0.22);
      toe.scale.setScalar(t === 0 || t === 4 ? 0.88 : 1.05);
    }
    return { hip, shin, ankle };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 3.05, 1.52, 1.028);
  let stompT = 0;
  let moveBlend = 0;
  let sprintBlend = 0;

  const easeOutCubic = (x: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(x, 0, 1), 3);
  const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp(x, 0, 1));

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 3.05,
    update(dt, o) {
      moveBlend = damp(moveBlend, o.moving, 8.5, dt);
      sprintBlend = damp(sprintBlend, (o.sprinting ?? 0) * o.moving, 7.5, dt);
      // Stride cadence scales directly with actual ground speed so feet match travel velocity!
      const cadence = 1.65 + moveBlend * (1.35 + o.speed * 0.62);
      stompT += dt * cadence;

      const windup = o.state === 'windup';
      const strike = o.state === 'strike';
      const style = (o.attackStyle ?? 0) % 4; // 0=right hook, 1=left uppercut, 2=brute charge, 3=leaping earth slam
      const p = THREE.MathUtils.clamp(o.attackProg ?? 0.5, 0, 1);

      // Speed-scaled stride amplitude: heavy stomp at walk -> explosive pumping brute sprint when running!
      const strideAmp = (0.48 + sprintBlend * 0.42) * moveBlend;
      const kneeAmp = (0.58 + sprintBlend * 0.52) * moveBlend;
      const phL = stompT, phR = stompT + Math.PI;
      const walkHipL = Math.sin(phL) * strideAmp;
      const walkHipR = Math.sin(phR) * strideAmp;
      const walkKneeL = 0.22 * (1 - moveBlend) + Math.max(0, -Math.cos(phL)) * kneeAmp;
      const walkKneeR = 0.22 * (1 - moveBlend) + Math.max(0, -Math.cos(phR)) * kneeAmp;
      const walkAnkleL = -walkHipL * 0.55 - walkKneeL * 0.42;
      const walkAnkleR = -walkHipR * 0.55 - walkKneeR * 0.42;

      // Natural hunched brute idle/walk/sprint baseline (just like the reference stance!)
      let hipsY = 0.96 + Math.abs(Math.sin(stompT)) * (0.09 + sprintBlend * 0.11) * moveBlend + Math.sin(stompT * 1.1) * 0.018 * (1 - moveBlend);
      let hipsX = -Math.sin(stompT) * (0.07 + sprintBlend * 0.04) * moveBlend;
      let hipsRoll = Math.sin(stompT) * (0.08 + sprintBlend * 0.06) * moveBlend + THREE.MathUtils.clamp(-(o.turnRate ?? 0) * 0.06, -0.18, 0.18);
      let hipsPitch = 0.10 + 0.08 * moveBlend + 0.18 * sprintBlend;

      let waistYaw = Math.sin(stompT) * (0.14 + sprintBlend * 0.14) * moveBlend;
      let waistPitch = 0.08 + 0.10 * sprintBlend;
      let chestYaw = Math.sin(stompT) * (0.18 + sprintBlend * 0.16) * moveBlend;
      let chestPitch = 0.10 + 0.12 * sprintBlend + Math.sin(stompT * 1.1) * 0.022 * (1 - moveBlend);

      let clavLY = 0, clavRY = 0, clavLZ = 0, clavRZ = 0;
      const armSwing = 0.68 + sprintBlend * 0.55;
      let armLX = -walkHipL * armSwing - 0.14 - sprintBlend * 0.28, armLZ = 0.16 + sprintBlend * 0.08, foreLX = -0.38 - sprintBlend * 0.48 - Math.max(0, walkHipL) * 0.35, wristLX = 0;
      let armRX = -walkHipR * armSwing - 0.14 - sprintBlend * 0.28, armRZ = -0.16 - sprintBlend * 0.08, foreRX = -0.38 - sprintBlend * 0.48 - Math.max(0, walkHipR) * 0.35, wristRX = 0;
      let fingerCurlL = 0.42 + sprintBlend * 0.5, fingerCurlR = 0.42 + sprintBlend * 0.5;
      let legHipL = walkHipL - 0.10 * (1 - moveBlend), legHipR = walkHipR - 0.10 * (1 - moveBlend);
      let legKneeL = walkKneeL, legKneeR = walkKneeR;
      let legAnkleL = walkAnkleL, legAnkleR = walkAnkleR;
      let jawOpen = 0.02;

      if (windup) {
        const e = easeOutCubic(p);
        fingerCurlL = 1.25; fingerCurlR = 1.25; jawOpen = 0.24 * e;
        if (style === 0) {
          // Move 0: Right Heavy Haymaker coil
          hipsY = 0.96 - 0.16 * e; hipsPitch = 0.18 * e; hipsRoll = -0.16 * e;
          waistYaw = -0.42 * e; chestYaw = -0.62 * e; chestPitch = 0.16 * e;
          clavRZ = -0.24 * e; clavLZ = 0.16 * e;
          armRX = 0.72 * e; armRZ = -0.98 * e; foreRX = -1.12 * e; wristRX = 0.25 * e;
          armLX = -1.10 * e; armLZ = 0.42 * e; foreLX = -0.72 * e;
          legHipL = -0.36 * e; legKneeL = 0.48 * e; legHipR = 0.34 * e; legKneeR = 0.32 * e;
        } else if (style === 1) {
          // Move 1: Left Crushing Uppercut coil
          hipsY = 0.96 - 0.22 * e; hipsPitch = 0.26 * e; hipsRoll = 0.18 * e;
          waistYaw = 0.40 * e; chestYaw = 0.56 * e; chestPitch = 0.26 * e;
          clavLZ = 0.26 * e; clavRZ = -0.16 * e;
          armLX = 0.82 * e; armLZ = 0.74 * e; foreLX = -1.24 * e; wristLX = 0.30 * e;
          armRX = -1.18 * e; armRZ = -0.40 * e; foreRX = -0.58 * e;
          legHipL = 0.36 * e; legKneeL = 0.40 * e; legHipR = -0.38 * e; legKneeR = 0.48 * e;
        } else if (style === 2) {
          // Move 2: Brute Double-Arm Charge Lunge coil (hunch low like a battering ram!)
          hipsY = 0.96 - 0.22 * e; hipsPitch = 0.36 * e;
          waistPitch = 0.18 * e; chestPitch = 0.26 * e;
          clavLZ = 0.20 * e; clavRZ = -0.20 * e;
          armLX = 0.95 * e; armLZ = 0.52 * e; foreLX = -1.05 * e;
          armRX = 0.95 * e; armRZ = -0.52 * e; foreRX = -1.05 * e;
          legHipL = -0.42 * e; legKneeL = 0.56 * e; legHipR = 0.36 * e; legKneeR = 0.42 * e;
          jawOpen = 0.34 * e;
        } else {
          // Move 3: Leaping Colossal Ground Smash (leaps up into the air raising both boulders!)
          const leap = Math.sin(p * Math.PI * 0.65) * 0.58;
          hipsY = 0.96 + leap; hipsPitch = -0.14 * e;
          waistPitch = -0.18 * e; chestPitch = -0.30 * e;
          clavLY = 0.16 * e; clavRY = 0.16 * e; clavLZ = 0.28 * e; clavRZ = -0.28 * e;
          armLX = -2.90 * e; armLZ = -0.22 * e; foreLX = -0.45 * e;
          armRX = -2.90 * e; armRZ = 0.22 * e; foreRX = -0.45 * e;
          legHipL = -0.36 * e; legKneeL = 0.62 * e; legHipR = -0.36 * e; legKneeR = 0.62 * e;
          jawOpen = 0.42 * e;
        }
      } else if (strike) {
        const snap = p < 0.36 ? easeOutCubic(p / 0.36) : 1 - 0.20 * easeInOutSine((p - 0.36) / 0.64);
        fingerCurlL = 1.32; fingerCurlR = 1.32; jawOpen = 0.32 * (1 - p * 0.6);
        if (style === 0) {
          hipsY = 0.96 - 0.08 * snap; hipsRoll = 0.20 * snap; hipsPitch = 0.18 * snap;
          waistYaw = 0.46 * snap; chestYaw = 0.68 * snap; chestPitch = 0.24 * snap;
          clavRY = 0.08 * snap; clavRZ = 0.24 * snap;
          armRX = -1.58 * snap; armRZ = 0.92 * snap; foreRX = -0.18 * snap; wristRX = -0.22 * snap;
          armLX = 0.62 * snap; armLZ = 0.30 * snap; foreLX = -0.66 * snap;
          legHipL = 0.38 * snap; legKneeL = 0.24 * snap; legHipR = -0.34 * snap; legKneeR = 0.46 * snap;
        } else if (style === 1) {
          hipsY = 0.96 + 0.12 * snap; hipsRoll = -0.20 * snap; hipsPitch = -0.08 * snap;
          waistYaw = -0.46 * snap; chestYaw = -0.60 * snap; chestPitch = -0.16 * snap;
          clavLY = 0.16 * snap; clavLZ = -0.20 * snap;
          armLX = -2.42 * snap; armLZ = -0.36 * snap; foreLX = -0.14 * snap; wristLX = -0.25 * snap;
          armRX = 0.60 * snap; armRZ = -0.28 * snap; foreRX = -0.64 * snap;
          legHipL = -0.32 * snap; legKneeL = 0.40 * snap; legHipR = 0.36 * snap; legKneeR = 0.22 * snap;
        } else if (style === 2) {
          // Double-arm crushing clap/ram smash forward!
          hipsY = 0.96 - 0.12 * snap; hipsPitch = 0.30 * snap;
          waistPitch = 0.16 * snap; chestPitch = 0.28 * snap;
          armLX = -1.65 * snap; armLZ = -0.52 * snap; foreLX = -0.25 * snap;
          armRX = -1.65 * snap; armRZ = 0.52 * snap; foreRX = -0.25 * snap;
          legHipL = 0.42 * snap; legKneeL = 0.26 * snap; legHipR = -0.38 * snap; legKneeR = 0.52 * snap;
        } else {
          // Crashing earth-shattering ground smash!
          hipsY = 0.96 - 0.28 * snap; hipsPitch = 0.28 * snap;
          waistPitch = 0.28 * snap; chestPitch = 0.40 * snap;
          clavLY = -0.12 * snap; clavRY = -0.12 * snap; clavLZ = -0.18 * snap; clavRZ = 0.18 * snap;
          armLX = 0.88 * snap; armLZ = -0.18 * snap; foreLX = -0.10 * snap;
          armRX = 0.88 * snap; armRZ = 0.18 * snap; foreRX = -0.10 * snap;
          legHipL = -0.42 * snap; legKneeL = 0.68 * snap; legHipR = -0.42 * snap; legKneeR = 0.68 * snap;
          jawOpen = 0.46 * (1 - p * 0.5);
        }
      }

      const kBody = strike ? 24 : windup ? 16 : 11;
      const kArm = strike ? 28 : windup ? 17 : 12;

      hips.position.y = damp(hips.position.y, hipsY, kBody, dt);
      hips.position.x = damp(hips.position.x, hipsX, 11, dt);
      hips.rotation.z = damp(hips.rotation.z, hipsRoll, kBody, dt);
      hips.rotation.x = damp(hips.rotation.x, hipsPitch, kBody, dt);

      waist.rotation.y = damp(waist.rotation.y, waistYaw, kBody, dt);
      waist.rotation.x = damp(waist.rotation.x, waistPitch, kBody, dt);
      chest.rotation.y = damp(chest.rotation.y, chestYaw, kBody, dt);
      chest.rotation.x = damp(chest.rotation.x, chestPitch, kBody, dt);

      armL.clavicle.position.y = damp(armL.clavicle.position.y, 0.74 + clavLY, kArm, dt);
      armR.clavicle.position.y = damp(armR.clavicle.position.y, 0.74 + clavRY, kArm, dt);
      armL.clavicle.rotation.z = damp(armL.clavicle.rotation.z, clavLZ, kArm, dt);
      armR.clavicle.rotation.z = damp(armR.clavicle.rotation.z, clavRZ, kArm, dt);

      armL.upper.rotation.x = damp(armL.upper.rotation.x, armLX, kArm, dt);
      armL.upper.rotation.z = damp(armL.upper.rotation.z, armLZ, kArm, dt);
      armL.fore.rotation.x = damp(armL.fore.rotation.x, foreLX, kArm, dt);
      armL.wrist.rotation.x = damp(armL.wrist.rotation.x, wristLX, kArm, dt);
      armL.fingers.rotation.x = damp(armL.fingers.rotation.x, -fingerCurlL, 14, dt);

      armR.upper.rotation.x = damp(armR.upper.rotation.x, armRX, kArm, dt);
      armR.upper.rotation.z = damp(armR.upper.rotation.z, armRZ, kArm, dt);
      armR.fore.rotation.x = damp(armR.fore.rotation.x, foreRX, kArm, dt);
      armR.wrist.rotation.x = damp(armR.wrist.rotation.x, wristRX, kArm, dt);
      armR.fingers.rotation.x = damp(armR.fingers.rotation.x, -fingerCurlR, 14, dt);

      legL.hip.rotation.x = damp(legL.hip.rotation.x, legHipL, kBody, dt);
      legL.shin.rotation.x = damp(legL.shin.rotation.x, legKneeL, kBody, dt);
      legL.ankle.rotation.x = damp(legL.ankle.rotation.x, legAnkleL, kBody, dt);

      legR.hip.rotation.x = damp(legR.hip.rotation.x, legHipR, kBody, dt);
      legR.shin.rotation.x = damp(legR.shin.rotation.x, legKneeR, kBody, dt);
      legR.ankle.rotation.x = damp(legR.ankle.rotation.x, legAnkleR, kBody, dt);

      // Head counters hunched torso pitch & swing twist to glare straight ahead!
      const totalTwist = waist.rotation.y + chest.rotation.y;
      const totalPitch = hips.rotation.x + waist.rotation.x + chest.rotation.x;
      neck.rotation.y = damp(neck.rotation.y, -totalTwist * 0.45, 13, dt);
      head.rotation.y = damp(head.rotation.y, -totalTwist * 0.35 + Math.sin(stompT * 0.35) * 0.05 * (1 - moveBlend), 13, dt);
      head.rotation.x = damp(head.rotation.x, -totalPitch * 0.72, 12, dt);
      jaw.rotation.x = damp(jaw.rotation.x, jawOpen, 14, dt);
    },
    setFlash(v) {
      for (const m of [stoneMat, darkRockMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [stoneMat, darkRockMat, creviceMat, teethMat, eyeMat]) m.dispose();
      ui.disposeUi();
    },
  };
}

export function createCompanionModel(kind: CompanionKind, color: number): CompanionModel {
  if (kind === 'lobo') return buildWolf(color);
  if (kind === 'leon') return buildLion(color);
  if (kind === 'aguila') return buildEagle(color);
  if (kind === 'esqueleto') return buildSkeleton(color);
  return buildGolem(color);
}
