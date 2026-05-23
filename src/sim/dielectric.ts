import { NX, NY, EPS_R_MIN, EPS_R_MAX } from '../config';
import { N_CELLS, idx } from './grid';
import { rasterizePolygon } from './polygon';

// Per-cell relative permittivity ε_r. Vacuum = 1.0.
export const eps = new Float32Array(N_CELLS);
eps.fill(1.0);

// Per-cell group ID for shape identity (0 = no dielectric).
export const groupId = new Int16Array(N_CELLS);

export const MAX_GROUPS = 256;
const groupInUse = new Uint8Array(MAX_GROUPS);

// Per-group shape history (with per-shape ε_r — overlapping placements can
// have different ε_r values that overwrite earlier ones cell-by-cell, so we
// record each placement individually for faithful replay).
export type DielectricShape =
  | { kind: 'disk'; cx: number; cy: number; r: number; epsR: number }
  | { kind: 'annulus'; cx: number; cy: number; rOuter: number; rInner: number; epsR: number }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number; epsR: number }
  | { kind: 'polygon'; points: number[]; epsR: number };
const groupShapes: DielectricShape[][] = Array.from({ length: MAX_GROUPS }, () => []);
export function getGroupShapes(g: number): DielectricShape[] {
  if (g <= 0 || g >= MAX_GROUPS || !groupInUse[g]) return [];
  return groupShapes[g];
}
export function getActiveGroupIds(): number[] {
  const out: number[] = [];
  for (let g = 1; g < MAX_GROUPS; g++) if (groupInUse[g]) out.push(g);
  return out;
}

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
  for (let g = 0; g < MAX_GROUPS; g++) groupShapes[g] = [];
  bump();
}

export function isInUse(g: number): boolean {
  return g > 0 && g < MAX_GROUPS && groupInUse[g] === 1;
}

// Update ε_r for every cell of group g and bump the version so Poisson's
// coefficient cache rebuilds on the next solve. Value is clamped to the
// allowed range. Also rewrites the per-shape ε_r in the group's shape history
// so subsequent serialization reflects the user's edit.
export function setGroupEpsilon(g: number, value: number): void {
  if (!isInUse(g)) return;
  const e = clampEr(value);
  for (let k = 0; k < N_CELLS; k++) {
    if (groupId[k] === g) eps[k] = e;
  }
  const shapes = groupShapes[g];
  for (let s = 0; s < shapes.length; s++) shapes[s].epsR = e;
  bump();
}

// Read back any one cell's ε_r as a representative of the group. Returns 1.0
// if the group has no cells (which shouldn't happen for in-use groups).
export function getGroupEpsilon(g: number): number {
  if (!isInUse(g)) return 1.0;
  for (let k = 0; k < N_CELLS; k++) {
    if (groupId[k] === g) return eps[k];
  }
  return 1.0;
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
  groupShapes[g] = [];
  bump();
}

export function getGroupAt(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  if (i < 0 || i >= NX || j < 0 || j >= NY) return 0;
  return groupId[idx(i, j)];
}

