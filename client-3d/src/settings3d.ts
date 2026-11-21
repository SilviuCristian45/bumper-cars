import { isTouch } from '@client/device';
import { load, save } from '@client/storage';
import { el } from '@client/ui/el';
import type { CameraMode } from './CameraRig';

// The 3D client's own settings, remembered on this device (masinute.quality3d / masinute.camera3d):
// rendering quality and the camera a match starts with. ?quality=low|high overrides the saved quality.

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
