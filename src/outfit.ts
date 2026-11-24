// What the ronin wears, on the body: the armour bought from Masa (armor.ts), built the way real samurai armour
// is — rows of lacquered plates (lames) bound with silk lacing (odoshi), with metal fittings:
//   · dō: the cuirass, shaped like the torso, with its top plate, a crest and the waist cord;
//   · kusazuri: the skirt of laced panels; sode: big shoulder guards hanging from the shoulders;
//   · suneate: splinted shin guards (the heavier sets);
//   · the helmet, which replaces the kasa: a kabuto (riveted bowl, visor, flaring neck guard of lames,
//     turned-back wings and a crest on the front: crescent, golden antlers or Hachiman's sun) or, for the
//     ashigaru, a jingasa. The best sets also carry an aura (the fox's blue fire, Hachiman's golden halo).
// Every set is built once on the skeleton when the game loads and only the one you wear is shown.
import * as THREE from 'three';
import { sam } from './avatar';
import { ACTOR_LAYER } from './ascii';
import { CLS, tagMat, tagTree } from './materials';
import { applyLook, opt } from './look';
import { ARMORS, armor, type Armor } from './armor';
import { state } from './state';
import { mangaFinish, roninRobe } from './manga-art';

const V = THREE.Vector3;
const TAU = Math.PI * 2;
const root = sam.root;
const bones: Record<string, THREE.Object3D> = {};
root.traverse(o => {
  if (o.userData.outfitBone) bones[o.userData.outfitBone] = o;
  else if (/^mixamorig/.test(o.name)) bones[o.name.replace(/^mixamorig:?/, '')] = o;
});
root.updateMatrixWorld(true);
/** a bone's position in the samurai's own space (+z ahead, +y up, its left on +x) */
const P = (n: string) => root.worldToLocal(bones[n].getWorldPosition(new V()));

const sets = new Map<string, THREE.Object3D[]>();
const auras = new Map<string, THREE.Group>();

const baseLayers: THREE.Object3D[] = [];
root.traverse(o => { if (o.userData.equipmentLayer) baseLayers.push(o); });
const rigChest = baseLayers.find(o => o.userData.equipmentLayer === 'chest');
const rigWaist = baseLayers.find(o => o.userData.equipmentLayer === 'waist');
// the straw kasa (rig.ts), already fitted on the scanned head: the jingasa is built in its frame
let kasaMesh: THREE.Mesh | undefined;
root.traverse(o => { const m = o as THREE.Mesh; if (!kasaMesh && m.isMesh && m.userData.part === 'hat' && (m.geometry as THREE.ConeGeometry).type === 'ConeGeometry' && (m.geometry as THREE.ConeGeometry).parameters.radius > 0.2) kasaMesh = m; });
// the simulated robe (rig.ts): its colour follows the armour worn
const robeMesh = root.getObjectByName('robe') as THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> | undefined;
const robeMat = robeMesh?.material, robeMap = robeMat?.map ?? null;
/** put `obj` beside `twin` (same bone, same place, turn and size), so it follows it exactly */
function overlay(id: string, twin: THREE.Object3D, obj: THREE.Object3D) {
  finish(obj);
  obj.position.copy(twin.position); obj.quaternion.copy(twin.quaternion); obj.scale.copy(twin.scale);
  twin.parent!.add(obj);
  sets.get(id)!.push(obj);
}
/** build `obj` in the samurai's space, then hang it on a bone so it follows the animation */
function hang(id: string, boneName: string, obj: THREE.Object3D) {
  finish(obj);
  root.add(obj); obj.updateMatrixWorld(true);
  bones[boneName].attach(obj);
  sets.get(id)!.push(obj);
}
function finish(o: THREE.Object3D) {
  o.traverse(m => { if ((m as THREE.Mesh).isMesh) { m.castShadow = true; m.layers.enable(ACTOR_LAYER); } });
  mangaFinish(o);   // the same finish as the body: rim and form light, and the letters on the surface
  return tagTree(o, CLS.actor);
}

