import * as THREE from 'three';
import { clamp, smoothstep } from '../utils/noise';
import { STAGE_DROP } from './stage';

export const PORTAL_START = 0.92;
export const PORTAL_END = 1.42;
export const getPortalProgress = (scroll: number) => clamp((scroll - PORTAL_START) / (PORTAL_END - PORTAL_START), 0, 1);

// Fragments rise from below the viewport and level out before the physical passage.
export function getPortalAssemblyPose(progress: number) {
  const assembled = smoothstep(0, 0.38, progress);

  return { y: THREE.MathUtils.lerp(-6, 0, assembled), tilt: THREE.MathUtils.lerp(-0.75, 0, assembled) };
}

// Elevated assembly -> physical passage -> downward arrival -> overhead hold -> low three-quarter side finish.
const assemblyPath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(-0.35, 0.05, -24.4),
  new THREE.Vector3(-0.55, 1.15, -24.7),
  new THREE.Vector3(-0.65, 6.5, -25),
  new THREE.Vector3(-0.45, 6.8, -25.3),
  new THREE.Vector3(0, 6.2, -25.5),
  new THREE.Vector3(0, 5.8, -25.8),
]);
const passagePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 5.8, -25.8),
  new THREE.Vector3(0, 0.8, -30),
  new THREE.Vector3(0, 0, -36),
  new THREE.Vector3(0, 0, -40.8),
  new THREE.Vector3(0, 0.15, -43.4),
]);
const stagePath = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0.15, -43.4),
  new THREE.Vector3(0.4, -7, -45.2),
  new THREE.Vector3(0.55, 21.5 - STAGE_DROP, -47),
  new THREE.Vector3(3.8, 6 - STAGE_DROP, -41.8),
  new THREE.Vector3(7, 1.25 - STAGE_DROP, -39),
]);

interface PortalCameraOptions {
  aspect?: number;
  pointerX?: number;
  pointerY?: number;
  reducedMotion?: boolean;
}

export function computePortalCameraPose(
  progress: number,
  isMobile: boolean,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
  options: PortalCameraOptions = {},
) {
  const p = clamp(progress, 0, 1);
  const aspect = options.aspect ?? (isMobile ? 0.56 : 16 / 9);
  const fov = (isMobile ? THREE.MathUtils.lerp(45, 48, smoothstep(0, 0.2, p)) : 38)
    + smoothstep(0.95, 1, p) * (isMobile ? 2 : 4);
  if (p <= 0.56) assemblyPath.getPoint(p / 0.56, outPos);
  else if (p <= 0.77) passagePath.getPoint(smoothstep(0.56, 0.77, p), outPos);
  else {
    const stageTravel = p < 0.86 ? smoothstep(0.77, 0.86, p) * 0.5
      : p <= 0.95 ? 0.5 : 0.5 + smoothstep(0.95, 1, p) * 0.5;
    stagePath.getPoint(stageTravel, outPos);
  }

  const horizontalLock = smoothstep(0.36, 0.46, p) * (1 - smoothstep(0.77, 0.84, p));
  const frontalLock = smoothstep(0.56, 0.64, p) * (1 - smoothstep(0.77, 0.84, p));
  outPos.x *= 1 - horizontalLock;
  outPos.y *= 1 - frontalLock;

  // Fit the ring's width into portrait viewports, then remove the offset before crossing its plane.
  const portraitDistance = Math.max(0, 3.7 / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * aspect) - 10);
  const entryOffset = isMobile ? 1.25 : 0;
  const pullback = THREE.MathUtils.lerp(entryOffset, portraitDistance, smoothstep(0, 0.15, p));
  outPos.z += pullback * (1 - smoothstep(0.56, 0.68, p));

  // Descend monotonically into the well, including portrait framing. Keep a long overhead hold.
  const stagePullback = Math.min(14, Math.max(0,
    7.9 / (Math.tan(THREE.MathUtils.degToRad(fov / 2)) * Math.min(1, aspect)) - 23.6));
  if (p > 0.77) {
    const overheadY = 21.5 - STAGE_DROP + stagePullback;
    outPos.y = p < 0.86 ? THREE.MathUtils.lerp(0, overheadY, smoothstep(0.77, 0.86, p))
      : p <= 0.95 ? overheadY : THREE.MathUtils.lerp(overheadY, 1.25 - STAGE_DROP, smoothstep(0.95, 1, p));
  }

  const passageLock = smoothstep(0.55, 0.63, p) * (1 - smoothstep(0.98, 1, p));
  const parallax = options.reducedMotion ? 0 : (1 - passageLock) * (1 - frontalLock) * smoothstep(0, 0.12, p);
  outPos.x += (options.pointerX ?? 0) * 0.12 * parallax;
  outPos.y -= (options.pointerY ?? 0) * 0.07 * parallax;

  const settle = smoothstep(0.76, 0.84, p);
  const stageLookY = THREE.MathUtils.lerp(-2.1 - STAGE_DROP, -0.3 - STAGE_DROP, smoothstep(0.95, 1, p));
  const entryLook = THREE.MathUtils.lerp(-32.5, -36, smoothstep(0, 0.18, p));
  const forwardLook = Math.min(entryLook, outPos.z - 4);
  outLook.set(0, THREE.MathUtils.lerp(0, stageLookY, settle), THREE.MathUtils.lerp(forwardLook, -48.4, settle));

  const passageHaze = smoothstep(0.64, 0.71, p) * (1 - smoothstep(0.77, 0.87, p));
  const fogDensity = THREE.MathUtils.lerp(0.064, 0.035, smoothstep(0, 0.18, p)) + passageHaze * 0.035;
  return { fov, fogDensity };
}
