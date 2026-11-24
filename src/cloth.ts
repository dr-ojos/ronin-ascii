// Hanging cloth: a sheet of verlet particles in world space, pinned along its top edge (a waist, a
// forearm) and left to fall: gravity, air drag, a soft memory of its drape, cloth-length and
// cross constraints, and capsules (the legs, the torso) that push it aside. The ronin's long robe
// swings with the stride, trails in turns and is kicked forward by each leg; the kimono sleeves
// hang under the forearms and swing when the arms move.
//
// The sheet carries its rest shape as `glyphRest` / `glyphRestN`, so the surface letters
// (surface-glyphs.ts) stay printed on the cloth while it moves instead of swimming over it.
import * as THREE from 'three';

export interface Capsule { a: THREE.Vector3; b: THREE.Vector3; r: number }
export interface ClothOpts {
  cols: number;                 // columns of particles across
  rows: number;                 // segments down (rows + 1 particles per column)
  closed: boolean;              // a tube (the robe) or an open sheet (a sleeve)
  /** rest drape, in the parent's space: top row = the pins */
  rest: (i: number, j: number, out: THREE.Vector3) => THREE.Vector3;
  material: THREE.Material;
  gravity?: number;
  drape?: number;               // how strongly it returns to its drape (standing still)
  drapeMoving?: number;         // ... while moving
  drag?: number;
}

const _d = new THREE.Vector3(), _v = new THREE.Vector3(), _a = new THREE.Vector3(), _r = new THREE.Vector3();
const _ab = new THREE.Vector3(), _c = new THREE.Vector3(), _inv = new THREE.Matrix4();

export class HangingCloth {
  readonly mesh: THREE.Mesh;
  private readonly o: Required<ClothOpts>;
  private readonly n: number;        // particles across (closed: == cols, open: == cols)
  private readonly p: THREE.Vector3[] = [];
  private readonly q: THREE.Vector3[] = [];
  private readonly restL: THREE.Vector3[] = [];   // rest drape, parent space
  private readonly lenV: number[] = [];           // vertical segment rest length per row (parent units)
  private readonly lenH: number[] = [];           // horizontal neighbour rest length per row
  private init = false;

