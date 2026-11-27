// Accounts: sign in (Google, or email and password) and the ronin's save follows you to any browser.
// The game itself still saves only in localStorage (progression.ts, vault.ts, look.ts, score.ts, classes.ts);
// (and map-memory.ts, the map explored); this module copies every `ronin-ascii.*` key to one Firestore document per account, saves/{uid}, and back.
//
// Signing in pulls the cloud save and merges it with this browser's: the higher experience wins for each
// class's level, the items won and the land mapped are joined (nothing is lost from either side), the best score is the higher,
// and the rest (look, class, settings) comes from the cloud. If that changes anything here the page reloads
// between runs, so every module reads the merged save from the start. After that, every change is pushed.
//
// Firebase is only loaded when firebase-config.ts names a project; without one the game has no accounts.
import type { Auth, User } from 'firebase/auth';
import type { Firestore } from 'firebase/firestore';
import { cloudEnabled, firebaseConfig } from './firebase-config';
import { state } from './state';
import { saveProgress } from './progression';
import { holdVault, mergeVaults, parseVault, saveVault, VAULT_PREFIX } from './vault';
import { holdFog, MAP_KEY, mergeFogs } from './map-memory';
import { saveMinimap, FOG_CELLS } from './minimap';

const PREFIX = 'ronin-ascii.';
type Saves = Record<string, string>;
interface Cloud { auth: Auth; db: Firestore; fa: typeof import('firebase/auth'); fs: typeof import('firebase/firestore') }
let cloud: Cloud | null = null;

const account = { user: null as User | null, ready: false, synced: false, savedAt: 0, failed: '' };
const listeners = new Set<() => void>();
/** the title screen (title.ts) redraws on every change: signed in or out, synced, saved, failed */
export function onAccount(fn: () => void) { listeners.add(fn); fn(); }
function refresh() { for (const fn of listeners) fn(); }
export const accountEnabled = cloudEnabled;
/** ready: Firebase has said whether someone is signed in (at once without a project) */
export const accountView = () => ({
  ready: account.ready || !cloudEnabled(), synced: account.synced, savedAt: account.savedAt, failed: account.failed,
  user: account.user ? { email: account.user.email ?? '', name: account.user.displayName ?? '' } : null
});

// ------------------------------------------------------------ the save, as plain keys
function readLocal(): Saves {
  const out: Saves = {};
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)!;
      if (k.startsWith(PREFIX)) out[k] = localStorage.getItem(k)!;
    }
  } catch { /* no storage */ }
  return out;
}
// Firestore field names: no dots, so 'ronin-ascii.progress.samurai' is stored as 'progress~samurai'
const encode = (s: Saves) => Object.fromEntries(Object.entries(s).map(([k, v]) => [k.slice(PREFIX.length).replace(/\./g, '~'), v]));
function decode(raw: unknown): Saves {
  const out: Saves = {};
  if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (typeof v === 'string') out[PREFIX + k.replace(/~/g, '.')] = v;
  return out;
}
const total = (raw: string) => { try { return Number(JSON.parse(raw)?.total) || 0; } catch { return 0; } };
function mergeProgress(localRaw: string, remoteRaw: string): string {
  const winnerRaw = total(remoteRaw) >= total(localRaw) ? remoteRaw : localRaw;
  try {
    const l = JSON.parse(localRaw), r = JSON.parse(remoteRaw), w = JSON.parse(winnerRaw);
    const hpBonus = Math.max(Math.floor(Number(l?.hpBonus) || 0), Math.floor(Number(r?.hpBonus) || 0));
    if (hpBonus > 0 && w && typeof w === 'object') { w.hpBonus = hpBonus; return JSON.stringify(w); }
  } catch { /* fall back to winner */ }
  return winnerRaw;
}

/** this browser's save and the cloud's into one (stable: merging the result again changes nothing) */
function mergeSaves(local: Saves, remote: Saves): Saves {
  const out: Saves = { ...local };
  for (const [k, r] of Object.entries(remote)) {
    const l = local[k];
    if (l === undefined || l === r) out[k] = r;
    else if (k.startsWith(PREFIX + 'progress.')) out[k] = mergeProgress(l, r);
    else if (k.startsWith(VAULT_PREFIX)) out[k] = JSON.stringify(mergeVaults(parseVault(l), parseVault(r)));
    else if (k === MAP_KEY) out[k] = mergeFogs(l, r, FOG_CELLS);
    else if (k === PREFIX + 'best') out[k] = String(Math.max(Number(l) || 0, Number(r) || 0));
    else out[k] = r;
  }
  return out;
}
/** the modules write their own keys first, so the copy has the latest */
function flush() { saveProgress(); saveVault(); saveMinimap(); }

// ------------------------------------------------------------ the cloud
const saveRef = (c: Cloud, u: User) => c.fs.doc(c.db, 'saves', u.uid);
/** between runs: the title screen or the death screen */
const idle = () => new Promise<void>(res => { const t = () => (!state.playing || state.dead) ? res() : setTimeout(t, 1000); t(); });

