import { clamp, lerp, smoothstep } from '../utils/noise';

/** One reversible sound envelope shared by every scene; sound remains opt-in at the controller. */
export function computeAtmosphere(
  scroll: number,
  activation: number,
  frost: number,
  velocity: number,
  detail: number,
  particleMotion: number,
) {
  const speed = clamp(Math.abs(velocity) * 8, 0, 1);
  const hero = clamp(scroll / 0.45, 0, 1);
  const portfolio = smoothstep(0.4, 0.45, scroll);
  const portal = smoothstep(0.9, 0.98, scroll);
  const portalProgress = clamp((scroll - 0.92) / 0.5, 0, 1);
  const passage = smoothstep(0.68, 0.77, portalProgress) * (1 - smoothstep(0.8, 0.92, portalProgress));
  const particles = smoothstep(1.32, 1.4, scroll) * clamp(particleMotion, 0, 1);
  const focus = clamp(detail, 0, 1);

  return {
    wind: lerp(lerp(0.38 + hero * 0.25 + frost * 0.28 + speed * 0.14, 0.32 - focus * 0.16, portfolio),
      0.22 + passage * 0.22 + particles * 0.07, portal),
    windFrequency: lerp(230 + hero * 260 + frost * 420 + speed * 180, 280 + passage * 340 + particles * 220, portal),
    music: lerp(lerp(0.085 + activation * 0.045, 0.095 + focus * 0.04, portfolio), 0.085 + particles * 0.012, portal),
    musicFrequency: lerp(320 - focus * portfolio * 140, 280 + particles * 100, portal),
    resonance: lerp(0.0001 + activation * (1 - frost * 0.7) * 0.42, 0.015 + particles * 0.05, portfolio),
    subAir: lerp(0.0001 + (scroll > 0.12 ? 0.06 + speed * 0.14 : 0), 0.055 + passage * 0.055, portal),
  };
}