// ------------------------------------------------------------ textures
const css = (c: number, k = 1) => { const x = new THREE.Color(c).multiplyScalar(k); return `rgb(${Math.min(255, x.r * 255) | 0},${Math.min(255, x.g * 255) | 0},${Math.min(255, x.b * 255) | 0})`; };
function canvasTex(w: number, h: number, draw: (x: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
/** four rows of lacquered lames: light on the upper edge, a dark overlap below, the little ridges of the scales,
 *  paired silk cords running down through them and, on the last row, red cross-knots (hishinui) */
function lamellar(l: NonNullable<Armor['look']>) {
  return canvasTex(256, 256, x => {
    const rh = 64;
    for (let r = 0; r < 4; r++) {
      const y0 = r * rh, g = x.createLinearGradient(0, y0, 0, y0 + rh);
      g.addColorStop(0, css(l.lame, 1.6)); g.addColorStop(0.12, css(l.lame, 1.15)); g.addColorStop(0.7, css(l.lame, 0.85)); g.addColorStop(1, css(l.lame, 0.5));
      x.fillStyle = g; x.fillRect(0, y0, 256, rh);
      x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(0, y0 + rh - 4, 256, 4);                       // the next lame overlaps
      x.fillStyle = 'rgba(255,255,255,0.10)'; for (let k = 0; k < 256; k += 8) x.fillRect(k, y0 + 3, 1, rh * 0.3);   // scale ridges
      x.fillStyle = css(l.lace, 0.8); x.fillRect(0, y0, 256, 3);                                   // edge braid
      // sugake odoshi: pairs of cords, braided
      for (let cx = 16; cx < 256; cx += 32) for (const dx of [-6, 2]) {
        x.fillStyle = css(l.lace); x.fillRect(cx + dx, y0, 5, rh - 2);
        x.fillStyle = css(l.lace, 0.55); for (let yy = y0 + 2; yy < y0 + rh - 2; yy += 5) x.fillRect(cx + dx, yy, 5, 1.5);
        x.fillStyle = css(l.lace, 1.4); x.fillRect(cx + dx + 1, y0, 1, rh - 2);
      }
      if (r === 3) {   // hishinui: red cross-knots along the bottom lame
        x.strokeStyle = '#d42a20'; x.lineWidth = 2.5;
        for (let cx = 8; cx < 256; cx += 16) { const cy = y0 + 46; x.beginPath(); x.moveTo(cx - 4, cy - 4); x.lineTo(cx + 4, cy + 4); x.moveTo(cx + 4, cy - 4); x.lineTo(cx - 4, cy + 4); x.stroke(); }
      }
    }
  });
}
/** the riveted bowl of a kabuto: 24 gores, each shaded like a curved plate, a raised seam and rivets */
function hachiTex(l: NonNullable<Armor['look']>) {
  return canvasTex(512, 128, x => {
    const n = 24, gw = 512 / n;
    for (let i = 0; i < n; i++) {
      const g = x.createLinearGradient(i * gw, 0, (i + 1) * gw, 0);
      g.addColorStop(0, css(l.lame, 0.6)); g.addColorStop(0.45, css(l.lame, 1.35)); g.addColorStop(1, css(l.lame, 0.7));
      x.fillStyle = g; x.fillRect(i * gw, 0, gw, 128);
      x.fillStyle = css(l.metal, 0.9); x.fillRect(i * gw - 1, 0, 2, 128);
      x.fillStyle = css(l.metal, 1.3); for (let y = 10; y < 118; y += 12) { x.beginPath(); x.arc(i * gw + gw / 2, y, 1.8, 0, TAU); x.fill(); }
    }
    x.fillStyle = 'rgba(0,0,0,0.35)'; x.fillRect(0, 0, 512, 10);          // the rim sits in shadow
  });
}

// ------------------------------------------------------------ geometry helpers
/** a strip of tube along an arc of a circle in the xz plane (θ = 0 at +z, like the cylinder sections) */
function arcTube(r: number, y: number, th0: number, len: number, tube: number, m: THREE.Material) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) { const t = th0 + len * i / 24; pts.push(new V(Math.sin(t) * r, y, Math.cos(t) * r)); }
  return new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, tube, 5, false), m);
}
const extrude = (s: THREE.Shape, depth: number) => new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: true, bevelThickness: depth * 0.3, bevelSize: depth * 0.25, bevelSegments: 1, curveSegments: 16 }).translate(0, 0, -depth / 2);

