import { isTouch } from './device';
import { load, save } from './storage';

// Per-device preferences, remembered in localStorage:
// - "Efecte reduse": fewer particles, no camera shake (on by default on touch devices);
// - left-handed touch controls (joystick and boost button swapped), vibration.

export type SettingKey = 'reducedEffects' | 'leftHanded' | 'vibration';

const DEFAULTS: Record<SettingKey, boolean> = {
  reducedEffects: isTouch,
  leftHanded: false,
  vibration: true,
};

const values = {} as Record<SettingKey, boolean>;
for (const key of Object.keys(DEFAULTS) as SettingKey[]) {
  const saved = load(key);
  values[key] = saved === null ? DEFAULTS[key] : saved === '1';
}

export function getSetting(key: SettingKey): boolean {
  return values[key];
}

export function setSetting(key: SettingKey, value: boolean): void {
  if (value === values[key]) return;
  values[key] = value;
  save(key, value ? '1' : '0');
}

export function reducedEffects(): boolean {
  return values.reducedEffects;
}

/** A short buzz on phones that support it (and when the player wants it). */
export function vibrate(ms: number): void {
  if (!isTouch || !values.vibration) return;
  try {
    navigator.vibrate?.(ms);
  } catch {
    // not supported
  }
}
