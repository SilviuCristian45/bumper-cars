import * as THREE from 'three';
import { BOT_NAMES, DRIVER_COUNT, type PlayerState } from '@masinute/shared';
import { painted, solid, stripes, type Paint } from './paint';

// The drivers: low-poly characters in the seat instead of the plain driver. Each fair bot has its own
// (a carousel horse, cotton candy, a gingerbread man, a clown, a kid on a swing, a little chain swing
// ride); players pick any of them in the lobby (DriverPicker). Pieces are in the car's frame (x forward, y up, z to the right): the seat is at x ≈ -5,
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

/** A teddy bear from the shooting gallery, with a red bow tie. */
const teddy: Builder = () => {
  const fur = 0x9c6b3e;
  const light = 0xd9b38c;
  return [
    at(new THREE.SphereGeometry(5.5, 9, 6).scale(1, 1.1, 1), fur, -5, 26, 0),
    at(new THREE.SphereGeometry(3.5, 8, 5), light, -2.2, 25.5, 0),
    at(new THREE.SphereGeometry(5, 9, 6), fur, -3.5, 35, 0),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(2, 6, 4), fur, -4.5, 39.5, s * 3.8)),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(1.1, 5, 3), light, -3.6, 39.7, s * 3.8)),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(2.2, 6, 4), fur, -1.5, 28, s * 5.5)),
    at(new THREE.SphereGeometry(2.2, 7, 5), light, 1, 34, 0),
    at(new THREE.SphereGeometry(0.8, 5, 3), DARK, 3.1, 34.7, 0),
    ...eyes(0.8, 36.6, 2.1, 0.8),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(1.2, 2.4, 2.4), 0xe63946, 0.4, 30.6, s * 1.6)),
    at(new THREE.SphereGeometry(0.8, 5, 3), 0xc8243f, 0.8, 30.6, 0),
  ];
};

/** A red balloon with a face, its string held by two little hands. */
const balloon: Builder = () => [
  at(new THREE.CylinderGeometry(0.3, 0.3, 14, 4), 0xe8e0d0, -4, 28, 0),
  at(new THREE.ConeGeometry(1.2, 2, 6), 0xc8243f, -4, 35.2, 0),
  at(new THREE.SphereGeometry(6, 12, 8).scale(1, 1.15, 1), 0xe63946, -4, 42, 0),
  at(new THREE.SphereGeometry(1.2, 6, 4), WHITE, 0.6, 45.5, -2.4),
  ...eyes(1.6, 42.6, 2, 0.9),
  at(new THREE.BoxGeometry(0.8, 0.8, 3), DARK, 1.6, 39.8, 0),
  ...[-1, 1].map((s) => at(new THREE.BoxGeometry(4, 1.4, 1.4).rotateY(s * 0.6), SKIN, -2, 27, s * 1.6)),
];

/** A striped popcorn bucket, overflowing, with big cartoon eyes. */
const popcorn: Builder = () => {
  const kernels: [number, number, number, number][] = [
    [-4, 35.5, 0, WHITE],
    [-1.5, 34, -3, 0xfff3c4],
    [-1.5, 34, 3, WHITE],
    [-6.5, 34, -3, 0xffe08a],
    [-6.5, 34, 3, 0xfff3c4],
    [-3, 37.8, -1.8, 0xffe08a],
    [-5, 37.8, 1.8, WHITE],
    [-1, 35.5, 0, 0xffe08a],
  ];
  return [
    at(new THREE.CylinderGeometry(6, 4.5, 11, 10), stripes(WHITE, 0xe63946, 10), -4, 27, 0),
    ...kernels.map(([x, y, z, c]) => at(new THREE.IcosahedronGeometry(2.4, 0), c, x, y, z)),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(1.6, 7, 5), WHITE, 0.6, 28.5, s * 2)),
    ...eyes(1.9, 28.5, 2, 0.8),
    at(new THREE.BoxGeometry(0.8, 0.8, 3), DARK, 1, 25.2, 0),
  ];
};

/** A doughnut on stubby legs: pink icing in front, sprinkles, a face on the ring. */
const doughnut: Builder = () => {
  const dough = 0xd9a066;
  const sprinkles = [0x4cc9f0, 0xffd166, 0x3ddc97, WHITE, 0x7b2cbf, 0xe63946, 0x4cc9f0, 0xffd166];
  const angles = [20, 160, 200, 340, 50, 130, 235, 305];
  return [
    at(new THREE.TorusGeometry(5.5, 2.6, 6, 14).rotateY(Math.PI / 2), (x) => (x > 0.6 ? 0xff8fab : dough), -4, 34, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(3, 5, 2.5), dough, -4, 24, s * 3)),
    ...angles.map((deg, i) => {
      const a = (deg * Math.PI) / 180;
      return at(new THREE.BoxGeometry(0.6, 0.6, 1.6).rotateX(a), sprinkles[i]!, -1.3, 34 + Math.sin(a) * 5.5, Math.cos(a) * 5.5);
    }),
    ...eyes(-1.2, 39.4, 1.7, 0.8),
    at(new THREE.BoxGeometry(0.8, 0.8, 2.6), DARK, -1.2, 28.8, 0),
  ];
};

