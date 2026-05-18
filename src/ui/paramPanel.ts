import * as P from '../sim/particles';
import * as Body from '../sim/chargedBody';
import * as Cond from '../sim/conductors';
import * as Diel from '../sim/dielectric';
import { state as ui } from './controls';
import { requestRender } from './render-request';
import {
  SIGMA_CONDUCTOR_MIN, SIGMA_CONDUCTOR_MAX,
  EPS_R_MIN, EPS_R_MAX,
} from '../config';

// Right-click parameter panel. Hidden by default; opens at a fixed right-side
// position when an existing entity is right-clicked. Edits hit simulation
// state directly so changes take effect on the next frame.

export type EntityKind = 'particle' | 'body' | 'conductor' | 'dielectric';

const panel = document.getElementById('paramPanel') as HTMLDivElement;

interface Selection { kind: EntityKind; id: number; }
let selection: Selection | null = null;

panel.innerHTML = `
  <div class="pp-header">
    <span class="pp-title">パラメータ</span>
    <button class="pp-close" type="button" aria-label="閉じる">×</button>
  </div>
  <div class="pp-body"></div>
`;
panel.style.display = 'none';

const titleEl = panel.querySelector('.pp-title') as HTMLElement;
const bodyEl = panel.querySelector('.pp-body') as HTMLElement;
const closeBtn = panel.querySelector('.pp-close') as HTMLButtonElement;
closeBtn.addEventListener('click', () => close());

// --- Row builders -----------------------------------------------------------

function rowSlider(
  label: string,
  min: number, max: number, step: number, value: number,
  onInput: (v: number) => void,
  fmt: (v: number) => string = (v) => v.toFixed(2),
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'pp-row';
  const lab = document.createElement('label');
  lab.textContent = label;
  const input = document.createElement('input');
  input.type = 'range';
  input.min = String(min); input.max = String(max); input.step = String(step);
  input.value = String(value);
  const val = document.createElement('span');
  val.className = 'pp-val';
  val.textContent = fmt(value);
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    val.textContent = fmt(v);
    onInput(v);
    requestRender();
  });
  row.append(lab, input, val);
  return row;
}

function rowCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'pp-row pp-row-check';
  const lab = document.createElement('label');
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.checked = checked;
  box.addEventListener('change', () => {
    onChange(box.checked);
    requestRender();
  });
  lab.append(box, document.createTextNode(' ' + label));
  row.append(lab);
  return row;
}

function rowButton(label: string, onClick: () => void): HTMLElement {
  const row = document.createElement('div');
  row.className = 'pp-row';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', () => {
    onClick();
    requestRender();
  });
  row.append(btn);
  return row;
}

function rowInfo(label: string, text: string): HTMLElement {
  const row = document.createElement('div');
  row.className = 'pp-row pp-row-info';
  const lab = document.createElement('label');
  lab.textContent = label;
  const span = document.createElement('span');
  span.textContent = text;
  row.append(lab, span);
  return row;
}

// --- Common: oscillator fields (particle and body share the same shape) ----

function angleDegFromDir(dirX: number, dirY: number): number {
  let d = Math.atan2(dirY, dirX) * 180 / Math.PI;
  if (d < 0) d += 180;
  if (d >= 180) d -= 180;
  return d;
}

interface OscAdapter {
  isOn(): boolean;
  enable(omega: number, amp: number, angleRad: number): void;
  disable(): void;
  update(omega: number, amp: number, angleRad: number): void;
  getOmega(): number;
  getAmp(): number;
  getAngleDeg(): number;
}

function appendOscFields(parent: HTMLElement, osc: OscAdapter): void {
  parent.appendChild(rowCheckbox('振動', osc.isOn(), (on) => {
    if (on) {
      osc.enable(ui.oscFreq, ui.oscAmp, ui.oscAngleDeg * Math.PI / 180);
    } else {
      osc.disable();
    }
    populate(); // refresh so f/A/θ rows appear/disappear
  }));
  if (!osc.isOn()) return;
  parent.appendChild(rowSlider('f', 0.01, 0.3, 0.005, osc.getOmega(),
    (v) => osc.update(v, osc.getAmp(), osc.getAngleDeg() * Math.PI / 180),
    (v) => v.toFixed(3)));
  parent.appendChild(rowSlider('A', 0.5, 20, 0.5, osc.getAmp(),
    (v) => osc.update(osc.getOmega(), v, osc.getAngleDeg() * Math.PI / 180),
    (v) => v.toFixed(1)));
  parent.appendChild(rowSlider('θ', 0, 180, 5, osc.getAngleDeg(),
    (v) => osc.update(osc.getOmega(), osc.getAmp(), v * Math.PI / 180),
    (v) => `${v.toFixed(0)}°`));
}

