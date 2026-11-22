import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PU_GHOST, PU_HORN, PU_LIFEBUOY, PU_MICI, PU_OIL, PU_PROTEIN, PU_SODA, PU_SPRINGS, PU_TUICA } from '@masinute/shared';
import { painted, solid, type Paint } from './paint';

// One small low-poly model per power-up kind, after the 2D icons (powerupTextures.ts), so they read
// by shape and not only by color. Each is one merged vertex-colored geometry, about 24 units across,
// centered on the origin and facing +z (they spin around y while floating).

const CHROME = 0xdfe6ee;
const DARK = 0x2a2236;
const CREAM = 0xf4efe6;

/** A band around the y axis: an open cylinder a hair wider than what it wraps. */
const band = (r: number, h: number, seg: number, color: number, y: number) =>
  painted(new THREE.CylinderGeometry(r, r, h, seg, 1, true), solid(color)).translate(0, y, 0);

/** Two chrome lorry air horns on a yellow mount. */
function horn(): THREE.BufferGeometry[] {
  const parts: THREE.BufferGeometry[] = [];
  for (const z of [-4.5, 4.5]) {
    // Wide end (radiusTop) turned to +x; its cap is the dark mouth.
    const bell: Paint = (x) => (x > 8.5 ? DARK : CHROME);
    parts.push(painted(new THREE.CylinderGeometry(5, 1.8, 18, 10).rotateZ(-Math.PI / 2), bell).translate(2, 2, z));
  }
  parts.push(painted(new THREE.BoxGeometry(8, 4, 16), solid(0xffd166)).translate(-9, -3, 0));
  parts.push(painted(new THREE.BoxGeometry(3, 8, 3), solid(0x8c8296)).translate(-9, -8, 0));
  return parts;
}

/** Two grilled mici with grill marks and a dollop of mustard on a plate. */
function mici(): THREE.BufferGeometry[] {
  const grilled: Paint = (x) => (Math.floor((x + 12) / 3) % 2 === 0 ? 0x5a2e18 : 0x9a5530);
  return [
    painted(new THREE.CylinderGeometry(13, 10, 2, 14), solid(CREAM)).translate(0, -5, 0),
    painted(new THREE.CapsuleGeometry(3.2, 12, 3, 8).rotateZ(Math.PI / 2), grilled).translate(0, -1, -3.8),
    painted(new THREE.CapsuleGeometry(3.2, 12, 3, 8).rotateZ(Math.PI / 2), grilled).translate(1, -1, 3.8),
    painted(new THREE.SphereGeometry(3, 8, 5).scale(1, 0.6, 1), solid(0xf2c12e)).translate(-2, -3, 9.5),
  ];
}

/** A red and white lifebuoy, upright. */
function lifebuoy(): THREE.BufferGeometry[] {
  const quarters: Paint = (x, y) => (Math.floor(((Math.atan2(y, x) / (2 * Math.PI) + 1) % 1) * 8) % 2 === 0 ? 0xe63946 : 0xf8f4ee);
  return [painted(new THREE.TorusGeometry(9, 3.8, 8, 16), quarters)];
}

/** A glossy black oil drop over a purple puddle. */
function oil(): THREE.BufferGeometry[] {
  const glossy: Paint = (x, y, z) => (x < -3 && y > 2 && z > 2 ? 0x4a3d5e : 0x1b1424);
  return [
    painted(new THREE.CylinderGeometry(12, 12, 1, 16), solid(0x9b7bd8)).translate(0, -8, 0),
    painted(new THREE.SphereGeometry(7, 12, 8), glossy),
    painted(new THREE.ConeGeometry(5, 9, 12), solid(0x1b1424)).translate(0, 4.9 + 4.5, 0),
  ].map((g) => g.translate(0, -2, 0));
}

/** A small bottle of plum brandy: purple glass, a cream label with a plum, a cork. */
function tuica(): THREE.BufferGeometry[] {
  return [
    painted(new THREE.CylinderGeometry(5.5, 5.5, 13, 10), solid(0x6b3fa0)).translate(0, -4, 0),
    band(5.7, 6, 10, CREAM, -4.5),
    painted(new THREE.SphereGeometry(1.8, 6, 4), solid(0x3d1f6b)).translate(0, -4.5, 5.8),
    painted(new THREE.ConeGeometry(1.4, 3, 4).rotateZ(-0.6), solid(0x3ddc97)).translate(1.2, -2.2, 5.8),
    painted(new THREE.CylinderGeometry(2, 5.5, 4, 10), solid(0x6b3fa0)).translate(0, 4.5, 0),
    painted(new THREE.CylinderGeometry(2, 2, 4, 8), solid(0x6b3fa0)).translate(0, 8.5, 0),
    painted(new THREE.CylinderGeometry(2.3, 2.1, 3, 8), solid(0xc49a6c)).translate(0, 11.5, 0),
  ];
}

