import { describe, expect, it } from 'vitest';
import { nextInt, seedFrom } from '../src';

describe('rng', () => {
  it('repeats the same sequence for the same seed', () => {
    const a = { rng: seedFrom('balci') };
    const b = { rng: seedFrom('balci') };
    const seqA = Array.from({ length: 20 }, () => nextInt(a, 1000));
    const seqB = Array.from({ length: 20 }, () => nextInt(b, 1000));
    expect(seqA).toEqual(seqB);
  });
});
