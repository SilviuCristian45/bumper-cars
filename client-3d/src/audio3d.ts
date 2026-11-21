import { initMusic } from '@client/audio/music';
import type { AudioOut } from '@client/audio/output';
import { initSfx } from '@client/audio/sfx';
import { load, save } from '@client/storage';
import type { SoundToggle } from '@client/ui/chrome';

// The 3D client's sound: the 2D game's effects and carousel music (client/src/audio, with the same
// replaceable files in client/public/audio) on an AudioContext of its own, through a master gain that the
// mute button sets (saved as masinute.muted, like in 2D). Phaser does the rest of this for the 2D client:
// the context starts on the first tap or key (browsers want a gesture) and is suspended while hidden.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = load('muted') === '1';
let unlocked = false;

export function initAudio(): SoundToggle | undefined {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return undefined;
  ctx = new Ctor();
  master = ctx.createGain();
  master.gain.value = muted ? 0 : 1;
  master.connect(ctx.destination);
  const out: AudioOut = { context: ctx, destination: master };
  initSfx(out);
  initMusic(out);

  const unlock = () => {
    unlocked = true;
    if (!document.hidden) void ctx?.resume();
    window.removeEventListener('pointerdown', unlock, true);
    window.removeEventListener('keydown', unlock, true);
  };
  window.addEventListener('pointerdown', unlock, true);
  window.addEventListener('keydown', unlock, true);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) void ctx?.suspend();
    else if (unlocked) void ctx?.resume();
  });

  return {
    isMuted: () => muted,
    toggle: () => {
      muted = !muted;
      save('muted', muted ? '1' : '0');
      if (master && ctx) master.gain.setTargetAtTime(muted ? 0 : 1, ctx.currentTime, 0.02);
    },
  };
}
