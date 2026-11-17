import * as THREE from 'three';
import { clamp, smoothstep } from '../utils/noise';
import type { PortfolioProject } from './projects';

interface CameraWaypoint {
  p: number;
  pos: [number, number, number];
  look: [number, number, number];
  fogDensity: number;
}

// A level forward-moving camera lets the scroll-driven crystals travel vertically without sideways orbiting.
const WAYPOINTS: CameraWaypoint[] = [
  { p: 0.31, pos: [0, 0.45, 7.6], look: [0, 0, -3.5], fogDensity: 0.088 },
  { p: 0.43, pos: [0, 0.02, 5.2], look: [0, 0.02, -12], fogDensity: 0.084 },
  { p: 0.48, pos: [0, 0.02, 2.35], look: [0, 0.02, -11], fogDensity: 0.048 },
  { p: 0.53, pos: [0, 0.02, 1.55], look: [0, 0.02, -3.5], fogDensity: 0.044 },
  { p: 0.59, pos: [0, 0.02, 0.45], look: [0, 0.02, -8], fogDensity: 0.046 },
  { p: 0.62, pos: [0, 0.02, -1.8], look: [0, 0.02, -9], fogDensity: 0.068 },
  { p: 0.64, pos: [0.05, 0.02, -4.6], look: [0.1, 0.02, -14], fogDensity: 0.078 },
  { p: 0.68, pos: [0.15, -0.04, -9.2], look: [0.15, -0.04, -24], fogDensity: 0.084 },
  { p: 0.72, pos: [0.15, -0.04, -11.8], look: [0.15, -0.04, -25.5], fogDensity: 0.048 },
  { p: 0.77, pos: [0.15, -0.04, -12.35], look: [0.15, -0.04, -17.5], fogDensity: 0.044 },
  { p: 0.82, pos: [0.15, -0.04, -13.55], look: [0.15, -0.04, -23], fogDensity: 0.046 },
  { p: 0.85, pos: [0.15, -0.04, -15.8], look: [0.15, -0.04, -23], fogDensity: 0.068 },
  { p: 0.87, pos: [0.15, -0.04, -18.5], look: [0.15, -0.04, -25.2], fogDensity: 0.078 },
  { p: 0.92, pos: [-0.35, 0.05, -24.4], look: [0, 0, -32.5], fogDensity: 0.064 },
];

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function catmullRomTuple(
  a: [number, number, number],
  b: [number, number, number],
  c: [number, number, number],
  d: [number, number, number],
  t: number,
  out: THREE.Vector3,
): void {
  out.set(
    catmullRomScalar(a[0], b[0], c[0], d[0], t),
    catmullRomScalar(a[1], b[1], c[1], d[1], t),
    catmullRomScalar(a[2], b[2], c[2], d[2], t),
  );
}

export interface PortfolioCameraInput {
  time: number;
  scrollProgress: number;
  isMobile: boolean;
  pointerNdcX: number;
  pointerNdcY: number;
  reducedMotion: boolean;
}

/**
 * Evaluates smooth Phase 2 camera spline & volumetric fog density across scroll [0.31..0.92]:
 * Atmospheric entry -> Crystal 1 vertical pass -> Inter-crystal fog -> Crystal 2 vertical pass -> Ring exit.
 */
export function computePortfolioCameraPose(
  input: PortfolioCameraInput,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
): { fogDensity: number; fov: number } {
  const { time, scrollProgress, isMobile, pointerNdcX, pointerNdcY, reducedMotion } = input;
  const p = clamp(scrollProgress, WAYPOINTS[0].p, WAYPOINTS[WAYPOINTS.length - 1].p);

  let seg = WAYPOINTS.length - 2;
  for (let i = 0; i < WAYPOINTS.length - 1; i++) {
    if (p <= WAYPOINTS[i + 1].p) {
      seg = i;
      break;
    }
  }

  const w0 = WAYPOINTS[Math.max(0, seg - 1)];
  const w1 = WAYPOINTS[seg];
  const w2 = WAYPOINTS[seg + 1];
  const w3 = WAYPOINTS[Math.min(WAYPOINTS.length - 1, seg + 2)];

  const span = Math.max(1e-5, w2.p - w1.p);
  const t = clamp((p - w1.p) / span, 0, 1);

  catmullRomTuple(w0.pos, w1.pos, w2.pos, w3.pos, t, outPos);
  catmullRomTuple(w0.look, w1.look, w2.look, w3.look, t, outLook);

  // Subtle mobile pull-back so crystal + annotations fit portrait viewports comfortably
  if (isMobile) {
    outPos.z += 1.25;
  }

  // Gentle organic camera breathing + pointer parallax
  const handoffWeight = 1 - smoothstep(0.87, 0.92, p);
  const parX = reducedMotion ? 0 : pointerNdcX * 0.07 * handoffWeight;
  const parY = reducedMotion ? 0 : pointerNdcY * 0.04 * handoffWeight;
  const breatheX = reducedMotion ? 0 : Math.sin(time * 0.32) * 0.015 * handoffWeight;
  const breatheY = reducedMotion ? 0 : Math.cos(time * 0.27) * 0.03 * handoffWeight;

  outPos.x += parX + breatheX;
  outPos.y += -parY + breatheY;
  outLook.x += parX * 0.22;
  outLook.y += -parY * 0.18;

  const fogDensity = THREE.MathUtils.lerp(w1.fogDensity, w2.fogDensity, t);
  const fov = isMobile ? 45 : 38;
  return { fogDensity, fov };
}

/**
 * Computes centered detail-environment camera pose focusing directly on the selected crystal.
 */
export function computeDetailCameraPose(
  project: PortfolioProject,
  isMobile: boolean,
  pointerNdcX: number,
  pointerNdcY: number,
  reducedMotion: boolean,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
): { fogDensity: number; fov: number } {
  const [cx, cy, cz] = project.worldPos;
  const distZ = isMobile ? 5.9 : 4.55;
  const parX = reducedMotion ? 0 : pointerNdcX * 0.16;
  const parY = reducedMotion ? 0 : pointerNdcY * 0.1;

  outPos.set(cx + parX, cy + 0.05 - parY, cz + distZ);
  outLook.set(cx, cy, cz);

  return {
    fogDensity: 0.022,
    fov: isMobile ? 44 : 38,
  };
}
