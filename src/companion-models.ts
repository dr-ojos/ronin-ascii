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
  /** normalized 0..1 progress within windup or strike for smooth phase-driven choreography */
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
  return makePair('stone-v3', 512, (ac, bc, s) => {
    // Rich dark carved volcanic basalt base
    ac.fillStyle = '#485058'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#7c7c7c'; bc.fillRect(0, 0, s, s);

    // Multi-scale mineral granite grain, mica glints & rocky strata
    for (let i = 0; i < 4200; i++) {
      const x = h2(i * 3.1) * s, y = h2(i * 7.3) * s;
      const rx = 1.5 + h2(i * 11.7) * 9.5, ry = 1.2 + h2(i * 13.9) * 5.2;
      const v = Math.floor(48 + h2(i * 5.9) * 66);
      ac.fillStyle = `rgba(${v},${v + 5},${v + 12},0.26)`;
      ac.beginPath(); ac.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); ac.fill();
      const bv = Math.floor(72 + h2(i * 5.9) * 108);
      bc.fillStyle = `rgba(${bv},${bv},${bv},0.32)`;
      bc.beginPath(); bc.ellipse(x, y, rx, ry, h2(i) * Math.PI, 0, Math.PI * 2); bc.fill();
    }

    // Chiseled temple masonry courses (horizontal + staggered vertical joints) with beveled highlights
    const rows = 4;
    const rh = s / rows;
    for (let r = 0; r < rows; r++) {
      const y = (r + 0.5) * rh;
      ac.strokeStyle = 'rgba(18,22,28,0.62)'; ac.lineWidth = 3.2;
      bc.strokeStyle = 'rgba(18,18,18,0.88)'; bc.lineWidth = 4.2;
      ac.beginPath(); ac.moveTo(0, y); ac.lineTo(s, y); ac.stroke();
      bc.beginPath(); bc.moveTo(0, y); bc.lineTo(s, y); bc.stroke();

      ac.strokeStyle = 'rgba(176,192,208,0.24)'; ac.lineWidth = 2.0;
      bc.strokeStyle = 'rgba(224,224,224,0.52)'; bc.lineWidth = 2.4;
      ac.beginPath(); ac.moveTo(0, y + 3); ac.lineTo(s, y + 3); ac.stroke();
      bc.beginPath(); bc.moveTo(0, y + 3); bc.lineTo(s, y + 3); bc.stroke();

      // Staggered vertical stone seams
      for (let c = 0; c < 3; c++) {
        const vx = ((c + (r % 2 === 0 ? 0.2 : 0.7)) / 3) * s;
        ac.strokeStyle = 'rgba(18,22,28,0.48)'; ac.lineWidth = 2.4;
        bc.strokeStyle = 'rgba(24,24,24,0.78)'; bc.lineWidth = 3.2;
        ac.beginPath(); ac.moveTo(vx, y); ac.lineTo(vx, y + rh); ac.stroke();
        bc.beginPath(); bc.moveTo(vx, y); bc.lineTo(vx, y + rh); bc.stroke();
      }
    }

    // Subtle rain-weathering vertical streaks
    for (let i = 0; i < 65; i++) {
      const x = h2(i * 47.1) * s, y = h2(i * 59.3) * s, len = 35 + h2(i * 19.7) * 90;
      ac.strokeStyle = 'rgba(20,26,32,0.16)'; ac.lineWidth = 2 + h2(i * 8.3) * 3;
      ac.beginPath(); ac.moveTo(x, y); ac.lineTo(x, y + len); ac.stroke();
    }

    // Deep geological fractures
    for (let c = 0; c < 28; c++) {
      let x = h2(c * 19.1) * s, y = h2(c * 23.7) * s;
      ac.strokeStyle = 'rgba(14,18,24,0.74)'; ac.lineWidth = 1.4 + h2(c * 4.3) * 2.4;
      bc.strokeStyle = 'rgba(10,10,10,0.94)'; bc.lineWidth = ac.lineWidth + 1.0;
      ac.beginPath(); bc.beginPath(); ac.moveTo(x, y); bc.moveTo(x, y);
      for (let k = 0; k < 7; k++) {
        x += (h2(c * 31 + k * 7) - 0.5) * 68;
        y += (h2(c * 41 + k * 13) - 0.5) * 68;
        ac.lineTo(x, y); bc.lineTo(x, y);
      }
      ac.stroke(); bc.stroke();
    }

    // Ancient mossy lichen tucked in crevices
    for (let m = 0; m < 44; m++) {
      const x = h2(m * 53.3) * s, y = h2(m * 61.1) * s, r = 10 + h2(m * 17.9) * 28;
      const g = ac.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, 'rgba(64,124,54,0.42)');
      g.addColorStop(0.55, 'rgba(46,94,42,0.20)');
      g.addColorStop(1, 'rgba(46,94,42,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
    }
  });
}

