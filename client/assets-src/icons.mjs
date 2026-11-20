// Draws the link preview (og.png) and the favicons from code, in the game's style, and writes
// them to client/public. Run with `npm run og` (from the repo root or client/).
//
// Everything is plain SVG rendered by resvg; text uses the system's bold sans-serif fonts.

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');

// Same palette as the game (shared/src/constants.ts PLAYER_COLORS, ui/backdrop.ts, screens.css .title).
const NIGHT = '#120a24';
const SKY = ['#0c0620', '#1d0d3a', '#3a1240'];
const TEXT = '#fff4d6';
const OUTLINE = '#2a0f1f';
const TITLE_COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff'];
const BULB_COLORS = ['#ff4d6d', '#ffd166', '#06d6a0', '#4cc9f0', '#c77dff'];
const CAR_COLORS = ['#e63946', '#4cc9f0', '#ffd60a', '#52b788', '#c77dff', '#ff8c42'];
const FONT = "'Arial Black', 'Segoe UI Black', 'Helvetica Neue', Arial, sans-serif";

/** Seeded so the picture is the same every time it is regenerated. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lighter (amount > 0) or darker (amount < 0) version of a #rrggbb color. */
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v) => Math.round(amount >= 0 ? v + (255 - v) * amount : v * (1 + amount));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
}

let gradientId = 0;

/**
 * A bumper car seen from above as in the game (render/textures.ts drawCar, radius 22), facing +x
 * before `angle` (degrees): rubber bumper, colored shell with stripe and headlights, driver, antenna spark.
 */
