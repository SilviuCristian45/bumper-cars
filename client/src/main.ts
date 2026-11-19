import Phaser from 'phaser';
import { TICK_RATE } from '@masinute/shared';

// Placeholder scene until stage 2 (rendering + LocalTransport).
class BootScene extends Phaser.Scene {
  constructor() {
    super('boot');
  }

  create(): void {
    const { width, height } = this.scale;
    this.add
      .text(width / 2, height / 2, `Mașinuțe de Bâlci\nîn construcție (${TICK_RATE} tick/s)`, {
        fontFamily: 'sans-serif',
        fontSize: '32px',
        color: '#ffd166',
        align: 'center',
      })
      .setOrigin(0.5);
  }
}

new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'stage',
  width: 1280,
  height: 720,
  backgroundColor: '#120a24',
  scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
  scene: [BootScene],
});
