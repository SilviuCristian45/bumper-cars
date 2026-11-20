import type { NetSimOptions } from './net/LagLine';

// Test options read from the page URL (see CLAUDE.md).

export const params = new URLSearchParams(window.location.search);

/** Options that skip the intro and menus and start a local match at once. */
const QUICK_KEYS = ['debug', 'bots', 'rounds', 'seed', 'botlevel', 'tune', 'powerups', 'pufreq'];
/** ?online (implied by ?lag, ?jitter and an invite ?room=) keeps the normal menus, so ?debug applies to online games. */
const keepMenus = ['online', 'lag', 'jitter', 'room'].some((key) => params.has(key));

export const quickStart = !keepMenus && QUICK_KEYS.some((key) => params.has(key));

/** ?debug: hitboxes, vectors, bot intents; online also ping and prediction numbers. */
export const debug = params.has('debug');

/** ?powerups=0: the quick-start match without power-ups (on otherwise, like a new room). */
export const quickPowerups = params.get('powerups') !== '0';

/** ?pufreq=1..5: how often power-ups appear in the quick-start match (as in a new room otherwise). */
export const quickPowerupFreq = params.has('pufreq') ? Number(params.get('pufreq')) : undefined;

/** ?lag=120&jitter=30: added round trip and random extra delay (ms) for online games. */
export const netSim: NetSimOptions = { lagMs: msParam('lag'), jitterMs: msParam('jitter') };

function msParam(key: string): number {
  const value = Number(params.get(key) ?? 0);
  return Number.isFinite(value) ? Math.min(2000, Math.max(0, Math.round(value))) : 0;
}
