// Pure game logic: no DOM, no rendering. Grid is indexed grid[row][col].

export const ROWS = 8;
export const COLS = 8;
export const TYPES = 6;

export type SpecialKind = 'laser' | 'bomb' | 'hypercube' | 'star';
export interface Special {
  kind: SpecialKind;
  /** Laser only: which direction it clears. */
  orientation?: 'h' | 'v';
}
export type ObstacleKind = 'ice' | 'dirt';
export interface Obstacle {
  kind: ObstacleKind;
  hits: number;
}
export interface Gem {
  id: number;
  type: number;
  special?: Special;
  /** Frozen: can't be swapped or matched. Breaks via adjacent clears or a special's blast. */
  obstacle?: Obstacle;
  /** Needs to reach the bottom of its column, not be color-matched. */
  dropItem?: boolean;
}
export type Cell = Gem | null;
export type Grid = Cell[][];
/** true = playable cell. Same dimensions as the Grid it applies to. Undefined = fully playable. */
export type Mask = boolean[][];
export interface Pos {
  r: number;
  c: number;
}
export interface Run {
  cells: Pos[];
  type: number;
  /** 'sq' is a 2x2 block match (no line direction). */
  dir: 'h' | 'v' | 'sq';
}
export interface Move {
  a: Pos;
  b: Pos;
}
export interface Fall {
  gem: Gem;
  c: number;
  fromR: number;
  toR: number;
}
export type Rng = () => number;

export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

let nextId = 1;
export function newGem(type: number): Gem {
  return { id: nextId++, type };
}

export const numRows = (g: Grid): number => g.length;
export const numCols = (g: Grid): number => g[0]?.length ?? 0;

const isPlayable = (mask: Mask | undefined, r: number, c: number): boolean => !mask || mask[r]?.[c] === true;

export function createGrid(nRows: number, nCols: number, nTypes: number, rng: Rng, mask?: Mask): Grid {
  for (let attempt = 0; attempt < 200; attempt++) {
    const g: Grid = [];
    for (let r = 0; r < nRows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < nCols; c++) {
        if (!isPlayable(mask, r, c)) {
          row.push(null);
          continue;
        }
        const banned = new Set<number>();
        const left = row[c - 1];
        const left2 = row[c - 2];
        if (c >= 2 && left && left2 && left.type === left2.type) banned.add(left.type);
        const up = g[r - 1]?.[c];
        const up2 = g[r - 2]?.[c];
        if (r >= 2 && up && up2 && up.type === up2.type) banned.add(up.type);
        const upLeft = g[r - 1]?.[c - 1];
        if (r >= 1 && c >= 1 && left && up && upLeft && left.type === up.type && left.type === upLeft.type) {
          banned.add(left.type);
        }
        const allowed: number[] = [];
        for (let t = 0; t < nTypes; t++) if (!banned.has(t)) allowed.push(t);
        row.push(newGem(allowed[Math.floor(rng() * allowed.length)]!));
      }
      g.push(row);
    }
    if (findMoves(g).length > 0) return g;
  }
  throw new Error('Could not create a playable grid');
}

/** True if a cell can be part of/extend a line or block match: not empty, not frozen, not a drop item. */
function isMatchable(cell: Cell): cell is Gem {
  return !!cell && !cell.obstacle && !cell.dropItem;
}

/** All horizontal and vertical runs of 3+ identical gems, plus 2x2 blocks. */
export function findRuns(g: Grid): Run[] {
  const runs: Run[] = [];
  const R = numRows(g);
  const C = numCols(g);

  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      const cell = g[r]![c];
      if (!isMatchable(cell)) {
        c++;
        continue;
      }
      let e = c + 1;
      while (e < C) {
        const next = g[r]![e];
        if (!isMatchable(next) || next.type !== cell.type) break;
        e++;
      }
      if (e - c >= 3) {
        const cells: Pos[] = [];
        for (let k = c; k < e; k++) cells.push({ r, c: k });
        runs.push({ cells, type: cell.type, dir: 'h' });
      }
      c = e;
    }
  }

  for (let c = 0; c < C; c++) {
    let r = 0;
    while (r < R) {
      const cell = g[r]![c];
      if (!isMatchable(cell)) {
        r++;
        continue;
      }
      let e = r + 1;
      while (e < R) {
        const next = g[e]![c];
        if (!isMatchable(next) || next.type !== cell.type) break;
        e++;
      }
      if (e - r >= 3) {
        const cells: Pos[] = [];
        for (let k = r; k < e; k++) cells.push({ r: k, c });
        runs.push({ cells, type: cell.type, dir: 'v' });
      }
      r = e;
    }
  }

  // 2x2 blocks also count as a match (these become Bombs). Overlapping blocks (e.g.
  // inside a larger same-type patch) are reported individually; cellsOfRuns/planSpecials
  // dedupe and merge them the same way crossing line-runs already do.
  for (let r = 0; r < R - 1; r++) {
    for (let c = 0; c < C - 1; c++) {
      const a = g[r]![c];
      const b = g[r]![c + 1];
      const d = g[r + 1]![c];
      const e = g[r + 1]![c + 1];
      if (
        isMatchable(a) &&
        isMatchable(b) &&
        isMatchable(d) &&
        isMatchable(e) &&
        b.type === a.type &&
        d.type === a.type &&
        e.type === a.type
      ) {
        runs.push({
          cells: [
            { r, c },
            { r, c: c + 1 },
            { r: r + 1, c },
            { r: r + 1, c: c + 1 },
          ],
          type: a.type,
          dir: 'sq',
        });
      }
    }
  }

  return runs;
}

