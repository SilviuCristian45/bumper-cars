import * as THREE from 'three';
import { PU_GHOST, TICK_RATE, sortedPlayers, type GameEvent, type GameState } from '@masinute/shared';
import type { RenderView } from '@client/net/view';
import { ANTENNA_BASE, CarView } from './Car';
import type { Quality } from './options';
import { GlowPoints, SparkBursts } from './Sparks';
import { blobShadow, glowDot } from './textures';
import { CEILING_Y, toWorld } from './world';

const MAX_CARS = 6;
/** A bump this strong (impulse) counts as a full-strength hit for hops, sparks and camera shake. */
const HARD_HIT = 160000;
const UP = new THREE.Vector3(0, 1, 0);

/**
 * Every car plus what is drawn for all of them in one go: antenna poles (instanced), blob shadows
 * (instanced, only without real shadows), antenna sparks and boost flames (one Points each),
 * collision sparks, the marker over the player's own car.
 */
export class CarLayer {
  readonly group = new THREE.Group();
  private readonly cars = new Map<string, CarView>();
  private readonly poles: THREE.InstancedMesh;
  private readonly shadows: THREE.InstancedMesh | null;
  private readonly antennaSparks: GlowPoints;
  private readonly flames: GlowPoints;
  private readonly sparks: SparkBursts;
  private readonly marker: THREE.Mesh;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly v = new THREE.Vector3();
  private readonly base = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly size = new THREE.Vector3();
  private readonly zero = new THREE.Matrix4().makeScale(0, 0, 0);
  private clock = 0;
  /** The marker over the own car (not on the chase camera, where it would sit right in front of the lens). */
  showMarker = true;
  /** Camera shake asked for by hits this frame (0..1), read and cleared by the camera. */
  shake = 0;

  constructor(
    private readonly quality: Quality,
    private readonly meId: string,
  ) {
    const high = quality === 'high';
    const dot = glowDot();
    this.poles = new THREE.InstancedMesh(
      new THREE.CylinderGeometry(0.7, 0.7, 1, 4).translate(0, 0.5, 0),
      new THREE.MeshLambertMaterial({ color: 0x8c8296 }),
      MAX_CARS,
    );
    this.poles.frustumCulled = false;
    this.group.add(this.poles);
    if (high) {
      this.shadows = null;
    } else {
      this.shadows = new THREE.InstancedMesh(
        new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2),
        new THREE.MeshBasicMaterial({ map: blobShadow(), transparent: true, depthWrite: false }),
        MAX_CARS,
      );
      this.shadows.frustumCulled = false;
      this.shadows.renderOrder = -1;
      this.group.add(this.shadows);
    }
    this.antennaSparks = new GlowPoints(MAX_CARS, 0xbfe8ff, 16, dot);
    this.flames = new GlowPoints(MAX_CARS * 2, 0xff9a3c, 18, dot);
    this.sparks = new SparkBursts(high ? 160 : 72, dot);
    this.group.add(this.antennaSparks.points, this.flames.points, this.sparks.object);

