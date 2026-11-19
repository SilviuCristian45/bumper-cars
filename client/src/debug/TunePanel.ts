import { DEFAULT_TUNING, FP, TICK_RATE, TUNING, setTuning, type Tuning } from '@masinute/shared';
import { load, save } from '../storage';
import { el } from '../ui/dom';

// ?tune (local games only): sliders for the driving-feel constants, applied live to the
// simulation, remembered in this browser, and copied as text to send back. Online the server's
// numbers rule, so the panel is never offered there.

interface Spec {
  key: keyof Tuning;
  /** Constant name in shared/src/constants.ts. */
  constant: string;
  label: string;
  min: number;
  max: number;
  step: number;
  /** Extra readable unit next to the raw value. */
  unit?: (v: number) => string;
}

const pxPerSecond = (v: number) => `${Math.round((v * TICK_RATE) / FP)} px/s`;
const pxPerSecond2 = (v: number) => `${Math.round((v * TICK_RATE * TICK_RATE) / FP)} px/s²`;
const degPerSecond = (v: number) => `${Math.round((v * 360 * TICK_RATE) / 1024)}°/s`;
const perMille = (v: number) => `${(v / 10).toFixed(1)}%/tick`;

const SPECS: Spec[] = [
  { key: 'accel', constant: 'ACCEL', label: 'Accelerație', min: 30, max: 300, step: 5, unit: pxPerSecond2 },
  { key: 'brake', constant: 'BRAKE', label: 'Frână', min: 50, max: 500, step: 10, unit: pxPerSecond2 },
  { key: 'maxSpeed', constant: 'MAX_SPEED', label: 'Viteză maximă', min: 800, max: 3500, step: 20, unit: pxPerSecond },
  { key: 'friction', constant: 'FRICTION', label: 'Frecare (rulare)', min: 5, max: 80, step: 1, unit: perMille },
  { key: 'grip', constant: 'GRIP', label: 'Aderență laterală', min: 20, max: 400, step: 5, unit: perMille },
  { key: 'gripHit', constant: 'GRIP_HIT', label: 'Aderență după lovitură', min: 5, max: 200, step: 5, unit: perMille },
  { key: 'turnStill', constant: 'TURN_STILL', label: 'Viraj pe loc', min: 2, max: 30, step: 1, unit: degPerSecond },
  { key: 'turnMoving', constant: 'TURN_MOVING', label: 'Viraj în mers', min: 4, max: 40, step: 1, unit: degPerSecond },
  { key: 'restitution', constant: 'RESTITUTION', label: 'Restituție (elasticitate)', min: 0, max: 100, step: 1, unit: (v) => `${v}%` },
  { key: 'boostAccel', constant: 'BOOST_ACCEL', label: 'Putere boost', min: 100, max: 1200, step: 10, unit: pxPerSecond2 },
  { key: 'boostMaxSpeed', constant: 'BOOST_MAX_SPEED', label: 'Viteză maximă boost', min: 1500, max: 6000, step: 20, unit: pxPerSecond },
  { key: 'boostMass', constant: 'BOOST_MASS', label: 'Masă în boost (normal 100)', min: 100, max: 400, step: 10 },
];

const STORAGE_KEY = 'tune';

/** The values saved by an earlier ?tune session in this browser (applied by applyGameTuning). */
export function savedTuning(): Partial<Tuning> | null {
  try {
    const saved = load(STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Partial<Tuning>) : null;
  } catch {
    return null; // ignore a corrupt entry
  }
}

export class TunePanel {
  private readonly root: HTMLElement;
  private readonly inputs = new Map<keyof Tuning, { range: HTMLInputElement; value: HTMLElement }>();
  private readonly status: HTMLElement;

  constructor() {
    const rows = SPECS.map((spec) => {
      const range = el('input', {
        attrs: { type: 'range', min: String(spec.min), max: String(spec.max), step: String(spec.step) },
      });
      const value = el('span', { class: 'tune-value' });
      range.addEventListener('input', () => {
        setTuning({ [spec.key]: Number(range.value) });
        this.persist();
        this.refresh();
      });
      // Arrow keys belong to the car: give the focus back as soon as the slider is let go.
      range.addEventListener('change', () => range.blur());
      range.addEventListener('pointerup', () => range.blur());
      this.inputs.set(spec.key, { range, value });
      return el('label', { class: 'tune-row' }, [el('span', { class: 'tune-label', text: spec.label }), value, range]);
    });
    this.status = el('span', { class: 'tune-status' });
    const toggle = el('button', {
      class: 'tune-toggle',
      text: 'Reglaje',
      attrs: { type: 'button' },
      onClick: () => this.root.classList.toggle('collapsed'),
    });
    this.root = el('aside', { class: 'tune-panel' }, [
      toggle,
      el('div', { class: 'tune-body' }, [
        el('h2', { text: 'Reglaje condus' }),
        ...rows,
        el('div', { class: 'tune-actions' }, [
          el('button', { text: 'Copiază valorile', attrs: { type: 'button' }, onClick: () => void this.copy() }),
          el('button', { text: 'Implicit', attrs: { type: 'button' }, onClick: () => this.reset() }),
        ]),
        this.status,
      ]),
    ]);
    // Clicks on buttons must not keep the focus either (Space would press them again).
    this.root.addEventListener('click', (e) => {
      if (e.target instanceof HTMLButtonElement) e.target.blur();
    });
    document.body.append(this.root);
    this.refresh();
  }

  destroy(): void {
    this.root.remove();
  }

  /** The values as constants, ready to paste into constants.ts (only those that differ are marked). */
  text(): string {
    const lines = SPECS.map((s) => {
      const v = TUNING[s.key];
      const changed = v !== DEFAULT_TUNING[s.key] ? `   // implicit ${DEFAULT_TUNING[s.key]}` : '';
      return `${s.constant} = ${v}${changed}`;
    });
    return ['// Mașinuțe de Bâlci, reglaje ?tune', ...lines].join('\n');
  }

  private async copy(): Promise<void> {
    const text = this.text();
    try {
      await navigator.clipboard.writeText(text);
      this.flash('Copiat!');
    } catch {
      // No clipboard permission (http on a LAN address): show the text to copy by hand.
      window.prompt('Copiază valorile:', text.replaceAll('\n', ' | '));
    }
  }

  private reset(): void {
    setTuning(DEFAULT_TUNING);
    this.persist();
    this.refresh();
    this.flash('Valorile implicite');
  }

  private persist(): void {
    save(STORAGE_KEY, JSON.stringify(TUNING));
  }

  private refresh(): void {
    for (const spec of SPECS) {
      const { range, value } = this.inputs.get(spec.key)!;
      const v = TUNING[spec.key];
      if (Number(range.value) !== v) range.value = String(v);
      const changed = v !== DEFAULT_TUNING[spec.key];
      value.textContent = `${v}${spec.unit ? ` · ${spec.unit(v)}` : ''}`;
      value.classList.toggle('changed', changed);
    }
  }

  private flash(message: string): void {
    this.status.textContent = message;
    window.setTimeout(() => {
      if (this.status.textContent === message) this.status.textContent = '';
    }, 1600);
  }
}
