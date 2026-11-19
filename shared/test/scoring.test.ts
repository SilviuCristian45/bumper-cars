import { describe, expect, it } from 'vitest';
import { CAR_RADIUS, HIT_CREDIT_TICKS, MAX_SPEED, RING_RADIUS, ROUND_TIME_LIMIT_TICKS } from '../src';
import { makeRace, px, run } from './helpers';

const EDGE = RING_RADIUS - 100;

describe('scoring', () => {
  it('pushing someone off the ring gives +1 to the hitter, nothing lost by the victim', () => {
    const state = makeRace([
      { id: 'a', x: EDGE - 2 * CAR_RADIUS - 600, vx: MAX_SPEED },
      { id: 'b', x: EDGE - px(20) },
      { id: 'c', x: -px(200) },
    ]);
    const events = run(state, 40);
    expect(events).toContainEqual({ type: 'out', playerId: 'b', byId: 'a' });
    expect(state.players.a!.points).toBe(1);
    expect(state.players.a!.knockouts).toBe(1);
    expect(state.players.b!.points).toBe(0);
    expect(state.players.b!.selfOuts).toBe(0);
  });

  it('the knockout is credited exactly up to 3 s after the hit', () => {
    const credited = makeRace([{ id: 'a', x: -px(100) }, { id: 'b', x: EDGE + 99, vx: 300 }, { id: 'c', y: px(100) }]);
    credited.players.b!.lastHitBy = 'a';
    credited.players.b!.lastHitTick = credited.tick + 1 - HIT_CREDIT_TICKS;
    run(credited, 1);
    expect(credited.players.a!.points).toBe(1);
    expect(credited.players.b!.points).toBe(0);

    const late = makeRace([{ id: 'a', x: -px(100) }, { id: 'b', x: EDGE + 99, vx: 300 }, { id: 'c', y: px(100) }]);
    late.players.b!.lastHitBy = 'a';
    late.players.b!.lastHitTick = late.tick - HIT_CREDIT_TICKS;
    const events = run(late, 1);
    expect(events).toContainEqual({ type: 'out', playerId: 'b', byId: '' });
    expect(late.players.a!.points).toBe(0);
    expect(late.players.b!.points).toBe(-1);
  });

  it('driving off the ring on your own costs 1 point', () => {
    const state = makeRace([{ id: 'a', x: EDGE - px(50) }, { id: 'b', x: -px(100) }, { id: 'c', y: px(100) }]);
    const events = run(state, 60, { a: { throttle: 100 } });
    expect(events).toContainEqual({ type: 'out', playerId: 'a', byId: '' });
    expect(state.players.a!.points).toBe(-1);
    expect(state.players.a!.selfOuts).toBe(1);
    expect(state.players.a!.outs).toBe(1);
  });

  it('the last car on the ring wins the round (+3)', () => {
    const state = makeRace([
      { id: 'a', x: EDGE - px(30) },
      { id: 'b', x: -EDGE + px(30), heading: 512 },
      { id: 'c' },
    ]);
    const events = run(state, 90, { a: { throttle: 100 }, b: { throttle: 100 } });
    expect(events).toContainEqual({ type: 'roundEnd', round: 1, winnerId: 'c', outcome: 'win' });
    expect(state.players.c!.points).toBe(3);
    expect(state.players.c!.wins).toBe(1);
    expect(state.roundOutcome).toBe('win');
    expect(state.phase).toBe('intermission');
  });

  it('when the last cars go out on the same tick nobody gets +3, but +1/-1 still apply', () => {
    const state = makeRace([
      { id: 'a', x: EDGE + 99, vx: 300 },
      { id: 'b', x: -EDGE - 99, vx: -300 },
      { id: 'c', alive: false },
    ]);
    // b was hit by a just now, a was not hit by anyone.
    state.players.b!.lastHitBy = 'a';
    state.players.b!.lastHitTick = state.tick;
    const events = run(state, 1);
    expect(events).toContainEqual({ type: 'roundEnd', round: 1, winnerId: '', outcome: 'draw' });
    expect(state.roundWinner).toBe('');
    expect(state.players.a!.points).toBe(1 - 1); // knockout of b, own fall
    expect(state.players.b!.points).toBe(0);
    expect(state.players.a!.wins + state.players.b!.wins + state.players.c!.wins).toBe(0);
  });

  it('a round that reaches the 90 s limit ends without a winner', () => {
    const state = makeRace([{ id: 'a', x: -px(30) }, { id: 'b', x: px(30) }]);
    const events = run(state, ROUND_TIME_LIMIT_TICKS);
    expect(events).toContainEqual({ type: 'roundEnd', round: 1, winnerId: '', outcome: 'timeout' });
    expect(state.players.a!.points).toBe(0);
    expect(state.players.b!.points).toBe(0);
    expect(state.players.a!.alive && state.players.b!.alive).toBe(true);
  });

  it('the round limit always ends the round, even if nobody moves', () => {
    const state = makeRace([{ id: 'a', x: -px(30) }, { id: 'b', x: px(30) }]);
    run(state, ROUND_TIME_LIMIT_TICKS - 1);
    expect(state.phase).toBe('playing');
    run(state, 1);
    expect(state.phase).toBe('intermission');
  });
});
