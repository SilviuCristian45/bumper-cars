import Phaser from 'phaser';
import { GAME_H, GAME_W } from '../render/layout';
import { TEX } from '../render/textures';
import { reducedEffects } from '../settings';

// The fair at night behind the HTML screens (intro, name, menu, lobby): a starry sky, a lit Ferris
// wheel, striped tents and garlands of chasing bulbs. "Efecte reduse" keeps the bulbs steady and
// the wheel still. The full atmosphere comes in stage 6.

const BULB_COLORS = [0xff4d6d, 0xffd166, 0x06d6a0, 0x4cc9f0, 0xc77dff];
const CHASE_MS = 140;
const SKY_KEY = 'backdrop-sky';

export function drawBackdrop(scene: Phaser.Scene): void {
  ensureSky(scene);
  scene.add.image(GAME_W / 2, GAME_H / 2, SKY_KEY).setDisplaySize(GAME_W, GAME_H);
  const still = reducedEffects();
  const rnd = new Phaser.Math.RandomDataGenerator(['balci']);

  // Dense enough that a portrait phone, which sees only the middle of the sky, still gets stars.
  for (let i = 0; i < 110; i++) {
    const star = scene.add.circle(rnd.between(0, GAME_W), rnd.between(0, GAME_H * 0.6), rnd.realInRange(0.6, 1.7), 0xfff4d6);
    if (still) continue;
    scene.tweens.add({
      targets: star,
      alpha: { from: rnd.realInRange(0.2, 0.5), to: 1 },
      duration: rnd.between(900, 2600),
      yoyo: true,
      repeat: -1,
      delay: rnd.between(0, 2000),
    });
  }

  const bulbs: Phaser.GameObjects.Image[] = [];
  const bulb = (x: number, y: number, i: number, scale = 0.7) => {
    const image = scene.add
      .image(x, y, TEX.bulb)
      .setTint(BULB_COLORS[i % BULB_COLORS.length]!)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setScale(scale);
    bulbs.push(image);
    return image;
  };

  ferrisWheel(scene, GAME_W * 0.14, GAME_H * 0.56, Math.min(230, GAME_H * 0.3), bulb, still);
  tents(scene);
  // Two sagging garlands across the top.
  garland(scene, -20, 40, GAME_W + 20, 70, 120, bulb);
  garland(scene, -20, 120, GAME_W + 20, 90, 90, bulb);

  if (still) return;
  let step = -1;
  scene.events.on(Phaser.Scenes.Events.UPDATE, (time: number) => {
    const now = Math.floor(time / CHASE_MS);
    if (now === step) return;
    step = now;
    bulbs.forEach((b, i) => b.setAlpha((i + now) % 3 === 0 ? 1 : 0.45));
  });
}

/** Night gradient with a warm glow rising from the fair below. */
function ensureSky(scene: Phaser.Scene): void {
  if (scene.textures.exists(SKY_KEY)) return;
  const tex = scene.textures.createCanvas(SKY_KEY, 256, 256)!;
  const g = tex.getContext();
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, '#0c0620');
  sky.addColorStop(0.55, '#1d0d3a');
  sky.addColorStop(1, '#3a1240');
  g.fillStyle = sky;
  g.fillRect(0, 0, 256, 256);
  const glow = g.createRadialGradient(128, 300, 10, 128, 300, 220);
  glow.addColorStop(0, 'rgba(255,140,60,0.45)');
  glow.addColorStop(1, 'rgba(255,140,60,0)');
  g.fillStyle = glow;
  g.fillRect(0, 0, 256, 256);
  tex.refresh();
}

type AddBulb = (x: number, y: number, i: number, scale?: number) => Phaser.GameObjects.Image;

function garland(scene: Phaser.Scene, x0: number, y0: number, x1: number, sag: number, gap: number, bulb: AddBulb): void {
  const wire = scene.add.graphics().lineStyle(2, 0x0a0614, 0.9);
  const span = x1 - x0;
  const loops = Math.max(1, Math.round(span / 420));
  const loopW = span / loops;
  const at = (x: number) => {
    const t = ((x - x0) % loopW) / loopW;
    return y0 + sag * 4 * t * (1 - t);
  };
  wire.beginPath();
  wire.moveTo(x0, y0);
  for (let x = x0; x <= x1; x += 8) wire.lineTo(x, at(x));
  wire.strokePath();
  let i = 0;
  for (let x = x0 + gap / 2; x < x1; x += gap / 2.4) bulb(x, at(x) + 6, i++, 0.6);
}

function ferrisWheel(scene: Phaser.Scene, cx: number, cy: number, r: number, bulb: AddBulb, still: boolean): void {
  const legs = scene.add.graphics().lineStyle(8, 0x1a0f2e, 1);
  legs.lineBetween(cx, cy, cx - r * 0.55, GAME_H);
  legs.lineBetween(cx, cy, cx + r * 0.55, GAME_H);
  const wheel = scene.add.container(cx, cy);
  const frame = scene.add.graphics();
  frame.lineStyle(5, 0x2a1748, 1).strokeCircle(0, 0, r).strokeCircle(0, 0, r * 0.82);
  frame.lineStyle(3, 0x2a1748, 1);
  const spokes = 12;
  for (let i = 0; i < spokes; i++) {
    const a = (i / spokes) * Math.PI * 2;
    frame.lineBetween(0, 0, Math.cos(a) * r, Math.sin(a) * r);
  }
  frame.fillStyle(0x2a1748, 1).fillCircle(0, 0, 14);
  wheel.add(frame);
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    wheel.add(bulb(Math.cos(a) * r, Math.sin(a) * r, i, 0.55));
  }
  // Gondolas hang from the rim and stay upright while the wheel turns.
  const gondolas = Array.from({ length: spokes }, (_, i) => {
    const gondola = scene.add.rectangle(0, 0, 26, 18, BULB_COLORS[i % BULB_COLORS.length]!, 0.55).setStrokeStyle(2, 0x1a0f2e);
    return { gondola, a: (i / spokes) * Math.PI * 2 };
  });
  const place = (rot: number) => {
    for (const { gondola, a } of gondolas) gondola.setPosition(cx + Math.cos(a + rot) * r, cy + Math.sin(a + rot) * r + 14);
  };
  place(0);
  if (still) return;
  scene.tweens.add({ targets: wheel, rotation: Math.PI * 2, duration: 60000, repeat: -1, onUpdate: () => place(wheel.rotation) });
}

function tents(scene: Phaser.Scene): void {
  const g = scene.add.graphics();
  const tent = (x: number, w: number, h: number, a: number, b: number) => {
    const base = GAME_H;
    const top = base - h;
    const stripes = 6;
    for (let i = 0; i < stripes; i++) {
      g.fillStyle(i % 2 ? a : b, 1);
      const x0 = x - w / 2 + (w / stripes) * i;
      g.fillTriangle(x, top - h * 0.45, x0, top, x0 + w / stripes, top);
      g.fillRect(x0, top, w / stripes, h);
    }
    g.fillStyle(0x0c0620, 0.35).fillRect(x - w / 2, top, w, h);
    g.fillStyle(0xffd166, 1).fillCircle(x, top - h * 0.45 - 6, 5);
  };
  tent(GAME_W * 0.62, 220, 90, 0x8f1d36, 0xd9cbb0);
  tent(GAME_W * 0.86, 280, 120, 0x1d4f8f, 0xd9cbb0);
  tent(GAME_W * 0.4, 160, 60, 0x6b2a8f, 0xd9cbb0);
}