/** A candy apple: red, dipped in caramel, on a stick. */
const candyApple: Builder = () => {
  const caramel = 0xc77d2a;
  return [
    at(new THREE.CylinderGeometry(6, 6.5, 1.5, 12), caramel, -4, 22.5, 0),
    at(new THREE.SphereGeometry(6.5, 12, 8).scale(1, 0.9, 1), (_x, y) => (y < -2 ? caramel : 0xd62828), -4, 30, 0),
    at(new THREE.CylinderGeometry(0.7, 0.7, 14, 5), 0xe0c48a, -4, 41, 0),
    at(new THREE.BoxGeometry(4, 0.6, 2).rotateZ(0.4), 0x3ddc97, -2, 36.8, 0),
    ...eyes(2.2, 31.5, 2.2, 0.95),
    at(new THREE.BoxGeometry(0.8, 0.8, 3), DARK, 2.3, 28.8, 0),
  ];
};

/** A yellow duck from the hook-a-duck stall, with a little sailor hat. */
const duck: Builder = () => {
  const yellow = 0xffd60a;
  return [
    at(new THREE.SphereGeometry(6, 10, 7).scale(1.3, 0.85, 1), yellow, -5, 26, 0),
    at(new THREE.ConeGeometry(2, 4, 5).rotateZ(0.8), yellow, -11.5, 30, 0),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(3, 7, 5).scale(1.4, 0.7, 0.5), 0xf0c000, -5, 27, s * 6.3)),
    at(new THREE.SphereGeometry(4.2, 10, 7), yellow, -1, 35, 0),
    at(new THREE.BoxGeometry(4, 1.5, 3.5), 0xff8c00, 3.5, 34.2, 0),
    ...eyes(1.8, 36.5, 2.1, 0.8),
    at(new THREE.CylinderGeometry(2.6, 2.6, 1.8, 10), WHITE, -1.5, 39.4, 0),
    at(new THREE.CylinderGeometry(2.7, 2.7, 0.6, 10), 0x3a6fd8, -1.5, 38.7, 0),
  ];
};

/** A magician: black suit, white shirt, moustache, top hat and a wand. */
const magician: Builder = () => {
  const suit = 0x22202a;
  return [
    at(new THREE.BoxGeometry(7, 9, 10), suit, -4.5, 25.5, 0),
    at(new THREE.BoxGeometry(1, 7, 3), WHITE, -0.9, 26, 0),
    at(new THREE.BoxGeometry(1, 1.5, 3), 0xe63946, -0.4, 29.3, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(5, 2, 2), suit, -1.5, 27.5, s * 5.5)),
    at(new THREE.CylinderGeometry(0.5, 0.5, 10, 5).rotateX(-0.5).rotateZ(-0.8), suit, 3, 31, 6.5),
    at(new THREE.SphereGeometry(0.9, 5, 3), WHITE, 6.4, 34, 8.8),
    at(new THREE.SphereGeometry(4.6, 9, 6), SKIN, -3.5, 33.5, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(1, 0.9, 2.6).rotateX(s * 0.3), DARK, 1, 32.2, s * 1.3)),
    ...eyes(0.9, 35, 1.7, 0.75),
    at(new THREE.CylinderGeometry(6, 6, 0.8, 12), suit, -3.5, 37.6, 0),
    at(new THREE.CylinderGeometry(3.6, 3.6, 8, 12), suit, -3.5, 42, 0),
    at(new THREE.CylinderGeometry(3.7, 3.7, 1.4, 12), 0xe63946, -3.5, 38.9, 0),
  ];
};

