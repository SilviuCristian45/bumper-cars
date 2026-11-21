import { isTouch } from '../device';
import { getSetting, setSetting, type SettingKey } from '../settings';
import { el } from './el';
import { button } from './html';
import { openDialog } from './dialog';

// "Setări": music, effects and the touch controls, remembered on this device.

const canVibrate = typeof navigator.vibrate === 'function';

function toggle(key: SettingKey, label: string): HTMLButtonElement {
  const state = el('span', { class: 'state' });
  const node = el('button', { class: 'toggle', attrs: { type: 'button' } }, [el('span', { text: label }), state]);
  const sync = () => {
    const on = getSetting(key);
    node.classList.toggle('on', on);
    node.setAttribute('aria-pressed', String(on));
    state.textContent = on ? 'da' : 'nu';
  };
  node.addEventListener('click', () => {
    setSetting(key, !getSetting(key));
    sync();
  });
  sync();
  return node;
}

export interface SettingsOptions {
  /** The music toggle (default: shown; the 3D client has no music yet). */
  music?: boolean;
  /** More rows at the end (the 3D client's quality and camera). */
  extra?: HTMLElement[];
}

export function openSettings(opts: SettingsOptions = {}): void {
  const items: HTMLElement[] = opts.music === false ? [toggle('reducedEffects', 'Efecte reduse')] : [toggle('music', 'Muzică'), toggle('reducedEffects', 'Efecte reduse')];
  if (isTouch) {
    items.push(toggle('leftHanded', 'Mod stângaci (boost în stânga)'));
    if (canVibrate) items.push(toggle('vibration', 'Vibrații'));
  }
  items.push(...(opts.extra ?? []));
  const dialog = openDialog(
    [el('h2', { text: 'Setări' }), el('div', { class: 'toggle-list' }, items), button('Gata', () => dialog.close(), 'primary', 'medium')],
    () => dialog.close(),
  );
}
