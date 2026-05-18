import { NX, NY, VECTOR_STRIDE, PIXEL_SCALE } from '../config';
import { idx } from '../sim/grid';
import { ExStatic, EyStatic } from '../sim/poisson';
import { ExDisp, EyDisp } from './highpass';
import { ctx } from './canvas';
import { getZoom } from './viewport';

const HEAD_PX = 4;
const HEAD_ANGLE = 0.42;
const SHOW_THRESHOLD = 0.10;

export function draw(includeStatic: boolean, includeWave: boolean): void {
  if (!includeStatic && !includeWave) return;

  const zoom = getZoom();
  // Adaptive stride: show more arrows when zoomed in, keeping screen density constant.
  const stride = Math.max(1, Math.round(VECTOR_STRIDE / zoom));
  const half = stride / 2 | 0;
  // Arrow max length scales inversely with zoom so on-screen size stays proportional.
  const arrowMaxPx = stride * PIXEL_SCALE * 1.00;
  // Head size in logical coords (compensated so head stays same screen size).
  const headPx = HEAD_PX / zoom;

  let maxMag = 1e-6;
  for (let j = half; j < NY; j += stride) {
    for (let i = half; i < NX; i += stride) {
      const k = idx(i, j);
      const ex = (includeStatic ? ExStatic[k] : 0) + (includeWave ? ExDisp[k] : 0);
      const ey = (includeStatic ? EyStatic[k] : 0) + (includeWave ? EyDisp[k] : 0);
      const m = Math.hypot(ex, ey);
      if (m > maxMag) maxMag = m;
    }
  }

  const fieldScale = arrowMaxPx / maxMag;

  ctx.save();
  ctx.beginPath();

  const cosP = Math.cos(HEAD_ANGLE);
  const sinP = Math.sin(HEAD_ANGLE);
  const cosN = cosP;
  const sinN = -sinP;

  for (let j = half; j < NY; j += stride) {
    for (let i = half; i < NX; i += stride) {
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

      ctx.moveTo(ax, ay);
      ctx.lineTo(bx, by);
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - headPx * (ux * cosP - uy * sinP), by - headPx * (uy * cosP + ux * sinP));
      ctx.moveTo(bx, by);
      ctx.lineTo(bx - headPx * (ux * cosN - uy * sinN), by - headPx * (uy * cosN + ux * sinN));
    }
  }

  // white outline pass — line width compensated to stay constant on screen
  ctx.lineWidth = 3.5 / zoom;
  ctx.strokeStyle = 'rgba(255,255,255,0.90)';
  ctx.stroke();

  // black arrow pass
  ctx.lineWidth = 1.5 / zoom;
  ctx.strokeStyle = 'rgba(0,0,0,0.85)';
  ctx.stroke();

  ctx.restore();
}
