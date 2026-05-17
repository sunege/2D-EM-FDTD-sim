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
}

export function drawPreview(): void {
  if (!placement.active || placement.material !== 'body') return;
  const ax = placement.anchor.x * PIXEL_SCALE;
  const ay = placement.anchor.y * PIXEL_SCALE;
  const bx = placement.current.x * PIXEL_SCALE;
  const by = placement.current.y * PIXEL_SCALE;

  const positive = placement.charge >= 0;
  const stroke = positive ? 'rgba(180,30,30,0.9)' : 'rgba(30,40,180,0.9)';
  const fill = positive ? 'rgba(220,60,60,0.30)' : 'rgba(60,90,220,0.30)';

  ctx.save();
  ctx.strokeStyle = stroke;
  ctx.fillStyle = fill;
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);

  if (placement.shape === 'disk') {
    const r = Math.hypot(bx - ax, by - ay);
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (placement.shape === 'annulus') {
    const rOuter = Math.hypot(bx - ax, by - ay);
    const rInner = rOuter * 0.5;
    ctx.beginPath();
    ctx.arc(ax, ay, rOuter, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax, ay, rInner, 0, Math.PI * 2);
    ctx.stroke();
  } else if (placement.shape === 'rect') {
    const x0 = Math.min(ax, bx);
    const y0 = Math.min(ay, by);
    const w = Math.abs(bx - ax);
    const h = Math.abs(by - ay);
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeRect(x0, y0, w, h);
  }

  ctx.restore();
}
