// Page background: the owner's reference mockup image, drawn cover-fit. On a
// narrow/tall (portrait phone) viewport, cover-fit crops so much off the sides
// that the mockup's own edge decorations (tassels, corner blossoms) fall
// entirely outside the visible window -- so on those aspect ratios a
// procedural decoration layer (same look, viewport-relative so it can't be
// cropped out) is drawn on top to restore them. Falls back to a plain
// gradient (matching the mockup's own tones) until the image loads.

import {
  FLOWER_COLORS,
  drawBranch,
  drawCloud,
  drawFlower,
  drawLeaf,
  drawPetal,
  drawSparkle,
  drawTasselKnot,
} from './deco.ts';
import { mulberry32 } from './board.ts';

type Ctx2D = CanvasRenderingContext2D;

const DAISY: [string, string] = ['#ffffff', '#ffd84d'];
const LAVENDER: [string, string] = ['#d8c2f5', '#b393e0'];
const PEONY_COLORS: Array<[string, string]> = [
  ['#ffb6c9', '#e85d8a'],
  ['#ffc2d6', '#ff6f91'],
];

let bgImage: HTMLImageElement | null = null;
let bgImageReady = false;

function loadBgImage(onReady: () => void): HTMLImageElement {
  if (!bgImage) {
    bgImage = new Image();
    bgImage.src = './bg-mockup.jpg';
    bgImage.onload = () => {
      bgImageReady = true;
      onReady();
    };
  }
  return bgImage;
}

function fillFallbackGradient(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, '#ffd3ea');
  g.addColorStop(0.5, '#ffe9cf');
  g.addColorStop(1, '#e2d3ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function stem(ctx: Ctx2D, x0: number, y0: number, x1: number, y1: number, color: string, w: number): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = w;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.quadraticCurveTo((x0 + x1) / 2 + (y0 - y1) * 0.08, (y0 + y1) / 2, x1, y1);
  ctx.stroke();
  ctx.restore();
}

/** A branch of cherry blossoms growing in from a page corner. */
function blossomBranch(ctx: Ctx2D, cx: number, cy: number, dirX: number, dirY: number, len: number): void {
  const angle = Math.atan2(dirY, dirX);
  drawBranch(ctx, cx, cy, len, angle, '#8a5a42');
  const blossoms = 5;
  for (let i = 0; i < blossoms; i++) {
    const t = 0.22 + (i / (blossoms - 1)) * 0.72;
    const perp = i % 2 ? 1 : -1;
    const bx = cx + dirX * len * t - dirY * perp * len * 0.05;
    const by = cy + dirY * len * t + dirX * perp * len * 0.05;
    const r = len * (0.07 + (i % 3) * 0.018);
    const [petal, center] = FLOWER_COLORS[i % FLOWER_COLORS.length]!;
    drawLeaf(ctx, bx, by, r * 1.4, angle - 0.9, '#9bc9a0');
    drawFlower(ctx, bx, by, r, petal, center, 5, i * 0.7);
  }
}

/** Viewport-relative decorations (tassels, blossom branches, scattered flowers) that
 * can't be cropped out by the mockup photo's cover-fit, since they aren't part of it. */
