import { afterEach, describe, expect, it } from 'vitest';
import { applyGameTuning, DEFAULT_TUNING, setTuning, TUNING } from '../src';

const saved = { accel: DEFAULT_TUNING.accel + 40, grip: DEFAULT_TUNING.grip - 20 };

describe('game tuning', () => {
  afterEach(() => setTuning(DEFAULT_TUNING));

  it('applies the saved ?tune values only to a local game with ?tune', () => {
    applyGameTuning({ online: false, tune: true, saved });
    expect(TUNING).toEqual({ ...DEFAULT_TUNING, ...saved });
  });

  it('ignores the saved values without ?tune', () => {
    applyGameTuning({ online: false, tune: false, saved });
    expect(TUNING).toEqual(DEFAULT_TUNING);
  });

  it('resets to the defaults for an online game, even with ?tune and values already applied', () => {
    applyGameTuning({ online: false, tune: true, saved });
    applyGameTuning({ online: true, tune: true, saved });
    expect(TUNING).toEqual(DEFAULT_TUNING);
  });

  it('a later local game without ?tune starts from the defaults again', () => {
    applyGameTuning({ online: false, tune: true, saved });
    applyGameTuning({ online: false, tune: false, saved: null });
    expect(TUNING).toEqual(DEFAULT_TUNING);
  });
});
