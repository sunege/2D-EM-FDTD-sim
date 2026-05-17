import * as Highpass from '../render/highpass';
import * as Cond from '../sim/conductors';
import { SIGMA_CONDUCTOR_DEFAULT, EPS_R_DEFAULT } from '../config';

export type Mode = 'charge' | 'body' | 'conductor' | 'dielectric' | 'erase';
export type Shape = 'rect' | 'disk' | 'annulus';

export const state = {
  charge: 5,
  paused: false,
  showStatic: true,
  showWave: true,
  highpass: true,
  simSpeed: 1,
  mode: 'charge' as Mode,
  shape: 'rect' as Shape,
  sigma: SIGMA_CONDUCTOR_DEFAULT,
  epsR: EPS_R_DEFAULT,
};

type ResetHandler = () => void;

export function setup(onReset: ResetHandler): void {
  const chargeEl = document.getElementById('charge') as HTMLInputElement;
  const chargeVal = document.getElementById('chargeVal') as HTMLSpanElement;
  const pauseBtn = document.getElementById('pause') as HTMLButtonElement;
  const resetBtn = document.getElementById('reset') as HTMLButtonElement;
  const showStaticEl = document.getElementById('showStatic') as HTMLInputElement;
  const showWaveEl = document.getElementById('showWave') as HTMLInputElement;
  const highpassEl = document.getElementById('highpass') as HTMLInputElement;
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

  showStaticEl.addEventListener('change', () => {
    state.showStatic = showStaticEl.checked;
  });
  showWaveEl.addEventListener('change', () => {
    state.showWave = showWaveEl.checked;
  });

  state.highpass = highpassEl.checked;
  Highpass.setEnabled(state.highpass);
  highpassEl.addEventListener('change', () => {
    state.highpass = highpassEl.checked;
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

  const modeBtns: Record<Mode, HTMLButtonElement> = {
    charge: document.getElementById('modeCharge') as HTMLButtonElement,
    body: document.getElementById('modeBody') as HTMLButtonElement,
    conductor: document.getElementById('modeConductor') as HTMLButtonElement,
    dielectric: document.getElementById('modeDielectric') as HTMLButtonElement,
    erase: document.getElementById('modeErase') as HTMLButtonElement,
  };
  const shapeBtns: Record<Shape, HTMLButtonElement> = {
    rect: document.getElementById('shapeRect') as HTMLButtonElement,
    disk: document.getElementById('shapeDisk') as HTMLButtonElement,
    annulus: document.getElementById('shapeAnnulus') as HTMLButtonElement,
  };

  const sigmaEl = document.getElementById('sigma') as HTMLInputElement;
  const sigmaVal = document.getElementById('sigmaVal') as HTMLSpanElement;
  const epsrEl = document.getElementById('epsr') as HTMLInputElement;
  const epsrVal = document.getElementById('epsrVal') as HTMLSpanElement;

  const refreshModeAffordances = (): void => {
    // Shape sub-mode is meaningful when placing a material or a charged body.
    const shapeNeeded =
      state.mode === 'conductor' || state.mode === 'dielectric' || state.mode === 'body';
    (Object.keys(shapeBtns) as Shape[]).forEach((k) => {
      shapeBtns[k].disabled = !shapeNeeded;
    });
    sigmaEl.disabled = state.mode !== 'conductor';
    epsrEl.disabled = state.mode !== 'dielectric';
  };

  const setMode = (m: Mode): void => {
    state.mode = m;
    (Object.keys(modeBtns) as Mode[]).forEach((k) => {
      modeBtns[k].classList.toggle('active', k === m);
    });
    refreshModeAffordances();
  };
  (Object.keys(modeBtns) as Mode[]).forEach((m) => {
    modeBtns[m].addEventListener('click', () => setMode(m));
  });

  const setShape = (s: Shape): void => {
    state.shape = s;
    (Object.keys(shapeBtns) as Shape[]).forEach((k) => {
      shapeBtns[k].classList.toggle('active', k === s);
    });
  };
  (Object.keys(shapeBtns) as Shape[]).forEach((s) => {
    shapeBtns[s].addEventListener('click', () => setShape(s));
  });

  const updateSigma = (): void => {
    const v = parseFloat(sigmaEl.value);
    state.sigma = v;
    sigmaVal.textContent = v.toFixed(2);
    Cond.setSigma(v);
  };
  sigmaEl.value = String(SIGMA_CONDUCTOR_DEFAULT);
  updateSigma();
  sigmaEl.addEventListener('input', updateSigma);

  const updateEpsr = (): void => {
    const v = parseFloat(epsrEl.value);
    state.epsR = v;
    epsrVal.textContent = v.toFixed(1);
  };
  epsrEl.value = String(EPS_R_DEFAULT);
  updateEpsr();
  epsrEl.addEventListener('input', updateEpsr);

  refreshModeAffordances();
}
