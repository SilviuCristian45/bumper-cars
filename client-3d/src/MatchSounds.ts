import * as THREE from 'three';
import { COUNTDOWN_TICKS, PU_GHOST, PU_PROTEIN, PU_SODA, TICK_RATE, TUNING, BUMP_EVENT_MIN, type GameEvent, type GameState } from '@masinute/shared';
import { playSfx, type SfxName } from '@client/audio/sfx';
import { vibrate } from '@client/settings';
import { toWorld } from './coords';

const PICKUP_SFX: Partial<Record<number, SfxName>> = { [PU_SODA]: 'fasait', [PU_PROTEIN]: 'flex', [PU_GHOST]: 'fantoma' };
/** Sounds this far from the listener (world units) are at their quietest. */
const FAR = 700;
/** How much quieter that is (0.5 = half the volume). */
const FAR_DROP = 0.5;
/** How far left/right a sound at the screen's edge is panned. */
const MAX_PAN = 0.6;

/**
 * The 2D game's sounds for the same events and volumes (GameScene.handleEvents), placed a little: quieter
 * further from the own car (or from where the camera looks when the car is out), panned by where on the
 * screen it happens. Plus the countdown and the podium fanfare.
 */
export class MatchSounds {
  private lastCountdown = -1;
  private fanfare = false;
  private readonly v = new THREE.Vector3();

  constructor(private readonly meId: string) {}

  /** listener: where "you" are on the floor; camera: for the panning. */
  onEvents(events: readonly GameEvent[], state: Readonly<GameState>, listener: THREE.Vector3, camera: THREE.Camera): void {
    const me = this.meId;
    const at = (x: number, z: number, volume: number) => this.play(x, z, volume, listener, camera);
    const atCar = (id: string, volume: number, name: SfxName) => {
      const p = state.players[id];
      if (p) at(toWorld(p.x), toWorld(p.y), volume)(name);
      else playSfx(name, volume);
    };
    for (const e of events) {
      if (e.type === 'bump') {
        const strength = e.force / BUMP_EVENT_MIN;
        const mine = e.a === me || e.b === me;
        at(toWorld(e.x), toWorld(e.y), Math.min(1, (mine ? 0.45 : 0.25) + 0.12 * strength))('bonk');
        if (mine) vibrate(Math.min(60, 15 + 10 * strength));
      } else if (e.type === 'boost') {
        atCar(e.playerId, e.playerId === me ? 0.8 : 0.3, 'boost');
      } else if (e.type === 'out') {
        atCar(e.playerId, e.playerId === me ? 1 : 0.5, 'iesire');
      } else if (e.type === 'shrinkStart') {
        playSfx('ring');
      } else if (e.type === 'pickup') {
        atCar(e.playerId, e.playerId === me ? 1 : 0.5, PICKUP_SFX[e.kind] ?? 'ridicare');
        if (e.playerId === me) vibrate(30);
      } else if (e.type === 'horn') {
        const own = state.players[me];
        const near = !!own?.alive && Math.hypot(own.x - e.x, own.y - e.y) <= TUNING.hornRadius;
        at(toWorld(e.x), toWorld(e.y), e.playerId === me || near ? 1 : 0.6)('claxon');
        if (near && e.playerId !== me) vibrate(90);
      } else if (e.type === 'saved') {
        atCar(e.playerId, e.playerId === me ? 1 : 0.6, 'colac');
        if (e.playerId === me) vibrate(60);
      } else if (e.type === 'confused') {
        atCar(e.playerId, e.playerId === me || e.byId === me ? 1 : 0.6, 'sughit');
        if (e.playerId === me) vibrate(70);
      } else if (e.type === 'spring') {
        at(toWorld(e.x), toWorld(e.y), e.playerId === me ? 1 : 0.7)('boing');
      } else if (e.type === 'effectEnd' && e.kind === PU_SODA) {
        atCar(e.playerId, e.playerId === me ? 1 : 0.5, 'ragait');
      } else if (e.type === 'go') {
        playSfx('start');
      } else if (e.type === 'roundEnd') {
        // The match end has its own fanfare (the podium).
        if (e.round < state.roundsTotal) playSfx('runda', e.winnerId === me ? 1 : 0.45);
        if (e.winnerId === me) vibrate(80);
      }
    }
  }

  /** Every frame: "3, 2, 1" beeps and the podium fanfare. */
  update(state: Readonly<GameState>): void {
    const counting = state.phase === 'playing' && state.roundTick < COUNTDOWN_TICKS;
    const second = counting ? Math.ceil((COUNTDOWN_TICKS - state.roundTick) / TICK_RATE) : -1;
    if (second !== this.lastCountdown) {
      this.lastCountdown = second;
      if (second > 0) playSfx('numaratoare');
    }
    if (state.phase === 'finished' && !this.fanfare) playSfx('final');
    this.fanfare = state.phase === 'finished';
  }

  private play(x: number, z: number, volume: number, listener: THREE.Vector3, camera: THREE.Camera): (name: SfxName) => void {
    const d = Math.hypot(x - listener.x, z - listener.z);
    const v = volume * (1 - FAR_DROP * Math.min(1, d / FAR));
    this.v.set(x, 8, z).project(camera);
    // Behind the camera (chase view) the projection mirrors: keep those in the middle.
    const pan = this.v.z < 1 ? Math.max(-1, Math.min(1, this.v.x)) * MAX_PAN : 0;
    return (name) => playSfx(name, v, pan);
  }
}
