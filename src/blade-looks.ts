// Swords from across the sea, held and swung like the katana (the same grip and cuts) but forged otherwise:
//   · jian (劍): the xiákè's straight, double-edged sword, a winged guard and a red tassel from the pommel;
//   · dao (刀): the Chinese sabre, its blade widening towards a clipped point, a round guard and a red streamer;
//   · hwandu (環頭): the hwarang's ring-pommel sword (hwandudaedo), straight and single-edged, a ring for a pommel.
// Built once in the katana's slot (weapon-models.ts shows one at a time). Each blade starts at the katana's
// blade base and is scaled along +z like it, so the trail, halo and sparks (katana-fx.ts) follow it as they are.
import * as THREE from 'three';
import { BLADE_PROFILE, MAT, grp, mesh, type BladeProfile } from './samurai';

export type BladeLook = 'jian' | 'dao' | 'hwandu';
/** the shape the sheen and the edge sparks follow (katana-fx.ts) */
export const LOOK_PROFILE: Record<BladeLook, BladeProfile> = {
  jian: { ...BLADE_PROFILE, curve: 0, width: 0.032, taper: 0.006 },
  dao: { ...BLADE_PROFILE, curve: 0.03, width: 0.036, taper: -0.012 },
  hwandu: { ...BLADE_PROFILE, curve: 0.004, width: 0.03, taper: 0.004 }
};

/** a flat blade along +z from the katana's blade base: `edge(t)` gives its two edges (y) at 0 … 1 */
function blade(edge: (t: number) => [number, number], tip: (sh: THREE.Shape, L: number) => void) {
  const { base, length: L } = BLADE_PROFILE, N = 24, sh = new THREE.Shape();
  const [b0] = edge(0);
  sh.moveTo(0, b0);
  for (let i = 1; i <= N; i++) { const t = (i / N) * 0.9; sh.lineTo(t * L, edge(t)[0]); }
  tip(sh, L);
  for (let i = N; i >= 0; i--) { const t = (i / N) * 0.9; sh.lineTo(t * L, edge(t)[1]); }
  const depth = 0.004;
  const g = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.0024, bevelSize: 0.0018, bevelSegments: 1, curveSegments: 6 });
  g.rotateY(-Math.PI / 2);
  g.translate(depth / 2, 0, base);
  g.computeVertexNormals();
  return g;
}
const halfWidth = (p: BladeProfile, t: number) => (p.width - p.taper * t) / 2;