/** A wind-up tin robot: lights on its chest, an antenna, a key in its back. */
const robot: Builder = () => {
  const tin = 0xb8c0cc;
  return [
    at(new THREE.BoxGeometry(8, 9, 10), tin, -4.5, 26, 0),
    at(new THREE.BoxGeometry(0.8, 4, 5), DARK, -0.4, 26.5, 0),
    ...[0xe63946, 0x3ddc97, GOLD].map((c, i) => at(new THREE.SphereGeometry(0.6, 5, 3), c, 0.1, 27.3, (i - 1) * 1.5)),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(5, 2, 2), tin, -2, 27, s * 5.8)),
    at(new THREE.BoxGeometry(7, 6, 8), 0xd5dbe3, -4, 34.5, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(0.8, 1.8, 1.8), 0x4cc9f0, -0.4, 35.2, s * 1.8)),
    at(new THREE.BoxGeometry(0.6, 0.8, 4), DARK, -0.4, 32.6, 0),
    ...[-1, 1].map((s) => at(new THREE.CylinderGeometry(1.3, 1.3, 1.5, 8).rotateX(Math.PI / 2), 0xe63946, -4, 34.5, s * 4.6)),
    at(new THREE.CylinderGeometry(0.35, 0.35, 4, 4), DARK, -4, 39.5, 0),
    at(new THREE.SphereGeometry(1.2, 6, 4), 0xe63946, -4, 42, 0),
    at(new THREE.CylinderGeometry(0.5, 0.5, 4, 5).rotateZ(Math.PI / 2), GOLD, -10, 33, 0),
    at(new THREE.BoxGeometry(0.8, 3, 5), GOLD, -12.2, 33, 0),
  ];
};

/** The chat robot: teal tin, a dark visor with two white eyes, a speech bubble with three dots beside its head. */
const chatRobot: Builder = () => {
  const teal = 0x10a37f;
  return [
    at(new THREE.BoxGeometry(8, 9, 10), teal, -4.5, 26, 0),
    at(new THREE.BoxGeometry(0.8, 4, 6), WHITE, -0.4, 26.5, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(5, 2, 2), teal, -2, 27, s * 5.8)),
    at(new THREE.BoxGeometry(7, 6.5, 8.5), 0xe9f5f1, -4, 34.5, 0),
    at(new THREE.BoxGeometry(0.8, 3, 6.5), DARK, -0.4, 35, 0),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(0.8, 6, 4), WHITE, 0.1, 35, s * 1.7)),
    at(new THREE.CylinderGeometry(0.35, 0.35, 4, 4), DARK, -4, 39.7, 0),
    at(new THREE.SphereGeometry(1.2, 6, 4), teal, -4, 42.2, 0),
    at(new THREE.BoxGeometry(1.5, 5, 8), WHITE, -3, 44, 8.5),
    at(new THREE.ConeGeometry(1.2, 2.5, 4).rotateX(Math.PI).rotateX(-0.6), WHITE, -3, 41, 6),
    ...[-1, 0, 1].map((i) => at(new THREE.SphereGeometry(0.6, 5, 3), DARK, -2.1, 44, 8.5 + i * 2.2)),
  ];
};

/** The twin robot: blue fading to violet, a round head with a visor, two antennas with gems. */
const twinRobot: Builder = () => {
  const fade: Paint = (_x, y) => (y > 1.5 ? 0x9b72cb : y > -1.5 ? 0x6f7fe0 : 0x4285f4);
  return [
    at(new THREE.BoxGeometry(8, 9, 10), fade, -4.5, 26, 0),
    ...[0x4285f4, 0x9b72cb, 0xd96570].map((c, i) => at(new THREE.SphereGeometry(0.6, 5, 3), c, -0.4, 27.3, (i - 1) * 1.6)),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(5, 2, 2), 0x4285f4, -2, 27, s * 5.8)),
    at(new THREE.SphereGeometry(4.8, 10, 7), 0xe8ecfb, -4, 35, 0),
    at(new THREE.BoxGeometry(2, 2.6, 6.5), 0x1d1f3a, -0.2, 35.4, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(0.6, 1, 1.4), 0x8ab4f8, 0.9, 35.4, s * 1.6)),
    ...[-1, 1].map((s) => at(new THREE.CylinderGeometry(0.3, 0.3, 5, 4).rotateX(s * 0.35), DARK, -4, 41, s * 1.8)),
    ...[-1, 1].map((s) => at(new THREE.OctahedronGeometry(1.9, 0), s < 0 ? 0x4285f4 : 0x9b72cb, -4, 43.8, s * 2.8)),
  ];
};

