import { NX, NY, DT, VMAX, K_DRAG, K_DAMP, PARTICLE_MARGIN } from '../config';
import * as P from './particles';

export const drag = {
  idx: -1,
  targetX: 0,
  targetY: 0,
};

export function startDrag(i: number, tx: number, ty: number): void {
  // Oscillating particles are pinned at their equilibrium — drag is ignored.
  if (P.isOscillating(i)) return;
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

  if (drag.idx >= 0 && drag.idx < P.n && P.alive[drag.idx] && !P.isOscillating(drag.idx)) {
    const i = drag.idx;
    const dx = drag.targetX - P.px[i];
    const dy = drag.targetY - P.py[i];
    P.ax[i] = K_DRAG * dx - K_DAMP * P.vx[i];
    P.ay[i] = K_DRAG * dy - K_DAMP * P.vy[i];
  }

  const lo = PARTICLE_MARGIN;
  const hiX = NX - 1 - PARTICLE_MARGIN;
  const hiY = NY - 1 - PARTICLE_MARGIN;

  for (let i = 0; i < P.n; i++) {
    if (!P.alive[i]) continue;

    if (P.omega[i] > 0) {
      // Kinematic oscillator: position and velocity are analytic functions of
      // phase. Equilibrium (eqX,eqY) is fixed at enable time; drag is ignored.
      P.phase[i] += P.omega[i] * DT;
      const s = Math.sin(P.phase[i]);
      const c = Math.cos(P.phase[i]);
      const a = P.amp[i];
      P.px[i] = P.eqX[i] + a * P.dirX[i] * s;
      P.py[i] = P.eqY[i] + a * P.dirY[i] * s;
      const omegaA = P.omega[i] * a;
      P.vx[i] = omegaA * P.dirX[i] * c;
      P.vy[i] = omegaA * P.dirY[i] * c;
      // Safety clamp for extreme slider combinations.
      const s2 = P.vx[i] * P.vx[i] + P.vy[i] * P.vy[i];
      if (s2 > VMAX * VMAX) {
        const k = VMAX / Math.sqrt(s2);
        P.vx[i] *= k;
        P.vy[i] *= k;
      }
      // Keep on-grid (oscillator amplitude may exceed margin near boundaries).
      if (P.px[i] < lo) P.px[i] = lo;
      if (P.px[i] > hiX) P.px[i] = hiX;
      if (P.py[i] < lo) P.py[i] = lo;
      if (P.py[i] > hiY) P.py[i] = hiY;
      continue;
    }

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

    if (P.px[i] < lo) { P.px[i] = lo; P.vx[i] = 0; }
    if (P.px[i] > hiX) { P.px[i] = hiX; P.vx[i] = 0; }
    if (P.py[i] < lo) { P.py[i] = lo; P.vy[i] = 0; }
    if (P.py[i] > hiY) { P.py[i] = hiY; P.vy[i] = 0; }
  }
}
