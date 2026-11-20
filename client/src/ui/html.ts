import { isTouch } from '../device';
import { el, type Child } from './el';

// Phaser-free helpers for the HTML parts of the UI (screens, dialogs, toasts, touch controls, tuning
// panel), shared with the 3D client. ui/dom.ts adds the Phaser-bound ones.

/** How long something lives: a Phaser scene in 2D, a route in 3D. */
export interface Lifetime {
  /** Runs once when it ends. */
  onEnd(cb: () => void): void;
}

export type ButtonStyle = 'primary' | 'secondary';

export function button(label: string, onClick: () => void, style: ButtonStyle = 'secondary', size = ''): HTMLButtonElement {
  return el('button', { class: `btn ${style} ${size}`.trim(), text: label, attrs: { type: 'button' }, onClick: () => onClick() });
}

/** "Mașinuțe de Bâlci" as a fair sign: each letter in its own bulb color. */
export function title(small = false): HTMLHeadingElement {
  const h1 = el('h1', { class: small ? 'title small' : 'title', attrs: { 'aria-label': 'Mașinuțe de Bâlci' } });
  ['Mașinuțe', 'de Bâlci'].forEach((line) => {
    const row = el('span', { class: 'title-line', attrs: { 'aria-hidden': 'true' } });
    [...line].forEach((ch, i) => row.append(ch === ' ' ? ' ' : el('span', { class: `t${i % 5}`, text: ch })));
    h1.append(row);
  });
  return h1;
}

/** Switches a button between the primary and secondary look. */
export function setButtonStyle(btn: HTMLButtonElement, style: ButtonStyle): void {
  btn.classList.toggle('primary', style === 'primary');
  btn.classList.toggle('secondary', style === 'secondary');
}

/** Sets text only when it changed (screens and HUD parts refresh every frame). */
export function setText(node: HTMLElement, text: string): void {
  if (node.textContent !== text) node.textContent = text;
}

export function show(node: HTMLElement, visible: boolean): void {
  node.hidden = !visible;
}

/** Puts an HTML screen over the canvas for as long as `life` lasts. */
export function mountHtmlScreen(life: Lifetime, className: string, children: Child[]): HTMLElement {
  const column = el('div', { class: 'column' }, children);
  const screen = el('div', { class: `screen ${className}` }, [column]);
  document.body.append(screen);
  document.body.classList.add('html-screen');
  life.onEnd(() => {
    screen.remove();
    if (!document.querySelector('.screen')) document.body.classList.remove('html-screen');
  });
  return column;
}

/** Keys typed into the nickname or code fields are text, not driving or shortcuts. */
export function isTyping(): boolean {
  return document.activeElement instanceof HTMLInputElement && document.activeElement.type === 'text';
}

/** Whether a modal dialog is open (keys then belong to it). */
export function dialogOpen(): boolean {
  return !!document.querySelector('.modal-backdrop');
}

/** A page-wide key handler for as long as `life` lasts; skipped while typing, on a focused button (it has its own Enter) or under a dialog. */
export function onKeyFor(life: Lifetime, key: string, handler: () => void): void {
  const listener = (e: KeyboardEvent) => {
    if (e.key !== key || e.repeat || isTyping() || document.activeElement instanceof HTMLButtonElement || dialogOpen()) return;
    handler();
  };
  window.addEventListener('keydown', listener);
  life.onEnd(() => window.removeEventListener('keydown', listener));
}

/** On phones the keyboard slides over the lower half: bring the focused field back into view. */
export function keepInViewOnFocus(input: HTMLElement): void {
  if (!isTouch) return;
  input.addEventListener('focus', () => {
    window.setTimeout(() => input.scrollIntoView({ block: 'center', behavior: 'smooth' }), 350);
  });
}

/**
 * Screens follow the visual viewport (CSS --vv-top / --vv-height), which shrinks when the phone
 * keyboard opens; called once at startup.
 */
export function trackVisualViewport(): void {
  const vv = window.visualViewport;
  if (!vv) return;
  const root = document.documentElement;
  const sync = () => {
    root.style.setProperty('--vv-top', `${vv.offsetTop}px`);
    root.style.setProperty('--vv-height', `${vv.height}px`);
  };
  vv.addEventListener('resize', sync);
  vv.addEventListener('scroll', sync);
  sync();
}
