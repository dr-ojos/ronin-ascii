// Small math helpers shared by every module.
export const rnd = (a, b) => a + Math.random() * (b - a);
/** signed difference between two angles, wrapped to [-PI, PI] */
export const angDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
