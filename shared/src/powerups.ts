import {
  CAR_MASS,
  CAR_RADIUS,
  POWERUP_CAR_CLEARANCE,
  POWERUP_EDGE_MARGIN,
  POWERUP_FIRST_TICKS,
  POWERUP_KINDS,
  POWERUP_LIFETIME_TICKS,
  POWERUP_MAX_GAP_TICKS,
  POWERUP_MIN_GAP_TICKS,
  POWERUP_RADIUS,
  POWERUP_RETRY_TICKS,
  POWERUP_SLOTS,
  POWERUP_SPACING,
  POWERUP_SPAWN_TRIES,
  PU_HORN,
  PU_LIFEBUOY,
  PU_MICI,
  PU_NONE,
  PU_OIL,
  PU_SPRINGS,
  PU_TUICA,
  SLIDE_TICKS,
} from './constants';
import { ANGLE_STEPS, icos, idiv, isin, isqrt, TRIG_ONE } from './fixed';
import { markHit, massOf } from './physics';
import { nextInt } from './rng';
import { TUNING } from './tuning';
import type { GameEvent, GameState, PlayerState } from './types';

// Power-ups, all inside the deterministic simulation: positions and kinds come from the seeded
// RNG in the state, every number is an integer, so the browser, the server and the client's
// prediction see the same power-ups at the same ticks. With GameState.powerups off nothing here
// runs (and the RNG is never drawn from), so the simulation is exactly the one without them.

/** One power-up slot of the state (kind PU_NONE = empty). */
export interface PowerupSlot {
  kind: number;
  x: number;
  y: number;
  ticks: number;
}

/** The state's flat slots (pu0*, pu1*), read as objects. */
export function powerupAt(state: Readonly<GameState>, i: number): PowerupSlot {
  return i === 0
    ? { kind: state.pu0Kind, x: state.pu0X, y: state.pu0Y, ticks: state.pu0Ticks }
    : { kind: state.pu1Kind, x: state.pu1X, y: state.pu1Y, ticks: state.pu1Ticks };
}

function setPowerup(state: GameState, i: number, slot: PowerupSlot): void {
  if (i === 0) {
    state.pu0Kind = slot.kind;
    state.pu0X = slot.x;
    state.pu0Y = slot.y;
    state.pu0Ticks = slot.ticks;
  } else {
    state.pu1Kind = slot.kind;
    state.pu1X = slot.x;
    state.pu1Y = slot.y;
    state.pu1Ticks = slot.ticks;
  }
}

const EMPTY: PowerupSlot = { kind: PU_NONE, x: 0, y: 0, ticks: 0 };

/** Every power-up lying on the ring (for rendering, bots, tests). */
export function livePowerups(state: Readonly<GameState>): (PowerupSlot & { slot: number })[] {
  const out: (PowerupSlot & { slot: number })[] = [];
  for (let i = 0; i < POWERUP_SLOTS; i++) {
    const p = powerupAt(state, i);
    if (p.kind !== PU_NONE) out.push({ ...p, slot: i });
  }
  return out;
}

/** A fresh round (or the lobby): nothing on the ring, the first one due POWERUP_FIRST_TICKS after START. */
export function clearPowerups(state: GameState): void {
  for (let i = 0; i < POWERUP_SLOTS; i++) setPowerup(state, i, EMPTY);
  state.puTimer = POWERUP_FIRST_TICKS;
}

/** Ticks of an effect that lasts (instant ones, horn and oil, have none). */
export function effectDuration(kind: number): number {
  if (kind === PU_MICI) return TUNING.miciTicks;
  if (kind === PU_LIFEBUOY) return TUNING.lifebuoyTicks;
  if (kind === PU_TUICA) return TUNING.tuicaTicks;
  if (kind === PU_SPRINGS) return TUNING.springsTicks;
  return 0;
}

function dist2(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return dx * dx + dy * dy;
}

/**
 * Start of a fighting tick, before the cars move: timers run down and the oil puddles grip.
 * Returns the cars standing on someone else's puddle (driveCar gives them almost no grip).
 */
export function powerupsBeforeDrive(state: GameState, players: PlayerState[]): Set<string> {
  const oiled = new Set<string>();
  if (!state.powerups) return oiled;
  for (const p of players) {
    if (p.oilTicks > 0) p.oilTicks--;
    if (p.confusedTicks > 0) p.confusedTicks--;
    if (p.effectTicks > 0) {
      p.effectTicks--;
      if (p.effectTicks === 0) p.effect = PU_NONE;
    }
  }
  const r2 = TUNING.oilRadius * TUNING.oilRadius;
  for (const p of players) {
    if (!p.alive) continue;
    for (const owner of players) {
      if (owner.id === p.id || owner.oilTicks <= 0) continue;
      if (dist2(p.x, p.y, owner.oilX, owner.oilY) > r2) continue;
      oiled.add(p.id);
      // Sliding off the ring from someone's puddle is their knockout (within the usual window).
      markHit(p, owner, state.tick);
      break;
    }
  }
  return oiled;
}

/**
 * After the collisions, before the eliminations: cars pick up what they drive over (lower slot
 * first when two reach it on the same tick), then power-ups age, vanish, or appear.
 */
