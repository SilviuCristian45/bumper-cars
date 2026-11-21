import { INPUT_MAX } from '@masinute/shared';
import type { DriveInput, InputSource } from '@client/input/InputSource';

const LEFT = ['ArrowLeft', 'KeyA'];
const RIGHT = ['ArrowRight', 'KeyD'];
const UP = ['ArrowUp', 'KeyW'];
const DOWN = ['ArrowDown', 'KeyS'];
const DRIVE_KEYS = new Set([...LEFT, ...RIGHT, ...UP, ...DOWN, 'Space']);

/**
 * Same keys as the 2D game, without Phaser: left/right (A/D) steer relative to the car (so they stay
 * right on the chase camera too), up (W) gas, down (S) brake/reverse, Space boost.
 */
export class KeyboardInput implements InputSource {
  private readonly held = new Set<string>();
  private boostQueued = false;

  private readonly onDown = (e: KeyboardEvent): void => {
    if (!DRIVE_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.code === 'Space' && !e.repeat) this.boostQueued = true;
    this.held.add(e.code);
  };

  private readonly onUp = (e: KeyboardEvent): void => {
    this.held.delete(e.code);
  };

  private readonly onBlur = (): void => this.releaseAll();

  constructor() {
    window.addEventListener('keydown', this.onDown);
    window.addEventListener('keyup', this.onUp);
    window.addEventListener('blur', this.onBlur);
  }

  poll(): DriveInput | null {
    const any = (codes: string[]) => (codes.some((c) => this.held.has(c)) ? 1 : 0);
    const steer = (any(RIGHT) - any(LEFT)) * INPUT_MAX;
    const throttle = (any(UP) - any(DOWN)) * INPUT_MAX;
    const boost = this.boostQueued;
    this.boostQueued = false;
    if (steer === 0 && throttle === 0 && !boost) return null;
    return { steer, throttle, boost };
  }

  releaseAll(): void {
    this.held.clear();
    this.boostQueued = false;
  }

  destroy(): void {
    window.removeEventListener('keydown', this.onDown);
    window.removeEventListener('keyup', this.onUp);
    window.removeEventListener('blur', this.onBlur);
  }
}
