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
  nameKey,
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
    expect(sanitizeName('  Ana\u0000\u200B  ')).toBe('Ana');
    expect(sanitizeName('')).toBe('Jucător');
    expect([...sanitizeName('x'.repeat(40))]).toHaveLength(16);
  });

  // m2/D1: nicknames that used to get through unchanged.
  it('removes RTL overrides, line separators, private and blank characters, and zalgo', () => {
    expect(sanitizeName('\u202Eanilam')).toBe('anilam'); // right-to-left override
    expect(sanitizeName('Ana\u2028Maria')).toBe('AnaMaria'); // line separator
    expect(sanitizeName('\u3164\u3164')).toBe('Jucător'); // Hangul filler: looks empty
    expect(sanitizeName('\u2800')).toBe('Jucător'); // braille blank
    expect(sanitizeName('\uE000Ion')).toBe('Ion'); // private use
    expect(sanitizeName('A\u00A0\u2003 B')).toBe('A B'); // odd spaces, collapsed
    expect(sanitizeName(`Z${'\u0301'.repeat(14)}`)).toBe('Ź\u0301\u0301'); // zalgo: Ź (NFC) plus at most two marks
    expect(sanitizeName('!!!')).toBe('Jucător');
    expect(sanitizeName('🚗💨')).toBe('🚗💨');
  });

  it('writes Romanian ș/ț with a comma and composes letters (NFC), so look-alikes are the same name', () => {
    expect(sanitizeName('Ştefan Ţurcan')).toBe('Ștefan Țurcan');
    expect(sanitizeName('Ga\u0306ina')).toBe('Găina');
    expect(nameKey('ŞTEFAN')).toBe(nameKey('ștefan'));
    expect(nameKey('Găina')).toBe(nameKey('ga\u0306ina'));
  });

  it('is idempotent and cheap on a huge input', () => {
    for (const raw of ['  Ştefan  ', `Z${'\u0301'.repeat(14)}`, '\u3164', 'a'.repeat(1_000_000)]) {
      expect(sanitizeName(sanitizeName(raw))).toBe(sanitizeName(raw));
    }
  });

  it('numbers a name already taken in the room, a bot name included', () => {
    const state = createGameState({ code: 'ABCDEF', seed: 's' });
    addPlayer(state, 'h', 'Ana');
    addBot(state, 'h', 'b1');
    const bot = state.players.b1!.name;
    expect((addPlayer(state, 'a', 'ana') as { player: { name: string } }).player.name).toBe('ana 2');
    expect((addPlayer(state, 'c', 'Ana') as { player: { name: string } }).player.name).toBe('Ana 3');
    expect((addPlayer(state, 'd', bot) as { player: { name: string } }).player.name).toBe(`${bot} 2`);
    const long = createGameState({ code: 'ABCDEF', seed: 's' });
    addPlayer(long, 'e', 'Abcdefghijklmnop');
    expect((addPlayer(long, 'f', 'ABCDEFGHIJKLMNOP') as { player: { name: string } }).player.name).toBe('ABCDEFGHIJKLMN 2');
  });
});
