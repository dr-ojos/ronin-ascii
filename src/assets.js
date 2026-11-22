// Assets loaded before the game starts.
// motion-captured human rig (three.js example asset, Mixamo skeleton) used for samurai and oni
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const go = document.getElementById('go');
go.textContent = '[ cargando personajes... ]';
let gltf = null;
try { gltf = await new GLTFLoader().loadAsync('./models/Soldier.glb'); }
catch (e) { console.warn('No se pudo cargar el modelo realista, uso el procedural', e); }
go.textContent = '[ clic para desenvainar ]';

/** null when the model failed to load: the procedural samurai / oni are used instead */
export const rigGltf = gltf;
