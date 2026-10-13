// Little canvas flower/leaf painters shared by the page background and the board frame.

type Ctx2D = CanvasRenderingContext2D;

// Cherry-blossom (sakura) palette: soft pinks and whites with a rose/gold center.
export const FLOWER_COLORS: Array<[string, string]> = [
  ['#ffd1e0', '#ff8fae'],
  ['#ffe8ee', '#ffb6c9'],
  ['#ffffff', '#ffb6c9'],
  ['#ffc2d6', '#ff6f91'],
  ['#fff0f5', '#e8a0bb'],
  ['#ffd8e6', '#e85d8a'],
];

export function drawFlower(
  ctx: Ctx2D,
  x: number,
  y: number,
  r: number,
  petal: string,
  center: string,
  petals = 6,
  rot = 0,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rot);
  for (let i = 0; i < petals; i++) {
    ctx.save();
    ctx.rotate((i * Math.PI * 2) / petals);
    ctx.fillStyle = petal;
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.58, r * 0.34, r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,30,90,0.18)';
    ctx.lineWidth = Math.max(1, r * 0.05);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath();
    ctx.ellipse(0, -r * 0.66, r * 0.15, r * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  ctx.fillStyle = center;
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.27, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(120,30,90,0.22)';
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.55)';
  ctx.beginPath();
  ctx.arc(-r * 0.07, -r * 0.08, r * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawLeaf(ctx: Ctx2D, x: number, y: number, len: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.38, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.38, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.4)';
  ctx.lineWidth = Math.max(1, len * 0.04);
  ctx.beginPath();
  ctx.moveTo(len * 0.1, 0);
  ctx.lineTo(len * 0.85, 0);
  ctx.stroke();
  ctx.restore();
}

/** Traditional Korean cloud (구름) motif. */
export function drawCloud(ctx: Ctx2D, x: number, y: number, w: number, color: string, alpha = 0.4): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalAlpha *= alpha;
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const r = w * 0.17;
  ctx.lineWidth = Math.max(1.5, r * 0.26);

  // A continuous scalloped silhouette: three overlapping lobes along a shared
  // baseline, traced as one connected outline rather than separate rings.
  const lobes: Array<[number, number]> = [
    [-w * 0.26, 0.85],
    [0, 1],
    [w * 0.26, 0.85],
  ];
  ctx.beginPath();
  lobes.forEach(([lx, scale], i) => {
    const lr = r * scale;
    if (i === 0) ctx.moveTo(lx - lr, 0);
    ctx.arc(lx, 0, lr, Math.PI, Math.PI * 2, false);
  });
  const [lastX, lastScale] = lobes[lobes.length - 1]!;
  ctx.lineTo(lastX + r * lastScale * 0.3, r * 0.3);
  const [firstX, firstScale] = lobes[0]!;
  ctx.lineTo(firstX - r * firstScale * 0.3, r * 0.3);
  ctx.closePath();
  ctx.stroke();

  const swirl = (sx: number, sy: number, dir: number): void => {
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.bezierCurveTo(
      sx + dir * r * 0.7,
      sy - r * 0.5,
      sx + dir * r * 0.1,
      sy + r * 0.7,
      sx + dir * r * 1.0,
      sy + r * 0.35,
    );
    ctx.stroke();
  };
  swirl(-w * 0.4, 0, -1);
  swirl(w * 0.4, -r * 0.55, 1);
  ctx.restore();
}

/** Small 4-point sparkle/star accent. */
export function drawSparkle(ctx: Ctx2D, x: number, y: number, s: number, color: string, alpha = 1): void {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(x, y - s);
  ctx.quadraticCurveTo(x, y, x + s, y);
  ctx.quadraticCurveTo(x, y, x, y + s);
  ctx.quadraticCurveTo(x, y, x - s, y);
  ctx.quadraticCurveTo(x, y, x, y - s);
  ctx.fill();
  ctx.restore();
}

/** A single falling petal, drifting in open space. */
export function drawPetal(ctx: Ctx2D, x: number, y: number, s: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * 0.42, s, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** A blossom-branch: a curved woody stem with a couple of twigs, for corner clusters. */
export function drawBranch(ctx: Ctx2D, x: number, y: number, len: number, angle: number, color: string): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, len * 0.035);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.14, len, -len * 0.02);
  ctx.stroke();
  ctx.lineWidth = Math.max(1.5, len * 0.022);
  ctx.beginPath();
  ctx.moveTo(len * 0.38, -len * 0.07);
  ctx.quadraticCurveTo(len * 0.48, -len * 0.26, len * 0.6, -len * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(len * 0.68, -len * 0.04);
  ctx.quadraticCurveTo(len * 0.76, -len * 0.2, len * 0.9, -len * 0.22);
  ctx.stroke();
  ctx.restore();
}

/** A hanging ornamental knot + tassel (norigae-style), for flanking the board. */
export function drawTasselKnot(ctx: Ctx2D, x: number, y: number, s: number, cord: string, strands: string[]): void {
  ctx.save();
  ctx.translate(x, y);

  ctx.strokeStyle = cord;
  ctx.lineCap = 'round';
  ctx.lineWidth = Math.max(2, s * 0.05);
  ctx.beginPath();
  ctx.moveTo(0, -s * 0.95);
  ctx.quadraticCurveTo(-s * 0.15, -s * 0.55, 0, -s * 0.28);
  ctx.stroke();

  ctx.lineWidth = Math.max(1.5, s * 0.045);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    ctx.beginPath();
    ctx.ellipse(Math.cos(a) * s * 0.09, -s * 0.1 + Math.sin(a) * s * 0.09, s * 0.16, s * 0.1, a, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = cord;
  ctx.beginPath();
  ctx.arc(0, s * 0.03, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.lineWidth = Math.max(1, s * 0.016);
  ctx.stroke();

  const n = strands.length;
  for (let i = 0; i < n; i++) {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const dx = (t - 0.5) * s * 0.55;
    ctx.strokeStyle = strands[i % strands.length]!;
    ctx.lineWidth = Math.max(1.5, s * 0.035);
    ctx.beginPath();
    ctx.moveTo(0, s * 0.11);
    ctx.quadraticCurveTo(dx * 0.6, s * 0.38, dx, s * 0.68);
    ctx.stroke();
  }
  ctx.restore();
}
