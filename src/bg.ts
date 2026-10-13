// Page background: the owner's artwork drawn cover-fit, with a transparent
// floral frame overlay (same dimensions, same cover-fit transform) on top.
// Falls back to a plain gradient until the images load.

interface Asset {
  img: HTMLImageElement;
  ready: boolean;
}

function loadAsset(src: string, onReady: () => void): Asset {
  const img = new Image();
  const asset: Asset = { img, ready: false };
  img.src = src;
  img.onload = () => {
    asset.ready = true;
    onReady();
  };
  return asset;
}

let bgImage: Asset | null = null;
let frameImage: Asset | null = null;

function loadAssets(onReady: () => void): void {
  if (!bgImage) bgImage = loadAsset('./bg-mockup.jpg', onReady);
  if (!frameImage) frameImage = loadAsset('./frame.png', onReady);
}

function fillFallbackGradient(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const g = ctx.createLinearGradient(0, 0, w * 0.4, h);
  g.addColorStop(0, '#ffd3ea');
  g.addColorStop(0.5, '#ffe9cf');
  g.addColorStop(1, '#e2d3ff');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
}

function drawCoverFit(ctx: CanvasRenderingContext2D, img: HTMLImageElement, w: number, h: number): void {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const dw = img.naturalWidth * scale;
  const dh = img.naturalHeight * scale;
  ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

/** Paints the page background and floral frame overlay, both cover-fit. */
export function drawBackground(canvas: HTMLCanvasElement): void {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const ctx = canvas.getContext('2d')!;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  loadAssets(() => drawBackground(canvas));

  if (!bgImage?.ready || bgImage.img.naturalWidth === 0) {
    fillFallbackGradient(ctx, w, h);
    return;
  }

  drawCoverFit(ctx, bgImage.img, w, h);

  if (frameImage?.ready && frameImage.img.naturalWidth > 0) {
    drawCoverFit(ctx, frameImage.img, w, h);
  }
}
