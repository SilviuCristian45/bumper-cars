import * as THREE from 'three';
import { RING_RADIUS } from '@masinute/shared';
import type { Quality } from './options';
import { diamondPlate } from './textures';
import { CEILING_Y, PLATFORM_DEPTH, toWorld } from './world';

const R = toWorld(RING_RADIUS);
const RIM_TUBE = 9;
const BULB_COLORS = [0xffd166, 0xff4d6d, 0x4cc9f0, 0x95f9a5, 0xffa8f0];

/**
 * The ring: a steel platform with a rubber rim, chasing bulbs on the rim (unlit instanced spheres,
 * no real lights), the ceiling net the antennas touch, and the lost floor once the ring shrinks.
 */
export class Arena {
  readonly group = new THREE.Group();
  private readonly liveFloor: THREE.Mesh;
  private readonly plate: THREE.Texture;
  private lastRadius = -1;
  private readonly edge: THREE.Mesh;
  private readonly bulbs: THREE.InstancedMesh;
  private readonly bulbCount: number;
  private readonly net: THREE.LineSegments;
  private readonly color = new THREE.Color();
  private bulbClock = 0;
  private lastBulbStep = -1;

  constructor(quality: Quality) {
    const high = quality === 'high';
    const segments = high ? 96 : 56;

    // Platform: dark (lost) floor on top, the live floor disk sits just above it.
    const platform = new THREE.Mesh(
      new THREE.CylinderGeometry(R + RIM_TUBE, R + RIM_TUBE + 4, PLATFORM_DEPTH, segments, 1),
      [
        new THREE.MeshLambertMaterial({ color: 0x2a1838 }), // side
        new THREE.MeshLambertMaterial({ color: 0x1b1024 }), // top: the lost floor
        new THREE.MeshLambertMaterial({ color: 0x1b1024 }),
      ],
    );
    platform.position.y = -PLATFORM_DEPTH / 2;
    platform.receiveShadow = high;
    this.group.add(platform);

    const plate = diamondPlate(high ? 256 : 128);
    this.plate = plate;
    plate.anisotropy = high ? 4 : 1;
    const floorMat = high
      ? new THREE.MeshStandardMaterial({ map: plate, metalness: 0.55, roughness: 0.45, color: 0xcfcbe0 })
      : new THREE.MeshLambertMaterial({ map: plate, color: 0xcfcbe0 });
    this.liveFloor = new THREE.Mesh(new THREE.CircleGeometry(1, segments), floorMat);
    this.liveFloor.rotation.x = -Math.PI / 2;
    this.liveFloor.position.y = 0.2;
    this.liveFloor.scale.setScalar(R);
    this.liveFloor.receiveShadow = high;
    this.group.add(this.liveFloor);

    // Red line at the edge of the shrinking ring.
    this.edge = new THREE.Mesh(
      new THREE.RingGeometry(0.985, 1, segments),
      new THREE.MeshBasicMaterial({ color: 0xff3355, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    this.edge.rotation.x = -Math.PI / 2;
    this.edge.position.y = 0.5;
    this.edge.visible = false;
    this.group.add(this.edge);

    // Rubber rim.
    const rim = new THREE.Mesh(
      new THREE.TorusGeometry(R + RIM_TUBE, RIM_TUBE, high ? 10 : 6, segments),
      high ? new THREE.MeshStandardMaterial({ color: 0x2b2233, roughness: 0.9 }) : new THREE.MeshLambertMaterial({ color: 0x2b2233 }),
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.y = RIM_TUBE * 0.6;
    rim.castShadow = high;
    this.group.add(rim);

    // Bulbs on top of the rim.
    this.bulbCount = high ? 64 : 28;
    this.bulbs = new THREE.InstancedMesh(
      new THREE.SphereGeometry(high ? 3.4 : 4, high ? 10 : 6, high ? 8 : 4),
      new THREE.MeshBasicMaterial({ color: 0xffffff }),
      this.bulbCount,
    );
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.bulbCount; i++) {
      const a = (i / this.bulbCount) * Math.PI * 2;
      m.makeTranslation(Math.cos(a) * (R + RIM_TUBE), RIM_TUBE * 1.6 + 2, Math.sin(a) * (R + RIM_TUBE));
      this.bulbs.setMatrixAt(i, m);
      this.bulbs.setColorAt(i, this.color.setHex(BULB_COLORS[i % BULB_COLORS.length]!));
    }
    this.group.add(this.bulbs);

    this.net = ceilingNet(R + 40, high ? 30 : 45);
    this.group.add(this.net);
    this.group.add(ground());
  }

  /** Seen from above (tilted camera) the net would read as a grid on the floor: barely there; clear from below (chase). */
  setNetFromBelow(below: boolean): void {
    (this.net.material as THREE.LineBasicMaterial).opacity = below ? 0.3 : 0.06;
  }

  update(dt: number, ringRadius: number): void {
    const r = toWorld(ringRadius);
    if (r !== this.lastRadius) {
      this.lastRadius = r;
      this.liveFloor.scale.setScalar(r);
      // The disk's UVs span its diameter: keep one plate tile 48 units wide and fixed in the world as it shrinks.
      this.plate.repeat.set(r / 24, r / 24);
      this.plate.offset.set(-r / 48, -r / 48);
      this.edge.visible = r < R - 0.5;
      if (this.edge.visible) this.edge.scale.setScalar(r);
    }

    // Chasing bulbs: every third one bright, stepping 6 times a second (only a color update).
    this.bulbClock += dt;
    const step = Math.floor(this.bulbClock * 6);
    if (step === this.lastBulbStep) return;
    this.lastBulbStep = step;
    for (let i = 0; i < this.bulbCount; i++) {
      const on = (i + step) % 3 === 0;
      this.color.setHex(BULB_COLORS[i % BULB_COLORS.length]!);
      if (!on) this.color.multiplyScalar(0.28);
      this.bulbs.setColorAt(i, this.color);
    }
    this.bulbs.instanceColor!.needsUpdate = true;
  }
}

/** Square grid of thin lines over the ring, at the height the antennas reach, with a frame. */
function ceilingNet(half: number, spacing: number): THREE.LineSegments {
  const pts: number[] = [];
  for (let v = -half; v <= half + 0.01; v += spacing) {
    pts.push(-half, CEILING_Y, v, half, CEILING_Y, v);
    pts.push(v, CEILING_Y, -half, v, CEILING_Y, half);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return new THREE.LineSegments(
    geom,
    new THREE.LineBasicMaterial({ color: 0xb8a6e0, transparent: true, opacity: 0.22, depthWrite: false }),
  );
}

/** The fairground far below the platform (where fallen cars disappear into the fog). */
function ground(): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CircleGeometry(2400, 24), new THREE.MeshBasicMaterial({ color: 0x150b22 }));
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -160;
  return mesh;
}
