import { describe, expect, it } from 'vitest';
import { BOT_EASY, BOT_HARD, BOT_MEDIUM, DEFAULT_TUNING, TUNING, addPlayer, createGameState, hash32, runTick, startMatch } from '../src';
import type { GameEvent, GameState, PlayerInput } from '../src';
import { numbersIn } from './helpers';

/** Two humans with scripted pseudo-random inputs plus three bots of every level. */
function newMatch(seed: string): GameState {
  const state = createGameState({ code: 'DET', seed });
  addPlayer(state, 'h1', 'Ana');
  addPlayer(state, 'h2', 'Ion');
  state.botLevel = BOT_EASY;
  addPlayer(state, 'b1', 'b1', true, BOT_EASY);
  addPlayer(state, 'b2', 'b2', true, BOT_MEDIUM);
  addPlayer(state, 'b3', 'b3', true, BOT_HARD);
  state.roundsTotal = 3;
  startMatch(state, 'h1');
  return state;
}

function humanInputs(state: GameState): PlayerInput[] {
  const t = state.tick;
  return ['h1', 'h2'].map((id, i) => {
    const h = hash32(Math.floor(t / 10), i);
    return { playerId: id, seq: t + 1, steer: (h % 201) - 100, throttle: ((h >>> 8) % 161) - 60, boost: (h >>> 16) % 37 === 0 };
  });
}

function play(state: GameState, ticks: number): GameEvent[] {
  const events: GameEvent[] = [];
  for (let i = 0; i < ticks && state.phase !== 'finished'; i++) events.push(...runTick(state, humanInputs(state)));
  return events;
}

describe('determinism', () => {
  it('the simulation runs with the default tuning (only the local ?tune panel may change it)', () => {
    expect(TUNING).toEqual(DEFAULT_TUNING);
  });

  it('same seed and inputs give a byte-identical state and identical events', () => {
    const a = newMatch('seed-1');
    const b = newMatch('seed-1');
    const ea = play(a, 6000);
    const eb = play(b, 6000);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(ea)).toBe(JSON.stringify(eb));
    expect(ea.some((e) => e.type === 'bump')).toBe(true);
    expect(ea.some((e) => e.type === 'out')).toBe(true);
  });

  it('a state that went through JSON (like the network) continues exactly like the original', () => {
    const a = newMatch('seed-2');
    play(a, 1500);
    const b = JSON.parse(JSON.stringify(a)) as GameState;
    play(a, 2000);
    play(b, 2000);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('different seeds play out differently', () => {
    const a = newMatch('seed-a');
    const b = newMatch('seed-b');
    play(a, 900);
    play(b, 900);
    expect(JSON.stringify(a.players)).not.toBe(JSON.stringify(b.players));
  });

  it('every number in the state stays a safe integer, even with fractional inputs', () => {
    const state = newMatch('seed-int');
    for (let i = 0; i < 5000 && state.phase !== 'finished'; i++) {
      const inputs = humanInputs(state).map((inp) => ({ ...inp, steer: inp.steer + 0.37, throttle: inp.throttle - 0.61 }));
      runTick(state, inputs);
      if (i % 50 === 0) {
        const bad = numbersIn(state).filter(([, v]) => !Number.isSafeInteger(v));
        expect(bad).toEqual([]);
      }
    }
    expect(numbersIn(state).filter(([, v]) => !Number.isSafeInteger(v))).toEqual([]);
  });
});
