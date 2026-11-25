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
import { closeMenu, menuStatus, openMenu, render as renderMenu, type MenuRow } from './menu';
import { overlay } from './hud';

const PREFIX = 'ronin-ascii.';
type Saves = Record<string, string>;
interface Cloud { auth: Auth; db: Firestore; fa: typeof import('firebase/auth'); fs: typeof import('firebase/firestore') }
let cloud: Cloud | null = null;

const account = { user: null as User | null, synced: false, busy: false, savedAt: 0, failed: '' };
const form = { email: '', password: '' };

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

/** this browser's save and the cloud's into one (stable: merging the result again changes nothing) */
function mergeSaves(local: Saves, remote: Saves): Saves {
  const out: Saves = { ...local };
  for (const [k, r] of Object.entries(remote)) {
    const l = local[k];
    if (l === undefined || l === r) out[k] = r;
    else if (k.startsWith(PREFIX + 'progress.')) out[k] = total(r) >= total(l) ? r : l;
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
    account.user = user; account.synced = false; lastPushed = '';
    if (user) pull(user).catch(e => { account.failed = errorText(e); refresh(); });
    refresh();
  });
}
if (cloudEnabled()) boot().catch(e => { account.failed = errorText(e); refresh(); });

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
    'unavailable': 'Sin conexión con la nube. Se guardará más tarde.'
  };
  return known[code] ?? `Error${code ? ` (${code})` : ''}.`;
}
const ago = (t: number) => {
  const s = Math.round((Date.now() - t) / 1000);
  return s < 60 ? 'hace un momento' : s < 3600 ? `hace ${Math.round(s / 60)} min` : `hace ${Math.round(s / 3600)} h`;
};

// ------------------------------------------------------------ the menu
async function attempt(fn: (c: Cloud) => Promise<unknown>, done?: string) {
  if (!cloud) return menuStatus('La cuenta aún se está cargando.');
  if (account.busy) return;
  account.busy = true; menuStatus('…');
  try { await fn(cloud); if (done) menuStatus(done); form.password = ''; }
  catch (e) { menuStatus(errorText(e)); }
  finally { account.busy = false; refresh(); }
}
const needEmail = () => { if (!form.email.trim()) { menuStatus('Escribe tu email.'); return false; } return true; };

function rows(): MenuRow[] {
  const back: MenuRow = { label: 'Volver', act: closeMenu };
  if (!cloudEnabled()) return [
    { label: 'Cuentas sin configurar', note: 'falta el proyecto de Firebase en src/firebase-config.ts · el progreso se guarda en este navegador' },
    back
  ];
  const u = account.user;
  if (u) return [
    { label: u.email || u.displayName || 'Cuenta', head: true },
    { label: 'Guardar ahora', value: account.synced ? (account.savedAt ? `guardado ${ago(account.savedAt)}` : 'listo') : 'sincronizando…', cls: account.synced ? 'b' : 'd',
      note: account.failed || 'nivel, atributos, armas, armaduras, técnicas, aspecto y récord se guardan solos',
      act: () => void attempt(() => push(true), 'Guardado en la nube.') },
    { label: 'Cerrar sesión', note: 'el progreso sigue también en este navegador',
      act: () => void attempt(async c => { await push(true).catch(() => {}); await c.fa.signOut(c.auth); }, 'Sesión cerrada.') },
    back
  ];
  return [
    { label: 'Email', input: { value: form.email, max: 80, set(v) { form.email = v; } } },
    { label: 'Contraseña', input: { value: form.password, max: 64, secret: true, set(v) { form.password = v; } } },
    { label: 'Entrar', act: () => { if (needEmail()) void attempt(c => c.fa.signInWithEmailAndPassword(c.auth, form.email.trim(), form.password)); } },
    { label: 'Crear cuenta', note: 'tu progreso de este navegador pasa a la cuenta',
      act: () => { if (needEmail()) void attempt(c => c.fa.createUserWithEmailAndPassword(c.auth, form.email.trim(), form.password), 'Cuenta creada.'); } },
    { label: 'Entrar con Google', act: () => void attempt(c => c.fa.signInWithPopup(c.auth, new c.fa.GoogleAuthProvider())) },
    { label: 'He olvidado la contraseña', note: 'te llega un email para cambiarla',
      act: () => { if (needEmail()) void attempt(c => c.fa.sendPasswordResetEmail(c.auth, form.email.trim()), 'Mira tu correo.'); } },
    back
  ];
}

const button = document.getElementById('account-btn')!;
function refresh() {
  const u = account.user;
  button.textContent = u ? `[ cuenta · ${u.email || u.displayName || 'conectado'} ]` : '[ cuenta · guardar progreso ]';
  if (state.menu === 'account') renderMenu();
}
// without a project the button only shows while developing, to say what is missing
button.hidden = !cloudEnabled() && !import.meta.env.DEV;
refresh();

export function openAccount(back?: () => void) {
  openMenu({
    id: 'account', title: '— CUENTA —',
    sub: () => account.user ? 'tu progreso viaja contigo' : 'entra para guardar tu progreso y lo que ganes',
    rows, foot: '↑ ↓ elegir · ENTER aceptar · ESC volver',
    onClose: back
  }, account.user ? 1 : 0);
}
button.addEventListener('click', e => {
  e.stopPropagation();                              // a click on the overlay itself starts the run
  if (state.menu) return;
  overlay.style.display = 'none';
  openAccount(() => { overlay.style.display = 'flex'; });
});
