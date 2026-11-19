import { describe, expect, it } from 'vitest';
import {
  COUNTDOWN_TICKS,
  RING_MIN_RADIUS,
  RING_RADIUS,
  SHRINK_DURATION_TICKS,
  SHRINK_START_TICKS,
  ringRadiusAt,
} from '../src';
import { makeRace, px, run } from './helpers';

describe('ring', () => {
  it('stays full for 45 s of fighting (countdown excluded), then shrinks steadily to the minimum', () => {
    expect(ringRadiusAt(0)).toBe(RING_RADIUS);
    expect(ringRadiusAt(COUNTDOWN_TICKS + SHRINK_START_TICKS)).toBe(RING_RADIUS);
    expect(ringRadiusAt(COUNTDOWN_TICKS + SHRINK_START_TICKS + 1)).toBeLessThan(RING_RADIUS);
    expect(ringRadiusAt(COUNTDOWN_TICKS + SHRINK_START_TICKS + SHRINK_DURATION_TICKS)).toBe(RING_MIN_RADIUS);
    expect(ringRadiusAt(COUNTDOWN_TICKS + 10 * SHRINK_DURATION_TICKS)).toBe(RING_MIN_RADIUS);
    let prev = RING_RADIUS;
    for (let t = 0; t < COUNTDOWN_TICKS + SHRINK_START_TICKS + SHRINK_DURATION_TICKS + 30; t++) {
      const r = ringRadiusAt(t);
      expect(r).toBeLessThanOrEqual(prev);
      prev = r;
    }
  });

  it('minimum radius is about two car diameters', () => {
    expect(RING_MIN_RADIUS).toBeGreaterThanOrEqual(px(80));
  });

  it('a car whose center crosses the edge is out; one exactly on the edge is not', () => {
    const state = makeRace([
      { id: 'a', x: RING_RADIUS, vx: 0 },
      { id: 'b', x: -RING_RADIUS + 50, vx: -200 },
      { id: 'c' },
    ]);
    const events = run(state, 1);
    expect(state.players.a!.alive).toBe(true);
    expect(state.players.b!.alive).toBe(false);
    expect(events).toContainEqual({ type: 'out', playerId: 'b', byId: '' });
  });

  it('announces the shrink and pushes out cars parked near the edge', () => {
    const state = makeRace([
      { id: 'a', x: RING_RADIUS - px(5) },
      { id: 'b' },
      { id: 'c', x: px(100) },
    ]);
    const events = run(state, SHRINK_START_TICKS + 30);
    expect(events).toContainEqual({ type: 'shrinkStart' });
    expect(state.ringRadius).toBeLessThan(RING_RADIUS);
    expect(state.players.a!.alive).toBe(false);
    expect(state.players.a!.points).toBe(-1);
    expect(state.players.b!.alive).toBe(true);
  });
});
