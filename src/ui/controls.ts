import * as Highpass from '../render/highpass';
import * as Cond from '../sim/conductors';
import { SIGMA_CONDUCTOR_DEFAULT, EPS_R_DEFAULT } from '../config';

// Module-level handles so external callers (e.g. scene loader) can push
// state→DOM after mutating ui.state directly.
let showStaticEl: HTMLInputElement | null = null;
let showWaveEl: HTMLInputElement | null = null;
let highpassEl: HTMLInputElement | null = null;
let showEquipotEl: HTMLInputElement | null = null;
let modeBtnsRef: Record<Mode, HTMLButtonElement> | null = null;
let shapeBtnsRef: Record<Shape, HTMLButtonElement> | null = null;

// Subscribers notified when mode or shape changes. Used by input.ts to cancel
// an in-progress polygon draw when the user switches tools.
type ChangeHandler = () => void;
const modeOrShapeListeners: ChangeHandler[] = [];
export function onModeOrShapeChange(fn: ChangeHandler): void {
  modeOrShapeListeners.push(fn);
}
function notifyModeOrShapeChange(): void {
  for (const fn of modeOrShapeListeners) fn();
}

export function applyUIToggles(): void {
  if (showStaticEl) showStaticEl.checked = state.showStatic;
  if (showWaveEl) showWaveEl.checked = state.showWave;
  if (highpassEl) {
    highpassEl.checked = state.highpass;
    Highpass.setEnabled(state.highpass);
  }
  if (showEquipotEl) showEquipotEl.checked = state.showEquipot;
}

// Update ui.state.mode and reflect it in the toolbar buttons. Exported so
// scene loading can switch to a safe default after replacing the scene.
export function setMode(m: Mode): void {
  const changed = state.mode !== m;
  state.mode = m;
  if (modeBtnsRef) {
    (Object.keys(modeBtnsRef) as Mode[]).forEach((k) => {
      modeBtnsRef![k].classList.toggle('active', k === m);
    });
  }
  if (shapeBtnsRef) {
    const shapeNeeded = m === 'conductor' || m === 'dielectric' || m === 'body';
    (Object.keys(shapeBtnsRef) as Shape[]).forEach((k) => {
      shapeBtnsRef![k].disabled = !shapeNeeded;
    });
  }
  if (changed) notifyModeOrShapeChange();
}

export type Mode = 'charge' | 'body' | 'conductor' | 'dielectric' | 'probe' | 'erase';
export type Shape = 'rect' | 'disk' | 'annulus' | 'polygon';

export const state = {
  charge: 5,
  paused: false,
  showStatic: true,
  showWave: true,
  highpass: true,
  showEquipot: false,
  simSpeed: 1,
  mode: 'charge' as Mode,
  shape: 'rect' as Shape,
  sigma: SIGMA_CONDUCTOR_DEFAULT,
  epsR: EPS_R_DEFAULT,
  oscFreq: 0.08,
  oscAmp: 6.0,
  oscAngleDeg: 0,
};

type ResetHandler = () => void;

export function setup(onReset: ResetHandler): void {
  const chargeEl = document.getElementById('charge') as HTMLInputElement;
  const chargeVal = document.getElementById('chargeVal') as HTMLSpanElement;
  const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset') as HTMLButtonElement;
  const showStatic = document.getElementById('showStatic') as HTMLInputElement;
  const showWave = document.getElementById('showWave') as HTMLInputElement;
  const highpass = document.getElementById('highpass') as HTMLInputElement;
  showStaticEl = showStatic;
  showWaveEl = showWave;
  highpassEl = highpass;
  const speedEl = document.getElementById('speed') as HTMLInputElement;
  const speedVal = document.getElementById('speedVal') as HTMLSpanElement;

  const updateChargeLabel = () => {
    const v = state.charge;
    chargeVal.textContent = (v >= 0 ? '+' : '') + v.toFixed(1);
  };

  state.charge = parseFloat(chargeEl.value);
  updateChargeLabel();

  chargeEl.addEventListener('input', () => {
    state.charge = parseFloat(chargeEl.value);
    updateChargeLabel();
  });

  const togglePause = () => {
    state.paused = !state.paused;
    pauseBtn.textContent = state.paused ? '再開' : '一時停止';
  };

  pauseBtn.addEventListener('click', togglePause);

  document.addEventListener('keydown', (e) => {
    if ((e.target as Element).tagName === 'INPUT') return;
    if (e.code === 'Space') { e.preventDefault(); togglePause(); }
    if (e.code === 'KeyR') { e.preventDefault(); onReset(); }
  });

  resetBtn.addEventListener('click', () => {
    onReset();
  });

  showStatic.addEventListener('change', () => {
    state.showStatic = showStatic.checked;
  });
  showWave.addEventListener('change', () => {
    state.showWave = showWave.checked;
  });

  state.highpass = highpass.checked;
  Highpass.setEnabled(state.highpass);
  highpass.addEventListener('change', () => {
    state.highpass = highpass.checked;
    Highpass.setEnabled(state.highpass);
  });

  const updateSpeedLabel = () => {
    speedVal.textContent = `×${parseFloat(speedEl.value).toFixed(2)}`;
  };
  state.simSpeed = parseFloat(speedEl.value);
  updateSpeedLabel();
  speedEl.addEventListener('input', () => {
    state.simSpeed = parseFloat(speedEl.value);
    updateSpeedLabel();
  });

  modeBtnsRef = {
    charge: document.getElementById('modeCharge') as HTMLButtonElement,
    body: document.getElementById('modeBody') as HTMLButtonElement,
    conductor: document.getElementById('modeConductor') as HTMLButtonElement,
    dielectric: document.getElementById('modeDielectric') as HTMLButtonElement,
    probe: document.getElementById('modeProbe') as HTMLButtonElement,
    erase: document.getElementById('modeErase') as HTMLButtonElement,
  };
  shapeBtnsRef = {
    rect: document.getElementById('shapeRect') as HTMLButtonElement,
    disk: document.getElementById('shapeDisk') as HTMLButtonElement,
    annulus: document.getElementById('shapeAnnulus') as HTMLButtonElement,
    polygon: document.getElementById('shapePolygon') as HTMLButtonElement,
  };
  const modeBtns = modeBtnsRef;
  const shapeBtns = shapeBtnsRef;

  const showEquipot = document.getElementById('showEquipot') as HTMLInputElement;
  showEquipotEl = showEquipot;

  (Object.keys(modeBtns) as Mode[]).forEach((m) => {
    modeBtns[m].addEventListener('click', () => setMode(m));
  });

  const setShape = (s: Shape): void => {
    const changed = state.shape !== s;
    state.shape = s;
    (Object.keys(shapeBtns) as Shape[]).forEach((k) => {
      shapeBtns[k].classList.toggle('active', k === s);
    });
    if (changed) notifyModeOrShapeChange();
  };
  (Object.keys(shapeBtns) as Shape[]).forEach((s) => {
    shapeBtns[s].addEventListener('click', () => setShape(s));
  });

  Cond.setSigma(state.sigma);

  // Equipotential toggle
  state.showEquipot = showEquipot.checked;
  showEquipot.addEventListener('change', () => {
    state.showEquipot = showEquipot.checked;
  });

  setMode(state.mode);
}
