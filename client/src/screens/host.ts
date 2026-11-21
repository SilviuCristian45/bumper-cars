import type { GameTransport } from '../net/GameTransport';
import type { Child } from '../ui/el';
import type { Lifetime } from '../ui/html';
import type { ClientKind } from '../ui/otherClient';

// The HTML screens (intro, name, menu, leaderboard, lobby) are shared by the 2D client (inside Phaser
// scenes) and the 3D one; whatever differs between the two goes through a ScreenHost.

export interface MenuData {
  /** Code from a ?room= invite link: joined right away. */
  invite?: string;
  /** Shown on arrival, e.g. an invalid invite link or a lost connection. */
  message?: string;
  /** The tab was reloaded during an online game: reconnect to that room right away. */
  resume?: boolean;
  /** Opened a link to another room while in this one ('' = code unknown): ask before switching. */
  switchFrom?: string;
}

export interface NameData extends MenuData {
  /** Opened from the menu's "schimbă": go straight to the input, prefilled. */
  edit?: boolean;
}

export type Route =
  | { to: 'intro'; data: MenuData }
  | { to: 'name'; data: NameData }
  | { to: 'menu'; data: MenuData }
  | { to: 'leaderboard' }
  | { to: 'lobby'; transport: GameTransport }
  | { to: 'game'; transport: GameTransport };

export interface ScreenHost {
  /** The screen's lifetime: ends when the host moves on. */
  readonly life: Lifetime;
  go(route: Route): void;
  /** Still the screen being shown (async work may finish after the player moved on). */
  isActive(): boolean;
  /** Mounts the screen's HTML over the host's backdrop, for the screen's lifetime. */
  mount(className: string, children: Child[]): HTMLElement;
  /** A small picture of the car of a slot, for the lobby rows. */
  avatarUrl(slot: number): string;
  openSettings(): void;
  /** The desktop menu's corner toggles (touch devices have them under "Setări"). */
  readonly cornerToggles: readonly ('music' | 'reducedEffects')[];
  /** "Setări" in the menu and lobby on desktops too (otherwise touch devices only). */
  readonly settingsOnDesktop: boolean;
  /** The menu's button to the other client ("Încearcă în 3D" / "Înapoi la 2D"). */
  readonly otherClient: ClientKind;
}
