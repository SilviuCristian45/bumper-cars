import { ANGLE_STEPS, INPUT_MAX, angleDiff, clamp } from '@masinute/shared';
import { el } from '../ui/dom';
import type { DriveContext, DriveInput, InputSource } from './InputSource';

export interface TouchOptions {
  /** Joystick on the right, boost button on the left. */
  leftHanded: boolean;
}

/** No input this close to the middle, as a fraction of the radius. */
const DEAD_ZONE = 0.18;
/** How far the knob travels, as a fraction of the radius. */
const KNOB_TRAVEL = 0.6;
/** Heading error (angle steps) that already means full steer. */
const FULL_STEER_ERROR = 48;
/** Pointing more than this far from the heading: turn mostly on the spot instead of speeding off. */
const TURN_AROUND_ERROR = ANGLE_STEPS / 4;
const TURN_AROUND_THROTTLE = 0.35;

interface Offset {
  dx: number;
  dy: number;
}

/**
 * On-screen controls for phones and tablets (HTML over the canvas), held sideways: an analog
 * joystick on the left (the car turns toward the direction it points to and speeds up with how far
 * it is pushed) and a boost button on the right, showing the cooldown. Every finger is tracked on its own.
 */
export class TouchInput implements InputSource {
  private readonly root: HTMLElement;
  private readonly pad: HTMLElement;
  private readonly knob: HTMLElement;
  private readonly boostBtn: HTMLElement;
  /** Fingers on the pad, oldest first; the newest one steers. */
  private readonly padPointers = new Map<number, Offset>();
  private readonly boostPointers = new Set<number>();
  private boostQueued = false;
  private visible = true;

  constructor(opts: TouchOptions) {
    this.knob = el('div', { class: 'knob' });
    this.pad = el('div', { class: 'touch-pad stick', attrs: { 'aria-label': 'Volan' } }, [this.knob]);
    this.boostBtn = el('div', { class: 'touch-boost ready', attrs: { role: 'button', 'aria-label': 'Boost' } }, [
      el('span', { text: 'BOOST' }),
    ]);
    this.root = el('div', { class: `touch-controls${opts.leftHanded ? ' left-handed' : ''}` }, [this.pad, this.boostBtn]);

    for (const target of [this.pad, this.boostBtn]) {
      // Keeps the touch from scrolling, zooming or reaching the game canvas underneath.
      target.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
      target.addEventListener('contextmenu', (e) => e.preventDefault());
    }
    this.pad.addEventListener('pointerdown', (e) => {
      this.pad.setPointerCapture(e.pointerId);
      this.padPointers.set(e.pointerId, this.offsetOf(e));
      this.refreshKnob();
    });
    this.pad.addEventListener('pointermove', (e) => {
      if (!this.padPointers.has(e.pointerId)) return;
      this.padPointers.set(e.pointerId, this.offsetOf(e));
      this.refreshKnob();
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
      this.pad.addEventListener(type, (e) => {
        if (this.padPointers.delete(e.pointerId)) this.refreshKnob();
      });
      this.boostBtn.addEventListener(type, (e) => {
        this.boostPointers.delete(e.pointerId);
        this.boostBtn.classList.toggle('pressed', this.boostPointers.size > 0);
      });
    }
    this.boostBtn.addEventListener('pointerdown', (e) => {
      this.boostBtn.setPointerCapture(e.pointerId);
      this.boostPointers.add(e.pointerId);
      this.boostBtn.classList.add('pressed');
      if (this.visible) this.boostQueued = true;
    });
    document.body.append(this.root);
  }

  poll(ctx: DriveContext): DriveInput | null {
    const boost = this.boostQueued;
    this.boostQueued = false;
    const stick = this.visible ? this.stick() : null;
    if (!stick) return boost ? { steer: 0, throttle: 0, boost } : null;
    // Steer toward the joystick's direction on screen (the arena is never rotated, so screen = world).
    const target = Math.round((Math.atan2(stick.dy, stick.dx) / (2 * Math.PI)) * ANGLE_STEPS);
    const err = angleDiff(ctx.heading, target);
    const steer = clamp(Math.round((err * INPUT_MAX) / FULL_STEER_ERROR), -INPUT_MAX, INPUT_MAX);
    const push = Math.abs(err) > TURN_AROUND_ERROR ? stick.amount * TURN_AROUND_THROTTLE : stick.amount;
    return { steer, throttle: Math.round(push * INPUT_MAX), boost };
  }

  /** Boost button fill: 0 = just used, 1 = ready. */
  setBoostReady(fraction: number): void {
    const f = clamp(fraction, 0, 1);
    this.boostBtn.style.setProperty('--ready', f.toFixed(3));
    this.boostBtn.classList.toggle('ready', f >= 1);
  }

  /** Shown only while there is something to drive; hiding lets go of everything held. */
  setVisible(visible: boolean): void {
    if (visible === this.visible) return;
    this.visible = visible;
    this.root.classList.toggle('hidden', !visible);
    if (!visible) this.releaseAll();
  }

  releaseAll(): void {
    this.boostQueued = false;
    this.padPointers.clear();
    this.boostPointers.clear();
    this.boostBtn.classList.remove('pressed');
    this.refreshKnob();
  }

  destroy(): void {
    this.root.remove();
  }

  private steeringFinger(): Offset | undefined {
    let last: Offset | undefined;
    for (const p of this.padPointers.values()) last = p;
    return last;
  }

  /** The steering finger's direction and how far it pushes (0..1 past the dead zone), or null. */
  private stick(): (Offset & { amount: number }) | null {
    const last = this.steeringFinger();
    if (!last) return null;
    const len = Math.hypot(last.dx, last.dy);
    if (len < DEAD_ZONE) return null;
    return { ...last, amount: Math.min(1, (len - DEAD_ZONE) / (KNOB_TRAVEL - DEAD_ZONE)) };
  }

  /** Finger offset from the pad's center, in pad radii. */
  private offsetOf(e: PointerEvent): Offset {
    const rect = this.pad.getBoundingClientRect();
    const r = rect.width / 2;
    return { dx: (e.clientX - (rect.left + r)) / r, dy: (e.clientY - (rect.top + r)) / r };
  }

  private refreshKnob(): void {
    const last = this.steeringFinger();
    this.pad.classList.toggle('active', this.stick() !== null);
    if (!last) {
      this.knob.style.transform = '';
      return;
    }
    const r = this.pad.getBoundingClientRect().width / 2;
    const len = Math.hypot(last.dx, last.dy);
    const k = len > KNOB_TRAVEL ? KNOB_TRAVEL / len : 1;
    this.knob.style.transform = `translate(${last.dx * k * r}px, ${last.dy * k * r}px)`;
  }
}
