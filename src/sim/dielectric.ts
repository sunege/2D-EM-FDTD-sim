import { NX, NY, EPS_R_MIN, EPS_R_MAX } from '../config';
import { N_CELLS, idx } from './grid';

// Per-cell relative permittivity ε_r. Vacuum = 1.0.
export const eps = new Float32Array(N_CELLS);
eps.fill(1.0);

// Per-cell group ID for shape identity (0 = no dielectric).
export const groupId = new Int16Array(N_CELLS);

export const MAX_GROUPS = 256;
const groupInUse = new Uint8Array(MAX_GROUPS);

// Bumped whenever `eps` changes (placement/remove/clear). Consumers cache
// derived quantities (e.g. Poisson face-ε / 1/Σε) and rebuild on mismatch.
let version = 0;
function bump(): void { version++; }
export function getVersion(): number { return version; }

function clampEr(v: number): number {
  return Math.max(EPS_R_MIN, Math.min(EPS_R_MAX, v));
}

function allocGroup(): number {
  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!groupInUse[g]) {
      groupInUse[g] = 1;
      return g;
    }
  }
  return 0;
}

export function clear(): void {
  eps.fill(1.0);
  groupId.fill(0);
  groupInUse.fill(0);
  bump();
}

export function removeGroup(g: number): void {
  if (g <= 0 || g >= MAX_GROUPS || !groupInUse[g]) return;
  for (let k = 0; k < N_CELLS; k++) {
    if (groupId[k] === g) {
      eps[k] = 1.0;
      groupId[k] = 0;
    }
  }
  groupInUse[g] = 0;
  bump();
}

export function getGroupAt(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  if (i < 0 || i >= NX || j < 0 || j >= NY) return 0;
  return groupId[idx(i, j)];
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

export function addDisk(cx: number, cy: number, r: number, value: number): number {
  const e = clampEr(value);
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
        eps[k] = e;
        groupId[k] = g;
      }
    }
  }
  bump();
  return g;
}

export function addAnnulus(cx: number, cy: number, rOuter: number, rInner: number, value: number): number {
  const e = clampEr(value);
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
        eps[k] = e;
        groupId[k] = g;
      }
    }
  }
  bump();
  return g;
}

export function addRect(x1: number, y1: number, x2: number, y2: number, value: number): number {
  const e = clampEr(value);
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
      eps[k] = e;
      groupId[k] = g;
    }
  }
  bump();
  return g;
}
