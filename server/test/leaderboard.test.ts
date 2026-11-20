import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { addBot, addPlayer, createGameState, LEADERBOARD_SIZE, type GameState } from '@masinute/shared';
import { afterEach, describe, expect, it } from 'vitest';
import { Leaderboard, matchResult, migrate, MIGRATIONS, openLeaderboard, type MatchResult } from '../src/leaderboard';

interface Score {
  name: string;
  points: number;
  wins?: number;
  knockouts?: number;
  selfOuts?: number;
}

let opened: Leaderboard[] = [];
afterEach(() => {
  for (const board of opened) board.close();
  opened = [];
});

function memoryBoard(): Leaderboard {
  const board = openLeaderboard(':memory:');
  if (!board) throw new Error('node:sqlite is not available');
  opened.push(board);
  return board;
}

let minute = 0;
/** A counted match between the given humans; each call ends a minute after the previous one. */
function match(...scores: Score[]): MatchResult {
  return {
    room: 'ABCDEF',
    endedAt: new Date(Date.UTC(2026, 10, 20, 20, minute++)),
    rounds: 5,
    humans: scores.length,
    bots: 0,
    players: scores.map((s, i) => ({ playerId: `p${i}`, wins: 0, knockouts: 0, selfOuts: 0, place: i + 1, ...s })),
  };
}

/** A finished room: humans by name (a "!" prefix = left mid-match), then bots. */
function finishedState(humans: string[], bots = 0): GameState {
  const state = createGameState({ code: 'QWERTY', seed: 1 });
  humans.forEach((name, i) => addPlayer(state, `h${i}`, name.replace(/^!/, '')));
  for (let i = 0; i < bots; i++) addBot(state, 'h0', `b${i}`);
  Object.values(state.players).forEach((p, i) => {
    p.points = 10 + i; // the last one added leads
    p.wins = 1;
    p.knockouts = i;
    p.selfOuts = 1;
  });
  humans.forEach((name, i) => {
    if (name.startsWith('!')) state.players[`h${i}`]!.left = true;
  });
  state.phase = 'finished';
  state.round = state.roundsTotal;
  return state;
}

describe('matchResult', () => {
  it('saves humans who finished with their stats and match place, never bots or players who left', () => {
    const result = matchResult(finishedState(['Ana', 'Ion', '!Vlad'], 2), new Date())!;
    expect(result).toMatchObject({ room: 'QWERTY', humans: 3, bots: 2, rounds: 3 });
    // Standings by points: b1 (14), b0 (13), Vlad (12), Ion (11), Ana (10).
    expect(result.players).toEqual([
      { playerId: 'h0', name: 'Ana', points: 10, wins: 1, knockouts: 0, selfOuts: 1, place: 5 },
      { playerId: 'h1', name: 'Ion', points: 11, wins: 1, knockouts: 1, selfOuts: 1, place: 4 },
    ]);
  });

  it('only counts matches with at least two humans', () => {
    expect(matchResult(finishedState(['Ana'], 3), new Date())).toBeNull();
    expect(matchResult(finishedState(['Ana']), new Date())).toBeNull();
    // Two humans played, even if one of them left before the end.
    expect(matchResult(finishedState(['Ana', '!Ion'], 1), new Date())?.players).toHaveLength(1);
  });
});

