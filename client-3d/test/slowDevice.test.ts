import { describe, expect, it } from 'vitest';
import { SlowDeviceCheck } from '../src/SlowDeviceCheck';

/** Runs `seconds` of frames `gapMs` apart; returns the frame rates the check asked about. */
function run(check: SlowDeviceCheck, gapMs: number, seconds: number, canAsk = true): void {
  for (let t = 0; t < seconds * 1000; t += gapMs) check.frame(gapMs, canAsk);
}

describe('the 2D suggestion on slow devices', () => {
  it('asks once, after about 11 s, when the device draws fewer than 40 frames per second', () => {
    const asked: number[] = [];
    const check = new SlowDeviceCheck((fps) => asked.push(fps), () => false);
    run(check, 33, 10.5);
    expect(asked).toEqual([]);
    run(check, 33, 1);
    expect(asked).toEqual([30]);
    run(check, 33, 20);
    expect(asked).toEqual([30]);
  });

  it('never asks at 60 frames per second', () => {
    const asked: number[] = [];
    const check = new SlowDeviceCheck((fps) => asked.push(fps), () => false);
    run(check, 16.7, 30);
    expect(asked).toEqual([]);
  });

  it('waits for a moment outside a match, and does not count hidden time or stalls', () => {
    const asked: number[] = [];
    let hidden = true;
    const check = new SlowDeviceCheck((fps) => asked.push(fps), () => hidden);
    run(check, 33, 30, false);
    check.frame(5000, false);
    expect(asked).toEqual([]);
    hidden = false;
    run(check, 33, 12, false);
    expect(asked).toEqual([]);
    check.frame(33, true);
    expect(asked).toEqual([30]);
  });
});
