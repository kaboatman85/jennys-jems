// Level definitions for the block puzzle's jewel-collecting mode. Each level starts
// from a pre-filled pattern with some jewel crates in it; clearing a row or column
// that contains a jewel collects it, and the level is won at the goal count.
// Patterns are hand-authored; difficulty (goal, extra clutter, piece mix, how often
// dealt pieces carry jewels) is generated from the level number. Pure, deterministic.

import { mulberry32 } from './board.ts';
import type { Rng } from './board.ts';
import { BLOCK_SIZE, MAX_STAGE, createBlockGrid } from './blocks.ts';
import type { BlockGrid } from './blocks.ts';

export interface BlockLevelConfig {
  id: number;
  name: string;
  /** BLOCK_SIZE rows of BLOCK_SIZE chars: '.' empty, '#' block, 'J' jewel crate. */
  layout: string[];
  /** Color index (GEM_DEFS) of the pre-placed blocks. */
  color: number;
  goal: number;
  /** Chance a dealt piece carries a jewel. */
  jewelRate: number;
  /** Piece-mix stage (see tierShares in blocks.ts). */
  stage: number;
  seed: number;
}

interface Template {
  name: string;
  color: number;
  rows: string[];
}

// Every row and column must keep at least one gap, so a level never opens with a free clear.
export const TEMPLATES: Template[] = [
  {
    name: 'Tree',
    color: 1,
    rows: ['...#....', '..###...', '.#####..', '..###...', '.#####..', '###.###.', '...#....', '...#....'],
  },
  {
    name: 'Cross',
    color: 4,
    rows: ['...##...', '...##...', '...##...', '.######.', '.######.', '...##...', '...##...', '........'],
  },
  {
    name: 'Zigzag',
    color: 6,
    rows: ['##......', '.##.....', '..##....', '...##...', '....##..', '.....##.', '......##', '........'],
  },
  {
    name: 'Corners',
    color: 2,
    rows: ['###..###', '#......#', '#......#', '........', '........', '#......#', '#......#', '###..###'],
  },
  {
    name: 'Towers',
    color: 0,
    rows: ['##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '##....##', '........'],
  },
  {
    name: 'Pyramid',
    color: 3,
    rows: ['#.......', '##......', '###.....', '####....', '#####...', '######..', '#######.', '........'],
  },
  {
    name: 'Frame',
    color: 5,
    rows: ['.######.', '#......#', '#......#', '#......#', '#......#', '#......#', '#......#', '.######.'],
  },
  {
    name: 'Stripes',
    color: 2,
    rows: ['#.#.#.#.', '#.#.#.#.', '#.#.#.#.', '#.#.#.#.', '#.#.#.#.', '#.#.#.#.', '#.#.#.#.', '........'],
  },
  {
    name: 'House',
    color: 6,
    rows: ['...##...', '..####..', '.######.', '.######.', '.##..##.', '.##..##.', '.##..##.', '........'],
  },
  {
    name: 'Diamond',
    color: 1,
    rows: ['...##...', '..####..', '.######.', '.######.', '.##..##.', '.######.', '..####..', '...##...'],
  },
  {
    name: 'Heart',
    color: 5,
    rows: ['.##..##.', '.######.', '.######.', '.######.', '..####..', '...##...', '........', '........'],
  },
  {
    name: 'Blocks',
    color: 4,
    rows: ['##..##..', '##..##..', '..##..##', '..##..##', '........', '........', '........', '........'],
  },
  {
    name: 'Steps',
    color: 0,
    rows: ['##......', '##......', '####....', '####....', '######..', '######..', '........', '........'],
  },
];

const PASSES = 5;

/** Level 1's piece-mix stage: below the endless game's stage 0, so the first levels deal mostly small pieces. */
export const STAGE_FLOOR = -4;

const countFilled = (t: Template): number => t.rows.join('').split('#').length - 1;

/** Lightest pattern first, so each cycle through the list gets steadily denser. */
const ORDERED: Template[] = [...TEMPLATES].sort((a, b) => countFilled(a) - countFilled(b));

export const BLOCK_LEVEL_COUNT = ORDERED.length * PASSES;

type Transform = (rows: string[]) => string[];

const flipH: Transform = (rows) => rows.map((r) => [...r].reverse().join(''));
const flipV: Transform = (rows) => [...rows].reverse();
const transpose: Transform = (rows) => rows[0]!.split('').map((_, c) => rows.map((r) => r[c]).join(''));
const TRANSFORMS: Transform[] = [(r) => r, flipH, flipV, (r) => flipV(flipH(r)), transpose];

function shuffled<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Generates level N (1-based) deterministically. */
export function generateBlockLevel(n: number): BlockLevelConfig {
  const index = (n - 1) % ORDERED.length;
  const pass = Math.floor((n - 1) / ORDERED.length) % PASSES;
  const template = ORDERED[index]!;
  const rng = mulberry32(n * 7919);

  const grid = TRANSFORMS[pass]!(template.rows).map((r) => [...r]);

  // Extra clutter that grows with the level, never completing or nearly completing a line.
  const extra = Math.floor(n / 16);
  const rowCount = grid.map((r) => r.filter((ch) => ch === '#').length);
  const colCount = grid[0]!.map((_, c) => grid.filter((r) => r[c] === '#').length);
  const empties: Array<[number, number]> = [];
  grid.forEach((row, r) => row.forEach((ch, c) => ch === '.' && empties.push([r, c])));
  let added = 0;
  for (const [r, c] of shuffled(empties, rng)) {
    if (added >= extra) break;
    if (rowCount[r]! >= BLOCK_SIZE - 2 || colCount[c]! >= BLOCK_SIZE - 2) continue;
    grid[r]![c] = '#';
    rowCount[r]!++;
    colCount[c]!++;
    added++;
  }

  const filled: Array<[number, number]> = [];
  grid.forEach((row, r) => row.forEach((ch, c) => ch === '#' && filled.push([r, c])));
  const preJewels = Math.min(Math.floor(filled.length / 3), 3 + Math.floor(n / 8));
  for (const [r, c] of shuffled(filled, rng).slice(0, preJewels)) grid[r]![c] = 'J';

  return {
    id: n,
    name: `${template.name} ${n}`,
    layout: grid.map((r) => r.join('')),
    color: template.color,
    goal: Math.round(20 + n * 0.22),
    jewelRate: Math.max(0.6, 0.95 - 0.005 * n),
    stage: Math.min(MAX_STAGE - 2, STAGE_FLOOR + Math.floor((n - 1) / 12)),
    seed: n,
  };
}

export function allBlockLevelIds(): number[] {
  return Array.from({ length: BLOCK_LEVEL_COUNT }, (_, i) => i + 1);
}

/** Builds the starting grid for a level from its layout. */
export function buildBlockLevelGrid(cfg: BlockLevelConfig): BlockGrid {
  const grid = createBlockGrid();
  cfg.layout.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '#' || ch === 'J') grid[r]![c] = { color: cfg.color, jewel: ch === 'J' };
    });
  });
  return grid;
}

export function countLayoutJewels(cfg: BlockLevelConfig): number {
  return cfg.layout.join('').split('J').length - 1;
}
