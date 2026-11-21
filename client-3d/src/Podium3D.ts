import * as THREE from 'three';
import { computeAwards, computeStandings, PLAYER_COLORS, type GameState, type NewRecord } from '@masinute/shared';
import { isTouch } from '@client/device';
import { hexColor } from '@client/render/powerupInfo';
import { reducedEffects } from '@client/settings';
import { el } from '@client/ui/el';
import { button, setText } from '@client/ui/html';
import { AWARD_TEXT, recordsLine } from '@client/ui/matchEnd';
import { carGeometry } from './Car';
import { Label } from './Label';
import type { Quality } from './settings3d';
import { glowDot } from './textures';

// The end of the match in 3D (the 2D client's ui/Podium.ts, same order and texts): the steps rise in the
// middle of the ring one after the other (third, second, then the winner), each car lands on its step,
// fireworks in the winner's color; then the match table and the awards in an HTML panel (texts from
// ui/matchEnd.ts), with the host's "back to the lobby" or a new local match.

/** Index = place - 1: x and step height. */
const STEPS = [
  { x: 0, h: 46 },
  { x: -66, h: 32 },
  { x: 66, h: 22 },
];
const STEP_W = 60;
const STEP_D = 56;
/** Seconds: third rises first, then second, then first (as in 2D). */
const RISE_AT = [2.0, 1.1, 0.3];
const RISE_TIME = 0.65;
const LAND_TIME = 0.4;
const PANEL_AT = 3.0;
const FIREWORK_PARTICLES = 70;

export interface PodiumOptions {
  me: string;
  online: boolean;
  /** Test URL options: no offline note, the button starts a new local match. */
  testMatch: boolean;
  onContinue: () => void;
}

interface Place {
  step: THREE.Mesh;
  car: THREE.Mesh;
  name: Label;
  number: Label;
  h: number;
  riseAt: number;
}

export class Podium3D {
  readonly group = new THREE.Group();
  private readonly places: Place[] = [];
  private readonly fireworks: Fireworks;
  private readonly panel: HTMLElement;
  private readonly records: HTMLElement;
  private readonly continueButton: HTMLButtonElement;
  private readonly waitText: HTMLElement;
  private recordsShown: readonly NewRecord[] | null = null;
  private clock = 0;
  private nextVolley = 0;
  private volleys: number;
  private readonly winnerColor: number;

  constructor(
    state: Readonly<GameState>,
    quality: Quality,
    private readonly opts: PodiumOptions,
  ) {
    const reduced = reducedEffects();
    const standings = computeStandings(state as GameState);
    standings.slice(0, 3).forEach((id, place) => {
      const p = state.players[id]!;
      const color = PLAYER_COLORS[p.slot % PLAYER_COLORS.length]!;
      const { x, h } = STEPS[place]!;
      const step = new THREE.Mesh(
        new THREE.BoxGeometry(STEP_W, 1, STEP_D).translate(0, 0.5, 0),
        [0, 1, 2, 3, 4, 5].map((face) => new THREE.MeshLambertMaterial({ color: face === 2 ? color : 0x2a1748 })),
      );
      step.position.set(x, 0, 0);
      step.scale.y = 0.001;
      const car = new THREE.Mesh(carGeometry(color, quality), new THREE.MeshLambertMaterial({ vertexColors: true }));
      car.rotation.y = -Math.PI / 2; // nose toward the camera (+z)
      car.position.set(x, h, 0);
      car.visible = false;
      const name = new Label(hexColor(color), 1.1);
      name.setText(p.name);
      name.sprite.position.set(x, h + 62, 0);
      name.sprite.visible = false;
      const number = new Label('#ffe066', 0.9);
      number.setText(String(place + 1));
      number.sprite.position.set(x, h / 2, STEP_D / 2 + 1);
      number.sprite.visible = false;
      this.group.add(step, car, name.sprite, number.sprite);
      this.places.push({ step, car, name, number, h, riseAt: RISE_AT[place]! });
    });
    const winner = state.players[standings[0] ?? ''];
    this.winnerColor = winner ? PLAYER_COLORS[winner.slot % PLAYER_COLORS.length]! : 0xffe066;
    this.fireworks = new Fireworks(quality === 'high' && !reduced ? 6 : 3, glowDot());
    this.group.add(this.fireworks.points);
    this.volleys = reduced ? 2 : 8;
    this.nextVolley = RISE_AT[0]! + RISE_TIME;

    // The HTML side: title, records, table, awards, the button.
    this.records = el('p', { class: 'podium-records' });
    this.continueButton = button(opts.testMatch ? 'Încă un meci' : 'Înapoi în lobby', () => opts.onContinue(), 'primary', 'medium');
    if (!isTouch) this.continueButton.textContent += ' (Enter)';
    this.waitText = el('p', { class: 'podium-wait', text: 'Așteaptă ca hostul să revină în lobby.' });
    this.panel = el('div', { class: 'podium-panel' }, [
      el('h2', { text: 'Gata meciul!' }),
      this.records,
      this.table(state, standings),
      this.awards(state),
      this.continueButton,
      this.waitText,
    ]);
    document.body.append(this.panel);
    this.update(state, [], 0);
  }

