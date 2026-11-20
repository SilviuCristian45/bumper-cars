import type { GameTransport } from '@client/net/GameTransport';
import type { Route, ScreenHost } from '@client/screens/host';
import { showIntro } from '@client/screens/intro';
import { showLeaderboard } from '@client/screens/leaderboard';
import { LobbyScreen } from '@client/screens/lobby';
import { MenuScreen } from '@client/screens/menu';
import { showName } from '@client/screens/name';
import { mountHtmlScreen, type Lifetime } from '@client/ui/html';
import { openSettings } from '@client/ui/settingsDialog';
import { carAvatar } from './avatars';
import { Demo } from './Demo';
import { Match } from './Match';
import { perf } from './options';
import { PerfOverlay } from './PerfOverlay';
import { getQuality, settingsRows, type Quality } from './settings3d';
import { World } from './World';

type RouteKey = Route['to'];

const DEMO_DELAY_MS = 300;

/** One route's lifetime: ended (its cleanups run) when the app moves on. */
class RouteLife implements Lifetime {
  private readonly cleanups: (() => void)[] = [];
  ended = false;

  onEnd(cb: () => void): void {
    if (this.ended) cb();
    else this.cleanups.push(cb);
  }

  end(): void {
    this.ended = true;
    for (const cb of this.cleanups.splice(0)) cb();
  }
}

export interface AppOptions {
  /** Test URL options: local matches one after another, no menus. */
  newMatch?: () => GameTransport;
}

/**
 * The 3D client's router. The HTML screens are the 2D client's (client/src/screens) over a 3D backdrop
 * (bots playing on the ring, an orbiting camera); the game route is a Match. One frame loop drives
 * whichever is shown and renders the world.
 */
export class App {
  private world: World;
  private readonly stage: HTMLElement;
  private key: RouteKey = 'intro';
  private life = new RouteLife();
  private lobby: LobbyScreen | null = null;
  private match: Match | null = null;
  private demo: Demo | null = null;
  /** How long the current menu-like route has been shown (the demo starts only once one stays a moment). */
  private shownMs = 0;
  private perfOverlay: PerfOverlay | null = null;
  private last = performance.now();

  constructor(private readonly opts: AppOptions = {}) {
    this.stage = document.getElementById('stage')!;
    this.world = new World(getQuality(), this.stage);
    this.world.renderer.setAnimationLoop((now: number) => this.frame(now));
    this.createPerf();
  }

  go(route: Route): void {
    // A route may be asked for while the previous one is still being set up: always end the current one first.
    this.life.end();
    this.life = new RouteLife();
    this.key = route.to;
    this.lobby = null;
    this.match = null;
    if (route.to === 'lobby') this.lobbyTransport = route.transport;
    const host = this.host(this.life);

    if (route.to === 'game') {
      this.stopDemo();
      this.match = new Match(this.world, this.life, route.transport, { newMatch: this.opts.newMatch, go: (r) => this.go(r) });
      return;
    }
    this.shownMs = 0;
    if (route.to === 'intro') showIntro(host, route.data);
    else if (route.to === 'name') showName(host, route.data);
    else if (route.to === 'menu') new MenuScreen(host, route.data);
    else if (route.to === 'leaderboard') showLeaderboard(host);
    else this.lobby = new LobbyScreen(host, route.transport);
  }

  /** For ?debug: what the hidden-tab script reads from the 2D client's Phaser game (window.__game). */
  debugView(): unknown {
    const transport = () => this.match?.currentTransport ?? this.lobbyTransport;
    return {
      scene: {
        getScenes: () => [{ scene: { key: this.key } }],
        getScene: (key: string) => ({
          sys: { isActive: () => this.key === key },
          get transport() {
            return transport();
          },
        }),
      },
    };
  }

  private lobbyTransport: GameTransport | undefined;

  private host(life: RouteLife): ScreenHost {
    return {
      life,
      go: (route) => this.go(route),
      isActive: () => !life.ended,
      mount: (className, children) => mountHtmlScreen(life, className, children),
      avatarUrl: carAvatar,
      openSettings: () => openSettings({ music: false, extra: settingsRows((q) => this.setQuality(q)) }),
      cornerToggles: ['reducedEffects'],
      settingsOnDesktop: true,
    };
  }

  /** Rebuilds the world with the new quality, keeping what is shown. */
  private setQuality(quality: Quality): void {
    if (quality === this.world.quality) return;
    this.world.renderer.setAnimationLoop(null);
    this.world.dispose();
    this.world = new World(quality, this.stage);
    this.demo?.attach(this.world);
    this.match?.attach(this.world);
    this.perfOverlay?.dispose();
    this.createPerf();
    this.last = performance.now();
    this.world.renderer.setAnimationLoop((now: number) => this.frame(now));
  }

  private createPerf(): void {
    if (!perf) return;
    this.perfOverlay = new PerfOverlay(this.world.renderer, this.world.quality, () => this.match?.currentTransport.netStats?.());
    // window.__bench(n) draws the current frame n times back to back and waits for the GPU each time
    // (1-pixel read), so the cost of a frame can be measured even when the browser throttles rAF.
    const gl = this.world.renderer.getContext();
    const pixel = new Uint8Array(4);
    (window as unknown as { __bench: (n?: number) => object }).__bench = (n = 100) => {
      const t0 = performance.now();
      for (let i = 0; i < n; i++) {
        this.world.render(0);
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      }
      const ms = (performance.now() - t0) / n;
      const info = this.world.renderer.info.render;
      return { msPerFrame: +ms.toFixed(2), maxFps: Math.round(1000 / ms), calls: info.calls, triangles: info.triangles };
    };
  }

  /**
   * The bots behind the menus start once a screen has stayed up for DEMO_DELAY_MS: a resume after a reload
   * passes through the menu and the lobby in a few frames, and building the demo's cars (and compiling
   * their shaders) there would only delay getting back into the game.
   */
  private updateDemo(dtMs: number): void {
    this.shownMs += dtMs;
    if (!this.demo && this.shownMs < DEMO_DELAY_MS) {
      this.world.rig.orbit(dtMs / 1000);
      return;
    }
    this.demo ??= new Demo(this.world);
    this.demo.update(dtMs);
  }

  private stopDemo(): void {
    this.demo?.dispose();
    this.demo = null;
  }

  private frame(now: number): void {
    const gap = now - this.last;
    this.last = now;
    const workStart = performance.now();
    // A long stall (tab in the background) is not replayed at once.
    const dtMs = Math.min(gap, 250);
    if (this.match) this.match.update(now, gap);
    else {
      this.lobby?.update(now, gap);
      // The lobby may have switched to the game just now.
      if (!this.match) this.updateDemo(dtMs);
    }
    this.world.render(dtMs / 1000);
    this.perfOverlay?.frame(gap, performance.now() - workStart);
  }
}
