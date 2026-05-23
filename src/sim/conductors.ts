import { NX, NY, SIGMA_CONDUCTOR_DEFAULT } from '../config';
import { N_CELLS, idx } from './grid';
import { rasterizePolygon, polygonBBox } from './polygon';

// Per-cell
export const mask = new Uint8Array(N_CELLS);
export const groupId = new Int16Array(N_CELLS); // 0 = not a conductor; >0 = group index

// Per-group state. Index 0 reserved (means "no group").
export const MAX_GROUPS = 256;
const groupInUse = new Uint8Array(MAX_GROUPS); // slot allocation flag
export const groupGrounded = new Uint8Array(MAX_GROUPS); // 1 = fixed V, 0 = floating
export const groupVoltage = new Float32Array(MAX_GROUPS); // grounded: target V; floating: latest avg
// Per-group conductivity. Snapshot from `sigmaDefault` at allocGroup time so
// editing the global σ slider afterwards only affects new placements, not
// existing groups. FDTD reads this via Cond.groupSigma[Cond.groupId[k]].
export const groupSigma = new Float32Array(MAX_GROUPS);

// Per-group shape history — list of placements that constitute this group.
// Used by scene serialization (resolution-independent re-application).
export type ConductorShape =
  | { kind: 'disk'; cx: number; cy: number; r: number }
  | { kind: 'annulus'; cx: number; cy: number; rOuter: number; rInner: number }
  | { kind: 'rect'; x0: number; y0: number; x1: number; y1: number }
  | { kind: 'polygon'; points: number[] };
const groupShapes: ConductorShape[][] = Array.from({ length: MAX_GROUPS }, () => []);
export function getGroupShapes(g: number): ConductorShape[] {
  if (g <= 0 || g >= MAX_GROUPS || !groupInUse[g]) return [];
  return groupShapes[g];
}

let sigmaDefault = SIGMA_CONDUCTOR_DEFAULT;

export function setSigma(s: number): void { sigmaDefault = s; }
export function getSigma(): number { return sigmaDefault; }

export function setGroupSigma(g: number, s: number): void {
  if (g <= 0 || g >= MAX_GROUPS || !groupInUse[g]) return;
  groupSigma[g] = s;
}
export function getGroupSigma(g: number): number {
  if (g <= 0 || g >= MAX_GROUPS) return 0;
  return groupSigma[g];
}

export function setGroupVoltage(g: number, v: number): void {
  if (g <= 0 || g >= MAX_GROUPS || !groupInUse[g]) return;
  groupVoltage[g] = v;
}
export function getGroupVoltage(g: number): number {
  if (g <= 0 || g >= MAX_GROUPS) return 0;
  return groupVoltage[g];
}

function allocGroup(): number {
  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!groupInUse[g]) {
      groupInUse[g] = 1;
      groupGrounded[g] = 1;
      groupVoltage[g] = 0;
      groupSigma[g] = sigmaDefault;
      return g;
    }
  }
  return 0;
}

export function clear(): void {
  mask.fill(0);
  groupId.fill(0);
  groupInUse.fill(0);
  groupGrounded.fill(0);
  groupVoltage.fill(0);
  groupSigma.fill(0);
  for (let g = 0; g < MAX_GROUPS; g++) groupShapes[g] = [];
}

export function removeGroup(g: number): void {
  if (g <= 0 || g >= MAX_GROUPS || !groupInUse[g]) return;
  for (let k = 0; k < N_CELLS; k++) {
    if (groupId[k] === g) {
      mask[k] = 0;
      groupId[k] = 0;
    }
  }
  groupInUse[g] = 0;
  groupGrounded[g] = 0;
  groupVoltage[g] = 0;
  groupSigma[g] = 0;
  groupShapes[g] = [];
}

export function isInUse(g: number): boolean {
  return g > 0 && g < MAX_GROUPS && groupInUse[g] === 1;
}

// Enumerate all currently allocated group IDs (in ascending order).
export function getActiveGroupIds(): number[] {
  const out: number[] = [];
  for (let g = 1; g < MAX_GROUPS; g++) if (groupInUse[g]) out.push(g);
  return out;
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

function findExistingGroupPolygon(points: number[]): number {
  let found = 0;
  rasterizePolygon(points, NX, NY, (i, j) => {
    if (found > 0) return;
    const g = groupId[idx(i, j)];
    if (g > 0) found = g;
  });
  return found;
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
  groupShapes[g].push({ kind: 'disk', cx, cy, r });
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
  groupShapes[g].push({ kind: 'annulus', cx, cy, rOuter, rInner });
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
  groupShapes[g].push({ kind: 'rect', x0: x1, y0: y1, x1: x2, y1: y2 });
  return g;
}

export function addPolygon(points: number[]): number {
  if (points.length < 6) return 0;
  // Touch a bbox to ensure overlap with grid; rasterize handles clipping.
  polygonBBox(points, NX, NY);
  const existing = findExistingGroupPolygon(points);
  const g = existing || allocGroup();
  if (g === 0) return 0;

  rasterizePolygon(points, NX, NY, (i, j) => {
    const k = idx(i, j);
    mask[k] = 1;
    groupId[k] = g;
  });
  groupShapes[g].push({ kind: 'polygon', points: points.slice() });
  return g;
}

export function getGroupAt(x: number, y: number): number {
  const i = Math.floor(x), j = Math.floor(y);
  if (i < 0 || i >= NX || j < 0 || j >= NY) return 0;
  return groupId[idx(i, j)];
}

// Combined AABB of all sub-shapes in the group, in continuous (float) coords.
// Used by input.ts to clamp drag deltas so the group stays on-grid.
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

// Rasterize one shape's cells into (mask, groupId) for the given group.
// Used by translateGroup; bypasses the addX path so we don't re-allocate or
// inherit-from-overlap.
function rasterizeShapeIntoGroup(s: ConductorShape, g: number): void {
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
          mask[k] = 1;
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
          mask[k] = 1;
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
        mask[k] = 1;
        groupId[k] = g;
      }
    }
  } else {
    rasterizePolygon(s.points, NX, NY, (i, j) => {
      const k = idx(i, j);
      mask[k] = 1;
      groupId[k] = g;
    });
  }
}

// Translate the entire group by (dx, dy). Shifts each sub-shape's stored
// coordinates, clears the group's old cells, and re-rasterizes at the new
// positions. Cells previously stolen by other groups are NOT restored — the
// vacated cells return to vacuum, the new footprint overwrites whatever was
// there. This is the accepted trade-off for cheap drag-translation.
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
  // Clear all cells currently belonging to g, then rasterize at new positions.
  for (let k = 0; k < N_CELLS; k++) {
    if (groupId[k] === g) {
      mask[k] = 0;
      groupId[k] = 0;
    }
  }
  for (const s of shapes) rasterizeShapeIntoGroup(s, g);
  return true;
}

export function toggleGrounded(g: number): void {
  if (g <= 0 || g >= MAX_GROUPS || !groupInUse[g]) return;
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
