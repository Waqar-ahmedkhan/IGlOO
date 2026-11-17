/**
 * Frame-rate independent damping and spring helpers.
 */

export function damp(current: number, target: number, lambda: number, delta: number): number {
  return current + (target - current) * (1 - Math.exp(-lambda * Math.min(delta, 0.1)));
}

export function dampAngle(current: number, target: number, lambda: number, delta: number): number {
  let diff = ((target - current + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * Math.min(delta, 0.1)));
}

export interface SpringState {
  value: number;
  velocity: number;
}

export function stepSpring(
  state: SpringState,
  target: number,
  stiffness: number,
  dampingRatio: number,
  delta: number,
): number {
  const dt = Math.min(delta, 0.05);
  const force = (target - state.value) * stiffness;
  state.velocity = (state.velocity + force * dt) * Math.exp(-dampingRatio * dt);
  state.value += state.velocity * dt;
  return state.value;
}
