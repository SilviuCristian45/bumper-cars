import { describe, expect, it } from 'vitest';
import {
  addPlayer,
  BOT_EASY,
  cloneState,
  createGameState,
  FP,
  GAME_STATE_KEYS,
  INPUT_QUEUE_MAX,
  InputQueue,
  isqrt,
  nextRandom,
  parseInput,
  PLAYER_STATE_KEYS,
  PU_SPRINGS,
  Predictor,
  rebuildState,
  runTick,
  TICK_MS,
  type CarInput,
  type GameEvent,
  type GameState,
  type PlayerInput,
} from '../src';
import { makeRace, px } from './helpers';

const input = (seq: number, extra: Partial<CarInput> = {}): CarInput => ({ seq, steer: 0, throttle: 0, boost: false, ...extra });

describe('state keys', () => {
  it('list every field of GameState and PlayerState', () => {
    const state = createGameState({ code: 'ABCDEF', seed: 1 });
    addPlayer(state, 'a', 'Ana');
    const { players, ...rest } = state;
    expect([...GAME_STATE_KEYS].sort()).toEqual(Object.keys(rest).sort());
    expect([...PLAYER_STATE_KEYS].sort()).toEqual(Object.keys(players.a!).sort());
  });

  it('rebuild a state from a map of players, and clone it deeply', () => {
    const state = makeRace([{ id: 'a' }, { id: 'b', isBot: true }]);
    const map = new Map(Object.entries(state.players));
    const rebuilt = rebuildState({ ...state, players: map });
    expect(rebuilt).toEqual(state);
    const copy = cloneState(state);
    copy.players.a!.x = 123;
    expect(state.players.a!.x).not.toBe(123);
  });
});

describe('parseInput', () => {
  it('accepts a well-formed input and rejects anything else', () => {
    expect(parseInput({ seq: 5, steer: 40, throttle: -100, boost: true })).toEqual(input(5, { steer: 40, throttle: -100, boost: true }));
    expect(parseInput({ seq: 5, steer: 1, throttle: 1, boost: 'yes' })?.boost).toBe(false);
    for (const bad of [null, 7, {}, { seq: 0, steer: 0, throttle: 0 }, { seq: 1.5, steer: 0, throttle: 0 }, { seq: 2 ** 33, steer: 0, throttle: 0 }, { seq: 1, steer: '1', throttle: 0 }]) {
      expect(parseInput(bad)).toBeNull();
    }
  });
});

describe('InputQueue', () => {
  it('gives one input per player per tick, oldest first', () => {
    const q = new InputQueue();
    q.push('a', input(1, { steer: 10 }));
    q.push('a', input(2, { steer: 20 }));
    q.push('b', input(1, { throttle: 50 }));
    expect(q.take()).toEqual([
      { ...input(1, { steer: 10 }), playerId: 'a' },
      { ...input(1, { throttle: 50 }), playerId: 'b' },
    ]);
    expect(q.take()).toEqual([{ ...input(2, { steer: 20 }), playerId: 'a' }]);
    expect(q.take()).toEqual([]);
  });

  it(`keeps at most ${INPUT_QUEUE_MAX} inputs, dropping the oldest but not their boost`, () => {
    const q = new InputQueue();
    q.push('a', input(1, { boost: true }));
    for (let seq = 2; seq <= INPUT_QUEUE_MAX + 1; seq++) q.push('a', input(seq));
    expect(q.size('a')).toBe(INPUT_QUEUE_MAX);
    expect(q.take()[0]).toMatchObject({ seq: 2, boost: true });
  });

  it('ignores repeated or out-of-order inputs', () => {
    const q = new InputQueue();
    q.push('a', input(3));
    q.push('a', input(3));
    q.push('a', input(2));
    expect(q.size('a')).toBe(1);
  });
});

