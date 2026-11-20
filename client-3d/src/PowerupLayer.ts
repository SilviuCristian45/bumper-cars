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
import { toWorld } from './world';

const POP_SECONDS = 0.25;

/** Power-ups as simple floating, spinning gems in their HUD color; oil puddles as dark discs; the horn's shockwave. */
export class PowerupLayer {
  readonly group = new THREE.Group();
  private readonly gems: THREE.Mesh[] = [];
  private readonly kinds: number[] = [];
  private readonly ages: number[] = [];
  private readonly puddles: THREE.Mesh[] = [];
  private readonly wave: THREE.Mesh;
  private waveAge = -1;
  private clock = 0;

  constructor() {
    const gemGeom = new THREE.OctahedronGeometry(11, 0);
    for (let i = 0; i < POWERUP_SLOTS; i++) {
      const gem = new THREE.Mesh(gemGeom, new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x000000 }));
      gem.visible = false;
      this.gems.push(gem);
      this.kinds.push(PU_NONE);
      this.ages.push(0);
      this.group.add(gem);
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
      const gem = this.gems[i]!;
      if (slot.kind !== this.kinds[i]) {
        this.kinds[i] = slot.kind;
        this.ages[i] = 0;
        if (slot.kind !== PU_NONE) {
          const color = POWERUP_INFO[slot.kind]?.color ?? 0xffffff;
          const mat = gem.material as THREE.MeshLambertMaterial;
          mat.color.setHex(color);
          mat.emissive.setHex(color).multiplyScalar(0.45);
        }
      }
      if (slot.kind === PU_NONE) {
        gem.visible = false;
        continue;
      }
      this.ages[i] += dt;
      const blink = slot.ticks < POWERUP_BLINK_TICKS && Math.floor(this.clock * 8) % 2 === 0;
      gem.visible = !blink;
      const pop = Math.min(1, this.ages[i]! / POP_SECONDS);
      gem.scale.setScalar(pop * (1 + Math.sin(this.clock * 6) * 0.06));
      gem.position.set(toWorld(slot.x), 16 + Math.sin(this.clock * 3 + i) * 3, toWorld(slot.y));
      gem.rotation.y = this.clock * 2 + i;
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
}
