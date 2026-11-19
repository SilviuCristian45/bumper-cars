import { el, isTyping } from './dom';
import { fullscreenAvailable, isFullscreen, onFullscreenChange, toggleFullscreen } from './fullscreen';

// The fullscreen toggle in the top-right corner, over every screen from the intro on (F also
// toggles it). Sound arrives in stage 6, with its mute button next to it.

const SVG_NS = 'http://www.w3.org/2000/svg';

const ICONS = {
  // Four corner brackets, at the edges (enter) or folded toward the middle (exit).
  fullscreenOn: '<path d="M6 13V6h7M26 13V6h-7M6 19v7h7M26 19v7h-7" stroke="#fff4d6" stroke-width="3" fill="none"/>',
  fullscreenOff: '<path d="M13 6v7H6M19 6v7h7M13 26v-7H6M19 26v-7h7" stroke="#fff4d6" stroke-width="3" fill="none"/>',
};

function icon(markup: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 32 32');
  svg.innerHTML = markup;
  return svg;
}

export function initChrome(): void {
  // Not offered where the browser has no Fullscreen API (Safari on iPhone).
  if (!fullscreenAvailable) return;
  const bar = el('div', { class: 'chrome' });
  const full = el('button', { class: 'icon-btn', attrs: { type: 'button' } });
  const syncFull = () => {
    full.replaceChildren(icon(isFullscreen() ? ICONS.fullscreenOff : ICONS.fullscreenOn));
    full.setAttribute('aria-label', isFullscreen() ? 'Ieși din ecran complet' : 'Ecran complet');
  };
  full.addEventListener('click', () => {
    toggleFullscreen();
    full.blur();
  });
  onFullscreenChange(syncFull);
  syncFull();
  bar.append(full);
  window.addEventListener('keydown', (e) => {
    if ((e.key === 'f' || e.key === 'F') && !e.repeat && !isTyping()) toggleFullscreen();
  });
  document.body.append(bar);
}
