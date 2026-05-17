let cap = 256;

export let px = new Float32Array(cap);
export let py = new Float32Array(cap);
export let vx = new Float32Array(cap);
export let vy = new Float32Array(cap);
export let ax = new Float32Array(cap);
export let ay = new Float32Array(cap);
export let q = new Float32Array(cap);
export let alive = new Uint8Array(cap);

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
  const newAlive = new Uint8Array(newCap);
  newAlive.set(alive);
  alive = newAlive;
  cap = newCap;
}

export function getCapacity(): number {
  return cap;
}

export function add(x: number, y: number, charge: number): number {
  for (let i = 0; i < n; i++) {
    if (!alive[i]) {
      px[i] = x; py[i] = y;
      vx[i] = 0; vy[i] = 0;
      ax[i] = 0; ay[i] = 0;
      q[i] = charge;
      alive[i] = 1;
      return i;
    }
  }
  if (n >= cap) grow();
  const i = n++;
  px[i] = x; py[i] = y;
  vx[i] = 0; vy[i] = 0;
  ax[i] = 0; ay[i] = 0;
  q[i] = charge;
  alive[i] = 1;
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
