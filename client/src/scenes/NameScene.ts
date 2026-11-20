import Phaser from 'phaser';
import { ensureTextures } from '../render/textures';
import type { NameData } from '../screens/host';
import { showName } from '../screens/name';
import { drawBackdrop } from '../ui/backdrop';
import { phaserHost } from './phaserHost';

export type NameSceneData = NameData;

/** "Cum te cheamă?" (screens/name.ts) over the night fair. */
export class NameScene extends Phaser.Scene {
  private opts!: NameSceneData;

  constructor() {
    super('name');
  }

  init(data: NameSceneData): void {
    this.opts = data;
  }

  create(): void {
    ensureTextures(this);
    drawBackdrop(this);
    showName(phaserHost(this), this.opts);
  }
}
