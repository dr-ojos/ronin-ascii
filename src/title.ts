// The title screen of Ronin Warriors, in two steps on a panel at the left (index.html #overlay):
//   1. sign in (Google, or email and password; account.ts), or play without an account;
//   2. choose the warrior (class-select.ts draws the cards), dress him, read the keys, and start.
// The chosen warrior stands in the open on the right: camera.ts frames him there while state.showcase is on,
// and his name, class and level are written beside him. The death screen is step 2 again.
import {
  accountEnabled, accountError, accountView, ago, onAccount, resetPassword, signInEmail, signInGoogle, signOutAccount, signUpEmail
} from './account';
import { overlay } from './hud';
import { state } from './state';
import { cls } from './classes';
import { look } from './look';
import { level } from './progression';
import { toggleInfo } from './info';

// not under 'ronin-ascii.': account.ts would carry it to the cloud
const GUEST = 'ronin-warriors.guest', SIGNED = 'ronin-warriors.signed-in';
const remember = (k: string, on: boolean) => { try { if (on) localStorage.setItem(k, '1'); else localStorage.removeItem(k); } catch { /* no storage */ } };
const recalls = (k: string) => { try { return localStorage.getItem(k) === '1'; } catch { return false; } };

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const form = $<HTMLFormElement>('login-form'), email = $<HTMLInputElement>('login-email'), pass = $<HTMLInputElement>('login-pass');
const status = $('login-status'), who = $('who'), hero = $('hero');
const busyButtons = ['google-btn', 'login-btn', 'signup-btn', 'forgot-btn'].map(id => $<HTMLButtonElement>(id));

type Step = 'login' | 'pick';
function setStep(step: Step, focus = false) {
  if (overlay.dataset.step === step) return;
  overlay.dataset.step = step;
  if (focus) (step === 'login' ? $('google-btn') : $('go')).focus({ preventScroll: true });
}
// without accounts, or for someone who chose to play without one or was signed in last time, straight to the warriors
setStep(!accountEnabled() || recalls(GUEST) || recalls(SIGNED) ? 'pick' : 'login');

// ------------------------------------------------------------ step 1: sign in
function say(text: string, error = false) { status.textContent = text; status.classList.toggle('err', error); }
async function attempt(fn: () => Promise<unknown>, done = '') {
  busyButtons.forEach(b => b.disabled = true);
  say('…');
  try { await fn(); say(done); pass.value = ''; }
  catch (e) { say(accountError(e), true); }
  finally { busyButtons.forEach(b => b.disabled = false); }
}
function credentials() {
  if (!email.value.trim()) { say('Escribe tu email.', true); email.focus(); return false; }
  if (pass.value.length < 6) { say('La contraseña necesita al menos 6 caracteres.', true); pass.focus(); return false; }
  return true;
}
$('google-btn').addEventListener('click', () => void attempt(signInGoogle));
form.addEventListener('submit', e => { e.preventDefault(); if (credentials()) void attempt(() => signInEmail(email.value, pass.value)); });
$('signup-btn').addEventListener('click', () => { if (credentials()) void attempt(() => signUpEmail(email.value, pass.value), 'Cuenta creada.'); });
$('forgot-btn').addEventListener('click', () => {
  if (!email.value.trim()) { say('Escribe tu email y te enviamos un enlace.', true); email.focus(); return; }
  void attempt(() => resetPassword(email.value), 'Te hemos enviado un email para cambiarla.');
});
$('guest-btn').addEventListener('click', () => { remember(GUEST, true); setStep('pick', true); });

// ------------------------------------------------------------ step 2: who is playing
const esc = (t: string) => t.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
function renderWho() {
  if (!accountEnabled()) { who.innerHTML = '<span class="dot"></span> tu progreso se guarda en este navegador'; return; }
  const v = accountView();
  if (v.user) {
    const saved = v.failed ? `<span style="color:#ff7a6a">${esc(v.failed)}</span>` : v.synced ? (v.savedAt ? `guardado ${ago(v.savedAt)}` : 'sincronizado') : 'sincronizando…';
    who.innerHTML = `<span class="dot on"></span> <b>${esc(v.user.email || v.user.name || 'conectado')}</b> · ${saved} ` +
      '<button type="button" class="tlink" data-act="out">cerrar sesión</button>';
  } else {
    who.innerHTML = '<span class="dot"></span> jugando sin cuenta · el progreso solo queda en este navegador ' +
      '<button type="button" class="tlink" data-act="in">iniciar sesión</button>';
  }
}
who.addEventListener('click', e => {
  const act = (e.target as HTMLElement).closest<HTMLElement>('[data-act]')?.dataset.act;
  if (act === 'in') { remember(GUEST, false); say(''); setStep('login', true); }
  if (act === 'out') { remember(SIGNED, false); void signOutAccount().catch(() => {}); }
});

onAccount(() => {
  const v = accountView();
  if (v.user) {
    remember(SIGNED, true); remember(GUEST, false);
    if (overlay.dataset.step === 'login') { say(''); setStep('pick', true); }
  } else if (v.ready) {
    remember(SIGNED, false);
    if (!recalls(GUEST) && accountEnabled()) setStep('login');
  }
  renderWho();
});
setInterval(() => { if (overlay.style.display !== 'none') renderWho(); }, 30000);   // "guardado hace 2 min"

// ------------------------------------------------------------ the warrior on the right
function renderHero() {
  const c = cls();
  hero.innerHTML = `<div class="hk" aria-hidden="true">${c.kanji}</div><div class="hn">${esc(look.name.trim() || c.name)}</div>` +
    `<div class="hc">${c.name.toUpperCase()} · NIVEL ${level()}</div>`;
}
addEventListener('ronin:class', renderHero);
addEventListener('ronin:overlay', renderHero);

// the camera frames the warrior while the title (or death) screen is up; custom.ts and the (i) screen hide it for a while
const visible = () => overlay.style.display !== 'none';
function onShow() {
  state.showcase = visible();
  document.body.toggleAttribute('data-title', visible());   // index.html hides the HUD and the minimap meanwhile
  if (visible()) renderHero();
}
new MutationObserver(onShow).observe(overlay, { attributes: true, attributeFilter: ['style'] });
onShow();
renderHero();

$('controls-btn').addEventListener('click', () => {
  if (state.menu) return;
  overlay.style.display = 'none';
  toggleInfo(() => { overlay.style.display = 'flex'; $('controls-btn').focus({ preventScroll: true }); });
});

// ENTER starts the run from step 2 when nothing else has the keyboard
addEventListener('keydown', e => {
  if (e.code !== 'Enter' || e.repeat || state.menu || !visible() || overlay.dataset.step !== 'pick') return;
  const t = e.target as HTMLElement | null;
  if (t && t !== document.body && t.closest('button, input, a')) return;
  e.preventDefault();
  $('go').click();
});
