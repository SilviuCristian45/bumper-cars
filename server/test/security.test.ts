import { request, type IncomingHttpHeaders } from 'node:http';
import { createAuthContext } from '@colyseus/core';
import { ColyseusTestServer } from '@colyseus/testing';
import {
  CLOSE_LOBBY_IDLE,
  COUNTDOWN_TICKS,
  ERR_FORBIDDEN_ORIGIN,
  ERR_RATE_LIMITED,
  ERR_TOO_MANY_ROOMS,
  IDLE_TICKS,
  LEADERBOARD_MIN_ACTIVE_PERCENT,
  ROOM_NAME,
} from '@masinute/shared';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/app';
import { forwardedClientIp, ipKey } from '../src/clientIp';
import { LEADERBOARD_MATCHES_PER_IP_PER_DAY, MAX_ROOMS_PER_IP, MAX_WS_PER_IP, RATES } from '../src/config';
import { isAllowedOrigin, type Guard } from '../src/guard';
import { migrate, MIGRATIONS, openLeaderboard, useLeaderboard, type Leaderboard } from '../src/leaderboard';
import { Counts, DailyQuota, RateLimiter } from '../src/limits';
import { savedMatchesToday, type MasinuteRoom } from '../src/MasinuteRoom';

// Each attack from SECURITY-AUDIT.md against a real server on 2569: what used to get through, and
// that it is refused now. "Through Caddy" = from loopback with X-Forwarded-For, as Caddy sends it.

const TEST_PORT = 2569;
const BASE = `http://127.0.0.1:${TEST_PORT}`;

let colyseus: ColyseusTestServer;
let guard: Guard;

beforeAll(async () => {
  const server = createServer();
  guard = await server.listen(TEST_PORT, '127.0.0.1');
  colyseus = new ColyseusTestServer(server.colyseus);
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
});

/** A fresh documentation address per test, so the limits of one test never leak into the next. */
let nextIp = 1;
const freshIp = () => `198.51.100.${nextIp++}`;

interface Answer {
  status: number;
  headers: Headers;
  body: { code?: number; error?: string; roomId?: string; status?: string } | null;
}

async function http(method: 'GET' | 'POST' | 'OPTIONS', path: string, headers: Record<string, string> = {}, body?: object): Promise<Answer> {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? (JSON.parse(text) as Answer['body']) : null };
}

const viaCaddy = (ip: string, extra: Record<string, string> = {}) => ({ 'x-forwarded-for': ip, ...extra });
const createRoom = (headers: Record<string, string>) => http('POST', `/matchmake/create/${ROOM_NAME}`, headers, { name: 'Ana' });

/** A bare WebSocket handshake; resolves with 101 (left open until close()) or the refusal's status. */
function upgrade(headers: Record<string, string>): Promise<{ status: number; close: () => void }> {
  return new Promise((resolve, reject) => {
    const req = request(`${BASE}/`, {
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Version': '13',
        'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
        ...headers,
      },
    });
    req.on('upgrade', (res, socket) => resolve({ status: res.statusCode ?? 0, close: () => socket.destroy() }));
    req.on('response', (res) => {
      res.resume();
      resolve({ status: res.statusCode ?? 0, close: () => undefined });
    });
    req.on('error', reject);
    req.end();
  });
}

