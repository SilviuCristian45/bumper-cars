import Phaser from 'phaser';
import { load, save } from '../storage';

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

/** The first of `urls` that loads and decodes, or null (missing files are normal: they are optional). */
export async function fetchFirst(context: AudioContext, urls: string[]): Promise<AudioBuffer | null> {
  for (const url of urls) {
    try {
      const res = await fetch(url);
      // Dev servers answer unknown paths with index.html.
      if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) continue;
      return await context.decodeAudioData(await res.arrayBuffer());
    } catch {
      // unsupported format or broken file: try the next one
    }
  }
  return null;
}
