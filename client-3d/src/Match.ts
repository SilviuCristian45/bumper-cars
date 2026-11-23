import { applyGameTuning, sortedPlayers, type GameEvent, type GameState } from '@masinute/shared';
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
import { Debug3D } from './Debug3D';
import { Hud } from './Hud';
import { KeyboardInput } from './KeyboardInput';
import { MatchSounds } from './MatchSounds';
import { Minimap } from './Minimap';
import { Podium3D } from './Podium3D';
import { getCameraMode, getMinimap, setMinimap } from './settings3d';
import type { World } from './World';

export interface MatchOptions {
  /** Test URL options: after the match, Enter (or a tap) starts a new local one instead of going back to the lobby. */
  newMatch?: () => GameTransport;
  /** ?debug: hitboxes, vectors, bot intents, the info lines (Debug3D). */
  debug?: boolean;
  go(route: Route): void;
}

/**
 * A match drawn in 3D, local or online (the 3D GameScene): input to the transport, the board and the HUD
 * from its state, the leave dialog, pause, reconnecting banner, presence toasts, back to the lobby.
 */
export class Match {
  private board: Board;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly sounds: MatchSounds;
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
  private podium: Podium3D | null = null;
  private readonly debug: Debug3D | null;
  private done = false;
  /** A spectator (no car of their own, see GameTransport.playerId): the car the camera follows ('' = none yet). */
  private watched = '';
  /** "Următorul": the next car to follow, shown to spectators only. */
  private readonly nextButton: HTMLButtonElement;

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
    this.minimap = new Minimap(transport.playerId);
    this.sounds = new MatchSounds(transport.playerId);
    this.debug = opts.debug ? new Debug3D() : null;
    if (this.debug) world.scene.add(this.debug.lines);
    const leftHanded = isTouch && getSetting('leftHanded');
    document.body.classList.toggle('chrome-left', leftHanded);
    const keyboard = new KeyboardInput();
    this.touch = isTouch ? new TouchInput({ leftHanded }) : null;
    this.controls = this.touch ? new CombinedInput([this.touch, keyboard]) : keyboard;
    this.banner = new ConnectionBanner(life, (message) => this.end({ to: 'menu', data: { message } }));
    this.unsubscribe = transport.onEvents((events) => this.events.push(...events));

