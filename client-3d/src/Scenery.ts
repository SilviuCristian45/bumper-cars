import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Quality } from './settings3d';
import { glowDot } from './textures';

// The night fair around the ring, all low-poly and drawn from code: a starry sky, the big wheel turning
// (gondolas kept level), striped tents, a cotton-candy stall, garlands of chasing bulbs. A handful of draw
// calls: everything static is one merged vertex-colored mesh; the wheel, its gondolas (instanced) and the
// bulbs (points) are one each. "low" has fewer pieces, segments, stars and bulbs.

/** The fairground floor, well under the ring's platform. */
const GROUND_Y = -160;
const WHEEL_POS = new THREE.Vector3(-760, GROUND_Y + 330, -980);
const WHEEL_R = 270;
const WHEEL_SPEED = 0.07; // radians per second
const GARLAND_R = 560;
const BULB_COLORS = [0xffd166, 0xff4d6d, 0x4cc9f0, 0x95f9a5, 0xffa8f0, 0xffffff];
const TENT_STRIPES: [number, number][] = [
  [0xc8243f, 0xfff4d6],
  [0x3a6fd8, 0xfff4d6],
  [0xffb703, 0x8f2d56],
  [0x2a9d8f, 0xfff4d6],
  [0x7b2cbf, 0xffd166],
];

type Paint = (x: number, y: number, z: number) => number;

