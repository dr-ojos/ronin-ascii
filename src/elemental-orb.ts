// Ranged elemental orb attack on Ñ:
//   - Press Ñ to gather elemental energy in front of the warrior (cinematic charge-up) and hurl an orb.
//   - Press SHIFT+Ñ to switch between Fuego (炎), Rayo (雷), Agua (水), and Viento (風).
//   - Holds up to 3 charges with a dedicated special recharge (passive + boosted by melee hits and kills).
//   - Each element has bespoke 3D art (core, orbiting rings/blades/arcs, summoning seal, trails, dynamic light)
//     and its own cinematic impact & combat identity.
import * as THREE from 'three';
import { camera, scene } from './renderer';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { onPlayerHit, spirit } from './battle';
import { bossHit, damageTaken } from './boss-mechanics';
import { burst, impactRing } from './fx';
import { flare } from './flare';
import { sparkBurst } from './katana-fx';
import { CLS, tagMat } from './materials';
import { collidersAt } from './physics';
import { panOf, sfx } from './sfx';
import { player, state } from './state';
import { surfaceY } from './structures';
import { dmgMult } from './upgrades';
import { weapon } from './weapons';
import { weaponDmg } from './weapon-upgrades';
import { critMult, rollCrit } from './progression';
import { showMsg } from './hud';
import { impactFlash, rangedPulse, screenSlash } from './cinematic';
import { rnd } from './utils';
import type { Enemy } from './types';
import {
  makeCrescentSlashMat, makeEnergyPillarMat, makeFireBladeMat, makeFresnelShellMat,
  makeLiquidOrbMat, makePlasmaOrbMat, makeShockRingMat, makeSolarOrbMat,
  makeWaterWaveBodyMat, makeWindGaleMat, mandalaTex, spawnCinematicBolt,
  spawnFireOrbDetonation, spawnMiniArc, spawnWaterSplashCrown, spawnWindGaleBurst,
} from './vfx-art';

export type OrbElement = 'fuego' | 'rayo' | 'agua' | 'viento';
export const ORB_ELEMENTS: readonly OrbElement[] = ['fuego', 'rayo', 'agua', 'viento'];

export const MAX_RANGED_CHARGES = 3;
const RECHARGE_TIME = 22;     // slower dedicated recharge per orb (seconds)
const CHARGE_DUR = 0.45;      // pre-launch gathering animation before the orb fires
const AUTO_AIM_RANGE = 28;    // metres to lock onto an oni

export const ORB_INFO: Record<OrbElement, {
  name: string; short: string; kanji: string; cost: number; desc: string;
  color: number; core: number; rim: number;
  speed: number; range: number; dmg: number; radius: number;
}> = {
  fuego:  { name: 'Bola de Fuego',    short: 'Fuego',  kanji: '炎', cost: 2,
    desc: 'Ataque a distancia (Ñ · 3 cargas). Arroja una esfera solar que estalla en 4 m y quema a los onis.',
    color: 0xff6b2b, core: 0xfff5cc, rim: 0xff2200, speed: 24, range: 26, dmg: 2.3, radius: 4.2 },
  rayo:   { name: 'Orbe de Rayo',     short: 'Rayo',   kanji: '雷', cost: 3,
    desc: 'Ataque a distancia (Ñ · 3 cargas). Lanza plasma veloz que aturde y encadena rayos hasta a 2 onis cercanos.',
    color: 0x7ec8ff, core: 0xffffff, rim: 0x3b68ff, speed: 34, range: 28, dmg: 2.1, radius: 2.2 },
  agua:   { name: 'Esfera de Agua',   short: 'Agua',   kanji: '水', cost: 3,
    desc: 'Ataque a distancia (Ñ · 3 cargas). Una ola expansiva empuja a los onis y te cura al impactar.',
    color: 0x38c6ff, core: 0xe6faff, rim: 0x0b5eff, speed: 22, range: 25, dmg: 2.0, radius: 4.5 },
  viento: { name: 'Ciclón de Viento', short: 'Viento', kanji: '風', cost: 2,
    desc: 'Ataque a distancia (Ñ · 3 cargas). Un ciclón de cuchillas atraviesa a todos los onis en línea recta.',
    color: 0x7effc4, core: 0xf2fff8, rim: 0x1aa874, speed: 29, range: 29, dmg: 1.9, radius: 2.1 },
};

// ------------------------------------------------------------ shared geometries & light
const SPHERE = new THREE.SphereGeometry(1, 16, 12);
const LIQUID_SPHERE = new THREE.SphereGeometry(1, 28, 20);
const DROP_GEO = new THREE.SphereGeometry(1, 10, 8);
const TORUS = new THREE.TorusGeometry(1, 0.09, 6, 28);
const TORUS_THIN = new THREE.TorusGeometry(1, 0.045, 5, 28);
const ARC = new THREE.RingGeometry(0.68, 1, 24, 1, 0, Math.PI * 0.88);
const CONE = new THREE.ConeGeometry(0.28, 1, 5);
const BOX = new THREE.BoxGeometry(1, 1, 1);
const COLUMN = new THREE.CylinderGeometry(1, 1, 1, 16, 1, true);
const tmpA = new THREE.Vector3();
const tmpB = new THREE.Vector3();

const glowMat = (c: number, opacity = 1) => tagMat(new THREE.MeshBasicMaterial({
  color: c, transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
}), CLS.fx);

