import { NX, NY, DX, DY, DT, C } from '../config';
import { idx, makeField } from './grid';
import { Jx, Jy } from './deposition';
import { mask as condMask, groupId as condGroupId, groupSigma } from './conductors';
import { eps } from './dielectric';

export const Ex = makeField();
export const Ey = makeField();
export const Bz = makeField();

const ExPrevTop = new Float32Array(NX);
const ExPrevTopInner = new Float32Array(NX);
const ExPrevBot = new Float32Array(NX);
const ExPrevBotInner = new Float32Array(NX);
const EyPrevLeft = new Float32Array(NY);
const EyPrevLeftInner = new Float32Array(NY);
const EyPrevRight = new Float32Array(NY);
const EyPrevRightInner = new Float32Array(NY);

const alpha = (C * DT - DX) / (C * DT + DX);

export function step(): void {
  // Per-cell update coefficients combining dielectric (ε) and conductor (σ):
  //   ∂E/∂t = (1/ε)(∇×B - J - σE)
  // Semi-implicit (Crank-Nicolson on σE):
  //   x = σ·Δt/(2ε),  ca = (1-x)/(1+x),  cbDt = Δt/(ε(1+x))
  //   E^{n+1} = ca · E^n + cbDt · (curl - J)
  // Vacuum + no conductor (ε=1, σ=0): ca=1, cbDt=Δt → standard FDTD.
  const dtHalf = DT * 0.5;

  for (let i = 0; i < NX; i++) {
    ExPrevTop[i] = Ex[idx(i, 0)];
    ExPrevTopInner[i] = Ex[idx(i, 1)];
    ExPrevBot[i] = Ex[idx(i, NY - 1)];
    ExPrevBotInner[i] = Ex[idx(i, NY - 2)];
  }
  for (let j = 0; j < NY; j++) {
    EyPrevLeft[j] = Ey[idx(0, j)];
    EyPrevLeftInner[j] = Ey[idx(1, j)];
    EyPrevRight[j] = Ey[idx(NX - 1, j)];
    EyPrevRightInner[j] = Ey[idx(NX - 2, j)];
  }

  for (let j = 1; j < NY - 1; j++) {
    for (let i = 0; i < NX; i++) {
      const k = idx(i, j);
      const e = eps[k];
      const x = (condMask[k] ? groupSigma[condGroupId[k]] : 0) * dtHalf / e;
      const denom = 1 + x;
      const ca = (1 - x) / denom;
      const cbDt = DT / (e * denom);
      const curl = C * (Bz[k] - Bz[k - NX]) / DY - Jx[k];
      Ex[k] = ca * Ex[k] + cbDt * curl;
    }
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 1; i < NX - 1; i++) {
      const k = idx(i, j);
      const e = eps[k];
      const x = (condMask[k] ? groupSigma[condGroupId[k]] : 0) * dtHalf / e;
      const denom = 1 + x;
      const ca = (1 - x) / denom;
      const cbDt = DT / (e * denom);
      const curl = -C * (Bz[k] - Bz[k - 1]) / DX - Jy[k];
      Ey[k] = ca * Ey[k] + cbDt * curl;
    }
  }

  for (let i = 0; i < NX; i++) {
    const kT = idx(i, 0);
    const kTi = idx(i, 1);
    Ex[kT] = ExPrevTopInner[i] + alpha * (Ex[kTi] - ExPrevTop[i]);

    const kB = idx(i, NY - 1);
    const kBi = idx(i, NY - 2);
    Ex[kB] = ExPrevBotInner[i] + alpha * (Ex[kBi] - ExPrevBot[i]);
  }
  for (let j = 0; j < NY; j++) {
    const kL = idx(0, j);
    const kLi = idx(1, j);
    Ey[kL] = EyPrevLeftInner[j] + alpha * (Ey[kLi] - EyPrevLeft[j]);

    const kR = idx(NX - 1, j);
    const kRi = idx(NX - 2, j);
    Ey[kR] = EyPrevRightInner[j] + alpha * (Ey[kRi] - EyPrevRight[j]);
  }

  for (let j = 0; j < NY - 1; j++) {
    for (let i = 0; i < NX - 1; i++) {
      const k = idx(i, j);
      Bz[k] += DT * C * (
        (Ex[k + NX] - Ex[k]) / DY -
        (Ey[k + 1] - Ey[k]) / DX
      );
    }
  }
}

export function reset(): void {
  Ex.fill(0);
  Ey.fill(0);
  Bz.fill(0);
}