class Helix extends THREE.Curve<THREE.Vector3> {
  constructor(
    private readonly r: number,
    private readonly h: number,
    private readonly turns: number,
  ) {
    super();
  }
  override getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const a = t * this.turns * Math.PI * 2;
    return target.set(Math.cos(a) * this.r, (t - 0.5) * this.h, Math.sin(a) * this.r);
  }
}

/** A red bumper bar on a big cyan coil spring. */
function springs(): THREE.BufferGeometry[] {
  return [
    painted(new THREE.CylinderGeometry(6.5, 6.5, 2, 10), solid(0x5a4a6a)).translate(0, -10, 0),
    painted(new THREE.TubeGeometry(new Helix(5.5, 14, 4), 64, 1.4, 5), solid(0x4cc9f0)).translate(0, -2, 0),
    painted(new THREE.BoxGeometry(24, 4.5, 6), solid(0xe63946)).translate(0, 7, 0),
    painted(new THREE.BoxGeometry(3, 5, 6.6), solid(DARK)).translate(-11, 7, 0),
    painted(new THREE.BoxGeometry(3, 5, 6.6), solid(DARK)).translate(11, 7, 0),
  ];
}

/** A plain green soda can with a white band, silver rims and a tab. */
function soda(): THREE.BufferGeometry[] {
  return [
    painted(new THREE.CylinderGeometry(6, 6, 15, 12), solid(0x3ddc97)),
    band(6.15, 4, 12, CREAM, 0),
    painted(new THREE.CylinderGeometry(5, 6, 1.5, 12), solid(CHROME)).translate(0, 8.25, 0),
    painted(new THREE.CylinderGeometry(6, 5, 1.5, 12), solid(CHROME)).translate(0, -8.25, 0),
    painted(new THREE.BoxGeometry(2, 0.8, 3.5), solid(0xb8c0ca)).translate(1.5, 9.3, 0),
  ];
}

/** A big pink tub of powder with a white lid and a flexed biceps on a dark label. */
function protein(): THREE.BufferGeometry[] {
  return [
    painted(new THREE.CylinderGeometry(8, 8, 13, 12), solid(0xff7b9c)).translate(0, -3, 0),
    band(8.15, 6, 12, DARK, -3),
    painted(new THREE.SphereGeometry(2.6, 8, 5).scale(1, 1, 0.5), solid(0xffd1a8)).translate(0.8, -2.4, 8.1),
    painted(new THREE.BoxGeometry(1.6, 4, 1), solid(0xffd1a8)).translate(-1.6, -3.4, 8.2),
    painted(new THREE.CylinderGeometry(8.6, 8.6, 4, 12), solid(0xf8f4ee)).translate(0, 5.5, 0),
  ];
}

/** A little sheet ghost with a wavy hem and two dark eyes. */
function ghost(): THREE.BufferGeometry[] {
  const body = new THREE.CylinderGeometry(8, 9, 11, 14, 2, true);
  const pos = body.attributes.position!;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) < -5) pos.setY(i, pos.getY(i) + Math.sin(Math.atan2(pos.getZ(i), pos.getX(i)) * 7) * 1.8);
  }
  return [
    painted(new THREE.SphereGeometry(8, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2), solid(0xf2f5ff)).translate(0, 3, 0),
    painted(body, solid(0xf2f5ff)).translate(0, -2.5, 0),
    painted(new THREE.SphereGeometry(1.5, 6, 4).scale(1, 1.4, 0.6), solid(DARK)).translate(-2.8, 3.5, 7.4),
    painted(new THREE.SphereGeometry(1.5, 6, 4).scale(1, 1.4, 0.6), solid(DARK)).translate(2.8, 3.5, 7.4),
  ];
}

const BUILDERS: Record<number, () => THREE.BufferGeometry[]> = {
  [PU_HORN]: horn,
  [PU_MICI]: mici,
  [PU_LIFEBUOY]: lifebuoy,
  [PU_OIL]: oil,
  [PU_TUICA]: tuica,
  [PU_SPRINGS]: springs,
  [PU_SODA]: soda,
  [PU_PROTEIN]: protein,
  [PU_GHOST]: ghost,
};

/** One merged geometry per power-up kind (kinds without a model are left out). */
export function powerupModels(): Map<number, THREE.BufferGeometry> {
  const models = new Map<number, THREE.BufferGeometry>();
  for (const [kind, build] of Object.entries(BUILDERS)) {
    const parts = build();
    models.set(Number(kind), mergeGeometries(parts)!);
    for (const p of parts) p.dispose();
  }
  return models;
}
