import Phaser from 'phaser';
import { ensureTextures } from '../render/textures';
import type { MenuData } from '../screens/host';
import { MenuScreen } from '../screens/menu';
import { drawBackdrop } from '../ui/backdrop';
import { phaserHost } from './phaserHost';

export type MenuSceneData = MenuData;

/** The main menu (screens/menu.ts) over the night fair. */
export class MenuScene extends Phaser.Scene {
  private opts!: MenuSceneData;

  constructor() {
    super('menu');
  }

  init(data: MenuSceneData): void {
    this.opts = data;
  }

  create(): void {
    ensureTextures(this);
    drawBackdrop(this);
    new MenuScreen(phaserHost(this), this.opts);
  }
}
