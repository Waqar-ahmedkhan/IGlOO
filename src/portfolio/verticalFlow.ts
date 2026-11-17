import { clamp } from '../utils/noise';

/** Physical vertical travel: tight, fluid vertical transition between crystal models. */
export function getCrystalFlowOffset(scroll: number, start: number, focus: number, end: number): number {
  const distance = 7.4;

  const travel = scroll <= focus
    ? clamp((scroll - start) / (focus - start), 0, 1) - 1
    : clamp((scroll - focus) / (end - focus), 0, 1);

  // Spend longer around readable center; tighten gap travel between models.
  return distance * (travel * 0.72 + travel * travel * travel * 0.28);
}
