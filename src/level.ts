// Pure level config and progress-state tracking. No DOM, no game.ts imports.

import type { Mask, ObstacleKind, Pos, SpecialKind } from './board.ts';

export type Objective =
  | { kind: 'score'; target: number }
  | { kind: 'clearTiles'; target: number }
  | { kind: 'dropItems'; target: number }
  | { kind: 'collectColor'; color: number; target: number };

export interface LevelConfig {
  id: number;
  name: string;
  rows: number;
  cols: number;
  /** undefined = every cell playable. */
  mask?: Mask;
  nTypes: number;
  moveLimit: number;
  /** One or two; a level is won once every objective's target is met. */
  objectives: Objective[];
  obstacles: { pos: Pos; kind: ObstacleKind; hits: number }[];
  dropItems: Pos[];
  enabledSpecials: Set<SpecialKind>;
  /** Seeds the level's RNG (mulberry32), so a given level always deals the same board. */
  seed: number;
}

export interface ObjectiveProgress {
  objective: Objective;
  current: number;
}

export type LevelStatus = 'playing' | 'won' | 'lost';

export interface LevelState {
  objectives: ObjectiveProgress[];
  movesRemaining: number;
  moveLimit: number;
  score: number;
  status: LevelStatus;
}

export function createLevelState(config: LevelConfig): LevelState {
  return finalize({
    objectives: config.objectives.map((objective) => ({ objective, current: 0 })),
    movesRemaining: config.moveLimit,
    moveLimit: config.moveLimit,
    score: 0,
    status: 'playing',
  });
}

function cloneState(state: LevelState): LevelState {
  return {
    objectives: state.objectives.map((o) => ({ ...o })),
    movesRemaining: state.movesRemaining,
    moveLimit: state.moveLimit,
    score: state.score,
    status: state.status,
  };
}

function allObjectivesMet(state: LevelState): boolean {
  return state.objectives.every((o) => o.current >= o.objective.target);
}

/** Resolves status from the current numbers; a terminal status never reverts to 'playing'. */
function finalize(state: LevelState): LevelState {
  if (state.status !== 'playing') return state;
  if (allObjectivesMet(state)) state.status = 'won';
  else if (state.movesRemaining <= 0) state.status = 'lost';
  return state;
}

export function applyScore(state: LevelState, delta: number): LevelState {
  const next = cloneState(state);
  next.score += delta;
  for (const o of next.objectives) {
    if (o.objective.kind === 'score') o.current = Math.min(o.objective.target, next.score);
  }
  return finalize(next);
}

/** clearedCounts is ActivationResult.clearedCounts (index = Gem.type). */
export function applyClear(state: LevelState, clearedCounts: number[]): LevelState {
  const next = cloneState(state);
  for (const o of next.objectives) {
    if (o.objective.kind === 'collectColor') {
      const n = clearedCounts[o.objective.color] ?? 0;
      o.current = Math.min(o.objective.target, o.current + n);
    }
  }
  return finalize(next);
}

export function applyObstaclesCleared(state: LevelState, n: number): LevelState {
  const next = cloneState(state);
  for (const o of next.objectives) {
    if (o.objective.kind === 'clearTiles') o.current = Math.min(o.objective.target, o.current + n);
  }
  return finalize(next);
}

export function applyDropItems(state: LevelState, n: number): LevelState {
  const next = cloneState(state);
  for (const o of next.objectives) {
    if (o.objective.kind === 'dropItems') o.current = Math.min(o.objective.target, o.current + n);
  }
  return finalize(next);
}

/** Every committed swap (matched or a combo) costs exactly one move, win-or-lose. */
export function recordMove(state: LevelState): LevelState {
  const next = cloneState(state);
  next.movesRemaining = Math.max(0, next.movesRemaining - 1);
  return finalize(next);
}

export function checkOutcome(state: LevelState): LevelStatus {
  return state.status;
}