export function createBladeLooks(parent: THREE.Object3D, steel: THREE.MeshStandardMaterial) {
  const cyl = (g: THREE.Object3D, a: number, b: number, r0: number, r1: number, m: THREE.Material, sides = 12) =>
    mesh(new THREE.CylinderGeometry(r0, r1, b - a, sides), m, g, 0, 0, (a + b) / 2).rotation.x = Math.PI / 2;
  const red = new THREE.MeshStandardMaterial({ color: 0xc0262a, roughness: 0.7, side: THREE.DoubleSide });
  const jade = new THREE.MeshStandardMaterial({ color: 0x3fbf86, roughness: 0.25, metalness: 0.1 });
  const darkWrap = new THREE.MeshStandardMaterial({ color: 0x1d2a26, roughness: 0.85 });
  const ray = new THREE.MeshStandardMaterial({ color: 0x2a1e1c, roughness: 0.6 });

  // ---- jian: symmetric, straight, a long point; a gilt guard with two wings, a jade bead at the pommel
  const jian = grp(parent); jian.name = 'jian-model';
  {
    const p = LOOK_PROFILE.jian;
    const g = blade(t => [-halfWidth(p, t), halfWidth(p, t)], (sh, L) => sh.lineTo(L, 0));
    mesh(g, steel, jian).name = 'jian-blade';
    cyl(jian, -0.12, 0.125, 0.0155, 0.0165, darkWrap);
    for (let z = -0.1; z < 0.12; z += 0.04) cyl(jian, z, z + 0.008, 0.0175, 0.0175, MAT.gold, 10);
    const guard = mesh(new THREE.BoxGeometry(0.016, 0.1, 0.022), MAT.gold, jian, 0, 0, 0.142);
    guard.scale.x = 1.2;
    for (const s of [-1, 1]) { const w = mesh(new THREE.ConeGeometry(0.014, 0.03, 8), MAT.gold, jian, 0, s * 0.058, 0.148); w.rotation.x = s * -1.1; }
    cyl(jian, -0.15, -0.12, 0.024, 0.018, MAT.gold, 10);
    mesh(new THREE.SphereGeometry(0.016, 12, 10), jade, jian, 0, 0, -0.16);
    // the tassel (sui) hangs from the pommel: a cord and a red tuft
    const cord = mesh(new THREE.CylinderGeometry(0.0035, 0.0035, 0.09, 5), red, jian, 0, -0.045, -0.172);
    cord.rotation.x = 0.35;
    const tuft = mesh(new THREE.ConeGeometry(0.016, 0.07, 10, 1, true), red, jian, 0, -0.115, -0.19);
    tuft.rotation.x = 0.35;
  }

  // ---- dao: a sabre that widens towards the point, back edge straight-ish, belly curving up into a clipped tip
  const dao = grp(parent); dao.name = 'dao-model';
  {
    const p = LOOK_PROFILE.dao, c = (t: number) => p.curve * t * t;
    const g = blade(t => [c(t) - halfWidth(p, t) - 0.006 * Math.sin(Math.PI * t), c(t) + 0.016],
      (sh, L) => { sh.quadraticCurveTo(L * 0.99, c(1) - halfWidth(p, 1), L, c(1) + 0.02); });
    mesh(g, steel, dao).name = 'dao-blade';
    cyl(dao, -0.12, 0.125, 0.016, 0.017, red);
    const guard = mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.012, 24), MAT.gold, dao, 0, 0, 0.138);
    guard.rotation.x = Math.PI / 2; guard.scale.x = 0.8;
    cyl(dao, -0.15, -0.12, 0.02, 0.017, MAT.iron, 10);
    const ring = mesh(new THREE.TorusGeometry(0.014, 0.004, 6, 14), MAT.gold, dao, 0, 0, -0.165);
    ring.rotation.y = Math.PI / 2;
    // the streamer tied to the ring
    const flag = mesh(new THREE.PlaneGeometry(0.035, 0.16), red, dao, 0, -0.08, -0.18);
    flag.rotation.set(0.3, Math.PI / 2, 0);
  }

  // ---- hwandu: the ring-pommel sword, straight and single-edged with a chisel point, ray-skin grip
  const hwandu = grp(parent); hwandu.name = 'hwandu-model';
  {
    const p = LOOK_PROFILE.hwandu, c = (t: number) => p.curve * t * t;
    const g = blade(t => [c(t) - halfWidth(p, t), c(t) + halfWidth(p, t)],
      (sh, L) => { sh.lineTo(L * 0.97, c(0.97) - halfWidth(p, 1)); sh.lineTo(L, c(1) + halfWidth(p, 1) * 0.6); });
    mesh(g, steel, hwandu).name = 'hwandu-blade';
    cyl(hwandu, -0.12, 0.125, 0.0155, 0.0165, ray);
    for (const z of [-0.06, 0.04]) cyl(hwandu, z, z + 0.012, 0.0175, 0.0175, MAT.gold, 10);
    const guard = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20), MAT.iron, hwandu, 0, 0, 0.138);
    guard.rotation.x = Math.PI / 2; guard.scale.x = 0.7;
    cyl(hwandu, -0.135, -0.12, 0.019, 0.017, MAT.gold, 10);
    // the ring head that gives it its name, with a gilded bird's head inside it
    const head = mesh(new THREE.TorusGeometry(0.03, 0.0065, 8, 28), MAT.gold, hwandu, 0, 0, -0.168);
    head.rotation.y = Math.PI / 2; head.scale.y = 1.15;
    mesh(new THREE.SphereGeometry(0.009, 10, 8), MAT.gold, hwandu, 0, 0, -0.168);
  }

  const models: Record<BladeLook, THREE.Group> = { jian, dao, hwandu };
  for (const m of Object.values(models)) {
    m.visible = false;
    m.traverse(o => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  const blades = Object.fromEntries(Object.entries(models).map(([k, m]) => [k, m.getObjectByName(`${k}-blade`)!])) as Record<BladeLook, THREE.Object3D>;
  /** show one look (or none: the plain katana) and size its blade like the katana's */
  return (look: BladeLook | undefined, length: number) => {
    for (const k of Object.keys(models) as BladeLook[]) models[k].visible = k === look;
    if (!look) return;
    blades[look].scale.set(1, 1, length);
    blades[look].position.z = BLADE_PROFILE.base - BLADE_PROFILE.base * length;
  };
}
