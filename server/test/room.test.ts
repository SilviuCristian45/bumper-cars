import { ColyseusTestServer } from '@colyseus/testing';
import type { Room as ClientRoom } from '@colyseus/sdk';
import {
  BOT_EASY,
  BOT_HARD,
  BOT_MEDIUM,
  cloneState,
  COUNTDOWN_TICKS,
  ERR_ROOM_FULL,
  ERR_SERVER_FULL,
  isValidRoomCode,
  MAX_PLAYERS,
  MSG_EVENTS,
  MSG_PONG,
  rebuildState,
  ROOM_NAME,
  type GameState,
  type RemoteState,
  type TickEvents,
} from '@masinute/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createServer } from '../src/app';
import { MAX_MESSAGES_PER_SECOND, MAX_ROOMS } from '../src/config';
import type { MasinuteRoom } from '../src/MasinuteRoom';

// A real server on 2569: not the dev/production port (2568) and not Bombe și Petarde's.
const TEST_PORT = 2569;

let colyseus: ColyseusTestServer;

beforeAll(async () => {
  // boot() would listen on its default port (2568) whatever port it is given for a Server instance.
  const server = createServer();
  await server.listen(TEST_PORT, '127.0.0.1');
  colyseus = new ColyseusTestServer(server);
});
afterAll(async () => {
  await colyseus.shutdown();
});
beforeEach(async () => {
  await colyseus.cleanup();
});

/** The authoritative game state inside the server room. */
const game = (room: MasinuteRoom): GameState => room['game'];

async function create(name = 'Ana'): Promise<{ client: ClientRoom; room: MasinuteRoom }> {
  const client = await colyseus.sdk.create(ROOM_NAME, { name });
  const room = colyseus.getRoomById<MasinuteRoom>(client.roomId);
  return { client, room };
}

function join(code: string, name = 'Ion'): Promise<ClientRoom> {
  return colyseus.sdk.joinById(code, { name });
}

/** Sends a message and waits until the room has processed it. */
async function send(client: ClientRoom, room: MasinuteRoom, type: string, payload?: unknown): Promise<void> {
  client.send(type, payload);
  await room.waitForNextMessage();
  await room.waitForNextTimestep();
}

/** Skips the "3, 2, 1" countdown so the next tick is a fighting one. */
function skipCountdown(room: MasinuteRoom): void {
  game(room).roundTick = COUNTDOWN_TICKS;
}

async function status(code: string): Promise<string> {
  const res = await colyseus.http.get(`/rooms/${code}`);
  return (res.data as { status: string }).status;
}

