import Phaser from 'phaser';
import { ensureTextures } from '../render/textures';
import type { MenuData } from '../screens/host';
import { showIntro } from '../screens/intro';
import { drawBackdrop } from '../ui/backdrop';
import { phaserHost } from './phaserHost';

/** Title screen (screens/intro.ts) over the night fair. */
export class IntroScene extends Phaser.Scene {
  private next!: MenuData;

  constructor() {
    super('intro');
  }

  init(data: MenuData): void {
    this.next = data;
  }

  create(): void {
    ensureTextures(this);
    drawBackdrop(this);
    showIntro(phaserHost(this), this.next);
  }
}
