import { describe, expect, it } from 'vitest';
import {
  BOT_EASY,
  BOT_HARD,
  BOT_NAMES,
  MAX_PLAYERS,
  addBot,
  addPlayer,
  createGameState,
  leavePlayer,
  removeBot,
  sanitizeName,
  setBotLevel,
  setDefaultBotLevel,
  setRounds,
  startMatch,
} from '../src';

describe('lobby and match lifecycle', () => {
  it('first human is host; the room fills at 6', () => {
    const state = createGameState({ code: 'L', seed: 1 });
    for (let i = 0; i < MAX_PLAYERS; i++) expect(addPlayer(state, `p${i}`, `P${i}`).ok).toBe(true);
    expect(state.hostId).toBe('p0');
    expect(addPlayer(state, 'late', 'Late')).toEqual({ ok: false, reason: 'full' });
  });

  it('only the host adds bots (fairground names, current level), sets rounds and starts', () => {
    const state = createGameState({ code: 'L', seed: 1 });
    addPlayer(state, 'h', 'Host');
    addPlayer(state, 'g', 'Guest');
    expect(addBot(state, 'g', 'x').ok).toBe(false);
    expect(setDefaultBotLevel(state, 'h', BOT_EASY)).toBe(true);
    const r = addBot(state, 'h', 'bot1');
    expect(r.ok && r.player.name).toBe(BOT_NAMES[0]);
    expect(state.players.bot1!.botLevel).toBe(BOT_EASY);
    expect(setBotLevel(state, 'h', 'bot1', BOT_HARD)).toBe(true);
    expect(setRounds(state, 'g', 5)).toBe(false);
    expect(setRounds(state, 'h', 4)).toBe(false);
    expect(setRounds(state, 'h', 7)).toBe(true);
    expect(startMatch(state, 'g')).toBe(false);
    expect(startMatch(state, 'h')).toBe(true);
    expect(addPlayer(state, 'late', 'Late')).toEqual({ ok: false, reason: 'in-progress' });
    expect(removeBot(state, 'h')).toBe(false); // not in the lobby any more
  });

  it('host leaving passes the role to the next human, never a bot', () => {
    const state = createGameState({ code: 'L', seed: 1 });
    addPlayer(state, 'h', 'Host');
    addBot(state, 'h', 'bot1');
    addPlayer(state, 'g', 'Guest');
    leavePlayer(state, 'h');
    expect(state.hostId).toBe('g');
  });

  it('sanitizes names', () => {
    expect(sanitizeName('  Ana\u0000​  ')).toBe('Ana');
    expect(sanitizeName('')).toBe('Jucător');
    expect([...sanitizeName('x'.repeat(40))]).toHaveLength(16);
  });
});