function car(x, y, scale, angle, color) {
  const r = 22;
  const id = `shell${gradientId++}`;
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${scale})">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${shade(color, 0.35)}"/><stop offset="0.55" stop-color="${color}"/><stop offset="1" stop-color="${shade(color, -0.35)}"/>
    </linearGradient></defs>
    <ellipse cx="3" cy="5" rx="${r + 1}" ry="${r}" fill="#000" opacity="0.35"/>
    <circle r="${r}" fill="#17141c"/>
    <rect x="${-r + 5}" y="${-r + 6}" width="${2 * r - 8}" height="${2 * r - 12}" rx="10" fill="url(#${id})" stroke="${shade(color, -0.55)}" stroke-width="1.5"/>
    <rect x="6" y="-3" width="${r - 9}" height="6" rx="3" fill="#fff" opacity="0.85"/>
    <circle cx="${r - 6}" cy="${-r + 10}" r="2.6" fill="#fff6c2"/><circle cx="${r - 6}" cy="${r - 10}" r="2.6" fill="#fff6c2"/>
    <rect x="${-r + 7}" y="-10" width="13" height="20" rx="5" fill="#2b2233"/>
    <circle cx="-3" cy="0" r="6" fill="#f2c48d"/>
    <path d="M-6.4 -5.4 A6 6 0 0 0 -6.4 5.4 L-4.5 0 Z" fill="#4a2c1a"/>
    <path d="M6 -4 A4 4 0 0 1 6 4" stroke="#111" stroke-width="2" fill="none"/>
    <circle cx="${-r + 5}" cy="0" r="9" fill="url(#glow)"/>
    <circle cx="${-r + 5}" cy="0" r="3.2" fill="#c9c9d6"/><circle cx="${-r + 5}" cy="0" r="1.8" fill="#ffe066"/>
  </g>`;
}

/** The yellow-white burst of a hit. */
function spark(x, y, size) {
  let rays = '';
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + 0.2;
    const len = size * (i % 2 ? 0.6 : 1);
    rays += `<line x1="${(x + Math.cos(a) * size * 0.25).toFixed(1)}" y1="${(y + Math.sin(a) * size * 0.25).toFixed(1)}" x2="${(x + Math.cos(a) * len).toFixed(1)}" y2="${(y + Math.sin(a) * len).toFixed(1)}"/>`;
  }
  return `<circle cx="${x}" cy="${y}" r="${size * 0.9}" fill="url(#glow)"/>
    <g stroke="#ffd166" stroke-width="${(size / 9).toFixed(1)}" stroke-linecap="round">${rays}</g>
    <circle cx="${x}" cy="${y}" r="${(size * 0.22).toFixed(1)}" fill="#fffbe8"/>`;
}

/** A sagging string of colored bulbs from (x1, y1) to (x2, y2). */
function garland(x1, y1, x2, y2, sag, count, offset = 0) {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2 + sag * 2;
  let bulbs = '';
  for (let i = 1; i < count; i++) {
    const t = i / count;
    const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t ** 2 * x2;
    const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t ** 2 * y2;
    const color = BULB_COLORS[(i + offset) % BULB_COLORS.length];
    bulbs += `<circle cx="${x.toFixed(1)}" cy="${(y + 7).toFixed(1)}" r="16" fill="${color}" opacity="0.22"/>
      <circle cx="${x.toFixed(1)}" cy="${(y + 7).toFixed(1)}" r="6.5" fill="${color}"/>
      <circle cx="${(x - 2).toFixed(1)}" cy="${(y + 5).toFixed(1)}" r="2" fill="#fff" opacity="0.7"/>`;
  }
  return `<path d="M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}" stroke="#0a0614" stroke-width="2.5" fill="none"/>${bulbs}`;
}

/** Ferris wheel silhouette, as on the menu backdrop. */
function ferrisWheel(x, y, r) {
  let spokes = '';
  let gondolas = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const gx = x + Math.cos(a) * r;
    const gy = y + Math.sin(a) * r;
    spokes += `<line x1="${x}" y1="${y}" x2="${gx.toFixed(1)}" y2="${gy.toFixed(1)}"/>`;
    gondolas += `<rect x="${(gx - 11).toFixed(1)}" y="${(gy - 4).toFixed(1)}" width="22" height="15" rx="3" fill="${BULB_COLORS[i % 5]}" opacity="0.45" stroke="#1a0f2e" stroke-width="2"/>`;
  }
  return `<g opacity="0.85">
    <g stroke="#1a0f2e" stroke-width="8"><line x1="${x}" y1="${y}" x2="${x - r * 0.55}" y2="${y + r * 1.6}"/><line x1="${x}" y1="${y}" x2="${x + r * 0.55}" y2="${y + r * 1.6}"/></g>
    <g stroke="#2a1748" stroke-width="3" fill="none">${spokes}<circle cx="${x}" cy="${y}" r="${r}" stroke-width="5"/><circle cx="${x}" cy="${y}" r="${r * 0.82}"/></g>
    ${gondolas}
    <circle cx="${x}" cy="${y}" r="12" fill="#2a1748"/>
  </g>`;
}

/** The arena as in the game, seen from above: diamond-plate floor, red/white rubber rim, chasing bulbs. */
function arena(cx, cy, r, rim) {
  const segments = 36;
  let rimSegs = '';
  for (let i = 0; i < segments; i++) {
    const a0 = (i / segments) * Math.PI * 2;
    const a1 = ((i + 1) / segments) * Math.PI * 2;
    const p = (rad, a) => `${(cx + Math.cos(a) * rad).toFixed(1)} ${(cy + Math.sin(a) * rad).toFixed(1)}`;
    const R = r + rim;
    rimSegs += `<path d="M${p(R, a0)} A${R} ${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 0 0 ${p(r, a0)} Z" fill="${i % 2 ? '#f1ece4' : '#c8283a'}"/>`;
  }
  let bulbs = '';
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const x = cx + Math.cos(a) * (r + rim / 2);
    const y = cy + Math.sin(a) * (r + rim / 2);
    const on = i % 3 !== 0;
    bulbs += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${on ? 13 : 0}" fill="#ffd166" opacity="0.3"/>
      <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4.5" fill="${on ? '#fff3b0' : '#7a6a3a'}"/>`;
  }
  return `<circle cx="${cx}" cy="${cy}" r="${r + rim + 30}" fill="url(#halo)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#floor)"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#plate)" opacity="0.5"/>
    ${rimSegs}
    <circle cx="${cx}" cy="${cy}" r="${r + rim}" fill="none" stroke="#1a0f1e" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#1a0f1e" stroke-width="3"/>
    <circle cx="${cx}" cy="${cy}" r="${r + 2}" fill="none" stroke="#fff" stroke-width="3" opacity="0.18"/>
    ${bulbs}`;
}

/** Title in the game's colored letters, glow and dark outline (screens.css .title). */
function title(text, x, y, size) {
  // Every letter its own tspan, colored in turn like the menu title (spaces don't count).
  let i = 0;
  const spans = [...text].map((ch) => (ch === ' ' ? ' ' : `<tspan fill="${TITLE_COLORS[i++ % 5]}">${ch}</tspan>`)).join('');
  const attrs = `x="${x}" y="${y}" text-anchor="middle" font-family="${FONT}" font-weight="900" font-size="${size}" letter-spacing="2"`;
  return `<text ${attrs} fill="${OUTLINE}" transform="translate(0 7)">${text}</text>
    <text ${attrs} filter="url(#textGlow)">${spans}</text>
    <text ${attrs} stroke="${OUTLINE}" stroke-width="10" stroke-linejoin="round" paint-order="stroke">${spans}</text>`;
}

