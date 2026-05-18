import * as P from '../sim/particles';
import * as Hand from '../sim/godhand';
import * as Cond from '../sim/conductors';
import * as Diel from '../sim/dielectric';
import * as Body from '../sim/chargedBody';
import * as Probe from '../sim/probe';
import * as Panel from './paramPanel';
import { canvas, canvasToGrid } from '../render/canvas';
import * as Viewport from '../render/viewport';
import { NX, NY, PARTICLE_MARGIN } from '../config';
import { state as ui, type Shape } from './controls';
import { requestRender } from './render-request';

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
  const applyOsc = (g: number): void => {
    if (g > 0 && ui.oscEnable) {
      Body.setOscillator(g, ui.oscFreq, ui.oscAmp, ui.oscAngleDeg * Math.PI / 180);
    }
  };
  switch (placement.shape) {
    case 'disk': {
      const r = Math.hypot(bx - ax, by - ay);
      if (r < 0.5) break;
      if (kind === 'conductor') Cond.addDisk(ax, ay, r);
      else if (kind === 'dielectric') Diel.addDisk(ax, ay, r, er);
      else applyOsc(Body.addDisk(ax, ay, r, Q));
      break;
    }
    case 'annulus': {
      const rOuter = Math.hypot(bx - ax, by - ay);
      if (rOuter < 1) break;
      if (kind === 'conductor') Cond.addAnnulus(ax, ay, rOuter, rOuter * 0.5);
      else if (kind === 'dielectric') Diel.addAnnulus(ax, ay, rOuter, rOuter * 0.5, er);
      else applyOsc(Body.addAnnulus(ax, ay, rOuter, rOuter * 0.5, Q));
      break;
    }
    case 'rect': {
      if (Math.abs(bx - ax) < 0.5 || Math.abs(by - ay) < 0.5) break;
      if (kind === 'conductor') Cond.addRect(ax, ay, bx, by);
      else if (kind === 'dielectric') Diel.addRect(ax, ay, bx, by, er);
      else applyOsc(Body.addRect(ax, ay, bx, by, Q));
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

// Threshold in canvas pixels to distinguish right-click from right-drag.
const PAN_DRAG_THRESHOLD_PX = 10;

export function setup(getCharge: ChargeProvider): void {
  const clamp = (v: number, lo: number, hi: number) => v < lo ? lo : v > hi ? hi : v;
  const eventToCanvas = (e: MouseEvent) => {
    const rect = canvas.getBoundingClientRect();
    return {
      cx: ((e.clientX - rect.left) / rect.width) * canvas.width,
      cy: ((e.clientY - rect.top) / rect.height) * canvas.height,
    };
  };
  const eventToGrid = (e: PointerEvent, margin: number) => {
    const { cx, cy } = eventToCanvas(e);
    const g = canvasToGrid(cx, cy);
    return {
      x: clamp(g.x, margin, NX - 1 - margin),
      y: clamp(g.y, margin, NY - 1 - margin),
    };
  };

  // Right-drag pan state
  const rightDown = { cx: 0, cy: 0 };
  let rightLastCx = 0, rightLastCy = 0;
  const rightGrid = { x: 0, y: 0 };
  let rightPending = false;
  let rightDragging = false;

  const eraseAt = (x: number, y: number): void => {
    // Priority: probe > particle > body > conductor > dielectric
    const probeHit = Probe.findNearest(x, y, PICK_RADIUS);
    if (probeHit >= 0) { Probe.remove(probeHit); return; }
    const hit = P.findNearest(x, y, PICK_RADIUS);
    if (hit >= 0) { Panel.closeIfFor('particle', hit); P.remove(hit); return; }
    const bg = Body.getGroupAt(x, y);
    if (bg > 0) { Panel.closeIfFor('body', bg); Body.removeGroup(bg); return; }
    const cg = Cond.getGroupAt(x, y);
    if (cg > 0) { Panel.closeIfFor('conductor', cg); Cond.removeGroup(cg); return; }
    const dg = Diel.getGroupAt(x, y);
    if (dg > 0) { Panel.closeIfFor('dielectric', dg); Diel.removeGroup(dg); return; }
  };

  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);

    // Any canvas click dismisses the panel; right-clicks may reopen it below.
    Panel.close();

    // Erase mode: handle and exit
    if (ui.mode === 'erase' && e.button === 0) {
      const { x, y } = eventToGrid(e, 0);
      eraseAt(x, y);
      return;
    }

    const { x: rx, y: ry } = eventToGrid(e, 0);

    // Right-button: defer panel/charge action until release to allow right-drag pan.
    if (e.button === 2) {
      const { cx, cy } = eventToCanvas(e);
      rightDown.cx = cx; rightDown.cy = cy;
      rightLastCx = cx; rightLastCy = cy;
      rightGrid.x = rx; rightGrid.y = ry;
      rightPending = true;
      rightDragging = false;
      return;
    }

    // Universal: click on existing probe → remove it (any mode). Probes are
    // checked before other entities so clicking the pin always toggles it off.
    if (e.button === 0) {
      const probeHit = Probe.findNearest(rx, ry, PICK_RADIUS);
      if (probeHit >= 0) {
        Probe.remove(probeHit);
        return;
      }
    }

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

    // Probe mode: add a probe at the click point.
    if (ui.mode === 'probe' && e.button === 0) {
      Probe.add(rx, ry);
      return;
    }

    // Empty cell: dispatch by mode (shape modes drag-to-size)
    if (isShapeMode() && e.button === 0) {
      beginPlacement(rx, ry, rx, ry);
      return;
    }

    // Charge mode (or right-click on empty): add new charge.
    const { x: cx, y: cy } = eventToGrid(e, PARTICLE_MARGIN);
    const q = e.button === 2 ? -getCharge() : getCharge();
    const pidx = P.add(cx, cy, q);
    if (ui.oscEnable) {
      // Oscillating particle: pin at placement point, no drag.
      P.setOscillator(pidx, ui.oscFreq, ui.oscAmp, ui.oscAngleDeg * Math.PI / 180);
      return;
    }
    if (ui.paused) return;
    Hand.startDrag(pidx, cx, cy);
  });

  canvas.addEventListener('pointermove', (e) => {
    // Right-drag pan (works in any mode)
    if (rightPending && (e.buttons & 2)) {
      const { cx, cy } = eventToCanvas(e);
      if (!rightDragging) {
        const ddx = cx - rightDown.cx;
        const ddy = cy - rightDown.cy;
        if (Math.hypot(ddx, ddy) > PAN_DRAG_THRESHOLD_PX) rightDragging = true;
      }
      if (rightDragging) {
        Viewport.pan(cx - rightLastCx, cy - rightLastCy);
        requestRender();
      }
      rightLastCx = cx;
      rightLastCy = cy;
      if (rightDragging) return;
    }

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

    // Resolve deferred right-button action
    if (rightPending) {
      rightPending = false;
      const wasDragging = rightDragging;
      rightDragging = false;
      if (!wasDragging && e.type !== 'pointercancel') {
        // Short right-click: execute panel/charge action
        const rx = rightGrid.x, ry = rightGrid.y;
        const hit = P.findNearest(rx, ry, PICK_RADIUS);
        if (hit >= 0) { Panel.openFor('particle', hit); return; }
        const bg = Body.getGroupAt(rx, ry);
        if (bg > 0) { Panel.openFor('body', bg); return; }
        const cg = Cond.getGroupAt(rx, ry);
        if (cg > 0) { Panel.openFor('conductor', cg); return; }
        const dg = Diel.getGroupAt(rx, ry);
        if (dg > 0) { Panel.openFor('dielectric', dg); return; }
        // Empty cell: add negative charge
        const cx2 = clamp(rx, PARTICLE_MARGIN, NX - 1 - PARTICLE_MARGIN);
        const cy2 = clamp(ry, PARTICLE_MARGIN, NY - 1 - PARTICLE_MARGIN);
        const pidx = P.add(cx2, cy2, -getCharge());
        if (ui.oscEnable) {
          P.setOscillator(pidx, ui.oscFreq, ui.oscAmp, ui.oscAngleDeg * Math.PI / 180);
        } else if (!ui.paused) {
          Hand.startDrag(pidx, cx2, cy2);
        }
      }
      return;
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

  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const { cx, cy } = eventToCanvas(e);
    const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    Viewport.zoomAt(factor, cx, cy);
    requestRender();
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
}
