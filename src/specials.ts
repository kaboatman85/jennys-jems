// Pure special-piece logic: which matches create specials, what they clear, how
// chains and combo swaps resolve. No DOM, no rendering, no game.ts imports.

import type { Grid, Pos, Run, Special } from './board.ts';
import { TYPES, numCols, numRows } from './board.ts';
export type { Special, SpecialKind } from './board.ts';

export interface SpecialPlan {
  pos: Pos;
  special: Special;
}

export interface ActivationResult {
  cleared: Pos[];
  /** Cleared-gem count per type (index = Gem.type), for color-collection objectives. */
  clearedCounts: number[];
}

const key = (p: Pos): number => p.r * 1000 + p.c;

/**
 * Groups one findRuns() call's runs into connected shapes (runs sharing a cell
 * form an L/T/+ cross, or come from a 2x2 block) and decides which shapes become
 * which special. swapEndpoints (the player's swap positions, first cascade step
 * only) decide spawn position when a shape contains one of them; otherwise a
 * deterministic in-shape cell is used (cascade-born specials have no "where it
 * landed"). When swapEndpoints form an adjacent horizontal/vertical pair, that
 * swipe direction also decides a directly-created Laser's orientation (clears
 * along the swipe, not the matched line) -- a cascade-formed Laser has no swipe
 * to reference and falls back to the line's own direction.
 */
export function planSpecials(runs: Run[], swapEndpoints: Pos[] = []): SpecialPlan[] {
  let swipeOrientation: 'h' | 'v' | null = null;
  if (swapEndpoints.length === 2) {
    const [p0, p1] = swapEndpoints as [Pos, Pos];
    if (p0.r === p1.r && p0.c !== p1.c) swipeOrientation = 'h';
    else if (p0.c === p1.c && p0.r !== p1.r) swipeOrientation = 'v';
  }

  const n = runs.length;
  const parent = Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) i = parent[i]!;
    return i;
  };
  const union = (i: number, j: number): void => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  const cellRunIdxs = new Map<number, number[]>();
  runs.forEach((run, i) => {
    for (const p of run.cells) {
      const k = key(p);
      const arr = cellRunIdxs.get(k);
      if (arr) arr.push(i);
      else cellRunIdxs.set(k, [i]);
    }
  });
  for (const idxs of cellRunIdxs.values()) {
    for (let a = 1; a < idxs.length; a++) union(idxs[0]!, idxs[a]!);
  }

  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const arr = groups.get(root);
    if (arr) arr.push(i);
    else groups.set(root, [i]);
  }

  const plans: SpecialPlan[] = [];
  for (const idxs of groups.values()) {
    const groupRuns = idxs.map((i) => runs[i]!);

    const cellMap = new Map<number, Pos>();
    for (const run of groupRuns) for (const p of run.cells) cellMap.set(key(p), p);

    let swipeEndpoint: Pos | undefined;
    for (const ep of swapEndpoints) {
      if (cellMap.has(key(ep))) {
        swipeEndpoint = ep;
        break;
      }
    }

    let special: Special | null = null;
    if (groupRuns.length === 1) {
      const run = groupRuns[0]!;
      const dir = run.dir;
      if (dir === 'sq') {
        special = { kind: 'bomb' };
      } else {
        const len = run.cells.length;
        if (len === 4) {
          const orientation = swipeEndpoint && swipeOrientation ? swipeOrientation : dir;
          special = { kind: 'laser', orientation };
        } else if (len === 5) {
          special = { kind: 'hypercube' };
        } else if (len >= 6) {
          special = { kind: 'star' };
        }
      }
    } else {
      special = { kind: 'bomb' };
    }
    if (!special) continue;

    let pos: Pos | undefined = swipeEndpoint;
    if (!pos) {
      if (groupRuns.length === 1) {
        const cells = groupRuns[0]!.cells;
        pos = cells[Math.floor(cells.length / 2)]!;
      } else {
        const counts = new Map<number, number>();
        for (const run of groupRuns) {
          for (const p of run.cells) {
            const k = key(p);
            counts.set(k, (counts.get(k) ?? 0) + 1);
          }
        }
        let interKey: number | undefined;
        for (const [k, c] of counts) {
          if (c >= 2) {
            interKey = k;
            break;
          }
        }
        pos = interKey !== undefined ? cellMap.get(interKey)! : [...cellMap.values()][0]!;
      }
    }

    plans.push({ pos, special });
  }
  return plans;
}

function pushRow(grid: Grid, r: number, out: Pos[]): void {
  for (let c = 0; c < numCols(grid); c++) out.push({ r, c });
}
function pushCol(grid: Grid, c: number, out: Pos[]): void {
  for (let r = 0; r < numRows(grid); r++) out.push({ r, c });
}
function pushBlock(grid: Grid, center: Pos, radius: number, out: Pos[]): void {
  const R = numRows(grid);
  const C = numCols(grid);
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      const r = center.r + dr;
      const c = center.c + dc;
      if (r >= 0 && r < R && c >= 0 && c < C) out.push({ r, c });
    }
  }
}
function pushBand(grid: Grid, center: Pos, half: number, out: Pos[]): void {
  const R = numRows(grid);
  const C = numCols(grid);
  for (let dr = -half; dr <= half; dr++) {
    const r = center.r + dr;
    if (r >= 0 && r < R) pushRow(grid, r, out);
  }
  for (let dc = -half; dc <= half; dc++) {
    const c = center.c + dc;
    if (c >= 0 && c < C) pushCol(grid, c, out);
  }
}
function dedupe(cells: Pos[]): Pos[] {
  const seen = new Set<number>();
  const out: Pos[] = [];
  for (const p of cells) {
    const k = key(p);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(p);
    }
  }
  return out;
}

