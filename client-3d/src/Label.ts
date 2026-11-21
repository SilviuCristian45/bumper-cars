import * as THREE from 'three';

const FONT = 'bold 40px "Trebuchet MS", "Segoe UI", Verdana, sans-serif';
const CANVAS_W = 256;
const CANVAS_H = 64;
/** World units across for a label canvas (height follows the canvas' aspect). */
const WORLD_W = 64;

/** A camera-facing text sprite (names over the cars, "zzz"); the texture is redrawn only when the text changes. */
export class Label {
  readonly sprite: THREE.Sprite;
  private readonly canvas = document.createElement('canvas');
  private readonly texture: THREE.CanvasTexture;
  private text = '';

  constructor(
    private readonly color: string,
    scale = 1,
  ) {
    this.canvas.width = CANVAS_W;
    this.canvas.height = CANVAS_H;
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthTest: false, depthWrite: false }));
    this.sprite.scale.set(WORLD_W * scale, ((WORLD_W * CANVAS_H) / CANVAS_W) * scale, 1);
    // Drawn after the scene, never hidden behind a car.
    this.sprite.renderOrder = 10;
  }

  setText(text: string): void {
    if (text === this.text) return;
    this.text = text;
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, CANVAS_W, CANVAS_H);
    g.font = FONT;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    let size = 40;
    while (size > 18 && g.measureText(text).width > CANVAS_W - 12) {
      size -= 2;
      g.font = FONT.replace('40px', `${size}px`);
    }
    g.lineWidth = 7;
    g.strokeStyle = 'rgba(18, 10, 36, 0.9)';
    g.strokeText(text, CANVAS_W / 2, CANVAS_H / 2);
    g.fillStyle = this.color;
    g.fillText(text, CANVAS_W / 2, CANVAS_H / 2);
    this.texture.needsUpdate = true;
  }

  dispose(): void {
    this.texture.dispose();
    this.sprite.material.dispose();
  }
}
