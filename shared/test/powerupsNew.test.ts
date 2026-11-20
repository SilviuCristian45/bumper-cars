import { afterEach, describe, expect, it } from 'vitest';
import {
  addPlayer,
  BOT_EASY,
  BOT_HARD,
  BOT_MEDIUM,
  botThink,
  CAR_MASS,
  CAR_RADIUS,
  carRadius,
  COUNTDOWN_TICKS,
  computeAwards,
  createGameState,
  DEFAULT_TUNING,
  GHOST_SEPARATE_STEP,
  massOf,
  POWERUP_LIFETIME_TICKS,
  PROTEIN_GROW_TICKS,
  PU_GHOST,
  PU_HORN,
  PU_NONE,
  PU_PROTEIN,
  PU_SODA,
  PU_TUICA,
  RING_MIN_RADIUS,
  runTick,
  setTuning,
  SHRINK_DURATION_TICKS,
  SHRINK_START_TICKS,
  sortedPlayers,
  startMatch,
  TUNING,
  type GameEvent,
  type GameState,
  type PlayerState,
} from '../src';
import { makeRace, px, run, speedOf } from './helpers';

afterEach(() => setTuning(DEFAULT_TUNING));

/** A race (see makeRace) with power-ups on and nothing scheduled to appear. */
function race(cars: Parameters<typeof makeRace>[0], opts?: Parameters<typeof makeRace>[1]): GameState {
  const state = makeRace(cars, opts);
  state.powerups = true;
  state.puTimer = 1_000_000;
  return state;
}

function place(state: GameState, kind: number, x: number, y: number): void {
  Object.assign(state, { pu0Kind: kind, pu0X: x, pu0Y: y, pu0Ticks: POWERUP_LIFETIME_TICKS });
}

function give(p: PlayerState, kind: number, ticks?: number): void {
  p.effect = kind;
  p.effectTicks = ticks ?? (kind === PU_SODA ? TUNING.sodaTicks : kind === PU_PROTEIN ? TUNING.proteinTicks : TUNING.ghostTicks);
  if (kind === PU_PROTEIN) p.sizePct = TUNING.proteinSizePct;
}

const ofType = <T extends GameEvent['type']>(events: GameEvent[], type: T) =>
  events.filter((e): e is Extract<GameEvent, { type: T }> => e.type === type);

const dist = (a: PlayerState, b: PlayerState) => Math.hypot(a.x - b.x, a.y - b.y);

describe('Suc Zero Zahăr', () => {
  it('is picked up like the others and runs out after 5 s with an effectEnd (the burp)', () => {
    const state = race([{ id: 's' }, { id: 'z', x: px(250) }]);
    place(state, PU_SODA, 0, 0);
    run(state, 1);
    expect([state.players.s!.effect, state.players.s!.effectTicks]).toEqual([PU_SODA, TUNING.sodaTicks]);
    const events = run(state, TUNING.sodaTicks);
    expect(state.players.s!.effect).toBe(PU_NONE);
    expect(ofType(events, 'effectEnd')).toEqual([{ type: 'effectEnd', playerId: 's', kind: PU_SODA }]);
  });

  it('accelerates faster and reaches a much higher top speed', () => {
    const state = race([
      { id: 's', x: px(-300), y: px(-60) },
      { id: 'n', x: px(-300), y: px(60) },
    ]);
    give(state.players.s!, PU_SODA);
    run(state, 6, { s: { throttle: 100 }, n: { throttle: 100 } });
    expect(speedOf(state.players.s!)).toBeGreaterThan(speedOf(state.players.n!) * 1.35);
    run(state, 54, { s: { throttle: 100 }, n: { throttle: 100 } });
    const s = state.players.s!;
    const n = state.players.n!;
    // Far beyond the normal top speed (the normal car has settled at its own).
    expect(speedOf(s)).toBeGreaterThan(speedOf(n) * 1.4);
    expect(speedOf(s)).toBeLessThanOrEqual((DEFAULT_TUNING.maxSpeed * TUNING.sodaSpeedPct) / 100 + 2);
  });

  it('grips less: a sideways slide lasts longer', () => {
    const slide = (soda: boolean) => {
      const state = race([{ id: 's', vy: 1200 }, { id: 'z', x: px(-300) }]);
      if (soda) give(state.players.s!, PU_SODA);
      run(state, 10);
      return Math.abs(state.players.s!.vy);
    };
    expect(slide(true)).toBeGreaterThan(slide(false) * 1.15);
  });

  it('is easy to fly off the ring with: full gas toward the edge from the middle is a self-out', () => {
    const state = race([{ id: 's', x: px(100), heading: 0 }, { id: 'z', x: px(-300) }, { id: 'y', x: px(-300), y: px(100) }]);
    give(state.players.s!, PU_SODA);
    const events = run(state, 60, { s: { throttle: 100, steer: 10 } });
    expect(ofType(events, 'out')).toContainEqual({ type: 'out', playerId: 's', byId: '' });
    expect(state.players.s!.points).toBe(-1);
  });
});

