import { clamp, smoothstep } from '../utils/noise';

export interface HeroExitSignals {
  // Normalized [0..1] state drivers derived directly from ScrollDirector.scrollProgress
  activation: number; // State B (0.12 - 0.22): brick scatter & internal glow ramp
  zoomOut: number; // State C (0.22 - 0.31): sustained brick separation & withdrawal
  frostProgress: number; // State D (0.31 - 0.40): offscreen RT frost transition 0 -> 1
  atmoReveal: number; // State E (0.40 - 0.45): pure atmospheric void scene visible
  internalGlowBoost: number; // Extra inner luminance spilling through separating bricks
  brickSeparation: number; // Scalar drive for staggered upper-brick float + wobble
  smokeIntensity: number; // Smoky wind / dome vapor surge
  uiDissolve: number; // Manifesto / copyright / scroll hint dissolve & glitch (0 -> 1)
  waveSweep: number; // Diagonal activation wave front (0 -> 1 from upper-left to lower-right)
  opticalImpulse: number; // Localized lower-left foreground refraction impulse during State C pullback
}

const zeroSignals: HeroExitSignals = {
  activation: 0,
  zoomOut: 0,
  frostProgress: 0,
  atmoReveal: 0,
  internalGlowBoost: 0,
  brickSeparation: 0,
  smokeIntensity: 0.35,
  uiDissolve: 0,
  waveSweep: 0,
  opticalImpulse: 0,
};

/**
 * Pure frame-synced computation of Phase 1 Hero Exit states (A -> E) from scrollProgress [0..0.45].
 * Reversible continuously when scrolling back toward 0.
 */
export function computeHeroExitSignals(scrollProgress: number, reducedMotion: boolean): HeroExitSignals {
  if (scrollProgress <= 0.001) {
    return zeroSignals;
  }

  const p = clamp(scrollProgress, 0, 0.45);
  const activation = smoothstep(0.11, 0.22, p);
  const zoomOut = smoothstep(0.22, 0.31, p);
  const frostProgress = smoothstep(0.31, 0.4, p);
  const atmoReveal = smoothstep(0.4, 0.445, p);

  const brickSeparation = clamp(
    (activation * 0.72 + zoomOut * 0.42) * (reducedMotion ? 0.35 : 1.0),
    0,
    1.15,
  );
  const internalGlowBoost = activation * 0.85 + zoomOut * 0.45;
  const smokeIntensity = 0.35 + activation * 0.45 + zoomOut * 0.2 + frostProgress * 0.25;
  const uiDissolve = smoothstep(0.24, 0.355, p);
  const waveSweep = smoothstep(0.08, 0.29, p);
  const pullbackBell = Math.sin(smoothstep(0.19, 0.31, p) * Math.PI);
  const opticalImpulse = reducedMotion ? 0 : pullbackBell * (1 - frostProgress);

  return {
    activation,
    zoomOut,
    frostProgress,
    atmoReveal,
    internalGlowBoost,
    brickSeparation,
    smokeIntensity,
    uiDissolve,
    waveSweep,
    opticalImpulse,
  };
}
