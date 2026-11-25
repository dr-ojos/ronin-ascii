// Bespoke 3D Japanese manga broadsword models (non-katana, non-sabre wide blades):
//   · buster: colossal straight iron slab greatsword with twin circular cutouts & heavy riveted crossguard
//   · executioner: ultra-wide asymmetric manga cleaver with iconic circular hole near the tip & spine notch
//   · fang: serrated sawtooth demon greatsword with jagged fangs along the edge and horned guard
//   · winged: double-edged fantasy manga greatsword with flared central blade and wide winged crossguard
// Each blade starts at BLADE_PROFILE.base and extends along +z, using the shared steel material so
// blade sheen, travelling sparks and colour glow follow the full silhouette.
import * as THREE from 'three';
import { BLADE_PROFILE, MAT, grp, mesh, type BladeProfile } from './samurai';

export type MangaBlade = 'buster' | 'executioner' | 'fang' | 'winged';

export const MANGA_PROFILE: Record<MangaBlade, BladeProfile> = {
  buster: { base: BLADE_PROFILE.base, length: BLADE_PROFILE.length, curve: 0, width: 0.165, taper: 0.01, belly: 0 },
  executioner: { base: BLADE_PROFILE.base, length: BLADE_PROFILE.length, curve: 0.014, width: 0.175, taper: -0.025, belly: 0.022 },
  fang: { base: BLADE_PROFILE.base, length: BLADE_PROFILE.length, curve: 0.024, width: 0.16, taper: -0.01, belly: 0.018 },
  winged: { base: BLADE_PROFILE.base, length: BLADE_PROFILE.length, curve: 0, width: 0.155, taper: 0.015, belly: 0.026 }
};

function extrudeBlade(sh: THREE.Shape, depth = 0.012) {
  const g = new THREE.ExtrudeGeometry(sh, {
    depth, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.004, bevelSegments: 1, curveSegments: 10
  });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, BLADE_PROFILE.base);
  g.computeVertexNormals();
  return g;
}

