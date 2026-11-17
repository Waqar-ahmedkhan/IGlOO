import { smoothstep } from '../utils/noise';

/** Prepare the character for the downward passage, then resolve it above the destination stage. */
export function getSculptureReveal(portalProgress: number): number {
  const preview = smoothstep(0.42, 0.62, portalProgress) * 0.65;
  const arrival = smoothstep(0.76, 0.84, portalProgress);

  return preview + (1 - preview) * arrival;
}
