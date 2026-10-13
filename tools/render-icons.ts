// Dev tool: renders the PWA app icons (plain + maskable) as PNGs into public/icons/.
// Usage: node tools/render-icons.ts
import { createCanvas } from '@napi-rs/canvas';
import { mkdirSync, writeFileSync } from 'node:fs';
import { drawGem } from '../src/gems.ts';

const OUT_DIR = 'public/icons';
mkdirSync(OUT_DIR, { recursive: true });

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function renderIcon(size: number, gemScale: number, cornerFrac: number): Buffer {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D;
  const bg = (ctx as unknown as { createLinearGradient: CanvasRenderingContext2D['createLinearGradient'] }).createLinearGradient(
    0,
    0,
    0,
    size,
  );
  bg.addColorStop(0, '#ffb6d9');
  bg.addColorStop(1, '#ff6f91');
  roundRect(ctx, 0, 0, size, size, size * cornerFrac);
  ctx.fillStyle = bg;
  ctx.fill();

  const gemSize = size * gemScale;
  ctx.save();
  ctx.translate((size - gemSize) / 2, (size - gemSize) / 2);
  drawGem(ctx, 0, gemSize); // Ruby
  ctx.restore();
  return canvas.toBuffer('image/png');
}

writeFileSync(`${OUT_DIR}/icon-192.png`, renderIcon(192, 0.72, 0.22));
writeFileSync(`${OUT_DIR}/icon-512.png`, renderIcon(512, 0.72, 0.22));
// Maskable icons need generous padding so OS masks don't clip the art.
writeFileSync(`${OUT_DIR}/icon-maskable-512.png`, renderIcon(512, 0.5, 0));
console.log('wrote icons to', OUT_DIR);
