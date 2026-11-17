import * as THREE from 'three';
import { clamp, smoothstep } from '../utils/noise';

export interface CameraPoseInput {
  time: number;
  iglooX: number;
  descend: number; // 0 = intro elevated isometric -> 1 = settled hero overlook
  scrollProgress: number; // 0..0.45 Phase 1 normalized scroll
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
  const { time, iglooX, descend, scrollProgress, isMobile, isTablet, pointerNdcX, pointerNdcY, reducedMotion } =
    input;

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

  // State A (0 - 0.12): Gentle responsive float around initial hero
  const stateAT = smoothstep(0.0, 0.12, scrollProgress);
  // State B (0.12 - 0.22): Early slow withdrawal as bricks separate
  const stateBT = smoothstep(0.12, 0.22, scrollProgress);
  // State C (0.22 - 0.31): Meaningful backward pull revealing full mountain panorama & depth
  const stateCT = smoothstep(0.22, 0.31, scrollProgress);
  // State D/E (0.31 - 0.45): Drift upward/backward as frost rises into pale atmospheric void
  const stateDT = smoothstep(0.31, 0.43, scrollProgress);

  const driftAmp = reducedMotion ? 0 : isMobile ? 0.035 : 0.065;
  const driftX = Math.sin(time * 0.24) * driftAmp * descend;
  const driftY = Math.cos(time * 0.19) * driftAmp * 0.5 * descend;

  const parScale = reducedMotion ? 0 : (isMobile ? 0.08 : 0.22) * descend * (1 - stateDT * 0.45);
  const parX = pointerNdcX * parScale;
  const parY = pointerNdcY * parScale * 0.42;

  // Progressive backward Z withdrawal + subtle height climb & lateral arc
  const heroX =
    restX +
    stateAT * (isMobile ? 0.08 : 0.15) -
    stateBT * (isMobile ? 0.4 : 0.72) -
    stateCT * (isMobile ? 0.85 : 1.55) -
    stateDT * (isMobile ? 0.65 : 1.15);

  const heroY =
    restY +
    stateAT * 0.08 +
    stateBT * (isMobile ? 0.35 : 0.42) +
    stateCT * (isMobile ? 1.25 : 1.48) +
    stateDT * (isMobile ? 0.95 : 1.1);

  const heroZ =
    restZ +
    stateAT * (isMobile ? 0.6 : 0.55) +
    stateBT * (isMobile ? 2.4 : 2.35) +
    stateCT * (isMobile ? 6.2 : 6.4) +
    stateDT * (isMobile ? 3.8 : 4.2);

  // Look target smoothly shifts from mountain ridge focus -> centered onto shrinking igloo dome -> mist horizon
  const heroLookX =
    THREE.MathUtils.lerp(restLookX, iglooX, stateBT * 0.75 + stateCT * 0.25);
  const heroLookY =
    restLookY - stateBT * 0.28 - stateCT * 0.22 + stateDT * 0.45;
  const heroLookZ =
    restLookZ + stateBT * 1.35 + stateCT * 1.15 - stateDT * 1.4;

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

  const baseFov = isMobile ? 45 : isTablet ? 40 : 38;
  const introFov = isMobile ? 46 : 39;
  const exitFov = baseFov + clamp(stateCT * 3.5 + stateDT * 2.5, 0, 6);
  return THREE.MathUtils.lerp(introFov, exitFov, descend);
}
