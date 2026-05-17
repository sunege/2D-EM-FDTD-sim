import { NX, NY, CANVAS_W, CANVAS_H } from '../config';

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
    x: gx * (CANVAS_W / NX),
    y: gy * (CANVAS_H / NY),
  };
}

export function canvasToGrid(cx: number, cy: number): { x: number; y: number } {
  return {
    x: cx / (CANVAS_W / NX),
    y: cy / (CANVAS_H / NY),
  };
}
