// Pointer handling: tap-to-select and swipe-to-swap. Knows nothing about the
// grid, specials, or animation state — it reports cell positions and intents
// (select / swap attempt) through callbacks.

import { COLS, ROWS, areAdjacent } from './board.ts';
import type { Pos } from './board.ts';
import { sfx } from './audio.ts';

export interface BoardGeometry {
  ox: number;
  oy: number;
  cell: number;
  cssW: number;
}

export interface BoardInputCallbacks {
  isBusy(): boolean;
  getSelected(): Pos | null;
  onSelect(p: Pos | null): void;
  onSwapAttempt(a: Pos, b: Pos): void;
}

export class BoardInput {
  private canvas: HTMLCanvasElement;
  private geom: () => BoardGeometry;
  private cb: BoardInputCallbacks;
  private drag: { start: Pos; x: number; y: number; id: number } | null = null;

  constructor(canvas: HTMLCanvasElement, geom: () => BoardGeometry, cb: BoardInputCallbacks) {
    this.canvas = canvas;
    this.geom = geom;
    this.cb = cb;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
  }

  private cellAt(e: PointerEvent): Pos | null {
    const g = this.geom();
    const rect = this.canvas.getBoundingClientRect();
    const scale = g.cssW / rect.width || 1;
    const x = (e.clientX - rect.left) * scale - g.ox;
    const y = (e.clientY - rect.top) * scale - g.oy;
    const c = Math.floor(x / g.cell);
    const r = Math.floor(y / g.cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  }

  private onDown = (e: PointerEvent): void => {
    sfx.unlock();
    if (this.cb.isBusy()) return;
    const p = this.cellAt(e);
    if (!p) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    const selected = this.cb.getSelected();
    if (selected && areAdjacent(selected, p)) {
      this.cb.onSelect(null);
      this.drag = null;
      this.cb.onSwapAttempt(selected, p);
      return;
    }
    this.cb.onSelect(p);
    this.drag = { start: p, x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId || this.cb.isBusy()) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const g = this.geom();
    const rect = this.canvas.getBoundingClientRect();
    const threshold = g.cell * (rect.width / g.cssW) * 0.3;
    if (Math.hypot(dx, dy) < threshold) return;
    const target: Pos =
      Math.abs(dx) > Math.abs(dy)
        ? { r: d.start.r, c: d.start.c + Math.sign(dx) }
        : { r: d.start.r + Math.sign(dy), c: d.start.c };
    this.drag = null;
    if (target.r < 0 || target.r >= ROWS || target.c < 0 || target.c >= COLS) return;
    this.cb.onSelect(null);
    this.cb.onSwapAttempt(d.start, target);
  };

  private onUp = (e: PointerEvent): void => {
    if (this.drag && this.drag.id === e.pointerId) this.drag = null;
  };
}
