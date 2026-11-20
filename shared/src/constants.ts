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

// Power-ups: they appear at random spots on the ring and are picked up by driving over them.
// Kinds (GameState.puNKind, PlayerState.effect); 0 = none.
export const PU_NONE = 0;
/** Claxon de TIR: an instant shock wave that shoves every car around (counts as a hit). */
export const PU_HORN = 1;
/** Mici cu muștar: double mass, a bit slower, for a while. */
export const PU_MICI = 2;
/** Colac de salvare: the next fall off the ring is cancelled (the car bounces back toward the center). */
export const PU_LIFEBUOY = 3;
/** Ulei vărsat: a slippery puddle dropped behind the car. */
export const PU_OIL = 4;
/** Țuică de prună: the next car you hit gets reversed steering for a while. */
export const PU_TUICA = 5;
/** Bară cu arcuri: your hits shove twice as hard, for a while. */
export const PU_SPRINGS = 6;
/** Suc Zero Zahăr: much faster and quicker off the mark, but it grips less (easy to fly off the ring). */
export const PU_SODA = 7;
/** Pudră proteică: the car grows (bigger radius, much heavier, a bit slower to accelerate) for a while. */
export const PU_PROTEIN = 8;
/** Fantomă: invisible to the others and untouchable (no collisions at all, ignored by the horn and the bots). */
export const PU_GHOST = 9;
export const POWERUP_KINDS: readonly number[] = [PU_HORN, PU_MICI, PU_LIFEBUOY, PU_OIL, PU_TUICA, PU_SPRINGS, PU_SODA, PU_PROTEIN, PU_GHOST];
/** Power-ups lying on the ring at once (state slots pu0*, pu1*). */
export const POWERUP_SLOTS = 2;
/** The first one appears this long after START... */
export const POWERUP_FIRST_TICKS = 10 * TICK_RATE;
/** ...then one every 8-14 s (fighting time). */
export const POWERUP_MIN_GAP_TICKS = 8 * TICK_RATE;
export const POWERUP_MAX_GAP_TICKS = 14 * TICK_RATE;
/** Not picked up in this long: it vanishes. */
export const POWERUP_LIFETIME_TICKS = 10 * TICK_RATE;
/** The last stretch of its life, during which clients make it blink. */
export const POWERUP_BLINK_TICKS = 2 * TICK_RATE;
/** Pickup reach: a car's center within CAR_RADIUS + POWERUP_RADIUS of it. */
export const POWERUP_RADIUS = 16 * FP;
/** Never placed closer than this to the ring's edge... */
export const POWERUP_EDGE_MARGIN = 3 * CAR_RADIUS;
/** ...or to a car still on the ring, or than this to the other power-up. */
export const POWERUP_CAR_CLEARANCE = 3 * CAR_RADIUS;
export const POWERUP_SPACING = 4 * POWERUP_RADIUS;
/** Random spots tried per spawn; when none is free, it tries again this many ticks later. */
export const POWERUP_SPAWN_TRIES = 8;
export const POWERUP_RETRY_TICKS = 10;

// Power-up strengths and durations: the defaults of the TUNING values (tuning.ts, ?tune).
export const HORN_RADIUS = 6 * CAR_RADIUS; // ~3 cars
export const HORN_PUSH = 3400; // speed given to a car right next to the horn, less further away
export const MICI_TICKS = 6 * TICK_RATE;
export const MICI_MASS_PCT = 200;
export const MICI_SPEED_PCT = 85;
export const LIFEBUOY_TICKS = 10 * TICK_RATE;
export const LIFEBUOY_BOUNCE = 1400; // speed toward the center after the rescue
export const OIL_TICKS = 8 * TICK_RATE;
export const OIL_RADIUS = 54 * FP;
export const OIL_GRIP = 6; // sideways grip on the puddle (normal GRIP 130)
export const TUICA_TICKS = 8 * TICK_RATE;
export const TUICA_CONFUSE_TICKS = 4 * TICK_RATE;
export const SPRINGS_TICKS = 5 * TICK_RATE;
export const SPRINGS_PCT = 200;
export const SODA_TICKS = 5 * TICK_RATE;
export const SODA_SPEED_PCT = 160; // top speed
export const SODA_ACCEL_PCT = 150;
export const SODA_GRIP_PCT = 85; // sideways grip (a bit less: harder to keep on the ring, bounced further when hit)
export const PROTEIN_TICKS = 6 * TICK_RATE;
export const PROTEIN_SIZE_PCT = 170; // radius (~3 cars in area)
export const PROTEIN_MASS_PCT = 300;
export const PROTEIN_ACCEL_PCT = 85;
/** Growing to full size (and shrinking back) takes this long. */
export const PROTEIN_GROW_TICKS = 9; // ~0.3 s
export const GHOST_TICKS = 5 * TICK_RATE;
/**
 * A ghost that reappears on top of a car: the two drift apart gently (no impulse, no knockout
 * credit) at up to this many sub-units per tick each, for at most GHOST_SEPARATE_TICKS.
 */
export const GHOST_SEPARATE_STEP = 3 * FP;
export const GHOST_SEPARATE_TICKS = TICK_RATE;
