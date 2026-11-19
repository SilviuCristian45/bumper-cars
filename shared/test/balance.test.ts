import { describe, expect, it } from 'vitest';
import { BOT_EASY, BOT_HARD, BOT_MEDIUM, addPlayer, createGameState, runTick, startMatch } from '../src';

// Bots of every level in the same arena, over fixed seeds: harder bots must come out ahead.
// Retune BOT_PARAMS against this (scripts/balance.ts prints the same numbers over more matches).

describe('bot balance', () => {
  it('Greu > Mediu > Ușor in round wins and points', () => {
    const wins = [0, 0, 0];
    const points = [0, 0, 0];
    for (let m = 0; m < 16; m++) {
      const state = createGameState({ code: 'BAL', seed: `balance-${m}` });
      [BOT_EASY, BOT_EASY, BOT_MEDIUM, BOT_MEDIUM, BOT_HARD, BOT_HARD].forEach((level, i) =>
        addPlayer(state, `b${i}`, `b${i}`, true, level),
      );
      state.hostId = 'b0';
      state.roundsTotal = 5;
      startMatch(state, 'b0');
      while (state.phase !== 'finished') {
        for (const e of runTick(state, [])) {
          if (e.type === 'roundEnd' && e.winnerId) wins[state.players[e.winnerId]!.botLevel]!++;
        }
      }
      for (const p of Object.values(state.players)) points[p.botLevel]! += p.points;
    }
    expect(wins[BOT_HARD]).toBeGreaterThan(wins[BOT_MEDIUM]!);
    expect(wins[BOT_MEDIUM]).toBeGreaterThan(wins[BOT_EASY]!);
    expect(points[BOT_HARD]).toBeGreaterThan(points[BOT_MEDIUM]!);
    expect(points[BOT_MEDIUM]).toBeGreaterThan(points[BOT_EASY]!);
  }, 60000);
});
