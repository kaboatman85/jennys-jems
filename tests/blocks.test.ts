import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mulberry32 } from '../src/board.ts';
import {
  BLOCK_SIZE,
  FAIR_TRAY_BELOW_STAGE,
  MAX_STAGE,
  SHAPES,
  anyMoves,
  applyMove,
  canPlace,
  canPlaceAnywhere,
  createBlockGrid,
  findFullLines,
  makePiece,
  nextTray,
  scoreMove,
  stageFor,
  tierShares,
} from '../src/blocks.ts';
import type { BlockCell, BlockGrid, Piece, Shape } from '../src/blocks.ts';

const byId = (id: string): Shape => SHAPES.find((s) => s.id === id)!;
const piece = (id: string, color = 0, jewels: number[] = []): Piece => ({ shape: byId(id), color, jewels });
const cell = (color = 1, jewel = false): BlockCell => ({ color, jewel });

function fillRow(grid: BlockGrid, r: number, except: number[] = []): void {
  for (let c = 0; c < BLOCK_SIZE; c++) if (!except.includes(c)) grid[r]![c] = cell();
}
function fillCol(grid: BlockGrid, c: number, except: number[] = []): void {
  for (let r = 0; r < BLOCK_SIZE; r++) if (!except.includes(r)) grid[r]![c] = cell();
}

test('shape ids are unique and dimensions match their cells', () => {
  assert.equal(new Set(SHAPES.map((s) => s.id)).size, SHAPES.length);
  for (const s of SHAPES) {
    assert.ok(Math.max(...s.cells.map(([r]) => r)) + 1 <= s.h, s.id);
    assert.ok(Math.max(...s.cells.map(([, c]) => c)) + 1 <= s.w, s.id);
    assert.ok(s.cells.some(([r]) => r === 0) && s.cells.some(([, c]) => c === 0), `${s.id} not normalized`);
  }
});

test('canPlace: bounds and overlap', () => {
  const grid = createBlockGrid();
  assert.equal(canPlace(grid, byId('h3'), 0, 0), true);
  assert.equal(canPlace(grid, byId('h3'), 0, BLOCK_SIZE - 3), true);
  assert.equal(canPlace(grid, byId('h3'), 0, BLOCK_SIZE - 2), false, 'sticks out the right edge');
  assert.equal(canPlace(grid, byId('h3'), -1, 0), false, 'above the board');
  assert.equal(canPlace(grid, byId('v3'), BLOCK_SIZE - 2, 0), false, 'sticks out the bottom');
  grid[0]![1] = cell(3);
  assert.equal(canPlace(grid, byId('h3'), 0, 0), false, 'overlaps an occupied cell');
  assert.equal(canPlace(grid, byId('h3'), 1, 0), true);
});

test('canPlaceAnywhere / anyMoves: full board has no moves, one gap fits only a dot', () => {
  const grid = createBlockGrid();
  for (let r = 0; r < BLOCK_SIZE; r++) fillRow(grid, r);
  grid[3]![4] = null;
  assert.equal(canPlaceAnywhere(grid, byId('dot')), true);
  assert.equal(canPlaceAnywhere(grid, byId('h2')), false);
  assert.equal(anyMoves(grid, [piece('h2'), null, piece('sq2')]), false);
  assert.equal(anyMoves(grid, [piece('h2'), null, piece('dot')]), true);
});

test('applyMove: completing a row clears it and scores', () => {
  const grid = createBlockGrid();
  fillRow(grid, 5, [2, 3, 4]);
  const res = applyMove(grid, piece('h3', 2), 5, 2, 0);
  assert.deepEqual(res.rows, [5]);
  assert.deepEqual(res.cols, []);
  assert.equal(res.cleared.length, BLOCK_SIZE);
  assert.equal(res.streak, 1);
  assert.equal(res.points, 3 + 10);
  assert.ok(grid[5]!.every((v) => v === null));
});

test('applyMove: completing a column clears it', () => {
  const grid = createBlockGrid();
  fillCol(grid, 0, [0, 1]);
  const res = applyMove(grid, piece('v2'), 0, 0, 0);
  assert.deepEqual(res.cols, [0]);
  assert.ok(grid.every((row) => row[0] === null));
});