async function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  while (!check()) {
    if (Date.now() > end) throw new Error('timed out');
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('M3: the client address cannot be spoofed', () => {
  const headers: IncomingHttpHeaders = {
    'x-real-ip': '6.6.6.6',
    'x-client-ip': '7.7.7.7',
    'x-forwarded-for': '8.8.8.8, 203.0.113.9', // the client sent 8.8.8.8, Caddy appended the real address
  };

  it("before: Colyseus' own context.ip believes the client's header", () => {
    expect(createAuthContext({ headers: new Headers(headers as Record<string, string>), remoteAddress: '127.0.0.1' }).ip).toBe('6.6.6.6');
  });

  it("now: only the entry Caddy added counts, and only from loopback", () => {
    expect(forwardedClientIp(headers, '127.0.0.1')).toBe('203.0.113.9');
    expect(forwardedClientIp(headers, '::ffff:127.0.0.1')).toBe('203.0.113.9');
    expect(forwardedClientIp(headers, '203.0.113.50')).toBeNull(); // not through Caddy
    expect(forwardedClientIp({ 'x-real-ip': '6.6.6.6' }, '127.0.0.1')).toBeNull(); // Vite proxy, tests, curl on the VPS
    expect(forwardedClientIp({ 'x-forwarded-for': 'not-an-ip' }, '127.0.0.1')).toBeNull();
  });

  it('counts IPv6 clients by their /64 and IPv4-mapped addresses as IPv4', () => {
    expect(ipKey('203.0.113.9')).toBe('203.0.113.9');
    expect(ipKey('2001:db8:1:2:aaaa::1')).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:db8:1:2:bbbb:cccc:dddd:eeee')).toBe('2001:db8:1:2::/64');
    expect(ipKey('2001:db8::1')).toBe('2001:db8:0:0::/64');
    expect(ipKey('::ffff:203.0.113.9')).toBe('203.0.113.9');
  });

  it('a new X-Real-IP or X-Masinute-IP on every request does not escape the per-address limit', async () => {
    const ip = freshIp();
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
      expect((await createRoom(viaCaddy(ip, { 'x-real-ip': `10.0.0.${i}`, 'x-masinute-ip': `10.1.0.${i}` }))).status).toBe(200);
    }
    const refused = await createRoom(viaCaddy(ip, { 'x-real-ip': '10.0.0.99', 'x-masinute-ip': '10.1.0.99' }));
    expect(refused.body?.code).toBe(ERR_TOO_MANY_ROOMS);
  });

  it('a request that did not come through Caddy is not limited, even with a forged guard header', async () => {
    for (let i = 0; i < MAX_ROOMS_PER_IP + 2; i++) {
      expect((await createRoom({ 'x-masinute-ip': '10.9.9.9' })).status).toBe(200);
    }
  });
});

describe('C1: one address cannot fill the server with rooms', () => {
  it(`allows ${MAX_ROOMS_PER_IP} rooms per address, refuses the next, and other addresses still get theirs`, async () => {
    const ip = freshIp();
    const codes: string[] = [];
    for (let i = 0; i < MAX_ROOMS_PER_IP; i++) {
      const res = await createRoom(viaCaddy(ip));
      expect(res.status).toBe(200);
      codes.push(res.body!.roomId!);
    }
    expect((await createRoom(viaCaddy(ip))).body?.code).toBe(ERR_TOO_MANY_ROOMS);
    expect((await createRoom(viaCaddy(freshIp()))).status).toBe(200);

    // A room that closes gives its place back.
    await colyseus.getRoomById<MasinuteRoom>(codes[0]!).disconnect();
    expect((await createRoom(viaCaddy(ip))).status).toBe(200);
  });

  it(`refuses creating faster than ${RATES.createRoom.burst} rooms at once from one address (HTTP 429)`, async () => {
    const ip = freshIp();
    for (let i = 0; i < RATES.createRoom.burst; i++) expect((await createRoom(viaCaddy(ip))).status).not.toBe(429);
    const refused = await createRoom(viaCaddy(ip));
    expect(refused.status).toBe(429);
    expect(refused.body?.code).toBe(ERR_RATE_LIMITED);
    expect(Number(refused.headers.get('retry-after'))).toBeGreaterThan(0);
  });
});

