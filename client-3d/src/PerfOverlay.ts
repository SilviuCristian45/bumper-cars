import type * as THREE from 'three';
import { el } from '@client/ui/el';

const REFRESH_MS = 500;

/**
 * ?perf: frames per second, time between frames (average and worst), time spent in our code per frame
 * (update + render submission, CPU side), draw calls and triangles of the last frame, resolution.
 */
export class PerfOverlay {
  private readonly node: HTMLElement;
  private frames = 0;
  private sumGap = 0;
  private maxGap = 0;
  private sumWork = 0;
  private windowStart = performance.now();
  /** The latest numbers, also readable from the console (window.__perf) for measurements. */
  readonly last = { fps: 0, frameMs: 0, worstMs: 0, workMs: 0, calls: 0, triangles: 0 };

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    private readonly label: string,
  ) {
    this.node = el('div', { class: 'perf' });
    document.body.append(this.node);
    (window as unknown as { __perf: unknown }).__perf = this.last;
  }

  /** gapMs: time since the previous frame; workMs: time this frame took in our code. */
  frame(gapMs: number, workMs: number): void {
    this.frames++;
    this.sumGap += gapMs;
    this.maxGap = Math.max(this.maxGap, gapMs);
    this.sumWork += workMs;
    const now = performance.now();
    if (now - this.windowStart < REFRESH_MS) return;
    const info = this.renderer.info.render;
    const canvas = this.renderer.domElement;
    Object.assign(this.last, {
      fps: Math.round((this.frames * 1000) / (now - this.windowStart)),
      frameMs: this.sumGap / this.frames,
      worstMs: this.maxGap,
      workMs: this.sumWork / this.frames,
      calls: info.calls,
      triangles: info.triangles,
    });
    this.node.textContent =
      `${this.last.fps} fps  ${this.last.frameMs.toFixed(1)} ms (max ${this.last.worstMs.toFixed(0)})\n` +
      `cpu ${this.last.workMs.toFixed(2)} ms\n` +
      `draw ${info.calls}  tri ${info.triangles}\n` +
      `${this.label} ${canvas.width}×${canvas.height} @${this.renderer.getPixelRatio().toFixed(2)}`;
    this.frames = 0;
    this.sumGap = 0;
    this.maxGap = 0;
    this.sumWork = 0;
    this.windowStart = now;
  }
}
