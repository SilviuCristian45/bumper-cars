import { Client, type Room } from '@colyseus/sdk';
import { ROOM_NAME, type GameState } from '@masinute/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ColyseusTransport } from '@client/net/ColyseusTransport';
import { createServer, type GameServer } from '../../server/src/app';
import { openLeaderboard, useLeaderboard } from '../../server/src/leaderboard';

// A 2D and a 3D player in one room. Both clients receive the room through the same ColyseusTransport
// (client/src/net, which the 3D client imports instead of keeping its own); this checks, on a real server,
// that the server state each one rebuilds is identical tick by tick while both drive.

// Not 2568 (dev/production), not 2569 (the server's room tests), not Bombe și Petarde's.
const TEST_PORT = 2570;

// ColyseusTransport listens for the page going to the background; node has no document.
(globalThis as { document?: unknown }).document ??= { hidden: false, addEventListener() {}, removeEventListener() {} };

let server: GameServer;

beforeAll(async () => {
  useLeaderboard(openLeaderboard(':memory:'));
  server = createServer();
  await server.listen(TEST_PORT, '127.0.0.1');
});

afterAll(async () => {
  await server.colyseus.gracefullyShutdown(false);
  useLeaderboard(null);
});

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withState(pending: Promise<Room>): Promise<Room> {
  const room = await pending;
  for (let i = 0; i < 100 && !(room.state as { code?: string } | undefined)?.code; i++) await sleep(10);
  return room;
}

/** The newest server state the transport has taken in (what it predicts from and draws other cars with). */
const latest = (t: ColyseusTransport) => (t as unknown as { latest: GameState }).latest;

describe('a 2D and a 3D client in the same room', () => {
  it('receive the same state, tick by tick', async () => {
    const client = new Client(`ws://127.0.0.1:${TEST_PORT}`);
    const roomA = await withState(client.create(ROOM_NAME, { name: 'Doi De' }));
    const roomB = await withState(client.joinById(roomA.roomId, { name: 'Trei De' }));
    const noLag = { lagMs: 0, jitterMs: 0 };
    const a = new ColyseusTransport(roomA, noLag); // the 2D page
    const b = new ColyseusTransport(roomB, noLag); // the 3D page
    a.send({ type: 'addBot' });
    a.send({ type: 'start' });

    const seen = { a: new Map<number, string>(), b: new Map<number, string>() };
    const end = Date.now() + 6000;
    for (let i = 0; Date.now() < end; i++) {
      // Both drive: A in circles, B straight with a boost now and then.
      a.setInput({ steer: 60, throttle: 100, boost: false });
      b.setInput({ steer: i % 40 < 20 ? -30 : 30, throttle: 100, boost: i % 50 === 0 });
      a.update(10);
      b.update(10);
      for (const [t, map] of [
        [a, seen.a],
        [b, seen.b],
      ] as const) {
        const s = latest(t);
        if (s.phase === 'playing') map.set(s.tick, JSON.stringify(s));
      }
      await sleep(10);
    }

    const common = [...seen.a.keys()].filter((tick) => seen.b.has(tick));
    expect(common.length).toBeGreaterThan(60);
    for (const tick of common) expect(JSON.parse(seen.b.get(tick)!)).toEqual(JSON.parse(seen.a.get(tick)!));
    // The cars really moved under both players' inputs.
    const last = JSON.parse(seen.a.get(Math.max(...common))!) as GameState;
    expect(last.players[roomA.sessionId]!.lastSeq).toBeGreaterThan(30);
    expect(last.players[roomB.sessionId]!.lastSeq).toBeGreaterThan(30);
    // The 3D page draws every car of that state.
    expect([...b.view().poses.keys()].sort()).toEqual(Object.keys(latest(b).players).sort());

    a.dispose();
    b.dispose();
  }, 20000);
});
