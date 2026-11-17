import * as THREE from 'three';
import {
  TAU,
  lerp,
  smootherstep,
  snapEase,
  windowed,
  periodicBSpline,
  periodicBSplineDerivative,
  type V3,
} from './math.ts';
import {
  type IceBlock,
  SCULPTURE_CENTER,
  RING_CENTER,
  RING_RADII,
  RING_HEIGHTS,
  RING_TURNS,
} from './iglooLayout.ts';

/**
 * The single source of truth for the 60-second cycle.
 * Every visual and audible property is a pure function of normalized progress p in [0,1).
 * Construction guarantees state(0) === state(1): every block sits exactly at rest
 * near both ends of the loop, and every envelope is zero at both ends.
 */

export const LOOP_DURATION = 60;

export interface PhaseInfo {
  id: string;
  title: string;
  caption: string;
}

export const PHASES: readonly PhaseInfo[] = [
  { id: '01', title: 'The Frozen World', caption: 'Establishing structure' },
  { id: '02', title: 'Architectural Deconstruction', caption: 'Diagonal release wave' },
  { id: '03', title: 'Floating Ice Sculpture', caption: 'Suspended shard formation' },
  { id: '04', title: 'Luminous Portal', caption: 'Concentric ring system' },
  { id: '05', title: 'Particle Reconstruction', caption: 'Condensing toward alignment' },
  { id: '06', title: 'Return to the Igloo', caption: 'Architectural lock' },
];

export function phaseIndex(p: number): number {
  return Math.min(5, Math.max(0, Math.floor(p * 6)));
}

/* ------------------------------------------------------------------------ */
/* Block timings                                                            */
/* ------------------------------------------------------------------------ */

export interface BlockTimings {
  sepStart: number;
  sepEnd: number;
  sculptStart: number;
  sculptEnd: number;
  ringStart: number;
  ringEnd: number;
  peelStart: number;
  peelEnd: number;
  snapStart: number;
  snapEnd: number;
  /** Loop positions of audible / visible events. */
  sepEvent: number;
  snapEvent: number;
}

export function computeTimings(b: IceBlock): BlockTimings {
  const sepStart = 1 / 6 + 0.075 * b.wave;
  const sculptStart = 0.305 + 0.07 * b.sculptOrder;
  const ringStart = 0.49 + 0.05 * b.ringOrder;
  const peelStart = 0.672 + 0.07 * b.peelOrder;
  const snapStart = 0.835 + 0.1 * b.build;
  const snapEnd = snapStart + 0.024;
  return {
    sepStart,
    sepEnd: sepStart + 0.06,
    sculptStart,
    sculptEnd: sculptStart + 0.07,
    ringStart,
    ringEnd: ringStart + 0.06,
    peelStart,
    peelEnd: peelStart + 0.085,
    snapStart,
    snapEnd,
    sepEvent: sepStart + 0.008,
    snapEvent: snapEnd - 0.004,
  };
}

/* ------------------------------------------------------------------------ */
/* Block evaluation                                                         */
/* ------------------------------------------------------------------------ */

export interface BlockState {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  /** Edge outline luminance (0..~1.6). */
  glow: number;
  /** Faint geometric wireframe shell opacity (0..1). */
  wire: number;
  /** Distance from the block's architectural home. */
  detach: number;
}

export function createBlockState(): BlockState {
  return {
    pos: new THREE.Vector3(),
    quat: new THREE.Quaternion(),
    scale: new THREE.Vector3(1, 1, 1),
    glow: 0,
    wire: 0,
    detach: 0,
  };
}

const UP = new THREE.Vector3(0, 1, 0);
const Z_AXIS = new THREE.Vector3(0, 0, 1);
const _f = new THREE.Vector3();
const _s = new THREE.Vector3();
const _g = new THREE.Vector3();
const _a = new THREE.Vector3();
const _tmp = new THREE.Vector3();
const _tmp2 = new THREE.Vector3();
const _fq = new THREE.Quaternion();
const _sq = new THREE.Quaternion();
const _gq = new THREE.Quaternion();
const _aq = new THREE.Quaternion();
const _q1 = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _mat = new THREE.Matrix4();
const _ringScale = new THREE.Vector3();
const _bx = new THREE.Vector3();
const _bz = new THREE.Vector3();

