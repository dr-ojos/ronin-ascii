// Assets loaded before the game starts.
// motion-captured human rig (three.js example asset, Mixamo skeleton) used for samurai and oni
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js';

const go = document.getElementById('go') as HTMLButtonElement;
go.textContent = 'CARGANDO PERSONAJES…'; go.disabled = true;
let gltf: GLTF | null = null;
// the realistic head: a 3D scan by Lee Perry-Smith (CC BY 3.0), see real-head.ts
let head: { geo: THREE.BufferGeometry; map: THREE.Texture; normal: THREE.Texture } | null = null;
const tex = new THREE.TextureLoader();
let samuraiGltf: GLTF | null = null;
const [soldier, scan, samurai] = await Promise.allSettled([
  new GLTFLoader().loadAsync('./models/Soldier.glb'),
  Promise.all([
    new GLTFLoader().loadAsync('./models/head/LeePerrySmith.glb'),
    tex.loadAsync('./models/head/Map-COL.jpg'),
    tex.loadAsync('./models/head/Infinite-Level_02_Tangent_SmoothUV.jpg')
  ]),
  new GLTFLoader().loadAsync('./models/samurai-armor.glb')
]);
if (soldier.status === 'fulfilled') gltf = soldier.value;
else console.warn('No se pudo cargar el modelo realista, uso el procedural', soldier.reason);
if (scan.status === 'fulfilled') {
  const [g, map, normal] = scan.value;
  const mesh = g.scene.getObjectByName('LeePerrySmith') as THREE.Mesh | undefined;
  if (mesh) { map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = 4; head = { geo: mesh.geometry, map, normal }; }
} else console.warn('No se pudo cargar la cabeza escaneada', scan.reason);
if (samurai.status === 'fulfilled') samuraiGltf = samurai.value;
else console.warn('No se pudo cargar la armadura samurái GLB', samurai.reason);
go.textContent = '▶ INICIAR JUEGO'; go.disabled = false;

/** null when the model failed to load: the procedural samurai / oni are used instead */
export const rigGltf = gltf;
/** the scanned head (real-head.ts), or null if it failed to load */
export const headAsset = head;
/** CC0 rigged Samurai armor GLB (public/models/samurai-armor.glb), or null if failed to load */
export const samuraiArmorGltf = samuraiGltf;
