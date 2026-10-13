import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findRuns, newGem } from '../src/board.ts';
import type { Grid, Pos, Special } from '../src/board.ts';
import {
  comboActivation,
  expandActivation,
  planSpecials,
  specialEffectCells,
} from '../src/specials.ts';

function gridFrom(rows: number[][]): Grid {
  return rows.map((row) => row.map((t) => newGem(t)));
}

function withSpecial(g: Grid, p: Pos, special: Special): Grid {
  g[p.r]![p.c] = { ...g[p.r]![p.c]!, special };
  return g;
}

function withObstacle(g: Grid, p: Pos, hits: number): Grid {
  g[p.r]![p.c] = { ...g[p.r]![p.c]!, obstacle: { kind: 'ice', hits } };
  return g;
}

const has = (cells: Pos[], p: Pos): boolean => cells.some((c) => c.r === p.r && c.c === p.c);

test('planSpecials: straight runs map to laser/hypercube/star by length', () => {
  const g = gridFrom([
    [0, 0, 0, 0, 1],
    [2, 3, 4, 5, 1],
  ]);
  const plans = planSpecials(findRuns(g));
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.special, { kind: 'laser', orientation: 'h' });

  const g5 = gridFrom([[0, 0, 0, 0, 0]]);
  const plans5 = planSpecials(findRuns(g5));
  assert.equal(plans5.length, 1);
  assert.deepEqual(plans5[0]!.special, { kind: 'hypercube' });

  const g6 = gridFrom([[0, 0, 0, 0, 0, 0]]);
  const plans6 = planSpecials(findRuns(g6));
  assert.equal(plans6.length, 1);
  assert.deepEqual(plans6[0]!.special, { kind: 'star' });

  const g7 = gridFrom([[0, 0, 0, 0, 0, 0, 0]]);
  assert.deepEqual(planSpecials(findRuns(g7))[0]!.special, { kind: 'star' });
});

test('planSpecials: a plain 3-run produces no plan', () => {
  const g = gridFrom([[0, 0, 0, 1]]);
  assert.equal(planSpecials(findRuns(g)).length, 0);
});

test('planSpecials: an L/T/+ cross of runs becomes one Bomb, not two plans', () => {
  // Column of three 1s at col 1, crossed by a row of three 1s at row 2.
  const g = gridFrom([
    [9, 1, 9],
    [8, 1, 8],
    [1, 1, 1],
  ]);
  const runs = findRuns(g);
  assert.equal(runs.length, 2, 'one vertical run + one horizontal run');
  const plans = planSpecials(runs);
  assert.equal(plans.length, 1, 'crossing runs collapse into a single shape');
  assert.deepEqual(plans[0]!.special, { kind: 'bomb' });
});

test('planSpecials: a lone 2x2 block becomes a Bomb', () => {
  const g = gridFrom([
    [0, 0, 1],
    [0, 0, 2],
    [3, 4, 5],
  ]);
  const runs = findRuns(g);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.dir, 'sq');
  const plans = planSpecials(runs);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.special, { kind: 'bomb' });
});

test("planSpecials: a directly-created Laser's orientation follows the swipe, not the match's own line", () => {
  // The match itself is a horizontal 4-run (row 1), but the player's swap endpoints
  // are vertically aligned (col 2, rows 0-1) -- with only 2 rows, no vertical run is
  // even possible, so this is unambiguously just the one horizontal match. The swipe
  // was vertical, so the Laser should clear vertically despite the matched line
  // running horizontally.
  const g = gridFrom([
    [6, 7, 5, 8, 9],
    [0, 0, 0, 0, 1],
  ]);
  const runs = findRuns(g);
  assert.equal(runs.length, 1);
  assert.equal(runs[0]!.dir, 'h');

  const plans = planSpecials(runs, [
    { r: 0, c: 2 },
    { r: 1, c: 2 },
  ]);
  assert.equal(plans.length, 1);
  assert.deepEqual(plans[0]!.special, { kind: 'laser', orientation: 'v' });
  assert.deepEqual(plans[0]!.pos, { r: 1, c: 2 });
});

test('planSpecials: a cascade-formed Laser (no swipe to reference) falls back to the matched line direction', () => {
  const g = gridFrom([[0, 0, 0, 0, 1]]);
  const plans = planSpecials(findRuns(g), []);
  assert.deepEqual(plans[0]!.special, { kind: 'laser', orientation: 'h' });
});