// single persistent dynamic light (no shader recompiles mid-fight)
const orbLight = new THREE.PointLight(0xff6b2b, 0, 26, 1.5);
scene.add(orbLight);
let impactLightT = 0, impactLightI = 0, impactLightColor = 0xff6b2b;
const impactLightPos = new THREE.Vector3();

function flashLight(at: THREE.Vector3, color: number, intensity = 75, life = 0.35) {
  impactLightPos.copy(at).setY(at.y + 1.4);
  impactLightColor = color;
  impactLightI = intensity;
  impactLightT = life;
}

// ------------------------------------------------------------ transient 3D props
interface Prop {
  obj: THREE.Object3D;
  mats: THREE.Material[];
  t: number;
  life: number;
  tick?: (p: Prop, dt: number) => void;
}
const props: Prop[] = [];

function addProp(obj: THREE.Object3D, mats: THREE.Material[], life: number, tick?: Prop['tick']) {
  scene.add(obj);
  const p: Prop = { obj, mats, t: 0, life, tick };
  props.push(p);
  return p;
}
function removeProp(p: Prop) {
  scene.remove(p.obj);
  for (const m of p.mats) m.dispose();
}

function orient(m: THREE.Object3D, a: THREE.Vector3, b: THREE.Vector3, w: number, h = w) {
  const len = Math.max(0.01, a.distanceTo(b));
  m.position.copy(a).lerp(b, 0.5);
  m.lookAt(b);
  m.scale.set(w, h, len);
}

const PLANE_2 = new THREE.PlaneGeometry(2, 2);

function spawnRing(at: THREE.Vector3, color: number, r: number, life = 0.42, opacity = 0.85, normal?: THREE.Vector3) {
  const mat = makeShockRingMat(0xffffff, color, opacity);
  const m = new THREE.Mesh(PLANE_2, mat);
  m.position.copy(at);
  if (normal) m.lookAt(tmpA.copy(at).add(normal));
  else m.rotation.x = -Math.PI / 2;
  addProp(m, [mat], life, p => {
    const k = p.t / p.life;
    m.scale.setScalar(0.25 + r * (1 - (1 - k) ** 3));
    mat.uniforms.uOpacity.value = opacity * (1 - k);
  });
}

function spawnPillar(at: THREE.Vector3, color: number, h: number, w: number, life = 0.5, opacity = 0.72) {
  const mat = makeEnergyPillarMat(0xffffff, color, opacity);
  const m = new THREE.Mesh(COLUMN, mat);
  m.position.set(at.x, at.y + h * 0.5, at.z);
  m.scale.set(w, 0.01, w);
  addProp(m, [mat], life, p => {
    const k = p.t / p.life;
    m.scale.set(w * (1 - k * 0.75), h * Math.min(1, p.t / 0.05 + 0.02), w * (1 - k * 0.75));
    mat.uniforms.uOpacity.value = opacity * (1 - k);
  });
}

function spawnCrescent(at: THREE.Vector3, color: number, r: number, yaw: number, roll: number, life = 0.34) {
  const mat = makeCrescentSlashMat(0xffffff, color, 0.95);
  const m = new THREE.Mesh(PLANE_2, mat);
  const g = new THREE.Group();
  m.rotation.x = -Math.PI / 2;
  g.add(m);
  g.position.copy(at);
  g.rotation.set(0, yaw, roll);
  g.scale.setScalar(r * 0.75);
  addProp(g, [mat], life, p => {
    const k = p.t / p.life;
    g.scale.setScalar(r * (0.75 + 0.45 * k));
    mat.uniforms.uOpacity.value = 0.95 * (1 - k * k);
  });
}

/** volumetric jagged 3D lightning arc between two points (chain lightning and flight crackle) */
function spawnArc(a: THREE.Vector3, b: THREE.Vector3, color: number, coreColor = 0xffffff, segs = 7, jitter = 0.55, life = 0.34) {
  spawnMiniArc(a, b, coreColor, color, { steps: segs, spread: jitter, radius: 0.055, life, fork: segs >= 6 });
}

/** vertical arcane summoning seal that opens in front of the warrior during the charge-up */
function buildSeal(color: number, coreColor: number, r = 1.25) {
  const outer = new THREE.Group();
  const spin = new THREE.Group();
  outer.add(spin);
  const mat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color, transparent: true, opacity: 0.88,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const coreMat = tagMat(new THREE.MeshBasicMaterial({
    map: mandalaTex, color: coreColor, transparent: true, opacity: 0.65,
    depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
  }), CLS.fx);
  const outerDisc = new THREE.Mesh(PLANE_2, mat);
  outerDisc.scale.setScalar(r);
  const innerDisc = new THREE.Mesh(PLANE_2, coreMat);
  innerDisc.scale.setScalar(r * 0.62);
  innerDisc.position.z = 0.02;
  spin.add(outerDisc, innerDisc);
  return { outer, spin, mats: [mat, coreMat] };
}

// ------------------------------------------------------------ bespoke 3D elemental orb art
interface OrbVisual {
  root: THREE.Group;
  mats: THREE.Material[];
  animate: (dt: number, t: number) => void;
}

