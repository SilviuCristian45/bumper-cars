import { applyGameTuning, type GameEvent, type GameState, type NewRecord } from '@masinute/shared';
import { keepScreenOn } from '@client/device-apis';
import { isTouch } from '@client/device';
import { CombinedInput } from '@client/input/CombinedInput';
import { NO_INPUT, type InputSource } from '@client/input/InputSource';
import { TouchInput } from '@client/input/TouchInput';
import type { GameTransport } from '@client/net/GameTransport';
import type { RenderView } from '@client/net/view';
import type { Route } from '@client/screens/host';
import { getSetting } from '@client/settings';
import { ConnectionBanner } from '@client/ui/ConnectionBanner';
import { openDialog, type Dialog } from '@client/ui/dialog';
import { el } from '@client/ui/el';
import { fullscreenOnFirstTap } from '@client/ui/fullscreen';
import { button, dialogOpen, isTyping, type Lifetime } from '@client/ui/html';
import { requireLandscape } from '@client/ui/orientation';
import { notifyPresence } from '@client/ui/presence';
import { Board } from './Board';
import { Hud } from './Hud';
import { KeyboardInput } from './KeyboardInput';
import { getCameraMode } from './settings3d';
import type { World } from './World';

export interface MatchOptions {
  /** Test URL options: after the match, Enter (or a tap) starts a new local one instead of going back to the lobby. */
  newMatch?: () => GameTransport;
  go(route: Route): void;
}

/**
 * A match drawn in 3D, local or online (the 3D GameScene): input to the transport, the board and the HUD
 * from its state, the leave dialog, pause, reconnecting banner, presence toasts, back to the lobby.
 */
export class Match {
  private board: Board;
  private readonly hud: Hud;
  private readonly controls: InputSource;
  private readonly touch: TouchInput | null;
  private readonly pauseButton: HTMLButtonElement | null;
  private readonly banner: ConnectionBanner;
  private readonly unsubscribe: () => void;
  private events: GameEvent[] = [];
  private view: RenderView = { poses: new Map(), ringRadius: 0 };
  private confirm: Dialog | undefined;
  /** The leave dialog paused the offline match, so closing it resumes. */
  private confirmPaused = false;
  private recordsShown: readonly NewRecord[] | null = null;
  private recordsLine = '';
  private done = false;

