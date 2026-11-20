import {
  BOT_HARD,
  BOT_LEVELS,
  BOT_NAMES,
  DEFAULT_BOT_LEVEL,
  DEFAULT_ROUNDS,
  MAX_NAME_LENGTH,
  MAX_PLAYERS,
  MIN_PLAYERS_TO_START,
  RING_RADIUS,
  ROUND_OPTIONS,
  SPAWN_RADIUS,
} from './constants';
import { ANGLE_STEPS, icos, idiv, isin, TRIG_ONE, wrapAngle } from './fixed';
import { clearPowerups } from './powerups';
import { nextInt, seedFrom } from './rng';
import type { GameEvent, GameState, PlayerState } from './types';

export interface CreateOptions {
  code: string;
  seed: number | string;
}

export function createGameState(opts: CreateOptions): GameState {
  return {
    code: opts.code,
    phase: 'lobby',
    hostId: '',
    roundsTotal: DEFAULT_ROUNDS,
    botLevel: DEFAULT_BOT_LEVEL,
    round: 0,
    tick: 0,
    roundTick: 0,
    phaseTimer: 0,
    roundWinner: '',
    roundOutcome: '',
    ringRadius: RING_RADIUS,
    rng: seedFrom(opts.seed),
    joinCounter: 0,
    powerups: true,
    puTimer: 0,
    pu0Kind: 0,
    pu0X: 0,
    pu0Y: 0,
    pu0Ticks: 0,
    pu1Kind: 0,
    pu1X: 0,
    pu1Y: 0,
    pu1Ticks: 0,
    players: {},
  };
}

/** Players ordered by slot; every per-player loop uses this order for determinism. */
export function sortedPlayers(state: GameState): PlayerState[] {
  return Object.values(state.players).sort((a, b) => a.slot - b.slot);
}

/** Trimmed, at most MAX_NAME_LENGTH characters, without control or invisible formatting characters. */
export function sanitizeName(name: string): string {
  const clean = [...name.replace(/[\p{Cc}\p{Cf}]/gu, '').trim()].slice(0, MAX_NAME_LENGTH).join('').trim();
  return clean || 'Jucător';
}

export type JoinResult = { ok: true; player: PlayerState } | { ok: false; reason: 'in-progress' | 'full' | 'duplicate' };

/** Joins are only allowed in the lobby. The first human to join becomes host. */
export function addPlayer(state: GameState, id: string, name: string, isBot = false, botLevel = BOT_HARD): JoinResult {
  if (state.phase !== 'lobby') return { ok: false, reason: 'in-progress' };
  if (state.players[id]) return { ok: false, reason: 'duplicate' };
  const used = new Set(Object.values(state.players).map((p) => p.slot));
  if (used.size >= MAX_PLAYERS) return { ok: false, reason: 'full' };
  let slot = 0;
  while (used.has(slot)) slot++;
  const player: PlayerState = {
    id,
    name: sanitizeName(name),
    slot,
    joinOrder: state.joinCounter++,
    isBot,
    botLevel,
    connected: true,
    left: false,
    alive: false,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    heading: 0,
    steer: 0,
    throttle: 0,
    boostPressed: false,
    lastSeq: 0,
    boostTicks: 0,
    boostCooldown: 0,
    slideTicks: 0,
    lastHitBy: '',
    lastHitTick: 0,
    wins: 0,
    knockouts: 0,
    selfOuts: 0,
    outs: 0,
    points: 0,
    bumps: 0,
    pickups: 0,
    effect: 0,
    effectTicks: 0,
    confusedTicks: 0,
    oilX: 0,
    oilY: 0,
    oilTicks: 0,
  };
  state.players[id] = player;
  if (!state.hostId && !isBot) state.hostId = id;
  return { ok: true, player };
}

/** Adds a bot with a free fairground name, at the room's current bot level. Host-only, lobby-only. */
export function addBot(state: GameState, byId: string, botId: string): JoinResult | { ok: false; reason: 'not-host' } {
  if (byId !== state.hostId) return { ok: false, reason: 'not-host' };
  const taken = new Set(Object.values(state.players).map((p) => p.name));
  const name = BOT_NAMES.find((n) => !taken.has(n)) ?? 'Bot';
  return addPlayer(state, botId, name, true, state.botLevel);
}

/** The level for bots added from now on ("Nivel boți"). Host-only, lobby-only. */
export function setDefaultBotLevel(state: GameState, byId: string, level: number): boolean {
  if (byId !== state.hostId || state.phase !== 'lobby' || !BOT_LEVELS.includes(level)) return false;
  state.botLevel = level;
  return true;
}

/** Changes one bot's level. Host-only, lobby-only. */
export function setBotLevel(state: GameState, byId: string, botId: string, level: number): boolean {
  const bot = state.players[botId];
  if (byId !== state.hostId || state.phase !== 'lobby' || !bot?.isBot || !BOT_LEVELS.includes(level)) return false;
  bot.botLevel = level;
  return true;
}

/** Easy -> medium -> hard -> easy, for the lobby's one-click level tag. */
export function nextBotLevel(level: number): number {
  return BOT_LEVELS[(BOT_LEVELS.indexOf(level) + 1) % BOT_LEVELS.length]!;
}

/** Removes the most recently added bot. Host-only, lobby-only. */
export function removeBot(state: GameState, byId: string): boolean {
  if (byId !== state.hostId || state.phase !== 'lobby') return false;
  const bot = Object.values(state.players)
    .filter((p) => p.isBot)
    .sort((a, b) => b.joinOrder - a.joinOrder)[0];
  if (!bot) return false;
  removePlayer(state, bot.id);
  return true;
}