describe('Predictor', () => {
  it('matches the server exactly when nothing is lost', () => {
    const server = makeRace([{ id: 'me', x: -px(100) }, { id: 'b', isBot: true, botLevel: BOT_EASY, x: px(100), heading: 512 }]);
    const predictor = new Predictor('me');
    predictor.reconcile(server);
    for (let t = 0; t < 40; t++) {
      const sent = predictor.advance({ steer: t % 7 === 0 ? 60 : 0, throttle: 100, boost: t === 21 });
      runTick(server, [{ ...sent, playerId: 'me' }]);
      expect(predictor.state).toEqual(server);
      predictor.reconcile(server);
      expect(predictor.unconfirmed).toBe(0);
    }
  });

  it('drops inputs once they are confirmed and replays the rest', () => {
    const server = makeRace([{ id: 'me' }, { id: 'b', x: px(200) }]);
    const predictor = new Predictor('me');
    predictor.reconcile(server);
    const sent = [1, 2, 3].map(() => predictor.advance({ steer: 0, throttle: 100, boost: false }));
    runTick(server, [{ ...sent[0]!, playerId: 'me' }]);
    predictor.reconcile(server);
    expect(predictor.unconfirmed).toBe(2);
    expect(predictor.state!.tick).toBe(server.tick + 2);
  });

  it('numbers on from the server when it takes over a seat (a reloaded tab)', () => {
    const server = makeRace([{ id: 'me' }, { id: 'b', x: px(200) }]);
    server.players.me!.lastSeq = 500;
    const predictor = new Predictor('me');
    predictor.reconcile(server);
    const sent = predictor.advance({ steer: 0, throttle: 100, boost: false });
    expect(sent.seq).toBe(501);
    const queue = new InputQueue();
    queue.remove('me'); // what the server does on a reconnection
    queue.push('me', sent);
    runTick(server, queue.take());
    expect(server.players.me!.lastSeq).toBe(501);
    predictor.reconcile(server);
    expect(predictor.unconfirmed).toBe(0);
    expect(predictor.state).toEqual(server);
  });

  it('starts over from the server after the page was in the background, numbering on', () => {
    const server = makeRace([{ id: 'me' }, { id: 'b', x: px(200) }]);
    const predictor = new Predictor('me');
    predictor.reconcile(server);
    // Inputs from before the tab was hidden that the server never applied (lost with a dropped connection).
    for (let i = 0; i < 5; i++) predictor.advance({ steer: 100, throttle: 100, boost: false });
    for (let t = 0; t < 300; t++) runTick(server, []); // ten seconds pass on the server
    predictor.resync(server);
    expect(predictor.unconfirmed).toBe(0);
    expect(predictor.state).toEqual(server); // nothing stale replayed on top
    const next = predictor.advance({ steer: 0, throttle: 100, boost: false });
    expect(next.seq).toBe(6); // after the old ones: never mistaken for a repeat
    runTick(server, [{ ...next, playerId: 'me' }]);
    expect(predictor.state).toEqual(server);
  });

  it('corrects a contested pickup the server gave to someone else', () => {
    const server = makeRace([{ id: 'me', x: -px(60) }, { id: 'foe', x: px(60), heading: 512 }]);
    Object.assign(server, { powerups: true, puTimer: 1_000_000, pu0Kind: PU_SPRINGS, pu0X: 0, pu0Y: 0, pu0Ticks: 300 });
    const predictor = new Predictor('me');
    predictor.reconcile(server);
    // Both drive at it; the client does not know yet that the other car boosted.
    let predictedMine = false;
    for (let t = 0; t < 16; t++) {
      const sent = predictor.advance({ steer: 0, throttle: 100, boost: false });
      predictedMine ||= predictor.state!.players.me!.effect === PU_SPRINGS;
      runTick(server, [
        { ...sent, playerId: 'me' },
        { seq: t + 1, steer: 0, throttle: 100, boost: t === 0, playerId: 'foe' },
      ]);
    }
    expect(predictedMine).toBe(true);
    expect(server.players.foe!.effect).toBe(PU_SPRINGS);
    expect(server.players.me!.effect).toBe(0);
    // The server's word wins: the prediction is rebuilt from it and matches it exactly.
    predictor.reconcile(server);
    expect(predictor.state).toEqual(server);
  });

  it('forgets everything outside a round', () => {
    const state = createGameState({ code: 'ABCDEF', seed: 1 });
    addPlayer(state, 'me', 'Eu');
    const predictor = new Predictor('me');
    predictor.reconcile(state);
    expect(predictor.canDrive()).toBe(false);
    predictor.advance({ steer: 0, throttle: 0, boost: false });
    predictor.reconcile(state);
    expect(predictor.unconfirmed).toBe(0);
  });
});

