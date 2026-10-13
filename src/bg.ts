// Page background: the owner's reference mockup image, drawn cover-fit. Falls
// back to a plain gradient (matching the mockup's own tones) until it loads.

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
}
