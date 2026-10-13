import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isUnlocked, recordWin, starsFor } from '../src/levels-progress.ts';
import type { LevelProgress } from '../src/levels-progress.ts';

// recordWin round-trips through localStorage (via storage.ts); Node has no
// localStorage global, so stub a minimal in-memory one just for this file.
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

test('isUnlocked: level 1 is always open', () => {
  assert.equal(isUnlocked({}, 1), true);
});

test('isUnlocked: a later level needs the one before it recorded', () => {
  const progress: LevelProgress = { 1: { stars: 2, bestScore: 500 } };
  assert.equal(isUnlocked(progress, 2), true);
  assert.equal(isUnlocked(progress, 3), false);
});

test('starsFor: fewer moves spent earns more stars', () => {
  assert.equal(starsFor(10, 20), 3); // 50% or less
  assert.equal(starsFor(14, 20), 2); // 51-75%
  assert.equal(starsFor(15, 20), 2);
  assert.equal(starsFor(16, 20), 1); // over 75%
  assert.equal(starsFor(20, 20), 1);
});

test('recordWin: keeps the best stars and best score across repeated wins', () => {
  const after1 = recordWin(5, 300, 18, 20); // 90% of moves -> 1 star
  assert.equal(after1[5]?.stars, 1);
  assert.equal(after1[5]?.bestScore, 300);

  const after2 = recordWin(5, 200, 8, 20); // 40% of moves -> 3 stars, but lower score
  assert.equal(after2[5]?.stars, 3);
  assert.equal(after2[5]?.bestScore, 300); // score doesn't regress
});
