import '@client/style.css';
import '@client/screens.css';
import './style.css';
import { isValidRoomCode, normalizeRoomCode } from '@masinute/shared';
import { isTouch } from '@client/device';
import { LocalTransport } from '@client/net/LocalTransport';
import { startupRoute } from '@client/net/resume';
import { resumableRoomCode } from '@client/net/rooms';
import type { MenuData } from '@client/screens/host';
import { load } from '@client/storage';
import { initChrome } from '@client/ui/chrome';
import { trackVisualViewport } from '@client/ui/html';
import { initRotatePrompt } from '@client/ui/orientation';
import { takeSwitchArrival } from '@client/ui/otherClient';
import { debug, params, quickStart } from '@client/urlOptions';
import { App } from './App';
import { initAudio } from './audio3d';
import { localOptions } from './options';

// The 3D client: the 2D game's menus, lobby and networking (client/src), the ring drawn with Three.js.
// Same URL options as 2D (CLAUDE.md); the quick-start ones (?bots, ?seed, ?botlevel, ?debug...) skip the
// menus and play local matches one after another, as the 2D test mode does.

// ?room=COD (invite link): after the intro and the nickname, the menu joins that room.
function menuData(): MenuData {
  const room = params.get('room');
  if (room === null) return {};
  const code = normalizeRoomCode(room);
  return isValidRoomCode(code) ? { invite: code } : { message: 'Codul din link nu e valid.' };
}

// Phones: no long-press menu (the CSS already stops selection and the callout); text fields keep theirs.
if (isTouch) {
  document.body.classList.add('touch');
  document.addEventListener('contextmenu', (e) => {
    if (!(e.target instanceof HTMLInputElement)) e.preventDefault();
  });
}
// The sound and fullscreen icons, the rotate prompt, the phone keyboard.
initChrome(initAudio());
initRotatePrompt();
trackVisualViewport();

const switched = takeSwitchArrival();
const newMatch = () => new LocalTransport(localOptions());
const app = new App(quickStart ? { newMatch } : {});
// ?debug: the router for scripted browser tests, shaped like the 2D client's window.__game.
if (debug) (window as unknown as { __game: unknown }).__game = app.debugView();

if (quickStart) {
  app.go({ to: 'game', transport: newMatch() });
} else {
  // A reload during an online game skips the intro and reconnects to the same room; a link to
  // another room skips it too, and the menu asks whether to leave the current game for it.
  const startup = startupRoute(resumableRoomCode(), menuData().invite);
  if (startup.kind === 'switch') app.go({ to: 'menu', data: { invite: startup.to, switchFrom: startup.from } });
  else if (startup.kind === 'resume') app.go({ to: 'menu', data: { resume: true } });
  // From the 2D menu's "Încearcă în 3D": straight to the menu (the nickname is already known).
  else if (switched && load('name')?.trim()) app.go({ to: 'menu', data: menuData() });
  else app.go({ to: 'intro', data: menuData() });
}