describe('M2: per-address limits, Origin and CORS', () => {
  it(`keeps ${MAX_WS_PER_IP} WebSockets open from one address (six friends and their reloads), refuses one more`, async () => {
    const ip = freshIp();
    const open = await Promise.all(Array.from({ length: MAX_WS_PER_IP }, () => upgrade(viaCaddy(ip))));
    expect(open.every((s) => s.status === 101)).toBe(true);
    expect((await upgrade(viaCaddy(ip))).status).toBe(429);
    const neighbour = await upgrade(viaCaddy(freshIp()));
    expect(neighbour.status).toBe(101);

    // Closed connections free their places.
    [...open, neighbour].forEach((s) => s.close());
    await until(() => guard.sockets.get(ip) === 0);
    const again = await upgrade(viaCaddy(ip));
    expect(again.status).toBe(101);
    again.close();
  });

  it('refuses a flood of matchmaking requests from one address (HTTP 429)', async () => {
    const room = (await createRoom(viaCaddy(freshIp()))).body!.roomId!;
    const ip = freshIp();
    let last: Answer | undefined;
    // (the room fills after six; the requests beyond still count)
    for (let i = 0; i <= RATES.matchmake.burst; i++) last = await http('POST', `/matchmake/joinById/${room}`, viaCaddy(ip), { name: `P${i}` });
    expect(last!.status).toBe(429);
    expect(last!.body?.code).toBe(ERR_RATE_LIMITED);
  });

  it('refuses floods of /leaderboard and /rooms/:code', async () => {
    const ip = freshIp();
    for (let i = 0; i < RATES.leaderboard.burst; i++) expect((await http('GET', '/leaderboard', viaCaddy(ip))).status).toBe(200);
    expect((await http('GET', '/leaderboard', viaCaddy(ip))).status).toBe(429);
  });

  it('refuses pages on other sites: WebSocket upgrades, matchmaking and preflights', async () => {
    const evil = { origin: 'https://evil.example' };
    expect((await upgrade(evil)).status).toBe(403);
    const create = await createRoom(evil);
    expect(create.status).toBe(403);
    expect(create.body?.code).toBe(ERR_FORBIDDEN_ORIGIN);
    expect((await http('OPTIONS', `/matchmake/create/${ROOM_NAME}`, evil)).status).toBe(403);
  });

  it('answers its own pages with CORS for that origin only, never with credentials', async () => {
    const res = await http('GET', '/leaderboard', { origin: 'http://localhost:5174' });
    expect(res.status).toBe(200);
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5174');
    expect(res.headers.get('access-control-allow-credentials')).toBeNull();
    const noOrigin = await http('GET', '/leaderboard');
    expect(noOrigin.headers.get('access-control-allow-origin')).toBeNull();
  });

  it('allows only the production site in production, localhost only in dev', () => {
    const production = { allowedOrigins: ['https://masinute-balci.duckdns.org'], allowLocalhostOrigins: false };
    const dev = { allowedOrigins: [], allowLocalhostOrigins: true };
    expect(isAllowedOrigin('https://masinute-balci.duckdns.org', production)).toBe(true);
    expect(isAllowedOrigin('http://localhost:5174', production)).toBe(false);
    expect(isAllowedOrigin('https://masinute-balci.duckdns.org.evil.example', production)).toBe(false);
    expect(isAllowedOrigin('http://localhost:5174', dev)).toBe(true);
    expect(isAllowedOrigin('http://127.0.0.1:4173', dev)).toBe(true);
    expect(isAllowedOrigin('http://localhost.evil.example', dev)).toBe(false);
  });

  it('takes CSP reports without echoing anything back', async () => {
    const res = await fetch(`${BASE}/csp-report`, {
      method: 'POST',
      headers: { 'content-type': 'application/csp-report' },
      body: JSON.stringify({ 'csp-report': { 'violated-directive': 'img-src', 'blocked-uri': 'https://x.example/a.png', 'document-uri': 'https://masinute-balci.duckdns.org/' } }),
    });
    expect(res.status).toBe(204);
  });
});

describe('M1: nobody gets into a room without its code', () => {
  it('refuses join and joinOrCreate, which used to drop the caller into any open lobby', async () => {
    const host = await createRoom({});
    expect(host.status).toBe(200);
    const room = colyseus.getRoomById<MasinuteRoom>(host.body!.roomId!);
    for (const method of ['join', 'joinOrCreate']) {
      const res = await http('POST', `/matchmake/${method}/${ROOM_NAME}`, {}, { name: 'Intrus' });
      expect(res.status).not.toBe(200);
      expect(res.body?.roomId).toBeUndefined();
    }
    expect(room['_listing'].private).toBe(true);
    // With the code it works.
    expect((await http('POST', `/matchmake/joinById/${room.roomId}`, {}, { name: 'Ion' })).status).toBe(200);
  });
});