function buildOrbVisual(el: OrbElement): OrbVisual {
  const info = ORB_INFO[el];
  const root = new THREE.Group();
  const mats: THREE.Material[] = [];
  const mk = (c: number, op = 1) => { const m = glowMat(c, op); mats.push(m); return m; };

  const coreMat = mk(info.core, 0.98);
  const bodyMat = mk(info.color, 0.72);
  const rimMat = mk(info.rim, 0.55);

  if (el === 'fuego') {
    // Living vertex-displaced solar magma sphere + turbulent flame corona + counter-rotating fire rings + 6 flame fins
    const solarMat = makeSolarOrbMat(0.96);
    const flameMat = makeFireBladeMat(0xfff5c0, info.color, 0xc81a00, 0.88);
    mats.push(solarMat, flameMat);

    const solarBody = new THREE.Mesh(LIQUID_SPHERE, solarMat); solarBody.scale.setScalar(0.54); root.add(solarBody);
    const ringA = new THREE.Mesh(TORUS, flameMat); ringA.scale.setScalar(0.8); root.add(ringA);
    const ringB = new THREE.Mesh(TORUS_THIN, rimMat); ringB.scale.setScalar(0.98); root.add(ringB);
    const fins = new THREE.Group();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const fin = new THREE.Mesh(CONE, flameMat);
      fin.position.set(Math.cos(a) * 0.64, Math.sin(a) * 0.64, -0.2);
      fin.rotation.set(-Math.PI * 0.35, 0, a - Math.PI / 2);
      fin.scale.set(0.38, 0.72, 0.38);
      fins.add(fin);
    }
    root.add(fins);
    return {
      root, mats,
      animate(dt, t) {
        const pulse = 1 + 0.09 * Math.sin(t * 24);
        solarBody.scale.setScalar(0.54 * pulse);
        solarBody.rotation.x += dt * 4.5; solarBody.rotation.y += dt * 6.5;
        ringA.rotation.x += dt * 7; ringA.rotation.y += dt * 5;
        ringB.rotation.y -= dt * 8.5; ringB.rotation.z += dt * 5.5;
        fins.rotation.z += dt * 10;
      },
    };
  }

  if (el === 'rayo') {
    // High-voltage vertex-displaced plasma core + crackling electric veins + 3 orbital rings + 5 snapping arcs
    const plasmaMat = makePlasmaOrbMat(0.96);
    mats.push(plasmaMat);
    const core = new THREE.Mesh(SPHERE, coreMat); core.scale.setScalar(0.28); root.add(core);
    const plasma = new THREE.Mesh(LIQUID_SPHERE, plasmaMat); plasma.scale.setScalar(0.56); root.add(plasma);
    const arcs: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(TORUS_THIN, i === 0 ? coreMat : bodyMat);
      r.scale.setScalar(0.72 + i * 0.16);
      r.rotation.set(i * 1.1, i * 0.8, 0);
      root.add(r);
      arcs.push(r);
    }
    const needles: THREE.Mesh[] = [];
    for (let i = 0; i < 5; i++) {
      const n = new THREE.Mesh(BOX, i % 2 ? coreMat : rimMat);
      n.scale.set(0.045, 0.045, 1.48);
      root.add(n);
      needles.push(n);
    }
    return {
      root, mats,
      animate(dt, t) {
        const snap = Math.sin(t * 62) > 0 ? 1.12 : 0.9;
        core.scale.setScalar(0.28 * snap);
        plasma.rotation.x += dt * 10; plasma.rotation.y -= dt * 8;
        arcs.forEach((a, i) => {
          a.rotation.x += dt * (13 + i * 5) * (i % 2 ? -1 : 1);
          a.rotation.y += dt * (10 + i * 4);
        });
        for (const n of needles) {
          if (Math.random() < 0.6) n.rotation.set(rnd(0, Math.PI), rnd(0, Math.PI), rnd(0, Math.PI));
        }
      },
    };
  }

  if (el === 'agua') {
    // Living vertex-displaced liquid water sphere + spiraling tidal ribbons + undulating teardrop droplets
    const liquidMat = makeLiquidOrbMat(0.94);
    const ribbonMat = makeWaterWaveBodyMat({ opacity: 0.88, seed: 2.1, fanFade: true });
    mats.push(liquidMat, ribbonMat);

    const hydroBody = new THREE.Mesh(LIQUID_SPHERE, liquidMat);
    hydroBody.scale.setScalar(0.56);
    root.add(hydroBody);

    const innerGlow = new THREE.Mesh(SPHERE, coreMat);
    innerGlow.scale.setScalar(0.24);
    root.add(innerGlow);

    const ribbons = new THREE.Group();
    for (let i = 0; i < 2; i++) {
      const arc = new THREE.Mesh(ARC, ribbonMat);
      arc.scale.setScalar(0.96);
      arc.rotation.set(Math.PI * 0.34 * (i ? -1 : 1), i * Math.PI, 0);
      ribbons.add(arc);
    }
    root.add(ribbons);

    const drops = new THREE.Group();
    const dropMeshes: THREE.Mesh[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const d = new THREE.Mesh(DROP_GEO, i % 2 ? coreMat : bodyMat);
      d.scale.set(0.095, 0.095, 0.18);
      d.position.set(Math.cos(a) * 0.86, Math.sin(a * 2) * 0.28, Math.sin(a) * 0.86);
      d.rotation.y = -a;
      drops.add(d);
      dropMeshes.push(d);
    }
    root.add(drops);

    return {
      root, mats,
      animate(dt, t) {
        // Organic liquid breathing & slosh wobble
        hydroBody.scale.set(
          0.56 * (1 + 0.07 * Math.sin(t * 11)),
          0.56 * (1 + 0.07 * Math.cos(t * 13)),
          0.56 * (1 + 0.06 * Math.sin(t * 9 + 1.2)),
        );
        hydroBody.rotation.y += dt * 3.2;
        hydroBody.rotation.x += dt * 1.8;
        innerGlow.scale.setScalar(0.24 * (1 + 0.12 * Math.sin(t * 16)));
        ribbons.rotation.z += dt * 7.5;
        ribbons.rotation.y += dt * 4.2;
        drops.rotation.y -= dt * 6.5;
        drops.rotation.x = Math.sin(t * 4.5) * 0.32;
        for (let i = 0; i < dropMeshes.length; i++) {
          dropMeshes[i].position.y = Math.sin(t * 9 + i * 1.1) * 0.32;
        }
      },
    };
  }

  // viento: compressed aerodynamic emerald cyclone + 3 razor-sharp gale blades + spiral slipstream vortex
  const windMat = makeWindGaleMat({ opacity: 0.94, seed: 1.7 });
  const eyeMat = makeFresnelShellMat(0xf4fff9, info.color, 0.85, 1.8);
  mats.push(windMat, eyeMat);
  const core = new THREE.Mesh(SPHERE, eyeMat); core.scale.setScalar(0.38); root.add(core);
  const vortex = new THREE.Mesh(TORUS_THIN, windMat); vortex.scale.setScalar(0.92); root.add(vortex);
  const blades = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const b = new THREE.Mesh(ARC, windMat);
    b.scale.setScalar(1.06);
    b.rotation.set(Math.PI / 2, 0, a);
    blades.add(b);
  }
  root.add(blades);
  const halo = new THREE.Mesh(TORUS_THIN, bodyMat); halo.scale.setScalar(0.66); halo.rotation.x = Math.PI / 2; root.add(halo);
  return {
    root, mats,
    animate(dt, t) {
      core.scale.setScalar(0.38 * (1 + 0.1 * Math.sin(t * 26)));
      blades.rotation.y += dt * 20;
      blades.rotation.z = Math.sin(t * 11) * 0.28;
      vortex.rotation.x += dt * 11; vortex.rotation.y -= dt * 8;
      halo.rotation.z -= dt * 15;
    },
  };
}

