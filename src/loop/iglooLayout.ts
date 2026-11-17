import * as THREE from 'three';
import { TAU, hash11 } from './math.ts';

/**
 * Architectural layout of the igloo: individual ice blocks with precise rest
 * transforms plus the per-block targets used by every phase of the loop
 * (floating, sculpture, ring slot, approach). Built once, deterministically.
 */

export const IGLOO_YAW = 0.55; // entrance faces the camera's lower-right in the opening shot
export const DOME_RADIUS = 2.75;
export const SCULPTURE_CENTER = new THREE.Vector3(0, 5.7, 0);
export const RING_CENTER = new THREE.Vector3(0, 7.4, 0);
export const RING_RADII = [2.9, 4.65, 6.4] as const;
export const RING_HEIGHTS = [0.38, 0.0, -0.38] as const;
export const RING_TURNS = [1.0, -0.7, 0.45] as const; // turns per loop

export type FloatMode = 0 | 1 | 2; // 0 = rise, 1 = radial, 2 = orbit

export interface IceBlock {
  index: number;
  row: number; // 0..4 dome courses, 5 = cap, 6 = tunnel
  isTunnel: boolean;
  restPos: THREE.Vector3;
  restQuat: THREE.Quaternion;
  restScale: THREE.Vector3;
  outward: THREE.Vector3;
  seed: number;
  tone: number;
  /** Diagonal wave order across the dome as seen from the opening shot (0..1). */
  wave: number;
  /** Bottom-up reconstruction order (0..1), tunnel last. */
  build: number;
  floatMode: FloatMode;
  floatDir: THREE.Vector3;
  floatLift: number;
  floatOrbit: number;
  tumbleAxis: THREE.Vector3;
  tumbleAngle: number;
  // Sculpture
  sculptDir: THREE.Vector3;
  sculptRadius: number;
  sculptRoll: number;
  sculptScale: THREE.Vector3;
  sculptOrder: number;
  // Ring
  ring: 0 | 1 | 2;
  ringSlot: number;
  ringCount: number;
  ringOrder: number;
  peelOrder: number;
  // Approach (before snapping home)
  approachPos: THREE.Vector3;
  approachTilt: THREE.Quaternion;
}

const _m = new THREE.Matrix4();
const _x = new THREE.Vector3();
const _yawQ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), IGLOO_YAW);

function basisQuat(x: THREE.Vector3, y: THREE.Vector3, z: THREE.Vector3): THREE.Quaternion {
  _m.makeBasis(x, y, z);
  return new THREE.Quaternion().setFromRotationMatrix(_m);
}

interface RawBlock {
  row: number;
  isTunnel: boolean;
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  scale: THREE.Vector3;
  outward: THREE.Vector3;
  buildLocal: number;
}

