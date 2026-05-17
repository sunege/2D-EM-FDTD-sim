import { NX, NY, BZ_SCALE, BZ_THRESHOLD, CANVAS_W, CANVAS_H } from '../config';
import { idx } from '../sim/grid';
import { BzDisp } from './highpass';
import { ctx, cellImage, offCtx, offscreen } from './canvas';

export function draw(): void {
  const data = cellImage.data;
  const invScale = 1 / BZ_SCALE;
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const raw = BzDisp[idx(i, j)];
      const v = Math.abs(raw) < BZ_THRESHOLD ? 0 : raw * invScale;
      const c = Math.max(-1, Math.min(1, v));
      let r: number, g: number, b: number;
      if (c >= 0) {
        const t = c;
        r = 255;
        g = 255 * (1 - t);
        b = 255 * (1 - t);
      } else {
        const t = -c;
        r = 255 * (1 - t);
        g = 255 * (1 - t);
        b = 255;
      }
      const px = (j * NX + i) * 4;
      data[px] = r;
      data[px + 1] = g;
      data[px + 2] = b;
      data[px + 3] = 255;
    }
  }
  offCtx.putImageData(cellImage, 0, 0);
  ctx.drawImage(offscreen, 0, 0, CANVAS_W, CANVAS_H);
}

export function drawBlank(): void {
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
}
