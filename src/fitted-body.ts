import * as THREE from 'three';

/** The mocap mesh includes separately modeled straps, pads and pouches. Strip those pieces for
 *  fitted outfits and draw the base vest close to the ribs under the new clothes. */
export function fittedBody(source: THREE.BufferGeometry) {
  const index = source.getIndex();
  if (!index) return source;
  const original = source.getAttribute('position');
  const parent = Array.from({ length: original.count }, (_, i) => i);
  function find(i: number) {
    while (i !== parent[i]) { parent[i] = parent[parent[i]]; i = parent[i]; }
    return i;
  }
  const join = (a: number, b: number) => { parent[find(a)] = find(b); };
  const at = new Map<string, number>();
  for (let i = 0; i < original.count; i++) {
    const key = `${Math.round(original.getX(i) * 1000)},${Math.round(original.getY(i) * 1000)},${Math.round(original.getZ(i) * 1000)}`;
    const previous = at.get(key);
    if (previous === undefined) at.set(key, i);
    else join(i, previous);
  }
  for (let i = 0; i < index.count; i += 3) {
    const first = index.getX(i);
    join(first, index.getX(i + 1));
    join(first, index.getX(i + 2));
  }
  const parts = new Map<number, { bottom: number; top: number; side: number; count: number }>();
  for (let i = 0; i < original.count; i++) {
    const root = find(i), z = original.getZ(i), x = Math.abs(original.getX(i));
    const part = parts.get(root);
    if (part) {
      part.bottom = Math.min(part.bottom, z); part.top = Math.max(part.top, z);
      part.side = Math.max(part.side, x); part.count++;
    } else parts.set(root, { bottom: z, top: z, side: x, count: 1 });
  }
  const remove = new Set<number>(), vest = new Set<number>();
  for (const [id, part] of parts) {
    if (part.bottom < 95 || part.top > 170 || part.side > 43) continue;
    if (part.count > 350 && part.bottom < 124 && part.top > 150) vest.add(id);
    else remove.add(id);
  }
  const selected: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i);
    if (!remove.has(find(a))) selected.push(a, index.getX(i + 1), index.getX(i + 2));
  }
  const fitted = source.clone();
  const position = fitted.getAttribute('position');
  for (let i = 0; i < position.count; i++) if (vest.has(find(i))) {
    const y = position.getY(i), z = position.getZ(i);
    const depth = THREE.MathUtils.lerp(0.60, 0.9, THREE.MathUtils.smoothstep(z, 143, 155));
    position.setXY(i, position.getX(i) * 0.9, (y + 1) * depth - 1);
  }
  fitted.setIndex(selected);
  fitted.computeVertexNormals();
  fitted.computeBoundingSphere();
  return fitted;
}
