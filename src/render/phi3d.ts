import * as THREE from 'three';
import { TrackballControls } from 'three/examples/jsm/controls/TrackballControls.js';
import { NX, NY, CANVAS_W, CANVAS_H } from '../config';
import { getPhi } from '../sim/poisson';
import { getCSSSize } from './canvas';

const Z_SCALE = 30.0;
const WIRE_STRIDE = 4;
const WNX = Math.floor((NX - 1) / WIRE_STRIDE) + 1;
const WNY = Math.floor((NY - 1) / WIRE_STRIDE) + 1;
const HALF_X = (NX - 1) / 2;
const HALF_Y = (NY - 1) / 2;

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene;
let camera: THREE.PerspectiveCamera;
let controls: TrackballControls;
let geometry: THREE.PlaneGeometry;
let posArr: Float32Array;
let colArr: Float32Array;
let wireGeo: THREE.BufferGeometry;
let wirePosArr: Float32Array;
let rafId = 0;

function init(canvas: HTMLCanvasElement): void {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(CANVAS_W, CANVAS_H);

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b10);

  const FOV = 45;
  const aspect = CANVAS_W / CANVAS_H;
  const halfFovRad = (FOV / 2) * (Math.PI / 180);
  const halfH = (NY - 1) / 2;
  const halfW = (NX - 1) / 2;
  // z distance so the mesh exactly fills the canvas (no extra padding) — the
  // 3D content footprint should match what the 2D canvas shows.
  const zFit = Math.max(halfH, halfW / aspect) / Math.tan(halfFovRad);

  camera = new THREE.PerspectiveCamera(FOV, aspect, 0.1, 10000);
  camera.up.set(0, 1, 0);
  camera.position.set(0, 0, zFit);
  camera.lookAt(0, 0, 0);

  controls = new TrackballControls(camera, canvas);
  controls.rotateSpeed = 3.0;
  controls.zoomSpeed = 1.2;
  controls.panSpeed = 0.8;
  controls.dynamicDampingFactor = 0.15;

  geometry = new THREE.PlaneGeometry(NX - 1, NY - 1, NX - 1, NY - 1);
  posArr = geometry.attributes.position.array as Float32Array;

  colArr = new Float32Array(NX * NY * 3);
  geometry.setAttribute('color', new THREE.BufferAttribute(colArr, 3));

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.85,
    metalness: 0.0,
  });

  scene.add(new THREE.Mesh(geometry, material));

  // Subsampled wireframe (every WIRE_STRIDE cells)
  wirePosArr = new Float32Array(WNX * WNY * 3);
  wireGeo = new THREE.BufferGeometry();
  wireGeo.setAttribute('position', new THREE.BufferAttribute(wirePosArr, 3));
  const wireIdx: number[] = [];
  for (let sj = 0; sj < WNY; sj++) {
    for (let si = 0; si < WNX; si++) {
      const k = sj * WNX + si;
      if (si < WNX - 1) wireIdx.push(k, k + 1);
      if (sj < WNY - 1) wireIdx.push(k, k + WNX);
    }
  }
  wireGeo.setIndex(wireIdx);
  const wireMat = new THREE.LineBasicMaterial({ color: 0xffffff, opacity: 0.18, transparent: true });
  scene.add(new THREE.LineSegments(wireGeo, wireMat));

  // Low ambient to preserve shadow contrast
  scene.add(new THREE.HemisphereLight(0x334466, 0x110011, 0.25));

  // Main light: from front-left diagonal (viewer side)
  const main = new THREE.DirectionalLight(0xffffff, 2.2);
  main.position.set(-NX * 0.6, -NY * 1.1, NY * 0.5);
  scene.add(main);

  // Fill light: opposite side, dimmer, slight blue tint
  const fill = new THREE.DirectionalLight(0x8899bb, 0.5);
  fill.position.set(-NX * 0.8, NY * 0.6, NY * 0.5);
  scene.add(fill);
}

function updateMesh(): void {
  const phi = getPhi();
  let maxAbs = 1e-6;
  for (let k = 0; k < NX * NY; k++) {
    const v = Math.abs(phi[k]);
    if (v > maxAbs) maxAbs = v;
  }
  const invMax = 1 / maxAbs;

  for (let k = 0; k < NX * NY; k++) {
    posArr[k * 3 + 2] = phi[k] * Z_SCALE;
    const t = Math.max(-1, Math.min(1, phi[k] * invMax));
    if (t >= 0) {
      colArr[k * 3] = 1; colArr[k * 3 + 1] = 1 - t; colArr[k * 3 + 2] = 1 - t;
    } else {
      colArr[k * 3] = 1 + t; colArr[k * 3 + 1] = 1 + t; colArr[k * 3 + 2] = 1;
    }
  }

  geometry.attributes.position.needsUpdate = true;
  geometry.attributes.color.needsUpdate = true;
  geometry.computeVertexNormals();

  for (let sj = 0; sj < WNY; sj++) {
    for (let si = 0; si < WNX; si++) {
      const gi = si * WIRE_STRIDE;
      const gj = sj * WIRE_STRIDE;
      const k = sj * WNX + si;
      wirePosArr[k * 3]     = gi - HALF_X;
      wirePosArr[k * 3 + 1] = HALF_Y - gj;
      wirePosArr[k * 3 + 2] = phi[gj * NX + gi] * Z_SCALE;
    }
  }
  wireGeo.attributes.position.needsUpdate = true;
}

function loop(): void {
  rafId = requestAnimationFrame(loop);
  updateMesh();
  controls.update();
  renderer!.render(scene, camera);
}

export function show(canvas: HTMLCanvasElement): void {
  canvas.style.display = 'block'; // show before init so getBoundingClientRect() returns real size
  if (!renderer) init(canvas);
  // Always sync dims to the current 2D canvas — CANVAS_W/H or the CSS scale
  // may have changed via a window resize while we were hidden.
  resize();
  if (!rafId) loop();
}

export function hide(canvas: HTMLCanvasElement): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
  canvas.style.display = 'none';
}

export function resetCamera(): void {
  if (!renderer) return;
  controls.reset();
}

export function resize(): void {
  if (!renderer) return;
  renderer.setSize(CANVAS_W, CANVAS_H);
  camera.aspect = CANVAS_W / CANVAS_H;
  camera.updateProjectionMatrix();
  controls.handleResize();
  const { w, h } = getCSSSize();
  renderer.domElement.style.width = w + 'px';
  renderer.domElement.style.height = h + 'px';
}
