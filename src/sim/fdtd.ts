import { NX, NY, DX, DY, DT, C } from '../config';
import { idx, makeField } from './grid';
import { Jx, Jy } from './deposition';

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
      Ex[k] += DT * (C * (Bz[k] - Bz[k - NX]) / DY - Jx[k]);
    }
  }
  for (let j = 0; j < NY; j++) {
    for (let i = 1; i < NX - 1; i++) {
      const k = idx(i, j);
      Ey[k] += DT * (-C * (Bz[k] - Bz[k - 1]) / DX - Jy[k]);
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