/** Unique cells covered by a set of runs. */
export function cellsOfRuns(runs: Run[]): Pos[] {
  const seen = new Set<number>();
  const out: Pos[] = [];
  for (const run of runs) {
    for (const p of run.cells) {
      const key = p.r * 1000 + p.c;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(p);
      }
    }
  }
  return out;
}

export function areAdjacent(a: Pos, b: Pos): boolean {
  return Math.abs(a.r - b.r) + Math.abs(a.c - b.c) === 1;
}

export function swapCells(g: Grid, a: Pos, b: Pos): void {
  const tmp = g[a.r]![a.c]!;
  g[a.r]![a.c] = g[b.r]![b.c]!;
  g[b.r]![b.c] = tmp;
}

/** Would swapping a and b create at least one match? Grid is left unchanged. */
export function wouldMatch(g: Grid, a: Pos, b: Pos): boolean {
  swapCells(g, a, b);
  const ok = findRuns(g).length > 0;
  swapCells(g, a, b);
  return ok;
}

/** Legal moves: adjacent, non-frozen cells whose swap would create a match. */
export function findMoves(g: Grid): Move[] {
  const moves: Move[] = [];
  const R = numRows(g);
  const C = numCols(g);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      const cell = g[r]![c];
      if (!cell || cell.obstacle) continue;
      const a = { r, c };
      const right = g[r]![c + 1];
      if (c + 1 < C && right && !right.obstacle && wouldMatch(g, a, { r, c: c + 1 })) {
        moves.push({ a, b: { r, c: c + 1 } });
      }
      const down = g[r + 1]?.[c];
      if (r + 1 < R && down && !down.obstacle && wouldMatch(g, a, { r: r + 1, c })) {
        moves.push({ a, b: { r: r + 1, c } });
      }
    }
  }
  return moves;
}

/**
 * Apply gravity and refill. Empty cells (null) must already be set. Mask-aware: each
 * column is split into independent contiguous playable segments (separated by blocked
 * rows), and falls/spawns are resolved separately per segment -- nothing falls through
 * a blocked row, and nothing spawns above a segment it can't reach.
 * `falls` are existing gems that dropped; `spawns` are brand-new gems whose
 * fromR is above the board (negative).
 */
export function collapse(g: Grid, nTypes: number, rng: Rng, mask?: Mask): { falls: Fall[]; spawns: Fall[] } {
  const falls: Fall[] = [];
  const spawns: Fall[] = [];
  const R = numRows(g);
  const C = numCols(g);

  for (let c = 0; c < C; c++) {
    let segStart = 0;
    while (segStart < R) {
      if (!isPlayable(mask, segStart, c)) {
        segStart++;
        continue;
      }
      let segEnd = segStart;
      while (segEnd + 1 < R && isPlayable(mask, segEnd + 1, c)) segEnd++;

      let write = segEnd;
      for (let read = segEnd; read >= segStart; read--) {
        const gem = g[read]![c];
        if (gem) {
          if (read !== write) {
            g[write]![c] = gem;
            g[read]![c] = null;
            falls.push({ gem, c, fromR: read, toR: write });
          }
          write--;
        }
      }
      const empties = write - segStart + 1;
      for (let r = segStart; r <= write; r++) {
        const gem = newGem(Math.floor(rng() * nTypes));
        g[r]![c] = gem;
        spawns.push({ gem, c, fromR: r - empties, toR: r });
      }

      segStart = segEnd + 1;
    }
  }
  return { falls, spawns };
}

/**
 * Finds dropItem gems sitting in the bottom playable row of their column and
 * returns their positions. Pure/read-only -- does not mutate the grid, so the
 * caller can animate the removal (e.g. via the same path used for clearing a
 * match) before nulling the cells and collapsing again to refill the holes.
 */
export function collectDroppedItems(g: Grid, mask?: Mask): Pos[] {
  const R = numRows(g);
  const C = numCols(g);
  const collected: Pos[] = [];
  for (let c = 0; c < C; c++) {
    let bottom = -1;
    for (let r = R - 1; r >= 0; r--) {
      if (isPlayable(mask, r, c)) {
        bottom = r;
        break;
      }
    }
    if (bottom < 0) continue;
    const cell = g[bottom]![c];
    if (cell && cell.dropItem) collected.push({ r: bottom, c });
  }
  return collected;
}

/** Reshuffle existing gems until the board has no matches and at least one move. */
export function shuffleGrid(g: Grid, nTypes: number, rng: Rng, mask?: Mask): void {
  const R = numRows(g);
  const C = numCols(g);
  const gems: Gem[] = [];
  for (const row of g) for (const cell of row) if (cell) gems.push(cell);

  for (let attempt = 0; attempt < 300; attempt++) {
    for (let i = gems.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [gems[i], gems[j]] = [gems[j]!, gems[i]!];
    }
    let k = 0;
    for (let r = 0; r < R; r++) {
      for (let c = 0; c < C; c++) {
        if (!isPlayable(mask, r, c)) continue;
        g[r]![c] = gems[k++]!;
      }
    }
    if (findRuns(g).length === 0 && findMoves(g).length > 0) return;
  }

  // Fallback: keep the gem objects (so sprites survive) but re-roll their types.
  const fresh = createGrid(R, C, nTypes, rng, mask);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!isPlayable(mask, r, c)) continue;
      g[r]![c]!.type = fresh[r]![c]!.type;
    }
  }
}
