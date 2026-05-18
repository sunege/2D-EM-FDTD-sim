import { NX, NY } from '../config';
import { N_CELLS, idx } from './grid';
import { ExStatic, EyStatic, getPhi } from './poisson';
import { ExDisp, EyDisp, BzDisp } from '../render/highpass';

// Field probes — fixed points in the grid that record time series of
// (E_total = E_static + E_disp) and Bz_disp into circular buffers. Used by
// `render/probeChart.ts` to draw waveform panels.

export const MAX_PROBES = 4;
export const BUF_LEN = 256;

const inUse = new Uint8Array(MAX_PROBES);
const xArr = new Int16Array(MAX_PROBES);
const yArr = new Int16Array(MAX_PROBES);
const bufEx = new Float32Array(MAX_PROBES * BUF_LEN);
const bufEy = new Float32Array(MAX_PROBES * BUF_LEN);
const bufBz = new Float32Array(MAX_PROBES * BUF_LEN);
const bufPhi = new Float32Array(MAX_PROBES * BUF_LEN);
let head = 0; // global write head; advances each simStep

export function clear(): void {
  inUse.fill(0);
  bufEx.fill(0);
  bufEy.fill(0);
  bufBz.fill(0);
  bufPhi.fill(0);
  head = 0;
}

export function add(x: number, y: number): number {
  const i = Math.max(0, Math.min(NX - 1, Math.round(x)));
  const j = Math.max(0, Math.min(NY - 1, Math.round(y)));
  for (let p = 0; p < MAX_PROBES; p++) {
    if (!inUse[p]) {
      inUse[p] = 1;
      xArr[p] = i;
      yArr[p] = j;
      // Clear this probe's history so new readings start clean.
      const off = p * BUF_LEN;
      for (let n = 0; n < BUF_LEN; n++) {
        bufEx[off + n] = 0;
        bufEy[off + n] = 0;
        bufBz[off + n] = 0;
        bufPhi[off + n] = 0;
      }
      return p;
    }
  }
  return -1;
}

export function remove(p: number): void {
  if (p < 0 || p >= MAX_PROBES) return;
  inUse[p] = 0;
}

export function move(p: number, x: number, y: number): void {
  if (p < 0 || p >= MAX_PROBES || !inUse[p]) return;
  xArr[p] = Math.max(0, Math.min(NX - 1, Math.round(x)));
  yArr[p] = Math.max(0, Math.min(NY - 1, Math.round(y)));
}

export function isUsed(p: number): boolean {
  return p >= 0 && p < MAX_PROBES && inUse[p] === 1;
}

export function getX(p: number): number { return xArr[p]; }
export function getY(p: number): number { return yArr[p]; }
export function getHead(): number { return head; }

export function bufExFor(p: number): Float32Array {
  return bufEx.subarray(p * BUF_LEN, (p + 1) * BUF_LEN);
}
export function bufEyFor(p: number): Float32Array {
  return bufEy.subarray(p * BUF_LEN, (p + 1) * BUF_LEN);
}
export function bufBzFor(p: number): Float32Array {
  return bufBz.subarray(p * BUF_LEN, (p + 1) * BUF_LEN);
}
export function bufPhiFor(p: number): Float32Array {
  return bufPhi.subarray(p * BUF_LEN, (p + 1) * BUF_LEN);
}

// Find the probe with center closest to (x, y) within maxDist; -1 if none.
export function findNearest(x: number, y: number, maxDist: number): number {
  let best = -1;
  let bestD2 = maxDist * maxDist;
  for (let p = 0; p < MAX_PROBES; p++) {
    if (!inUse[p]) continue;
    const dx = xArr[p] - x;
    const dy = yArr[p] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = p;
    }
  }
  return best;
}

export function count(): number {
  let c = 0;
  for (let p = 0; p < MAX_PROBES; p++) if (inUse[p]) c++;
  return c;
}

// Called once per simStep (after Highpass.update) to append the latest values
// at each probe location into its circular buffer.
export function sample(): void {
  // Sanity: cell-out-of-range guard.
  for (let p = 0; p < MAX_PROBES; p++) {
    if (!inUse[p]) continue;
    const k = idx(xArr[p], yArr[p]);
    if (k < 0 || k >= N_CELLS) continue;
    const off = p * BUF_LEN + head;
    bufEx[off] = ExStatic[k] + ExDisp[k];
    bufEy[off] = EyStatic[k] + EyDisp[k];
    bufBz[off] = BzDisp[k];
    bufPhi[off] = getPhi()[k];
  }
  head = (head + 1) % BUF_LEN;
}
