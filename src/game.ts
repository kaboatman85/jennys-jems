import {
  COLS,
  ROWS,
  TYPES,
  cellsOfRuns,
  collapse,
  collectDroppedItems,
  createGrid,
  findMoves,
  findRuns,
  mulberry32,
  shuffleGrid,
  swapCells,
} from './board.ts';
import type { Fall, Grid, Mask, Pos, Rng } from './board.ts';
import { DropItemOverlaySprites, GEM_DEFS, ObstacleOverlaySprites, SpecialOverlaySprites } from './gems.ts';
import type { GemArt, ObstacleArt, OverlayArt } from './gems.ts';
import { comboActivation, expandActivation, planSpecials } from './specials.ts';
import type { ActivationResult } from './specials.ts';
import { sfx } from './audio.ts';
import { loadJSON, saveJSON } from './storage.ts';
import { TweenEngine, easeInOutCubic, easeInQuad } from './tween.ts';
import { animateMany, landSquash } from './sprites.ts';
import type { MoveItem, Sprite } from './sprites.ts';
import { ParticleSystem } from './particles.ts';
import { BoardInput } from './board-input.ts';
import type { BoardGeometry } from './board-input.ts';
import { buildFrame, draw, loadFrameOverlay } from './board-render.ts';
import { applyClear, applyDropItems, applyObstaclesCleared, applyScore, checkOutcome, createLevelState, recordMove } from './level.ts';
import type { LevelConfig, LevelState, Objective } from './level.ts';

export interface ObjectiveProgressView {
  kind: Objective['kind'];
  current: number;
  target: number;
  color?: number;
}

export interface GameHooks {
  onScore(score: number, best: number): void;
  onToast(text: string): void;
  onMoves?(remaining: number, limit: number): void;
  onObjective?(progress: ObjectiveProgressView[]): void;
  onLevelComplete?(result: { score: number; movesUsed: number; movesLimit: number }): void;
  onLevelFailed?(result: { score: number; reason: 'moves' }): void;
}

const COMBO_WORDS = ['', '', '달콤해요!', '짜릿해요!', '환상적이에요!', '최고예요!'];
const COMBO_SWAP_BONUS = 150;

const posKey = (p: Pos): number => p.r * 1000 + p.c;

export class Game {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private art: GemArt;
  private overlayArt: OverlayArt = new SpecialOverlaySprites();
  private obstacleArt: ObstacleArt = new ObstacleOverlaySprites();
  private dropItemArt = new DropItemOverlaySprites();
  private hooks: GameHooks;

  private grid: Grid = [];
  private rows = ROWS;
  private cols = COLS;
  private nTypes = TYPES;
  private mask: Mask | undefined;
  private sprites = new Map<number, Sprite>();
  private tweenEngine = new TweenEngine();
  private particles = new ParticleSystem();

  private cell = 48;
  private pad = 12;
  private bleed = 10;
  private dpr = 1;
  private cssW = 0;
  private cssH = 0;
  private frame: HTMLCanvasElement | null = null;
  private lastAvailW = 0;
  private lastAvailH = 0;

  private busy = false;
  private gen = 0;
  private selected: Pos | null = null;

  private score = 0;
  private best: number = loadJSON<number>('jj.best', 0);
  private rng: Rng = mulberry32((Date.now() ^ 0x9e3779b9) >>> 0);
  private lastFrame = 0;

  private levelConfig: LevelConfig | null = null;
  private levelState: LevelState | null = null;
  private levelEnded = false;

  constructor(canvas: HTMLCanvasElement, art: GemArt, hooks: GameHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.art = art;
    this.hooks = hooks;
    new BoardInput(
      canvas,
      (): BoardGeometry => ({
        ox: this.ox,
        oy: this.oy,
        cell: this.cell,
        cssW: this.cssW,
        rows: this.rows,
        cols: this.cols,
      }),
      {
        isBusy: () => this.busy,
        isPlayable: (p) => {
          const cell = this.grid[p.r]?.[p.c];
          return !!cell && !cell.obstacle;
        },
        getSelected: () => this.selected,
        onSelect: (p) => {
          this.selected = p;
        },
        onSwapAttempt: (a, b) => {
          void this.attemptSwap(a, b);
        },
      },
    );
    this.hooks.onScore(this.score, this.best);
    loadFrameOverlay(() => { /* redraws on next rAF automatically */ });
    requestAnimationFrame(this.loop);
  }

  // ---------------------------------------------------------------- layout

