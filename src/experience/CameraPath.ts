import * as THREE from 'three';
import { clamp, smoothstep } from '../utils/noise';

export interface CameraPoseInput {
  time: number;
  iglooX: number;
  descend: number; // 0 = intro elevated isometric -> 1 = settled hero overlook
  scrollProgress: number; // 0..0.45 Phase 1 normalized scroll
  loopProgress?: number; // 0..1 Phase 06 seamless reconstruction orbit back to rest
  isMobile: boolean;
  isTablet: boolean;
  pointerNdcX: number;
  pointerNdcY: number;
  reducedMotion: boolean;
}

/**
 * Single unified Phase 1 Camera Path:
 * Seamlessly blends Intro Isometric -> State A Hero at Rest -> State B Slow Withdrawal ->
 * State C Deep Zoom-Out Across Alpine Depth -> State D Frost Entry -> State E Atmospheric View.
 * Never creates a second conflicting camera or scales meshes to fake zooming.
 */
export function computeCameraPathPose(
  input: CameraPoseInput,
  outPos: THREE.Vector3,
  outLook: THREE.Vector3,
): number {
  const {
    time,
    iglooX,
    descend,
    scrollProgress,
    loopProgress = 0,
    isMobile,
    isTablet,
    pointerNdcX,
    pointerNdcY,
    reducedMotion,
  } = input;

  // 1. Intro elevated isometric-style framing (0.0 - 6.2s page-reload sequence)
  const isoPosX = isMobile ? -4.8 : -5.6;
  const isoPosY = isMobile ? 9.4 : 7.6;
  const isoPosZ = isMobile ? 10.2 : 8.4;
  const isoLookX = isMobile ? 0.05 : iglooX + 0.12;
  const isoLookY = 0.92;
  const isoLookZ = 0.45;

  // 2. Hero scroll-driven withdrawal & zoom-out states (States A -> B -> C -> D -> E)
  const restX = isMobile ? -0.65 : isTablet ? -1.35 : -1.55;
  const restY = isMobile ? 2.75 : isTablet ? 2.6 : 2.52;
  const restZ = isMobile ? 16.8 : isTablet ? 13.0 : 11.6;

  const restLookX = isMobile ? 0.0 : iglooX + 0.05;
  const restLookY = isMobile ? 1.7 : 1.72;
  const restLookZ = isMobile ? -2.8 : -2.8;

  // Phase 01 (0 - 0.12): Gentle push forward & subtle front-left -> side orbit
  const stateAT = smoothstep(0.0, 0.12, scrollProgress);
  // Phase 02 early (0.12 - 0.22): Rise gently toward separating diagonal blocks
  const stateBT = smoothstep(0.12, 0.22, scrollProgress);
  // Phase 02 pullback (0.22 - 0.31): Sweeping zoom-out revealing full mountain panorama & depth
  const stateCT = smoothstep(0.22, 0.31, scrollProgress);
  // Phase 03 entry (0.31 - 0.45): Drift upward/backward as frost rises into atmospheric void
  const stateDT = smoothstep(0.31, 0.43, scrollProgress);

  const driftAmp = reducedMotion ? 0 : isMobile ? 0.035 : 0.065;
  const driftX = Math.sin(time * 0.24) * driftAmp * descend;
  const driftY = Math.cos(time * 0.19) * driftAmp * 0.5 * descend;

  const parScale = reducedMotion ? 0 : (isMobile ? 0.08 : 0.22) * descend * (1 - stateDT * 0.45);
  const parX = pointerNdcX * parScale;
  const parY = pointerNdcY * parScale * 0.42;

  let heroX: number;
  let heroY: number;
  let heroZ: number;
  let heroLookX: number;
  let heroLookY: number;
  let heroLookZ: number;

  const baseFov = isMobile ? 45 : isTablet ? 40 : 38;
  let exitFov = baseFov;

  if (loopProgress > 0.001) {
    // Phase 06 Return Orbit (loopProgress 0 -> 1): glide smoothly from high three-quarter panoramic orbit back to exact rest pose
    const returnT = smoothstep(0.22, 1.0, loopProgress);
    const arcSin = Math.sin(returnT * Math.PI);
    const startX = isMobile ? 1.4 : 2.35;
    const startY = isMobile ? 5.6 : 4.95;
    const startZ = isMobile ? 21.5 : 16.4;

    heroX = THREE.MathUtils.lerp(startX, restX, returnT) - arcSin * (isMobile ? 0.65 : 1.05);
    heroY = THREE.MathUtils.lerp(startY, restY, returnT) + arcSin * 0.35;
    heroZ = THREE.MathUtils.lerp(startZ, restZ, returnT);

    heroLookX = THREE.MathUtils.lerp(iglooX, restLookX, returnT);
    heroLookY = THREE.MathUtils.lerp(1.25, restLookY, returnT);
    heroLookZ = THREE.MathUtils.lerp(-0.4, restLookZ, returnT);

    exitFov = baseFov + (1 - returnT) * 2.5;
  } else {
    // Progressive Phase 01 push/orbit -> Phase 02 rise + mountain pullback
    heroX =
      restX +
      stateAT * (isMobile ? 0.22 : 0.42) -
      stateBT * (isMobile ? 0.45 : 0.85) -
      stateCT * (isMobile ? 0.85 : 1.55) -
      stateDT * (isMobile ? 0.65 : 1.15);

    heroY =
      restY -
      stateAT * 0.08 +
      stateBT * (isMobile ? 0.42 : 0.56) +
      stateCT * (isMobile ? 1.25 : 1.48) +
      stateDT * (isMobile ? 0.95 : 1.1);

    heroZ =
      restZ -
      stateAT * (isMobile ? 0.75 : 0.95) +
      stateBT * (isMobile ? 2.1 : 2.15) +
      stateCT * (isMobile ? 6.2 : 6.4) +
      stateDT * (isMobile ? 3.8 : 4.2);

    heroLookX =
      THREE.MathUtils.lerp(restLookX, iglooX, stateBT * 0.75 + stateCT * 0.25);
    heroLookY =
      restLookY - stateBT * 0.28 - stateCT * 0.22 + stateDT * 0.45;
    heroLookZ =
      restLookZ + stateBT * 1.35 + stateCT * 1.15 - stateDT * 1.4;

    exitFov = baseFov + clamp(stateCT * 3.5 + stateDT * 2.5, 0, 6);
  }

  outPos.set(
    THREE.MathUtils.lerp(isoPosX, heroX, descend) + parX + driftX,
    THREE.MathUtils.lerp(isoPosY, heroY, descend) - parY + driftY,
    THREE.MathUtils.lerp(isoPosZ, heroZ, descend),
  );
  outLook.set(
    THREE.MathUtils.lerp(isoLookX, heroLookX, descend),
    THREE.MathUtils.lerp(isoLookY, heroLookY, descend),
    THREE.MathUtils.lerp(isoLookZ, heroLookZ, descend),
  );

  const introFov = isMobile ? 46 : 39;
  return THREE.MathUtils.lerp(introFov, exitFov, descend);
}
