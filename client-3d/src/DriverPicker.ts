import * as THREE from 'three';
import { DRIVER_COUNT, PLAYER_COLORS } from '@masinute/shared';
import type { GameTransport } from '@client/net/GameTransport';
import { el } from '@client/ui/el';
import { button, setText, type Lifetime } from '@client/ui/html';
import { carGeometry } from './Car';
import { DRIVER_NAMES } from './drivers';
import { getDriver, saveDriver } from './settings3d';

const WIDTH = 168;
const HEIGHT = 120;
/** A swipe on the preview at least this long (CSS px) turns the carousel. */
const SWIPE_PX = 24;

/**
 * The lobby's "Șoferul tău": the own car (in the own color) with the chosen character in the seat,
 * turning gently on a small canvas of its own, ◀ ▶ (or a swipe, or a tap for the next one) to browse
 * the plain driver and the DRIVER_COUNT characters. The pick is remembered on this device and sent to
 * the room, so everyone sees it; several players may pick the same one.
 */
export function driverPicker(life: Lifetime, transport: GameTransport): HTMLElement {
  let wanted = getDriver();
  /** The last value sent; the room is asked again only when the pick changes (or a new picker opens). */
  let sent = -1;

  const canvas = el('canvas', { class: 'driver-canvas', attrs: { width: String(WIDTH), height: String(HEIGHT), 'aria-hidden': 'true' } });
  const name = el('div', { class: 'driver-name' });
  const count = el('div', { class: 'driver-count' });
  const prev = button('◀', () => step(-1), 'secondary', 'small');
  const next = button('▶', () => step(1), 'secondary', 'small');
  prev.setAttribute('aria-label', 'Personajul anterior');
  next.setAttribute('aria-label', 'Personajul următor');
  const node = el('div', { class: 'driver-picker' }, [
    el('div', { class: 'label', text: 'Șoferul tău' }),
    el('div', { class: 'driver-row' }, [prev, canvas, next]),
    name,
    count,
  ]);

  const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(WIDTH, HEIGHT, false);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xc9b8ff, 0x2a1238, 2.2));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2);
  sun.position.set(60, 90, 40);
  scene.add(sun);
  const camera = new THREE.PerspectiveCamera(30, WIDTH / HEIGHT, 10, 1000);
  camera.position.set(96, 50, 0);
  camera.lookAt(0, 27, 0);
  const material = new THREE.MeshLambertMaterial({ vertexColors: true });
  const car = new THREE.Mesh(new THREE.BufferGeometry(), material);
  scene.add(car);

  let shownKey = '';
  /** 1 right after a change, easing to 0: a little bounce of the new character. */
  let pop = 0;
  let raf = 0;
  let last = performance.now();
  const t0 = last;

  function step(dir: number): void {
    wanted = (wanted + dir + DRIVER_COUNT + 1) % (DRIVER_COUNT + 1);
    saveDriver(wanted);
    pop = 1;
  }

  // A horizontal swipe browses; a tap shows the next one.
  let downX: number | null = null;
  canvas.addEventListener('pointerdown', (e) => (downX = e.clientX));
  canvas.addEventListener('pointerup', (e) => {
    if (downX === null) return;
    const dx = e.clientX - downX;
    downX = null;
    step(Math.abs(dx) >= SWIPE_PX ? -Math.sign(dx) : 1);
  });
  canvas.addEventListener('pointercancel', () => (downX = null));

  const frame = (now: number) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(now - last, 100) / 1000;
    last = now;
    const state = transport.getState();
    const me = state.players[transport.playerId];
    if (me && state.phase === 'lobby' && me.driver !== wanted && sent !== wanted) {
      transport.send({ type: 'driver', driver: wanted });
      sent = wanted;
    }
    const slot = me?.slot ?? 0;
    const key = `${wanted}:${slot}`;
    if (key !== shownKey) {
      shownKey = key;
      car.geometry.dispose();
      car.geometry = carGeometry(PLAYER_COLORS[slot % PLAYER_COLORS.length]!, 'low', wanted);
      setText(name, DRIVER_NAMES[wanted] ?? '');
      setText(count, wanted === 0 ? 'fără personaj' : `${wanted} / ${DRIVER_COUNT}`);
    }
    pop = Math.max(0, pop - dt * 4);
    const t = (now - t0) / 1000;
    // Mostly facing the camera, swaying to show it from both sides.
    car.rotation.y = -0.45 + Math.sin(t * 0.9) * 0.6;
    car.position.y = Math.sin(pop * Math.PI) * 6;
    car.scale.setScalar(1 + pop * 0.08);
    renderer.render(scene, camera);
  };
  raf = requestAnimationFrame(frame);

  life.onEnd(() => {
    cancelAnimationFrame(raf);
    car.geometry.dispose();
    material.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  });
  return node;
}
