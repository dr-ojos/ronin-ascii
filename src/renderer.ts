// WebGL renderer, main scene and camera.
import * as THREE from 'three';
import { dprFor, preset, quality } from './quality';

export const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
/** screen pixels per CSS pixel, capped by the graphics quality (quality.ts); changes live via setDpr */
export let DPR = dprFor(quality);
renderer.setPixelRatio(DPR);
export function setDpr(d: number) { DPR = d; renderer.setPixelRatio(d); renderer.setSize(innerWidth, innerHeight); }
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;   // only affects the "T" (no ASCII) view; the ASCII pass grades itself
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = preset().shadowType;
document.body.prepend(renderer.domElement);
export const canvas = renderer.domElement;

export const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060912);
scene.fog = new THREE.FogExp2(0x131b34, 0.016);
export const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 260);
