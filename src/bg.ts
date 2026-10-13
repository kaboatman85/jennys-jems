import { FLOWER_COLORS, drawFlower, drawLeaf } from './deco.ts';
import { mulberry32 } from './board.ts';

/** Paints the bright pastel page background with scattered flowers. Static; redrawn on resize. */
export function drawBackground(canvas: HTMLCanvasElement): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, '#ffd3ea');
  g.addColorStop(0.5, '#ffe9cf');
  g.addColorStop(1, '#e2d3ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft polka dots for extra fun.
  const rng = mulberry32(2026);
  ctx.fillStyle = 'rgba(255,255,255,0.45)';
  const dots = Math.round((w * h) / 9000);
  for (let i = 0; i < dots; i++) {
    ctx.beginPath();
    ctx.arc(rng() * w, rng() * h, 2 + rng() * 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Flowers: denser near the edges, a few big ones cropped off the corners.
  const unit = Math.min(w, h);
  const count = Math.round((w * h) / 26000);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = unit * (0.035 + rng() * 0.05);
    const [petal, center] = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)]!;
    ctx.globalAlpha = 0.55;
    drawLeaf(ctx, x, y, r * 1.5, rng() * Math.PI * 2, '#8fdca0');
    drawLeaf(ctx, x, y, r * 1.3, rng() * Math.PI * 2, '#7fd391');
    drawFlower(ctx, x, y, r, petal, center, 5 + Math.floor(rng() * 3), rng() * Math.PI);
  }
  const corners: Array<[number, number]> = [
    [0, 0],
    [w, 0],
    [0, h],
    [w, h],
  ];
  corners.forEach(([x, y], i) => {
    const [petal, center] = FLOWER_COLORS[(i * 2) % FLOWER_COLORS.length]!;
    ctx.globalAlpha = 0.9;
    drawLeaf(ctx, x, y, unit * 0.3, i * 1.6 + 0.4, '#79cf8d');
    drawLeaf(ctx, x, y, unit * 0.26, i * 1.6 + 1.1, '#8fdca0');
    drawFlower(ctx, x, y, unit * 0.17, petal, center, 7, i);
  });
  ctx.globalAlpha = 1;
}
