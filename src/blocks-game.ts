// Canvas front-end for the block puzzle: draws the board + piece tray, handles
// drag-and-drop, and animates clears. All rules live in blocks.ts.

import { mulberry32 } from './board.ts';
import type { Rng } from './board.ts';
import {
  BLOCK_SIZE,
  TRAY_SIZE,
  anyMoves,
  applyMove,
  canPlace,
  createBlockGrid,
  findFullLines,
  nextTray,
  stageFor,
} from './blocks.ts';
import type { BlockGrid, ClearedCell, Piece } from './blocks.ts';
import { buildBlockLevelGrid } from './blocks-levels.ts';
import type { BlockLevelConfig } from './blocks-levels.ts';
import { GEM_DEFS } from './gems.ts';
import { roundRectPath } from './board-render.ts';
import { ParticleSystem } from './particles.ts';
import { sfx } from './audio.ts';
import { loadJSON, saveJSON } from './storage.ts';

export interface BlockRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BlockHooks {
  onScore(score: number, best: number): void;
  onStage(stage: number): void;
  onToast(text: string): void;
  /** Board rectangle in CSS px relative to the canvas, so the page can place decoration around it. */
  onLayout(rect: BlockRect): void;
  onGameOver(result: { score: number; best: number; newBest: boolean }): void;
  /** Level mode: how many jewels are collected out of the goal. */
  onJewels(collected: number, goal: number): void;
  onLevelEnd(result: { won: boolean; score: number; jewels: number; goal: number }): void;
}

const BEST_KEY = 'jj.blocks.best';
const FADE_MS = 340;
const DEAL_MS = 300;

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: number, t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number): number => Math.round(v + (target - v) * t);
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

function baseColor(color: number): string {
  return GEM_DEFS[color % GEM_DEFS.length]!.base;
}

const JEWEL_BURST = '#36c6ff';

/** A tan crate with a cyan diamond in it: collected when its row or column clears. */
function drawJewelCrate(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  const inset = size * 0.045;
  const s = size - 2 * inset;
  const radius = size * 0.17;
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, '#fbe6bd');
  grad.addColorStop(0.5, '#efcd8f');
  grad.addColorStop(1, '#cf9a55');
  roundRectPath(ctx, x + inset, y + inset, s, s, radius);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeStyle = '#9c6a2b';
  ctx.stroke();

  const bevel = size * 0.13;
  roundRectPath(ctx, x + inset + bevel, y + inset + bevel, s - 2 * bevel, s - 2 * bevel, radius * 0.6);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.fill();

  const cx = x + size / 2;
  const cy = y + size / 2;
  const d = size * 0.27;
  ctx.beginPath();
  ctx.moveTo(cx, cy - d);
  ctx.lineTo(cx + d, cy);
  ctx.lineTo(cx, cy + d);
  ctx.lineTo(cx - d, cy);
  ctx.closePath();
  const gem = ctx.createLinearGradient(cx - d, cy - d, cx + d, cy + d);
  gem.addColorStop(0, '#c4f6ff');
  gem.addColorStop(0.5, '#2fb9f4');
  gem.addColorStop(1, '#0d7bc0');
  ctx.fillStyle = gem;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.035);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - d);
  ctx.lineTo(cx - d, cy);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.fill();
}

/** A beveled, gem-toned square (or a jewel crate). */
export function drawBlock(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  color: number,
  jewel = false,
): void {
  if (jewel) {
    drawJewelCrate(ctx, x, y, size);
    return;
  }
  const base = baseColor(color);
  const inset = size * 0.045;
  const s = size - 2 * inset;
  const radius = size * 0.17;
  const grad = ctx.createLinearGradient(x, y, x + size, y + size);
  grad.addColorStop(0, mix(base, 255, 0.4));
  grad.addColorStop(0.5, base);
  grad.addColorStop(1, mix(base, 0, 0.3));
  roundRectPath(ctx, x + inset, y + inset, s, s, radius);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeStyle = mix(base, 0, 0.35);
  ctx.stroke();

  const bevel = size * 0.13;
  roundRectPath(ctx, x + inset + bevel, y + inset + bevel, s - 2 * bevel, s - 2 * bevel, radius * 0.6);
  const inner = ctx.createLinearGradient(x, y, x + size, y + size);
  inner.addColorStop(0, 'rgba(255,255,255,0.32)');
  inner.addColorStop(1, 'rgba(255,255,255,0.02)');
  ctx.fillStyle = inner;
  ctx.fill();
}

