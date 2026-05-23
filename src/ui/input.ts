import * as P from '../sim/particles';
import * as Hand from '../sim/godhand';
import * as Cond from '../sim/conductors';
import * as Diel from '../sim/dielectric';
import * as Body from '../sim/chargedBody';
import * as Probe from '../sim/probe';
import * as Panel from './paramPanel';
import * as History from '../sim/history';
import { toggleChart, closeChartFor } from '../render/probeChart';
import { canvas, canvasToGrid } from '../render/canvas';
import * as Viewport from '../render/viewport';
import { NX, NY, PARTICLE_MARGIN } from '../config';
import { state as ui, type Shape, onModeOrShapeChange } from './controls';
import { requestRender } from './render-request';
import { segmentsIntersect } from '../sim/polygon';

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

// Polygon-draw state. Flat-array vertices for easy passing to sim/polygon
// helpers. `intersectsAtCursor` / `closingAtCursor` are recomputed on each
// pointermove so the renderer can color the preview line.
export const polyDraw = {
  active: false,
  material: 'conductor' as PlacementKind,
  epsR: 2,
  charge: 0,
  vertices: [] as number[],   // [x0,y0,x1,y1,...]
  redoStack: [] as number[],  // most recently undone vertices, also flat
  cursor: { x: 0, y: 0 },
  hasCursor: false,
  // Cursor-position derived flags for the preview rendering.
  intersectsAtCursor: false,
  closingAtCursor: false,
};

// Closing the polygon by clicking near V0: any click within this grid-cell
// radius of V0 (and with ≥3 vertices) commits the polygon.
const POLY_CLOSE_RADIUS = 3.0;

// Returns true if a shape was actually added (size threshold met).
function finalizePlacement(): boolean {
  const ax = placement.anchor.x, ay = placement.anchor.y;
  const bx = placement.current.x, by = placement.current.y;
  const kind = placement.material;
  const er = placement.epsR;
  const Q = placement.charge;
  switch (placement.shape) {
    case 'disk': {
      const r = Math.hypot(bx - ax, by - ay);
      if (r < 0.5) return false;
      if (kind === 'conductor') Cond.addDisk(ax, ay, r);
      else if (kind === 'dielectric') Diel.addDisk(ax, ay, r, er);
      else Body.addDisk(ax, ay, r, Q);
      return true;
    }
    case 'annulus': {
      const rOuter = Math.hypot(bx - ax, by - ay);
      if (rOuter < 1) return false;
      if (kind === 'conductor') Cond.addAnnulus(ax, ay, rOuter, rOuter * 0.5);
      else if (kind === 'dielectric') Diel.addAnnulus(ax, ay, rOuter, rOuter * 0.5, er);
      else Body.addAnnulus(ax, ay, rOuter, rOuter * 0.5, Q);
      return true;
    }
    case 'rect': {
      if (Math.abs(bx - ax) < 0.5 || Math.abs(by - ay) < 0.5) return false;
      if (kind === 'conductor') Cond.addRect(ax, ay, bx, by);
      else if (kind === 'dielectric') Diel.addRect(ax, ay, bx, by, er);
      else Body.addRect(ax, ay, bx, by, Q);
      return true;
    }
  }
  return false;
}

// Click-vs-drag discrimination on existing conductors/dielectrics. Quick click
// = conductor toggles grounded↔floating (dielectric is a no-op); significant
// drag = promote to translate-drag, moving the whole group.
const TOGGLE_DRAG_THRESHOLD = 2.0; // grid cells

// Unified deferred state for conductor + dielectric click-on-existing.
let pendingMatKind: '' | 'conductor' | 'dielectric' = '';
let pendingMatGroup = 0;
const pendingMatDown = { x: 0, y: 0 };

// Active translate-drag state (populated when pending promotes to drag).
let matDragActive = false;
const matDrag = {
  startX: 0, startY: 0,  // pointer position at drag-start (grid coords)
  cumDx: 0, cumDy: 0,    // cumulative translation actually applied
  minDx: 0, maxDx: 0,    // clamp limits so the bbox stays on-grid
  minDy: 0, maxDy: 0,
};
const MAT_DRAG_MARGIN = 1; // keep group bbox at least this many cells from grid edge

