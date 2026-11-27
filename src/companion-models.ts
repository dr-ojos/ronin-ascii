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

/** 512px Sumi-e carved temple basalt with chiseled bevels, ink cracks & lichen. */
function getMangaStonePBR(): PbrSet {
  return makePbrSet('manga-stone', 512, 3.2, (ac, hc, s) => {
    ac.fillStyle = '#474f59'; ac.fillRect(0, 0, s, s);
    hc.fillStyle = '#808080'; hc.fillRect(0, 0, s, s);

    // Painterly granite mottling & mineral grain
    for (let i = 0; i < 3600; i++) {
      const x = h2(i * 3.1) * s, y = h2(i * 7.3) * s;
      const rx = 1.6 + h2(i * 11.7) * 9, ry = 1.2 + h2(i * 13.9) * 5;
      const v = Math.floor(46 + h2(i * 5.9) * 68);
      ac.fillStyle = `rgba(${v},${v + 6},${v + 14},0.26)`;
      ac.beginPath(); ac.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); ac.fill();
      const bv = Math.floor(72 + h2(i * 5.9) * 110);
      hc.fillStyle = `rgba(${bv},${bv},${bv},0.32)`;
      hc.beginPath(); hc.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); hc.fill();
    }
    // Crisp Japanese ink cross-hatching strokes in shadowed strata
    ac.strokeStyle = 'rgba(12,15,22,0.22)'; ac.lineWidth = 1.2;
    for (let i = 0; i < 240; i++) {
      const x = h2(i * 17.3) * s, y = h2(i * 23.1) * s, len = 14 + h2(i * 5.3) * 32;
      ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x + len * 0.7, y + len); ac.stroke();
    }
    // Chiseled temple relief grooves
    for (let r = 0; r < 4; r++) {
      const y = (r + 0.5) * (s / 4);
      ac.strokeStyle = 'rgba(12,15,20,0.72)'; ac.lineWidth = 3.2;
      hc.strokeStyle = '#141414'; hc.lineWidth = 4.4;
      ac.beginPath(); ac.moveTo(0, y); ac.lineTo(s, y); ac.stroke();
      hc.beginPath(); hc.moveTo(0, y); hc.lineTo(s, y); hc.stroke();
      ac.strokeStyle = 'rgba(190,206,224,0.28)'; ac.lineWidth = 1.8;
      hc.strokeStyle = '#e0e0e0'; hc.lineWidth = 2.4;
      ac.beginPath(); ac.moveTo(0, y + 3); ac.lineTo(s, y + 3); ac.stroke();
      hc.beginPath(); hc.moveTo(0, y + 3); hc.lineTo(s, y + 3); hc.stroke();
    }
    // Deep sumi-e stone fractures
    for (let c = 0; c < 26; c++) {
      let x = h2(c * 19.1) * s, y = h2(c * 23.7) * s;
      ac.strokeStyle = 'rgba(10,12,18,0.82)'; ac.lineWidth = 1.5 + h2(c * 4.3) * 2.2;
      hc.strokeStyle = '#0c0c0c'; hc.lineWidth = ac.lineWidth + 1.0;
      ac.beginPath(); hc.beginPath(); ac.moveTo(x, y); hc.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (h2(c * 31 + k * 7) - 0.5) * 62;
        y += (h2(c * 41 + k * 13) - 0.5) * 62;
        ac.lineTo(x, y); hc.lineTo(x, y);
      }
      ac.stroke(); hc.stroke();
    }
    // Subtle moss pockets
    for (let m = 0; m < 36; m++) {
      const x = h2(m * 53.3) * s, y = h2(m * 61.1) * s, r = 10 + h2(m * 17.9) * 26;
      const g = ac.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(54,118,52,0.44)');
      g.addColorStop(1, 'rgba(54,118,52,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
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

/** 256px Rich mossy stone overgrowth. */
function getMangaMossPBR(): PbrSet {
  return makePbrSet('manga-moss', 256, 2.4, (ac, hc, s) => {
    ac.fillStyle = '#2d572a'; ac.fillRect(0, 0, s, s);
    hc.fillStyle = '#6c6c6c'; hc.fillRect(0, 0, s, s);
    for (let i = 0; i < 2200; i++) {
      const x = h2(i * 4.7) * s, y = h2(i * 9.3) * s, r = 1.3 + h2(i * 15.1) * 4.2;
      const g = Math.floor(76 + h2(i * 6.3) * 84);
      ac.fillStyle = `rgba(${Math.floor(g * 0.46)},${g},${Math.floor(g * 0.38)},0.52)`;
      ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
      const bv = Math.floor(70 + h2(i * 6.3) * 145);
      hc.fillStyle = `rgba(${bv},${bv},${bv},0.48)`;
      hc.beginPath(); hc.arc(x, y, r, 0, Math.PI * 2); hc.fill();
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

/** 512px Glowing Japanese temple seal / kanji-inspired runic emissive map. */
let cachedRuneTex: THREE.CanvasTexture | null = null;
function getRuneEmissiveTex(): THREE.CanvasTexture {
  if (cachedRuneTex) return cachedRuneTex;
  const s = 512;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 14;
  for (let row = 0; row < 2; row++) {
    const y = 128 + row * 256;
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, y - 46); ctx.lineTo(s, y - 46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y + 46); ctx.lineTo(s, y + 46); ctx.stroke();
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const cx = 64 + i * 128;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(cx, y - 40); ctx.lineTo(cx + 30, y); ctx.lineTo(cx, y + 40); ctx.lineTo(cx - 30, y); ctx.closePath();
      ctx.stroke();
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(cx, y - 22); ctx.lineTo(cx, y + 22);
      ctx.moveTo(cx - 16, y - 10); ctx.lineTo(cx + 16, y - 10);
      ctx.moveTo(cx - 16, y + 10); ctx.lineTo(cx + 16, y + 10);
      ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  cachedRuneTex = map;
  return map;
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

// ============================================================ 5. GÓLEM DE PIEDRA (COLOSO NIŌ MANGA)
const golemGeo = {
  // Sculpted muscular Niō Temple-Guardian stone torso (NO crude boxes!)
  chest: loftMesh([
    { z: -0.44, y: 0.42, rx: 0.56, ryTop: 0.44, ryBot: 0.28, square: 0.30, shadeTop: 0.88, shadeSide: 0.96, shadeBot: 0.70 },
    { z: -0.18, y: 0.50, rx: 0.84, ryTop: 0.56, ryBot: 0.36, square: 0.36, shadeTop: 0.94, shadeSide: 1.00, shadeBot: 0.72 },
    { z:  0.16, y: 0.53, rx: 0.88, ryTop: 0.58, ryBot: 0.36, square: 0.38, shadeTop: 0.96, shadeSide: 1.00, shadeBot: 0.74 },
    { z:  0.42, y: 0.48, rx: 0.64, ryTop: 0.46, ryBot: 0.30, square: 0.34, shadeTop: 0.92, shadeSide: 0.98, shadeBot: 0.78 },
  ], 14),
  waist: loftMesh([
    { z: -0.28, y: 0.12, rx: 0.36, ryTop: 0.16, ryBot: 0.14, square: 0.25 },
    { z:  0.00, y: 0.12, rx: 0.46, ryTop: 0.18, ryBot: 0.16, square: 0.28 },
    { z:  0.26, y: 0.12, rx: 0.38, ryTop: 0.16, ryBot: 0.14, square: 0.25 },
  ], 12),
  // Sculpted anatomical stone upper arm & muscular thigh
  stoneArm: limbGeo(0.50, 0.22, 0.19, 0.17, 0.12),
  stoneThigh: limbGeo(0.50, 0.25, 0.22, 0.18, 0.14),
  stoneShin: limbGeo(0.42, 0.20, 0.22, 0.19, 0.12),
  // Tapered beveled gauntlet forearm
  gauntlet: loftMesh([
    { z: -0.24, y: 0, rx: 0.22, ryTop: 0.22, ryBot: 0.22, square: 0.36 },
    { z:  0.02, y: 0, rx: 0.33, ryTop: 0.33, ryBot: 0.33, square: 0.42 },
    { z:  0.26, y: 0, rx: 0.29, ryTop: 0.29, ryBot: 0.29, square: 0.38 },
  ], 10),
  // Sculpted Niō / Hannya stone guardian face
  head: loftMesh([
    { z: -0.24, y: 0.14, rx: 0.24, ryTop: 0.24, ryBot: 0.18, square: 0.22 },
    { z:  0.00, y: 0.15, rx: 0.32, ryTop: 0.29, ryBot: 0.21, square: 0.28 },
    { z:  0.22, y: 0.14, rx: 0.28, ryTop: 0.24, ryBot: 0.17, square: 0.34 },
    { z:  0.32, y: 0.12, rx: 0.18, ryTop: 0.15, ryBot: 0.12, square: 0.26 },
  ], 14),
  hornL: taperTube([[0, 0, 0], [0.12, 0.14, -0.02], [0.18, 0.32, -0.10]], 0.085, 0.016, 7, 10),
  hornR: taperTube([[0, 0, 0], [-0.12, 0.14, -0.02], [-0.18, 0.32, -0.10]], 0.085, 0.016, 7, 10),
  foot: loftMesh([
    { z: -0.18, y: 0.00, rx: 0.19, ryTop: 0.10, ryBot: 0.06, square: 0.30 },
    { z:  0.06, y: 0.00, rx: 0.23, ryTop: 0.11, ryBot: 0.06, square: 0.34 },
    { z:  0.28, y: -0.01, rx: 0.21, ryTop: 0.08, ryBot: 0.05, square: 0.32 },
  ], 10),
  finger: limbGeo(0.20, 0.052, 0.044, 0.036, 0.06),
};

function buildGolem(color: number): CompanionModel {
  const root = new THREE.Group();
  // Full 12-joint articulated skeletal hierarchy
  const hips = new THREE.Group();
  const waist = new THREE.Group();
  const chest = new THREE.Group();
  root.add(hips);
  hips.add(waist);
  waist.add(chest);

  const sPbr = getMangaStonePBR();
  const bPbr = getMangaBronzePBR();
  const mPbr = getMangaMossPBR();
  const rTex = getRuneEmissiveTex();
  const runeCol = new THREE.Color(color);

  const stoneMat = M(0x7c8692, {
    roughness: 0.84, metalness: 0.08, flatShading: true, vertexColors: true,
    map: sPbr.map, normalMap: sPbr.normal,
  });
  const darkStoneMat = M(0x363e48, {
    roughness: 0.90, metalness: 0.12, flatShading: true,
    map: sPbr.map, normalMap: sPbr.normal,
  });
  const runeStoneMat = M(0x4a5662, {
    roughness: 0.78, metalness: 0.16, flatShading: true,
    map: sPbr.map, normalMap: sPbr.normal,
    emissive: runeCol, emissiveMap: rTex, emissiveIntensity: 1.45,
  });
  const bronzeMat = M(0xa27e42, {
    roughness: 0.32, metalness: 0.86,
    map: bPbr.map, normalMap: bPbr.normal,
  });
  const mossMat = M(0x3f7238, {
    roughness: 0.92, flatShading: true,
    map: mPbr.map, normalMap: mPbr.normal,
  });
  const jointGlowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.86, toneMapped: false });
  const runeMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const coreHotMat = new THREE.MeshBasicMaterial({ color: 0xeafff4, toneMapped: false });

  // ---- Pelvis, bronze shimenawa belt & curved carved stone kusazuri tassets
  hips.position.set(0, 1.02, 0);
  addMesh(hips, golemGeo.waist, darkStoneMat, 0, -0.06, 0).scale.set(1.18, 1.15, 1.12);
  const beltGeo = new THREE.TorusGeometry(0.44, 0.055, 8, 22);
  const belt = addMesh(hips, beltGeo, bronzeMat, 0, 0.12, 0, Math.PI / 2, 0, 0);
  belt.scale.set(1.06, 0.76, 1.0);
  part(hips, OCTA, runeMat, 0, 0.12, 0.34, 0.10, 0.10, 0.05).userData.noOutline = true;
  part(hips, SPHERE, jointGlowMat, 0, 0.22, 0, 0.28, 0.10, 0.22).userData.noOutline = true;

  const tassetF = new THREE.Group(); tassetF.position.set(0, 0.08, 0.02); hips.add(tassetF);
  tassetF.add(buildTassetPanel(0.36, 0.44, 0.44, -Math.PI * 0.22, Math.PI * 0.44, 0.08, runeStoneMat)).position.y = -0.22;
  const tassetL = new THREE.Group(); tassetL.position.set(0, 0.08, 0); hips.add(tassetL);
  tassetL.add(buildTassetPanel(0.38, 0.48, 0.42, Math.PI * 0.26, Math.PI * 0.46, 0.05, darkStoneMat)).position.y = -0.21;
  const tassetR = new THREE.Group(); tassetR.position.set(0, 0.08, 0); hips.add(tassetR);
  tassetR.add(buildTassetPanel(0.38, 0.48, 0.42, -Math.PI * 0.72, Math.PI * 0.46, 0.05, darkStoneMat)).position.y = -0.21;

  // ---- Lower Waist (2-segment spine)
  waist.position.set(0, 0.18, 0);
  addMesh(waist, golemGeo.waist, darkStoneMat, 0, 0, 0);
  part(waist, SPHERE, jointGlowMat, 0, 0.25, 0, 0.32, 0.10, 0.26).userData.noOutline = true;

  // ---- Sculpted Muscular Niō Upper Chest
  chest.position.set(0, 0.24, 0);
  addMesh(chest, golemGeo.chest, stoneMat);
  for (const s of [-1, 1]) {
    // Sculpted beveled pectoral plates & dorsal stone fins
    const pec = part(chest, DODECA, darkStoneMat, s * 0.35, 0.54, 0.36, 0.26, 0.22, 0.16);
    pec.rotation.y = -s * 0.25;
    const collarTrim = buildTassetPanel(0.54, 0.62, 0.14, s > 0 ? 0.06 : -Math.PI * 0.46, Math.PI * 0.40, 0.02, bronzeMat);
    collarTrim.position.y = 0.78;
    chest.add(collarTrim);
  }
  part(chest, DODECA, mossMat, 0, 0.96, -0.22, 0.46, 0.18, 0.30);

  // Gimbaled Ancient Temple Runic Heart Core
  const coreRingGeo = new THREE.TorusGeometry(0.21, 0.034, 8, 22);
  const coreRingOuter = addMesh(chest, coreRingGeo, bronzeMat, 0, 0.48, 0.50);
  const coreRingInnerGeo = new THREE.TorusGeometry(0.145, 0.016, 6, 18);
  const coreRingInner = addMesh(chest, coreRingInnerGeo, runeMat, 0, 0.48, 0.51);
  coreRingInner.userData.noOutline = true;
  const coreOuter = part(chest, OCTA, runeMat, 0, 0.48, 0.51, 0.14, 0.22, 0.10);
  coreOuter.userData.noOutline = true;
  const coreInner = part(chest, OCTA, coreHotMat, 0, 0.48, 0.52, 0.075, 0.12, 0.06);
  coreInner.userData.noOutline = true;

  // Iconic Floating Temple Halo Ring (Kōhai) + Orbiting Kanji Seal Stones behind the shoulders!
  const haloGroup = new THREE.Group();
  haloGroup.position.set(0, 0.92, -0.44);
  chest.add(haloGroup);
  const haloRingGeo = new THREE.TorusGeometry(0.82, 0.042, 8, 28);
  addMesh(haloGroup, haloRingGeo, bronzeMat);
  const orbitShards: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const sh = part(haloGroup, OCTA, i % 2 === 0 ? runeMat : darkStoneMat, Math.cos(a) * 0.82, Math.sin(a) * 0.82, 0.02, 0.075, 0.14, 0.05);
    sh.rotation.z = a;
    if (i % 2 === 0) sh.userData.noOutline = true;
    orbitShards.push(sh);
  }

  // ---- Articulated Neck, Sculpted Niō / Hannya Stone Head & Articulated Fang Jaw
  const neck = new THREE.Group();
  neck.position.set(0, 0.96, 0.10);
  chest.add(neck);
  part(neck, SPHERE, jointGlowMat, 0, 0.04, 0, 0.18, 0.10, 0.18).userData.noOutline = true;

  const head = new THREE.Group();
  head.position.set(0, 0.10, 0.04);
  neck.add(head);
  addMesh(head, golemGeo.head, darkStoneMat);
  part(head, DODECA, mossMat, 0, 0.36, -0.06, 0.30, 0.13, 0.26);
  addMesh(head, golemGeo.hornL, stoneMat, 0.16, 0.24, 0.02);
  addMesh(head, golemGeo.hornR, stoneMat, -0.16, 0.24, 0.02);
  // Fierce glowing anime slit eyes
  for (const s of [-1, 1]) {
    const eye = part(head, SPHERE, runeMat, s * 0.105, 0.15, 0.29, 0.062, 0.022, 0.024);
    eye.rotation.z = -s * 0.26;
    eye.userData.noOutline = true;
    const pupil = part(head, SPHERE, coreHotMat, s * 0.105, 0.15, 0.305, 0.032, 0.011, 0.015);
    pupil.rotation.z = -s * 0.26;
    pupil.userData.noOutline = true;
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.02, 0.08);
  head.add(jaw);
  part(jaw, DODECA, stoneMat, 0, -0.05, 0.10, 0.18, 0.09, 0.14);
  for (const s of [-1, 1]) {
    part(jaw, CONE, bronzeMat, s * 0.085, 0.01, 0.19, 0.024, 0.08, 0.024); // lower oni stone fangs!
  }

  // ---- Articulated Clavicle/Shoulder + Sculpted 3-Joint Arm + Curling Stone Gauntlet
  const makeArm = (sx: number) => {
    const clavicle = new THREE.Group();
    clavicle.position.set(sx * 0.88, 0.78, 0);
    chest.add(clavicle);

    // Sculpted layered boulder pauldron + curved bronze trim + twin runic crystal spires
    part(clavicle, DODECA, stoneMat, sx * 0.04, 0.10, 0, 0.46, 0.38, 0.46);
    const pauldronRim = buildTassetPanel(0.42, 0.48, 0.12, sx > 0 ? 0.1 : -Math.PI * 0.9, Math.PI * 0.8, 0.02, bronzeMat);
    pauldronRim.position.set(sx * 0.04, -0.08, 0);
    clavicle.add(pauldronRim);
    part(clavicle, DODECA, mossMat, sx * 0.08, 0.32, -0.04, 0.33, 0.16, 0.31);
    const c1 = part(clavicle, OCTA, runeMat, -sx * 0.10, 0.42, -0.04, 0.095, 0.28, 0.095);
    c1.rotation.z = -sx * 0.32; c1.userData.noOutline = true;
    part(clavicle, SPHERE, jointGlowMat, sx * 0.08, -0.10, 0, 0.16, 0.16, 0.16).userData.noOutline = true;

    const upper = new THREE.Group();
    upper.position.set(sx * 0.14, -0.12, 0);
    clavicle.add(upper);
    addMesh(upper, golemGeo.stoneArm, darkStoneMat);
    part(upper, SPHERE, jointGlowMat, 0, -0.50, 0, 0.15, 0.15, 0.15).userData.noOutline = true;

    const fore = new THREE.Group();
    fore.position.set(0, -0.52, 0);
    upper.add(fore);
    const gauntlet = addMesh(fore, golemGeo.gauntlet, runeStoneMat, 0, -0.30, 0.03, Math.PI / 2, 0, 0);
    gauntlet.scale.set(1.24, 1.32, 1.24);
    const cuffGeo = new THREE.TorusGeometry(0.24, 0.036, 7, 16);
    addMesh(fore, cuffGeo, bronzeMat, 0, -0.08, 0.02, Math.PI / 2, 0, 0);
    part(fore, OCTA, runeMat, sx * 0.25, -0.30, 0.10, 0.085, 0.19, 0.075).userData.noOutline = true;

    const wrist = new THREE.Group();
    wrist.position.set(0, -0.54, 0.04);
    fore.add(wrist);
    part(wrist, DODECA, stoneMat, 0, -0.08, 0.04, 0.32, 0.22, 0.30);

    const fingers = new THREE.Group();
    fingers.position.set(0, -0.16, 0.16);
    wrist.add(fingers);
    for (let k = -1; k <= 1; k++) {
      addMesh(fingers, golemGeo.finger, darkStoneMat, k * 0.105, 0, 0);
    }
    const thumb = addMesh(wrist, golemGeo.finger, darkStoneMat, -sx * 0.22, -0.10, 0.10, 0, 0, sx * 0.55);
    thumb.scale.setScalar(0.82);

    return { clavicle, upper, fore, wrist, fingers, cuffGeo };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ---- Full 3-Joint Articulated Sculpted Legs (Hip -> Knee/Shin -> Ankle/Foot)
  const makeLeg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.36, -0.06, 0);
    hips.add(hip);
    part(hip, SPHERE, jointGlowMat, 0, -0.02, 0, 0.15, 0.15, 0.15).userData.noOutline = true;
    addMesh(hip, golemGeo.stoneThigh, darkStoneMat);
    part(hip, DODECA, stoneMat, 0, -0.46, 0.16, 0.22, 0.19, 0.18); // sculpted knee guard
    part(hip, SPHERE, jointGlowMat, 0, -0.50, 0, 0.14, 0.14, 0.14).userData.noOutline = true;

    const shin = new THREE.Group();
    shin.position.set(0, -0.50, 0);
    hip.add(shin);
    addMesh(shin, golemGeo.stoneShin, runeStoneMat);
    part(shin, DODECA, mossMat, 0, -0.06, 0.20, 0.18, 0.10, 0.10);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.42, 0.04);
    shin.add(ankle);
    addMesh(ankle, golemGeo.foot, stoneMat);
    return { hip, shin, ankle };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 3.16, 1.52, 1.032);
  let stompT = 0;
  let moveBlend = 0;

  const easeOutCubic = (x: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(x, 0, 1), 3);
  const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp(x, 0, 1));

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 3.16,
    update(dt, o) {
      moveBlend = damp(moveBlend, o.moving, 7.5, dt);
      stompT += dt * (1.6 + moveBlend * (1.4 + o.speed * 0.78));

      const windup = o.state === 'windup';
      const strike = o.state === 'strike';
      const style = (o.attackStyle ?? 2) % 3;
      const p = THREE.MathUtils.clamp(o.attackProg ?? 0.5, 0, 1);

      const phL = stompT, phR = stompT + Math.PI;
      const walkHipL = Math.sin(phL) * 0.52 * moveBlend;
      const walkHipR = Math.sin(phR) * 0.52 * moveBlend;
      const walkKneeL = Math.max(0, -Math.cos(phL)) * 0.64 * moveBlend;
      const walkKneeR = Math.max(0, -Math.cos(phR)) * 0.64 * moveBlend;
      const walkAnkleL = -walkHipL * 0.55 - walkKneeL * 0.45;
      const walkAnkleR = -walkHipR * 0.55 - walkKneeR * 0.45;

      let hipsY = 1.02 + Math.abs(Math.sin(stompT)) * 0.085 * moveBlend + Math.sin(stompT * 1.1) * 0.018 * (1 - moveBlend);
      let hipsX = -Math.sin(stompT) * 0.065 * moveBlend;
      let hipsRoll = Math.sin(stompT) * 0.075 * moveBlend + THREE.MathUtils.clamp(-(o.turnRate ?? 0) * 0.05, -0.14, 0.14);
      let hipsPitch = 0.05 * moveBlend;

      let waistYaw = Math.sin(stompT) * 0.12 * moveBlend;
      let waistPitch = 0.04 * moveBlend;
      let chestYaw = Math.sin(stompT) * 0.16 * moveBlend;
      let chestPitch = 0.04 * moveBlend + Math.sin(stompT * 1.1) * 0.025 * (1 - moveBlend);

      let clavLY = 0, clavRY = 0, clavLZ = 0, clavRZ = 0;
      let armLX = -walkHipL * 0.72 - 0.12, armLZ = 0.12, foreLX = -0.34 - Math.max(0, walkHipL) * 0.3, wristLX = 0;
      let armRX = -walkHipR * 0.72 - 0.12, armRZ = -0.12, foreRX = -0.34 - Math.max(0, walkHipR) * 0.3, wristRX = 0;
      let fingerCurlL = 0.32, fingerCurlR = 0.32;
      let legHipL = walkHipL, legHipR = walkHipR, legKneeL = walkKneeL, legKneeR = walkKneeR;
      let legAnkleL = walkAnkleL, legAnkleR = walkAnkleR;
      let jawOpen = 0.02;

      if (windup) {
        const e = easeOutCubic(p);
        fingerCurlL = 1.15; fingerCurlR = 1.15; jawOpen = 0.22 * e;
        if (style === 0) {
          hipsY = 1.02 - 0.14 * e; hipsPitch = 0.12 * e; hipsRoll = -0.14 * e;
          waistYaw = -0.38 * e; chestYaw = -0.58 * e; chestPitch = 0.14 * e;
          clavRZ = -0.22 * e; clavLZ = 0.14 * e;
          armRX = 0.65 * e; armRZ = -0.95 * e; foreRX = -1.05 * e; wristRX = 0.25 * e;
          armLX = -1.05 * e; armLZ = 0.40 * e; foreLX = -0.65 * e;
          legHipL = -0.34 * e; legKneeL = 0.42 * e; legAnkleL = -0.08 * e;
          legHipR = 0.32 * e; legKneeR = 0.28 * e; legAnkleR = -0.50 * e;
        } else if (style === 1) {
          hipsY = 1.02 - 0.20 * e; hipsPitch = 0.22 * e; hipsRoll = 0.16 * e;
          waistYaw = 0.36 * e; chestYaw = 0.52 * e; chestPitch = 0.24 * e;
          clavLZ = 0.24 * e; clavRZ = -0.14 * e;
          armLX = 0.78 * e; armLZ = 0.72 * e; foreLX = -1.18 * e; wristLX = 0.30 * e;
          armRX = -1.15 * e; armRZ = -0.38 * e; foreRX = -0.52 * e;
          legHipL = 0.34 * e; legKneeL = 0.36 * e; legAnkleL = -0.52 * e;
          legHipR = -0.36 * e; legKneeR = 0.44 * e; legAnkleR = -0.08 * e;
        } else {
          hipsY = 1.02 + 0.10 * e; hipsPitch = -0.12 * e;
          waistPitch = -0.16 * e; chestPitch = -0.28 * e;
          clavLY = 0.14 * e; clavRY = 0.14 * e; clavLZ = 0.26 * e; clavRZ = -0.26 * e;
          armLX = -2.85 * e; armLZ = -0.24 * e; foreLX = -0.48 * e;
          armRX = -2.85 * e; armRZ = 0.24 * e; foreRX = -0.48 * e;
          legHipL = -0.22 * e; legKneeL = 0.30 * e; legAnkleL = -0.08 * e;
          legHipR = -0.22 * e; legKneeR = 0.30 * e; legAnkleR = -0.08 * e;
          jawOpen = 0.38 * e;
        }
      } else if (strike) {
        const snap = p < 0.38 ? easeOutCubic(p / 0.38) : 1 - 0.18 * easeInOutSine((p - 0.38) / 0.62);
        fingerCurlL = 1.25; fingerCurlR = 1.25; jawOpen = 0.30 * (1 - p * 0.6);
        if (style === 0) {
          hipsY = 1.02 - 0.06 * snap; hipsRoll = 0.18 * snap; hipsPitch = 0.14 * snap;
          waistYaw = 0.44 * snap; chestYaw = 0.64 * snap; chestPitch = 0.20 * snap;
          clavRY = 0.06 * snap; clavRZ = 0.20 * snap;
          armRX = -1.52 * snap; armRZ = 0.88 * snap; foreRX = -0.18 * snap; wristRX = -0.20 * snap;
          armLX = 0.58 * snap; armLZ = 0.28 * snap; foreLX = -0.62 * snap;
          legHipL = 0.36 * snap; legKneeL = 0.22 * snap; legAnkleL = -0.48 * snap;
          legHipR = -0.32 * snap; legKneeR = 0.44 * snap; legAnkleR = -0.12 * snap;
        } else if (style === 1) {
          hipsY = 1.02 + 0.10 * snap; hipsRoll = -0.18 * snap; hipsPitch = -0.10 * snap;
          waistYaw = -0.42 * snap; chestYaw = -0.56 * snap; chestPitch = -0.18 * snap;
          clavLY = 0.14 * snap; clavLZ = -0.18 * snap;
          armLX = -2.35 * snap; armLZ = -0.34 * snap; foreLX = -0.14 * snap; wristLX = -0.25 * snap;
          armRX = 0.56 * snap; armRZ = -0.26 * snap; foreRX = -0.62 * snap;
          legHipL = -0.30 * snap; legKneeL = 0.38 * snap; legAnkleL = -0.10 * snap;
          legHipR = 0.34 * snap; legKneeR = 0.20 * snap; legAnkleR = -0.46 * snap;
        } else {
          hipsY = 1.02 - 0.24 * snap; hipsPitch = 0.22 * snap;
          waistPitch = 0.24 * snap; chestPitch = 0.36 * snap;
          clavLY = -0.10 * snap; clavRY = -0.10 * snap; clavLZ = -0.16 * snap; clavRZ = 0.16 * snap;
          armLX = 0.86 * snap; armLZ = -0.16 * snap; foreLX = -0.12 * snap;
          armRX = 0.86 * snap; armRZ = 0.16 * snap; foreRX = -0.12 * snap;
          legHipL = -0.38 * snap; legKneeL = 0.62 * snap; legAnkleL = -0.22 * snap;
          legHipR = -0.38 * snap; legKneeR = 0.62 * snap; legAnkleR = -0.22 * snap;
          jawOpen = 0.44 * (1 - p * 0.5);
        }
      }

      const kBody = strike ? 22 : windup ? 15 : 10;
      const kArm = strike ? 26 : windup ? 16 : 11;

      hips.position.y = damp(hips.position.y, hipsY, kBody, dt);
      hips.position.x = damp(hips.position.x, hipsX, 10, dt);
      hips.rotation.z = damp(hips.rotation.z, hipsRoll, kBody, dt);
      hips.rotation.x = damp(hips.rotation.x, hipsPitch, kBody, dt);

      waist.rotation.y = damp(waist.rotation.y, waistYaw, kBody, dt);
      waist.rotation.x = damp(waist.rotation.x, waistPitch, kBody, dt);
      chest.rotation.y = damp(chest.rotation.y, chestYaw, kBody, dt);
      chest.rotation.x = damp(chest.rotation.x, chestPitch, kBody, dt);

      armL.clavicle.position.y = damp(armL.clavicle.position.y, 0.78 + clavLY, kArm, dt);
      armR.clavicle.position.y = damp(armR.clavicle.position.y, 0.78 + clavRY, kArm, dt);
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

      const totalTwist = waist.rotation.y + chest.rotation.y;
      const totalPitch = hips.rotation.x + waist.rotation.x + chest.rotation.x;
      neck.rotation.y = damp(neck.rotation.y, -totalTwist * 0.45, 13, dt);
      head.rotation.y = damp(head.rotation.y, -totalTwist * 0.35 + Math.sin(stompT * 0.35) * 0.06 * (1 - moveBlend), 13, dt);
      head.rotation.x = damp(head.rotation.x, -totalPitch * 0.55, 12, dt);
      jaw.rotation.x = damp(jaw.rotation.x, jawOpen, 14, dt);

      tassetF.rotation.x = damp(tassetF.rotation.x, -Math.abs(walkHipL) * 0.45 - (strike ? 0.32 : 0), 11, dt);
      tassetL.rotation.z = damp(tassetL.rotation.z, walkHipL * 0.28 + hipsRoll * 0.4, 11, dt);
      tassetR.rotation.z = damp(tassetR.rotation.z, -walkHipR * 0.28 + hipsRoll * 0.4, 11, dt);

      const combatEnergy = windup || strike ? 1 : 0;
      coreRingOuter.rotation.z += dt * (combatEnergy ? 2.4 : 0.65);
      coreRingInner.rotation.x += dt * (combatEnergy ? 3.6 : 1.1);
      coreRingInner.rotation.y += dt * (combatEnergy ? 2.8 : 0.9);
      coreOuter.rotation.y += dt * (combatEnergy ? 4.8 : 1.6);
      coreInner.rotation.y -= dt * 3.0;
      const pulse = (1 + Math.sin(stompT * 2.6) * 0.08) * (combatEnergy ? 1.32 : 1.0);
      coreOuter.scale.set(0.14 * pulse, 0.22 * pulse, 0.10 * pulse);
      runeStoneMat.emissiveIntensity = damp(runeStoneMat.emissiveIntensity, combatEnergy ? 2.6 : 1.45, 10, dt);

      haloGroup.rotation.z += dt * (combatEnergy ? 2.8 : 0.65);
      for (let i = 0; i < orbitShards.length; i++) {
        orbitShards[i].rotation.y += dt * 2.2;
      }
    },
    setFlash(v) {
      for (const m of [stoneMat, darkStoneMat, mossMat, bronzeMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [stoneMat, darkStoneMat, runeStoneMat, bronzeMat, mossMat, jointGlowMat, runeMat, coreHotMat]) m.dispose();
      beltGeo.dispose(); coreRingGeo.dispose(); coreRingInnerGeo.dispose(); haloRingGeo.dispose();
      armL.cuffGeo.dispose(); armR.cuffGeo.dispose();
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
