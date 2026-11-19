import Phaser from 'phaser';
import { ensureTextures } from '../render/textures';
import { drawBackdrop } from '../ui/backdrop';
import { button, el, mountScreen, onKey, title } from '../ui/dom';
import type { MenuSceneData } from './MenuScene';

/** Title screen. Its click is also the user gesture browsers want before sound (stage 6). Next: the nickname. */
export class IntroScene extends Phaser.Scene {
  private next!: MenuSceneData;

  constructor() {
    super('intro');
  }

  init(data: MenuSceneData): void {
    this.next = data;
  }

  create(): void {
    ensureTextures(this);
    drawBackdrop(this);
    const enter = button('Intră la bâlci', () => this.enter(), 'primary', 'big');
    mountScreen(this, 'intro', [title(), el('p', { class: 'subtitle', text: 'Mașinuțe tamponate, noaptea, la bâlci' }), enter]);
    onKey(this, 'Enter', () => this.enter());
  }

  private enter(): void {
    this.scene.start('name', this.next);
  }
}
