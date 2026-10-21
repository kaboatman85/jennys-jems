import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockLevelWon, loadBlockProgress, recordBlockWin } from '../src/blocks-progress.ts';

// Progress round-trips through localStorage (via storage.ts); Node has none, so stub one.
const memory = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => memory.get(k) ?? null,
  setItem: (k: string, v: string) => memory.set(k, v),
  removeItem: (k: string) => memory.delete(k),
  clear: () => memory.clear(),
  key: () => null,
  get length() {
    return memory.size;
  },
} as Storage;

test('isBlockLevelWon reflects recorded wins only', () => {
  memory.clear();
  const p = loadBlockProgress();
  assert.equal(isBlockLevelWon(p, 1), false);
  const after = recordBlockWin(1, 120);
  assert.equal(isBlockLevelWon(after, 1), true);
  assert.equal(isBlockLevelWon(after, 2), false);
});

test('recordBlockWin keeps the better score and persists', () => {
  memory.clear();
  recordBlockWin(4, 300);
  recordBlockWin(4, 150);
  assert.equal(loadBlockProgress()[4]?.bestScore, 300);
  recordBlockWin(4, 410);
  assert.equal(loadBlockProgress()[4]?.bestScore, 410);
});
