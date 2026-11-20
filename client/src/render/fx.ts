import Phaser from 'phaser';
import { reducedEffects } from '../settings';
import { DEPTH } from './layout';
import { TEX } from './textures';

// Particle effects with a global cap: bursts share one budget, so a pile-up of six cars never
// spawns thousands of particles. With "Efecte reduse" every burst is smaller and the budget lower.

const MAX_PARTICLES = 360;
const REDUCED_PARTICLES = 100;
const REDUCED_FACTOR = 0.35;

let live = 0;

export interface BurstOptions {
  count: number;
  lifespanMs: number;
  depth?: number;
  config: Phaser.Types.GameObjects.Particles.ParticleEmitterConfig;
}

/** A one-shot burst, trimmed to what the budget allows. */
export function burst(scene: Phaser.Scene, x: number, y: number, opts: BurstOptions): void {
  const cap = reducedEffects() ? REDUCED_PARTICLES : MAX_PARTICLES;
  const wanted = Math.ceil(opts.count * (reducedEffects() ? REDUCED_FACTOR : 1));
  const count = Math.min(wanted, cap - live);
  if (count <= 0) return;
  live += count;
  const emitter = scene.add
    .particles(x, y, TEX.spark, { ...opts.config, lifespan: opts.config.lifespan ?? opts.lifespanMs, emitting: false })
    .setDepth(opts.depth ?? DEPTH.fx);
  emitter.explode(count);
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    live -= count;
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, release);
    emitter.destroy();
  };
  scene.time.delayedCall(opts.lifespanMs, release);
  // A scene that stops early must still hand the particles back.
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, release);
}

/** Sparks flying off the metal where two cars hit; `strength` 1 = a light bump, ~4 = a boosted ram. */
export function bumpSparks(scene: Phaser.Scene, x: number, y: number, strength: number): void {
  const s = Phaser.Math.Clamp(strength, 1, 5);
  burst(scene, x, y, {
    count: Math.round(8 + 10 * s),
    lifespanMs: 520,
    config: {
      speed: { min: 60, max: 120 + 60 * s },
      lifespan: { min: 180, max: 520 },
      scale: { start: 0.9, end: 0 },
      tint: [0xffffff, 0xfff2a8, 0xffc04d, 0xff8a3d],
      blendMode: Phaser.BlendModes.ADD,
    },
  });
}

/** A soft puff behind a car that just boosted. */
export function boostPuff(scene: Phaser.Scene, x: number, y: number, angle: number): void {
  const deg = Phaser.Math.RadToDeg(angle + Math.PI);
  burst(scene, x, y, {
    count: 14,
    lifespanMs: 450,
    depth: DEPTH.marks,
    config: {
      angle: { min: deg - 25, max: deg + 25 },
      speed: { min: 60, max: 160 },
      scale: { start: 1.6, end: 0 },
      alpha: { start: 0.7, end: 0 },
      tint: [0x9fe7ff, 0xffffff, 0x6fb7ff],
      blendMode: Phaser.BlendModes.ADD,
    },
  });
}

/** A ring of sparks where a car left the arena. */
export function outBurst(scene: Phaser.Scene, x: number, y: number, color: number): void {
  burst(scene, x, y, {
    count: 30,
    lifespanMs: 800,
    config: {
      speed: { min: 40, max: 200 },
      lifespan: { min: 400, max: 800 },
      scale: { start: 1.2, end: 0 },
      tint: [color, color, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    },
  });
}

/** Claxon de TIR: a ring of air rushing out to `radius` pixels (reduced effects: one faint ring). */
export function shockwave(scene: Phaser.Scene, x: number, y: number, radius: number, color: number): void {
  const reduced = reducedEffects();
  const rings = reduced ? 1 : 3;
  for (let i = 0; i < rings; i++) {
    const g = scene.add.graphics().setDepth(DEPTH.fx);
    const wave = { r: 10, a: reduced ? 0.45 : 0.9 };
    scene.tweens.add({
      targets: wave,
      r: radius,
      a: 0,
      delay: i * 90,
      duration: 420,
      ease: 'Quad.easeOut',
      onUpdate: () => {
        g.clear();
        g.lineStyle(reduced ? 3 : 6 - i * 1.5, color, wave.a);
        g.strokeCircle(x, y, wave.r);
      },
      onComplete: () => g.destroy(),
    });
  }
}

/** A few glints where a power-up appears or is picked up. */
export function powerupSparkle(scene: Phaser.Scene, x: number, y: number, color: number): void {
  burst(scene, x, y, {
    count: 14,
    lifespanMs: 500,
    config: {
      speed: { min: 30, max: 110 },
      scale: { start: 1, end: 0 },
      tint: [color, 0xffffff],
      blendMode: Phaser.BlendModes.ADD,
    },
  });
}
