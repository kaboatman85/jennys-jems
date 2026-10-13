// Board chrome (pre-rendered frame) and per-frame drawing. No game-flow logic;
// just reads the given state and paints it.

import { numCols, numRows } from './board.ts';
import type { Grid, Mask, Pos } from './board.ts';
import type { GemArt, ObstacleArt, OverlayArt } from './gems.ts';
import type { Particle } from './particles.ts';
import type { Sprite } from './sprites.ts';

/** roundRect() needs a fairly recent browser; arcTo works everywhere. */
export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export interface FrameGeometry {
  rows: number;
  cols: number;
  /** Cells with mask[r][c] === false get no checker tile -- there's no slot there. */
  mask?: Mask;
  cell: number;
  pad: number;
  bleed: number;
  dpr: number;
  cssW: number;
  cssH: number;
  ox: number;
  oy: number;
  canvasW: number;
  canvasH: number;
}

/** Pre-renders a plain cream board with checkered cells (no floral border --
 * the owner's frame.png overlay handles the decorative surround). */
export function buildFrame(geo: FrameGeometry): HTMLCanvasElement {
  const { rows, cols, mask, cell, bleed, dpr, cssW, cssH, ox, oy } = geo;
  const cv = document.createElement('canvas');
  cv.width = geo.canvasW;
  cv.height = geo.canvasH;
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rr = (x: number, y: number, w: number, h: number, r: number): void => roundRectPath(c, x, y, w, h, r);

  // Cream board background.
  const bx = bleed;
  const by = bleed;
  const bw = cssW - 2 * bleed;
  const bh = cssH - 2 * bleed;
  const cream = c.createLinearGradient(0, by, 0, by + bh);
  cream.addColorStop(0, '#fff6e6');
  cream.addColorStop(1, '#ffe9c4');
  rr(bx, by, bw, bh, cell * 0.3);
  c.fillStyle = cream;
  c.fill();
  c.lineWidth = Math.max(1.5, cell * 0.03);
  c.strokeStyle = 'rgba(201,148,58,0.45)';
  c.stroke();

  // Checkered cells (skipped for masked-out cells -- the cream board shows through).
  const gap = cell * 0.04;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      if (mask && !mask[r]?.[col]) continue;
      rr(ox + col * cell + gap, oy + r * cell + gap, cell - 2 * gap, cell - 2 * gap, cell * 0.14);
      c.fillStyle = (r + col) % 2 ? 'rgba(201,148,58,0.05)' : 'rgba(201,148,58,0.1)';
      c.fill();
    }
  }

  return cv;
}

export interface DrawState {
  ctx: CanvasRenderingContext2D;
  cell: number;
  dpr: number;
  cssW: number;
  cssH: number;
  ox: number;
  oy: number;
  frame: HTMLCanvasElement | null;
  grid: Grid;
  sprites: Map<number, Sprite>;
  particles: Particle[];
  selected: Pos | null;
  art: GemArt;
  overlayArt: OverlayArt;
  obstacleArt: ObstacleArt;
  dropItemArt: { get(px: number): CanvasImageSource };
}

export function draw(now: number, s: DrawState): void {
  const { ctx, cell, dpr } = s;
  if (s.cssW === 0) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, s.cssW, s.cssH);
  if (s.frame) ctx.drawImage(s.frame, 0, 0, s.cssW, s.cssH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(s.ox, s.oy, numCols(s.grid) * cell, numRows(s.grid) * cell);
  ctx.clip();

  const pulse = 0.5 + 0.5 * Math.sin(now / 170);
  let selId = -1;
  if (s.selected) {
    const sg = s.grid[s.selected.r]?.[s.selected.c];
    if (sg) selId = sg.id;
    const x = s.ox + s.selected.c * cell;
    const y = s.oy + s.selected.r * cell;
    roundRectPath(ctx, x + cell * 0.03, y + cell * 0.03, cell * 0.94, cell * 0.94, cell * 0.16);
    ctx.fillStyle = `rgba(255,143,174,${0.14 + 0.1 * pulse})`;
    ctx.fill();
    ctx.lineWidth = Math.max(2, cell * 0.05);
    ctx.strokeStyle = `rgba(212,168,67,${0.75 + 0.35 * pulse})`;
    ctx.stroke();
  }

  const px = Math.ceil(cell * dpr);
  for (const sp of s.sprites.values()) {
    const bump = sp.gem.id === selId ? 1 + 0.07 * pulse : 1;
    ctx.save();
    ctx.translate(s.ox + (sp.x + 0.5) * cell, s.oy + (sp.y + 0.5) * cell);
    ctx.scale(sp.sx * bump, sp.sy * bump);
    ctx.globalAlpha = Math.max(0, sp.a);
    ctx.drawImage(s.art.get(sp.gem.type, px), -cell / 2, -cell / 2, cell, cell);
    if (sp.gem.obstacle) {
      // A frozen cell's special (if any) stays hidden underneath the ice/dirt.
      ctx.drawImage(s.obstacleArt.get(sp.gem.obstacle, px), -cell / 2, -cell / 2, cell, cell);
    } else if (sp.gem.special) {
      ctx.drawImage(s.overlayArt.get(sp.gem.special, px), -cell / 2, -cell / 2, cell, cell);
    }
    if (sp.gem.dropItem) {
      ctx.drawImage(s.dropItemArt.get(px), -cell / 2, -cell / 2, cell, cell);
    }
    ctx.restore();
  }

  for (const p of s.particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(s.ox + p.x * cell, s.oy + p.y * cell, p.size * cell, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(s.ox + p.x * cell, s.oy + p.y * cell, p.size * cell * 0.4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
