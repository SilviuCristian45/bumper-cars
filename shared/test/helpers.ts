import { COUNTDOWN_TICKS, FP, addPlayer, createGameState, runTick, startMatch } from '../src';
import type { CarInput, GameEvent, GameState, PlayerState } from '../src';

export const px = (n: number) => n * FP;

export type CarSetup = Partial<PlayerState> & { id: string };

/**
 * A round in progress right after the countdown (the next step is the first fighting tick),
 * with the given cars placed exactly. Cars default to standing still at the center facing +x.
 */
export function makeRace(cars: CarSetup[], opts: { seed?: string; rounds?: number } = {}): GameState {
  const state = createGameState({ code: 'TEST', seed: opts.seed ?? 'test' });
  for (const c of cars) addPlayer(state, c.id, c.name ?? c.id, c.isBot ?? false, c.botLevel);
  state.hostId = cars[0]!.id;
  state.roundsTotal = opts.rounds ?? 3;
  startMatch(state, cars[0]!.id);
  for (const c of cars) Object.assign(state.players[c.id]!, { x: 0, y: 0, vx: 0, vy: 0, heading: 0 }, c);
  state.roundTick = COUNTDOWN_TICKS;
  return state;
}

/** Steps `ticks` times with the same held input for the given players; collects all events. */
export function run(state: GameState, ticks: number, inputs: Record<string, Partial<CarInput>> = {}): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks; i++) {
    const list = Object.entries(inputs).map(([playerId, inp]) => ({
      playerId,
      seq: state.tick + 1,
      steer: inp.steer ?? 0,
      throttle: inp.throttle ?? 0,
      boost: inp.boost ?? false,
    }));
    events.push(...runTick(state, list));
  }
  return events;
}

/** Every number anywhere in the value, with its path. */
export function numbersIn(value: unknown, path = 'state'): [string, number][] {
  if (typeof value === 'number') return [[path, value]];
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([k, v]) => numbersIn(v, `${path}.${k}`));
  }
  return [];
}

export function speedOf(p: PlayerState): number {
  return Math.sqrt(p.vx * p.vx + p.vy * p.vy);
}
