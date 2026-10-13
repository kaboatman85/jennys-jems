// Generates the 100 levels from tunable parameters, seeded per level so a given
// level number always deals the same board. Pure; no DOM, no game.ts imports.

import { mulberry32 } from './board.ts';
import type { Mask, ObstacleKind, Pos, Rng, SpecialKind } from './board.ts';
import type { LevelConfig, Objective } from './level.ts';

const LEVEL_COUNT = 100;

/** Every 10th level (past the first band) eases off the curve as a breather. */
function difficultyIndex(level: number): number {
  if (level > 10 && level % 10 === 0) return level - 4;
  return level;
}

function rowsColsFor(level: number): [number, number] {
  if (level <= 20) return [6, 6];
  // Stay at 7x7 through the drop-items band (46-60): fewer columns means a far
  // better chance any given match happens to touch the column that needs it.
  if (level <= 60) return [7, 7];
  if (level <= 85) return [8, 8];
  return [9, 9];
}

/** Capped at 7 -- that's every gem GEM_DEFS defines art for. */
function nTypesFor(level: number): number {
  if (level <= 10) return 4;
  if (level <= 25) return 5;
  if (level <= 55) return 6;
  return 7;
}

/** All specials are available from level 1 -- there's no tutorial ramp gating
 * them in anymore (matches Endless mode, which never gated them either). */
function enabledSpecialsFor(): Set<SpecialKind> {
  return new Set<SpecialKind>(['laser', 'bomb', 'hypercube', 'star']);
}

function cornerBlockMask(rows: number, cols: number, blockSize: number): Mask {
  const mask: Mask = Array.from({ length: rows }, () => Array.from({ length: cols }, () => true));
  const corners: Array<[number, number]> = [
    [0, 0],
    [0, cols - blockSize],
    [rows - blockSize, 0],
    [rows - blockSize, cols - blockSize],
  ];
  for (const [r0, c0] of corners) {
    for (let r = r0; r < r0 + blockSize; r++) {
      for (let c = c0; c < c0 + blockSize; c++) {
        if (r >= 0 && r < rows && c >= 0 && c < cols) mask[r]![c] = false;
      }
    }
  }
  return mask;
}

/** No masks during the tutorial band; roughly a third of levels after that get
 * a mild corner-blocked shape, for variety without every level looking odd. */
function maskFor(level: number, rows: number, cols: number, rng: Rng): Mask | undefined {
  if (level < 21) return undefined;
  if (rng() > 0.35) return undefined;
  const blockSize = Math.max(1, Math.floor(Math.min(rows, cols) * 0.22));
  if (blockSize * 2 >= Math.min(rows, cols)) return undefined; // too small a board to block safely
  return cornerBlockMask(rows, cols, blockSize);
}

function shuffledCells(rows: number, cols: number, mask: Mask | undefined, rng: Rng): Pos[] {
  const cells: Pos[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask || mask[r]?.[c]) cells.push({ r, c });
    }
  }
  for (let i = cells.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cells[i], cells[j]] = [cells[j]!, cells[i]!];
  }
  return cells;
}

function obstaclesFor(
  level: number,
  rows: number,
  cols: number,
  mask: Mask | undefined,
  rng: Rng,
): { pos: Pos; kind: ObstacleKind; hits: number }[] {
  const d = difficultyIndex(level);
  // Ramps faster at low d (the solo clearTiles band, 31-45, was clearing its 3-4
  // obstacles in a handful of moves) but still saturates at the same cap of 6 by
  // d ~= 45, so the already-tuned clearTiles+score combo band (81-100, which was
  // already hitting this cap) is unaffected.
  const count = Math.min(6, 3 + Math.floor(d / 15));
  // The solo clearTiles band (31-45) is the only place level<95 is ever reached
  // here (46-80 don't use clearTiles at all), so bumping it to 2 hits only
  // affects that band -- it was clearing its obstacles in a handful of moves at
  // 1 hit each.
  const hits = level < 95 ? 2 : 3;
  const kind: ObstacleKind = level % 2 === 0 ? 'ice' : 'dirt';
  return shuffledCells(rows, cols, mask, rng)
    .slice(0, count)
    .map((pos) => ({ pos, kind, hits }));
}

/** Placed just above the bottom, not near the top. The pure engine only pulls a
 * drop item down when a match clears a cell *below it in its own column* --
 * matches anywhere else in the board do nothing for it. Starting a journey of
 * even 3-4 rows made delivery depend on several column-specific matches landing
 * within the move budget, which measured out at a near-0% win rate (confirmed
 * via tools/solve-levels.ts). Starting 1-2 rows up means delivery only needs
 * one or two lucky matches in that column, which is far more likely to happen
 * incidentally within a normal move budget. */
