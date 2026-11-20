import type { Lifetime } from './ui/html';

// Screen Wake Lock: the phone screen stays on during the lobby and the match. Optional: browsers
// without it (or pages without HTTPS) simply do without. Vibration lives in settings.ts.

let wanted = 0;
let sentinel: WakeLockSentinel | null = null;

async function acquire(): Promise<void> {
  if (sentinel || wanted === 0 || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => (sentinel = null));
    // Released meanwhile (the scene ended while the request was pending).
    if (wanted === 0) void release();
  } catch {
    // battery saver, or not allowed: the screen may dim, the game goes on
  }
}

async function release(): Promise<void> {
  const held = sentinel;
  sentinel = null;
  await held?.release().catch(() => undefined);
}

// The browser drops the lock whenever the page is hidden; take it again on the way back.
document.addEventListener('visibilitychange', () => void acquire());

/** Keeps the screen on for as long as `life` lasts. */
export function keepScreenOn(life: Lifetime): void {
  wanted++;
  void acquire();
  life.onEnd(() => {
    wanted--;
    if (wanted === 0) void release();
  });
}
