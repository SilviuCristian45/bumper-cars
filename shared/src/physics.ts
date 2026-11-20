import {
  BUMP_EVENT_MIN,
  CAR_MASS,
  CAR_RADIUS,
  GHOST_SEPARATE_STEP,
  HIT_MIN_SPEED,
  INPUT_MAX,
  MAX_REVERSE_SPEED,
  PU_GHOST,
  PU_MICI,
  PU_PROTEIN,
  PU_SODA,
  PU_SPRINGS,
  PU_TUICA,
  REVERSE_ACCEL,
  SLIDE_TICKS,
  TURN_FULL_SPEED,
} from './constants';
import { icos, idiv, isin, isqrt, TRIG_ONE, wrapAngle } from './fixed';
import { TUNING } from './tuning';
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

/** Acceleration in percent: Mici a bit slower, Suc Zero Zahăr quicker, Pudră proteică a bit slower. */
function accelPct(p: PlayerState): number {
  if (p.effect === PU_MICI) return TUNING.miciSpeedPct;
  if (p.effect === PU_SODA) return TUNING.sodaAccelPct;
  if (p.effect === PU_PROTEIN) return TUNING.proteinAccelPct;
  return 100;
}

/** Top speed in percent: Mici slower, Suc Zero Zahăr much faster. */
function topSpeedPct(p: PlayerState): number {
  if (p.effect === PU_MICI) return TUNING.miciSpeedPct;
  if (p.effect === PU_SODA) return TUNING.sodaSpeedPct;
  return 100;
}

/** The car's radius: CAR_RADIUS, bigger while Pudră proteică lasts (exactly CAR_RADIUS at 100%). */
export function carRadius(p: Readonly<PlayerState>): number {
  return p.sizePct === 100 ? CAR_RADIUS : idiv(CAR_RADIUS * p.sizePct, 100);
}

/** Fantomă: nothing touches it and it touches nothing. */
export function isGhost(p: Readonly<PlayerState>): boolean {
  return p.effect === PU_GHOST;
}

/** Scales by a percent, exact when it is 100 (power-ups off: the numbers stay what they were). */
function pct(v: number, percent: number): number {
  return percent === 100 ? v : idiv(v * percent, 100);
}

/**
 * Steering, throttle, boost, friction and grip for one tick, then the move. `oiled`: on someone's
 * oil puddle, the car barely grips sideways.
 */
