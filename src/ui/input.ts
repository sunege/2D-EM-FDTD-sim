import * as P from '../sim/particles';
import * as Hand from '../sim/godhand';
import { canvas, canvasToGrid } from '../render/canvas';
import { NX, NY, PARTICLE_MARGIN } from '../config';
import { state as ui } from './controls';

type ChargeProvider = () => number;

const PICK_RADIUS = 4;

export function setup(getCharge: ChargeProvider): void {
  const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
  const eventToGrid = (e: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const g = canvasToGrid(cx, cy);
    const lo = PARTICLE_MARGIN;
    return {
      x: clamp(g.x, lo, NX - 1 - PARTICLE_MARGIN),
      y: clamp(g.y, lo, NY - 1 - PARTICLE_MARGIN),
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = eventToGrid(e);
    if (ui.paused) {
      const q = e.button === 2 ? -getCharge() : getCharge();
      P.add(x, y, q);
      return;
    }
    const hit = P.findNearest(x, y, PICK_RADIUS);
    if (hit >= 0) {
      Hand.startDrag(hit, x, y);
    } else {
      const q = e.button === 2 ? -getCharge() : getCharge();
      const pidx = P.add(x, y, q);
      Hand.startDrag(pidx, x, y);
    }
  });

  canvas.addEventListener('pointermove', (e) => {
    if (Hand.drag.idx < 0) return;
    const { x, y } = eventToGrid(e);
    Hand.updateTarget(x, y);
  });

  const release = (e: PointerEvent) => {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    Hand.endDrag();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