describe('Pudră proteică', () => {
  it('grows over ~0.3 s to the full size and three times the mass, then shrinks back the same way', () => {
    const state = race([{ id: 'g' }, { id: 'z', x: px(250) }]);
    place(state, PU_PROTEIN, 0, 0);
    const g = state.players.g!;
    const sizes: number[] = [];
    for (let i = 0; i < PROTEIN_GROW_TICKS + 3; i++) {
      run(state, 1);
      sizes.push(g.sizePct);
    }
    expect(g.effect).toBe(PU_PROTEIN);
    // Picked up on the first tick, grows from the second.
    expect(sizes[0]).toBe(100);
    for (let i = 1; i < sizes.length; i++) expect(sizes[i]! - sizes[i - 1]!).toBeLessThanOrEqual(8);
    expect(sizes.at(-1)).toBe(TUNING.proteinSizePct);
    expect(carRadius(g)).toBe(Math.trunc((CAR_RADIUS * TUNING.proteinSizePct) / 100));
    expect(massOf(g)).toBe((CAR_MASS * TUNING.proteinMassPct) / 100);
    // Roughly three cars in area.
    expect((TUNING.proteinSizePct / 100) ** 2).toBeGreaterThan(2.8);

    run(state, g.effectTicks - 1);
    expect(g.effect).toBe(PU_PROTEIN);
    const back: number[] = [];
    let ended: GameEvent[] = [];
    for (let i = 0; i < PROTEIN_GROW_TICKS + 3; i++) {
      ended = ended.concat(run(state, 1));
      back.push(g.sizePct);
    }
    expect(ofType(ended, 'effectEnd')).toEqual([{ type: 'effectEnd', playerId: 'g', kind: PU_PROTEIN }]);
    for (let i = 1; i < back.length; i++) expect(back[i - 1]! - back[i]!).toBeLessThanOrEqual(8);
    expect(back.at(-1)).toBe(100);
    expect(massOf(g)).toBe(CAR_MASS);
  });

  it('accelerates a little slower', () => {
    const state = race([{ id: 'g', x: px(-300), y: px(-80) }, { id: 'n', x: px(-300), y: px(80) }]);
    give(state.players.g!, PU_PROTEIN);
    run(state, 8, { g: { throttle: 100 }, n: { throttle: 100 } });
    expect(speedOf(state.players.g!)).toBeLessThan(speedOf(state.players.n!));
    expect(speedOf(state.players.g!)).toBeGreaterThan(speedOf(state.players.n!) * 0.75);
  });

  it('pushes a touching car away smoothly while growing: no catapult, no hit', () => {
    const state = race([{ id: 'g' }, { id: 'n', x: 2 * CAR_RADIUS }, { id: 'z', x: px(-300) }]);
    place(state, PU_PROTEIN, 0, 0);
    const n = state.players.n!;
    let lastX = n.x;
    const events: GameEvent[] = [];
    for (let i = 0; i < PROTEIN_GROW_TICKS + 4; i++) {
      events.push(...run(state, 1));
      expect(n.x - lastX).toBeLessThanOrEqual(px(4));
      lastX = n.x;
      expect(speedOf(n)).toBeLessThan(150);
    }
    expect(dist(state.players.g!, n)).toBeGreaterThanOrEqual(carRadius(state.players.g!) + CAR_RADIUS - px(1));
    expect(ofType(events, 'bump')).toHaveLength(0);
    expect(n.lastHitBy).toBe('');
  });

  it('pushes everything around in a crash and credits the giant normally (counted for Uriașul)', () => {
    const crash = (giant: boolean) => {
      const s = race([{ id: 'g', x: px(-70), vx: 1200 }, { id: 'n', x: px(0) }, { id: 'z', x: px(-300), y: px(-150) }]);
      if (giant) give(s.players.g!, PU_PROTEIN);
      run(s, 4);
      return s.players.n!.vx;
    };
    expect(crash(true)).toBeGreaterThan(crash(false) * 1.3);

    const edge = race([{ id: 'g', x: px(250), vx: 1500 }, { id: 'v', x: px(320) }, { id: 'z', x: px(-300) }]);
    give(edge.players.g!, PU_PROTEIN);
    const events = run(edge, 20);
    expect(ofType(events, 'out')).toContainEqual({ type: 'out', playerId: 'v', byId: 'g' });
    expect(edge.players.g!.points).toBeGreaterThanOrEqual(1);
    expect(edge.players.g!.giantKnockouts).toBe(1);
    expect(edge.players.g!.knockouts).toBe(1);
  });

  it('is still out only when its center leaves the ring', () => {
    const state = race([{ id: 'g', x: px(350) }, { id: 'z', x: px(-300) }]);
    give(state.players.g!, PU_PROTEIN);
    run(state, 2);
    // Most of the body hangs over the edge, the center is inside: still on the ring.
    expect(state.players.g!.alive).toBe(true);
  });

  it('nothing gets stuck with a giant at the minimum ring radius', () => {
    for (const seed of ['min-a', 'min-b', 'min-c']) {
      const state = race(
        [
          { id: 'g', x: 0, y: 0 },
          { id: 'a', x: px(50), y: 0, heading: 512 },
          { id: 'b', x: px(-50), y: 0 },
          { id: 'c', x: 0, y: px(55), heading: 768 },
        ],
        { seed },
      );
      state.roundTick = COUNTDOWN_TICKS + SHRINK_START_TICKS + SHRINK_DURATION_TICKS;
      place(state, PU_PROTEIN, 0, 0);
      const before = state.round;
      let ticks = 0;
      // Everyone drives into the middle while the giant grows and shoves.
      while (state.round === before && state.phase === 'playing' && ticks < 600) {
        run(state, 1, { g: { throttle: 100, steer: 30 }, a: { throttle: 100 }, b: { throttle: 100 }, c: { throttle: 100 } });
        ticks++;
        expect(state.ringRadius).toBe(RING_MIN_RADIUS);
        for (const p of Object.values(state.players)) {
          for (const v of [p.x, p.y, p.vx, p.vy, p.sizePct]) expect(Number.isInteger(v)).toBe(true);
          // Positions stay sane (a car is at most a few car lengths past the edge before it is out).
          if (p.alive) expect(Math.hypot(p.x, p.y)).toBeLessThanOrEqual(RING_MIN_RADIUS);
        }
      }
      // The round resolved: someone was pushed out until one (or none) was left.
      expect(state.phase === 'intermission' || state.round > before).toBe(true);
    }
  });
});

