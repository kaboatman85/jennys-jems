import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  newGem,
  shuffleGrid,
  swapCells,
  wouldMatch,
} from '../src/board.ts';
import type { Grid } from '../src/board.ts';

function gridFrom(rows: number[][]): Grid {
  return rows.map((row) => row.map((t) => newGem(t)));
}

test('createGrid: no starting matches, at least one move, across many seeds', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const g = createGrid(ROWS, COLS, TYPES, mulberry32(seed));
    assert.equal(findRuns(g).length, 0, `seed ${seed} has a starting match`);
    assert.ok(findMoves(g).length > 0, `seed ${seed} has no moves`);
    const ids = new Set(g.flat().map((x) => x!.id));
    assert.equal(ids.size, ROWS * COLS);
  }
});

test('findRuns: horizontal, vertical, and length-5 runs', () => {
  const g = gridFrom([
    [0, 0, 0, 1, 2],
    [3, 4, 4, 1, 2],
    [3, 5, 0, 1, 5],
    [3, 5, 2, 4, 5],
    [4, 4, 4, 4, 4],
  ]);
  const runs = findRuns(g);
  const h = runs.filter((r) => r.dir === 'h');
  const v = runs.filter((r) => r.dir === 'v');
  assert.equal(h.length, 2); // row 0 (three 0s) and row 4 (five 4s)
  assert.ok(h.some((r) => r.cells.length === 5));
  assert.ok(v.some((r) => r.type === 1 && r.cells.length === 3));
  assert.ok(v.some((r) => r.type === 3 && r.cells.length === 3));
});

test('cellsOfRuns de-duplicates crossing runs (L / T shapes)', () => {
  const g = gridFrom([
    [1, 0, 2, 3],
    [1, 4, 5, 2],
    [1, 1, 1, 0],
  ]);
  const runs = findRuns(g);
  assert.equal(runs.length, 2);
  assert.equal(cellsOfRuns(runs).length, 5);
});

test('areAdjacent / swapCells / wouldMatch', () => {
  assert.ok(areAdjacent({ r: 1, c: 1 }, { r: 1, c: 2 }));
  assert.ok(!areAdjacent({ r: 1, c: 1 }, { r: 2, c: 2 }));
  const g = gridFrom([
    [0, 0, 1],
    [2, 3, 0],
    [4, 5, 2],
  ]);
  // Swap (0,2) with (1,2): 0 moves up next to the two 0s
  assert.ok(wouldMatch(g, { r: 0, c: 2 }, { r: 1, c: 2 }));
  assert.equal(g[0]![2]!.type, 1, 'wouldMatch must restore the grid');
  assert.ok(!wouldMatch(g, { r: 2, c: 0 }, { r: 2, c: 1 }));
  const a = g[0]![0]!;
  const b = g[1]![0]!;
  swapCells(g, { r: 0, c: 0 }, { r: 1, c: 0 });
  assert.equal(g[0]![0], b);
  assert.equal(g[1]![0], a);
});

test('collapse: fills every hole, preserves surviving gems, spawns above the board', () => {
  const rng = mulberry32(7);
  const g = createGrid(ROWS, COLS, TYPES, rng);
  const survivors = new Set<number>();
  // Knock out a mix of cells including a full column and a bottom row piece
  const knock = [
    { r: 7, c: 0 },
    { r: 6, c: 0 },
    { r: 5, c: 0 },
    { r: 7, c: 3 },
    { r: 3, c: 3 },
    { r: 0, c: 5 },
  ];
  for (const p of knock) g[p.r]![p.c] = null;
  for (const row of g) for (const x of row) if (x) survivors.add(x.id);

  const { falls, spawns } = collapse(g, TYPES, rng);
  for (const row of g) for (const x of row) assert.ok(x, 'hole left after collapse');
  const ids = new Set(g.flat().map((x) => x!.id));
  assert.equal(ids.size, ROWS * COLS);
  for (const id of survivors) assert.ok(ids.has(id), 'surviving gem vanished');
  assert.equal(spawns.length, knock.length);
  for (const s of spawns) {
    assert.ok(s.fromR < 0, 'spawn should start above the board');
    assert.equal(g[s.toR]![s.c], s.gem);
  }
  for (const f of falls) {
    assert.ok(f.toR > f.fromR, 'falls only go down');
    assert.equal(g[f.toR]![f.c], f.gem);
  }
});

test('shuffleGrid yields a playable board and keeps the same gem objects', () => {
  for (let seed = 1; seed <= 50; seed++) {
    const rng = mulberry32(seed);
    const g = createGrid(ROWS, COLS, TYPES, rng);
    const before = new Set(g.flat().map((x) => x!.id));
    shuffleGrid(g, TYPES, rng);
    assert.equal(findRuns(g).length, 0);
    assert.ok(findMoves(g).length > 0);
    const after = new Set(g.flat().map((x) => x!.id));
    assert.deepEqual([...after].sort(), [...before].sort());
  }
});

test('cascade simulation always terminates with a settled board', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const rng = mulberry32(seed * 31);
    const g = createGrid(ROWS, COLS, TYPES, rng);
    const moves = findMoves(g);
    const m = moves[Math.floor(rng() * moves.length)]!;
    swapCells(g, m.a, m.b);
    let loops = 0;
    for (;;) {
      const runs = findRuns(g);
      if (!runs.length) break;
      for (const p of cellsOfRuns(runs)) g[p.r]![p.c] = null;
      collapse(g, TYPES, rng);
      assert.ok(++loops < 200, 'cascade did not terminate');
    }
    for (const row of g) for (const x of row) assert.ok(x);
  }
});
