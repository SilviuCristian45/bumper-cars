import Phaser from 'phaser';
import type { GameTransport } from '../net/GameTransport';
import { ensureTextures } from '../render/textures';
import { LobbyScreen } from '../screens/lobby';
import { drawBackdrop } from '../ui/backdrop';
import { phaserHost } from './phaserHost';

export interface LobbySceneData {
  transport: GameTransport;
}

/** The room's lobby (screens/lobby.ts) over the night fair. */
export class LobbyScene extends Phaser.Scene {
  private transport!: GameTransport;
  private screen!: LobbyScreen;

  constructor() {
    super('lobby');
  }

  init(data: LobbySceneData): void {
    this.transport = data.transport;
  }

  create(): void {
    ensureTextures(this);
    drawBackdrop(this);
    this.screen = new LobbyScreen(phaserHost(this), this.transport);
  }

  update(time: number, delta: number): void {
    this.screen.update(time, delta);
  }
}
