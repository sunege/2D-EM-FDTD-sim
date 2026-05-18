import { PIXEL_SCALE } from '../config';
import {
  MAX_PROBES, BUF_LEN, isUsed, getX, getY, getHead,
  bufExFor, bufEyFor, bufBzFor,
} from '../sim/probe';
import { ctx as mainCtx } from './canvas';

// Probe rendering: pins on the main canvas + a separate chart panel canvas
// (DOM element #probeChart). Chart is hidden until ≥1 probe exists.

const PROBE_COLORS = [
  '#e84a4a', // P1 red
  '#3a9cee', // P2 blue
  '#3ec46c', // P3 green
  '#e8a23a', // P4 orange
];

const chartCanvas = document.getElementById('probeChart') as HTMLCanvasElement;
const chartCtx = chartCanvas.getContext('2d') as CanvasRenderingContext2D;

export function drawPins(): void {
  for (let p = 0; p < MAX_PROBES; p++) {
    if (!isUsed(p)) continue;
    const cx = (getX(p) + 0.5) * PIXEL_SCALE;
    const cy = (getY(p) + 0.5) * PIXEL_SCALE;
    const color = PROBE_COLORS[p];

    mainCtx.save();
    // Outer ring (white) for contrast on any background
    mainCtx.beginPath();
    mainCtx.arc(cx, cy, 7, 0, Math.PI * 2);
    mainCtx.strokeStyle = 'rgba(255,255,255,0.9)';
    mainCtx.lineWidth = 2.5;
    mainCtx.stroke();
    // Inner filled disk
    mainCtx.beginPath();
    mainCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    mainCtx.fillStyle = color;
    mainCtx.fill();
    // Cross-hair lines
    mainCtx.strokeStyle = 'rgba(0,0,0,0.85)';
    mainCtx.lineWidth = 1;
    mainCtx.beginPath();
    mainCtx.moveTo(cx - 9, cy); mainCtx.lineTo(cx + 9, cy);
    mainCtx.moveTo(cx, cy - 9); mainCtx.lineTo(cx, cy + 9);
    mainCtx.stroke();
    // Label
    mainCtx.fillStyle = '#fff';
    mainCtx.strokeStyle = 'rgba(0,0,0,0.85)';
    mainCtx.lineWidth = 3;
    mainCtx.font = 'bold 11px system-ui, sans-serif';
    mainCtx.textAlign = 'left';
    mainCtx.textBaseline = 'top';
    const label = `P${p + 1}`;
    mainCtx.strokeText(label, cx + 8, cy + 6);
    mainCtx.fillText(label, cx + 8, cy + 6);
    mainCtx.restore();
  }
}

export function showChartIfNeeded(): void {
  let any = false;
  for (let p = 0; p < MAX_PROBES; p++) if (isUsed(p)) { any = true; break; }
  chartCanvas.style.display = any ? 'block' : 'none';
}

export function drawChart(): void {
  showChartIfNeeded();
  if (chartCanvas.style.display === 'none') return;

  const W = chartCanvas.width;
  const H = chartCanvas.height;
  const PAD_L = 36, PAD_R = 8, PAD_T = 6, PAD_B = 6;
  const ROW_H = (H - PAD_T - PAD_B) / MAX_PROBES;
  const plotW = W - PAD_L - PAD_R;
  const head = getHead();

  // Background
  chartCtx.fillStyle = '#181822';
  chartCtx.fillRect(0, 0, W, H);

  for (let p = 0; p < MAX_PROBES; p++) {
    const yTop = PAD_T + p * ROW_H;
    const yMid = yTop + ROW_H * 0.5;
    const yBot = yTop + ROW_H - 2;

    // Row separator
    chartCtx.strokeStyle = 'rgba(255,255,255,0.05)';
    chartCtx.lineWidth = 1;
    chartCtx.beginPath();
    chartCtx.moveTo(0, yTop);
    chartCtx.lineTo(W, yTop);
    chartCtx.stroke();

    // Zero line
    chartCtx.strokeStyle = 'rgba(255,255,255,0.18)';
    chartCtx.beginPath();
    chartCtx.moveTo(PAD_L, yMid);
    chartCtx.lineTo(PAD_L + plotW, yMid);
    chartCtx.stroke();

    if (!isUsed(p)) {
      chartCtx.fillStyle = 'rgba(255,255,255,0.25)';
      chartCtx.font = '11px system-ui, sans-serif';
      chartCtx.textAlign = 'left';
      chartCtx.textBaseline = 'middle';
      chartCtx.fillText(`P${p + 1} (未配置)`, 4, yMid);
      continue;
    }

    const ex = bufExFor(p);
    const ey = bufEyFor(p);
    const bz = bufBzFor(p);

    // |E|(t): √(Ex² + Ey²). Bz(t) plotted directly with sign.
    // Auto-scale per row across the visible buffer.
    let maxAbsE = 1e-6;
    let maxAbsB = 1e-6;
    for (let n = 0; n < BUF_LEN; n++) {
      const e = Math.hypot(ex[n], ey[n]);
      if (e > maxAbsE) maxAbsE = e;
      const b = Math.abs(bz[n]);
      if (b > maxAbsB) maxAbsB = b;
    }
    const halfH = (ROW_H - 4) * 0.5;

    // Probe color label
    chartCtx.fillStyle = PROBE_COLORS[p];
    chartCtx.font = 'bold 11px system-ui, sans-serif';
    chartCtx.textAlign = 'left';
    chartCtx.textBaseline = 'top';
    chartCtx.fillText(`P${p + 1}`, 4, yTop + 2);
    chartCtx.fillStyle = 'rgba(180,255,180,0.85)';
    chartCtx.font = '10px system-ui, sans-serif';
    chartCtx.fillText(`|E|<${maxAbsE.toExponential(1)}`, 4, yTop + 16);
    chartCtx.fillStyle = 'rgba(220,180,255,0.85)';
    chartCtx.fillText(`Bz<${maxAbsB.toExponential(1)}`, 4, yTop + 28);

    // |E| trace (green, positive only — values are magnitudes)
    chartCtx.strokeStyle = 'rgba(120,230,140,0.95)';
    chartCtx.lineWidth = 1.2;
    chartCtx.beginPath();
    for (let n = 0; n < BUF_LEN; n++) {
      const idxBuf = (head + n) % BUF_LEN;
      const x = PAD_L + (n / (BUF_LEN - 1)) * plotW;
      const mag = Math.hypot(ex[idxBuf], ey[idxBuf]) / maxAbsE;
      const y = yMid - mag * halfH;
      if (n === 0) chartCtx.moveTo(x, y);
      else chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();

    // Bz trace (purple, bipolar)
    chartCtx.strokeStyle = 'rgba(200,150,250,0.95)';
    chartCtx.beginPath();
    for (let n = 0; n < BUF_LEN; n++) {
      const idxBuf = (head + n) % BUF_LEN;
      const x = PAD_L + (n / (BUF_LEN - 1)) * plotW;
      const v = bz[idxBuf] / maxAbsB;
      const y = yMid - v * halfH;
      if (n === 0) chartCtx.moveTo(x, y);
      else chartCtx.lineTo(x, y);
    }
    chartCtx.stroke();

    // Position label
    chartCtx.fillStyle = 'rgba(255,255,255,0.35)';
    chartCtx.font = '10px system-ui, sans-serif';
    chartCtx.textAlign = 'right';
    chartCtx.textBaseline = 'bottom';
    chartCtx.fillText(`(${getX(p)},${getY(p)})`, W - 4, yBot);
  }
}
