/**
 * Pure, allocation-free math helpers for the deterministic 60-second loop.
 * Every function here is a function of its inputs only (no time, no randomness),
 * so the entire scene can be recomputed from a single normalized progress value.
 */

export const TAU = Math.PI * 2;

export function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Wrap any real number into [0, 1). Stable for negative values. */
export function wrap01(x: number): number {
  return x - Math.floor(x);
}

/** Circular distance between two normalized positions on the loop. */
export function circDist(a: number, b: number): number {
  const d = Math.abs(wrap01(a - b));
  return d > 0.5 ? 1 - d : d;
}

export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * (3 - 2 * t);
}

/** Quintic smootherstep: zero velocity AND zero acceleration at both ends (feels heavy). */
export function smootherstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/** Rise between a0..a1, fall between b0..b1 (non-wrapping, for p in [0,1)). */
export function windowed(p: number, a0: number, a1: number, b0: number, b1: number): number {
  return smootherstep(a0, a1, p) * (1 - smootherstep(b0, b1, p));
}

/** Smooth bump centred on `c` with half-width `w`, wrapping across the loop seam. */
export function loopBump(p: number, c: number, w: number): number {
  return 1 - smootherstep(0, w, circDist(p, c));
}

/**
 * Gentle "snap" ease: quintic body with a tiny, critically damped overshoot.
 * f(0)=0, f(1)=1, f'(0)=f'(1)=0. Overshoot peaks ~3% near t=0.8.
 */
export function snapEase(t: number, overshoot = 0.03): number {
  const c = clamp01(t);
  const base = c * c * c * (c * (c * 6 - 15) + 10);
  // sin^2 envelope keeps derivatives at both ends at zero; the late gate makes it a press-in overshoot.
  const s = Math.sin(Math.PI * c);
  return base + overshoot * 4 * s * s * smoothstep(0.4, 0.9, c);
}

/** Deterministic hash -> [0,1). */
export function hash11(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

export interface V3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Closed (periodic) uniform cubic B-spline. C2 continuous everywhere including
 * the loop seam, so camera position, velocity AND acceleration all match at p=0/1.
 */
export function periodicBSpline(points: readonly V3[], p: number, out: V3): V3 {
  const n = points.length;
  const u = wrap01(p) * n;
  const i = Math.floor(u);
  const t = u - i;
  const t2 = t * t;
  const t3 = t2 * t;
  const b0 = (1 - t) * (1 - t) * (1 - t) / 6;
  const b1 = (3 * t3 - 6 * t2 + 4) / 6;
  const b2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6;
  const b3 = t3 / 6;
  const p0 = points[(i - 1 + n) % n];
  const p1 = points[i % n];
  const p2 = points[(i + 1) % n];
  const p3 = points[(i + 2) % n];
  out.x = p0.x * b0 + p1.x * b1 + p2.x * b2 + p3.x * b3;
  out.y = p0.y * b0 + p1.y * b1 + p2.y * b2 + p3.y * b3;
  out.z = p0.z * b0 + p1.z * b1 + p2.z * b2 + p3.z * b3;
  return out;
}

/** Analytic derivative of the periodic B-spline with respect to p (units per full loop). */
export function periodicBSplineDerivative(points: readonly V3[], p: number, out: V3): V3 {
  const n = points.length;
  const u = wrap01(p) * n;
  const i = Math.floor(u);
  const t = u - i;
  const t2 = t * t;
  const d0 = -(1 - t) * (1 - t) / 2;
  const d1 = (3 * t2 - 4 * t) / 2;
  const d2 = (-3 * t2 + 2 * t + 1) / 2;
  const d3 = t2 / 2;
  const p0 = points[(i - 1 + n) % n];
  const p1 = points[i % n];
  const p2 = points[(i + 1) % n];
  const p3 = points[(i + 2) % n];
  out.x = (p0.x * d0 + p1.x * d1 + p2.x * d2 + p3.x * d3) * n;
  out.y = (p0.y * d0 + p1.y * d1 + p2.y * d2 + p3.y * d3) * n;
  out.z = (p0.z * d0 + p1.z * d1 + p2.z * d2 + p3.z * d3) * n;
  return out;
}

/** Frame-rate independent exponential damping. */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * dt));
}