function getBronzeTex(): PbrPair {
  return makePair('bronze-v1', 256, (ac, bc, s) => {
    ac.fillStyle = '#8b6a37'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#848484'; bc.fillRect(0, 0, s, s);
    // Brushed antique bronze grain
    for (let i = 0; i < 420; i++) {
      const y = h2(i * 11.3) * s;
      ac.strokeStyle = h2(i * 3.1) > 0.5 ? 'rgba(220,185,112,0.14)' : 'rgba(54,36,16,0.18)';
      ac.lineWidth = 1.2;
      ac.beginPath(); ac.moveTo(0, y); ac.lineTo(s, y); ac.stroke();
    }
    // Verdigris copper-green patina in aged recesses
    for (let i = 0; i < 30; i++) {
      const x = h2(i * 29.7) * s, y = h2(i * 41.3) * s, r = 6 + h2(i * 9.1) * 18;
      const g = ac.createRadialGradient(x, y, 1, x, y, r);
      g.addColorStop(0, 'rgba(72,148,118,0.34)');
      g.addColorStop(1, 'rgba(72,148,118,0)');
      ac.fillStyle = g; ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
    }
    // Forged rivets along trim bands
    for (let i = 0; i < 8; i++) {
      const rx = (i + 0.5) * (s / 8);
      for (const ry of [32, 224]) {
        ac.fillStyle = '#caa25c'; ac.beginPath(); ac.arc(rx, ry, 5, 0, Math.PI * 2); ac.fill();
        bc.fillStyle = '#e8e8e8'; bc.beginPath(); bc.arc(rx, ry, 5, 0, Math.PI * 2); bc.fill();
      }
    }
  });
}

function getMossTex(): PbrPair {
  return makePair('moss-v2', 256, (ac, bc, s) => {
    ac.fillStyle = '#335d2d'; ac.fillRect(0, 0, s, s);
    bc.fillStyle = '#6c6c6c'; bc.fillRect(0, 0, s, s);
    for (let i = 0; i < 2400; i++) {
      const x = h2(i * 4.7) * s, y = h2(i * 9.3) * s, r = 1.2 + h2(i * 15.1) * 4.2;
      const g = Math.floor(78 + h2(i * 6.3) * 76);
      ac.fillStyle = `rgba(${Math.floor(g * 0.50)},${g},${Math.floor(g * 0.40)},0.48)`;
      ac.beginPath(); ac.arc(x, y, r, 0, Math.PI * 2); ac.fill();
      const bv = Math.floor(74 + h2(i * 6.3) * 136);
      bc.fillStyle = `rgba(${bv},${bv},${bv},0.46)`;
      bc.beginPath(); bc.arc(x, y, r, 0, Math.PI * 2); bc.fill();
    }
  });
}

