// Scene serialization: capture placement-time state (positions, shapes,
// charges, ε_r, σ, grounded flag, oscillator params, probes, UI toggles) as
// a JSON-friendly object. Physics state (velocities, FDTD/Poisson buffers,
// charge history) is intentionally discarded — `deserialize` rebuilds from a
// clean reset.

import * as P from './particles';
import * as Body from './chargedBody';
import * as Cond from './conductors';
import * as Diel from './dielectric';
import * as Probe from './probe';
import { NX, NY } from '../config';
import { state as ui } from '../ui/controls';

export const SCENE_VERSION = 1;

export interface OscillatorJSON {
  omega: number;   // rad per Δt (matches the internal setOscillator signature)
  amp: number;
  angleDeg: number;
}

export interface ParticleJSON {
  x: number;
  y: number;
  q: number;
  oscillator: OscillatorJSON | null;
}

type BodyShape =
  | { kind: 'disk'; cx: number; cy: number; r: number }
  | { kind: 'annulus'; cx: number; cy: number; rOuter: number; rInner: number }
  | { kind: 'rect'; cx: number; cy: number; halfW: number; halfH: number }
  | { kind: 'polygon'; cx: number; cy: number; points: number[] };

export interface BodyJSON {
  shape: BodyShape;
  Q: number;
  oscillator: OscillatorJSON | null;
}

export interface ConductorGroupJSON {
  shapes: Cond.ConductorShape[];
  grounded: boolean;
  sigma: number;
}

export interface DielectricGroupJSON {
  shapes: Diel.DielectricShape[];
}

export interface ProbeJSON { x: number; y: number; }

export interface UIToggles {
  showStatic: boolean;
  showWave: boolean;
  highpass: boolean;
  showEquipot: boolean;
}

export interface SceneJSON {
  version: number;
  grid: { nx: number; ny: number };
  particles: ParticleJSON[];
  bodies: BodyJSON[];
  conductors: ConductorGroupJSON[];
  dielectrics: DielectricGroupJSON[];
  probes: ProbeJSON[];
  ui: UIToggles;
}

function angleDegFromDir(dx: number, dy: number): number {
  return Math.atan2(dy, dx) * 180 / Math.PI;
}

function particleOscillator(i: number): OscillatorJSON | null {
  if (P.omega[i] <= 0) return null;
  return {
    omega: P.omega[i],
    amp: P.amp[i],
    angleDeg: angleDegFromDir(P.dirX[i], P.dirY[i]),
  };
}

function bodyOscillator(g: number): OscillatorJSON | null {
  const w = Body.getOmega(g);
  if (w <= 0) return null;
  return {
    omega: w,
    amp: Body.getAmp(g),
    angleDeg: angleDegFromDir(Body.getDirX(g), Body.getDirY(g)),
  };
}

function serializeBody(g: number): BodyJSON {
  const s = Body.getShape(g);
  // For oscillators, use the equilibrium point as the body's "placement"
  // location so reload pins it back at the same eq instead of wherever the
  // phase happened to be when serialized.
  const osc = bodyOscillator(g);
  const cx = osc ? Body.getEqX(g) : Body.getCx(g);
  const cy = osc ? Body.getEqY(g) : Body.getCy(g);
  let shape: BodyShape;
  if (s === Body.SHAPE_DISK) {
    shape = { kind: 'disk', cx, cy, r: Body.getParam1(g) };
  } else if (s === Body.SHAPE_ANNULUS) {
    shape = { kind: 'annulus', cx, cy, rOuter: Body.getParam1(g), rInner: Body.getParam2(g) };
  } else if (s === Body.SHAPE_POLYGON) {
    const rel = Body.getPolygonPoints(g);
    // Re-anchor polygon points around the serialized (cx, cy) so reload places
    // them in the same on-grid location regardless of phase.
    const pts: number[] = [];
    if (rel) {
      for (let k = 0; k < rel.length; k += 2) {
        pts.push(rel[k] + cx, rel[k + 1] + cy);
      }
    }
    shape = { kind: 'polygon', cx, cy, points: pts };
  } else {
    shape = { kind: 'rect', cx, cy, halfW: Body.getParam1(g), halfH: Body.getParam2(g) };
  }
  return { shape, Q: Body.getQ(g), oscillator: osc };
}