  layout(availW: number, availH: number): void {
    this.lastAvailW = availW;
    this.lastAvailH = availH;
    const unit = Math.min(availW / (this.cols + 2 * 0.5), availH / (this.rows + 2 * 0.5));
    this.cell = Math.max(24, Math.floor(unit));
    this.pad = Math.round(this.cell * 0.28);
    this.bleed = Math.round(this.cell * 0.22);
    this.dpr = Math.min(window.devicePixelRatio || 1, 3);
    this.cssW = this.cols * this.cell + 2 * (this.pad + this.bleed);
    this.cssH = this.rows * this.cell + 2 * (this.pad + this.bleed);
    this.canvas.style.width = `${this.cssW}px`;
    this.canvas.style.height = `${this.cssH}px`;
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
    this.art.clear?.();
    this.overlayArt.clear?.();
    this.obstacleArt.clear?.();
    this.dropItemArt.clear();
    this.frame = buildFrame({
      rows: this.rows,
      cols: this.cols,
      mask: this.mask,
      cell: this.cell,
      pad: this.pad,
      bleed: this.bleed,
      dpr: this.dpr,
      cssW: this.cssW,
      cssH: this.cssH,
      ox: this.ox,
      oy: this.oy,
      canvasW: this.canvas.width,
      canvasH: this.canvas.height,
    });
  }

  private get ox(): number {
    return this.bleed + this.pad;
  }
  private get oy(): number {
    return this.bleed + this.pad;
  }

  // ------------------------------------------------------------- hints

  get isBusy(): boolean {
    return this.busy;
  }

  get level(): LevelState | null {
    return this.levelState;
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

  /** Open-ended endless mode: fixed 8x8 board, no objectives or move limit. */
  async newGame(): Promise<void> {
    this.gen++;
    const gen = this.gen;
    this.tweenEngine.flush();
    this.particles.list = [];
    this.selected = null;
    this.levelConfig = null;
    this.levelState = null;
    this.levelEnded = false;
    this.rows = ROWS;
    this.cols = COLS;
    this.nTypes = TYPES;
    this.mask = undefined;
    this.score = 0;
    this.hooks.onScore(this.score, this.best);
    this.busy = true;

    const grid = createGrid(this.rows, this.cols, this.nTypes, this.rng);
    await this.dealGrid(gen, grid);
    if (gen === this.gen) this.busy = false;
  }

  /** Level mode: fixed objectives, move limit, optional mask/obstacles/drop items. */
  async startLevel(config: LevelConfig): Promise<void> {
    this.gen++;
    const gen = this.gen;
    this.tweenEngine.flush();
    this.particles.list = [];
    this.selected = null;
    this.levelConfig = config;
    this.levelState = createLevelState(config);
    this.levelEnded = false;
    this.rows = config.rows;
    this.cols = config.cols;
    this.nTypes = config.nTypes;
    this.mask = config.mask;
    this.rng = mulberry32(config.seed);
    this.score = 0;
    this.hooks.onScore(this.score, this.best);
    this.hooks.onMoves?.(this.levelState.movesRemaining, this.levelState.moveLimit);
    this.hooks.onObjective?.(this.objectiveView());
    this.busy = true;

    if (this.lastAvailW > 0 && this.lastAvailH > 0) this.layout(this.lastAvailW, this.lastAvailH);

    const grid = createGrid(this.rows, this.cols, this.nTypes, this.rng, this.mask);
    for (const ob of config.obstacles) {
      const cell = grid[ob.pos.r]?.[ob.pos.c];
      if (cell) cell.obstacle = { kind: ob.kind, hits: ob.hits };
    }
    for (const pos of config.dropItems) {
      const cell = grid[pos.r]?.[pos.c];
      if (cell) cell.dropItem = true;
    }
    await this.dealGrid(gen, grid);
    if (gen === this.gen) this.busy = false;
  }

  private objectiveView(): ObjectiveProgressView[] {
    if (!this.levelState) return [];
    return this.levelState.objectives.map((o) => ({
      kind: o.objective.kind,
      current: o.current,
      target: o.objective.target,
      color: o.objective.kind === 'collectColor' ? o.objective.color : undefined,
    }));
  }

  private async dealGrid(gen: number, grid: Grid): Promise<void> {
    this.grid = grid;
    this.sprites.clear();
    const items: MoveItem[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const gem = this.grid[r]?.[c];
        if (!gem) continue;
        const s: Sprite = { gem, x: c, y: r - this.rows - 1 - Math.random() * 2, sx: 1, sy: 1, a: 1 };
        this.sprites.set(gem.id, s);
        items.push({ s, x: c, y: r, dur: 0.35 + r * 0.05 + c * 0.015, ease: easeInQuad });
      }
    }
    await animateMany(this.tweenEngine, items);
    if (gen !== this.gen) return;
    await landSquash(this.tweenEngine, items.map((i) => i.s));
  }