    this.marker = new THREE.Mesh(new THREE.ConeGeometry(5, 9, 4).rotateX(Math.PI), new THREE.MeshBasicMaterial({ color: 0xffe066 }));
    this.group.add(this.marker);
  }

  onEvents(events: readonly GameEvent[], state: Readonly<GameState>): void {
    for (const e of events) {
      if (e.type !== 'bump') continue;
      const strength = Math.min(1, e.force / HARD_HIT);
      this.cars.get(e.a)?.bump(strength);
      this.cars.get(e.b)?.bump(strength);
      this.sparks.burst(toWorld(e.x), 14, toWorld(e.y), Math.round(6 + strength * (this.quality === 'high' ? 18 : 8)), 60 + strength * 160);
      const mine = e.a === this.meId || e.b === this.meId;
      if (strength > 0.35 && state.players[this.meId]) this.shake = Math.max(this.shake, mine ? strength : strength * 0.4);
    }
  }

  update(state: Readonly<GameState>, view: RenderView, dt: number): void {
    this.clock += dt;
    const players = sortedPlayers(state as GameState);
    for (const [id, car] of this.cars) {
      if (state.players[id]) continue;
      this.group.remove(car.root);
      this.cars.delete(id);
    }

    let i = 0;
    for (const p of players) {
      let car = this.cars.get(p.id);
      if (!car) {
        car = new CarView(p, this.quality);
        this.cars.set(p.id, car);
        this.group.add(car.root);
      }
      car.update(p, view.poses.get(p.id), dt);

      // Fantomă: see-through on your own screen; invisible to others but for a shimmer every second,
      // flickering for everyone in its last second.
      let ghostHidden = false;
      if (p.effect === PU_GHOST && p.alive) {
        const lastSecond = p.effectTicks < TICK_RATE;
        const flicker = lastSecond && Math.floor(this.clock * 12) % 2 === 0;
        if (p.id === this.meId) car.setOpacity(flicker ? 0.8 : 0.4);
        else {
          const shimmer = this.clock % 1 < 0.12;
          ghostHidden = !(flicker || shimmer);
          car.setOpacity(0.3);
        }
      } else car.setOpacity(1);
      const visible = !car.hidden && !ghostHidden;
      car.root.visible = visible;

      this.drawExtras(i, car, p.boostTicks > 0, visible);
      if (p.id === this.meId) this.placeMarker(car, this.showMarker && visible && !car.falling);
      i++;
    }
    for (; i < MAX_CARS; i++) this.hideExtras(i);
    this.poles.instanceMatrix.needsUpdate = true;
    if (this.shadows) this.shadows.instanceMatrix.needsUpdate = true;
    this.antennaSparks.commit();
    this.flames.commit();
    this.sparks.update(dt);
  }

  /** Antenna pole from its mount up to the ceiling (leaning with the car), its spark, shadow and boost flames. */
  private drawExtras(i: number, car: CarView, boosting: boolean, visible: boolean): void {
    if (!visible) {
      this.hideExtras(i);
      return;
    }
    car.root.updateMatrixWorld();
    this.base.copy(ANTENNA_BASE).applyMatrix4(car.body.matrixWorld);
    if (car.falling) {
      this.tip.copy(ANTENNA_BASE).setY(ANTENNA_BASE.y + 60).applyMatrix4(car.body.matrixWorld);
    } else {
      // The tip slides along the net: it trails the mount by the car's lean.
      this.tip.set(this.base.x, CEILING_Y, this.base.z);
    }
    this.v.subVectors(this.tip, this.base);
    const len = this.v.length();
    this.q.setFromUnitVectors(UP, this.v.normalize());
    this.m.compose(this.base, this.q, this.size.set(1, len, 1));
    this.poles.setMatrixAt(i, this.m);

    // Flickering spark where the antenna touches the net.
    const flick = Math.sin(this.clock * 37 + i * 11) + Math.sin(this.clock * 23 + i * 5);
    if (!car.falling && flick > -0.6) this.antennaSparks.set(i, this.tip.x, this.tip.y - 1, this.tip.z);
    else this.antennaSparks.hide(i);

    if (boosting && !car.falling) {
      for (let k = 0; k < 2; k++) {
        this.v.set(-24, 10, k === 0 ? -6 : 6).applyMatrix4(car.body.matrixWorld);
        this.flames.set(i * 2 + k, this.v.x, this.v.y, this.v.z);
      }
    } else {
      this.flames.hide(i * 2);
      this.flames.hide(i * 2 + 1);
    }

    if (this.shadows) {
      if (car.falling) this.shadows.setMatrixAt(i, this.zero);
      else {
        const s = 52 * car.scale;
        this.m.makeScale(s, 1, s).setPosition(car.root.position.x, 0.4, car.root.position.z);
        this.shadows.setMatrixAt(i, this.m);
      }
    }
  }

  private hideExtras(i: number): void {
    this.poles.setMatrixAt(i, this.zero);
    this.shadows?.setMatrixAt(i, this.zero);
    this.antennaSparks.hide(i);
    this.flames.hide(i * 2);
    this.flames.hide(i * 2 + 1);
  }

  private placeMarker(car: CarView, visible: boolean): void {
    this.marker.visible = visible;
    if (!visible) return;
    this.marker.position.set(car.root.position.x, 50 * car.scale + 8 + Math.sin(this.clock * 5) * 3, car.root.position.z);
    this.marker.rotation.y = this.clock * 2;
  }

  /** Where the player's car is drawn (camera target), or null when it has none. */
  carOf(id: string): CarView | undefined {
    return this.cars.get(id);
  }
}