describe('Fantomă', () => {
  it('drives through a car, and a car drives through it: nobody pushes or is pushed', () => {
    const through = (ghostId: 'a' | 'b') => {
      const state = race([{ id: 'a', x: px(-60), vx: 1200 }, { id: 'b', x: px(0) }, { id: 'z', x: px(-300), y: px(150) }]);
      give(state.players[ghostId]!, PU_GHOST);
      const events = run(state, 6);
      return { state, events };
    };
    for (const ghost of ['a', 'b'] as const) {
      const { state, events } = through(ghost);
      const a = state.players.a!;
      const b = state.players.b!;
      expect(ofType(events, 'bump')).toHaveLength(0);
      expect([b.vx, b.vy]).toEqual([0, 0]);
      expect(a.vx).toBeGreaterThan(1000); // never slowed by the contact
      expect(dist(a, b)).toBeLessThan(2 * CAR_RADIUS - px(5)); // right inside each other
      expect([a.lastHitBy, b.lastHitBy]).toEqual(['', '']);
    }
  });

  it('is not shoved by the horn (the others are)', () => {
    const state = race([{ id: 'h' }, { id: 'g', x: px(50) }, { id: 'n', x: px(-50) }]);
    give(state.players.g!, PU_GHOST);
    place(state, PU_HORN, 0, 0);
    run(state, 1);
    expect([state.players.g!.vx, state.players.g!.vy, state.players.g!.lastHitBy]).toEqual([0, 0, '']);
    expect(state.players.n!.vx).toBeLessThan(0);
  });

  it('slips on oil like everyone (it is on the floor)', () => {
    const state = race([{ id: 'o', x: px(-200) }, { id: 'g', x: px(100), vy: 900 }, { id: 'z', x: px(-300), y: px(150) }]);
    Object.assign(state.players.o!, { oilX: px(100), oilY: 0, oilTicks: 100 });
    give(state.players.g!, PU_GHOST);
    run(state, 1);
    expect(state.players.g!.lastHitBy).toBe('o');
  });

  it('passes no Țuică on and catches none', () => {
    const tuicaHit = (ghostTuica: boolean) => {
      const state = race([{ id: 't', x: px(-60), vx: 1500 }, { id: 'v', x: px(0) }, { id: 'z', x: px(-300), y: px(150) }]);
      give(state.players.t!, PU_TUICA, TUNING.tuicaTicks);
      if (ghostTuica) {
        // The ghost cannot carry Țuică at the same time (one effect), so the victim is the ghost here.
        give(state.players.v!, PU_GHOST);
      }
      return { state, events: run(state, 6) };
    };
    const { state, events } = tuicaHit(true);
    expect(ofType(events, 'confused')).toHaveLength(0);
    expect(state.players.v!.confusedTicks).toBe(0);
    expect(state.players.t!.effect).toBe(PU_TUICA); // not used up
    // And a ghost hitting nobody passes nothing: a ghost has no Țuică to give (one effect at a time).
    const s2 = race([{ id: 'g' }, { id: 'z', x: px(250) }]);
    give(s2.players.g!, PU_TUICA, TUNING.tuicaTicks);
    place(s2, PU_GHOST, 0, 0);
    run(s2, 1);
    expect(s2.players.g!.effect).toBe(PU_GHOST);
  });

  it('is never hunted by the bots', () => {
    for (const level of [BOT_EASY, BOT_MEDIUM, BOT_HARD]) {
      const state = race([
        { id: 'bot', isBot: true, botLevel: level, x: px(-100) },
        { id: 'g', x: px(-40) },
        { id: 'far', x: px(250), y: px(100) },
      ]);
      give(state.players.g!, PU_GHOST);
      for (let t = 0; t < 40; t++) {
        const thought = botThink(state, 'bot');
        expect(thought?.victimId).not.toBe('g');
        state.tick++;
      }
    }
  });

  it('can still fall off the ring on its own', () => {
    const state = race([{ id: 'g', x: px(340), vx: 1500 }, { id: 'z', x: px(-300) }, { id: 'y', x: px(-300), y: px(100) }]);
    give(state.players.g!, PU_GHOST);
    const events = run(state, 6);
    expect(ofType(events, 'out')).toEqual([{ type: 'out', playerId: 'g', byId: '' }]);
  });

  it('reappearing on top of a car: they drift apart gently, no impulse and no credit', () => {
    const state = race([{ id: 'g', x: px(5) }, { id: 'n', x: 0 }, { id: 'z', x: px(-300) }]);
    give(state.players.g!, PU_GHOST, 2);
    const g = state.players.g!;
    const n = state.players.n!;
    const events: GameEvent[] = [];
    events.push(...run(state, 2));
    expect(g.effect).toBe(PU_NONE);
    let last = { gx: g.x, nx: n.x };
    for (let i = 0; i < 20; i++) {
      events.push(...run(state, 1));
      expect(Math.abs(g.x - last.gx)).toBeLessThanOrEqual(GHOST_SEPARATE_STEP + 1);
      expect(Math.abs(n.x - last.nx)).toBeLessThanOrEqual(GHOST_SEPARATE_STEP + 1);
      last = { gx: g.x, nx: n.x };
      expect([g.vx, n.vx, g.vy, n.vy]).toEqual([0, 0, 0, 0]);
    }
    expect(dist(g, n)).toBeGreaterThanOrEqual(2 * CAR_RADIUS - 1);
    expect(g.ghostFade).toBe(0);
    expect(ofType(events, 'bump')).toHaveLength(0);
    expect([g.lastHitBy, n.lastHitBy]).toEqual(['', '']);

    // Apart again, a real crash counts as usual.
    Object.assign(g, { x: n.x - px(60), y: n.y, vx: 1400, vy: 0, heading: 0 });
    const crash = run(state, 4);
    expect(ofType(crash, 'bump')).toHaveLength(1);
    expect(n.lastHitBy).toBe('g');
  });

  it('a new pick-up ends the ghost early and it reappears the same gentle way', () => {
    const state = race([{ id: 'g' }, { id: 'n', x: px(10) }, { id: 'z', x: px(-300) }]);
    give(state.players.g!, PU_GHOST);
    place(state, PU_SODA, 0, 0);
    run(state, 1);
    expect(state.players.g!.effect).toBe(PU_SODA);
    expect(state.players.g!.ghostFade).toBeGreaterThan(0);
    expect(speedOf(state.players.n!)).toBe(0);
  });
});

