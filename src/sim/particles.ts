let cap = 256;

export let px = new Float32Array(cap);
export let py = new Float32Array(cap);
export let vx = new Float32Array(cap);
export let vy = new Float32Array(cap);
export let ax = new Float32Array(cap);
export let ay = new Float32Array(cap);
export let q = new Float32Array(cap);
export let alive = new Uint8Array(cap);

// Per-particle oscillator state. omega == 0 → non-oscillating (drag-driven,
// inertial). When omega > 0 the particle's position and velocity are driven
// kinematically by sin(phase) around (eqX, eqY) — mirrors chargedBody.
export let omega = new Float32Array(cap);
export let amp = new Float32Array(cap);
export let dirX = new Float32Array(cap);
export let dirY = new Float32Array(cap);
export let phase = new Float32Array(cap);
export let eqX = new Float32Array(cap);
export let eqY = new Float32Array(cap);

export let n = 0;

function grow(): void {
  const newCap = cap * 2;
  const grow1 = (src: Float32Array) => {
    const dst = new Float32Array(newCap);
    dst.set(src);
    return dst;
  };
  px = grow1(px); py = grow1(py);
  vx = grow1(vx); vy = grow1(vy);
  ax = grow1(ax); ay = grow1(ay);
  q = grow1(q);
  omega = grow1(omega); amp = grow1(amp);
  dirX = grow1(dirX); dirY = grow1(dirY);
  phase = grow1(phase);
  eqX = grow1(eqX); eqY = grow1(eqY);
  const newAlive = new Uint8Array(newCap);
  newAlive.set(alive);
  alive = newAlive;
  cap = newCap;
}

export function getCapacity(): number {
  return cap;
}

function resetSlot(i: number, x: number, y: number, charge: number): void {
  px[i] = x; py[i] = y;
  vx[i] = 0; vy[i] = 0;
  ax[i] = 0; ay[i] = 0;
  q[i] = charge;
  omega[i] = 0; amp[i] = 0;
  dirX[i] = 1; dirY[i] = 0;
  phase[i] = 0;
  eqX[i] = x; eqY[i] = y;
  alive[i] = 1;
}

export function add(x: number, y: number, charge: number): number {
  for (let i = 0; i < n; i++) {
    if (!alive[i]) {
      resetSlot(i, x, y, charge);
      return i;
    }
  }
  if (n >= cap) grow();
  const i = n++;
  resetSlot(i, x, y, charge);
  return i;
}

export function remove(i: number): void {
  if (i >= 0 && i < n) alive[i] = 0;
}

export function clear(): void {
  for (let i = 0; i < n; i++) alive[i] = 0;
  n = 0;
}

export function findNearest(x: number, y: number, maxDist: number): number {
  let best = -1;
  let bestD2 = maxDist * maxDist;
  for (let i = 0; i < n; i++) {
    if (!alive[i]) continue;
    const dx = px[i] - x;
    const dy = py[i] - y;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = i;
    }
  }
  return best;
}

export function isOscillating(i: number): boolean {
  return i >= 0 && i < n && alive[i] === 1 && omega[i] > 0;
}

// Enable oscillation with eq pinned at current (px, py) and phase reset to 0.
// Use this for the "turn on" transition (placement or panel toggle).
export function setOscillator(i: number, omegaVal: number, ampVal: number, angleRad: number): void {
  if (i < 0 || i >= n || !alive[i]) return;
  omega[i] = omegaVal;
  amp[i] = ampVal;
  dirX[i] = Math.cos(angleRad);
  dirY[i] = Math.sin(angleRad);
  phase[i] = 0;
  eqX[i] = px[i];
  eqY[i] = py[i];
}

// Update oscillator params without resetting phase or equilibrium. Use this
// for live slider edits on an already-running oscillator (avoids jumps).
export function updateOscillator(i: number, omegaVal: number, ampVal: number, angleRad: number): void {
  if (i < 0 || i >= n || !alive[i]) return;
  omega[i] = omegaVal;
  amp[i] = ampVal;
  dirX[i] = Math.cos(angleRad);
  dirY[i] = Math.sin(angleRad);
}

export function clearOscillator(i: number): void {
  if (i < 0 || i >= n || !alive[i]) return;
  omega[i] = 0;
  amp[i] = 0;
  phase[i] = 0;
  // Snap velocity to zero so the particle doesn't fly off with whatever
  // analytic velocity it last had.
  vx[i] = 0; vy[i] = 0;
}
