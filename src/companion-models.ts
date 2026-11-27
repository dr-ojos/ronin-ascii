// Professional sculpted 3D models, procedural PBR textures (albedo + bump), and
// damped fluid animations for all 5 player companions:
//   - Lobo Guardián      (spirit wolf with silver gorget & swinging jade talisman)
//   - Guerrero Esqueleto (anatomical bone samurai with kabuto, hammered buckler & spirit katana)
//   - Águila Imperial    (3-stage articulated feathered raptor with banking flight & dive tuck)
//   - León Dorado        (muscular feline with 3-tier royal mane, articulated jaw & leaping pounce)
//   - Gólem de Piedra    (ancient mossy temple monolith with carved granite textures & runic core)
import * as THREE from 'three';
import { ACTOR_LAYER } from './ascii';
import { createBeast } from './beasts';
import { earGeo, furLockGeo, getFurTextures, limbGeo, loftMesh, taperTube } from './beast-art';
import { mangaFinish } from './manga-art';
import { CLS, M, markCombatFx, shadowTree, tagMat, tagTree } from './materials';
import { mandalaTex } from './vfx-art';

export type CompanionKind = 'lobo' | 'esqueleto' | 'aguila' | 'leon' | 'golem';

export interface CompanionAnimInput {
  moving: number;
  speed: number;
  state: 'idle' | 'windup' | 'strike' | 'dive';
  turnRate?: number;
  /** optional combo / attack variant index (e.g. Golem 0=right hook, 1=left uppercut, 2=two-hand seismic slam) */
  attackStyle?: number;
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

function withWhiteColors(g: THREE.BufferGeometry) {
  const c = new Float32Array(g.attributes.position.count * 3).fill(1);
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  return g;
}

// ============================================================ Procedural PBR Texture Cache
interface PbrPair { map: THREE.CanvasTexture; bump: THREE.CanvasTexture }
const texCache = new Map<string, PbrPair>();

function makePair(key: string, size: number, draw: (ac: CanvasRenderingContext2D, bc: CanvasRenderingContext2D, s: number) => void): PbrPair {
  const hit = texCache.get(key);
  if (hit) return hit;

  const aCan = document.createElement('canvas'); aCan.width = aCan.height = size;
  const bCan = document.createElement('canvas'); bCan.width = bCan.height = size;
  const ac = aCan.getContext('2d')!, bc = bCan.getContext('2d')!;
  draw(ac, bc, size);

  const map = new THREE.CanvasTexture(aCan);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.needsUpdate = true;

  const bump = new THREE.CanvasTexture(bCan);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.needsUpdate = true;

  const pair = { map, bump };
  texCache.set(key, pair);
  return pair;
}

// Deterministic hash for clean procedural textures
const h2 = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function getStoneTex(): PbrPair {
  return makePair('stone-v2', 256, (ac, bc, s) => {
    // Rich dark carved basalt base
    ac.fillStyle = '#4e565e'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#7e7e7e'; bc.fillRect(0, 0, s, s);

    // Stratified granite mineral grain & chiselled stone mottling
    for (let i = 0; i < 2200; i++) {
      const x = h2(i * 3.1) * s, y = h2(i * 7.3) * s;
      const rx = 1.2 + h2(i * 11.7) * 6.5, ry = 1.0 + h2(i * 13.9) * 3.8;
      const v = Math.floor(58 + h2(i * 5.9) * 58);
      ac.fillStyle = `rgba(${v},${v + 5},${v + 11},0.28)`;
      ac.beginPath(); ac.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); ac.fill();
      const bv = Math.floor(86 + h2(i * 5.9) * 86);
      bc.fillStyle = `rgba(${bv},${bv},${bv},0.34)`;
      bc.beginPath(); bc.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); bc.fill();
    }

    // Carved temple masonry seam lines & chiseled edge highlights
    ac.lineWidth = 2; bc.lineWidth = 2.6;
    for (let r = 0; r < 4; r++) {
      const y = (r + 0.5) * (s / 4);
      ac.strokeStyle = 'rgba(22,26,32,0.52)';
      bc.strokeStyle = 'rgba(26,26,26,0.78)';
      ac.beginPath(); ac.moveTo(0, y); ac.lineTo(s, y); ac.stroke();
      bc.beginPath(); bc.moveTo(0, y); bc.lineTo(s, y); bc.stroke();
      ac.strokeStyle = 'rgba(155,170,184,0.22)';
      bc.strokeStyle = 'rgba(208,208,208,0.45)';
      ac.beginPath(); ac.moveTo(0, y + 2); ac.lineTo(s, y + 2); ac.stroke();
      bc.beginPath(); bc.moveTo(0, y + 2); bc.lineTo(s, y + 2); bc.stroke();
    }

    // Deep weathered geological fissures
    for (let c = 0; c < 20; c++) {
      let x = h2(c * 19.1) * s, y = h2(c * 23.7) * s;
      ac.strokeStyle = 'rgba(18,22,28,0.68)'; ac.lineWidth = 1.1 + h2(c * 4.3) * 1.8;
      bc.strokeStyle = 'rgba(14,14,14,0.92)'; bc.lineWidth = ac.lineWidth + 0.7;
      ac.beginPath(); bc.beginPath(); ac.moveTo(x, y); bc.moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += (h2(c * 31 + k * 7) - 0.5) * 42;
        y += (h2(c * 41 + k * 13) - 0.5) * 42;
        ac.lineTo(x, y); bc.lineTo(x, y);
      }
      ac.stroke(); bc.stroke();
    }

    // Ancient mossy lichen in recesses
    for (let m = 0; m < 32; m++) {
      const x = h2(m * 53.3) * s, y = h2(m * 61.1) * s, r = 6 + h2(m * 17.9) * 18;
      const g = ac.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(62,118,54,0.38)');
      g.addColorStop(0.6, 'rgba(46,92,42,0.18)');
      g.addColorStop(1, 'rgba(46,92,42,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
    }
  });
}

function getMossTex(): PbrPair {
  return makePair('moss-v1', 256, (ac, bc, s) => {
    ac.fillStyle = '#365f30'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#707070'; bc.fillRect(0, 0, s, s);
    for (let i = 0; i < 1800; i++) {
      const x = h2(i * 4.7) * s, y = h2(i * 9.3) * s, r = 1.4 + h2(i * 15.1) * 4.6;
      const g = Math.floor(82 + h2(i * 6.3) * 66);
      ac.fillStyle = `rgba(${Math.floor(g * 0.52)},${g},${Math.floor(g * 0.44)},0.45)`;
      ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
      const bv = Math.floor(80 + h2(i * 6.3) * 120);
      bc.fillStyle = `rgba(${bv},${bv},${bv},0.45)`;
      bc.beginPath(); bc.arc(x, y, r, 0, Math.PI * 2); bc.fill();
    }
  });
}

function getRuneEmissiveTex(): THREE.CanvasTexture {
  const key = 'golem-rune-emissive';
  const hit = texCache.get(key);
  if (hit) return hit.map;
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, 256, 256);
  ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 10;
  // Geometric ancient temple rune bands & glyphs
  for (let row = 0; row < 2; row++) {
    const y = 64 + row * 128;
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(256, y);
    ctx.stroke();
    for (let i = 0; i < 4; i++) {
      const cx = 32 + i * 64;
      ctx.beginPath();
      ctx.moveTo(cx, y - 26); ctx.lineTo(cx + 18, y); ctx.lineTo(cx, y + 26); ctx.lineTo(cx - 18, y); ctx.closePath();
      ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, y - 12); ctx.lineTo(cx, y + 12); ctx.stroke();
    }
  }
  const map = new THREE.CanvasTexture(c);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.needsUpdate = true;
  texCache.set(key, { map, bump: map });
  return map;
}

