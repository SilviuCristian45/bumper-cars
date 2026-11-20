import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { RING_RADIUS, type GameEvent } from '@masinute/shared';
import { isTouch } from '@client/device';
import { CombinedInput } from '@client/input/CombinedInput';
import { NO_INPUT, type InputSource } from '@client/input/InputSource';
import { TouchInput } from '@client/input/TouchInput';
import { LocalTransport } from '@client/net/LocalTransport';
import { Arena } from './Arena';
import { CameraRig } from './CameraRig';
import { CarLayer } from './CarLayer';
import { Hud } from './Hud';
import { KeyboardInput } from './KeyboardInput';
import { localOptions, perf, quality } from './options';
import { PerfOverlay } from './PerfOverlay';
import { PowerupLayer } from './PowerupLayer';
import { toWorld } from './world';
import './style.css';

// 3D probe: an offline match against bots on the shared simulation, drawn with Three.js.
// The physics stays 2D on the floor plane; everything 3D here is rendering only.

const high = quality === 'high';
const BG = 0x120a24;
if (isTouch) document.body.classList.add('touch');

// ---------- renderer, scene, lights ----------

const renderer = new THREE.WebGLRenderer({ antialias: high, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, high ? 2 : 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(BG);
renderer.info.autoReset = false; // counted over every pass of a frame
if (high) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
}
document.getElementById('stage')!.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(BG);
scene.fog = new THREE.Fog(BG, 900, 2200);
scene.add(new THREE.HemisphereLight(0xc9b8ff, 0x2a1238, high ? 1.6 : 2.0));
const sun = new THREE.DirectionalLight(0xfff0d8, high ? 2.2 : 1.6);
sun.position.set(-160, 420, 220);
if (high) {
  const r = toWorld(RING_RADIUS) + 40;
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 100, far: 900 });
  sun.shadow.bias = -0.0015;
}
scene.add(sun);

const rig = new CameraRig(window.innerWidth / window.innerHeight);
const arena = new Arena(quality);
const powerups = new PowerupLayer();
scene.add(arena.group, powerups.group);

let composer: EffectComposer | null = null;
if (high) {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, rig.camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.6, 0.35, 0.82));
  composer.addPass(new OutputPass());
}

// ---------- input ----------

const keyboard = new KeyboardInput();
const touch = isTouch ? new TouchInput({ leftHanded: false }) : null;
const input: InputSource = touch ? new CombinedInput([touch, keyboard]) : keyboard;

// ---------- the match ----------

let transport = new LocalTransport(localOptions());
let cars = new CarLayer(quality, transport.playerId);
let hud = new Hud(transport.playerId, !isTouch);
let pendingEvents: GameEvent[] = [];
let unsubscribe = transport.onEvents((events) => pendingEvents.push(...events));
scene.add(cars.group);

function newMatch(): void {
  unsubscribe();
  transport.dispose();
  scene.remove(cars.group);
  hud.dispose();
  transport = new LocalTransport(localOptions());
  cars = new CarLayer(quality, transport.playerId);
  hud = new Hud(transport.playerId, !isTouch);
  pendingEvents = [];
  unsubscribe = transport.onEvents((events) => pendingEvents.push(...events));
  scene.add(cars.group);
}

// ---------- keys and buttons ----------

function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen?.().catch(() => {});
}

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'KeyC') rig.toggle();
  else if (e.code === 'KeyP') transport.setPaused(!transport.isPaused());
  else if (e.code === 'KeyF') toggleFullscreen();
  else if (e.code === 'Enter' && transport.getState().phase === 'finished') newMatch();
});

const camButton = document.getElementById('cam-btn')!;
camButton.addEventListener('click', () => rig.toggle());
camButton.hidden = false;
renderer.domElement.addEventListener('pointerdown', () => {
  if (transport.getState().phase === 'finished') newMatch();
  // Phones: the first tap goes fullscreen (no browser bars over the game).
  if (isTouch && !document.fullscreenElement) toggleFullscreen();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) input.releaseAll();
});

function resize(): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  composer?.setSize(w, h);
  rig.setAspect(w / h);
}
window.addEventListener('resize', resize);

// ---------- frame loop ----------

const perfOverlay = perf ? new PerfOverlay(renderer, quality) : null;

function renderFrame(dt: number): void {
  renderer.info.reset();
  if (composer) composer.render(dt);
  else renderer.render(scene, rig.camera);
}

if (perf) {
  // ?perf: window.__bench(n) draws the current frame n times back to back and waits for the GPU each time
  // (1-pixel read), so the cost of a frame can be measured even when the browser throttles rAF.
  const gl = renderer.getContext();
  const pixel = new Uint8Array(4);
  (window as unknown as { __bench: (n: number) => object }).__bench = (n = 100) => {
    const t0 = performance.now();
    for (let i = 0; i < n; i++) {
      renderFrame(0);
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    }
    const ms = (performance.now() - t0) / n;
    return { msPerFrame: +ms.toFixed(2), maxFps: Math.round(1000 / ms), calls: renderer.info.render.calls, triangles: renderer.info.render.triangles };
  };
}
let last = performance.now();

renderer.setAnimationLoop((now: number) => {
  const gap = now - last;
  const dt = Math.min(0.1, gap / 1000);
  last = now;
  const workStart = performance.now();

  const before = transport.getState();
  const me = before.players[transport.playerId];
  const car = cars.carOf(transport.playerId);
  const drivable = before.phase === 'playing' && !!me?.alive;
  touch?.setVisible(drivable);
  const drive = input.poll({ heading: rig.screenHeading(me?.heading ?? 0) });
  transport.setInput(drivable && drive ? drive : NO_INPUT);
  transport.update(gap);

  const state = transport.getState();
  const view = transport.view();
  if (pendingEvents.length > 0) {
    cars.onEvents(pendingEvents, state);
    powerups.onEvents(pendingEvents);
    hud.onEvents(pendingEvents);
    pendingEvents = [];
  }
  arena.update(dt, view.ringRadius);
  powerups.update(state, dt);
  cars.showMarker = rig.mode === 'tilted';
  cars.update(state, view, dt);
  if (cars.shake > 0) {
    rig.addShake(cars.shake);
    cars.shake = 0;
  }
  const follow = car && me?.alive && !car.falling ? { x: car.root.position.x, z: car.root.position.z, yaw: car.root.rotation.y } : null;
  rig.update(dt, follow);
  arena.setNetFromBelow(rig.mode === 'chase' && !!follow);
  hud.update(state, dt, transport.isPaused());
  touch?.setBoostReady(hud.boostReady(state));

  renderFrame(dt);
  perfOverlay?.frame(gap, performance.now() - workStart);
});
