import { ANGLE_STEPS } from '@masinute/shared';
import { describe, expect, it } from 'vitest';
import { directionToHeading, headingToYaw, joystickHeading } from '../src/coords';

const QUARTER = ANGLE_STEPS / 4;
const UP = (ANGLE_STEPS * 3) / 4; // TouchInput: the stick pushed to the top of the screen

describe('joystick relative to the camera', () => {
  it('the tilted camera (looking toward -z, sim -y) leaves the heading as it is: screen = world, as in 2D', () => {
    const camera = directionToHeading(0, -1);
    for (const car of [0, 100, 300, 700, 1000]) expect(joystickHeading(car, camera)).toBe(car);
  });

  it('on the chase camera, looking where the car looks, the car always counts as pointing up the screen', () => {
    for (const car of [0, 37, 256, 511, 900]) {
      const yaw = headingToYaw(car);
      const camera = directionToHeading(Math.cos(yaw), -Math.sin(yaw));
      // Stick up = straight ahead: no steering.
      expect(joystickHeading(car, camera)).toBe(UP);
    }
  });

  it('turns with the camera: a camera turned a quarter to the right turns the controls with it', () => {
    // Camera looking along +x (sim heading 0) while the car points down the sim y axis (a quarter turn right of it).
    const camera = directionToHeading(1, 0);
    expect(joystickHeading(QUARTER, camera)).toBe(0); // on screen: pointing right
    expect(joystickHeading(0, camera)).toBe(UP);
  });
});
