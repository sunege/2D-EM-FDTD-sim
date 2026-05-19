import { PIXEL_SCALE } from '../config';
import {
  MAX_PROBES, BUF_LEN, isUsed, getX, getY, getHead,
  bufExFor, bufEyFor, bufBzFor, bufPhiFor,
} from '../sim/probe';
import { ctx as mainCtx } from './canvas';
import { requestRender } from '../ui/render-request';

const PROBE_COLORS = [
  '#e84a4a', // P1 red
  '#3a9cee', // P2 blue
  '#3ec46c', // P3 green
  '#e8a23a', // P4 orange
];

type TraceKey = 'E' | 'Bz' | 'S' | 'u' | 'phi';

interface TraceConfig {
  key: TraceKey;
  label: string;
  color: string;
  plotColor: string;
}

const TRACES: TraceConfig[] = [
  { key: 'E',  label: '|E|', color: 'rgba(120,230,140,1)',  plotColor: 'rgba(120,230,140,0.95)' },
  { key: 'Bz', label: 'Bz',  color: 'rgba(200,150,250,1)',  plotColor: 'rgba(200,150,250,0.95)' },
  { key: 'S',  label: '|S|', color: 'rgba(255,160,60,1)',   plotColor: 'rgba(255,160,60,0.95)'  },
  { key: 'u',  label: 'u',   color: 'rgba(255,100,100,1)', plotColor: 'rgba(255,100,100,0.95)' },
  { key: 'phi', label: 'V',  color: 'rgba(80,210,255,1)',  plotColor: 'rgba(80,210,255,0.95)'  },
];

const chartPanel = document.getElementById('chartPanel') as HTMLDivElement;

const chartSelected = new Set<number>();
const canvasMap = new Map<number, HTMLCanvasElement>();
const coordSpanMap = new Map<number, HTMLSpanElement>();
// Per-probe enabled trace sets; persists across rebuildPanel calls.
const traceEnabled = new Map<number, Set<TraceKey>>();

function getTraceSet(p: number): Set<TraceKey> {
  if (!traceEnabled.has(p)) {
    traceEnabled.set(p, new Set<TraceKey>(['E', 'Bz']));
  }
  return traceEnabled.get(p)!;
}

function rebuildPanel(): void {
  canvasMap.clear();
  coordSpanMap.clear();
  chartPanel.innerHTML = '';
  if (chartSelected.size === 0) {
    chartPanel.style.display = 'none';
    return;
  }
  chartPanel.style.display = 'block';
  for (const p of chartSelected) {
    const row = document.createElement('div');
    row.className = 'cp-row';

    const header = document.createElement('div');
    header.className = 'cp-header';

    const labelSpan = document.createElement('span');
    labelSpan.className = 'cp-label';
    labelSpan.style.color = PROBE_COLORS[p];
    labelSpan.textContent = `P${p + 1}`;

    const coordSpan = document.createElement('span');
    coordSpan.className = 'cp-coord';
    coordSpan.textContent = `(${getX(p)}, ${getY(p)})`;
    coordSpanMap.set(p, coordSpan);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'cp-close';
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', () => toggleChart(p));

    header.appendChild(labelSpan);
    header.appendChild(coordSpan);
    header.appendChild(closeBtn);

    // Trace toggle chips
    const chipsRow = document.createElement('div');
    chipsRow.className = 'cp-chips';
    const ts = getTraceSet(p);
    for (const tr of TRACES) {
      const chip = document.createElement('button');
      const active = ts.has(tr.key);
      chip.className = 'cp-chip' + (active ? ' active' : '');
      chip.textContent = tr.label;
      if (active) chip.style.color = tr.color;
      chip.addEventListener('click', () => {
        if (ts.has(tr.key)) {
          ts.delete(tr.key);
          chip.classList.remove('active');
          chip.style.color = '';
        } else {
          ts.add(tr.key);
          chip.classList.add('active');
          chip.style.color = tr.color;
        }
        requestRender();
      });
      chipsRow.appendChild(chip);
    }

    const cvs = document.createElement('canvas');
    cvs.className = 'cp-canvas';
    cvs.width = 240;
    cvs.height = 104;

    row.appendChild(header);
    row.appendChild(chipsRow);
    row.appendChild(cvs);
    chartPanel.appendChild(row);
    canvasMap.set(p, cvs);
  }
}

export function toggleChart(p: number): void {
  if (chartSelected.has(p)) {
    chartSelected.delete(p);
    traceEnabled.delete(p);
  } else {
    chartSelected.add(p);
  }
  rebuildPanel();
}

export function closeChartFor(p: number): void {
  if (chartSelected.has(p)) {
    chartSelected.delete(p);
    traceEnabled.delete(p);
    rebuildPanel();
  }
}

export function clearAllCharts(): void {
  chartSelected.clear();
  traceEnabled.clear();
  rebuildPanel();
}