test('applyMove: row + column at once clears the shared cell only once', () => {
  const grid = createBlockGrid();
  fillRow(grid, 0, [0]);
  fillCol(grid, 0, [0]);
  const res = applyMove(grid, piece('dot', 4), 0, 0, 0);
  assert.deepEqual(res.rows, [0]);
  assert.deepEqual(res.cols, [0]);
  assert.equal(res.cleared.length, BLOCK_SIZE * 2 - 1);
  assert.equal(res.points, 1 + 10 * 2 * 2);
  assert.equal(res.cleared.find((p) => p.r === 0 && p.c === 0)?.color, 4);
});

test('applyMove: a move that clears nothing resets the streak and leaves the piece on the board', () => {
  const grid = createBlockGrid();
  const res = applyMove(grid, piece('sq2', 6), 2, 2, 3);
  assert.equal(res.streak, 0);
  assert.equal(res.cleared.length, 0);
  assert.equal(res.points, 4);
  assert.equal(grid[2]![2]?.color, 6);
  assert.equal(grid[3]![3]?.color, 6);
});

test('findFullLines ignores partial lines', () => {
  const grid = createBlockGrid();
  fillRow(grid, 2, [BLOCK_SIZE - 1]);
  assert.deepEqual(findFullLines(grid), { rows: [], cols: [] });
});

test('scoreMove: streaks add a flat bonus', () => {
  assert.equal(scoreMove(4, 0, 0), 4);
  assert.equal(scoreMove(4, 1, 1), 14);
  assert.equal(scoreMove(4, 1, 3), 4 + 10 + 40);
  assert.equal(scoreMove(5, 3, 1), 5 + 90);
});

test('stageFor: monotonic, starts at 0, capped', () => {
  assert.equal(stageFor(0), 0);
  assert.equal(stageFor(24), 0);
  assert.equal(stageFor(25), 1);
  assert.equal(stageFor(100), 2);
  assert.equal(stageFor(10_000_000), MAX_STAGE);
  let prev = 0;
  for (let s = 0; s < 6000; s += 25) {
    const st = stageFor(s);
    assert.ok(st >= prev);
    prev = st;
  }
});

test('tierShares: medium and large pieces are in the mix from stage 0, jumbo joins at stage 1', () => {
  const t0 = tierShares(0);
  assert.ok(t0[2] > 0 && t0[3] > 0);
  assert.equal(t0[4], 0);
  assert.ok(tierShares(1)[4] > 0);
  assert.ok(tierShares(MAX_STAGE)[1] >= 0.08, 'tier 1 never fully disappears');
  assert.ok(tierShares(MAX_STAGE)[1] < tierShares(0)[1], 'starter pieces thin out over time');
});

test('every shape fits somewhere on an empty board', () => {
  const grid = createBlockGrid();
  for (const s of SHAPES) assert.equal(canPlaceAnywhere(grid, s), true, s.id);
});

test('tier 4 pieces are genuinely large', () => {
  const jumbo = SHAPES.filter((s) => s.tier === 4);
  assert.ok(jumbo.length >= 4);
  for (const s of jumbo) assert.ok(s.cells.length >= 7, s.id);
  assert.ok(Math.max(...SHAPES.map((s) => s.cells.length)) >= 12);
});

test('nextTray: stage 0 never deals jumbo pieces but does deal medium and large ones', () => {
  const rng = mulberry32(7);
  const grid = createBlockGrid();
  const seen = new Set<number>();
  for (let i = 0; i < 300; i++) {
    for (const p of nextTray(grid, rng, 0)) {
      assert.notEqual(p.shape.tier, 4);
      seen.add(p.shape.tier);
    }
  }
  assert.ok(seen.has(1) && seen.has(2) && seen.has(3));
});

test('nextTray: stage 1 starts dealing jumbo pieces', () => {
  const rng = mulberry32(5);
  const grid = createBlockGrid();
  let sawJumbo = false;
  for (let i = 0; i < 300 && !sawJumbo; i++) {
    sawJumbo = nextTray(grid, rng, 1).some((p) => p.shape.tier === 4);
  }
  assert.ok(sawJumbo);
});

