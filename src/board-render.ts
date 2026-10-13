// Board chrome (pre-rendered frame) and per-frame drawing. No game-flow logic;
// just reads the given state and paints it.

import { COLS, ROWS } from './board.ts';
import type { Grid, Pos } from './board.ts';
import type { GemArt, OverlayArt } from './gems.ts';
import type { Particle } from './particles.ts';
import type { Sprite } from './sprites.ts';
import { drawFlower, drawLeaf } from './deco.ts';

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

/** Pre-renders the pink floral frame, dark plum board, and checkered cells. */
export function buildFrame(geo: FrameGeometry): HTMLCanvasElement {
  const { cell, pad, bleed, dpr, cssW, cssH, ox, oy } = geo;
  const cv = document.createElement('canvas');
  cv.width = geo.canvasW;
  cv.height = geo.canvasH;
  const c = cv.getContext('2d')!;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);

  const rr = (x: number, y: number, w: number, h: number, r: number): void => roundRectPath(c, x, y, w, h, r);

  // Frame band.
  const bx = bleed;
  const by = bleed;
  const bw = cssW - 2 * bleed;
  const bh = cssH - 2 * bleed;
  const band = c.createLinearGradient(0, by, 0, by + bh);
  band.addColorStop(0, '#ff9ccf');
  band.addColorStop(0.5, '#ff6fb5');
  band.addColorStop(1, '#e14b9f');
  rr(bx, by, bw, bh, cell * 0.42);
  c.fillStyle = band;
  c.fill();
  c.lineWidth = Math.max(2, cell * 0.05);
  c.strokeStyle = 'rgba(255,255,255,0.85)';
  c.stroke();

  // Dark plum board.
  const ix = bx + pad * 0.45;
  const iy = by + pad * 0.45;
  const iw = bw - pad * 0.9;
  const ih = bh - pad * 0.9;
  const plum = c.createLinearGradient(0, iy, 0, iy + ih);
  plum.addColorStop(0, '#47205f');
  plum.addColorStop(1, '#2a1240');
  rr(ix, iy, iw, ih, cell * 0.3);
  c.fillStyle = plum;
  c.fill();
  c.lineWidth = Math.max(1.5, cell * 0.03);
  c.strokeStyle = 'rgba(255,214,235,0.8)';
  c.stroke();

  // Checkered cells.
  const gap = cell * 0.04;
  for (let r = 0; r < ROWS; r++) {
    for (let col = 0; col < COLS; col++) {
      rr(ox + col * cell + gap, oy + r * cell + gap, cell - 2 * gap, cell - 2 * gap, cell * 0.14);
      c.fillStyle = (r + col) % 2 ? 'rgba(255,255,255,0.075)' : 'rgba(255,255,255,0.14)';
      c.fill();
    }
  }

  // Flowers + leaves around the frame.
  const leaf = '#7fd391';
  const midY = by + pad * 0.25;
  const rBand = Math.max(pad * 0.62, 9);
  const edge = (x: number, y: number, angle: number, ci: number): void => {
    drawLeaf(c, x, y, rBand * 2.1, angle - 0.5, leaf);
    drawLeaf(c, x, y, rBand * 2.1, angle + 0.5, leaf);
    const petals = ['#ffffff', '#ffe066', '#c59bff', '#7ec8ff'];
    drawFlower(c, x, y, rBand, petals[ci % petals.length]!, '#ff9a3c', 6, ci);
  };
  for (let i = 1; i < COLS; i += 2) {
    const x = ox + i * cell + cell * 0.5 * (i % 2 ? 1 : 0);
    edge(x, midY + pad * 0.1, -Math.PI / 2, i);
    edge(x, by + bh - pad * 0.35, Math.PI / 2, i + 1);
  }
  for (let i = 1; i < ROWS; i += 2) {
    const y = oy + i * cell;
    edge(bx + pad * 0.3, y, Math.PI, i + 2);
    edge(bx + bw - pad * 0.3, y, 0, i + 3);
  }
  const corner = (x: number, y: number, a: number, petal: string): void => {
    drawLeaf(c, x, y, cell * 0.55, a - 0.6, leaf);
    drawLeaf(c, x, y, cell * 0.55, a + 0.6, '#8fdca0');
    drawFlower(c, x, y, cell * 0.38, petal, '#ffe066', 7, a);
  };
  const o = cell * 0.24;
  corner(bx + o, by + o, (-3 * Math.PI) / 4, '#ffd84d');
  corner(bx + bw - o, by + o, -Math.PI / 4, '#c59bff');
  corner(bx + o, by + bh - o, (3 * Math.PI) / 4, '#7ec8ff');
  corner(bx + bw - o, by + bh - o, Math.PI / 4, '#ffffff');
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
}

export function draw(now: number, s: DrawState): void {
  const { ctx, cell, dpr } = s;
  if (s.cssW === 0) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, s.cssW, s.cssH);
  if (s.frame) ctx.drawImage(s.frame, 0, 0, s.cssW, s.cssH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(s.ox, s.oy, COLS * cell, ROWS * cell);
  ctx.clip();

  const pulse = 0.5 + 0.5 * Math.sin(now / 170);
  let selId = -1;
  if (s.selected) {
    const sg = s.grid[s.selected.r]?.[s.selected.c];
    if (sg) selId = sg.id;
    const x = s.ox + s.selected.c * cell;
    const y = s.oy + s.selected.r * cell;
    roundRectPath(ctx, x + cell * 0.03, y + cell * 0.03, cell * 0.94, cell * 0.94, cell * 0.16);
    ctx.fillStyle = `rgba(255,255,255,${0.16 + 0.12 * pulse})`;
    ctx.fill();
    ctx.lineWidth = Math.max(2, cell * 0.05);
    ctx.strokeStyle = `rgba(255,236,150,${0.65 + 0.35 * pulse})`;
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
    if (sp.gem.special) {
      ctx.drawImage(s.overlayArt.get(sp.gem.special, px), -cell / 2, -cell / 2, cell, cell);
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
