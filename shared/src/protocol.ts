import { TICK_RATE } from './constants';
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
  | { type: 'powerups'; on: boolean } // host, lobby: power-ups on the ring or not
  | { type: 'powerupFreq'; level: number } // host, lobby: how often they appear, 1..5
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
export const ERR_RATE_LIMITED = 4004; // too many requests from one address (HTTP 429)
export const ERR_TOO_MANY_ROOMS = 4005; // too many rooms open from one address
export const ERR_FORBIDDEN_ORIGIN = 4006; // a page on another site (HTTP 403)

/** WebSocket close code of a lobby closed because nobody started it in time. */
export const CLOSE_LOBBY_IDLE = 4100;

/** Answer of GET /rooms/:code, used to explain a refused join. */
export type RoomStatus = 'open' | 'full' | 'playing' | 'missing';

/** Server -> clients once a finished online match is saved: who entered the top or beat their record. */
export const MSG_RECORDS = 'records';
export interface NewRecord {
  playerId: string;
  name: string;
  /** 1-based place in the all-time leaderboard (one row per nickname). */
  place: number;
  /** 'top': now in the top LEADERBOARD_SIZE and was not before; 'record': beat their own best match. */
  kind: 'top' | 'record';
}
export interface MatchRecords {
  records: NewRecord[];
}

/** Rows in the all-time leaderboard (GET /leaderboard). */
export const LEADERBOARD_SIZE = 15;
/** Only online matches with at least this many human players count. */
export const LEADERBOARD_MIN_HUMANS = 2;
/** No input from a player for this long while a round is played: idle ("zzz" over the car). */
export const IDLE_TICKS = 2 * TICK_RATE;
/**
 * "Played for real": a human counts for the leaderboard only if, of the ticks their car was on the
 * ring after the countdown, they were not idle and held some steer or throttle in at least this many
 * percent (a second tab left alone, or a client that only sends neutral inputs, does not count).
 */
export const LEADERBOARD_MIN_ACTIVE_PERCENT = 30;

/** One row of GET /leaderboard: a nickname's best match, plus how many matches that nickname played. */
export interface LeaderboardEntry {
  place: number;
  name: string;
  points: number;
  /** Rounds won in that match. */
  wins: number;
  knockouts: number;
  selfOuts: number;
  /** Rounds in that match. */
  rounds: number;
  /** Counted matches played under this nickname. */
  matches: number;
  /** When the best match ended, ISO 8601 in UTC. */
  endedAt: string;
}

/** Answer of GET /leaderboard; `available` is false when the server has no database. */
export interface LeaderboardResponse {
  available: boolean;
  entries: LeaderboardEntry[];
}
