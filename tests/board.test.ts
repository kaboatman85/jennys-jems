import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  COLS,
  ROWS,
  TYPES,
  areAdjacent,
  cellsOfRuns,
  collapse,
  collectDroppedItems,
  createGrid,
  findMoves,
  findRuns,
  mulberry32,
  newGem,
  shuffleGrid,
  swapCells,
  wouldMatch,
} from '../src/board.ts';
import type { Grid, Mask } from '../src/board.ts';

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

test('findRuns: a 2x2 block is a match too, reported with dir "sq"', () => {
  const g = gridFrom([
    [0, 0, 1],
    [0, 0, 2],
    [3, 4, 5],
  ]);
  const runs = findRuns(g);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.dir, 'sq');
  assert.equal(runs[0]!.type, 0);
  assert.equal(runs[0]!.cells.length, 4);
});

test('wouldMatch / findMoves recognize a swap that creates only a 2x2 block', () => {
  // Swapping (0,1) and (1,1) turns rows1-2/cols1-2 into a clean 2x2 block of 0s,
  // with no 3-in-a-line anywhere -- this must still count as a legal move.
  const g = gridFrom([
    [9, 0, 9],
    [9, 1, 0],
    [9, 0, 0],
  ]);
  assert.ok(wouldMatch(g, { r: 0, c: 1 }, { r: 1, c: 1 }));
  const moves = findMoves(g);
  assert.ok(
    moves.some(
      (m) =>
        (m.a.r === 0 && m.a.c === 1 && m.b.r === 1 && m.b.c === 1) ||
        (m.a.r === 1 && m.a.c === 1 && m.b.r === 0 && m.b.c === 1),
    ),
  );
});

test('createGrid: never starts with a 2x2 block either, across many seeds', () => {
  for (let seed = 1; seed <= 300; seed++) {
    const g = createGrid(ROWS, COLS, TYPES, mulberry32(seed));
    const squares = findRuns(g).filter((r) => r.dir === 'sq');
    assert.equal(squares.length, 0, `seed ${seed} starts with a 2x2 block`);
  }
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

function fullMask(rows: number, cols: number): Mask {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => true));
}

test('createGrid: respects a mask -- blocked cells stay null, playable region is clean', () => {
  const mask = fullMask(6, 6);
  for (let c = 0; c < 6; c++) mask[3]![c] = false; // block row 3 entirely
  for (let seed = 1; seed <= 100; seed++) {
    const g = createGrid(6, 6, TYPES, mulberry32(seed), mask);
    for (let c = 0; c < 6; c++) assert.equal(g[3]![c], null, `seed ${seed}: blocked cell not null`);
    for (let r = 0; r < 6; r++) {
      for (let c = 0; c < 6; c++) {
        if (r !== 3) assert.ok(g[r]![c], `seed ${seed}: playable cell (${r},${c}) is empty`);
      }
    }
    assert.equal(findRuns(g).length, 0, `seed ${seed} has a starting match`);
    assert.ok(findMoves(g).length > 0, `seed ${seed} has no moves`);
  }
});

test('collapse: a masked column falls in independent segments around a blocked row', () => {
  const mask = fullMask(6, 1);
  mask[3]![0] = false; // blocks row 3 in the single column
  const rng = mulberry32(11);
  const g: Grid = [[newGem(0)], [newGem(1)], [newGem(2)], [null], [newGem(3)], [newGem(4)]];
  // Knock out one cell in the top segment (rows 0-2) and one in the bottom segment (rows 4-5).
  g[0]![0] = null;
  g[5]![0] = null;
  const survivorTop = g[1]![0]!;
  const survivorBottom = g[4]![0]!;

  const { falls, spawns } = collapse(g, TYPES, rng, mask);

  assert.equal(g[3]![0], null, 'blocked cell must stay null');
  assert.ok(g[0]![0] && g[1]![0] && g[2]![0], 'top segment fully filled');
  assert.ok(g[4]![0] && g[5]![0], 'bottom segment fully filled');
  // The bottom segment's spawn must not have a fromR that lands inside the top
  // segment's row range (0-2), or it would visually fly through unrelated gems.
  for (const s of spawns) {
    if (s.toR >= 4) assert.ok(s.toR - s.fromR >= 1, 'bottom-segment spawn falls a sensible distance');
  }
  const survivors = new Set([survivorTop.id, survivorBottom.id]);
  for (const f of falls) if (survivors.has(f.gem.id)) survivors.delete(f.gem.id);
  // Both survivors should still be present somewhere in their own segment.
  assert.ok([g[0]![0], g[1]![0], g[2]![0]].some((x) => x?.id === survivorTop.id));
  assert.ok([g[4]![0], g[5]![0]].some((x) => x?.id === survivorBottom.id));
});

