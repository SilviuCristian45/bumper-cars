import Phaser from 'phaser';
import { load, save } from '../storage';
import type { AudioOut } from './output';

export { fetchFirst } from './files';

// Mute state and optional audio files (from Bombe și Petarde). A missing or undecodable file just
// means the generated sound plays; files are fetched and decoded here, not through the Phaser
// loader, which would log errors for the missing ones.

// Kept here because WebAudio's `sound.mute` getter reads the gain node, which only
// changes once the audio context renders, so it lags right after being set.
let muted = false;

export function initMute(game: Phaser.Game): void {
  muted = load('muted') === '1';
  game.sound.mute = muted;
}

export function isMuted(): boolean {
  return muted;
}

export function toggleMute(game: Phaser.Game): boolean {
  muted = !muted;
  game.sound.mute = muted;
  save('muted', muted ? '1' : '0');
  return muted;
}

/** Phaser's Web Audio output for the sound effects and the music (none with HTML5 audio). */
export function phaserAudioOut(game: Phaser.Game): AudioOut | null {
  const sound = game.sound;
  if (!(sound instanceof Phaser.Sound.WebAudioSoundManager)) return null;
  return {
    context: sound.context,
    get destination() {
      return sound.destination;
    },
  };
}