function rotateY(v: THREE.Vector3, angle: number): THREE.Vector3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const x = v.x * c + v.z * s;
  const z = -v.x * s + v.z * c;
  v.x = x;
  v.z = z;
  return v;
}

/** Sculpture rotation (radians) as a function of p. */
export function sculptureAngle(p: number): number {
  return TAU * 1.1 * p;
}

export function ringAngle(ring: number, p: number): number {
  return RING_TURNS[ring] * TAU * p;
}

export function evaluateBlock(b: IceBlock, t: BlockTimings, p: number, out: BlockState): BlockState {
  const rowNorm = Math.min(1, b.row / 5);

  // --- Weights (each 0 -> 1, sequential per block)
  const wa = smootherstep(t.sepStart, t.sepEnd, p);
  const wb = smootherstep(t.sculptStart, t.sculptEnd, p);
  const wc = smootherstep(t.ringStart, t.ringEnd, p);
  const we = smootherstep(t.peelStart, t.peelEnd, p);
  const wf = p <= t.snapStart ? 0 : snapEase((p - t.snapStart) / (t.snapEnd - t.snapStart), 0.035);

  // --- F: floating deconstruction (keeps silhouette early, opens up later)
  const amp = 0.28 + 0.72 * smootherstep(0.2, 0.335, p);
  _f.copy(b.restPos);
  if (b.floatMode === 0) {
    _f.addScaledVector(UP, b.floatLift * amp).addScaledVector(b.outward, 0.35 * amp);
  } else if (b.floatMode === 1) {
    _f.addScaledVector(b.floatDir, (1.3 + b.seed * 1.1) * amp).addScaledVector(UP, b.floatLift * 0.6 * amp);
  } else {
    _f.addScaledVector(b.outward, 0.85 * amp).addScaledVector(UP, b.floatLift * 0.55 * amp);
  }
  rotateY(_f, b.floatOrbit * smootherstep(t.sepStart, 0.5, p) * amp);
  _f.y += 0.06 * Math.sin(TAU * 4 * p + b.seed * TAU) * wa;

  _q1.setFromAxisAngle(b.tumbleAxis, b.tumbleAngle * amp * wa + 0.35 * b.seed * smootherstep(t.sepEnd, 0.5, p));
  _fq.copy(_q1).multiply(b.restQuat);

  // --- S: suspended shard sculpture
  const theta = sculptureAngle(p);
  const breath = 1 + 0.035 * Math.sin(TAU * 3 * p + b.seed * TAU);
  _s.copy(b.sculptDir).multiplyScalar(b.sculptRadius * breath);
  rotateY(_s, theta);
  _s.add(SCULPTURE_CENTER);
  _s.y += 0.14 * Math.sin(TAU * 2 * p);
  _tmp.copy(b.sculptDir);
  _sq.setFromUnitVectors(Z_AXIS, _tmp);
  _q2.setFromAxisAngle(Z_AXIS, b.sculptRoll);
  _sq.multiply(_q2);
  _q2.setFromAxisAngle(UP, theta);
  _sq.premultiply(_q2);

  // --- G: ring slot (rings rotate with p)
  const phi = (b.ringSlot / b.ringCount) * TAU + ringAngle(b.ring, p);
  const r = RING_RADII[b.ring];
  _g.set(Math.sin(phi) * r, RING_HEIGHTS[b.ring], Math.cos(phi) * r).add(RING_CENTER);
  _g.y += 0.05 * Math.sin(TAU * 5 * p + b.ringSlot * 0.7);
  _bx.set(Math.cos(phi), 0, -Math.sin(phi));
  _bz.set(Math.sin(phi), 0, Math.cos(phi));
  _mat.makeBasis(_bx, UP, _bz);
  _gq.setFromRotationMatrix(_mat);
  _q2.setFromAxisAngle(_bx, 0.1 * (b.ring - 1));
  _gq.premultiply(_q2);
  const chunk = 0.95 + b.seed * 0.1;
  _ringScale.set(0.8 * chunk, 0.6 * chunk, 0.48 * chunk);

  // --- A: approach hover just outside the final alignment
  _a.copy(b.approachPos);
  _a.y += 0.07 * Math.sin(TAU * 3 * p + b.seed * TAU);
  _aq.copy(b.restQuat).multiply(b.approachTilt);

  // --- Chain the stages
  const pos = out.pos.copy(b.restPos);
  pos.lerp(_f, wa);

  pos.lerp(_s, wb);
  pos.y += Math.sin(Math.PI * wb) * 0.9;

  pos.lerp(_g, wc);
  if (wc > 0 && wc < 1) {
    _tmp2.set(pos.x - RING_CENTER.x, 0, pos.z - RING_CENTER.z);
    const len = _tmp2.length() || 1;
    const arc = Math.sin(Math.PI * wc);
    pos.addScaledVector(_tmp2, (arc * 1.4) / len);
    pos.y += arc * 0.45;
  }

  pos.lerp(_a, we);
  if (we > 0 && we < 1) {
    const arc = Math.sin(Math.PI * we);
    _tmp2.set(pos.z, 0, -pos.x); // tangential swirl around the vertical axis
    const len = _tmp2.length() || 1;
    pos.addScaledVector(_tmp2, (arc * 1.7 * (b.ring === 1 ? -1 : 1)) / len);
    pos.y += arc * (2.2 + rowNorm);
  }

  pos.lerp(b.restPos, wf);

  const quat = out.quat.copy(b.restQuat);
  quat.slerp(_fq, wa);
  quat.slerp(_sq, wb);
  quat.slerp(_gq, wc);
  quat.slerp(_aq, we);
  quat.slerp(b.restQuat, Math.min(1, wf));

  const scale = out.scale.copy(b.restScale);
  scale.lerp(b.sculptScale, wb);
  scale.lerp(_ringScale, wc);
  scale.lerp(b.restScale, we);

  // --- Light response
  const detach = pos.distanceTo(b.restPos);
  const away = smootherstep(0.03, 0.75, detach);
  const pre = windowed(p, 0.025 + 0.1 * b.wave, 0.075 + 0.1 * b.wave, t.snapStart, t.snapEnd + 0.012);
  const flash = windowed(p, t.snapEnd - 0.005, t.snapEnd, t.snapEnd + 0.002, t.snapEnd + 0.03);
  const ringBoost = wc * (1 - we);
  out.detach = detach;
  out.glow = Math.max(pre * 0.5, away * 0.82) + ringBoost * 0.35 + flash * 0.95;
  out.wire = away * 0.6 + flash * 0.35 + pre * 0.12;
  return out;
}

