import { NX, NY, PIXEL_SCALE } from '../config';
import { getPhi } from '../sim/poisson';
import { ctx } from './canvas';

// Marching-squares equipotential overlay. Levels are auto-scaled each frame
// to span ± max|φ| (so contours adapt to the current scene). Cells are
// quickly skipped via min/max bounds when no level intersects.

const N_LEVELS_PER_SIDE = 6; // 6 positive + 6 negative + 0 → 13 lines max
const levels = new Float32Array(N_LEVELS_PER_SIDE * 2);

export function draw(): void {
  const phi = getPhi();
  let maxAbs = 0;
  for (let k = 0; k < NX * NY; k++) {
    const a = Math.abs(phi[k]);
    if (a > maxAbs) maxAbs = a;
  }
  if (maxAbs < 1e-6) return;

  // Fill levels symmetrically (skip 0; we draw it separately, thicker).
  for (let n = 1; n <= N_LEVELS_PER_SIDE; n++) {
    const v = maxAbs * (n / N_LEVELS_PER_SIDE);
    levels[(n - 1) * 2] = v;
    levels[(n - 1) * 2 + 1] = -v;
  }

  const path = new Path2D();
  for (let li = 0; li < levels.length; li++) {
    addContour(path, phi, levels[li]);
  }
  // Zero contour: drawn last with stronger color/width so it stands out.
  const zeroPath = new Path2D();
  addContour(zeroPath, phi, 0);

  ctx.save();
  ctx.strokeStyle = 'rgba(50, 50, 65, 0.45)';
  ctx.lineWidth = 0.8;
  ctx.stroke(path);
  ctx.strokeStyle = 'rgba(30, 30, 45, 0.75)';
  ctx.lineWidth = 1.2;
  ctx.stroke(zeroPath);
  ctx.restore();
}

function addContour(path: Path2D, phi: Float32Array, L: number): void {
  const S = PIXEL_SCALE;
  for (let j = 0; j < NY - 1; j++) {
    const row = j * NX;
    const rowNext = (j + 1) * NX;
    for (let i = 0; i < NX - 1; i++) {
      const a = phi[row + i];
      const b = phi[row + i + 1];
      const c = phi[rowNext + i + 1];
      const d = phi[rowNext + i];

      // Quick reject: if all corners are on the same side of L, skip.
      const mn = a < b ? (a < c ? (a < d ? a : d) : (c < d ? c : d))
                       : (b < c ? (b < d ? b : d) : (c < d ? c : d));
      const mx = a > b ? (a > c ? (a > d ? a : d) : (c > d ? c : d))
                       : (b > c ? (b > d ? b : d) : (c > d ? c : d));
      if (L < mn || L > mx) continue;

      let code = 0;
      if (a > L) code |= 1;
      if (b > L) code |= 2;
      if (c > L) code |= 4;
      if (d > L) code |= 8;
      if (code === 0 || code === 15) continue;

      // Edge crossings in grid coords. ".+ 0.5" centers each on the heatmap
      // pixel (phi[i,j] is at the center of the (i,j) heatmap pixel).
      const tT = safeT(L, a, b);
      const tR = safeT(L, b, c);
      const tB = safeT(L, d, c);
      const tL = safeT(L, a, d);
      const xT = (i + tT + 0.5) * S, yT = (j + 0.5) * S;
      const xR = (i + 1 + 0.5) * S, yR = (j + tR + 0.5) * S;
      const xB = (i + tB + 0.5) * S, yB = (j + 1 + 0.5) * S;
      const xLp = (i + 0.5) * S, yLp = (j + tL + 0.5) * S;

      switch (code) {
        case 1: case 14:
          path.moveTo(xT, yT); path.lineTo(xLp, yLp); break;
        case 2: case 13:
          path.moveTo(xT, yT); path.lineTo(xR, yR); break;
        case 3: case 12:
          path.moveTo(xLp, yLp); path.lineTo(xR, yR); break;
        case 4: case 11:
          path.moveTo(xR, yR); path.lineTo(xB, yB); break;
        case 6: case 9:
          path.moveTo(xT, yT); path.lineTo(xB, yB); break;
        case 7: case 8:
          path.moveTo(xLp, yLp); path.lineTo(xB, yB); break;
        case 5:
          // Saddle: connect upper-left and lower-right pieces.
          path.moveTo(xT, yT); path.lineTo(xLp, yLp);
          path.moveTo(xB, yB); path.lineTo(xR, yR);
          break;
        case 10:
          // Saddle (opposite diagonal).
          path.moveTo(xT, yT); path.lineTo(xR, yR);
          path.moveTo(xLp, yLp); path.lineTo(xB, yB);
          break;
      }
    }
  }
}

function safeT(L: number, v0: number, v1: number): number {
  const d = v1 - v0;
  if (Math.abs(d) < 1e-12) return 0.5;
  return (L - v0) / d;
}