// ------------------------------------------------------------ one armour
function build(a: Armor) {
  const l = a.look!, glow = l.glow ?? 0.06;
  sets.set(a.id, []);
  const lamTex = lamellar(l);
  const lam = (rx: number, ry: number) => {
    const t = lamTex.clone(); t.repeat.set(rx, ry); t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, emissiveMap: t, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.38, metalness: 0.2, side: THREE.DoubleSide });
  };
  const lacquer = new THREE.MeshStandardMaterial({ color: l.lame, roughness: 0.25, metalness: 0.25, emissive: l.lame, emissiveIntensity: glow, side: THREE.DoubleSide });
  const metal = new THREE.MeshStandardMaterial({ color: l.metal, roughness: 0.3, metalness: 0.85, emissive: l.metal, emissiveIntensity: Math.max(0.18, glow * 1.4), side: THREE.DoubleSide });
  const lace = new THREE.MeshStandardMaterial({ color: l.lace, roughness: 0.8, emissive: l.lace, emissiveIntensity: 0.15 });

  const hips = P('Hips');

  // Armor replaces the travel outfit at the same attachment points, with a fitted waist and chest.
  if (rigChest) {
    const g = new THREE.Group(), shell = new THREE.Group(); g.add(shell);
    g.name = `cuirass-${a.id}`;
    const prof = [[0.176, -0.25], [0.181, -0.17], [0.208, -0.055], [0.229, 0.065], [0.218, 0.147], [0.172, 0.222], [0.128, 0.251]].map(([r, y]) => new THREE.Vector2(r, y));
    shell.add(new THREE.Mesh(new THREE.LatheGeometry(prof, 40), lam(6, 1.25)));
    // muna-ita (the top plate, with a metal rim) and the waist cord
    shell.add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0.219, 0.147), new THREE.Vector2(0.174, 0.222)], 40), lacquer));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.174, 0.005, 5, 40), metal); rim.rotation.x = Math.PI / 2; rim.position.y = 0.222; shell.add(rim);
    const cord = new THREE.Mesh(new THREE.TorusGeometry(0.178, 0.008, 6, 40), lace); cord.rotation.x = Math.PI / 2; cord.position.y = -0.246; shell.add(cord);
    shell.scale.z = 0.71;
    // a crest on the chest
    const mon = new THREE.Group(); mon.position.set(0, 0.048, 0.169); g.add(mon);
    mon.add(new THREE.Mesh(new THREE.CircleGeometry(0.036, 24), metal));
    const inner = new THREE.Mesh(new THREE.RingGeometry(0.015, 0.025, 24), lacquer); inner.position.z = 0.002; mon.add(inner);
    // watagami: the shoulder straps, with their metal studs
    for (const s of [-1, 1]) {
      const strap = new THREE.Mesh(new THREE.BoxGeometry(0.043, 0.012, 0.243), lacquer); strap.position.set(0.104 * s, 0.243, -0.008); strap.rotation.z = -s * 0.12; g.add(strap);
      const stud = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), metal); stud.position.set(0.104 * s, 0.25, 0.111); g.add(stud);
    }
    overlay(a.id, rigChest, g);
  }
  // ---- kusazuri: curved panels, with room for the stride beneath the hem
  if (rigWaist) {
    const g = new THREE.Group(), R = 0.205, hemR = R * 1.13, h = 0.19 + 0.026 * l.sode, n = 7, L = TAU / n * 0.89;
    g.name = `skirt-${a.id}`;
    const sk = new THREE.Group(); sk.scale.z = 0.76; sk.position.y = 0.034 - h / 2; g.add(sk);
    const obi = new THREE.Mesh(new THREE.TorusGeometry(R, 0.018, 8, 40), lace);
    obi.rotation.x = Math.PI / 2; obi.scale.y = 0.77; obi.position.y = 0.037; g.add(obi);
    for (let i = 0; i < n; i++) {
      const th = i * TAU / n - L / 2;
      sk.add(new THREE.Mesh(new THREE.CylinderGeometry(R, hemR, h, 8, 1, true, th, L), lam(1.6, 1)));
      sk.add(arcTube(hemR, -h / 2, th, L, 0.004, metal));
      sk.add(arcTube(R * 1.01, h / 2 - 0.01, th + 0.05, L - 0.1, 0.006, lace));
    }
    overlay(a.id, rigWaist, g);
  }
  // ---- sode: a curved wall of lames hanging from each shoulder, on the outside of the upper arm
  for (const side of ['Left', 'Right']) {
    const A = P(side + 'Arm'), F = P(side + 'ForeArm'), d = F.clone().sub(A).normalize();
    const out = new V(Math.sign(A.x - hips.x) || 1, 0.25, 0);
    const Z = out.addScaledVector(d, -out.dot(d)).normalize(), Y = d.clone().negate(), X = new V().crossVectors(Y, Z);
    const g = new THREE.Group(); g.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    g.name = `shoulder-${a.id}-${side}`;
    const Rc = 0.127, w = 0.149 + 0.029 * l.sode, th = w / Rc, h = 0.131 + 0.046 * l.sode, off = 0.063;
    const panel = new THREE.Mesh(new THREE.CylinderGeometry(Rc, Rc * 1.04, h, 10, 1, true, -th / 2, th), lam(1.5, 1.4));
    panel.position.set(0, 0.048 - h / 2, off - Rc); g.add(panel);
    // kanmuri-ita: the lacquered top bar with its metal rim, and the bottom edge
    const bar = arcTube(Rc + 0.003, 0.048, -th / 2, th, 0.008, lacquer); bar.position.z = off - Rc; g.add(bar);
    const bar2 = arcTube(Rc + 0.006, 0.054, -th / 2, th, 0.004, metal); bar2.position.z = off - Rc; g.add(bar2);
    const hem = arcTube(Rc * 1.04, 0.048 - h, -th / 2, th, 0.004, metal); hem.position.z = off - Rc; g.add(hem);
    g.position.copy(A);
    hang(a.id, side + 'Arm', g);
  }
  // ---- suneate: splinted shin guards
  if (l.shins) for (const side of ['Left', 'Right']) {
    const K = P(side + 'Leg'), Fo = P(side + 'Foot'), len = K.distanceTo(Fo);
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.072, 0.06, len * 0.62, 12, 1, true, -1.3, 2.6), lacquer));
    for (const t of [-0.75, 0, 0.75]) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.014, len * 0.6, 0.01), metal); s.position.set(Math.sin(t) * 0.074, 0, Math.cos(t) * 0.074); s.rotation.y = t; g.add(s); }
    for (const y of [len * 0.29, -len * 0.29]) { const b = arcTube(0.074, y, -1.3, 2.6, 0.006, lace); g.add(b); }
    g.position.copy(K).lerp(Fo, 0.52);
    hang(a.id, side + 'Leg', g);
  }
  // ---- the helmet
  if (l.helmet) {
    // r is the bowl's radius: a little over the real head's (real-head.ts), its rim resting on the brow
    const H = P('Head'), T = P('HeadTop_End'), hh = T.distanceTo(H), jingasa = l.helmet === 'jingasa', r = hh * (jingasa ? 0.42 : 0.39);
    const g = new THREE.Group();
    if (l.helmet === 'jingasa' && kasaMesh) {
      // the foot soldier's lacquered iron hat, with the clan's crest. Built in the straw kasa's own frame
      // (rig.ts fits that one on the scanned head: crown inside the cone, brim on the brow), so it is worn,
      // not perched: same brim height, a little wider and shallower
      const R = 0.25, Hc = 0.088, base = -0.066;
      const hat = new THREE.Mesh(new THREE.ConeGeometry(R, Hc, 28, 1, true), lacquer); hat.position.y = base + Hc / 2; g.add(hat);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.006, 5, 40), metal); rim.rotation.x = Math.PI / 2; rim.position.y = base; g.add(rim);
      // the crest lies on the slope of the cone, facing up and out
      const slope = Math.atan2(Hc, R), y0 = base + Hc * 0.45, rad = R * (1 - (y0 - base) / Hc);
      const nrm = new V(0, Math.cos(slope), Math.sin(slope));
      const mon = new THREE.Mesh(new THREE.CircleGeometry(0.03, 24), metal);
      mon.position.set(0, y0, rad).addScaledVector(nrm, 0.003); mon.rotation.x = -(Math.PI / 2 - slope); g.add(mon);
      const monIn = new THREE.Mesh(new THREE.RingGeometry(0.012, 0.02, 24), lacquer); monIn.position.copy(mon.position).addScaledVector(nrm, 0.0015); monIn.rotation.x = mon.rotation.x; g.add(monIn);
      overlay(a.id, kasaMesh, g);
      return;
    } else {
      // hachi: a riveted dome of 24 gores, with the ring on top and the metal band round its base
      const ht = hachiTex(l);
      const dome: THREE.Vector2[] = [];
      for (let i = 0; i <= 12; i++) { const t = i / 12 * Math.PI / 2; dome.push(new THREE.Vector2(Math.cos(t) * r * (1 + 0.04 * Math.sin(t * 2)), Math.sin(t) * r * 0.95)); }
      dome[12].x = r * 0.1;
      const bowl = new THREE.Mesh(new THREE.LatheGeometry(dome, 48), new THREE.MeshStandardMaterial({ map: ht, emissiveMap: ht, emissive: 0xffffff, emissiveIntensity: glow, roughness: 0.3, metalness: 0.35, side: THREE.DoubleSide }));
      g.add(bowl);
      const tehen = new THREE.Mesh(new THREE.TorusGeometry(r * 0.11, r * 0.035, 6, 20), metal); tehen.rotation.x = Math.PI / 2; tehen.position.y = r * 0.94; g.add(tehen);
      const band = new THREE.Mesh(new THREE.TorusGeometry(r * 1.0, r * 0.04, 6, 40), metal); band.rotation.x = Math.PI / 2; g.add(band);
      // mabizashi: the visor over the eyes, only at the front
      const visor = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.0, r * 1.38, r * 0.2, 20, 1, true, -1.05, 2.1), lacquer); visor.position.y = -r * 0.1; g.add(visor);
      g.add(arcTube(r * 1.38, -r * 0.2, -1.05, 2.1, r * 0.03, metal));
      // shikoro: four flaring lames round the back and sides, the face left open
      const L = TAU * 0.68;
      for (let i = 0; i < 4; i++) {
        const rt = r * (1.0 + i * 0.13), rb = rt + r * 0.16, lh = r * 0.27, y = -r * 0.02 - i * r * 0.22 - lh / 2;
        const lame = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, lh, 28, 1, true, Math.PI - L / 2, L), lam(7, 0.25));
        lame.position.y = y; g.add(lame);
        if (i === 3) g.add(arcTube(rb, y - lh / 2, Math.PI - L / 2, L, r * 0.025, metal));
      }
      // fukigaeshi: the top lame turned back at both front ends, each with a small crest
      for (const s of [-1, 1]) {
        const th = s * (Math.PI - L / 2), wing = new THREE.Group();
        wing.position.set(Math.sin(th) * r * 1.08, -r * 0.12, Math.cos(th) * r * 1.08); wing.rotation.y = th - s * 0.85; g.add(wing);
        const p = new THREE.Mesh(new THREE.BoxGeometry(r * 0.5, r * 0.42, r * 0.035), lacquer); wing.add(p);
        const e = new THREE.Mesh(new THREE.BoxGeometry(r * 0.54, r * 0.46, r * 0.02), metal); e.position.z = -r * 0.012; wing.add(e);
        const mon = new THREE.Mesh(new THREE.CircleGeometry(r * 0.11, 16), metal); mon.position.z = r * 0.02; wing.add(mon);
      }
      // the crest on the front
      const front = new THREE.Group(); front.position.set(0, r * 0.32, r * 1.0); front.rotation.x = -0.12; g.add(front);
      const base = new THREE.Mesh(new THREE.BoxGeometry(r * 0.34, r * 0.22, r * 0.06), metal); front.add(base);   // haraidate
      if (l.helmet === 'crescent') {
        // a thin crescent moon, horns up, like the one-eyed dragon's
        const Ro = r * 1.35, s = new THREE.Shape(), Ri = Ro * 0.94, dy = Ro * 0.13;
        for (let i = 0; i <= 32; i++) { const t = Math.PI + 0.1 + (Math.PI - 0.2) * i / 32; const p = [Math.cos(t) * Ro, Math.sin(t) * Ro]; if (i) s.lineTo(p[0], p[1]); else s.moveTo(p[0], p[1]); }
        for (let i = 32; i >= 0; i--) { const t = Math.PI + 0.18 + (Math.PI - 0.36) * i / 32; s.lineTo(Math.cos(t) * Ri, Math.sin(t) * Ri + dy); }
        const moon = new THREE.Mesh(extrude(s, r * 0.04), metal); moon.position.set(0, Ro * 0.92, r * 0.02); front.add(moon);
      } else {
        // kuwagata: two golden antler blades rising and opening outwards
        for (const sx of [-1, 1]) {
          const s = new THREE.Shape(), N = 16, Hh = r * (l.helmet === 'sun' ? 2.0 : 2.3), spread = r * 0.95;
          const c = (t: number) => [sx * (r * 0.1 + spread * Math.pow(t, 1.7)), Hh * t];
          const wdt = (t: number) => r * (0.16 * (1 - t) + 0.035);
          for (let i = 0; i <= N; i++) { const t = i / N, [x, y] = c(t); if (i) s.lineTo(x - wdt(t), y); else s.moveTo(x - wdt(t), y); }
          for (let i = N; i >= 0; i--) { const t = i / N, [x, y] = c(t); s.lineTo(x + wdt(t), y); }
          const horn = new THREE.Mesh(extrude(s, r * 0.035), metal); horn.position.y = r * 0.08; front.add(horn);
        }
        if (l.helmet === 'sun') {
          // Hachiman's sun between the antlers: a sixteen-pointed golden star round a scarlet disc
          const star = new THREE.Shape(), k = 32;
          for (let i = 0; i <= k; i++) { const t = i / k * TAU, rr = (i % 2 ? r * 0.36 : r * 0.62); const x = Math.sin(t) * rr, y = Math.cos(t) * rr; if (i) star.lineTo(x, y); else star.moveTo(x, y); }
          const sun = new THREE.Group(); sun.position.set(0, r * 0.95, r * 0.05); front.add(sun);
          sun.add(new THREE.Mesh(extrude(star, r * 0.04), metal));
          const disc = new THREE.Mesh(new THREE.CircleGeometry(r * 0.3, 32), new THREE.MeshStandardMaterial({ color: l.lace, emissive: l.lace, emissiveIntensity: 0.6, roughness: 0.4 })); disc.position.z = r * 0.04; sun.add(disc);
          const ring = new THREE.Mesh(new THREE.TorusGeometry(r * 0.3, r * 0.03, 6, 32), metal); ring.position.z = r * 0.045; sun.add(ring);
        }
      }
      g.position.set(H.x, H.y + hh * 0.51, H.z + 0.01);   // rim on the brow line, the bowl over the crown
    hang(a.id, 'Head', g);
    }
  }
}

