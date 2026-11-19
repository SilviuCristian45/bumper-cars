// Game state is flat and serializable so it maps directly onto @colyseus/schema:
// players -> MapSchema, everything else plain numbers/strings. Every number is an integer.

export type Phase = 'lobby' | 'playing' | 'intermission' | 'finished';

/** One tick of driving input; held by the car until the next input arrives. */
export interface CarInput {
  /** Client sequence number, echoed back as PlayerState.lastSeq for reconciliation. */
  seq: number;
  steer: number; // -100 (left) .. 100 (right)
  throttle: number; // -100 (brake / reverse) .. 100 (full gas)
  boost: boolean; // latched until the next tick
}

export interface PlayerInput extends CarInput {
  playerId: string;
}

/** How a round ended: one car left, nobody left (simultaneous elimination), or the time limit. */
export type RoundOutcome = '' | 'win' | 'draw' | 'timeout';

export interface PlayerState {
  id: string;
  name: string;
  slot: number; // 0..5, also the color index
  joinOrder: number;
  isBot: boolean;
  botLevel: number; // BOT_EASY..BOT_HARD, only meaningful for bots
  connected: boolean;
  left: boolean; // gone for good mid-match: stays in the standings until the lobby
  alive: boolean; // on the ring this round
  // Physics (sub-units, sub-units per tick, angle steps)
  x: number;
  y: number;
  vx: number;
  vy: number;
  heading: number;
  // Held input
  steer: number;
  throttle: number;
  boostPressed: boolean; // consumed at the next tick
  lastSeq: number; // last input seq applied
  // Boost
  boostTicks: number; // >0 while boosting
  boostCooldown: number; // ticks until the next boost
  slideTicks: number; // >0 right after being hit: less grip
  // Scoring
  lastHitBy: string; // '' = nobody
  lastHitTick: number;
  wins: number;
  knockouts: number; // others pushed off the ring (+1 each)
  selfOuts: number; // left the ring on their own (-1 each)
  outs: number; // eliminated, any reason
  points: number;
  bumps: number; // hits dealt, statistics only
}

export interface GameState {
  code: string;
  phase: Phase;
  hostId: string;
  roundsTotal: number;
  botLevel: number; // level given to bots added from now on
  round: number;
  tick: number;
  roundTick: number; // ticks since the round started, countdown included
  phaseTimer: number; // intermission countdown
  roundWinner: string; // '' unless roundOutcome is 'win'
  roundOutcome: RoundOutcome;
  ringRadius: number;
  rng: number; // uint32 RNG state
  joinCounter: number;
  players: Record<string, PlayerState>;
}

export type GameEvent =
  /** Two cars hit each other; `force` is the impulse, x/y the contact point. */
  | { type: 'bump'; a: string; b: string; x: number; y: number; force: number }
  | { type: 'boost'; playerId: string }
  /** A car left the ring. `byId` was credited the knockout ('' = on their own). */
  | { type: 'out'; playerId: string; byId: string }
  | { type: 'roundStart'; round: number }
  | { type: 'go'; round: number } // countdown over: START!
  | { type: 'shrinkStart' }
  | { type: 'roundEnd'; round: number; winnerId: string; outcome: RoundOutcome }
  | { type: 'matchEnd'; standings: string[] };
