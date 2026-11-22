import * as THREE from 'three';
import { BOT_NAMES, type PlayerState } from '@masinute/shared';
import { painted, solid, stripes, type Paint } from './paint';

// The bots' drivers: each fair bot has its own low-poly character in the seat instead of the plain
// driver (a carousel horse, cotton candy, a gingerbread man, a clown, a kid on a swing, a little chain
// swing ride). Pieces are in the car's frame (x forward, y up, z to the right): the seat is at x ≈ -5,
// its top at y = 21, its back at x ≈ -11; everything stays under y ≈ 50 (the name label is above).

const DARK = 0x1d1a22;
const WHITE = 0xfaf6ee;
const GOLD = 0xffd166;
const SKIN = 0xf2c79b;

type Builder = () => THREE.BufferGeometry[];

const at = (g: THREE.BufferGeometry, paint: Paint | number, x: number, y: number, z: number) =>
  painted(g, typeof paint === 'number' ? solid(paint) : paint).translate(x, y, z);

/** Two eyes looking forward from a face whose front is at x, centered at height y. */
const eyes = (x: number, y: number, gap: number, r = 1.1, color = DARK) =>
  [-1, 1].map((s) => at(new THREE.SphereGeometry(r, 6, 4), color, x, y, s * gap));

/** A carousel horse, white with a pink mane, on its golden pole. */
const horse: Builder = () => {
  const coat = 0xf6efe3;
  const mane = 0xff8fab;
  const head = new THREE.BoxGeometry(12.5, 6, 6.5).rotateZ(-0.35);
  return [
    at(new THREE.BoxGeometry(8, 10, 10), coat, -5, 26, 0),
    at(new THREE.CylinderGeometry(3, 3.8, 9, 7).rotateZ(-0.5), coat, -2, 33, 0),
    at(head, coat, 2.6, 36.3, 0),
    at(new THREE.BoxGeometry(2.5, 3.6, 5.8).rotateZ(-0.35), 0xd9c9b8, 8.2, 34.2, 0),
    at(new THREE.BoxGeometry(1.2, 6.8, 6.9).rotateZ(-0.35), 0xc8243f, 3, 36.6, 0),
    ...eyes(1.2, 38.6, 3.3, 0.9),
    ...[-1, 1].map((s) => at(new THREE.ConeGeometry(1.3, 4, 4), coat, -1.5, 41.5, s * 2.2)),
    at(new THREE.BoxGeometry(3, 10, 2.4).rotateZ(-0.5), mane, -4.2, 35.5, 0),
    at(new THREE.BoxGeometry(5, 2.4, 2.4), mane, -1.4, 40, 0),
    at(new THREE.CylinderGeometry(0.9, 0.9, 30, 6), GOLD, -6.5, 34, 0),
    at(new THREE.SphereGeometry(1.8, 6, 4), GOLD, -6.5, 49, 0),
  ];
};

/** Cotton candy: a pink cloud with a face on a striped paper cone. */
const cottonCandy: Builder = () => {
  const puffs: [number, number, number, number, number][] = [
    [-4, 33, 0, 6.5, 0xffa8d8],
    [-2, 37, -4, 4.5, 0xffc2e4],
    [-3, 37.5, 4, 4.5, 0xff94cf],
    [-6, 39, 0, 5, 0xffb6de],
    [-1.5, 30.5, -4.5, 4, 0xff9ad2],
    [-1.5, 30.5, 4.5, 4, 0xffb0dc],
  ];
  return [
    at(new THREE.ConeGeometry(4, 10, 8).rotateX(Math.PI), stripes(WHITE, 0x4cc9f0, 8), -4, 26, 0),
    ...puffs.map(([x, y, z, r, c]) => at(new THREE.IcosahedronGeometry(r, 0), c, x, y, z)),
    ...eyes(2.4, 34.5, 2.2, 1),
    at(new THREE.BoxGeometry(1, 0.9, 3), 0xc8243f, 2.6, 31.6, 0),
  ];
};

/** A gingerbread man with white icing, buttons and stubby arms. */
const gingerbread: Builder = () => {
  const dough = 0xb5652b;
  return [
    at(new THREE.BoxGeometry(5, 11, 10), dough, -4, 26.5, 0),
    at(new THREE.CylinderGeometry(6, 6, 4.5, 10).rotateZ(Math.PI / 2), dough, -3.5, 36.5, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(4, 3.5, 7).rotateY(s * 0.5), dough, -1, 28, s * 7)),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(1, 3.7, 0.8).rotateY(s * 0.5), WHITE, 0.6, 28, s * 8.2)),
    ...eyes(-1.1, 38, 2.2, 0.9, WHITE),
    // The icing smile: three dots on a curve.
    ...[-2, 0, 2].map((z) => at(new THREE.SphereGeometry(0.6, 5, 3), WHITE, -1.1, 34.6 - (z === 0 ? 0.6 : 0), z)),
    at(new THREE.SphereGeometry(1, 6, 4), 0xe63946, -1.4, 29.5, 0),
    at(new THREE.SphereGeometry(1, 6, 4), 0x3ddc97, -1.4, 26, 0),
    at(new THREE.TorusGeometry(5.6, 0.4, 3, 16).rotateY(Math.PI / 2), WHITE, -1.2, 36.5, 0),
  ];
};

