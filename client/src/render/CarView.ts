import Phaser from 'phaser';
import { BOOST_COOLDOWN_TICKS, CAR_RADIUS, FP, PLAYER_COLORS, effectDuration, type PlayerState } from '@masinute/shared';
import { reducedEffects } from '../settings';
import { DEPTH, FONT, TOUCH_LAYOUT } from './layout';
import { POWERUP_INFO } from './powerupInfo';
import { TEX } from './textures';

const CAR_R = CAR_RADIUS / FP;
/** The antenna pole's tip, behind the driver (pixels from the center, along the heading). */
const ANTENNA_BACK = CAR_R - 5;
const OUT_MS = 650;

/**
 * One car on screen: shadow, body, antenna spark, name tag; the local car also gets its boost ring.
 * Power-ups: a colored aura whose arc runs down with the effect's time, and a spinning "?" over
 * a car whose steering Țuică turned around.
 */
export class CarView {
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly body: Phaser.GameObjects.Image;
  private readonly antenna: Phaser.GameObjects.Image;
  private readonly label: Phaser.GameObjects.Text;
  private readonly ring?: Phaser.GameObjects.Graphics;
  private readonly aura: Phaser.GameObjects.Graphics;
  private readonly dizzy: Phaser.GameObjects.Text;
  private out = false;

  constructor(private readonly scene: Phaser.Scene, p: Readonly<PlayerState>, local: boolean) {
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
    this.dizzy = scene.add
      .text(0, 0, '?', { fontFamily: FONT, fontSize: '26px', fontStyle: 'bold', color: '#c77dff', stroke: '#120a24', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(DEPTH.labels)
      .setVisible(false);
  }

  /** Places the car at screen pixels with the heading in radians; `p` gives boost and cooldown. */
  setPose(x: number, y: number, angle: number, p: Readonly<PlayerState>, time: number): void {
    if (this.out) return;
    this.shadow.setPosition(x + 3, y + 5);
    this.body.setPosition(x, y).setRotation(angle);
    // The pole's spark flickers like the real thing touching the ceiling grid.
    const flicker = Math.sin(time / 37 + p.slot * 1.7) * Math.sin(time / 53);
    this.antenna
      .setPosition(x - Math.cos(angle) * ANTENNA_BACK, y - Math.sin(angle) * ANTENNA_BACK)
      .setAlpha(p.boostTicks > 0 ? 1 : 0.55 + 0.45 * flicker)
      .setScale(p.boostTicks > 0 ? 0.9 : 0.5);
    this.label.setPosition(x, y - CAR_R - 6);
    if (this.ring) this.drawRing(x, y, p);
    this.drawAura(x, y, p, time);
    const dizzy = p.confusedTicks > 0;
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
    this.dizzy.setVisible(false);
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
    return [this.shadow, this.body, this.antenna, this.label, this.aura, this.dizzy, ...(this.ring ? [this.ring] : [])];
  }

  /** While an effect lasts: a soft colored disc under the car and an arc that shrinks with the time left. */
  private drawAura(x: number, y: number, p: Readonly<PlayerState>, time: number): void {
    const g = this.aura;
    g.clear();
    const info = p.effect ? POWERUP_INFO[p.effect] : undefined;
    if (!info || p.effectTicks <= 0) return;
    const left = Math.min(1, p.effectTicks / Math.max(1, effectDuration(p.effect)));
    const pulse = reducedEffects() ? 0.3 : 0.25 + 0.12 * Math.sin(time / 140);
    g.fillStyle(info.color, pulse);
    g.fillCircle(x, y, CAR_R + 12);
    g.lineStyle(4, info.color, 0.95);
    g.beginPath();
    g.arc(x, y, CAR_R + 11, -Math.PI / 2, -Math.PI / 2 + left * Math.PI * 2);
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