test('planSpecials: enabledSpecials restricts which kinds a level allows', () => {
  const g = gridFrom([[0, 0, 0, 0, 1]]);
  const runs = findRuns(g);
  const allowed = planSpecials(runs, [], new Set(['laser']));
  assert.equal(allowed.length, 1);
  const disallowed = planSpecials(runs, [], new Set(['bomb']));
  assert.equal(disallowed.length, 0, 'laser is disabled, so the shape creates nothing');
});

test('planSpecials: two unrelated shapes in one findRuns() call yield two plans', () => {
  const g = gridFrom([
    [0, 0, 0, 0, 9, 9, 9, 9, 9],
    [1, 2, 3, 4, 5, 0, 1, 2, 3],
  ]);
  const plans = planSpecials(findRuns(g));
  assert.equal(plans.length, 2);
  const kinds = plans.map((p) => p.special.kind).sort();
  assert.deepEqual(kinds, ['hypercube', 'laser']);
});

test('planSpecials: spawn position uses the swap endpoint that falls inside the shape', () => {
  const g = gridFrom([[0, 0, 0, 0, 1]]);
  const runs = findRuns(g);
  const plans = planSpecials(runs, [
    { r: 5, c: 5 },
    { r: 0, c: 2 },
  ]);
  assert.deepEqual(plans[0]!.pos, { r: 0, c: 2 });
});

test('planSpecials: with no swap endpoints, falls back deterministically', () => {
  const line = gridFrom([[0, 0, 0, 0, 1]]);
  const plans = planSpecials(findRuns(line));
  assert.deepEqual(plans[0]!.pos, { r: 0, c: 2 }); // floor(4/2) = cells[2] of a 4-cell run

  const cross = gridFrom([
    [9, 1, 9],
    [8, 1, 8],
    [1, 1, 1],
  ]);
  const crossPlans = planSpecials(findRuns(cross));
  assert.deepEqual(crossPlans[0]!.pos, { r: 2, c: 1 }, 'intersection cell of the cross');
});

test('specialEffectCells: laser clears its row or column, clipped at edges, excluding its own cell', () => {
  const g = gridFrom([
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]);
  const row = specialEffectCells(g, { r: 1, c: 1 }, { kind: 'laser', orientation: 'h' });
  assert.equal(row.length, 2);
  assert.ok(has(row, { r: 1, c: 0 }) && has(row, { r: 1, c: 2 }));
  assert.ok(!has(row, { r: 1, c: 1 }));

  const col = specialEffectCells(g, { r: 1, c: 1 }, { kind: 'laser', orientation: 'v' });
  assert.equal(col.length, 2);
  assert.ok(has(col, { r: 0, c: 1 }) && has(col, { r: 2, c: 1 }));
});

test('specialEffectCells: bomb clears a 3x3 minus itself, clipped at a corner', () => {
  const g = gridFrom([
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ]);
  const corner = specialEffectCells(g, { r: 0, c: 0 }, { kind: 'bomb' });
  assert.equal(corner.length, 3); // (0,1) (1,0) (1,1) only
  for (const p of corner) assert.ok(p.r >= 0 && p.r < 3 && p.c >= 0 && p.c < 3);

  const center = specialEffectCells(g, { r: 1, c: 1 }, { kind: 'bomb' });
  assert.equal(center.length, 8);
});

test('specialEffectCells: star unions row, column, and 3x3, clipped at an edge', () => {
  const g = gridFrom([
    [0, 0, 0, 0],
    [0, 0, 0, 0],
    [0, 0, 0, 0],
  ]);
  const cells = specialEffectCells(g, { r: 0, c: 0 }, { kind: 'star' });
  for (const p of cells) assert.ok(p.r >= 0 && p.r < 3 && p.c >= 0 && p.c < 4);
  assert.ok(has(cells, { r: 0, c: 3 }), 'full row reached');
  assert.ok(has(cells, { r: 2, c: 0 }), 'full column reached');
  assert.ok(has(cells, { r: 1, c: 1 }), '3x3 block corner reached');
  const unique = new Set(cells.map((p) => p.r * 1000 + p.c));
  assert.equal(unique.size, cells.length, 'no duplicate cells from the overlapping shapes');
});

