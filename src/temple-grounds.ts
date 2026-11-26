import * as THREE from 'three';
import { addLight } from './lights';
import { CLS, M, tagMat } from './materials';
import { FOOTPRINTS, TEMPLES, type TemplePlace } from './map';
import { addCollider } from './physics';
import { add, box, floors, G, hangingLantern, MT, post, pyr, site, solidBox, stoneLantern, toWorld, torii } from './structures';
import { TECHNIQUES } from './techniques';
import { createTempleMonk, type TempleMonkRig } from './temple-monks';

const courtZ = 8;

export const templeMasters: { temple: TemplePlace; figure: THREE.Group; rig: TempleMonkRig; x: number; z: number }[] = [];

function crestMat(temple: TemplePlace, color: number) {
  const c = document.createElement('canvas'); c.width = 96; c.height = 160;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#111521'; ctx.fillRect(0, 0, 96, 160);
  ctx.strokeStyle = ctx.fillStyle = `#${color.toString(16)}`;
  ctx.lineWidth = 3; ctx.strokeRect(6, 6, 84, 148);
  ctx.beginPath(); ctx.arc(48, 71, 30, 0, Math.PI * 2); ctx.stroke();
  ctx.font = '40px serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(temple.crest, 48, 73);
  ctx.fillRect(20, 116, 56, 4); ctx.fillRect(29, 128, 38, 2);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace;
  return tagMat(M(0xffffff, { map, emissive: 0xffffff, emissiveMap: map, emissiveIntensity: 0.65, side: THREE.DoubleSide }), CLS.wood);
}

export function buildTemples() {
  for (const temple of TEMPLES) {
    const { x, z, facing } = temple, y = temple.level!;
    const color = TECHNIQUES[temple.technique].color;
    const g = new THREE.Group(); g.name = temple.name; g.position.set(x, y, z); g.rotation.y = facing;
    const worldAt = (lx: number, lz: number) => toWorld(x, z, facing, lx, lz);
    const pillar = tagMat(M(new THREE.Color(color).multiplyScalar(0.23)), CLS.wood);
    const inlay = tagMat(M(color, { emissive: color, emissiveIntensity: 0.6 }), CLS.light);
    const banner = crestMat(temple, color);
    const court = add(g, G.plane, MT.gravel, 0, 0.025, courtZ, 19, 30, 1);
    court.rotation.x = -Math.PI / 2;
    const [cx, cz] = worldAt(0, courtZ);
    FOOTPRINTS.rects.push([cx, cz, 19, 30, facing]);

    // Low stone veranda with an open front. The paths meet the torii at the courtyard entrance.
    box(g, 11.5, 0.26, 9.4, MT.foundation, 0, -0.01, 0);
    box(g, 5.4, 0.13, 0.65, MT.stone, 0, 0, 5);
    floors.push((wx, wz) => {
      const [lx, lz] = toWorld(0, 0, -facing, wx - x, wz - z);
      if (Math.abs(lx) <= 5.75 && Math.abs(lz) <= 4.7) return y + 0.25;
      return Math.abs(lx) <= 2.7 && lz > 4.7 && lz < 5.32 ? y + 0.13 : null;
    });
    for (const side of [-1, 1]) {
      box(g, 0.3, 3.18, 6.3, MT.siding, side * 4.95, 0.25, -1.35);
      const [sx, sz] = worldAt(side * 4.95, -1.35);
      solidBox(sx, sz, 0.3, 6.3, facing, false);
      for (const pz of [-4.25, 0.5, 4.25]) {
        post(g, 0.24, 3.55, pillar, side * 4.95, 0.25, pz);
        box(g, 0.68, 0.23, 0.68, MT.stone, side * 4.95, 0.25, pz);
        const [px, wz] = worldAt(side * 4.95, pz); addCollider({ x: px, z: wz, r: 0.33 });
      }
      add(g, G.plane, banner, side * 3.62, 2.15, 4.28, 1.05, 1.75, 1);
      hangingLantern(g, side * 2.35, 2.95, 4.85, 0.88);
      for (const lz of [11.7, 18.6]) {
        const lx = side * (lz < 15 ? 5 : 3.8), [wx, wz] = worldAt(lx, lz);
        stoneLantern(g, lx, 0, lz, wx, wz, 0.86);
        addCollider({ x: wx, z: wz, r: 0.39 });
      }
    }
    box(g, 10, 3.3, 0.32, MT.siding, 0, 0.25, -4.4);
    const [bx, bz] = worldAt(0, -4.4); solidBox(bx, bz, 10, 0.32, facing, false);
    for (let i = -2; i <= 2; i++) add(g, G.plane, MT.shoji, i * 1.63, 2.15, -4.22, 1.44, 1.88, 1);
    box(g, 10.8, 0.38, 9.3, MT.woodL, 0, 3.46, 0);
    pyr(g, 13.9, 2.35, 11.4, MT.roof, 0, 3.83, 0);
    box(g, 14, 0.15, 11.5, MT.roofL, 0, 3.72, 0);
    pyr(g, 8.5, 1.75, 6.7, MT.roof, 0, 5.15, 0);
    box(g, 8.6, 0.17, 6.8, MT.roofL, 0, 4.99, 0);
    add(g, new THREE.OctahedronGeometry(0.38), inlay, 0, 7.13, 0, 1, 1.45, 1);

    torii(g, 0, 0, 21.7, 0, 1.15);
    add(g, G.plane, banner, 0, 4.36, 22.06, 0.52, 0.85, 1);
    for (const side of [-1, 1]) {
      const [tx, tz] = worldAt(side * 2.645, 21.7);
      addCollider({ x: tx, z: tz, r: 0.34 });
    }

    const rig = createTempleMonk(temple);
    const figure = rig.root;
    figure.position.set(0, 0.025, courtZ); g.add(figure);
    templeMasters.push({ temple, figure, rig, x: cx, z: cz });
    addCollider({ x: cx, z: cz, r: 0.38 });
    addLight({ x: cx, y: y + 2.8, z: cz, color, intensity: 6, distance: 12, decay: 1.45 });
    site(g, x, z, temple.r);
  }
}
