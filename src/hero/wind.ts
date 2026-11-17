/** Shared slow gusts; integrated drift avoids changing the speed of old particles as time accumulates. */
export function sampleWind(time: number, reducedMotion: boolean) {
  if (reducedMotion) return { time: 0, gust: 0, strength: 0, drift: 0 };
  const gust = (0.5 + Math.sin(time * 0.17) * 0.5) * (0.5 + Math.sin(time * 0.07 + 0.8) * 0.5);
  // Integral of 0.35 + 0.45 * gust, starting at zero.
  const drift = time * 0.4625
    + 0.1125 * (1 - Math.cos(time * 0.17)) / 0.17
    + 0.1125 * (Math.cos(0.8) - Math.cos(time * 0.07 + 0.8)) / 0.07
    + 0.05625 * (Math.sin(time * 0.1 - 0.8) + Math.sin(0.8)) / 0.1
    - 0.05625 * (Math.sin(time * 0.24 + 0.8) - Math.sin(0.8)) / 0.24;

  return { time, gust, strength: 0.35 + gust * 0.45, drift };
}
