/**
 * Where the sound effects and the music play: an AudioContext and the node in front of the speakers
 * (Phaser's master gain in 2D, the 3D client's own). Read at play time, so a getter is fine.
 */
export interface AudioOut {
  readonly context: AudioContext;
  readonly destination: AudioNode | undefined;
}
