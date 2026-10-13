import {
  COLS,
  ROWS,
  TYPES,
  areAdjacent,
  cellsOfRuns,
  collapse,
  createGrid,
  findMoves,
  findRuns,
  mulberry32,
  shuffleGrid,
  swapCells,
} from './board.ts';
import type { Fall, Gem, Grid, Pos, Rng } from './board.ts';
import { GEM_DEFS } from './gems.ts';
import type { GemArt } from './gems.ts';
import { drawFlower, drawLeaf } from './deco.ts';
import { sfx } from './audio.ts';
import { loadJSON, saveJSON } from './storage.ts';

interface Sprite {
  gem: Gem;
  x: number; // column position, in cell units (fractional while animating)
  y: number; // row position, in cell units
  sx: number;
  sy: number;
  a: number;
}

interface Tween {
  t0: number;
  durMs: number;
  update: (k: number) => void;
  done: () => void;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

interface MoveItem {
  s: Sprite;
  x: number;
  y: number;
  dur: number;
  ease: (t: number) => number;
}

export interface GameHooks {
  onScore(score: number, best: number): void;
  onToast(text: string): void;
}

const easeInQuad = (t: number): number => t * t;
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** roundRect() needs a fairly recent browser; arcTo works everywhere. */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

const COMBO_WORDS = ['', '', 'Sweet!', 'Juicy!', 'Fabulous!', 'Jem-tastic!'];

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private art: GemArt;
  private hooks: GameHooks;

  private grid: Grid = [];
  private sprites = new Map<number, Sprite>();
  private tweens: Tween[] = [];
  private particles: Particle[] = [];

  private cell = 48;
  private pad = 12;
  private bleed = 10;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private frame: HTMLCanvasElement | null = null;

  private busy = false;
  private gen = 0;
  private selected: Pos | null = null;
  private drag: { start: Pos; x: number; y: number; id: number } | null = null;

  private score = 0;
  private best: number = loadJSON<number>('jj.best', 0);
  private rng: Rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  private lastFrame = 0;

  constructor(canvas: HTMLCanvasElement, art: GemArt, hooks: GameHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.art = art;
    this.hooks = hooks;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointercancel', this.onUp);
    this.hooks.onScore(this.score, this.best);
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- layout

  layout(availW: number, availH: number): void {
    const unit = Math.min(availW / (COLS + 2 * 0.5), availH / (ROWS + 2 * 0.5));
    this.cell = Math.max(24, Math.floor(unit));
    this.pad = Math.round(this.cell * 0.28);
    this.bleed = Math.round(this.cell * 0.22);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = COLS * this.cell + 2 * (this.pad + this.bleed);
    this.cssH = ROWS * this.cell + 2 * (this.pad + this.bleed);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.art.clear?.();
    this.frame = this.buildFrame();
  }

  private get ox(): number {
    return this.bleed + this.pad;
  }
  private get oy(): number {
    return this.bleed + this.pad;
  }

  /** Pre-renders the pink floral frame, dark plum board, and checkered cells. */
  private buildFrame(): HTMLCanvasElement {
    const { cell, pad, bleed, dpr, cssW, cssH } = this;
    const cv = document.createElement('canvas');
    cv.width = this.canvas.width;
    cv.height = this.canvas.height;
    const c = cv.getContext('2d')!;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);

    const rr = (x: number, y: number, w: number, h: number, r: number): void => roundRectPath(c, x, y, w, h, r);

    // Frame band.
    const bx = bleed;
    const by = bleed;
    const bw = cssW - 2 * bleed;
    const bh = cssH - 2 * bleed;
    const band = c.createLinearGradient(0, by, 0, by + bh);
    band.addColorStop(0, '#ff9ccf');
    band.addColorStop(0.5, '#ff6fb5');
    band.addColorStop(1, '#e14b9f');
    rr(bx, by, bw, bh, cell * 0.42);
    c.fillStyle = band;
    c.fill();
    c.lineWidth = Math.max(2, cell * 0.05);
    c.strokeStyle = 'rgba(255,255,255,0.85)';
    c.stroke();

    // Dark plum board.
    const ix = bx + pad * 0.45;
    const iy = by + pad * 0.45;
    const iw = bw - pad * 0.9;
    const ih = bh - pad * 0.9;
    const plum = c.createLinearGradient(0, iy, 0, iy + ih);
    plum.addColorStop(0, '#47205f');
    plum.addColorStop(1, '#2a1240');
    rr(ix, iy, iw, ih, cell * 0.3);
    c.fillStyle = plum;
    c.fill();
    c.lineWidth = Math.max(1.5, cell * 0.03);
    c.strokeStyle = 'rgba(255,214,235,0.8)';
    c.stroke();

    // Checkered cells.
    const gap = cell * 0.04;
    for (let r = 0; r < ROWS; r++) {
      for (let col = 0; col < COLS; col++) {
        rr(this.ox + col * cell + gap, this.oy + r * cell + gap, cell - 2 * gap, cell - 2 * gap, cell * 0.14);
        c.fillStyle = (r + col) % 2 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.14)';
        c.fill();
      }
    }