export function powerupsAfterCollide(state: GameState, players: PlayerState[], events: GameEvent[]): void {
  if (!state.powerups) return;
  const reach = CAR_RADIUS + POWERUP_RADIUS;
  for (let i = 0; i < POWERUP_SLOTS; i++) {
    const item = powerupAt(state, i);
    if (item.kind === PU_NONE) continue;
    const taker = players.find((p) => p.alive && dist2(p.x, p.y, item.x, item.y) <= reach * reach);
    if (taker) {
      setPowerup(state, i, EMPTY);
      pickUp(state, taker, item.kind, players, events);
      continue;
    }
    // Gone when its time is up or when the shrinking ring passes over it.
    item.ticks--;
    const outside = dist2(0, 0, item.x, item.y) > state.ringRadius * state.ringRadius;
    setPowerup(state, i, item.ticks <= 0 || outside ? EMPTY : item);
  }

  state.puTimer--;
  if (state.puTimer > 0) return;
  if (spawn(state, players, events)) {
    state.puTimer = POWERUP_MIN_GAP_TICKS + nextInt(state, POWERUP_MAX_GAP_TICKS - POWERUP_MIN_GAP_TICKS + 1);
  } else {
    state.puTimer = POWERUP_RETRY_TICKS;
  }
}

/** A random free spot inside the current ring, away from the edge, the cars and the other power-up. */
function spawn(state: GameState, players: PlayerState[], events: GameEvent[]): boolean {
  let free = -1;
  for (let i = 0; i < POWERUP_SLOTS && free < 0; i++) if (powerupAt(state, i).kind === PU_NONE) free = i;
  if (free < 0) return false;
  const maxR = state.ringRadius - POWERUP_EDGE_MARGIN;
  if (maxR <= 0) return false;
  const others = livePowerups(state);
  for (let attempt = 0; attempt < POWERUP_SPAWN_TRIES; attempt++) {
    const angle = nextInt(state, ANGLE_STEPS);
    // The square root of a uniform draw spreads them evenly over the disc's area.
    const r = isqrt(nextInt(state, maxR * maxR));
    const x = idiv(r * icos(angle), TRIG_ONE);
    const y = idiv(r * isin(angle), TRIG_ONE);
    const nearCar = players.some((p) => p.alive && dist2(p.x, p.y, x, y) < POWERUP_CAR_CLEARANCE * POWERUP_CAR_CLEARANCE);
    const nearItem = others.some((o) => dist2(o.x, o.y, x, y) < POWERUP_SPACING * POWERUP_SPACING);
    if (nearCar || nearItem) continue;
    const kind = POWERUP_KINDS[nextInt(state, POWERUP_KINDS.length)]!;
    setPowerup(state, free, { kind, x, y, ticks: POWERUP_LIFETIME_TICKS });
    events.push({ type: 'powerupSpawn', kind, x, y });
    return true;
  }
  return false;
}

/** Takes effect at once. Lasting effects replace the car's current one; horn and oil are instant. */
function pickUp(state: GameState, p: PlayerState, kind: number, players: PlayerState[], events: GameEvent[]): void {
  events.push({ type: 'pickup', playerId: p.id, kind });
  if (kind === PU_HORN) {
    honk(state, p, players, events);
  } else if (kind === PU_OIL) {
    // Dropped right behind the car, so the owner drives away from it.
    const back = CAR_RADIUS + TUNING.oilRadius;
    p.oilX = p.x - idiv(back * icos(p.heading), TRIG_ONE);
    p.oilY = p.y - idiv(back * isin(p.heading), TRIG_ONE);
    p.oilTicks = TUNING.oilTicks;
  } else {
    p.effect = kind;
    p.effectTicks = effectDuration(kind);
  }
}

/** Claxon de TIR: every car within reach is shoved away, harder the closer it is; counts as a hit. */
function honk(state: GameState, p: PlayerState, players: PlayerState[], events: GameEvent[]): void {
  events.push({ type: 'horn', playerId: p.id, x: p.x, y: p.y });
  const radius = TUNING.hornRadius;
  for (const q of players) {
    if (q.id === p.id || !q.alive) continue;
    let dx = q.x - p.x;
    let dy = q.y - p.y;
    let d = isqrt(dx * dx + dy * dy);
    if (d >= radius) continue;
    if (d === 0) {
      dx = 1;
      dy = 0;
      d = 1;
    }
    // Linear falloff with distance; heavier cars (boost, Mici) move less.
    const push = idiv(idiv(TUNING.hornPush * (radius - d), radius) * CAR_MASS, massOf(q));
    q.vx += idiv(push * dx, d);
    q.vy += idiv(push * dy, d);
    q.slideTicks = SLIDE_TICKS;
    markHit(q, p, state.tick);
  }
}

/**
 * Colac de salvare, instead of an elimination: the car is put back just inside the ring and
 * bounced toward the center; the lifebuoy is used up. Returns whether it saved the car.
 */
export function rescue(state: GameState, p: PlayerState, events: GameEvent[]): boolean {
  if (!state.powerups || p.effect !== PU_LIFEBUOY) return false;
  const r = Math.max(1, isqrt(p.x * p.x + p.y * p.y));
  const back = Math.max(0, state.ringRadius - 2 * CAR_RADIUS);
  p.x = idiv(p.x * back, r);
  p.y = idiv(p.y * back, r);
  p.vx = -idiv(p.x * TUNING.lifebuoyBounce, Math.max(1, back));
  p.vy = -idiv(p.y * TUNING.lifebuoyBounce, Math.max(1, back));
  if (back === 0) {
    p.vx = 0;
    p.vy = 0;
  }
  p.slideTicks = 0;
  p.effect = PU_NONE;
  p.effectTicks = 0;
  events.push({ type: 'saved', playerId: p.id });
  return true;
}
