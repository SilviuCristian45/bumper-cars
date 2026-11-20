import { TICK_RATE } from '@masinute/shared';

/** Loopback only: Caddy is the public entry point. */
export const HOST = process.env.HOST ?? '127.0.0.1';
export const PORT = Number(process.env.PORT ?? 2568);

/** Rooms alive at once; one more "Creează joc" is refused with "Serverul e plin". */
export const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 20);

/**
 * All-time leaderboard database. masinute.service sets /var/lib/masinute/leaderboard.db (its
 * StateDirectory, outside /opt/masinute); production never falls back to a path inside the release
 * folder, which a later deploy would delete.
 */
export const DB_PATH =
  process.env.DB_PATH ?? (process.env.NODE_ENV === 'production' ? '/var/lib/masinute/leaderboard.db' : 'data/leaderboard.db');

/** Seconds a dropped player keeps their place. */
export const RECONNECT_SECONDS = 15;

/** Messages per second (of any kind: 30 inputs, a ping, lobby clicks) above which a client is disconnected. */
export const MAX_MESSAGES_PER_SECOND = 2 * TICK_RATE;
