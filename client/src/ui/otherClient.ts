import { button } from './html';

// "Încearcă în 3D" in the 2D menu, "Înapoi la 2D" in the 3D one. Both clients live on the same origin
// (2D at /, 3D at /3d/), so the nickname and the settings (localStorage) come along by themselves; the
// other client opens straight at the menu (no intro, no "Salut, X!") and keeps a ?room= invite.

export type ClientKind = '2d' | '3d';

const ARRIVAL_KEY = 'masinute.switched';

const PATHS: Record<ClientKind, string> = { '2d': '/', '3d': '/3d/' };
// Dev and preview run the two clients on their own ports (other origins, so no shared localStorage there).
const DEV_PEER_PORT: Record<string, string> = { '5174': '5175', '5175': '5174', '4173': '4175', '4175': '4173' };

/** Where the other client is, with this page's URL options and the invite (if any). */
export function otherClientUrl(to: ClientKind, invite?: string): string {
  const url = new URL(PATHS[to], window.location.href);
  const peer = DEV_PEER_PORT[url.port];
  if (peer) url.port = peer;
  url.search = window.location.search;
  if (invite) url.searchParams.set('room', invite);
  return url.href;
}

export function otherClientButton(to: ClientKind, invite?: string): HTMLButtonElement {
  return button(to === '3d' ? 'Încearcă în 3D' : 'Înapoi la 2D', () => goToOtherClient(to, invite), 'secondary', 'small');
}

export function goToOtherClient(to: ClientKind, invite?: string): void {
  try {
    window.sessionStorage.setItem(ARRIVAL_KEY, '1');
  } catch {
    // the other client then starts at its intro, that's fine
  }
  window.location.assign(otherClientUrl(to, invite));
}

/** Arrived through the other client's button (once: a reload starts normally). */
export function takeSwitchArrival(): boolean {
  try {
    const arrived = window.sessionStorage.getItem(ARRIVAL_KEY) === '1';
    window.sessionStorage.removeItem(ARRIVAL_KEY);
    return arrived;
  } catch {
    return false;
  }
}
