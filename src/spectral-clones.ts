// Clones Espectrales (分身): summons 3 translucent spectral copies of the player character
// that autonomously hunt, flank, and slash enemies for 4 seconds before dissolving into spirit embers.
import * as THREE from 'three';
import { rigGltf } from './assets';
import { createRealSamurai } from './rig';
import { createSamurai } from './samurai';
import { scene } from './renderer';
import { enemies } from './enemies';
import { provoke, staggerEnemy } from './enemy-ai';
import { burst, dashRing, impactRing } from './fx';
import { flare } from './flare';
import { sparkBurst } from './katana-fx';
import { CLS, tagMat } from './materials';
import { collide } from './physics';
import { panOf, sfx } from './sfx';
import { specialDamage } from './special-damage';
import { player, state } from './state';
import { surfaceY } from './structures';
import { TECHNIQUES } from './techniques';
import { dmgMult } from './upgrades';
import { displayedWeapon, weapon } from './weapons';
import { weaponDmg } from './weapon-upgrades';
import { impactFlash } from './cinematic';
import { angDiff, rnd } from './utils';
import { makeCrescentSlashMat, mandalaTex, vfxTime } from './vfx-art';
import type { Avatar, Enemy } from './types';

const COUNT = 3;
const DURATION = 4.0;
const SEEK_RANGE = 18;
const RUN_SPEED = 11.5;
const ATTACK_DUR = 0.42;
const ATTACK_COOLDOWN = 0.24;
const HIT_DAMAGE = 2.0;
const COLOR = TECHNIQUES.espectros.color;
const PLANE_2 = new THREE.PlaneGeometry(2, 2);

