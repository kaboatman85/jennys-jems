// Dev tool: renders a gem contact sheet to a PNG so the art can be eyeballed
// without a browser.  Usage: node tools/render-gems.ts <out.png>
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import type { Special } from '../src/board.ts';
import { GEM_DEFS, drawGem, drawSpecialOverlay } from '../src/gems.ts';

const out = process.argv[2] ?? 'gems.png';
const BIG = 200;
const SMALL = 72;
const n = GEM_DEFS.length;
const W = n * BIG;
const GEM_SHEET_H = BIG + SMALL * 2 + 40;

const SPECIALS: Special[] = [
  { kind: 'laser', orientation: 'h' },
  { kind: 'laser', orientation: 'v' },
  { kind: 'bomb' },
  { kind: 'hypercube' },
  { kind: 'star' },
];
const ROW_H = 90;
const LABEL_W = 110;
const SPECIALS_SHEET_H = 30 + SPECIALS.length * ROW_H;

const H = GEM_SHEET_H + SPECIALS_SHEET_H;
const canvas = createCanvas(W, H);
const ctx = canvas.getContext('2d');

// Board-like dark plum background so the gems are judged in context.
const bg = ctx.createLinearGradient(0, 0, 0, H);
bg.addColorStop(0, '#3b1a52');
bg.addColorStop(1, '#2a1240');
ctx.fillStyle = bg;
ctx.fillRect(0, 0, W, H);

for (let i = 0; i < n; i++) {
  ctx.save();
  ctx.translate(i * BIG, 0);
  drawGem(ctx as unknown as CanvasRenderingContext2D, i, BIG);
  ctx.restore();

  ctx.save();
  ctx.translate(i * BIG + (BIG - SMALL) / 2, BIG + 20);
  drawGem(ctx as unknown as CanvasRenderingContext2D, i, SMALL);
  ctx.restore();
}

// Specials sheet: each special overlay drawn over every gem color, so the
// look can be eyeballed across all base colors without opening a browser.
ctx.font = '16px sans-serif';
ctx.fillStyle = 'rgba(255,255,255,0.85)';
SPECIALS.forEach((special, row) => {
  const y = GEM_SHEET_H + 30 + row * ROW_H;
  const label = special.kind + (special.orientation ? ` (${special.orientation})` : '');
  ctx.fillText(label, 8, y + ROW_H / 2);

  for (let i = 0; i < n; i++) {
    const cellX = LABEL_W + i * ((W - LABEL_W) / n);
    ctx.save();
    ctx.translate(cellX, y);
    drawGem(ctx as unknown as CanvasRenderingContext2D, i, SMALL);
    drawSpecialOverlay(ctx as unknown as CanvasRenderingContext2D, special, SMALL);
    ctx.restore();
  }
});

writeFileSync(out, canvas.toBuffer('image/png'));
console.log('wrote', out);