/** Non-indexed copy of `geom` with a color per triangle (chosen at the triangle's center). */
function painted(geom: THREE.BufferGeometry, paint: Paint): THREE.BufferGeometry {
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

const solid = (color: number): Paint => () => color;

/** Alternating stripes around the y axis (n stripes all around). */
const stripes = (a: number, b: number, n: number): Paint => (x, _y, z) => {
  const turn = (Math.atan2(z, x) / (2 * Math.PI) + 1) % 1;
  return Math.floor(turn * n) % 2 === 0 ? a : b;
};

export class Scenery {
  readonly group = new THREE.Group();
  private readonly wheel = new THREE.Group();
  private readonly gondolas: THREE.InstancedMesh;
  private readonly gondolaCount: number;
  private readonly garland: THREE.Points;
  private readonly garlandColors: Float32Array;
  private readonly garlandBase: THREE.Color[] = [];
  private readonly m = new THREE.Matrix4();
  private readonly p = new THREE.Vector3();
  private clock = 0;
  private lastStep = -1;

  constructor(quality: Quality) {
    const high = quality === 'high';
    const dot = glowDot();
    const lambert = () => new THREE.MeshLambertMaterial({ vertexColors: true });

    this.group.add(stars(high ? 900 : 320, dot));

    // Everything that never moves, merged.
    const parts: THREE.BufferGeometry[] = [];
    const tentCount = high ? 11 : 7;
    const seg = high ? 12 : 8;
    for (let i = 0; i < tentCount; i++) {
      // A ring of tents beyond the platform, leaving the wheel's corner free.
      const a = 0.35 + (i / tentCount) * Math.PI * 1.55;
      const r = 760 + (i % 2) * 170;
      parts.push(...tent(Math.cos(a) * r, Math.sin(a) * r, 70 + (i % 3) * 18, TENT_STRIPES[i % TENT_STRIPES.length]!, seg));
    }
    parts.push(...candyStall(620, -520, high));
    parts.push(...wheelStand(high));
    const poles = high ? 14 : 9;
    parts.push(...garlandPoles(poles, GARLAND_R));
    const statics = new THREE.Mesh(mergeGeometries(parts)!, lambert());
    for (const g of parts) g.dispose();
    this.group.add(statics);

    // The wheel: rims, spokes and hub turn together; the gondolas hang level from it.
    this.wheel.position.copy(WHEEL_POS);
    const spokes = high ? 16 : 10;
    this.wheel.add(new THREE.Mesh(wheelGeometry(spokes, high), lambert()));
    this.gondolaCount = spokes;
    this.gondolas = new THREE.InstancedMesh(
      painted(new THREE.CylinderGeometry(22, 18, 30, high ? 8 : 6).translate(0, -24, 0), (_x, y) => (y > -18 ? 0xfff4d6 : 0xc8243f)),
      lambert(),
      spokes,
    );
    this.gondolas.frustumCulled = false;
    const gondolaColor = new THREE.Color();
    for (let i = 0; i < spokes; i++) this.gondolas.setColorAt(i, gondolaColor.setHex(BULB_COLORS[i % BULB_COLORS.length]!));
    this.group.add(this.wheel, this.gondolas);
    // Bulbs along the rim (they turn with the wheel, nothing to update).
    const rimBulbs = high ? 96 : 40;
    const rimPos: number[] = [];
    const rimCol: number[] = [];
    const c = new THREE.Color();
    for (let i = 0; i < rimBulbs; i++) {
      const a = (i / rimBulbs) * Math.PI * 2;
      for (const z of [-20, 20]) {
        rimPos.push(Math.cos(a) * WHEEL_R, Math.sin(a) * WHEEL_R, z);
        c.setHex(BULB_COLORS[i % BULB_COLORS.length]!);
        rimCol.push(c.r, c.g, c.b);
      }
    }
    this.wheel.add(glowPoints(rimPos, rimCol, high ? 16 : 20, dot));

    // Garlands: bulbs on sagging strings between poles around the ring, chasing.
    const garlandPos: number[] = [];
    const perSpan = high ? 18 : 10;
    for (let i = 0; i < poles; i++) {
      const a0 = (i / poles) * Math.PI * 2;
      const a1 = ((i + 1) / poles) * Math.PI * 2;
      const r = GARLAND_R;
      for (let k = 0; k < perSpan; k++) {
        const t = k / perSpan;
        const a = a0 + (a1 - a0) * t;
        const sag = Math.sin(t * Math.PI) * 38;
        garlandPos.push(Math.cos(a) * r, GROUND_Y + 150 - sag, Math.sin(a) * r);
        this.garlandBase.push(new THREE.Color(BULB_COLORS[(i * perSpan + k) % BULB_COLORS.length]!));
      }
    }
    this.garlandColors = new Float32Array(this.garlandBase.length * 3);
    this.garland = glowPoints(garlandPos, Array.from(this.garlandColors), high ? 14 : 18, dot);
    this.group.add(this.garland);
  }

  update(dt: number): void {
    this.clock += dt;
    this.wheel.rotation.z = this.clock * WHEEL_SPEED;
    // Gondolas: on the rim, always hanging straight down.
    for (let i = 0; i < this.gondolaCount; i++) {
      const a = (i / this.gondolaCount) * Math.PI * 2 + this.wheel.rotation.z;
      this.p.set(WHEEL_POS.x + Math.cos(a) * WHEEL_R, WHEEL_POS.y + Math.sin(a) * WHEEL_R, WHEEL_POS.z);
      this.m.makeTranslation(this.p.x, this.p.y, this.p.z);
      this.gondolas.setMatrixAt(i, this.m);
    }
    this.gondolas.instanceMatrix.needsUpdate = true;

    // Garland chase: every third bulb bright, stepping 5 times a second (a color update only).
    const step = Math.floor(this.clock * 5);
    if (step === this.lastStep) return;
    this.lastStep = step;
    for (let i = 0; i < this.garlandBase.length; i++) {
      const k = (i + step) % 3 === 0 ? 1 : 0.25;
      const b = this.garlandBase[i]!;
      this.garlandColors[i * 3] = b.r * k;
      this.garlandColors[i * 3 + 1] = b.g * k;
      this.garlandColors[i * 3 + 2] = b.b * k;
    }
    const attr = this.garland.geometry.attributes.color as THREE.BufferAttribute;
    (attr.array as Float32Array).set(this.garlandColors);
    attr.needsUpdate = true;
  }
}

/** Stars on the upper half of a big sphere (fog-free, fixed size on screen). */
function stars(count: number, dot: THREE.Texture): THREE.Points {
  const pos: number[] = [];
  const col: number[] = [];
  const c = new THREE.Color();
  // A fixed pattern (no Math.random: the same sky every time).
  for (let i = 0; i < count; i++) {
    const u = (i * 0.618034) % 1;
    const v = (i * 0.754877) % 1;
    const a = u * Math.PI * 2;
    const h = 0.08 + v * 0.92;
    const r = 2600;
    pos.push(Math.cos(a) * Math.sqrt(1 - h * h) * r, h * r * 0.7 + 100, Math.sin(a) * Math.sqrt(1 - h * h) * r);
    c.setHSL(0.6 + ((i * 7) % 10) / 60, 0.4, 0.55 + ((i * 13) % 10) / 25);
    col.push(c.r, c.g, c.b);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const points = new THREE.Points(
    geom,
    new THREE.PointsMaterial({ size: 3, sizeAttenuation: false, vertexColors: true, map: dot, transparent: true, depthWrite: false, fog: false }),
  );
  points.frustumCulled = false;
  return points;
}

function glowPoints(pos: number[], col: number[], size: number, dot: THREE.Texture): THREE.Points {
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return new THREE.Points(
    geom,
    new THREE.PointsMaterial({ size, vertexColors: true, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
  );
}

/** A round striped tent: wall, pointed roof, a pennant pole on top. */
function tent(x: number, z: number, r: number, [a, b]: [number, number], seg: number): THREE.BufferGeometry[] {
  const wallH = r * 0.9;
  const roofH = r * 0.85;
  return [
    painted(new THREE.CylinderGeometry(r, r, wallH, seg, 1, true), stripes(a, b, seg)).translate(x, GROUND_Y + wallH / 2, z),
    painted(new THREE.ConeGeometry(r * 1.12, roofH, seg), stripes(a, b, seg)).translate(x, GROUND_Y + wallH + roofH / 2, z),
    painted(new THREE.CylinderGeometry(1.5, 1.5, 30, 4), solid(0x5a4a6a)).translate(x, GROUND_Y + wallH + roofH + 12, z),
    painted(new THREE.ConeGeometry(7, 14, 3).rotateZ(-Math.PI / 2), solid(a)).translate(x + 8, GROUND_Y + wallH + roofH + 22, z),
  ];
}

/** "Vată de zahăr": a counter, a striped awning and pink and blue clouds on sticks. */
function candyStall(x: number, z: number, high: boolean): THREE.BufferGeometry[] {
  const parts = [
    painted(new THREE.BoxGeometry(150, 60, 70), solid(0xfff4d6)).translate(x, GROUND_Y + 30, z),
    painted(new THREE.BoxGeometry(150, 8, 74), solid(0xff8fab)).translate(x, GROUND_Y + 62, z),
    painted(new THREE.CylinderGeometry(3, 3, 90, 4), solid(0x5a4a6a)).translate(x - 70, GROUND_Y + 105, z + 30),
    painted(new THREE.CylinderGeometry(3, 3, 90, 4), solid(0x5a4a6a)).translate(x + 70, GROUND_Y + 105, z + 30),
    // Awning: a slanted box striped along x.
    painted(new THREE.BoxGeometry(170, 6, 90, high ? 10 : 6, 1, 1), (px) => (Math.floor((px + 85) / 17) % 2 === 0 ? 0xff4d6d : 0xfff4d6))
      .rotateX(0.25)
      .translate(x, GROUND_Y + 150, z + 10),
  ];
  const clouds = high ? 7 : 4;
  for (let i = 0; i < clouds; i++) {
    const cx = x - 55 + i * (110 / Math.max(1, clouds - 1));
    const color = i % 2 === 0 ? 0xffb3d1 : 0xbde0fe;
    parts.push(painted(new THREE.CylinderGeometry(1, 1, 24, 3), solid(0xfff4d6)).translate(cx, GROUND_Y + 78, z - 10));
    parts.push(painted(new THREE.IcosahedronGeometry(12, high ? 1 : 0), solid(color)).translate(cx, GROUND_Y + 96, z - 10));
  }
  return parts;
}

/** The wheel's A-frame legs and base (they do not turn). */
function wheelStand(high: boolean): THREE.BufferGeometry[] {
  const { x, y, z } = WHEEL_POS;
  const parts: THREE.BufferGeometry[] = [];
  const legLen = Math.hypot(y - GROUND_Y, 150);
  const lean = Math.atan2(150, y - GROUND_Y);
  for (const side of [-1, 1]) {
    for (const dz of [-34, 34]) {
      parts.push(
        painted(new THREE.BoxGeometry(10, legLen, 10), solid(0x8c8296))
          .rotateZ(side * lean)
          .translate(x + (side * 150) / 2, (y + GROUND_Y) / 2, z + dz),
      );
    }
  }
  parts.push(painted(new THREE.BoxGeometry(380, 20, 110), solid(0x3a2a4a)).translate(x, GROUND_Y + 10, z));
  if (high) parts.push(painted(new THREE.BoxGeometry(60, 50, 50), solid(0xc8243f)).translate(x + 120, GROUND_Y + 45, z + 70));
  return parts;
}

/** Two rims, the spokes and the hub, in the wheel's own frame (turning around z). */
function wheelGeometry(spokes: number, high: boolean): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-20, 20]) {
    parts.push(painted(new THREE.TorusGeometry(WHEEL_R, 4, 4, high ? 48 : 24), solid(0xd8d0e8)).translate(0, 0, z));
  }
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    for (const z of [-20, 20]) {
      parts.push(
        painted(new THREE.BoxGeometry(WHEEL_R, 3, 3), solid(0xb8aed0))
          .translate(WHEEL_R / 2, 0, z)
          .rotateZ(a),
      );
    }
  }
  parts.push(painted(new THREE.CylinderGeometry(16, 16, 60, 8).rotateX(Math.PI / 2), solid(0xffd166)));
  const merged = mergeGeometries(parts)!;
  for (const g of parts) g.dispose();
  return merged;
}

/** Thin poles holding the garlands. */
function garlandPoles(count: number, r: number): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2;
    parts.push(painted(new THREE.CylinderGeometry(2.5, 3, 160, 4), solid(0x4a3a5a)).translate(Math.cos(a) * r, GROUND_Y + 80, Math.sin(a) * r));
  }
  return parts;
}
