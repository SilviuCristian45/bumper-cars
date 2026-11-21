import * as THREE from 'three';

const HIDDEN_Y = -10000;

/** Additive glowing dots in one draw call; each dot is placed by hand every frame (antenna sparks, boost flames). */
export class GlowPoints {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;

  constructor(count: number, color: number, size: number, texture: THREE.Texture) {
    this.pos = new Float32Array(count * 3).fill(HIDDEN_Y);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ color, size, map: texture, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.points.frustumCulled = false;
  }

  set(i: number, x: number, y: number, z: number): void {
    this.pos[i * 3] = x;
    this.pos[i * 3 + 1] = y;
    this.pos[i * 3 + 2] = z;
  }

  hide(i: number): void {
    this.pos[i * 3 + 1] = HIDDEN_Y;
  }

  commit(): void {
    this.points.geometry.attributes.position!.needsUpdate = true;
  }
}

interface Particle {
  life: number;
  vx: number;
  vy: number;
  vz: number;
}

const GRAVITY = 520;

/** Collision sparks: a fixed pool of particles flying out of the contact point and falling. */
export class SparkBursts {
  private readonly glow: GlowPoints;
  private readonly parts: Particle[] = [];
  private readonly xyz: Float32Array;
  private next = 0;
  private live = 0;

  constructor(
    private readonly max: number,
    texture: THREE.Texture,
  ) {
    this.glow = new GlowPoints(max, 0xffd27a, 7, texture);
    this.xyz = new Float32Array(max * 3);
    for (let i = 0; i < max; i++) this.parts.push({ life: 0, vx: 0, vy: 0, vz: 0 });
  }

  get object(): THREE.Object3D {
    return this.glow.points;
  }

  /** `count` sparks at (x, y, z), faster for stronger hits. */
  burst(x: number, y: number, z: number, count: number, speed: number): void {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const p = this.parts[i]!;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      p.life = 0.35 + Math.random() * 0.35;
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = 60 + Math.random() * speed * 0.8;
      this.xyz[i * 3] = x;
      this.xyz[i * 3 + 1] = y;
      this.xyz[i * 3 + 2] = z;
    }
    this.live = this.max;
  }

  update(dt: number): void {
    if (this.live === 0) return;
    let alive = 0;
    for (let i = 0; i < this.max; i++) {
      const p = this.parts[i]!;
      if (p.life <= 0) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.glow.hide(i);
        continue;
      }
      alive++;
      p.vy -= GRAVITY * dt;
      this.xyz[i * 3] += p.vx * dt;
      this.xyz[i * 3 + 1] = Math.max(0.5, this.xyz[i * 3 + 1] + p.vy * dt);
      this.xyz[i * 3 + 2] += p.vz * dt;
      this.glow.set(i, this.xyz[i * 3], this.xyz[i * 3 + 1], this.xyz[i * 3 + 2]);
    }
    this.glow.commit();
    this.live = alive;
  }
}
