import Phaser from 'phaser';
import {
  ANGLE_STEPS,
  BOOST_COOLDOWN_TICKS,
  BUMP_EVENT_MIN,
  FP,
  PLAYER_COLORS,
  PU_HORN,
  TICK_RATE,
  TUNING,
  applyGameTuning,
  computeStandings,
  countdownSeconds,
  fightTicks,
  type GameEvent,
  type GameState,
} from '@masinute/shared';
import { DebugOverlay } from '../debug/DebugOverlay';
import { savedTuning, TunePanel } from '../debug/TunePanel';
import { keepScreenOn } from '../device-apis';
import { isTouch } from '../device';
import { CombinedInput } from '../input/CombinedInput';
import { NO_INPUT } from '../input/InputSource';
import { KeyboardInput } from '../input/KeyboardInput';
import { TouchInput } from '../input/TouchInput';
import type { GameTransport } from '../net/GameTransport';
import type { RenderView } from '../net/view';
import { Arena } from '../render/Arena';
import { CarView } from '../render/CarView';
import { playSfx } from '../audio/sfx';
import { bumpSparks, boostPuff, outBurst, powerupSparkle, shockwave } from '../render/fx';
import { Hud } from '../render/Hud';
import { PowerupLayer } from '../render/PowerupLayer';
import { hexColor, POWERUP_INFO } from '../render/powerupInfo';
import { ARENA_CX, ARENA_CY, ARENA_R, DEPTH, FONT, GAME_H, GAME_W, HUD_X, SIDE_W, TOUCH_LAYOUT, toScreenX, toScreenY } from '../render/layout';
import { ensureTextures } from '../render/textures';
import { getSetting, reducedEffects, vibrate } from '../settings';
import { ConnectionBanner } from '../ui/ConnectionBanner';
import { openDialog, type Dialog } from '../ui/dialog';
import { button, el, useScaleMode } from '../ui/dom';
import { fullscreenOnFirstTap } from '../ui/fullscreen';
import { requireLandscape } from '../ui/orientation';
import { notifyPresence } from '../ui/presence';
import { TextButton } from '../ui/TextButton';
import type { LobbySceneData } from './LobbyScene';
import type { MenuSceneData } from './MenuScene';

export interface GameSceneData {
  transport: GameTransport;
  debug: boolean;
  /** ?tune: the saved values and the panel (local games only). */
  tune: boolean;
  /** Started from test URL options: after the match, Enter (or a tap) starts a new one instead of going back to the lobby. */
  newMatch?: () => GameSceneData;
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
  private powerups!: PowerupLayer;
  private hud!: Hud;
  private connection!: ConnectionBanner;
  private pauseButton?: TextButton;
  private confirm?: Dialog;
  /** The leave dialog paused the offline match, so closing it resumes. */
  private confirmPaused = false;
  private readonly cars = new Map<string, CarView>();

