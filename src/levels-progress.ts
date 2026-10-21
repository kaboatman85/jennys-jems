// Per-level star ratings and unlock progression, localStorage-backed only.
import { loadJSON, saveJSON } from './storage.ts';

const KEY = 'jj.levels';

export interface LevelRecord {
  stars: number;
  bestScore: number;
}

export type LevelProgress = Record<number, LevelRecord>;

export function loadProgress(): LevelProgress {
  return loadJSON<LevelProgress>(KEY, {});
}

/** Fewer moves spent relative to the level's budget earns more stars. */
export function starsFor(movesUsed: number, moveLimit: number): number {
  const frac = moveLimit > 0 ? movesUsed / moveLimit : 1;
  if (frac <= 0.5) return 3;
  if (frac <= 0.75) return 2;
  return 1;
}

export function recordWin(levelId: number, score: number, movesUsed: number, moveLimit: number): LevelProgress {
  const progress = loadProgress();
  const stars = starsFor(movesUsed, moveLimit);
  const prev = progress[levelId];
  progress[levelId] = {
    stars: Math.max(stars, prev?.stars ?? 0),
    bestScore: Math.max(score, prev?.bestScore ?? 0),
  };
  saveJSON(KEY, progress);
  return progress;
}