// ------------------------------------------------------------ spectral Fresnel shader (supports SkinnedMesh + rigid meshes)
function makeSpectralBodyMat(fadeUniform: { value: number }) {
  const mat = new THREE.MeshBasicMaterial({
    color: COLOR,
    transparent: true,
    opacity: 0.85,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uTime = vfxTime;
    sh.uniforms.uFade = fadeUniform;
    sh.uniforms.uCoreCol = { value: new THREE.Color(0x2856ff) };
    sh.uniforms.uRimCol = { value: new THREE.Color(0x8cf8ff) };
    sh.uniforms.uHotCol = { value: new THREE.Color(0xffffff) };
    sh.vertexShader = /* glsl */`
      varying vec3 vSpecNormalW;
      varying vec3 vSpecViewDir;
      varying float vSpecWorldY;
    ` + sh.vertexShader
      .replace('#include <begin_vertex>', /* glsl */`
        #include <begin_vertex>
        vec3 objectNormal = vec3(normal);
        #ifdef USE_SKINNING
          mat4 specSkinMat = mat4(0.0);
          specSkinMat += skinWeight.x * getBoneMatrix(skinIndex.x);
          specSkinMat += skinWeight.y * getBoneMatrix(skinIndex.y);
          specSkinMat += skinWeight.z * getBoneMatrix(skinIndex.z);
          specSkinMat += skinWeight.w * getBoneMatrix(skinIndex.w);
          objectNormal = vec4(specSkinMat * vec4(objectNormal, 0.0)).xyz;
        #endif
      `)
      .replace('#include <project_vertex>', /* glsl */`
        vec4 specWorldPos = modelMatrix * vec4(transformed, 1.0);
        vSpecNormalW = normalize(mat3(modelMatrix) * objectNormal);
        vSpecViewDir = normalize(cameraPosition - specWorldPos.xyz);
        vSpecWorldY = specWorldPos.y;
        #include <project_vertex>
      `);
    sh.fragmentShader = /* glsl */`
      uniform float uTime;
      uniform float uFade;
      uniform vec3 uCoreCol;
      uniform vec3 uRimCol;
      uniform vec3 uHotCol;
      varying vec3 vSpecNormalW;
      varying vec3 vSpecViewDir;
      varying float vSpecWorldY;
    ` + sh.fragmentShader.replace('#include <dithering_fragment>', /* glsl */`
      float ndv = abs(dot(normalize(vSpecNormalW), normalize(vSpecViewDir)));
      float fresnel = pow(1.0 - clamp(ndv, 0.0, 1.0), 1.85);
      float wisp = 0.8 + 0.2 * sin(vSpecWorldY * 14.0 - uTime * 9.5);
      float scan = 0.88 + 0.12 * sin(vSpecWorldY * 32.0 - uTime * 18.0);
      vec3 col = mix(uCoreCol, uRimCol, clamp(fresnel * 1.15 + 0.18, 0.0, 1.0));
      col = mix(col, uHotCol, smoothstep(0.68, 1.0, fresnel));
      float alpha = clamp((0.18 + fresnel * 0.92) * wisp * scan * uFade, 0.0, 1.0);
      gl_FragColor = vec4(col * (1.25 + 0.75 * fresnel) * alpha, alpha);
      #include <dithering_fragment>
    `);
  };
  mat.customProgramCacheKey = () => key() + '|spectral-clone';
  return tagMat(mat, CLS.fx);
}

function makeSpectralBladeMat(fadeUniform: { value: number }) {
  const mat = new THREE.MeshBasicMaterial({
    color: 0xe6fbff,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const prev = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (sh, r) => {
    prev.call(mat, sh, r);
    sh.uniforms.uFade = fadeUniform;
    sh.fragmentShader = 'uniform float uFade;\n' + sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      'gl_FragColor.rgb *= 1.5 * uFade; gl_FragColor.a *= uFade;\n#include <dithering_fragment>',
    );
  };
  mat.customProgramCacheKey = () => key() + '|spectral-blade';
  return tagMat(mat, CLS.fx);
}

// ------------------------------------------------------------ transient spectral slash crescents
interface SlashProp {
  g: THREE.Group;
  mat: THREE.ShaderMaterial;
  t: number;
  life: number;
  r: number;
}
const slashes: SlashProp[] = [];

function spawnSpectralSlash(at: THREE.Vector3, yaw: number, combo: number) {
  const mat = makeCrescentSlashMat(0xffffff, COLOR, 0.92);
  const m = new THREE.Mesh(PLANE_2, mat);
  m.rotation.x = -Math.PI / 2;
  const g = new THREE.Group();
  g.add(m);
  g.position.set(at.x, at.y + 1.15, at.z);
  const roll = combo === 0 ? 0.32 : combo === 1 ? -0.35 : 0.1;
  g.rotation.set(0, yaw - Math.PI / 2, roll);
  const r = combo === 2 ? 2.15 : 1.75;
  g.scale.setScalar(r * 0.75);
  scene.add(g);
  slashes.push({ g, mat, t: 0, life: 0.28, r });
}

// ------------------------------------------------------------ reusable pool of 3 spectral clones
interface CloneSlot {
  avatar: Avatar;
  fade: { value: number };
  ringMat: THREE.MeshBasicMaterial;
  ring: THREE.Mesh;
  pos: THREE.Vector3;
  face: number;
  walk: number;
  combo: number;
  attackT: number;
  hitDone: boolean;
  cooldown: number;
  wispT: number;
  orbitAngle: number;
  target: Enemy | null;
}

let pool: CloneSlot[] | null = null;
let activeTime = 0;
let active = false;

function buildPool(): CloneSlot[] {
  return Array.from({ length: COUNT }, (_, i) => {
    const avatar = rigGltf ? createRealSamurai(rigGltf) : createSamurai();
    const fade = { value: 1 };
    const bodyMat = makeSpectralBodyMat(fade);
    const bladeMat = makeSpectralBladeMat(fade);

    // Strip contact shadow blobs and replace every mesh material with spectral ethereal shader
    avatar.root.traverse(obj => {
      const m = obj as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = false;
      m.receiveShadow = false;
      // Hide ground shadow disc if present (flat dark plane near y=0)
      const mat = m.material as THREE.MeshBasicMaterial;
      if (mat && mat.color && mat.color.r === 0 && mat.color.g === 0 && mat.color.b === 0 && mat.transparent) {
        m.visible = false;
        return;
      }
      m.material = bodyMat;
    });
    // Brighten weapon meshes so the spectral katana stands out sharply during slashes
    for (const grp of [avatar.katana, avatar.offhand]) {
      grp.traverse(obj => {
        const m = obj as THREE.Mesh;
        if (m.isMesh) m.material = bladeMat;
      });
    }

    // Subtle glowing spirit seal ring gliding beneath the clone's feet
    const ringMat = tagMat(new THREE.MeshBasicMaterial({
      map: mandalaTex, color: COLOR, transparent: true, opacity: 0.55,
      depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, toneMapped: false,
    }), CLS.fx);
    const ring = new THREE.Mesh(PLANE_2, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.08;
    ring.scale.setScalar(0.82);
    avatar.root.add(ring);

    avatar.root.visible = false;
    scene.add(avatar.root);

    return {
      avatar, fade, ringMat, ring,
      pos: new THREE.Vector3(),
      face: 0,
      walk: i * 2.1,
      combo: i % 3,
      attackT: -1,
      hitDone: false,
      cooldown: 0.1 + i * 0.08,
      wispT: 0,
      orbitAngle: (i / COUNT) * Math.PI * 2,
      target: null,
    };
  });
}

const alive = (e: Enemy | null): e is Enemy => !!e && e.hp > 0 && enemies.includes(e);

function pickTarget(c: CloneSlot, claimed: Set<Enemy>): Enemy | null {
  let bestUnclaimed: Enemy | null = null, bestUnclaimedD = SEEK_RANGE;
  let bestAny: Enemy | null = null, bestAnyD = SEEK_RANGE;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const d = Math.hypot(e.g.position.x - c.pos.x, e.g.position.z - c.pos.z);
    if (d < bestAnyD) { bestAnyD = d; bestAny = e; }
    if (!claimed.has(e) && d < bestUnclaimedD) { bestUnclaimedD = d; bestUnclaimed = e; }
  }
  const chosen = bestUnclaimed ?? bestAny;
  if (chosen) claimed.add(chosen);
  return chosen;
}

function performCloneHit(c: CloneSlot) {
  const reach = 2.35;
  const fx = Math.sin(c.face), fz = Math.cos(c.face);
  const dmg = HIT_DAMAGE * dmgMult() * (0.7 + 0.3 * weaponDmg(weapon()));
  spawnSpectralSlash(c.pos, c.face, c.combo);
  sfx.swing({ power: c.combo === 2 ? 1.15 : 0.85, pan: panOf(c.pos.x, c.pos.z) });

  let hits = 0;
  for (const e of enemies) {
    if (e.hp <= 0) continue;
    const dx = e.g.position.x - c.pos.x, dz = e.g.position.z - c.pos.z;
    const d = Math.hypot(dx, dz);
    if (d > reach + 0.45 * e.scale) continue;
    if (d > 0.4 && (dx * fx + dz * fz) / d < -0.15) continue;
    state.casting = 'espectros';
    specialDamage(e, dmg);
    e.flash = 0.85;
    provoke(e);
    if (e.state !== 'return') staggerEnemy(e, e.big ? 0.25 : 0.65);
    if (d > 0.05) e.knock.set(dx / d, 0, dz / d).multiplyScalar(e.big ? 1.6 : 4.2);
    const hitPos = new THREE.Vector3(e.g.position.x, e.g.position.y + 1.15 * e.scale, e.g.position.z);
    burst(hitPos, COLOR, 16, 5.2, 0.14);
    sparkBurst(hitPos, 8, 5);
    hits++;
  }
  if (hits) {
    sfx.hit({ heavy: c.combo === 2, pan: panOf(c.pos.x, c.pos.z), count: hits });
    state.shake = Math.max(state.shake, 0.16);
  }
}

// ------------------------------------------------------------ public API
export function startSpectralClones() {
  if (!pool) pool = buildPool();
  active = true;
  activeTime = DURATION;

  // Dramatic summoning burst around the player
  const origin = player.pos.clone();
  impactRing(origin, COLOR, 5.5);
  dashRing(origin);
  burst(origin.clone().setY(origin.y + 1.1), COLOR, 70, 7.5, 0.18);
  burst(origin.clone().setY(origin.y + 1.2), 0xffffff, 30, 5.5, 0.14);
  flare(origin.clone().setY(origin.y + 1.8), COLOR, { size: 1.25, life: 0.6 });
  impactFlash(COLOR, 0.4);
  sfx.dash();
  sfx.chime(false);

  const claimed = new Set<Enemy>();
  pool.forEach((c, i) => {
    const a = player.face + (i - 1) * (Math.PI * 2 / 3);
    c.pos.set(origin.x + Math.sin(a) * 1.9, surfaceY(origin.x + Math.sin(a) * 1.9, origin.z + Math.cos(a) * 1.9), origin.z + Math.cos(a) * 1.9);
    collide(c.pos, 0.4);
    c.pos.y = surfaceY(c.pos.x, c.pos.z);
    c.face = a;
    c.combo = i % 3;
    c.attackT = -1;
    c.hitDone = false;
    c.cooldown = 0.12 + i * 0.09;
    c.wispT = 0;
    c.orbitAngle = a;
    c.target = pickTarget(c, claimed);
    c.fade.value = 0.01;
    c.avatar.root.position.copy(c.pos);
    c.avatar.root.rotation.y = c.face;
    c.avatar.root.visible = true;
    dashRing(c.pos);
    burst(c.pos.clone().setY(c.pos.y + 1.0), COLOR, 24, 4.5, 0.15);
  });
}

export function updateSpectralClones(dt: number) {
  // Update spectral slash crescents even right after clones vanish
  for (let i = slashes.length - 1; i >= 0; i--) {
    const s = slashes[i];
    s.t += dt;
    const k = Math.min(1, s.t / s.life);
    s.g.scale.setScalar(s.r * (0.75 + 0.4 * k));
    s.mat.uniforms.uOpacity.value = 0.92 * (1 - k * k);
    if (s.t >= s.life) {
      scene.remove(s.g);
      s.mat.dispose();
      slashes.splice(i, 1);
    }
  }

  if (!active || !pool) return;
  activeTime -= dt;

  // Dissolve cleanly when the 4 seconds are over
  if (activeTime <= 0 || state.dead) {
    for (const c of pool) {
      c.avatar.root.visible = false;
      burst(c.pos.clone().setY(c.pos.y + 1.1), COLOR, 34, 6.2, 0.16);
      burst(c.pos.clone().setY(c.pos.y + 1.1), 0xffffff, 14, 4.5, 0.12);
      impactRing(c.pos, COLOR, 2.8);
    }
    if (!state.dead) sfx.dash();
    active = false;
    return;
  }

  const elapsed = DURATION - activeTime;
  const fadeIn = Math.min(1, elapsed / 0.22);
  const fadeOut = Math.min(1, activeTime / 0.42);
  const fadeVal = Math.min(fadeIn, fadeOut);
  const weaponForm = displayedWeapon().form ?? 'katana';
  const claimed = new Set<Enemy>();

  for (let i = 0; i < pool.length; i++) {
    const c = pool[i];
    c.fade.value = fadeVal;
    c.ring.rotation.z += dt * (i % 2 ? 3.5 : -3.5);
    c.ringMat.opacity = 0.52 * fadeVal;

    // Maintain or acquire a distinct enemy target
    if (!alive(c.target) || Math.hypot(c.target.g.position.x - c.pos.x, c.target.g.position.z - c.pos.z) > SEEK_RANGE + 4) {
      c.target = pickTarget(c, claimed);
    } else {
      claimed.add(c.target);
    }

    let moving = 0;
    let dashing = false;

    if (c.attackT >= 0) {
      c.attackT += dt;
      // Face target during windup
      if (alive(c.target)) {
        const want = Math.atan2(c.target.g.position.x - c.pos.x, c.target.g.position.z - c.pos.z);
        c.face += angDiff(want, c.face) * Math.min(1, dt * 14);
      }
      if (!c.hitDone && c.attackT >= ATTACK_DUR * 0.42) {
        c.hitDone = true;
        performCloneHit(c);
      }
      if (c.attackT >= ATTACK_DUR) {
        c.attackT = -1;
        c.cooldown = ATTACK_COOLDOWN;
        c.combo = (c.combo + 1) % 3;
      }
    } else {
      if (c.cooldown > 0) c.cooldown -= dt;
      if (alive(c.target)) {
        // Flank around the target so the 3 clones spread organically instead of stacking
        const flankAngle = (i / COUNT) * Math.PI * 2 + elapsed * 0.7;
        const flankR = 1.25 + 0.35 * c.target.scale;
        const gx = c.target.g.position.x + Math.sin(flankAngle) * flankR;
        const gz = c.target.g.position.z + Math.cos(flankAngle) * flankR;
        const dx = c.target.g.position.x - c.pos.x, dz = c.target.g.position.z - c.pos.z;
        const distToEnemy = Math.hypot(dx, dz);
        const strikeRange = 2.0 + 0.45 * c.target.scale;

        if (distToEnemy <= strikeRange && c.cooldown <= 0) {
          c.face = Math.atan2(dx, dz);
          c.attackT = 0;
          c.hitDone = false;
        } else {
          const mdx = gx - c.pos.x, mdz = gz - c.pos.z;
          const md = Math.hypot(mdx, mdz);
          if (md > 0.25) {
            const speed = distToEnemy > 5.5 ? RUN_SPEED * 1.4 : RUN_SPEED;
            dashing = distToEnemy > 6.5;
            const step = Math.min(md, speed * dt);
            c.pos.x += (mdx / md) * step;
            c.pos.z += (mdz / md) * step;
            collide(c.pos, 0.4);
            c.face += angDiff(Math.atan2(mdx, mdz), c.face) * Math.min(1, dt * 14);
            moving = 1;
            c.walk += dt * speed * 1.15;
          }
        }
      } else {
        // No enemies nearby: orbit the player in ghostly formation & weave practice slashes
        c.orbitAngle += dt * 1.9;
        const gx = player.pos.x + Math.sin(c.orbitAngle) * 2.8;
        const gz = player.pos.z + Math.cos(c.orbitAngle) * 2.8;
        const mdx = gx - c.pos.x, mdz = gz - c.pos.z, md = Math.hypot(mdx, mdz);
        if (md > 0.15) {
          const step = Math.min(md, RUN_SPEED * dt);
          c.pos.x += (mdx / md) * step;
          c.pos.z += (mdz / md) * step;
          c.face += angDiff(Math.atan2(mdx, mdz), c.face) * Math.min(1, dt * 10);
          moving = 0.85;
          c.walk += dt * 9.5;
        }
        if (c.cooldown <= 0) {
          c.attackT = 0;
          c.hitDone = false;
        }
      }
    }

    c.pos.y = surfaceY(c.pos.x, c.pos.z);
    c.avatar.root.position.copy(c.pos);
    c.avatar.root.rotation.y = c.face;

    // Shed spectral wisps while moving or attacking
    c.wispT -= dt;
    if (c.wispT <= 0) {
      c.wispT = dashing ? 0.04 : 0.09;
      burst(new THREE.Vector3(c.pos.x + rnd(-0.25, 0.25), c.pos.y + rnd(0.4, 1.5), c.pos.z + rnd(-0.25, 0.25)), COLOR, dashing ? 4 : 2, 1.4, 0.12);
    }

    c.avatar.update(dt, {
      time: state.time + i * 1.3,
      moving,
      walk: c.walk,
      showWeapon: false,
      weaponForm,
      dash: dashing,
      jumpY: 0,
      vy: 0,
      land: 0,
      look: 0,
      attack: c.attackT >= 0 ? { combo: c.combo, p: Math.min(1, c.attackT / ATTACK_DUR) } : null,
    });
  }
}

export function clearSpectralClones() {
  active = false;
  activeTime = 0;
  if (pool) for (const c of pool) c.avatar.root.visible = false;
  for (const s of slashes) {
    scene.remove(s.g);
    s.mat.dispose();
  }
  slashes.length = 0;
}
