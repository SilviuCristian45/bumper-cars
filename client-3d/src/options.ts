import { DEFAULT_ROUNDS, MAX_PLAYERS, ROUND_OPTIONS } from '@masinute/shared';
import { parseBotLevel } from '@client/botLevels';
import type { LocalOptions } from '@client/net/LocalTransport';

// URL options of the 3D client besides the 2D ones (client/src/urlOptions.ts): ?perf, and ?quality (settings3d.ts).
// The quick-start match (?bots, ?seed, ?botlevel, ?rounds, ?powerups, ?pufreq) is set up here as in 2D.

const params = new URLSearchParams(window.location.search);

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
