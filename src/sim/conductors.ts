import { NX, NY, SIGMA_CONDUCTOR_DEFAULT } from '../config';
import { N_CELLS, idx } from './grid';

// Per-cell
export const mask = new Uint8Array(N_CELLS);
export const groupId = new Int16Array(N_CELLS); // 0 = not a conductor; >0 = group index

// Per-group state. Index 0 reserved (means "no group").
export const MAX_GROUPS = 256;
export const groupGrounded = new Uint8Array(MAX_GROUPS); // 1 = fixed V, 0 = floating
export const groupVoltage = new Float32Array(MAX_GROUPS); // grounded: target V; floating: latest avg

let nextGroupId = 0;
let sigma = SIGMA_CONDUCTOR_DEFAULT;

export function setSigma(s: number): void { sigma = s; }
export function getSigma(): number { return sigma; }

function allocGroup(): number {
  if (nextGroupId >= MAX_GROUPS - 1) return 0;
  nextGroupId += 1;
  groupGrounded[nextGroupId] = 1;
  groupVoltage[nextGroupId] = 0;
  return nextGroupId;
}

export function clear(): void {
  mask.fill(0);
  groupId.fill(0);
  groupGrounded.fill(0);
  groupVoltage.fill(0);
  nextGroupId = 0;
}

function findExistingGroupDisk(cx: number, cy: number, r2: number, i0: number, i1: number, j0: number, j1: number): number {
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) {
        const g = groupId[idx(i, j)];
        if (g > 0) return g;
      }
    }
  }
  return 0;
}

function findExistingGroupAnnulus(cx: number, cy: number, ro2: number, ri2: number, i0: number, i1: number, j0: number, j1: number): number {
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 <= ro2 && d2 >= ri2) {
        const g = groupId[idx(i, j)];
        if (g > 0) return g;
      }
    }
  }
  return 0;
}

function findExistingGroupRect(i0: number, i1: number, j0: number, j1: number): number {
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const g = groupId[idx(i, j)];
      if (g > 0) return g;
    }
  }
  return 0;
}

export function addDisk(cx: number, cy: number, r: number): number {
  const r2 = r * r;
  const i0 = Math.max(0, Math.floor(cx - r));
  const i1 = Math.min(NX - 1, Math.ceil(cx + r));
  const j0 = Math.max(0, Math.floor(cy - r));
  const j1 = Math.min(NY - 1, Math.ceil(cy + r));

  const existing = findExistingGroupDisk(cx, cy, r2, i0, i1, j0, j1);
  const g = existing || allocGroup();
  if (g === 0) return 0;

  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) {
        const k = idx(i, j);
        mask[k] = 1;
        groupId[k] = g;
      }
    }
  }
  return g;
}

export function addAnnulus(cx: number, cy: number, rOuter: number, rInner: number): number {
  const ro2 = rOuter * rOuter;
  const ri2 = rInner * rInner;
  const i0 = Math.max(0, Math.floor(cx - rOuter));
  const i1 = Math.min(NX - 1, Math.ceil(cx + rOuter));
  const j0 = Math.max(0, Math.floor(cy - rOuter));
  const j1 = Math.min(NY - 1, Math.ceil(cy + rOuter));

  const existing = findExistingGroupAnnulus(cx, cy, ro2, ri2, i0, i1, j0, j1);
  const g = existing || allocGroup();
  if (g === 0) return 0;

  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 <= ro2 && d2 >= ri2) {
        const k = idx(i, j);
        mask[k] = 1;
        groupId[k] = g;
      }
    }
  }
  return g;
}

export function addRect(x1: number, y1: number, x2: number, y2: number): number {
  const xa = Math.min(x1, x2), xb = Math.max(x1, x2);
  const ya = Math.min(y1, y2), yb = Math.max(y1, y2);
  const i0 = Math.max(0, Math.floor(xa));
  const i1 = Math.min(NX - 1, Math.ceil(xb));
  const j0 = Math.max(0, Math.floor(ya));
  const j1 = Math.min(NY - 1, Math.ceil(yb));

  const existing = findExistingGroupRect(i0, i1, j0, j1);
  const g = existing || allocGroup();
  if (g === 0) return 0;

  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = idx(i, j);
      mask[k] = 1;
      groupId[k] = g;
    }
  }
  return g;
}

export function getGroupAt(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  if (i < 0 || i >= NX || j < 0 || j >= NY) return 0;
  return groupId[idx(i, j)];
}

export function toggleGrounded(g: number): void {
  if (g <= 0 || g > nextGroupId) return;
  if (groupGrounded[g]) {
    groupGrounded[g] = 0; // → floating; voltage will be relaxed by Poisson
  } else {
    groupGrounded[g] = 1; // → fixed
    groupVoltage[g] = 0;
  }
}

export function isGrounded(g: number): boolean {
  return g > 0 && groupGrounded[g] === 1;
}
