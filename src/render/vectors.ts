import { NX, NY, VECTOR_STRIDE, PIXEL_SCALE } from '../config';
import { idx } from '../sim/grid';
import { ExStatic, EyStatic } from '../sim/poisson';
import { ExDisp, EyDisp } from './highpass';
import { ctx } from './canvas';

const ARROW_MAX_PX = VECTOR_STRIDE * PIXEL_SCALE * 1.00;
const HEAD_PX = 4;
const HEAD_ANGLE = 0.42;
const SHOW_THRESHOLD = 0.10;

export function draw(includeStatic: boolean, includeWave: boolean): void {
  if (!includeStatic && !includeWave) return;

  const half = VECTOR_STRIDE / 2 | 0;

  let maxMag = 1e-6;
  for (let j = half; j < NY; j += VECTOR_STRIDE) {
    for (let i = half; i < NX; i += VECTOR_STRIDE) {
      const k = idx(i, j);
      const ex = (includeStatic ? ExStatic[k] : 0) + (includeWave ? ExDisp[k] : 0);
      const ey = (includeStatic ? EyStatic[k] : 0) + (includeWave ? EyDisp[k] : 0);
      const m = Math.hypot(ex, ey);
      if (m > maxMag) maxMag = m;
    }
  }

  const fieldScale = ARROW_MAX_PX / maxMag;

  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.80)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();

  for (let j = half; j < NY; j += VECTOR_STRIDE) {
    for (let i = half; i < NX; i += VECTOR_STRIDE) {
      const k = idx(i, j);
      const ex = (includeStatic ? ExStatic[k] : 0) + (includeWave ? ExDisp[k] : 0);
      const ey = (includeStatic ? EyStatic[k] : 0) + (includeWave ? EyDisp[k] : 0);
      const m = Math.hypot(ex, ey);
      if (m < maxMag * SHOW_THRESHOLD) continue;

      const ux = ex / m;
      const uy = ey / m;
      const len = m * fieldScale;

      const ax = (i + 0.5) * PIXEL_SCALE;
      const ay = (j + 0.5) * PIXEL_SCALE;
      const bx = ax + ux * len;
      const by = ay + uy * len;

      // shaft
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);

      // arrowhead: two lines from tip
      const cosP = Math.cos(HEAD_ANGLE);
      const sinP = Math.sin(HEAD_ANGLE);
      const cosN = cosP;
      const sinN = -sinP;
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - HEAD_PX * (ux * cosP - uy * sinP), by - HEAD_PX * (uy * cosP + ux * sinP));
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - HEAD_PX * (ux * cosN - uy * sinN), by - HEAD_PX * (uy * cosN + ux * sinN));
    }
  }

  ctx.stroke();
  ctx.restore();
}