test('specialEffectCells: hypercube targets colorHint, or its own type if omitted', () => {
  const g = gridFrom([
    [0, 1, 0],
    [1, 2, 1],
    [0, 1, 0],
  ]);
  const hinted = specialEffectCells(g, { r: 1, c: 1 }, { kind: 'hypercube' }, 1);
  assert.equal(hinted.length, 4);
  for (const p of hinted) assert.equal(g[p.r]![p.c]!.type, 1);

  const defaulted = specialEffectCells(g, { r: 0, c: 0 }, { kind: 'hypercube' });
  assert.equal(defaulted.length, 3); // type-0 cells excluding itself
  for (const p of defaulted) assert.equal(g[p.r]![p.c]!.type, 0);
});

test('expandActivation: a plain run returns exactly its cells with correct counts', () => {
  const g = gridFrom([[1, 1, 1]]);
  const cells: Pos[] = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
  const result = expandActivation(g, cells);
  assert.equal(result.cleared.length, 3);
  assert.equal(result.clearedCounts[1], 3);
  assert.equal(result.clearedCounts.reduce((a, b) => a + b, 0), 3);
});

test('expandActivation: a matched special expands to its effect cells', () => {
  let g = gridFrom([
    [0, 0, 0],
    [1, 2, 3],
    [4, 5, 6 % 6],
  ]);
  g = withSpecial(g, { r: 0, c: 1 }, { kind: 'laser', orientation: 'h' });
  const result = expandActivation(g, [{ r: 0, c: 1 }]);
  assert.ok(has(result.cleared, { r: 0, c: 0 }));
  assert.ok(has(result.cleared, { r: 0, c: 2 }));
  assert.equal(result.cleared.length, 3);
});

test('expandActivation: one bomb detonating another chains through the board', () => {
  let g = gridFrom([
    [0, 1, 2, 3],
    [1, 2, 3, 4],
    [2, 3, 4, 5],
    [3, 4, 5, 0],
  ]);
  g = withSpecial(g, { r: 0, c: 0 }, { kind: 'bomb' });
  g = withSpecial(g, { r: 1, c: 1 }, { kind: 'bomb' }); // inside the first bomb's 3x3
  const result = expandActivation(g, [{ r: 0, c: 0 }]);
  // First bomb's 3x3 (clipped) reaches (1,1); its bomb then reaches (2,2) as well.
  assert.ok(has(result.cleared, { r: 1, c: 1 }), 'second bomb chain-triggers');
  assert.ok(has(result.cleared, { r: 2, c: 2 }), 'second bomb cleared its own 3x3');
});

test('expandActivation: a dense board of adjacent specials still terminates', () => {
  const g: Grid = [];
  for (let r = 0; r < 8; r++) {
    const row = [];
    for (let c = 0; c < 8; c++) {
      const gem = newGem((r + c) % 6);
      gem.special = { kind: 'bomb' };
      row.push(gem);
    }
    g.push(row);
  }
  let loops = 0;
  const seen = new Set<string>();
  const queue: Pos[] = [{ r: 0, c: 0 }];
  // Sanity-check the engine itself bounds its work, mirroring board.test.ts's
  // cascade-termination style: expandActivation must not revisit a cell.
  const result = expandActivation(g, queue);
  for (const p of result.cleared) {
    const k = `${p.r},${p.c}`;
    assert.ok(!seen.has(k), 'no cell cleared twice');
    seen.add(k);
    assert.ok(++loops < 1000, 'did not terminate');
  }
  assert.equal(result.cleared.length, 64, 'whole dense board resolves in one pass');
});

test('comboActivation: two plain gems is not a combo', () => {
  const g = gridFrom([[0, 1]]);
  assert.equal(comboActivation(g, { r: 0, c: 0 }, { r: 0, c: 1 }), null);
});

