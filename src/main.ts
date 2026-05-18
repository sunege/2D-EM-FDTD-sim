import * as Hand from './sim/godhand';
import * as Deposition from './sim/deposition';
import * as Poisson from './sim/poisson';
import * as FDTD from './sim/fdtd';
import * as Particles from './sim/particles';
import * as Conductors from './sim/conductors';
import * as Dielectric from './sim/dielectric';
import * as Body from './sim/chargedBody';
import * as Probe from './sim/probe';

import * as Heatmap from './render/heatmap';
import * as Vectors from './render/vectors';
import * as ParticlesR from './render/particles';
import * as Highpass from './render/highpass';
import * as Phi3D from './render/phi3d';
import * as ConductorsR from './render/conductors';
import * as DielectricR from './render/dielectric';
import * as BodyR from './render/chargedBody';
import * as Equipot from './render/equipotential';
import * as ProbeR from './render/probeChart';
import * as Viewport from './render/viewport';

import { setup as setupInput } from './ui/input';
import { setup as setupControls, state as ui } from './ui/controls';
import { requestRender, consumeRender } from './ui/render-request';
import * as Panel from './ui/paramPanel';

import { canvas as mainCanvas, ctx } from './render/canvas';
import { CANVAS_W, CANVAS_H } from './config';

const phi3dCanvas = document.getElementById('phi-canvas') as HTMLCanvasElement;
const phi3dBtn = document.getElementById('phi3dBtn') as HTMLButtonElement;
const phi3dResetBtn = document.getElementById('phi3dResetBtn') as HTMLButtonElement;
const view2dResetBtn = document.getElementById('view2dResetBtn') as HTMLButtonElement;
let phi3dVisible = false;
phi3dBtn.addEventListener('click', () => {
  phi3dVisible = !phi3dVisible;
  if (phi3dVisible) {
    Phi3D.show(phi3dCanvas);
    phi3dBtn.classList.add('active');
    phi3dBtn.textContent = '電位 3D ×';
    phi3dResetBtn.style.display = '';
    view2dResetBtn.style.display = 'none';
  } else {
    Phi3D.hide(phi3dCanvas);
    phi3dBtn.classList.remove('active');
    phi3dBtn.textContent = '電位 3D';
    phi3dResetBtn.style.display = 'none';
    view2dResetBtn.style.display = '';
  }
});
phi3dResetBtn.addEventListener('click', () => Phi3D.resetCamera());
view2dResetBtn.addEventListener('click', () => { Viewport.reset(); requestRender(); });

function reset(): void {
  Particles.clear();
  Conductors.clear();
  Dielectric.clear();
  Body.clear();
  Probe.clear();
  Poisson.reset();
  FDTD.reset();
  Highpass.reset();
  Hand.endDrag();
  Panel.close();
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

// Clicks on the toolbar (anywhere, buttons included) dismiss the param panel.
// The panel sits outside the toolbar in the DOM, so its own clicks don't
// reach this handler.
toolbarEl.addEventListener('mousedown', () => Panel.close());

let accumulator = 0;

function simStep(): void {
  Hand.step();
  Body.step();
  Deposition.compute();
  Body.deposit();
  Poisson.solve();
  FDTD.step();
  Highpass.update();
  Probe.sample();
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
    // Clear full canvas (identity transform) then apply viewport
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
    ctx.setTransform(Viewport.zoom, 0, 0, Viewport.zoom, Viewport.panX, Viewport.panY);

    if (ui.showWave) {
      Heatmap.draw();
    } else {
      Heatmap.drawBlank();
    }
    DielectricR.draw();
    ConductorsR.draw();
    BodyR.draw();
    if (ui.showEquipot) Equipot.draw();
    Vectors.draw(ui.showStatic, ui.showWave);
    ParticlesR.draw();
    ProbeR.drawPins();
    ProbeR.drawChart();
    ConductorsR.drawPreview();
    BodyR.drawPreview();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
