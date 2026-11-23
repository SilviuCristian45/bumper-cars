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
  pickups: number; // power-ups picked up this match, statistics only
  giantKnockouts: number; // knockouts while big from Pudră proteică this match, statistics only
  // Power-ups (all 0 when they are off)
  effect: number; // active effect (PU_MICI, PU_LIFEBUOY, PU_TUICA, PU_SPRINGS, PU_SODA, PU_PROTEIN, PU_GHOST) or PU_NONE
  effectTicks: number; // ticks left of it
  confusedTicks: number; // >0: steering reversed (hit by someone with Țuică)
  oilX: number; // this car's oil puddle (one at a time), live while oilTicks > 0
  oilY: number;
  oilTicks: number;
  sizePct: number; // radius in percent of CAR_RADIUS: 100, up to proteinSizePct while Pudră proteică lasts (grows and shrinks gradually)
  ghostFade: number; // >0 right after Fantomă ended on top of a car: collisions with it only drift apart gently
  // Looks only, never read by the simulation: the character in the 3D client's driver seat
  // (0 = the plain driver, 1..DRIVER_COUNT = the player's pick; bots are drawn by their name).
  driver: number;
  // Set by the server room, outside the simulation (which never reads it): a player with no input for
  // IDLE_TICKS while a round is played (tab in the background, connection down). Others see "zzz".
  idle: boolean;
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
  /** Lobby option (host): power-ups on the ring. Off, the simulation is exactly the one without them. */
  powerups: boolean;
  /** Lobby option (host): how often power-ups appear, POWERUP_FREQ_MIN..MAX (POWERUP_TIMINGS). */
  puFreq: number;
  /** Fighting ticks until the next power-up tries to appear. */
  puTimer: number;
  // The power-ups lying on the ring: two flat slots (kind PU_NONE = empty), see powerups.ts.
  pu0Kind: number;
  pu0X: number;
  pu0Y: number;
  pu0Ticks: number; // ticks left before it vanishes
  pu1Kind: number;
  pu1X: number;
  pu1Y: number;
  pu1Ticks: number;
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
  | { type: 'matchEnd'; standings: string[] }
  /** A power-up appeared on the ring. */
  | { type: 'powerupSpawn'; kind: number; x: number; y: number }
  /** A car drove over a power-up (it takes effect at once). */
  | { type: 'pickup'; playerId: string; kind: number }
  /** Claxon de TIR went off at x/y. */
  | { type: 'horn'; playerId: string; x: number; y: number }
  /** Colac de salvare cancelled a fall off the ring. */
  | { type: 'saved'; playerId: string }
  /** Țuică: `playerId` was hit by `byId` and steers backwards for a while. */
  | { type: 'confused'; playerId: string; byId: string }
  /** A hit with Bară cu arcuri (x/y: contact point). */
  | { type: 'spring'; playerId: string; x: number; y: number }
  /** A lasting effect ran out (not when a new pick-up replaced it). */
  | { type: 'effectEnd'; playerId: string; kind: number };