interface Fade extends ClearedCell {
  start: number;
}

interface Drag {
  slot: number;
  pointerId: number;
  x: number;
  y: number;
  /** 0 = still tray-sized, 1 = full board-cell size; eases up after pickup. */
  k: number;
}

export class BlockGame {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private hooks: BlockHooks;

  private grid: BlockGrid = createBlockGrid();
  private tray: Array<Piece | null> = [];
  private score = 0;
  private best: number = loadJSON<number>(BEST_KEY, 0);
  private streak = 0;
  private stage = 0;
  private over = false;
  private mode: 'endless' | 'level' = 'endless';
  private level: BlockLevelConfig | null = null;
  private jewelsCollected = 0;
  private rng: Rng = mulberry32((Date.now() ^ 0x5bd1e995) >>> 0);
  private gen = 0;

  private fades: Fade[] = [];
  private particles = new ParticleSystem();
  private dealtAt = -Infinity;
  private drag: Drag | null = null;
  private running = false;
  private lastFrame = 0;

  private cssW = 0;
  private cssH = 0;
  private dpr = 1;
  private cell = 40;
  private pad = 10;
  private bx = 0;
  private by = 0;
  private bw = 0;
  private bh = 0;
  private trayTop = 0;
  private trayH = 0;

  constructor(canvas: HTMLCanvasElement, hooks: BlockHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.hooks = hooks;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onCancel);
    this.newGame();
  }

  // ------------------------------------------------------------------ state

  newGame(): void {
    this.gen++;
    this.mode = 'endless';
    this.level = null;
    this.jewelsCollected = 0;
    this.grid = createBlockGrid();
    this.score = 0;
    this.streak = 0;
    this.stage = 0;
    this.over = false;
    this.fades = [];
    this.drag = null;
    this.particles.list = [];
    this.tray = nextTray(this.grid, this.rng, this.stage);
    this.dealtAt = performance.now();
    this.hooks.onScore(this.score, this.best);
    this.hooks.onStage(this.stage);
  }

  /** Starts a jewel-collecting level: pre-filled board, win by collecting the goal count. */
  startLevel(cfg: BlockLevelConfig): void {
    this.gen++;
    this.mode = 'level';
    this.level = cfg;
    this.jewelsCollected = 0;
    this.grid = buildBlockLevelGrid(cfg);
    this.score = 0;
    this.streak = 0;
    this.stage = cfg.stage;
    this.over = false;
    this.fades = [];
    this.drag = null;
    this.particles.list = [];
    this.tray = nextTray(this.grid, this.rng, this.stage, cfg.jewelRate, true);
    this.dealtAt = performance.now();
    this.hooks.onScore(this.score, this.best);
    this.hooks.onJewels(0, cfg.goal);
  }

  /** Snapshot for tests/debugging. */
  get state(): {
    grid: BlockGrid;
    tray: Array<Piece | null>;
    score: number;
    stage: number;
    over: boolean;
    jewels: number;
  } {
    return {
      grid: this.grid,
      tray: this.tray,
      score: this.score,
      stage: this.stage,
      over: this.over,
      jewels: this.jewelsCollected,
    };
  }

  /** Places tray piece `slot` with its top-left at (r, c). Returns false if it doesn't fit. */
  tryPlace(slot: number, r: number, c: number): boolean {
    const piece = this.tray[slot];
    if (!piece || this.over || !canPlace(this.grid, piece.shape, r, c)) return false;

    const res = applyMove(this.grid, piece, r, c, this.streak);
    this.tray[slot] = null;
    this.streak = res.streak;
    this.score += res.points;
    if (this.mode === 'endless' && this.score > this.best) {
      this.best = this.score;
      saveJSON(BEST_KEY, this.best);
    }
    this.hooks.onScore(this.score, this.best);

    const now = performance.now();
    const lines = res.rows.length + res.cols.length;
    if (lines > 0) {
      for (const cell of res.cleared) {
        this.fades.push({ ...cell, start: now });
        this.particles.burst(cell.c, cell.r, cell.jewel ? JEWEL_BURST : baseColor(cell.color));
        if (cell.jewel) this.particles.burst(cell.c, cell.r, '#ffffff');
      }
      if (this.mode === 'level' && res.jewels > 0) {
        this.jewelsCollected += res.jewels;
        this.hooks.onJewels(this.jewelsCollected, this.level!.goal);
      }
      sfx.play(lines > 1 ? 'special' : 'match', Math.max(1, res.streak));
      if (this.mode === 'level' && res.jewels > 0) this.hooks.onToast(`보석 +${res.jewels}! Jewels +${res.jewels}`);
      else if (res.streak >= 2) this.hooks.onToast(`연속 x${res.streak}! Streak x${res.streak}`);
      else if (lines === 2) this.hooks.onToast('멋져요! Nice!');
      else if (lines === 3) this.hooks.onToast('대단해요! Great!');
      else if (lines >= 4) this.hooks.onToast('최고예요! Amazing!');
    } else {
      sfx.play('swap');
    }

    const newStage = this.mode === 'level' ? this.stage : stageFor(this.score);
    if (newStage > this.stage) {
      this.stage = newStage;
      this.hooks.onStage(this.stage);
      if (lines === 0) this.hooks.onToast(`단계 ${this.stage + 1}! Stage ${this.stage + 1}`);
    }

    if (this.tray.every((p) => p === null)) {
      this.tray = nextTray(this.grid, this.rng, this.stage, this.level?.jewelRate ?? 0);
      this.dealtAt = now;
    }

    if (this.mode === 'level' && this.jewelsCollected >= this.level!.goal) this.endGame(true);
    else if (!anyMoves(this.grid, this.tray)) this.endGame(false);
    return true;
  }

  private endGame(won: boolean): void {
    this.over = true;
    const gen = this.gen;
    const level = this.mode === 'level' ? this.level : null;
    const newBest = this.score > 0 && this.score >= this.best;
    window.setTimeout(() => {
      if (gen !== this.gen) return;
      if (level) {
        sfx.play(won ? 'combo' : 'invalid');
        this.hooks.onLevelEnd({ won, score: this.score, jewels: this.jewelsCollected, goal: level.goal });
        return;
      }
      sfx.play('invalid');
      this.hooks.onGameOver({ score: this.score, best: this.best, newBest });
    }, 700);
  }

  // ----------------------------------------------------------------- layout

  layout(availW: number, availH: number): void {
    if (availW <= 0 || availH <= 0) return;
    this.cssW = availW;
    this.cssH = availH;
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    // Vertical budget in cells: board (8 + padding) + gap + tray.
    this.cell = Math.max(20, Math.floor(Math.min(availW / (BLOCK_SIZE + 0.7), availH / (BLOCK_SIZE + 4.2))));
    this.pad = Math.round(this.cell * 0.25);
    this.bw = BLOCK_SIZE * this.cell + 2 * this.pad;
    this.bh = this.bw;
    this.trayH = Math.round(this.cell * 3.3);
    const gap = Math.round(this.cell * 0.35);
    const groupH = this.bh + gap + this.trayH;
    this.by = Math.max(0, Math.floor((availH - groupH) / 2));
    this.bx = Math.floor((availW - this.bw) / 2);
    this.trayTop = this.by + this.bh + gap;

    this.canvas.style.width = `${availW}px`;
    this.canvas.style.height = `${availH}px`;
    this.canvas.width = Math.round(availW * this.dpr);
    this.canvas.height = Math.round(availH * this.dpr);
    // Decorations sit slightly outside the board edge (like the match board's bleed margin) so they don't hide edge cells.
    const bleed = Math.round(this.cell * 0.22);
    this.hooks.onLayout({ x: this.bx - bleed, y: this.by - bleed, w: this.bw + 2 * bleed, h: this.bh + 2 * bleed });
  }

  private get ox(): number {
    return this.bx + this.pad;
  }
  private get oy(): number {
    return this.by + this.pad;
  }

  private slotRect(i: number): { x: number; y: number; w: number; h: number } {
    const w = this.bw / TRAY_SIZE;
    return { x: this.bx + i * w, y: this.trayTop, w, h: this.trayH };
  }

  /** Where a resting tray piece is drawn: top-left and per-cell size. */
  private trayPlacement(i: number, piece: Piece): { x: number; y: number; size: number } {
    const slot = this.slotRect(i);
    const { w, h } = piece.shape;
    const size = Math.min(this.cell * 0.62, (slot.w * 0.88) / w, (slot.h * 0.9) / h);
    return { x: slot.x + (slot.w - w * size) / 2, y: slot.y + (slot.h - h * size) / 2, size };
  }

  // ------------------------------------------------------------------ input

  private toCanvas(e: PointerEvent): { x: number; y: number } {
    const rect = this.canvas.getBoundingClientRect();
    const sx = this.cssW / (rect.width || 1);
    const sy = this.cssH / (rect.height || 1);
    return { x: (e.clientX - rect.left) * sx, y: (e.clientY - rect.top) * sy };
  }

  private slotAt(x: number, y: number): number {
    if (y < this.trayTop - this.cell * 0.3) return -1;
    for (let i = 0; i < TRAY_SIZE; i++) {
      const s = this.slotRect(i);
      if (x >= s.x && x < s.x + s.w && this.tray[i]) return i;
    }
    return -1;
  }

  /** Board cell the dragged piece's top-left would snap to. */
  private snap(d: Drag, piece: Piece): { r: number; c: number } {
    const left = d.x - (piece.shape.w * this.cell) / 2;
    const top = d.y - piece.shape.h * this.cell - this.cell * 0.9;
    return { c: Math.round((left - this.ox) / this.cell), r: Math.round((top - this.oy) / this.cell) };
  }

  private onDown = (e: PointerEvent): void => {
    sfx.unlock();
    if (this.over || this.drag) return;
    const p = this.toCanvas(e);
    const slot = this.slotAt(p.x, p.y);
    if (slot < 0) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    this.drag = { slot, pointerId: e.pointerId, x: p.x, y: p.y, k: 0 };
  };

  private onMove = (e: PointerEvent): void => {
    if (!this.drag || this.drag.pointerId !== e.pointerId) return;
    const p = this.toCanvas(e);
    this.drag.x = p.x;
    this.drag.y = p.y;
  };

  private onUp = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.pointerId !== e.pointerId) return;
    const p = this.toCanvas(e);
    d.x = p.x;
    d.y = p.y;
    this.drag = null;
    const piece = this.tray[d.slot];
    if (!piece) return;
    const { r, c } = this.snap(d, piece);
    if (!this.tryPlace(d.slot, r, c) && p.y < this.trayTop - this.cell * 0.3) sfx.play('invalid');
  };

  private onCancel = (e: PointerEvent): void => {
    if (this.drag && this.drag.pointerId === e.pointerId) this.drag = null;
  };

  // -------------------------------------------------------------- rendering

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrame = performance.now();
    requestAnimationFrame(this.loop);
  }

  stop(): void {
    this.running = false;
    this.drag = null;
  }

  private loop = (now: number): void => {
    if (!this.running) return;
    this.step(now);
    requestAnimationFrame(this.loop);
  };

  /** One simulation + draw tick (public so automated tests can pump frames by hand). */
  step(now: number): void {
    const dt = Math.min(0.05, (now - this.lastFrame) / 1000 || 0);
    this.lastFrame = now;
    this.particles.step(dt);
    this.fades = this.fades.filter((f) => now - f.start < FADE_MS);
    if (this.drag) this.drag.k += (1 - this.drag.k) * 0.35;
    this.draw(now);
  }

  private draw(now: number): void {
    const { ctx, cell, dpr } = this;
    if (this.cssW === 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);

    this.drawBoard();

    // What the held piece would do if dropped now.
    let ghost: { piece: Piece; r: number; c: number } | null = null;
    let willClear: { rows: number[]; cols: number[] } = { rows: [], cols: [] };
    if (this.drag) {
      const piece = this.tray[this.drag.slot];
      if (piece) {
        const { r, c } = this.snap(this.drag, piece);
        if (canPlace(this.grid, piece.shape, r, c)) {
          ghost = { piece, r, c };
          const trial = this.grid.map((row) => row.slice());
          for (const [dr, dc] of piece.shape.cells) trial[r + dr]![c + dc] = { color: piece.color, jewel: false };
          willClear = findFullLines(trial);
        }
      }
    }

    if (willClear.rows.length || willClear.cols.length) {
      ctx.fillStyle = 'rgba(255,214,102,0.42)';
      for (let r = 0; r < BLOCK_SIZE; r++) {
        for (let c = 0; c < BLOCK_SIZE; c++) {
          if (!willClear.rows.includes(r) && !willClear.cols.includes(c)) continue;
          roundRectPath(ctx, this.ox + c * cell + cell * 0.04, this.oy + r * cell + cell * 0.04, cell * 0.92, cell * 0.92, cell * 0.15);
          ctx.fill();
        }
      }
    }

    for (let r = 0; r < BLOCK_SIZE; r++) {
      for (let c = 0; c < BLOCK_SIZE; c++) {
        const v = this.grid[r]![c];
        if (v) drawBlock(ctx, this.ox + c * cell, this.oy + r * cell, cell, v.color, v.jewel);
      }
    }

    for (const f of this.fades) {
      const t = Math.min(1, (now - f.start) / FADE_MS);
      const size = cell * (1 - 0.7 * t);
      ctx.globalAlpha = 1 - t;
      drawBlock(ctx, this.ox + f.c * cell + (cell - size) / 2, this.oy + f.r * cell + (cell - size) / 2, size, f.color, f.jewel);
    }
    ctx.globalAlpha = 1;

    if (ghost) {
      ctx.globalAlpha = 0.5;
      const gp = ghost.piece;
      gp.shape.cells.forEach(([dr, dc], i) => {
        drawBlock(ctx, this.ox + (ghost.c + dc) * cell, this.oy + (ghost.r + dr) * cell, cell, gp.color, gp.jewels.includes(i));
      });
      ctx.globalAlpha = 1;
    }

    this.drawTray(now);

    for (const p of this.particles.list) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(this.ox + p.x * cell, this.oy + p.y * cell, p.size * cell, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(this.ox + p.x * cell, this.oy + p.y * cell, p.size * cell * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    if (this.drag) this.drawHeld(this.drag);
  }

  private drawBoard(): void {
    const { ctx, cell } = this;
    const cream = ctx.createLinearGradient(0, this.by, 0, this.by + this.bh);
    cream.addColorStop(0, '#fff6e6');
    cream.addColorStop(1, '#ffe9c4');
    ctx.save();
    ctx.shadowColor = 'rgba(120,80,30,0.3)';
    ctx.shadowBlur = cell * 0.4;
    ctx.shadowOffsetY = cell * 0.18;
    roundRectPath(ctx, this.bx, this.by, this.bw, this.bh, cell * 0.3);
    ctx.fillStyle = cream;
    ctx.fill();
    ctx.restore();
    ctx.lineWidth = Math.max(1.5, cell * 0.03);
    ctx.strokeStyle = 'rgba(201,148,58,0.45)';
    ctx.stroke();

    const gap = cell * 0.04;
    for (let r = 0; r < BLOCK_SIZE; r++) {
      for (let c = 0; c < BLOCK_SIZE; c++) {
        roundRectPath(ctx, this.ox + c * cell + gap, this.oy + r * cell + gap, cell - 2 * gap, cell - 2 * gap, cell * 0.14);
        ctx.fillStyle = (r + c) % 2 ? 'rgba(201,148,58,0.06)' : 'rgba(201,148,58,0.12)';
        ctx.fill();
      }
    }
  }

  private drawTray(now: number): void {
    const { ctx } = this;
    const t = Math.min(1, (now - this.dealtAt) / DEAL_MS);
    const ease = 1 - (1 - t) * (1 - t);
    for (let i = 0; i < TRAY_SIZE; i++) {
      const piece = this.tray[i];
      if (!piece || this.drag?.slot === i) continue;
      const { x, y, size } = this.trayPlacement(i, piece);
      const cx = x + (piece.shape.w * size) / 2;
      const cy = y + (piece.shape.h * size) / 2;
      const s = 0.55 + 0.45 * ease;
      ctx.save();
      ctx.globalAlpha = ease;
      ctx.translate(cx, cy);
      ctx.scale(s, s);
      ctx.translate(-cx, -cy);
      piece.shape.cells.forEach(([dr, dc], i) =>
        drawBlock(ctx, x + dc * size, y + dr * size, size, piece.color, piece.jewels.includes(i)),
      );
      ctx.restore();
    }
  }

  private drawHeld(d: Drag): void {
    const piece = this.tray[d.slot];
    if (!piece) return;
    const { ctx } = this;
    const from = this.trayPlacement(d.slot, piece).size;
    const size = from + (this.cell - from) * d.k;
    const left = d.x - (piece.shape.w * size) / 2;
    const top = d.y - piece.shape.h * size - this.cell * 0.9 * d.k;
    ctx.save();
    ctx.shadowColor = 'rgba(80,40,20,0.35)';
    ctx.shadowBlur = this.cell * 0.35;
    ctx.shadowOffsetY = this.cell * 0.12;
    piece.shape.cells.forEach(([dr, dc], i) =>
      drawBlock(ctx, left + dc * size, top + dr * size, size, piece.color, piece.jewels.includes(i)),
    );
    ctx.restore();
  }
}
