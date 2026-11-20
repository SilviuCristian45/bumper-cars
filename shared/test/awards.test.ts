import { describe, expect, it } from 'vitest';
import { addPlayer, computeAwards, createGameState, PU_MICI, startMatch, type GameState, type PlayerState } from '../src';
import { makeRace, px, run } from './helpers';

/** A finished match with the given stats per player (in slot order). */
function finished(stats: Partial<PlayerState>[]): GameState {
  const state = createGameState({ code: 'AWARD', seed: 1 });
  stats.forEach((_, i) => addPlayer(state, `p${i}`, `P${i}`));
  state.hostId = 'p0';
  startMatch(state, 'p0');
  stats.forEach((s, i) => Object.assign(state.players[`p${i}`]!, s));
  state.phase = 'finished';
  return state;
}

const byId = (state: GameState) => Object.fromEntries(computeAwards(state).map((a) => [a.id, a]));

describe('awards', () => {
  it('gives each award to whoever earned it, with the value', () => {
    const state = finished([
      { knockouts: 4, selfOuts: 0, outs: 1, bumps: 30, pickups: 1 },
      { knockouts: 1, selfOuts: 3, outs: 4, bumps: 12, pickups: 5 },
      { knockouts: 2, selfOuts: 1, outs: 2, bumps: 41, pickups: 0 },
    ]);
    expect(computeAwards(state)).toEqual([
      { id: 'batausul', playerIds: ['p0'], value: 4 },
      { id: 'kamikaze', playerIds: ['p1'], value: 3 },
      { id: 'neclintitul', playerIds: ['p0'], value: 1 },
      { id: 'ciocanarul', playerIds: ['p2'], value: 41 },
      { id: 'colectionarul', playerIds: ['p1'], value: 5 },
    ]);
  });

  it('lists everyone tied for an award, in slot order', () => {
    const awards = byId(finished([{ knockouts: 2 }, { knockouts: 0 }, { knockouts: 2 }]));
    expect(awards.batausul).toEqual({ id: 'batausul', playerIds: ['p0', 'p2'], value: 2 });
  });

  it('gives no "most" award for zero, and none when everyone ties', () => {
    const awards = byId(finished([{ outs: 2, pickups: 0 }, { outs: 2, pickups: 0 }]));
    expect(awards.colectionarul).toBeUndefined(); // nobody picked anything up (power-ups off)
    expect(awards.kamikaze).toBeUndefined();
    expect(awards.neclintitul).toBeUndefined(); // everyone fell twice
  });

  it('keeps players who left out of Neclintitul (they stopped falling by leaving)', () => {
    const awards = byId(finished([{ outs: 3 }, { outs: 0, left: true }, { outs: 1 }]));
    expect(awards.neclintitul).toEqual({ id: 'neclintitul', playerIds: ['p2'], value: 1 });
  });

  it('needs at least two players', () => {
    expect(computeAwards(finished([{ knockouts: 3 }]))).toEqual([]);
  });
});

describe('pickups', () => {
  it('counts power-ups picked up, and starts again at 0 in a new match', () => {
    const state = makeRace([{ id: 'a' }, { id: 'b', x: px(250) }]);
    Object.assign(state, { powerups: true, puTimer: 1_000_000, pu0Kind: PU_MICI, pu0X: 0, pu0Y: 0, pu0Ticks: 100 });
    run(state, 1);
    expect(state.players.a!.pickups).toBe(1);
    Object.assign(state, { pu0Kind: PU_MICI, pu0X: 0, pu0Y: 0, pu0Ticks: 100 });
    run(state, 1);
    expect(state.players.a!.pickups).toBe(2);
    state.phase = 'lobby';
    startMatch(state, 'a');
    expect(state.players.a!.pickups).toBe(0);
  });
});
