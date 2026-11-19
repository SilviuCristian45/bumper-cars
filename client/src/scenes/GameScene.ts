import Phaser from 'phaser';
import {
  ANGLE_STEPS,
  BOOST_COOLDOWN_TICKS,
  BUMP_EVENT_MIN,
  FP,
  PLAYER_COLORS,
  TICK_RATE,
  angleDiff,
  computeStandings,
  countdownSeconds,
  fightTicks,
  type GameEvent,
  type GameState,
} from '@masinute/shared';
import { DebugOverlay } from '../debug/DebugOverlay';
import { TunePanel } from '../debug/TunePanel';
import { isTouch } from '../device';
import { CombinedInput } from '../input/CombinedInput';
import { NO_INPUT } from '../input/InputSource';
import { KeyboardInput } from '../input/KeyboardInput';
import { TouchInput } from '../input/TouchInput';
import type { GameTransport } from '../net/GameTransport';
import { Arena } from '../render/Arena';
import { CarView } from '../render/CarView';
import { bumpSparks, boostPuff, outBurst } from '../render/fx';
import { Hud } from '../render/Hud';
import { ARENA_CX, ARENA_CY, ARENA_R, DEPTH, FONT, toScreenX, toScreenY } from '../render/layout';
import { ensureTextures } from '../render/textures';
import { getSetting, reducedEffects, vibrate } from '../settings';
import { requireLandscape } from '../ui/orientation';

export interface GameSceneData {
  transport: GameTransport;
  debug: boolean;
  /** Show the ?tune panel (local games only). */
  tune: boolean;
  /** Started from test URL options: after the match, Enter (or a tap) starts a new one. */
  newMatch?: () => GameSceneData;
}

interface Pose {
  x: number;
  y: number;
  heading: number;
}

const START_SHOWN_TICKS = Math.round(0.8 * TICK_RATE); // "START!" stays a moment after the countdown
const FLOAT_MS = 1300;
const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');

/** Renders the shared GameState and forwards local input; knows nothing about where the state comes from. */
export class GameScene extends Phaser.Scene {
  private transport!: GameTransport;
  private data_!: GameSceneData;
  private controls!: CombinedInput;
  private touch?: TouchInput;
  private debug?: DebugOverlay;
  private tune?: TunePanel;
  private unsubscribe?: () => void;
  private arena!: Arena;
  private hud!: Hud;
  private readonly cars = new Map<string, CarView>();

  // The state moves once per tick; we draw between the last two ticks.
  private readonly prevPose = new Map<string, Pose>();
  private readonly curPose = new Map<string, Pose>();
  private prevRing = 0;
  private curRing = 0;
  private lastTick = -1;

  private countdown!: Phaser.GameObjects.Text;
  private lastCountdown = -1;
  private banner!: Phaser.GameObjects.Text;
  private overlayBg!: Phaser.GameObjects.Rectangle;
  private overlayText!: Phaser.GameObjects.Text;

  constructor() {
    super('game');
  }

  init(data: GameSceneData): void {
    this.data_ = data;
    this.transport = data.transport;
    // Phaser reuses the scene instance on every start: forget the previous match's views.
    this.cars.clear();
    this.prevPose.clear();
    this.curPose.clear();
    this.lastTick = -1;
    this.lastCountdown = -1;
    this.touch = undefined;
    this.debug = undefined;
    this.tune = undefined;
  }

