import Phaser from 'phaser';
import { fetchFirst } from './sound';

// Sound effects. Each one is generated with Web Audio unless a file with its name exists in
// client/public/audio/ (<name>.ogg, else <name>.mp3): then the file plays instead.
// Everything goes through Phaser's master gain, so the mute toggle applies.

export const SFX_NAMES = [
  'claxon', // Claxon de TIR
  'ridicare', // a power-up is picked up
  'sughit', // Țuică: someone's steering is turned around
  'boing', // a hit with Bară cu arcuri
  'colac', // Colac de salvare saves a car
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** The same effect more often than this plays once. */
const MIN_GAP_MS = 45;

const files = new Map<SfxName, AudioBuffer>();
const lastPlayed = new Map<SfxName, number>();
let manager: Phaser.Sound.WebAudioSoundManager | null = null;

/** Looks for replacement files once, at boot; a missing file simply keeps the generated sound. */
export function initSfx(game: Phaser.Game): void {
  if (!(game.sound instanceof Phaser.Sound.WebAudioSoundManager)) return;
  manager = game.sound;
  const context = manager.context;
  for (const name of SFX_NAMES) {
    void fetchFirst(context, [`audio/${name}.ogg`, `audio/${name}.mp3`]).then((buffer) => {
      if (buffer) files.set(name, buffer);
    });
  }
}

/** `volume` 0..1 scales the sound (e.g. quieter for things that do not involve this player). */
export function playSfx(name: SfxName, volume = 1): void {
  if (!manager?.destination) return;
  const ctx = manager.context;
  // Before the first click the context is suspended: sounds would all burst out at once later.
  if (ctx.state !== 'running') return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < MIN_GAP_MS) return;
  lastPlayed.set(name, now);

  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume));
  out.connect(manager.destination);
  const file = files.get(name);
  if (file) {
    const src = ctx.createBufferSource();
    src.buffer = file;
    src.connect(out);
    src.start();
    return;
  }
  SYNTH[name](ctx, out, ctx.currentTime);
}

type Synth = (ctx: AudioContext, out: AudioNode, t: number) => void;

const SYNTH: Record<SfxName, Synth> = {
  // A lorry's air horn: low, slightly out-of-tune brassy notes held for a moment.
  claxon: (ctx, out, t) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1400;
    filter.connect(out);
    for (const f of [185, 233, 370]) tone(ctx, filter, t, { type: 'sawtooth', from: f, dur: 0.75, vol: f > 300 ? 0.06 : 0.16, hold: 0.55 });
  },
  ridicare: (ctx, out, t) => {
    [523, 784, 1047].forEach((f, i) => tone(ctx, out, t + i * 0.055, { type: 'square', from: f, dur: 0.09, vol: 0.1 }));
  },
  // "Hic!": two quick upward blips.
  sughit: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'sine', from: 320, to: 980, dur: 0.09, vol: 0.35 });
    tone(ctx, out, t + 0.14, { type: 'triangle', from: 420, to: 1200, dur: 0.07, vol: 0.2 });
  },
  // A cartoon spring: a sliding note with a fast wobble that dies down.
  boing: (ctx, out, t) => {
    const osc = ctx.createOscillator();
    const wobble = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(420, t + 0.12);
    osc.frequency.exponentialRampToValueAtTime(260, t + 0.45);
    wobble.frequency.value = 22;
    depth.gain.setValueAtTime(60, t);
    depth.gain.exponentialRampToValueAtTime(4, t + 0.45);
    wobble.connect(depth).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.35, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(gain).connect(out);
    osc.start(t);
    wobble.start(t);
    osc.stop(t + 0.52);
    wobble.stop(t + 0.52);
  },
  colac: (ctx, out, t) => {
    [392, 523, 659, 784].forEach((f, i) => tone(ctx, out, t + i * 0.07, { type: 'triangle', from: f, dur: 0.14, vol: 0.22 }));
  },
};

interface ToneOptions {
  type: OscillatorType;
  from: number;
  to?: number;
  dur: number;
  vol: number;
  /** Seconds at full level before the fade (default: it fades out at once). */
  hold?: number;
}

function tone(ctx: AudioContext, out: AudioNode, t: number, o: ToneOptions): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = o.type;
  osc.frequency.setValueAtTime(o.from, t);
  if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(o.vol, t + 0.01);
  if (o.hold) gain.gain.setValueAtTime(o.vol, t + o.hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(gain).connect(out);
  osc.start(t);
  osc.stop(t + o.dur + 0.02);
}
