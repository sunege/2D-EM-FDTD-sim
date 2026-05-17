import { NX, NY, SIGMA, DEPOSIT_RADIUS } from '../config';
import { idx, makeField, zero } from './grid';
import * as P from './particles';

export const rho = makeField();
export const Jx = makeField();
export const Jy = makeField();

const sigma2 = SIGMA * SIGMA;

export function compute(): void {
  zero(rho);
  zero(Jx);
  zero(Jy);

  const r = DEPOSIT_RADIUS;
  for (let p = 0; p < P.n; p++) {
    if (!P.alive[p]) continue;
    const cx = P.px[p];
    const cy = P.py[p];
    const qp = P.q[p];
    const vxp = P.vx[p];
    const vyp = P.vy[p];

    const i0 = Math.max(0, Math.floor(cx) - r);
    const i1 = Math.min(NX - 1, Math.floor(cx) + r);
    const j0 = Math.max(0, Math.floor(cy) - r);
    const j1 = Math.min(NY - 1, Math.floor(cy) + r);

    let wsum = 0;
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        wsum += Math.exp(-(dx * dx + dy * dy) / sigma2);
      }
    }
    if (wsum <= 0) continue;
    const inv = 1.0 / wsum;

    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        const w = Math.exp(-(dx * dx + dy * dy) / sigma2) * inv;
        const k = idx(i, j);
        const qw = qp * w;
        rho[k] += qw;
        Jx[k] += qw * vxp;
        Jy[k] += qw * vyp;
      }
    }
  }
}