describe('D2 + m1: room codes cannot be guessed or predicted', () => {
  it(`stops answering about codes after ${RATES.unknownCode.burst} unknown ones from one address, even for a real code`, async () => {
    const real = (await createRoom(viaCaddy(freshIp()))).body!.roomId!;
    const ip = freshIp();
    // Before, every guess got an answer: an oracle for scanning all 31^6 codes.
    for (let i = 0; i < RATES.unknownCode.burst / 2; i++) {
      expect((await http('GET', `/rooms/ZZZZ${i % 10}${i % 9}`, viaCaddy(ip))).body?.status).toBe('missing');
      expect((await http('POST', `/matchmake/joinById/ZZZY${i % 10}${i % 9}`, viaCaddy(ip), { name: 'X' })).status).not.toBe(200);
    }
    // Now the guesses are spent: no answer either way, so a hit cannot be told from a miss.
    for (const path of [`/rooms/${real}`, '/rooms/ZZZZZZ']) {
      const res = await http('GET', path, viaCaddy(ip));
      expect(res.status).toBe(429);
      expect(res.body?.code).toBe(ERR_RATE_LIMITED);
    }
    expect((await http('POST', `/matchmake/joinById/${real}`, viaCaddy(ip), { name: 'X' })).status).toBe(429);
    expect((await http('POST', `/matchmake/reconnect/${real}`, viaCaddy(ip), {})).status).toBe(429);
    // Another address, and real codes, are unaffected.
    expect((await http('POST', `/matchmake/joinById/${real}`, viaCaddy(freshIp()), { name: 'Ion' })).status).toBe(200);
  });

  it('lets friends mistype a few codes without being locked out', async () => {
    const real = (await createRoom(viaCaddy(freshIp()))).body!.roomId!;
    const ip = freshIp();
    // A typo in the menu costs two guesses (the join, then /rooms/:code for the message).
    for (let i = 0; i < 5; i++) {
      await http('POST', `/matchmake/joinById/QQQQQ${i}`, viaCaddy(ip), { name: 'Ion' });
      await http('GET', `/rooms/QQQQQ${i}`, viaCaddy(ip));
    }
    expect((await http('POST', `/matchmake/joinById/${real}`, viaCaddy(ip), { name: 'Ion' })).status).toBe(200);
  });

  it('draws room codes and seeds from crypto, not Math.random', async () => {
    const { readFile } = await import('node:fs/promises');
    const source = await readFile(new URL('../src/MasinuteRoom.ts', import.meta.url), 'utf8');
    expect(source.replace(/\/\/.*$/gm, '')).not.toMatch(/Math\.random/); // comments aside
    const codes = new Set<string>();
    for (let i = 0; i < 4; i++) codes.add((await createRoom({})).body!.roomId!);
    expect(codes.size).toBe(4);
  });
});

describe('D1: one address cannot flood the leaderboard', () => {
  let board: Leaderboard;
  beforeEach(() => {
    board = openLeaderboard(':memory:')!;
    useLeaderboard(board);
  });
  afterEach(() => {
    useLeaderboard(null);
    board.close();
  });
  const matches = () => (board['db'].prepare('SELECT COUNT(*) AS n FROM matches').get() as { n: number }).n;
  const saved = () => board['db'].prepare('SELECT name FROM results ORDER BY id').all().map((r) => (r as { name: string }).name);

  /** A room with two humans (two tabs of one person, or two friends), each seen from the given address. */
  async function twoTabs(ipA: string, ipB: string, names = ['Ana', 'Ion']): Promise<MasinuteRoom> {
    const a = await colyseus.sdk.create(ROOM_NAME, { name: names[0] });
    const b = await colyseus.sdk.joinById(a.roomId, { name: names[1] });
    const room = colyseus.getRoomById<MasinuteRoom>(a.roomId);
    room['clientIps'].set(a.sessionId, ipA);
    room['clientIps'].set(b.sessionId, ipB);
    // Both drove (the "played for real" rule is tested on its own below).
    for (const id of [a.sessionId, b.sessionId]) room['activity'].set(id, { onRing: 100, driving: 100 });
    return room;
  }

  it(`saves at most ${LEADERBOARD_MATCHES_PER_IP_PER_DAY} matches a day from one address (it used to save every one)`, async () => {
    const ip = freshIp();
    const room = await twoTabs(ip, ip);
    for (let i = 0; i < LEADERBOARD_MATCHES_PER_IP_PER_DAY + 3; i++) room['saveMatch']();
    expect(matches()).toBe(LEADERBOARD_MATCHES_PER_IP_PER_DAY);
    expect(savedMatchesToday.has(ip)).toBe(false);
  });

  it('still saves the players from other addresses in that match', async () => {
    const spent = freshIp();
    for (let i = 0; i < LEADERBOARD_MATCHES_PER_IP_PER_DAY; i++) savedMatchesToday.use(spent);
    const room = await twoTabs(spent, freshIp());
    room['saveMatch']();
    expect(saved()).toEqual(['Ion']);
  });

  it('friends behind one Wi-Fi count as one address, with room for an evening of matches', async () => {
    const wifi = freshIp();
    const room = await twoTabs(wifi, wifi);
    for (let i = 0; i < 10; i++) room['saveMatch']();
    expect(matches()).toBe(10);
  });

  it('files "Ştefan" (cedilla) and "ștefan" under one leaderboard row', async () => {
    const room = await twoTabs(freshIp(), freshIp(), ['Ştefan', 'Ion']);
    room['saveMatch']();
    const other = await twoTabs(freshIp(), freshIp(), ['ștefan', 'Ana']);
    other['saveMatch']();
    expect(board.top().filter((e) => e.name.toLowerCase().includes('tefan'))).toHaveLength(1);
    expect(board.top().find((e) => e.name.toLowerCase().includes('tefan'))?.matches).toBe(2);
  });

  it('merges old cedilla rows into the comma-below player when the database migrates', () => {
    const db = new (process.getBuiltinModule('node:sqlite') as typeof import('node:sqlite')).DatabaseSync(':memory:');
    migrate(db, MIGRATIONS.slice(0, 1));
    db.exec(`INSERT INTO matches (id, room, ended_at, rounds, humans, bots) VALUES (1, 'ABCDEF', '2026-01-01T00:00:00Z', 3, 2, 0);
             INSERT INTO results (match_id, name, name_key, points, wins, knockouts, self_outs, place) VALUES (1, 'Ştefan', 'ştefan', 5, 1, 0, 0, 1);`);
    migrate(db);
    expect(db.prepare('SELECT name, name_key FROM results').get()).toEqual({ name: 'Ștefan', name_key: 'ștefan' });
    db.close();
  });
});