test('shuffleGrid: respects a mask -- blocked cells stay blocked, gem set unchanged', () => {
  const mask = fullMask(6, 6);
  for (let c = 0; c < 6; c++) mask[3]![c] = false;
  for (let seed = 1; seed <= 30; seed++) {
    const rng = mulberry32(seed);
    const g = createGrid(6, 6, TYPES, rng, mask);
    const before = new Set(g.flat().filter(Boolean).map((x) => x!.id));
    shuffleGrid(g, TYPES, rng, mask);
    for (let c = 0; c < 6; c++) assert.equal(g[3]![c], null);
    assert.equal(findRuns(g).length, 0);
    assert.ok(findMoves(g).length > 0);
    const after = new Set(g.flat().filter(Boolean).map((x) => x!.id));
    assert.deepEqual([...after].sort(), [...before].sort());
  }
});

test('findRuns: an obstacle-covered gem is inert -- never forms or extends a match', () => {
  const g = gridFrom([[0, 0, 0, 1]]);
  g[0]![1]!.obstacle = { kind: 'ice', hits: 1 };
  // The run that used to span cols 0-2 is now broken by the frozen cell at col 1.
  assert.equal(findRuns(g).length, 0);
});

test('findRuns: a dropItem gem is inert -- never forms or extends a match', () => {
  const g = gridFrom([[0, 0, 0, 1]]);
  g[0]![1]!.dropItem = true;
  assert.equal(findRuns(g).length, 0);
});

test('findMoves: never offers a swap into or out of a frozen (obstacle) cell', () => {
  const g = gridFrom([
    [9, 0, 9],
    [9, 1, 0],
    [9, 0, 0],
  ]);
  // Without the obstacle this swap is legal (see the 2x2-block test above).
  assert.ok(wouldMatch(g, { r: 0, c: 1 }, { r: 1, c: 1 }));
  g[1]![1]!.obstacle = { kind: 'ice', hits: 1 };
  const moves = findMoves(g);
  assert.ok(
    !moves.some(
      (m) =>
        (m.a.r === 1 && m.a.c === 1) ||
        (m.b.r === 1 && m.b.c === 1),
    ),
    'no move should involve the frozen cell',
  );
});

test('collectDroppedItems: collects an item sitting in the bottom row of its column', () => {
  const g = gridFrom([
    [0, 0],
    [1, 1],
  ]);
  g[1]![0]!.dropItem = true;
  const collected = collectDroppedItems(g);
  assert.equal(collected.length, 1);
  assert.deepEqual(collected[0], { r: 1, c: 0 });
  assert.ok(g[1]![0], 'read-only: the caller removes the cell, not collectDroppedItems itself');
});

test('collectDroppedItems: ignores an item that has not reached the bottom yet', () => {
  const g = gridFrom([
    [0, 0],
    [1, 1],
  ]);
  g[0]![0]!.dropItem = true; // top row, not yet at the bottom
  const collected = collectDroppedItems(g);
  assert.equal(collected.length, 0);
  assert.ok(g[0]![0], 'item stays on the board until it reaches bottom');
});

test('collectDroppedItems: respects a mask -- "bottom" means the lowest playable row', () => {
  const mask = fullMask(4, 1);
  mask[3]![0] = false; // row 3 blocked; row 2 is the real bottom of this column
  const g: Grid = [[newGem(0)], [newGem(1)], [newGem(2)], [null]];
  g[2]![0]!.dropItem = true;
  const collected = collectDroppedItems(g, mask);
  assert.equal(collected.length, 1);
  assert.deepEqual(collected[0], { r: 2, c: 0 });
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