// ------------------------------------------------------------ active casts, projectiles & burns
interface ChargingOrb {
  el: OrbElement;
  visual: OrbVisual;
  seal: ReturnType<typeof buildSeal>;
  t: number;
  dur: number;
  target: Enemy | null;
}

interface FlyingOrb {
  el: OrbElement;
  visual: OrbVisual;
  pos: THREE.Vector3;
  dir: THREE.Vector3;
  speed: number;
  traveled: number;
  maxRange: number;
  t: number;
  trailT: number;
  hitSet: Set<Enemy>;
}

let charging: ChargingOrb | null = null;
const orbs: FlyingOrb[] = [];
const burns = new Map<Enemy, { ticks: number; t: number; dmg: number }>();

const flatDist = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

function screenAngle(a: THREE.Vector3, b: THREE.Vector3) {
  const p = tmpA.set(a.x, a.y + 1, a.z).project(camera);
  const x0 = p.x * innerWidth, y0 = -p.y * innerHeight;
  const q = tmpB.set(b.x, b.y + 1, b.z).project(camera);
  const x1 = q.x * innerWidth, y1 = -q.y * innerHeight;
  return Math.atan2(y1 - y0, x1 - x0) * 180 / Math.PI;
}

/** pick the best target in range: prefers enemies near the warrior's facing direction */
function pickTarget(): Enemy | null {
  let best: Enemy | null = null, bestScore = Infinity;
  const fx = Math.sin(player.face), fz = Math.cos(player.face);
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const dx = e.g.position.x - player.pos.x, dz = e.g.position.z - player.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > AUTO_AIM_RANGE || d < 0.1) continue;
    const dot = (dx * fx + dz * fz) / d;   // 1 = straight ahead, -1 = behind
    const score = d * (1.35 - 0.55 * dot);
    if (score < bestScore) { bestScore = score; best = e; }
  }
  return best;
}

function hitStaticObstacle(x: number, z: number) {
  for (const c of collidersAt(x, z)) {
    if (c.lake) continue;   // orbs fly freely over water!
    if (c.rect) {
      const [x0, x1, z0, z1] = c.rect;
      if (x > x0 - 0.4 && x < x1 + 0.4 && z > z0 - 0.4 && z < z1 + 0.4) return true;
    } else if (c.seg) {
      const [x0, z0, x1, z1] = c.seg, dx = x1 - x0, dz = z1 - z0, l2 = dx * dx + dz * dz;
      const t = l2 > 0 ? Math.max(0, Math.min(1, ((x - x0) * dx + (z - z0) * dz) / l2)) : 0;
      if (Math.hypot(x - (x0 + dx * t), z - (z0 + dz * t)) < c.r + 0.4) return true;
    } else if (Math.hypot(x - c.x, z - c.z) < c.r + 0.4) {
      return true;
    }
  }
  return false;
}

