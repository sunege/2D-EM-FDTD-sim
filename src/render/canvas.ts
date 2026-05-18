import { NX, NY, CANVAS_W, CANVAS_H, PIXEL_SCALE } from '../config';
import { canvasToGrid as viewportCanvasToGrid } from './viewport';

export const canvas = document.getElementById('canvas') as HTMLCanvasElement;
canvas.width = CANVAS_W;
canvas.height = CANVAS_H;

export const ctx = canvas.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;
ctx.imageSmoothingEnabled = false;

export const cellImage = ctx.createImageData(NX, NY);

export const offscreen = document.createElement('canvas');
offscreen.width = NX;
offscreen.height = NY;
export const offCtx = offscreen.getContext('2d', { alpha: false }) as CanvasRenderingContext2D;

export function gridToCanvas(gx: number, gy: number): { x: number; y: number } {
  return {
    x: gx * PIXEL_SCALE,
    y: gy * PIXEL_SCALE,
  };
}

export function canvasToGrid(cx: number, cy: number): { x: number; y: number } {
  return viewportCanvasToGrid(cx, cy);
}

// Compute CSS display size that fills the viewport while preserving aspect ratio.
export function getCSSSize(): { w: number; h: number } {
  const toolbar = document.getElementById('toolbar');
  const toolbarH = toolbar ? toolbar.getBoundingClientRect().height : 80;
  const availW = window.innerWidth - 32;
  const availH = window.innerHeight - toolbarH - 32;
  const scale = Math.min(availW / canvas.width, availH / canvas.height);
  return { w: Math.round(canvas.width * scale), h: Math.round(canvas.height * scale) };
}

function applyCSS(): void {
  const { w, h } = getCSSSize();
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
}

// Apply CSS size at module init so the canvas fills the viewport immediately.
applyCSS();

// Update the main canvas size after a PIXEL_SCALE change. Resizing resets all
// context state, so imageSmoothingEnabled must be restored.
export function resize(): void {
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  ctx.imageSmoothingEnabled = false;
  applyCSS();
}

// Call this when window resizes but PIXEL_SCALE (and thus canvas pixel dims) did not change.
export function updateCSSSize(): void {
  applyCSS();
}