async function rejection(promise: Promise<unknown>): Promise<{ code?: number; message: string }> {
  try {
    await promise;
  } catch (e) {
    return e as { code?: number; message: string };
  }
  throw new Error('expected the promise to reject');
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('MasinuteRoom', () => {
  it('uses a 6-character room code as its id and makes the creator host', async () => {
    const { client, room } = await create();
    expect(isValidRoomCode(client.roomId)).toBe(true);
    expect(game(room).code).toBe(client.roomId);
    expect(game(room).hostId).toBe(client.sessionId);
    await room.waitForNextPatch();
    expect(room.state.code).toBe(client.roomId);
    const health = await colyseus.http.get('/health');
    expect(health.data).toMatchObject({ ok: true, rooms: 1, maxRooms: MAX_ROOMS });
  });

  it('lets players join by code, with a cleaned nickname', async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId, '  Ion\u0007‮ cel Mare din Deal ');
    expect(Object.keys(game(room).players)).toHaveLength(2);
    expect(game(room).players[guest.sessionId]!.name).toBe('Ion cel Mare din');
    expect(await status(client.roomId)).toBe('open');
  });

  it('refuses an unknown code', async () => {
    const err = await rejection(join('ABCDEF'));
    expect(err.message).toMatch(/not found/);
    expect(await status('ABCDEF')).toBe('missing');
    expect(await status('nu-e-cod')).toBe('missing');
  });

  it('refuses a seventh player', async () => {
    const { client } = await create();
    for (let i = 1; i < MAX_PLAYERS; i++) await join(client.roomId, `P${i}`);
    expect(await status(client.roomId)).toBe('full');
    const err = await rejection(join(client.roomId));
    expect(err.message).toMatch(/locked/);
  });

  it('counts bots against the six places', async () => {
    const { client, room } = await create();
    for (let i = 1; i < MAX_PLAYERS; i++) await send(client, room, 'addBot');
    expect(Object.keys(game(room).players)).toHaveLength(MAX_PLAYERS);
    const err = await rejection(join(client.roomId));
    expect(err.code).toBe(ERR_ROOM_FULL);
  });

  it('locks during a match and unlocks back in the lobby', async () => {
    const { client, room } = await create();
    await join(client.roomId);
    await send(client, room, 'start');
    expect(game(room).phase).toBe('playing');
    expect(room.locked).toBe(true);
    expect(await status(client.roomId)).toBe('playing');
    expect((await rejection(join(client.roomId, 'Eva'))).message).toMatch(/locked/);

    game(room).phase = 'finished';
    await send(client, room, 'lobby');
    expect(game(room).phase).toBe('lobby');
    expect(room.locked).toBe(false);
    await join(client.roomId, 'Eva');
    expect(Object.keys(game(room).players)).toHaveLength(3);
  });

  it('only lets the host start the match, change rounds or add bots', async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId);
    await send(guest, room, 'rounds', { rounds: 7 });
    await send(guest, room, 'addBot');
    await send(guest, room, 'start');
    expect(game(room).phase).toBe('lobby');
    expect(game(room).roundsTotal).toBe(3);
    expect(Object.keys(game(room).players)).toHaveLength(2);

    await send(client, room, 'rounds', { rounds: 7 });
    await send(client, room, 'start');
    expect(game(room).roundsTotal).toBe(7);
    expect(game(room).phase).toBe('playing');
  });

  it('passes the host to the next human, never to a bot', async () => {
    const { client, room } = await create();
    await send(client, room, 'addBot'); // joined before the guest
    const guest = await join(client.roomId);
    await client.leave();
    await room.waitForNextTimestep();
    expect(game(room).hostId).toBe(guest.sessionId);
    await room.waitForNextPatch();
    expect(room.state.hostId).toBe(guest.sessionId);
  });

  it('lets only the host set bot levels, only in the lobby, only to valid values', async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId);
    await send(client, room, 'addBot');
    const botId = Object.values(game(room).players).find((p) => p.isBot)!.id;
    expect(game(room).players[botId]!.botLevel).toBe(BOT_MEDIUM);

    await send(guest, room, 'botLevel', { level: BOT_HARD });
    await send(guest, room, 'setBotLevel', { botId, level: BOT_HARD });
    await send(client, room, 'botLevel', { level: 7 });
    await send(client, room, 'setBotLevel', { botId, level: '2' });
    expect(game(room).botLevel).toBe(BOT_MEDIUM);
    expect(game(room).players[botId]!.botLevel).toBe(BOT_MEDIUM);

    await send(client, room, 'botLevel', { level: BOT_EASY });
    await send(client, room, 'setBotLevel', { botId, level: BOT_HARD });
    expect(game(room).botLevel).toBe(BOT_EASY);
    expect(game(room).players[botId]!.botLevel).toBe(BOT_HARD);
  });

  it('refuses skipRound while a human is on the ring, allows it to the host once all are out', async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId);
    // Two bots: with a single car left the round would simply end.
    await send(client, room, 'addBot');
    await send(client, room, 'addBot');
    await send(client, room, 'start');

    game(room).players[client.sessionId]!.alive = false;
    await send(client, room, 'skipRound'); // the guest is still on the ring
    expect(game(room).round).toBe(1);
    expect(game(room).phase).toBe('playing');

    game(room).players[guest.sessionId]!.alive = false;
    await send(guest, room, 'skipRound'); // not the host
    expect(game(room).phase).toBe('playing');

    await send(client, room, 'skipRound');
    expect(game(room).phase).toBe('intermission');
  });

  it('applies inputs only to the sender, only while playing, and reports the last seq', async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId);
    await send(guest, room, 'input', { seq: 1, steer: 0, throttle: 100, boost: false }); // lobby: ignored
    await send(client, room, 'start');
    skipCountdown(room);
    const host = game(room).players[client.sessionId]!;
    const me = game(room).players[guest.sessionId]!;
    expect(me.lastSeq).toBe(0);

    await send(guest, room, 'input', { seq: 2, steer: 0, throttle: 100, boost: false, playerId: client.sessionId });
    await send(guest, room, 'input', { seq: 'x', steer: 100, throttle: 0 });
    await send(guest, room, 'input', { seq: 2, steer: 100, throttle: 0, boost: false }); // repeated seq
    expect(me.lastSeq).toBe(2);
    expect(me.throttle).toBe(100);
    expect(me.steer).toBe(0);
    expect(host.throttle).toBe(0);
    expect(host.lastSeq).toBe(0);
    await room.waitForNextPatch();
    expect(room.state.players.get(guest.sessionId)?.lastSeq).toBe(2);
  });

  it('applies at most one input per player per tick, and drops the oldest beyond the queue limit', async () => {
    const { client, room } = await create();
    await send(client, room, 'addBot');
    await send(client, room, 'start');
    skipCountdown(room);
    const me = game(room).players[client.sessionId]!;
    const seqs: number[] = [];
    const original = room.broadcastPatch.bind(room);
    room.broadcastPatch = () => {
      seqs.push(me.lastSeq);
      return original();
    };
    const queue = room['inputQueue'];
    for (let seq = 1; seq <= 8; seq++) queue.push(client.sessionId, { seq, steer: 0, throttle: 100, boost: false });
    expect(queue.size(client.sessionId)).toBe(4);
    await sleep(250);
    expect(seqs.slice(0, 5)).toEqual([5, 6, 7, 8, 8]);
  });

  it('sends one patch per tick, from which the client rebuilds the exact server state', async () => {
    const { client, room } = await create();
    await send(client, room, 'addBot');
    await send(client, room, 'addBot');
    await send(client, room, 'start');
    skipCountdown(room);

    // What the server sent, tick by tick.
    const sent = new Map<number, GameState>();
    const original = room.broadcastPatch.bind(room);
    room.broadcastPatch = () => {
      sent.set(game(room).tick, cloneState(game(room)));
      return original();
    };
    const received: GameState[] = [];
    client.onStateChange(() => received.push(rebuildState(client.state as unknown as RemoteState)));
    for (let i = 0; i < 30; i++) {
      client.send('input', { seq: i + 1, steer: i % 5 === 0 ? 80 : -20, throttle: 100, boost: i === 3 });
      await sleep(30);
    }
    await sleep(200);

    const ticks = received.map((s) => s.tick);
    expect(ticks.length).toBeGreaterThan(25);
    // Consecutive ticks, none skipped.
    ticks.slice(1).forEach((tick, i) => expect(tick).toBe(ticks[i]! + 1));
    // Patches already on their way when the hook was installed are skipped.
    const first = Math.min(...sent.keys());
    for (const state of received.filter((r) => r.tick >= first)) expect(state).toEqual(sent.get(state.tick));
    expect(received.at(-1)!.players[client.sessionId]!.lastSeq).toBe(30);
  });

  it("sends a tick's events after its patch, tagged with the tick", async () => {
    const { client, room } = await create();
    await send(client, room, 'addBot');
    // The client's state when each events message arrives.
    const seen: { msg: TickEvents; stateTick: number }[] = [];
    client.onMessage(MSG_EVENTS, (msg: TickEvents) => seen.push({ msg, stateTick: (client.state as unknown as RemoteState).tick }));
    await send(client, room, 'start');
    skipCountdown(room);
    await room.waitForNextTimestep();
    await sleep(50);
    const go = seen.find((s) => s.msg.events.some((e) => e.type === 'go'));
    expect(go).toBeDefined();
    expect(go!.stateTick).toBe(go!.msg.tick);
  });

  it('answers a ping with the same timestamp', async () => {
    const { client } = await create();
    const pong = client.waitForMessage(MSG_PONG);
    client.send('ping', { t: 1234.5 });
    expect(await pong).toEqual({ t: 1234.5 });
  });

  it(`disconnects a client that sends more than ${MAX_MESSAGES_PER_SECOND} messages a second`, async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId);
    guest.reconnection.enabled = false;
    const left = new Promise<void>((resolve) => guest.onLeave(() => resolve()));
    for (let i = 0; i < MAX_MESSAGES_PER_SECOND + 10; i++) guest.send('ping', { t: i });
    await left;
    await room.waitForNextTimestep();
    expect(game(room).players[guest.sessionId]!.connected).toBe(false);
    expect(game(room).players[client.sessionId]!.connected).toBe(true);
  });

  it('takes a player who leaves mid-round off the ring, without crediting anyone', async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId);
    await send(client, room, 'addBot');
    await send(client, room, 'start');
    const guestId = guest.sessionId;
    const out = client.waitForMessage(MSG_EVENTS);
    await guest.leave();
    await room.waitForNextTimestep();
    expect(game(room).players[guestId]).toMatchObject({ alive: false, left: true, outs: 0 });
    const msg = (await out) as TickEvents;
    expect(msg.events).toContainEqual({ type: 'out', playerId: guestId, byId: '' });
  });

  it('frees a lobby seat at once when a player leaves', async () => {
    const { client, room } = await create();
    const guests: ClientRoom[] = [];
    for (let i = 1; i < MAX_PLAYERS; i++) guests.push(await join(client.roomId, `P${i}`));
    expect(await status(client.roomId)).toBe('full');
    await guests[0]!.leave();
    await room.waitForNextTimestep();
    expect(game(room).players[guests[0]!.sessionId]).toBeUndefined();
    expect(await status(client.roomId)).toBe('open');
  });

  it('keeps a dropped player for reconnection', async () => {
    const { client, room } = await create();
    const guest = await join(client.roomId);
    const token = guest.reconnectionToken;
    guest.reconnection.enabled = false;
    await guest.leave(false); // not consented: a drop
    await room.waitForNextTimestep();
    expect(game(room).players[guest.sessionId]!.connected).toBe(false);

    const back = await colyseus.sdk.reconnect(token);
    expect(back.sessionId).toBe(guest.sessionId);
    await room.waitForNextTimestep();
    expect(game(room).players[guest.sessionId]!.connected).toBe(true);
  });

  it(`refuses to create more than ${MAX_ROOMS} rooms`, async () => {
    for (let i = 0; i < MAX_ROOMS; i++) await create(`P${i}`);
    const err = await rejection(create());
    expect(err.code).toBe(ERR_SERVER_FULL);
    expect(err.message).toBe('Serverul e plin');
  });
});
