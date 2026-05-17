import * as Highpass from '../render/highpass';
import * as Cond from '../sim/conductors';
import { SIGMA_CONDUCTOR_DEFAULT } from '../config';

export type Tool = 'charge' | 'disk' | 'annulus' | 'rect';

export const state = {
  charge: 5,
  paused: false,
  showStatic: true,
  showWave: true,
  highpass: true,
  simSpeed: 1,
  tool: 'charge' as Tool,
  sigma: SIGMA_CONDUCTOR_DEFAULT,
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

  const toolBtns: Record<Tool, HTMLButtonElement> = {
    charge: document.getElementById('toolCharge') as HTMLButtonElement,
    disk: document.getElementById('toolDisk') as HTMLButtonElement,
    annulus: document.getElementById('toolAnnulus') as HTMLButtonElement,
    rect: document.getElementById('toolRect') as HTMLButtonElement,
  };
  const setTool = (t: Tool): void => {
    state.tool = t;
    (Object.keys(toolBtns) as Tool[]).forEach((k) => {
      toolBtns[k].classList.toggle('active', k === t);
    });
  };
  (Object.keys(toolBtns) as Tool[]).forEach((t) => {
    toolBtns[t].addEventListener('click', () => setTool(t));
  });

  const sigmaEl = document.getElementById('sigma') as HTMLInputElement;
  const sigmaVal = document.getElementById('sigmaVal') as HTMLSpanElement;
  const updateSigma = (): void => {
    const v = parseFloat(sigmaEl.value);
    state.sigma = v;
    sigmaVal.textContent = v.toFixed(2);
    Cond.setSigma(v);
  };
  sigmaEl.value = String(SIGMA_CONDUCTOR_DEFAULT);
  updateSigma();
  sigmaEl.addEventListener('input', updateSigma);
}
