import { clamp } from '../utils/noise';

/** Physical vertical travel: below the viewport -> centered focus -> above the viewport. */
export function getCrystalFlowOffset(scroll: number, start: number, focus: number, end: number): number {
  const distance = 8;

  return scroll <= focus
    ? distance * (clamp((scroll - start) / (focus - start), 0, 1) - 1)
    : distance * clamp((scroll - focus) / (end - focus), 0, 1);
}