describe('zzz and "played for real"', () => {
  /** A started match with two humans; both clients' state views follow the room. */
  async function started() {
    const a = await colyseus.sdk.create(ROOM_NAME, { name: 'Ana' });
    const b = await colyseus.sdk.joinById(a.roomId, { name: 'Ion' });
    const room = colyseus.getRoomById<MasinuteRoom>(a.roomId);
    a.send('start');
    await room.waitForNextMessage();
    await room.waitForNextTimestep();
    return { a, b, room, g: room['game'] };
  }

  it('marks a player with no input for 2 s as idle, for everyone to see, and clears it when inputs come back', async () => {
    const { a, b, room, g } = await started();
    g.roundTick = COUNTDOWN_TICKS + 200; // well into the round
    room['lastInputTick'].set(a.sessionId, g.tick); // Ana drives
    room['lastInputTick'].set(b.sessionId, g.tick - IDLE_TICKS - 5); // Ion's tab went to the background
    await room.waitForNextTimestep();
    await until(() => (a.state as unknown as { players: Map<string, { idle: boolean }> }).players.get(b.sessionId)?.idle === true);
    expect(g.players[a.sessionId]!.idle).toBe(false);
    expect(g.players[b.sessionId]!.idle).toBe(true);

    b.send('input', { seq: 1, steer: 0, throttle: 100, boost: false });
    await room.waitForNextMessage();
    await room.waitForNextTimestep();
    expect(g.players[b.sessionId]!.idle).toBe(false);
  });

  it('never marks anyone idle in the lobby, between rounds or in a round\'s first two seconds, nor bots', async () => {
    const { room, g, b } = await started();
    g.roundTick = 1; // a round just began: earlier silence (between rounds) does not count
    room['lastInputTick'].set(b.sessionId, 0);
    room['trackActivity']();
    expect(Object.values(g.players).some((p) => p.idle)).toBe(false);
    g.phase = 'intermission';
    room['trackActivity']();
    expect(Object.values(g.players).some((p) => p.idle)).toBe(false);
  });

  it('counts how much each human drove while on the ring, after the countdown', async () => {
    const { room, g, a, b } = await started();
    g.roundTick = COUNTDOWN_TICKS + 1;
    const ana = g.players[a.sessionId]!;
    const ion = g.players[b.sessionId]!;
    ana.alive = ion.alive = true;
    ana.throttle = 100; // driving
    ion.steer = ion.throttle = 0; // only neutral inputs (a second tab, or a client that sends nothing useful)
    for (let i = 0; i < 10; i++) {
      room['lastInputTick'].set(a.sessionId, g.tick);
      room['lastInputTick'].set(b.sessionId, g.tick);
      room['trackActivity']();
    }
    expect(room['activity'].get(a.sessionId)).toEqual({ onRing: 10, driving: 10 });
    expect(room['activity'].get(b.sessionId)).toEqual({ onRing: 10, driving: 0 });
    expect(room.playedForReal(a.sessionId)).toBe(true);
    expect(room.playedForReal(b.sessionId)).toBe(false);
  });

  it(`needs ${LEADERBOARD_MIN_ACTIVE_PERCENT}% driving to count, and a match needs two humans who played for real`, async () => {
    const board = openLeaderboard(':memory:')!;
    useLeaderboard(board);
    try {
      const { room, a, b } = await started();
      const activity = room['activity'];
      activity.set(a.sessionId, { onRing: 100, driving: 90 });
      activity.set(b.sessionId, { onRing: 100, driving: LEADERBOARD_MIN_ACTIVE_PERCENT - 1 }); // the tab left alone, mostly
      room['saveMatch']();
      expect(board.top()).toEqual([]); // before: two humans in the room were enough
      activity.set(b.sessionId, { onRing: 100, driving: LEADERBOARD_MIN_ACTIVE_PERCENT });
      room['saveMatch']();
      expect(board.top().map((e) => e.name).sort()).toEqual(['Ana', 'Ion']);
    } finally {
      useLeaderboard(null);
      board.close();
    }
  });
});

