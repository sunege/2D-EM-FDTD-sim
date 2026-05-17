import { HIGHPASS_ALPHA } from '../config';
import { N_CELLS } from '../sim/grid';
import { Ex, Ey, Bz } from '../sim/fdtd';

const ExSlow = new Float32Array(N_CELLS);
const EySlow = new Float32Array(N_CELLS);
const BzSlow = new Float32Array(N_CELLS);

export const ExDisp = new Float32Array(N_CELLS);
export const EyDisp = new Float32Array(N_CELLS);
export const BzDisp = new Float32Array(N_CELLS);

let enabled = true;

export function setEnabled(e: boolean): void {
  enabled = e;
}

export function update(): void {
  if (!enabled) {
    ExDisp.set(Ex);
    EyDisp.set(Ey);
    BzDisp.set(Bz);
    return;
  }
  const a = HIGHPASS_ALPHA;
  for (let k = 0; k < N_CELLS; k++) {
    ExSlow[k] += a * (Ex[k] - ExSlow[k]);
    EySlow[k] += a * (Ey[k] - EySlow[k]);
    BzSlow[k] += a * (Bz[k] - BzSlow[k]);
    ExDisp[k] = Ex[k] - ExSlow[k];
    EyDisp[k] = Ey[k] - EySlow[k];
    BzDisp[k] = Bz[k] - BzSlow[k];
  }
}

export function reset(): void {
  ExSlow.fill(0);
  EySlow.fill(0);
  BzSlow.fill(0);
  ExDisp.fill(0);
  EyDisp.fill(0);
  BzDisp.fill(0);
}