/**
 * One server and one predicting client over a simulated network: `lagMs` of added round trip
 * split between both directions, plus up to `jitterMs` extra per message (order kept, as on a
 * WebSocket). The other car is driven on the server and boosts just before a head-on hit, which
 * the client cannot know about in time. Returns the size of every correction the client made.
 */
function playOverNetwork(lagMs: number, jitterMs: number, seed: number) {
  const server = makeRace([
    { id: 'me', x: -px(120), heading: 0 },
    { id: 'foe', x: px(120), heading: 512 },
    { id: 'bot', isBot: true, botLevel: BOT_EASY, y: px(240), heading: 768 },
  ]);
  const queue = new InputQueue();
  const predictor = new Predictor('me');
  predictor.reconcile(server);
  const jitter = { rng: seed };
  const delay = () => lagMs / 2 + nextRandom(jitter) * jitterMs;
  const up: { at: number; input: CarInput }[] = [];
  const down: { at: number; state: GameState }[] = [];
  const corrections: { tick: number; error: number }[] = [];
  let bumpTick = -1;
  const later = (line: { at: number }[], now: number) => Math.max(now + delay(), line.at(-1)?.at ?? 0);

  for (let t = 1; t <= 75; t++) {
    // Server tick at t * TICK_MS.
    const now = t * TICK_MS;
    while (up.length > 0 && up[0]!.at <= now) queue.push('me', up.shift()!.input);
    const foe: PlayerInput = { playerId: 'foe', seq: t, steer: 0, throttle: 100, boost: t === 21 };
    const events = runTick(server, [...queue.take(), foe]);
    if (bumpTick < 0 && events.some((e) => e.type === 'bump' && isPair(e, 'me', 'foe'))) bumpTick = server.tick;
    down.push({ at: later(down, now), state: cloneState(server) });

    // Client tick half a tick later: apply what arrived, then drive.
    const clientNow = now + TICK_MS / 2;
    while (down.length > 0 && down[0]!.at <= clientNow) {
      const before = predictor.state!.players.me!;
      const bx = before.x;
      const by = before.y;
      const state = down.shift()!.state;
      predictor.reconcile(state);
      const after = predictor.state!.players.me!;
      corrections.push({ tick: state.tick, error: isqrt((after.x - bx) ** 2 + (after.y - by) ** 2) });
    }
    const sent = predictor.advance({ steer: 0, throttle: 100, boost: false });
    up.push({ at: later(up, clientNow), input: sent });
  }
  return { server, corrections, bumpTick };
}

const isPair = (e: Extract<GameEvent, { type: 'bump' }>, a: string, b: string) => (e.a === a && e.b === b) || (e.a === b && e.b === a);

/** Converged: the drawn car moves less than this (a quarter pixel) when a server state arrives. */
const CONVERGED_ERROR = FP / 4;

describe('prediction over a laggy network', () => {
  it.each([
    [100, 30, 11],
    [150, 30, 22],
    [120, 0, 33],
  ])('converges after a collision it could not foresee (lag %i ms, jitter %i ms)', (lagMs, jitterMs, seed) => {
    const { server, corrections, bumpTick } = playOverNetwork(lagMs, jitterMs, seed);
    expect(server.phase).toBe('playing');
    expect(bumpTick).toBeGreaterThan(0);
    // The foe's boost reaches the client late: the hit was mispredicted at least once...
    expect(Math.max(...corrections.map((c) => c.error))).toBeGreaterThan(FP);
    // ...and once the hit has reached the client (one round trip and a few ticks), the prediction is exact again.
    const settleTicks = Math.ceil((lagMs + jitterMs) / TICK_MS) + 3;
    const settled = corrections.filter((c) => c.tick >= bumpTick + settleTicks);
    expect(settled.length).toBeGreaterThan(10);
    expect(Math.max(...settled.map((c) => c.error))).toBeLessThanOrEqual(CONVERGED_ERROR);
  });
});
