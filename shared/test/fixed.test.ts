import { describe, expect, it } from 'vitest';
import { ANGLE_STEPS, TRIG_ONE, angleDiff, iatan2, icos, idiv, isin, isqrt, wrapAngle } from '../src';

describe('fixed-point math', () => {
  it('sine table matches Math.sin within rounding, all around the circle', () => {
    for (let a = -ANGLE_STEPS; a <= 2 * ANGLE_STEPS; a++) {
      const rad = (a * 2 * Math.PI) / ANGLE_STEPS;
      expect(Math.abs(isin(a) - Math.sin(rad) * TRIG_ONE)).toBeLessThanOrEqual(1);
      expect(Math.abs(icos(a) - Math.cos(rad) * TRIG_ONE)).toBeLessThanOrEqual(1);
    }
  });

  it('wraps angles into [0, ANGLE_STEPS)', () => {
    expect(wrapAngle(-1)).toBe(ANGLE_STEPS - 1);
    expect(wrapAngle(ANGLE_STEPS)).toBe(0);
    expect(wrapAngle(-3 * ANGLE_STEPS + 5)).toBe(5);
  });

  it('isqrt is the exact integer square root', () => {
    for (const n of [0, 1, 2, 3, 4, 15, 16, 17, 99, 100, 101, 2 ** 40 - 1, 2 ** 40, 1e15 + 7]) {
      const r = isqrt(n);
      expect(r * r).toBeLessThanOrEqual(n);
      expect((r + 1) * (r + 1)).toBeGreaterThan(n);
    }
  });

  it('idiv truncates toward zero', () => {
    expect(idiv(7, 2)).toBe(3);
    expect(idiv(-7, 2)).toBe(-3);
    expect(idiv(-1, 1000)).toBe(0);
  });

  it('iatan2 is within one step of Math.atan2', () => {
    for (let i = 0; i < 2000; i++) {
      const x = Math.round(Math.cos(i * 1.7) * (1 + (i % 97)) * 1000);
      const y = Math.round(Math.sin(i * 2.3) * (1 + (i % 89)) * 1000);
      if (x === 0 && y === 0) continue;
      const exact = (Math.atan2(y, x) / (2 * Math.PI)) * ANGLE_STEPS;
      expect(Math.abs(angleDiff(iatan2(y, x), Math.round(exact)))).toBeLessThanOrEqual(1);
    }
  });

  it('angleDiff takes the short way around', () => {
    expect(angleDiff(10, 20)).toBe(10);
    expect(angleDiff(1020, 4)).toBe(8);
    expect(angleDiff(4, 1020)).toBe(-8);
  });
});
