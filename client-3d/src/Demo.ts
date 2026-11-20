import {
  addPlayer,
  BOT_EASY,
  BOT_HARD,
  BOT_MEDIUM,
  BOT_NAMES,
  createGameState,
  runTick,
  startMatch,
  TICK_MS,
  type GameEvent,
  type GameState,
} from '@masinute/shared';
import { TickBlend } from '@client/net/view';
import { Board } from './Board';
import type { World } from './World';

const LEVELS = [BOT_HARD, BOT_MEDIUM, BOT_HARD, BOT_EASY, BOT_MEDIUM, BOT_HARD];
const MAX_FRAME_MS = 250;

/**
 * Behind the menus and the lobby: six bots play on their own in the browser, seen by a camera slowly
 * circling the ring (the 3D stand-in for the 2D night-fair backdrop). A new match once one is over.
 */
export class Demo {
  private state!: GameState;
  private readonly blend = new TickBlend();
  private board: Board;
  private acc = 0;
  private events: GameEvent[] = [];

  constructor(private world: World) {
    this.board = new Board(world, '');
    this.restart();
  }

  /** The world was rebuilt (quality changed). */
  attach(world: World): void {
    this.board.dispose();
    this.world = world;
    this.board = new Board(world, '');
  }

  update(dtMs: number): void {
    this.acc += Math.min(dtMs, MAX_FRAME_MS);
    while (this.acc >= TICK_MS) {
      this.acc -= TICK_MS;
      this.events.push(...runTick(this.state, []));
      if (this.state.phase === 'finished') this.restart();
    }
    this.blend.push(this.state);
    const view = this.blend.view(Math.min(1, this.acc / TICK_MS));
    if (this.events.length > 0) {
      this.board.onEvents(this.events, this.state);
      this.events = [];
    }
    this.board.update(this.state, view, dtMs / 1000);
    this.world.rig.orbit(dtMs / 1000);
  }

  dispose(): void {
    this.board.dispose();
  }

  private restart(): void {
    this.state = createGameState({ code: 'DEMO3D', seed: Math.random().toString(36).slice(2) });
    LEVELS.forEach((level, i) => addPlayer(this.state, `d${i}`, BOT_NAMES[i] ?? `Bot ${i}`, true, level));
    // Bots never become host on their own; one acts as host so startMatch accepts the setup.
    this.state.hostId = 'd0';
    this.state.roundsTotal = 7;
    startMatch(this.state, 'd0');
  }
}