async function pull(user: User) {
  const c = cloud!;
  const snap = await c.fs.getDoc(saveRef(c, user));
  const remote = decode(snap.exists() ? snap.data().keys : null);
  await idle();
  if (account.user?.uid !== user.uid) return;          // signed out meanwhile
  flush();
  const local = readLocal(), merged = mergeSaves(local, remote);
  const changed = Object.keys(merged).filter(k => merged[k] !== local[k]);
  // a guard against a reload loop, should a merge ever not settle
  const reloads = Number(sessionStorage.getItem('ronin-ascii-sync-reloads')) || 0;
  if (changed.length && reloads < 2) {
    sessionStorage.setItem('ronin-ascii-sync-reloads', String(reloads + 1));
    holdVault(); holdFog();                            // what the game holds now must not overwrite the merge
    for (const k of changed) localStorage.setItem(k, merged[k]);
    state.playing = false;   // no "leave the game?" prompt (input.ts) for our own reload
    location.reload();
    return;
  }
  sessionStorage.removeItem('ronin-ascii-sync-reloads');
  account.synced = true;
  await push(true);
}

let lastPushed = '';
async function push(force = false) {
  const c = cloud, user = account.user;
  if (!c || !user || !account.synced) return;
  flush();
  const local = readLocal(), sig = JSON.stringify(local);
  if (!force && sig === lastPushed) return;
  await c.fs.setDoc(saveRef(c, user), { keys: encode(local), updated: c.fs.serverTimestamp() }, { merge: true });
  lastPushed = sig; account.savedAt = Date.now(); account.failed = '';
  refresh();
}
const pushQuietly = () => { push().catch(e => { account.failed = errorText(e); refresh(); }); };
setInterval(pushQuietly, 20000);
addEventListener('visibilitychange', () => { if (document.hidden) pushQuietly(); });
addEventListener('ronin:overlay', pushQuietly);   // a run has ended

async function boot() {
  const [app, fa, fs] = await Promise.all([import('firebase/app'), import('firebase/auth'), import('firebase/firestore')]);
  const fbApp = app.initializeApp(firebaseConfig);
  cloud = { auth: fa.getAuth(fbApp), db: fs.getFirestore(fbApp), fa, fs };
  fa.onAuthStateChanged(cloud.auth, user => {
    account.user = user; account.ready = true; account.synced = false; lastPushed = '';
    if (user) pull(user).catch(e => { account.failed = errorText(e); refresh(); });
    refresh();
  });
}
if (cloudEnabled()) boot().catch(e => { account.failed = errorText(e); account.ready = true; refresh(); });

// ------------------------------------------------------------ messages
function errorText(e: unknown): string {
  const code = (e as { code?: string })?.code ?? '';
  const known: Record<string, string> = {
    'auth/invalid-credential': 'Email o contraseña incorrectos.',
    'auth/wrong-password': 'Email o contraseña incorrectos.',
    'auth/user-not-found': 'No hay ninguna cuenta con ese email.',
    'auth/invalid-email': 'Ese email no es válido.',
    'auth/missing-password': 'Escribe la contraseña.',
    'auth/email-already-in-use': 'Ya existe una cuenta con ese email: entra con ella.',
    'auth/weak-password': 'La contraseña necesita al menos 6 caracteres.',
    'auth/popup-closed-by-user': 'Has cerrado la ventana de Google.',
    'auth/popup-blocked': 'El navegador ha bloqueado la ventana de Google.',
    'auth/network-request-failed': 'Sin conexión. Inténtalo de nuevo.',
    'auth/too-many-requests': 'Demasiados intentos. Espera un poco.',
    'auth/operation-not-allowed': 'Este modo de entrar no está activado en Firebase.',
    'auth/unauthorized-domain': 'Este dominio no está autorizado en Firebase.',
    'permission-denied': 'Firestore ha rechazado el guardado (revisa firestore.rules).',
    'unavailable': 'Sin conexión con la nube. Se guardará más tarde.',
    'loading': 'La cuenta aún se está cargando. Prueba en un momento.'
  };
  return known[code] ?? `Error${code ? ` (${code})` : ''}.`;
}
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'hace un momento' : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
};

// ------------------------------------------------------------ what the title screen calls
async function withCloud(fn: (c: Cloud) => Promise<unknown>) {
  if (!cloud) throw { code: 'loading' };
  await fn(cloud);
}
export const signInGoogle = () => withCloud(c => c.fa.signInWithPopup(c.auth, new c.fa.GoogleAuthProvider()));
export const signInEmail = (email: string, password: string) => withCloud(c => c.fa.signInWithEmailAndPassword(c.auth, email.trim(), password));
export const signUpEmail = (email: string, password: string) => withCloud(c => c.fa.createUserWithEmailAndPassword(c.auth, email.trim(), password));
export const resetPassword = (email: string) => withCloud(c => c.fa.sendPasswordResetEmail(c.auth, email.trim()));
export const signOutAccount = () => withCloud(async c => { await push(true).catch(() => {}); await c.fa.signOut(c.auth); });
export const saveNow = () => push(true);
export { errorText as accountError, ago };