function dealOrbDamage(e: Enemy, baseDmg: number, knockDir: THREE.Vector3, knockForce: number, stagger: number, color: number) {
  if (e.hp <= 0) return 0;
  const crit = rollCrit();
  const w = weapon();
  const dealt = baseDmg * (crit ? critMult() : 1) * dmgMult() * (0.7 + 0.3 * weaponDmg(w)) * spirit() * damageTaken(e);
  e.hp -= dealt;
  onPlayerHit(e);
  bossHit(e, dealt, true);
  e.flash = 1;
  provoke(e);
  if (e.state !== 'return' && stagger > 0) staggerEnemy(e, e.big ? stagger * 0.45 : stagger);
  if (knockForce > 0) {
    tmpA.set(knockDir.x, 0, knockDir.z);
    if (tmpA.lengthSq() > 0.001) e.knock.copy(tmpA.normalize()).multiplyScalar(knockForce / (e.big ? 2.5 : 1));
  }
  const hitPos = new THREE.Vector3(e.g.position.x, e.g.position.y + 1.2 * e.scale, e.g.position.z);
  sparkBurst(hitPos, crit ? 14 : 8, 5);
  if (crit) {
    burst(hitPos, 0xffc23a, 24, 6.5, 0.14);
    state.gain = '¡ CRÍTICO !'; state.gainT = 0.85;
  }
  burst(hitPos, color, 16, 5.5, 0.13);
  return dealt;
}

// ------------------------------------------------------------ elemental impacts
function detonateOrb(orb: FlyingOrb, directHit: Enemy | null) {
  const info = ORB_INFO[orb.el];
  const at = orb.pos.clone();
  const groundAt = new THREE.Vector3(at.x, surfaceY(at.x, at.z) + 0.12, at.z);
  const pan = panOf(at.x, at.z);

  sfx.orbHit(orb.el, pan);
  flashLight(at, info.color, 90, 0.42);
  flare(at, info.color, { size: 1.05, life: 0.5 });
  state.shake = Math.max(state.shake, orb.el === 'viento' ? 0.25 : 0.45);
  impactFlash(info.color, 0.2);

  if (orb.el === 'fuego') {
    // Roaring 3D fire crown detonation + magma dome + scorched crater + rising ember pillar + burn DoT
    spawnFireOrbDetonation(groundAt, info.radius);
    spawnPillar(groundAt, info.rim, 5.8, 1.45, 0.45, 0.6);
    burst(at, info.color, 48, 8.5, 0.18);
    burst(at, info.core, 26, 5.5, 0.14);
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (flatDist(e.g.position.x, e.g.position.z, at.x, at.z) > info.radius + 0.5 * e.scale) continue;
      const away = tmpB.set(e.g.position.x - at.x, 0, e.g.position.z - at.z);
      if (away.lengthSq() < 0.01) away.copy(orb.dir);
      dealOrbDamage(e, info.dmg, away, 10, 0.75, info.color);
      burns.set(e, { ticks: 3, t: 0.6, dmg: 0.42 });
    }
    return;
  }

  if (orb.el === 'rayo') {
    // Cinematic sky bolt on impact + chain lightning leaping to up to 2 nearby enemies + heavy stun
    spawnCinematicBolt(at, {
      coreColor: info.core, glowColor: info.color, outerColor: info.rim,
      skyHeight: 22, life: 0.45, radius: 0.1, branches: 3, groundImpact: true, skyPortal: true,
    });
    burst(at, info.core, 32, 8.5, 0.15);
    burst(at, info.color, 36, 7, 0.14);

    const struck = new Set<Enemy>();
    const primary = directHit ?? enemies.find(e => e.hp > 0 && flatDist(e.g.position.x, e.g.position.z, at.x, at.z) < 3.0 + 0.5 * e.scale) ?? null;
    if (primary) {
      struck.add(primary);
      dealOrbDamage(primary, info.dmg * 1.15, orb.dir, 7, 1.25, info.color);
      // chain to up to 2 nearby enemies within 6.5 m
      let prevPos = new THREE.Vector3(primary.g.position.x, primary.g.position.y + 1.2 * primary.scale, primary.g.position.z);
      const chains = enemies
        .filter(e => e.hp > 0 && !struck.has(e) && flatDist(e.g.position.x, e.g.position.z, primary.g.position.x, primary.g.position.z) < 6.8)
        .sort((a, b) => flatDist(a.g.position.x, a.g.position.z, primary.g.position.x, primary.g.position.z) - flatDist(b.g.position.x, b.g.position.z, primary.g.position.x, primary.g.position.z))
        .slice(0, 2);
      for (const next of chains) {
        struck.add(next);
        const nextPos = new THREE.Vector3(next.g.position.x, next.g.position.y + 1.2 * next.scale, next.g.position.z);
        spawnArc(prevPos, nextPos, info.color, info.core, 6, 0.55, 0.36);
        flare(nextPos, info.color, { size: 0.75, life: 0.36 });
        dealOrbDamage(next, info.dmg * 0.75, nextPos.clone().sub(prevPos), 5, 0.9, info.color);
        prevPos = nextPos;
      }
    }
    return;
  }

  if (orb.el === 'agua') {
    // Crashing 3D liquid crown splash + concentric water-ripple caustic pool + foaming hydro-dome + healing tide
    spawnWaterSplashCrown(groundAt, info.radius);
    burst(at, info.core, 44, 8.2, 0.16);
    burst(at, info.color, 56, 6.8, 0.17);
    burst(groundAt, 0x1888ff, 30, 5.2, 0.15);
    let healed = 0;
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      if (flatDist(e.g.position.x, e.g.position.z, at.x, at.z) > info.radius + 0.5 * e.scale) continue;
      const away = tmpB.set(e.g.position.x - at.x, 0, e.g.position.z - at.z);
      if (away.lengthSq() < 0.01) away.copy(orb.dir);
      dealOrbDamage(e, info.dmg, away, 15, 0.85, info.color);
      if (healed < 15) {
        const gain = Math.min(5, 15 - healed);
        player.hp = Math.min(player.maxHp, player.hp + gain);
        healed += gain;
      }
    }
    if (healed > 0) {
      burst(player.pos.clone().setY(player.pos.y + 1.1), info.core, 16, 3.5, 0.12);
    }
    return;
  }

  // viento dissipation burst at end of path
  spawnWindGaleBurst(at, orb.dir, 1.0);
  spawnCrescent(at, info.core, 2.7, Math.atan2(orb.dir.x, orb.dir.z), 0.25, 0.36);
  burst(at, info.color, 38, 8, 0.14);
}