export interface GroupBBox { xmin: number; ymin: number; xmax: number; ymax: number; }
export function getGroupBBox(g: number): GroupBBox {
  if (!isInUse(g)) return { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  let xmin = Infinity, ymin = Infinity, xmax = -Infinity, ymax = -Infinity;
  for (const s of groupShapes[g]) {
    if (s.kind === 'disk') {
      if (s.cx - s.r < xmin) xmin = s.cx - s.r;
      if (s.cx + s.r > xmax) xmax = s.cx + s.r;
      if (s.cy - s.r < ymin) ymin = s.cy - s.r;
      if (s.cy + s.r > ymax) ymax = s.cy + s.r;
    } else if (s.kind === 'annulus') {
      if (s.cx - s.rOuter < xmin) xmin = s.cx - s.rOuter;
      if (s.cx + s.rOuter > xmax) xmax = s.cx + s.rOuter;
      if (s.cy - s.rOuter < ymin) ymin = s.cy - s.rOuter;
      if (s.cy + s.rOuter > ymax) ymax = s.cy + s.rOuter;
    } else if (s.kind === 'rect') {
      const xa = Math.min(s.x0, s.x1), xb = Math.max(s.x0, s.x1);
      const ya = Math.min(s.y0, s.y1), yb = Math.max(s.y0, s.y1);
      if (xa < xmin) xmin = xa;
      if (xb > xmax) xmax = xb;
      if (ya < ymin) ymin = ya;
      if (yb > ymax) ymax = yb;
    } else {
      for (let i = 0; i < s.points.length; i += 2) {
        const x = s.points[i], y = s.points[i + 1];
        if (x < xmin) xmin = x;
        if (x > xmax) xmax = x;
        if (y < ymin) ymin = y;
        if (y > ymax) ymax = y;
      }
    }
  }
  if (xmin === Infinity) return { xmin: 0, ymin: 0, xmax: 0, ymax: 0 };
  return { xmin, ymin, xmax, ymax };
}

function rasterizeShapeIntoGroup(s: DielectricShape, g: number): void {
  const e = s.epsR;
  if (s.kind === 'disk') {
    const r2 = s.r * s.r;
    const i0 = Math.max(0, Math.floor(s.cx - s.r));
    const i1 = Math.min(NX - 1, Math.ceil(s.cx + s.r));
    const j0 = Math.max(0, Math.floor(s.cy - s.r));
    const j1 = Math.min(NY - 1, Math.ceil(s.cy + s.r));
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - s.cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - s.cx;
        if (dx * dx + dy * dy <= r2) {
          const k = idx(i, j);
          eps[k] = e;
          groupId[k] = g;
        }
      }
    }
  } else if (s.kind === 'annulus') {
    const ro2 = s.rOuter * s.rOuter;
    const ri2 = s.rInner * s.rInner;
    const i0 = Math.max(0, Math.floor(s.cx - s.rOuter));
    const i1 = Math.min(NX - 1, Math.ceil(s.cx + s.rOuter));
    const j0 = Math.max(0, Math.floor(s.cy - s.rOuter));
    const j1 = Math.min(NY - 1, Math.ceil(s.cy + s.rOuter));
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - s.cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - s.cx;
        const d2 = dx * dx + dy * dy;
        if (d2 <= ro2 && d2 >= ri2) {
          const k = idx(i, j);
          eps[k] = e;
          groupId[k] = g;
        }
      }
    }
  } else if (s.kind === 'rect') {
    const xa = Math.min(s.x0, s.x1), xb = Math.max(s.x0, s.x1);
    const ya = Math.min(s.y0, s.y1), yb = Math.max(s.y0, s.y1);
    const i0 = Math.max(0, Math.floor(xa));
    const i1 = Math.min(NX - 1, Math.ceil(xb));
    const j0 = Math.max(0, Math.floor(ya));
    const j1 = Math.min(NY - 1, Math.ceil(yb));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const k = idx(i, j);
        eps[k] = e;
        groupId[k] = g;
      }
    }
  } else {
    rasterizePolygon(s.points, NX, NY, (i, j) => {
      const k = idx(i, j);
      eps[k] = e;
      groupId[k] = g;
    });
  }
}

export function translateGroup(g: number, dx: number, dy: number): boolean {
  if (!isInUse(g)) return false;
  if (dx === 0 && dy === 0) return false;
  const shapes = groupShapes[g];
  for (const s of shapes) {
    if (s.kind === 'disk' || s.kind === 'annulus') {
      s.cx += dx; s.cy += dy;
    } else if (s.kind === 'rect') {
      s.x0 += dx; s.y0 += dy;
      s.x1 += dx; s.y1 += dy;
    } else {
      const pts = s.points;
      for (let i = 0; i < pts.length; i += 2) {
        pts[i]     += dx;
        pts[i + 1] += dy;
      }
    }
  }
  for (let k = 0; k < N_CELLS; k++) {
    if (groupId[k] === g) {
      eps[k] = 1.0;
      groupId[k] = 0;
    }
  }
  for (const s of shapes) rasterizeShapeIntoGroup(s, g);
  // Poisson caches face-ε per cell; any change to eps[] must bump the version.
  bump();
  return true;
}

