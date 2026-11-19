import Phaser from 'phaser';
import { INPUT_MAX } from '@masinute/shared';
import { isTyping } from '../ui/dom';
import type { DriveInput, InputSource } from './InputSource';

const K = Phaser.Input.Keyboard.KeyCodes;

/** Left/right (A/D) steer, up (W) is gas, down (S) brakes then reverses, Space boosts. */
export class KeyboardInput implements InputSource {
  private readonly left: Phaser.Input.Keyboard.Key[];
  private readonly right: Phaser.Input.Keyboard.Key[];
  private readonly up: Phaser.Input.Keyboard.Key[];
  private readonly down: Phaser.Input.Keyboard.Key[];
  private readonly boostKey: Phaser.Input.Keyboard.Key;
  private boostQueued = false;

  constructor(private readonly keyboard: Phaser.Input.Keyboard.KeyboardPlugin) {
    const add = (...codes: number[]) => codes.map((code) => keyboard.addKey(code, true));
    this.left = add(K.LEFT, K.A);
    this.right = add(K.RIGHT, K.D);
    this.up = add(K.UP, K.W);
    this.down = add(K.DOWN, K.S);
    this.boostKey = keyboard.addKey(K.SPACE, true);
    this.boostKey.on('down', () => {
      if (!isTyping()) this.boostQueued = true;
    });
  }

  poll(): DriveInput | null {
    const held = (keys: Phaser.Input.Keyboard.Key[]) => (keys.some((k) => k.isDown) ? 1 : 0);
    const steer = (held(this.right) - held(this.left)) * INPUT_MAX;
    const throttle = (held(this.up) - held(this.down)) * INPUT_MAX;
    const boost = this.boostQueued;
    this.boostQueued = false;
    if (isTyping() || (steer === 0 && throttle === 0 && !boost)) return null;
    return { steer, throttle, boost };
  }

  releaseAll(): void {
    this.boostQueued = false;
    this.keyboard.resetKeys();
  }

  destroy(): void {
    this.boostKey.removeAllListeners();
  }
}
