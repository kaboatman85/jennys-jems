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
