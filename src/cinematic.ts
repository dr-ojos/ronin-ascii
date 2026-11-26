// The cinematic framing of the special techniques (P / J). Casting one is a little scene:
//   recogimiento  time slows to a crawl, black bars close in, manga focus lines rush towards the warrior,
//                 the camera pushes in with a slight Dutch angle and the technique's kanji is brushed on screen;
//   liberación    time snaps back, a flash of the technique's colour, and the strike plays out;
//   impactos      the big hits call impactFlash / slowMo / screenSlash for a flash, a beat of bullet time or a
//                 cut drawn across the whole screen.
// main.ts scales the game's dt with cineTimeScale(); camera.ts reads cineCam().
const css = `
#cine{position:fixed;inset:0;pointer-events:none;overflow:hidden;--c:#fff}
#cine .cb{position:absolute;left:0;right:0;height:10.5vh;background:#000;transform:scaleY(0);transition:transform .22s cubic-bezier(.2,.9,.3,1)}
#cine .cb.t{top:0;transform-origin:top}#cine .cb.b{bottom:0;transform-origin:bottom}
#cine.on .cb{transform:scaleY(1)}
#cine .cv{position:absolute;inset:0;opacity:0;transition:opacity .3s;
  background:radial-gradient(ellipse at 50% 55%,transparent 38%,color-mix(in srgb,var(--c) 22%,#000) 78%,#000 120%);mix-blend-mode:multiply}
#cine.on .cv{opacity:.85}
#cine .cl{position:absolute;inset:-25%;opacity:0;transition:opacity .12s;
  background:repeating-conic-gradient(from 0deg at 50% 52%,transparent 0deg 1.7deg,color-mix(in srgb,var(--c) 55%,#fff) 1.7deg 2.05deg,transparent 2.05deg 4.1deg,rgba(255,255,255,.55) 4.1deg 4.3deg,transparent 4.3deg 7deg);
  -webkit-mask-image:radial-gradient(circle at 50% 52%,transparent 17%,#000 52%);mask-image:radial-gradient(circle at 50% 52%,transparent 17%,#000 52%)}
#cine.gather .cl{opacity:.5;animation:cine-lines .09s steps(2) infinite}
@keyframes cine-lines{50%{transform:rotate(1.3deg) scale(1.02)}}
#cine .ct{position:absolute;left:0;right:0;top:15%;display:flex;flex-direction:column;align-items:center;opacity:0}
#cine .ct.go{animation:cine-out .45s 1.15s both}
#cine .ck{font-family:"Hiragino Mincho ProN","Yu Mincho","Noto Serif JP",serif;font-weight:900;font-size:clamp(90px,15vw,190px);line-height:1;color:#fff;
  letter-spacing:.04em;-webkit-text-stroke:2px var(--c);
  text-shadow:0 0 18px var(--c),0 0 46px var(--c),0 0 2px #000,6px 6px 0 rgba(0,0,0,.55)}
#cine .ct.go .ck{animation:cine-brush .42s cubic-bezier(.2,.9,.25,1) both}
#cine .cs{height:3px;width:min(720px,80vw);margin:6px 0 10px;background:linear-gradient(90deg,transparent,var(--c) 18%,#fff 50%,var(--c) 82%,transparent);
  box-shadow:0 0 14px var(--c);transform:scaleX(0)}
#cine .ct.go .cs{animation:cine-rule .32s .18s cubic-bezier(.2,.9,.3,1) both}
#cine .cn{font-size:clamp(13px,2vw,20px);font-weight:bold;letter-spacing:.6em;padding-left:.6em;color:#fff;text-shadow:0 0 10px var(--c),0 0 3px #000}
#cine .ct.go .cn{animation:cine-track .5s .22s cubic-bezier(.2,.9,.3,1) both}
#cine .cf{position:absolute;inset:0;opacity:0;mix-blend-mode:screen}
#cine .slash{position:absolute;left:50%;top:50%;width:150vmax;height:4px;margin:-2px 0 0 -75vmax;background:linear-gradient(90deg,transparent,#fff 30%,#fff 70%,transparent);
  box-shadow:0 0 18px var(--c),0 0 4px #fff;animation:cine-slash .55s cubic-bezier(.2,.9,.3,1) both}
@keyframes cine-brush{0%{opacity:0;transform:scale(1.9) translateY(-10px);filter:blur(10px);clip-path:inset(0 0 100% 0)}
  35%{opacity:1;filter:blur(0)}100%{transform:none;clip-path:inset(0 0 0 0)}}
@keyframes cine-rule{to{transform:scaleX(1)}}
@keyframes cine-track{from{opacity:0;letter-spacing:1.6em}}
@keyframes cine-out{0%{opacity:1}100%{opacity:0;transform:translateY(-12px)}}
#cine .ct.go{opacity:1}
@keyframes cine-slash{0%{transform:rotate(var(--a)) scaleX(0)}35%{transform:rotate(var(--a)) scaleX(1);height:4px;opacity:1}
  100%{transform:rotate(var(--a)) scaleX(1);height:26px;margin-top:-13px;opacity:0}}
`;
const style = document.createElement('style');
style.textContent = css;
document.head.append(style);

