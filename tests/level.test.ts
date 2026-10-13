import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyClear,
  applyDropItems,
  applyObstaclesCleared,
  applyScore,
  checkOutcome,
  createLevelState,
  recordMove,
} from '../src/level.ts';
import type { LevelConfig } from '../src/level.ts';

function baseConfig(overrides: Partial<LevelConfig> = {}): LevelConfig {
  return {
    id: 1,
    name: 'test',
    rows: 8,
    cols: 8,
    nTypes: 6,
    moveLimit: 10,
    objectives: [{ kind: 'score', target: 1000 }],
    obstacles: [],
    dropItems: [],
    enabledSpecials: new Set(),
    seed: 1,
    ...overrides,
  };
}

test('createLevelState: initializes every objective at 0 and moves at the limit', () => {
  const config = baseConfig({
    moveLimit: 15,
    objectives: [
      { kind: 'score', target: 500 },
      { kind: 'collectColor', color: 2, target: 10 },
    ],
  });
  const state = createLevelState(config);
  assert.equal(state.movesRemaining, 15);
  assert.equal(state.moveLimit, 15);
  assert.equal(state.score, 0);
  assert.equal(state.status, 'playing');
  assert.equal(state.objectives.length, 2);
  for (const o of state.objectives) assert.equal(o.current, 0);
});

test('applyClear: only advances the matching collectColor objective', () => {
  const config = baseConfig({ objectives: [{ kind: 'collectColor', color: 2, target: 5 }] });
  let state = createLevelState(config);
  state = applyClear(state, [0, 0, 3, 0, 0, 0]); // 3 of color 2
  assert.equal(state.objectives[0]!.current, 3);
  state = applyClear(state, [9, 9, 1, 9, 9, 9]); // other colors ignored, +1 more of color 2
  assert.equal(state.objectives[0]!.current, 4);
  assert.equal(state.status, 'playing');
  state = applyClear(state, [0, 0, 5, 0, 0, 0]); // clamps at target, doesn't overshoot
  assert.equal(state.objectives[0]!.current, 5);
  assert.equal(state.status, 'won');
});

test('applyScore: advances a score objective and clamps at target', () => {
  const config = baseConfig({ objectives: [{ kind: 'score', target: 100 }] });
  let state = createLevelState(config);
  state = applyScore(state, 60);
  assert.equal(state.objectives[0]!.current, 60);
  assert.equal(state.status, 'playing');
  state = applyScore(state, 80);
  assert.equal(state.score, 140);
  assert.equal(state.objectives[0]!.current, 100, 'objective progress clamps even if score overshoots');
  assert.equal(state.status, 'won');
});

test('applyObstaclesCleared and applyDropItems advance their own objective kinds only', () => {
  const config = baseConfig({
    objectives: [
      { kind: 'clearTiles', target: 3 },
      { kind: 'dropItems', target: 2 },
    ],
  });
  let state = createLevelState(config);
  state = applyObstaclesCleared(state, 2);
  assert.equal(state.objectives[0]!.current, 2);
  assert.equal(state.objectives[1]!.current, 0);
  state = applyDropItems(state, 1);
  assert.equal(state.objectives[1]!.current, 1);
  assert.equal(state.status, 'playing');
  state = applyObstaclesCleared(state, 5);
  state = applyDropItems(state, 5);
  assert.equal(state.objectives[0]!.current, 3, 'clamps at target');
  assert.equal(state.objectives[1]!.current, 2, 'clamps at target');
  assert.equal(state.status, 'won');
});

test('a 2-objective level needs both met to win', () => {
  const config = baseConfig({
    objectives: [
      { kind: 'score', target: 100 },
      { kind: 'collectColor', color: 0, target: 5 },
    ],
  });
  let state = createLevelState(config);
  state = applyScore(state, 100);
  assert.equal(state.status, 'playing', 'only one of two objectives met');
  state = applyClear(state, [5, 0, 0, 0, 0, 0]);
  assert.equal(state.status, 'won', 'both objectives now met');
});

test('recordMove: decrements movesRemaining by exactly 1, never below 0; out-of-moves is a loss', () => {
  const config = baseConfig({ moveLimit: 2, objectives: [{ kind: 'score', target: 1000000 }] });
  let state = createLevelState(config);
  state = recordMove(state);
  assert.equal(state.movesRemaining, 1);
  assert.equal(state.status, 'playing');
  state = recordMove(state);
  assert.equal(state.movesRemaining, 0);
  assert.equal(checkOutcome(state), 'lost');
  state = recordMove(state);
  assert.equal(state.movesRemaining, 0, 'never goes negative');
  assert.equal(state.status, 'lost', 'a terminal status never reverts');
});

test('a won level stays won even if more clears/score arrive afterward', () => {
  const config = baseConfig({ objectives: [{ kind: 'score', target: 10 }], moveLimit: 1 });
  let state = createLevelState(config);
  state = applyScore(state, 10);
  assert.equal(state.status, 'won');
  // Simulate running out of moves after already winning -- must not flip to 'lost'.
  state = { ...state, movesRemaining: 0 };
  const after = applyScore(state, 0);
  assert.equal(after.status, 'won');
});
