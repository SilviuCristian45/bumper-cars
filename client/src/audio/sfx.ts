import { fetchFirst } from './files';
import type { AudioOut } from './output';

// Sound effects. Each one is generated with Web Audio unless a file with its name exists in
// client/public/audio/ (<name>.ogg, else <name>.mp3): then the file plays instead.
// Everything goes through the output's destination (Phaser's master gain in 2D), so the mute toggle applies.

export const SFX_NAMES = [
  'bonk', // two cars hit (louder for a harder hit)
  'boost',
  'iesire', // a car falls off the ring
  'numaratoare', // 3, 2, 1
  'start', // START!
  'ring', // the ring starts shrinking
  'runda', // someone wins a round
  'final', // the podium
  'claxon', // Claxon de TIR
  'ridicare', // a power-up is picked up
  'sughit', // Țuică: someone's steering is turned around
  'boing', // a hit with Bară cu arcuri
  'colac', // Colac de salvare saves a car
  'fasait', // Suc Zero Zahăr: a can opened
  'ragait', // Suc Zero Zahăr runs out: a burp
  'flex', // Pudră proteică: a deep "flex" grunt
  'fantoma', // Fantomă: "uuuu"
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

/** The same effect more often than this plays once (a pile-up of bumps is one bonk). */
const MIN_GAP_MS = 45;
const GAP_MS: Partial<Record<SfxName, number>> = { bonk: 70 };

const files = new Map<SfxName, AudioBuffer>();
const lastPlayed = new Map<SfxName, number>();
let output: AudioOut | null = null;
let noiseBuffer: AudioBuffer | null = null;

/** Looks for replacement files once, at boot; a missing file simply keeps the generated sound. */
export function initSfx(out: AudioOut | null): void {
  if (!out) return;
  output = out;
  const context = out.context;
  for (const name of SFX_NAMES) {
    void fetchFirst(context, [`audio/${name}.ogg`, `audio/${name}.mp3`]).then((buffer) => {
      if (buffer) files.set(name, buffer);
    });
  }
}

/**
 * `volume` 0..1 scales the sound (e.g. quieter for things that do not involve this player); `pan` -1..1
 * puts it to the left or right (the 3D client, by where it happens on screen).
 */
export function playSfx(name: SfxName, volume = 1, pan = 0): void {
  const destination = output?.destination;
  if (!output || !destination) return;
  const ctx = output.context;
  // Before the first click the context is suspended: sounds would all burst out at once later.
  if (ctx.state !== 'running') return;
  const now = performance.now();
  if (now - (lastPlayed.get(name) ?? -Infinity) < (GAP_MS[name] ?? MIN_GAP_MS)) return;
  lastPlayed.set(name, now);

  const out = ctx.createGain();
  out.gain.value = Math.max(0, Math.min(1, volume));
  if (pan !== 0 && typeof ctx.createStereoPanner === 'function') {
    const panner = ctx.createStereoPanner();
    panner.pan.value = Math.max(-1, Math.min(1, pan));
    out.connect(panner).connect(destination);
  } else {
    out.connect(destination);
  }
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
  // Rubber on rubber: a short low thump with a muffled knock on top.
  bonk: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'sine', from: 150, to: 55, dur: 0.16, vol: 0.55 });
    noise(ctx, out, t, { dur: 0.07, vol: 0.25, filter: 'lowpass', from: 1200, to: 300 });
  },
  // A whoosh of air.
  boost: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.35, vol: 0.22, filter: 'bandpass', from: 600, to: 2600 });
    tone(ctx, out, t, { type: 'sawtooth', from: 110, to: 220, dur: 0.25, vol: 0.05 });
  },
  // Falling off the floor: a sliding whistle down.
  iesire: (ctx, out, t) => tone(ctx, out, t, { type: 'triangle', from: 880, to: 140, dur: 0.55, vol: 0.22 }),
  numaratoare: (ctx, out, t) => tone(ctx, out, t, { type: 'sine', from: 660, dur: 0.14, vol: 0.3 }),
  start: (ctx, out, t) => {
    tone(ctx, out, t, { type: 'square', from: 990, dur: 0.32, vol: 0.14 });
    tone(ctx, out, t, { type: 'sine', from: 1320, dur: 0.32, vol: 0.18 });
  },
  // A fairground bell: the ring is closing in.
  ring: (ctx, out, t) => {
    for (const at of [0, 0.22]) {
      tone(ctx, out, t + at, { type: 'sine', from: 1568, dur: 0.5, vol: 0.18 });
      tone(ctx, out, t + at, { type: 'sine', from: 2350, dur: 0.3, vol: 0.06 });
    }
  },
  runda: (ctx, out, t) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, t + i * 0.09, { type: 'triangle', from: f, dur: i === 3 ? 0.35 : 0.12, vol: 0.26 }));
  },
  // A short brass-ish fanfare for the podium: G G G C ... E G C'.
  final: (ctx, out, t) => {
    const notes: [number, number, number][] = [
      [392, 0, 0.12],
      [392, 0.14, 0.12],
      [392, 0.28, 0.12],
      [523, 0.42, 0.45],
      [659, 0.92, 0.18],
      [784, 1.12, 0.18],
      [1047, 1.32, 0.8],
    ];
    for (const [f, at, dur] of notes) {
      tone(ctx, out, t + at, { type: 'sawtooth', from: f, dur, vol: 0.09 });
      tone(ctx, out, t + at, { type: 'triangle', from: f / 2, dur, vol: 0.16 });
    }
  },
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
  // A can opened: a sharp "pssht" and fizz settling down.
  fasait: (ctx, out, t) => {
    noise(ctx, out, t, { dur: 0.12, vol: 0.35, filter: 'highpass', from: 5000, to: 3000 });
    noise(ctx, out, t + 0.05, { dur: 0.6, vol: 0.12, filter: 'bandpass', from: 7000, to: 4000 });
  },
  // A cartoon burp: a low wobbling buzz that drops.
  ragait: (ctx, out, t) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 700;
    filter.connect(out);
    const osc = ctx.createOscillator();
    const wobble = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, t);
    osc.frequency.exponentialRampToValueAtTime(70, t + 0.4);
    wobble.frequency.value = 28;
    depth.gain.value = 25;
    wobble.connect(depth).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.4, t + 0.04);
    gain.gain.setValueAtTime(0.4, t + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    osc.connect(gain).connect(filter);
    osc.start(t);
    wobble.start(t);
    osc.stop(t + 0.47);
    wobble.stop(t + 0.47);
  },
  // A deep strained "hnngh" with a creak of muscle: low notes swelling up.
  flex: (ctx, out, t) => {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(900, t + 0.35);
    filter.connect(out);
    tone(ctx, filter, t, { type: 'sawtooth', from: 70, to: 95, dur: 0.55, vol: 0.3, hold: 0.35 });
    tone(ctx, filter, t, { type: 'square', from: 105, to: 140, dur: 0.55, vol: 0.08, hold: 0.35 });
    noise(ctx, out, t + 0.3, { dur: 0.12, vol: 0.12, filter: 'bandpass', from: 1800, to: 900 });
  },
  // A spooky "uuuu": a breathy sine sliding up and down with vibrato.
  fantoma: (ctx, out, t) => {
    const osc = ctx.createOscillator();
    const vib = ctx.createOscillator();
    const depth = ctx.createGain();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(330, t);
    osc.frequency.linearRampToValueAtTime(520, t + 0.4);
    osc.frequency.linearRampToValueAtTime(300, t + 1);
    vib.frequency.value = 6;
    depth.gain.value = 14;
    vib.connect(depth).connect(osc.frequency);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.15);
    gain.gain.setValueAtTime(0.28, t + 0.7);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 1.05);
    osc.connect(gain).connect(out);
    osc.start(t);
    vib.start(t);
    osc.stop(t + 1.1);
    vib.stop(t + 1.1);
    noise(ctx, out, t, { dur: 0.9, vol: 0.04, filter: 'bandpass', from: 900, to: 600 });
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

interface NoiseOptions {
  dur: number;
  vol: number;
  filter: BiquadFilterType;
  from: number;
  to: number;
}

/** Filtered white noise (the buffer is made once). */
function noise(ctx: AudioContext, out: AudioNode, t: number, o: NoiseOptions): void {
  if (!noiseBuffer || noiseBuffer.sampleRate !== ctx.sampleRate) {
    noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const filter = ctx.createBiquadFilter();
  filter.type = o.filter;
  filter.frequency.setValueAtTime(o.from, t);
  filter.frequency.exponentialRampToValueAtTime(o.to, t + o.dur);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(o.vol, t);
  gain.gain.exponentialRampToValueAtTime(0.001, t + o.dur);
  src.connect(filter).connect(gain).connect(out);
  src.start(t);
  src.stop(t + o.dur);
}
