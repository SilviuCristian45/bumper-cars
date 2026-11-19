import type { GameEvent } from './types';

// Wire contract between the Colyseus room (/server) and ColyseusTransport (/client).

export const ROOM_NAME = 'masinute';

/** What the browser sends; the message `type` is also the Colyseus message name. */
export type ClientMessage =
  | { type: 'input'; seq: number; steer: number; throttle: number; boost: boolean } // one per client tick
  | { type: 'rounds'; rounds: number } // host, lobby: 3/5/7
  | { type: 'addBot' } // host, lobby
  | { type: 'removeBot' }
  | { type: 'botLevel'; level: number } // host, lobby: level for bots added from now on
  | { type: 'setBotLevel'; botId: string; level: number } // host, lobby: one bot's level
  | { type: 'start' } // host: lobby -> round 1
  | { type: 'lobby' } // host: finished -> back to the lobby ("Încă un meci")
  | { type: 'skipRound' } // host, only while onlyBotsAlive
  | { type: 'ping'; t: number }; // answered with MSG_PONG carrying the same t

/**
 * Server-side input queue per player. Beyond this many waiting inputs the oldest are dropped,
 * so a burst after a lag spike never turns into permanent extra latency.
 */
export const INPUT_QUEUE_MAX = 4;

/** Server -> clients after each tick that produced events. */
export const MSG_EVENTS = 'events';
export interface TickEvents {
  /** The state tick these events belong to; clients play them once their state reaches it. */
  tick: number;
  events: GameEvent[];
}

/** Server -> one client: the answer to a 'ping', for the round-trip time. */
export const MSG_PONG = 'pong';
export interface Pong {
  t: number;
}

/** Error codes the room rejects joins/creates with (Colyseus ServerError codes). */
export const ERR_SERVER_FULL = 4001; // too many rooms on the server
export const ERR_ROOM_FULL = 4002;
export const ERR_IN_PROGRESS = 4003;

/** Answer of GET /rooms/:code, used to explain a refused join. */
export type RoomStatus = 'open' | 'full' | 'playing' | 'missing';
