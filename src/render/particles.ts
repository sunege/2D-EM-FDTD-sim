import * as P from '../sim/particles';
import { ctx, gridToCanvas } from './canvas';
import { drag } from '../sim/godhand';

export function draw(): void {
  ctx.save();
  ctx.lineWidth = 1.5;
  for (let i = 0; i < P.n; i++) {
    if (!P.alive[i]) continue;
    const c = gridToCanvas(P.px[i], P.py[i]);
    const mag = Math.min(12, 4 + Math.abs(P.q[i]) * 0.6);

    if (P.q[i] >= 0) {
      ctx.fillStyle = 'rgba(220,50,50,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    } else {
      ctx.fillStyle = 'rgba(50,100,230,0.95)';
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    }
    ctx.beginPath();
    ctx.arc(c.x, c.y, mag, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    if (i === drag.idx) {
      ctx.strokeStyle = 'rgba(255,255,120,0.9)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, mag + 4, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();
}
