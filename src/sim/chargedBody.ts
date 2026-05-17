import { NX, NY, DT, VMAX, K_DRAG, K_DAMP } from '../config';
import { idx } from './grid';
import { rho, Jx, Jy } from './deposition';
import { mask as condMask } from './conductors';

// "Charged bodies" are shape-placed, finite-extent charge distributions that
// can be dragged like particles. Their total charge Q is fixed at creation;
// per-cell ρ = Q / N_cells_actually_deposited (cells inside a conductor are
// excluded — conductors absorb them, per spec).
//
// Bodies are stored per-group (no per-cell mask) because they translate every
// frame. Hit testing uses shape math directly. Each frame:
//   step()    — drag-driven motion (mirrors godhand for particles)
//   deposit() — rasterize current pose into rho/Jx/Jy (added to deposition.ts)

export const MAX_GROUPS = 64;

const enum Shape { None = 0, Disk = 1, Annulus = 2, Rect = 3 }

const inUse = new Uint8Array(MAX_GROUPS);
const shape = new Uint8Array(MAX_GROUPS);
// param1: disk=r, annulus=rOuter, rect=halfW
// param2: disk=unused, annulus=rInner, rect=halfH
const param1 = new Float32Array(MAX_GROUPS);
const param2 = new Float32Array(MAX_GROUPS);
const cxArr = new Float32Array(MAX_GROUPS);
const cyArr = new Float32Array(MAX_GROUPS);
const vxArr = new Float32Array(MAX_GROUPS);
const vyArr = new Float32Array(MAX_GROUPS);
const qArr = new Float32Array(MAX_GROUPS);

export const drag = { groupId: 0, targetX: 0, targetY: 0 };

function allocGroup(): number {
  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!inUse[g]) {
      inUse[g] = 1;
      return g;
    }
  }
  return 0;
}

export function clear(): void {
  inUse.fill(0);
  shape.fill(0);
  param1.fill(0);
  param2.fill(0);
  cxArr.fill(0);
  cyArr.fill(0);
  vxArr.fill(0);
  vyArr.fill(0);
  qArr.fill(0);
  drag.groupId = 0;
}

export function removeGroup(g: number): void {
  if (g <= 0 || g >= MAX_GROUPS || !inUse[g]) return;
  inUse[g] = 0;
  shape[g] = 0;
  qArr[g] = 0;
  vxArr[g] = 0;
  vyArr[g] = 0;
  if (drag.groupId === g) drag.groupId = 0;
}

export function addDisk(cx: number, cy: number, r: number, totalQ: number): number {
  const g = allocGroup();
  if (g === 0) return 0;
  shape[g] = Shape.Disk;
  param1[g] = r;
  param2[g] = 0;
  cxArr[g] = cx;
  cyArr[g] = cy;
  vxArr[g] = 0;
  vyArr[g] = 0;
  qArr[g] = totalQ;
  return g;
}

export function addAnnulus(cx: number, cy: number, rOuter: number, rInner: number, totalQ: number): number {
  const g = allocGroup();
  if (g === 0) return 0;
  shape[g] = Shape.Annulus;
  param1[g] = rOuter;
  param2[g] = rInner;
  cxArr[g] = cx;
  cyArr[g] = cy;
  vxArr[g] = 0;
  vyArr[g] = 0;
  qArr[g] = totalQ;
  return g;
}

export function addRect(x1: number, y1: number, x2: number, y2: number, totalQ: number): number {
  const g = allocGroup();
  if (g === 0) return 0;
  shape[g] = Shape.Rect;
  param1[g] = Math.abs(x2 - x1) * 0.5;
  param2[g] = Math.abs(y2 - y1) * 0.5;
  cxArr[g] = (x1 + x2) * 0.5;
  cyArr[g] = (y1 + y2) * 0.5;
  vxArr[g] = 0;
  vyArr[g] = 0;
  qArr[g] = totalQ;
  return g;
}

function bboxRadius(g: number): number {
  switch (shape[g]) {
    case Shape.Disk:
    case Shape.Annulus:
      return param1[g];
    case Shape.Rect:
      return Math.max(param1[g], param2[g]);
    default:
      return 0;
  }
}

function pointInside(g: number, x: number, y: number): boolean {
  const dx = x - cxArr[g], dy = y - cyArr[g];
  switch (shape[g]) {
    case Shape.Disk:
      return dx * dx + dy * dy <= param1[g] * param1[g];
    case Shape.Annulus: {
      const d2 = dx * dx + dy * dy;
      const ro = param1[g], ri = param2[g];
      return d2 <= ro * ro && d2 >= ri * ri;
    }
    case Shape.Rect:
      return Math.abs(dx) <= param1[g] && Math.abs(dy) <= param2[g];
    default:
      return false;
  }
}

export function getGroupAt(x: number, y: number): number {
  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!inUse[g]) continue;
    if (pointInside(g, x, y)) return g;
  }
  return 0;
}

export function isInUse(g: number): boolean {
  return g > 0 && g < MAX_GROUPS && inUse[g] === 1;
}

