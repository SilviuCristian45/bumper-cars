import {
  ACCEL,
  BOOST_ACCEL,
  BOOST_MASS,
  BOOST_MAX_SPEED,
  BRAKE,
  BUMP_EVENT_MIN,
  CAR_MASS,
  CAR_RADIUS,
  FRICTION,
  GRIP,
  GRIP_HIT,
  HIT_MIN_SPEED,
  INPUT_MAX,
  MAX_REVERSE_SPEED,
  MAX_SPEED,
  RESTITUTION,
  SLIDE_TICKS,
  REVERSE_ACCEL,
  TURN_FULL_SPEED,
  TURN_MOVING,
  TURN_STILL,
} from './constants';
import { icos, idiv, isin, isqrt, TRIG_ONE, wrapAngle } from './fixed';
import type { GameEvent, PlayerState } from './types';

// Car physics in integers: cars are discs with a heading. Everything is truncated toward zero
// with idiv, never with bitwise operators.

/** Speed along the heading (negative when rolling backwards). */
export function forwardSpeed(p: PlayerState): number {
  return idiv(p.vx * icos(p.heading) + p.vy * isin(p.heading), TRIG_ONE);
}

/** Moves `v` toward zero by per-mille `k`, at least by 1, never past zero. */
function decay(v: number, k: number): number {
  if (v === 0) return 0;
  const d = Math.max(Math.abs(idiv(v * k, 1000)), 1);
  return v > 0 ? Math.max(v - d, 0) : Math.min(v + d, 0);
}

/** Steering, throttle, boost, friction and grip for one tick, then the move. */
export function driveCar(p: PlayerState): void {
  const fwd0 = forwardSpeed(p);

  // Turning: possible on the spot, quicker when moving; reversed when rolling backwards, like a car.
  const speedFactor = Math.min(Math.abs(fwd0), TURN_FULL_SPEED);
  const turnRate = TURN_STILL + idiv((TURN_MOVING - TURN_STILL) * speedFactor, TURN_FULL_SPEED);
  const steer = fwd0 < -TURN_FULL_SPEED / 4 ? -p.steer : p.steer;
  p.heading = wrapAngle(p.heading + idiv(steer * turnRate, INPUT_MAX));

  const cos = icos(p.heading);
  const sin = isin(p.heading);
  let fwd = idiv(p.vx * cos + p.vy * sin, TRIG_ONE);
  let side = idiv(-p.vx * sin + p.vy * cos, TRIG_ONE);

  let accel = 0;
  if (p.throttle > 0) accel = idiv(p.throttle * ACCEL, INPUT_MAX);
  else if (p.throttle < 0) accel = idiv(p.throttle * (fwd > 0 ? BRAKE : REVERSE_ACCEL), INPUT_MAX);
  if (p.boostTicks > 0) {
    accel += BOOST_ACCEL;
    p.boostTicks--;
  }
  // Braking never flips the car into reverse within the same tick.
  if (p.throttle < 0 && fwd > 0 && fwd + accel < 0) fwd = 0;
  else fwd += accel;
  if (p.throttle <= 0 || fwd < 0) fwd = decay(fwd, FRICTION);
  else fwd = fwd - idiv(fwd * FRICTION, 1000);
  side = decay(side, p.slideTicks > 0 ? GRIP_HIT : GRIP);
  if (p.slideTicks > 0) p.slideTicks--;
  if (fwd < -MAX_REVERSE_SPEED) fwd = -MAX_REVERSE_SPEED;

  p.vx = idiv(fwd * cos - side * sin, TRIG_ONE);
  p.vy = idiv(fwd * sin + side * cos, TRIG_ONE);
  if (p.boostTicks > 0) limitSpeed(p, BOOST_MAX_SPEED, true);
  else limitSpeed(p, MAX_SPEED, false);

  p.x += p.vx;
  p.y += p.vy;
}

/**
 * Scales the velocity down to `max`: at once (`hard`, the boost cap), or by a twelfth per tick,
 * so after a boost or a big hit the car slows back to MAX_SPEED smoothly.
 */
