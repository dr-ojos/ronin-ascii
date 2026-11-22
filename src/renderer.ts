// WebGL renderer, main scene and camera.
import * as THREE from 'three';

export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
export const DPR = Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;   // only affects the "T" (no ASCII) view; the ASCII pass grades itself
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.prepend(renderer.domElement);
export const canvas = renderer.domElement;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060912);
scene.fog = new THREE.FogExp2(0x131b34, 0.016);
export const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 260);
