import { getSetting, onSettingChange } from '../settings';
import { fetchFirst } from './files';
import type { AudioOut } from './output';

// The fair music: a file in client/public/audio/ (muzica.ogg, else muzica.mp3; now the carol
// "Rămâi cu noi în seara asta") looped under the sound effects, or, without one, a carousel-organ
// waltz (3/4, "oom-pah-pah" bass under a staccato melody) generated with Web Audio. The file is
// fetched only once the music is first wanted (it is a few MB); nothing plays while it loads.
// It goes through the output's destination (Phaser's master gain in 2D), so the sound button silences
// it too; the "Muzică" setting turns it on or off at once. The context is suspended while the tab is hidden.

const VOLUME = 0.12;
/** A mixed song is much louder than the generated organ notes at the same gain. */
const FILE_VOLUME = 0.3;
/** Quarter note at ~168 bpm. */
const BEAT = 60 / 168;
/** Notes are scheduled this far ahead, every TICK_MS (a hidden tab's timers may be slow). */
const LOOKAHEAD = 0.35;
const TICK_MS = 100;

const C4 = 261.63;
const freq = (semitones: number, base = C4) => base * Math.pow(2, semitones / 12);

/** One bar per entry: melody (semitones above C5, null = rest) and the chord under it. */
type Bar = [melody: (number | null)[], chord: 'C' | 'F' | 'G'];
const TUNE: Bar[] = [
  [[4, 7, 12], 'C'],
  [[11, 7, 2], 'G'],
  [[5, 9, 12], 'F'],
  [[12, 11, 9], 'F'],
  [[7, null, 4], 'C'],
  [[2, 4, 5], 'G'],
  [[7, 9, 7], 'C'],
  [[2, null, null], 'G'],
  [[4, 7, 12], 'C'],
  [[14, 12, 11], 'G'],
  [[9, 12, 17], 'F'],
  [[16, 14, 12], 'C'],
  [[11, 14, 7], 'G'],
  [[9, 11, 12], 'F'],
  [[14, 11, 7], 'G'],
  [[12, null, null], 'C'],
];
/** Root (semitones above C3) and the two upper notes (above C4) of each chord. */
const CHORDS = { C: { root: 0, upper: [4, 7] }, F: { root: 5, upper: [9, 12] }, G: { root: 7, upper: [11, 14] } } as const;

let ctx: AudioContext | null = null;
let gain: GainNode | null = null;
let file: AudioBuffer | null = null;
/** The file: not asked for yet, on its way, or settled (file set, or null = play the generated waltz). */
let fileState: 'idle' | 'loading' | 'done' = 'idle';
let fileSource: AudioBufferSourceNode | null = null;
let nextBeatAt = 0;
let beat = 0;

export function initMusic(out: AudioOut | null): void {
  const destination = out?.destination;
  if (!out || !destination) return;
  ctx = out.context;
  gain = ctx.createGain();
  gain.gain.value = VOLUME;
  gain.connect(destination);
  onSettingChange((key, on) => {
    if (key === 'music' && !on) stop();
  });
  window.setInterval(tick, TICK_MS);
}

/** Schedules the next notes (or starts the file) while the music is on and the context is running. */
function tick(): void {
  if (!ctx || !gain) return;
  // Before the first click (and while the tab is hidden) the context is suspended.
  if (!getSetting('music') || ctx.state !== 'running') return;
  if (fileState !== 'done') {
    if (fileState === 'idle') {
      fileState = 'loading';
      void fetchFirst(ctx, ['audio/muzica.ogg', 'audio/muzica.mp3']).then((buffer) => {
        file = buffer;
        fileState = 'done';
      });
    }
    return;
  }
  if (file) {
    if (!fileSource) {
      fileSource = ctx.createBufferSource();
      fileSource.buffer = file;
      fileSource.loop = true;
      fileSource.connect(gain);
      gain.gain.value = FILE_VOLUME;
      fileSource.start();
    }
    return;
  }
  const now = ctx.currentTime;
  // Just switched on, or the timers were held back: start again on the next beat, never in a rush.
  if (nextBeatAt < now - 0.1) nextBeatAt = now + 0.05;
  while (nextBeatAt < now + LOOKAHEAD) {
    playBeat(ctx, gain, nextBeatAt, beat);
    beat = (beat + 1) % (TUNE.length * 3);
    nextBeatAt += BEAT;
  }
}

function stop(): void {
  fileSource?.stop();
  fileSource = null;
  // Generated notes already scheduled end within LOOKAHEAD; the next start begins on a fresh beat.
  nextBeatAt = 0;
}

/** One beat: the melody note, and the bass (root on 1, chord on 2 and 3). */
function playBeat(ac: AudioContext, out: AudioNode, t: number, index: number): void {
  const [melody, chordName] = TUNE[Math.floor(index / 3)]!;
  const inBar = index % 3;
  const note = melody[inBar];
  if (note !== null && note !== undefined) {
    // Calliope: a square and a sine an octave up, short and bright.
    organ(ac, out, t, freq(note + 12), BEAT * 0.8, 0.32, 'square');
    organ(ac, out, t, freq(note + 24), BEAT * 0.6, 0.12, 'sine');
  }
  const chord = CHORDS[chordName];
  if (inBar === 0) organ(ac, out, t, freq(chord.root - 12), BEAT * 0.9, 0.5, 'triangle');
  else for (const n of chord.upper) organ(ac, out, t, freq(n), BEAT * 0.45, 0.12, 'square');
}

function organ(ac: AudioContext, out: AudioNode, t: number, hz: number, dur: number, vol: number, type: OscillatorType): void {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(hz, t);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  env.gain.exponentialRampToValueAtTime(vol * 0.5, t + dur * 0.5);
  env.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(env).connect(out);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}
