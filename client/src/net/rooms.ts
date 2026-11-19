import { DEFAULT_ROUNDS } from '@masinute/shared';
import type { GameTransport } from './GameTransport';
import { LocalTransport } from './LocalTransport';

// Where the menu gets its rooms from. The offline room runs the simulation in the browser with
// bots; online rooms (Colyseus) arrive in stage 4, until then the menu says they are coming soon.

/** Bots in a fresh offline room, so Start works right away. */
const OFFLINE_START_BOTS = 3;

/** A failed create/join, with a message for the menu. `offline` offers the offline game instead. */
export class RoomError extends Error {
  constructor(
    message: string,
    readonly offline = false,
  ) {
    super(message);
  }
}

export const COMING_SOON = 'Disponibil în curând. Până atunci, joacă offline cu boți.';

/** Whether this build talks to a server (stage 4). */
export const onlineEnabled = false;

export function createOfflineRoom(name: string): Promise<GameTransport> {
  return Promise.resolve(
    new LocalTransport({
      name,
      bots: OFFLINE_START_BOTS,
      rounds: DEFAULT_ROUNDS,
      seed: Math.random().toString(36).slice(2),
      autoStart: false,
    }),
  );
}

export function createRoom(_name: string): Promise<GameTransport> {
  return Promise.reject(new RoomError(COMING_SOON, true));
}

export function joinRoom(_code: string, _name: string): Promise<GameTransport> {
  return Promise.reject(new RoomError(COMING_SOON, true));
}
