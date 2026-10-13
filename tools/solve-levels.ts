// Headless level solver/simulator: plays each generated level with a random and
// a greedy bot against the pure engine (no rendering, no animation) and reports
// win rates, so the difficulty curve is tuned with data rather than by feel.
// Usage: node tools/solve-levels.ts [runsPerLevel] [strategy: random|greedy|both]

import {
  cellsOfRuns,
  collapse,
  collectDroppedItems,
  createGrid,
  findMoves,
  findRuns,
  mulberry32,
  shuffleGrid,
  swapCells,
} from '../src/board.ts';
import type { Grid, Move, Pos, Rng } from '../src/board.ts';
import { comboActivation, expandActivation, planSpecials } from '../src/specials.ts';
import {
  applyClear,
  applyDropItems,
  applyObstaclesCleared,
  applyScore,
  checkOutcome,
  createLevelState,
  recordMove,
} from '../src/level.ts';
import type { LevelConfig, LevelState } from '../src/level.ts';
import { allLevelIds, generateLevel } from '../src/levelgen.ts';

const key = (p: Pos): number => p.r * 1000 + p.c;

type Strategy = 'random' | 'greedy';

/** Positions still holding an undelivered drop item. */
function dropItemPositions(grid: Grid): Pos[] {
  const positions: Pos[] = [];
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]!;
    for (let c = 0; c < row.length; c++) if (row[c]?.dropItem) positions.push({ r, c });
  }
  return positions;
}

/** A match only pulls a drop item down if it clears a cell *below the item in its
 * own column* -- gravity doesn't move the item for matches elsewhere in the board,
 * or even for matches above it in the same column. Rewarding any column touch (the
 * first version of this heuristic) made greedy fixate on moves that don't actually
 * help, scoring worse than the random bot -- confirmed via tools/debug-dropitems.ts. */
function scoreMoveGreedy(grid: Grid, move: Move, drops: Pos[]): number {
  swapCells(grid, move.a, move.b);
  const runs = findRuns(grid);
  const cleared = cellsOfRuns(runs);
  let s = cleared.length + runs.length * 3;
  for (const item of drops) {
    if (cleared.some((p) => p.c === item.c && p.r > item.r)) s += 500;
  }
  swapCells(grid, move.a, move.b);
  return s;
}

