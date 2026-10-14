// Pure engine for the block-fitting puzzle: an 8x8 grid, a tray of three pieces,
// full rows/columns clear. No DOM, no rendering. Difficulty is a "stage" derived
// from score; higher stages unlock bigger/awkward shapes and stop guaranteeing
// that the tray has a playable piece.

import type { Pos, Rng } from './board.ts';

export const BLOCK_SIZE = 8;
export const TRAY_SIZE = 3;
export const MAX_STAGE = 10;
export const COLOR_COUNT = 7;

/** Cells are [row, col] offsets from the shape's top-left corner. */
export type ShapeCells = ReadonlyArray<readonly [number, number]>;

export interface Shape {
  id: string;
  cells: ShapeCells;
  tier: 1 | 2 | 3 | 4;
  w: number;
  h: number;
}

export interface Piece {
  shape: Shape;
  color: number;
  /** Indices into shape.cells of the blocks that carry a jewel (collected when their line clears). */
  jewels: number[];
}

/** One placed block: its color, and whether it is a jewel crate. */
export interface BlockCell {
  color: number;
  jewel: boolean;
}

/** null = empty. */
export type BlockGrid = (BlockCell | null)[][];

function shape(id: string, tier: 1 | 2 | 3 | 4, ...rows: string[]): Shape {
  const cells: Array<readonly [number, number]> = [];
  rows.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '#') cells.push([r, c]);
    });
  });
  return {
    id,
    tier,
    cells,
    w: Math.max(...rows.map((r) => r.length)),
    h: rows.length,
  };
}

export const SHAPES: Shape[] = [
  // Tier 1: the starter set.
  shape('dot', 1, '#'),
  shape('h2', 1, '##'),
  shape('v2', 1, '#', '#'),
  shape('h3', 1, '###'),
  shape('v3', 1, '#', '#', '#'),
  shape('sq2', 1, '##', '##'),

  // Tier 2: longer bars, small corners, rectangles.
  shape('h4', 2, '####'),
  shape('v4', 2, '#', '#', '#', '#'),
  shape('l3-a', 2, '##', '#.'),
  shape('l3-b', 2, '##', '.#'),
  shape('l3-c', 2, '#.', '##'),
  shape('l3-d', 2, '.#', '##'),
  shape('r23', 2, '###', '###'),
  shape('r32', 2, '##', '##', '##'),

  // Tier 3: the awkward ones.
  shape('h5', 3, '#####'),
  shape('v5', 3, '#', '#', '#', '#', '#'),
  shape('l5-a', 3, '###', '#..', '#..'),
  shape('l5-b', 3, '###', '..#', '..#'),
  shape('l5-c', 3, '#..', '#..', '###'),
  shape('l5-d', 3, '..#', '..#', '###'),
  shape('t-a', 3, '###', '.#.'),
  shape('t-b', 3, '.#.', '###'),
  shape('t-c', 3, '#.', '##', '#.'),
  shape('t-d', 3, '.#', '##', '.#'),
  shape('s-h', 3, '.##', '##.'),
  shape('z-h', 3, '##.', '.##'),
  shape('s-v', 3, '#.', '##', '.#'),
  shape('z-v', 3, '.#', '##', '#.'),
  shape('sq3', 3, '###', '###', '###'),
  shape('plus', 3, '.#.', '###', '.#.'),
  shape('u-a', 3, '#.#', '###'),
  shape('u-b', 3, '###', '#.#'),
  shape('u-c', 3, '##', '#.', '##'),
  shape('u-d', 3, '##', '.#', '##'),
  shape('r24', 3, '####', '####'),
  shape('r42', 3, '##', '##', '##', '##'),

  // Tier 4: jumbo pieces that take up a big share of the board.
  shape('r34', 4, '####', '####', '####'),
  shape('r43', 4, '###', '###', '###', '###'),
  shape('l7-a', 4, '####', '#...', '#...', '#...'),
  shape('l7-b', 4, '####', '...#', '...#', '...#'),
  shape('l7-c', 4, '#...', '#...', '#...', '####'),
  shape('l7-d', 4, '...#', '...#', '...#', '####'),
];

export function createBlockGrid(): BlockGrid {
  return Array.from({ length: BLOCK_SIZE }, () => Array.from({ length: BLOCK_SIZE }, () => null));
}

/** (r, c) is where the shape's top-left corner lands. */
export function canPlace(grid: BlockGrid, s: Shape, r: number, c: number): boolean {
  for (const [dr, dc] of s.cells) {
    const rr = r + dr;
    const cc = c + dc;
    if (rr < 0 || rr >= BLOCK_SIZE || cc < 0 || cc >= BLOCK_SIZE) return false;
    if (grid[rr]![cc] !== null) return false;
  }
  return true;
}

export function canPlaceAnywhere(grid: BlockGrid, s: Shape): boolean {
  for (let r = 0; r <= BLOCK_SIZE - s.h; r++) {
    for (let c = 0; c <= BLOCK_SIZE - s.w; c++) {
      if (canPlace(grid, s, r, c)) return true;
    }
  }
  return false;
}

/** True while at least one tray piece still fits somewhere; false means game over. */
export function anyMoves(grid: BlockGrid, tray: ReadonlyArray<Piece | null>): boolean {
  return tray.some((p) => p !== null && canPlaceAnywhere(grid, p.shape));
}

export function findFullLines(grid: BlockGrid): { rows: number[]; cols: number[] } {
  const rows: number[] = [];
  const cols: number[] = [];
  for (let r = 0; r < BLOCK_SIZE; r++) {
    if (grid[r]!.every((v) => v !== null)) rows.push(r);
  }
  for (let c = 0; c < BLOCK_SIZE; c++) {
    if (grid.every((row) => row[c] !== null)) cols.push(c);
  }
  return { rows, cols };
}

