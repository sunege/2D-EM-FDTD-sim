export const NX = 224;
export const NY = 128;

export const DX = 1.0;
export const DY = 1.0;

export const C = 1.0;

export const DT = 0.5;

export const EPS0 = 1.0;

export const SIGMA = 5.0;
export const DEPOSIT_RADIUS = 10;

export const JACOBI_ITERS = 20;

export const VMAX = 0.70 * C;
export const K_DRAG = 0.05;
export const K_DAMP = 0.4;
export const PARTICLE_MARGIN = DEPOSIT_RADIUS + 2;

// Compute the largest integer pixel scale that fits NX×NY into the viewport.
// type="module" scripts run after HTML parsing (defer semantics), so the DOM
// and CSS layout are ready; getBoundingClientRect() returns accurate values.
function _computePixelScale(): number {
  const toolbar = document.getElementById('toolbar');
  const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 80;
  // #main has 16px padding on each side (32px total).
  const availW = window.innerWidth - 32;
  const availH = window.innerHeight - toolbarH - 32;
  return Math.max(1, Math.floor(Math.min(availW / NX, availH / NY)));
}
// eslint-disable-next-line prefer-const
export let PIXEL_SCALE = _computePixelScale();
export let CANVAS_W = NX * PIXEL_SCALE;
export let CANVAS_H = NY * PIXEL_SCALE;

// Recompute canvas dimensions on window resize. Returns true if the scale changed.
export function resizeToViewport(): boolean {
  const next = _computePixelScale();
  if (next === PIXEL_SCALE) return false;
  PIXEL_SCALE = next;
  CANVAS_W = NX * PIXEL_SCALE;
  CANVAS_H = NY * PIXEL_SCALE;
  return true;
}

export const VECTOR_STRIDE = 4;

export const BZ_SCALE = 0.05;
export const BZ_THRESHOLD = 0.005;

export const HIGHPASS_ALPHA = 0.02;

export const SIGMA_CONDUCTOR_DEFAULT = 2.5;
export const SIGMA_CONDUCTOR_MIN = 0.05;
export const SIGMA_CONDUCTOR_MAX = 5.0;

export const EPS_R_MIN = 1.0;
export const EPS_R_MAX = 4.0;
export const EPS_R_DEFAULT = 2.5;