export function driveCar(p: PlayerState, oiled = false): void {
  const fwd0 = forwardSpeed(p);

  // Turning: possible on the spot, quicker when moving; reversed when rolling backwards, like a car.
  const speedFactor = Math.min(Math.abs(fwd0), TURN_FULL_SPEED);
  const turnRate = TUNING.turnStill + idiv((TUNING.turnMoving - TUNING.turnStill) * speedFactor, TURN_FULL_SPEED);
  // Țuică: the steering is reversed for a while.
  const held = p.confusedTicks > 0 ? -p.steer : p.steer;
  const steer = fwd0 < -TURN_FULL_SPEED / 4 ? -held : held;
  p.heading = wrapAngle(p.heading + idiv(steer * turnRate, INPUT_MAX));

  const cos = icos(p.heading);
  const sin = isin(p.heading);
  let fwd = idiv(p.vx * cos + p.vy * sin, TRIG_ONE);
  let side = idiv(-p.vx * sin + p.vy * cos, TRIG_ONE);

  let accel = 0;
  if (p.throttle > 0) accel = idiv(p.throttle * pct(TUNING.accel, accelPct(p)), INPUT_MAX);
  else if (p.throttle < 0) accel = idiv(p.throttle * (fwd > 0 ? TUNING.brake : REVERSE_ACCEL), INPUT_MAX);
  if (p.boostTicks > 0) {
    accel += TUNING.boostAccel;
    p.boostTicks--;
  }
  // Braking never flips the car into reverse within the same tick.
  if (p.throttle < 0 && fwd > 0 && fwd + accel < 0) fwd = 0;
  else fwd += accel;
  if (p.throttle <= 0 || fwd < 0) fwd = decay(fwd, TUNING.friction);
  else fwd = fwd - idiv(fwd * TUNING.friction, 1000);
  // Suc Zero Zahăr: less grip on top of the speed, hard to keep on the ring.
  const grip = p.slideTicks > 0 ? TUNING.gripHit : TUNING.grip;
  side = decay(side, oiled ? TUNING.oilGrip : p.effect === PU_SODA ? pct(grip, TUNING.sodaGripPct) : grip);
  if (p.slideTicks > 0) p.slideTicks--;
  if (fwd < -MAX_REVERSE_SPEED) fwd = -MAX_REVERSE_SPEED;

  p.vx = idiv(fwd * cos - side * sin, TRIG_ONE);
  p.vy = idiv(fwd * sin + side * cos, TRIG_ONE);
  if (p.boostTicks > 0) limitSpeed(p, TUNING.boostMaxSpeed, true);
  else limitSpeed(p, pct(TUNING.maxSpeed, topSpeedPct(p)), false);

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

/** A boosting car is heavier; Mici double that again; a giant's mass grows with its size. */
export function massOf(p: PlayerState): number {
  const base = p.boostTicks > 0 ? TUNING.boostMass : CAR_MASS;
  if (p.effect === PU_MICI) return pct(base, TUNING.miciMassPct);
  if (p.sizePct !== 100 || p.effect === PU_PROTEIN) return pct(base, giantMassPct(p));
  return base;
}

/** Pudră proteică: full proteinMassPct at full size, in proportion while growing or shrinking. */
function giantMassPct(p: PlayerState): number {
  const span = TUNING.proteinSizePct - 100;
  if (span <= 0) return p.effect === PU_PROTEIN ? TUNING.proteinMassPct : 100;
  const grown = Math.min(Math.max(p.sizePct - 100, 0), span);
  return 100 + idiv((TUNING.proteinMassPct - 100) * grown, span);
}

/**
 * Elastic collision between two discs, with mass (a boosting car is heavier) and restitution,
 * plus positional separation. Marks hits for knockout credit. Callers go through pairs in slot
 * order so the result is deterministic.
 */
export function collide(a: PlayerState, b: PlayerState, tick: number, events: GameEvent[]): void {
  // Fantomă: passes through everyone, both ways.
  if (isGhost(a) || isGhost(b)) return;
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  const ra = carRadius(a);
  const minDist = ra + carRadius(b);
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
  const overlap = minDist - dist;

  // A ghost that just reappeared on top of a car: they drift apart a little every tick, no impulse, no credit.
  if (a.ghostFade > 0 || b.ghostFade > 0) {
    const half = idiv(overlap, 2);
    const stepA = Math.min(overlap - half, GHOST_SEPARATE_STEP);
    const stepB = Math.min(half, GHOST_SEPARATE_STEP);
    a.x -= idiv(stepA * nx, TRIG_ONE);
    a.y -= idiv(stepA * ny, TRIG_ONE);
    b.x += idiv(stepB * nx, TRIG_ONE);
    b.y += idiv(stepB * ny, TRIG_ONE);
    return;
  }

  // Separate them in proportion to the other's mass.
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

  // Knockout credit: whoever drove into the other hard enough hit them; if neither did,
  // the faster of the two counts as the hitter.
  const aHits = approachA >= HIT_MIN_SPEED || (approachB < HIT_MIN_SPEED && approachA > approachB);
  const bHits = approachB >= HIT_MIN_SPEED || (approachA < HIT_MIN_SPEED && approachB > approachA);

  // Impulse J = (1 + e) * closing * ma * mb / (ma + mb); a loses J/ma along n, b gains J/mb.
  // Bară cu arcuri: the hitter's springs shove the other car harder (the hitter's own share stays).
  const impulse = idiv((100 + TUNING.restitution) * closing * ma * mb, 100 * (ma + mb));
  const toA = bHits && b.effect === PU_SPRINGS ? pct(impulse, TUNING.springsPct) : impulse;
  const toB = aHits && a.effect === PU_SPRINGS ? pct(impulse, TUNING.springsPct) : impulse;
  a.vx -= idiv(toA * nx, ma * TRIG_ONE);
  a.vy -= idiv(toA * ny, ma * TRIG_ONE);
  b.vx += idiv(toB * nx, mb * TRIG_ONE);
  b.vy += idiv(toB * ny, mb * TRIG_ONE);

  if (aHits) markHit(b, a, tick);
  if (bHits) markHit(a, b, tick);
  if (impulse >= BUMP_EVENT_MIN) {
    if (aHits) b.slideTicks = SLIDE_TICKS;
    if (bHits) a.slideTicks = SLIDE_TICKS;
  }

  if (impulse >= BUMP_EVENT_MIN) {
    if (aHits) a.bumps++;
    if (bHits) b.bumps++;
    const cx = a.x + idiv(ra * nx, TRIG_ONE);
    const cy = a.y + idiv(ra * ny, TRIG_ONE);
    if (aHits) powerHit(a, b, cx, cy, events);
    if (bHits) powerHit(b, a, cx, cy, events);
    events.push({
      type: 'bump',
      a: a.id,
      b: b.id,
      x: cx,
      y: cy,
      force: impulse,
    });
  }
}

/** What a real hit by `hitter` does with its power-up: Țuică passes on (reversed steering), springs go boing. */
function powerHit(hitter: PlayerState, victim: PlayerState, x: number, y: number, events: GameEvent[]): void {
  if (hitter.effect === PU_TUICA) {
    victim.confusedTicks = TUNING.tuicaConfuseTicks;
    hitter.effect = 0;
    hitter.effectTicks = 0;
    events.push({ type: 'confused', playerId: victim.id, byId: hitter.id });
  } else if (hitter.effect === PU_SPRINGS) {
    events.push({ type: 'spring', playerId: hitter.id, x, y });
  }
}

/** Credit for a knockout within HIT_CREDIT_TICKS (a collision, the horn, someone's oil). */
export function markHit(victim: PlayerState, hitter: PlayerState, tick: number): void {
  victim.lastHitBy = hitter.id;
  victim.lastHitTick = tick;
}

/** True once the car's center is beyond the ring's edge. */
export function isOutside(p: PlayerState, ringRadius: number): boolean {
  return p.x * p.x + p.y * p.y > ringRadius * ringRadius;
}
