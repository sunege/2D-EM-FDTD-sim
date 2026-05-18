import { NX, NY, CANVAS_W, CANVAS_H, PIXEL_SCALE } from '../config';
import {
  MAX_GROUPS, isInUse, getShape, getCx, getCy, getParam1, getParam2, getQ,
  SHAPE_DISK, SHAPE_ANNULUS, SHAPE_RECT,
} from '../sim/chargedBody';
import { idx } from '../sim/grid';
import { ctx } from './canvas';
import { placement } from '../ui/input';

const overlay = document.createElement('canvas');
overlay.width = NX;
overlay.height = NY;
const overlayCtx = overlay.getContext('2d') as CanvasRenderingContext2D;
const overlayData = overlayCtx.createImageData(NX, NY);

// Separate ImageData for the placement preview — rasterized with the same
// cell-center rule as `draw()` so the preview matches the post-release fill
// exactly (no aliasing between a continuous arc and the discrete cell mask).
const previewOverlay = document.createElement('canvas');
previewOverlay.width = NX;
previewOverlay.height = NY;
const previewCtx = previewOverlay.getContext('2d') as CanvasRenderingContext2D;
const previewData = previewCtx.createImageData(NX, NY);

// Visual scaling: per-cell ρ above this magnitude saturates the overlay alpha.
const RHO_SATURATE = 0.5;

