import Phaser from 'phaser';
import { ensureTextures } from '../render/textures';
import { showLeaderboard } from '../screens/leaderboard';
import { drawBackdrop } from '../ui/backdrop';
import { phaserHost } from './phaserHost';

/** "Clasament" (screens/leaderboard.ts) over the night fair. */
export class LeaderboardScene extends Phaser.Scene {
  constructor() {
    super('leaderboard');
  }

  create(): void {
    ensureTextures(this);
    drawBackdrop(this);
    showLeaderboard(phaserHost(this));
  }
}
