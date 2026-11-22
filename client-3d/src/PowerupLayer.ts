import * as THREE from 'three';
import {
  MAX_PLAYERS,
  OIL_RADIUS,
  POWERUP_BLINK_TICKS,
  POWERUP_SLOTS,
  PU_NONE,
  powerupAt,
  sortedPlayers,
  type GameEvent,
  type GameState,
} from '@masinute/shared';
import { POWERUP_INFO } from '@client/render/powerupInfo';
import { toWorld } from './coords';
import { powerupModels } from './powerupModels';

const POP_SECONDS = 0.25;
// The models are ~24 units across; a bit bigger reads better from the match camera.
const MODEL_SCALE = 1.3;

/**
 * Power-ups as small low-poly models (powerupModels.ts) floating and spinning over a glowing ring in their
 * HUD color; oil puddles as dark discs; the horn's shockwave.
 */
export class PowerupLayer {
  readonly group = new THREE.Group();
  private readonly models = powerupModels();
  private readonly items: THREE.Mesh[] = [];
  private readonly rings: THREE.Mesh[] = [];
  private readonly kinds: number[] = [];
  private readonly ages: number[] = [];
  private readonly puddles: THREE.Mesh[] = [];
  private readonly wave: THREE.Mesh;
  private waveAge = -1;
  private clock = 0;

  constructor() {
    // A little self-light so the models read under the night lighting; double-sided for the open bands.
    const itemMat = new THREE.MeshLambertMaterial({ vertexColors: true, emissive: 0x2a2a2a, side: THREE.DoubleSide });
    const ringGeom = new THREE.RingGeometry(14, 17.5, 28).rotateX(-Math.PI / 2);
    for (let i = 0; i < POWERUP_SLOTS; i++) {
      const item = new THREE.Mesh(undefined, itemMat);
      item.visible = false;
      this.items.push(item);
      const ring = new THREE.Mesh(ringGeom, new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false }));
      ring.visible = false;
      this.rings.push(ring);
      this.kinds.push(PU_NONE);
      this.ages.push(0);
      this.group.add(item, ring);
    }
    const puddleGeom = new THREE.CircleGeometry(toWorld(OIL_RADIUS), 20).rotateX(-Math.PI / 2);
    const puddleMat = new THREE.MeshBasicMaterial({ color: 0x24123a, transparent: true, opacity: 0.75, depthWrite: false });
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const puddle = new THREE.Mesh(puddleGeom, puddleMat);
      puddle.position.y = 0.6;
      puddle.visible = false;
      this.puddles.push(puddle);
      this.group.add(puddle);
    }
    this.wave = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 40).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0xffd166, transparent: true, depthWrite: false }),
    );
    this.wave.visible = false;
    this.group.add(this.wave);
  }

  onEvents(events: readonly GameEvent[]): void {
    for (const e of events) {
      if (e.type !== 'horn') continue;
      this.wave.position.set(toWorld(e.x), 1, toWorld(e.y));
      this.waveAge = 0;
    }
  }

  update(state: Readonly<GameState>, dt: number): void {
    this.clock += dt;
    for (let i = 0; i < POWERUP_SLOTS; i++) {
      const slot = powerupAt(state, i);
      const item = this.items[i]!;
      const ring = this.rings[i]!;
      if (slot.kind !== this.kinds[i]) {
        this.kinds[i] = slot.kind;
        this.ages[i] = 0;
        const model = this.models.get(slot.kind);
        if (model) item.geometry = model;
        (ring.material as THREE.MeshBasicMaterial).color.setHex(POWERUP_INFO[slot.kind]?.color ?? 0xffffff);
      }
      if (slot.kind === PU_NONE || !this.models.has(slot.kind)) {
        item.visible = ring.visible = false;
        continue;
      }
      this.ages[i] += dt;
      const blink = slot.ticks < POWERUP_BLINK_TICKS && Math.floor(this.clock * 8) % 2 === 0;
      item.visible = ring.visible = !blink;
      const pop = Math.min(1, this.ages[i]! / POP_SECONDS);
      const x = toWorld(slot.x);
      const z = toWorld(slot.y);
      item.scale.setScalar(MODEL_SCALE * pop * (1 + Math.sin(this.clock * 6) * 0.05));
      item.position.set(x, 21 + Math.sin(this.clock * 3 + i) * 3, z);
      item.rotation.y = this.clock * 1.6 + i;
      ring.position.set(x, 0.7, z);
      ring.scale.setScalar(pop);
      (ring.material as THREE.MeshBasicMaterial).opacity = 0.55 + Math.sin(this.clock * 5 + i) * 0.25;
    }

    let n = 0;
    for (const p of sortedPlayers(state as GameState)) {
      if (n >= this.puddles.length) break;
      const puddle = this.puddles[n++]!;
      puddle.visible = p.oilTicks > 0;
      if (puddle.visible) puddle.position.set(toWorld(p.oilX), 0.6, toWorld(p.oilY));
    }
    for (; n < this.puddles.length; n++) this.puddles[n]!.visible = false;

    if (this.waveAge >= 0) {
      this.waveAge += dt;
      const t = this.waveAge / 0.45;
      this.wave.visible = t < 1;
      this.wave.scale.setScalar(20 + t * 130);
      (this.wave.material as THREE.MeshBasicMaterial).opacity = 1 - t;
      if (t >= 1) this.waveAge = -1;
    }
  }

  dispose(): void {
    for (const model of this.models.values()) model.dispose();
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        (o.material as THREE.Material).dispose();
      }
    });
  }
}
