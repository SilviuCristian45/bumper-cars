import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MAX_SPEED, PLAYER_COLORS, RING_RADIUS, type PlayerState } from '@masinute/shared';
import type { Pose } from '@client/net/view';
import type { Quality } from './settings3d';
import { ease, headingToYaw, LOST_DROP, speedToWorld, toWorld } from './coords';
import { driverOf, driverParts } from './drivers';

/** Where the antenna leaves the car, in the car's own frame (x forward, z to the right, unscaled). */
export const ANTENNA_BASE = new THREE.Vector3(-14, 36, 0);

const RUBBER = 0x1d1a22;
const SEAT = 0x2a1630;
const SKIN = 0xf2c79b;
const HOP_GRAVITY = 700;
const FALL_GRAVITY = 900;
/** After this long the fallen car is out of sight (fog) and hidden. */
const FALL_SECONDS = 1.4;
/** In the lost floor: a moment on it, then sinking through (world units per second). */
const SINK_DELAY = 0.45;
const SINK_SPEED = 70;
/** Leaning into a turn at full steer and full speed, radians. */
const MAX_LEAN = 0.2;

/**
 * One low-poly bumper car merged into a single geometry with vertex colors (one draw call):
 * rubber bumper, body in the player's color, hood, seat, driver, antenna mount. Faces +x.
 * `driver` (see drivers.ts) puts a character in the seat instead of the plain driver (0).
 */
export function carGeometry(color: number, quality: Quality, driver = 0): THREE.BufferGeometry {
  const custom = driverParts(driver);
  const seg = quality === 'high' ? 20 : 12;
  const body = new THREE.Color(color);
  const hood = body.clone().lerp(new THREE.Color(0xffffff), 0.25);
  const torso = body.clone().multiplyScalar(0.6);
  const parts: [THREE.BufferGeometry, THREE.Color | number, number, number, number][] = [
    [new THREE.CylinderGeometry(22, 22, 8, seg), RUBBER, 0, 5, 0],
    [new THREE.CylinderGeometry(18.5, 20.5, 9, seg), body, 0, 13.5, 0],
    [new THREE.BoxGeometry(13, 5, 20), hood, 8.5, 20.5, 0],
    [new THREE.BoxGeometry(12, 3, 18), SEAT, -5, 19.5, 0],
    [new THREE.BoxGeometry(5, 13, 20), SEAT, -11, 24.5, 0],
    [new THREE.CylinderGeometry(1.8, 2.2, 7, 6), RUBBER, ANTENNA_BASE.x, ANTENNA_BASE.y - 3.5, 0],
  ];
  if (!custom) {
    parts.push(
      [new THREE.BoxGeometry(6, 8, 10), torso, -4, 23.5, 0],
      [new THREE.SphereGeometry(4.6, quality === 'high' ? 10 : 7, quality === 'high' ? 8 : 5), SKIN, -3.5, 30, 0],
    );
  }
  const c = new THREE.Color();
  const geoms = parts.map(([g, col, x, y, z]) => {
    g.translate(x, y, z);
    if (typeof col === 'number') c.setHex(col);
    else c.copy(col);
    const n = g.attributes.position!.count;
    const colors = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) colors.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.deleteAttribute('uv');
    if (!custom) return g;
    // The drivers' pieces are non-indexed (a color per triangle): merge like with like.
    const flat = g.toNonIndexed();
    g.dispose();
    return flat;
  });
  if (custom) geoms.push(...custom);
  const merged = mergeGeometries(geoms)!;
  for (const g of geoms) g.dispose();
  return merged;
}

interface Fall {
  t: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  spin: THREE.Vector3;
  /** When it landed in the lost floor (ring shrunk under it), -1 while falling. */
  landedAt: number;
}

/** A car on screen: follows the blended pose, leans in turns, hops when hit, falls off the edge when out. */
export class CarView {
  /** Position and heading. */
  readonly root = new THREE.Group();
  /** Lean, pitch, hop and size (the antenna and the shadow are drawn by CarLayer). */
  readonly body = new THREE.Group();
  readonly material: THREE.MeshLambertMaterial | THREE.MeshStandardMaterial;
  readonly color: number;
  private readonly mesh: THREE.Mesh;
  private lean = 0;
  private pitch = 0;
  private hop = 0;
  private hopV = 0;
  private fall: Fall | null = null;
  private wasAlive = true;
  /** Fully hidden: fallen out of sight, or someone else's Fantomă. */
  hidden = false;
  /** 1 normally, less while see-through (own Fantomă). */
  opacity = 1;
  scale = 1;

