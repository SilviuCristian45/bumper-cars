import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RING_RADIUS } from '@masinute/shared';
import { Arena } from './Arena';
import { CameraRig } from './CameraRig';
import { Scenery } from './Scenery';
import type { Quality } from './settings3d';
import { toWorld } from './coords';

const BG = 0x120a24;

/**
 * Everything that does not depend on which match is shown: renderer, scene, lights, the ring, the
 * camera, bloom on "high". Rebuilt from scratch when the quality setting changes.
 */
export class World {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly arena: Arena;
  readonly scenery: Scenery;
  private readonly composer: EffectComposer | null = null;
  private readonly onResize = () => this.resize();

  constructor(
    readonly quality: Quality,
    parent: HTMLElement,
  ) {
    const high = quality === 'high';
    this.renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.5));
    this.renderer.setClearColor(BG);
    this.renderer.info.autoReset = false; // counted over every pass of a frame
    if (high) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
    }
    parent.append(this.renderer.domElement);

    this.scene.background = new THREE.Color(BG);
    this.scene.fog = new THREE.Fog(BG, 900, 2200);
    this.scene.add(new THREE.HemisphereLight(0xc9b8ff, 0x2a1238, high ? 1.6 : 2.0));
    const sun = new THREE.DirectionalLight(0xfff0d8, high ? 2.2 : 1.6);
    sun.position.set(-160, 420, 220);
    if (high) {
      const r = toWorld(RING_RADIUS) + 40;
      sun.castShadow = true;
      sun.shadow.mapSize.set(1024, 1024);
      Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 100, far: 900 });
      sun.shadow.bias = -0.0015;
    }
    this.scene.add(sun);

    this.rig = new CameraRig(1);
    this.arena = new Arena(quality);
    this.scene.add(this.arena.group);
    this.scenery = new Scenery(quality);
    this.scene.add(this.scenery.group);

    if (high) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.rig.camera));
      this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(256, 256), 0.6, 0.35, 0.82));
      this.composer.addPass(new OutputPass());
    }
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  /** What moves on its own (the wheel, the garlands), every frame. */
  update(dt: number): void {
    this.scenery.update(dt);
  }

  render(dt: number): void {
    this.renderer.info.reset();
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.rig.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points || o instanceof THREE.LineSegments) {
        o.geometry.dispose();
        for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
          (m as THREE.MeshStandardMaterial).map?.dispose();
          m.dispose();
        }
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
  }

  private resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.composer?.setSize(w, h);
    this.rig.setAspect(w / h);
  }
}
