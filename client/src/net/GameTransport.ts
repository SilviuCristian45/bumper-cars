import type { ClientMessage, GameEvent, GameState } from '@masinute/shared';
import type { DriveInput } from '../input/InputSource';
import type { RenderView } from './view';

// Scenes only talk to the game through this interface, so the same rendering code
// runs on top of the local simulation (LocalTransport) and the Colyseus room (ColyseusTransport).

/** Everything but driving input (setInput: the transport ticks and numbers it) and pings (the transport's own). */
export type RoomMessage = Exclude<ClientMessage, { type: 'input' } | { type: 'ping' }>;

/** Local games are always 'connected'; online ones go through 'reconnecting' after a drop. */
export type ConnectionStatus = 'connected' | 'reconnecting' | 'closed';

export interface GameTransport {
  /** Id of the player controlled from this browser. */
  readonly playerId: string;
  /** Latest known state. Read-only for the scene. */
  getState(): Readonly<GameState>;
  /** The player's current driving input; sampled once per simulation tick (boost presses are latched). */
  setInput(input: DriveInput): void;
  send(msg: RoomMessage): void;
  /** Subscribes to simulation events (bumps, outs...). Returns an unsubscribe function. */
  onEvents(cb: (events: GameEvent[]) => void): () => void;
  /** Called every frame with the elapsed real time. */
  update(dtMs: number): void;
  /** Where to draw the cars and the ring this frame (blended between ticks; online, own car predicted). */
  view(): RenderView;
  /** Online only: connection numbers for ?debug. */
  netStats?(): NetStats;
  /** A room on the server, which others can join with its code. */
  readonly online: boolean;
  /** Only transports that own the simulation can pause it (and only they allow ?tune). */
  readonly pausable: boolean;
  isPaused(): boolean;
  setPaused(paused: boolean): void;
  connectionStatus(): ConnectionStatus;
  /** Why the connection closed, shown back in the menu. */
  readonly closeReason: string;
  dispose(): void;
}

export interface NetStats {
  /** Round trip to the server, ms (smoothed). */
  pingMs: number;
  /** How far the drawn own car still is from its prediction (the correction being smoothed out), px. */
  predictionErrorPx: number;
  /** Inputs sent but not processed by the server yet. */
  unconfirmed: number;
  /** Corrections of the own car larger than a few pixels, in the last second. */
  bigCorrectionsPerSecond: number;
  /** Simulated latency (?lag/?jitter), 0 when off. */
  lagMs: number;
  jitterMs: number;
}
