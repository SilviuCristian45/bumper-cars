import { describe, expect, it } from 'vitest';
import {
  ANGLE_STEPS,
  BOOST_COOLDOWN_TICKS,
  BOOST_MAX_SPEED,
  CAR_RADIUS,
  MAX_REVERSE_SPEED,
  MAX_SPEED,
  TICK_RATE,
} from '../src';
import { makeRace, px, run, speedOf } from './helpers';

describe('driving', () => {
  it('accelerates along the heading up to the top speed', () => {
    const state = makeRace([{ id: 'a', heading: ANGLE_STEPS / 4 }, { id: 'b', x: px(-200) }]); // facing +y (down)
    const a = state.players.a!;
    run(state, 10, { a: { throttle: 100 } });
    expect(a.vy).toBeGreaterThan(0);
    expect(Math.abs(a.vx)).toBeLessThanOrEqual(1);
    expect(a.y).toBeGreaterThan(0);
    run(state, 3 * TICK_RATE, { a: { throttle: 100 } });
    expect(speedOf(a)).toBeLessThan(MAX_SPEED + 1);
    expect(speedOf(a)).toBeGreaterThan(MAX_SPEED * 0.9);
  });

  it('coasts to exactly zero without throttle', () => {
    const state = makeRace([{ id: 'a', vx: MAX_SPEED }, { id: 'b', x: px(-200) }]);
    run(state, 20 * TICK_RATE);
    expect(state.players.a!.vx).toBe(0);
    expect(state.players.a!.vy).toBe(0);
  });

  it('turns on the spot, and faster when moving', () => {
    const still = makeRace([{ id: 'a' }, { id: 'b', x: px(-200) }]);
    run(still, 5, { a: { steer: 100 } });
    const moving = makeRace([{ id: 'a', vx: MAX_SPEED }, { id: 'b', x: px(-200) }]);
    run(moving, 5, { a: { steer: 100, throttle: 100 } });
    expect(still.players.a!.heading).toBeGreaterThan(0);
    expect(moving.players.a!.heading).toBeGreaterThan(still.players.a!.heading);
  });

  it('brakes, then reverses up to the reverse limit', () => {
    const state = makeRace([{ id: 'a', vx: MAX_SPEED }, { id: 'b', y: px(-200) }]);
    const a = state.players.a!;
    run(state, 8, { a: { throttle: -100 } });
    expect(a.vx).toBeLessThan(MAX_SPEED / 2);
    run(state, 4 * TICK_RATE, { a: { throttle: -100 } });
    expect(a.vx).toBeLessThan(0);
    expect(-a.vx).toBeLessThanOrEqual(MAX_REVERSE_SPEED);
  });

  it('boost shoves the car past the normal top speed, then needs the cooldown', () => {
    const state = makeRace([{ id: 'a', x: px(-300), vx: MAX_SPEED }, { id: 'b', y: px(-300) }]);
    const a = state.players.a!;
    const events = run(state, 1, { a: { throttle: 100, boost: true } });
    expect(events).toContainEqual({ type: 'boost', playerId: 'a' });
    run(state, 6, { a: { throttle: 100 } });
    expect(speedOf(a)).toBeGreaterThan(MAX_SPEED);
    expect(speedOf(a)).toBeLessThan(BOOST_MAX_SPEED + 1);
    expect(a.boostCooldown).toBeGreaterThan(0);
    // Pressing again during the cooldown does nothing.
    expect(run(state, 1, { a: { boost: true } }).some((e) => e.type === 'boost')).toBe(false);
    run(state, BOOST_COOLDOWN_TICKS);
    expect(run(state, 1, { a: { boost: true } }).some((e) => e.type === 'boost')).toBe(true);
  });

  it('slows back to the normal top speed after a boost', () => {
    const state = makeRace([{ id: 'a', x: px(-300), vx: MAX_SPEED }, { id: 'b', y: px(-300) }]);
    run(state, 1, { a: { throttle: 100, boost: true } });
    run(state, 2 * TICK_RATE, { a: { throttle: 100, steer: 30 } });
    expect(speedOf(state.players.a!)).toBeLessThan(MAX_SPEED + 1);
  });
});

