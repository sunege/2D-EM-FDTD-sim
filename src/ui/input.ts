import * as P from '../sim/particles';
import * as Hand from '../sim/godhand';
import * as Cond from '../sim/conductors';
import { canvas, canvasToGrid } from '../render/canvas';
import { NX, NY, PARTICLE_MARGIN } from '../config';
import { state as ui, type Tool } from './controls';

type ChargeProvider = () => number;

const PICK_RADIUS = 4;

export const placement = {
  active: false,
  tool: 'disk' as Tool,
  anchor: { x: 0, y: 0 },
  current: { x: 0, y: 0 },
};

function finalizePlacement(): void {
  const ax = placement.anchor.x, ay = placement.anchor.y;
  const bx = placement.current.x, by = placement.current.y;
  switch (placement.tool) {
    case 'disk': {
      const r = Math.hypot(bx - ax, by - ay);
      if (r >= 0.5) Cond.addDisk(ax, ay, r);
      break;
    }
    case 'annulus': {
      const rOuter = Math.hypot(bx - ax, by - ay);
      if (rOuter >= 1) Cond.addAnnulus(ax, ay, rOuter, rOuter * 0.5);
      break;
    }
    case 'rect': {
      if (Math.abs(bx - ax) >= 0.5 && Math.abs(by - ay) >= 0.5) {
        Cond.addRect(ax, ay, bx, by);
      }
      break;
    }
  }
}

// Click-vs-drag discrimination for conductor tools: a press on an existing
// conductor cell stays "pending" until the pointer moves past this threshold,
// at which point it becomes a drag-to-place. Otherwise pointerup toggles
// grounded ↔ floating for that group.
const TOGGLE_DRAG_THRESHOLD = 2.0; // grid cells

let pendingToggleGroup = 0;
const pendingDown = { x: 0, y: 0 };

export function setup(getCharge: ChargeProvider): void {
  const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
  const eventToGrid = (e: PointerEvent, margin: number) => {
    const rect = canvas.getBoundingClientRect();
    const cx = ((e.clientX - rect.left) / rect.width) * canvas.width;
    const cy = ((e.clientY - rect.top) / rect.height) * canvas.height;
    const g = canvasToGrid(cx, cy);
    return {
      x: clamp(g.x, margin, NX - 1 - margin),
      y: clamp(g.y, margin, NY - 1 - margin),
    };
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    if (ui.tool !== 'charge' && e.button === 0) {
      const { x, y } = eventToGrid(e, 0);
      const existing = Cond.getGroupAt(x, y);
      if (existing > 0) {
        // Defer: small drag → toggle, large drag → drag-to-place
        pendingToggleGroup = existing;
        pendingDown.x = x;
        pendingDown.y = y;
        return;
      }
      placement.active = true;
      placement.tool = ui.tool;
      placement.anchor = { x, y };
      placement.current = { x, y };
      return;
    }

    const { x, y } = eventToGrid(e, PARTICLE_MARGIN);
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
    if (pendingToggleGroup > 0) {
      const { x, y } = eventToGrid(e, 0);
      const dx = x - pendingDown.x;
      const dy = y - pendingDown.y;
      if (Math.hypot(dx, dy) > TOGGLE_DRAG_THRESHOLD) {
        // Promoted to a drag-to-place
        placement.active = true;
        placement.tool = ui.tool;
        placement.anchor = { x: pendingDown.x, y: pendingDown.y };
        placement.current = { x, y };
        pendingToggleGroup = 0;
      }
      return;
    }
    if (placement.active) {
      const { x, y } = eventToGrid(e, 0);
      placement.current = { x, y };
      return;
    }
    if (Hand.drag.idx < 0) return;
    const { x, y } = eventToGrid(e, PARTICLE_MARGIN);
    Hand.updateTarget(x, y);
  });

  const release = (e: PointerEvent) => {
    if (canvas.hasPointerCapture(e.pointerId)) {
      canvas.releasePointerCapture(e.pointerId);
    }
    if (pendingToggleGroup > 0) {
      Cond.toggleGrounded(pendingToggleGroup);
      pendingToggleGroup = 0;
    }
    if (placement.active) {
      finalizePlacement();
      placement.active = false;
    }
    Hand.endDrag();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