function buildMonk(a: Armor) {
  const { linen, mantle, sash } = a.robe!;
  if (!rigChest || !rigWaist) return;
  sets.set(a.id, []);
  const cloth = (color: number) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, emissive: color, emissiveIntensity: 0.12, side: THREE.DoubleSide });
  const ochre = cloth(linen), outer = cloth(mantle), beltMat = cloth(sash), collar = cloth(0xdbbe8f), beads = cloth(0x5c3822);
  const body = new THREE.Group(); body.name = 'monk-robe';
  const torso = new THREE.Mesh(new THREE.LatheGeometry([
    [0.175, -0.268], [0.181, -0.16], [0.21, -0.03], [0.218, 0.09], [0.202, 0.168], [0.146, 0.234], [0.093, 0.262]
  ].map(([r, y]) => new THREE.Vector2(r, y)), 32), ochre);
  torso.scale.z = 0.74;
  body.add(torso);

  function trim(q: THREE.Vector3[], radius: number, mat: THREE.Material) {
    const path = new THREE.CatmullRomCurve3(q);
    body.add(new THREE.Mesh(new THREE.TubeGeometry(path, 20, radius, 6), mat));
    return path;
  }
  // Two cloth lapels meet in a V, with the kesa crossing over one shoulder.
  trim([new V(-0.080, 0.258, 0.026), new V(-0.084, 0.207, 0.103), new V(-0.047, 0.139, 0.144), new V(0.039, 0.062, 0.164)], 0.013, collar);
  trim([new V(0.078, 0.256, 0.029), new V(0.083, 0.193, 0.114), new V(0.039, 0.126, 0.160), new V(-0.068, -0.025, 0.152)], 0.014, collar);
  const sashPath = new THREE.CatmullRomCurve3([
    new V(0.125, 0.24, 0), new V(0.117, 0.195, 0.102), new V(0.063, 0.086, 0.154), new V(-0.057, -0.032, 0.151), new V(-0.147, -0.171, 0.095)
  ]);
  const strip = new THREE.PlaneGeometry(1, 1, 4, 28);
  const vertices = strip.attributes.position;
  for (let i = 0; i < vertices.count; i++) {
    const side = vertices.getX(i), t = vertices.getY(i) + 0.5;
    const p = sashPath.getPoint(t), dir = sashPath.getTangent(t);
    const span = 0.135 - t * 0.015;
    vertices.setXYZ(i, p.x + dir.y * side * span, p.y - dir.x * side * span, p.z - 0.027 * Math.abs(2 * side) + 0.005 * Math.cos(side * 20));
  }
  strip.computeVertexNormals(); body.add(new THREE.Mesh(strip, outer));
  const cord = trim([new V(-0.071, 0.245, 0.047), new V(-0.085, 0.154, 0.146), new V(0, 0.074, 0.17), new V(0.085, 0.154, 0.146), new V(0.071, 0.245, 0.047)], 0.003, beltMat);
  const bead = new THREE.SphereGeometry(0.009, 8, 6);
  for (let i = 0; i < 19; i++) {
    const b = new THREE.Mesh(bead, beads); b.position.copy(cord.getPointAt(i / 18)); body.add(b);
  }
  overlay(a.id, rigChest, body);

  const waist = new THREE.Group(); waist.name = 'monk-sash';
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.196, 0.194, 0.073, 32, 1, true), beltMat);
  belt.scale.z = 0.78; belt.position.y = 0.005; waist.add(belt);
  const knot = new THREE.Mesh(new THREE.TorusKnotGeometry(0.025, 0.009, 24, 6), beltMat);
  knot.position.set(-0.102, 0.005, 0.141); waist.add(knot);
  // (the habit's long skirt is the ronin's simulated robe, dyed linen by dressUp)
  overlay(a.id, rigWaist, waist);

  for (const side of ['Left', 'Right']) {
    const shoulder = P(side + 'Arm'), elbow = P(side + 'ForeArm');
    const sleeve = new THREE.Group(); sleeve.name = `monk-sleeve-${side}`;
    const h = shoulder.distanceTo(elbow) * 0.94;
    sleeve.add(new THREE.Mesh(new THREE.CylinderGeometry(0.079, 0.105, h, 18, 1, true), side === 'Left' ? outer : ochre));
    const cuff = new THREE.Mesh(new THREE.TorusGeometry(0.101, 0.007, 5, 20), beltMat);
    cuff.rotation.x = Math.PI / 2; cuff.position.y = -h / 2; sleeve.add(cuff);
    sleeve.position.copy(shoulder).lerp(elbow, 0.40);
    sleeve.quaternion.setFromUnitVectors(new V(0, 1, 0), shoulder.clone().sub(elbow).normalize());
    hang(a.id, side + 'Arm', sleeve);

    // (the rigid hem tubes round each thigh are gone: the simulated linen robe hangs there now)
  }
}