/** A clown: polka-dot suit, ruff, white face, red nose, orange hair tufts, striped cone hat. */
const clown: Builder = () => {
  const dots: Paint = (x, y, z) => ((Math.floor(y * 0.6) + Math.floor(z * 0.4) + Math.floor(x * 0.4)) % 3 === 0 ? 0xe63946 : 0xffd166);
  return [
    at(new THREE.BoxGeometry(7, 9, 10), dots, -4.5, 25.5, 0),
    at(new THREE.TorusGeometry(5, 1.6, 4, 10).rotateX(Math.PI / 2), stripes(WHITE, 0x4cc9f0, 10), -4, 30.5, 0),
    at(new THREE.SphereGeometry(5, 9, 6), WHITE, -3.5, 35.5, 0),
    at(new THREE.SphereGeometry(1.6, 6, 4), 0xe63946, 1.5, 35, 0),
    ...eyes(0.8, 37.2, 2, 0.8),
    at(new THREE.BoxGeometry(1, 1, 4), 0xe63946, 0.8, 32.8, 0),
    ...[-1, 1].map((s) => at(new THREE.IcosahedronGeometry(2.8, 0), 0xff6b35, -4.5, 36.5, s * 5)),
    at(new THREE.ConeGeometry(3.6, 9, 8), stripes(0x7b2cbf, GOLD, 8), -4, 44, 0),
    at(new THREE.SphereGeometry(1.5, 6, 4), WHITE, -4, 49, 0),
  ];
};

/** A kid on a swing: cap, rosy cheeks, holding the two ropes of a wooden swing over the seat. */
const swingKid: Builder = () => {
  const wood = 0x8b5a2b;
  return [
    at(new THREE.BoxGeometry(6, 8, 9), 0x3a6fd8, -4.5, 25, 0),
    at(new THREE.SphereGeometry(4.6, 9, 6), SKIN, -3.5, 32.5, 0),
    at(new THREE.SphereGeometry(4.8, 9, 4, 0, Math.PI * 2, 0, Math.PI / 2), 0xe63946, -3.5, 34.4, 0),
    at(new THREE.BoxGeometry(5, 0.8, 7), 0xe63946, 0.5, 34.5, 0),
    ...eyes(1, 32.4, 1.8, 0.75),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(0.9, 5, 3), 0xff8fab, 0.4, 31, s * 3)),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(5, 2, 2).rotateY(s * 0.2), 0x3a6fd8, -2, 27, s * 5.5)),
    ...[-1, 1].map((s) => at(new THREE.CylinderGeometry(0.4, 0.4, 24, 4), 0xd8c8a8, -4, 33, s * 7)),
    at(new THREE.BoxGeometry(3, 3, 19), wood, -4, 45.5, 0),
    at(new THREE.BoxGeometry(9, 1.5, 15), wood, -5, 21.5, 0),
  ];
};

/** A little chain swing ride with a face: striped pole, canopy, four chairs on chains. */
const chainRide: Builder = () => {
  const chairs = [0xe63946, 0x4cc9f0, 0x3ddc97, GOLD];
  const parts = [
    at(new THREE.CylinderGeometry(2.6, 3.4, 24, 8), (_x, y) => (Math.floor(y / 3) % 2 === 0 ? 0xe63946 : WHITE), -3, 33, 0),
    at(new THREE.ConeGeometry(10, 6, 12), stripes(0x7b2cbf, GOLD, 12), -3, 47, 0),
    at(new THREE.CylinderGeometry(10, 10, 1.5, 12), 0xff8fab, -3, 43.5, 0),
    ...eyes(-0.2, 34, 1.6, 1.3, WHITE),
    ...eyes(0.8, 34, 1.6, 0.6),
  ];
  for (let i = 0; i < 4; i++) {
    const a = Math.PI / 4 + (i * Math.PI) / 2;
    const x = -3 + Math.cos(a) * 8;
    const z = Math.sin(a) * 8;
    parts.push(at(new THREE.CylinderGeometry(0.3, 0.3, 9, 3), 0xb8aed0, x, 38.5, z));
    parts.push(at(new THREE.BoxGeometry(3, 2.5, 3), chairs[i]!, x, 33, z));
  }
  return parts;
};

const DRIVERS: Record<string, Builder> = {
  [BOT_NAMES[0]!]: horse,
  [BOT_NAMES[1]!]: cottonCandy,
  [BOT_NAMES[2]!]: gingerbread,
  [BOT_NAMES[3]!]: clown,
  [BOT_NAMES[4]!]: swingKid,
  [BOT_NAMES[5]!]: chainRide,
};

/** The character driving this player's car: a bot with a fair name gets its own, everyone else the plain driver. */
export function driverOf(p: Readonly<PlayerState>): string | undefined {
  return p.isBot && DRIVERS[p.name] ? p.name : undefined;
}

/** A bit bigger than the plain driver so they read from the match camera, grown from the seat. */
const SCALE = 1.1;

/** The pieces of a bot's driver (non-indexed, vertex-colored), or null for the plain driver. */
export function driverParts(driver: string | undefined): THREE.BufferGeometry[] | null {
  const build = driver ? DRIVERS[driver] : undefined;
  if (!build) return null;
  return build().map((g) => g.translate(4, -21, 0).scale(SCALE, SCALE, SCALE).translate(-4, 21, 0));
}