/** Removes a player; if the host leaves, the next human by join order takes over. */
export function removePlayer(state: GameState, id: string): void {
  if (!state.players[id]) return;
  delete state.players[id];
  if (state.hostId === id) state.hostId = nextHost(state);
}

/**
 * A player gone for good (tab closed, reconnection window expired). In the lobby they are
 * removed; mid-match their car leaves the ring without crediting or costing anyone and they stay
 * in the standings until the lobby. Returns the 'out' event, if any, so clients can show it.
 */
export function leavePlayer(state: GameState, id: string): GameEvent[] {
  const p = state.players[id];
  if (!p) return [];
  if (state.phase === 'lobby') {
    removePlayer(state, id);
    return [];
  }
  const events: GameEvent[] = [];
  p.left = true;
  p.connected = false;
  if (p.alive) {
    p.alive = false;
    p.steer = 0;
    p.throttle = 0;
    p.boostPressed = false;
    events.push({ type: 'out', playerId: id, byId: '' });
  }
  if (state.hostId === id) state.hostId = nextHost(state);
  return events;
}

/** The next host: the earliest-joined human still in the room, connected ones first. Never a bot. */
function nextHost(state: GameState): string {
  const next = Object.values(state.players)
    .filter((p) => !p.isBot && !p.left && p.id !== state.hostId)
    .sort((a, b) => Number(b.connected) - Number(a.connected) || a.joinOrder - b.joinOrder)[0];
  return next ? next.id : '';
}

/** Marks a player as temporarily disconnected (they keep their place for reconnection). */
export function setConnected(state: GameState, id: string, connected: boolean): void {
  const p = state.players[id];
  if (p) p.connected = connected;
}

export function setRounds(state: GameState, byId: string, rounds: number): boolean {
  if (byId !== state.hostId || state.phase !== 'lobby' || !ROUND_OPTIONS.includes(rounds)) return false;
  state.roundsTotal = rounds;
  return true;
}

/** Host, lobby: power-ups on or off for the next match. */
export function setPowerups(state: GameState, byId: string, on: boolean): boolean {
  if (byId !== state.hostId || state.phase !== 'lobby' || typeof on !== 'boolean') return false;
  state.powerups = on;
  return true;
}

export function canStart(state: GameState, byId: string): boolean {
  return (
    byId === state.hostId && state.phase === 'lobby' && Object.keys(state.players).length >= MIN_PLAYERS_TO_START
  );
}

/** Host starts the match from the lobby: scores reset, round 1 begins. */
export function startMatch(state: GameState, byId: string): boolean {
  if (!canStart(state, byId)) return false;
  for (const p of Object.values(state.players)) {
    p.wins = 0;
    p.knockouts = 0;
    p.selfOuts = 0;
    p.outs = 0;
    p.points = 0;
    p.bumps = 0;
    p.pickups = 0;
  }
  state.round = 1;
  startRound(state);
  return true;
}

/** "Încă un meci": host sends everyone back to the lobby of the same room. */
export function backToLobby(state: GameState, byId: string): boolean {
  if (byId !== state.hostId || state.phase !== 'finished') return false;
  state.phase = 'lobby';
  state.round = 0;
  state.roundWinner = '';
  state.roundOutcome = '';
  state.ringRadius = RING_RADIUS;
  clearPowerups(state);
  for (const p of Object.values(state.players)) {
    if (p.left) delete state.players[p.id];
    else p.alive = false;
  }
  return true;
}

/**
 * Everyone back on the full ring, evenly spaced on the spawn circle (rotated by a seeded random
 * angle each round) and facing the center. The countdown starts.
 */
export function startRound(state: GameState): void {
  state.phase = 'playing';
  state.roundTick = 0;
  state.phaseTimer = 0;
  state.roundWinner = '';
  state.roundOutcome = '';
  state.ringRadius = RING_RADIUS;
  clearPowerups(state);
  const racers = sortedPlayers(state).filter((p) => !p.left);
  const offset = nextInt(state, ANGLE_STEPS);
  racers.forEach((p, i) => {
    const angle = wrapAngle(offset + idiv(i * ANGLE_STEPS, racers.length));
    p.x = idiv(SPAWN_RADIUS * icos(angle), TRIG_ONE);
    p.y = idiv(SPAWN_RADIUS * isin(angle), TRIG_ONE);
    p.heading = wrapAngle(angle + ANGLE_STEPS / 2);
  });
  for (const p of sortedPlayers(state)) {
    p.alive = !p.left;
    p.vx = 0;
    p.vy = 0;
    p.steer = 0;
    p.throttle = 0;
    p.boostPressed = false;
    p.boostTicks = 0;
    p.boostCooldown = 0;
    p.slideTicks = 0;
    p.lastHitBy = '';
    p.lastHitTick = 0;
    p.effect = 0;
    p.effectTicks = 0;
    p.confusedTicks = 0;
    p.oilTicks = 0;
  }
}

/** Mid-round with no human left on the ring but bots still fighting; the round can be fast-forwarded. */
export function onlyBotsAlive(state: GameState): boolean {
  const alive = Object.values(state.players).filter((p) => p.alive);
  return state.phase === 'playing' && alive.length > 0 && alive.every((p) => p.isBot);
}

/** Player ids ranked by points, then round wins, knockouts, fewest outs, slot. */
export function computeStandings(state: GameState): string[] {
  return Object.values(state.players)
    .sort(
      (a, b) =>
        b.points - a.points || b.wins - a.wins || b.knockouts - a.knockouts || a.outs - b.outs || a.slot - b.slot,
    )
    .map((p) => p.id);
}