export function createMangaSwords(parent: THREE.Object3D, steel: THREE.MeshStandardMaterial) {
  const L = BLADE_PROFILE.length;
  const wrap = new THREE.MeshStandardMaterial({ color: 0x1d1c24, roughness: 0.86 });
  const cloth = new THREE.MeshStandardMaterial({ color: 0x8f1d24, roughness: 0.78, side: THREE.DoubleSide });
  const darkIron = new THREE.MeshStandardMaterial({ color: 0x262830, metalness: 0.72, roughness: 0.34 });
  const cyl = (g: THREE.Object3D, a: number, b: number, r0: number, r1: number, m: THREE.Material, sides = 12) => {
    mesh(new THREE.CylinderGeometry(r0, r1, b - a, sides), m, g, 0, 0, (a + b) / 2).rotation.x = Math.PI / 2;
  };

  // ---- 1. buster: colossal straight slab greatsword with twin circular cutouts & heavy crossguard
  const buster = grp(parent); buster.name = 'manga-buster';
  {
    const hw = 0.082;
    const sh = new THREE.Shape();
    sh.moveTo(0, -hw);
    sh.lineTo(L * 0.80, -hw * 0.94);
    sh.lineTo(L, 0);
    sh.lineTo(L * 0.80, hw * 0.94);
    sh.lineTo(0, hw);
    sh.closePath();
    // twin iconic manga circular slots near the guard
    for (const cx of [L * 0.16, L * 0.29]) {
      const hole = new THREE.Path();
      hole.absarc(cx, 0.012, 0.022, 0, Math.PI * 2, true);
      sh.holes.push(hole);
    }
    mesh(extrudeBlade(sh, 0.013), steel, buster).name = 'buster-blade';
    // heavy two-handed hilt, riveted slab crossguard and chain-ring pommel
    cyl(buster, -0.24, 0.14, 0.024, 0.026, wrap);
    for (const z of [-0.19, -0.12, -0.05, 0.02, 0.09]) {
      const band = mesh(new THREE.TorusGeometry(0.025, 0.005, 5, 12), MAT.cord, buster, 0, 0, z);
      band.rotation.y = 0.25;
    }
    const pommel = mesh(new THREE.TorusGeometry(0.032, 0.008, 7, 16), darkIron, buster, 0, 0, -0.268);
    pommel.rotation.y = Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.054, 0.24, 0.036), darkIron, buster, 0, 0, 0.156);
    mesh(new THREE.BoxGeometry(0.060, 0.048, 0.042), MAT.gold, buster, 0, 0, 0.156);
    for (const s of [-1, 1]) mesh(new THREE.SphereGeometry(0.014, 8, 8), MAT.gold, buster, 0, s * 0.092, 0.156);
  }

  // ---- 2. executioner: ultra-wide asymmetric manga cleaver with giant circular cutout & spine notch
  const executioner = grp(parent); executioner.name = 'manga-executioner';
  {
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.068);
    sh.quadraticCurveTo(L * 0.45, -0.102, L * 0.82, -0.096);
    // sweeping razor tip curving up to a brutal point
    sh.quadraticCurveTo(L * 0.97, -0.058, L, 0.072);
    // spine with a sharp manga angular notch mid-blade
    sh.lineTo(L * 0.56, 0.092);
    sh.lineTo(L * 0.50, 0.052);
    sh.lineTo(L * 0.44, 0.088);
    sh.lineTo(0, 0.068);
    sh.closePath();
    // iconic large circular cutout near the upper third of the blade
    const hole = new THREE.Path();
    hole.absarc(L * 0.67, 0.006, 0.040, 0, Math.PI * 2, true);
    sh.holes.push(hole);
    mesh(extrudeBlade(sh, 0.012), steel, executioner).name = 'executioner-blade';
    // bandaged handle with trailing crimson cloth ribbon and heavy iron collar
    cyl(executioner, -0.25, 0.145, 0.023, 0.025, wrap);
    for (const z of [-0.20, -0.13, -0.06, 0.01, 0.08]) cyl(executioner, z, z + 0.018, 0.026, 0.026, MAT.cord, 10);
    cyl(executioner, -0.275, -0.24, 0.028, 0.032, darkIron, 8);
    const ribbon = mesh(new THREE.PlaneGeometry(0.042, 0.22), cloth, executioner, 0, -0.11, -0.27);
    ribbon.rotation.set(0.35, Math.PI / 2, 0);
    mesh(new THREE.BoxGeometry(0.050, 0.185, 0.038), darkIron, executioner, 0, 0, 0.16);
    mesh(new THREE.BoxGeometry(0.036, 0.155, 0.055), MAT.gold, executioner, 0, 0, 0.182);
  }

  // ---- 3. fang: serrated sawtooth demon greatsword with jagged fangs and horned guard
  const fang = grp(parent); fang.name = 'manga-fang';
  {
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.072);
    // 5 jagged manga demon teeth along the cutting edge
    const teeth = 5;
    for (let i = 0; i < teeth; i++) {
      const t0 = 0.08 + (i / teeth) * 0.72;
      const tMid = t0 + 0.075;
      const t1 = t0 + 0.135;
      const curve = 0.022 * t0 * t0;
      sh.lineTo(L * t0, curve - 0.076 - 0.018 * Math.sin(Math.PI * t0));
      sh.lineTo(L * tMid, curve - 0.118 - 0.012 * Math.sin(Math.PI * tMid));
      sh.lineTo(L * t1, curve - 0.074 - 0.015 * Math.sin(Math.PI * t1));
    }
    // wicked hooked claw tip
    sh.quadraticCurveTo(L * 0.96, -0.068, L, 0.056);
    // notched demon spine
    sh.lineTo(L * 0.76, 0.098);
    sh.lineTo(L * 0.66, 0.068);
    sh.lineTo(L * 0.36, 0.092);
    sh.lineTo(L * 0.28, 0.064);
    sh.lineTo(0, 0.072);
    sh.closePath();
    mesh(extrudeBlade(sh, 0.013), steel, fang).name = 'fang-blade';
    // demon-horned crossguard and spiked pommel
    cyl(fang, -0.24, 0.145, 0.023, 0.026, wrap);
    for (const z of [-0.18, -0.10, -0.02, 0.06]) {
      const band = mesh(new THREE.TorusGeometry(0.025, 0.0055, 5, 10), MAT.cord, fang, 0, 0, z);
      band.rotation.y = 0.3;
    }
    mesh(new THREE.ConeGeometry(0.028, 0.065, 6), darkIron, fang, 0, 0, -0.268).rotation.x = -Math.PI / 2;
    mesh(new THREE.BoxGeometry(0.052, 0.17, 0.036), darkIron, fang, 0, 0, 0.158);
    for (const s of [-1, 1]) {
      const horn = mesh(new THREE.ConeGeometry(0.022, 0.13, 6), MAT.gold, fang, 0, s * 0.105, 0.185);
      horn.rotation.x = s * -0.95;
    }
  }

  // ---- 4. winged: double-edged fantasy manga greatsword with flared waist & wide winged guard
  const winged = grp(parent); winged.name = 'manga-winged';
  {
    const sh = new THREE.Shape();
    sh.moveTo(0, -0.062);
    sh.lineTo(L * 0.16, -0.088);
    sh.lineTo(L * 0.26, -0.064);
    sh.quadraticCurveTo(L * 0.56, -0.106, L * 0.82, -0.076);
    sh.lineTo(L, 0);
    sh.lineTo(L * 0.82, 0.076);
    sh.quadraticCurveTo(L * 0.56, 0.106, L * 0.26, 0.064);
    sh.lineTo(L * 0.16, 0.088);
    sh.lineTo(0, 0.062);
    sh.closePath();
    // diamond rune cutout in the lower center
    const rune = new THREE.Path();
    rune.moveTo(L * 0.18, 0);
    rune.lineTo(L * 0.24, -0.022);
    rune.lineTo(L * 0.30, 0);
    rune.lineTo(L * 0.24, 0.022);
    rune.closePath();
    sh.holes.push(rune);
    mesh(extrudeBlade(sh, 0.011), steel, winged).name = 'winged-blade';
    // ornate gold hilt, sweeping angel-wing crossguard and glowing gem core
    cyl(winged, -0.24, 0.145, 0.021, 0.023, wrap);
    for (const z of [-0.19, -0.12, -0.05, 0.02, 0.09]) cyl(winged, z, z + 0.012, 0.024, 0.024, MAT.gold, 10);
    mesh(new THREE.OctahedronGeometry(0.032, 0), MAT.gold, winged, 0, 0, -0.262);
    mesh(new THREE.BoxGeometry(0.044, 0.14, 0.032), MAT.gold, winged, 0, 0, 0.155);
    mesh(new THREE.OctahedronGeometry(0.028, 0), steel, winged, 0, 0, 0.162);
    for (const s of [-1, 1]) {
      const wingA = mesh(new THREE.BoxGeometry(0.018, 0.16, 0.042), MAT.gold, winged, 0, s * 0.12, 0.172);
      wingA.rotation.x = s * -0.45;
      const wingB = mesh(new THREE.ConeGeometry(0.022, 0.14, 6), MAT.gold, winged, 0, s * 0.20, 0.205);
      wingB.rotation.x = s * -0.82;
    }
  }

  const models: Record<MangaBlade, THREE.Group> = { buster, executioner, fang, winged };
  for (const m of Object.values(models)) {
    m.visible = false;
    m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  const blades = Object.fromEntries(
    Object.entries(models).map(([k, m]) => [k, m.getObjectByName(`${k}-blade`)!])
  ) as Record<MangaBlade, THREE.Object3D>;

  return (manga: MangaBlade | undefined, length: number, widthMult = 1) => {
    for (const k of Object.keys(models) as MangaBlade[]) models[k].visible = k === manga;
    if (!manga) return;
    blades[manga].scale.set(1, widthMult, length);
    blades[manga].position.z = BLADE_PROFILE.base - BLADE_PROFILE.base * length;
  };
}