// ------------------------------------------------------------ public API
/** boost the dedicated ranged special recharge (called by passive time, melee hits, and kills) */
export function chargeRanged(amount: number) {
  if (!state.rangedElement) { state.rangedCharge = 0; return; }
  if (state.rangedCharges >= MAX_RANGED_CHARGES) {
    state.rangedCharge = 0;
    return;
  }
  state.rangedCharge += amount;
  while (state.rangedCharge >= 1 && state.rangedCharges < MAX_RANGED_CHARGES) {
    state.rangedCharge -= 1;
    state.rangedCharges++;
    sfx.chime(state.rangedCharges === MAX_RANGED_CHARGES);
    const info = ORB_INFO[state.rangedElement];
    burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.2, player.pos.z), info.color, 14, 3.2, 0.11);
    if (state.rangedCharges === MAX_RANGED_CHARGES) state.rangedCharge = 0;
  }
}

/** SHIFT+Ñ: cycle between learned elemental orbs */
export function cycleRangedElement() {
  const list = state.learnedOrbs;
  if (!list.length) {
    showMsg('Compra ataques a distancia (Ñ) en los templos ◆ del mapa (N)', 2.4);
    sfx.warn(0);
    return null;
  }
  if (list.length === 1) {
    const only = ORB_INFO[list[0]];
    showMsg(`Solo tienes ${only.name} · compra más elementos en los templos ◆ (N)`, 2.2);
    return only;
  }
  const idx = state.rangedElement ? list.indexOf(state.rangedElement) : -1;
  const next = list[(idx + 1) % list.length];
  state.rangedElement = next;
  const info = ORB_INFO[next];
  sfx.chime(false);
  burst(new THREE.Vector3(player.pos.x, player.pos.y + 1.15, player.pos.z), info.color, 20, 4.2, 0.13);
  impactRing(player.pos, info.color, 2.6);
  showMsg(`Ñ · ${info.kanji} ${info.name.toUpperCase()}`, 1.3);
  return info;
}

/** Ñ pressed: gather elemental energy and hurl an orb */
export function tryElementalOrb() {
  if (!state.playing || state.dead || state.photo || state.menu || player.dancing) return;
  if (charging) return;
  const el = state.rangedElement;
  if (!el) {
    showMsg('Compra ataques a distancia (Ñ) en los templos ◆ del mapa (N)', 2.4);
    sfx.warn(0);
    return;
  }
  if (state.rangedCharges < 1) {
    showMsg(`Recargando ${ORB_INFO[el].name} · ${Math.floor(state.rangedCharge * 100)} %`, 1.1);
    sfx.warn(0);
    return;
  }

  const info = ORB_INFO[el];
  const target = pickTarget();
  if (target) {
    player.face = Math.atan2(target.g.position.x - player.pos.x, target.g.position.z - player.pos.z);
  }

  state.rangedCharges--;
  Object.assign(player, { combo: 1, attackT: 0, attackDur: 0.5, hitDone: true });

  const visual = buildOrbVisual(el);
  visual.root.scale.setScalar(0.16);
  scene.add(visual.root);

  const seal = buildSeal(info.color, info.core, 1.2);
  seal.outer.scale.setScalar(0.2);
  scene.add(seal.outer);

  // converging energy streaks rushing into the forming orb
  for (let i = 0; i < 10; i++) {
    const a = rnd(0, Math.PI * 2), rad = rnd(2.2, 4.2), h = rnd(0.2, 2.6);
    const offset = new THREE.Vector3(Math.sin(a) * rad, h, Math.cos(a) * rad);
    const sMat = glowMat(i % 2 ? info.color : info.core, 0.9);
    const m = new THREE.Mesh(BOX, sMat);
    m.scale.setScalar(0.001);
    const delay = rnd(0, CHARGE_DUR * 0.35);
    addProp(m, [sMat], CHARGE_DUR + 0.04, p => {
      const k = Math.min(1, Math.max(0, (p.t - delay) / (CHARGE_DUR - delay)));
      const e = k * k;
      const fx = Math.sin(player.face), fz = Math.cos(player.face);
      const center = tmpA.set(player.pos.x + fx * 1.15, player.pos.y + 1.32, player.pos.z + fz * 1.15);
      const from = tmpB.copy(player.pos).add(offset);
      const head = from.clone().lerp(center, e);
      const tail = from.clone().lerp(center, Math.max(0, e - 0.38));
      if (head.distanceTo(tail) < 0.02) tail.y -= 0.02;
      orient(m, tail, head, 0.048);
      sMat.opacity = 0.9 * Math.min(1, k * 4) * (1 - k * 0.25);
    });
  }

  // ground ring beneath the warrior
  spawnRing(new THREE.Vector3(player.pos.x, surfaceY(player.pos.x, player.pos.z) + 0.09, player.pos.z), info.color, 2.1, CHARGE_DUR + 0.22, 0.75);
  rangedPulse(info.color, 0.44);
  sfx.orbCharge(el);

  charging = { el, visual, seal, t: 0, dur: CHARGE_DUR, target };
}

