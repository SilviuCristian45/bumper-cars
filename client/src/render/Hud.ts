import Phaser from 'phaser';
import {
  BOOST_COOLDOWN_TICKS,
  COUNTDOWN_TICKS,
  PLAYER_COLORS,
  SHRINK_START_TICKS,
  TICK_RATE,
  computeStandings,
  fightTicks,
  secondsLeft,
  type GameState,
} from '@masinute/shared';
import { DEPTH, FONT, GAME_H, GAME_W, HUD_W, HUD_X, SIDE_W, TOUCH_LAYOUT } from './layout';
import { TEX } from './textures';

// Minimal HUD drawn on the canvas: round and time, the ring's state, scores, the boost meter.
// Desktop: one panel right of the arena. Touch: round info on the boost side, scores on the
// joystick side (above the joystick), so nothing sits under a thumb.

const ROW_H = TOUCH_LAYOUT ? 46 : 38;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

interface Row {
  icon: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  points: Phaser.GameObjects.Text;
}

export class Hud {
  private readonly round: Phaser.GameObjects.Text;
  private readonly timer: Phaser.GameObjects.Text;
  private readonly ring: Phaser.GameObjects.Text;
  private readonly rows: Row[] = [];
  private readonly boostLabel?: Phaser.GameObjects.Text;
  private readonly boostBar?: Phaser.GameObjects.Graphics;
  private readonly boostX: number;
  private readonly boostY: number;

  constructor(scene: Phaser.Scene, leftHanded: boolean) {
    const text = (x: number, y: number, size: number, color = '#eaf2ff') =>
      scene.add
        .text(x, y, '', { fontFamily: FONT, fontSize: `${size}px`, fontStyle: 'bold', color, stroke: '#120a24', strokeThickness: 4 })
        .setDepth(DEPTH.hud);

    // Touch: scores on the joystick side (left, or right when left-handed), round info on the other.
    const scoresX = TOUCH_LAYOUT ? (leftHanded ? GAME_W - SIDE_W + 16 : HUD_X) : HUD_X;
    const infoX = TOUCH_LAYOUT ? (leftHanded ? HUD_X : GAME_W - SIDE_W + 16) : HUD_X;
    let y = 18;
    if (!TOUCH_LAYOUT) {
      scene.add
        .rectangle(HUD_X - 14, 10, HUD_W + 28, GAME_H - 20, 0x1c1036, 0.82)
        .setOrigin(0)
        .setStrokeStyle(2, 0x5b3d8f)
        .setDepth(DEPTH.hud - 1);
      text(HUD_X, y, 30, '#ffe066').setText('Mașinuțe de Bâlci');
      y += 52;
    }
    this.round = text(infoX, y, TOUCH_LAYOUT ? 30 : 24);
    this.timer = text(infoX, y + (TOUCH_LAYOUT ? 44 : 32), TOUCH_LAYOUT ? 28 : 22, '#d0d8f0');
    this.ring = text(infoX, y + (TOUCH_LAYOUT ? 84 : 60), TOUCH_LAYOUT ? 24 : 18, '#ff8fa3').setWordWrapWidth(HUD_W);
    if (!TOUCH_LAYOUT) y += 110;

    const scoresY = TOUCH_LAYOUT ? 18 : y;
    for (let i = 0; i < 6; i++) {
      const ry = scoresY + i * ROW_H;
      this.rows.push({
        icon: scene.add.image(scoresX + 14, ry + 16, TEX.car(0)).setScale(TOUCH_LAYOUT ? 0.75 : 0.6).setDepth(DEPTH.hud),
        name: text(scoresX + (TOUCH_LAYOUT ? 40 : 36), ry + 2, TOUCH_LAYOUT ? 24 : 19),
        points: text(scoresX + (TOUCH_LAYOUT ? SIDE_W - 36 : HUD_W), ry + 2, TOUCH_LAYOUT ? 24 : 19).setOrigin(1, 0),
      });
    }

    // Desktop: boost meter under the scores (touch shows it on the boost button and under the car).
    this.boostX = HUD_X;
    this.boostY = scoresY + 6 * ROW_H + 24;
    if (!TOUCH_LAYOUT) {
      this.boostLabel = text(this.boostX, this.boostY, 18);
      this.boostBar = scene.add.graphics().setDepth(DEPTH.hud);
      // The "Ieși (Esc)" button (GameScene) sits under this.
      text(HUD_X, GAME_H - 112, 15, '#9aa6c8').setText('Săgeți / WASD = condus  ·  Spațiu = boost\nP = pauză  ·  F = ecran complet');
    }
  }

  update(state: Readonly<GameState>, meId: string): void {
    const fight = fightTicks(state.roundTick);
    this.round.setText(state.round > 0 ? `Runda ${state.round} / ${state.roundsTotal}` : '');
    if (state.phase === 'playing' && state.roundTick > COUNTDOWN_TICKS) {
      const s = secondsLeft(state.roundTick);
      this.timer.setText(`Timp ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`);
      const toShrink = Math.ceil((SHRINK_START_TICKS - fight) / TICK_RATE);
      this.ring.setText(toShrink <= 0 ? 'Ringul se strânge!' : toShrink <= 10 ? `Ringul se strânge în ${toShrink}...` : '');
    } else {
      this.timer.setText('');
      this.ring.setText('');
    }

    const ids = computeStandings(state as GameState);
    this.rows.forEach((row, i) => {
      const p = ids[i] !== undefined ? state.players[ids[i]!] : undefined;
      const visible = !!p;
      row.icon.setVisible(visible);
      row.name.setVisible(visible);
      row.points.setVisible(visible);
      if (!p) return;
      const dim = state.phase === 'playing' && !p.alive;
      row.icon.setTexture(TEX.car(p.slot)).setAlpha(dim ? 0.35 : 1);
      row.name
        .setText(TOUCH_LAYOUT ? p.name : `${p.name}${p.id === meId ? ' (tu)' : ''}${p.left ? ' · a plecat' : dim ? ' · afară' : ''}`)
        .setColor(p.id === meId ? '#ffe066' : hex(PLAYER_COLORS[p.slot]!))
        .setAlpha(dim ? 0.55 : 1);
      row.points.setText(String(p.points)).setAlpha(dim ? 0.55 : 1);
    });

    const me = state.players[meId];
    if (this.boostBar && this.boostLabel) {
      const g = this.boostBar;
      g.clear();
      if (!me) return;
      const ready = 1 - me.boostCooldown / BOOST_COOLDOWN_TICKS;
      this.boostLabel.setText(ready >= 1 ? 'Boost gata! (Spațiu)' : 'Boost se încarcă...');
      const y = this.boostY + 30;
      g.fillStyle(0x0b0618, 0.9).fillRoundedRect(this.boostX, y, HUD_W, 16, 8);
      g.fillStyle(ready >= 1 ? 0x4cc9f0 : 0x3a6ea5, 1).fillRoundedRect(this.boostX, y, Math.max(16, HUD_W * ready), 16, 8);
    }
  }
}