/* ------------------------------------------------------------------------ */
/* Camera choreography                                                      */
/* ------------------------------------------------------------------------ */

/**
 * Twelve control points, one every 5 seconds. The closed cubic B-spline through
 * them is C2-continuous, so the camera's direction AND speed match at the seam.
 */
export const CAMERA_POINTS: readonly V3[] = [
  { x: -8.2, y: 2.0, z: 12.4 }, // 00s  low wide three-quarter, front-left
  { x: -11.2, y: 2.3, z: 7.0 }, // 05s  push in, orbit toward the side
  { x: -10.6, y: 3.2, z: 0.6 }, // 10s  side tracking, strong parallax
  { x: -8.6, y: 5.2, z: -4.6 }, // 15s  rise, close to floating blocks
  { x: -3.4, y: 7.4, z: -9.6 }, // 20s
  { x: 6.2, y: 9.4, z: -9.4 }, // 25s  dramatic orbit around the sculpture
  { x: 11.4, y: 13.6, z: 0.4 }, // 30s  high angle on the sculpture
  { x: 5.4, y: 25.0, z: 6.2 }, // 35s  top-down reveal of the rings
  { x: 1.8, y: 20.0, z: 3.2 }, // 40s  approach the ring centre
  { x: 8.6, y: 12.6, z: 9.8 }, // 45s  pull away, follow the fragments down
  { x: 6.4, y: 5.0, z: 14.8 }, // 50s  toward the mountain
  { x: -2.4, y: 2.4, z: 16.0 }, // 55s  smooth pullback, close the orbit
];

