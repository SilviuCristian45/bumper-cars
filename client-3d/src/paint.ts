import * as THREE from 'three';

// Vertex-colored low-poly pieces, merged into one mesh per object (the fair's scenery, the power-up models).

export type Paint = (x: number, y: number, z: number) => number;

/** Non-indexed copy of `geom` with a color per triangle (chosen at the triangle's center). */
export function painted(geom: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry {
  const g = geom.index ? geom.toNonIndexed() : geom;
  if (g !== geom) geom.dispose();
  g.deleteAttribute('uv');
  const pos = g.attributes.position!;
  const colors = new Float32Array(pos.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i += 3) {
    const x = (pos.getX(i) + pos.getX(i + 1) + pos.getX(i + 2)) / 3;
    const y = (pos.getY(i) + pos.getY(i + 1) + pos.getY(i + 2)) / 3;
    const z = (pos.getZ(i) + pos.getZ(i + 1) + pos.getZ(i + 2)) / 3;
    c.setHex(paint(x, y, z));
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return g;
}

export const solid = (color: number): Paint => () => color;

/** Alternating stripes around the y axis (n stripes all around). */
export const stripes = (a: number, b: number, n: number): Paint => (x, _y, z) => {
  const turn = (Math.atan2(z, x) / (2 * Math.PI) + 1) % 1;
  return Math.floor(turn * n) % 2 === 0 ? a : b;
};
