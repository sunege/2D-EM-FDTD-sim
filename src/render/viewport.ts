import { PIXEL_SCALE } from '../config';

export let zoom = 1;
export let panX = 0;
export let panY = 0;

export function getZoom(): number { return zoom; }

export function reset(): void {
  zoom = 1;
  panX = 0;
  panY = 0;
}

export function zoomAt(factor: number, cx: number, cy: number): void {
  const newZoom = Math.max(0.25, Math.min(8, zoom * factor));
  panX = cx - (cx - panX) * (newZoom / zoom);
  panY = cy - (cy - panY) * (newZoom / zoom);
  zoom = newZoom;
}

export function pan(dx: number, dy: number): void {
  panX += dx;
  panY += dy;
}

export function canvasToGrid(cx: number, cy: number): { x: number; y: number } {
  return {
    x: (cx - panX) / zoom / PIXEL_SCALE,
    y: (cy - panY) / zoom / PIXEL_SCALE,
  };
}
