import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isBlockLevelUnlocked, isBlockLevelWon, loadBlockProgress, recordBlockWin } from '../src/blocks-progress.ts';

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

test('level 1 is always unlocked; level N needs N-1 won', () => {
  memory.clear();
  const p = loadBlockProgress();
  assert.equal(isBlockLevelUnlocked(p, 1), true);
  assert.equal(isBlockLevelUnlocked(p, 2), false);
  const after = recordBlockWin(1, 120);
  assert.equal(isBlockLevelUnlocked(after, 2), true);
  assert.equal(isBlockLevelUnlocked(after, 3), false);
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