describe('Leaderboard', () => {
  it('saves matches and reads back one row per nickname (ignoring case) with its match count', () => {
    const board = memoryBoard();
    board.record(match({ name: 'Ana', points: 10 }, { name: 'Ion', points: 4 }));
    board.record(match({ name: 'ANA', points: 25, wins: 3, knockouts: 6, selfOuts: 1 }, { name: 'ion', points: 2 }));
    board.record(match({ name: 'ana', points: 12 }, { name: 'Ion', points: 3 }));

    const top = board.top();
    expect(top.map((e) => [e.place, e.name, e.points, e.matches])).toEqual([
      [1, 'ANA', 25, 3],
      [2, 'Ion', 4, 3],
    ]);
    expect(top[0]).toEqual({
      place: 1,
      name: 'ANA',
      points: 25,
      wins: 3,
      knockouts: 6,
      selfOuts: 1,
      rounds: 5,
      matches: 3,
      endedAt: '2026-11-20T20:01:00.000Z',
    });
  });

  it('breaks ties on rounds won, then on whoever got there first', () => {
    const board = memoryBoard();
    board.record(match({ name: 'Primul', points: 20, wins: 2 }, { name: 'Mic', points: 5 }));
    board.record(match({ name: 'Al doilea', points: 20, wins: 2 }, { name: 'Victorii', points: 20, wins: 4 }));
    board.record(match({ name: 'Mare', points: 30 }, { name: 'Zero', points: 0 }));
    // Negative points (self-outs) rank below zero.
    board.record(match({ name: 'Minus', points: -2 }, { name: 'Zero', points: 0 }));
    expect(board.top().map((e) => e.name)).toEqual(['Mare', 'Victorii', 'Primul', 'Al doilea', 'Mic', 'Zero', 'Minus']);
    // A tie with your own best keeps the older match as the record.
    board.record(match({ name: 'mare', points: 30 }, { name: 'X', points: 1 }));
    expect(board.top()[0]).toMatchObject({ name: 'Mare', matches: 2 });
  });

  it(`shows at most ${LEADERBOARD_SIZE} rows`, () => {
    const board = memoryBoard();
    for (let i = 0; i < 10; i++) board.record(match({ name: `A${i}`, points: i }, { name: `B${i}`, points: 100 + i }));
    const top = board.top();
    expect(top).toHaveLength(LEADERBOARD_SIZE);
    expect(top[0]!.name).toBe('B9');
    expect(top.at(-1)!.place).toBe(LEADERBOARD_SIZE);
  });

  it('tells apart entering the top from beating your own record', () => {
    const board = memoryBoard();
    expect(board.record(match({ name: 'Ana', points: 10 }, { name: 'Ion', points: 5 }))).toEqual([
      { playerId: 'p0', name: 'Ana', place: 1, kind: 'top' },
      { playerId: 'p1', name: 'Ion', place: 2, kind: 'top' },
    ]);
    // Ion beats his record; Ana does worse than hers: nothing for her.
    expect(board.record(match({ name: 'ana', points: 3 }, { name: 'Ion', points: 15 }))).toEqual([
      { playerId: 'p1', name: 'Ion', place: 1, kind: 'record' },
    ]);
  });

  it('reports someone pushed out of the top who comes back as entering it, and nobody new outside it', () => {
    const board = memoryBoard();
    board.record(match({ name: 'Slab', points: 1 }, { name: 'S0', points: 50 }));
    for (let i = 1; i < LEADERBOARD_SIZE; i += 2) board.record(match({ name: `S${i}`, points: 50 }, { name: `S${i + 1}`, points: 50 }));
    expect(board.top().map((e) => e.name)).not.toContain('Slab');
    // Outside the top, a better match is still a record; a first match that low is nothing.
    expect(board.record(match({ name: 'Slab', points: 2 }, { name: 'Nou', points: 0 }))).toEqual([
      { playerId: 'p0', name: 'Slab', place: 16, kind: 'record' },
    ]);
    expect(board.record(match({ name: 'Slab', points: 60 }, { name: 'Nou', points: 0 }))[0]).toEqual({
      playerId: 'p0',
      name: 'Slab',
      place: 1,
      kind: 'top',
    });
  });

  it('serves the top from a short cache that a saved match clears', () => {
    const board = memoryBoard();
    board.record(match({ name: 'Ana', points: 10 }, { name: 'Ion', points: 5 }));
    const first = board.top(1000);
    expect(board.top(2000)).toBe(first);
    expect(board.top(1000 + 30_001)).not.toBe(first);
    board.record(match({ name: 'Vlad', points: 50 }, { name: 'Ion', points: 5 }));
    expect(board.top(40_000)[0]!.name).toBe('Vlad');
  });
});

describe('schema', () => {
  let dir = '';
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
    dir = '';
  });

  it('is created on an empty database and kept, with its data, on the next start', () => {
    dir = mkdtempSync(join(tmpdir(), 'masinute-lb-'));
    const path = join(dir, 'nested', 'leaderboard.db');
    const board = openLeaderboard(path)!;
    board.record(match({ name: 'Ana', points: 10 }, { name: 'Ion', points: 5 }));
    board.close();

    const again = openLeaderboard(path)!;
    expect(again.top()).toHaveLength(2);
    again.close();
    const db = new DatabaseSync(path);
    expect(db.prepare('SELECT version FROM schema_version').get()).toEqual({ version: MIGRATIONS.length });
    expect(db.prepare('PRAGMA journal_mode').get()).toEqual({ journal_mode: 'wal' });
    db.close();
  });

  it('applies only the missing steps to an existing database, keeping its rows', () => {
    const db = new DatabaseSync(':memory:');
    migrate(db, MIGRATIONS);
    db.exec("INSERT INTO matches (room, ended_at, rounds, humans, bots) VALUES ('AAAAAA', '2026-01-01T00:00:00.000Z', 3, 2, 0)");
    const next = [...MIGRATIONS, 'ALTER TABLE matches ADD COLUMN extra INTEGER NOT NULL DEFAULT 7'];
    expect(migrate(db, next)).toBe(next.length);
    expect(db.prepare('SELECT room, extra FROM matches').all()).toEqual([{ room: 'AAAAAA', extra: 7 }]);
    expect(migrate(db, next)).toBe(next.length); // nothing left to do
    expect(db.prepare('SELECT version FROM schema_version').get()).toEqual({ version: next.length });
    db.close();
  });

  it('rolls back a failed step and refuses a schema newer than the code', () => {
    const db = new DatabaseSync(':memory:');
    expect(() => migrate(db, [...MIGRATIONS, 'CREATE TABLE x (a); NOT SQL'])).toThrow();
    expect(db.prepare('SELECT version FROM schema_version').get()).toEqual({ version: MIGRATIONS.length });
    expect(db.prepare("SELECT name FROM sqlite_master WHERE name = 'x'").get()).toBeUndefined();
    db.prepare('UPDATE schema_version SET version = 99').run();
    expect(() => migrate(db)).toThrow(/newer/);
    db.close();
  });

  it('leaves the server without a leaderboard (not crashed) when the database cannot be opened', () => {
    dir = mkdtempSync(join(tmpdir(), 'masinute-lb-'));
    const path = join(dir, 'leaderboard.db');
    const db = new DatabaseSync(path);
    migrate(db, [...MIGRATIONS, 'SELECT 1']); // written by a newer server
    db.close();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      expect(openLeaderboard(path)).toBeNull();
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
  });
});
