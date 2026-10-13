// Dev tool: renders a gem contact sheet to a PNG so the art can be eyeballed
// without a browser.  Usage: node tools/render-gems.ts <out.png>
import { createCanvas } from '@napi-rs/canvas';
import { writeFileSync } from 'node:fs';
import { drawGem, GEM_DEFS } from '../src/gems.ts';

const out = process.argv[2] ?? 'gems.png';
const BIG = 200;
const SMALL = 72;
const n = GEM_DEFS.length;
const W = n * BIG;
const H = BIG + SMALL * 2 + 40;
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

writeFileSync(out, canvas.toBuffer('image/png'));
console.log('wrote', out);