export const TARGET_POINTS: readonly V3[] = [
  { x: 0.2, y: 1.15, z: 0.2 },
  { x: 0.1, y: 1.3, z: 0.1 },
  { x: 0.0, y: 1.9, z: 0.0 },
  { x: 0.0, y: 3.3, z: 0.2 },
  { x: 0.0, y: 4.7, z: 0.0 },
  { x: 0.0, y: 5.5, z: 0.0 },
  { x: 0.0, y: 6.0, z: 0.0 },
  { x: 0.0, y: 7.2, z: 0.0 },
  { x: 0.0, y: 7.3, z: 0.0 },
  { x: 0.0, y: 5.0, z: 0.0 },
  { x: 0.1, y: 2.4, z: 0.1 },
  { x: 0.2, y: 1.3, z: 0.2 },
];

export function evaluateCamera(p: number, outPos: V3, outTarget: V3): void {
  periodicBSpline(CAMERA_POINTS, p, outPos);
  periodicBSpline(TARGET_POINTS, p, outTarget);
}

/** Camera velocity in world units per loop (divide by LOOP_DURATION for units/second). */
export function evaluateCameraVelocity(p: number, out: V3): V3 {
  return periodicBSplineDerivative(CAMERA_POINTS, p, out);
}

/* ------------------------------------------------------------------------ */
/* Global envelopes                                                         */
/* ------------------------------------------------------------------------ */

export interface GlobalState {
  fogDensity: number;
  keyLight: number;
  hemiLight: number;
  coreLight: number;
  ringVisible: number;
  ringSweep: number;
  ringBreak: number;
  domeWire: number;
  domeSweep: number;
  connections: number;
  bloom: number;
  sculptMotion: number;
}

export function createGlobalState(): GlobalState {
  return {
    fogDensity: 0,
    keyLight: 1,
    hemiLight: 1,
    coreLight: 0,
    ringVisible: 0,
    ringSweep: 0,
    ringBreak: 0,
    domeWire: 0,
    domeSweep: 0,
    connections: 0,
    bloom: 0,
    sculptMotion: 0,
  };
}

export function evaluateGlobals(p: number, out: GlobalState): GlobalState {
  const abstract = windowed(p, 0.28, 0.4, 0.66, 0.8);
  out.fogDensity = 0.0052 + 0.0011 * abstract;
  out.keyLight = 1 - 0.16 * windowed(p, 0.42, 0.52, 0.68, 0.8);
  out.hemiLight = 1 - 0.08 * abstract;
  out.ringVisible = windowed(p, 0.47, 0.545, 0.7, 0.79);
  out.ringSweep = smootherstep(0.48, 0.585, p);
  out.ringBreak = smootherstep(0.665, 0.765, p);
  out.coreLight = windowed(p, 0.55, 0.62, 0.7, 0.78);
  const wireEarly = 0.34 * windowed(p, 0.02, 0.12, 0.2, 0.27);
  const wireLate = 0.8 * windowed(p, 0.735, 0.8, 0.885, 0.955);
  out.domeWire = Math.max(wireEarly, wireLate);
  out.domeSweep = p < 0.5 ? smootherstep(0.02, 0.13, p) : smootherstep(0.735, 0.81, p);
  out.connections = windowed(p, 0.18, 0.235, 0.4, 0.48);
  out.bloom = 0.3 + 0.28 * out.ringVisible + 0.1 * abstract;
  out.sculptMotion = windowed(p, 0.3, 0.36, 0.46, 0.52);
  return out;
}

export { lerp };