  constructor(opts: ClothOpts) {
    this.o = { gravity: 8, drape: 9, drapeMoving: 3.5, drag: 2.4, ...opts };
    const { cols, rows, closed } = this.o;
    this.n = cols;
    const W = cols + (closed ? 1 : 0);              // a closed tube repeats its first column for the UV seam
    const pos = new Float32Array(W * (rows + 1) * 3), rest = new Float32Array(pos.length), restN = new Float32Array(pos.length);
    const uv = new Float32Array(W * (rows + 1) * 2), idx: number[] = [];
    for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) {
      const v = this.o.rest(i, j, new THREE.Vector3());
      this.restL.push(v); this.p.push(new THREE.Vector3()); this.q.push(new THREE.Vector3());
    }
    for (let j = 0; j < rows; j++) this.lenV.push(this.at(this.restL, 0, j).distanceTo(this.at(this.restL, 0, j + 1)));
    for (let j = 0; j <= rows; j++) this.lenH.push(this.at(this.restL, 0, j).distanceTo(this.at(this.restL, 1, j)));
    // rest attributes for the surface letters: the drape itself, normals pointing away from the sheet's axis
    const centre = new THREE.Vector3();
    for (const v of this.restL) centre.add(v);
    centre.divideScalar(this.restL.length);
    for (let j = 0; j <= rows; j++) for (let k = 0; k < W; k++) {
      const i = k % cols, v = this.at(this.restL, i, j), o = (j * W + k) * 3;
      rest.set([v.x, v.y, v.z], o);
      const nrm = closed ? _v.set(v.x - centre.x, 0, v.z - centre.z).normalize()
        : _v.subVectors(this.at(this.restL, Math.min(i + 1, cols - 1), j), this.at(this.restL, Math.max(i - 1, 0), j))
          .cross(_a.set(0, 1, 0)).normalize();
      restN.set([nrm.x, nrm.y, nrm.z], o);
      uv.set([k / (W - 1), 1 - j / rows], (j * W + k) * 2);
    }
    for (let j = 0; j < rows; j++) for (let k = 0; k < W - 1; k++) {
      const a = j * W + k, b = a + 1, c = a + W, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(pos.length), 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('glyphRest', new THREE.BufferAttribute(rest, 3));
    geo.setAttribute('glyphRestN', new THREE.BufferAttribute(restN, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.mesh = new THREE.Mesh(geo, opts.material);
    this.mesh.frustumCulled = false;
    this.mesh.userData.glyphRest = true;
  }

  private at(list: THREE.Vector3[], i: number, j: number) { return list[j * this.n + ((i + this.n) % this.n)]; }

  /** dt: seconds; t: clock; moving: 0..1 how fast the wearer goes; colliders in world space; ground: world y */
  update(dt: number, moving: number, colliders: Capsule[], ground: number) {
    const { cols, rows, closed } = this.o, parent = this.mesh.parent!;
    parent.updateWorldMatrix(true, false);
    const mw = parent.matrixWorld, k = _v.setFromMatrixColumn(mw, 0).length();
    // after a teleport (respawn, shop preview) start again from the drape
    if (this.init && this.p[0].distanceToSquared(_r.copy(this.restL[0]).applyMatrix4(mw)) > 9) this.init = false;
    if (!this.init) {
      this.init = true;
      this.restL.forEach((v, i) => { this.p[i].copy(v).applyMatrix4(mw); this.q[i].copy(this.p[i]); });
    }
    const h = Math.min(dt, 1 / 30), steps = Math.max(1, Math.ceil(h * 120)), sub = h / steps;
    if (h > 1e-5) {
      const pull = THREE.MathUtils.lerp(this.o.drape, this.o.drapeMoving, moving);
      for (let s = 0; s < steps; s++) {
        for (let j = 0; j <= rows; j++) for (let i = 0; i < cols; i++) {
          const id = j * this.n + i, p = this.p[id], q = this.q[id];
          if (j === 0) { p.copy(this.restL[id]).applyMatrix4(mw); q.copy(p); continue; }
          _d.subVectors(p, q); q.copy(p);
          _a.set(0, -this.o.gravity * k, 0).addScaledVector(_d, -this.o.drag / sub);
          _a.addScaledVector(_r.copy(this.restL[id]).applyMatrix4(mw).sub(p), pull * (0.5 + 0.5 * j / rows));
          p.addScaledVector(_d, 0.995).addScaledVector(_a, sub * sub);
        }
        for (let pass = 0; pass < 4; pass++) {
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) this.link(i, j, i, j + 1, this.lenV[j] * k);
          for (let j = 1; j <= rows; j++) for (let i = 0; i < (closed ? cols : cols - 1); i++) this.link(i, j, i + 1, j, this.lenH[j] * k);
          for (let j = 1; j <= rows; j++) for (let i = 0; i < cols; i++) this.push(this.at(this.p, i, j), this.at(this.q, i, j), colliders, ground);
        }
      }
    }
    // write the sheet back in the parent's space
    _inv.copy(mw).invert();
    const W = cols + (closed ? 1 : 0), pos = this.mesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let j = 0; j <= rows; j++) for (let c = 0; c < W; c++) {
      _c.copy(this.at(this.p, c % cols, j)).applyMatrix4(_inv);
      pos.setXYZ(j * W + c, _c.x, _c.y, _c.z);
    }
    pos.needsUpdate = true;
    this.mesh.geometry.computeVertexNormals();
  }

  /** keep two particles at their rest distance (the pinned top row does not move) */
  private link(i0: number, j0: number, i1: number, j1: number, len: number) {
    const a = this.at(this.p, i0, j0), b = this.at(this.p, i1, j1), wa = j0 === 0 ? 0 : 1, wb = j1 === 0 ? 0 : 1;
    if (wa + wb === 0) return;
    _d.subVectors(b, a); const d = _d.length() || 1e-6, c = (d - len) / (d * (wa + wb));
    a.addScaledVector(_d, c * wa); b.addScaledVector(_d, -c * wb);
  }

  /** out of the capsules (legs, torso) and above the ground, with a little friction */
  private push(p: THREE.Vector3, q: THREE.Vector3, colliders: Capsule[], ground: number) {
    for (const { a, b, r } of colliders) {
      _ab.subVectors(b, a);
      const t = THREE.MathUtils.clamp(_c.subVectors(p, a).dot(_ab) / Math.max(_ab.lengthSq(), 1e-6), 0, 1);
      _c.copy(a).addScaledVector(_ab, t);
      _d.subVectors(p, _c); const d = _d.length();
      if (d < r) {
        p.copy(_c).addScaledVector(d > 1e-5 ? _d.divideScalar(d) : _d.set(0, 0, 1), r);
        q.lerp(p, 0.25);
      }
    }
    if (p.y < ground) { p.y = ground; q.lerp(p, 0.5); }
  }
}
