import { NX, NY, DX, EPS0, JACOBI_ITERS } from '../config';
import { idx, makeField, N_CELLS } from './grid';
import { rho } from './deposition';
import { groupId, groupGrounded, groupVoltage, MAX_GROUPS } from './conductors';
import { eps, getVersion as getEpsVersion } from './dielectric';

let phiA = makeField();
let phiB = makeField();

export const ExStatic = makeField();
export const EyStatic = makeField();

const dx2 = DX * DX;
const RHO_SCALE = dx2 / EPS0;

const groupSum = new Float32Array(MAX_GROUPS);
const groupCount = new Int32Array(MAX_GROUPS);

// Cached stencil coefficients: rebuilt only when the ε field changes.
//   v = (eL·φ_L + eR·φ_R + eU·φ_U + eD·φ_D + RHO_SCALE·ρ) · invSum
// Face ε is the arithmetic mean of adjacent cells. Only interior cells
// (1..NX-2, 1..NY-2) are filled — boundary cells are unused by the Jacobi loop.
const eLArr = new Float32Array(N_CELLS);
const eRArr = new Float32Array(N_CELLS);
const eUArr = new Float32Array(N_CELLS);
const eDArr = new Float32Array(N_CELLS);
const invSumArr = new Float32Array(N_CELLS);
let coefVersion = -1;

function rebuildCoeffs(): void {
  for (let j = 1; j < NY - 1; j++) {
    for (let i = 1; i < NX - 1; i++) {
      const k = idx(i, j);
      const ec = eps[k];
      const eL = (ec + eps[k - 1]) * 0.5;
      const eR = (ec + eps[k + 1]) * 0.5;
      const eU = (ec + eps[k - NX]) * 0.5;
      const eD = (ec + eps[k + NX]) * 0.5;
      eLArr[k] = eL;
      eRArr[k] = eR;
      eUArr[k] = eU;
      eDArr[k] = eD;
      invSumArr[k] = 1 / (eL + eR + eU + eD);
    }
  }
}

export function solve(): void {
  const v = getEpsVersion();
  if (v !== coefVersion) {
    rebuildCoeffs();
    coefVersion = v;
  }

  for (let it = 0; it < JACOBI_ITERS; it++) {
    groupSum.fill(0);
    groupCount.fill(0);
    let hasFloating = false;

    for (let j = 1; j < NY - 1; j++) {
      for (let i = 1; i < NX - 1; i++) {
        const k = idx(i, j);
        const g = groupId[k];
        let phiNew: number;

        if (g > 0 && groupGrounded[g]) {
          phiNew = groupVoltage[g];
        } else {
          // Non-conductor cells use ρ; floating conductor cells use ρ=0 here
          // and are overwritten by the group-average pass below.
          const rhoCell = g > 0 ? 0 : rho[k];
          phiNew = (
            eLArr[k] * phiA[k - 1] + eRArr[k] * phiA[k + 1] +
            eUArr[k] * phiA[k - NX] + eDArr[k] * phiA[k + NX] +
            RHO_SCALE * rhoCell
          ) * invSumArr[k];
        }
        phiB[k] = phiNew;

        if (g > 0 && !groupGrounded[g]) {
          groupSum[g] += phiNew;
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