/**
 * Cells (excluding pos itself) a special clears when activated. colorHint is
 * the target color for a hypercube (the gem it was swapped with); defaults to
 * the hypercube's own type when omitted (e.g. a passive chain-trigger with no
 * swap partner).
 */
export function specialEffectCells(grid: Grid, pos: Pos, special: Special, colorHint?: number): Pos[] {
  const out: Pos[] = [];
  switch (special.kind) {
    case 'laser':
      if (special.orientation === 'v') pushCol(grid, pos.c, out);
      else pushRow(grid, pos.r, out);
      break;
    case 'bomb':
      pushBlock(grid, pos, 1, out);
      break;
    case 'star':
      pushRow(grid, pos.r, out);
      pushCol(grid, pos.c, out);
      pushBlock(grid, pos, 1, out);
      break;
    case 'hypercube': {
      const color = colorHint ?? grid[pos.r]?.[pos.c]?.type;
      if (color !== undefined) {
        for (let r = 0; r < numRows(grid); r++) {
          for (let c = 0; c < numCols(grid); c++) {
            const gem = grid[r]![c];
            if (gem && gem.type === color) out.push({ r, c });
          }
        }
      }
      break;
    }
  }
  return dedupe(out).filter((p) => !(p.r === pos.r && p.c === pos.c));
}

/**
 * Flood-fill chain resolution: starting from initialCells, repeatedly expands
 * through any special's own effect cells until nothing new is discovered.
 * Pure; does not mutate grid.
 */
export function expandActivation(grid: Grid, initialCells: Pos[]): ActivationResult {
  const seen = new Set<number>();
  const cleared: Pos[] = [];
  const clearedCounts = new Array(TYPES).fill(0) as number[];
  const queue: Pos[] = [...initialCells];
  let head = 0;
  while (head < queue.length) {
    const p = queue[head++]!;
    const k = key(p);
    if (seen.has(k)) continue;
    seen.add(k);
    const gem = grid[p.r]?.[p.c];
    if (!gem) continue;
    cleared.push(p);
    clearedCounts[gem.type]++;
    if (gem.special) {
      for (const ec of specialEffectCells(grid, p, gem.special)) queue.push(ec);
    }
  }
  return { cleared, clearedCounts };
}

/**
 * Direct swap-combo rules (Laser+Laser, Bomb+Bomb, Laser+Bomb, Hypercube+anything,
 * Hypercube+Hypercube). Returns null if this isn't a combo swap (the normal
 * match-check path applies instead). Combo center is always `b`, the swap
 * destination — an arbitrary but documented pick; the two cells are adjacent
 * so it has negligible gameplay effect.
 */
export function comboActivation(grid: Grid, a: Pos, b: Pos): ActivationResult | null {
  const gemA = grid[a.r]?.[a.c];
  const gemB = grid[b.r]?.[b.c];
  if (!gemA || !gemB) return null;
  const specialA = gemA.special;
  const specialB = gemB.special;
  if (!specialA && !specialB) return null;

  const center = b;
  const seed: Pos[] = [];

  const isHyperA = specialA?.kind === 'hypercube';
  const isHyperB = specialB?.kind === 'hypercube';

  if (isHyperA && isHyperB) {
    for (let r = 0; r < numRows(grid); r++) {
      for (let c = 0; c < numCols(grid); c++) {
        if (grid[r]![c]) seed.push({ r, c });
      }
    }
  } else if (isHyperA || isHyperB) {
    const otherGem = isHyperA ? gemB : gemA;
    const otherSpecial = isHyperA ? specialB : specialA;
    const color = otherGem.type;
    for (let r = 0; r < numRows(grid); r++) {
      for (let c = 0; c < numCols(grid); c++) {
        const gem = grid[r]![c];
        if (gem && gem.type === color) {
          seed.push({ r, c });
          if (otherSpecial) seed.push(...specialEffectCells(grid, { r, c }, otherSpecial));
        }
      }
    }
  } else if (specialA?.kind === 'laser' && specialB?.kind === 'laser') {
    pushRow(grid, center.r, seed);
    pushCol(grid, center.c, seed);
  } else if (specialA?.kind === 'bomb' && specialB?.kind === 'bomb') {
    pushBlock(grid, center, 2, seed);
  } else if (
    (specialA?.kind === 'laser' && specialB?.kind === 'bomb') ||
    (specialA?.kind === 'bomb' && specialB?.kind === 'laser')
  ) {
    pushBand(grid, center, 1, seed);
  } else {
    return null;
  }

  // a and b (the two swapped specials) are always consumed by the combo, and their own
  // effects are already fully accounted for above (centered on `center`, or via the
  // explicit per-cell otherSpecial sweep for hypercube combos). Exclude them from the
  // generic flood so neither redundantly auto-refires at its own original position with
  // its own (possibly different) orientation/default color.
  const origins = [a, b];
  const isOrigin = (p: Pos): boolean => origins.some((o) => o.r === p.r && o.c === p.c);
  const result = expandActivation(grid, dedupe(seed.filter((p) => !isOrigin(p))));

  const clearedKeys = new Set(result.cleared.map(key));
  for (const o of origins) {
    const k = key(o);
    if (!clearedKeys.has(k)) {
      clearedKeys.add(k);
      result.cleared.push(o);
      result.clearedCounts[grid[o.r]![o.c]!.type]++;
    }
  }
  return result;
}
