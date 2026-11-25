// What the ronin has mapped stays mapped: the fog-of-war grid of minimap.ts is kept in the browser (and in the
// cloud with an account: account.ts merges two of them cell by cell, the clearer one wins).
// The world is the same every run, so it is one map for every class.
//
// Stored compact: each cell rounded to 16 levels of clearness, run-length encoded as (level, run ≤ 255)
// byte pairs, then base64. An untouched map is ~5 KB; the explored parts are big blobs, so it grows slowly.
export const MAP_KEY = 'ronin-ascii.map';
const VERSION = 'v1:';

export function encodeFog(fog: Uint8Array): string {
  const out: number[] = [];
  let q = -1, run = 0;
  for (let k = 0; k < fog.length; k++) {
    const v = Math.round(fog[k] / 17);
    if (v === q && run < 255) { run++; continue; }
    if (run) out.push(q, run);
    q = v; run = 1;
  }
  if (run) out.push(q, run);
  let s = '';
  for (let i = 0; i < out.length; i += 8192) s += String.fromCharCode(...out.slice(i, i + 8192));
  return VERSION + btoa(s);
}

/** fills `fog` from a stored map (false, leaving it as it was, if the map is missing, broken or another size) */
export function decodeFog(raw: string | null, fog: Uint8Array): boolean {
  if (!raw || !raw.startsWith(VERSION)) return false;
  try {
    const s = atob(raw.slice(VERSION.length)), cells = new Uint8Array(fog.length);
    let k = 0;
    for (let i = 0; i + 1 < s.length; i += 2) {
      const v = s.charCodeAt(i) * 17, run = s.charCodeAt(i + 1);
      if (k + run > cells.length) return false;
      cells.fill(v, k, k + run); k += run;
    }
    if (k !== cells.length) return false;
    fog.set(cells);
    return true;
  } catch { return false; }
}

/** two stored maps into one: each cell as clear as in either */
export function mergeFogs(a: string, b: string, cells: number): string {
  const fa = new Uint8Array(cells), fb = new Uint8Array(cells);
  const okA = decodeFog(a, fa), okB = decodeFog(b, fb);
  if (!okA) return okB ? b : a;
  if (!okB) return a;
  for (let k = 0; k < cells; k++) if (fb[k] > fa[k]) fa[k] = fb[k];
  return encodeFog(fa);
}

export function loadFog(fog: Uint8Array): boolean {
  try { return decodeFog(localStorage.getItem(MAP_KEY), fog); } catch { return false; }
}
let held = false;
/** stops saving (account.ts, before reloading the page with what came from the cloud) */
export function holdFog() { held = true; }
export function storeFog(fog: Uint8Array) {
  if (held) return;
  try { localStorage.setItem(MAP_KEY, encodeFog(fog)); } catch { /* no storage */ }
}
