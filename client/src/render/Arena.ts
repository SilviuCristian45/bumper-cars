import Phaser from 'phaser';
import { reducedEffects } from '../settings';
import { ARENA_CX, ARENA_CY, ARENA_R, DEPTH, RIM_W } from './layout';
import { TEX } from './textures';

// The ring: metal floor, rubber rim, a chain of colored bulbs that chase around it, and the
// shrinking edge (the floor outside the current ring darkens, the edge glows red).

const BULBS = 60;
const BULB_COLORS = [0xff4d6d, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xc77dff];
const CHASE_MS = 110;

export class Arena {
  private readonly bulbs: Phaser.GameObjects.Image[] = [];
  private readonly shrink: Phaser.GameObjects.Graphics;
  private chaseStep = -1;

  constructor(scene: Phaser.Scene) {
    scene.add.image(ARENA_CX, ARENA_CY, TEX.floor).setDepth(DEPTH.floor);
    scene.add.image(ARENA_CX, ARENA_CY, TEX.rim).setDepth(DEPTH.floor);
    this.shrink = scene.add.graphics().setDepth(DEPTH.shrink);
    const r = ARENA_R + RIM_W / 2;
    for (let i = 0; i < BULBS; i++) {
      const a = (i / BULBS) * Math.PI * 2;
      this.bulbs.push(
        scene.add
          .image(ARENA_CX + Math.cos(a) * r, ARENA_CY + Math.sin(a) * r, TEX.bulb)
          .setTint(BULB_COLORS[i % BULB_COLORS.length]!)
          .setBlendMode(Phaser.BlendModes.ADD)
          .setDepth(DEPTH.lights),
      );
    }
  }

  /** `ringPx`: current ring radius in pixels (interpolated). */
  update(time: number, ringPx: number): void {
    this.drawShrink(time, ringPx);
    const step = Math.floor(time / CHASE_MS);
    if (step === this.chaseStep) return;
    this.chaseStep = step;
    // A chase: every third bulb bright, moving around; reduced effects keep them steady.
    const still = reducedEffects();
    this.bulbs.forEach((bulb, i) => {
      const lit = still || (i + step) % 3 === 0;
      bulb.setAlpha(lit ? 1 : 0.35).setScale(lit ? 1.1 : 0.8);
    });
  }

  private drawShrink(time: number, ringPx: number): void {
    const g = this.shrink;
    g.clear();
    if (ringPx >= ARENA_R - 0.5) return;
    const lost = ARENA_R - ringPx;
    g.lineStyle(lost, 0x07040f, 0.72);
    g.strokeCircle(ARENA_CX, ARENA_CY, ringPx + lost / 2);
    const pulse = 0.55 + 0.45 * Math.sin(time / 120);
    g.lineStyle(4, 0xff4d6d, pulse);
    g.strokeCircle(ARENA_CX, ARENA_CY, ringPx);
    g.lineStyle(10, 0xff4d6d, 0.15 * pulse);
    g.strokeCircle(ARENA_CX, ARENA_CY, ringPx + 4);
  }
}
