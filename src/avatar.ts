// The player's samurai (mocap rig if the model loaded, procedural otherwise) and its per-frame animation.
import * as THREE from 'three';
import { rigGltf } from './assets';
import { createSamurai } from './samurai';
import { createRealSamurai } from './rig';
import { wind as natureWind } from './nature';
import { scene } from './renderer';
import { ACTOR_LAYER } from './ascii';
import { CLS, tagTree } from './materials';
import { updateNature, placeMoonShadow } from './world';
import { enemies } from './enemies';
import { player, state } from './state';
import { angDiff } from './utils';
import { shopRoninPos, shopRoninFacing, shopStageActive } from './shop-stage';
import { mangaFinish } from './manga-art';

export const sam = rigGltf ? createRealSamurai(rigGltf) : createSamurai();
// luminous armour: each material glows softly with its own colour (cloned so the oni keep theirs)
{
  const done = new Map<THREE.MeshStandardMaterial, THREE.MeshStandardMaterial>();
  sam.root.traverse(obj => {
    const o = obj as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
    if (!o.isMesh || !o.material || !o.material.isMeshStandardMaterial) return;
    let m = done.get(o.material);
    if (!m) {
      m = o.material.clone();
      // only a whisper of self-light so the blacks keep their colour; the scene lights do the rest
      if (m.map) { m.emissive.set(0xffffff); m.emissiveMap = m.map; m.emissiveIntensity = 0.04; }
      else { m.emissive.copy(m.color); m.emissiveIntensity = 0.05; }
      done.set(o.material, m);
    }
    o.material = m;
  });
}
// glowing blade (the extruded mesh inside the katana group)
export const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf4f9ff, metalness: 0.6, roughness: 0.14, emissive: 0xa6dcff, emissiveIntensity: 2.2 });
sam.katana.traverse(obj => { const o = obj as THREE.Mesh; if (o.isMesh && o.geometry.type === 'ExtrudeGeometry') { o.material = bladeMat; } });
sam.root.traverse(o => { if ((o as THREE.Mesh).isMesh && o.castShadow) o.layers.enable(ACTOR_LAYER); });
mangaFinish(sam.root);
tagTree(sam.root, CLS.actor);
scene.add(sam.root);

export function animSamurai(dt: number) {
  updateNature(state.time, player.pos);
  const push = natureWind.uPush.value;
  push[0].set(player.pos.x, player.pos.z, 1.5, 0);
  for (let i = 1; i < push.length; i++) {
    const en = enemies[i - 1];
    if (en) push[i].set(en.g.position.x, en.g.position.z, 1.3 * en.scale, 0); else push[i].set(-999, -999, 0.001, 0);
  }
  const trading = shopStageActive();
  sam.root.position.copy(trading ? shopRoninPos : player.pos);
  sam.root.rotation.y = trading ? shopRoninFacing - 0.15 + 0.19 * Math.sin(state.time * 0.83) : player.face;
  let look = 0, best = 12;
  for (const en of enemies) {
    const dx = en.g.position.x - player.pos.x, dz = en.g.position.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d < best) { best = d; look = angDiff(Math.atan2(dx, dz), player.face); }
  }
  sam.update(dt, {
    time: state.time, moving: trading ? 0 : player.moving, walk: player.walk,
    showWeapon: trading,
    dash: !trading && player.dashT > 0, look: !trading && Math.abs(look) < 1.6 ? look : 0,
    attack: !trading && player.attackT >= 0 ? { combo: player.combo, p: player.attackT / player.attackDur } : null
  });
  placeMoonShadow(sam.root.position);
}