  /** Where the transport says to draw everything this frame. */
  private view: RenderView = { poses: new Map(), ringRadius: 0 };

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
    this.view = { poses: new Map(), ringRadius: 0 };
    this.lastCountdown = -1;
    this.touch = undefined;
    this.debug = undefined;
    this.tune = undefined;
    this.pauseButton = undefined;
    this.confirm = undefined;
    this.confirmPaused = false;
  }

  create(): void {
    ensureTextures(this);
    // Every game starts from the default driving numbers; saved ?tune values only for a local ?tune game.
    applyGameTuning({ online: this.transport.online, tune: this.data_.tune, saved: savedTuning() });
    useScaleMode(this, Phaser.Scale.FIT);
    requireLandscape(this);
    keepScreenOn(this);
    const disarmFullscreen = fullscreenOnFirstTap();
    this.cameras.main.setBackgroundColor('#120a24');
    this.arena = new Arena(this);
    this.powerups = new PowerupLayer(this);
    const leftHanded = isTouch && getSetting('leftHanded');
    this.hud = new Hud(this, leftHanded);
    // The fullscreen icon sits on the round-info side, away from the scores.
    document.body.classList.toggle('chrome-left', leftHanded);
    this.createOverlays();
    this.createButtons(leftHanded);
    this.connection = new ConnectionBanner(this);

    const keyboard = new KeyboardInput(this.input.keyboard!);
    if (isTouch) {
      this.touch = new TouchInput({ leftHanded });
      this.controls = new CombinedInput([this.touch, keyboard]);
    } else {
      this.controls = new CombinedInput([keyboard]);
    }

    this.unsubscribe = this.transport.onEvents((events) => this.handleEvents(events));
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    this.input.keyboard!.on('keydown-P', () => {
      if (!this.confirm) this.togglePause();
    });
    this.input.keyboard!.on('keydown-ENTER', () => this.onContinue());
    this.overlayBg.on('pointerdown', () => this.onContinue());
    // Esc opens and closes the leave dialog (a DOM listener, so it stays in step with the dialog's buttons).
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.repeat) this.setConfirm(!this.confirm);
    };
    window.addEventListener('keydown', onEsc);

    if (this.data_.debug) this.debug = new DebugOverlay(this);
    if (this.data_.tune && !this.transport.online) this.tune = new TunePanel();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', onEsc);
      disarmFullscreen();
      this.confirm?.close();
      document.body.classList.remove('chrome-left');
      this.unsubscribe?.();
      this.controls.destroy();
      // Phaser keeps key captures game-wide: without this, WASD and Space could not be typed in the menus.
      this.input.keyboard!.clearCaptures();
      this.tune?.destroy();
      for (const car of this.cars.values()) car.destroy();
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden, this);
    });
  }

  update(time: number): void {
    if (!this.connection.update(this.transport, time)) return;
    const before = this.transport.getState();
    const meBefore = before.players[this.transport.playerId];
    // The joystick steers relative to the car as drawn (online: the predicted car).
    const heading = this.view.poses.get(this.transport.playerId)?.heading ?? meBefore?.heading ?? 0;
    const input = this.controls.poll({ heading: Math.round(heading) });
    const canDrive = before.phase === 'playing' && !!meBefore?.alive && !this.transport.isPaused() && !this.confirm;
    this.transport.setInput(canDrive ? input : NO_INPUT);
    this.transport.update(this.game.loop.delta);
    notifyPresence(this.transport);

    const state = this.transport.getState();
    if (state.phase === 'lobby' && !this.data_.newMatch) {
      const data: LobbySceneData = { transport: this.transport };
      this.scene.start('lobby', data);
      return;
    }
    const me = state.players[this.transport.playerId];
    this.pauseButton?.setVisible(state.phase === 'playing' || state.phase === 'intermission');
    this.pauseButton?.setText(this.transport.isPaused() ? 'Continuă' : 'Pauză');
    this.touch?.setVisible(state.phase === 'playing' && !!me?.alive && !this.transport.isPaused());
    if (me) this.touch?.setBoostReady(1 - me.boostCooldown / BOOST_COOLDOWN_TICKS);

    this.view = this.transport.view();
    this.arena.update(time, this.view.ringRadius / FP);
    this.powerups.update(state, time);
    this.syncCars(state, time);
    this.hud.update(state, this.transport.playerId);
    this.syncCountdown(state);
    this.syncOverlay(state);
    this.debug?.update(state, this.transport.playerId, this.game.loop.actualFps, this.transport.isPaused(), (id) => this.screenPos(id), this.transport.netStats?.());
  }

  private screenPos(id: string): { x: number; y: number; angle: number } | undefined {
    const pose = this.view.poses.get(id);
    if (!pose) return undefined;
    return { x: toScreenX(pose.x), y: toScreenY(pose.y), angle: (pose.heading / ANGLE_STEPS) * Math.PI * 2 };
  }

  private syncCars(state: Readonly<GameState>, time: number): void {
    for (const p of Object.values(state.players)) {
      let car = this.cars.get(p.id);
      if (!car) {
        car = new CarView(this, p, p.id === this.transport.playerId);
        this.cars.set(p.id, car);
        // Joined as a spectator of this round, or already off the ring.
        if (state.phase !== 'lobby' && !p.alive) car.setVisible(false);
      }
      const pos = this.screenPos(p.id);
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
        const pos = this.screenPos(e.playerId);
        if (pos) boostPuff(this, pos.x, pos.y, pos.angle);
      } else if (e.type === 'out') {
        this.onOut(state, e.playerId, e.byId);
      } else if (e.type === 'powerupSpawn') {
        powerupSparkle(this, toScreenX(e.x), toScreenY(e.y), POWERUP_INFO[e.kind]?.color ?? 0xffffff);
      } else if (e.type === 'pickup') {
        this.onPickup(e.playerId, e.kind);
      } else if (e.type === 'horn') {
        const near = this.nearMe(state, e.x, e.y, TUNING.hornRadius);
        shockwave(this, toScreenX(e.x), toScreenY(e.y), TUNING.hornRadius / FP, POWERUP_INFO[PU_HORN]!.color);
        playSfx('claxon', e.playerId === meId || near ? 1 : 0.6);
        if (near && e.playerId !== meId) {
          if (!reducedEffects()) this.cameras.main.shake(220, 0.01);
          vibrate(90);
        }
      } else if (e.type === 'saved') {
        this.shout(e.playerId, 'SALVAT!', '#7cf29a');
        playSfx('colac', e.playerId === meId ? 1 : 0.6);
        if (e.playerId === meId) vibrate(60);
      } else if (e.type === 'confused') {
        this.shout(e.playerId, 'HIC!', '#c77dff');
        playSfx('sughit', e.playerId === meId || e.byId === meId ? 1 : 0.6);
        if (e.playerId === meId) vibrate(70);
      } else if (e.type === 'spring') {
        playSfx('boing', e.playerId === meId ? 1 : 0.7);
      } else if (e.type === 'roundStart') {
        for (const car of this.cars.values()) car.reset();
      } else if (e.type === 'roundEnd' && e.winnerId === meId) {
        vibrate(80);
      }
    }
  }

  /** "CLAXON DE TIR!" over the car that drove over it, a glint and the pickup sound. */
  private onPickup(playerId: string, kind: number): void {
    const info = POWERUP_INFO[kind];
    if (!info) return;
    const mine = playerId === this.transport.playerId;
    this.shout(playerId, info.shout, hexColor(info.color));
    const pos = this.screenPos(playerId);
    if (pos) powerupSparkle(this, pos.x, pos.y, info.color);
    playSfx('ridicare', mine ? 1 : 0.5);
    if (mine) vibrate(30);
  }

  /** Text floating up from over a car (where it is drawn). */
  private shout(playerId: string, text: string, color: string): void {
    const pos = this.screenPos(playerId);
    if (pos) this.floatText(pos.x, pos.y - 44, text, color);
  }

  /** Whether this player's car (as drawn) is within `radius` sub-units of a point. */
  private nearMe(state: Readonly<GameState>, x: number, y: number, radius: number): boolean {
    const me = state.players[this.transport.playerId];
    return !!me?.alive && Math.hypot(me.x - x, me.y - y) < radius;
  }

  private onOut(state: Readonly<GameState>, playerId: string, byId: string): void {
    const p = state.players[playerId];
    if (!p) return;
    // Where the car is drawn (online the own car runs ahead of the state, the others behind).
    const pos = this.screenPos(playerId);
    const x = pos?.x ?? toScreenX(p.x);
    const y = pos?.y ?? toScreenY(p.y);
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
        const tap = isTouch ? 'Atinge aici' : 'Enter';
        const again = this.data_.newMatch
          ? `\n\n${tap} = încă un meci`
          : state.hostId === this.transport.playerId
            ? `\n\n${tap} = înapoi în lobby`
            : '\n\nAșteaptă ca hostul să revină în lobby.';
        const records = this.recordLines();
        text = `${result}\n\nGata meciul!\n${lines.join('\n')}${records ? `\n\n${records}` : ''}${again}`;
      }
    } else if (this.transport.isPaused() && !this.confirm) {
      text = `Pauză\n\n${isTouch ? 'Revino în joc' : 'P = continuă'}`;
    }
    this.overlayText.setText(text);
    this.overlayBg.setVisible(text !== '');
    if (text) this.overlayBg.setSize(Math.max(420, this.overlayText.width + 60), this.overlayText.height + 50);

    const watching = state.phase === 'playing' && me && !me.alive && !text;
    this.banner.setText(watching ? 'Ai ieșit din ring! Privești runda.' : '');
  }

  /**
   * Online: "Ai intrat în top! Locul X" / "Record nou! Locul X" for this player, then the others
   * (shown once the server has saved the match). Offline: a note that it does not count.
   */
  private recordLines(): string {
    if (!this.transport.online) return this.data_.newMatch ? '' : 'Meciurile offline nu intră în clasament.';
    const me = this.transport.playerId;
    return [...this.transport.newRecords()]
      .sort((a, b) => Number(b.playerId === me) - Number(a.playerId === me) || a.place - b.place)
      .map((r) =>
        r.playerId === me
          ? `${r.kind === 'top' ? 'Ai intrat în top!' : 'Record nou!'} Locul ${r.place} în clasament`
          : `${r.name}: ${r.kind === 'top' ? 'a intrat în top' : 'record nou'}, locul ${r.place}`,
      )
      .join('\n');
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

  /** Enter or a tap on the panel: after the match a new one (test URL) or back to the lobby (host); paused, resume. */
  private onContinue(): void {
    if (this.confirm) return;
    const state = this.transport.getState();
    if (state.phase === 'finished') {
      const next = this.data_.newMatch;
      if (next) {
        this.transport.dispose();
        this.scene.restart(next());
      } else if (state.hostId === this.transport.playerId) {
        // Back in the lobby phase, update() hands over to the lobby scene.
        this.transport.send({ type: 'lobby' });
      }
      return;
    }
    // On a phone, a tap on the pause panel resumes.
    if (this.transport.isPaused()) this.togglePause();
  }

  /**
   * Leaving is offered in every phase: "Ieși (Esc)" in the HUD on a desktop, "Ieși" in the round-info
   * zone on a phone, with "Pauză" under it in offline games (P on a desktop).
   */
  private createButtons(leftHanded: boolean): void {
    if (!TOUCH_LAYOUT) {
      new TextButton(this, HUD_X, GAME_H - 24, 'Ieși (Esc)', () => this.setConfirm(true), 'secondary', 16).setOrigin(0, 1).setDepth(DEPTH.hud);
      return;
    }
    const x = leftHanded ? HUD_X : GAME_W - SIDE_W + 16;
    const leave = new TextButton(this, x, 190, 'Ieși', () => this.setConfirm(true), 'secondary', 24).setOrigin(0, 0).setWidth(150, 14);
    leave.setDepth(DEPTH.hud);
    if (this.transport.pausable) {
      this.pauseButton = new TextButton(this, x, 190 + leave.height + 14, 'Pauză', () => this.togglePause(), 'secondary', 24)
        .setOrigin(0, 0)
        .setWidth(150, 14)
        .setDepth(DEPTH.hud);
    }
  }

  /** "Sigur ieși?" before leaving a match for good; an offline match waits paused meanwhile. */
  private setConfirm(open: boolean): void {
    if (open === !!this.confirm) return;
    if (!open) {
      this.confirm!.close();
      this.confirm = undefined;
      if (this.confirmPaused) this.transport.setPaused(false);
      this.confirmPaused = false;
      return;
    }
    this.controls.releaseAll();
    if (this.transport.pausable && !this.transport.isPaused() && this.transport.getState().phase !== 'finished') {
      this.transport.setPaused(true);
      this.confirmPaused = true;
    }
    const stay = button('Rămân', () => this.setConfirm(false), 'primary', 'medium');
    this.confirm = openDialog([
      el('h2', { text: this.leaveWarning() }),
      el('div', { class: 'btn-row' }, [button('Da, ieși', () => this.leaveMatch(), 'secondary', 'medium'), stay]),
    ]);
    stay.focus();
  }

  private leaveWarning(): string {
    const state = this.transport.getState();
    const me = state.players[this.transport.playerId];
    if (state.phase === 'finished') return 'Ieși în meniu?';
    if (!this.transport.online) return 'Sigur ieși?\nMeciul offline se încheie.';
    if (state.phase === 'playing' && me?.alive) return 'Sigur ieși? Pierzi runda.';
    return 'Sigur ieși?\nRămâi în clasament ca „a ieșit”.';
  }

  /** For good. Online the server then applies leavePlayer; offline the game just ends. */
  private leaveMatch(): void {
    this.transport.dispose();
    const data: MenuSceneData = {};
    this.scene.start('menu', data);
  }
}

