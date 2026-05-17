// Render-on-demand flag for paused mode. When running, the main loop renders
// unconditionally; when paused, it only renders if a request has been queued
// since the last frame (typically from a user interaction).
let needed = true;

export function requestRender(): void {
  needed = true;
}

export function consumeRender(): boolean {
  const r = needed;
  needed = false;
  return r;
}