// Merge into an existing group only when its ε_r matches the new placement.
// Different-ε adjacent placements get their own groups, which is required to
// build interfaces (e.g. optical-fiber core vs. cladding).
const EPS_MATCH_TOL = 1e-6;

function findExistingGroupDisk(cx: number, cy: number, r2: number, i0: number, i1: number, j0: number, j1: number, epsR: number): number {
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      if (dx * dx + dy * dy <= r2) {
        const k = idx(i, j);
        const g = groupId[k];
        if (g > 0 && Math.abs(eps[k] - epsR) < EPS_MATCH_TOL) return g;
      }
    }
  }
  return 0;
}

function findExistingGroupAnnulus(cx: number, cy: number, ro2: number, ri2: number, i0: number, i1: number, j0: number, j1: number, epsR: number): number {
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      const d2 = dx * dx + dy * dy;
      if (d2 <= ro2 && d2 >= ri2) {
        const k = idx(i, j);
        const g = groupId[k];
        if (g > 0 && Math.abs(eps[k] - epsR) < EPS_MATCH_TOL) return g;
      }
    }
  }
  return 0;
}

function findExistingGroupRect(i0: number, i1: number, j0: number, j1: number, epsR: number): number {
  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = idx(i, j);
      const g = groupId[k];
      if (g > 0 && Math.abs(eps[k] - epsR) < EPS_MATCH_TOL) return g;
    }
  }
  return 0;
}

function findExistingGroupPolygon(points: number[], epsR: number): number {
  let found = 0;
  rasterizePolygon(points, NX, NY, (i, j) => {
    if (found > 0) return;
    const k = idx(i, j);
    const g = groupId[k];
    if (g > 0 && Math.abs(eps[k] - epsR) < EPS_MATCH_TOL) found = g;
  });
  return found;
}

export function addDisk(cx: number, cy: number, r: number, value: number): number {
  const e = clampEr(value);
  const r2 = r * r;
  const i0 = Math.max(0, Math.floor(cx - r));
  const i1 = Math.min(NX - 1, Math.ceil(cx + r));
  const j0 = Math.max(0, Math.floor(cy - r));
  const j1 = Math.min(NY - 1, Math.ceil(cy + r));

  const existing = findExistingGroupDisk(cx, cy, r2, i0, i1, j0, j1, e);
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
  groupShapes[g].push({ kind: 'disk', cx, cy, r, epsR: e });
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

  const existing = findExistingGroupAnnulus(cx, cy, ro2, ri2, i0, i1, j0, j1, e);
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
  groupShapes[g].push({ kind: 'annulus', cx, cy, rOuter, rInner, epsR: e });
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

  const existing = findExistingGroupRect(i0, i1, j0, j1, e);
  const g = existing || allocGroup();
  if (g === 0) return 0;

  for (let j = j0; j <= j1; j++) {
    for (let i = i0; i <= i1; i++) {
      const k = idx(i, j);
      eps[k] = e;
      groupId[k] = g;
    }
  }
  groupShapes[g].push({ kind: 'rect', x0: x1, y0: y1, x1: x2, y1: y2, epsR: e });
  bump();
  return g;
}

export function addPolygon(points: number[], value: number): number {
  if (points.length < 6) return 0;
  const e = clampEr(value);
  const existing = findExistingGroupPolygon(points, e);
  const g = existing || allocGroup();
  if (g === 0) return 0;

  rasterizePolygon(points, NX, NY, (i, j) => {
    const k = idx(i, j);
    eps[k] = e;
    groupId[k] = g;
  });
  groupShapes[g].push({ kind: 'polygon', points: points.slice(), epsR: e });
  bump();
  return g;
}