// --- Per-kind populators ----------------------------------------------------

function populateParticle(i: number): void {
  if (i < 0 || i >= P.n || !P.alive[i]) { close(); return; }
  titleEl.textContent = `点電荷 #${i}`;
  bodyEl.appendChild(rowSlider('q', -10, 10, 0.5, P.q[i],
    (v) => { P.q[i] = v; },
    (v) => (v >= 0 ? '+' : '') + v.toFixed(1)));
  appendOscFields(bodyEl, {
    isOn: () => P.isOscillating(i),
    enable: (w, a, r) => P.setOscillator(i, w, a, r),
    disable: () => P.clearOscillator(i),
    update: (w, a, r) => P.updateOscillator(i, w, a, r),
    getOmega: () => P.omega[i],
    getAmp: () => P.amp[i],
    getAngleDeg: () => angleDegFromDir(P.dirX[i], P.dirY[i]),
  });
}

function populateBody(g: number): void {
  if (!Body.isInUse(g)) { close(); return; }
  titleEl.textContent = `帯電体 #${g}`;
  bodyEl.appendChild(rowSlider('Q', -10, 10, 0.5, Body.getQ(g),
    (v) => { Body.setQ(g, v); },
    (v) => (v >= 0 ? '+' : '') + v.toFixed(1)));
  appendOscFields(bodyEl, {
    isOn: () => Body.isOscillating(g),
    enable: (w, a, r) => Body.setOscillator(g, w, a, r),
    disable: () => Body.clearOscillator(g),
    update: (w, a, r) => Body.updateOscillator(g, w, a, r),
    getOmega: () => Body.getOmega(g),
    getAmp: () => Body.getAmp(g),
    getAngleDeg: () => angleDegFromDir(Body.getDirX(g), Body.getDirY(g)),
  });
}

function populateConductor(g: number): void {
  if (!Cond.isInUse(g)) { close(); return; }
  titleEl.textContent = `導体 #${g}`;
  bodyEl.appendChild(rowSlider('σ', SIGMA_CONDUCTOR_MIN, SIGMA_CONDUCTOR_MAX, 0.05, Cond.getGroupSigma(g),
    (v) => { Cond.setGroupSigma(g, v); },
    (v) => v.toFixed(2)));
  const stateLabel = Cond.isGrounded(g) ? '接地 (固定 V=0)' : '浮遊 (等電位)';
  bodyEl.appendChild(rowInfo('状態', stateLabel));
  bodyEl.appendChild(rowButton(Cond.isGrounded(g) ? '浮遊に切替' : '接地に切替', () => {
    Cond.toggleGrounded(g);
    populate();
  }));
}

function populateDielectric(g: number): void {
  if (!Diel.isInUse(g)) { close(); return; }
  titleEl.textContent = `誘電体 #${g}`;
  bodyEl.appendChild(rowSlider('εr', EPS_R_MIN, EPS_R_MAX, 0.1, Diel.getGroupEpsilon(g),
    (v) => { Diel.setGroupEpsilon(g, v); },
    (v) => v.toFixed(1)));
}

function populate(): void {
  if (!selection) return;
  bodyEl.innerHTML = '';
  const { kind, id } = selection;
  switch (kind) {
    case 'particle': populateParticle(id); break;
    case 'body': populateBody(id); break;
    case 'conductor': populateConductor(id); break;
    case 'dielectric': populateDielectric(id); break;
  }
}

// --- Public API -------------------------------------------------------------

export function openFor(kind: EntityKind, id: number): void {
  selection = { kind, id };
  populate();
  panel.style.display = 'block';
  requestRender();
}

export function close(): void {
  if (!selection) return;
  selection = null;
  panel.style.display = 'none';
  bodyEl.innerHTML = '';
  requestRender();
}

export function isOpen(): boolean { return selection !== null; }

export function closeIfFor(kind: EntityKind, id: number): void {
  if (selection && selection.kind === kind && selection.id === id) close();
}

export function getContainer(): HTMLElement { return panel; }