export function startDrag(g: number, tx: number, ty: number): void {
  drag.groupId = g;
  drag.targetX = tx;
  drag.targetY = ty;
}

export function updateTarget(tx: number, ty: number): void {
  drag.targetX = tx;
  drag.targetY = ty;
}

export function endDrag(): void {
  drag.groupId = 0;
}

export function step(): void {
  // Only the currently-dragged body gets a driving force + damping; others
  // coast inertially (mirrors particles in godhand.ts).
  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!inUse[g]) continue;
    let ax = 0, ay = 0;
    if (drag.groupId === g) {
      ax = K_DRAG * (drag.targetX - cxArr[g]) - K_DAMP * vxArr[g];
      ay = K_DRAG * (drag.targetY - cyArr[g]) - K_DAMP * vyArr[g];
    }
    vxArr[g] += ax * DT;
    vyArr[g] += ay * DT;
    const s2 = vxArr[g] * vxArr[g] + vyArr[g] * vyArr[g];
    if (s2 > VMAX * VMAX) {
      const s = Math.sqrt(s2);
      const k = VMAX / s;
      vxArr[g] *= k;
      vyArr[g] *= k;
    }
    cxArr[g] += vxArr[g] * DT;
    cyArr[g] += vyArr[g] * DT;

    // Keep the bounding box of the body on-grid (with 1-cell padding so the
    // boundary cells stay free for Mur ABC).
    const m = bboxRadius(g) + 1;
    const loX = m, hiX = NX - 1 - m;
    const loY = m, hiY = NY - 1 - m;
    if (cxArr[g] < loX) { cxArr[g] = loX; vxArr[g] = 0; }
    if (cxArr[g] > hiX) { cxArr[g] = hiX; vxArr[g] = 0; }
    if (cyArr[g] < loY) { cyArr[g] = loY; vyArr[g] = 0; }
    if (cyArr[g] > hiY) { cyArr[g] = hiY; vyArr[g] = 0; }
  }
}

export function deposit(): void {
  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!inUse[g]) continue;
    const cx = cxArr[g], cy = cyArr[g];
    const Q = qArr[g];
    const vxg = vxArr[g], vyg = vyArr[g];
    const s = shape[g];

    let i0 = 0, i1 = 0, j0 = 0, j1 = 0;
    if (s === Shape.Disk || s === Shape.Annulus) {
      const r = param1[g];
      i0 = Math.max(0, Math.floor(cx - r));
      i1 = Math.min(NX - 1, Math.ceil(cx + r));
      j0 = Math.max(0, Math.floor(cy - r));
      j1 = Math.min(NY - 1, Math.ceil(cy + r));
    } else if (s === Shape.Rect) {
      const hw = param1[g], hh = param2[g];
      i0 = Math.max(0, Math.floor(cx - hw));
      i1 = Math.min(NX - 1, Math.ceil(cx + hw));
      j0 = Math.max(0, Math.floor(cy - hh));
      j1 = Math.min(NY - 1, Math.ceil(cy + hh));
    } else {
      continue;
    }

    const p1 = param1[g], p2 = param2[g];
    const p1sq = p1 * p1, p2sq = p2 * p2;

    // First pass: count cells that this body actually owns (excluding cells
    // inside a conductor — the conductor's Dirichlet boundary absorbs the
    // charge, so we don't deposit there).
    let count = 0;
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        let hit = false;
        if (s === Shape.Disk) hit = dx * dx + dy * dy <= p1sq;
        else if (s === Shape.Annulus) {
          const d2 = dx * dx + dy * dy;
          hit = d2 <= p1sq && d2 >= p2sq;
        } else hit = Math.abs(dx) <= p1 && Math.abs(dy) <= p2;
        if (hit && !condMask[idx(i, j)]) count++;
      }
    }
    if (count === 0) continue;

    const rhoCell = Q / count;
    const jxCell = rhoCell * vxg;
    const jyCell = rhoCell * vyg;

    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        let hit = false;
        if (s === Shape.Disk) hit = dx * dx + dy * dy <= p1sq;
        else if (s === Shape.Annulus) {
          const d2 = dx * dx + dy * dy;
          hit = d2 <= p1sq && d2 >= p2sq;
        } else hit = Math.abs(dx) <= p1 && Math.abs(dy) <= p2;
        if (!hit) continue;
        const k = idx(i, j);
        if (condMask[k]) continue;
        rho[k] += rhoCell;
        Jx[k] += jxCell;
        Jy[k] += jyCell;
      }
    }
  }
}

// Read-only accessors for renderer.
export function getShape(g: number): number { return shape[g]; }
export function getCx(g: number): number { return cxArr[g]; }
export function getCy(g: number): number { return cyArr[g]; }
export function getParam1(g: number): number { return param1[g]; }
export function getParam2(g: number): number { return param2[g]; }
export function getQ(g: number): number { return qArr[g]; }
export const SHAPE_DISK = Shape.Disk;
export const SHAPE_ANNULUS = Shape.Annulus;
export const SHAPE_RECT = Shape.Rect;
