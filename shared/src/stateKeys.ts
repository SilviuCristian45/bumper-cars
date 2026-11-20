import type { GameState, PlayerState } from './types';

// Every field of the state, listed once: the server mirrors exactly these into the Colyseus
// schema and the client rebuilds exactly these, so its prediction steps from the same state the
// server has (a test checks that the lists match createGameState/addPlayer).

export const GAME_STATE_KEYS = [
  'code',
  'phase',
  'hostId',
  'roundsTotal',
  'botLevel',
  'round',
  'tick',
  'roundTick',
  'phaseTimer',
  'roundWinner',
  'roundOutcome',
  'ringRadius',
  'rng',
  'joinCounter',
  'powerups',
  'puFreq',
  'puTimer',
  'pu0Kind',
  'pu0X',
  'pu0Y',
  'pu0Ticks',
  'pu1Kind',
  'pu1X',
  'pu1Y',
  'pu1Ticks',
] as const satisfies readonly Exclude<keyof GameState, 'players'>[];

export const PLAYER_STATE_KEYS = [
  'id',
  'name',
  'slot',
  'joinOrder',
  'isBot',
  'botLevel',
  'connected',
  'left',
  'alive',
  'x',
  'y',
  'vx',
  'vy',
  'heading',
  'steer',
  'throttle',
  'boostPressed',
  'lastSeq',
  'boostTicks',
  'boostCooldown',
  'slideTicks',
  'lastHitBy',
  'lastHitTick',
  'wins',
  'knockouts',
  'selfOuts',
  'outs',
  'points',
  'bumps',
  'pickups',
  'giantKnockouts',
  'effect',
  'effectTicks',
  'confusedTicks',
  'oilX',
  'oilY',
  'oilTicks',
  'sizePct',
  'ghostFade',
  'idle',
] as const satisfies readonly (keyof PlayerState)[];

/** The decoded schema as the Colyseus SDK hands it over: players in a MapSchema. */
export interface RemoteCollection<T> {
  forEach(cb: (value: T) => void): void;
}
export type RemoteState = Omit<GameState, 'players'> & { players: RemoteCollection<PlayerState> };

/** A plain GameState from the decoded schema (the client's state rebuild). */
export function rebuildState(remote: Readonly<RemoteState>): GameState {
  const players: Record<string, PlayerState> = {};
  remote.players.forEach((p) => {
    players[p.id] = pick(p, PLAYER_STATE_KEYS);
  });
  return { ...pick(remote, GAME_STATE_KEYS), players };
}

/** A deep copy (the state is flat: one level of players). */
export function cloneState(state: Readonly<GameState>): GameState {
  const players: Record<string, PlayerState> = {};
  for (const p of Object.values(state.players)) players[p.id] = { ...p };
  return { ...state, players };
}

function pick<T, K extends keyof T>(src: Readonly<T>, keys: readonly K[]): Pick<T, K> {
  const out = {} as Pick<T, K>;
  for (const key of keys) out[key] = src[key];
  return out;
}
