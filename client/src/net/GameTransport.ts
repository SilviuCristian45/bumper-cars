import type { ClientMessage, GameEvent, GameState } from '@masinute/shared';
import type { DriveInput } from '../input/InputSource';

// Scenes only talk to the game through this interface, so the same rendering code
// runs on top of the local simulation (LocalTransport) and, later, the Colyseus room.

/** Everything but driving input, which goes through setInput (the transport ticks and numbers it). */
export type RoomMessage = Exclude<ClientMessage, { type: 'input' }>;

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
  /** How far real time is between the current state's tick and the next one (0..1), for interpolation. */
  tickProgress(): number;
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
