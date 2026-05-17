import * as Hand from './sim/godhand';
import * as Deposition from './sim/deposition';
import * as Poisson from './sim/poisson';
import * as FDTD from './sim/fdtd';
import * as Particles from './sim/particles';
import * as Conductors from './sim/conductors';
import * as Dielectric from './sim/dielectric';
import * as Body from './sim/chargedBody';

import * as Heatmap from './render/heatmap';
import * as Vectors from './render/vectors';
import * as ParticlesR from './render/particles';
import * as Highpass from './render/highpass';
import * as Phi3D from './render/phi3d';
import * as ConductorsR from './render/conductors';
import * as DielectricR from './render/dielectric';
import * as BodyR from './render/chargedBody';

import { setup as setupInput } from './ui/input';
import { setup as setupControls, state as ui } from './ui/controls';
import { requestRender, consumeRender } from './ui/render-request';

import { canvas as mainCanvas } from './render/canvas';

const phi3dCanvas = document.getElementById('phi-canvas') as HTMLCanvasElement;
const phi3dBtn = document.getElementById('phi3dBtn') as HTMLButtonElement;
const phi3dResetBtn = document.getElementById('phi3dResetBtn') as HTMLButtonElement;
let phi3dVisible = false;
phi3dBtn.addEventListener('click', () => {
  phi3dVisible = !phi3dVisible;
  if (phi3dVisible) {
    Phi3D.show(phi3dCanvas);
    phi3dBtn.classList.add('active');
    phi3dBtn.textContent = '電位 3D ×';
    phi3dResetBtn.style.display = '';
  } else {
    Phi3D.hide(phi3dCanvas);
    phi3dBtn.classList.remove('active');
    phi3dBtn.textContent = '電位 3D';
    phi3dResetBtn.style.display = 'none';
  }
});
phi3dResetBtn.addEventListener('click', () => Phi3D.resetCamera());

function reset(): void {
  Particles.clear();
  Conductors.clear();
  Dielectric.clear();
  Body.clear();
  Poisson.reset();
  FDTD.reset();
  Highpass.reset();
  Hand.endDrag();
}

setupInput(() => ui.charge);
setupControls(reset);

// Invalidate the paused-render cache on any UI event that might change state.
// Listeners registered after setupInput/setupControls so the state-changing
// handlers run first within the same event (order is preserved on a target).
const toolbarEl = document.getElementById('toolbar') as HTMLElement;
mainCanvas.addEventListener('pointerdown', requestRender);
mainCanvas.addEventListener('pointermove', requestRender);
mainCanvas.addEventListener('pointerup', requestRender);
mainCanvas.addEventListener('pointercancel', requestRender);
toolbarEl.addEventListener('input', requestRender);
toolbarEl.addEventListener('change', requestRender);
toolbarEl.addEventListener('click', requestRender);
document.addEventListener('keydown', requestRender);

let accumulator = 0;

function simStep(): void {
  Hand.step();
  Body.step();
  Deposition.compute();
  Body.deposit();
  Poisson.solve();
  FDTD.step();
  Highpass.update();
}

function frame(): void {
  // Always consume the request so the flag clears each frame regardless of
  // whether the render path runs. When running, render unconditionally;
  // when paused, render only if something requested it since the last frame.
  const requested = consumeRender();

  if (!ui.paused) {
    accumulator += ui.simSpeed;
    while (accumulator >= 1) {
      simStep();
      accumulator -= 1;
    }
  }

  if (!ui.paused || requested) {
    if (ui.showWave) {
      Heatmap.draw();
    } else {
      Heatmap.drawBlank();
    }
    DielectricR.draw();
    ConductorsR.draw();
    BodyR.draw();
    Vectors.draw(ui.showStatic, ui.showWave);
    ParticlesR.draw();
    ConductorsR.drawPreview();
    BodyR.drawPreview();
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