function getBoneTex(): PbrPair {
  return makePair('bone', 256, (ac, bc, s) => {
    ac.fillStyle = '#e7decb'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#888888'; bc.fillRect(0, 0, s, s);
    // Longitudinal osteon grain
    for (let i = 0; i < 420; i++) {
      const x = h2(i * 9.7) * s, y = h2(i * 13.3) * s;
      const len = 18 + h2(i * 21.1) * 54;
      const shade = h2(i * 4.7) > 0.5 ? 'rgba(255,250,240,0.22)' : 'rgba(135,120,96,0.22)';
      ac.strokeStyle = shade; ac.lineWidth = 1.1;
      ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x + (h2(i) - 0.5) * 4, y + len); ac.stroke();
      bc.strokeStyle = h2(i * 4.7) > 0.5 ? 'rgba(165,165,165,0.3)' : 'rgba(95,95,95,0.3)';
      bc.beginPath(); bc.moveTo(x, y); bc.lineTo(x, y + len); bc.stroke();
    }
    // Weathered sepia age spots & fine hairline cracks
    for (let i = 0; i < 36; i++) {
      const x = h2(i * 37.3) * s, y = h2(i * 43.1) * s, r = 5 + h2(i * 11.1) * 14;
      const g = ac.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, 'rgba(116,102,80,0.24)');
      g.addColorStop(1, 'rgba(116,102,80,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
    }
  });
}

function getIronTex(): PbrPair {
  return makePair('iron', 256, (ac, bc, s) => {
    ac.fillStyle = '#283040'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#808080'; bc.fillRect(0, 0, s, s);
    // Hammered metal dimples & brushed sheen
    for (let i = 0; i < 600; i++) {
      const x = h2(i * 17.3) * s, y = h2(i * 29.1) * s, r = 2 + h2(i * 8.1) * 7;
      const bright = h2(i * 3.7) > 0.5;
      ac.fillStyle = bright ? 'rgba(92,108,136,0.16)' : 'rgba(12,16,24,0.22)';
      ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
      bc.fillStyle = bright ? 'rgba(155,155,155,0.28)' : 'rgba(95,95,95,0.28)';
      bc.beginPath(); bc.arc(x, y, r, 0, Math.PI * 2); bc.fill();
    }
    for (let i = 0; i < 180; i++) {
      const y = h2(i * 12.7) * s;
      ac.strokeStyle = 'rgba(160,185,220,0.08)'; ac.lineWidth = 1;
      ac.beginPath(); ac.moveTo(0, y); ac.lineTo(s, y); ac.stroke();
    }
  });
}

function getFeatherTex(): PbrPair {
  return makePair('feather', 256, (ac, bc, s) => {
    ac.fillStyle = '#4f311b'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#707070'; bc.fillRect(0, 0, s, s);
    const cols = 8, rows = 10;
    const cw = s / cols, rh = s / rows;
    for (let r = -1; r <= rows; r++) {
      for (let c = -1; c <= cols; c++) {
        const cx = (c + (r % 2 === 0 ? 0 : 0.5)) * cw;
        const cy = r * rh;
        const jitter = (h2(r * 19 + c * 7) - 0.5) * 14;
        const g = ac.createLinearGradient(cx, cy - rh, cx, cy + rh * 0.9);
        g.addColorStop(0, `rgb(${60 + jitter},${36 + jitter * 0.6},${20 + jitter * 0.4})`);
        g.addColorStop(0.7, `rgb(${94 + jitter},${58 + jitter * 0.6},${30 + jitter * 0.4})`);
        g.addColorStop(1, `rgb(${156 + jitter},${112 + jitter * 0.6},${68 + jitter * 0.4})`);
        ac.fillStyle = g;
        ac.beginPath(); ac.ellipse(cx, cy, cw * 0.58, rh * 0.88, 0, 0, Math.PI * 2); ac.fill();
        ac.strokeStyle = 'rgba(28,16,8,0.45)'; ac.lineWidth = 1.2; ac.stroke();
        // Central feather rachis shaft
        ac.strokeStyle = 'rgba(218,178,120,0.32)'; ac.lineWidth = 1;
        ac.beginPath(); ac.moveTo(cx, cy - rh * 0.7); ac.lineTo(cx, cy + rh * 0.75); ac.stroke();

        // Bump scallop
        const bg = bc.createLinearGradient(cx, cy - rh, cx, cy + rh * 0.9);
        bg.addColorStop(0, '#555555'); bg.addColorStop(0.65, '#bbbbbb'); bg.addColorStop(1, '#e8e8e8');
        bc.fillStyle = bg;
        bc.beginPath(); bc.ellipse(cx, cy, cw * 0.55, rh * 0.85, 0, 0, Math.PI * 2); bc.fill();
        bc.strokeStyle = '#303030'; bc.lineWidth = 1.2; bc.stroke();
      }
    }
  });
}

// ============================================================ Shared primitives
const SPHERE = withWhiteColors(new THREE.SphereGeometry(1, 14, 10));
const BOX = withWhiteColors(new THREE.BoxGeometry(1, 1, 1));
const CYL = withWhiteColors(new THREE.CylinderGeometry(1, 1, 1, 12));
const CONE = withWhiteColors(new THREE.ConeGeometry(1, 1, 8));
const OCTA = withWhiteColors(new THREE.OctahedronGeometry(1, 0));
const DODECA = withWhiteColors(new THREE.DodecahedronGeometry(1, 1));
const SEAL_GEO = new THREE.PlaneGeometry(2, 2);
const HP_BG_GEO = new THREE.PlaneGeometry(1.22, 0.13);
const HP_FILL_GEO = new THREE.PlaneGeometry(1.14, 0.08);
HP_FILL_GEO.translate(0.57, 0, 0);