describe('the new power-ups in a match', () => {
  /** Bots of every level over a few matches; every kind turns up and two runs are identical. */
  function tournament(seed: string) {
    const kinds = new Set<number>();
    const events = new Set<string>();
    const state = createGameState({ code: 'NEW', seed });
    [BOT_EASY, BOT_EASY, BOT_MEDIUM, BOT_MEDIUM, BOT_HARD, BOT_HARD].forEach((l, i) => addPlayer(state, `b${i}`, `b${i}`, true, l));
    state.hostId = 'b0';
    state.roundsTotal = 7;
    startMatch(state, 'b0');
    while (state.phase !== 'finished') {
      for (const e of runTick(state, [])) {
        events.add(e.type);
        if (e.type === 'pickup') kinds.add(e.kind);
      }
    }
    return { state, kinds, events };
  }

  it('is deterministic and every new kind gets picked up', () => {
    const a = tournament('all-kinds-1');
    const b = tournament('all-kinds-1');
    expect(a.state).toEqual(b.state);
    const seen = new Set([...a.kinds, ...tournament('all-kinds-2').kinds, ...tournament('all-kinds-3').kinds]);
    for (const kind of [PU_SODA, PU_PROTEIN, PU_GHOST]) expect(seen.has(kind)).toBe(true);
    expect(a.events.has('effectEnd')).toBe(true);
    for (const p of sortedPlayers(a.state)) for (const v of [p.sizePct, p.ghostFade, p.giantKnockouts]) expect(Number.isInteger(v)).toBe(true);
  }, 60000);
});