// ---- auras: they ride with the samurai, not with a bone
const fxMat = (c: number, o: number) => tagMat(new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, depthWrite: false, blending: THREE.AdditiveBlending }), CLS.light);
function buildAura(kind: 'foxfire' | 'gold') {
  const g = new THREE.Group(); g.name = kind;
  if (kind === 'foxfire') {
    // three wisps of blue fox-fire circling you
    for (let i = 0; i < 3; i++) {
      const w = new THREE.Group();
      w.add(new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), fxMat(0xd0f4ff, 0.9)));
      const outer = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), fxMat(0x30a8ff, 0.35)); outer.scale.y = 1.5; w.add(outer);
      g.add(w);
    }
  } else {
    // Hachiman's blessing: a golden halo behind the head, a ring of light at the feet
    const halo = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.025, 6, 40), fxMat(0xffd040, 0.85)); halo.name = 'halo'; g.add(halo);
    const disc = new THREE.Mesh(new THREE.RingGeometry(0.1, 0.4, 40), fxMat(0xffb020, 0.25)); disc.name = 'disc'; g.add(disc);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 48), fxMat(0xffc830, 0.5)); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.05; ring.name = 'ring'; g.add(ring);
  }
  g.visible = false; root.add(g);
  return g;
}

for (const a of ARMORS) {
  if (a.robe) buildMonk(a);
  else if (a.look) build(a);
}
for (const a of ARMORS) if (a.look?.aura) auras.set(a.id, buildAura(a.look.aura));

