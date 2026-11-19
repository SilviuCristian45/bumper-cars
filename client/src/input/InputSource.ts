/** What the player wants this frame; the transport turns it into one input per simulation tick. */
export interface DriveInput {
  steer: number; // -100 .. 100
  throttle: number; // -100 .. 100
  /** Boost pressed since the last poll (latched until the next tick by the transport). */
  boost: boolean;
}

/** What a source may need to know about the car (the joystick steers toward a direction on screen). */
export interface DriveContext {
  /** Current heading of the player's car, in angle steps. */
  heading: number;
}

/** Turns a device (keyboard, touch) into driving input. Polled once per frame. */
export interface InputSource {
  /** null when this source is not being used right now (so another one can take over). */
  poll(ctx: DriveContext): DriveInput | null;
  /** Lets go of everything held (page hidden, round over). */
  releaseAll(): void;
  destroy(): void;
}

export const NO_INPUT: DriveInput = { steer: 0, throttle: 0, boost: false };
