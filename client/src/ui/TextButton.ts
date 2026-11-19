import Phaser from 'phaser';
import { FONT } from '../render/layout';

export type ButtonVariant = 'primary' | 'secondary';

const COLORS = {
  primary: { bg: '#ffd166', hover: '#ffe39a', text: '#2a0f1f' },
  secondary: { bg: '#3a1f63', hover: '#4d2a80', text: '#fff4d6' },
  disabled: { bg: '#24153d', hover: '#24153d', text: '#6a5a88' },
} as const;

/** Clickable label with hover and disabled states. */
export class TextButton extends Phaser.GameObjects.Text {
  private variant: ButtonVariant;
  private enabled = true;
  private hovered = false;
  /** setWidth: the button keeps this width (label centered), whatever its text. */
  private wantedWidth = 0;
  private padY = 8;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    label: string,
    onClick: () => void,
    variant: ButtonVariant = 'secondary',
    fontSize = 18,
  ) {
    super(scene, x, y, label, { fontFamily: FONT, fontSize: `${fontSize}px`, padding: { x: 14, y: 8 } });
    this.variant = variant;
    this.setOrigin(0.5).setInteractive({ useHandCursor: true });
    this.on('pointerover', () => this.setHovered(true));
    this.on('pointerout', () => this.setHovered(false));
    this.on('pointerdown', () => {
      if (this.enabled) onClick();
    });
    scene.add.existing(this);
    this.refresh();
  }

  setEnabled(enabled: boolean): this {
    if (enabled === this.enabled) return this;
    this.enabled = enabled;
    if (this.input) this.input.cursor = enabled ? 'pointer' : 'default';
    return this.refresh();
  }

  /** A fixed-width button (e.g. a column of equal touch buttons), `padY` above and below the label. */
  setWidth(width: number, padY: number): this {
    this.wantedWidth = width;
    this.padY = padY;
    return this.fit();
  }

  override setText(value: string | string[]): this {
    if (value === this.text) return this;
    super.setText(value);
    // Called by the Text constructor too, before the fields above exist.
    return this.wantedWidth ? this.fit() : this;
  }

  private fit(): this {
    this.setPadding(0, this.padY);
    return this.setPadding(Math.max(0, (this.wantedWidth - this.width) / 2), this.padY);
  }

  setVariant(variant: ButtonVariant): this {
    if (variant === this.variant) return this;
    this.variant = variant;
    return this.refresh();
  }

  private setHovered(hovered: boolean): void {
    this.hovered = hovered;
    this.refresh();
  }

  private refresh(): this {
    const c = this.enabled ? COLORS[this.variant] : COLORS.disabled;
    this.setBackgroundColor(this.hovered ? c.hover : c.bg).setColor(c.text);
    return this;
  }
}
