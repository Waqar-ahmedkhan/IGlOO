// World-space dimensions stay fixed through assembly, idle rotation and responsive camera changes.
export const PORTAL_LAYOUT = {
  shellInner: 2.65,
  shellOuter: 3.25,
  shellBevel: 0.055,
  arcBevel: 0.035,
  minimumGap: 0.5,
  surfaceFrostInner: 2.73,
  surfaceFrostOuter: 3.18,
} as const;

export const INNER_ARCS = [
  { inner: 1.72, outer: 2.04, angle: Math.PI * 1.34, depth: 0.42 },
  { inner: 1.06, outer: 1.3, angle: Math.PI * 1.1, depth: 0.32 },
  { inner: 1.74, outer: 1.93, angle: Math.PI * 0.65, depth: 0.2 },
] as const;