describe('collisions', () => {
  const momentum = (cars: { vx: number; vy: number }[], masses: number[]) =>
    cars.reduce((m, c, i) => [m[0]! + c.vx * masses[i]!, m[1]! + c.vy * masses[i]!], [0, 0]);

  it('head-on with equal mass: they bounce back, momentum conserved up to rounding', () => {
    const gap = 2 * CAR_RADIUS + 10;
    const state = makeRace([
      { id: 'a', x: -gap / 2, vx: 1500 },
      { id: 'b', x: gap / 2, vx: -1500, heading: ANGLE_STEPS / 2 },
    ]);
    const before = momentum([state.players.a!, state.players.b!], [1, 1]);
    const events = run(state, 2);
    const a = state.players.a!;
    const b = state.players.b!;
    expect(a.vx).toBeLessThan(0);
    expect(b.vx).toBeGreaterThan(0);
    const after = momentum([a, b], [1, 1]);
    expect(Math.abs(after[0]! - before[0]!)).toBeLessThan(60); // friction + rounding over 2 ticks
    expect(events.some((e) => e.type === 'bump')).toBe(true);
  });

  it('a moving car hitting a still one passes most of its speed on (restitution < 1)', () => {
    const state = makeRace([
      { id: 'a', x: -2 * CAR_RADIUS - 500, vx: 1600 },
      { id: 'b', x: 0 },
    ]);
    run(state, 2);
    const a = state.players.a!;
    const b = state.players.b!;
    expect(b.vx).toBeGreaterThan(1300);
    expect(Math.abs(a.vx)).toBeLessThan(300);
    expect(b.lastHitBy).toBe('a');
    expect(a.lastHitBy).toBe('');
  });

  it('a boosting car is heavier: it keeps going and the other flies off faster', () => {
    const setup = (boost: boolean) => {
      const state = makeRace([
        { id: 'a', x: -2 * CAR_RADIUS - 2000, vx: 1800, boostTicks: boost ? 8 : 0 },
        { id: 'b', x: 0 },
      ]);
      run(state, 2);
      return state;
    };
    const plain = setup(false);
    const boosted = setup(true);
    expect(boosted.players.a!.vx).toBeGreaterThan(plain.players.a!.vx + 300);
    expect(boosted.players.b!.vx).toBeGreaterThan(plain.players.b!.vx);
  });

  it('never leaves cars overlapping, even when spawned on top of each other', () => {
    const state = makeRace([{ id: 'a' }, { id: 'b' }, { id: 'c', x: 100, y: 50 }]);
    run(state, 3);
    const cars = Object.values(state.players);
    for (let i = 0; i < cars.length; i++) {
      for (let j = i + 1; j < cars.length; j++) {
        const d = Math.hypot(cars[i]!.x - cars[j]!.x, cars[i]!.y - cars[j]!.y);
        expect(d).toBeGreaterThanOrEqual(2 * CAR_RADIUS - 300);
      }
    }
  });

  it('cars resting side by side do not push each other', () => {
    const state = makeRace([{ id: 'a', x: -CAR_RADIUS }, { id: 'b', x: CAR_RADIUS }]);
    const events = run(state, 10);
    expect(state.players.a!.x).toBe(-CAR_RADIUS);
    expect(state.players.b!.x).toBe(CAR_RADIUS);
    expect(events.filter((e) => e.type === 'bump')).toEqual([]);
  });

  it('a hit from the side sends the car sliding (low grip right after a hit)', () => {
    const state = makeRace([
      { id: 'a', y: -2 * CAR_RADIUS - 500, vy: 1800, heading: ANGLE_STEPS / 4 },
      { id: 'b', heading: 0 }, // facing +x, hit on its side
    ]);
    run(state, 2);
    expect(state.players.b!.slideTicks).toBeGreaterThan(0);
    const y0 = state.players.b!.y;
    run(state, 30);
    expect(state.players.b!.y - y0).toBeGreaterThan(px(60));
  });
});
