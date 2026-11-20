import Phaser from 'phaser';
import { CAR_RADIUS, FP, MAX_PLAYERS, PLAYER_COLORS, POWERUP_KINDS } from '@masinute/shared';
import { ARENA_R, RIM_W } from './layout';
import { drawOilPuddle, OIL_TEX, POWERUP_DRAW, POWERUP_TEX } from './powerupTextures';

// Every texture is drawn from code at startup with the 2D canvas API (no image assets).

export const TEX = {
  floor: 'floor',
  rim: 'rim',
  bulb: 'bulb',
  spark: 'spark',
  shadow: 'shadow',
  car: (slot: number) => `car${slot}`,
  powerup: (kind: number) => `pu${kind}`,
  oil: 'oil',
} as const;

const CAR_R = CAR_RADIUS / FP;
const CAR_TEX = Math.ceil(CAR_R * 2 + 8);

export function ensureTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TEX.floor)) return;
  add(scene, TEX.floor, ARENA_R * 2, ARENA_R * 2, drawFloor);
  add(scene, TEX.rim, (ARENA_R + RIM_W) * 2, (ARENA_R + RIM_W) * 2, drawRim);
  add(scene, TEX.bulb, 24, 24, (g) => glow(g, 12, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'));
  add(scene, TEX.spark, 8, 8, (g) => glow(g, 4, 'rgba(255,255,255,1)', 'rgba(255,255,255,0)'));
  add(scene, TEX.shadow, CAR_TEX, CAR_TEX, (g) => glow(g, CAR_TEX / 2, 'rgba(0,0,0,0.55)', 'rgba(0,0,0,0)'));
  for (let slot = 0; slot < MAX_PLAYERS; slot++) {
    add(scene, TEX.car(slot), CAR_TEX, CAR_TEX, (g) => drawCar(g, PLAYER_COLORS[slot]!));
  }
  for (const kind of POWERUP_KINDS) add(scene, TEX.powerup(kind), POWERUP_TEX, POWERUP_TEX, POWERUP_DRAW[kind]!);
  add(scene, TEX.oil, OIL_TEX, OIL_TEX, drawOilPuddle);
}

function add(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): void {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext('2d')!, w, h);
  scene.textures.addCanvas(key, canvas);
}

const css = (color: number, alpha = 1) =>
  `rgba(${(color >> 16) & 255},${(color >> 8) & 255},${color & 255},${alpha})`;

/** Mixes a color toward white (amount > 0) or black (amount < 0). */
function shade(color: number, amount: number): number {
  const mix = (c: number) => Math.round(amount >= 0 ? c + (255 - c) * amount : c * (1 + amount));
  return (mix((color >> 16) & 255) << 16) | (mix((color >> 8) & 255) << 8) | mix(color & 255);
}

function glow(g: CanvasRenderingContext2D, r: number, inner: string, outer: string): void {
  const grad = g.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, r * 2, r * 2);
}

