import { OIL_RADIUS, FP, PU_HORN, PU_LIFEBUOY, PU_MICI, PU_OIL, PU_SPRINGS, PU_TUICA } from '@masinute/shared';

// The power-up icons and the oil puddle, drawn with the 2D canvas API like every other texture.
// Each icon sits on a dark round token with a colored rim, so it reads on the metal floor.

/** Icon textures are this many pixels square. */
export const POWERUP_TEX = 52;
/** The puddle texture is drawn for the default oil radius and scaled to the live value. */
export const OIL_TEX = Math.ceil((2 * OIL_RADIUS) / FP) + 8;

type Draw = (g: CanvasRenderingContext2D) => void;

export const POWERUP_DRAW: Record<number, Draw> = {
  [PU_HORN]: (g) => {
    token(g, '#ffd166');
    // Two chrome air horns of a lorry, side by side, with sound waves.
    for (const [y, len] of [
      [21, 20],
      [31, 15],
    ] as const) {
      const grad = g.createLinearGradient(0, y - 5, 0, y + 5);
      grad.addColorStop(0, '#fff7d6');
      grad.addColorStop(0.5, '#f2c14e');
      grad.addColorStop(1, '#9a6a12');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(13, y - 2);
      g.lineTo(13 + len, y - 6);
      g.lineTo(13 + len, y + 6);
      g.lineTo(13, y + 2);
      g.closePath();
      g.fill();
      g.strokeStyle = '#5a3a06';
      g.lineWidth = 1.2;
      g.stroke();
    }
    g.strokeStyle = '#fff4d6';
    g.lineWidth = 2;
    g.lineCap = 'round';
    for (const r of [5, 10]) {
      g.beginPath();
      g.arc(37, 26, r, -0.7, 0.7);
      g.stroke();
    }
  },
  [PU_MICI]: (g) => {
    token(g, '#e9a23b');
    // Two grilled mici with grill marks and a dollop of mustard.
    for (const [x, y, a] of [
      [24, 21, -0.35],
      [26, 32, 0.2],
    ] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      const grad = g.createLinearGradient(0, -5, 0, 5);
      grad.addColorStop(0, '#c9773a');
      grad.addColorStop(1, '#6b3415');
      g.fillStyle = grad;
      roundRect(g, -12, -5, 24, 10, 5);
      g.fill();
      g.strokeStyle = 'rgba(40,15,5,0.85)';
      g.lineWidth = 1.6;
      for (const gx of [-6, 0, 6]) {
        g.beginPath();
        g.moveTo(gx - 2, -4);
        g.lineTo(gx + 2, 4);
        g.stroke();
      }
      g.restore();
    }
    g.fillStyle = '#ffd60a';
    g.beginPath();
    g.ellipse(37, 17, 5, 4, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.7)';
    g.beginPath();
    g.arc(35.5, 15.5, 1.4, 0, Math.PI * 2);
    g.fill();
  },
  [PU_LIFEBUOY]: (g) => {
    token(g, '#ff5d5d');
    // A red and white lifebuoy ring.
    const c = POWERUP_TEX / 2;
    for (let i = 0; i < 8; i++) {
      g.fillStyle = i % 2 === 0 ? '#e63946' : '#f8f4ec';
      g.beginPath();
      g.arc(c, c, 15, (i * Math.PI) / 4, ((i + 1) * Math.PI) / 4);
      g.arc(c, c, 8, ((i + 1) * Math.PI) / 4, (i * Math.PI) / 4, true);
      g.closePath();
      g.fill();
    }
    g.strokeStyle = '#3a0f14';
    g.lineWidth = 1.2;
    for (const r of [15, 8]) {
      g.beginPath();
      g.arc(c, c, r, 0, Math.PI * 2);
      g.stroke();
    }
  },
  [PU_OIL]: (g) => {
    // A light token: the black oil has to stand out.
    token(g, '#9b7bd8', '#d9d2c6');
    // A glossy black oil drop over a little puddle with a rainbow sheen.
    puddleShape(g, 26, 36, 13, 5);
    g.fillStyle = '#121016';
    g.fill();
    g.fillStyle = 'rgba(130,90,220,0.45)';
    g.beginPath();
    g.ellipse(22, 35, 5, 1.6, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#18141f';
    g.beginPath();
    g.moveTo(26, 9);
    g.bezierCurveTo(33, 19, 35, 23, 35, 26);
    g.arc(26, 26, 9, 0, Math.PI);
    g.bezierCurveTo(17, 23, 19, 19, 26, 9);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.beginPath();
    g.ellipse(22.5, 24, 2, 3.5, -0.4, 0, Math.PI * 2);
    g.fill();
  },
  [PU_TUICA]: (g) => {
    token(g, '#7f5af0');
    // A small glass bottle of plum brandy with a label and a cork.
    g.fillStyle = 'rgba(220,235,255,0.35)';
    roundRect(g, 18, 17, 16, 24, 5);
    g.fill();
    g.fillRect(23, 9, 6, 9);
    g.fillStyle = '#8e3fb8';
    roundRect(g, 19, 25, 14, 15, 4);
    g.fill();
    // The label: a plum with its leaf.
    g.fillStyle = '#f6e7c1';
    g.fillRect(19, 26, 14, 9);
    g.fillStyle = '#5b2a86';
    g.beginPath();
    g.arc(26, 31, 3.2, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#3f9b4a';
    g.beginPath();
    g.ellipse(28.5, 27.6, 2.2, 1.1, -0.6, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#b07a46';
    g.fillRect(23, 6, 6, 4);
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.4;
    g.beginPath();
    g.moveTo(21, 19);
    g.lineTo(21, 24);
    g.stroke();
  },
  [PU_SPRINGS]: (g) => {
    token(g, '#4cc9f0');
    // A bumper bar on a big coil spring.
    g.strokeStyle = '#d7dde8';
    g.lineWidth = 3;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(26, 40);
    for (let i = 0; i < 6; i++) g.lineTo(i % 2 === 0 ? 17 : 35, 37 - i * 3.6);
    g.lineTo(26, 16);
    g.stroke();
    g.strokeStyle = 'rgba(80,90,110,0.9)';
    g.lineWidth = 1;
    g.stroke();
    g.fillStyle = '#e63946';
    roundRect(g, 12, 10, 28, 7, 3.5);
    g.fill();
    g.fillStyle = 'rgba(255,255,255,0.45)';
    g.fillRect(15, 11, 22, 2);
    g.fillStyle = '#2b2233';
    g.fillRect(19, 40, 14, 3);
  },
};

/** The slick, irregular puddle left on the floor (drawn for OIL_RADIUS). */
export function drawOilPuddle(g: CanvasRenderingContext2D): void {
  const c = OIL_TEX / 2;
  const r = OIL_RADIUS / FP;
  puddleShape(g, c, c, r, r * 0.86);
  const grad = g.createRadialGradient(c - r * 0.2, c - r * 0.2, r * 0.1, c, c, r);
  grad.addColorStop(0, 'rgba(40,34,50,0.92)');
  grad.addColorStop(0.75, 'rgba(14,12,20,0.9)');
  grad.addColorStop(1, 'rgba(8,6,12,0.75)');
  g.fillStyle = grad;
  g.fill();
  // Rainbow sheen and a couple of highlights.
  for (const [dx, dy, rx, ry, color] of [
    [-0.25, -0.2, 0.42, 0.13, 'rgba(120,90,230,0.35)'],
    [0.15, 0.1, 0.35, 0.1, 'rgba(60,200,190,0.25)'],
    [-0.05, 0.3, 0.3, 0.08, 'rgba(230,180,60,0.22)'],
  ] as const) {
    g.fillStyle = color;
    g.beginPath();
    g.ellipse(c + dx * r, c + dy * r, rx * r, ry * r, -0.4, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(c - r * 0.35, c - r * 0.35, r * 0.12, r * 0.05, -0.6, 0, Math.PI * 2);
  g.fill();
}

/** Round token (dark unless `inner` says otherwise) with a colored rim and a soft glow, under every icon. */
function token(g: CanvasRenderingContext2D, rim: string, inner = '#1a1028'): void {
  const c = POWERUP_TEX / 2;
  const halo = g.createRadialGradient(c, c, 18, c, c, c);
  halo.addColorStop(0, rim);
  halo.addColorStop(1, 'rgba(0,0,0,0)');
  g.globalAlpha = 0.55;
  g.fillStyle = halo;
  g.fillRect(0, 0, POWERUP_TEX, POWERUP_TEX);
  g.globalAlpha = 1;
  g.fillStyle = inner;
  g.beginPath();
  g.arc(c, c, 21, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = rim;
  g.lineWidth = 3;
  g.stroke();
}

/** A blobby closed path (a puddle), the same every time. */
function puddleShape(g: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number): void {
  const bumps = [1, 0.86, 1.06, 0.9, 1.02, 0.84, 0.98, 0.92];
  g.beginPath();
  for (let i = 0; i <= bumps.length; i++) {
    const a = (i / bumps.length) * Math.PI * 2;
    const k = bumps[i % bumps.length]!;
    const x = cx + Math.cos(a) * rx * k;
    const y = cy + Math.sin(a) * ry * k;
    if (i === 0) g.moveTo(x, y);
    else {
      const am = ((i - 0.5) / bumps.length) * Math.PI * 2;
      const km = (k + bumps[(i - 1) % bumps.length]!) / 2 + 0.08;
      g.quadraticCurveTo(cx + Math.cos(am) * rx * km, cy + Math.sin(am) * ry * km, x, y);
    }
  }
  g.closePath();
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