function ogSvg() {
  const W = 1200;
  const H = 630;
  const rand = rng(2026);
  let stars = '';
  for (let i = 0; i < 80; i++) {
    stars += `<circle cx="${(rand() * W).toFixed(0)}" cy="${(rand() * 380).toFixed(0)}" r="${(0.7 + rand() * 1.5).toFixed(1)}" fill="#fff4d6" opacity="${(0.3 + rand() * 0.6).toFixed(2)}"/>`;
  }

  // The ring: centered below the title, its lower part cut by the bottom edge.
  const cx = W / 2;
  const cy = 610;
  const r = 300;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${SKY[0]}"/><stop offset="0.55" stop-color="${SKY[1]}"/><stop offset="1" stop-color="${SKY[2]}"/>
    </linearGradient>
    <radialGradient id="floor" cx="0.5" cy="0.45" r="0.6">
      <stop offset="0" stop-color="#6b7486"/><stop offset="0.7" stop-color="#4d5566"/><stop offset="1" stop-color="#353b49"/>
    </radialGradient>
    <pattern id="plate" width="34" height="34" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect x="6" y="14" width="18" height="5" rx="2.5" fill="#0f1219" opacity="0.6"/>
      <rect x="6" y="13" width="18" height="2" rx="1" fill="#d2dceb" opacity="0.45"/>
      <rect x="23" y="-3" width="5" height="18" rx="2.5" fill="#0f1219" opacity="0.6"/>
      <rect x="22" y="-3" width="2" height="18" rx="1" fill="#d2dceb" opacity="0.45"/>
    </pattern>
    <radialGradient id="halo">
      <stop offset="0.8" stop-color="#ffd166" stop-opacity="0.22"/><stop offset="1" stop-color="#ffd166" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="glow">
      <stop offset="0" stop-color="#fff3b0" stop-opacity="0.95"/><stop offset="1" stop-color="#ffb703" stop-opacity="0"/>
    </radialGradient>
    <mask id="crescent"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="1014" cy="166" r="27" fill="#000"/></mask>
    <filter id="textGlow" x="-20%" y="-50%" width="140%" height="200%"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#sky)"/>
  ${stars}
  <circle cx="1000" cy="175" r="30" fill="#fff6d5" mask="url(#crescent)"/>
  ${ferrisWheel(118, 300, 140)}
  ${ferrisWheel(1090, 330, 105)}
  ${garland(-20, -6, 330, -10, 14, 8)}
  ${garland(870, -10, 1220, -4, 14, 8, 2)}

  ${title('Mașinuțe de Bâlci', W / 2, 138, 96)}
  <text x="${W / 2}" y="204" text-anchor="middle" font-family="${FONT}" font-weight="700" font-size="34"
    fill="${TEXT}" stroke="${NIGHT}" stroke-width="6" paint-order="stroke">Joc multiplayer · până la 6 prieteni</text>

  ${arena(cx, cy, r, 26)}
  ${car(cx - 150, cy - 140, 2.2, 20, CAR_COLORS[0])}
  ${car(cx - 40, cy - 205, 2.2, 160, CAR_COLORS[1])}
  ${spark(cx - 98, cy - 186, 46)}
  ${car(cx + 150, cy - 150, 2.2, -150, CAR_COLORS[2])}
  ${car(cx + 260, cy - 60, 2.1, -105, CAR_COLORS[3])}
  ${car(cx + 60, cy - 70, 2.1, -40, CAR_COLORS[4])}
  ${car(cx - 255, cy - 30, 2.1, -70, CAR_COLORS[5])}
</svg>`;
}

/** The favicon: one bumper car from above on the game's night purple (reads at 16x16). */
function faviconSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="${NIGHT}"/>
  <circle cx="32" cy="34" r="24" fill="#17141c"/>
  <rect x="13" y="17" width="38" height="34" rx="12" fill="#e63946"/>
  <rect x="34" y="31" width="14" height="6" rx="3" fill="#fff"/>
  <circle cx="26" cy="34" r="7" fill="#f2c48d"/>
  <path d="M19 34a7 7 0 0 1 7-7v14a7 7 0 0 1-7-7z" fill="#4a2c1a"/>
  <line x1="14" y1="34" x2="10" y2="6" stroke="#c9c9d6" stroke-width="2.5"/>
  <circle cx="10" cy="6" r="4" fill="#ffe066"/>
</svg>`;
}

function png(svg, width) {
  return new Resvg(svg, { fitTo: { mode: 'width', value: width }, font: { loadSystemFonts: true } }).render().asPng();
}

mkdirSync(OUT, { recursive: true });
const write = (name, data) => {
  writeFileSync(join(OUT, name), data);
  console.log(`${name.padEnd(22)} ${(data.length / 1024).toFixed(1)} KB`);
};
const favicon = faviconSvg();
write('og.png', png(ogSvg(), 1200));
write('favicon.svg', favicon);
write('favicon-32.png', png(favicon, 32));
write('apple-touch-icon.png', png(favicon.replace('rx="14"', 'rx="0"'), 180)); // iOS rounds the corners itself
write('icon-512.png', png(favicon, 512));
