import { DEFAULT_ROUNDS, MAX_PLAYERS, ROUND_OPTIONS } from '@masinute/shared';
import { parseBotLevel } from '@client/botLevels';
import { isTouch } from '@client/device';
import type { LocalOptions } from '@client/net/LocalTransport';

// URL options of the 3D probe: the 2D quick-start ones (?bots, ?seed, ?botlevel, ?rounds, ?powerups,
// ?pufreq; ?touch is read by device.ts) plus ?perf (numbers overlay) and ?quality=low|high.

const params = new URLSearchParams(window.location.search);

export type Quality = 'low' | 'high';

/** ?quality=low|high; phones and tablets default to low. */
export const quality: Quality = ((): Quality => {
  const q = params.get('quality');
  if (q === 'low' || q === 'high') return q;
  return isTouch ? 'low' : 'high';
})();

/** ?perf: FPS, frame time, draw calls, triangles. */
export const perf = params.has('perf');

/** The local match to start; a new random seed for every "one more match" unless ?seed is given. */
export function localOptions(): LocalOptions {
  const bots = Math.min(MAX_PLAYERS - 1, Math.max(1, Number(params.get('bots') ?? 3) || 3));
  const rounds = Number(params.get('rounds'));
  return {
    name: 'Jucător',
    bots,
    botLevel: parseBotLevel(params.get('botlevel')),
    rounds: ROUND_OPTIONS.includes(rounds) ? rounds : DEFAULT_ROUNDS,
    powerups: params.get('powerups') !== '0',
    powerupFreq: params.has('pufreq') ? Number(params.get('pufreq')) : undefined,
    seed: params.get('seed') ?? Math.random().toString(36).slice(2),
    autoStart: true,
  };
}
