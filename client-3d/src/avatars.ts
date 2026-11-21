import { PLAYER_COLORS } from '@masinute/shared';

const SIZE = 64;
const cache = new Map<number, string>();

/** The lobby rows' little car (the 2D client bakes these from its sprites): a top view drawn on a canvas. */
export function carAvatar(slot: number): string {
  let url = cache.get(slot);
  if (url) return url;
  const c = document.createElement('canvas');
  c.width = c.height = SIZE;
  const g = c.getContext('2d')!;
  const color = '#' + PLAYER_COLORS[slot % PLAYER_COLORS.length]!.toString(16).padStart(6, '0');
  const mid = SIZE / 2;
  // Rubber bumper, body, hood, seat and driver, nose to the right.
  g.fillStyle = '#1d1a22';
  g.beginPath();
  g.arc(mid, mid, 29, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = color;
  g.beginPath();
  g.arc(mid, mid, 24, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.3)';
  g.fillRect(mid + 4, mid - 12, 14, 24);
  g.fillStyle = '#2a1630';
  g.fillRect(mid - 20, mid - 13, 9, 26);
  g.fillStyle = '#f2c79b';
  g.beginPath();
  g.arc(mid - 4, mid, 7, 0, Math.PI * 2);
  g.fill();
  url = c.toDataURL();
  cache.set(slot, url);
  return url;
}