// Click-vs-drag discrimination on probes: small move = toggle chart, large move = reposition.
let pendingProbe = -1;
let probeDragActive = -1;
const probeDragDown = { x: 0, y: 0 };

function isShapeMode(): boolean {
  return ui.mode === 'conductor' || ui.mode === 'dielectric' || ui.mode === 'body';
}

function polyMaterialFromMode(): PlacementKind {
  return ui.mode === 'conductor' ? 'conductor' :
         ui.mode === 'dielectric' ? 'dielectric' : 'body';
}

function polyBegin(): void {
  polyDraw.active = true;
  polyDraw.material = polyMaterialFromMode();
  polyDraw.epsR = ui.epsR;
  polyDraw.charge = ui.charge;
  polyDraw.vertices.length = 0;
  polyDraw.redoStack.length = 0;
  polyDraw.hasCursor = false;
  polyDraw.intersectsAtCursor = false;
  polyDraw.closingAtCursor = false;
}

export function isPolyActive(): boolean {
  return polyDraw.active;
}

export function polyCancel(): void {
  polyDraw.active = false;
  polyDraw.vertices.length = 0;
  polyDraw.redoStack.length = 0;
  polyDraw.hasCursor = false;
  polyDraw.intersectsAtCursor = false;
  polyDraw.closingAtCursor = false;
}

// Would the edge (lastVertex → (x,y)) cross any existing non-adjacent edge?
// The adjacent edge (V_{n-2}, V_{n-1}) shares V_{n-1} with the new edge, so we
// exclude it (and the segmentsIntersect helper already treats shared endpoints
// as non-crossing).
function polyNextEdgeIntersects(x: number, y: number): boolean {
  const v = polyDraw.vertices;
  const n = v.length / 2;
  if (n < 2) return false;
  const lastX = v[2 * (n - 1)], lastY = v[2 * (n - 1) + 1];
  for (let i = 0; i + 1 < n - 1; i++) { // edges (V_i, V_{i+1}) for i in [0, n-3]
    const ax = v[2 * i],     ay = v[2 * i + 1];
    const bx = v[2 * (i + 1)], by = v[2 * (i + 1) + 1];
    if (segmentsIntersect(lastX, lastY, x, y, ax, ay, bx, by)) return true;
  }
  return false;
}

// Closing edge (V_{n-1} → V_0): check all edges except the two adjacent ones.
function polyClosingEdgeIntersects(): boolean {
  const v = polyDraw.vertices;
  const n = v.length / 2;
  if (n < 3) return false;
  const lastX = v[2 * (n - 1)], lastY = v[2 * (n - 1) + 1];
  const v0x = v[0], v0y = v[1];
  // Edges (V_i, V_{i+1}) for i in [1, n-3] (skip first edge V_0→V_1 and last V_{n-2}→V_{n-1}).
  for (let i = 1; i + 1 < n - 1; i++) {
    const ax = v[2 * i],     ay = v[2 * i + 1];
    const bx = v[2 * (i + 1)], by = v[2 * (i + 1) + 1];
    if (segmentsIntersect(lastX, lastY, v0x, v0y, ax, ay, bx, by)) return true;
  }
  return false;
}

// Try to commit the polygon. Returns true on success.
function polyCommit(): boolean {
  if (polyDraw.vertices.length < 6) return false;
  if (polyClosingEdgeIntersects()) return false;
  const pts = polyDraw.vertices.slice();
  let added = 0;
  if (polyDraw.material === 'conductor') added = Cond.addPolygon(pts);
  else if (polyDraw.material === 'dielectric') added = Diel.addPolygon(pts, polyDraw.epsR);
  else added = Body.addPolygon(pts, polyDraw.charge);
  polyCancel();
  if (added > 0) History.commit();
  return added > 0;
}