function getRuneEmissiveTex(): THREE.CanvasTexture {
  const key = 'golem-rune-emissive-v2';
  const hit = texCache.get(key);
  if (hit) return hit.map;
  const s = 512;
  const c = document.createElement('canvas'); c.width = c.height = s;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#000000'; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = '#ffffff'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = '#ffffff'; ctx.shadowBlur = 16;

  for (let row = 0; row < 2; row++) {
    const y = 128 + row * 256;
    // Double parallel temple energy channels
    ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(0, y - 44); ctx.lineTo(s, y - 44); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, y + 44); ctx.lineTo(s, y + 44); ctx.stroke();
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(s, y); ctx.stroke();

    // Intricate carved diamond seal glyphs
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
  // Full hierarchical articulated skeleton:
  //   hips -> waist -> chest -> (neck -> head -> jaw), (shoulderL/R -> upper -> elbow/fore -> wrist -> fingers)
  //   hips -> legL/R (hip -> knee/shin -> ankle/foot)
  const hips = new THREE.Group();
  const waist = new THREE.Group();
  const chest = new THREE.Group();
  root.add(hips);
  hips.add(waist);
  waist.add(chest);

  const sTex = getStoneTex();
  const bTex = getBronzeTex();
  const mTex = getMossTex();
  const rTex = getRuneEmissiveTex();
  const runeCol = new THREE.Color(color);

  const stoneMat = M(0x7c8690, {
    roughness: 0.86, metalness: 0.08, flatShading: true, vertexColors: true,
    map: sTex.map, bumpMap: sTex.bump, bumpScale: 0.056,
  });
  const darkStoneMat = M(0x3a424a, {
    roughness: 0.92, metalness: 0.12, flatShading: true,
    map: sTex.map, bumpMap: sTex.bump, bumpScale: 0.058,
  });
  const runeStoneMat = M(0x4e5964, {
    roughness: 0.80, metalness: 0.16, flatShading: true,
    map: sTex.map, bumpMap: sTex.bump, bumpScale: 0.050,
    emissive: runeCol, emissiveMap: rTex, emissiveIntensity: 1.4,
  });
  const bronzeMat = M(0x9a7842, {
    roughness: 0.34, metalness: 0.84,
    map: bTex.map, bumpMap: bTex.bump, bumpScale: 0.028,
  });
  const mossMat = M(0x42743b, {
    roughness: 0.94, flatShading: true,
    map: mTex.map, bumpMap: mTex.bump, bumpScale: 0.045,
  });
  const jointGlowMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, toneMapped: false });
  const runeMat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
  const coreHotMat = new THREE.MeshBasicMaterial({ color: 0xeafff4, toneMapped: false });

  // ---- Pelvis, patinated bronze belt & articulated stone tassets
  hips.position.set(0, 1.02, 0);
  part(hips, BOX, darkStoneMat, 0, 0.02, 0, 0.78, 0.32, 0.52);
  part(hips, BOX, bronzeMat, 0, 0.13, 0, 0.84, 0.08, 0.56);
  part(hips, OCTA, runeMat, 0, 0.13, 0.29, 0.09, 0.09, 0.05); // belt buckle crystal
  // Glowing energy core visible inside the waist joint!
  part(hips, CYL, jointGlowMat, 0, 0.20, 0, 0.28, 0.12, 0.24);

  const tassetF = new THREE.Group(); tassetF.position.set(0, 0.04, 0.26); hips.add(tassetF);
  part(tassetF, BOX, runeStoneMat, 0, -0.20, 0.02, 0.36, 0.40, 0.10);
  part(tassetF, BOX, bronzeMat, 0, -0.37, 0.02, 0.38, 0.06, 0.12);

  const tassetL = new THREE.Group(); tassetL.position.set(0.42, 0.06, 0); hips.add(tassetL);
  part(tassetL, BOX, darkStoneMat, 0, -0.20, 0, 0.12, 0.38, 0.38);
  part(tassetL, BOX, bronzeMat, 0.02, -0.36, 0, 0.13, 0.055, 0.40);

  const tassetR = new THREE.Group(); tassetR.position.set(-0.42, 0.06, 0); hips.add(tassetR);
  part(tassetR, BOX, darkStoneMat, 0, -0.20, 0, 0.12, 0.38, 0.38);
  part(tassetR, BOX, bronzeMat, -0.02, -0.36, 0, 0.13, 0.055, 0.40);

  // ---- Lower Waist (2-segment spine for fluid kinetic whip!)
  waist.position.set(0, 0.18, 0);
  part(waist, BOX, darkStoneMat, 0, 0.12, 0, 0.62, 0.24, 0.44);
  part(waist, CYL, jointGlowMat, 0, 0.25, 0, 0.32, 0.10, 0.26);

  // ---- Upper Chest Monolith
  chest.position.set(0, 0.24, 0);
  addMesh(chest, golemGeo.chest, stoneMat);
  for (const s of [-1, 1]) {
    const pec = part(chest, BOX, darkStoneMat, s * 0.35, 0.52, 0.39, 0.40, 0.34, 0.18);
    pec.rotation.y = -s * 0.28;
    pec.rotation.z = s * 0.09;
    part(chest, BOX, bronzeMat, s * 0.39, 0.68, 0.36, 0.30, 0.06, 0.14).rotation.y = -s * 0.25;
    // Carved back-plate buttresses
    part(chest, BOX, runeStoneMat, s * 0.30, 0.56, -0.36, 0.32, 0.42, 0.16).rotation.y = s * 0.22;
  }
  part(chest, BOX, darkStoneMat, 0, 0.86, -0.06, 1.12, 0.24, 0.60);
  part(chest, DODECA, mossMat, 0, 0.98, -0.22, 0.44, 0.17, 0.30);

  // Gimbaled Ancient Runic Heart Core (counter-rotating bronze + energy rings around blazing heart)
  part(chest, BOX, darkStoneMat, 0, 0.46, 0.42, 0.40, 0.48, 0.15);
  const coreRingGeo = new THREE.TorusGeometry(0.20, 0.032, 8, 22);
  const coreRingOuter = new THREE.Mesh(coreRingGeo, bronzeMat);
  coreRingOuter.position.set(0, 0.46, 0.51);
  chest.add(coreRingOuter);
  const coreRingInnerGeo = new THREE.TorusGeometry(0.14, 0.016, 6, 18);
  const coreRingInner = new THREE.Mesh(coreRingInnerGeo, runeMat);
  coreRingInner.position.set(0, 0.46, 0.52);
  chest.add(coreRingInner);
  const coreOuter = part(chest, OCTA, runeMat, 0, 0.46, 0.52, 0.14, 0.21, 0.10);
  const coreInner = part(chest, OCTA, coreHotMat, 0, 0.46, 0.53, 0.075, 0.12, 0.06);

  // Orbiting ancient rune stones floating behind the shoulders
  const orbitGroup = new THREE.Group();
  orbitGroup.position.set(0, 0.84, -0.38);
  chest.add(orbitGroup);
  const orbitShards: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const sh = part(orbitGroup, OCTA, runeMat, Math.cos(a) * 0.68, Math.sin(a) * 0.28, -0.18, 0.068, 0.15, 0.052);
    orbitShards.push(sh);
  }

  // ---- Articulated Neck, Guardian Monolith Head & Articulated Stone Jaw
  const neck = new THREE.Group();
  neck.position.set(0, 0.96, 0.10);
  chest.add(neck);
  part(neck, CYL, jointGlowMat, 0, 0.04, 0, 0.18, 0.12, 0.18);

  const head = new THREE.Group();
  head.position.set(0, 0.10, 0.04);
  neck.add(head);
  part(head, DODECA, darkStoneMat, 0, 0.14, 0, 0.34, 0.29, 0.32);
  part(head, BOX, stoneMat, 0, 0.25, 0.16, 0.36, 0.11, 0.18);   // carved brow helm
  part(head, BOX, bronzeMat, 0, 0.30, 0.15, 0.28, 0.048, 0.12); // bronze forehead plate
  part(head, DODECA, mossMat, 0, 0.35, -0.05, 0.30, 0.12, 0.26);
  // Sculpted cheek guards
  for (const s of [-1, 1]) {
    part(head, BOX, stoneMat, s * 0.18, 0.08, 0.14, 0.09, 0.18, 0.18).rotation.y = s * 0.28;
    const horn = addMesh(head, golemGeo.headCrown, stoneMat, s * 0.18, 0.24, 0.0, -0.22, 0, -s * 0.44);
    horn.scale.setScalar(1.0);
    part(head, BOX, runeMat, s * 0.10, 0.13, 0.27, 0.098, 0.044, 0.04);
    part(head, BOX, coreHotMat, s * 0.10, 0.13, 0.285, 0.052, 0.022, 0.02);
  }
  const jaw = new THREE.Group();
  jaw.position.set(0, 0.02, 0.08);
  head.add(jaw);
  part(jaw, BOX, stoneMat, 0, -0.05, 0.08, 0.26, 0.11, 0.18);
  part(jaw, BOX, bronzeMat, 0, -0.09, 0.14, 0.18, 0.04, 0.08);

  // ---- Articulated Clavicle/Shoulder + 3-Joint Arm (Upper -> Forearm -> Wrist + Articulated Fingers)
  const makeArm = (sx: number) => {
    const clavicle = new THREE.Group();
    clavicle.position.set(sx * 0.86, 0.78, 0);
    chest.add(clavicle);

    // Floating boulder pauldron attached to clavicle so it shrugs & rolls independently!
    part(clavicle, DODECA, stoneMat, sx * 0.04, 0.10, 0, 0.46, 0.38, 0.46);
    part(clavicle, BOX, bronzeMat, sx * 0.04, -0.09, 0, 0.52, 0.068, 0.50);
    part(clavicle, DODECA, mossMat, sx * 0.08, 0.32, -0.04, 0.33, 0.16, 0.31);
    const c1 = part(clavicle, OCTA, runeMat, -sx * 0.10, 0.42, -0.04, 0.095, 0.28, 0.095);
    c1.rotation.z = -sx * 0.32;
    const c2 = part(clavicle, OCTA, coreHotMat, sx * 0.10, 0.36, 0.08, 0.055, 0.18, 0.055);
    c2.rotation.z = -sx * 0.52;
    part(clavicle, SPHERE, jointGlowMat, sx * 0.08, -0.10, 0, 0.16, 0.16, 0.16);

    const upper = new THREE.Group();
    upper.position.set(sx * 0.14, -0.12, 0);
    clavicle.add(upper);
    part(upper, BOX, darkStoneMat, 0, -0.26, 0, 0.34, 0.50, 0.34);
    part(upper, BOX, bronzeMat, 0, -0.44, 0, 0.38, 0.075, 0.38);
    part(upper, SPHERE, jointGlowMat, 0, -0.52, 0, 0.15, 0.15, 0.15);

    const fore = new THREE.Group();
    fore.position.set(0, -0.54, 0);
    upper.add(fore);
    const gauntlet = addMesh(fore, golemGeo.gauntlet, runeStoneMat, 0, -0.30, 0.03, Math.PI / 2, 0, 0);
    gauntlet.scale.set(1.24, 1.32, 1.24);
    part(fore, BOX, bronzeMat, 0, -0.08, 0, 0.43, 0.075, 0.43);
    part(fore, OCTA, runeMat, sx * 0.25, -0.30, 0.10, 0.085, 0.19, 0.075);

    const wrist = new THREE.Group();
    wrist.position.set(0, -0.54, 0.04);
    fore.add(wrist);
    part(wrist, DODECA, stoneMat, 0, -0.08, 0.04, 0.32, 0.22, 0.30);
    part(wrist, BOX, runeMat, 0, -0.06, 0.22, 0.24, 0.045, 0.04); // knuckle rune bar

    // Articulated finger cluster (curls tightly into a fist during combat, relaxes when idle!)
    const fingers = new THREE.Group();
    fingers.position.set(0, -0.16, 0.16);
    wrist.add(fingers);
    for (let k = -1; k <= 1; k++) {
      part(fingers, BOX, darkStoneMat, k * 0.105, -0.10, 0, 0.085, 0.20, 0.10);
    }
    const thumb = part(wrist, BOX, darkStoneMat, -sx * 0.22, -0.16, 0.10, 0.09, 0.16, 0.09);
    thumb.rotation.z = sx * 0.45;

    return { clavicle, upper, fore, wrist, fingers };
  };
  const armL = makeArm(1);
  const armR = makeArm(-1);

  // ---- Full 3-Joint Articulated Legs (Hip -> Knee/Shin -> Ankle/Foot)
  const makeLeg = (sx: number) => {
    const hip = new THREE.Group();
    hip.position.set(sx * 0.36, -0.06, 0);
    hips.add(hip);
    part(hip, SPHERE, jointGlowMat, 0, -0.02, 0, 0.15, 0.15, 0.15);
    part(hip, BOX, darkStoneMat, 0, -0.26, 0, 0.36, 0.48, 0.38);
    part(hip, DODECA, stoneMat, 0, -0.46, 0.16, 0.22, 0.18, 0.18); // knee boulder
    part(hip, SPHERE, jointGlowMat, 0, -0.50, 0, 0.14, 0.14, 0.14);

    const shin = new THREE.Group();
    shin.position.set(0, -0.50, 0);
    hip.add(shin);
    part(shin, BOX, runeStoneMat, 0, -0.20, 0.03, 0.39, 0.38, 0.42);
    part(shin, BOX, bronzeMat, 0, -0.32, 0.04, 0.43, 0.065, 0.46);
    part(shin, BOX, mossMat, 0, -0.04, 0.22, 0.26, 0.11, 0.09);

    const ankle = new THREE.Group();
    ankle.position.set(0, -0.40, 0.04);
    shin.add(ankle);
    part(ankle, BOX, stoneMat, 0, -0.03, 0.10, 0.42, 0.15, 0.38);
    part(ankle, BOX, darkStoneMat, 0, -0.05, 0.26, 0.36, 0.10, 0.12); // armored toe slab
    return { hip, shin, ankle };
  };
  const legL = makeLeg(1);
  const legR = makeLeg(-1);

  mangaFinish(root);
  const ui = finalizeCompanionRoot(root, color, 3.12, 1.50);
  let stompT = 0;
  let moveBlend = 0;

  // Smooth easing helpers for cinematic combat anticipation & impact follow-through
  const easeOutCubic = (x: number) => 1 - Math.pow(1 - THREE.MathUtils.clamp(x, 0, 1), 3);
  const easeInOutSine = (x: number) => 0.5 - 0.5 * Math.cos(Math.PI * THREE.MathUtils.clamp(x, 0, 1));

  return {
    root,
    ring: ui.ring,
    hpBarGroup: ui.hpBarGroup,
    hpFill: ui.hpFill,
    hpBarY: 3.12,
    update(dt, o) {
      moveBlend = damp(moveBlend, o.moving, 7.5, dt);
      stompT += dt * (1.6 + moveBlend * (1.4 + o.speed * 0.78));

      const windup = o.state === 'windup';
      const strike = o.state === 'strike';
      const style = (o.attackStyle ?? 2) % 3;
      const p = THREE.MathUtils.clamp(o.attackProg ?? 0.5, 0, 1);

      // Weighted bipedal walk cycle (smooth phase-shifted hip, knee, ankle heel-to-toe roll!)
      const phL = stompT;
      const phR = stompT + Math.PI;
      const walkHipL = Math.sin(phL) * 0.52 * moveBlend;
      const walkHipR = Math.sin(phR) * 0.52 * moveBlend;
      const walkKneeL = Math.max(0, -Math.cos(phL)) * 0.64 * moveBlend;
      const walkKneeR = Math.max(0, -Math.cos(phR)) * 0.64 * moveBlend;
      // Foot levels out during swing and pushes off at trailing edge
      const walkAnkleL = -walkHipL * 0.55 - walkKneeL * 0.45;
      const walkAnkleR = -walkHipR * 0.55 - walkKneeR * 0.45;

      // Default idle breathing + walk targets
      let hipsY = 1.02 + Math.abs(Math.sin(stompT)) * 0.085 * moveBlend + Math.sin(stompT * 1.1) * 0.018 * (1 - moveBlend);
      let hipsX = -Math.sin(stompT) * 0.065 * moveBlend; // lateral weight transfer onto planted foot!
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
        fingerCurlL = 1.15; fingerCurlR = 1.15;
        jawOpen = 0.18 * e;
        if (style === 0) {
          // Move 0: Right Heavy Haymaker coil (hips plant, waist & chest wind back right, right shoulder drops)
          hipsY = 1.02 - 0.14 * e; hipsPitch = 0.12 * e; hipsRoll = -0.14 * e;
          waistYaw = -0.38 * e; chestYaw = -0.58 * e; chestPitch = 0.14 * e;
          clavRZ = -0.22 * e; clavLZ = 0.14 * e;
          armRX = 0.65 * e; armRZ = -0.95 * e; foreRX = -1.05 * e; wristRX = 0.25 * e;
          armLX = -1.05 * e; armLZ = 0.40 * e; foreLX = -0.65 * e;
          legHipL = -0.34 * e; legKneeL = 0.42 * e; legAnkleL = -0.08 * e;
          legHipR = 0.32 * e; legKneeR = 0.28 * e; legAnkleR = -0.50 * e;
        } else if (style === 1) {
          // Move 1: Left Crushing Uppercut coil (deep crouch left, left fist cocked low by knee)
          hipsY = 1.02 - 0.20 * e; hipsPitch = 0.22 * e; hipsRoll = 0.16 * e;
          waistYaw = 0.36 * e; chestYaw = 0.52 * e; chestPitch = 0.24 * e;
          clavLZ = 0.24 * e; clavRZ = -0.14 * e;
          armLX = 0.78 * e; armLZ = 0.72 * e; foreLX = -1.18 * e; wristLX = 0.30 * e;
          armRX = -1.15 * e; armRZ = -0.38 * e; foreRX = -0.52 * e;
          legHipL = 0.34 * e; legKneeL = 0.36 * e; legAnkleL = -0.52 * e;
          legHipR = -0.36 * e; legKneeR = 0.44 * e; legAnkleR = -0.08 * e;
        } else {
          // Move 2: Two-Handed Overhead Seismic Slam (heroic arch backward, shoulders shrug high, fists lock overhead!)
          hipsY = 1.02 + 0.10 * e; hipsPitch = -0.12 * e;
          waistPitch = -0.16 * e; chestPitch = -0.28 * e;
          clavLY = 0.14 * e; clavRY = 0.14 * e; clavLZ = 0.26 * e; clavRZ = -0.26 * e;
          armLX = -2.85 * e; armLZ = -0.24 * e; foreLX = -0.48 * e;
          armRX = -2.85 * e; armRZ = 0.24 * e; foreRX = -0.48 * e;
          legHipL = -0.22 * e; legKneeL = 0.30 * e; legAnkleL = -0.08 * e;
          legHipR = -0.22 * e; legKneeR = 0.30 * e; legAnkleR = -0.08 * e;
          jawOpen = 0.34 * e;
        }
      } else if (strike) {
        // Fast explosive snap (0..0.38), heavy impact hold & recoil settle (0.38..1.0)
        const snap = p < 0.38 ? easeOutCubic(p / 0.38) : 1 - 0.18 * easeInOutSine((p - 0.38) / 0.62);
        fingerCurlL = 1.25; fingerCurlR = 1.25;
        jawOpen = 0.28 * (1 - p * 0.6);
        if (style === 0) {
          // Explosive right hook whip-through!
          hipsY = 1.02 - 0.06 * snap; hipsRoll = 0.18 * snap; hipsPitch = 0.14 * snap;
          waistYaw = 0.44 * snap; chestYaw = 0.64 * snap; chestPitch = 0.20 * snap;
          clavRY = 0.06 * snap; clavRZ = 0.20 * snap;
          armRX = -1.52 * snap; armRZ = 0.88 * snap; foreRX = -0.18 * snap; wristRX = -0.20 * snap;
          armLX = 0.58 * snap; armLZ = 0.28 * snap; foreLX = -0.62 * snap;
          legHipL = 0.36 * snap; legKneeL = 0.22 * snap; legAnkleL = -0.48 * snap;
          legHipR = -0.32 * snap; legKneeR = 0.44 * snap; legAnkleR = -0.12 * snap;
        } else if (style === 1) {
          // Rising left uppercut drive!
          hipsY = 1.02 + 0.10 * snap; hipsRoll = -0.18 * snap; hipsPitch = -0.10 * snap;
          waistYaw = -0.42 * snap; chestYaw = -0.56 * snap; chestPitch = -0.18 * snap;
          clavLY = 0.14 * snap; clavLZ = -0.18 * snap;
          armLX = -2.35 * snap; armLZ = -0.34 * snap; foreLX = -0.14 * snap; wristLX = -0.25 * snap;
          armRX = 0.56 * snap; armRZ = -0.26 * snap; foreRX = -0.62 * snap;
          legHipL = -0.30 * snap; legKneeL = 0.38 * snap; legAnkleL = -0.10 * snap;
          legHipR = 0.34 * snap; legKneeR = 0.20 * snap; legAnkleR = -0.46 * snap;
        } else {
          // Crushing twin-fist earth smash + ground compression!
          hipsY = 1.02 - 0.24 * snap; hipsPitch = 0.22 * snap;
          waistPitch = 0.24 * snap; chestPitch = 0.36 * snap;
          clavLY = -0.10 * snap; clavRY = -0.10 * snap; clavLZ = -0.16 * snap; clavRZ = 0.16 * snap;
          armLX = 0.86 * snap; armLZ = -0.16 * snap; foreLX = -0.12 * snap;
          armRX = 0.86 * snap; armRZ = 0.16 * snap; foreRX = -0.12 * snap;
          legHipL = -0.38 * snap; legKneeL = 0.62 * snap; legAnkleL = -0.22 * snap;
          legHipR = -0.38 * snap; legKneeR = 0.62 * snap; legAnkleR = -0.22 * snap;
          jawOpen = 0.42 * (1 - p * 0.5);
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

      // Head & neck counter-rotate smoothly to lock eyes on the target
      const totalTwist = waist.rotation.y + chest.rotation.y;
      const totalPitch = hips.rotation.x + waist.rotation.x + chest.rotation.x;
      neck.rotation.y = damp(neck.rotation.y, -totalTwist * 0.45, 13, dt);
      head.rotation.y = damp(head.rotation.y, -totalTwist * 0.35 + Math.sin(stompT * 0.35) * 0.06 * (1 - moveBlend), 13, dt);
      head.rotation.x = damp(head.rotation.x, -totalPitch * 0.55, 12, dt);
      jaw.rotation.x = damp(jaw.rotation.x, jawOpen, 14, dt);

      // Tassets react with secondary lag
      tassetF.rotation.x = damp(tassetF.rotation.x, -Math.abs(walkHipL) * 0.45 - (strike ? 0.32 : 0), 11, dt);
      tassetL.rotation.z = damp(tassetL.rotation.z, walkHipL * 0.28 + hipsRoll * 0.4, 11, dt);
      tassetR.rotation.z = damp(tassetR.rotation.z, -walkHipR * 0.28 + hipsRoll * 0.4, 11, dt);

      // Gimbaled runic heart & orbiting stones accelerate & flare on attacks!
      const combatEnergy = windup || strike ? 1 : 0;
      coreRingOuter.rotation.z += dt * (combatEnergy ? 2.4 : 0.65);
      coreRingInner.rotation.x += dt * (combatEnergy ? 3.6 : 1.1);
      coreRingInner.rotation.y += dt * (combatEnergy ? 2.8 : 0.9);
      coreOuter.rotation.y += dt * (combatEnergy ? 4.8 : 1.6);
      coreInner.rotation.y -= dt * 3.0;
      const pulse = (1 + Math.sin(stompT * 2.6) * 0.08) * (combatEnergy ? 1.32 : 1.0);
      coreOuter.scale.set(0.14 * pulse, 0.21 * pulse, 0.10 * pulse);
      runeStoneMat.emissiveIntensity = damp(runeStoneMat.emissiveIntensity, combatEnergy ? 2.6 : 1.35, 10, dt);

      orbitGroup.rotation.z += dt * (combatEnergy ? 3.2 : 0.9);
      for (let i = 0; i < orbitShards.length; i++) {
        orbitShards[i].rotation.y += dt * 2.4;
        orbitShards[i].position.z = -0.18 + Math.sin(stompT * 2.2 + i * 2.1) * 0.09;
      }
    },
    setFlash(v) {
      for (const m of [stoneMat, darkStoneMat, mossMat, bronzeMat]) m.emissive.setScalar(v);
    },
    setHpFrac: ui.setHpFrac,
    dispose() {
      for (const m of [stoneMat, darkStoneMat, runeStoneMat, bronzeMat, mossMat, jointGlowMat, runeMat, coreHotMat]) m.dispose();
      coreRingGeo.dispose(); coreRingInnerGeo.dispose();
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
