// Procedural 3D-looking gems. drawGem() only needs a 2D context, so it also
// runs under node (@napi-rs/canvas) for visual checks.

import type { Obstacle, Special } from './board.ts';

type Ctx2D = CanvasRenderingContext2D;
type RGB = [number, number, number];
interface Pt {
  x: number;
  y: number;
}

export interface GemDef {
  name: string;
  base: string;
  sides: number; // number of facets around the rim
  rot: number; // rotation of the first vertex (radians)
  n: number; // superellipse exponent: 2 = round, higher = squarer
  sx: number; // horizontal squash
  sy: number; // vertical squash
}

export const GEM_DEFS: GemDef[] = [
  { name: 'Ruby', base: '#e8203f', sides: 16, rot: 0, n: 2, sx: 1, sy: 1 },
  { name: 'Emerald', base: '#14b85c', sides: 8, rot: Math.PI / 8, n: 2, sx: 1, sy: 1 },
  { name: 'Sapphire', base: '#2f7bff', sides: 6, rot: 0, n: 2, sx: 1, sy: 1 },
  { name: 'Citrine', base: '#ffc414', sides: 4, rot: -Math.PI / 2, n: 2, sx: 0.84, sy: 1 },
  { name: 'Amethyst', base: '#a74dff', sides: 3, rot: -Math.PI / 2, n: 2, sx: 1, sy: 1 },
  { name: 'Rose Quartz', base: '#ff7ab8', sides: 16, rot: 0, n: 4, sx: 1, sy: 1 },
  { name: 'Topaz', base: '#ff8c1a', sides: 5, rot: -Math.PI / 2, n: 2, sx: 1, sy: 1 },
];

const WHITE: RGB = [255, 255, 255];
const BLACK: RGB = [0, 0, 0];

function hex(h: string): RGB {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function css(c: RGB, a = 1): string {
  return `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${a})`;
}
function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
/** d in [-1, 1]: negative darkens toward black, positive lightens toward white. */
function shade(base: RGB, d: number): RGB {
  return d >= 0 ? mix(base, WHITE, d * 0.62) : mix(base, BLACK, -d * 0.55);
}

function rawPoints(def: GemDef): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < def.sides; i++) {
    const th = def.rot + (i * 2 * Math.PI) / def.sides;
    const cs = Math.cos(th);
    const sn = Math.sin(th);
    const r = Math.pow(Math.pow(Math.abs(cs), def.n) + Math.pow(Math.abs(sn), def.n), -1 / def.n);
    pts.push({ x: cs * r * def.sx, y: sn * r * def.sy });
  }
  return pts;
}

function tracePath(ctx: Ctx2D, pts: Pt[]): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
  ctx.closePath();
}