export interface ClearedCell extends Pos {
  color: number;
  jewel: boolean;
}

export interface MoveResult {
  placed: number;
  rows: number[];
  cols: number[];
  /** Cells wiped by this move (an intersection of a row and column counts once). */
  cleared: ClearedCell[];
  /** How many of the cleared cells were jewels. */
  jewels: number;
  points: number;
  /** Consecutive moves that cleared at least one line, including this one. */
  streak: number;
}

/** 1 point per block placed, 10 x lines^2 for clears, +20 per extra move in a clearing streak. */
export function scoreMove(placed: number, lines: number, streak: number): number {
  const clearPoints = lines > 0 ? 10 * lines * lines + 20 * Math.max(0, streak - 1) : 0;
  return placed + clearPoints;
}

/** Places the piece, clears any full lines, and reports what happened. Caller must check canPlace first. */
export function applyMove(grid: BlockGrid, piece: Piece, r: number, c: number, prevStreak: number): MoveResult {
  piece.shape.cells.forEach(([dr, dc], i) => {
    grid[r + dr]![c + dc] = { color: piece.color, jewel: piece.jewels.includes(i) };
  });
  const { rows, cols } = findFullLines(grid);
  const seen = new Set<number>();
  const cleared: ClearedCell[] = [];
  const take = (rr: number, cc: number): void => {
    const key = rr * BLOCK_SIZE + cc;
    if (seen.has(key)) return;
    seen.add(key);
    const cell = grid[rr]![cc]!;
    cleared.push({ r: rr, c: cc, color: cell.color, jewel: cell.jewel });
  };
  for (const rr of rows) for (let cc = 0; cc < BLOCK_SIZE; cc++) take(rr, cc);
  for (const cc of cols) for (let rr = 0; rr < BLOCK_SIZE; rr++) take(rr, cc);
  for (const p of cleared) grid[p.r]![p.c] = null;
  const lines = rows.length + cols.length;
  const streak = lines > 0 ? prevStreak + 1 : 0;
  return {
    placed: piece.shape.cells.length,
    rows,
    cols,
    cleared,
    jewels: cleared.filter((p) => p.jewel).length,
    points: scoreMove(piece.shape.cells.length, lines, streak),
    streak,
  };
}

/** Stage climbs quickly at first and slows down: 25 pts -> 1, 100 -> 2, 225 -> 3 ... capped at MAX_STAGE. */
export function stageFor(score: number): number {
  return Math.min(MAX_STAGE, Math.floor(Math.sqrt(Math.max(0, score) / 25)));
}

type Tier = 1 | 2 | 3 | 4;

/** Share of the tray draw that each tier gets at a given stage. Medium and large
 * pieces are in the mix from stage 0, jumbo pieces from stage 1. Negative stages
 * (used by the early jewel levels) lean heavily on small pieces and drop the big ones. */
export function tierShares(stage: number): Record<Tier, number> {
  return {
    1: Math.max(0.08, 0.6 - 0.08 * stage),
    2: Math.max(0, Math.min(1, 0.7 + 0.06 * stage)),
    3: Math.max(0, Math.min(1, 0.15 + 0.12 * stage)),
    4: stage >= 1 ? Math.min(0.8, 0.1 * stage) : 0,
  };
}

function pickShape(rng: Rng, stage: number): Shape {
  const shares = tierShares(stage);
  const count: Record<Tier, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const s of SHAPES) count[s.tier]++;
  const weights = SHAPES.map((s) => shares[s.tier] / count[s.tier]);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < SHAPES.length; i++) {
    roll -= weights[i]!;
    if (roll <= 0) return SHAPES[i]!;
  }
  return SHAPES[0]!;
}

/** Gives a shape a color and (with probability jewelRate) one or two jewel blocks. */
export function makePiece(rng: Rng, shape: Shape, jewelRate: number): Piece {
  const color = Math.floor(rng() * COLOR_COUNT);
  const jewels: number[] = [];
  if (jewelRate > 0 && rng() < jewelRate) {
    const want = shape.cells.length >= 6 && rng() < 0.4 ? 2 : 1;
    while (jewels.length < want) {
      const i = Math.floor(rng() * shape.cells.length);
      if (!jewels.includes(i)) jewels.push(i);
    }
  }
  return { shape, color, jewels };
}

export function randomPiece(rng: Rng, stage: number, jewelRate = 0): Piece {
  return makePiece(rng, pickShape(rng, stage), jewelRate);
}

/** Stages below this always deal a tray with at least one piece that can be placed. */
export const FAIR_TRAY_BELOW_STAGE = 4;

/** forceFair guarantees a playable tray regardless of stage (used for the opening tray of a level). */
export function nextTray(grid: BlockGrid, rng: Rng, stage: number, jewelRate = 0, forceFair = false): Piece[] {
  const fair = forceFair || stage < FAIR_TRAY_BELOW_STAGE;
  let tray: Piece[] = [];
  for (let attempt = 0; attempt < 30; attempt++) {
    tray = Array.from({ length: TRAY_SIZE }, () => randomPiece(rng, stage, jewelRate));
    if (!fair) return tray;
    if (anyMoves(grid, tray)) return tray;
  }
  // Rerolling kept missing (a nearly full board): force one piece that does fit.
  const fitting = SHAPES.filter((s) => canPlaceAnywhere(grid, s));
  if (fitting.length > 0) {
    const forced = fitting[Math.floor(rng() * fitting.length)]!;
    tray[0] = makePiece(rng, forced, jewelRate);
  }
  return tray;
}
