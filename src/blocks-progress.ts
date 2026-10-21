// Which block-puzzle levels are beaten, plus the best score on each.
// Goes through storage.ts like everything else.

import { loadJSON, saveJSON } from './storage.ts';

export interface BlockLevelRecord {
  bestScore: number;
}

export type BlockProgress = Record<number, BlockLevelRecord>;

const KEY = 'jj.blocks.levels';

export function loadBlockProgress(): BlockProgress {
  return loadJSON<BlockProgress>(KEY, {});
}

export function isBlockLevelWon(progress: BlockProgress, id: number): boolean {
  return progress[id] !== undefined;
}

/** Records a win (keeping the better score if there's already one) and returns the updated progress. */
export function recordBlockWin(id: number, score: number): BlockProgress {
  const progress = loadBlockProgress();
  const prev = progress[id];
  progress[id] = { bestScore: Math.max(score, prev?.bestScore ?? 0) };
  saveJSON(KEY, progress);
  return progress;
}
