import Phaser from 'phaser';
import { BOOST_COOLDOWN_TICKS, CAR_RADIUS, FP, PLAYER_COLORS, PU_GHOST, PU_SODA, TICK_RATE, effectDuration, type PlayerState } from '@masinute/shared';
import { reducedEffects } from '../settings';
import { sodaBubbles } from './fx';
import { DEPTH, FONT, TOUCH_LAYOUT } from './layout';
import { POWERUP_INFO } from './powerupInfo';
import { TEX } from './textures';

const CAR_R = CAR_RADIUS / FP;
/** The antenna pole's tip, behind the driver (pixels from the center, along the heading). */
const ANTENNA_BACK = CAR_R - 5;
const OUT_MS = 650;
/** Fantomă: the last stretch, during which it flickers for everyone (it is about to reappear). */
const GHOST_WARN_TICKS = TICK_RATE;
/** Others see a faint shimmer of an invisible ghost this often, for this long. */
const GHOST_SHIMMER_EVERY_MS = 1000;
const GHOST_SHIMMER_MS = 160;
const BUBBLE_EVERY_MS = 70;

/**
 * One car on screen: shadow, body, antenna spark, name tag; the local car also gets its boost ring.
 * Power-ups: a colored aura whose arc runs down with the effect's time, a spinning "?" over a car
 * whose steering Țuică turned around, cartoon arms on a giant, fizz behind a soda car, and a ghost
 * that is see-through on its own screen and invisible on the others' (bar a faint shimmer).
 */