  /** Every frame: the steps' animation, fireworks, the records line and who may press the button. */
  update(state: Readonly<GameState>, records: readonly NewRecord[], dt: number): void {
    this.clock += dt;
    for (const p of this.places) {
      const t = (this.clock - p.riseAt) / RISE_TIME;
      p.step.scale.y = p.h * easeOutBack(Math.max(0.001, Math.min(1, t)));
      p.number.sprite.visible = t > 0.6;
      const land = (this.clock - p.riseAt - RISE_TIME) / LAND_TIME;
      p.car.visible = land > 0;
      p.name.sprite.visible = land > 0;
      // Dropped onto the step with a little bounce.
      p.car.position.y = p.h + (land < 1 ? Math.abs(Math.cos(Math.max(0, land) * Math.PI * 1.5)) * 30 * (1 - Math.max(0, land)) : 0);
      p.car.rotation.y = -Math.PI / 2 + Math.sin(this.clock * 1.5 + p.h) * 0.25;
    }
    if (this.volleys > 0 && this.clock >= this.nextVolley) {
      this.volleys--;
      this.nextVolley = this.clock + 0.38;
      this.fireworks.burst((Math.random() - 0.5) * 260, 120 + Math.random() * 70, (Math.random() - 0.5) * 80, this.winnerColor);
    }
    this.fireworks.update(dt);

    this.panel.classList.toggle('shown', this.clock >= PANEL_AT);
    if (records !== this.recordsShown) {
      this.recordsShown = records;
      if (!this.opts.online) setText(this.records, this.opts.testMatch ? '' : 'Meciurile offline nu intră în clasament.');
      else setText(this.records, recordsLine(records, this.opts.me));
      this.records.classList.toggle('note', !this.opts.online);
    }
    const canContinue = this.opts.testMatch || state.hostId === this.opts.me;
    this.continueButton.hidden = !canContinue;
    this.waitText.hidden = canContinue;
  }

