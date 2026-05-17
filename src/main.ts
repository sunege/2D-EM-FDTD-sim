import * as Hand from './sim/godhand';
import * as Deposition from './sim/deposition';
import * as Poisson from './sim/poisson';
import * as FDTD from './sim/fdtd';
import * as Particles from './sim/particles';

import * as Heatmap from './render/heatmap';
import * as Vectors from './render/vectors';
import * as ParticlesR from './render/particles';
import * as Highpass from './render/highpass';
import * as Phi3D from './render/phi3d';

import { setup as setupInput } from './ui/input';
import { setup as setupControls, state as ui } from './ui/controls';

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
  Poisson.reset();
  FDTD.reset();
  Highpass.reset();
  Hand.endDrag();
}

setupInput(() => ui.charge);
setupControls(reset);

let accumulator = 0;

function simStep(): void {
  Hand.step();
  Deposition.compute();
  Poisson.solve();
  FDTD.step();
  Highpass.update();
}

function frame(): void {
  if (!ui.paused) {
    accumulator += ui.simSpeed;
    while (accumulator >= 1) {
      simStep();
      accumulator -= 1;
    }
  }

  if (ui.showWave) {
    Heatmap.draw();
  } else {
    Heatmap.drawBlank();
  }
  Vectors.draw(ui.showStatic, ui.showWave);
  ParticlesR.draw();

  requestAnimationFrame(frame);
}

requestAnimationFrame(frame);
