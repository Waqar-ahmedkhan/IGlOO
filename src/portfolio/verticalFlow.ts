import { clamp } from '../utils/noise';

/** Physical vertical travel: below the viewport -> centered focus -> above the viewport. */
export function getCrystalFlowOffset(scroll: number, start: number, focus: number, end: number): number {
  const distance = 8;

  const travel = scroll <= focus
    ? clamp((scroll - start) / (focus - start), 0, 1) - 1
    : clamp((scroll - focus) / (end - focus), 0, 1);

  // Spend longer around the readable center; speed up only as the model leaves the viewport.
  return distance * (travel * 0.65 + travel * travel * travel * 0.35);
}
