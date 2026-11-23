import * as THREE from 'three';
import {
  ANGLE_STEPS,
  PLAYER_COLORS,
  POWERUP_BLINK_TICKS,
  PU_GHOST,
  RING_RADIUS,
  TICK_RATE,
  TUNING,
  carRadius,
  livePowerups,
  sortedPlayers,
  type GameState,
} from '@masinute/shared';
import { isTouch } from '@client/device';
import type { RenderView } from '@client/net/view';
import { POWERUP_INFO, hexColor } from '@client/render/powerupInfo';
import { POWERUP_DRAW, POWERUP_TEX } from '@client/render/powerupTextures';
import { el } from '@client/ui/el';

/** CSS size of the map: smaller on phones, where it shares the top corner with the buttons. */
const SIZE = isTouch ? 108 : 160;
/** Room between the ring's full radius and the map's edge, CSS pixels. */
const PAD = 5;
/** Power-up icons on the map, CSS pixels across. */
const ICON = isTouch ? 15 : 20;
/** Cars are drawn at least this big (CSS pixels, radius) so they read at a glance. */
const MIN_CAR = isTouch ? 3.5 : 4.5;

let icons: Map<number, HTMLCanvasElement> | null = null;

/** The 2D client's power-up icons, drawn once into small canvases. */
function powerupIcons(): Map<number, HTMLCanvasElement> {
  if (icons) return icons;
  icons = new Map();
  for (const [kind, draw] of Object.entries(POWERUP_DRAW)) {
    const c = document.createElement('canvas');
    c.width = c.height = POWERUP_TEX;
    const g = c.getContext('2d');
    if (g) draw(g);
    icons.set(Number(kind), c);
  }
  return icons;
}

/**
 * The ring seen from above in a corner: the live floor (shrinking with the ring), oil puddles, the power-ups
 * as their 2D icons, every car still on the ring as an arrow in its color (the own one outlined). Turned with
 * the camera, so the map's up is where the camera looks. Others' ghosts are not on it (they are invisible).
 */
export class Minimap {
  private readonly canvas: HTMLCanvasElement;
  private readonly g: CanvasRenderingContext2D | null;
  private readonly dir = new THREE.Vector3();
  private clock = 0;
  private dpr = 0;

  constructor(private readonly meId: string) {
    this.canvas = el('canvas', { class: 'minimap' });
    this.canvas.style.width = this.canvas.style.height = `${SIZE}px`;
    this.g = this.canvas.getContext('2d');
    document.body.append(this.canvas);
  }

  update(state: Readonly<GameState>, view: RenderView, camera: THREE.Camera, shown: boolean, dt: number): void {
    const visible = shown && (state.phase === 'playing' || state.phase === 'intermission');
    this.canvas.hidden = !visible;
    if (!visible || !this.g) return;
    this.clock += dt;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    if (dpr !== this.dpr) {
      this.dpr = dpr;
      this.canvas.width = this.canvas.height = Math.round(SIZE * dpr);
    }

    const g = this.g;
    const half = SIZE / 2;
    const scale = (half - PAD) / RING_RADIUS; // CSS pixels per sub-unit
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, SIZE, SIZE);

    // Backing disc and the platform at its full size (the floor lost to the ring stays dark).
    g.fillStyle = 'rgba(18, 10, 36, 0.72)';
    g.beginPath();
    g.arc(half, half, half, 0, Math.PI * 2);
    g.fill();

    // Map up = the camera's direction on the floor (world x, z = sim x, y; canvas y grows down like sim y).
    camera.getWorldDirection(this.dir);
    const turn = -Math.PI / 2 - Math.atan2(this.dir.z, this.dir.x);
    g.translate(half, half);
    g.rotate(turn);
    g.scale(scale, scale);

    const full = RING_RADIUS;
    g.fillStyle = 'rgba(70, 52, 96, 0.55)';
    g.beginPath();
    g.arc(0, 0, full, 0, Math.PI * 2);
    g.fill();
    const ring = view.ringRadius;
    const shrunk = ring < full - 1;
    g.fillStyle = 'rgba(150, 140, 175, 0.5)';
    g.beginPath();
    g.arc(0, 0, ring, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = (shrunk ? 2 : 1.5) / scale;
    g.strokeStyle = shrunk ? '#ff4d5e' : 'rgba(255, 209, 102, 0.8)';
    g.stroke();

    const players = sortedPlayers(state as GameState);
    g.fillStyle = 'rgba(20, 8, 34, 0.85)';
    for (const p of players) {
      if (p.oilTicks <= 0) continue;
      g.beginPath();
      g.arc(p.oilX, p.oilY, TUNING.oilRadius, 0, Math.PI * 2);
      g.fill();
    }

    // Icons stay upright whatever the map's turn.
    const iconSize = ICON / scale;
    const all = powerupIcons();
    for (const pu of livePowerups(state)) {
      if (pu.ticks < POWERUP_BLINK_TICKS && Math.floor(this.clock * 8) % 2 === 0) continue;
      const icon = all.get(pu.kind);
      g.save();
      g.translate(pu.x, pu.y);
      g.rotate(-turn);
      const s = iconSize * (1 + Math.sin(this.clock * 6) * 0.06);
      if (icon) g.drawImage(icon, -s / 2, -s / 2, s, s);
      else {
        g.fillStyle = hexColor(POWERUP_INFO[pu.kind]?.color ?? 0xffffff);
        g.beginPath();
        g.arc(0, 0, s / 3, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    }

    // The own car last, on top of the rest.
    const order = [...players.filter((p) => p.id !== this.meId), ...players.filter((p) => p.id === this.meId)];
    for (const p of order) {
      if (!p.alive || p.left) continue;
      const pose = view.poses.get(p.id);
      if (!pose) continue;
      const me = p.id === this.meId;
      g.globalAlpha = 1;
      if (p.effect === PU_GHOST) {
        const flicker = p.effectTicks < TICK_RATE && Math.floor(this.clock * 12) % 2 === 0;
        if (!me && !flicker) continue;
        g.globalAlpha = me && !flicker ? 0.45 : 0.8;
      }
      const r = Math.max(carRadius(p), MIN_CAR / scale) * (me ? 1.25 : 1);
      const a = (pose.heading / ANGLE_STEPS) * Math.PI * 2;
      g.save();
      g.translate(pose.x, pose.y);
      g.rotate(a);
      g.beginPath();
      g.moveTo(r * 1.35, 0);
      g.lineTo(-r * 0.9, r * 0.95);
      g.lineTo(-r * 0.5, 0);
      g.lineTo(-r * 0.9, -r * 0.95);
      g.closePath();
      g.fillStyle = hexColor(PLAYER_COLORS[p.slot % PLAYER_COLORS.length]!);
      g.fill();
      g.lineJoin = 'round';
      g.lineWidth = (me ? 2 : 1) / scale;
      g.strokeStyle = me ? '#ffffff' : 'rgba(0, 0, 0, 0.6)';
      g.stroke();
      g.restore();
    }
    g.globalAlpha = 1;
  }

  dispose(): void {
    this.canvas.remove();
  }
}