test('comboActivation: Laser+Laser clears full row and column at the swap destination', () => {
  let g = gridFrom([
    [0, 1, 2],
    [3, 4, 5],
    [0, 1, 2],
  ]);
  g = withSpecial(g, { r: 1, c: 1 }, { kind: 'laser', orientation: 'v' }); // a
  g = withSpecial(g, { r: 1, c: 0 }, { kind: 'laser', orientation: 'h' }); // b (combo center)
  const result = comboActivation(g, { r: 1, c: 1 }, { r: 1, c: 0 })!;
  assert.ok(result);
  assert.ok(has(result.cleared, { r: 1, c: 1 }) && has(result.cleared, { r: 1, c: 2 }), 'row at (1,*)');
  assert.ok(has(result.cleared, { r: 0, c: 0 }) && has(result.cleared, { r: 2, c: 0 }), 'column at (*,0)');
  assert.equal(result.cleared.length, 5);
});

test('comboActivation: Bomb+Bomb clears a 5x5 centered on the swap destination, clipped', () => {
  const g: Grid = [];
  for (let r = 0; r < 6; r++) {
    const row = [];
    for (let c = 0; c < 6; c++) row.push(newGem((r + c) % 6));
    g.push(row);
  }
  let gg = g;
  gg = withSpecial(gg, { r: 0, c: 0 }, { kind: 'bomb' });
  gg = withSpecial(gg, { r: 0, c: 1 }, { kind: 'bomb' });
  const result = comboActivation(gg, { r: 0, c: 0 }, { r: 0, c: 1 })!;
  assert.ok(result);
  for (const p of result.cleared) assert.ok(p.r >= 0 && p.r < 6 && p.c >= 0 && p.c < 6);
  assert.ok(has(result.cleared, { r: 2, c: 3 }), '5x5 reaches two rows/cols past center');
  assert.ok(!has(result.cleared, { r: 3, c: 3 }), '5x5 does not reach three past center');
});

test('comboActivation: Laser+Bomb clears a 3-wide row and column band', () => {
  const g: Grid = [];
  for (let r = 0; r < 6; r++) {
    const row = [];
    for (let c = 0; c < 6; c++) row.push(newGem((r + c) % 6));
    g.push(row);
  }
  let gg = g;
  gg = withSpecial(gg, { r: 2, c: 2 }, { kind: 'laser', orientation: 'h' });
  gg = withSpecial(gg, { r: 2, c: 3 }, { kind: 'bomb' });
  const result = comboActivation(gg, { r: 2, c: 2 }, { r: 2, c: 3 })!;
  assert.ok(result);
  assert.ok(has(result.cleared, { r: 1, c: 3 }) && has(result.cleared, { r: 3, c: 3 }), 'band reaches row above/below');
  assert.ok(has(result.cleared, { r: 2, c: 5 }), 'band reaches full width of the center row');
  assert.ok(!has(result.cleared, { r: 0, c: 0 }), 'band does not reach a cell outside both the row and column bands');
});

test('comboActivation: Hypercube+plain clears exactly every gem of that color', () => {
  let g = gridFrom([
    [0, 1, 0],
    [1, 2, 1],
    [0, 1, 0],
  ]);
  g = withSpecial(g, { r: 1, c: 1 }, { kind: 'hypercube' });
  const result = comboActivation(g, { r: 1, c: 1 }, { r: 1, c: 0 })!;
  assert.ok(result);
  assert.equal(result.cleared.length, 5, 'four color-1 cells plus the hypercube itself');
  assert.ok(has(result.cleared, { r: 1, c: 1 }), 'the hypercube itself is consumed');
  const colorCells = result.cleared.filter((p) => !(p.r === 1 && p.c === 1));
  assert.equal(colorCells.length, 4);
  for (const p of colorCells) assert.equal(g[p.r]![p.c]!.type, 1);
});

test("comboActivation: Hypercube+Laser clears that color plus each matching cell's row", () => {
  let g = gridFrom([
    [9, 9, 9, 9, 9],
    [9, 9, 9, 9, 9],
    [9, 1, 2, 9, 9],
    [9, 9, 9, 9, 9],
    [9, 9, 9, 9, 1],
  ]);
  g = withSpecial(g, { r: 2, c: 2 }, { kind: 'hypercube' });
  g = withSpecial(g, { r: 2, c: 1 }, { kind: 'laser', orientation: 'h' });
  const result = comboActivation(g, { r: 2, c: 2 }, { r: 2, c: 1 })!;
  assert.ok(result);
  assert.equal(result.cleared.length, 10, "both color-1 cells' full rows, nothing else");
  assert.ok(has(result.cleared, { r: 4, c: 0 }), 'the laser effect applies to the distant color-1 cell too, not just the swapped one');
  assert.ok(!has(result.cleared, { r: 0, c: 0 }), 'an untouched row stays clear of the blast');
  assert.ok(!has(result.cleared, { r: 1, c: 0 }), 'an untouched row stays clear of the blast');
});