export function serialize(): SceneJSON {
  const particles: ParticleJSON[] = [];
  for (let i = 0; i < P.n; i++) {
    if (!P.alive[i]) continue;
    const osc = particleOscillator(i);
    particles.push({
      x: osc ? P.eqX[i] : P.px[i],
      y: osc ? P.eqY[i] : P.py[i],
      q: P.q[i],
      oscillator: osc,
    });
  }

  const bodies: BodyJSON[] = Body.getActiveGroupIds().map(serializeBody);

  const conductors: ConductorGroupJSON[] = Cond.getActiveGroupIds().map((g) => ({
    shapes: Cond.getGroupShapes(g).slice(),
    grounded: Cond.isGrounded(g),
    sigma: Cond.getGroupSigma(g),
  }));

  const dielectrics: DielectricGroupJSON[] = Diel.getActiveGroupIds().map((g) => ({
    shapes: Diel.getGroupShapes(g).slice(),
  }));

  const probes: ProbeJSON[] = [];
  for (let p = 0; p < Probe.MAX_PROBES; p++) {
    if (!Probe.isUsed(p)) continue;
    probes.push({ x: Probe.getX(p), y: Probe.getY(p) });
  }

  return {
    version: SCENE_VERSION,
    grid: { nx: NX, ny: NY },
    particles,
    bodies,
    conductors,
    dielectrics,
    probes,
    ui: {
      showStatic: ui.showStatic,
      showWave: ui.showWave,
      highpass: ui.highpass,
      showEquipot: ui.showEquipot,
    },
  };
}

function deg2rad(d: number): number { return d * Math.PI / 180; }

// reset() in main.ts wipes simulation modules. We accept it as a callback so
// scene.ts stays free of render/UI imports beyond `controls.state`.
export function deserialize(scene: SceneJSON, reset: () => void): { warnings: string[] } {
  const warnings: string[] = [];
  if (typeof scene !== 'object' || scene === null) {
    throw new Error('シーンデータが不正です（オブジェクトではありません）');
  }
  if (scene.version !== SCENE_VERSION) {
    warnings.push(`シーンバージョンが異なります (file=${scene.version}, app=${SCENE_VERSION})。互換性問題がある可能性があります。`);
  }
  if (scene.grid && (scene.grid.nx !== NX || scene.grid.ny !== NY)) {
    warnings.push(`グリッドサイズが異なります (file=${scene.grid.nx}×${scene.grid.ny}, app=${NX}×${NY})。配置がはみ出る場合は自動的にクリップされます。`);
  }

  reset();

  // Conductors first — body deposition skips cells inside conductors, so the
  // mask needs to be in place before bodies run their first deposit() call.
  for (const c of scene.conductors ?? []) {
    let g = 0;
    for (const s of c.shapes) {
      if (s.kind === 'disk') g = Cond.addDisk(s.cx, s.cy, s.r);
      else if (s.kind === 'annulus') g = Cond.addAnnulus(s.cx, s.cy, s.rOuter, s.rInner);
      else if (s.kind === 'polygon') g = Cond.addPolygon(s.points);
      else g = Cond.addRect(s.x0, s.y0, s.x1, s.y1);
    }
    if (g > 0) {
      Cond.setGroupSigma(g, c.sigma);
      // addX defaults to grounded; toggle if the saved state is floating.
      if (!c.grounded) Cond.toggleGrounded(g);
    }
  }

  for (const d of scene.dielectrics ?? []) {
    for (const s of d.shapes) {
      if (s.kind === 'disk') Diel.addDisk(s.cx, s.cy, s.r, s.epsR);
      else if (s.kind === 'annulus') Diel.addAnnulus(s.cx, s.cy, s.rOuter, s.rInner, s.epsR);
      else if (s.kind === 'polygon') Diel.addPolygon(s.points, s.epsR);
      else Diel.addRect(s.x0, s.y0, s.x1, s.y1, s.epsR);
    }
  }

  for (const b of scene.bodies ?? []) {
    let g = 0;
    const s = b.shape;
    if (s.kind === 'disk') g = Body.addDisk(s.cx, s.cy, s.r, b.Q);
    else if (s.kind === 'annulus') g = Body.addAnnulus(s.cx, s.cy, s.rOuter, s.rInner, b.Q);
    else if (s.kind === 'polygon') g = Body.addPolygon(s.points, b.Q);
    else g = Body.addRect(s.cx - s.halfW, s.cy - s.halfH, s.cx + s.halfW, s.cy + s.halfH, b.Q);
    if (g > 0 && b.oscillator) {
      Body.setOscillator(g, b.oscillator.omega, b.oscillator.amp, deg2rad(b.oscillator.angleDeg));
    }
  }

  for (const p of scene.particles ?? []) {
    const i = P.add(p.x, p.y, p.q);
    if (i >= 0 && p.oscillator) {
      P.setOscillator(i, p.oscillator.omega, p.oscillator.amp, deg2rad(p.oscillator.angleDeg));
    }
  }

  for (const pr of scene.probes ?? []) {
    Probe.add(pr.x, pr.y);
  }

  if (scene.ui) {
    ui.showStatic = scene.ui.showStatic;
    ui.showWave = scene.ui.showWave;
    ui.highpass = scene.ui.highpass;
    ui.showEquipot = scene.ui.showEquipot;
  }

  return { warnings };
}
