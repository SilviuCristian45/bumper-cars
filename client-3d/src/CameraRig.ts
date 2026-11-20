import * as THREE from 'three';
import { ANGLE_STEPS, RING_RADIUS } from '@masinute/shared';
import { angleDelta, ease, toWorld } from './world';

export type CameraMode = 'tilted' | 'chase';

/** Looking down at the floor this far below the horizon (tilted camera). */
const TILT = (50 * Math.PI) / 180;
/** How far toward the own car the tilted camera looks (0 = ring center, 1 = the car). */
const FOLLOW = 0.45;
/** Half the width of floor the tilted camera keeps in view around its target. */
const VIEW_HALF_WIDTH = 330;
const CHASE_BACK = 150;
const CHASE_UP = 92;
const CHASE_AHEAD = 140;
const SHAKE_DECAY = 7;

const R = toWorld(RING_RADIUS);

/**
 * Tilted camera (~50°) that glides after the own car, the ring always in mind; or a chase camera behind
 * the car (C). Camera shake is an offset that decays.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;
  mode: CameraMode = 'tilted';
  private readonly target = new THREE.Vector3();
  private readonly look = new THREE.Vector3();
  private readonly goal = new THREE.Vector3();
  private yaw = 0;
  private shake = 0;
  private time = 0;
  private snapped = false;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(45, aspect, 5, 4000);
  }

  toggle(): void {
    this.mode = this.mode === 'tilted' ? 'chase' : 'tilted';
    this.snapped = false;
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  addShake(amount: number): void {
    this.shake = Math.min(1, Math.max(this.shake, amount));
  }

  /**
   * Heading (angle steps) the joystick should treat as the car's direction on screen: the tilted camera
   * never turns (screen up = sim -y, as in 2D), the chase camera always shows the car pointing up.
   */
  screenHeading(carHeading: number): number {
    return this.mode === 'chase' ? (ANGLE_STEPS * 3) / 4 : carHeading;
  }

  /** car: the own car's position and yaw, or null (out, or watching). */
  update(dt: number, car: { x: number; z: number; yaw: number } | null): void {
    this.time += dt;
    const k = this.snapped ? ease(this.mode === 'chase' ? 7 : 3, dt) : 1;
    this.snapped = true;
    const cam = this.camera;

    if (this.mode === 'chase' && car) {
      this.yaw += angleDelta(this.yaw, car.yaw) * k;
      const fx = Math.cos(this.yaw);
      const fz = -Math.sin(this.yaw);
      this.target.lerp(this.goal.set(car.x, 0, car.z), k);
      cam.position.set(this.target.x - fx * CHASE_BACK, CHASE_UP, this.target.z - fz * CHASE_BACK);
      this.look.set(this.target.x + fx * CHASE_AHEAD, 8, this.target.z + fz * CHASE_AHEAD);
    } else {
      // Far enough to keep VIEW_HALF_WIDTH of floor across the screen (more in portrait), never so close
      // that the ring feels cramped.
      const hfov = 2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(cam.fov / 2)) * cam.aspect);
      const dist = Math.min(1400, Math.max(720, VIEW_HALF_WIDTH / Math.tan(hfov / 2)));
      const tx = car ? car.x * FOLLOW : 0;
      const tz = car ? car.z * FOLLOW : 0;
      this.target.lerp(this.goal.set(tx, 0, tz), k);
      // Tilted camera: no turning; the near edge of the ring stays in view.
      this.target.z = Math.min(this.target.z, R * 0.5);
      cam.position.set(this.target.x, Math.sin(TILT) * dist, this.target.z + Math.cos(TILT) * dist);
      this.look.copy(this.target);
      this.yaw = car ? car.yaw : this.yaw;
    }

    if (this.shake > 0.001) {
      const s = this.shake * this.shake * 9;
      cam.position.x += Math.sin(this.time * 71) * s;
      cam.position.y += Math.sin(this.time * 59 + 1) * s;
      cam.position.z += Math.sin(this.time * 83 + 2) * s;
      this.shake *= Math.exp(-SHAKE_DECAY * dt);
    }
    cam.lookAt(this.look);
  }
}