test('comboActivation: Hypercube+Hypercube clears the whole occupied board', () => {
  const g = gridFrom([
    [0, 1],
    [2, 3],
  ]);
  const gg = withSpecial(withSpecial(g, { r: 0, c: 0 }, { kind: 'hypercube' }), { r: 0, c: 1 }, {
    kind: 'hypercube',
  });
  const result = comboActivation(gg, { r: 0, c: 0 }, { r: 0, c: 1 })!;
  assert.ok(result);
  assert.equal(result.cleared.length, 4);
});

test('upgrading a cell to special preserves its id (sprite continuity)', () => {
  const g = gridFrom([[0]]);
  const before = g[0]![0]!.id;
  const gg = withSpecial(g, { r: 0, c: 0 }, { kind: 'bomb' });
  assert.equal(gg[0]![0]!.id, before);
});

test('expandActivation: a multi-hit obstacle adjacent to a clear is damaged, not cleared', () => {
  let g = gridFrom([[0, 0, 0, 1]]);
  g = withObstacle(g, { r: 0, c: 3 }, 2);
  const seed = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
  const result = expandActivation(g, seed);
  assert.equal(result.cleared.length, 3, 'only the three matched gems clear');
  assert.ok(has(result.damaged, { r: 0, c: 3 }), 'adjacent obstacle takes a hit');
  assert.ok(!has(result.cleared, { r: 0, c: 3 }), 'obstacle survives at 1 hit remaining');
});

test('expandActivation: an obstacle at its last hit breaks and clears when adjacent to a clear', () => {
  let g = gridFrom([[0, 0, 0, 1]]);
  g = withObstacle(g, { r: 0, c: 3 }, 1);
  const seed = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
  const result = expandActivation(g, seed);
  assert.ok(has(result.cleared, { r: 0, c: 3 }), 'last hit breaks the obstacle');
  assert.equal(result.clearedCounts[1], 1, 'the broken obstacle\'s own color counts once it clears');
  assert.equal(result.damaged.length, 0);
});

test('expandActivation: a frozen cell is never matchable, only damageable by adjacency/blast', () => {
  // The obstacle cell itself must never appear as a direct match seed in practice
  // (findRuns already treats it as inert); this confirms expandActivation also
  // never "matches" it directly -- only clears it via the obstacle hit path.
  let g = gridFrom([[0, 0, 0, 1]]);
  g = withObstacle(g, { r: 0, c: 3 }, 1);
  const result = expandActivation(g, [{ r: 0, c: 3 }]); // hit it directly, as a special blast would
  assert.ok(has(result.cleared, { r: 0, c: 3 }));
  assert.equal(result.clearedCounts[1], 1);
});

test('expandActivation: a bomb blast directly reaching an obstacle damages/breaks it', () => {
  let g = gridFrom([
    [5, 6, 7],
    [8, 2, 9],
    [1, 3, 4],
  ]);
  g = withObstacle(g, { r: 0, c: 0 }, 1);
  g = withSpecial(g, { r: 1, c: 1 }, { kind: 'bomb' });
  const result = expandActivation(g, [{ r: 1, c: 1 }]);
  assert.ok(has(result.cleared, { r: 0, c: 0 }), 'blast reaches and breaks the 1-hit obstacle');
  assert.ok(has(result.cleared, { r: 1, c: 1 }), 'the bomb itself clears too');
});

test('expandActivation: breaking one obstacle chain-damages a neighboring obstacle', () => {
  let g = gridFrom([[0, 0, 0, 1, 2]]);
  g = withObstacle(g, { r: 0, c: 3 }, 1);
  g = withObstacle(g, { r: 0, c: 4 }, 1);
  const seed = [{ r: 0, c: 0 }, { r: 0, c: 1 }, { r: 0, c: 2 }];
  const result = expandActivation(g, seed);
  assert.ok(has(result.cleared, { r: 0, c: 3 }), 'first obstacle breaks from the match');
  assert.ok(has(result.cleared, { r: 0, c: 4 }), 'second obstacle breaks from the chain, not the original match');
});