function sparkle(ctx: Ctx2D, x: number, y: number, s: number, alpha: number): void {
  ctx.save();
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

/** Draw gem `type` into a square S x S area at the context origin. */
export function drawGem(ctx: Ctx2D, type: number, S: number): void {
  const def = GEM_DEFS[((type % GEM_DEFS.length) + GEM_DEFS.length) % GEM_DEFS.length]!;
  const base = hex(def.base);

  // Fit the shape into ~80% of the sprite, centered (leaves room for the shadow).
  const raw = rawPoints(def);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of raw) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }
  const k = (S * 0.8) / Math.max(maxX - minX, maxY - minY);
  const ox = S / 2 - ((minX + maxX) / 2) * k;
  const oy = S / 2 - ((minY + maxY) / 2) * k - S * 0.015;
  const outer: Pt[] = raw.map((p) => ({ x: p.x * k + ox, y: p.y * k + oy }));

  let cx = 0;
  let cy = 0;
  for (const p of outer) {
    cx += p.x;
    cy += p.y;
  }
  cx /= outer.length;
  cy /= outer.length;

  const TABLE = 0.5;
  const inner: Pt[] = outer.map((p) => ({ x: cx + (p.x - cx) * TABLE, y: cy + (p.y - cy) * TABLE }));
  const N = outer.length;
  const lw = S / 64;
  const light = (-3 * Math.PI) / 4; // light comes from the top-left

  ctx.save();
  ctx.lineJoin = 'round';

  // Drop shadow + dark underlay (also shows through facet seams).
  ctx.save();
  ctx.shadowColor = 'rgba(45,0,50,0.5)';
  ctx.shadowBlur = S * 0.07;
  ctx.shadowOffsetY = S * 0.035;
  ctx.fillStyle = css(shade(base, -0.62));
  tracePath(ctx, outer);
  ctx.fill();
  ctx.restore();

  // Crown facets (ring between the rim and the table).
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const mx = (outer[i]!.x + outer[j]!.x) / 2 - cx;
    const my = (outer[i]!.y + outer[j]!.y) / 2 - cy;
    const d = Math.cos(Math.atan2(my, mx) - light);
    const wobble = i % 2 ? 0.07 : -0.05;
    ctx.fillStyle = css(shade(base, clamp(d * 0.9 + wobble, -1, 1)));
    tracePath(ctx, [outer[i]!, outer[j]!, inner[j]!, inner[i]!]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.26)';
    ctx.lineWidth = lw * 0.8;
    ctx.stroke();
  }

  // Table (top face), split into triangles for a faceted look.
  for (let i = 0; i < N; i++) {
    const j = (i + 1) % N;
    const mx = (inner[i]!.x + inner[j]!.x) / 2 - cx;
    const my = (inner[i]!.y + inner[j]!.y) / 2 - cy;
    const d = Math.cos(Math.atan2(my, mx) - light) * 0.42 + 0.26;
    ctx.fillStyle = css(shade(base, clamp(d, -1, 1)));
    tracePath(ctx, [{ x: cx, y: cy }, inner[i]!, inner[j]!]);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = lw * 0.7;
    ctx.stroke();
  }

  // Dark rim for definition.
  tracePath(ctx, outer);
  ctx.strokeStyle = css(shade(base, -0.58), 0.95);
  ctx.lineWidth = lw * 1.6;
  ctx.stroke();

  // Bright rim light fading from the top-left.
  const rim = ctx.createLinearGradient(cx - S * 0.4, cy - S * 0.4, cx + S * 0.4, cy + S * 0.4);
  rim.addColorStop(0, 'rgba(255,255,255,0.9)');
  rim.addColorStop(0.5, 'rgba(255,255,255,0.12)');
  rim.addColorStop(1, 'rgba(255,255,255,0)');
  tracePath(ctx, outer);
  ctx.strokeStyle = rim;
  ctx.lineWidth = lw * 0.9;
  ctx.stroke();

  // Soft bounce light, lower right.
  const bx = cx + S * 0.15;
  const by = cy + S * 0.17;
  const bounce = ctx.createRadialGradient(bx, by, 0, bx, by, S * 0.13);
  bounce.addColorStop(0, 'rgba(255,255,255,0.28)');
  bounce.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = bounce;
  ctx.beginPath();
  ctx.arc(bx, by, S * 0.13, 0, Math.PI * 2);
  ctx.fill();

  // Specular highlight + sparkle, upper left.
  const hx = cx - S * 0.14;
  const hy = cy - S * 0.17;
  const spec = ctx.createRadialGradient(hx, hy, 0, hx, hy, S * 0.16);
  spec.addColorStop(0, 'rgba(255,255,255,0.95)');
  spec.addColorStop(0.45, 'rgba(255,255,255,0.35)');
  spec.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = spec;
  ctx.beginPath();
  ctx.arc(hx, hy, S * 0.16, 0, Math.PI * 2);
  ctx.fill();
  sparkle(ctx, hx - S * 0.02, hy - S * 0.02, S * 0.075, 0.95);
  sparkle(ctx, cx + S * 0.13, cy - S * 0.02, S * 0.035, 0.7);

  ctx.restore();
}

/** Anything that can supply gem images. Swap this out to use sprite art instead. */
export interface GemArt {
  get(type: number, px: number): CanvasImageSource;
  clear?(): void;
}

export class GemSprites implements GemArt {
  private cache = new Map<string, HTMLCanvasElement>();

  get(type: number, px: number): HTMLCanvasElement {
    const key = `${type}@${px}`;
    let cv = this.cache.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = px;
      cv.height = px;
      drawGem(cv.getContext('2d')!, type, px);
      this.cache.set(key, cv);
    }
    return cv;
  }

  clear(): void {
    this.cache.clear();
  }
}

// --- Special-piece overlays: glow/stripe/ring art drawn on top of the base gem
// sprite, so any color can carry any special. Pure (ctx, special, S) => void,
// same shape as drawGem, so it also runs headlessly under @napi-rs/canvas.

