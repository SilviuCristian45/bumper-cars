import { createServer as createHttpServer } from 'node:http';
import { createEndpoint, createRouter, defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { isValidRoomCode, normalizeRoomCode, ROOM_NAME, type LeaderboardResponse } from '@masinute/shared';
import { MAX_ROOMS } from './config';
import { DEFAULT_GUARD_OPTIONS, installGuard, isAllowedOrigin, type Guard, type GuardOptions } from './guard';
import { currentLeaderboard } from './leaderboard';
import { MasinuteRoom } from './MasinuteRoom';
import { roomCount, roomStatus } from './registry';

const health = createEndpoint('/health', { method: 'GET' }, async (ctx) =>
  ctx.json({ ok: true, rooms: roomCount(), maxRooms: MAX_ROOMS, uptime: Math.round(process.uptime()) }),
);

/** Why a join by code failed: Colyseus reports both a full and a running room as "locked". */
const roomInfo = createEndpoint('/rooms/:code', { method: 'GET' }, async (ctx) => {
  const code = normalizeRoomCode(ctx.params.code);
  return ctx.json({ status: isValidRoomCode(code) ? roomStatus(code) : 'missing' });
});

/** The all-time top (cached on the server, and briefly by browsers and proxies). */
const leaderboard = createEndpoint('/leaderboard', { method: 'GET' }, async (ctx) => {
  ctx.setHeader('Cache-Control', 'public, max-age=30');
  const board = currentLeaderboard();
  let body: LeaderboardResponse = { available: false, entries: [] };
  try {
    if (board) body = { available: true, entries: board.top() };
  } catch (err) {
    console.error('Clasament: nu pot citi topul:', err);
  }
  return ctx.json(body);
});

export interface GameServer {
  listen(port: number, host: string): Promise<Guard>;
  /** The Colyseus server (tests drive it with @colyseus/testing). */
  readonly colyseus: ReturnType<typeof defineServer>;
}

export function createServer(guardOptions: GuardOptions = DEFAULT_GUARD_OPTIONS): GameServer {
  // Matchmaking by code only: no `join`/`joinOrCreate`, which would pick any open room without its code.
  matchMaker.controller.exposedMethods = ['create', 'joinById', 'reconnect'];
  // CORS only for the game's own pages, and never with credentials (the game has no cookies).
  matchMaker.controller.DEFAULT_CORS_HEADERS = {
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Max-Age': '86400',
    // no Allow-Origin by default, no Allow-Credentials ever
  } as typeof matchMaker.controller.DEFAULT_CORS_HEADERS;
  matchMaker.controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
    const origin = headers.get('origin');
    return origin && isAllowedOrigin(origin, guardOptions) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  };

  const http = createHttpServer();
  const colyseus = defineServer({
    transport: new WebSocketTransport({ server: http }),
    rooms: { [ROOM_NAME]: defineRoom(MasinuteRoom) },
    routes: createRouter({ health, roomInfo, leaderboard }),
    greet: false,
  });
  return {
    colyseus,
    async listen(port, host) {
      await colyseus.listen(port, host);
      // Colyseus has bound its routes now; the guard goes in front of them.
      return installGuard(http, guardOptions);
    },
  };
}