function finalizeCompanionRoot(root: THREE.Group, color: number, hpBarY: number, ringScale = 0.95) {
  shadowTree(root);
  root.traverse(o => {
    const m = o as THREE.Mesh;
    if (m.isMesh) m.layers.enable(ACTOR_LAYER);
  });
  tagTree(root, CLS.actor);

  const ringMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color, transparent: true, opacity: 0.42,
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
    color: 0x090c14, transparent: true, opacity: 0.8, depthTest: false, depthWrite: false, side: THREE.DoubleSide,
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

// ============================================================ 1. LOBO GUARDIÁN
function buildWolf(color: number): CompanionModel {
  const beast = createBeast({ species: 'wolf', coat: 0xdce8f8, trim: 0x6b8db8, eye: 0x70f4ff, alpha: true });
  const root = new THREE.Group();
  root.add(beast.root);
  beast.ring.visible = false;

  const iron = getIronTex();
  const gorgetMat = M(0x36445c, { roughness: 0.35, metalness: 0.72, map: iron.map, bumpMap: iron.bump, bumpScale: 0.015 });
  const spiritMat = tagMat(new THREE.MeshBasicMaterial({ color, toneMapped: false }), CLS.fx);

  // Armored silver gorget + swinging jade-spirit talisman tag
  const collarGroup = new THREE.Group();
  collarGroup.position.set(0, 0.96, 0.55);
  beast.root.add(collarGroup);

  const collarGeo = new THREE.TorusGeometry(0.195, 0.036, 8, 22);
  const collar = new THREE.Mesh(collarGeo, gorgetMat);
  collar.rotation.x = Math.PI / 2 - 0.32;
  collarGroup.add(collar);

  const trimGeo = new THREE.TorusGeometry(0.20, 0.014, 6, 22);
  const trimRing = new THREE.Mesh(trimGeo, spiritMat);
  trimRing.rotation.x = Math.PI / 2 - 0.32;
  trimRing.position.z = 0.02;
  markCombatFx(trimRing);
  collarGroup.add(trimRing);

  const talismanPivot = new THREE.Group();
  talismanPivot.position.set(0, -0.16, 0.14);
  collarGroup.add(talismanPivot);
  const tag = part(talismanPivot, OCTA, spiritMat, 0, -0.07, 0, 0.055, 0.095, 0.025);
  markCombatFx(tag);

  const ui = finalizeCompanionRoot(root, color, 1.68, 0.98);
  let t = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 1.68,
    update(dt, o) {
      t += dt * (o.moving > 0.1 ? 8 : 3);
      beast.update(dt, { moving: o.moving, speed: o.speed, state: o.state === 'dive' ? 'strike' : o.state });
      const targetSwingX = o.moving * 0.45 + Math.sin(t) * (0.12 + o.moving * 0.22);
      const targetSwingZ = THREE.MathUtils.clamp((o.turnRate ?? 0) * 0.14, -0.45, 0.45);
      talismanPivot.rotation.x = damp(talismanPivot.rotation.x, targetSwingX, 11, dt);
      talismanPivot.rotation.z = damp(talismanPivot.rotation.z, targetSwingZ, 10, dt);
    },
    setFlash(v) { beast.setFlash(v); gorgetMat.emissive.setScalar(v); },
    setHpFrac: ui.setHpFrac,
    dispose() {
      beast.dispose?.();
      gorgetMat.dispose(); spiritMat.dispose();
      collarGeo.dispose(); trimGeo.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 2. LEÓN DORADO
const lionGeo = {
  torso: loftMesh([
    { z: -0.78, y: 0.85, rx: 0.15, ryTop: 0.15, ryBot: 0.13, shadeTop: 0.84, shadeSide: 0.98, shadeBot: 0.84 },
    { z: -0.48, y: 0.89, rx: 0.24, ryTop: 0.21, ryBot: 0.18, shadeTop: 0.84, shadeSide: 1.00, shadeBot: 0.88 },
    { z: -0.14, y: 0.86, rx: 0.185, ryTop: 0.185, ryBot: 0.135, botPinch: 0.26, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.94 },
    { z:  0.22, y: 0.92, rx: 0.285, ryTop: 0.255, ryBot: 0.275, square: 0.24, shadeTop: 0.82, shadeSide: 1.00, shadeBot: 0.96 },
    { z:  0.54, y: 0.98, rx: 0.31, ryTop: 0.29, ryBot: 0.27, square: 0.26, shadeTop: 0.80, shadeSide: 0.98, shadeBot: 0.96 },
    { z:  0.72, y: 1.00, rx: 0.20, ryTop: 0.19, ryBot: 0.18, shadeTop: 0.84, shadeSide: 0.98, shadeBot: 1.00 }
  ], 16),
  skull: loftMesh([
    { z: -0.11, y: 0.05, rx: 0.185, ryTop: 0.175, ryBot: 0.14, square: 0.20, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.92 },
    { z:  0.08, y: 0.065, rx: 0.205, ryTop: 0.175, ryBot: 0.13, square: 0.24, shadeTop: 0.84, shadeSide: 1.00, shadeBot: 0.95 },
    { z:  0.25, y: 0.02, rx: 0.142, ryTop: 0.112, ryBot: 0.082, square: 0.16, shadeTop: 0.88, shadeSide: 1.00, shadeBot: 0.96 },
    { z:  0.38, y: 0.01, rx: 0.102, ryTop: 0.082, ryBot: 0.062, square: 0.14, shadeTop: 0.86, shadeSide: 0.98, shadeBot: 0.92 }
  ], 14),
  jaw: loftMesh([
    { z: 0.00, y: 0.00, rx: 0.105, ryTop: 0.034, ryBot: 0.050 },
    { z: 0.18, y: -0.01, rx: 0.082, ryTop: 0.028, ryBot: 0.040 },
    { z: 0.31, y: -0.005, rx: 0.058, ryTop: 0.022, ryBot: 0.028 }
  ], 10),
  ear: earGeo(0.145, 0.135, 0.055, true),
  maneInner: furLockGeo(0.42, 0.19, 0.13, 0.22),
  maneMid: furLockGeo(0.54, 0.23, 0.15, 0.30),
  maneOuter: furLockGeo(0.64, 0.26, 0.16, 0.36),
  upperFront: limbGeo(0.46, 0.14, 0.11, 0.082, 0.15),
  lowerFront: limbGeo(0.43, 0.078, 0.066, 0.058, 0.06),
  upperBack: limbGeo(0.48, 0.162, 0.116, 0.084, 0.22),
  lowerBack: limbGeo(0.45, 0.078, 0.064, 0.056, 0.08),
  paw: loftMesh([
    { z: -0.06, y: 0.038, rx: 0.068, ryTop: 0.040, ryBot: 0.034 },
    { z:  0.04, y: 0.036, rx: 0.086, ryTop: 0.044, ryBot: 0.036, square: 0.28 },
    { z:  0.15, y: 0.028, rx: 0.072, ryTop: 0.032, ryBot: 0.028 }
  ], 10),
  claw: taperTube([[0, 0, 0], [0, -0.004, 0.032], [0, -0.024, 0.054]], 0.011, 0.002, 5, 5),
  tail: taperTube(
    [[0, 0, 0], [0, -0.04, -0.22], [0, -0.15, -0.48], [0, -0.12, -0.74], [0, 0.04, -0.96]],
    0.038, 0.020, 8, 14
  ),
  tuft: furLockGeo(0.28, 0.125, 0.115, -0.26),
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
  const coatMat = M(0xe0a64b, { roughness: 0.84, vertexColors: true, map: fur.map, bumpMap: fur.bump, bumpScale: 0.020 });
  const maneGoldMat = M(0xc87420, { roughness: 0.88, vertexColors: true, map: fur.map, bumpMap: fur.bump, bumpScale: 0.026 });
  const maneDarkMat = M(0x6e3110, { roughness: 0.90, vertexColors: true, map: fur.map, bumpMap: fur.bump, bumpScale: 0.030 });
  const noseMat = M(0x261512, { roughness: 0.5 });
  const goldTrimMat = M(0xffcf54, { roughness: 0.26, metalness: 0.78 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe870 });
  const ivoryMat = M(0xf4ead2, { roughness: 0.30 });

  addMesh(body, lionGeo.torso, coatMat);

  // 3-tier royal mane attached to neck so it sways fluidly with the head!
  neck.position.set(0, 1.02, 0.58);
  const maneGroup = new THREE.Group();
  neck.add(maneGroup);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const lock = addMesh(maneGroup, lionGeo.maneOuter, maneDarkMat,
      Math.sin(a) * 0.26, Math.cos(a) * 0.26, -0.10, -0.32, 0, -a);
    lock.rotation.x += 0.24;
  }
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.12;
    addMesh(maneGroup, lionGeo.maneMid, maneGoldMat, Math.sin(a) * 0.23, Math.cos(a) * 0.22, 0.03, -0.22, 0, -a);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.25;
    addMesh(maneGroup, lionGeo.maneInner, coatMat, Math.sin(a) * 0.17, Math.cos(a) * 0.16, 0.14, -0.10, 0, -a);
  }

  head.position.set(0, 0.08, 0.18);
  addMesh(head, lionGeo.skull, coatMat);
  // Subtle golden warrior brow band
  part(head, BOX, goldTrimMat, 0, 0.145, 0.14, 0.26, 0.028, 0.06);
  jaw.position.set(0, -0.03, 0.08);
  addMesh(jaw, lionGeo.jaw, coatMat);
  head.add(jaw);
  part(head, SPHERE, noseMat, 0, 0.038, 0.38, 0.056, 0.040, 0.036);
  for (const s of [-1, 1]) {
    addMesh(head, lionGeo.ear, coatMat, s * 0.155, 0.175, -0.02, 0.1, s * 0.25, -s * 0.35);
    part(head, SPHERE, eyeMat, s * 0.098, 0.095, 0.185, 0.028, 0.024, 0.024);
    part(head, CONE, ivoryMat, s * 0.058, -0.022, 0.29, 0.015, 0.060, 0.015).rotation.x = Math.PI;
  }

  tail.position.set(0, 0.87, -0.75);
  addMesh(tail, lionGeo.tail, coatMat);
  addMesh(tail, lionGeo.tuft, maneDarkMat, 0, 0.04, -0.96, -0.5, 0, 0);

  const legs: { joint: THREE.Group; lower: THREE.Group; phase: number; front: boolean; side: number }[] = [];
  const legDefs: [number, number, number, boolean, number, number][] = [
    [-0.22, 0.85,  0.43, true,  0,               -1],
    [ 0.22, 0.85,  0.43, true,  Math.PI,          1],
    [-0.21, 0.85, -0.49, false, Math.PI * 0.85,  -1],
    [ 0.21, 0.85, -0.49, false, -Math.PI * 0.15,  1],
  ];
  for (const [x, y, z, front, phase, side] of legDefs) {
    const joint = new THREE.Group();
    joint.position.set(x, y, z);
    body.add(joint);
    addMesh(joint, front ? lionGeo.upperFront : lionGeo.upperBack, coatMat);
    const lower = new THREE.Group();
    lower.position.set(0, front ? -0.43 : -0.45, 0);
    joint.add(lower);
    addMesh(lower, front ? lionGeo.lowerFront : lionGeo.lowerBack, coatMat);
    const paw = addMesh(lower, lionGeo.paw, coatMat, 0, front ? -0.43 : -0.45, 0.02);
    for (let c = -1; c <= 1; c++) addMesh(paw, lionGeo.claw, ivoryMat, c * 0.032, 0.024, 0.12);
    legs.push({ joint, lower, phase, front, side });
  }

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 1.92, 1.12);
  let phaseT = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 1.92,
    update(dt, o) {
      phaseT += dt * (o.moving > 0.1 ? 3.5 + o.speed * 0.95 : 2.1);
      const stride = o.moving * 0.62;
      const windup = o.state === 'windup';
      const strike = o.state === 'strike';

      for (const l of legs) {
        const s = Math.sin(phaseT + l.phase);
        const targetUpper = windup
          ? (l.front ? 0.25 : -0.35)
          : strike
            ? (l.front ? -0.95 + l.side * 0.12 : 0.45)
            : s * stride;
        const targetLower = windup
          ? (l.front ? -0.45 : 0.45)
          : strike
            ? (l.front ? 0.15 : -0.25)
            : Math.max(0, -Math.cos(phaseT + l.phase)) * stride * 0.72;
        l.joint.rotation.x = damp(l.joint.rotation.x, targetUpper, 14, dt);
        l.lower.rotation.x = damp(l.lower.rotation.x, targetLower, 14, dt);
      }

      const targetY = windup ? -0.10 : strike ? 0.20 : o.moving * Math.abs(Math.sin(phaseT)) * 0.10 + Math.sin(phaseT) * 0.014;
      const targetPitch = windup ? 0.22 : strike ? -0.24 : -o.moving * 0.05;
      const targetRoll = THREE.MathUtils.clamp(-(o.turnRate ?? 0) * 0.09, -0.22, 0.22);
      body.position.y = damp(body.position.y, targetY, 13, dt);
      body.rotation.x = damp(body.rotation.x, targetPitch, 12, dt);
      body.rotation.z = damp(body.rotation.z, targetRoll, 9, dt);

      neck.rotation.x = damp(neck.rotation.x, windup ? -0.25 : strike ? 0.18 : Math.sin(phaseT * 0.5) * 0.04, 12, dt);
      neck.rotation.y = damp(neck.rotation.y, THREE.MathUtils.clamp((o.turnRate ?? 0) * 0.14, -0.35, 0.35), 10, dt);
      jaw.rotation.x = damp(jaw.rotation.x, windup || strike ? 0.58 : 0.05 + Math.sin(phaseT * 0.7) * 0.025, 14, dt);
      tail.rotation.y = damp(tail.rotation.y, Math.sin(phaseT * 0.9) * 0.42 - (o.turnRate ?? 0) * 0.15, 8, dt);
      tail.rotation.x = damp(tail.rotation.x, Math.cos(phaseT * 0.65) * 0.16, 8, dt);
    },
    setFlash(v) {
      for (const m of [coatMat, maneGoldMat, maneDarkMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [coatMat, maneGoldMat, maneDarkMat, noseMat, goldTrimMat, eyeMat, ivoryMat]) m.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 3. ÁGUILA IMPERIAL (FLYING)
const eagleGeo = {
  body: loftMesh([
    { z: -0.56, y: 0.00, rx: 0.075, ryTop: 0.055, ryBot: 0.052, shadeTop: 0.84, shadeSide: 0.94, shadeBot: 0.82 },
    { z: -0.24, y: 0.02, rx: 0.19, ryTop: 0.15, ryBot: 0.145, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.86 },
    { z:  0.14, y: 0.06, rx: 0.225, ryTop: 0.18, ryBot: 0.19, botPinch: 0.30, shadeTop: 0.86, shadeSide: 1.00, shadeBot: 0.92 },
    { z:  0.42, y: 0.10, rx: 0.148, ryTop: 0.135, ryBot: 0.125, shadeTop: 0.92, shadeSide: 1.00, shadeBot: 0.94 },
    { z:  0.56, y: 0.13, rx: 0.095, ryTop: 0.095, ryBot: 0.085, shadeTop: 0.96, shadeSide: 1.00, shadeBot: 0.96 }
  ], 14),
  beak: taperTube([[0, 0, 0], [0, -0.01, 0.115], [0, -0.09, 0.205]], 0.056, 0.006, 7, 9),
  feather: furLockGeo(0.58, 0.145, 0.030, 0.10),
  primary: furLockGeo(0.80, 0.125, 0.026, 0.16),
  tailFeather: furLockGeo(0.62, 0.135, 0.024, 0.05),
};

function buildEagle(color: number): CompanionModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  const fTex = getFeatherTex();
  const brownMat = M(0x6b4528, { roughness: 0.82, vertexColors: true, map: fTex.map, bumpMap: fTex.bump, bumpScale: 0.024 });
  const tipMat = M(0x362214, { roughness: 0.86, vertexColors: true, map: fTex.map, bumpMap: fTex.bump, bumpScale: 0.022 });
  const headMat = M(0xf6f2e8, { roughness: 0.76, vertexColors: true, bumpMap: fTex.bump, bumpScale: 0.012 });
  const goldMat = M(0xf5be36, { roughness: 0.30, metalness: 0.24 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffe870 });

  addMesh(body, eagleGeo.body, brownMat);

  // Feathered white raptor head, fierce brow ridge, golden hooked beak
  const head = new THREE.Group();
  head.position.set(0, 0.15, 0.52);
  body.add(head);
  part(head, SPHERE, headMat, 0, 0.02, 0.04, 0.14, 0.125, 0.165);
  for (let i = -1; i <= 1; i++) {
    const hackle = addMesh(head, eagleGeo.feather, headMat, i * 0.06, 0.08, -0.08, -0.18, i * 0.22, 0);
    hackle.scale.set(0.52, 0.45, 0.48);
  }
  addMesh(head, eagleGeo.beak, goldMat, 0, -0.01, 0.155);
  for (const s of [-1, 1]) {
    part(head, SPHERE, eyeMat, s * 0.088, 0.048, 0.105, 0.028, 0.022, 0.022);
    part(head, BOX, headMat, s * 0.085, 0.072, 0.10, 0.055, 0.018, 0.075).rotation.z = -s * 0.22;
  }

  // 3-stage articulated wings (inner arm + outer forearm + splayed primary tips)
  const buildWing = (side: number) => {
    const inner = new THREE.Group();
    inner.position.set(side * 0.17, 0.12, 0.12);
    body.add(inner);

    const arm = part(inner, BOX, brownMat, side * 0.36, 0, 0.02, 0.74, 0.055, 0.36);
    arm.rotation.y = -side * 0.12;
    for (let i = 0; i < 5; i++) {
      const f = addMesh(inner, eagleGeo.feather, i < 3 ? brownMat : tipMat, side * (0.14 + i * 0.145), -0.012, -0.14, 0, side * 0.10, 0);
      f.rotation.x = Math.PI * 0.5;
      f.rotation.z = side * (0.08 + i * 0.04);
    }

    const outer = new THREE.Group();
    outer.position.set(side * 0.70, 0, -0.04);
    inner.add(outer);
    const tip = part(outer, BOX, tipMat, side * 0.32, 0, -0.04, 0.66, 0.038, 0.25);
    tip.rotation.y = -side * 0.20;
    for (let i = 0; i < 6; i++) {
      const p = addMesh(outer, eagleGeo.primary, i % 2 === 0 ? tipMat : brownMat, side * (0.08 + i * 0.125), 0, -0.06 - i * 0.018, 0, 0, 0);
      p.rotation.x = Math.PI * 0.5;
      p.rotation.z = -side * (0.30 + i * 0.17);
    }
    return { inner, outer };
  };
  const wingL = buildWing(-1);
  const wingR = buildWing(1);

  // Tail fan that spreads during dives & banking
  const tail = new THREE.Group();
  tail.position.set(0, 0.01, -0.50);
  body.add(tail);
  const tailFeathers: { m: THREE.Mesh; idx: number }[] = [];
  for (let i = -2; i <= 2; i++) {
    const tf = addMesh(tail, eagleGeo.tailFeather, Math.abs(i) === 2 ? tipMat : headMat, i * 0.055, 0, -0.04, Math.PI * 0.52, i * 0.20, 0);
    tf.scale.setScalar(0.88);
    tailFeathers.push({ m: tf, idx: i });
  }

  // Feathered legs & golden talons
  const talons = new THREE.Group();
  talons.position.set(0, -0.14, 0.08);
  body.add(talons);
  for (const s of [-1, 1]) {
    part(talons, SPHERE, brownMat, s * 0.085, -0.02, 0, 0.065, 0.08, 0.065);
    part(talons, CYL, goldMat, s * 0.085, -0.09, 0, 0.024, 0.16, 0.024);
    for (let c = -1; c <= 1; c++) {
      const claw = part(talons, CONE, goldMat, s * 0.085 + c * 0.028, -0.18, 0.045, 0.015, 0.09, 0.015);
      claw.rotation.x = 0.72;
    }
  }

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 0.88, 0.88);
  let flapT = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 0.88,
    update(dt, o) {
      const diving = o.state === 'dive' || o.state === 'strike';
      const climbing = o.state === 'windup';
      const flapSpeed = climbing ? 15.5 : diving ? 12 : 7.2;
      flapT += dt * flapSpeed;

      const targetInnerZ = diving
        ? -0.42 + Math.sin(flapT) * 0.16
        : climbing
          ? Math.sin(flapT) * 0.78
          : Math.sin(flapT) * 0.52;
      const targetInnerY = diving ? 0.48 : 0; // sweep wings back in a dive!
      const targetOuterZ = diving
        ? -0.25
        : Math.sin(flapT - 0.75) * (climbing ? 0.55 : 0.42);

      wingL.inner.rotation.z = damp(wingL.inner.rotation.z, -targetInnerZ, 12, dt);
      wingR.inner.rotation.z = damp(wingR.inner.rotation.z, targetInnerZ, 12, dt);
      wingL.inner.rotation.y = damp(wingL.inner.rotation.y, -targetInnerY, 10, dt);
      wingR.inner.rotation.y = damp(wingR.inner.rotation.y, targetInnerY, 10, dt);
      wingL.outer.rotation.z = damp(wingL.outer.rotation.z, -targetOuterZ, 12, dt);
      wingR.outer.rotation.z = damp(wingR.outer.rotation.z, targetOuterZ, 12, dt);

      // Aerodynamic banking into turns!
      const targetRoll = THREE.MathUtils.clamp(-(o.turnRate ?? 0) * 0.22, -0.62, 0.62);
      const targetPitch = diving ? 0.52 : climbing ? -0.34 : 0.04;
      body.rotation.x = damp(body.rotation.x, targetPitch, 10, dt);
      body.rotation.z = damp(body.rotation.z, targetRoll, 8, dt);
      body.position.y = damp(body.position.y, Math.sin(flapT) * (diving ? 0.03 : 0.10), 10, dt);

      head.rotation.x = damp(head.rotation.x, -body.rotation.x * 0.55, 10, dt);
      talons.rotation.x = damp(talons.rotation.x, diving ? -0.95 : 0.28, 12, dt);
      tail.rotation.x = damp(tail.rotation.x, diving ? -0.28 : 0.08 + Math.sin(flapT * 0.5) * 0.05, 9, dt);
      const spread = diving ? 0.30 : 0.18;
      for (const tf of tailFeathers) tf.m.rotation.y = damp(tf.m.rotation.y, tf.idx * spread, 9, dt);
    },
    setFlash(v) {
      for (const m of [brownMat, tipMat, headMat, goldMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [brownMat, tipMat, headMat, goldMat, eyeMat]) m.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 4. GUERRERO ESQUELETO
function buildSkeleton(color: number): CompanionModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const torso = new THREE.Group();
  root.add(body);
  body.add(torso);

  const bTex = getBoneTex();
  const iTex = getIronTex();
  const boneMat = M(0xebe3d3, { roughness: 0.62, map: bTex.map, bumpMap: bTex.bump, bumpScale: 0.018 });
  const darkBoneMat = M(0xa69c8b, { roughness: 0.72, map: bTex.map, bumpMap: bTex.bump, bumpScale: 0.020 });
  const armorMat = M(0x232a3a, { roughness: 0.40, metalness: 0.55, map: iTex.map, bumpMap: iTex.bump, bumpScale: 0.020 });
  const clothMat = M(0x18384a, { roughness: 0.88 });
  const goldMat = M(0xffcf60, { roughness: 0.28, metalness: 0.82 });
  const bladeMat = M(0xe4fbff, { roughness: 0.14, metalness: 0.9, emissive: color, emissiveIntensity: 0.65 });
  const eyeMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });

  // Pelvis & tattered samurai waist panels (kusazuri)
  part(body, BOX, darkBoneMat, 0, 0.90, 0, 0.35, 0.14, 0.19);
  const sashL = part(body, BOX, clothMat, 0.18, 0.72, 0.02, 0.14, 0.32, 0.18);
  const sashR = part(body, BOX, clothMat, -0.18, 0.72, 0.02, 0.14, 0.32, 0.18);
  part(body, BOX, clothMat, 0, 0.76, -0.11, 0.34, 0.34, 0.05);

  // Articulated upper torso (pivots at waist for fluid sword swings!)
  torso.position.set(0, 0.96, 0);
  part(torso, CYL, boneMat, 0, 0.28, -0.02, 0.052, 0.56, 0.052);
  part(torso, BOX, darkBoneMat, 0, 0.32, 0.11, 0.075, 0.32, 0.04); // sternum
  for (let i = 0; i < 5; i++) {
    const ry = 0.14 + i * 0.092;
    const w = 0.27 + (i === 3 ? 0.06 : i === 0 ? -0.05 : 0.02);
    part(torso, BOX, boneMat, 0, ry, 0.04, w, 0.036, 0.21);
  }
  // Collarbone & tattered shoulder mantle
  part(torso, BOX, boneMat, 0, 0.53, 0.03, 0.46, 0.045, 0.08);
  part(torso, BOX, clothMat, 0, 0.50, -0.10, 0.42, 0.18, 0.06);

  // Detailed skull + articulated jaw + samurai kabuto helmet with crescent horns
  const head = new THREE.Group();
  head.position.set(0, 0.67, 0.02);
  torso.add(head);
  part(head, SPHERE, boneMat, 0, 0.08, 0, 0.155, 0.17, 0.165);
  part(head, BOX, darkBoneMat, 0, 0.04, 0.12, 0.18, 0.055, 0.06); // recessed eye brow socket
  const jaw = part(head, BOX, boneMat, 0, -0.055, 0.055, 0.14, 0.085, 0.13);
  for (const s of [-1, 1]) {
    part(head, SPHERE, eyeMat, s * 0.054, 0.052, 0.142, 0.030, 0.025, 0.020);
  }
  // Samurai Kabuto dome, neck guard (shikoro) & golden crescent horns
  const kabutoGeo = new THREE.SphereGeometry(0.185, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.54);
  const kabuto = new THREE.Mesh(kabutoGeo, armorMat);
  kabuto.position.y = 0.10;
  head.add(kabuto);
  const shikoroGeo = new THREE.CylinderGeometry(0.19, 0.25, 0.11, 14, 1, true);
  const shikoro = new THREE.Mesh(shikoroGeo, armorMat);
  shikoro.position.set(0, 0.06, -0.02);
  head.add(shikoro);
  for (const s of [-1, 1]) {
    const horn = part(head, CONE, goldMat, s * 0.09, 0.24, 0.14, 0.028, 0.22, 0.018);
    horn.rotation.z = -s * 0.48;
  }

  // Right arm (upper + elbow + spirit katana)
  const armR = new THREE.Group();
  armR.position.set(-0.28, 0.50, 0);
  torso.add(armR);
  part(armR, BOX, armorMat, -0.05, 0.02, 0, 0.18, 0.20, 0.20).rotation.z = -0.18;
  part(armR, BOX, goldMat, -0.06, -0.05, 0, 0.185, 0.025, 0.205).rotation.z = -0.18;
  part(armR, CYL, boneMat, 0, -0.18, 0, 0.042, 0.34, 0.042);

  const foreR = new THREE.Group();
  foreR.position.set(0, -0.35, 0);
  armR.add(foreR);
  part(foreR, SPHERE, darkBoneMat, 0, 0, 0, 0.048, 0.048, 0.048);
  part(foreR, CYL, boneMat, 0, -0.14, 0.05, 0.036, 0.28, 0.036).rotation.x = -0.30;
  const sword = new THREE.Group();
  sword.position.set(0, -0.27, 0.14);
  sword.rotation.x = Math.PI * 0.34;
  foreR.add(sword);
  part(sword, CYL, armorMat, 0, -0.13, 0, 0.024, 0.26, 0.024);
  part(sword, CYL, goldMat, 0, 0.01, 0, 0.075, 0.024, 0.075);
  part(sword, BOX, bladeMat, 0, 0.50, 0, 0.024, 0.98, 0.060);

  // Left arm (upper + elbow + hammered iron buckler with glowing crest)
  const armL = new THREE.Group();
  armL.position.set(0.28, 0.50, 0);
  torso.add(armL);
  part(armL, BOX, armorMat, 0.05, 0.02, 0, 0.18, 0.20, 0.20).rotation.z = 0.18;
  part(armL, BOX, goldMat, 0.06, -0.05, 0, 0.185, 0.025, 0.205).rotation.z = 0.18;
  part(armL, CYL, boneMat, 0, -0.18, 0, 0.042, 0.34, 0.042);

  const foreL = new THREE.Group();
  foreL.position.set(0, -0.35, 0);
  armL.add(foreL);
  part(foreL, CYL, boneMat, 0, -0.12, 0.08, 0.036, 0.26, 0.036).rotation.x = -0.5;
  const shield = new THREE.Group();
  shield.position.set(0.08, -0.16, 0.18);
  shield.rotation.y = 0.42;
  foreL.add(shield);
  const discGeo = new THREE.CylinderGeometry(0.30, 0.30, 0.05, 16);
  const disc = new THREE.Mesh(discGeo, armorMat);
  disc.rotation.x = Math.PI / 2;
  shield.add(disc);
  const rimGeo = new THREE.TorusGeometry(0.295, 0.028, 7, 20);
  const rim = new THREE.Mesh(rimGeo, goldMat);
  shield.add(rim);
  part(shield, OCTA, eyeMat, 0, 0, 0.035, 0.075, 0.075, 0.035);

  // Articulated 2-segment legs (hip + knee)
  const makeLeg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.125, 0.86, 0);
    body.add(hip);
    part(hip, CYL, boneMat, 0, -0.21, 0, 0.046, 0.42, 0.046);
    const knee = new THREE.Group();
    knee.position.set(0, -0.43, 0);
    hip.add(knee);
    part(knee, SPHERE, darkBoneMat, 0, 0, 0, 0.056, 0.056, 0.056);
    part(knee, CYL, boneMat, 0, -0.21, 0, 0.038, 0.40, 0.038);
    part(knee, BOX, armorMat, 0, -0.22, 0.025, 0.095, 0.26, 0.085); // armored shin greave
    part(knee, BOX, darkBoneMat, 0, -0.42, 0.06, 0.105, 0.06, 0.21);
    return { hip, knee };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 2.32, 0.92);
  let walkT = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 2.32,
    update(dt, o) {
      walkT += dt * (o.moving > 0.1 ? 3.8 + o.speed * 1.1 : 2.1);
      const sw = Math.sin(walkT) * o.moving * 0.68;
      const windup = o.state === 'windup';
      const strike = o.state === 'strike';

      legL.hip.rotation.x = damp(legL.hip.rotation.x, sw, 14, dt);
      legR.hip.rotation.x = damp(legR.hip.rotation.x, -sw, 14, dt);
      legL.knee.rotation.x = damp(legL.knee.rotation.x, Math.max(0, -Math.cos(walkT)) * o.moving * 0.72, 14, dt);
      legR.knee.rotation.x = damp(legR.knee.rotation.x, Math.max(0, Math.cos(walkT)) * o.moving * 0.72, 14, dt);

      body.position.y = damp(body.position.y, Math.abs(Math.sin(walkT)) * o.moving * 0.08 + Math.sin(walkT) * 0.015, 13, dt);
      torso.rotation.y = damp(torso.rotation.y, windup ? -0.55 : strike ? 0.65 : sw * 0.22, 14, dt);
      torso.rotation.x = damp(torso.rotation.x, windup ? -0.12 : strike ? 0.22 : o.moving * 0.14, 12, dt);

      armR.rotation.x = damp(armR.rotation.x, windup ? -2.25 : strike ? 0.68 : -0.45 - sw * 0.55, 16, dt);
      armR.rotation.z = damp(armR.rotation.z, windup ? -0.42 : strike ? 0.52 : -0.08, 15, dt);
      foreR.rotation.x = damp(foreR.rotation.x, windup ? -0.55 : strike ? 0.25 : -0.22, 15, dt);

      armL.rotation.x = damp(armL.rotation.x, windup ? -0.65 : strike ? -0.95 : -0.38 + sw * 0.35, 13, dt);
      armL.rotation.y = damp(armL.rotation.y, strike ? -0.35 : 0, 12, dt);

      head.rotation.y = damp(head.rotation.y, -torso.rotation.y * 0.6 + Math.sin(walkT * 0.4) * 0.08, 11, dt);
      jaw.position.y = damp(jaw.position.y, windup || strike ? -0.072 : -0.055, 12, dt);
      sashL.rotation.x = damp(sashL.rotation.x, sw * 0.35, 10, dt);
      sashR.rotation.x = damp(sashR.rotation.x, -sw * 0.35, 10, dt);
    },
    setFlash(v) {
      for (const m of [boneMat, darkBoneMat, armorMat, clothMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [boneMat, darkBoneMat, armorMat, clothMat, goldMat, bladeMat, eyeMat]) m.dispose();
      kabutoGeo.dispose(); shikoroGeo.dispose(); discGeo.dispose(); rimGeo.dispose();
      ui.disposeUi();
    },
  };
}

