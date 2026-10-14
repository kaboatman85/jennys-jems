// Headless bot that plays every block-puzzle level against the pure engine and
// reports win rates, so the difficulty curve in blocks-levels.ts is tuned with
// data rather than by feel.
// Usage: node tools/solve-block-levels.ts [runsPerLevel] [strategy: random|greedy|both]

import { mulberry32 } from '../src/board.ts';
import type { Rng } from '../src/board.ts';
import { BLOCK_SIZE, anyMoves, applyMove, canPlace, nextTray } from '../src/blocks.ts';
import type { BlockGrid, Piece } from '../src/blocks.ts';
import { allBlockLevelIds, buildBlockLevelGrid, generateBlockLevel } from '../src/blocks-levels.ts';
import type { BlockLevelConfig } from '../src/blocks-levels.ts';

type Strategy = 'random' | 'greedy';

interface Candidate {
  slot: number;
  r: number;
  c: number;
  value: number;
}

function bestMove(grid: BlockGrid, tray: Array<Piece | null>, rng: Rng, strategy: Strategy): Candidate | null {
  let best: Candidate | null = null;
  for (let slot = 0; slot < tray.length; slot++) {
    const piece = tray[slot];
    if (!piece) continue;
    for (let r = 0; r <= BLOCK_SIZE - piece.shape.h; r++) {
      for (let c = 0; c <= BLOCK_SIZE - piece.shape.w; c++) {
        if (!canPlace(grid, piece.shape, r, c)) continue;
        let value = rng();
        if (strategy === 'greedy') {
          const trial = grid.map((row) => row.slice());
          const res = applyMove(trial, piece, r, c, 0);
          const filled = trial.flat().filter((v) => v !== null).length;
          // Jewels are the goal; otherwise prefer clears and an uncrowded board.
          value = res.jewels * 60 + res.cleared.length * 8 - filled + rng() * 0.5;
        }
        if (!best || value > best.value) best = { slot, r, c, value };
      }
    }
  }
  return best;
}

function play(cfg: BlockLevelConfig, strategy: Strategy, runSeed: number): { won: boolean; pieces: number } {
  const rng = mulberry32(cfg.seed * 1000003 + runSeed);
  const grid = buildBlockLevelGrid(cfg);
  let tray: Array<Piece | null> = nextTray(grid, rng, cfg.stage, cfg.jewelRate, true);
  let jewels = 0;
  let streak = 0;
  let pieces = 0;
  while (pieces < 600) {
    if (!anyMoves(grid, tray)) return { won: false, pieces };
    const move = bestMove(grid, tray, rng, strategy);
    if (!move) return { won: false, pieces };
    const res = applyMove(grid, tray[move.slot]!, move.r, move.c, streak);
    streak = res.streak;
    jewels += res.jewels;
    pieces++;
    tray[move.slot] = null;
    if (jewels >= cfg.goal) return { won: true, pieces };
    if (tray.every((p) => p === null)) tray = nextTray(grid, rng, cfg.stage, cfg.jewelRate);
  }
  return { won: false, pieces };
}

function main(): void {
  const runs = Number(process.argv[2] ?? 40);
  const arg = (process.argv[3] ?? 'both') as Strategy | 'both';
  const strategies: Strategy[] = arg === 'both' ? ['random', 'greedy'] : [arg];

  console.log(`Simulating ${allBlockLevelIds().length} block levels x ${runs} runs x ${strategies.join('+')}...\n`);
  console.log('lvl name'.padEnd(22) + 'goal  stage' + strategies.map((s) => s.padStart(12)).join(''));

  const bands: Record<string, { sum: number; n: number }> = {};
  for (const id of allBlockLevelIds()) {
    const cfg = generateBlockLevel(id);
    const cells: string[] = [];
    for (const strategy of strategies) {
      let wins = 0;
      let pieceSum = 0;
      for (let i = 0; i < runs; i++) {
        const { won, pieces } = play(cfg, strategy, i * 7919 + 1);
        if (won) {
          wins++;
          pieceSum += pieces;
        }
      }
      const rate = wins / runs;
      cells.push(`${Math.round(rate * 100)}% (${wins ? Math.round(pieceSum / wins) : 0}p)`.padStart(12));
      const band = `${Math.floor((id - 1) / 10) * 10 + 1}-${Math.floor((id - 1) / 10) * 10 + 10}:${strategy}`;
      bands[band] ??= { sum: 0, n: 0 };
      bands[band]!.sum += rate;
      bands[band]!.n++;
    }
    console.log(`${String(id).padStart(3)} ${cfg.name.padEnd(18)}${String(cfg.goal).padStart(4)}${String(cfg.stage).padStart(6)}${cells.join('')}`);
  }
  console.log('\nBand win-rate averages:');
  for (const [band, { sum, n }] of Object.entries(bands)) console.log(`  ${band}: ${Math.round((sum / n) * 100)}%`);
}

main();
