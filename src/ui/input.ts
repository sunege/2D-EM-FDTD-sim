import * as P from '../sim/particles';
import * as Hand from '../sim/godhand';
import * as Cond from '../sim/conductors';
import * as Diel from '../sim/dielectric';
import * as Body from '../sim/chargedBody';
import { canvas, canvasToGrid } from '../render/canvas';
import { NX, NY, PARTICLE_MARGIN } from '../config';
import { state as ui, type Shape } from './controls';

type ChargeProvider = () => number;

const PICK_RADIUS = 4;

export type PlacementKind = 'conductor' | 'dielectric' | 'body';

export const placement = {
  active: false,
  shape: 'rect' as Shape,
  material: 'conductor' as PlacementKind,
  epsR: 2,
  charge: 0,
  anchor: { x: 0, y: 0 },
  current: { x: 0, y: 0 },
};

function finalizePlacement(): void {
  const ax = placement.anchor.x, ay = placement.anchor.y;
  const bx = placement.current.x, by = placement.current.y;
  const kind = placement.material;
  const er = placement.epsR;
  const Q = placement.charge;
  switch (placement.shape) {
    case 'disk': {
      const r = Math.hypot(bx - ax, by - ay);
      if (r < 0.5) break;
      if (kind === 'conductor') Cond.addDisk(ax, ay, r);
      else if (kind === 'dielectric') Diel.addDisk(ax, ay, r, er);
      else Body.addDisk(ax, ay, r, Q);
      break;
    }
    case 'annulus': {
      const rOuter = Math.hypot(bx - ax, by - ay);
      if (rOuter < 1) break;
      if (kind === 'conductor') Cond.addAnnulus(ax, ay, rOuter, rOuter * 0.5);
      else if (kind === 'dielectric') Diel.addAnnulus(ax, ay, rOuter, rOuter * 0.5, er);
      else Body.addAnnulus(ax, ay, rOuter, rOuter * 0.5, Q);
      break;
    }
    case 'rect': {
      if (Math.abs(bx - ax) < 0.5 || Math.abs(by - ay) < 0.5) break;
      if (kind === 'conductor') Cond.addRect(ax, ay, bx, by);
      else if (kind === 'dielectric') Diel.addRect(ax, ay, bx, by, er);
      else Body.addRect(ax, ay, bx, by, Q);
      break;
    }
  }
}

// Click-vs-drag discrimination on existing conductors: a press stays "pending"
// until the pointer moves past this threshold. Quick click = toggle grounded
// ↔ floating; significant drag in a material mode = promote to drag-to-place.
const TOGGLE_DRAG_THRESHOLD = 2.0; // grid cells

let pendingToggleGroup = 0;
const pendingDown = { x: 0, y: 0 };

function isShapeMode(): boolean {
  return ui.mode === 'conductor' || ui.mode === 'dielectric' || ui.mode === 'body';
}

function beginPlacement(anchorX: number, anchorY: number, currentX: number, currentY: number): void {
  placement.active = true;
  placement.shape = ui.shape;
  placement.material =
    ui.mode === 'conductor' ? 'conductor' :
    ui.mode === 'dielectric' ? 'dielectric' : 'body';
  placement.epsR = ui.epsR;
  placement.charge = ui.charge;
  placement.anchor = { x: anchorX, y: anchorY };
  placement.current = { x: currentX, y: currentY };
}

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

  const eraseAt = (x: number, y: number): void => {
    // Priority: particle > body > conductor > dielectric
    const hit = P.findNearest(x, y, PICK_RADIUS);
    if (hit >= 0) { P.remove(hit); return; }
    const bg = Body.getGroupAt(x, y);
    if (bg > 0) { Body.removeGroup(bg); return; }
    const cg = Cond.getGroupAt(x, y);
    if (cg > 0) { Cond.removeGroup(cg); return; }
    const dg = Diel.getGroupAt(x, y);
    if (dg > 0) { Diel.removeGroup(dg); return; }
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    // Erase mode: handle and exit
    if (ui.mode === 'erase' && e.button === 0) {
      const { x, y } = eventToGrid(e, 0);
      eraseAt(x, y);
      return;
    }

    const { x: rx, y: ry } = eventToGrid(e, 0);

    // Universal: click on existing particle → start drag (running only)
    if (e.button === 0 && !ui.paused) {
      const hit = P.findNearest(rx, ry, PICK_RADIUS);
      if (hit >= 0) {
        Hand.startDrag(hit, rx, ry);
        return;
      }
    }

    // Universal: click on existing charged body → drag (running) or consume
    // the click (paused, to avoid placing a new body on top of it).
    if (e.button === 0) {
      const bg = Body.getGroupAt(rx, ry);
      if (bg > 0) {
        if (!ui.paused) Body.startDrag(bg, rx, ry);
        return;
      }
    }

    // Universal: click on existing conductor → defer toggle
    if (e.button === 0) {
      const existingCond = Cond.getGroupAt(rx, ry);
      if (existingCond > 0) {
        pendingToggleGroup = existingCond;
        pendingDown.x = rx;
        pendingDown.y = ry;
        return;
      }
    }

    // Empty cell: dispatch by mode (shape modes drag-to-size)
    if (isShapeMode() && e.button === 0) {
      beginPlacement(rx, ry, rx, ry);
      return;
    }

    // Charge mode (or right-click): add new charge
    const { x: cx, y: cy } = eventToGrid(e, PARTICLE_MARGIN);
    const q = e.button === 2 ? -getCharge() : getCharge();
    if (ui.paused) {
      P.add(cx, cy, q);
      return;
    }
    const pidx = P.add(cx, cy, q);
    Hand.startDrag(pidx, cx, cy);
  });

  canvas.addEventListener('pointermove', (e) => {
    if (ui.mode === 'erase') {
      if (e.buttons & 1) {
        const { x, y } = eventToGrid(e, 0);
        eraseAt(x, y);
      }
      return;
    }
    if (pendingToggleGroup > 0) {
      const { x, y } = eventToGrid(e, 0);
      const dx = x - pendingDown.x;
      const dy = y - pendingDown.y;
      if (Math.hypot(dx, dy) > TOGGLE_DRAG_THRESHOLD) {
        // Pointer moved significantly: cancel toggle. If in a shape mode,
        // promote to drag-to-place. Otherwise, no further action.
        if (isShapeMode()) {
          beginPlacement(pendingDown.x, pendingDown.y, x, y);
        }
        pendingToggleGroup = 0;
      }
      return;
    }
    if (placement.active) {
      const { x, y } = eventToGrid(e, 0);
      placement.current = { x, y };
      return;
    }
    if (Body.drag.groupId > 0) {
      const { x, y } = eventToGrid(e, 0);
      Body.updateTarget(x, y);
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
    Body.endDrag();
  };
  canvas.addEventListener('pointerup', release);
  canvas.addEventListener('pointercancel', release);

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
