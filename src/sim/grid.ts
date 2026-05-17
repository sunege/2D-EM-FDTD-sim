import { NX, NY } from '../config';

export const N_CELLS = NX * NY;

export function idx(i: number, j: number): number {
  return j * NX + i;
}

export function makeField(): Float32Array {
  return new Float32Array(N_CELLS);
}

export function zero(a: Float32Array): void {
  a.fill(0);
}