test('nextTray: higher stages eventually deal tier 3 shapes', () => {
  const rng = mulberry32(11);
  const grid = createBlockGrid();
  let sawTier3 = false;
  for (let i = 0; i < 200 && !sawTier3; i++) {
    sawTier3 = nextTray(grid, rng, MAX_STAGE).some((p) => p.shape.tier === 3);
  }
  assert.ok(sawTier3);
});

test('nextTray: fair stages always include a placeable piece when the board allows one', () => {
  const rng = mulberry32(3);
  const grid = createBlockGrid();
  // Nearly full board: only a few single gaps, so most random pieces won't fit.
  for (let r = 0; r < BLOCK_SIZE; r++) for (let c = 0; c < BLOCK_SIZE; c++) grid[r]![c] = cell();
  grid[0]![0] = null;
  grid[4]![4] = null;
  for (let i = 0; i < 100; i++) {
    const tray = nextTray(grid, rng, FAIR_TRAY_BELOW_STAGE - 1);
    assert.ok(anyMoves(grid, tray), 'tray should contain a dot on a board with single gaps');
  }
});

test('applyMove: jewels in a cleared line are counted, others are not', () => {
  const grid = createBlockGrid();
  fillRow(grid, 4, [1, 2]);
  grid[4]![6] = cell(1, true); // a pre-placed jewel crate in the row
  const res = applyMove(grid, piece('h2', 3, [1]), 4, 1, 0); // second block of the piece is a jewel
  assert.deepEqual(res.rows, [4]);
  assert.equal(res.jewels, 2);
  assert.equal(res.cleared.filter((p) => p.jewel).length, 2);
  assert.ok(grid[4]!.every((v) => v === null));
});

test('applyMove: a jewel whose line does not clear stays on the board as a jewel', () => {
  const grid = createBlockGrid();
  const res = applyMove(grid, piece('h2', 2, [0]), 0, 0, 0);
  assert.equal(res.jewels, 0);
  assert.equal(grid[0]![0]?.jewel, true);
  assert.equal(grid[0]![1]?.jewel, false);
});

test('applyMove: a jewel at a row/column intersection is only counted once', () => {
  const grid = createBlockGrid();
  fillRow(grid, 0, [0]);
  fillCol(grid, 0, [0]);
  const res = applyMove(grid, piece('dot', 1, [0]), 0, 0, 0);
  assert.equal(res.jewels, 1);
});

test('makePiece: jewelRate 0 never adds jewels, rate 1 always adds valid distinct ones', () => {
  const rng = mulberry32(21);
  for (let i = 0; i < 200; i++) {
    const s = SHAPES[Math.floor(rng() * SHAPES.length)]!;
    assert.deepEqual(makePiece(rng, s, 0).jewels, []);
    const p = makePiece(rng, s, 1);
    assert.ok(p.jewels.length >= 1 && p.jewels.length <= 2, s.id);
    assert.equal(new Set(p.jewels).size, p.jewels.length);
    for (const j of p.jewels) assert.ok(j >= 0 && j < s.cells.length, s.id);
  }
});

test('makePiece: single-cell shapes can only carry one jewel', () => {
  const rng = mulberry32(2);
  for (let i = 0; i < 50; i++) assert.deepEqual(makePiece(rng, byId('dot'), 1).jewels, [0]);
});

test('nextTray: jewelRate flows through to the dealt pieces', () => {
  const rng = mulberry32(8);
  const grid = createBlockGrid();
  for (const p of nextTray(grid, rng, 0, 1)) assert.ok(p.jewels.length >= 1);
  for (const p of nextTray(grid, rng, 0, 0)) assert.equal(p.jewels.length, 0);
});

test('nextTray: forceFair deals a playable tray even at high stages', () => {
  const rng = mulberry32(13);
  const grid = createBlockGrid();
  for (let r = 0; r < BLOCK_SIZE; r++) for (let c = 0; c < BLOCK_SIZE; c++) grid[r]![c] = cell();
  grid[2]![5] = null;
  for (let i = 0; i < 100; i++) assert.ok(anyMoves(grid, nextTray(grid, rng, MAX_STAGE, 0, true)));
});
