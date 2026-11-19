import { angleDiff, type GameState, type PlayerState } from '@masinute/shared';

// Where things are drawn this frame. The simulation moves in whole ticks; transports blend
// between ticks (and online, between server states) so cars glide at any frame rate.

/** Simulation units (sub-units, angle steps), fractional. */
export interface Pose {
  x: number;
  y: number;
  heading: number;
}

export interface RenderView {
  /** Every car of the current state. */
  poses: ReadonlyMap<string, Pose>;
  ringRadius: number;
}

export function poseOf(p: Readonly<PlayerState>): Pose {
  return { x: p.x, y: p.y, heading: p.heading };
}

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, heading: a.heading + angleDiff(a.heading, b.heading) * t };
}

/** A new round puts every car back on the spawn circle: no gliding from the old spots. */
export function isRoundReset(prev: Readonly<GameState>, next: Readonly<GameState>): boolean {
  return next.round !== prev.round || next.phase !== prev.phase || next.roundTick < prev.roundTick;
}

/** The poses of the last two ticks, drawn in between (LocalTransport). */
export class TickBlend {
  private prev = new Map<string, Pose>();
  private cur = new Map<string, Pose>();
  private prevRing = 0;
  private curRing = 0;
  private last: GameState | null = null;

  /** Called after the state may have moved on; only a new tick shifts the poses. */
  push(state: Readonly<GameState>): void {
    if (this.last && state.tick === this.last.tick) return;
    const fresh = !this.last || state.tick - this.last.tick > 1 || isRoundReset(this.last, state);
    this.prev = this.cur;
    this.cur = new Map();
    for (const p of Object.values(state.players)) this.cur.set(p.id, poseOf(p));
    if (fresh) this.prev = this.cur;
    this.prevRing = fresh ? state.ringRadius : this.curRing;
    this.curRing = state.ringRadius;
    this.last = { ...state, players: {} };
  }

  view(alpha: number): RenderView {
    const poses = new Map<string, Pose>();
    for (const [id, cur] of this.cur) poses.set(id, lerpPose(this.prev.get(id) ?? cur, cur, alpha));
    return { poses, ringRadius: this.prevRing + (this.curRing - this.prevRing) * alpha };
  }
}