describe('bots and the new power-ups', () => {
  it('Greu keeps away from a giant; Ușor does not notice it', () => {
    const think = (level: number) => {
      const state = race([
        { id: 'bot', isBot: true, botLevel: level, x: px(-60), heading: 0 },
        { id: 'g', x: px(30) },
        { id: 'far', x: px(250), y: px(150) },
      ]);
      give(state.players.g!, PU_PROTEIN);
      return botThink(state, 'bot')!;
    };
    const hard = think(BOT_HARD);
    expect(hard.intent).toBe('flee');
    expect(hard.targetX).toBeLessThan(px(-60)); // away from the giant, on the far side
    expect(think(BOT_EASY).intent).not.toBe('flee');
  });

  it('Greu with Suc Zero Zahăr goes for the rival nearest the edge; Ușor just goes for the nearest', () => {
    const think = (level: number) => {
      const state = race([
        { id: 'bot', isBot: true, botLevel: level, x: 0, y: 0 },
        { id: 'near', x: px(60), y: px(0) },
        { id: 'edge', x: px(-200), y: px(150) },
      ]);
      give(state.players.bot!, PU_SODA);
      const victims = new Set<string>();
      for (let t = 0; t < 60; t++) {
        const th = botThink(state, 'bot')!;
        if (th.intent === 'hunt') victims.add(th.victimId);
        state.tick++;
      }
      return victims;
    };
    expect([...think(BOT_HARD)]).toEqual(['edge']);
    expect(think(BOT_EASY).has('edge')).toBe(false);
  });
});

describe('Uriașul award', () => {
  it('goes to the most knockouts while big', () => {
    const state = createGameState({ code: 'AW', seed: 1 });
    ['p0', 'p1', 'p2'].forEach((id) => addPlayer(state, id, id));
    state.hostId = 'p0';
    startMatch(state, 'p0');
    state.players.p1!.giantKnockouts = 2;
    state.players.p2!.giantKnockouts = 1;
    state.phase = 'finished';
    expect(computeAwards(state).find((a) => a.id === 'uriasul')).toEqual({ id: 'uriasul', playerIds: ['p1'], value: 2 });
  });
});
