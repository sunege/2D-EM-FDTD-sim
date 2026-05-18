import { NX, NY, CANVAS_W, CANVAS_H, PIXEL_SCALE, EPS_R_MAX } from '../config';
import { eps } from '../sim/dielectric';
import { ctx } from './canvas';
import { getZoom } from './viewport';

const overlay = document.createElement('canvas');
overlay.width = NX;
overlay.height = NY;
const overlayCtx = overlay.getContext('2d') as CanvasRenderingContext2D;
const overlayData = overlayCtx.createImageData(NX, NY);

const SPAN = EPS_R_MAX - 1.0;

export function draw(): void {
  const data = overlayData.data;
  for (let k = 0; k < NX * NY; k++) {
    const p = k * 4;
    const e = eps[k];
    if (e > 1.001) {
      const t = Math.min(1, (e - 1) / SPAN);
      data[p] = 30;
      data[p + 1] = 180;
      data[p + 2] = 60;
      data[p + 3] = 40 + 120 * t;
    } else {
      data[p + 3] = 0;
    }
  }
  overlayCtx.putImageData(overlayData, 0, 0);
  ctx.drawImage(overlay, 0, 0, CANVAS_W, CANVAS_H);

  // 1px border: draw edge segments on the main canvas at cell boundaries
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1 / getZoom();
  ctx.beginPath();
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (eps[k] <= 1.001) continue;
      const x0 = i * PIXEL_SCALE, x1 = x0 + PIXEL_SCALE;
      const y0 = j * PIXEL_SCALE, y1 = y0 + PIXEL_SCALE;
      if (j === 0 || eps[k - NX] <= 1.001)       { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
      if (j === NY - 1 || eps[k + NX] <= 1.001)  { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      if (i === 0 || eps[k - 1] <= 1.001)        { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
      if (i === NX - 1 || eps[k + 1] <= 1.001)   { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    }
  }
  ctx.stroke();
  ctx.restore();
}