describe('D4: a lobby nobody starts is closed', () => {
  it('sends everyone back to the menu with CLOSE_LOBBY_IDLE and frees the room', async () => {
    const client = await colyseus.sdk.create(ROOM_NAME, { name: 'Ana' });
    const room = colyseus.getRoomById<MasinuteRoom>(client.roomId);
    let closedWith = 0;
    client.onLeave((code) => (closedWith = code));
    room.lobbyIdleMs = 150;
    room.armLobbyTimer();
    await until(() => closedWith !== 0);
    expect(closedWith).toBe(CLOSE_LOBBY_IDLE);
  });

  it('leaves a started match alone', async () => {
    const client = await colyseus.sdk.create(ROOM_NAME, { name: 'Ana' });
    const room = colyseus.getRoomById<MasinuteRoom>(client.roomId);
    room.lobbyIdleMs = 150;
    room.armLobbyTimer();
    client.send('addBot');
    await room.waitForNextMessage();
    client.send('start');
    await room.waitForNextMessage();
    await new Promise((r) => setTimeout(r, 300));
    expect(room['game'].phase).not.toBe('lobby');
    expect(client.connection.isOpen).toBe(true);
  });
});

describe('limits', () => {
  it('a rate limiter spends its burst, then refills at its rate', () => {
    const limiter = new RateLimiter({ burst: 2, perMinute: 60 });
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(true);
    expect(limiter.take('a', 0)).toBe(false);
    expect(limiter.retryAfter('a', 0)).toBe(1);
    expect(limiter.take('b', 0)).toBe(true);
    expect(limiter.take('a', 1000)).toBe(true);
  });

  it('keeps a bounded number of addresses', () => {
    const limiter = new RateLimiter({ burst: 1, perMinute: 1 }, 3);
    for (const k of ['a', 'b', 'c', 'd']) limiter.take(k, 0);
    expect(limiter['buckets'].size).toBeLessThanOrEqual(3);
  });

  it('counts open things and forgets keys at zero', () => {
    const counts = new Counts();
    counts.add('a');
    counts.add('a');
    counts.remove('a');
    expect(counts.get('a')).toBe(1);
    counts.remove('a');
    expect(counts['counts'].size).toBe(0);
  });

  it('a daily quota starts over on the next UTC day', () => {
    const quota = new DailyQuota(1);
    const day1 = new Date('2026-11-20T23:59:00Z');
    expect(quota.has('a', day1)).toBe(true);
    quota.use('a', day1);
    expect(quota.has('a', day1)).toBe(false);
    expect(quota.has('a', new Date('2026-11-21T00:01:00Z'))).toBe(true);
  });
});
