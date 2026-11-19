import { describe, expect, it } from 'vitest';
import {
  BOT_EASY,
  BOT_HARD,
  BOT_LEVELS,
  BOT_MEDIUM,
  BOT_PARAMS,
  RING_RADIUS,
  addPlayer,
  angleDiff,
  botAct,
  botThink,
  createGameState,
  iatan2,
  runTick,
  startMatch,
} from '../src';
import { makeRace, px } from './helpers';

describe('bots', () => {
  it('thinking does not change the state', () => {
    const state = makeRace([
      { id: 'b1', isBot: true, botLevel: BOT_HARD, x: -px(100) },
      { id: 'b2', isBot: true, botLevel: BOT_EASY, x: px(100) },
    ]);
    state.tick = 40;
    const before = JSON.stringify(state);
    botThink(state, 'b1');
    botThink(state, 'b2');
    expect(JSON.stringify(state)).toBe(before);
  });

  it('wait during the countdown', () => {
    const state = createGameState({ code: 'B', seed: 'b' });
    addPlayer(state, 'h', 'h');
    addPlayer(state, 'b', 'b', true, BOT_HARD);
    startMatch(state, 'h');
    expect(botThink(state, 'b')?.intent).toBe('wait');
    expect(botThink(state, 'b')?.input.throttle).toBe(0);
  });

  it('retreat toward the center when near the edge', () => {
    for (const level of BOT_LEVELS) {
      // Facing away from the center, rolling outward.
      const state = makeRace([
        { id: 'b', isBot: true, botLevel: level, x: RING_RADIUS - px(20), vx: 400 },
        { id: 'h', x: -px(250) },
      ]);
      const thought = botThink(state, 'b')!;
      expect(thought.intent).toBe('retreat');
      expect(thought.input.throttle).toBeLessThan(0); // brakes first
    }
  });

  it('hard bots hunt the nearest car and steer toward it', () => {
    const state = makeRace([
      { id: 'b', isBot: true, botLevel: BOT_HARD, heading: 0 },
      { id: 'near', x: px(60), y: px(60) },
      { id: 'far', x: -px(250) },
    ]);
    // Over several decisions most go to hunting the nearest car.
    let hunts = 0;
    for (let t = 0; t < 40; t++) {
      state.tick = t * BOT_PARAMS[BOT_HARD]!.interval;
      const th = botThink(state, 'b')!;
      if (th.intent === 'hunt') {
        hunts++;
        expect(th.victimId).toBe('near');
      }
    }
    expect(hunts).toBeGreaterThan(25);
    const desired = iatan2(px(60), px(60));
    state.tick = 0;
    const th = botThink(state, 'b')!;
    if (th.intent === 'hunt') expect(Math.sign(th.input.steer)).toBe(Math.sign(angleDiff(0, desired)));
  });

  it('only decide every `interval` ticks; the held input carries them in between', () => {
    const state = makeRace([
      { id: 'b', isBot: true, botLevel: BOT_EASY },
      { id: 'h', x: px(100) },
    ]);
    const interval = BOT_PARAMS[BOT_EASY]!.interval;
    state.tick = interval * 3 + 1;
    expect(botAct(state, 'b')).toBeNull();
    state.tick = interval * 3;
    expect(botAct(state, 'b')).not.toBeNull();
  });

  it('bot-only rounds end with a winner most of the time, not by the time limit', () => {
    const state = createGameState({ code: 'B', seed: 'bots-end' });
    for (let i = 0; i < 4; i++) addPlayer(state, `b${i}`, `b${i}`, true, BOT_MEDIUM);
    state.hostId = 'b0';
    state.roundsTotal = 7;
    startMatch(state, 'b0');
    const outcomes: string[] = [];
    while (state.phase !== 'finished') {
      for (const e of runTick(state, [])) if (e.type === 'roundEnd') outcomes.push(e.outcome);
    }
    expect(outcomes).toHaveLength(7);
    expect(outcomes.filter((o) => o === 'win').length).toBeGreaterThanOrEqual(5);
  });
});