// ============================================================ 5. GÓLEM DE PIEDRA (ANCIENT TEMPLE COLOSSUS)
const golemGeo = {
  // Sculpted broad V-tapered monolithic stone torso
  chest: loftMesh([
    { z: -0.44, y: 0.44, rx: 0.54, ryTop: 0.42, ryBot: 0.28, square: 0.34, shadeTop: 0.90, shadeSide: 0.96, shadeBot: 0.72 },
    { z: -0.18, y: 0.50, rx: 0.80, ryTop: 0.52, ryBot: 0.34, square: 0.38, shadeTop: 0.94, shadeSide: 1.00, shadeBot: 0.74 },
    { z:  0.14, y: 0.52, rx: 0.84, ryTop: 0.54, ryBot: 0.34, square: 0.40, shadeTop: 0.96, shadeSide: 1.00, shadeBot: 0.76 },
    { z:  0.40, y: 0.48, rx: 0.62, ryTop: 0.44, ryBot: 0.30, square: 0.36, shadeTop: 0.92, shadeSide: 0.98, shadeBot: 0.78 },
  ], 10),
  gauntlet: loftMesh([
    { z: -0.22, y: 0, rx: 0.24, ryTop: 0.24, ryBot: 0.24, square: 0.36 },
    { z:  0.00, y: 0, rx: 0.32, ryTop: 0.32, ryBot: 0.32, square: 0.42 },
    { z:  0.24, y: 0, rx: 0.29, ryTop: 0.29, ryBot: 0.29, square: 0.40 },
  ], 8),
  headCrown: taperTube([[0, 0, 0], [0, 0.14, -0.02], [0, 0.28, -0.08]], 0.09, 0.025, 6, 8),
};

