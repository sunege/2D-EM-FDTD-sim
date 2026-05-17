import { NX, NY, DT, VMAX, K_DRAG, K_DAMP, PARTICLE_MARGIN } from '../config';
import * as P from './particles';

export const drag = {
  idx: -1,
  targetX: 0,
  targetY: 0,
};

export function startDrag(i: number, tx: number, ty: number): void {
  drag.idx = i;
  drag.targetX = tx;
  drag.targetY = ty;
}

export function updateTarget(tx: number, ty: number): void {
  drag.targetX = tx;
  drag.targetY = ty;
}

export function endDrag(): void {
  drag.idx = -1;
}

export function step(): void {
  for (let i = 0; i < P.n; i++) {
    if (!P.alive[i]) continue;
    P.ax[i] = 0;
    P.ay[i] = 0;
  }

  if (drag.idx >= 0 && drag.idx < P.n && P.alive[drag.idx]) {
    const i = drag.idx;
    const dx = drag.targetX - P.px[i];
    const dy = drag.targetY - P.py[i];
    P.ax[i] = K_DRAG * dx - K_DAMP * P.vx[i];
    P.ay[i] = K_DRAG * dy - K_DAMP * P.vy[i];
  }

  for (let i = 0; i < P.n; i++) {
    if (!P.alive[i]) continue;
    P.vx[i] += P.ax[i] * DT;
    P.vy[i] += P.ay[i] * DT;
    const s2 = P.vx[i] * P.vx[i] + P.vy[i] * P.vy[i];
    if (s2 > VMAX * VMAX) {
      const s = Math.sqrt(s2);
      const k = VMAX / s;
      P.vx[i] *= k;
      P.vy[i] *= k;
    }
    P.px[i] += P.vx[i] * DT;
    P.py[i] += P.vy[i] * DT;

    const lo = PARTICLE_MARGIN;
    const hiX = NX - 1 - PARTICLE_MARGIN;
    const hiY = NY - 1 - PARTICLE_MARGIN;
    if (P.px[i] < lo) { P.px[i] = lo; P.vx[i] = 0; }
    if (P.px[i] > hiX) { P.px[i] = hiX; P.vx[i] = 0; }
    if (P.py[i] < lo) { P.py[i] = lo; P.vy[i] = 0; }
    if (P.py[i] > hiY) { P.py[i] = hiY; P.vy[i] = 0; }
  }
}
