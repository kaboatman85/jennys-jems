// Visual gem sprites and the move/land animations built on top of a TweenEngine.
// Game state (grid) and visuals (sprites) stay separate; tweens move sprites,
// then the logic grid is updated.

import type { Gem } from './board.ts';
import type { TweenEngine } from './tween.ts';

export interface Sprite {
  gem: Gem;
  x: number; // column position, in cell units (fractional while animating)
  y: number; // row position, in cell units
  sx: number;
  sy: number;
  a: number;
}

export interface MoveItem {
  s: Sprite;
  x: number;
  y: number;
  dur: number;
  ease: (t: number) => number;
}

export function animateMany(engine: TweenEngine, items: MoveItem[]): Promise<void> {
  if (items.length === 0) return Promise.resolve();
  const starts = items.map((i) => ({ x: i.s.x, y: i.s.y }));
  const maxDur = Math.max(...items.map((i) => i.dur));
  return engine.add(maxDur, (k) => {
    items.forEach((it, idx) => {
      const local = Math.min(1, (k * maxDur) / it.dur);
      const e = it.ease(local);
      const st = starts[idx]!;
      it.s.x = st.x + (it.x - st.x) * e;
      it.s.y = st.y + (it.y - st.y) * e;
    });
  });
}

export async function landSquash(engine: TweenEngine, list: Sprite[]): Promise<void> {
  await engine.add(0.13, (k) => {
    const w = Math.sin(Math.PI * k);
    for (const s of list) {
      s.sx = 1 + 0.1 * w;
      s.sy = 1 - 0.14 * w;
    }
  });
  for (const s of list) {
    s.sx = 1;
    s.sy = 1;
  }
}