export class CarView {
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly antenna: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly ring?: Phaser.GameObjects.Graphics;
  private readonly aura: Phaser.GameObjects.Graphics;
  private readonly dizzy: Phaser.GameObjects.Text;
  /** Over another player's car while they send no input (tab in the background, connection down). */
  private readonly sleepy: Phaser.GameObjects.Text;
  /** Pudră proteică: silly flexing arms, drawn in the car's frame. */
  private readonly muscles: Phaser.GameObjects.Graphics;
  private out = false;
  private lastBubble = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    p: Readonly<PlayerState>,
    private readonly local: boolean,
  ) {
    const color = PLAYER_COLORS[p.slot]!;
    this.shadow = scene.add.image(0, 0, TEX.shadow).setDepth(DEPTH.shadow).setScale(1.1);
    this.body = scene.add.image(0, 0, TEX.car(p.slot)).setDepth(DEPTH.car);
    this.antenna = scene.add
      .image(0, 0, TEX.bulb)
      .setTint(0xfff2a8)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(0.5)
      .setDepth(DEPTH.carTop);
    this.label = scene.add
      .text(0, 0, local ? 'TU' : p.name, {
        fontFamily: FONT,
        fontSize: `${(local ? 15 : 13) * (TOUCH_LAYOUT ? 1.6 : 1)}px`,
        fontStyle: 'bold',
        color: local ? '#ffe066' : '#' + color.toString(16).padStart(6, '0'),
        stroke: '#120a24',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 1)
      .setDepth(DEPTH.labels);
    if (local) this.ring = scene.add.graphics().setDepth(DEPTH.marks);
    this.aura = scene.add.graphics().setDepth(DEPTH.shadow);
    this.muscles = scene.add.graphics().setDepth(DEPTH.car);
    this.dizzy = scene.add
      .text(0, 0, '?', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#c77dff', stroke: '#120a24', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(DEPTH.labels)
      .setVisible(false);
    this.sleepy = scene.add
      .text(0, 0, 'zzz', { fontFamily: FONT, fontSize: '18px', fontStyle: 'bold', color: '#bde0fe', stroke: '#120a24', strokeThickness: 4 })
      .setOrigin(0, 1)
      .setDepth(DEPTH.labels)
      .setVisible(false);
  }

  /** Places the car at screen pixels with the heading in radians; `p` gives boost and cooldown. */
  setPose(x: number, y: number, angle: number, p: Readonly<PlayerState>, time: number): void {
    if (this.out) return;
    const size = p.sizePct / 100;
    const alpha = this.ghostAlpha(p, time);
    this.shadow.setPosition(x + 3, y + 5).setScale(1.1 * size).setAlpha(alpha);
    this.body.setPosition(x, y).setRotation(angle).setScale(size).setAlpha(alpha);
    // The pole's spark flickers like the real thing touching the ceiling grid.
    const flicker = Math.sin(time / 37 + p.slot * 1.7) * Math.sin(time / 53);
    this.antenna
      .setPosition(x - Math.cos(angle) * ANTENNA_BACK * size, y - Math.sin(angle) * ANTENNA_BACK * size)
      .setAlpha((p.boostTicks > 0 ? 1 : 0.55 + 0.45 * flicker) * alpha)
      .setScale(p.boostTicks > 0 ? 0.9 : 0.5);
    this.label.setPosition(x, y - CAR_R * size - 6).setAlpha(this.local ? 1 : alpha);
    if (this.ring) this.drawRing(x, y, p);
    this.drawAura(x, y, p, time, alpha);
    this.aura.setAlpha(alpha);
    this.drawMuscles(x, y, angle, size, time);
    this.muscles.setAlpha(alpha);
    if (p.effect === PU_SODA && p.effectTicks > 0 && time - this.lastBubble >= BUBBLE_EVERY_MS * (reducedEffects() ? 3 : 1)) {
      this.lastBubble = time;
      sodaBubbles(this.scene, x, y, angle);
    }
    this.drawSleepy(x, y, p, time);
    if (alpha === 0) this.sleepy.setVisible(false);
    const dizzy = p.confusedTicks > 0 && alpha > 0;
    this.dizzy.setVisible(dizzy);
    if (dizzy) {
      const spin = reducedEffects() ? 0 : time / 160;
      this.dizzy.setPosition(x + Math.cos(spin) * 10, y - CAR_R - 30 + Math.sin(spin) * 4).setRotation(reducedEffects() ? 0 : Math.sin(time / 120) * 0.5);
    }
  }

  setVisible(visible: boolean): void {
    for (const part of this.parts()) part.setVisible(visible);
  }

  /** Off the ring: spin, shrink and fade (it fell off the floor). */
  playOut(): void {
    if (this.out) return;
    this.out = true;
    this.ring?.clear();
    this.aura.clear();
    this.muscles.clear();
    this.dizzy.setVisible(false);
    this.sleepy.setVisible(false);
    this.scene.tweens.add({
      targets: [this.body, this.shadow, this.antenna],
      scale: 0.25,
      alpha: 0,
      angle: '+=360',
      duration: OUT_MS,
      ease: 'Quad.easeIn',
    });
    this.scene.tweens.add({ targets: this.label, alpha: 0, duration: OUT_MS });
  }

  /** Back on the floor for a new round. */
  reset(): void {
    this.out = false;
    for (const part of [this.body, this.shadow, this.antenna, this.label]) {
      this.scene.tweens.killTweensOf(part);
      part.setAlpha(1);
    }
    this.body.setScale(1);
    this.shadow.setScale(1.1);
    this.antenna.setScale(0.5);
    this.setVisible(true);
  }

  isOut(): boolean {
    return this.out;
  }

  destroy(): void {
    for (const part of this.parts()) part.destroy();
  }

  private parts(): (Phaser.GameObjects.Image | Phaser.GameObjects.Text | Phaser.GameObjects.Graphics)[] {
    return [this.shadow, this.body, this.antenna, this.label, this.aura, this.muscles, this.dizzy, this.sleepy, ...(this.ring ? [this.ring] : [])];
  }

  /**
   * Fantomă: half see-through on its own screen, invisible on the others' except a faint shimmer
   * about once a second; in its last second it flickers for everyone (it is about to reappear).
   */
  private ghostAlpha(p: Readonly<PlayerState>, time: number): number {
    if (p.effect !== PU_GHOST || p.effectTicks <= 0) return 1;
    if (p.effectTicks <= GHOST_WARN_TICKS) {
      const on = reducedEffects() ? true : Math.floor(time / 90) % 2 === 0;
      return on ? 0.65 : this.local ? 0.25 : 0.08;
    }
    if (this.local) return 0.4;
    const phase = (time + p.slot * 170) % GHOST_SHIMMER_EVERY_MS;
    return phase < GHOST_SHIMMER_MS ? 0.14 * Math.sin((phase / GHOST_SHIMMER_MS) * Math.PI) : 0;
  }

  /** Pudră proteică: two cartoon arms flexing out of the car's sides, growing with it. */
  private drawMuscles(x: number, y: number, angle: number, size: number, time: number): void {
    const g = this.muscles;
    g.clear();
    if (size <= 1.02) return;
    const grow = Math.min(1, (size - 1) / 0.7);
    const pump = reducedEffects() ? 1 : 1 + 0.08 * Math.sin(time / 110);
    const r = CAR_R * size;
    g.setPosition(x, y).setRotation(angle);
    for (const side of [-1, 1]) {
      // Upper arm out sideways, forearm bent forward, a fist, and a big round biceps.
      const sx = -r * 0.1;
      const sy = side * r * 0.82;
      const ex = sx + r * 0.05;
      const ey = side * (r + 16 * grow);
      const hx = ex + 20 * grow;
      const hy = ey - side * 6 * grow;
      g.lineStyle(11 * grow, 0x7a3b1d, 1);
      g.lineBetween(sx, sy, ex, ey);
      g.lineBetween(ex, ey, hx, hy);
      g.lineStyle(8 * grow, 0xf0a073, 1);
      g.lineBetween(sx, sy, ex, ey);
      g.lineBetween(ex, ey, hx, hy);
      g.fillStyle(0x7a3b1d, 1);
      g.fillCircle((sx + ex) / 2, (sy + ey) / 2, 10 * grow * pump);
      g.fillCircle(hx, hy, 7 * grow);
      g.fillStyle(0xf0a073, 1);
      g.fillCircle((sx + ex) / 2, (sy + ey) / 2, 8.5 * grow * pump);
      g.fillCircle(hx, hy, 5.5 * grow);
      g.fillStyle(0xffffff, 0.45);
      g.fillCircle((sx + ex) / 2 - 1.5, (sy + ey) / 2 - side * 2.5, 2.8 * grow);
    }
  }

  /** "z", "zz", "zzz" drifting up next to the name tag (a steady "zzz" with reduced effects). */
  private drawSleepy(x: number, y: number, p: Readonly<PlayerState>, time: number): void {
    const show = p.idle && !this.local;
    this.sleepy.setVisible(show);
    if (!show) return;
    if (reducedEffects()) {
      this.sleepy.setText('zzz').setPosition(x + CAR_R, y - CAR_R - 18).setAlpha(1);
      return;
    }
    const phase = (time / 1500) % 1;
    this.sleepy
      .setText('z'.repeat(1 + Math.floor(phase * 3)))
      .setPosition(x + CAR_R, y - CAR_R - 14 - phase * 10)
      .setAlpha(1 - phase * 0.5);
  }

  /** While an effect lasts: a soft colored disc under the car and an arc that shrinks with the time left. */
  private drawAura(x: number, y: number, p: Readonly<PlayerState>, time: number, alpha: number): void {
    const g = this.aura;
    g.clear();
    const info = p.effect ? POWERUP_INFO[p.effect] : undefined;
    if (!info || p.effectTicks <= 0 || alpha === 0) return;
    const r = CAR_R * (p.sizePct / 100);
    const left = Math.min(1, p.effectTicks / Math.max(1, effectDuration(p.effect)));
    const pulse = reducedEffects() ? 0.3 : 0.25 + 0.12 * Math.sin(time / 140);
    g.fillStyle(info.color, pulse);
    g.fillCircle(x, y, r + 12);
    g.lineStyle(4, info.color, 0.95);
    g.beginPath();
    g.arc(x, y, r + 11, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
    g.strokePath();
  }

  /** Local car: a ring under it that fills up while the boost recharges and glows when ready. */
  private drawRing(x: number, y: number, p: Readonly<PlayerState>): void {
    const g = this.ring!;
    g.clear();
    const ready = 1 - p.boostCooldown / BOOST_COOLDOWN_TICKS;
    const r = CAR_R + 6;
    if (ready >= 1) {
      g.lineStyle(3, 0x4cc9f0, 0.75);
      g.strokeCircle(x, y, r);
      return;
    }
    g.lineStyle(3, 0xffffff, 0.15);
    g.strokeCircle(x, y, r);
    g.lineStyle(3, 0x4cc9f0, 0.8);
    g.beginPath();
    g.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + ready * Math.PI * 2);
    g.strokePath();
  }
}
