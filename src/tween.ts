// Generic time-based tweening, independent of what it animates.

export interface Tween {
  t0: number;
  durMs: number;
  update: (k: number) => void;
  done: () => void;
}

export const easeInQuad = (t: number): number => t * t;
export const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export class TweenEngine {
  private tweens: Tween[] = [];

  add(durSec: number, update: (k: number) => void): Promise<void> {
    return new Promise<void>((resolve) => {
      this.tweens.push({ t0: performance.now(), durMs: durSec * 1000, update, done: resolve });
    });
  }

  /** Advance all running tweens to the current time. */
  step(): void {
    const t = performance.now();
    const running = this.tweens;
    this.tweens = [];
    for (const tw of running) {
      const k = Math.max(0, Math.min(1, (t - tw.t0) / tw.durMs));
      tw.update(k);
      if (k >= 1) tw.done();
      else this.tweens.push(tw);
    }
  }

  /** Finish every running tween immediately (used when a new game interrupts). */
  flush(): void {
    const pending = this.tweens;
    this.tweens = [];
    for (const t of pending) {
      t.update(1);
      t.done();
    }
  }
}