function buildRawBlocks(): RawBlock[] {
  const raw: RawBlock[] = [];
  const R = DOME_RADIUS;
  const rows = 5;
  const span = Math.PI / 2 / (rows + 0.6);
  const counts = [16, 15, 13, 9, 5];

  for (let row = 0; row < rows; row++) {
    const phi = (row + 0.5) * span;
    const ringR = Math.cos(phi) * R;
    const y = Math.sin(phi) * R;
    const count = counts[row];
    const step = TAU / count;
    const offset = row <= 1 ? step * 0.5 : (row % 2) * step * 0.5;
    const circumference = TAU * ringR;

    for (let i = 0; i < count; i++) {
      const theta = i * step + offset;
      const a = Math.atan2(Math.sin(theta), Math.cos(theta)); // angle from +Z (front)
      if (row <= 1 && Math.abs(a) < 0.4) continue; // doorway opening

      const s = Math.sin(theta);
      const c = Math.cos(theta);
      const normal = new THREE.Vector3(s * Math.cos(phi), Math.sin(phi), c * Math.cos(phi)).normalize();
      const tangent = new THREE.Vector3(c, 0, -s).normalize();
      const bitangent = new THREE.Vector3().crossVectors(normal, tangent).normalize();
      const q = basisQuat(tangent, bitangent, normal);
      const jitter = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (hash11(row * 31 + i * 7.1) - 0.5) * 0.035,
          (hash11(row * 17 + i * 3.3) - 0.5) * 0.035,
          (hash11(row * 13 + i * 5.7) - 0.5) * 0.03,
        ),
      );
      q.multiply(jitter);

      const width = (circumference / count) * (0.93 + hash11(row * 11 + i) * 0.035);
      const height = R * span * (0.93 + hash11(row * 5 + i * 2.1) * 0.03);
      const depth = 0.56 + hash11(row * 3 + i * 9.1) * 0.08;

      raw.push({
        row,
        isTunnel: false,
        pos: new THREE.Vector3(s * ringR, y, c * ringR),
        quat: q,
        scale: new THREE.Vector3(width, height, depth),
        outward: normal.clone(),
        buildLocal: (row + (i / count) * 0.6) / rows,
      });
    }
  }

  // Keystone cap
  {
    const top = Math.sin(rows * span + span * 0.2) * R;
    raw.push({
      row: 5,
      isTunnel: false,
      pos: new THREE.Vector3(0, top + 0.08, 0),
      quat: basisQuat(new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)),
      scale: new THREE.Vector3(1.18, 1.18, 0.5),
      outward: new THREE.Vector3(0, 1, 0),
      buildLocal: 1,
    });
  }

  // Arched entrance tunnel (+Z local), three courses, five voussoirs + two jambs each
  const archR = 0.84;
  const archBaseY = 0.42;
  const courses = [2.62, 3.12, 3.62];
  for (let ci = 0; ci < courses.length; ci++) {
    const z = courses[ci];
    for (let sIdx = 0; sIdx < 5; sIdx++) {
      const a = (-0.8 + sIdx * 0.4) * (Math.PI / 2); // -72deg .. 72deg from top
      const radial = new THREE.Vector3(Math.sin(a), Math.cos(a), 0);
      const tangent = new THREE.Vector3(Math.cos(a), -Math.sin(a), 0);
      const axis = new THREE.Vector3(0, 0, -1);
      raw.push({
        row: 6,
        isTunnel: true,
        pos: new THREE.Vector3(radial.x * archR, archBaseY + radial.y * archR, z),
        quat: basisQuat(tangent, axis, radial),
        scale: new THREE.Vector3(0.5, 0.47, 0.42),
        outward: new THREE.Vector3(radial.x, radial.y, 0.25).normalize(),
        buildLocal: ci / 3 + (sIdx === 2 ? 0.25 : Math.abs(sIdx - 2) === 1 ? 0.15 : 0.05),
      });
    }
    for (const side of [-1, 1]) {
      raw.push({
        row: 6,
        isTunnel: true,
        pos: new THREE.Vector3(side * archR, 0.21, z),
        quat: basisQuat(new THREE.Vector3(0, 0, -side), new THREE.Vector3(0, 1, 0), new THREE.Vector3(side, 0, 0)),
        scale: new THREE.Vector3(0.47, 0.42, 0.42),
        outward: new THREE.Vector3(side, 0.15, 0.2).normalize(),
        buildLocal: ci / 3,
      });
    }
  }

  return raw;
}

