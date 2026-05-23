// Polygon helpers shared by conductors/dielectric/body modules and the input
// layer. Points are stored as flat [x0, y0, x1, y1, ...] for cache friendliness
// and easy JSON round-tripping. All polygons are assumed simple (non-self-
// intersecting) — the input layer enforces this on construction.

export interface BBox { i0: number; i1: number; j0: number; j1: number; }

export type PointArray = ArrayLike<number>;

// Cell-index AABB for a polygon, clipped to the grid (caller passes NX/NY).
export function polygonBBox(points: PointArray, nx: number, ny: number): BBox {
  let xmin = Infinity, xmax = -Infinity, ymin = Infinity, ymax = -Infinity;
  for (let k = 0; k < points.length; k += 2) {
    const x = points[k], y = points[k + 1];
    if (x < xmin) xmin = x;
    if (x > xmax) xmax = x;
    if (y < ymin) ymin = y;
    if (y > ymax) ymax = y;
  }
  return {
    i0: Math.max(0, Math.floor(xmin)),
    i1: Math.min(nx - 1, Math.ceil(xmax)),
    j0: Math.max(0, Math.floor(ymin)),
    j1: Math.min(ny - 1, Math.ceil(ymax)),
  };
}

// Cell-center point-in-polygon (even-odd rule via horizontal ray).
// `x`, `y` are continuous coords; for a grid cell use (i + 0.5, j + 0.5).
export function pointInPolygon(points: PointArray, x: number, y: number): boolean {
  let inside = false;
  const n = points.length;
  for (let i = 0, j = n - 2; i < n; j = i, i += 2) {
    const xi = points[i],     yi = points[i + 1];
    const xj = points[j],     yj = points[j + 1];
    // Standard ray-casting; the cell-center sampling means we never hit an
    // edge exactly, so the usual tie-breaking concerns don't apply here.
    if (((yi > y) !== (yj > y)) &&
        (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

// Iterate every cell whose center is inside `points`, calling `visit(i, j)`.
// Uses cell-center even-odd scanline fill. `points` is flat [x0,y0,x1,y1,...].
export function rasterizePolygon(
  points: PointArray,
  nx: number,
  ny: number,
  visit: (i: number, j: number) => void,
): void {
  const bbox = polygonBBox(points, nx, ny);
  const n = points.length;
  if (n < 6) return; // need at least 3 vertices

  // Scanline at y = j + 0.5 for each row in the bbox.
  const xs: number[] = [];
  for (let j = bbox.j0; j <= bbox.j1; j++) {
    const y = j + 0.5;
    xs.length = 0;
    for (let a = 0, b = n - 2; a < n; b = a, a += 2) {
      const ya = points[a + 1], yb = points[b + 1];
      // Edge crosses scanline iff (ya > y) !== (yb > y). This excludes purely
      // horizontal edges and treats endpoints consistently.
      if ((ya > y) !== (yb > y)) {
        const xa = points[a], xb = points[b];
        const t = (y - ya) / (yb - ya);
        xs.push(xa + t * (xb - xa));
      }
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let s = 0; s + 1 < xs.length; s += 2) {
      const xl = xs[s], xr = xs[s + 1];
      const i0 = Math.max(bbox.i0, Math.ceil(xl - 0.5));
      const i1 = Math.min(bbox.i1, Math.floor(xr - 0.5));
      for (let i = i0; i <= i1; i++) visit(i, j);
    }
  }
}

// Proper segment-segment intersection test that treats shared endpoints as
// non-intersection (important since consecutive polygon edges always share a
// vertex). Returns true only when the interiors cross.
export function segmentsIntersect(
  ax: number, ay: number, bx: number, by: number,
  cx: number, cy: number, dx: number, dy: number,
): boolean {
  const d1 = orient(cx, cy, dx, dy, ax, ay);
  const d2 = orient(cx, cy, dx, dy, bx, by);
  const d3 = orient(ax, ay, bx, by, cx, cy);
  const d4 = orient(ax, ay, bx, by, dx, dy);
  // Proper crossing: strict opposite signs on both pairs.
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
      ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }
  // Collinear overlap: if any endpoint lies strictly inside the other segment.
  // Endpoint-equal is allowed (shared vertex), so check open interior only.
  if (d1 === 0 && onSegmentStrict(cx, cy, dx, dy, ax, ay)) return true;
  if (d2 === 0 && onSegmentStrict(cx, cy, dx, dy, bx, by)) return true;
  if (d3 === 0 && onSegmentStrict(ax, ay, bx, by, cx, cy)) return true;
  if (d4 === 0 && onSegmentStrict(ax, ay, bx, by, dx, dy)) return true;
  return false;
}

function orient(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

// Point (px, py) is strictly between segment endpoints (ax,ay)-(bx,by),
// excluding the endpoints themselves. Caller has verified collinearity.
function onSegmentStrict(ax: number, ay: number, bx: number, by: number, px: number, py: number): boolean {
  const eq = (a: number, b: number) => a === b;
  if (eq(px, ax) && eq(py, ay)) return false;
  if (eq(px, bx) && eq(py, by)) return false;
  const minX = Math.min(ax, bx), maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by), maxY = Math.max(ay, by);
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

// Geometric centroid via the shoelace formula. Falls back to the bbox center
// if the polygon is degenerate (zero signed area), which shouldn't happen for
// valid (non-self-intersecting) polygons of ≥3 vertices but guards anyway.
export function polygonCentroid(points: PointArray): { cx: number; cy: number } {
  const n = points.length;
  let area2 = 0, cx = 0, cy = 0;
  for (let a = 0, b = n - 2; a < n; b = a, a += 2) {
    const x0 = points[b], y0 = points[b + 1];
    const x1 = points[a], y1 = points[a + 1];
    const cross = x0 * y1 - x1 * y0;
    area2 += cross;
    cx += (x0 + x1) * cross;
    cy += (y0 + y1) * cross;
  }
  if (area2 === 0) {
    const bb = polygonBBox(points, Infinity, Infinity);
    return { cx: (bb.i0 + bb.i1) * 0.5, cy: (bb.j0 + bb.j1) * 0.5 };
  }
  return { cx: cx / (3 * area2), cy: cy / (3 * area2) };
}
