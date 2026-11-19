import { TICK_RATE } from '@masinute/shared';

/** Loopback only: Caddy is the public entry point. */
export const HOST = process.env.HOST ?? '127.0.0.1';
export const PORT = Number(process.env.PORT ?? 2568);

/** Rooms alive at once; one more "Creează joc" is refused with "Serverul e plin". */
export const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 20);

/** Seconds a dropped player keeps their place. */
export const RECONNECT_SECONDS = 15;

/** Messages per second (of any kind: 30 inputs, a ping, lobby clicks) above which a client is disconnected. */
export const MAX_MESSAGES_PER_SECOND = 2 * TICK_RATE;
