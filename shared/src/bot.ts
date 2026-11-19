import { BOT_EASY, BOT_HARD, BOT_MEDIUM, FP, INPUT_MAX } from './constants';
import { angleDiff, clamp, hash32, iatan2, icos, idiv, isin, isqrt, percent, TRIG_ONE } from './fixed';
import { sortedPlayers } from './match';
import { forwardSpeed } from './physics';
import { countdownSeconds } from './sim';
import type { CarInput, GameState, PlayerState } from './types';

// Bots: one decision procedure for every level; the levels only differ in the numbers below.
// Decisions are pure functions of the state: random choices are hashes of the state (RNG word,
// round, tick, slot) and never advance the RNG, so the client's prediction replays them exactly.

export interface BotParams {
  /** Ticks between decisions (reaction time); the last input is held in between. */
  interval: number;
  /** Percent of decisions spent hunting someone instead of cruising near the center. */
  aggression: number;
  /** Retreat toward the center when closer than this to the edge (sub-units), plus a speed term. */
  edgeMargin: number;
  /** Ticks of outward speed added to the edge margin (how far ahead the bot looks). */
  edgeLookahead: number;
  /** Boost toward the center when about to slide out. */
  escapeBoost: boolean;
  /** Boost when the victim is within this distance and roughly in front. */
  boostRange: number;
  /** Max heading error for a boost, in angle steps. */
  boostAlign: number;
  /** Percent of decisions that go wrong (steer the other way, coast, waste the boost). */
  mistake: number;
  /** Random aim error, +- angle steps. */
  aimNoise: number;
}

export const BOT_PARAMS: Record<number, BotParams> = {
  [BOT_EASY]: {
    interval: 8,
    aggression: 40,
    edgeMargin: 40 * FP,
    edgeLookahead: 6,
    escapeBoost: false,
    boostRange: 70 * FP,
    boostAlign: 120,
    mistake: 22,
    aimNoise: 90,
  },
  [BOT_MEDIUM]: {
    interval: 4,
    aggression: 65,
    edgeMargin: 55 * FP,
    edgeLookahead: 12,
    escapeBoost: false,
    boostRange: 110 * FP,
    boostAlign: 60,
    mistake: 8,
    aimNoise: 40,
  },
  [BOT_HARD]: {
    interval: 4,
    aggression: 85,
    edgeMargin: 45 * FP,
    edgeLookahead: 10,
    escapeBoost: true,
    boostRange: 150 * FP,
    boostAlign: 30,
    mistake: 1,
    aimNoise: 8,
  },
};

export type BotIntent = 'wait' | 'retreat' | 'hunt' | 'cruise';

export interface BotThought {
  input: CarInput;
  intent: BotIntent;
  targetX: number;
  targetY: number;
  victimId: string;
}

/** Steering gain: angle error (steps) to full steer. */
const FULL_STEER_ERROR = 40;

function paramsFor(p: PlayerState): BotParams {
  return BOT_PARAMS[p.botLevel] ?? BOT_PARAMS[BOT_MEDIUM]!;
}

/** Distance of a point from the ring's center. */
function radiusOf(x: number, y: number): number {
  return isqrt(x * x + y * y);
}

function distance(a: PlayerState, b: PlayerState): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return isqrt(dx * dx + dy * dy);
}

/** The full decision, plus what the bot is trying to do (for the debug overlay). Pure. */
export function botThink(state: GameState, id: string): BotThought | null {
  const me = state.players[id];
  if (!me || !me.alive || state.phase !== 'playing') return null;
  const params = paramsFor(me);
  const decision = Math.trunc(state.tick / params.interval);
  const roll = (salt: number) => percent(state.rng, state.round, decision, me.slot, salt);

  const idle: CarInput = { seq: 0, steer: 0, throttle: 0, boost: false };
  if (countdownSeconds(state.roundTick) > 0) {
    return { input: idle, intent: 'wait', targetX: me.x, targetY: me.y, victimId: '' };
  }

  const ring = state.ringRadius;
  const myR = radiusOf(me.x, me.y);
  // Outward speed: velocity along the direction from the center to the car.
  const outward = myR > 0 ? idiv(me.vx * me.x + me.vy * me.y, myR) : 0;
  const danger = params.edgeMargin + Math.max(0, outward) * params.edgeLookahead;

  let intent: BotIntent;
  let tx = 0;
  let ty = 0;
  let victim: PlayerState | undefined;

  if (ring - myR < danger) {
    intent = 'retreat';
  } else if (roll(1) < params.aggression && (victim = pickVictim(state, me))) {
    intent = 'hunt';
    tx = victim.x;
    ty = victim.y;
  } else {
    intent = 'cruise';
    // A slow wander on a small circle around the center.
    const a = (state.round * 211 + me.slot * 171 + Math.trunc(state.tick / 45) * 37) % 1024;
    const r = idiv(ring, 4);
    tx = idiv(r * icos(a), TRIG_ONE);
    ty = idiv(r * isin(a), TRIG_ONE);
  }

  const noise = params.aimNoise > 0 ? (hash32(state.rng, decision, me.slot, 7) % (2 * params.aimNoise + 1)) - params.aimNoise : 0;
  const desired = iatan2(ty - me.y, tx - me.x) + noise;
  const err = angleDiff(me.heading, desired);
  let steer = clamp(idiv(err * INPUT_MAX, FULL_STEER_ERROR), -INPUT_MAX, INPUT_MAX);
  const absErr = Math.abs(err);
  let throttle: number;
  if (intent === 'retreat') {
    // Facing away from the center while sliding out: brake hard (backs toward the center).
    throttle = absErr > 300 ? -INPUT_MAX : absErr > 200 ? 0 : INPUT_MAX;
    if (throttle < 0) steer = 0;
  } else if (intent === 'cruise') {
    throttle = absErr > 256 ? 20 : 55;
  } else {
    throttle = absErr > 256 ? 30 : INPUT_MAX;
  }

  let boost = false;
  if (me.boostCooldown === 0 && absErr <= params.boostAlign) {
    if (victim && intent === 'hunt') boost = distance(me, victim) <= params.boostRange;
    else if (intent === 'retreat' && forwardSpeed(me) >= 0) boost = params.escapeBoost;
  }

  if (roll(2) < params.mistake) {
    const kind = roll(3) % 3;
    if (kind === 0) steer = -steer;
    else if (kind === 1) throttle = 0;
    else boost = me.boostCooldown === 0;
  }

  return { input: { seq: 0, steer, throttle, boost }, intent, targetX: tx, targetY: ty, victimId: victim?.id ?? '' };
}

/** Whom to hunt: the nearest car still on the ring. */
function pickVictim(state: GameState, me: PlayerState): PlayerState | undefined {
  let best: PlayerState | undefined;
  let bestDist = Infinity;
  for (const p of sortedPlayers(state)) {
    if (!p.alive || p.id === me.id) continue;
    const dist = distance(me, p);
    if (dist < bestDist) {
      bestDist = dist;
      best = p;
    }
  }
  return best;
}

/** What the game loop applies for a bot this tick: a new input on decision ticks, null in between. */
export function botAct(state: GameState, id: string): CarInput | null {
  const me = state.players[id];
  if (!me) return null;
  if (state.tick % paramsFor(me).interval !== 0) return null;
  return botThink(state, id)?.input ?? null;
}