function pickMove(grid: Grid, moves: Move[], rng: Rng, strategy: Strategy): Move {
  if (strategy === 'random') return moves[Math.floor(rng() * moves.length)]!;
  const drops = dropItemPositions(grid);
  let best = moves[0]!;
  let bestScore = -1;
  for (const m of moves) {
    const s = scoreMoveGreedy(grid, m, drops);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  return best;
}

/** Mirrors game.ts's resolve loop synchronously, no animation. */
function resolveCascade(grid: Grid, config: LevelConfig, state: LevelState, rng: Rng, swapEndpoints: Pos[]): LevelState {
  let combo = 0;
  for (;;) {
    const runs = findRuns(grid);
    if (runs.length === 0) return state;
    combo++;
    const plans = planSpecials(runs, combo === 1 ? swapEndpoints : [], config.enabledSpecials);
    for (const plan of plans) grid[plan.pos.r]![plan.pos.c]!.special = plan.special;
    const upgraded = new Set(plans.map((p) => key(p.pos)));
    const seedCells = cellsOfRuns(runs).filter((p) => !upgraded.has(key(p)));
    state = applyActivation(grid, config, state, expandActivation(grid, seedCells), combo, shapeBonusOf(runs));
    if (checkOutcome(state) !== 'playing') return state;
    state = collectDropItemsAndRefill(grid, config, state, rng);
    if (checkOutcome(state) !== 'playing') return state;
  }
}

function shapeBonusOf(runs: { cells: Pos[] }[]): number {
  let bonus = 0;
  for (const run of runs) {
    const n = run.cells.length;
    bonus += n === 4 ? 40 : n >= 5 ? 100 : 0;
  }
  return bonus;
}

function applyActivation(
  grid: Grid,
  config: LevelConfig,
  state: LevelState,
  result: ReturnType<typeof expandActivation>,
  comboMultiplier: number,
  flatBonus: number,
): LevelState {
  for (const p of result.damaged) {
    const cell = grid[p.r]?.[p.c];
    if (cell?.obstacle) cell.obstacle = { ...cell.obstacle, hits: cell.obstacle.hits - 1 };
  }
  let obstaclesCleared = 0;
  for (const p of result.cleared) if (grid[p.r]?.[p.c]?.obstacle) obstaclesCleared++;
  const pts = result.cleared.length * 10 + flatBonus;
  let next = applyScore(state, pts * comboMultiplier);
  next = applyClear(next, result.clearedCounts);
  if (obstaclesCleared > 0) next = applyObstaclesCleared(next, obstaclesCleared);
  for (const p of result.cleared) grid[p.r]![p.c] = null;
  return next;
}

function collectDropItemsAndRefill(grid: Grid, config: LevelConfig, state: LevelState, rng: Rng): LevelState {
  collapse(grid, config.nTypes, rng, config.mask);
  if (config.dropItems.length === 0) return state;
  const dropped = collectDroppedItems(grid, config.mask);
  if (dropped.length === 0) return state;
  for (const p of dropped) grid[p.r]![p.c] = null;
  const next = applyDropItems(state, dropped.length);
  collapse(grid, config.nTypes, rng, config.mask);
  return next;
}

function simulateOnce(config: LevelConfig, strategy: Strategy, runSeed: number): { won: boolean; movesUsed: number } {
  const rng = mulberry32(config.seed ^ runSeed);
  const grid = createGrid(config.rows, config.cols, config.nTypes, rng, config.mask);
  for (const ob of config.obstacles) {
    const cell = grid[ob.pos.r]?.[ob.pos.c];
    if (cell) cell.obstacle = { kind: ob.kind, hits: ob.hits };
  }
  for (const pos of config.dropItems) {
    const cell = grid[pos.r]?.[pos.c];
    if (cell) cell.dropItem = true;
  }

  let state = createLevelState(config);
  let safety = 0;
  while (checkOutcome(state) === 'playing') {
    if (++safety > 500) break; // backstop against any unforeseen non-termination
    let moves = findMoves(grid);
    if (moves.length === 0) {
      // Mirrors game.ts's ensurePlayable(): a stuck board reshuffles rather than
      // ending the level. Omitting this made the solver undercount win rates
      // across the board, not just for dropItems -- confirmed by comparing runs
      // with and without this fallback.
      shuffleGrid(grid, config.nTypes, rng, config.mask);
      moves = findMoves(grid);
      if (moves.length === 0) break; // shouldn't happen; shuffleGrid guarantees a move
    }
    const move = pickMove(grid, moves, rng, strategy);
    swapCells(grid, move.a, move.b);
    const combo = comboActivation(grid, move.a, move.b);
    if (!combo && findRuns(grid).length === 0) {
      swapCells(grid, move.a, move.b);
      continue; // shouldn't happen: findMoves() only returns match-creating moves
    }
    state = recordMove(state);
    if (combo) {
      state = applyActivation(grid, config, state, combo, 1, 150);
      if (checkOutcome(state) === 'playing') state = collectDropItemsAndRefill(grid, config, state, rng);
      if (checkOutcome(state) === 'playing') state = resolveCascade(grid, config, state, rng, []);
    } else {
      state = resolveCascade(grid, config, state, rng, [move.a, move.b]);
    }
  }
  return { won: checkOutcome(state) === 'won', movesUsed: config.moveLimit - state.movesRemaining };
}

function main(): void {
  const runsPerLevel = Number(process.argv[2] ?? 30);
  const strategyArg = (process.argv[3] ?? 'both') as Strategy | 'both';
  const strategies: Strategy[] = strategyArg === 'both' ? ['random', 'greedy'] : [strategyArg];

  console.log(`Simulating ${allLevelIds().length} levels x ${runsPerLevel} runs x ${strategies.join('+')}...\n`);
  console.log('lvl  rows cols types moves obj'.padEnd(40) + strategies.map((s) => s.padStart(10)).join(''));

  const bandSummary: Record<string, { sum: number; n: number }> = {};
  const bandMoveFrac: Record<string, { sum: number; n: number }> = {};

  for (const level of allLevelIds()) {
    const config = generateLevel(level);
    const rates: number[] = [];
    const moveFracs: number[] = [];
    for (const strategy of strategies) {
      let wins = 0;
      let moveFracSum = 0;
      let moveFracN = 0;
      for (let i = 0; i < runsPerLevel; i++) {
        const { won, movesUsed } = simulateOnce(config, strategy, i * 7919 + 1);
        if (won) {
          wins++;
          moveFracSum += movesUsed / config.moveLimit;
          moveFracN++;
        }
      }
      const rate = wins / runsPerLevel;
      rates.push(rate);
      moveFracs.push(moveFracN > 0 ? moveFracSum / moveFracN : 0);
      const band = `${Math.floor((level - 1) / 10) * 10 + 1}-${Math.floor((level - 1) / 10) * 10 + 10}`;
      const bkey = `${band}:${strategy}`;
      bandSummary[bkey] ??= { sum: 0, n: 0 };
      bandSummary[bkey]!.sum += rate;
      bandSummary[bkey]!.n += 1;
      if (moveFracN > 0) {
        bandMoveFrac[bkey] ??= { sum: 0, n: 0 };
        bandMoveFrac[bkey]!.sum += moveFracSum / moveFracN;
        bandMoveFrac[bkey]!.n += 1;
      }
    }
    const objDesc = config.objectives.map((o) => o.kind).join('+');
    const line =
      `${String(level).padStart(3)}  ${String(config.rows).padStart(4)} ${String(config.cols).padStart(4)} ` +
      `${String(config.nTypes).padStart(5)} ${String(config.moveLimit).padStart(5)} ${objDesc}`.padEnd(40) +
      rates.map((r, i) => `${Math.round(r * 100)}%`.padStart(10) + ` (${Math.round(moveFracs[i]! * 100)}%mv)`).join('');
    console.log(line);
  }

  console.log('\nBand win-rate averages (and avg % of move limit used on wins):');
  for (const [bkey, { sum, n }] of Object.entries(bandSummary)) {
    const mv = bandMoveFrac[bkey];
    const mvStr = mv ? `, ${Math.round((mv.sum / mv.n) * 100)}%mv` : '';
    console.log(`  ${bkey}: ${Math.round((sum / n) * 100)}%${mvStr}`);
  }
}

main();
