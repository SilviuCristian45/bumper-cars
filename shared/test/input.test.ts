import { describe, expect, it } from 'vitest';
import { applyInput } from '../src';
import { makeRace, px, run } from './helpers';

describe('input', () => {
  it('clamps steer/throttle to integers in -100..100 and rejects garbage', () => {
    const state = makeRace([{ id: 'a' }, { id: 'b', x: px(100) }]);
    applyInput(state, { playerId: 'a', seq: 1, steer: 250.7, throttle: -33.9, boost: false });
    expect(state.players.a!.steer).toBe(100);
    expect(state.players.a!.throttle).toBe(-33);
    applyInput(state, { playerId: 'a', seq: 2, steer: NaN, throttle: Infinity, boost: false });
    expect(state.players.a!.steer).toBe(0);
    expect(state.players.a!.throttle).toBe(0);
    applyInput(state, { playerId: 'a', seq: 3, steer: '5' as unknown as number, throttle: 10, boost: 'yes' as unknown as boolean });
    expect(state.players.a!.steer).toBe(0);
    expect(state.players.a!.boostPressed).toBe(false);
  });

  it('holds the input until the next one', () => {
    const state = makeRace([{ id: 'a' }, { id: 'b', y: px(200) }]);
    applyInput(state, { playerId: 'a', seq: 1, steer: 0, throttle: 100, boost: false });
    run(state, 10);
    expect(state.players.a!.vx).toBeGreaterThan(0);
    expect(state.players.a!.throttle).toBe(100);
  });

  it('a boost press is consumed once', () => {
    const state = makeRace([{ id: 'a', x: -px(200) }, { id: 'b', y: px(200) }]);
    applyInput(state, { playerId: 'a', seq: 1, steer: 0, throttle: 0, boost: true });
    const first = run(state, 1);
    expect(first.filter((e) => e.type === 'boost')).toHaveLength(1);
    expect(state.players.a!.boostPressed).toBe(false);
  });

  it('records the last seq even for a car off the ring, and ignores unknown players', () => {
    const state = makeRace([{ id: 'a', alive: false }, { id: 'b' }, { id: 'c', x: px(100) }]);
    applyInput(state, { playerId: 'a', seq: 42, steer: 100, throttle: 100, boost: true });
    expect(state.players.a!.lastSeq).toBe(42);
    expect(state.players.a!.throttle).toBe(0);
    expect(() => applyInput(state, { playerId: 'zzz', seq: 1, steer: 0, throttle: 0, boost: false })).not.toThrow();
  });
});
