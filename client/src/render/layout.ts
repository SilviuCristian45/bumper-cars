import { FP, RING_RADIUS } from '@masinute/shared';
import { isTouch } from '../device';

// Screen layout, 1 simulation pixel = 1 canvas pixel. Desktop: the arena on the left, the HUD on
// the right. Touch: a wider canvas with a thumb zone on each side of the arena (joystick + scores
// on one, boost button + round info on the other), so the controls never cover the ring.

export const TOUCH_LAYOUT = isTouch;
/** The ring at full size, in pixels. */
export const ARENA_R = RING_RADIUS / FP;
/** Rubber rim and lights around the ring. */
export const RIM_W = 26;
export const GAME_H = 2 * (ARENA_R + RIM_W) + 28;
/** Touch: width of each zone beside the arena. */
export const SIDE_W = 300;
export const GAME_W = TOUCH_LAYOUT ? GAME_H + 2 * SIDE_W : 1300;
export const ARENA_CX = TOUCH_LAYOUT ? GAME_W / 2 : GAME_H / 2 + 6;
export const ARENA_CY = GAME_H / 2;
export const HUD_X = TOUCH_LAYOUT ? 16 : GAME_H + 30;
export const HUD_W = TOUCH_LAYOUT ? SIDE_W - 32 : GAME_W - HUD_X - 24;

/** Simulation sub-units (a position) to canvas pixels. */
export function toScreenX(x: number): number {
  return ARENA_CX + x / FP;
}

export function toScreenY(y: number): number {
  return ARENA_CY + y / FP;
}

export const FONT = "'Trebuchet MS', 'Segoe UI', Verdana, sans-serif";

export const DEPTH = {
  floor: 0,
  shrink: 1,
  marks: 2,
  shadow: 3,
  car: 4,
  carTop: 5,
  fx: 6,
  labels: 7,
  lights: 8,
  debug: 20,
  hud: 30,
  /** The end-of-match podium covers the HUD... */
  podium: 34,
  /** ...but not the leave button. */
  leave: 35,
  overlay: 40,
} as const;