  private async attemptSwap(a: Pos, b: Pos): Promise<void> {
    if (this.busy) return;
    const ga = this.grid[a.r]?.[a.c];
    const gb = this.grid[b.r]?.[b.c];
    // A frozen (obstacle) cell can't be swapped at all. BoardInput already gates this for
    // real pointer input; this is a second line of defense for any other caller.
    if (!ga || !gb || ga.obstacle || gb.obstacle) return;
    this.busy = true;
    this.selected = null;
    const gen = this.gen;
    try {
      const sa = this.sprites.get(ga.id)!;
      const sb = this.sprites.get(gb.id)!;

      sfx.play('swap');
      await animateMany(this.tweenEngine, [
        { s: sa, x: b.c, y: b.r, dur: 0.16, ease: easeInOutCubic },
        { s: sb, x: a.c, y: a.r, dur: 0.16, ease: easeInOutCubic },
      ]);
      if (gen !== this.gen) return;
      swapCells(this.grid, a, b);

      // A combo swap (e.g. Hypercube+Laser) is legal even with no resulting run match;
      // a plain gem next to a special still needs an actual match to be legal.
      const combo = comboActivation(this.grid, a, b);
      if (!combo && findRuns(this.grid).length === 0) {
        swapCells(this.grid, a, b);
        sfx.play('invalid');
        await animateMany(this.tweenEngine, [
          { s: sa, x: a.c, y: a.r, dur: 0.16, ease: easeInOutCubic },
          { s: sb, x: b.c, y: b.r, dur: 0.16, ease: easeInOutCubic },
        ]);
        return;
      }

      if (this.levelState) {
        this.levelState = recordMove(this.levelState);
        this.hooks.onMoves?.(this.levelState.movesRemaining, this.levelState.moveLimit);
      }

      if (combo) {
        sfx.play('combo');
        await this.resolveCleared(gen, combo, 1, COMBO_SWAP_BONUS);
        if (gen !== this.gen) return;
        await this.resolve(gen, []);
      } else {
        await this.resolve(gen, [a, b]);
      }
      if (gen !== this.gen) return;
      await this.ensurePlayable(gen);
      if (gen !== this.gen) return;
      this.checkLevelOutcome();
    } finally {
      if (gen === this.gen && !this.levelEnded) this.busy = false;
    }
  }

  private checkLevelOutcome(): void {
    if (!this.levelState || this.levelEnded) return;
    const status = checkOutcome(this.levelState);
    if (status === 'won') {
      this.levelEnded = true;
      this.hooks.onLevelComplete?.({
        score: this.score,
        movesUsed: this.levelState.moveLimit - this.levelState.movesRemaining,
        movesLimit: this.levelState.moveLimit,
      });
    } else if (status === 'lost') {
      this.levelEnded = true;
      this.hooks.onLevelFailed?.({ score: this.score, reason: 'moves' });
    }
  }

  /**
   * Clear matches, drop, refill; repeat until the board settles. swapEndpoints (the
   * player's swap positions) only matter for the first iteration's special placement.
   */
  private async resolve(gen: number, swapEndpoints: Pos[] = []): Promise<void> {
    let combo = 0;
    for (;;) {
      const runs = findRuns(this.grid);
      if (runs.length === 0) break;
      combo++;

      // Mutate in place (not a new object): sprites hold a direct reference to the gem
      // object keyed by id, so replacing it here would desync the sprite's `.special`
      // from what's in the grid even though the id still matches.
      const plans = planSpecials(runs, combo === 1 ? swapEndpoints : [], this.levelConfig?.enabledSpecials);
      for (const plan of plans) {
        this.grid[plan.pos.r]![plan.pos.c]!.special = plan.special;
      }
      const upgraded = new Set(plans.map((p) => posKey(p.pos)));
      const seedCells = cellsOfRuns(runs).filter((p) => !upgraded.has(posKey(p)));
      const result = expandActivation(this.grid, seedCells);

      let shapeBonus = 0;
      for (const run of runs) {
        const n = run.cells.length;
        shapeBonus += n === 4 ? 40 : n >= 5 ? 100 : 0;
      }

      sfx.play('match', combo);
      if (plans.length > 0) sfx.play('special');
      if (combo >= 2) this.hooks.onToast(COMBO_WORDS[Math.min(combo, COMBO_WORDS.length - 1)]!);

      await this.resolveCleared(gen, result, combo, shapeBonus);
      if (gen !== this.gen) return;
    }
  }

