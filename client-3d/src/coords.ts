import { ANGLE_STEPS, FP, TICK_RATE, wrapAngle } from '@masinute/shared';

// Simulation plane -> 3D world: 1 world unit = 1 simulation pixel, sim x -> world x, sim y -> world z
// (the 2D screen's "down" points toward the default camera), floor at y = 0.

/** Height of the ceiling net the antennas touch. */
export const CEILING_Y = 150;
/** Thickness of the ring's platform (the cars fall off its edge). */
export const PLATFORM_DEPTH = 18;

export const toWorld = (sub: number): number => sub / FP;

/** Sub-units per tick -> world units per second. */
export const speedToWorld = (sub: number): number => (sub / FP) * TICK_RATE;

/** Heading in angle steps (0 = +x, growing clockwise on the 2D screen) -> rotation around world Y. */
export const headingToYaw = (heading: number): number => (-heading * 2 * Math.PI) / ANGLE_STEPS;

/** Exponential smoothing factor for a rate (1/s) over dt seconds, frame-rate independent. */
export const ease = (rate: number, dt: number): number => 1 - Math.exp(-rate * dt);

/** Shortest signed difference b - a between two angles in radians. */
export function angleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/** World direction on the floor (x, z) -> heading in angle steps (the inverse of headingToYaw's direction). */
export function directionToHeading(x: number, z: number): number {
  return (Math.atan2(z, x) / (2 * Math.PI)) * ANGLE_STEPS;
}

/**
 * The heading the joystick should treat as the car's: TouchInput steers toward the stick's direction
 * with screen up = heading 3/4 turn (as in 2D, where the screen is the world). Rotating by the camera's
 * own heading makes screen up = straight ahead of the camera, so on the chase camera up = forward.
 */
export function joystickHeading(carHeading: number, cameraHeading: number): number {
  return wrapAngle(Math.round(carHeading + (ANGLE_STEPS * 3) / 4 - cameraHeading));
}
