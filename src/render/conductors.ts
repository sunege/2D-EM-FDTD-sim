import { NX, NY, CANVAS_W, CANVAS_H, PIXEL_SCALE, SIGMA_CONDUCTOR_MIN, SIGMA_CONDUCTOR_MAX } from '../config';
import { mask, groupId, groupGrounded, groupVoltage, getSigma, MAX_GROUPS } from '../sim/conductors';
import { ctx } from './canvas';
import { placement } from '../ui/input';
import { getZoom } from './viewport';

const overlay = document.createElement('canvas');
overlay.width = NX;
overlay.height = NY;
const overlayCtx = overlay.getContext('2d') as CanvasRenderingContext2D;
const overlayData = overlayCtx.createImageData(NX, NY);

const LOG_SIGMA_MIN = Math.log(SIGMA_CONDUCTOR_MIN);
const LOG_SIGMA_SPAN = Math.log(SIGMA_CONDUCTOR_MAX) - LOG_SIGMA_MIN;

// Color encodes σ on a log scale: low σ → warm brown, high σ → cool gray.
function sigmaColor(sigma: number): [number, number, number] {
  const t = (Math.log(sigma) - LOG_SIGMA_MIN) / LOG_SIGMA_SPAN;
  const tc = Math.max(0, Math.min(1, t));
  const r = 180 + tc * (95 - 180);
  const g = 130 + tc * (100 - 130);
  const b = 75 + tc * (110 - 75);
  return [r, g, b];
}

// Scratch buffers for per-group position accumulation.
const sumXBuf = new Float32Array(MAX_GROUPS);
const maxJBuf = new Int32Array(MAX_GROUPS);
const countBuf = new Int32Array(MAX_GROUPS);

export function draw(): void {
  const [cr, cg, cb] = sigmaColor(getSigma());
  const data = overlayData.data;
  for (let k = 0; k < NX * NY; k++) {
    const p = k * 4;
    if (mask[k]) {
      data[p] = cr;
      data[p + 1] = cg;
      data[p + 2] = cb;
      data[p + 3] = 215;
    } else {
      data[p + 3] = 0;
    }
  }
  overlayCtx.putImageData(overlayData, 0, 0);
  ctx.drawImage(overlay, 0, 0, CANVAS_W, CANVAS_H);

  // 1px border: draw edge segments on the main canvas at cell boundaries
  ctx.save();
  ctx.strokeStyle = 'rgba(0,0,0,0.28)';
  ctx.lineWidth = 1 / getZoom();
  ctx.beginPath();
  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      if (!mask[k]) continue;
      const x0 = i * PIXEL_SCALE, x1 = x0 + PIXEL_SCALE;
      const y0 = j * PIXEL_SCALE, y1 = y0 + PIXEL_SCALE;
      if (j === 0 || !mask[k - NX])       { ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); }
      if (j === NY - 1 || !mask[k + NX])  { ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); }
      if (i === 0 || !mask[k - 1])        { ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); }
      if (i === NX - 1 || !mask[k + 1])   { ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); }
    }
  }
  ctx.stroke();
  ctx.restore();

  drawGroundSymbols();
}

function drawGroundSymbols(): void {
  sumXBuf.fill(0);
  maxJBuf.fill(-1);
  countBuf.fill(0);

  for (let j = 0; j < NY; j++) {
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i;
      const g = groupId[k];
      if (g > 0 && groupGrounded[g]) {
        sumXBuf[g] += i;
        if (j > maxJBuf[g]) maxJBuf[g] = j;
        countBuf[g] += 1;
      }
    }
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(15,15,25,0.95)';
  ctx.lineCap = 'round';

  for (let g = 1; g < MAX_GROUPS; g++) {
    if (!groupGrounded[g] || countBuf[g] === 0) continue;
    const cxGrid = sumXBuf[g] / countBuf[g] + 0.5;
    // Place symbol near the top of the bottom row.
    const cyGrid = maxJBuf[g];
    // Symbol size is half of previous: √count * 0.2, clamped to [1.0, 2.25].
    const sizeGrid = Math.max(1.0, Math.min(2.25, Math.sqrt(countBuf[g]) * 0.2));
    const cx = cxGrid * PIXEL_SCALE, cy = cyGrid * PIXEL_SCALE;
    const s = sizeGrid * PIXEL_SCALE;
    const V = groupVoltage[g];
    if (Math.abs(V) < 0.01) {
      drawGroundSymbol(cx, cy, s);
    } else {
      drawVoltageLabel(cx, cy, s, V);
    }
  }

  ctx.restore();
}

// Earth ground (IEC 60417-5017): vertical stem + three horizontal bars of
// decreasing width.
function drawGroundSymbol(cx: number, cy: number, s: number): void {
  const stemLen = s * 0.55;
  const w1 = s;
  const w2 = s * 0.62;
  const w3 = s * 0.25;
  const lineGap = s * 0.22;
  const totalH = stemLen + 2 * lineGap;
  const topY = cy - totalH / 2;
  const stemBottomY = topY + stemLen;

  ctx.lineWidth = Math.max(1.4, s * 0.12);
  ctx.beginPath();
  ctx.moveTo(cx, topY);
  ctx.lineTo(cx, stemBottomY);
  ctx.moveTo(cx - w1, stemBottomY);
  ctx.lineTo(cx + w1, stemBottomY);
  ctx.moveTo(cx - w2, stemBottomY + lineGap);
  ctx.lineTo(cx + w2, stemBottomY + lineGap);
  ctx.moveTo(cx - w3, stemBottomY + 2 * lineGap);
  ctx.lineTo(cx + w3, stemBottomY + 2 * lineGap);
  ctx.stroke();
}

function drawVoltageLabel(cx: number, cy: number, s: number, V: number): void {
  const label = (V >= 0 ? '+' : '') + V.toFixed(1) + 'V';
  const fontSize = Math.max(8, s * 0.85);
  ctx.font = `bold ${fontSize}px monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(15,15,25,0.95)';
  ctx.fillText(label, cx, cy);
}

export function drawPreview(): void {
  if (!placement.active) return;
  if (placement.material !== 'conductor' && placement.material !== 'dielectric') return;
  const ax = placement.anchor.x * PIXEL_SCALE;
  const ay = placement.anchor.y * PIXEL_SCALE;
  const bx = placement.current.x * PIXEL_SCALE;
  const by = placement.current.y * PIXEL_SCALE;

  ctx.save();
  if (placement.material === 'dielectric') {
    ctx.strokeStyle = 'rgba(40,90,180,0.85)';
    ctx.fillStyle = 'rgba(60,130,230,0.20)';
  } else {
    const [r, g, b] = sigmaColor(getSigma());
    ctx.strokeStyle = `rgba(${(r * 0.5) | 0},${(g * 0.5) | 0},${(b * 0.5) | 0},0.85)`;
    ctx.fillStyle = `rgba(${r | 0},${g | 0},${b | 0},0.35)`;
  }
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