function dropItemsFor(level: number, rows: number, cols: number, mask: Mask | undefined, rng: Rng): Pos[] {
  const d = difficultyIndex(level);
  const count = d < 58 ? 1 : 2;
  const journeyRows = 1;
  const startRow = Math.max(0, rows - 1 - journeyRows);
  const bandRows = Math.max(1, rows - 1 - startRow); // never the literal bottom row itself
  const candidates: Pos[] = [];
  for (let r = startRow; r < startRow + bandRows; r++) {
    for (let c = 0; c < cols; c++) {
      if (!mask || mask[r]?.[c]) candidates.push({ r, c });
    }
  }
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [candidates[i], candidates[j]] = [candidates[j]!, candidates[i]!];
  }
  return candidates.slice(0, count);
}

function objectiveKindsFor(level: number): Objective['kind'][] {
  if (level <= 10) return ['score'];
  if (level <= 20) return ['collectColor'];
  if (level <= 30) return ['score'];
  if (level <= 45) return ['clearTiles'];
  if (level <= 60) return ['dropItems'];
  if (level <= 80) return ['score', 'collectColor'];
  return ['clearTiles', 'score'];
}

/** Early levels were clearing their score/color targets in just a handful of
 * moves (as little as 5% of the move budget, confirmed via tools/solve-levels.ts
 * -- a 4-6 color board produces big, frequent cascades, so a small target falls
 * in 2-3 lucky swaps). These boosts scale targets up hardest at low difficulty
 * and taper back toward 1x by the midgame, so the already-tuned late bands
 * (which were using a healthy 50-90% of their move budget) aren't pushed into
 * "too hard" by the same change that fixes the early game. */
function scoreBoost(d: number): number {
  // Two terms: a steep one that only matters for the first ~10 levels (those
  // were finishing in 2-3 lucky moves even after the first attempt at this fix)
  // plus a gentler one that tapers out by the late game, preserving the already
  // well-tuned 80-100 band.
  return 1 + 16 * Math.exp(-d / 8) + 3 * Math.exp(-d / 45);
}
function colorBoost(d: number): number {
  return 1 + 2 * Math.exp(-d / 35);
}

function buildObjectives(
  kinds: Objective['kind'][],
  d: number,
  rows: number,
  cols: number,
  nTypes: number,
  obstacleCount: number,
  dropItemCount: number,
  rng: Rng,
): Objective[] {
  const scoreTarget = Math.round((180 + d * 14 + rows * cols * 0.9) * scoreBoost(d));
  const colorTarget = Math.round((8 + d * 0.22) * colorBoost(d));
  const color = Math.floor(rng() * nTypes);
  const combo = kinds.length > 1;
  return kinds.map((kind): Objective => {
    switch (kind) {
      case 'score':
        return { kind: 'score', target: combo ? Math.round(scoreTarget * 0.45) : scoreTarget };
      case 'collectColor':
        return { kind: 'collectColor', color, target: combo ? Math.round(colorTarget * 0.5) : colorTarget };
      case 'clearTiles':
        return { kind: 'clearTiles', target: Math.max(1, obstacleCount) };
      case 'dropItems':
        return { kind: 'dropItems', target: Math.max(1, dropItemCount) };
    }
  });
}

function moveLimitFor(level: number, rows: number, cols: number, nTypes: number, kinds: Objective['kind'][]): number {
  const d = difficultyIndex(level);
  // More colors means matches are genuinely harder to find, so the move budget
  // grows with nTypes to compensate, not just board size.
  let base = Math.round(20 + Math.sqrt(rows * cols) * 2.3 + (nTypes - 4) * 2.5 - d * 0.015);
  if (kinds.length > 1) base += 14;
  // Delivering a drop item relies on incidental cascades reaching its column,
  // not just clearing enough cells -- give that extra room on its own.
  if (kinds.includes('dropItems')) base += 20;
  return Math.max(16, base);
}

/** Generates level N (1-100) deterministically -- same level number always deals the same board. */
export function generateLevel(level: number): LevelConfig {
  const rng = mulberry32(level);
  const d = difficultyIndex(level);

  const [rows, cols] = rowsColsFor(level);
  const nTypes = nTypesFor(level);
  const enabledSpecials = enabledSpecialsFor();
  const mask = maskFor(level, rows, cols, rng);
  const kinds = objectiveKindsFor(level);

  const obstacles = kinds.includes('clearTiles') ? obstaclesFor(level, rows, cols, mask, rng) : [];
  const dropItems = kinds.includes('dropItems') ? dropItemsFor(level, rows, cols, mask, rng) : [];
  const objectives = buildObjectives(kinds, d, rows, cols, nTypes, obstacles.length, dropItems.length, rng);
  const moveLimit = moveLimitFor(level, rows, cols, nTypes, kinds);

  return {
    id: level,
    name: `Level ${level}`,
    rows,
    cols,
    mask,
    nTypes,
    moveLimit,
    objectives,
    obstacles,
    dropItems,
    enabledSpecials,
    seed: level,
  };
}

export function allLevelIds(): number[] {
  return Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1);
}
