// Pure game logic: no DOM, no rendering. Grid is indexed grid[row][col].

export const ROWS = 8;
export const COLS = 8;
export const TYPES = 6;

export interface Gem {
  id: number;
  type: number;
}
export type Cell = Gem | null;
export type Grid = Cell[][];
export interface Pos {
  r: number;
  c: number;
}
export interface Run {
  cells: Pos[];
  type: number;
  dir: 'h' | 'v';
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

export function createGrid(nRows: number, nCols: number, nTypes: number, rng: Rng): Grid {
  for (let attempt = 0; attempt < 200; attempt++) {
    const g: Grid = [];
    for (let r = 0; r < nRows; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < nCols; c++) {
        const banned = new Set<number>();
        if (c >= 2 && row[c - 1]!.type === row[c - 2]!.type) banned.add(row[c - 1]!.type);
        if (r >= 2 && g[r - 1]![c]!.type === g[r - 2]![c]!.type) banned.add(g[r - 1]![c]!.type);
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

/** All horizontal and vertical runs of 3+ identical gems. */
export function findRuns(g: Grid): Run[] {
  const runs: Run[] = [];
  const R = numRows(g);
  const C = numCols(g);

  for (let r = 0; r < R; r++) {
    let c = 0;
    while (c < C) {
      const cell = g[r]![c];
      if (!cell) {
        c++;
        continue;
      }
      let e = c + 1;
      while (e < C && g[r]![e]?.type === cell.type) e++;
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
      if (!cell) {
        r++;
        continue;
      }
      let e = r + 1;
      while (e < R && g[e]![c]?.type === cell.type) e++;
      if (e - r >= 3) {
        const cells: Pos[] = [];
        for (let k = r; k < e; k++) cells.push({ r: k, c });
        runs.push({ cells, type: cell.type, dir: 'v' });
      }
      r = e;
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

export function findMoves(g: Grid): Move[] {
  const moves: Move[] = [];
  const R = numRows(g);
  const C = numCols(g);
  for (let r = 0; r < R; r++) {
    for (let c = 0; c < C; c++) {
      if (!g[r]![c]) continue;
      const a = { r, c };
      if (c + 1 < C && g[r]![c + 1] && wouldMatch(g, a, { r, c: c + 1 })) {
        moves.push({ a, b: { r, c: c + 1 } });
      }
      if (r + 1 < R && g[r + 1]![c] && wouldMatch(g, a, { r: r + 1, c })) {
        moves.push({ a, b: { r: r + 1, c } });
      }
    }
  }
  return moves;
}

/**
 * Apply gravity and refill. Empty cells (null) must already be set.
 * `falls` are existing gems that dropped; `spawns` are brand-new gems whose
 * fromR is above the board (negative).
 */
export function collapse(g: Grid, nTypes: number, rng: Rng): { falls: Fall[]; spawns: Fall[] } {
  const falls: Fall[] = [];
  const spawns: Fall[] = [];
  const R = numRows(g);
  const C = numCols(g);
  for (let c = 0; c < C; c++) {
    let write = R - 1;
    for (let read = R - 1; read >= 0; read--) {
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
    const empties = write + 1;
    for (let r = 0; r <= write; r++) {
      const gem = newGem(Math.floor(rng() * nTypes));
      g[r]![c] = gem;
      spawns.push({ gem, c, fromR: r - empties, toR: r });
    }
  }
  return { falls, spawns };
}

/** Reshuffle existing gems until the board has no matches and at least one move. */
export function shuffleGrid(g: Grid, nTypes: number, rng: Rng): void {
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
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) g[r]![c] = gems[k++]!;
    if (findRuns(g).length === 0 && findMoves(g).length > 0) return;
  }

  // Fallback: keep the gem objects (so sprites survive) but re-roll their types.
  const fresh = createGrid(R, C, nTypes, rng);
  for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) g[r]![c]!.type = fresh[r]![c]!.type;
}
