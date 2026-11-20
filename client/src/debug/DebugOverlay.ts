import Phaser from 'phaser';
import { CAR_RADIUS, carRadius, FP, TICK_RATE, livePowerups, POWERUP_RADIUS, sortedPlayers, TUNING, type BotThought, type GameState } from '@masinute/shared';
import type { NetStats } from '../net/GameTransport';
import { ARENA_CX, ARENA_CY, ARENA_R, DEPTH, FONT, GAME_H, toScreenX, toScreenY } from '../render/layout';
import { POWERUP_INFO } from '../render/powerupInfo';
import { botThoughts, debugLines, INTENTS, thoughtLabel, VELOCITY_SCALE } from './debugInfo';

// Enabled with ?debug: hitboxes, velocity and heading, each bot's intent and target, tick/FPS;
// online also ping, the prediction error being smoothed out, unconfirmed inputs, big corrections.
// The texts and the bots' thoughts come from debugInfo.ts (shared with the 3D client).

export type ScreenPos = (playerId: string) => { x: number; y: number } | undefined;

export class DebugOverlay {
  private readonly gfx: Phaser.GameObjects.Graphics;
  private readonly info: Phaser.GameObjects.Text;
  private readonly labels = new Map<string, Phaser.GameObjects.Text>();
  private thoughts = new Map<string, BotThought>();
  private lastTick = -1;

  constructor(private readonly scene: Phaser.Scene) {
    this.gfx = scene.add.graphics().setDepth(DEPTH.debug);
    this.info = scene.add
      .text(ARENA_CX - ARENA_R, GAME_H - 8, '', {
        fontFamily: 'Consolas, Menlo, monospace',
        fontSize: '12px',
        color: '#00ff9c',
        backgroundColor: '#000000aa',
        padding: { x: 4, y: 2 },
      })
      .setOrigin(0, 1)
      .setDepth(DEPTH.debug + 1);
  }

  update(state: Readonly<GameState>, meId: string, fps: number, paused: boolean, screenPos: ScreenPos, net?: NetStats): void {
    if (state.tick !== this.lastTick) {
      this.lastTick = state.tick;
      this.thoughts = botThoughts(state);
    }

    const g = this.gfx;
    g.clear();
    g.lineStyle(1, 0x00ff9c, 0.35);
    g.strokeCircle(ARENA_CX, ARENA_CY, state.ringRadius / FP);
    const used = new Set<string>();
    // Power-ups: pickup reach, and each live oil puddle's slippery disc.
    for (const item of livePowerups(state)) {
      g.lineStyle(1, POWERUP_INFO[item.kind]?.color ?? 0xffffff, 0.8);
      g.strokeCircle(toScreenX(item.x), toScreenY(item.y), (CAR_RADIUS + POWERUP_RADIUS) / FP);
      this.label(`pu${item.slot}`, used)
        .setText(`${POWERUP_INFO[item.kind]?.name ?? item.kind} ${(item.ticks / TICK_RATE).toFixed(1)}s`)
        .setPosition(toScreenX(item.x), toScreenY(item.y) + 20)
        .setColor('#ffffff');
    }
    for (const p of Object.values(state.players)) {
      if (p.oilTicks <= 0) continue;
      g.lineStyle(1, 0x9b7bd8, 0.9);
      g.strokeCircle(toScreenX(p.oilX), toScreenY(p.oilY), TUNING.oilRadius / FP);
    }
    for (const p of sortedPlayers(state)) {
      if (!p.alive) continue;
      const pos = screenPos(p.id) ?? { x: toScreenX(p.x), y: toScreenY(p.y) };
      g.lineStyle(1, 0x00ff9c, 0.9);
      g.strokeCircle(pos.x, pos.y, carRadius(p) / FP);
      // Heading (white) and velocity (yellow).
      const a = (p.heading / 1024) * Math.PI * 2;
      g.lineStyle(1, 0xffffff, 0.8);
      g.lineBetween(pos.x, pos.y, pos.x + Math.cos(a) * 30, pos.y + Math.sin(a) * 30);
      g.lineStyle(2, 0xffd166, 0.9);
      g.lineBetween(pos.x, pos.y, pos.x + (p.vx * VELOCITY_SCALE) / FP, pos.y + (p.vy * VELOCITY_SCALE) / FP);
      if (p.lastHitBy && state.tick - p.lastHitTick <= 3 * TICK_RATE) {
        g.lineStyle(2, 0xff4d6d, 0.8);
        g.strokeCircle(pos.x, pos.y, carRadius(p) / FP + 4);
      }

      const thought = this.thoughts.get(p.id);
      if (!thought) continue;
      const intent = INTENTS[thought.intent];
      g.lineStyle(1, intent.color, 0.7);
      g.lineBetween(pos.x, pos.y, toScreenX(thought.targetX), toScreenY(thought.targetY));
      g.fillStyle(intent.color, 0.8);
      g.fillCircle(toScreenX(thought.targetX), toScreenY(thought.targetY), 3);
      this.label(p.id, used).setText(thoughtLabel(thought)).setPosition(pos.x, pos.y + 26).setColor(
        '#' + intent.color.toString(16).padStart(6, '0'),
      );
    }
    for (const [id, text] of this.labels) text.setVisible(used.has(id));

    this.info.setText(debugLines(state, meId, fps, paused, net).join('\n'));
  }

  private label(id: string, used: Set<string>): Phaser.GameObjects.Text {
    used.add(id);
    let text = this.labels.get(id);
    if (!text) {
      text = this.scene.add
        .text(0, 0, '', { fontFamily: FONT, fontSize: '11px', backgroundColor: '#000000aa', padding: { x: 2, y: 1 } })
        .setOrigin(0.5, 0)
        .setDepth(DEPTH.debug + 1);
      this.labels.set(id, text);
    }
    return text;
  }
}
