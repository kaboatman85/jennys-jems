// Procedural 3D-looking gems. drawGem() only needs a 2D context, so it also
// runs under node (@napi-rs/canvas) for visual checks.

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
