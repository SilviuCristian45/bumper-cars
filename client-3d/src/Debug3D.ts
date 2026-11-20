import * as THREE from 'three';
import { ANGLE_STEPS, CAR_RADIUS, carRadius, livePowerups, POWERUP_RADIUS, sortedPlayers, TICK_RATE, TUNING, type BotThought, type GameState } from '@masinute/shared';
import { botThoughts, debugLines, INTENTS, thoughtLabel, VELOCITY_SCALE } from '@client/debug/debugInfo';
import type { NetStats } from '@client/net/GameTransport';
import type { RenderView } from '@client/net/view';
import { POWERUP_INFO } from '@client/render/powerupInfo';
import { el } from '@client/ui/el';
import { toWorld } from './coords';

// ?debug in 3D, as in 2D (client/src/debug: same texts and bot thoughts): lines on the floor for the ring,
// hitboxes, heading (white) and velocity (yellow), recent hit credit (red), each bot's target (intent
// color), power-up reach and oil discs; HTML labels for the bots' intents and the power-ups; the info lines.

const MAX_SEGMENTS = 4000;
const CIRCLE_SEGMENTS = 28;
const Y = 1.2;

export class Debug3D {
  readonly lines: THREE.LineSegments;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private n = 0;
  private readonly info: HTMLElement;
  private readonly labelLayer: HTMLElement;
  private readonly labels = new Map<string, HTMLElement>();
  private thoughts = new Map<string, BotThought>();
  private lastTick = -1;
  private readonly c = new THREE.Color();
  private readonly v = new THREE.Vector3();
  private fps = 0;

  constructor() {
    this.pos = new Float32Array(MAX_SEGMENTS * 6);
    this.col = new Float32Array(MAX_SEGMENTS * 6);
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geom.setAttribute('color', new THREE.BufferAttribute(this.col, 3));
    this.lines = new THREE.LineSegments(geom, new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true }));
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 20;
    this.info = el('div', { class: 'debug-info' });
    this.labelLayer = el('div', { class: 'debug-labels' });
    document.body.append(this.labelLayer, this.info);
  }

  update(state: Readonly<GameState>, view: RenderView, meId: string, dtMs: number, paused: boolean, camera: THREE.Camera, net?: NetStats): void {
    this.fps = this.fps * 0.9 + (dtMs > 0 ? 1000 / dtMs : 0) * 0.1;
    if (state.tick !== this.lastTick) {
      this.lastTick = state.tick;
      this.thoughts = botThoughts(state);
    }
    this.n = 0;
    const used = new Set<string>();
    this.circle(0, 0, toWorld(view.ringRadius), 0x00ff9c);

    for (const item of livePowerups(state)) {
      const x = toWorld(item.x);
      const z = toWorld(item.y);
      this.circle(x, z, toWorld(CAR_RADIUS + POWERUP_RADIUS), POWERUP_INFO[item.kind]?.color ?? 0xffffff);
      this.label(`pu${item.slot}`, used, `${POWERUP_INFO[item.kind]?.name ?? item.kind} ${(item.ticks / TICK_RATE).toFixed(1)}s`, '#ffffff', x, z, camera);
    }
    for (const p of Object.values(state.players)) {
      if (p.oilTicks > 0) this.circle(toWorld(p.oilX), toWorld(p.oilY), toWorld(TUNING.oilRadius), 0x9b7bd8);
    }
    for (const p of sortedPlayers(state as GameState)) {
      if (!p.alive) continue;
      const pose = view.poses.get(p.id);
      const x = toWorld(pose?.x ?? p.x);
      const z = toWorld(pose?.y ?? p.y);
      const r = toWorld(carRadius(p));
      this.circle(x, z, r, 0x00ff9c);
      const a = ((pose?.heading ?? p.heading) / ANGLE_STEPS) * Math.PI * 2;
      this.segment(x, z, x + Math.cos(a) * 30, z + Math.sin(a) * 30, 0xffffff);
      this.segment(x, z, x + toWorld(p.vx * VELOCITY_SCALE), z + toWorld(p.vy * VELOCITY_SCALE), 0xffd166);
      if (p.lastHitBy && state.tick - p.lastHitTick <= 3 * TICK_RATE) this.circle(x, z, r + 4, 0xff4d6d);

      const thought = this.thoughts.get(p.id);
      if (!thought) continue;
      const intent = INTENTS[thought.intent];
      const tx = toWorld(thought.targetX);
      const tz = toWorld(thought.targetY);
      this.segment(x, z, tx, tz, intent.color);
      this.segment(tx - 4, tz - 4, tx + 4, tz + 4, intent.color);
      this.segment(tx - 4, tz + 4, tx + 4, tz - 4, intent.color);
      this.label(p.id, used, thoughtLabel(thought), '#' + intent.color.toString(16).padStart(6, '0'), x, z + r + 10, camera);
    }
    for (const [id, node] of this.labels) node.hidden = !used.has(id);

    this.lines.geometry.setDrawRange(0, this.n * 2);
    this.lines.geometry.attributes.position!.needsUpdate = true;
    this.lines.geometry.attributes.color!.needsUpdate = true;
    const text = debugLines(state, meId, this.fps, paused, net).join('\n');
    if (this.info.textContent !== text) this.info.textContent = text;
  }

  dispose(): void {
    this.info.remove();
    this.labelLayer.remove();
    this.lines.geometry.dispose();
    (this.lines.material as THREE.Material).dispose();
  }

  private segment(x0: number, z0: number, x1: number, z1: number, color: number): void {
    if (this.n >= MAX_SEGMENTS) return;
    const i = this.n++ * 6;
    this.pos.set([x0, Y, z0, x1, Y, z1], i);
    this.c.setHex(color);
    this.col.set([this.c.r, this.c.g, this.c.b, this.c.r, this.c.g, this.c.b], i);
  }

  private circle(x: number, z: number, r: number, color: number): void {
    for (let k = 0; k < CIRCLE_SEGMENTS; k++) {
      const a0 = (k / CIRCLE_SEGMENTS) * Math.PI * 2;
      const a1 = ((k + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;
      this.segment(x + Math.cos(a0) * r, z + Math.sin(a0) * r, x + Math.cos(a1) * r, z + Math.sin(a1) * r, color);
    }
  }

  /** An HTML label at a point on the floor, projected to the screen. */
  private label(id: string, used: Set<string>, text: string, color: string, x: number, z: number, camera: THREE.Camera): void {
    this.v.set(x, Y, z).project(camera);
    if (this.v.z > 1) return; // behind the camera
    used.add(id);
    let node = this.labels.get(id);
    if (!node) {
      node = el('div', { class: 'debug-label' });
      this.labelLayer.append(node);
      this.labels.set(id, node);
    }
    if (node.textContent !== text) node.textContent = text;
    node.style.color = color;
    node.style.transform = `translate(${((this.v.x + 1) / 2) * window.innerWidth}px, ${((1 - this.v.y) / 2) * window.innerHeight}px) translate(-50%, 0)`;
  }
}
