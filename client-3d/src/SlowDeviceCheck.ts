import { load, save } from '@client/storage';

// The first time the 3D client runs on a device, its frame rate over the first seconds is measured;
// below MIN_FPS the player is offered the 2D client (suggest2d), once. The result is kept (masinute.fps3d), so
// later visits neither measure nor ask again.

const KEY = 'fps3d';
/** Shader compilation and the first textures: not counted. */
const WARMUP_MS = 1000;
const MEASURE_MS = 10_000;
const MIN_FPS = 40;
/** A frame this late is the tab coming back from the background, not the device being slow. */
const STALL_MS = 500;

export class SlowDeviceCheck {
  private shownMs = 0;
  private measuredMs = 0;
  private frames = 0;
  private done = load(KEY) !== null;
  /** Slow, but the suggestion waits for a moment outside a match. */
  private pending = false;

  constructor(
    private readonly ask: (fps: number) => void,
    private readonly hidden: () => boolean = () => document.hidden,
  ) {}

  /** Every rendered frame; `canAsk` = no match running and no dialog open. */
  frame(gapMs: number, canAsk: boolean): void {
    if (this.pending) {
      if (canAsk) {
        this.pending = false;
        this.ask(this.fps());
      }
      return;
    }
    if (this.done || this.hidden() || gapMs > STALL_MS) return;
    this.shownMs += gapMs;
    if (this.shownMs <= WARMUP_MS) return;
    this.measuredMs += gapMs;
    this.frames++;
    if (this.measuredMs < MEASURE_MS) return;
    this.done = true;
    save(KEY, String(this.fps()));
    if (this.fps() < MIN_FPS) this.pending = true;
  }

  private fps(): number {
    return Math.round((this.frames * 1000) / this.measuredMs);
  }
}