export function buildIceBlocks(): IceBlock[] {
  const raw = buildRawBlocks();
  const n = raw.length;

  // Opening-shot camera "right" axis for the diagonal (upper-left -> lower-right) wave.
  const right = new THREE.Vector3(0.838, 0, 0.546);

  const blocks: IceBlock[] = raw.map((r, index) => {
    const seed = hash11(index * 1.618 + 4.2);
    const tone = hash11(index * 2.414 + 9.7);
    const restPos = r.pos.clone().applyQuaternion(_yawQ);
    const restQuat = _yawQ.clone().multiply(r.quat);
    const outward = r.outward.clone().applyQuaternion(_yawQ).normalize();

    const xr = restPos.dot(right) / (DOME_RADIUS + 1.2);
    const wave = Math.min(1, Math.max(0, (xr * 0.5 + 0.5) * 0.55 + (1 - restPos.y / (DOME_RADIUS + 0.2)) * 0.45));
    const build = r.isTunnel ? 0.8 + r.buildLocal * 0.2 : r.row === 5 ? 0.74 : r.buildLocal * 0.72;

    const floatMode = (Math.floor(seed * 3) % 3) as FloatMode;
    const rowNorm = Math.min(1, r.row / 5);
    const floatDir = outward.clone();
    floatDir.y = Math.max(floatDir.y, 0.15);
    floatDir.normalize();

    const axisSeed = hash11(index * 3.7 + 1.1) * TAU;
    const tumbleAxis = new THREE.Vector3(Math.cos(axisSeed), 0.6 + seed, Math.sin(axisSeed)).normalize();

    return {
      index,
      row: r.row,
      isTunnel: r.isTunnel,
      restPos,
      restQuat,
      restScale: r.scale.clone(),
      outward,
      seed,
      tone,
      wave,
      build,
      floatMode,
      floatDir,
      floatLift: floatMode === 0 ? 1.6 + rowNorm * 2.2 + seed * 0.8 : 0.4 + rowNorm * 1.1,
      floatOrbit: floatMode === 2 ? (seed > 0.5 ? 1 : -1) * (0.55 + seed * 0.4) : 0.08,
      tumbleAxis,
      tumbleAngle: 0.25 + seed * 0.55,
      sculptDir: new THREE.Vector3(),
      sculptRadius: 0,
      sculptRoll: hash11(index * 5.3) * TAU,
      sculptScale: new THREE.Vector3(),
      sculptOrder: hash11(index * 0.618 + 7.7),
      ring: 0,
      ringSlot: 0,
      ringCount: 1,
      ringOrder: 0,
      peelOrder: 0,
      approachPos: new THREE.Vector3(),
      approachTilt: new THREE.Quaternion(),
    };
  });

  // Sculpture: a vertical spindle of radiating shards (Fibonacci directions, stretched in Y).
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const b = blocks[i];
    const yy = 1 - (i + 0.5) / n * 2;
    const rr = Math.sqrt(1 - yy * yy);
    const th = i * golden;
    b.sculptDir.set(Math.cos(th) * rr, yy * 1.55, Math.sin(th) * rr).normalize();
    const spike = Math.pow(hash11(i * 9.13 + 2.0), 1.6);
    b.sculptRadius = 1.15 + spike * 2.5 + Math.abs(yy) * 0.9;
    const avg = (b.restScale.x + b.restScale.y) * 0.5;
    b.sculptScale.set(avg * 0.5, avg * 0.42, 1.5 + spike * 1.4);
  }

  // Rings: top courses -> inner ring, middle courses -> mid ring, base + tunnel -> outer ring.
  const ringOf = (b: IceBlock): 0 | 1 | 2 => (b.row >= 3 ? 0 : b.row >= 1 ? 1 : 2);
  const groups: IceBlock[][] = [[], [], []];
  for (const b of blocks) groups[ringOf(b)].push(b);
  groups.forEach((g, k) => {
    g.sort((a, c) => Math.atan2(a.restPos.x, a.restPos.z) - Math.atan2(c.restPos.x, c.restPos.z));
    g.forEach((b, slot) => {
      b.ring = k as 0 | 1 | 2;
      b.ringSlot = slot;
      b.ringCount = g.length;
      b.ringOrder = (k * 0.3 + (slot / g.length) * 0.7);
      b.peelOrder = ((slot / g.length) * 0.75 + (2 - k) * 0.12) / 0.99;
    });
  });

  // Approach hover positions just outside the final alignment.
  for (const b of blocks) {
    b.approachPos.copy(b.restPos).addScaledVector(b.outward, 1.05).add(new THREE.Vector3(0, 0.55 + b.seed * 0.4, 0));
    _x.set(hash11(b.index * 1.3) - 0.5, hash11(b.index * 2.9) - 0.5, hash11(b.index * 4.1) - 0.5).normalize();
    b.approachTilt.setFromAxisAngle(_x, 0.22 + b.seed * 0.18);
  }

  return blocks;
}

/** Nearest-neighbour pairs at rest, used for the luminous connection filaments. */
export function buildNeighbourPairs(blocks: IceBlock[], perBlock = 2): [number, number][] {
  const pairs: [number, number][] = [];
  const seen = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const dists: { j: number; d: number }[] = [];
    for (let j = 0; j < blocks.length; j++) {
      if (i === j) continue;
      dists.push({ j, d: blocks[i].restPos.distanceToSquared(blocks[j].restPos) });
    }
    dists.sort((a, b) => a.d - b.d);
    for (let k = 0; k < perBlock; k++) {
      const j = dists[k].j;
      const key = i < j ? `${i}-${j}` : `${j}-${i}`;
      if (seen.has(key)) continue;
      seen.add(key);
      pairs.push([i, j]);
    }
  }
  return pairs;
}