/** The thoughtful robot: terracotta tin, a round cream head, rosy cheeks, an open book in its hands. */
const bookRobot: Builder = () => {
  const clay = 0xd97757;
  const cream = 0xf0e6d8;
  return [
    at(new THREE.BoxGeometry(8, 9, 10), clay, -4.5, 26, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(4, 2, 2).rotateY(s * 0.5), clay, -1.5, 28, s * 4.5)),
    at(new THREE.BoxGeometry(3.6, 0.6, 7.5).rotateZ(0.5), 0x7a3e2a, 0.6, 28.5, 0),
    ...[-1, 1].map((s) => at(new THREE.BoxGeometry(3.4, 0.6, 3.4).rotateZ(0.5).rotateX(s * 0.15), cream, 0.8, 29, s * 1.85)),
    at(new THREE.CylinderGeometry(4.6, 4.6, 7, 12), cream, -4, 35, 0),
    at(new THREE.SphereGeometry(4.6, 12, 4, 0, Math.PI * 2, 0, Math.PI / 2), cream, -4, 38.5, 0),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(0.9, 6, 4).scale(1, 1.4, 1), DARK, 0.3, 36, s * 1.8)),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(0.8, 5, 3), 0xf4a28c, 0.2, 34, s * 3)),
    at(new THREE.BoxGeometry(0.6, 0.6, 2), DARK, 0.6, 33.4, 0),
    at(new THREE.CylinderGeometry(0.5, 0.5, 3.5, 5), DARK, -4, 44.5, 0),
    at(new THREE.SphereGeometry(1.6, 6, 4), clay, -4, 46.8, 0),
  ];
};

/** A goldfish from the fair's prize stall, on a splash of water, blowing bubbles. */
const goldfish: Builder = () => {
  const orange = 0xff7b00;
  const fin = 0xff4d00;
  return [
    at(new THREE.CylinderGeometry(5, 5.5, 5, 12), 0x4cc9f0, -4, 23.5, 0),
    at(new THREE.SphereGeometry(5.5, 12, 8).scale(1.3, 1, 0.75), (_x, y) => (y < -2 ? 0xffb347 : orange), -3.5, 32, 0),
    at(new THREE.ConeGeometry(4, 6, 4).rotateZ(-Math.PI / 2).scale(1, 1, 0.4), fin, -12, 33, 0),
    at(new THREE.ConeGeometry(2.5, 4, 4).rotateZ(0.5).scale(1, 1, 0.4), fin, -5, 38, 0),
    ...[-1, 1].map((s) => at(new THREE.ConeGeometry(1.5, 3, 4).rotateX(-s * 1.2).scale(1, 1, 0.5), fin, -2.5, 29.5, s * 4)),
    ...[-1, 1].map((s) => at(new THREE.SphereGeometry(1.5, 7, 5), WHITE, 1.6, 33.5, s * 2.2)),
    ...eyes(2.8, 33.5, 2.2, 0.8),
    at(new THREE.TorusGeometry(0.9, 0.35, 4, 8).rotateY(Math.PI / 2), 0xd62828, 3.7, 31.2, 0),
    at(new THREE.SphereGeometry(0.9, 6, 4), 0xbde0fe, 5, 37.5, 0),
    at(new THREE.SphereGeometry(0.7, 6, 4), 0xbde0fe, 5.8, 41, 1),
    at(new THREE.SphereGeometry(0.5, 6, 4), 0xbde0fe, 5.2, 44, -0.5),
  ];
};

/**
 * The characters by PlayerState.driver (0 = the plain driver). The numbers go over the wire (players
 * see each other's picks), so only ever append, up to DRIVER_COUNT. The first six are the fair bots'.
 */
const DRIVERS: readonly (Builder | null)[] = [
  null,
  horse,
  cottonCandy,
  gingerbread,
  clown,
  swingKid,
  chainRide,
  teddy,
  balloon,
  popcorn,
  doughnut,
  candyApple,
  duck,
  magician,
  robot,
  goldfish,
  chatRobot,
  twinRobot,
  bookRobot,
];
if (DRIVERS.length !== DRIVER_COUNT + 1) throw new Error('drivers.ts: one character per DRIVER_COUNT');

/** What the lobby's picker calls them, by the same number. */
export const DRIVER_NAMES: readonly string[] = [
  'Șoferul clasic',
  ...BOT_NAMES,
  'Ursulețul',
  'Balonul',
  'Floricele',
  'Gogoașa',
  'Mărul în caramel',
  'Rățușca',
  'Magicianul',
  'Robotelul',
  'Peștișorul de aur',
  'ChatGPT',
  'Gemini',
  'Claude',
];

/** The character driving this player's car: the player's pick, a fair bot's own one, or 0 (plain driver). */
export function driverOf(p: Readonly<PlayerState>): number {
  if (p.isBot) return BOT_NAMES.indexOf(p.name) + 1;
  return Number.isInteger(p.driver) && p.driver > 0 && p.driver <= DRIVER_COUNT ? p.driver : 0;
}

/** A bit bigger than the plain driver so they read from the match camera, grown from the seat. */
const SCALE = 1.1;

/** The pieces of a driver (non-indexed, vertex-colored), or null for the plain driver. */
export function driverParts(driver: number): THREE.BufferGeometry[] | null {
  const build = DRIVERS[driver];
  if (!build) return null;
  return build().map((g) => g.translate(4, -21, 0).scale(SCALE, SCALE, SCALE).translate(-4, 21, 0));
}