function drawProceduralDecoration(ctx: Ctx2D, w: number, h: number): void {
  const rng = mulberry32(2026);
  const unit = Math.min(w, h);

  ctx.globalAlpha = 0.55;
  for (let i = 0; i < 10; i++) {
    const [petal] = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)]!;
    drawPetal(ctx, rng() * w, rng() * h, unit * (0.01 + rng() * 0.012), rng() * Math.PI * 2, petal);
  }

  ctx.globalAlpha = 0.85;
  for (let i = 0; i < 12; i++) {
    drawSparkle(ctx, rng() * w, rng() * h, unit * (0.006 + rng() * 0.01), '#ffffff', 0.7 + rng() * 0.3);
  }

  // Traditional Korean cloud (구름) motifs, drifting mid-height on each side.
  ctx.globalAlpha = 1;
  drawCloud(ctx, w * 0.1, h * 0.36, unit * 0.16, '#c9943a', 0.3);
  drawCloud(ctx, w * 0.06, h * 0.56, unit * 0.12, '#c9943a', 0.22);
  drawCloud(ctx, w * 0.9, h * 0.34, unit * 0.15, '#c9943a', 0.28);
  drawCloud(ctx, w * 0.94, h * 0.58, unit * 0.11, '#c9943a', 0.22);

  // Scattered small flowers for general texture.
  const count = Math.round((w * h) / 30000);
  for (let i = 0; i < count; i++) {
    const x = rng() * w;
    const y = rng() * h;
    const r = unit * (0.028 + rng() * 0.04);
    const [petal, center] = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)]!;
    ctx.globalAlpha = 0.5;
    drawLeaf(ctx, x, y, r * 1.5, rng() * Math.PI * 2, '#9bc9a0');
    drawFlower(ctx, x, y, r, petal, center, 5, rng() * Math.PI);
  }

  // Top corners: blossom branches reaching in.
  ctx.globalAlpha = 0.95;
  blossomBranch(ctx, 0, 0, 1, 0.22, unit * 0.34);
  blossomBranch(ctx, w, 0, -1, 0.22, unit * 0.34);

  // Hanging knot-tassel ornaments flanking the board (approximate position --
  // the board itself is centered by CSS grid, so this estimates where its
  // edges typically sit rather than reading the live layout).
  ctx.globalAlpha = 0.95;
  const tasselY = h * 0.3;
  const tasselSize = unit * 0.16;
  drawTasselKnot(ctx, w / 2 - unit * 0.47, tasselY, tasselSize, '#d98fae', ['#ff9ab0', '#ff7a98']);
  drawTasselKnot(ctx, w / 2 + unit * 0.47, tasselY, tasselSize, '#8899b0', ['#ff9ab0', '#ffd84d', '#7ec8ff', '#c59bff']);

  // Bottom-left: a daisy/wildflower patch.
  ctx.globalAlpha = 0.95;
  {
    const bx = 0;
    const by = h;
    for (let i = 0; i < 6; i++) {
      const sx = bx + unit * (0.02 + i * 0.028);
      const sy = by - unit * (0.03 + (i % 3) * 0.02);
      stem(ctx, bx + unit * 0.01, by, sx, sy, '#6fae7a', Math.max(1.5, unit * 0.0035));
      const isAccent = i % 3 === 1;
      const [petal, center] = isAccent ? LAVENDER : DAISY;
      drawFlower(ctx, sx, sy, unit * (0.022 + (i % 2) * 0.008), petal, center, isAccent ? 6 : 10, i);
    }
  }

  // Bottom-right: a fuller peony cluster.
  ctx.globalAlpha = 0.95;
  {
    const bx = w;
    const by = h;
    const blooms: Array<[number, number, number]> = [
      [-0.1, -0.09, 0.05],
      [-0.045, -0.055, 0.04],
      [-0.09, -0.03, 0.032],
    ];
    for (const [dx, dy, r] of blooms) {
      const px = bx + unit * dx;
      const py = by + unit * dy;
      drawLeaf(ctx, px, py, unit * r * 1.6, Math.PI * 0.8, '#7fd391');
      drawLeaf(ctx, px, py, unit * r * 1.3, Math.PI * 1.2, '#9bc9a0');
    }
    for (let i = 0; i < blooms.length; i++) {
      const [dx, dy, r] = blooms[i]!;
      const [petal, center] = PEONY_COLORS[i % PEONY_COLORS.length]!;
      drawFlower(ctx, bx + unit * dx, by + unit * dy, unit * r, petal, center, 9, i * 0.5);
    }
    drawFlower(ctx, bx - unit * 0.14, by - unit * 0.02, unit * 0.02, ...DAISY, 10, 1);
    drawFlower(ctx, bx - unit * 0.02, by - unit * 0.12, unit * 0.018, ...DAISY, 10, 2);
  }

  ctx.globalAlpha = 1;
}

/** Paints the page background from the reference mockup image, cover-fit and centered. */
export function drawBackground(canvas: HTMLCanvasElement): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const img = loadBgImage(() => drawBackground(canvas));

  if (!bgImageReady || img.naturalWidth === 0) {
    fillFallbackGradient(ctx, w, h);
    return;
  }

  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  const dx = (w - dw) / 2;
  const dy = (h - dh) / 2;
  ctx.drawImage(img, dx, dy, dw, dh);

  // The mockup's own tassels sit about 31% of its width in from each edge.
  // Cover-fit only crops them out once the visible fraction of the image's
  // width drops below that -- true portrait phones/tablets, not a merely
  // wide-but-not-square desktop window. Below that point, restore them
  // procedurally instead of leaving them cropped off screen.
  const imageAspect = img.naturalWidth / img.naturalHeight;
  const visibleWidthFraction = Math.min(1, w / h / imageAspect);
  if (visibleWidthFraction < 0.5) {
    drawProceduralDecoration(ctx, w, h);
  }
}