export function draw(): void {
  const data = overlayData.data;
  // Clear alpha each frame (bodies move, so static caching doesn't help).
  for (let k = 0, p = 3; k < NX * NY; k++, p += 4) data[p] = 0;

  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!isInUse(g)) continue;
    const s = getShape(g);
    const cx = getCx(g), cy = getCy(g);
    const p1 = getParam1(g), p2 = getParam2(g);
    const p1sq = p1 * p1, p2sq = p2 * p2;
    const Q = getQ(g);

    let i0 = 0, i1 = 0, j0 = 0, j1 = 0;
    if (s === SHAPE_DISK || s === SHAPE_ANNULUS) {
      i0 = Math.max(0, Math.floor(cx - p1));
      i1 = Math.min(NX - 1, Math.ceil(cx + p1));
      j0 = Math.max(0, Math.floor(cy - p1));
      j1 = Math.min(NY - 1, Math.ceil(cy + p1));
    } else if (s === SHAPE_RECT) {
      i0 = Math.max(0, Math.floor(cx - p1));
      i1 = Math.min(NX - 1, Math.ceil(cx + p1));
      j0 = Math.max(0, Math.floor(cy - p2));
      j1 = Math.min(NY - 1, Math.ceil(cy + p2));
    } else continue;

    // First pass: count cells (must match deposit's exclusion rule, but for
    // rendering we don't bother excluding conductor cells — the conductor
    // overlay draws on top so they look correct anyway).
    let count = 0;
    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        let hit = false;
        if (s === SHAPE_DISK) hit = dx * dx + dy * dy <= p1sq;
        else if (s === SHAPE_ANNULUS) {
          const d2 = dx * dx + dy * dy;
          hit = d2 <= p1sq && d2 >= p2sq;
        } else hit = Math.abs(dx) <= p1 && Math.abs(dy) <= p2;
        if (hit) count++;
      }
    }
    if (count === 0) continue;

    const rhoMag = Math.abs(Q) / count;
    const t = Math.min(1, rhoMag / RHO_SATURATE);
    const alpha = Math.round(60 + 160 * t);
    const r = Q >= 0 ? 220 : 60;
    const gC = Q >= 0 ? 60 : 90;
    const b = Q >= 0 ? 60 : 220;

    for (let j = j0; j <= j1; j++) {
      const dy = j + 0.5 - cy;
      for (let i = i0; i <= i1; i++) {
        const dx = i + 0.5 - cx;
        let hit = false;
        if (s === SHAPE_DISK) hit = dx * dx + dy * dy <= p1sq;
        else if (s === SHAPE_ANNULUS) {
          const d2 = dx * dx + dy * dy;
          hit = d2 <= p1sq && d2 >= p2sq;
        } else hit = Math.abs(dx) <= p1 && Math.abs(dy) <= p2;
        if (!hit) continue;
        const p = idx(i, j) * 4;
        data[p] = r;
        data[p + 1] = gC;
        data[p + 2] = b;
        data[p + 3] = alpha;
      }
    }
  }

  overlayCtx.putImageData(overlayData, 0, 0);
  ctx.drawImage(overlay, 0, 0, CANVAS_W, CANVAS_H);

  // 1px border: draw edge segments on the main canvas at cell boundaries
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (data[k * 4 + 3] === 0) continue;
      const x0 = i * PIXEL_SCALE, x1 = x0 + PIXEL_SCALE;
      const y0 = j * PIXEL_SCALE, y1 = y0 + PIXEL_SCALE;
      if (j === 0 || data[(k - NX) * 4 + 3] === 0)       { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
      if (j === NY - 1 || data[(k + NX) * 4 + 3] === 0)  { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      if (i === 0 || data[(k - 1) * 4 + 3] === 0)        { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
      if (i === NX - 1 || data[(k + 1) * 4 + 3] === 0)   { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    }
  }
  ctx.stroke();
  ctx.restore();
}

export function drawPreview(): void {
  if (!placement.active || placement.material !== 'body') return;

  // Rasterize the would-be body with the SAME logic the renderer/depositor uses
  // (cell-center inside the continuous shape). This avoids the aliasing between
  // a smooth dashed outline at the click coords and the cell mask that actually
  // gets placed — the user reported these diverging by up to ~½ cell.
  const ax = placement.anchor.x, ay = placement.anchor.y;
  const bx = placement.current.x, by = placement.current.y;
  const Q = placement.charge;

  let shapeKind = 0;
  let cx = 0, cy = 0, p1 = 0, p2 = 0;
  if (placement.shape === 'disk') {
    const r = Math.hypot(bx - ax, by - ay);
    if (r < 0.5) return;
    cx = ax; cy = ay; p1 = r;
    shapeKind = SHAPE_DISK;
  } else if (placement.shape === 'annulus') {
    const rOuter = Math.hypot(bx - ax, by - ay);
    if (rOuter < 1) return;
    cx = ax; cy = ay; p1 = rOuter; p2 = rOuter * 0.5;
    shapeKind = SHAPE_ANNULUS;
  } else {
    if (Math.abs(bx - ax) < 0.5 || Math.abs(by - ay) < 0.5) return;
    p1 = Math.abs(bx - ax) * 0.5;
    p2 = Math.abs(by - ay) * 0.5;
    cx = (ax + bx) * 0.5;
    cy = (ay + by) * 0.5;
    shapeKind = SHAPE_RECT;
  }

  const p1sq = p1 * p1, p2sq = p2 * p2;
  let i0: number, i1: number, j0: number, j1: number;
  if (shapeKind === SHAPE_RECT) {
    i0 = Math.max(0, Math.floor(cx - p1));
    i1 = Math.min(NX - 1, Math.ceil(cx + p1));
    j0 = Math.max(0, Math.floor(cy - p2));
    j1 = Math.min(NY - 1, Math.ceil(cy + p2));
  } else {
    i0 = Math.max(0, Math.floor(cx - p1));
    i1 = Math.min(NX - 1, Math.ceil(cx + p1));
    j0 = Math.max(0, Math.floor(cy - p1));
    j1 = Math.min(NY - 1, Math.ceil(cy + p1));
  }

  let count = 0;
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      let hit = false;
      if (shapeKind === SHAPE_DISK) hit = dx * dx + dy * dy <= p1sq;
      else if (shapeKind === SHAPE_ANNULUS) {
        const d2 = dx * dx + dy * dy;
        hit = d2 <= p1sq && d2 >= p2sq;
      } else hit = Math.abs(dx) <= p1 && Math.abs(dy) <= p2;
      if (hit) count++;
    }
  }
  if (count === 0) return;

  const positive = Q >= 0;
  const r = positive ? 220 : 60;
  const gC = positive ? 60 : 90;
  const b = positive ? 60 : 220;
  const rhoMag = Math.abs(Q) / count;
  const t = Math.min(1, rhoMag / RHO_SATURATE);
  // Preview alpha is ~70% of the placed fill so users can tell it's a preview
  // (still semi-transparent on release, but a visible step up to "committed").
  const alpha = Math.round((60 + 160 * t) * 0.7);

  const data = previewData.data;
  for (let k = 0, p = 3; k < NX * NY; k++, p += 4) data[p] = 0;

  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      let hit = false;
      if (shapeKind === SHAPE_DISK) hit = dx * dx + dy * dy <= p1sq;
      else if (shapeKind === SHAPE_ANNULUS) {
        const d2 = dx * dx + dy * dy;
        hit = d2 <= p1sq && d2 >= p2sq;
      } else hit = Math.abs(dx) <= p1 && Math.abs(dy) <= p2;
      if (!hit) continue;
      const p = idx(i, j) * 4;
      data[p] = r;
      data[p + 1] = gC;
      data[p + 2] = b;
      data[p + 3] = alpha;
    }
  }

  previewCtx.putImageData(previewData, 0, 0);
  ctx.drawImage(previewOverlay, 0, 0, CANVAS_W, CANVAS_H);

  // Thin dashed outline along the rasterized region's boundary cells. This
  // keeps the "preview" feel of a dashed marker but follows the actual cell
  // boundaries instead of a smooth shape that would mislead the user.
  const stroke = positive ? 'rgba(180,30,30,0.9)' : 'rgba(30,40,180,0.9)';
  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 3]);
  ctx.beginPath();
  // Walk the bbox; for each filled cell emit edges that face an unfilled cell.
  for (let j = j0; j <= j1; j++) {
    const dy = j + 0.5 - cy;
    for (let i = i0; i <= i1; i++) {
      const dx = i + 0.5 - cx;
      let hit = false;
      if (shapeKind === SHAPE_DISK) hit = dx * dx + dy * dy <= p1sq;
      else if (shapeKind === SHAPE_ANNULUS) {
        const d2 = dx * dx + dy * dy;
        hit = d2 <= p1sq && d2 >= p2sq;
      } else hit = Math.abs(dx) <= p1 && Math.abs(dy) <= p2;
      if (!hit) continue;

      const cellHit = (ii: number, jj: number): boolean => {
        if (ii < 0 || ii >= NX || jj < 0 || jj >= NY) return false;
        const ddx = ii + 0.5 - cx;
        const ddy = jj + 0.5 - cy;
        if (shapeKind === SHAPE_DISK) return ddx * ddx + ddy * ddy <= p1sq;
        if (shapeKind === SHAPE_ANNULUS) {
          const d2 = ddx * ddx + ddy * ddy;
          return d2 <= p1sq && d2 >= p2sq;
        }
        return Math.abs(ddx) <= p1 && Math.abs(ddy) <= p2;
      };

      const x0 = i * PIXEL_SCALE, x1 = (i + 1) * PIXEL_SCALE;
      const y0 = j * PIXEL_SCALE, y1 = (j + 1) * PIXEL_SCALE;
      if (!cellHit(i, j - 1)) { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
      if (!cellHit(i, j + 1)) { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      if (!cellHit(i - 1, j)) { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
      if (!cellHit(i + 1, j)) { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    }
  }
  ctx.stroke();
  ctx.restore();
}