  constructor(
    private world: World,
    life: Lifetime,
    private readonly transport: GameTransport,
    private readonly opts: MatchOptions,
  ) {
    // The simulation's numbers are always the defaults here (the 3D client has no ?tune panel).
    applyGameTuning({ online: transport.online, tune: false, saved: null });
    requireLandscape(life);
    keepScreenOn(life);
    life.onEnd(fullscreenOnFirstTap());
    world.rig.setMode(getCameraMode());

    this.board = new Board(world, transport.playerId);
    this.hud = new Hud(transport.playerId, !isTouch);
    const leftHanded = isTouch && getSetting('leftHanded');
    document.body.classList.toggle('chrome-left', leftHanded);
    const keyboard = new KeyboardInput();
    this.touch = isTouch ? new TouchInput({ leftHanded }) : null;
    this.controls = this.touch ? new CombinedInput([this.touch, keyboard]) : keyboard;
    this.banner = new ConnectionBanner(life, (message) => this.end({ to: 'menu', data: { message } }));
    this.unsubscribe = transport.onEvents((events) => this.events.push(...events));

    this.pauseButton = transport.pausable ? button('Pauză', () => this.togglePause(), 'secondary', 'small') : null;
    const buttons = el('div', { class: `game-buttons${leftHanded ? ' left' : ''}` }, [
      button(isTouch ? 'Cameră' : 'Cameră (C)', () => this.world.rig.toggle(), 'secondary', 'small'),
      this.pauseButton,
      button(isTouch ? 'Ieși' : 'Ieși (Esc)', () => this.setConfirm(true), 'secondary', 'small'),
    ]);
    for (const b of buttons.querySelectorAll('button')) b.addEventListener('click', () => b.blur());
    document.body.append(buttons);

    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || isTyping()) return;
      if (e.key === 'Escape') this.setConfirm(!this.confirm);
      else if (dialogOpen()) return;
      else if (e.code === 'KeyC') this.world.rig.toggle();
      else if (e.code === 'KeyP') this.togglePause();
      else if (e.key === 'Enter') this.onContinue();
    };
    const onTap = (e: PointerEvent) => {
      if (e.target instanceof HTMLCanvasElement) this.onContinue();
    };
    const onVisibility = () => {
      if (document.hidden) this.onHidden();
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onTap);
    document.addEventListener('visibilitychange', onVisibility);
    life.onEnd(() => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onTap);
      document.removeEventListener('visibilitychange', onVisibility);
      this.confirm?.close();
      document.body.classList.remove('chrome-left');
      buttons.remove();
      this.unsubscribe();
      this.controls.destroy();
      this.hud.dispose();
      this.board.dispose();
    });
  }

  /** For ?debug (the hidden-tab script reads it like the 2D game scene's). */
  get currentTransport(): GameTransport {
    return this.transport;
  }

  /** The world was rebuilt (quality changed). */
  attach(world: World): void {
    const mode = this.world.rig.mode;
    this.board.dispose();
    this.world = world;
    world.rig.setMode(mode);
    this.board = new Board(world, this.transport.playerId);
  }

  /** time: ms since the page loaded; dtMs: this frame. */
  update(time: number, dtMs: number): void {
    if (this.done || !this.banner.update(this.transport, time)) return;
    const t = this.transport;
    const before = t.getState();
    const meBefore = before.players[t.playerId];
    // The joystick steers relative to the car as drawn (online: the predicted car), turned by the camera's angle.
    const heading = this.view.poses.get(t.playerId)?.heading ?? meBefore?.heading ?? 0;
    const input = this.controls.poll({ heading: this.world.rig.screenHeading(heading) });
    const canDrive = before.phase === 'playing' && !!meBefore?.alive && !t.isPaused() && !this.confirm;
    t.setInput(canDrive && input ? input : NO_INPUT);
    t.update(dtMs);
    notifyPresence(t);

    const state = t.getState();
    if (state.phase === 'lobby' && !this.opts.newMatch) {
      this.end({ to: 'lobby', transport: t });
      return;
    }
    const me = state.players[t.playerId];
    this.touch?.setVisible(state.phase === 'playing' && !!me?.alive && !t.isPaused());
    if (this.pauseButton) {
      this.pauseButton.hidden = state.phase !== 'playing' && state.phase !== 'intermission';
      this.pauseButton.textContent = t.isPaused() ? 'Continuă' : 'Pauză';
    }

    this.view = t.view();
    if (this.events.length > 0) {
      this.board.onEvents(this.events, state);
      this.hud.onEvents(this.events);
      this.events = [];
    }
    const dt = dtMs / 1000;
    this.board.update(state, this.view, dt);
    this.board.cars.showOwnLabel = this.world.rig.mode === 'tilted';
    const car = this.board.cars.carOf(t.playerId);
    const follow = car && me?.alive && !car.falling ? { x: car.root.position.x, z: car.root.position.z, yaw: car.root.rotation.y } : null;
    this.world.rig.update(dt, follow);
    this.world.arena.setNetFromBelow(this.world.rig.mode === 'chase' && !!follow);
    this.hud.update(state, dt, t.isPaused(), this.finishedHint(state), this.records(state));
    this.touch?.setBoostReady(this.hud.boostReady(state));
  }

  private finishedHint(state: Readonly<GameState>): string {
    const tap = isTouch ? 'Atinge ecranul' : 'Enter';
    if (this.opts.newMatch) return `${tap} pentru încă un meci`;
    if (state.hostId === this.transport.playerId) return `${tap}: înapoi în lobby`;
    return 'Așteaptă ca hostul să revină în lobby.';
  }

  /** "Ai intrat în top!" / "Record nou!" once the server has saved the match; offline, a note that it does not count. */
  private records(state: Readonly<GameState>): string {
    if (state.phase !== 'finished') return '';
    if (!this.transport.online) return this.opts.newMatch ? '' : 'Meciurile offline nu intră în clasament.';
    const records = this.transport.newRecords();
    if (records === this.recordsShown) return this.recordsLine;
    this.recordsShown = records;
    const me = this.transport.playerId;
    const parts = [...records]
      .sort((a, b) => Number(b.playerId === me) - Number(a.playerId === me) || a.place - b.place)
      .map((r) =>
        r.playerId === me
          ? `${r.kind === 'top' ? 'Ai intrat în top!' : 'Record nou!'} Locul ${r.place}`
          : `${r.name}: ${r.kind === 'top' ? 'a intrat în top' : 'record nou'}, locul ${r.place}`,
      );
    this.recordsLine = parts.length > 0 ? `★ ${parts.join('  ·  ')} ★` : '';
    return this.recordsLine;
  }

  private togglePause(): void {
    if (!this.transport.pausable || this.confirm) return;
    const phase = this.transport.getState().phase;
    if (phase !== 'playing' && phase !== 'intermission') return;
    this.transport.setPaused(!this.transport.isPaused());
    this.controls.releaseAll();
  }

  /** The page went to the background: let go of everything held; offline the match pauses. */
  private onHidden(): void {
    this.controls.releaseAll();
    this.transport.setInput(NO_INPUT);
    if (this.transport.pausable && this.transport.getState().phase !== 'finished') this.transport.setPaused(true);
  }

  /** Enter or a tap: after the match a new one (test URL) or back to the lobby (host); paused, resume. */
  private onContinue(): void {
    if (this.confirm) return;
    const state = this.transport.getState();
    if (state.phase === 'finished') {
      const next = this.opts.newMatch;
      if (next) {
        this.transport.dispose();
        this.end({ to: 'game', transport: next() });
      } else if (state.hostId === this.transport.playerId) {
        // Back in the lobby phase, update() hands over to the lobby.
        this.transport.send({ type: 'lobby' });
      }
      return;
    }
    if (this.transport.isPaused()) this.togglePause();
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
      el('div', { class: 'btn-row' }, [button('Da, ieși', () => this.leave(), 'secondary', 'medium'), stay]),
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
  private leave(): void {
    this.transport.dispose();
    this.end({ to: 'menu', data: {} });
  }

  private end(route: Route): void {
    if (this.done) return;
    this.done = true;
    this.opts.go(route);
  }
}
