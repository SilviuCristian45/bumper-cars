import {
  COUNTDOWN_TICKS,
  HIT_CREDIT_TICKS,
  INPUT_MAX,
  INTERMISSION_TICKS,
  POINTS_KNOCKOUT,
  POINTS_ROUND_WIN,
  POINTS_SELF_OUT,
  RING_MIN_RADIUS,
  RING_RADIUS,
  ROUND_TIME_LIMIT_TICKS,
  SHRINK_DURATION_TICKS,
  SHRINK_START_TICKS,
  TICK_RATE,
  BOOST_COOLDOWN_TICKS,
  BOOST_TICKS,
} from './constants';
import { clamp, idiv } from './fixed';
import { computeStandings, sortedPlayers, startRound } from './match';
import { collide, driveCar, isOutside } from './physics';
import { powerupsAfterCollide, powerupsBeforeDrive, rescue } from './powerups';
import type { GameEvent, GameState, PlayerInput, PlayerState, RoundOutcome } from './types';

/** Whole seconds left in the "3, 2, 1" countdown (0 once START has been shown). */
export function countdownSeconds(roundTick: number): number {
  return Math.max(0, Math.ceil((COUNTDOWN_TICKS - roundTick) / TICK_RATE));
}

/** Ticks of actual fighting so far this round (the countdown excluded). */
export function fightTicks(roundTick: number): number {
  return Math.max(0, roundTick - COUNTDOWN_TICKS);
}

/** Ring radius at a given round tick: full for 45 s of fighting, then linear down to the minimum. */
export function ringRadiusAt(roundTick: number): number {
  const shrinking = clamp(fightTicks(roundTick) - SHRINK_START_TICKS, 0, SHRINK_DURATION_TICKS);
  return RING_RADIUS - idiv((RING_RADIUS - RING_MIN_RADIUS) * shrinking, SHRINK_DURATION_TICKS);
}

/** Seconds of fighting left before the round's time limit, for the HUD. */
export function secondsLeft(roundTick: number): number {
  return Math.max(0, Math.ceil((ROUND_TIME_LIMIT_TICKS - fightTicks(roundTick)) / TICK_RATE));
}

/** Normalizes one untrusted axis value to an integer in [-INPUT_MAX, INPUT_MAX]. */
function axis(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? clamp(Math.trunc(v), -INPUT_MAX, INPUT_MAX) : 0;
}

/**
 * The only way players affect the game: steer and throttle are held until the next input,
 * a boost press is latched and consumed on the next tick. Inputs of cars off the ring still
 * advance lastSeq so the client can drop them from its prediction buffer.
 */
export function applyInput(state: GameState, input: PlayerInput): void {
  const p = state.players[input.playerId];
  if (!p) return;
  if (typeof input.seq === 'number' && Number.isInteger(input.seq)) p.lastSeq = input.seq;
  if (!p.alive) return;
  p.steer = axis(input.steer);
  p.throttle = axis(input.throttle);
  if (input.boost === true) p.boostPressed = true;
}

/** Advances the simulation by one fixed tick. Returns what happened, for sound/effects. */
export function step(state: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  state.tick++;

  if (state.phase === 'intermission') {
    state.phaseTimer--;
    if (state.phaseTimer <= 0) {
      state.round++;
      startRound(state);
      events.push({ type: 'roundStart', round: state.round });
    }
    return events;
  }
  if (state.phase !== 'playing') return events;

  state.roundTick++;
  const players = sortedPlayers(state);
  // During the countdown held steering is kept for START, but nobody moves and boosts are dropped.
  if (state.roundTick <= COUNTDOWN_TICKS) {
    for (const p of players) p.boostPressed = false;
    checkRoundEnd(state, events);
    return events;
  }
  const fight = fightTicks(state.roundTick);
  if (fight === 1) events.push({ type: 'go', round: state.round });
  if (fight === SHRINK_START_TICKS + 1) events.push({ type: 'shrinkStart' });
  state.ringRadius = ringRadiusAt(state.roundTick);

  const racing = players.filter((p) => p.alive);
  const oiled = powerupsBeforeDrive(state, players, events);
  for (const p of racing) {
    if (p.boostCooldown > 0) p.boostCooldown--;
    if (p.boostPressed) {
      p.boostPressed = false;
      if (p.boostCooldown === 0) {
        p.boostTicks = BOOST_TICKS;
        p.boostCooldown = BOOST_COOLDOWN_TICKS;
        events.push({ type: 'boost', playerId: p.id });
      }
    }
    driveCar(p, oiled.has(p.id));
  }
  for (let i = 0; i < racing.length; i++) {
    for (let j = i + 1; j < racing.length; j++) collide(racing[i]!, racing[j]!, state.tick, events);
  }
  powerupsAfterCollide(state, players, events);
  for (const p of racing) {
    if (isOutside(p, state.ringRadius) && !rescue(state, p, events)) eliminate(state, p, events);
  }

  if (fight >= ROUND_TIME_LIMIT_TICKS && state.phase === 'playing') endRound(state, 'timeout', events);
  else checkRoundEnd(state, events);
  return events;
}

/** Off the ring: +1 to the last car that hit them within 3 s, otherwise -1 to themselves. */
function eliminate(state: GameState, p: PlayerState, events: GameEvent[]): void {
  p.alive = false;
  p.outs++;
  p.boostTicks = 0;
  p.boostPressed = false;
  const hitter =
    p.lastHitBy && state.tick - p.lastHitTick <= HIT_CREDIT_TICKS ? state.players[p.lastHitBy] : undefined;
  if (hitter && hitter.id !== p.id) {
    hitter.knockouts++;
    // Pudră proteică: counted for the "Uriașul" award.
    if (hitter.sizePct > 100) hitter.giantKnockouts++;
    hitter.points += POINTS_KNOCKOUT;
    events.push({ type: 'out', playerId: p.id, byId: hitter.id });
  } else {
    p.selfOuts++;
    p.points += POINTS_SELF_OUT;
    events.push({ type: 'out', playerId: p.id, byId: '' });
  }
}

/** One car left wins (+3); nobody left (the last ones went out on the same tick) is a draw. */
function checkRoundEnd(state: GameState, events: GameEvent[]): void {
  const alive = Object.values(state.players).filter((p) => p.alive);
  if (alive.length > 1) return;
  if (alive.length === 1) endRound(state, 'win', events, alive[0]);
  else endRound(state, 'draw', events);
}

function endRound(state: GameState, outcome: RoundOutcome, events: GameEvent[], winner?: PlayerState): void {
  state.roundOutcome = outcome;
  state.roundWinner = winner ? winner.id : '';
  if (winner) {
    winner.wins++;
    winner.points += POINTS_ROUND_WIN;
  }
  for (const p of Object.values(state.players)) {
    p.steer = 0;
    p.throttle = 0;
    p.boostPressed = false;
    p.boostTicks = 0;
  }
  events.push({ type: 'roundEnd', round: state.round, winnerId: state.roundWinner, outcome });

  if (state.round >= state.roundsTotal) {
    state.phase = 'finished';
    events.push({ type: 'matchEnd', standings: computeStandings(state) });
  } else {
    state.phase = 'intermission';
    state.phaseTimer = INTERMISSION_TICKS;
  }
}
