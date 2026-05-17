import { NX, NY, DX, EPS0, JACOBI_ITERS } from '../config';
import { idx, makeField } from './grid';
import { rho } from './deposition';
import { groupId, groupGrounded, groupVoltage, MAX_GROUPS } from './conductors';

let phiA = makeField();
let phiB = makeField();

export const ExStatic = makeField();
export const EyStatic = makeField();

const dx2 = DX * DX;

const groupSum = new Float32Array(MAX_GROUPS);
const groupCount = new Int32Array(MAX_GROUPS);

export function solve(): void {
  for (let it = 0; it < JACOBI_ITERS; it++) {
    groupSum.fill(0);
    groupCount.fill(0);
    let hasFloating = false;

    for (let j = 1; j < NY - 1; j++) {
      for (let i = 1; i < NX - 1; i++) {
        const k = idx(i, j);
        const g = groupId[k];
        let v: number;

        if (g > 0 && groupGrounded[g]) {
          v = groupVoltage[g];
        } else {
          // Non-conductor (uses ρ) or floating conductor (ρ=0 inside; will be
          // overwritten by the group-average pass below).
          const rhoCell = g > 0 ? 0 : rho[k];
          v = 0.25 * (
            phiA[k - 1] + phiA[k + 1] +
            phiA[k - NX] + phiA[k + NX] +
            (dx2 * rhoCell) / EPS0
          );
        }
        phiB[k] = v;

        if (g > 0 && !groupGrounded[g]) {
          groupSum[g] += v;
          groupCount[g] += 1;
          hasFloating = true;
        }
      }
    }

    if (hasFloating) {
      // Replace each floating conductor cell with the group mean (enforces
      // equipotential without fixing the value). Group sum reflects the
      // free Laplace update from neighboring potentials.
      for (let k = 0; k < NX * NY; k++) {
        const g = groupId[k];
        if (g > 0 && !groupGrounded[g] && groupCount[g] > 0) {
          phiB[k] = groupSum[g] / groupCount[g];
        }
      }
      for (let g = 1; g <= MAX_GROUPS - 1; g++) {
        if (!groupGrounded[g] && groupCount[g] > 0) {
          groupVoltage[g] = groupSum[g] / groupCount[g];
        }
      }
    }

    const tmp = phiA;
    phiA = phiB;
    phiB = tmp;
  }

  for (let j = 1; j < NY - 1; j++) {
    for (let i = 1; i < NX - 1; i++) {
      const k = idx(i, j);
      ExStatic[k] = -(phiA[k + 1] - phiA[k - 1]) / (2 * DX);
      EyStatic[k] = -(phiA[k + NX] - phiA[k - NX]) / (2 * DX);
    }
  }
  for (let i = 0; i < NX; i++) {
    ExStatic[idx(i, 0)] = 0;
    EyStatic[idx(i, 0)] = 0;
    ExStatic[idx(i, NY - 1)] = 0;
    EyStatic[idx(i, NY - 1)] = 0;
  }
  for (let j = 0; j < NY; j++) {
    ExStatic[idx(0, j)] = 0;
    EyStatic[idx(0, j)] = 0;
    ExStatic[idx(NX - 1, j)] = 0;
    EyStatic[idx(NX - 1, j)] = 0;
  }
}

export function getPhi(): Float32Array { return phiA; }

export function reset(): void {
  phiA.fill(0);
  phiB.fill(0);
  ExStatic.fill(0);
  EyStatic.fill(0);
}