function releaseChargedOrb(c: ChargingOrb) {
  const info = ORB_INFO[c.el];
  // track target slightly if still alive and in range
  if (c.target && c.target.hp > 0 && enemies.includes(c.target) && flatDist(c.target.g.position.x, c.target.g.position.z, player.pos.x, player.pos.z) < AUTO_AIM_RANGE + 4) {
    player.face = Math.atan2(c.target.g.position.x - player.pos.x, c.target.g.position.z - player.pos.z);
  }
  const dir = new THREE.Vector3(Math.sin(player.face), 0, Math.cos(player.face)).normalize();
  const start = new THREE.Vector3(player.pos.x + dir.x * 1.2, player.pos.y + 1.32, player.pos.z + dir.z * 1.2);

  // remove the summoning seal with a quick expanding muzzle ring
  scene.remove(c.seal.outer);
  for (const m of c.seal.mats) m.dispose();
  spawnRing(start, info.core, 1.85, 0.3, 0.95, dir);
  burst(start, info.color, 22, 6, 0.13);
  impactFlash(info.color, 0.22);
  state.shake = Math.max(state.shake, 0.26);
  sfx.orbCast(c.el);

  c.visual.root.position.copy(start);
  c.visual.root.scale.setScalar(1.05);
  c.visual.root.lookAt(tmpA.copy(start).add(dir));

  orbs.push({
    el: c.el,
    visual: c.visual,
    pos: start,
    dir,
    speed: info.speed,
    traveled: 0,
    maxRange: info.range,
    t: 0,
    trailT: 0,
    hitSet: new Set(),
  });
}