export function drawPins(): void {
  for (let p = 0; p < MAX_PROBES; p++) {
    if (!isUsed(p)) continue;
    const cx = (getX(p) + 0.5) * PIXEL_SCALE;
    const cy = (getY(p) + 0.5) * PIXEL_SCALE;
    const color = PROBE_COLORS[p];
    const hasChart = chartSelected.has(p);

    mainCtx.save();
    mainCtx.beginPath();
    mainCtx.arc(cx, cy, 7, 0, Math.PI * 2);
    mainCtx.strokeStyle = hasChart ? color : 'rgba(255,255,255,0.9)';
    mainCtx.lineWidth = hasChart ? 3 : 2.5;
    mainCtx.stroke();
    mainCtx.beginPath();
    mainCtx.arc(cx, cy, 5, 0, Math.PI * 2);
    mainCtx.fillStyle = color;
    mainCtx.fill();
    mainCtx.strokeStyle = 'rgba(0,0,0,0.85)';
    mainCtx.lineWidth = 1;
    mainCtx.beginPath();
    mainCtx.moveTo(cx - 9, cy); mainCtx.lineTo(cx + 9, cy);
    mainCtx.moveTo(cx, cy - 9); mainCtx.lineTo(cx, cy + 9);
    mainCtx.stroke();
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

function drawProbeRow(ctx: CanvasRenderingContext2D, W: number, H: number, p: number): void {
  const LABEL_H = 24;
  const PAD_L = 4, PAD_R = 4;
  const plotW = W - PAD_L - PAD_R;
  const plotTop = LABEL_H;
  const plotH = H - LABEL_H;
  const yMid = plotTop + plotH / 2;
  const halfH = plotH * 0.42;
  const head = getHead();
  const ts = getTraceSet(p);

  // Label band
  ctx.fillStyle = '#111118';
  ctx.fillRect(0, 0, W, LABEL_H);
  // Plot area
  ctx.fillStyle = '#181822';
  ctx.fillRect(0, LABEL_H, W, plotH);

  // Separator between label band and plot
  ctx.strokeStyle = 'rgba(255,255,255,0.12)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, LABEL_H);
  ctx.lineTo(W, LABEL_H);
  ctx.stroke();

  // Zero line
  ctx.strokeStyle = 'rgba(255,255,255,0.15)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD_L, yMid);
  ctx.lineTo(PAD_L + plotW, yMid);
  ctx.stroke();

  const ex = bufExFor(p);
  const ey = bufEyFor(p);
  const bz = bufBzFor(p);
  const phi = bufPhiFor(p);

  // Find per-trace max for auto-scaling (all computed upfront for efficiency).
  let maxE = 1e-6, maxBz = 1e-6, maxS = 1e-6, maxU = 1e-6, maxPhi = 1e-6;
  for (let n = 0; n < BUF_LEN; n++) {
    const e2 = ex[n] * ex[n] + ey[n] * ey[n];
    const e = Math.sqrt(e2);
    const b = Math.abs(bz[n]);
    if (e > maxE) maxE = e;
    if (b > maxBz) maxBz = b;
    const s = e * b;
    if (s > maxS) maxS = s;
    const u = 0.5 * e2 + 0.5 * bz[n] * bz[n];
    if (u > maxU) maxU = u;
    const ap = Math.abs(phi[n]);
    if (ap > maxPhi) maxPhi = ap;
  }

  const drawTrace = (plotColor: string, getValue: (ib: number) => number, maxAbs: number) => {
    ctx.strokeStyle = plotColor;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let n = 0; n < BUF_LEN; n++) {
      const ib = (head + n) % BUF_LEN;
      const x = PAD_L + (n / (BUF_LEN - 1)) * plotW;
      const y = yMid - (getValue(ib) / maxAbs) * halfH;
      if (n === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  };

  if (ts.has('E'))   drawTrace(TRACES[0].plotColor, (ib) => Math.hypot(ex[ib], ey[ib]), maxE);
  if (ts.has('Bz'))  drawTrace(TRACES[1].plotColor, (ib) => bz[ib], maxBz);
  if (ts.has('S'))   drawTrace(TRACES[2].plotColor, (ib) => Math.hypot(ex[ib], ey[ib]) * Math.abs(bz[ib]), maxS);
  if (ts.has('u'))   drawTrace(TRACES[3].plotColor, (ib) => 0.5 * (ex[ib]*ex[ib] + ey[ib]*ey[ib]) + 0.5 * bz[ib]*bz[ib], maxU);
  if (ts.has('phi')) drawTrace(TRACES[4].plotColor, (ib) => phi[ib], maxPhi);

  // Scale labels in dedicated label band — 3-column layout
  ctx.font = '9px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const activeTraces: Array<{ label: string; max: number; plotColor: string }> = [];
  if (ts.has('E'))   activeTraces.push({ label: '|E|', max: maxE,   plotColor: TRACES[0].plotColor });
  if (ts.has('Bz'))  activeTraces.push({ label: 'Bz',  max: maxBz,  plotColor: TRACES[1].plotColor });
  if (ts.has('S'))   activeTraces.push({ label: '|S|', max: maxS,   plotColor: TRACES[2].plotColor });
  if (ts.has('u'))   activeTraces.push({ label: 'u',   max: maxU,   plotColor: TRACES[3].plotColor });
  if (ts.has('phi')) activeTraces.push({ label: 'V',   max: maxPhi, plotColor: TRACES[4].plotColor });
  for (let i = 0; i < activeTraces.length; i++) {
    const { label, max, plotColor } = activeTraces[i];
    ctx.fillStyle = plotColor.replace('0.95', '0.9');
    const lx = PAD_L + (i % 3) * 76;
    const ly = 3 + Math.floor(i / 3) * 11;
    ctx.fillText(`${label} ${max.toExponential(1)}`, lx, ly);
  }
}

export function drawChart(): void {
  if (chartSelected.size === 0) return;
  for (const p of chartSelected) {
    if (!isUsed(p)) continue;
    const span = coordSpanMap.get(p);
    if (span) span.textContent = `(${getX(p)}, ${getY(p)})`;
    const cvs = canvasMap.get(p);
    if (!cvs) continue;
    const ctx = cvs.getContext('2d') as CanvasRenderingContext2D;
    drawProbeRow(ctx, cvs.width, cvs.height, p);
  }
}