function limitSpeed(p: PlayerState, max: number, hard: boolean): void {
  const sp = isqrt(p.vx * p.vx + p.vy * p.vy);
  if (sp <= max) return;
  const target = hard ? max : Math.max(max, sp - idiv(sp, 12));
  p.vx = idiv(p.vx * target, sp);
  p.vy = idiv(p.vy * target, sp);
}

export function massOf(p: PlayerState): number {
  return p.boostTicks > 0 ? BOOST_MASS : CAR_MASS;
}

/**
 * Elastic collision between two discs, with mass (a boosting car is heavier) and restitution,
 * plus positional separation. Marks hits for knockout credit. Callers go through pairs in slot
 * order so the result is deterministic.
 */
export function collide(a: PlayerState, b: PlayerState, tick: number, events: GameEvent[]): void {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const minDist = 2 * CAR_RADIUS;
  const d2 = dx * dx + dy * dy;
  if (d2 >= minDist * minDist) return;
  let dist = isqrt(d2);
  if (dist === 0) {
    // Exactly on top of each other: push apart along x, lower slot to the left.
    dx = 1;
    dy = 0;
    dist = 1;
  }
  // Unit normal from a to b, scaled by TRIG_ONE.
  const nx = idiv(dx * TRIG_ONE, dist);
  const ny = idiv(dy * TRIG_ONE, dist);
  const ma = massOf(a);
  const mb = massOf(b);

  // Separate them in proportion to the other's mass.
  const overlap = minDist - dist;
  const pushA = idiv(overlap * mb, ma + mb);
  const pushB = overlap - pushA;
  a.x -= idiv(pushA * nx, TRIG_ONE);
  a.y -= idiv(pushA * ny, TRIG_ONE);
  b.x += idiv(pushB * nx, TRIG_ONE);
  b.y += idiv(pushB * ny, TRIG_ONE);

  // Approach speeds along the normal: how fast each one drives into the other.
  const approachA = idiv(a.vx * nx + a.vy * ny, TRIG_ONE);
  const approachB = -idiv(b.vx * nx + b.vy * ny, TRIG_ONE);
  const closing = approachA + approachB;
  if (closing <= 0) return; // already moving apart

  // Impulse J = (1 + e) * closing * ma * mb / (ma + mb); a loses J/ma along n, b gains J/mb.
  const impulse = idiv((100 + RESTITUTION) * closing * ma * mb, 100 * (ma + mb));
  a.vx -= idiv(impulse * nx, ma * TRIG_ONE);
  a.vy -= idiv(impulse * ny, ma * TRIG_ONE);
  b.vx += idiv(impulse * nx, mb * TRIG_ONE);
  b.vy += idiv(impulse * ny, mb * TRIG_ONE);

  // Knockout credit: whoever drove into the other hard enough hit them; if neither did,
  // the faster of the two counts as the hitter.
  const aHits = approachA >= HIT_MIN_SPEED || (approachB < HIT_MIN_SPEED && approachA > approachB);
  const bHits = approachB >= HIT_MIN_SPEED || (approachA < HIT_MIN_SPEED && approachB > approachA);
  if (aHits) markHit(b, a, tick);
  if (bHits) markHit(a, b, tick);
  if (impulse >= BUMP_EVENT_MIN) {
    if (aHits) b.slideTicks = SLIDE_TICKS;
    if (bHits) a.slideTicks = SLIDE_TICKS;
  }

  if (impulse >= BUMP_EVENT_MIN) {
    if (aHits) a.bumps++;
    if (bHits) b.bumps++;
    events.push({
      type: 'bump',
      a: a.id,
      b: b.id,
      x: a.x + idiv(CAR_RADIUS * nx, TRIG_ONE),
      y: a.y + idiv(CAR_RADIUS * ny, TRIG_ONE),
      force: impulse,
    });
  }
}

function markHit(victim: PlayerState, hitter: PlayerState, tick: number): void {
  victim.lastHitBy = hitter.id;
  victim.lastHitTick = tick;
}

/** True once the car's center is beyond the ring's edge. */
export function isOutside(p: PlayerState, ringRadius: number): boolean {
  return p.x * p.x + p.y * p.y > ringRadius * ringRadius;
}
