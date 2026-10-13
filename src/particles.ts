// Simple gravity-affected particle burst, used for the match-clear sparkle.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}

export class ParticleSystem {
  list: Particle[] = [];

  burst(x: number, y: number, color: string): void {
    for (let i = 0; i < 8; i++) {
      const ang = Math.random() * Math.PI * 2;
      const sp = 1.2 + Math.random() * 2.6;
      this.list.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - 1.2,
        life: 0.55,
        max: 0.55,
        size: 0.05 + Math.random() * 0.07,
        color,
      });
    }
  }

  step(dt: number): void {
    for (const p of this.list) {
      p.life -= dt;
      p.vy += 6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    this.list = this.list.filter((p) => p.life > 0);
  }
}
