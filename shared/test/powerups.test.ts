import { afterEach, describe, expect, it } from 'vitest';
import {
  addPlayer,
  BOT_EASY,
  BOT_HARD,
  BOT_MEDIUM,
  CAR_RADIUS,
  cloneState,
  COUNTDOWN_TICKS,
  createGameState,
  DEFAULT_TUNING,
  FP,
  hash32,
  HIT_CREDIT_TICKS,
  livePowerups,
  POWERUP_CAR_CLEARANCE,
  POWERUP_EDGE_MARGIN,
  DEFAULT_POWERUP_FREQ,
  POWERUP_FREQ_MAX,
  POWERUP_FREQ_MIN,
  POWERUP_TIMINGS,
  POWERUP_LIFETIME_TICKS,
  powerupAt,
  PU_HORN,
  PU_LIFEBUOY,
  PU_MICI,
  PU_NONE,
  PU_OIL,
  PU_SPRINGS,
  PU_TUICA,
  RING_MIN_RADIUS,
  RING_RADIUS,
  runTick,
  setPowerupFreq,
  setPowerups,
  setTuning,
  SHRINK_DURATION_TICKS,
  SHRINK_START_TICKS,
  sortedPlayers,
  startMatch,
  TICK_RATE,
  TUNING,
  type GameEvent,
  type GameState,
  type PlayerState,
} from '../src';
import { makeRace, px, run, speedOf } from './helpers';

afterEach(() => setTuning(DEFAULT_TUNING));

// The state fields as they were before power-ups existed: with power-ups off, every one of them
// must evolve exactly as it did then (the fingerprint below was taken from that code).
const OLD_PLAYER_KEYS = [
  'slot', 'joinOrder', 'isBot', 'botLevel', 'connected', 'left', 'alive', 'x', 'y', 'vx', 'vy', 'heading', 'steer',
  'throttle', 'boostPressed', 'lastSeq', 'boostTicks', 'boostCooldown', 'slideTicks', 'lastHitTick', 'wins',
  'knockouts', 'selfOuts', 'outs', 'points', 'bumps',
] as const;
const OLD_GAME_KEYS = ['roundsTotal', 'botLevel', 'round', 'tick', 'roundTick', 'phaseTimer', 'ringRadius', 'rng', 'joinCounter'] as const;

/** Five bots and a scripted human over a 3-round match, hashed tick by tick. */
function fingerprint(powerups: boolean) {
  const state = createGameState({ code: 'GOLD', seed: 'golden-1' });
  [BOT_EASY, BOT_MEDIUM, BOT_HARD, BOT_HARD, BOT_MEDIUM].forEach((l, i) => addPlayer(state, `b${i}`, `b${i}`, true, l));
  addPlayer(state, 'me', 'me');
  state.hostId = 'me';
  state.roundsTotal = 3;
  setPowerups(state, 'me', powerups);
  startMatch(state, 'me');
  let h = 0;
  let ticks = 0;
  let events = 0;
  const kinds = new Set<string>();
  while (state.phase !== 'finished' && ticks < 20000) {
    const t = state.tick;
    const input = { playerId: 'me', seq: t + 1, steer: (t % 50) - 25, throttle: t % 90 < 60 ? 100 : -40, boost: t % 120 === 0 };
    const tickEvents = runTick(state, [input]);
    events += tickEvents.length;
    for (const e of tickEvents) kinds.add(e.type);
    for (const p of sortedPlayers(state)) {
      for (const k of OLD_PLAYER_KEYS) {
        const v = p[k];
        h = hash32(h, typeof v === 'boolean' ? (v ? 1 : 0) : v);
      }
    }
    for (const k of OLD_GAME_KEYS) h = hash32(h, state[k]);
    ticks++;
  }
  return { h, ticks, events, points: sortedPlayers(state).map((p) => p.points), kinds, state };
}