function drawLaserOverlay(ctx: Ctx2D, orientation: 'h' | 'v' | undefined, S: number): void {
  ctx.save();
  if (orientation === 'v') {
    ctx.translate(S / 2, S / 2);
    ctx.rotate(Math.PI / 2);
    ctx.translate(-S / 2, -S / 2);
  }
  const midY = S / 2;
  const halfW = S * 0.085;

  const glow = ctx.createLinearGradient(0, midY, S, midY);
  glow.addColorStop(0, 'rgba(255,255,255,0)');
  glow.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  glow.addColorStop(0.5, 'rgba(255,255,255,0.7)');
  glow.addColorStop(0.85, 'rgba(255,255,255,0.55)');
  glow.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, midY - halfW, S, halfW * 2);

  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.fillRect(0, midY - halfW * 0.3, S, halfW * 0.6);

  const ah = S * 0.07;
  for (const [x, dir] of [
    [S * 0.07, 1],
    [S * 0.93, -1],
  ] as const) {
    ctx.beginPath();
    ctx.moveTo(x, midY - ah);
    ctx.lineTo(x + dir * ah * 1.3, midY);
    ctx.lineTo(x, midY + ah);
    ctx.closePath();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fill();
  }
  ctx.restore();
}

function drawBombOverlay(ctx: Ctx2D, S: number): void {
  const cx = S / 2;
  const cy = S / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,120,40,0.9)';
  ctx.lineWidth = S * 0.035;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.38, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,210,120,0.55)';
  ctx.lineWidth = S * 0.02;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.3, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,170,40,0.95)';
  ctx.beginPath();
  ctx.moveTo(cx, cy - S * 0.12);
  ctx.quadraticCurveTo(cx + S * 0.09, cy - S * 0.02, cx + S * 0.04, cy + S * 0.1);
  ctx.quadraticCurveTo(cx, cy + S * 0.14, cx - S * 0.04, cy + S * 0.1);
  ctx.quadraticCurveTo(cx - S * 0.09, cy - S * 0.02, cx, cy - S * 0.12);
  ctx.fill();
  ctx.fillStyle = 'rgba(255,240,180,0.9)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + S * 0.03, S * 0.025, S * 0.04, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawHypercubeOverlay(ctx: Ctx2D, S: number): void {
  const cx = S / 2;
  const cy = S / 2;
  const n = 10;
  const ringR = S * 0.38;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const th0 = (i / n) * Math.PI * 2;
    const th1 = ((i + 1) / n) * Math.PI * 2;
    const hue = (i / n) * 360;
    ctx.strokeStyle = `hsla(${hue},90%,65%,0.85)`;
    ctx.lineWidth = S * 0.05;
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, th0, th1);
    ctx.stroke();
  }
  sparkle(ctx, cx - S * 0.28, cy - S * 0.26, S * 0.05, 0.9);
  sparkle(ctx, cx + S * 0.27, cy + S * 0.25, S * 0.04, 0.8);
  ctx.restore();
}

function drawStarOverlay(ctx: Ctx2D, S: number): void {
  const cx = S / 2;
  const cy = S / 2;
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = S * 0.045;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.46, 0, Math.PI * 2);
  ctx.stroke();

  const rays = 8;
  for (let i = 0; i < rays; i++) {
    const th = (i / rays) * Math.PI * 2;
    const x1 = cx + Math.cos(th) * S * 0.2;
    const y1 = cy + Math.sin(th) * S * 0.2;
    const x2 = cx + Math.cos(th) * S * 0.5;
    const y2 = cy + Math.sin(th) * S * 0.5;
    const grad = ctx.createLinearGradient(x1, y1, x2, y2);
    grad.addColorStop(0, 'rgba(255,255,210,0.9)');
    grad.addColorStop(1, 'rgba(255,255,210,0)');
    ctx.strokeStyle = grad;
    ctx.lineWidth = S * 0.03;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  sparkle(ctx, cx, cy, S * 0.09, 0.95);
  ctx.restore();
}

/** Draws a special-piece overlay (glow/stripes/rings) on top of a base gem sprite. */
export function drawSpecialOverlay(ctx: Ctx2D, special: Special, S: number): void {
  switch (special.kind) {
    case 'laser':
      drawLaserOverlay(ctx, special.orientation, S);
      break;
    case 'bomb':
      drawBombOverlay(ctx, S);
      break;
    case 'hypercube':
      drawHypercubeOverlay(ctx, S);
      break;
    case 'star':
      drawStarOverlay(ctx, S);
      break;
  }
}

/** Anything that can supply special-overlay images. */
export interface OverlayArt {
  get(special: Special, px: number): CanvasImageSource;
  clear?(): void;
}

export class SpecialOverlaySprites implements OverlayArt {
  private cache = new Map<string, HTMLCanvasElement>();

  get(special: Special, px: number): HTMLCanvasElement {
    const key = `${special.kind}@${special.orientation ?? ''}@${px}`;
    let cv = this.cache.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = px;
      cv.height = px;
      drawSpecialOverlay(cv.getContext('2d')!, special, px);
      this.cache.set(key, cv);
    }
    return cv;
  }

  clear(): void {
    this.cache.clear();
  }
}

