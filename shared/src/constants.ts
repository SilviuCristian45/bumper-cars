// Fixed simulation constants. Everything in the simulation is an integer (fixed-point).

/** Simulation ticks per second; client and server step at exactly this rate. */
export const TICK_RATE = 30;
export const TICK_MS = 1000 / TICK_RATE;

/** Fixed-point scale: 1 px = FP sub-units. Positions and velocities are integers in sub-units. */
export const FP = 256;

export const MAX_PLAYERS = 6;