function buildGolem(color: number): CompanionModel {
  const root = new THREE.Group();
  const body = new THREE.Group();
  const torso = new THREE.Group();
  root.add(body);
  body.add(torso);

  const sTex = getStoneTex();
  const mTex = getMossTex();
  const rTex = getRuneEmissiveTex();
  const runeCol = new THREE.Color(color);

  const stoneMat = M(0x7c868e, {
    roughness: 0.88, metalness: 0.08, flatShading: true, vertexColors: true,
    map: sTex.map, bumpMap: sTex.bump, bumpScale: 0.052,
  });
  const darkStoneMat = M(0x424a52, {
    roughness: 0.92, metalness: 0.10, flatShading: true,
    map: sTex.map, bumpMap: sTex.bump, bumpScale: 0.056,
  });
  const runeStoneMat = M(0x525d66, {
    roughness: 0.82, metalness: 0.14, flatShading: true,
    map: sTex.map, bumpMap: sTex.bump, bumpScale: 0.048,
    emissive: runeCol, emissiveMap: rTex, emissiveIntensity: 1.35,
  });
  const bronzeMat = M(0x8c6d3b, { roughness: 0.38, metalness: 0.78 });
  const mossMat = M(0x44753d, {
    roughness: 0.94, flatShading: true,
    map: mTex.map, bumpMap: mTex.bump, bumpScale: 0.04,
  });
  const runeMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const coreHotMat = new THREE.MeshBasicMaterial({ color: 0xeafff2, toneMapped: false });

  // ---- Pelvis, bronze belt & articulated stone tassets (kusazuri)
  part(body, BOX, darkStoneMat, 0, 1.04, 0, 0.78, 0.34, 0.52);
  part(body, BOX, bronzeMat, 0, 1.15, 0, 0.82, 0.075, 0.56);
  const tassetF = part(body, BOX, runeStoneMat, 0, 0.86, 0.27, 0.34, 0.38, 0.11);
  const tassetL = part(body, BOX, darkStoneMat, 0.41, 0.88, 0.02, 0.12, 0.36, 0.36);
  const tassetR = part(body, BOX, darkStoneMat, -0.41, 0.88, 0.02, 0.12, 0.36, 0.36);

  // ---- Sculpted monolithic upper torso
  torso.position.set(0, 1.20, 0);
  addMesh(torso, golemGeo.chest, stoneMat);
  // Chiseled pectoral armor slabs & dorsal monolith ridge
  for (const s of [-1, 1]) {
    const pec = part(torso, BOX, darkStoneMat, s * 0.34, 0.54, 0.38, 0.38, 0.34, 0.18);
    pec.rotation.y = -s * 0.26;
    pec.rotation.z = s * 0.08;
    part(torso, BOX, bronzeMat, s * 0.38, 0.70, 0.35, 0.28, 0.055, 0.14).rotation.y = -s * 0.24;
  }
  part(torso, BOX, darkStoneMat, 0, 0.88, -0.06, 1.08, 0.24, 0.58); // massive trap collar
  part(torso, DODECA, mossMat, 0, 0.99, -0.20, 0.42, 0.16, 0.28);   // mossy upper back hump

  // Recessed Ancient Runic Heart Core (spinning crystal + inner glow + obsidian ribs + bronze ring)
  part(torso, BOX, darkStoneMat, 0, 0.48, 0.42, 0.38, 0.46, 0.14);
  const coreRingGeo = new THREE.TorusGeometry(0.19, 0.032, 7, 18);
  const coreRing = new THREE.Mesh(coreRingGeo, bronzeMat);
  coreRing.position.set(0, 0.48, 0.50);
  torso.add(coreRing);
  const coreOuter = part(torso, OCTA, runeMat, 0, 0.48, 0.51, 0.16, 0.24, 0.10);
  const coreInner = part(torso, OCTA, coreHotMat, 0, 0.48, 0.52, 0.085, 0.13, 0.06);

  // Asymmetrical colossal boulder shoulders + mossy crowns + glowing crystal clusters
  for (const s of [-1, 1]) {
    const sh = new THREE.Group();
    sh.position.set(s * 0.86, 0.84, 0);
    torso.add(sh);
    part(sh, DODECA, stoneMat, 0, 0, 0, 0.45, 0.38, 0.44);
    part(sh, BOX, bronzeMat, 0, -0.18, 0, 0.50, 0.065, 0.48);
    part(sh, DODECA, mossMat, s * 0.04, 0.24, -0.04, 0.32, 0.15, 0.30);
    // Twin protruding runic crystal spires
    const c1 = part(sh, OCTA, runeMat, -s * 0.12, 0.34, -0.04, 0.095, 0.28, 0.095);
    c1.rotation.z = -s * 0.32;
    const c2 = part(sh, OCTA, coreHotMat, s * 0.08, 0.28, 0.08, 0.055, 0.17, 0.055);
    c2.rotation.z = -s * 0.52;
  }

  // Orbiting ancient rune shards floating behind the Golem's shoulders
  const orbitGroup = new THREE.Group();
  orbitGroup.position.set(0, 0.82, -0.34);
  torso.add(orbitGroup);
  const orbitShards: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const sh = part(orbitGroup, OCTA, runeMat, Math.cos(a) * 0.65, Math.sin(a) * 0.26, -0.18, 0.065, 0.14, 0.05);
    orbitShards.push(sh);
  }

  // ---- Ancient Guardian Monolith Head (chiseled brow, recessed glowing visor, jaw plate & crest)
  const head = new THREE.Group();
  head.position.set(0, 1.04, 0.14);
  torso.add(head);
  part(head, DODECA, darkStoneMat, 0, 0.14, 0, 0.34, 0.30, 0.32);
  part(head, BOX, stoneMat, 0, 0.24, 0.16, 0.34, 0.11, 0.16);   // heavy brow ridge
  part(head, BOX, stoneMat, 0, -0.02, 0.15, 0.26, 0.10, 0.15);  // carved chin/jaw slab
  part(head, BOX, bronzeMat, 0, 0.29, 0.14, 0.26, 0.045, 0.10); // temple brow ornament
  part(head, DODECA, mossMat, 0, 0.34, -0.05, 0.28, 0.12, 0.25);
  for (const s of [-1, 1]) {
    const horn = addMesh(head, golemGeo.headCrown, stoneMat, s * 0.18, 0.24, 0.0, -0.2, 0, -s * 0.42);
    horn.scale.setScalar(0.95);
    part(head, BOX, runeMat, s * 0.10, 0.13, 0.26, 0.095, 0.045, 0.04);
    part(head, BOX, coreHotMat, s * 0.10, 0.13, 0.275, 0.052, 0.022, 0.02);
  }

  // ---- Massive 3-joint articulated arms (upper arm + rune-etched forearm + colossal gauntlet fist)
  const makeArm = (sx: number) => {
    const upper = new THREE.Group();
    upper.position.set(sx * 0.98, 0.68, 0);
    torso.add(upper);
    part(upper, BOX, darkStoneMat, 0, -0.26, 0, 0.34, 0.52, 0.34);
    part(upper, BOX, bronzeMat, 0, -0.44, 0, 0.38, 0.075, 0.38);

    const fore = new THREE.Group();
    fore.position.set(0, -0.52, 0);
    upper.add(fore);
    const gauntlet = addMesh(fore, golemGeo.gauntlet, runeStoneMat, 0, -0.32, 0.04, Math.PI / 2, 0, 0);
    gauntlet.scale.set(1.22, 1.38, 1.22);
    // Oversized armored knuckles & glowing wrist veins
    part(fore, BOX, bronzeMat, 0, -0.10, 0, 0.42, 0.075, 0.42);
    part(fore, DODECA, stoneMat, 0, -0.56, 0.08, 0.34, 0.26, 0.34);
    for (let k = -1; k <= 1; k++) {
      part(fore, BOX, darkStoneMat, k * 0.11, -0.66, 0.20, 0.085, 0.16, 0.12);
    }
    // Glowing rune spire on outer forearm
    part(fore, OCTA, runeMat, sx * 0.24, -0.34, 0.10, 0.085, 0.18, 0.075);
    return { upper, fore };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ---- Thick articulated stone pillar legs with knee boulders & planted feet
  const makeLeg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.36, 0.94, 0);
    body.add(hip);
    part(hip, BOX, darkStoneMat, 0, -0.28, 0, 0.36, 0.54, 0.38);
    part(hip, DODECA, stoneMat, 0, -0.48, 0.14, 0.22, 0.18, 0.18); // knee boulder

    const shin = new THREE.Group();
    shin.position.set(0, -0.52, 0);
    hip.add(shin);
    part(shin, BOX, runeStoneMat, 0, -0.22, 0.04, 0.40, 0.42, 0.44);
    part(shin, BOX, bronzeMat, 0, -0.34, 0.05, 0.43, 0.065, 0.47);
    part(shin, BOX, stoneMat, 0, -0.40, 0.16, 0.42, 0.16, 0.34); // wide planted stone foot
    part(shin, BOX, mossMat, 0, -0.04, 0.23, 0.26, 0.11, 0.09);
    return { hip, shin };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 3.05, 1.48);
  let stompT = 0;

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 3.05,
    update(dt, o) {
      stompT += dt * (o.moving > 0.1 ? 2.7 + o.speed * 0.85 : 1.55);
      const sw = Math.sin(stompT) * o.moving * 0.52;
      const windup = o.state === 'windup';
      const strike = o.state === 'strike';
      const style = (o.attackStyle ?? 2) % 3; // 0 = right haymaker, 1 = left uppercut, 2 = two-hand seismic slam

      // Heavy planted stride & combat stance legs
      const legHipL = windup ? (style === 0 ? -0.28 : style === 1 ? 0.32 : -0.18) : strike ? (style === 0 ? 0.35 : style === 1 ? -0.28 : 0.22) : sw;
      const legHipR = windup ? (style === 0 ? 0.32 : style === 1 ? -0.28 : -0.18) : strike ? (style === 0 ? -0.28 : style === 1 ? 0.35 : 0.22) : -sw;
      legL.hip.rotation.x = damp(legL.hip.rotation.x, legHipL, 11, dt);
      legR.hip.rotation.x = damp(legR.hip.rotation.x, legHipR, 11, dt);
      legL.shin.rotation.x = damp(legL.shin.rotation.x, windup ? 0.25 : Math.max(0, -Math.cos(stompT)) * o.moving * 0.48, 11, dt);
      legR.shin.rotation.x = damp(legR.shin.rotation.x, windup ? 0.25 : Math.max(0, Math.cos(stompT)) * o.moving * 0.48, 11, dt);

      // Weighty body bounce, crouch on windup, slam drop on strike
      const targetBodyY = windup
        ? (style === 2 ? 0.12 : -0.12)
        : strike
          ? (style === 2 ? -0.18 : 0.04)
          : Math.abs(Math.sin(stompT)) * o.moving * 0.095 + Math.sin(stompT) * 0.02;
      const targetBodyRoll = windup
        ? (style === 0 ? -0.14 : style === 1 ? 0.14 : 0)
        : strike
          ? (style === 0 ? 0.16 : style === 1 ? -0.16 : 0)
          : Math.sin(stompT) * o.moving * 0.08;
      body.position.y = damp(body.position.y, targetBodyY, 12, dt);
      body.rotation.z = damp(body.rotation.z, targetBodyRoll, 10, dt);

      // Torso twist & pitch choreography per move
      let tPitch = o.moving * 0.10;
      let tYaw = sw * 0.22;
      let armLX = -sw * 0.62, armLZ = 0.08, foreLX = -0.30;
      let armRX = sw * 0.62, armRZ = -0.08, foreRX = -0.30;

      if (windup) {
        if (style === 0) {
          // Move 0: Right Heavy Haymaker windup (coil far right)
          tYaw = -0.78; tPitch = 0.16;
          armRX = 0.55; armRZ = -0.85; foreRX = -0.85;
          armLX = -0.95; armLZ = 0.35; foreLX = -0.55;
        } else if (style === 1) {
          // Move 1: Left Crushing Uppercut windup (drop low left)
          tYaw = 0.72; tPitch = 0.28;
          armLX = 0.65; armLZ = 0.72; foreLX = -0.95;
          armRX = -1.05; armRZ = -0.35; foreRX = -0.45;
        } else {
          // Move 2: Two-Handed Overhead Seismic Slam windup (rear back high!)
          tYaw = 0; tPitch = -0.34;
          armLX = -2.72; armLZ = -0.22; foreLX = -0.42;
          armRX = -2.72; armRZ = 0.22; foreRX = -0.42;
        }
      } else if (strike) {
        if (style === 0) {
          // Move 0: Explosive right hook sweep across front!
          tYaw = 0.88; tPitch = 0.24;
          armRX = -1.42; armRZ = 0.72; foreRX = -0.22;
          armLX = 0.45; armLZ = 0.25; foreLX = -0.55;
        } else if (style === 1) {
          // Move 1: Rising left uppercut smash!
          tYaw = -0.82; tPitch = -0.18;
          armLX = -2.15; armLZ = -0.32; foreLX = -0.18;
          armRX = 0.45; armRZ = -0.25; foreRX = -0.55;
        } else {
          // Move 2: Crushing twin-fist earth smash!
          tYaw = 0; tPitch = 0.48;
          armLX = 0.78; armLZ = -0.15; foreLX = -0.12;
          armRX = 0.78; armRZ = 0.15; foreRX = -0.12;
        }
      }

      const armSpeed = strike ? 20 : windup ? 12 : 10;
      torso.rotation.x = damp(torso.rotation.x, tPitch, armSpeed * 0.85, dt);
      torso.rotation.y = damp(torso.rotation.y, tYaw, armSpeed * 0.9, dt);

      armL.upper.rotation.x = damp(armL.upper.rotation.x, armLX, armSpeed, dt);
      armL.upper.rotation.z = damp(armL.upper.rotation.z, armLZ, armSpeed, dt);
      armL.fore.rotation.x = damp(armL.fore.rotation.x, foreLX, armSpeed, dt);

      armR.upper.rotation.x = damp(armR.upper.rotation.x, armRX, armSpeed, dt);
      armR.upper.rotation.z = damp(armR.upper.rotation.z, armRZ, armSpeed, dt);
      armR.fore.rotation.x = damp(armR.fore.rotation.x, foreRX, armSpeed, dt);

      // Head tracks forward against torso twist so the Golem locks eyes on its victim!
      head.rotation.y = damp(head.rotation.y, -torso.rotation.y * 0.65 + Math.sin(stompT * 0.4) * 0.08, 12, dt);
      head.rotation.x = damp(head.rotation.x, -torso.rotation.x * 0.4, 10, dt);

      // Stone tassets sway naturally
      tassetF.rotation.x = damp(tassetF.rotation.x, -Math.abs(sw) * 0.35 - (strike ? 0.25 : 0), 10, dt);
      tassetL.rotation.z = damp(tassetL.rotation.z, sw * 0.25, 10, dt);
      tassetR.rotation.z = damp(tassetR.rotation.z, -sw * 0.25, 10, dt);

      // Runic heart & orbiting stones flare brighter during attacks!
      const flareK = windup || strike ? 1.35 : 1.0;
      coreOuter.rotation.y += dt * (windup || strike ? 4.2 : 1.5);
      coreInner.rotation.y -= dt * 2.6;
      const pulse = (1 + Math.sin(stompT * 2.5) * 0.08) * flareK;
      coreOuter.scale.set(0.16 * pulse, 0.24 * pulse, 0.10 * pulse);
      runeStoneMat.emissiveIntensity = damp(runeStoneMat.emissiveIntensity, windup || strike ? 2.4 : 1.25, 10, dt);

      orbitGroup.rotation.z += dt * (windup || strike ? 2.8 : 0.85);
      for (let i = 0; i < orbitShards.length; i++) {
        orbitShards[i].rotation.y += dt * 2.2;
        orbitShards[i].position.z = -0.18 + Math.sin(stompT * 2 + i * 2) * 0.08;
      }
    },
    setFlash(v) {
      for (const m of [stoneMat, darkStoneMat, mossMat, bronzeMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [stoneMat, darkStoneMat, runeStoneMat, bronzeMat, mossMat, runeMat, coreHotMat]) m.dispose();
      coreRingGeo.dispose();
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