/** Diamond-plate metal floor: riveted plates with raised tread marks, darker toward the edge. */
function drawFloor(g: CanvasRenderingContext2D, w: number): void {
  const r = w / 2;
  g.save();
  g.beginPath();
  g.arc(r, r, r, 0, Math.PI * 2);
  g.clip();
  const base = g.createRadialGradient(r, r * 0.8, r * 0.1, r, r, r);
  base.addColorStop(0, '#6b7486');
  base.addColorStop(0.7, '#4d5566');
  base.addColorStop(1, '#353b49');
  g.fillStyle = base;
  g.fillRect(0, 0, w, w);

  // Tread: short slanted ridges in alternating directions, a highlight and a shadow each.
  const step = 16;
  for (let y = 0; y < w; y += step) {
    for (let x = 0; x < w; x += step) {
      const flip = ((x + y) / step) % 2 === 0;
      const cx = x + step / 2;
      const cy = y + step / 2;
      const dx = flip ? 4 : -4;
      g.strokeStyle = 'rgba(255,255,255,0.12)';
      g.lineWidth = 2;
      g.beginPath();
      g.moveTo(cx - dx, cy - 4);
      g.lineTo(cx + dx, cy + 4);
      g.stroke();
      g.strokeStyle = 'rgba(0,0,0,0.18)';
      g.beginPath();
      g.moveTo(cx - dx + 1, cy - 3);
      g.lineTo(cx + dx + 1, cy + 5);
      g.stroke();
    }
  }

  // Plate seams and rivets.
  const plate = 120;
  g.strokeStyle = 'rgba(20,24,32,0.55)';
  g.lineWidth = 2;
  for (let p = plate; p < w; p += plate) {
    g.beginPath();
    g.moveTo(p, 0);
    g.lineTo(p, w);
    g.moveTo(0, p);
    g.lineTo(w, p);
    g.stroke();
  }
  for (let y = plate; y < w; y += plate) {
    for (let x = plate; x < w; x += plate) {
      for (const [ox, oy] of [[-7, -7], [7, -7], [-7, 7], [7, 7]] as const) {
        g.fillStyle = 'rgba(15,18,25,0.6)';
        g.beginPath();
        g.arc(x + ox + 1, y + oy + 1, 2.4, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = 'rgba(210,220,235,0.55)';
        g.beginPath();
        g.arc(x + ox, y + oy, 2, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  // Worn ring where the cars usually drive, and the edge in shadow.
  const wear = g.createRadialGradient(r, r, r * 0.25, r, r, r);
  wear.addColorStop(0, 'rgba(0,0,0,0)');
  wear.addColorStop(0.85, 'rgba(0,0,0,0.08)');
  wear.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = wear;
  g.fillRect(0, 0, w, w);
  g.restore();
}

/** Red and white rubber rim around the floor. */
function drawRim(g: CanvasRenderingContext2D, w: number): void {
  const c = w / 2;
  const outer = c - 1;
  const inner = ARENA_R;
  const segments = 36;
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    g.fillStyle = i % 2 === 0 ? '#c8283a' : '#f1ece4';
    g.beginPath();
    g.arc(c, c, outer, a0, a1);
    g.arc(c, c, inner, a1, a0, true);
    g.closePath();
    g.fill();
  }
  // Rounded look: light on the inner edge, shadow on the outer one.
  const shine = g.createRadialGradient(c, c, inner, c, c, outer);
  shine.addColorStop(0, 'rgba(255,255,255,0.25)');
  shine.addColorStop(0.4, 'rgba(255,255,255,0)');
  shine.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = shine;
  g.beginPath();
  g.arc(c, c, outer, 0, Math.PI * 2);
  g.arc(c, c, inner, 0, Math.PI * 2, true);
  g.fill();
  g.strokeStyle = '#1a0f1e';
  g.lineWidth = 2;
  for (const rad of [outer, inner]) {
    g.beginPath();
    g.arc(c, c, rad, 0, Math.PI * 2);
    g.stroke();
  }
}

function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

/**
 * A bumper car seen from above, facing +x (heading 0): thick rubber bumper, colored shell with a
 * stripe and headlights, the driver in a seat, and the base of the antenna pole at the back.
 */
function drawCar(g: CanvasRenderingContext2D, color: number): void {
  const c = CAR_TEX / 2;
  g.translate(c, c);
  const r = CAR_R;

  // Rubber bumper all around.
  g.fillStyle = '#17141c';
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.18)';
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, r - 2, Math.PI * 1.1, Math.PI * 1.7);
  g.stroke();

  // Shell.
  const shell = g.createLinearGradient(-r, -r, r, r);
  shell.addColorStop(0, css(shade(color, 0.35)));
  shell.addColorStop(0.55, css(color));
  shell.addColorStop(1, css(shade(color, -0.35)));
  g.fillStyle = shell;
  roundRect(g, -r + 5, -r + 6, 2 * r - 8, 2 * r - 12, 10);
  g.fill();
  g.strokeStyle = css(shade(color, -0.55));
  g.lineWidth = 1.5;
  g.stroke();

  // Hood stripe and headlights.
  g.fillStyle = 'rgba(255,255,255,0.85)';
  roundRect(g, 6, -3, r - 9, 6, 3);
  g.fill();
  g.fillStyle = '#fff6c2';
  for (const y of [-r + 10, r - 10]) {
    g.beginPath();
    g.arc(r - 6, y, 2.6, 0, Math.PI * 2);
    g.fill();
  }

  // Seat and driver.
  g.fillStyle = '#2b2233';
  roundRect(g, -r + 7, -10, 13, 20, 5);
  g.fill();
  g.fillStyle = '#f2c48d';
  g.beginPath();
  g.arc(-3, 0, 6, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#4a2c1a';
  g.beginPath();
  g.arc(-4.5, 0, 6, Math.PI * 0.55, Math.PI * 1.45);
  g.fill();
  // Steering wheel.
  g.strokeStyle = '#111';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(6, 0, 4, -Math.PI / 2, Math.PI / 2);
  g.stroke();

  // Antenna pole base at the back.
  g.fillStyle = '#c9c9d6';
  g.beginPath();
  g.arc(-r + 5, 0, 3, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#555';
  g.beginPath();
  g.arc(-r + 5, 0, 1.4, 0, Math.PI * 2);
  g.fill();
}
