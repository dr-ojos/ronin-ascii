import * as THREE from 'three';
import { BLADE_PROFILE, MAT, bladeGeometry, grp, mesh } from './samurai';
import type { Avatar, WeaponForm } from './types';

export const BLADE_LAYOUT: Record<WeaponForm, { base: number; width: number }> = {
  katana: { base: BLADE_PROFILE.base, width: 1 },
  spear: { base: 0.91, width: 2.3 },
  broad: { base: 0.19, width: 4.25 },
  dual: { base: 0.113, width: 1.35 },
  // the staff has no blade: its upper half (the striking end, with the bronze cap) carries the trail and sparks
  staff: { base: 0.3, width: 1 }
};

export function createWeaponModels(sam: Avatar, steel: THREE.MeshStandardMaterial) {
  const katanaParts = [...sam.katana.children];
  const katana = grp(sam.katana);
  katana.name = 'katana-model';
  katana.add(...katanaParts);
  const katanaBlade = katana.children.find(o => (o as THREE.Mesh).geometry?.type === 'ExtrudeGeometry') as THREE.Mesh;
  katanaBlade.material = steel;
  katanaBlade.name = 'katana-blade';

  const wood = new THREE.MeshStandardMaterial({ color: 0x4c3027, roughness: 0.57 });
  const wrap = new THREE.MeshStandardMaterial({ color: 0x202638, roughness: 0.85 });
  function cylinder(group: THREE.Group, a: number, b: number, front: number, rear: number, material: THREE.Material, sides = 14) {
    mesh(new THREE.CylinderGeometry(front, rear, b - a, sides), material, group, 0, 0, (a + b) / 2).rotation.x = Math.PI / 2;
  }
  const spear = grp(sam.katana);
  spear.name = 'spear-model';
  cylinder(spear, -1.05, 0.92, 0.019, 0.025, wood);
  cylinder(spear, -1.06, -0.975, 0.024, 0.018, MAT.iron);
  cylinder(spear, -0.13, 0.46, 0.026, 0.026, wrap);
  for (const z of [-0.13, 0.47, 0.72, 0.79, 0.87]) cylinder(spear, z, z + 0.023, 0.028, 0.028, MAT.gold);
  cylinder(spear, 0.885, 0.935, 0.022, 0.034, MAT.iron, 8);
  const spearBlade = mesh(bladeGeometry('spear'), steel, spear);
  spearBlade.name = 'spearhead';

  const broad = grp(sam.katana);
  broad.name = 'broad-model';
  cylinder(broad, -0.186, 0.15, 0.023, 0.025, wrap);
  cylinder(broad, -0.205, -0.177, 0.027, 0.033, MAT.gold, 8);
  for (const z of [-0.142, -0.075, -0.008, 0.059, 0.126]) {
    const bind = mesh(new THREE.TorusGeometry(0.023, 0.0045, 5, 12), MAT.cord, broad, 0, 0, z);
    bind.rotation.y = 0.25;
  }
  const guard = mesh(new THREE.CylinderGeometry(0.086, 0.083, 0.026, 8), MAT.iron, broad, 0, 0, 0.151);
  guard.rotation.x = Math.PI / 2;
  guard.scale.x = 0.6;
  const rim = mesh(new THREE.TorusGeometry(0.083, 0.006, 6, 8), MAT.gold, broad, 0, 0, 0.151);
  rim.scale.x = 0.6;
  mesh(new THREE.BoxGeometry(0.027, 0.079, 0.051), MAT.gold, broad, 0, 0.003, 0.174);
  const broadBlade = mesh(bladeGeometry('broad'), steel, broad);
  broadBlade.name = 'broad-blade';

  function shortSword(parent: THREE.Object3D, name: string) {
    const group = grp(parent);
    group.name = name;
    cylinder(group, -0.087, 0.083, 0.017, 0.017, wrap);
    cylinder(group, -0.095, -0.068, 0.02, 0.022, MAT.gold, 8);
    for (const z of [-0.056, -0.018, 0.020, 0.059]) cylinder(group, z, z + 0.009, 0.018, 0.018, MAT.cord);
    cylinder(group, 0.076, 0.093, 0.041, 0.040, MAT.iron, 10);
    cylinder(group, 0.089, 0.111, 0.020, 0.022, MAT.gold, 8);
    const blade = mesh(bladeGeometry(), steel, group);
    blade.name = 'short-blade';
    return { group, blade };
  }
  // the sōhei's staff, held in the middle: the right hand at z = 0, the left hand further up the shaft.
  // Oak with bronze caps and bindings; the upper cap (in the glowing steel material) is the striking end,
  // crowned by the shakujō's ring and its six loose rings.
  const staff = grp(sam.katana);
  staff.name = 'staff-model';
  const oak = new THREE.MeshStandardMaterial({ color: 0x5a3a24, roughness: 0.62 });
  cylinder(staff, -0.78, 0.9, 0.021, 0.021, oak);
  for (const z of [-0.1, 0.33]) cylinder(staff, z, z + 0.11, 0.0235, 0.0235, wrap);
  for (const z of [-0.12, 0.0, 0.43]) cylinder(staff, z, z + 0.012, 0.025, 0.025, MAT.cord);
  cylinder(staff, -0.83, -0.76, 0.024, 0.026, steel, 10);                         // ferrule at the butt
  cylinder(staff, 0.86, 0.95, 0.026, 0.024, steel, 10);                           // cap at the head
  const head = grp(staff, 0, 0, 1.03);
  const loop = mesh(new THREE.TorusGeometry(0.075, 0.009, 6, 26), steel, head);
  loop.rotation.y = Math.PI / 2; loop.scale.y = 1.25;
  mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.19, 6), steel, head).rotation.x = Math.PI / 2;
  for (let i = 0; i < 6; i++) {
    const side = i < 3 ? 1 : -1, k = i % 3;
    const ring = mesh(new THREE.TorusGeometry(0.024, 0.004, 5, 14), steel, head, 0, side * (0.083 - k * 0.006), -0.035 + k * 0.035);
    ring.rotation.set(0.4 * side, 0, 0.2 * k);
  }
  head.name = 'staff-head';

  const shortR = shortSword(sam.katana, 'short-sword-right');
  const shortL = shortSword(sam.offhand, 'short-sword-left');
  const models = { katana, spear, broad, dual: shortR.group, staff };
  const blades: Record<WeaponForm, THREE.Object3D[]> = { katana: [katanaBlade], spear: [spearBlade], broad: [broadBlade], dual: [shortR.blade, shortL.blade], staff: [] };
  for (const model of [spear, broad, shortR.group, shortL.group, staff]) model.traverse(o => {
    if ((o as THREE.Mesh).isMesh) { o.castShadow = true; o.receiveShadow = true; }
  });
  return (form: WeaponForm, length: number) => {
    for (const key of Object.keys(models) as WeaponForm[]) models[key].visible = key === form;
    // a longer staff: the shaft and its head stretch with the weapon's length
    if (form === 'staff') staff.scale.set(1, 1, length / 0.9);
    sam.offhand.visible = form === 'dual';
    const layout = BLADE_LAYOUT[form];
    for (const blade of blades[form]) {
      blade.scale.set(form === 'broad' ? 1.9 : 1, layout.width, length);
      blade.position.z = layout.base - BLADE_PROFILE.base * length;
    }
  };
}
