import Phaser from 'phaser';
import {
  CAR_RADIUS,
  FP,
  TICK_RATE,
  botThink,
  countdownSeconds,
  fightTicks,
  forwardSpeed,
  sortedPlayers,
  type BotIntent,
  type BotThought,
  type GameState,
} from '@masinute/shared';
import { ARENA_CX, ARENA_CY, ARENA_R, DEPTH, FONT, GAME_H, toScreenX, toScreenY } from '../render/layout';

// Enabled with ?debug: hitboxes, velocity and heading, each bot's intent and target, tick/FPS.

const INTENTS: Record<BotIntent, { label: string; color: number }> = {
  wait: { label: 'așteaptă', color: 0xaaaaaa },
  retreat: { label: 'fuge spre centru', color: 0x4cc9f0 },
  hunt: { label: 'vânează', color: 0xff4d6d },
  cruise: { label: 'plimbare', color: 0x80ed99 },
};

/** Velocity vectors are drawn this many ticks long. */
const VELOCITY_SCALE = 8;

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

  update(state: Readonly<GameState>, meId: string, fps: number, paused: boolean, screenPos: ScreenPos): void {
    // Bot thinking is pure, so it can be recomputed here from any state (local or remote).
    if (state.tick !== this.lastTick) {
      this.lastTick = state.tick;
      this.thoughts = new Map();
      for (const p of sortedPlayers(state)) {
        if (!p.isBot) continue;
        const t = botThink(state as GameState, p.id);
        if (t) this.thoughts.set(p.id, t);
      }
    }

    const g = this.gfx;
    g.clear();
    g.lineStyle(1, 0x00ff9c, 0.35);
    g.strokeCircle(ARENA_CX, ARENA_CY, state.ringRadius / FP);
    const used = new Set<string>();
    for (const p of sortedPlayers(state)) {
      if (!p.alive) continue;
      const pos = screenPos(p.id) ?? { x: toScreenX(p.x), y: toScreenY(p.y) };
      g.lineStyle(1, 0x00ff9c, 0.9);
      g.strokeCircle(pos.x, pos.y, CAR_RADIUS / FP);
      // Heading (white) and velocity (yellow).
      const a = (p.heading / 1024) * Math.PI * 2;
      g.lineStyle(1, 0xffffff, 0.8);
      g.lineBetween(pos.x, pos.y, pos.x + Math.cos(a) * 30, pos.y + Math.sin(a) * 30);
      g.lineStyle(2, 0xffd166, 0.9);
      g.lineBetween(pos.x, pos.y, pos.x + (p.vx * VELOCITY_SCALE) / FP, pos.y + (p.vy * VELOCITY_SCALE) / FP);
      if (p.lastHitBy && state.tick - p.lastHitTick <= 3 * TICK_RATE) {
        g.lineStyle(2, 0xff4d6d, 0.8);
        g.strokeCircle(pos.x, pos.y, CAR_RADIUS / FP + 4);
      }

      const thought = this.thoughts.get(p.id);
      if (!thought) continue;
      const intent = INTENTS[thought.intent];
      g.lineStyle(1, intent.color, 0.7);
      g.lineBetween(pos.x, pos.y, toScreenX(thought.targetX), toScreenY(thought.targetY));
      g.fillStyle(intent.color, 0.8);
      g.fillCircle(toScreenX(thought.targetX), toScreenY(thought.targetY), 3);
      const i = thought.input;
      this.label(p.id, used).setText(`${intent.label} s${i.steer} t${i.throttle}${i.boost ? ' B' : ''}`).setPosition(pos.x, pos.y + 26).setColor(
        '#' + intent.color.toString(16).padStart(6, '0'),
      );
    }
    for (const [id, text] of this.labels) text.setVisible(used.has(id));

    const me = state.players[meId];
    const lines = [
      `tick ${state.tick}  round tick ${state.roundTick}  fight ${(fightTicks(state.roundTick) / TICK_RATE).toFixed(1)}s  countdown ${countdownSeconds(state.roundTick)}`,
      `fps ${fps.toFixed(0)}  ring ${(state.ringRadius / FP).toFixed(0)} px  phase ${state.phase}${paused ? ' (pauză)' : ''}`,
    ];
    if (me) {
      const speed = Math.hypot(me.vx, me.vy);
      lines.push(
        `eu: viteză ${((speed * TICK_RATE) / FP).toFixed(0)} px/s (înainte ${((forwardSpeed(me) * TICK_RATE) / FP).toFixed(0)})  steer ${me.steer} throttle ${me.throttle}  boost ${me.boostTicks}/${me.boostCooldown}  alunecare ${me.slideTicks}  seq ${me.lastSeq}`,
      );
    }
    this.info.setText(lines.join('\n'));
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