// --- Obstacle overlays: ice (frosted, cracks as it nears breaking) and dirt
// (rough speckled patch) drawn over the base gem, covering it like the special
// overlays do. A frozen cell's special (if any) is deliberately not shown
// underneath -- it can't be seen or activated while covered.

function drawIceOverlay(ctx: Ctx2D, hits: number, S: number): void {
  const cx = S / 2;
  const cy = S / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(205,232,255,0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.47, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = S * 0.04;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.43, 0, Math.PI * 2);
  ctx.stroke();

  // Cracks: more of them as it gets closer to breaking (fewer hits remaining).
  const cracks = hits <= 1 ? 4 : hits === 2 ? 2 : 1;
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = S * 0.022;
  for (let i = 0; i < cracks; i++) {
    const a = (i / Math.max(1, cracks)) * Math.PI * 2 + 0.5;
    const mx = cx + Math.cos(a) * S * 0.22;
    const my = cy + Math.sin(a) * S * 0.22;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(mx, my);
    ctx.lineTo(mx + Math.cos(a + 0.6) * S * 0.14, my + Math.sin(a + 0.6) * S * 0.14);
    ctx.stroke();
  }
  sparkle(ctx, cx - S * 0.18, cy - S * 0.2, S * 0.045, 0.8);
  ctx.restore();
}

function drawDirtOverlay(ctx: Ctx2D, S: number): void {
  const cx = S / 2;
  const cy = S / 2;
  ctx.save();
  ctx.fillStyle = 'rgba(123,88,56,0.6)';
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.47, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(90,62,38,0.6)';
  ctx.lineWidth = S * 0.03;
  ctx.beginPath();
  ctx.arc(cx, cy, S * 0.43, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(96,66,42,0.55)';
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(cx + Math.cos(a) * S * 0.24, cy + Math.sin(a) * S * 0.24, S * 0.08, S * 0.055, a, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function drawObstacleOverlay(ctx: Ctx2D, obstacle: Obstacle, S: number): void {
  if (obstacle.kind === 'ice') drawIceOverlay(ctx, obstacle.hits, S);
  else drawDirtOverlay(ctx, S);
}

export interface ObstacleArt {
  get(obstacle: Obstacle, px: number): CanvasImageSource;
  clear?(): void;
}

export class ObstacleOverlaySprites implements ObstacleArt {
  private cache = new Map<string, HTMLCanvasElement>();

  get(obstacle: Obstacle, px: number): HTMLCanvasElement {
    const key = `${obstacle.kind}@${obstacle.hits}@${px}`;
    let cv = this.cache.get(key);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = px;
      cv.height = px;
      drawObstacleOverlay(cv.getContext('2d')!, obstacle, px);
      this.cache.set(key, cv);
    }
    return cv;
  }

  clear(): void {
    this.cache.clear();
  }
}

// --- Drop-item marker: a small ribboned gift glyph, signaling "deliver me to
// the bottom" rather than "match me". One look regardless of color/hits.

export function drawDropItemOverlay(ctx: Ctx2D, S: number): void {
  const cx = S / 2;
  const cy = S / 2;
  const bw = S * 0.46;
  const bh = S * 0.36;
  ctx.save();
  ctx.fillStyle = 'rgba(255,255,255,0.95)';
  ctx.strokeStyle = 'rgba(120,70,40,0.55)';
  ctx.lineWidth = S * 0.022;
  roundRectAt(ctx, cx - bw / 2, cy - bh / 2 + S * 0.03, bw, bh, S * 0.05);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,111,145,0.95)';
  ctx.fillRect(cx - S * 0.028, cy - bh / 2 + S * 0.03, S * 0.056, bh);
  ctx.fillRect(cx - bw / 2, cy - S * 0.028, bw, S * 0.056);
  ctx.beginPath();
  ctx.ellipse(cx - S * 0.07, cy - bh / 2 + S * 0.02, S * 0.07, S * 0.05, -0.3, 0, Math.PI * 2);
  ctx.ellipse(cx + S * 0.07, cy - bh / 2 + S * 0.02, S * 0.07, S * 0.05, 0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,111,145,0.95)';
  ctx.fill();
  ctx.restore();
}

function roundRectAt(ctx: Ctx2D, x: number, y: number, w: number, h: number, r: number): void {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

export class DropItemOverlaySprites {
  private cache = new Map<number, HTMLCanvasElement>();

  get(px: number): HTMLCanvasElement {
    let cv = this.cache.get(px);
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = px;
      cv.height = px;
      drawDropItemOverlay(cv.getContext('2d')!, px);
      this.cache.set(px, cv);
    }
    return cv;
  }

  clear(): void {
    this.cache.clear();
  }
}