  constructor(p: Readonly<PlayerState>, quality: Quality) {
    this.color = PLAYER_COLORS[p.slot % PLAYER_COLORS.length]!;
    this.material =
      quality === 'high'
        ? new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.15 })
        : new THREE.MeshLambertMaterial({ vertexColors: true });
    this.mesh = new THREE.Mesh(carGeometry(this.color, quality, driverOf(p)), this.material);
    this.mesh.castShadow = quality === 'high';
    this.body.add(this.mesh);
    this.root.add(this.body);
    this.root.rotation.order = 'YXZ';
    this.body.rotation.order = 'YXZ';
    this.wasAlive = p.alive;
  }

  get falling(): boolean {
    return this.fall !== null;
  }

  /** A hit: the car jumps a little, more for harder hits. */
  bump(strength: number): void {
    if (this.fall) return;
    this.hopV = Math.max(this.hopV, Math.min(120, 25 + strength * 90));
  }

  update(p: Readonly<PlayerState>, pose: Pose | undefined, dt: number): void {
    if (p.alive && !this.wasAlive) this.fall = null; // new round
    if (!p.alive && this.wasAlive) this.startFall(p, pose);
    this.wasAlive = p.alive;

    if (this.fall) {
      this.updateFall(dt);
      return;
    }
    this.hidden = !p.alive;
    if (pose) {
      this.root.position.set(toWorld(pose.x), 0, toWorld(pose.y));
      this.root.rotation.set(0, headingToYaw(pose.heading), 0);
    }

    // Lean out of the turn (to the left when steering right), nose up while boosting, dip when braking.
    const speed = Math.hypot(p.vx, p.vy);
    const speedFactor = Math.min(1, speed / MAX_SPEED);
    const leanTarget = -(p.steer / 100) * speedFactor * MAX_LEAN;
    const pitchTarget = p.boostTicks > 0 ? 0.12 : p.throttle < 0 && speed > 300 ? -0.07 : 0;
    this.lean += (leanTarget - this.lean) * ease(10, dt);
    this.pitch += (pitchTarget - this.pitch) * ease(8, dt);

    if (this.hop > 0 || this.hopV > 0) {
      this.hopV -= HOP_GRAVITY * dt;
      this.hop += this.hopV * dt;
      if (this.hop <= 0) {
        this.hop = 0;
        this.hopV = 0;
      }
    }
    this.scale = p.sizePct / 100;
    this.body.position.y = this.hop;
    this.body.rotation.set(0, 0, this.pitch);
    this.body.rotation.x = this.lean + Math.sin(this.hop * 0.15) * 0.06;
    this.body.scale.setScalar(this.scale);
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }

  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return;
    const wasTransparent = this.opacity < 1;
    this.opacity = opacity;
    this.material.opacity = opacity;
    if (wasTransparent !== opacity < 1) {
      this.material.transparent = opacity < 1;
      this.material.needsUpdate = true;
    }
  }

  private startFall(p: Readonly<PlayerState>, pose: Pose | undefined): void {
    const x = pose ? toWorld(pose.x) : this.root.position.x;
    const z = pose ? toWorld(pose.y) : this.root.position.z;
    let vx = speedToWorld(p.vx);
    let vz = speedToWorld(p.vy);
    // Always drift outward a bit, so the car clears the rim instead of dropping onto it.
    const r = Math.hypot(x, z) || 1;
    const out = (vx * x + vz * z) / r;
    if (out < 90) {
      vx += ((90 - out) * x) / r;
      vz += ((90 - out) * z) / r;
    }
    const spin = new THREE.Vector3(vz, 0, -vx).normalize().multiplyScalar(4);
    this.fall = { t: 0, x, y: this.hop, z, vx, vy: 40, vz, spin, landedAt: -1 };
  }

  private updateFall(dt: number): void {
    const f = this.fall!;
    f.t += dt;
    f.x += f.vx * dt;
    f.z += f.vz * dt;
    // Rolls on the floor until past the platform's edge, then drops.
    const r = Math.hypot(f.x, f.z);
    const onPlatform = r < toWorld(RING_RADIUS) && f.y >= 0 && f.t < 0.15;
    if (f.landedAt < 0 && !onPlatform) {
      f.vy -= FALL_GRAVITY * dt;
      f.y += f.vy * dt;
      this.body.rotation.x += f.spin.x * dt;
      this.body.rotation.z += f.spin.z * dt;
      // Out because the ring shrank: the car drops into the lost floor's trench instead of the void...
      if (r < toWorld(RING_RADIUS) - 2 && f.y <= -LOST_DROP) {
        f.y = -LOST_DROP;
        f.landedAt = f.t;
      }
    }
    if (f.landedAt >= 0) {
      // ...skids to a stop there and sinks through it.
      const k = Math.exp(-4 * dt);
      f.vx *= k;
      f.vz *= k;
      const sinking = f.t - f.landedAt - SINK_DELAY;
      if (sinking > 0) f.y = -LOST_DROP - sinking * SINK_SPEED;
    }
    this.root.position.set(f.x, f.y, f.z);
    this.body.position.y = 0;
    this.hidden = f.t > FALL_SECONDS;
  }
}