    this.pauseButton = transport.pausable ? button('Pauză', () => this.togglePause(), 'secondary', 'small') : null;
    this.nextButton = button(isTouch ? 'Următorul' : 'Următorul (→)', () => this.watchNext(1), 'secondary', 'small');
    this.nextButton.hidden = true;
    const buttons = el('div', { class: `game-buttons${leftHanded ? ' left' : ''}` }, [
      this.nextButton,
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
      else if (e.code === 'KeyM') setMinimap(!getMinimap());
      else if (e.key === 'Enter') this.onContinue();
      else if (this.spectating() && (e.code === 'ArrowRight' || e.code === 'KeyD')) this.watchNext(1);
      else if (this.spectating() && (e.code === 'ArrowLeft' || e.code === 'KeyA')) this.watchNext(-1);
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
      this.minimap.dispose();
      this.removePodium();
      this.board.dispose();
      if (this.debug) {
        this.world.scene.remove(this.debug.lines);
        this.debug.dispose();
      }
    });
  }

  /** For ?debug (the hidden-tab script reads it like the 2D game scene's). */
  get currentTransport(): GameTransport {
    return this.transport;
  }

  /** The world was rebuilt (quality changed). */
  attach(world: World): void {
    const mode = this.world.rig.mode;
    this.removePodium();
    this.board.dispose();
    if (this.debug) {
      this.world.scene.remove(this.debug.lines);
      world.scene.add(this.debug.lines);
    }
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
    const spectating = !me;
    if (spectating) this.keepWatching(state);
    this.nextButton.hidden = !spectating || state.phase === 'finished';
    // The camera, the sounds and the HUD follow the own car, or for a spectator the one being watched.
    const followId = spectating ? this.watched : t.playerId;
    const followed = state.players[followId];
    this.touch?.setVisible(state.phase === 'playing' && !!me?.alive && !t.isPaused());
    if (this.pauseButton) {
      this.pauseButton.hidden = state.phase !== 'playing' && state.phase !== 'intermission';
      this.pauseButton.textContent = t.isPaused() ? 'Continuă' : 'Pauză';
    }

    this.view = t.view();
    if (this.events.length > 0) {
      this.board.onEvents(this.events, state);
      this.hud.onEvents(this.events);
      const own = this.board.cars.carOf(followId);
      const listener = own && followed?.alive && !own.falling ? own.root.position : this.world.rig.look;
      this.sounds.onEvents(this.events, state, listener, this.world.rig.camera);
      this.events = [];
    }
    this.sounds.update(state);
    const dt = dtMs / 1000;
    this.board.update(state, this.view, dt);
    this.board.cars.showOwnLabel = this.world.rig.mode === 'tilted';
    const car = this.board.cars.carOf(followId);
    const follow = car && followed?.alive && !car.falling ? { x: car.root.position.x, z: car.root.position.z, yaw: car.root.rotation.y } : null;
    this.world.rig.update(dt, follow);
    this.world.arena.setNetFromBelow(this.world.rig.mode === 'chase' && !!follow);
    this.syncPodium(state, dt);
    this.debug?.update(state, this.view, t.playerId, dtMs, t.isPaused(), this.world.rig.camera, t.netStats?.());
    this.hud.update(state, dt, t.isPaused(), spectating ? (followed?.name ?? '') : null, t.spectators?.() ?? 0);
    this.minimap.update(state, this.view, this.world.rig.camera, getMinimap(), dt);
    this.touch?.setBoostReady(this.hud.boostReady(state));
  }

  private spectating(): boolean {
    return !this.transport.getState().players[this.transport.playerId];
  }

  /** A spectator keeps following a car on the ring: the next one once the watched car is out. */
  private keepWatching(state: Readonly<GameState>): void {
    const watched = state.players[this.watched];
    if (watched && !watched.left && (watched.alive || state.phase !== 'playing')) return;
    const next = sortedPlayers(state as GameState).find((p) => p.alive && !p.left) ?? sortedPlayers(state as GameState).find((p) => !p.left);
    this.watched = next?.id ?? '';
  }

  /** The next (dir 1) or previous (-1) car still on the ring, in slot order. */
  private watchNext(dir: number): void {
    const state = this.transport.getState();
    const cars = sortedPlayers(state as GameState).filter((p) => !p.left && (p.alive || state.phase !== 'playing'));
    if (cars.length === 0) return;
    const i = cars.findIndex((p) => p.id === this.watched);
    this.watched = cars[(i + dir + cars.length) % cars.length]!.id;
  }

  /** The podium takes over the ring once the match is over (the fanfare comes from MatchSounds). */
  private syncPodium(state: Readonly<GameState>, dt: number): void {
    const finished = state.phase === 'finished';
    if (!finished) {
      if (this.podium) this.removePodium();
      return;
    }
    if (!this.podium) {
      this.podium = new Podium3D(state, this.world.quality, {
        me: this.transport.playerId,
        online: this.transport.online,
        testMatch: !!this.opts.newMatch,
        onContinue: () => this.onContinue(),
      });
      this.world.scene.add(this.podium.group);
      this.board.setVisible(false);
    }
    this.podium.update(state, this.transport.newRecords(), dt);
    this.world.rig.podium(dt);
  }

  private removePodium(): void {
    if (!this.podium) return;
    this.world.scene.remove(this.podium.group);
    this.podium.dispose();
    this.podium = null;
    this.board.setVisible(true);
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
    if (!me) return 'Nu mai urmărești meciul?';
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
