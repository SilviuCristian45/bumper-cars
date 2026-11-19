import { describe, expect, it } from 'vitest';
import {
  CAR_RADIUS,
  COUNTDOWN_TICKS,
  INTERMISSION_TICKS,
  RING_RADIUS,
  SPAWN_RADIUS,
  TICK_RATE,
  addPlayer,
  backToLobby,
  countdownSeconds,
  createGameState,
  leavePlayer,
  runTick,
  startMatch,
} from '../src';
import type { GameEvent, GameState } from '../src';
import { makeRace, px, run } from './helpers';

function lobbyWith(n: number): GameState {
  const state = createGameState({ code: 'RND', seed: 'rounds' });
  for (let i = 1; i <= n; i++) addPlayer(state, `p${i}`, `P${i}`);
  return state;
}

describe('round flow', () => {
  it('"3, 2, 1, START!": cars are frozen, boosts dropped, then they go', () => {
    const state = lobbyWith(3);
    startMatch(state, 'p1');
    expect(countdownSeconds(state.roundTick)).toBe(3);
    const start = { x: state.players.p1!.x, y: state.players.p1!.y };
    const events = run(state, COUNTDOWN_TICKS, { p1: { throttle: 100, boost: true } });
    expect(state.players.p1!.x).toBe(start.x);
    expect(state.players.p1!.y).toBe(start.y);
    expect(events.some((e) => e.type === 'boost' || e.type === 'go')).toBe(false);
    expect(countdownSeconds(state.roundTick)).toBe(0);
    const go = run(state, 1, { p1: { throttle: 100 } });
    expect(go).toContainEqual({ type: 'go', round: 1 });
    expect(state.players.p1!.x !== start.x || state.players.p1!.y !== start.y).toBe(true);
  });

  it('countdown seconds tick down 3, 2, 1', () => {
    expect(countdownSeconds(1)).toBe(3);
    expect(countdownSeconds(TICK_RATE)).toBe(2);
    expect(countdownSeconds(2 * TICK_RATE + 1)).toBe(1);
    expect(countdownSeconds(COUNTDOWN_TICKS)).toBe(0);
  });

  it('spawns cars evenly on the spawn circle, facing the center, without touching', () => {
    const state = lobbyWith(6);
    startMatch(state, 'p1');
    const cars = Object.values(state.players);
    for (const p of cars) {
      expect(Math.abs(Math.hypot(p.x, p.y) - SPAWN_RADIUS)).toBeLessThan(px(1));
      // Facing the center: heading vector points against the position vector.
      const hx = Math.cos((p.heading * 2 * Math.PI) / 1024);
      const hy = Math.sin((p.heading * 2 * Math.PI) / 1024);
      expect((hx * p.x + hy * p.y) / Math.hypot(p.x, p.y)).toBeLessThan(-0.99);
    }
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        expect(Math.hypot(cars[i]!.x - cars[j]!.x, cars[i]!.y - cars[j]!.y)).toBeGreaterThan(4 * CAR_RADIUS);
      }
    }
  });

  it('after the intermission the next round starts fresh: everyone back, full ring', () => {
    const state = makeRace([{ id: 'a', x: RING_RADIUS - 50, vx: 300 }, { id: 'b' }]);
    const end = run(state, 1);
    expect(end.some((e) => e.type === 'roundEnd')).toBe(true);
    expect(state.phase).toBe('intermission');
    const next = run(state, INTERMISSION_TICKS);
    expect(next).toContainEqual({ type: 'roundStart', round: 2 });
    expect(state.phase).toBe('playing');
    expect(state.roundTick).toBe(0);
    expect(state.ringRadius).toBe(RING_RADIUS);
    expect(state.players.a!.alive && state.players.b!.alive).toBe(true);
    expect(state.players.b!.points).toBe(3);
  });

  it('the match ends after the chosen number of rounds, with standings', () => {
    const state = makeRace([{ id: 'a', x: RING_RADIUS - 50, vx: 300 }, { id: 'b' }], { rounds: 3 });
    const events: GameEvent[] = [];
    for (let i = 0; i < 20000 && state.phase !== 'finished'; i++) {
      // Cars spawn facing the center: a reverses straight off the ring every round, b wins them all.
      events.push(...runTick(state, [{ playerId: 'a', seq: i, steer: 0, throttle: -100, boost: false }]));
    }
    expect(state.phase).toBe('finished');
    expect(state.round).toBe(3);
    const end = events.find((e) => e.type === 'matchEnd');
    expect(end).toBeDefined();
    if (end?.type === 'matchEnd') expect(end.standings).toEqual(['b', 'a']);
    expect(state.players.b!.points).toBe(9);
    expect(state.players.a!.points).toBe(-3);
    expect(backToLobby(state, 'a')).toBe(true);
    expect(state.phase).toBe('lobby');
  });

  it('a player leaving mid-round goes out without points; if one car is left it wins', () => {
    const state = makeRace([{ id: 'a' }, { id: 'b', x: px(100) }]);
    const out = leavePlayer(state, 'b');
    expect(out).toEqual([{ type: 'out', playerId: 'b', byId: '' }]);
    expect(state.players.b!.points).toBe(0);
    const events = run(state, 1);
    expect(events).toContainEqual({ type: 'roundEnd', round: 1, winnerId: 'a', outcome: 'win' });
  });
});
