import { NX, NY, CANVAS_W, CANVAS_H, PIXEL_SCALE } from '../config';
import { mask, groupId, groupGrounded } from '../sim/conductors';
import { ctx } from './canvas';
import { placement } from '../ui/input';

const overlay = document.createElement('canvas');
overlay.width = NX;
overlay.height = NY;
const overlayCtx = overlay.getContext('2d') as CanvasRenderingContext2D;
const overlayData = overlayCtx.createImageData(NX, NY);

export function draw(): void {
  const data = overlayData.data;
  for (let k = 0; k < NX * NY; k++) {
    const p = k * 4;
    if (mask[k]) {
      const g = groupId[k];
      if (groupGrounded[g]) {
        // grounded: cool blue-gray
        data[p] = 85;
        data[p + 1] = 100;
        data[p + 2] = 130;
        data[p + 3] = 215;
      } else {
        // floating: warm tan
        data[p] = 170;
        data[p + 1] = 130;
        data[p + 2] = 75;
        data[p + 3] = 215;
      }
    } else {
      data[p + 3] = 0;
    }
  }
  overlayCtx.putImageData(overlayData, 0, 0);
  ctx.drawImage(overlay, 0, 0, CANVAS_W, CANVAS_H);
}

export function drawPreview(): void {
  if (!placement.active) return;
  const ax = placement.anchor.x * PIXEL_SCALE;
  const ay = placement.anchor.y * PIXEL_SCALE;
  const bx = placement.current.x * PIXEL_SCALE;
  const by = placement.current.y * PIXEL_SCALE;

  ctx.save();
  ctx.strokeStyle = 'rgba(40,50,70,0.85)';
  ctx.fillStyle = 'rgba(90,95,105,0.30)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);

  if (placement.tool === 'disk') {
    const r = Math.hypot(bx - ax, by - ay);
    ctx.beginPath();
    ctx.arc(ax, ay, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else if (placement.tool === 'annulus') {
    const rOuter = Math.hypot(bx - ax, by - ay);
    const rInner = rOuter * 0.5;
    ctx.beginPath();
    ctx.arc(ax, ay, rOuter, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax, ay, rInner, 0, Math.PI * 2);
    ctx.stroke();
  } else if (placement.tool === 'rect') {
    const x0 = Math.min(ax, bx);
    const y0 = Math.min(ay, by);
    const w = Math.abs(bx - ax);
    const h = Math.abs(by - ay);
    ctx.fillRect(x0, y0, w, h);
    ctx.strokeRect(x0, y0, w, h);
  }

  ctx.restore();
}