export function polyTryClose(): boolean {
  if (!polyDraw.active) return false;
  return polyCommit();
}

export function polyUndo(): boolean {
  if (!polyDraw.active || polyDraw.vertices.length === 0) return false;
  const y = polyDraw.vertices.pop()!;
  const x = polyDraw.vertices.pop()!;
  polyDraw.redoStack.push(x, y);
  if (polyDraw.vertices.length === 0) {
    polyDraw.active = false;
    polyDraw.hasCursor = false;
  }
  return true;
}

export function polyRedo(): boolean {
  if (polyDraw.redoStack.length === 0) return false;
  // Redo replays a previously-undone vertex. The vertex was already validated
  // when first placed, so skip the intersection check.
  if (!polyDraw.active) polyBegin();
  const y = polyDraw.redoStack.pop()!;
  const x = polyDraw.redoStack.pop()!;
  polyDraw.vertices.push(x, y);
  return true;
}

function polyTryAddVertex(x: number, y: number): boolean {
  if (!polyDraw.active) polyBegin();
  if (polyDraw.vertices.length >= 4 && polyNextEdgeIntersects(x, y)) return false;
  polyDraw.vertices.push(x, y);
  polyDraw.redoStack.length = 0;
  return true;
}

// Recompute preview flags when the cursor moves during polygon draw.
function polyUpdateCursor(x: number, y: number): void {
  polyDraw.cursor.x = x;
  polyDraw.cursor.y = y;
  polyDraw.hasCursor = true;
  const v = polyDraw.vertices;
  const n = v.length / 2;
  if (n === 0) {
    polyDraw.intersectsAtCursor = false;
    polyDraw.closingAtCursor = false;
    return;
  }
  // Closing iff ≥3 vertices and cursor is within close radius of V0.
  let closing = false;
  if (n >= 3) {
    const dx0 = x - v[0], dy0 = y - v[1];
    if (dx0 * dx0 + dy0 * dy0 <= POLY_CLOSE_RADIUS * POLY_CLOSE_RADIUS) closing = true;
  }
  polyDraw.closingAtCursor = closing;
  if (closing) {
    polyDraw.intersectsAtCursor = polyClosingEdgeIntersects();
  } else if (n >= 2) {
    polyDraw.intersectsAtCursor = polyNextEdgeIntersects(x, y);
  } else {
    polyDraw.intersectsAtCursor = false;
  }
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

function beginMatTranslate(px: number, py: number): void {
  const bb = pendingMatKind === 'conductor'
    ? Cond.getGroupBBox(pendingMatGroup)
    : Diel.getGroupBBox(pendingMatGroup);
  matDrag.startX = px;
  matDrag.startY = py;
  matDrag.cumDx = 0;
  matDrag.cumDy = 0;
  // Delta clamp: target bbox must stay in [margin, NX-1-margin] × [..]
  matDrag.minDx = MAT_DRAG_MARGIN - bb.xmin;
  matDrag.maxDx = (NX - 1 - MAT_DRAG_MARGIN) - bb.xmax;
  matDrag.minDy = MAT_DRAG_MARGIN - bb.ymin;
  matDrag.maxDy = (NY - 1 - MAT_DRAG_MARGIN) - bb.ymax;
  matDragActive = true;
}

function updateMatTranslate(px: number, py: number): void {
  let dx = px - matDrag.startX;
  let dy = py - matDrag.startY;
  if (dx < matDrag.minDx) dx = matDrag.minDx;
  else if (dx > matDrag.maxDx) dx = matDrag.maxDx;
  if (dy < matDrag.minDy) dy = matDrag.minDy;
  else if (dy > matDrag.maxDy) dy = matDrag.maxDy;
  const incDx = dx - matDrag.cumDx;
  const incDy = dy - matDrag.cumDy;
  if (incDx === 0 && incDy === 0) return;
  if (pendingMatKind === 'conductor') Cond.translateGroup(pendingMatGroup, incDx, incDy);
  else Diel.translateGroup(pendingMatGroup, incDx, incDy);
  matDrag.cumDx = dx;
  matDrag.cumDy = dy;
}

function resetMatDrag(): void {
  pendingMatKind = '';
  pendingMatGroup = 0;
  matDragActive = false;
}

// Threshold in canvas pixels to distinguish right-click from right-drag.
const PAN_DRAG_THRESHOLD_PX = 10;

export function setup(getCharge: ChargeProvider): void {
  // Cancel any in-progress polygon when the user switches mode or shape.
  // Mid-draw state is tool-specific and would be confusing to carry over.
  onModeOrShapeChange(() => {
    if (polyDraw.active) {
      polyCancel();
      requestRender();
    }
  });
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
    if (probeHit >= 0) { closeChartFor(probeHit); Probe.remove(probeHit); History.commit(); return; }
    const hit = P.findNearest(x, y, PICK_RADIUS);
    if (hit >= 0) { Panel.closeIfFor('particle', hit); P.remove(hit); History.commit(); return; }
    const bg = Body.getGroupAt(x, y);
    if (bg > 0) { Panel.closeIfFor('body', bg); Body.removeGroup(bg); History.commit(); return; }
    const cg = Cond.getGroupAt(x, y);
    if (cg > 0) { Panel.closeIfFor('conductor', cg); Cond.removeGroup(cg); History.commit(); return; }
    const dg = Diel.getGroupAt(x, y);
    if (dg > 0) { Panel.closeIfFor('dielectric', dg); Diel.removeGroup(dg); History.commit(); return; }
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

    // Polygon draw in progress: all left-clicks add a vertex or close.
    // Right-click cancels. This takes priority over universal interactions so
    // the user can't accidentally interrupt the polygon by clicking near an
    // existing entity.
    if (polyDraw.active) {
      if (e.button === 0) {
        // Close if the click is near V0 (and we have ≥3 vertices).
        const v = polyDraw.vertices;
        if (v.length >= 6) {
          const dx0 = rx - v[0], dy0 = ry - v[1];
          if (dx0 * dx0 + dy0 * dy0 <= POLY_CLOSE_RADIUS * POLY_CLOSE_RADIUS) {
            polyCommit();
            return;
          }
        }
        polyTryAddVertex(rx, ry);
        return;
      }
      if (e.button === 2) {
        polyCancel();
        return;
      }
    }

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

    // Universal: left-click on existing probe → defer to distinguish click vs drag.
    if (e.button === 0) {
      const probeHit = Probe.findNearest(rx, ry, PICK_RADIUS);
      if (probeHit >= 0) {
        pendingProbe = probeHit;
        probeDragDown.x = rx; probeDragDown.y = ry;
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

    // Universal: click on existing conductor → defer (toggle on quick release,
    // translate on drag past threshold).
    if (e.button === 0) {
      const existingCond = Cond.getGroupAt(rx, ry);
      if (existingCond > 0) {
        pendingMatKind = 'conductor';
        pendingMatGroup = existingCond;
        pendingMatDown.x = rx;
        pendingMatDown.y = ry;
        return;
      }
    }

    // Universal: click on existing dielectric → defer (no-op on quick release,
    // translate on drag past threshold).
    if (e.button === 0) {
      const existingDiel = Diel.getGroupAt(rx, ry);
      if (existingDiel > 0) {
        pendingMatKind = 'dielectric';
        pendingMatGroup = existingDiel;
        pendingMatDown.x = rx;
        pendingMatDown.y = ry;
        return;
      }
    }

    // Probe mode: add a probe at the click point.
    if (ui.mode === 'probe' && e.button === 0) {
      Probe.add(rx, ry);
      History.commit();
      return;
    }

    // Empty cell: dispatch by mode (shape modes drag-to-size, polygon clicks).
    if (isShapeMode() && e.button === 0) {
      if (ui.shape === 'polygon') {
        polyTryAddVertex(rx, ry);
        polyUpdateCursor(rx, ry);
      } else {
        beginPlacement(rx, ry, rx, ry);
      }
      return;
    }

    // Charge mode (or right-click on empty): add new charge.
    const { x: cx, y: cy } = eventToGrid(e, PARTICLE_MARGIN);
    const q = e.button === 2 ? -getCharge() : getCharge();
    const pidx = P.add(cx, cy, q);
    History.commit();
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

    // Probe: promote pending to drag if moved past threshold, then update position.
    if (pendingProbe >= 0 || probeDragActive >= 0) {
      const { x, y } = eventToGrid(e, 0);
      if (pendingProbe >= 0 && Math.hypot(x - probeDragDown.x, y - probeDragDown.y) > TOGGLE_DRAG_THRESHOLD) {
        probeDragActive = pendingProbe;
        pendingProbe = -1;
      }
      if (probeDragActive >= 0) {
        Probe.move(probeDragActive, x, y);
        requestRender();
      }
      return;
    }

    if (ui.mode === 'erase') {
      if (e.buttons & 1) {
        const { x, y } = eventToGrid(e, 0);
        eraseAt(x, y);
      }
      return;
    }
    if (pendingMatKind && pendingMatGroup > 0) {
      const { x, y } = eventToGrid(e, 0);
      if (!matDragActive) {
        const dx = x - pendingMatDown.x;
        const dy = y - pendingMatDown.y;
        if (Math.hypot(dx, dy) > TOGGLE_DRAG_THRESHOLD) {
          // Promote to translate-drag using the original press as the origin
          // (so the grab point under the cursor stays under the cursor).
          beginMatTranslate(pendingMatDown.x, pendingMatDown.y);
        }
      }
      if (matDragActive) {
        updateMatTranslate(x, y);
        requestRender();
      }
      return;
    }
    if (placement.active) {
      const { x, y } = eventToGrid(e, 0);
      placement.current = { x, y };
      return;
    }
    if (polyDraw.active) {
      const { x, y } = eventToGrid(e, 0);
      polyUpdateCursor(x, y);
      requestRender();
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
        const probeHit = Probe.findNearest(rx, ry, PICK_RADIUS);
        if (probeHit >= 0) { closeChartFor(probeHit); Probe.remove(probeHit); History.commit(); requestRender(); return; }
        const hit = P.findNearest(rx, ry, PICK_RADIUS);
        if (hit >= 0) { Panel.openFor('particle', hit); return; }
        const bg = Body.getGroupAt(rx, ry);
        if (bg > 0) { Panel.openFor('body', bg); return; }
        const cg = Cond.getGroupAt(rx, ry);
        if (cg > 0) { Panel.openFor('conductor', cg); return; }
        const dg = Diel.getGroupAt(rx, ry);
        if (dg > 0) { Panel.openFor('dielectric', dg); return; }
        // Empty cell: add negative charge (no drag — right button already released)
        const cx2 = clamp(rx, PARTICLE_MARGIN, NX - 1 - PARTICLE_MARGIN);
        const cy2 = clamp(ry, PARTICLE_MARGIN, NY - 1 - PARTICLE_MARGIN);
        P.add(cx2, cy2, -getCharge());
        History.commit();
      }
      return;
    }

    // Probe: short click → toggle chart; drag already handled in pointermove.
    if (pendingProbe >= 0 && e.type !== 'pointercancel') {
      toggleChart(pendingProbe);
      requestRender();
    }
    pendingProbe = -1;
    probeDragActive = -1;

    if (pendingMatKind && pendingMatGroup > 0) {
      if (matDragActive) {
        History.commit();
      } else if (pendingMatKind === 'conductor') {
        // Quick click on conductor → toggle grounded/floating.
        Cond.toggleGrounded(pendingMatGroup);
        History.commit();
      }
      // Dielectric quick click is a no-op (right-click opens the panel).
      resetMatDrag();
    }
    if (placement.active) {
      const placed = finalizePlacement();
      placement.active = false;
      if (placed) History.commit();
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
