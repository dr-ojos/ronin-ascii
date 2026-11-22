// Audio (audio.js: cinematic synth + reverb) and a stereo panning helper.
import { createAudio } from './audio.js';
import { player, state } from './state.js';

export const sfx = createAudio();
// stereo position of a world point relative to the camera
export const panOf = (x, z) => Math.max(-1, Math.min(1, ((x - player.pos.x) * Math.cos(state.yaw) - (z - player.pos.z) * Math.sin(state.yaw)) / 8));
