import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLOCK_SIZE, MAX_STAGE, findFullLines, tierShares } from '../src/blocks.ts';
import {
  BLOCK_LEVEL_COUNT,
  STAGE_FLOOR,
  TEMPLATES,
  allBlockLevelIds,
  buildBlockLevelGrid,
  countLayoutJewels,
  generateBlockLevel,
} from '../src/blocks-levels.ts';

test('every template is a full-size grid that opens with no complete line', () => {
  for (const t of TEMPLATES) {
    assert.equal(t.rows.length, BLOCK_SIZE, t.name);
    for (const r of t.rows) assert.match(r, new RegExp(`^[.#]{${BLOCK_SIZE}}$`), t.name);
    const grid = buildBlockLevelGrid({ ...generateBlockLevel(1), layout: t.rows, color: t.color });
    assert.deepEqual(findFullLines(grid), { rows: [], cols: [] }, t.name);
  }
});

test('the tree from the reference screenshot is one of the patterns', () => {
  assert.ok(TEMPLATES.some((t) => t.name === 'Tree'));
});

test('every generated level is well-formed, deterministic, and opens with no complete line', () => {
  assert.ok(BLOCK_LEVEL_COUNT >= 50);
  for (const id of allBlockLevelIds()) {
    const lvl = generateBlockLevel(id);
    assert.equal(lvl.id, id);
    assert.equal(lvl.layout.length, BLOCK_SIZE);
    for (const r of lvl.layout) assert.match(r, new RegExp(`^[.#J]{${BLOCK_SIZE}}$`), `level ${id}`);
    assert.deepEqual(generateBlockLevel(id), lvl, `level ${id} not deterministic`);
    assert.deepEqual(findFullLines(buildBlockLevelGrid(lvl)), { rows: [], cols: [] }, `level ${id}`);
    assert.ok(lvl.stage >= STAGE_FLOOR && lvl.stage <= MAX_STAGE);
    assert.ok(lvl.jewelRate > 0 && lvl.jewelRate <= 1);
  }
});

test('levels start with some jewels on the board, and a goal that needs more than those', () => {
  for (const id of allBlockLevelIds()) {
    const lvl = generateBlockLevel(id);
    const jewels = countLayoutJewels(lvl);
    assert.ok(jewels >= 1, `level ${id} has no jewels on the board`);
    assert.ok(lvl.goal > jewels, `level ${id}: goal ${lvl.goal} not above starting jewels ${jewels}`);
  }
});

test('goals and piece-mix stage never get easier as levels go up', () => {
  let goal = 0;
  let stage = -Infinity;
  for (const id of allBlockLevelIds()) {
    const lvl = generateBlockLevel(id);
    assert.ok(lvl.goal >= goal);
    assert.ok(lvl.stage >= stage);
    goal = lvl.goal;
    stage = lvl.stage;
  }
});

test('buildBlockLevelGrid places jewels and plain blocks where the layout says', () => {
  const lvl = generateBlockLevel(1);
  const grid = buildBlockLevelGrid(lvl);
  lvl.layout.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const cell = grid[r]![c];
      if (ch === '.') assert.equal(cell, null);
      else assert.equal(cell?.jewel, ch === 'J');
    }),
  );
});

test('early levels deal an easy mix: mostly small pieces, no large or jumbo ones', () => {
  const first = generateBlockLevel(1);
  assert.equal(first.stage, STAGE_FLOOR);
  const shares = tierShares(first.stage);
  assert.ok(shares[1] > shares[2]);
  assert.equal(shares[3], 0);
  assert.equal(shares[4], 0);
});

test('the piece mix is never negative at any stage a level can use', () => {
  for (const id of allBlockLevelIds()) {
    const shares = tierShares(generateBlockLevel(id).stage);
    for (const v of Object.values(shares)) assert.ok(v >= 0);
  }
});
