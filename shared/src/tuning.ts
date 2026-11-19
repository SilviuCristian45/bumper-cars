import {
  ACCEL,
  BOOST_ACCEL,
  BOOST_MASS,
  BOOST_MAX_SPEED,
  BRAKE,
  FRICTION,
  GRIP,
  GRIP_HIT,
  MAX_SPEED,
  RESTITUTION,
  TURN_MOVING,
  TURN_STILL,
} from './constants';

// The driving-feel constants physics.ts reads, gathered in one object so the local ?tune panel
// can change them live. Everything else (server, online clients, tests) keeps DEFAULT_TUNING:
// client and server must step with identical numbers, so only a local game may touch TUNING.

export interface Tuning {
  accel: number;
  brake: number;
  maxSpeed: number;
  friction: number;
  grip: number;
  gripHit: number;
  turnStill: number;
  turnMoving: number;
  restitution: number;
  boostAccel: number;
  boostMaxSpeed: number;
  boostMass: number;
}

export const DEFAULT_TUNING: Readonly<Tuning> = Object.freeze({
  accel: ACCEL,
  brake: BRAKE,
  maxSpeed: MAX_SPEED,
  friction: FRICTION,
  grip: GRIP,
  gripHit: GRIP_HIT,
  turnStill: TURN_STILL,
  turnMoving: TURN_MOVING,
  restitution: RESTITUTION,
  boostAccel: BOOST_ACCEL,
  boostMaxSpeed: BOOST_MAX_SPEED,
  boostMass: BOOST_MASS,
});

/** Live values used by the simulation. Integers only. */
export const TUNING: Tuning = { ...DEFAULT_TUNING };

/** Applies integer values (others ignored); pass DEFAULT_TUNING to reset. */
export function setTuning(values: Partial<Tuning>): void {
  for (const key of Object.keys(DEFAULT_TUNING) as (keyof Tuning)[]) {
    const v = values[key];
    if (typeof v === 'number' && Number.isInteger(v)) TUNING[key] = v;
  }
}

export interface GameTuningOptions {
  /** A room on the server: client and server must step with the same numbers. */
  online: boolean;
  /** ?tune in the URL. */
  tune: boolean;
  /** Values an earlier ?tune session saved in this browser (null when there are none). */
  saved: Partial<Tuning> | null;
}

/**
 * Called whenever a game starts. Every game starts from DEFAULT_TUNING; the saved ?tune values
 * are applied on top only for a local game with ?tune in the URL. Online they never apply.
 */
export function applyGameTuning(opts: GameTuningOptions): void {
  setTuning(DEFAULT_TUNING);
  if (!opts.online && opts.tune && opts.saved) setTuning(opts.saved);
}
