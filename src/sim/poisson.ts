import { NX, NY, DX, EPS0, JACOBI_ITERS } from '../config';
import { idx, makeField } from './grid';
import { rho } from './deposition';

let phiA = makeField();
let phiB = makeField();

export const ExStatic = makeField();
export const EyStatic = makeField();

const dx2 = DX * DX;

export function solve(): void {
  for (let it = 0; it < JACOBI_ITERS; it++) {
    for (let j = 1; j < NY - 1; j++) {
      for (let i = 1; i < NX - 1; i++) {
        const k = idx(i, j);
        phiB[k] = 0.25 * (
          phiA[k - 1] + phiA[k + 1] +
          phiA[k - NX] + phiA[k + NX] +
          (dx2 * rho[k]) / EPS0
        );
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