const root = document.createElement('div');
root.id = 'cine';
root.innerHTML = '<div class="cv"></div><div class="cl"></div><div class="cb t"></div><div class="cb b"></div>' +
  '<div class="ct"><div class="ck"></div><div class="cs"></div><div class="cn"></div></div><div class="cf"></div>';
// right above the game's canvas, below the HUD and the menus
(document.querySelector('canvas') ?? document.body.firstChild)?.after(root);
const el = (s: string) => root.querySelector(s) as HTMLElement;
const title = el('.ct'), kanjiEl = el('.ck'), nameEl = el('.cn'), flashEl = el('.cf');

const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
let scale = 1, slowT = 0;       // the game's time scale, and real seconds it stays down
let frameT = 0, k = 0;          // real seconds the framing stays on, and how far in it is (0..1)
let flashV = 0;
const cam = { dist: 1, pitch: 0, roll: 0 };

/** a technique begins: slow time, frame the shot, brush its kanji */
export function beginCast(name: string, kanji: string, color: number, hold = 1.6) {
  root.style.setProperty('--c', hex(color));
  kanjiEl.textContent = kanji; nameEl.textContent = name.toUpperCase();
  title.classList.remove('go'); void title.offsetWidth; title.classList.add('go');
  root.classList.add('on', 'gather');
  frameT = hold;
  slowMo(0.28, 3);   // until release() (special.ts) lets it go
}
/** the gathering is over: time snaps back with a flash */
export function release(color: number, flash = 0.45) {
  root.classList.remove('gather');
  slowT = 0;
  impactFlash(color, flash);
}
/** time runs at `s` for `seconds` (real), then eases back */
export function slowMo(s: number, seconds: number) { scale = Math.min(scale, s); slowT = Math.max(slowT, seconds); }
/** the whole screen flashes in a colour */
export function impactFlash(color: number, v = 0.5) {
  flashEl.style.background = `radial-gradient(circle at 50% 52%,#fff,${hex(color)} 45%,transparent 95%)`;
  flashV = Math.max(flashV, v);
}
/** a cut drawn across the whole screen (degrees) */
export function screenSlash(angle: number, color: number) {
  const s = document.createElement('div');
  s.className = 'slash';
  s.style.setProperty('--a', `${angle}deg`); s.style.setProperty('--c', hex(color));
  root.append(s);
  s.addEventListener('animationend', () => s.remove(), { once: true });
}

/** every frame, with the real (unscaled) dt */
export function updateCinematic(dt: number) {
  if (slowT > 0) slowT -= dt;
  else scale += (1 - scale) * Math.min(1, dt * 9);
  if (frameT > 0 && (frameT -= dt) <= 0) root.classList.remove('on', 'gather');
  const want = root.classList.contains('on') ? 1 : 0;
  k += (want - k) * Math.min(1, dt * (want ? 7 : 3));
  const gather = root.classList.contains('gather') ? 1 : 0;
  cam.dist = 1 - 0.3 * k - 0.08 * gather; cam.pitch = -0.13 * k; cam.roll = 0.045 * k;
  flashV = Math.max(0, flashV - dt * 3.5);
  flashEl.style.opacity = flashV.toFixed(3);
}
export const cineTimeScale = () => scale;
/** camera.ts: how much closer, lower and tilted the shot is */
export const cineCam = () => cam;

export function clearCinematic() {
  root.classList.remove('on', 'gather'); title.classList.remove('go');
  scale = 1; slowT = frameT = k = flashV = 0;
  flashEl.style.opacity = '0';
  for (const s of root.querySelectorAll('.slash')) s.remove();
}