/** show the armour you wear (and its helmet instead of the kasa), with your chosen colours */
let activeAura: THREE.Group | undefined;
export function dressUp(cur = armor()) {
  applyLook(root);
  for (const [id, list] of sets) for (const o of list) o.visible = id === cur.id;
  for (const [id, g] of auras) g.visible = id === cur.id;
  activeAura = auras.get(cur.id);
  const helmet = !!cur.look?.helmet;
  const dressed = sets.has(cur.id), monk = dressed && !!cur.robe;
  sam.fitOutfit?.(dressed);
  roninRobe.uRoninOutfit.value = monk ? 2 : dressed ? 1 : 0;
  if (dressed) roninRobe.uRoninLinen.value.set(cur.robe?.linen ?? cur.look!.lame);
  for (const o of baseLayers) {
    const layer = o.userData.equipmentLayer;
    // the long cloth robe stays under every set (a long hakama under the armour, the monk's habit);
    // the hanging kimono sleeves only show without plates on the arms
    o.visible = layer === 'robe' ? true : layer === 'sleeves' ? !dressed || monk
      : layer === 'scarf' || layer === 'wrapping' ? !monk : !dressed;
  }
  if (dressed && robeMat) {
    if (monk) robeMat.color.set(cur.robe!.linen);
    else robeMat.color.set(cur.look!.lame).multiplyScalar(0.42).lerp(new THREE.Color(cur.look!.lace), 0.22);
    robeMat.map = null; robeMat.needsUpdate = true;
  } else if (robeMat && robeMap) { robeMat.map = robeMap; robeMat.needsUpdate = true; }
  root.traverse(o => {
    if (o.userData.part === 'hat') o.visible = !helmet && !monk && !opt('hat').hidden;
    if (monk && o.userData.part === 'mask') o.visible = false;
    if (o.userData.part === 'topknot') o.visible = !helmet;   // the helmet covers the knot
  });
}
dressUp();

/** every frame: the auras move */
export function updateOutfit() {
  const g = activeAura;
  if (!g) return;
  const t = state.time;
  if (g.name === 'foxfire') g.children.forEach((w, i) => {
    const a = t * 1.6 + i * (TAU / 3);
    w.position.set(Math.sin(a) * 0.85, 1.05 + Math.sin(t * 2.3 + i) * 0.25, Math.cos(a) * 0.85);
    w.scale.setScalar(0.85 + Math.sin(t * 9 + i * 2) * 0.15);
  });
  else {
    const halo = g.getObjectByName('halo')!, disc = g.getObjectByName('disc')!, ring = g.getObjectByName('ring')! as THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>;
    for (const o of [halo, disc]) o.position.set(0, 1.78, -0.26);
    halo.rotation.z = t * 0.6;
    ring.rotation.z = t * 0.8; ring.scale.setScalar(1 + Math.sin(t * 2) * 0.06);
    ring.material.opacity = 0.35 + Math.sin(t * 2) * 0.15;
  }
}
