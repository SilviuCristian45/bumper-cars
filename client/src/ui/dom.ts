import Phaser from 'phaser';
import type { Child } from './el';
import { mountHtmlScreen, onKeyFor, type Lifetime } from './html';

// The Phaser-bound helpers for the HTML parts of the UI; the rest lives in ui/html.ts (shared with the
// 3D client) and is re-exported here.

export { el, type ElProps } from './el';
export * from './html';

/** A scene's lifetime: it ends when the scene shuts down. */
export function sceneLifetime(scene: Phaser.Scene): Lifetime {
  return { onEnd: (cb) => scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cb) };
}

/**
 * Puts an HTML screen over the canvas for as long as the scene runs. The canvas behind it only
 * draws the fair at night, stretched to cover the whole page (portrait phones included).
 */
export function mountScreen(scene: Phaser.Scene, className: string, children: Child[]): HTMLElement {
  const column = mountHtmlScreen(sceneLifetime(scene), className, children);
  useScaleMode(scene, Phaser.Scale.ENVELOP);
  return column;
}

/** FIT for the game (all of the arena visible), ENVELOP behind the HTML screens. */
export function useScaleMode(scene: Phaser.Scene, mode: Phaser.Scale.ScaleModeType): void {
  const scale = scene.scale;
  scale.scaleMode = mode;
  // FIT / ENVELOP is really the display size's aspect mode.
  scale.displaySize.setAspectMode(mode);
  // The parent may have just changed size (safe-area padding comes and goes with the HTML screens).
  scale.getParentBounds();
  scale.refresh();
}

/** A page-wide key handler for the scene's lifetime (see onKeyFor). */
export function onKey(scene: Phaser.Scene, key: string, handler: () => void): void {
  onKeyFor(sceneLifetime(scene), key, handler);
}

/** A texture baked by render/textures.ts as an image URL, for the HTML parts. */
export function textureUrl(game: Phaser.Game, key: string): string {
  return game.textures.getBase64(key);
}