  /** Score, clear a set of cells (from a match or a special combo), collapse, and refill. */
  private async resolveCleared(
    gen: number,
    result: ActivationResult,
    comboMultiplier: number,
    flatBonus: number,
  ): Promise<void> {
    const { cleared, clearedCounts, damaged } = result;
    const pts = cleared.length * 10 + flatBonus;
    this.score += pts * comboMultiplier;
    if (this.score > this.best) {
      this.best = this.score;
      saveJSON('jj.best', this.best);
    }
    this.hooks.onScore(this.score, this.best);

    // Obstacle hits that didn't break the obstacle: persist the damage on the grid.
    for (const p of damaged) {
      const cell = this.grid[p.r]?.[p.c];
      if (cell?.obstacle) cell.obstacle = { ...cell.obstacle, hits: cell.obstacle.hits - 1 };
    }

    if (this.levelState) {
      let obstaclesCleared = 0;
      for (const p of cleared) if (this.grid[p.r]?.[p.c]?.obstacle) obstaclesCleared++;
      let next = applyScore(this.levelState, pts * comboMultiplier);
      next = applyClear(next, clearedCounts);
      if (obstaclesCleared > 0) next = applyObstaclesCleared(next, obstaclesCleared);
      this.levelState = next;
      this.hooks.onObjective?.(this.objectiveView());
    }

    await this.clearCells(cleared);
    if (gen !== this.gen) return;

    await this.collapseAndAnimate(gen);
    if (gen !== this.gen) return;

    if (this.levelConfig?.dropItems.length) {
      const dropped = collectDroppedItems(this.grid, this.mask);
      if (dropped.length > 0) {
        await this.clearCells(dropped);
        if (gen !== this.gen) return;
        if (this.levelState) {
          this.levelState = applyDropItems(this.levelState, dropped.length);
          this.hooks.onObjective?.(this.objectiveView());
        }
        await this.collapseAndAnimate(gen);
      }
    }
  }

  private async collapseAndAnimate(gen: number): Promise<void> {
    const { falls, spawns } = collapse(this.grid, this.nTypes, this.rng, this.mask);
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
    await animateMany(this.tweenEngine, items);
    if (gen !== this.gen) return;
    await landSquash(this.tweenEngine, moved);
  }

  private async clearCells(cells: Pos[]): Promise<void> {
    const targets: Sprite[] = [];
    for (const p of cells) {
      const gem = this.grid[p.r]![p.c]!;
      const s = this.sprites.get(gem.id);
      if (s) {
        targets.push(s);
        this.particles.burst(s.x, s.y, GEM_DEFS[gem.type]!.base);
      }
      this.grid[p.r]![p.c] = null;
    }
    await this.tweenEngine.add(0.24, (k) => {
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

  private async ensurePlayable(gen: number): Promise<void> {
    if (findMoves(this.grid).length > 0) return;
    this.hooks.onToast('이동할 수 없어요! 섞는 중...');
    sfx.play('shuffle');
    await new Promise<void>((r) => setTimeout(r, 450));
    if (gen !== this.gen) return;
    shuffleGrid(this.grid, this.nTypes, this.rng, this.mask);
    const items: MoveItem[] = [];
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = this.grid[r]?.[c];
        if (!cell) continue;
        const s = this.sprites.get(cell.id);
        if (s) items.push({ s, x: c, y: r, dur: 0.5, ease: easeInOutCubic });
      }
    }
    await animateMany(this.tweenEngine, items);
  }

  // ------------------------------------------------------------- render loop

  private loop = (now: number): void => {
    const dt = Math.min(0.05, (now - (this.lastFrame || now)) / 1000);
    this.lastFrame = now;
    this.step(dt);
    this.drawFrame(now);
    requestAnimationFrame(this.loop);
  };

  private step(dt: number): void {
    this.tweenEngine.step();
    this.particles.step(dt);
  }

  private drawFrame(now: number): void {
    draw(now, {
      ctx: this.ctx,
      cell: this.cell,
      dpr: this.dpr,
      cssW: this.cssW,
      cssH: this.cssH,
      ox: this.ox,
      oy: this.oy,
      frame: this.frame,
      grid: this.grid,
      sprites: this.sprites,
      particles: this.particles.list,
      selected: this.selected,
      art: this.art,
      overlayArt: this.overlayArt,
      obstacleArt: this.obstacleArt,
      dropItemArt: this.dropItemArt,
    });
  }
}