export function updateElementalOrbs(dt: number) {
  // 1. Dedicated special recharge over time
  if (state.playing && !state.dead && state.rangedCharges < MAX_RANGED_CHARGES) {
    chargeRanged(dt / RECHARGE_TIME);
  }

  // 2. Charging orb in front of the warrior
  if (charging) {
    const c = charging;
    c.t += dt;
    const k = Math.min(1, c.t / c.dur);
    const ease = 1 - (1 - k) ** 3;
    if (c.target && c.target.hp > 0 && enemies.includes(c.target)) {
      player.face = Math.atan2(c.target.g.position.x - player.pos.x, c.target.g.position.z - player.pos.z);
    }
    const fx = Math.sin(player.face), fz = Math.cos(player.face);
    const ox = player.pos.x + fx * 1.18, oy = player.pos.y + 1.32, oz = player.pos.z + fz * 1.18;
    c.visual.root.position.set(ox, oy, oz);
    c.visual.root.scale.setScalar(0.16 + 0.94 * ease);
    c.visual.animate(dt * (1 + k * 1.8), c.t);

    c.seal.outer.position.set(player.pos.x + fx * 0.95, player.pos.y + 1.32, player.pos.z + fz * 0.95);
    c.seal.outer.lookAt(ox + fx, oy, oz + fz);
    c.seal.outer.scale.setScalar(0.25 + 0.85 * ease);
    c.seal.spin.rotation.z += dt * (4 + k * 7);

    if (c.t >= c.dur) {
      charging = null;
      releaseChargedOrb(c);
    }
  }

  // 3. Flying orbs
  for (let i = orbs.length - 1; i >= 0; i--) {
    const o = orbs[i];
    const info = ORB_INFO[o.el];
    const step = o.speed * dt;
    o.t += dt;
    o.traveled += step;
    o.pos.addScaledVector(o.dir, step);
    // hug terrain gently while keeping chest elevation
    const wantY = surfaceY(o.pos.x, o.pos.z) + 1.32 + (o.el === 'agua' ? Math.sin(o.t * 14) * 0.16 : 0);
    o.pos.y += (wantY - o.pos.y) * Math.min(1, dt * 10);

    o.visual.root.position.copy(o.pos);
    o.visual.animate(dt, o.t);

    // cinematic flight trail
    o.trailT -= dt;
    if (o.trailT <= 0) {
      o.trailT = o.el === 'rayo' ? 0.028 : 0.04;
      spawnRing(o.pos, o.el === 'rayo' ? info.core : info.color, o.el === 'viento' ? 1.15 : 0.72, 0.22, 0.55, o.dir);
      if (o.el === 'rayo') {
        const back = o.pos.clone().addScaledVector(o.dir, -1.6);
        spawnArc(back, o.pos, info.color, info.core, 3, 0.32, 0.14);
        burst(o.pos.clone(), info.core, 3, 3.2, 0.1);
      } else if (o.el === 'agua') {
        // Liquid spray droplets & ground water ripple wake trailing beneath the hydro-orb
        burst(o.pos.clone(), 0x45d8ff, 5, 2.8, 0.12);
        burst(o.pos.clone(), 0xf0fcff, 3, 2.1, 0.09);
        const wakeAt = new THREE.Vector3(o.pos.x, surfaceY(o.pos.x, o.pos.z) + 0.09, o.pos.z);
        spawnRing(wakeAt, info.color, 1.35, 0.34, 0.55);
      } else if (o.el === 'fuego') {
        // Blazing embers & glowing heat streaks trailing the solar fireball
        burst(o.pos.clone(), 0xff7a1e, 5, 3.2, 0.14);
        burst(o.pos.clone(), 0xfff0b8, 3, 2.4, 0.1);
      } else {
        // Emerald wind-shear streaks & razor slipstream
        burst(o.pos.clone(), 0x7effc4, 4, 3.0, 0.11);
        const streakMat = glowMat(info.core, 0.78);
        const streak = new THREE.Mesh(BOX, streakMat);
        const back = o.pos.clone().addScaledVector(o.dir, -1.5).add(new THREE.Vector3(rnd(-0.32, 0.32), rnd(-0.22, 0.22), rnd(-0.32, 0.32)));
        orient(streak, back, o.pos, 0.055);
        addProp(streak, [streakMat], 0.18, p => { streakMat.opacity = 0.78 * (1 - p.t / p.life); });
      }
    }

    // collision with enemies
    let exploded = false;
    for (const e of enemies) {
      if (e.hp <= 0 || o.hitSet.has(e)) continue;
      const d = flatDist(e.g.position.x, e.g.position.z, o.pos.x, o.pos.z);
      if (d > (o.el === 'viento' ? 1.5 : 1.15) + 0.55 * e.scale) continue;

      if (o.el === 'viento') {
        // Wind orb slices cleanly through enemies along its path!
        o.hitSet.add(e);
        const hitPos = new THREE.Vector3(e.g.position.x, e.g.position.y + 1.2 * e.scale, e.g.position.z);
        dealOrbDamage(e, info.dmg, o.dir, 11, 0.75, info.color);
        spawnCrescent(hitPos, info.core, 2.2, Math.atan2(o.dir.x, o.dir.z), rnd(-0.4, 0.4), 0.3);
        flare(hitPos, info.color, { size: 0.85, life: 0.36 });
        screenSlash(screenAngle(player.pos, hitPos) + rnd(-12, 12), info.color);
        sfx.orbHit('viento', panOf(hitPos.x, hitPos.z));
        state.shake = Math.max(state.shake, 0.2);
      } else {
        detonateOrb(o, e);
        exploded = true;
        break;
      }
    }

    if (!exploded && (o.traveled >= o.maxRange || hitStaticObstacle(o.pos.x, o.pos.z))) {
      detonateOrb(o, null);
      exploded = true;
    }

    if (exploded) {
      scene.remove(o.visual.root);
      for (const m of o.visual.mats) m.dispose();
      orbs.splice(i, 1);
    }
  }

  // 4. Fire orb burning DoT
  for (const [e, b] of burns) {
    if (e.hp <= 0 || !enemies.includes(e)) { burns.delete(e); continue; }
    b.t -= dt;
    if (b.t <= 0) {
      b.t += 0.65;
      b.ticks--;
      const dealt = b.dmg * dmgMult() * damageTaken(e);
      e.hp -= dealt;
      e.flash = 0.7;
      burst(new THREE.Vector3(e.g.position.x, e.g.position.y + 1.1 * e.scale, e.g.position.z), ORB_INFO.fuego.color, 10, 3.2, 0.12);
      if (b.ticks <= 0) burns.delete(e);
    }
  }

  // 5. Transient props
  for (let i = props.length - 1; i >= 0; i--) {
    const p = props[i];
    p.t += dt;
    if (p.t >= p.life) { removeProp(p); props.splice(i, 1); }
    else p.tick?.(p, dt);
  }

  // 6. Dynamic elemental light (priority: impact flash > flying orb > charging orb)
  if (impactLightT > 0) {
    impactLightT = Math.max(0, impactLightT - dt);
    orbLight.position.copy(impactLightPos);
    orbLight.color.setHex(impactLightColor);
    orbLight.intensity = impactLightI * (impactLightT / 0.42);
  } else if (orbs.length > 0) {
    const lead = orbs[orbs.length - 1];
    orbLight.position.copy(lead.pos);
    orbLight.color.setHex(ORB_INFO[lead.el].color);
    orbLight.intensity = 42;
  } else if (charging) {
    orbLight.position.copy(charging.visual.root.position);
    orbLight.color.setHex(ORB_INFO[charging.el].color);
    orbLight.intensity = 14 + 28 * (charging.t / charging.dur);
  } else {
    orbLight.intensity = 0;
  }
}

export function clearElementalOrbs() {
  if (charging) {
    scene.remove(charging.visual.root);
    for (const m of charging.visual.mats) m.dispose();
    scene.remove(charging.seal.outer);
    for (const m of charging.seal.mats) m.dispose();
    charging = null;
  }
  for (const o of orbs) {
    scene.remove(o.visual.root);
    for (const m of o.visual.mats) m.dispose();
  }
  orbs.length = 0;
  for (const p of props) removeProp(p);
  props.length = 0;
  burns.clear();
  impactLightT = orbLight.intensity = 0;
}