/** A race (see makeRace) with power-ups on and nothing scheduled to appear. */
function race(cars: Parameters<typeof makeRace>[0], opts?: Parameters<typeof makeRace>[1]): GameState {
  const state = makeRace(cars, opts);
  state.powerups = true;
  state.puTimer = 1_000_000;
  return state;
}

function place(state: GameState, slot: 0 | 1, kind: number, x: number, y: number, ticks = POWERUP_LIFETIME_TICKS): void {
  if (slot === 0) Object.assign(state, { pu0Kind: kind, pu0X: x, pu0Y: y, pu0Ticks: ticks });
  else Object.assign(state, { pu1Kind: kind, pu1X: x, pu1Y: y, pu1Ticks: ticks });
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

describe('power-ups off', () => {
  it('leave the simulation exactly as it was before power-ups existed', () => {
    const off = fingerprint(false);
    expect({ h: off.h, ticks: off.ticks, events: off.events, points: off.points }).toEqual({
      h: 3559040528,
      ticks: 4254,
      events: 451,
      points: [2, 0, 10, 8, 1, -1],
    });
    expect(livePowerups(off.state)).toEqual([]);
    for (const p of Object.values(off.state.players)) expect([p.effect, p.confusedTicks, p.oilTicks]).toEqual([0, 0, 0]);
  });

  it('can be switched only by the host, only in the lobby', () => {
    const state = createGameState({ code: 'X', seed: 1 });
    addPlayer(state, 'h', 'Host');
    state.hostId = 'h';
    addPlayer(state, 'g', 'Guest');
    expect(state.powerups).toBe(true);
    expect(setPowerups(state, 'g', false)).toBe(false);
    expect(setPowerups(state, 'h', false)).toBe(true);
    expect(state.powerups).toBe(false);
    startMatch(state, 'h');
    expect(setPowerups(state, 'h', true)).toBe(false);
  });
});

describe('power-ups on', () => {
  it('are deterministic: same seed and inputs, same power-ups and the same state', () => {
    const a = fingerprint(true);
    const b = fingerprint(true);
    expect(a.h).toBe(b.h);
    expect(a.state).toEqual(b.state);
    expect(a.kinds.has('powerupSpawn')).toBe(true);
    expect(a.kinds.has('pickup')).toBe(true);
  });

  it.each([1, 2, 3, 4, 5])('appear at the pace of frequency level %i, at most two at once', (level) => {
    const timing = POWERUP_TIMINGS[level]!;
    const state = createGameState({ code: 'TEST', seed: 'spawn' });
    addPlayer(state, 'a', 'a');
    addPlayer(state, 'b', 'b');
    state.hostId = 'a';
    expect(setPowerupFreq(state, 'a', level)).toBe(true);
    startMatch(state, 'a');
    Object.assign(state.players.a!, { x: px(-300), y: 0 });
    Object.assign(state.players.b!, { x: px(300), y: 0 });
    state.roundTick = COUNTDOWN_TICKS;
    const spawns: number[] = [];
    for (let t = 1; t <= 60 * TICK_RATE; t++) {
      for (const e of runTick(state, [])) if (e.type === 'powerupSpawn') spawns.push(t);
      expect(livePowerups(state).length).toBeLessThanOrEqual(2);
      if (state.phase !== 'playing') break;
    }
    expect(spawns[0]).toBe(timing.first);
    for (let i = 1; i < spawns.length; i++) {
      expect(spawns[i]! - spawns[i - 1]!).toBeGreaterThanOrEqual(timing.minGap);
      // A spawn delayed by a busy spot or two full slots waits a little longer.
      expect(spawns[i]! - spawns[i - 1]!).toBeLessThanOrEqual(timing.maxGap + POWERUP_LIFETIME_TICKS);
    }
    expect(spawns.length).toBeGreaterThanOrEqual(3);
  });

  it('come more often at a higher frequency level', () => {
    for (let level = POWERUP_FREQ_MIN + 1; level <= POWERUP_FREQ_MAX; level++) {
      const [slower, faster] = [POWERUP_TIMINGS[level - 1]!, POWERUP_TIMINGS[level]!];
      expect(faster.first).toBeLessThanOrEqual(slower.first);
      expect(faster.minGap + faster.maxGap).toBeLessThan(slower.minGap + slower.maxGap);
    }
  });

  it('frequency: 1..5, set only by the host in the lobby, default 3', () => {
    const state = createGameState({ code: 'X', seed: 1 });
    addPlayer(state, 'h', 'Host');
    addPlayer(state, 'g', 'Guest');
    state.hostId = 'h';
    expect(state.puFreq).toBe(DEFAULT_POWERUP_FREQ);
    expect(DEFAULT_POWERUP_FREQ).toBe(3);
    expect(setPowerupFreq(state, 'g', 5)).toBe(false);
    for (const bad of [0, 6, 2.5, NaN, -1]) expect(setPowerupFreq(state, 'h', bad)).toBe(false);
    expect(state.puFreq).toBe(3);
    expect(setPowerupFreq(state, 'h', 5)).toBe(true);
    expect(state.puFreq).toBe(5);
    startMatch(state, 'h');
    expect(setPowerupFreq(state, 'h', 1)).toBe(false);
    expect(state.puFreq).toBe(5);
  });

  it('only appear inside the current ring, away from its edge and from the cars', () => {
    for (let seed = 0; seed < 40; seed++) {
      const cars = [0, 1, 2, 3, 4, 5].map((i) => ({ id: `c${i}`, x: px(-250 + 100 * i), y: px(((i * 37) % 120) - 60) }));
      const state = race(cars, { seed: `where-${seed}` });
      state.ringRadius = RING_RADIUS - px(seed * 5);
      state.puTimer = 1;
      const events = runTick(state, []);
      const spawned = ofType(events, 'powerupSpawn');
      for (const e of spawned) {
        expect(Math.hypot(e.x, e.y)).toBeLessThanOrEqual(state.ringRadius - POWERUP_EDGE_MARGIN);
        for (const p of Object.values(state.players)) {
          expect(Math.hypot(p.x - e.x, p.y - e.y)).toBeGreaterThanOrEqual(POWERUP_CAR_CLEARANCE - 2 * px(10));
        }
      }
    }
  });

  it('vanish after 10 s untouched', () => {
    const state = race([{ id: 'a', x: px(-300) }, { id: 'b', x: px(300) }]);
    place(state, 0, PU_MICI, 0, px(200));
    run(state, POWERUP_LIFETIME_TICKS - 1);
    expect(powerupAt(state, 0)).toMatchObject({ kind: PU_MICI, ticks: 1 });
    run(state, 1);
    expect(powerupAt(state, 0).kind).toBe(PU_NONE);
  });

  it('vanish when the shrinking ring passes over them', () => {
    const state = race([{ id: 'a', x: px(-60) }, { id: 'b', x: px(60) }]);
    place(state, 0, PU_MICI, 0, px(200));
    place(state, 1, PU_OIL, 0, px(-30));
    // Late in the round: the ring is down to its minimum (~88 px).
    state.roundTick = COUNTDOWN_TICKS + SHRINK_START_TICKS + SHRINK_DURATION_TICKS;
    run(state, 1);
    expect(state.ringRadius).toBe(RING_MIN_RADIUS);
    expect(powerupAt(state, 0).kind).toBe(PU_NONE);
    expect(powerupAt(state, 1).kind).toBe(PU_OIL);
  });

  it('is taken by the lower slot when two cars reach it on the same tick', () => {
    const state = race([{ id: 'a', x: px(-30) }, { id: 'b', x: px(30), heading: 512 }]);
    place(state, 0, PU_SPRINGS, 0, px(-60));
    state.players.a!.y = px(-60);
    state.players.b!.y = px(-60);
    const events = run(state, 1);
    expect(ofType(events, 'pickup')).toEqual([{ type: 'pickup', playerId: 'a', kind: PU_SPRINGS }]);
    expect(state.players.a!.effect).toBe(PU_SPRINGS);
    expect(state.players.b!.effect).toBe(PU_NONE);
  });

  it('give one lasting effect at a time: a new one replaces the old', () => {
    const state = race([{ id: 'a' }, { id: 'b', x: px(250) }]);
    place(state, 0, PU_MICI, 0, 0);
    run(state, 1);
    expect([state.players.a!.effect, state.players.a!.effectTicks]).toEqual([PU_MICI, TUNING.miciTicks]);
    place(state, 0, PU_TUICA, 0, 0);
    run(state, 1);
    expect([state.players.a!.effect, state.players.a!.effectTicks]).toEqual([PU_TUICA, TUNING.tuicaTicks]);
    run(state, TUNING.tuicaTicks);
    expect(state.players.a!.effect).toBe(PU_NONE);
  });
});

describe('effects', () => {
  it('Claxon de TIR shoves the cars around, harder up close, and credits a knockout', () => {
    const state = race([
      { id: 'h' },
      { id: 'near', x: px(60) },
      { id: 'mid', x: 0, y: px(-110) },
      { id: 'far', x: px(-250) },
    ]);
    place(state, 0, PU_HORN, 0, 0);
    const events = run(state, 1);
    expect(ofType(events, 'horn')).toHaveLength(1);
    const p = state.players;
    expect(p.near!.vx).toBeGreaterThan(0);
    expect(p.mid!.vy).toBeLessThan(0);
    expect(speedOf(p.near!)).toBeGreaterThan(speedOf(p.mid!));
    expect(speedOf(p.far!)).toBe(0);
    expect([p.near!.lastHitBy, p.mid!.lastHitBy, p.far!.lastHitBy]).toEqual(['h', 'h', '']);
    expect(p.h!.effect).toBe(PU_NONE); // instant: nothing lasting

    // Honked off the edge: +1 to whoever honked.
    const edge = race([{ id: 'h', x: px(270) }, { id: 'v', x: px(330) }, { id: 'z', x: px(-300) }]);
    place(edge, 0, PU_HORN, px(270), 0);
    const all = run(edge, 30);
    expect(ofType(all, 'out')).toContainEqual({ type: 'out', playerId: 'v', byId: 'h' });
    expect(edge.players.h!.knockouts).toBe(1);
  });

  it('Mici cu muștar: twice the mass, a bit slower, then back to normal', () => {
    const state = race([{ id: 'm', x: px(-200) }, { id: 'n', x: px(-200), y: px(100) }, { id: 'z', x: px(250) }]);
    place(state, 0, PU_MICI, px(-200), 0);
    run(state, 1);
    expect(state.players.m!.effect).toBe(PU_MICI);
    run(state, 120, { m: { throttle: 100 }, n: { throttle: 100 } });
    expect(speedOf(state.players.m!)).toBeLessThan(speedOf(state.players.n!));
    expect(speedOf(state.players.m!)).toBeGreaterThan(speedOf(state.players.n!) * 0.7);

    // Head-on with an equal car: without Mici both bounce back alike; with Mici it barely gives way.
    const crash = (mici: boolean) => {
      const s = race([{ id: 'm', x: px(-40), vx: 1200 }, { id: 'n', x: px(40), heading: 512, vx: -1200 }, { id: 'z', x: px(-300), y: px(-100) }]);
      if (mici) Object.assign(s.players.m!, { effect: PU_MICI, effectTicks: 100 });
      run(s, 5); // the tick of the impact (rolling backwards is capped right after)
      return { m: s.players.m!.vx, n: s.players.n!.vx };
    };
    const plain = crash(false);
    const heavy = crash(true);
    expect(Math.abs(plain.m + plain.n)).toBeLessThan(50); // symmetric
    expect(heavy.m).toBeGreaterThan(plain.m / 2); // loses far less speed
    expect(heavy.n).toBeGreaterThan(plain.n * 1.4); // and sends the other one flying
  });

  it('Colac de salvare cancels exactly one fall off the ring, then the next one counts', () => {
    const state = race([{ id: 's', x: px(340), vx: 1500 }, { id: 'a', x: px(-200) }, { id: 'b', x: px(-250), y: px(100) }]);
    state.players.s!.effect = PU_LIFEBUOY;
    state.players.s!.effectTicks = 100;
    let events = run(state, 6);
    expect(ofType(events, 'saved')).toEqual([{ type: 'saved', playerId: 's' }]);
    const s = state.players.s!;
    expect(s.alive).toBe(true);
    expect(s.effect).toBe(PU_NONE);
    expect(Math.hypot(s.x, s.y)).toBeLessThan(state.ringRadius);
    expect(s.vx).toBeLessThan(0); // bounced back toward the center
    expect(s.outs).toBe(0);

    Object.assign(s, { x: px(345), y: 0, vx: 1500, vy: 0 });
    events = run(state, 6);
    expect(ofType(events, 'saved')).toHaveLength(0);
    expect(ofType(events, 'out')).toEqual([{ type: 'out', playerId: 's', byId: '' }]);
    expect(s.alive).toBe(false);
  });

  it('Colac de salvare runs out after its time if unused', () => {
    const state = race([{ id: 's' }, { id: 'b', x: px(200) }]);
    place(state, 0, PU_LIFEBUOY, 0, 0);
    run(state, 1 + TUNING.lifebuoyTicks);
    expect(state.players.s!.effect).toBe(PU_NONE);
  });

  it('Ulei vărsat: a puddle behind the car, slippery for the others, +1 to its owner for a slide out', () => {
    const state = race([{ id: 'o', x: px(-100), heading: 0 }, { id: 'v', x: px(250) }, { id: 'z', x: px(-300), y: px(150) }]);
    place(state, 0, PU_OIL, px(-100), 0);
    run(state, 1);
    const o = state.players.o!;
    expect(o.oilTicks).toBe(TUNING.oilTicks - 0);
    expect(o.oilX).toBeLessThan(o.x - CAR_RADIUS); // behind it (it faces +x)
    expect(o.effect).toBe(PU_NONE);

    // A car sliding sideways over the puddle keeps its sideways speed far longer.
    const v = state.players.v!;
    const dry = cloneState(state);
    Object.assign(v, { x: o.oilX, y: o.oilY, vx: 0, vy: 900, heading: 0 });
    Object.assign(dry.players.v!, { x: px(150), y: px(-150), vx: 0, vy: 900, heading: 0 });
    run(state, 8);
    run(dry, 8);
    expect(Math.abs(v.vy)).toBeGreaterThan(Math.abs(dry.players.v!.vy) * 2);
    expect(v.lastHitBy).toBe('o');

    // Sliding off the ring from it within the credit window: +1 to the owner.
    const edge = race([{ id: 'o', x: px(-200) }, { id: 'v', x: px(300), vx: 900 }, { id: 'z', x: px(-300), y: px(150) }]);
    Object.assign(edge.players.o!, { oilX: px(300), oilY: 0, oilTicks: 100 });
    const events = run(edge, 60);
    expect(ofType(events, 'out')).toContainEqual({ type: 'out', playerId: 'v', byId: 'o' });
    expect(edge.players.o!.points).toBe(1);

    // The puddle dries up after its time.
    run(state, TUNING.oilTicks);
    expect(state.players.o!.oilTicks).toBe(0);
  });

  it('Ulei vărsat: the owner does not slip on their own puddle', () => {
    const state = race([{ id: 'o' }, { id: 'z', x: px(250) }]);
    Object.assign(state.players.o!, { oilX: 0, oilY: 0, oilTicks: 100 });
    run(state, 2);
    expect(state.players.o!.lastHitBy).toBe('');
  });

  it('Țuică de prună: the next car you hit steers backwards for 4 s, then normally again', () => {
    const state = race([{ id: 't', x: px(-60), vx: 1500 }, { id: 'v', x: px(0) }, { id: 'z', x: px(-300), y: px(150) }]);
    state.players.t!.effect = PU_TUICA;
    state.players.t!.effectTicks = TUNING.tuicaTicks;
    const events = run(state, 4);
    expect(ofType(events, 'confused')).toEqual([{ type: 'confused', playerId: 'v', byId: 't' }]);
    expect(state.players.t!.effect).toBe(PU_NONE); // used up
    const v = state.players.v!;
    expect(v.confusedTicks).toBeGreaterThan(TUNING.tuicaConfuseTicks - 5);

    // Steering right now turns it left.
    Object.assign(v, { vx: 0, vy: 0, heading: 0, x: 0, y: px(150) });
    run(state, 5, { v: { steer: 100 } });
    expect(v.heading).toBeGreaterThan(512); // wrapped below zero: turned left

    // Once it wears off, right is right again.
    run(state, TUNING.tuicaConfuseTicks);
    expect(v.confusedTicks).toBe(0);
    Object.assign(v, { vx: 0, vy: 0, heading: 0 });
    run(state, 5, { v: { steer: 100 } });
    expect(v.heading).toBeGreaterThan(0);
    expect(v.heading).toBeLessThan(512);
  });

  it('Țuică de prună wears off after 8 s without a hit', () => {
    const state = race([{ id: 't' }, { id: 'z', x: px(250) }]);
    place(state, 0, PU_TUICA, 0, 0);
    run(state, 1 + TUNING.tuicaTicks);
    expect(state.players.t!.effect).toBe(PU_NONE);
  });

  it('Bară cu arcuri: your hits shove twice as hard, for 5 s', () => {
    const hit = (springs: boolean) => {
      const state = race([{ id: 'a', x: px(-50), vx: 1500 }, { id: 'b', x: px(0) }, { id: 'z', x: px(-300), y: px(150) }]);
      if (springs) Object.assign(state.players.a!, { effect: PU_SPRINGS, effectTicks: TUNING.springsTicks });
      const events = run(state, 3);
      return { vb: state.players.b!.vx, va: state.players.a!.vx, events };
    };
    const plain = hit(false);
    const springs = hit(true);
    expect(springs.vb).toBeGreaterThan(plain.vb * 1.6);
    expect(springs.va).toBe(plain.va); // the hitter's own bounce stays the same
    expect(ofType(springs.events, 'spring')).toHaveLength(1);
    expect(ofType(plain.events, 'spring')).toHaveLength(0);

    const state = race([{ id: 'a' }, { id: 'z', x: px(250) }]);
    place(state, 0, PU_SPRINGS, 0, 0);
    run(state, 1 + TUNING.springsTicks);
    expect(state.players.a!.effect).toBe(PU_NONE);
  });

  it('knockout credit from the horn and the oil uses the usual 3 s window', () => {
    expect(HIT_CREDIT_TICKS).toBe(3 * TICK_RATE);
    // A car honked but still far from the edge after the window: falling later is its own fault.
    const state = race([{ id: 'h', x: px(-300) }, { id: 'v', x: px(-240) }, { id: 'z', x: px(300) }]);
    place(state, 0, PU_HORN, px(-300), 0);
    run(state, 1);
    const v = state.players.v as PlayerState;
    expect(v.lastHitBy).toBe('h');
    Object.assign(v, { x: px(200), y: 0, vx: 0, vy: 0 });
    run(state, HIT_CREDIT_TICKS + 5);
    Object.assign(v, { x: px(355), vx: 900 });
    const events = run(state, 3);
    expect(ofType(events, 'out')).toContainEqual({ type: 'out', playerId: 'v', byId: '' });
  });
});

it('keeps fixed-point integers everywhere with power-ups on', () => {
  const { state } = fingerprint(true);
  const json = JSON.stringify(state);
  const numbers = [...json.matchAll(/-?\d+(\.\d+)?(e[+-]?\d+)?/g)].map((m) => m[0]);
  expect(numbers.every((n) => /^-?\d+$/.test(n))).toBe(true);
  expect(FP).toBe(256);
});
