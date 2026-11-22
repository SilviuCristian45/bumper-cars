import type { GameEvent, GameState } from '@masinute/shared';
import type { RenderView } from '@client/net/view';
import { CarLayer } from './CarLayer';
import { PowerupLayer } from './PowerupLayer';
import type { World } from './World';

/** What one match puts on the ring: the cars and the power-ups, drawn from a state and a blended view. */
export class Board {
  readonly cars: CarLayer;
  private readonly powerups = new PowerupLayer();

  constructor(
    private readonly world: World,
    meId: string,
  ) {
    this.cars = new CarLayer(world.quality, meId);
    world.scene.add(this.cars.group, this.powerups.group);
  }

  onEvents(events: readonly GameEvent[], state: Readonly<GameState>): void {
    this.cars.onEvents(events, state);
    this.powerups.onEvents(events);
  }

  update(state: Readonly<GameState>, view: RenderView, dt: number): void {
    this.world.arena.update(dt, view.ringRadius);
    this.powerups.update(state, dt);
    this.cars.update(state, view, dt);
    if (this.cars.shake > 0) {
      this.world.rig.addShake(this.cars.shake);
      this.cars.shake = 0;
    }
  }

  /** Hidden under the podium at the end of the match. */
  setVisible(visible: boolean): void {
    this.cars.group.visible = visible;
    this.powerups.group.visible = visible;
  }

  dispose(): void {
    this.world.scene.remove(this.cars.group, this.powerups.group);
    this.cars.dispose();
    this.powerups.dispose();
  }
}
