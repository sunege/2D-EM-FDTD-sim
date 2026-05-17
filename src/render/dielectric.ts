import { NX, NY, CANVAS_W, CANVAS_H, EPS_R_MAX } from '../config';
import { eps } from '../sim/dielectric';
import { ctx } from './canvas';

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
      data[p] = 60;
      data[p + 1] = 130;
      data[p + 2] = 230;
      data[p + 3] = 40 + 100 * t;
    } else {
      data[p + 3] = 0;
    }
  }
  overlayCtx.putImageData(overlayData, 0, 0);
  ctx.drawImage(overlay, 0, 0, CANVAS_W, CANVAS_H);
}
