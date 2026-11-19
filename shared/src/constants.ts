// Fixed simulation constants. Everything in the simulation is an integer (fixed-point):
// distances in sub-units (FP per pixel), speeds in sub-units per tick, angles in steps (fixed.ts).

// Timing
/** Simulation ticks per second; client and server step at exactly this rate. */
export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

/** Fixed-point scale: 1 px = FP sub-units. */
export const FP = 256;

// Arena: a disc centered on (0, 0). A car whose center leaves the ring is out for the round.
export const RING_RADIUS = 360 * FP;
export const CAR_RADIUS = 22 * FP;
/** The ring stops shrinking at about two car diameters. */
export const RING_MIN_RADIUS = 4 * CAR_RADIUS;
/** Distance from the center of the spawn circle. */
export const SPAWN_RADIUS = 220 * FP;

// Driving (per tick)
export const ACCEL = 110;
export const BRAKE = 200; // throttle < 0 while still rolling forward
export const REVERSE_ACCEL = 60;
export const MAX_SPEED = 1880; // ~220 px/s
export const MAX_REVERSE_SPEED = 900;
/** Per-mille of the forward speed lost every tick (rolling friction). */
export const FRICTION = 25;
/** Per-mille of the sideways speed lost every tick: below 1000 the car drifts a little. */
export const GRIP = 130;
/** Sideways grip right after being hit: the car slides across the floor for a moment. */
export const GRIP_HIT = 40;
export const SLIDE_TICKS = 24;
/** Turning in angle steps per tick at full steer: a bumper car turns even when standing still. */
export const TURN_STILL = 10;
export const TURN_MOVING = 18;
/** Forward speed at which turning reaches TURN_MOVING. */
export const TURN_FULL_SPEED = 900;

// Boost: a short shove that also makes the car heavier, for strong hits.
export const BOOST_TICKS = 8;
export const BOOST_ACCEL = 420;
export const BOOST_MAX_SPEED = 3580; // ~420 px/s
export const BOOST_COOLDOWN_TICKS = 3 * TICK_RATE;

// Collisions
export const CAR_MASS = 100;
export const BOOST_MASS = 180;
/** Restitution in percent (100 = perfectly elastic). */
export const RESTITUTION = 85;
/** Approach speed (sub-units per tick) above which a contact counts as a hit for scoring. */
export const HIT_MIN_SPEED = 300;
/** Impulse above which a contact is reported as a 'bump' event (sparks, sound). */
export const BUMP_EVENT_MIN = 15000;

// Input
export const INPUT_MAX = 100; // steer and throttle are integers in [-INPUT_MAX, INPUT_MAX]

// Round flow
/** "3, 2, 1, START!" at the start of every round: cars are frozen until START. */
export const COUNTDOWN_TICKS = 3 * TICK_RATE;
/** The ring starts shrinking after 45 s of fighting (the countdown is not counted)... */
export const SHRINK_START_TICKS = 45 * TICK_RATE;
/** ...and reaches RING_MIN_RADIUS this long after. */
export const SHRINK_DURATION_TICKS = 30 * TICK_RATE;
/** A round always ends after 90 s of fighting; then nobody gets the round bonus. */
export const ROUND_TIME_LIMIT_TICKS = 90 * TICK_RATE;
export const INTERMISSION_TICKS = 4 * TICK_RATE;
export const ROUND_OPTIONS: readonly number[] = [3, 5, 7];
export const DEFAULT_ROUNDS = 3;

// Scoring
export const POINTS_ROUND_WIN = 3;
export const POINTS_KNOCKOUT = 1;
export const POINTS_SELF_OUT = -1;
/** A knockout is credited to the last car that hit the victim within this window. */
export const HIT_CREDIT_TICKS = 3 * TICK_RATE;

// Players
export const MAX_PLAYERS = 6;
export const MIN_PLAYERS_TO_START = 2;
export const MAX_NAME_LENGTH = 16;

// One color per slot (0..5).
export const PLAYER_COLORS: readonly number[] = [
  0xe63946, // roșu
  0x4cc9f0, // albastru
  0xffd60a, // galben
  0x52b788, // verde
  0xc77dff, // mov
  0xff8c42, // portocaliu
];

// Bot difficulty (PlayerState.botLevel, GameState.botLevel for newly added bots).
export const BOT_EASY = 0;
export const BOT_MEDIUM = 1;
export const BOT_HARD = 2;
export const BOT_LEVELS: readonly number[] = [BOT_EASY, BOT_MEDIUM, BOT_HARD];
export const DEFAULT_BOT_LEVEL = BOT_MEDIUM;

export const BOT_NAMES: readonly string[] = ['Căluțul', 'Vată de Zahăr', 'Turtă Dulce', 'Clovnul', 'Scrânciobul', 'Lanțurile'];
