import { PIXEL_SCALE } from '../config';
import { ctx } from './canvas';
import { polyDraw } from '../ui/input';
import { getZoom } from './viewport';

// Visual cues:
// - placed edges & vertices: solid stroke + filled dots
// - live edge from V_{n-1} to cursor: dashed
// - color = material accent; red overlay when an intersection would result
// - first-vertex "close target": small open ring once ≥3 vertices exist

function materialColor(): string {
  switch (polyDraw.material) {
    case 'dielectric': return 'rgba(40,140,200,0.95)';
    case 'body':       return polyDraw.charge >= 0 ? 'rgba(200,50,50,0.95)' : 'rgba(60,90,220,0.95)';
    case 'conductor':
    default:           return 'rgba(170,120,60,0.95)';
  }
}

export function draw(): void {
  if (!polyDraw.active) return;
  const v = polyDraw.vertices;
  const n = v.length / 2;
  if (n === 0) return;

  const z = getZoom();
  const px = (g: number) => g * PIXEL_SCALE;
  const baseColor = materialColor();
  const badColor = 'rgba(230,40,40,0.95)';

  ctx.save();

  // Placed edges.
  ctx.lineWidth = 2 / z;
  ctx.strokeStyle = baseColor;
  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(px(v[0]), px(v[1]));
  for (let i = 1; i < n; i++) {
    ctx.lineTo(px(v[2 * i]), px(v[2 * i + 1]));
  }
  ctx.stroke();

  // Live edge from V_{n-1} to the cursor (or back to V_0 if closing).
  if (polyDraw.hasCursor) {
    const lastX = v[2 * (n - 1)], lastY = v[2 * (n - 1) + 1];
    let tx: number, ty: number;
    if (polyDraw.closingAtCursor) {
      tx = v[0]; ty = v[1];
    } else {
      tx = polyDraw.cursor.x; ty = polyDraw.cursor.y;
    }
    ctx.lineWidth = 1.5 / z;
    ctx.strokeStyle = polyDraw.intersectsAtCursor ? badColor : baseColor;
    ctx.setLineDash([4 / z, 4 / z]);
    ctx.beginPath();
    ctx.moveTo(px(lastX), px(lastY));
    ctx.lineTo(px(tx), px(ty));
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Vertex dots.
  ctx.fillStyle = baseColor;
  const r = 3.5 / z;
  for (let i = 0; i < n; i++) {
    ctx.beginPath();
    ctx.arc(px(v[2 * i]), px(v[2 * i + 1]), r, 0, Math.PI * 2);
    ctx.fill();
  }

  // V0 close-target indicator (open ring around V0 when ≥3 vertices).
  if (n >= 3) {
    const ringR = 6 / z;
    ctx.lineWidth = 1.5 / z;
    ctx.strokeStyle = polyDraw.closingAtCursor && !polyDraw.intersectsAtCursor
      ? 'rgba(40,180,90,0.95)' : baseColor;
    ctx.beginPath();
    ctx.arc(px(v[0]), px(v[1]), ringR, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}