  dispose(): void {
    this.panel.remove();
    for (const p of this.places) {
      p.name.dispose();
      p.number.dispose();
    }
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) m.dispose();
      }
    });
  }

  /** Every player: place, name, points, rounds won, knockouts. */
  private table(state: Readonly<GameState>, standings: string[]): HTMLElement {
    const head = el('tr', {}, ['Loc', 'Mașinuța', 'Puncte', 'Runde', 'Scoși'].map((text) => el('th', { text })));
    const rows = standings.map((id, i) => {
      const p = state.players[id]!;
      const mine = id === this.opts.me;
      const name = el('td', { class: 'name', text: `${p.name}${mine ? ' (tu)' : ''}${p.left ? ' · a plecat' : ''}` });
      name.style.color = mine ? '#ffe066' : hexColor(PLAYER_COLORS[p.slot % PLAYER_COLORS.length]!);
      return el('tr', {}, [el('td', { text: String(i + 1) }), name, ...[p.points, p.wins, p.knockouts].map((v) => el('td', { class: 'num', text: String(v) }))]);
    });
    return el('table', { class: 'podium-table' }, [el('thead', {}, [head]), el('tbody', {}, rows)]);
  }

  private awards(state: Readonly<GameState>): HTMLElement | null {
    const awards = computeAwards(state);
    if (awards.length === 0) return null;
    return el(
      'div',
      { class: 'podium-awards' },
      [el('div', { class: 'label', text: 'Premii' })].concat(
        awards.map((award) => {
          const text = AWARD_TEXT[award.id];
          const names = award.playerIds.map((id) => state.players[id]!.name).join(', ');
          return el('div', { class: 'award' }, [el('b', { text: `★ ${text.title}` }), el('span', { text: `${names} · ${text.detail(award.value)}` })]);
        }),
      ),
    );
  }
}

function easeOutBack(t: number): number {
  const c = 1.70158;
  return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2);
}

interface Spark {
  life: number;
  vx: number;
  vy: number;
  vz: number;
}

/** Firework bursts: a pool of points flying out of a center, fading to black (additive), falling slowly. */
class Fireworks {
  readonly points: THREE.Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly sparks: Spark[] = [];
  private readonly base: THREE.Color[] = [];
  private next = 0;

  constructor(
    private readonly bursts: number,
    dot: THREE.Texture,
  ) {
    const n = bursts * FIREWORK_PARTICLES;
    this.pos = new Float32Array(n * 3).fill(-10000);
    this.col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.sparks.push({ life: 0, vx: 0, vy: 0, vz: 0 });
      this.base.push(new THREE.Color());
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.points = new THREE.Points(
      geom,
      new THREE.PointsMaterial({ size: 9, vertexColors: true, map: dot, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    this.points.frustumCulled = false;
  }

  burst(x: number, y: number, z: number, color: number): void {
    const white = new THREE.Color(0xffffff);
    for (let k = 0; k < FIREWORK_PARTICLES; k++) {
      const i = this.next;
      this.next = (this.next + 1) % (this.bursts * FIREWORK_PARTICLES);
      // Evenly over a sphere (golden spiral), a bit of jitter in speed.
      const u = (k + 0.5) / FIREWORK_PARTICLES;
      const phi = Math.acos(1 - 2 * u);
      const theta = k * 2.399963;
      const speed = 90 + Math.random() * 40;
      const s = this.sparks[i]!;
      s.life = 1.2 + Math.random() * 0.4;
      s.vx = Math.sin(phi) * Math.cos(theta) * speed;
      s.vy = Math.cos(phi) * speed;
      s.vz = Math.sin(phi) * Math.sin(theta) * speed;
      this.base[i]!.setHex(color).lerp(white, k % 5 === 0 ? 0.6 : 0);
      this.pos.set([x, y, z], i * 3);
    }
  }

  update(dt: number): void {
    for (let i = 0; i < this.sparks.length; i++) {
      const s = this.sparks[i]!;
      if (s.life <= 0) continue;
      s.life -= dt;
      if (s.life <= 0) {
        this.pos[i * 3 + 1] = -10000;
        continue;
      }
      const drag = Math.exp(-1.8 * dt);
      s.vx *= drag;
      s.vy = s.vy * drag - 60 * dt;
      s.vz *= drag;
      this.pos[i * 3] += s.vx * dt;
      this.pos[i * 3 + 1] += s.vy * dt;
      this.pos[i * 3 + 2] += s.vz * dt;
      const fade = Math.min(1, s.life / 0.8);
      const b = this.base[i]!;
      this.col.set([b.r * fade, b.g * fade, b.b * fade], i * 3);
    }
    this.points.geometry.attributes.position!.needsUpdate = true;
    this.points.geometry.attributes.color!.needsUpdate = true;
  }
}