  create(): void {
    ensureTextures(this);
    requireLandscape(this);
    this.cameras.main.setBackgroundColor('#120a24');
    this.arena = new Arena(this);
    const leftHanded = isTouch && getSetting('leftHanded');
    this.hud = new Hud(this, leftHanded);
    this.createOverlays();

    const keyboard = new KeyboardInput(this.input.keyboard!);
    if (isTouch) {
      this.touch = new TouchInput({ leftHanded });
      this.controls = new CombinedInput([this.touch, keyboard]);
    } else {
      this.controls = new CombinedInput([keyboard]);
    }

    this.unsubscribe = this.transport.onEvents((events) => this.handleEvents(events));
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.input.keyboard!.on('keydown-P', () => this.togglePause());
    this.input.keyboard!.on('keydown-ENTER', () => this.newMatch());
    this.overlayBg.on('pointerdown', () => this.newMatch());

    if (this.data_.debug) this.debug = new DebugOverlay(this);
    if (this.data_.tune && this.transport.pausable) this.tune = new TunePanel();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubscribe?.();
      this.controls.destroy();
      this.tune?.destroy();
      for (const car of this.cars.values()) car.destroy();
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    });
  }

  update(time: number): void {
    const before = this.transport.getState();
    const meBefore = before.players[this.transport.playerId];
    const input = this.controls.poll({ heading: meBefore?.heading ?? 0 });
    const canDrive = before.phase === 'playing' && !!meBefore?.alive && !this.transport.isPaused();
    this.transport.setInput(canDrive ? input : NO_INPUT);
    this.transport.update(this.game.loop.delta);

    const state = this.transport.getState();
    const me = state.players[this.transport.playerId];
    this.touch?.setVisible(state.phase === 'playing' && !!me?.alive && !this.transport.isPaused());
    if (me) this.touch?.setBoostReady(1 - me.boostCooldown / BOOST_COOLDOWN_TICKS);

    this.snapshot(state);
    const alpha = this.transport.tickProgress();
    this.arena.update(time, Phaser.Math.Linear(this.prevRing, this.curRing, alpha) / FP);
    this.syncCars(state, alpha, time);
    this.hud.update(state, this.transport.playerId);
    this.syncCountdown(state);
    this.syncOverlay(state);
    this.debug?.update(state, this.transport.playerId, this.game.loop.actualFps, this.transport.isPaused(), (id) => this.screenPos(id, alpha));
  }

  /** Keeps the poses of the last two ticks; a new round starts without sliding from the old spots. */
  private snapshot(state: Readonly<GameState>): void {
    if (state.tick === this.lastTick) return;
    const fresh = this.lastTick < 0 || state.tick - this.lastTick > 1 || (state.phase === 'playing' && state.roundTick <= 1);
    this.lastTick = state.tick;
    this.prevPose.clear();
    for (const [id, pose] of this.curPose) this.prevPose.set(id, pose);
    this.curPose.clear();
    for (const p of Object.values(state.players)) this.curPose.set(p.id, { x: p.x, y: p.y, heading: p.heading });
    if (fresh) for (const [id, pose] of this.curPose) this.prevPose.set(id, pose);
    this.prevRing = fresh ? state.ringRadius : this.curRing;
    this.curRing = state.ringRadius;
  }

  private screenPos(id: string, alpha: number): { x: number; y: number; angle: number } | undefined {
    const cur = this.curPose.get(id);
    if (!cur) return undefined;
    const prev = this.prevPose.get(id) ?? cur;
    const heading = prev.heading + angleDiff(prev.heading, cur.heading) * alpha;
    return {
      x: toScreenX(Phaser.Math.Linear(prev.x, cur.x, alpha)),
      y: toScreenY(Phaser.Math.Linear(prev.y, cur.y, alpha)),
      angle: (heading / ANGLE_STEPS) * Math.PI * 2,
    };
  }

  private syncCars(state: Readonly<GameState>, alpha: number, time: number): void {
    for (const p of Object.values(state.players)) {
      let car = this.cars.get(p.id);
      if (!car) {
        car = new CarView(this, p, p.id === this.transport.playerId);
        this.cars.set(p.id, car);
        // Joined as a spectator of this round, or already off the ring.
        if (state.phase !== 'lobby' && !p.alive) car.setVisible(false);
      }
      const pos = this.screenPos(p.id, alpha);
      if (pos && (p.alive || car.isOut())) car.setPose(pos.x, pos.y, pos.angle, p, time);
    }
    for (const [id, car] of this.cars) {
      if (state.players[id]) continue;
      car.destroy();
      this.cars.delete(id);
    }
  }

  private handleEvents(events: GameEvent[]): void {
    const state = this.transport.getState();
    const meId = this.transport.playerId;
    for (const e of events) {
      if (e.type === 'bump') {
        const strength = e.force / BUMP_EVENT_MIN;
        bumpSparks(this, toScreenX(e.x), toScreenY(e.y), strength);
        if (e.a === meId || e.b === meId) {
          if (!reducedEffects()) this.cameras.main.shake(120, Math.min(0.012, 0.002 * strength));
          vibrate(Math.min(60, 15 + 10 * strength));
        }
      } else if (e.type === 'boost') {
        const p = state.players[e.playerId];
        if (p) boostPuff(this, toScreenX(p.x), toScreenY(p.y), (p.heading / ANGLE_STEPS) * Math.PI * 2);
      } else if (e.type === 'out') {
        this.onOut(state, e.playerId, e.byId);
      } else if (e.type === 'roundStart') {
        for (const car of this.cars.values()) car.reset();
        this.lastTick = -1;
      } else if (e.type === 'roundEnd' && e.winnerId === meId) {
        vibrate(80);
      }
    }
  }

  private onOut(state: Readonly<GameState>, playerId: string, byId: string): void {
    const p = state.players[playerId];
    if (!p) return;
    const x = toScreenX(p.x);
    const y = toScreenY(p.y);
    this.cars.get(playerId)?.playOut();
    outBurst(this, x, y, PLAYER_COLORS[p.slot]!);
    if (playerId === this.transport.playerId) vibrate(120);
    const by = byId ? state.players[byId] : undefined;
    if (p.left) return;
    this.floatText(x, y - 30, by ? `+1 ${by.name}` : '-1', by ? hex(PLAYER_COLORS[by.slot]!) : '#ff8fa3');
  }

  private floatText(x: number, y: number, text: string, color: string): void {
    const t = this.add
      .text(x, y, text, { fontFamily: FONT, fontSize: '20px', fontStyle: 'bold', color, stroke: '#120a24', strokeThickness: 5 })
      .setOrigin(0.5)
      .setDepth(DEPTH.labels);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: FLOAT_MS, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
  }

  private createOverlays(): void {
    this.countdown = this.add
      .text(ARENA_CX, ARENA_CY, '', { fontFamily: FONT, fontSize: '120px', fontStyle: 'bold', color: '#ffe066', stroke: '#120a24', strokeThickness: 12 })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
    this.banner = this.add
      .text(ARENA_CX, ARENA_CY - ARENA_R + 40, '', {
        fontFamily: FONT,
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#ff8fa3',
        stroke: '#120a24',
        strokeThickness: 5,
        align: 'center',
      })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
    this.overlayBg = this.add
      .rectangle(ARENA_CX, ARENA_CY, ARENA_R * 1.3, 200, 0x120a24, 0.88)
      .setStrokeStyle(3, 0xffe066)
      .setDepth(DEPTH.overlay)
      .setVisible(false)
      .setInteractive();
    this.overlayText = this.add
      .text(ARENA_CX, ARENA_CY, '', { fontFamily: FONT, fontSize: '24px', fontStyle: 'bold', color: '#ffe066', align: 'center', lineSpacing: 8 })
      .setOrigin(0.5)
      .setDepth(DEPTH.overlay);
  }

  /** "3", "2", "1", then "START!" for a moment; a little pop on every change. */
  private syncCountdown(state: Readonly<GameState>): void {
    let label = '';
    if (state.phase === 'playing') {
      const secs = countdownSeconds(state.roundTick);
      if (secs > 0) label = String(secs);
      else if (fightTicks(state.roundTick) <= START_SHOWN_TICKS) label = 'START!';
    }
    const key = label === '' ? -1 : label === 'START!' ? 0 : Number(label);
    if (key === this.lastCountdown) return;
    this.lastCountdown = key;
    this.countdown.setText(label).setColor(label === 'START!' ? '#7cf29a' : '#ffe066');
    if (label) {
      this.countdown.setScale(1.5).setAlpha(1);
      this.tweens.add({ targets: this.countdown, scale: 1, duration: 260, ease: 'Back.easeOut' });
    }
  }

  private syncOverlay(state: Readonly<GameState>): void {
    const me = state.players[this.transport.playerId];
    const name = (id: string) => state.players[id]?.name ?? '?';
    let text = '';
    if (state.phase === 'intermission' || state.phase === 'finished') {
      const result =
        state.roundOutcome === 'win'
          ? state.roundWinner === this.transport.playerId
            ? 'Ai câștigat runda! (+3)'
            : `${name(state.roundWinner)} câștigă runda! (+3)`
          : state.roundOutcome === 'draw'
            ? 'Egal! Ultimii au ieșit deodată.'
            : 'Timpul a expirat! Nimeni nu ia +3.';
      if (state.phase === 'intermission') {
        text = `${result}\n\nRunda ${state.round + 1} începe în ${Math.ceil(state.phaseTimer / TICK_RATE)}...`;
      } else {
        const lines = computeStandings(state as GameState)
          .slice(0, 6)
          .map((id, i) => `${i + 1}. ${name(id)}  ${state.players[id]!.points} p`);
        const again = this.data_.newMatch ? `\n\n${isTouch ? 'Atinge aici' : 'Enter'} = încă un meci` : '';
        text = `${result}\n\nGata meciul!\n${lines.join('\n')}${again}`;
      }
    } else if (this.transport.isPaused()) {
      text = `Pauză\n\n${isTouch ? 'Revino în joc' : 'P = continuă'}`;
    }
    this.overlayText.setText(text);
    this.overlayBg.setVisible(text !== '');
    if (text) this.overlayBg.setSize(Math.max(420, this.overlayText.width + 60), this.overlayText.height + 50);

    const watching = state.phase === 'playing' && me && !me.alive && !text;
    this.banner.setText(watching ? 'Ai ieșit din ring! Privești runda.' : '');
  }

  private togglePause(): void {
    if (!this.transport.pausable) return;
    const state = this.transport.getState();
    if (state.phase !== 'playing' && state.phase !== 'intermission') return;
    this.transport.setPaused(!this.transport.isPaused());
    this.controls.releaseAll();
  }

  /** The page went to the background: let go of everything held; offline the match pauses. */
  private onHidden(): void {
    this.controls.releaseAll();
    this.transport.setInput(NO_INPUT);
    if (this.transport.pausable && this.transport.getState().phase !== 'finished') this.transport.setPaused(true);
  }

  private newMatch(): void {
    const next = this.data_.newMatch;
    if (this.transport.getState().phase === 'finished' && next) {
      this.transport.dispose();
      this.scene.restart(next());
      return;
    }
    // On a phone, a tap on the pause panel resumes.
    if (this.transport.isPaused()) this.togglePause();
  }
}

