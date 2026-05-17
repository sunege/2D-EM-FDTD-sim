export const NX = 128;
export const NY = 128;

export const DX = 1.0;
export const DY = 1.0;

export const C = 1.0;

export const DT = 0.5;

export const EPS0 = 1.0;

export const SIGMA = 5.0;
export const DEPOSIT_RADIUS = 10;

export const JACOBI_ITERS = 20;

export const VMAX = 0.70 * C;
export const K_DRAG = 0.05;
export const K_DAMP = 0.4;
export const PARTICLE_MARGIN = DEPOSIT_RADIUS + 2;

export const PIXEL_SCALE = 5;
export const CANVAS_W = NX * PIXEL_SCALE;
export const CANVAS_H = NY * PIXEL_SCALE;

export const VECTOR_STRIDE = 4;

export const BZ_SCALE = 0.05;
export const BZ_THRESHOLD = 0.005;

export const HIGHPASS_ALPHA = 0.02;

export const SIGMA_CONDUCTOR_DEFAULT = 0.5;
export const SIGMA_CONDUCTOR_MIN = 0.05;
export const SIGMA_CONDUCTOR_MAX = 5.0;

export const EPS_R_MIN = 1.0;
export const EPS_R_MAX = 4.0;
export const EPS_R_DEFAULT = 2.0;
