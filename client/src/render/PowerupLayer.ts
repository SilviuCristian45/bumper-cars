import Phaser from 'phaser';
import {
  OIL_RADIUS,
  POWERUP_BLINK_TICKS,
  POWERUP_SLOTS,
  PU_NONE,
  TICK_RATE,
  TUNING,
  powerupAt,
  type GameState,
} from '@masinute/shared';
import { reducedEffects } from '../settings';
import { DEPTH, toScreenX, toScreenY } from './layout';
import { TEX } from './textures';

// What lies on the floor: the power-ups (popping in, pulsing gently, blinking before they vanish)
// and each car's oil puddle (fading out at the end). Read straight from the state every frame.

const POP_MS = 260;
/** A puddle fades out over its last second. */
const OIL_FADE_TICKS = TICK_RATE;

interface ItemView {
  sprite: Phaser.GameObjects.Image;
  /** What the slot held last frame (a new kind or a new spot means a new power-up). */
  key: string;
}

export class PowerupLayer {
  private readonly items: ItemView[] = [];
  private readonly puddles = new Map<string, Phaser.GameObjects.Image>();

  constructor(private readonly scene: Phaser.Scene) {
    for (let i = 0; i < POWERUP_SLOTS; i++) {
      this.items.push({ sprite: scene.add.image(0, 0, TEX.oil).setDepth(DEPTH.marks).setVisible(false), key: '' });
    }
  }

  update(state: Readonly<GameState>, time: number): void {
    const reduced = reducedEffects();
    this.items.forEach((view, i) => {
      const item = powerupAt(state, i);
      const key = item.kind === PU_NONE ? '' : `${item.kind}:${item.x}:${item.y}`;
      const sprite = view.sprite;
      if (key !== view.key) {
        view.key = key;
        this.scene.tweens.killTweensOf(sprite);
        if (!key) {
          sprite.setVisible(false);
          return;
        }
        sprite.setTexture(TEX.powerup(item.kind)).setPosition(toScreenX(item.x), toScreenY(item.y)).setVisible(true);
        // Pops into place (reduced effects: just appears).
        if (reduced) sprite.setScale(1);
        else {
          sprite.setScale(0.2);
          this.scene.tweens.add({ targets: sprite, scale: 1, duration: POP_MS, ease: 'Back.easeOut' });
        }
      }
      if (!key) return;
      // About to vanish: blinks (reduced effects: a slower, softer fade in and out).
      const ending = item.ticks <= POWERUP_BLINK_TICKS;
      const alpha = !ending ? 1 : reduced ? 0.55 + 0.45 * Math.cos(time / 260) : Math.floor(time / 110) % 2 === 0 ? 1 : 0.25;
      sprite.setAlpha(alpha);
      if (!reduced && !this.scene.tweens.isTweening(sprite)) sprite.setScale(1 + 0.06 * Math.sin(time / 180 + i * 2));
    });

    const scale = TUNING.oilRadius / OIL_RADIUS;
    for (const p of Object.values(state.players)) {
      let puddle = this.puddles.get(p.id);
      if (p.oilTicks <= 0) {
        puddle?.setVisible(false);
        continue;
      }
      if (!puddle) {
        puddle = this.scene.add.image(0, 0, TEX.oil).setDepth(DEPTH.marks);
        this.puddles.set(p.id, puddle);
      }
      puddle
        .setVisible(true)
        .setPosition(toScreenX(p.oilX), toScreenY(p.oilY))
        .setScale(scale)
        .setAlpha(Math.min(1, p.oilTicks / OIL_FADE_TICKS));
    }
    for (const [id, puddle] of this.puddles) {
      if (state.players[id]) continue;
      puddle.destroy();
      this.puddles.delete(id);
    }
  }
}
