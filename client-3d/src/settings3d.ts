import { DRIVER_COUNT } from '@masinute/shared';
import { isTouch } from '@client/device';
import { load, save } from '@client/storage';
import { el } from '@client/ui/el';
import type { CameraMode } from './CameraRig';

// The 3D client's own settings, remembered on this device (masinute.quality3d / camera3d / minimap3d / driver3d):
// rendering quality, the camera a match starts with, the minimap, the character in the driver seat.
// ?quality=low|high overrides the saved quality.

export type Quality = 'low' | 'high';

const params = new URLSearchParams(window.location.search);
const urlQuality = params.get('quality');
/** ?quality wins over the setting for this page. */
export const qualityFromUrl: Quality | null = urlQuality === 'low' || urlQuality === 'high' ? urlQuality : null;

export function getQuality(): Quality {
  if (qualityFromUrl) return qualityFromUrl;
  const saved = load('quality3d');
  if (saved === 'low' || saved === 'high') return saved;
  // Phones and tablets: no shadows, no bloom, pixel ratio capped.
  return isTouch ? 'low' : 'high';
}

export function getCameraMode(): CameraMode {
  return load('camera3d') === 'chase' ? 'chase' : 'tilted';
}

let minimap: boolean | null = null;

/** The minimap in the corner of a match (masinute.minimap3d, on by default; M toggles it). */
export function getMinimap(): boolean {
  minimap ??= load('minimap3d') !== '0';
  return minimap;
}

export function setMinimap(on: boolean): void {
  minimap = on;
  save('minimap3d', on ? '1' : '0');
}

/** A "Setări" row that cycles through choices, styled like the dialog's on/off toggles. */
function choice<T extends string>(label: string, options: readonly [T, string][], get: () => T, set: (value: T) => void): HTMLElement {
  const state = el('span', { class: 'state' });
  const node = el('button', { class: 'toggle on', attrs: { type: 'button' } }, [el('span', { text: label }), state]);
  const sync = () => (state.textContent = options.find(([v]) => v === get())?.[1] ?? '');
  node.addEventListener('click', () => {
    const i = options.findIndex(([v]) => v === get());
    set(options[(i + 1) % options.length]![0]);
    sync();
  });
  sync();
  return node;
}

/** The 3D rows of "Setări": quality (applied at once through onQuality) and the default camera. */
export function settingsRows(onQuality: (quality: Quality) => void): HTMLElement[] {
  const rows = [
    choice<CameraMode>(
      'Camera la început',
      [
        ['tilted', 'de sus'],
        ['chase', 'din spate'],
      ],
      getCameraMode,
      (mode) => save('camera3d', mode),
    ),
    choice<'on' | 'off'>(
      isTouch ? 'Hartă mică' : 'Hartă mică (M)',
      [
        ['on', 'da'],
        ['off', 'nu'],
      ],
      () => (getMinimap() ? 'on' : 'off'),
      (value) => setMinimap(value === 'on'),
    ),
  ];
  if (!qualityFromUrl) {
    rows.unshift(
      choice<Quality>(
        'Calitate grafică',
        [
          ['low', 'redusă'],
          ['high', 'înaltă'],
        ],
        getQuality,
        (quality) => {
          save('quality3d', quality);
          onQuality(quality);
        },
      ),
    );
  }
  return rows;
}

/** The character in the driver seat (masinute.driver3d, 0..DRIVER_COUNT); a random one on the first visit. */
export function getDriver(): number {
  const saved = Number(load('driver3d'));
  if (load('driver3d') !== null && Number.isInteger(saved) && saved >= 0 && saved <= DRIVER_COUNT) return saved;
  const pick = 1 + Math.floor(Math.random() * DRIVER_COUNT);
  saveDriver(pick);
  return pick;
}

export function saveDriver(driver: number): void {
  save('driver3d', String(driver));
}