    // Flowers + leaves around the frame.
    const leaf = '#7fd391';
    const midY = by + pad * 0.25;
    const rBand = Math.max(pad * 0.62, 9);
    const edge = (x: number, y: number, angle: number, ci: number): void => {
      drawLeaf(c, x, y, rBand * 2.1, angle - 0.5, leaf);
      drawLeaf(c, x, y, rBand * 2.1, angle + 0.5, leaf);
      const petals = ['#ffffff', '#ffe066', '#c59bff', '#7ec8ff'];
      drawFlower(c, x, y, rBand, petals[ci % petals.length]!, '#ff9a3c', 6, ci);
    };
    for (let i = 1; i < COLS; i += 2) {
      const x = this.ox + i * cell + cell * 0.5 * (i % 2 ? 1 : 0);
      edge(x, midY + pad * 0.1, -Math.PI / 2, i);
      edge(x, by + bh - pad * 0.35, Math.PI / 2, i + 1);
    }
    for (let i = 1; i < ROWS; i += 2) {
      const y = this.oy + i * cell;
      edge(bx + pad * 0.3, y, Math.PI, i + 2);
      edge(bx + bw - pad * 0.3, y, 0, i + 3);
    }
    const corner = (x: number, y: number, a: number, petal: string): void => {
      drawLeaf(c, x, y, cell * 0.55, a - 0.6, leaf);
      drawLeaf(c, x, y, cell * 0.55, a + 0.6, '#8fdca0');
      drawFlower(c, x, y, cell * 0.38, petal, '#ffe066', 7, a);
    };
    const o = cell * 0.24;
    corner(bx + o, by + o, (-3 * Math.PI) / 4, '#ffd84d');
    corner(bx + bw - o, by + o, -Math.PI / 4, '#c59bff');
    corner(bx + o, by + bh - o, (3 * Math.PI) / 4, '#7ec8ff');
    corner(bx + bw - o, by + bh - o, Math.PI / 4, '#ffffff');
    return cv;
  }

  // ------------------------------------------------------------- hints

  get isBusy(): boolean {
    return this.busy;
  }

  /** A random valid move, as on-screen client coordinates (used for testing, and later for hints). */
  getHint(): { ax: number; ay: number; bx: number; by: number } | null {
    if (this.busy) return null;
    const moves = findMoves(this.grid);
    if (moves.length === 0) return null;
    const m = moves[Math.floor(Math.random() * moves.length)]!;
    const rect = this.canvas.getBoundingClientRect();
    const k = rect.width / this.cssW;
    const pos = (p: Pos): { x: number; y: number } => ({
      x: rect.left + (this.ox + (p.c + 0.5) * this.cell) * k,
      y: rect.top + (this.oy + (p.r + 0.5) * this.cell) * k,
    });
    const a = pos(m.a);
    const b = pos(m.b);
    return { ax: a.x, ay: a.y, bx: b.x, by: b.y };
  }

  // ------------------------------------------------------------- game flow

  async newGame(): Promise<void> {
    this.gen++;
    const gen = this.gen;
    this.flushTweens();
    this.particles = [];
    this.selected = null;
    this.drag = null;
    this.score = 0;
    this.hooks.onScore(this.score, this.best);
    this.busy = true;

    this.grid = createGrid(ROWS, COLS, TYPES, this.rng);
    this.sprites.clear();
    const items: MoveItem[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const gem = this.grid[r]![c]!;
        const s: Sprite = { gem, x: c, y: r - ROWS - 1 - Math.random() * 2, sx: 1, sy: 1, a: 1 };
        this.sprites.set(gem.id, s);
        items.push({ s, x: c, y: r, dur: 0.35 + r * 0.05 + c * 0.015, ease: easeInQuad });
      }
    }
    await this.animateMany(items);
    if (gen !== this.gen) return;
    await this.landSquash(items.map((i) => i.s));
    if (gen === this.gen) this.busy = false;
  }

  private async attemptSwap(a: Pos, b: Pos): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    this.selected = null;
    const gen = this.gen;
    try {
      const ga = this.grid[a.r]![a.c]!;
      const gb = this.grid[b.r]![b.c]!;
      const sa = this.sprites.get(ga.id)!;
      const sb = this.sprites.get(gb.id)!;

      sfx.play('swap');
      await this.animateMany([
        { s: sa, x: b.c, y: b.r, dur: 0.16, ease: easeInOutCubic },
        { s: sb, x: a.c, y: a.r, dur: 0.16, ease: easeInOutCubic },
      ]);
      if (gen !== this.gen) return;
      swapCells(this.grid, a, b);

      if (findRuns(this.grid).length === 0) {
        swapCells(this.grid, a, b);
        sfx.play('invalid');
        await this.animateMany([
          { s: sa, x: a.c, y: a.r, dur: 0.16, ease: easeInOutCubic },
          { s: sb, x: b.c, y: b.r, dur: 0.16, ease: easeInOutCubic },
        ]);
        return;
      }

      await this.resolve(gen);
      if (gen !== this.gen) return;
      await this.ensurePlayable(gen);
    } finally {
      if (gen === this.gen) this.busy = false;
    }
  }

  /** Clear matches, drop, refill; repeat until the board settles. */
  private async resolve(gen: number): Promise<void> {
    let combo = 0;
    for (;;) {
      const runs = findRuns(this.grid);
      if (runs.length === 0) break;
      combo++;

      let pts = 0;
      for (const run of runs) {
        const n = run.cells.length;
        pts += n * 10 + (n === 4 ? 40 : n >= 5 ? 100 : 0);
      }
      this.score += pts * combo;
      if (this.score > this.best) {
        this.best = this.score;
        saveJSON('jj.best', this.best);
      }
      this.hooks.onScore(this.score, this.best);
      sfx.play('match', combo);
      if (combo >= 2) this.hooks.onToast(COMBO_WORDS[Math.min(combo, COMBO_WORDS.length - 1)]!);

      const cells = cellsOfRuns(runs);
      await this.clearCells(cells);
      if (gen !== this.gen) return;

      const { falls, spawns } = collapse(this.grid, TYPES, this.rng);
      const items: MoveItem[] = [];
      const moved: Sprite[] = [];
      const add = (f: Fall, isNew: boolean): void => {
        let s = this.sprites.get(f.gem.id);
        if (isNew || !s) {
          s = { gem: f.gem, x: f.c, y: f.fromR, sx: 1, sy: 1, a: 1 };
          this.sprites.set(f.gem.id, s);
        }
        const dist = f.toR - s.y;
        items.push({ s, x: f.c, y: f.toR, dur: Math.min(0.62, 0.13 + 0.07 * dist), ease: easeInQuad });
        moved.push(s);
      };
      for (const f of falls) add(f, false);
      for (const f of spawns) add(f, true);
      await this.animateMany(items);
      if (gen !== this.gen) return;
      await this.landSquash(moved);
      if (gen !== this.gen) return;
    }
  }

  private async clearCells(cells: Pos[]): Promise<void> {
    const targets: Sprite[] = [];
    for (const p of cells) {
      const gem = this.grid[p.r]![p.c]!;
      const s = this.sprites.get(gem.id);
      if (s) {
        targets.push(s);
        this.burst(s.x, s.y, GEM_DEFS[gem.type]!.base);
      }
      this.grid[p.r]![p.c] = null;
    }
    await this.tween(0.24, (k) => {
      const grow = k < 0.25 ? 1 + 0.3 * (k / 0.25) : 1.3 * (1 - (k - 0.25) / 0.75);
      const alpha = k < 0.25 ? 1 : 1 - (k - 0.25) / 0.75;
      for (const s of targets) {
        s.sx = grow;
        s.sy = grow;
        s.a = alpha;
      }
    });
    for (const s of targets) this.sprites.delete(s.gem.id);
  }

  private async landSquash(list: Sprite[]): Promise<void> {
    await this.tween(0.13, (k) => {
      const w = Math.sin(Math.PI * k);
      for (const s of list) {
        s.sx = 1 + 0.1 * w;
        s.sy = 1 - 0.14 * w;
      }
    });
    for (const s of list) {
      s.sx = 1;
      s.sy = 1;
    }
  }

  private async ensurePlayable(gen: number): Promise<void> {
    if (findMoves(this.grid).length > 0) return;
    this.hooks.onToast('No moves - shuffling!');
    sfx.play('shuffle');
    await new Promise<void>((r) => setTimeout(r, 450));
    if (gen !== this.gen) return;
    shuffleGrid(this.grid, TYPES, this.rng);
    const items: MoveItem[] = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        const s = this.sprites.get(this.grid[r]![c]!.id);
        if (s) items.push({ s, x: c, y: r, dur: 0.5, ease: easeInOutCubic });
      }
    }
    await this.animateMany(items);
  }

  // ------------------------------------------------------------- animation

  private tween(durSec: number, update: (k: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.push({ t0: performance.now(), durMs: durSec * 1000, update, done: resolve });
    });
  }

  private animateMany(items: MoveItem[]): Promise<void> {
    if (items.length === 0) return Promise.resolve();
    const starts = items.map((i) => ({ x: i.s.x, y: i.s.y }));
    const maxDur = Math.max(...items.map((i) => i.dur));
    return this.tween(maxDur, (k) => {
      items.forEach((it, idx) => {
        const local = Math.min(1, (k * maxDur) / it.dur);
        const e = it.ease(local);
        const st = starts[idx]!;
        it.s.x = st.x + (it.x - st.x) * e;
        it.s.y = st.y + (it.y - st.y) * e;
      });
    });
  }

  /** Finish every running tween immediately (used when a new game interrupts). */
  private flushTweens(): void {
    const pending = this.tweens;
    this.tweens = [];
    for (const t of pending) {
      t.update(1);
      t.done();
    }
  }

  private burst(x: number, y: number, color: string): void {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.6;
      this.particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.2,
        life: 0.55,
        max: 0.55,
        size: 0.05 + Math.random() * 0.07,
        color,
      });
    }
  }

  // ----------------------------------------------------------------- input

  private cellAt(e: PointerEvent): Pos | null {
    const rect = this.canvas.getBoundingClientRect();
    const scale = this.cssW / rect.width || 1;
    const x = (e.clientX - rect.left) * scale - this.ox;
    const y = (e.clientY - rect.top) * scale - this.oy;
    const c = Math.floor(x / this.cell);
    const r = Math.floor(y / this.cell);
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null;
    return { r, c };
  }

  private onDown = (e: PointerEvent): void => {
    sfx.unlock();
    if (this.busy) return;
    const p = this.cellAt(e);
    if (!p) return;
    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);
    if (this.selected && areAdjacent(this.selected, p)) {
      const a = this.selected;
      this.selected = null;
      this.drag = null;
      void this.attemptSwap(a, p);
      return;
    }
    this.selected = p;
    this.drag = { start: p, x: e.clientX, y: e.clientY, id: e.pointerId };
  };

  private onMove = (e: PointerEvent): void => {
    const d = this.drag;
    if (!d || d.id !== e.pointerId || this.busy) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    const rect = this.canvas.getBoundingClientRect();
    const threshold = this.cell * (rect.width / this.cssW) * 0.3;
    if (Math.hypot(dx, dy) < threshold) return;
    const target: Pos =
      Math.abs(dx) > Math.abs(dy)
        ? { r: d.start.r, c: d.start.c + Math.sign(dx) }
        : { r: d.start.r + Math.sign(dy), c: d.start.c };
    this.drag = null;
    if (target.r < 0 || target.r >= ROWS || target.c < 0 || target.c >= COLS) return;
    this.selected = null;
    void this.attemptSwap(d.start, target);
  };

  private onUp = (e: PointerEvent): void => {
    if (this.drag && this.drag.id === e.pointerId) this.drag = null;
  };

  // ------------------------------------------------------------- rendering

  private loop = (now: number): void => {
    const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.step(dt);
    this.draw(now);
    requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    const t = performance.now();
    const running = this.tweens;
    this.tweens = [];
    for (const tw of running) {
      const k = Math.max(0, Math.min(1, (t - tw.t0) / tw.durMs));
      tw.update(k);
      if (k >= 1) tw.done();
      else this.tweens.push(tw);
    }
    for (const p of this.particles) {
      p.life -= dt;
      p.vy += 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
  }

  private draw(now: number): void {
    const { ctx, cell, dpr } = this;
    if (this.cssW === 0) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (this.frame) ctx.drawImage(this.frame, 0, 0, this.cssW, this.cssH);

    ctx.save();
    ctx.beginPath();
    ctx.rect(this.ox, this.oy, COLS * cell, ROWS * cell);
    ctx.clip();

    const pulse = 0.5 + 0.5 * Math.sin(now / 170);
    let selId = -1;
    if (this.selected) {
      const sg = this.grid[this.selected.r]?.[this.selected.c];
      if (sg) selId = sg.id;
      const x = this.ox + this.selected.c * cell;
      const y = this.oy + this.selected.r * cell;
      roundRectPath(ctx, x + cell * 0.03, y + cell * 0.03, cell * 0.94, cell * 0.94, cell * 0.16);
      ctx.fillStyle = `rgba(255,255,255,${0.16 + 0.12 * pulse})`;
      ctx.fill();
      ctx.lineWidth = Math.max(2, cell * 0.05);
      ctx.strokeStyle = `rgba(255,236,150,${0.65 + 0.35 * pulse})`;
      ctx.stroke();
    }

    const px = Math.ceil(cell * dpr);
    for (const s of this.sprites.values()) {
      const bump = s.gem.id === selId ? 1 + 0.07 * pulse : 1;
      ctx.save();
      ctx.translate(this.ox + (s.x + 0.5) * cell, this.oy + (s.y + 0.5) * cell);
      ctx.scale(s.sx * bump, s.sy * bump);
      ctx.globalAlpha = Math.max(0, s.a);
      ctx.drawImage(this.art.get(s.gem.type, px), -cell / 2, -cell / 2, cell, cell);
      ctx.restore();
    }

    for (const p of this.particles) {
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
    ctx.restore();
  }
}
