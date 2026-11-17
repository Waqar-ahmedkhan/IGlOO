import * as THREE from 'three';
import { createSeededRandom, noise3D } from '../utils/noise';

export interface IglooBrickMeta {
  id: number;
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  outwardDir: THREE.Vector3;
  scale: THREE.Vector3;
  row: number;
  maxRow: number;
  isTunnel: boolean;
  isInteractive: boolean;
  seed: number;
  tone: number;
  code: string;
  wavePos: number;
}

const STABLE_TELEMETRY_CODES = [
  '01', '04', '05', '16', '25', '26', '27', '47',
  '08', '12', '19', '31', '38', '42', '54', '63',
] as const;

function computeBrickWavePos(pos: THREE.Vector3, domeRadius: number): number {
  const normalizedX = THREE.MathUtils.clamp((pos.x + domeRadius) / (domeRadius * 2), 0, 1);
  const normalizedY = THREE.MathUtils.clamp(pos.y / (domeRadius * 0.96), 0, 1);
  return THREE.MathUtils.clamp(normalizedX * 0.55 + (1 - normalizedY) * 0.45, 0, 1);
}

/**
 * Generates a rounded-bevel masonry stone/ice brick geometry matching the chunky
 * carved blocks in the reference screenshots.
 */
export function createMasonryBlockGeometry(): THREE.BufferGeometry {
  const geom = new THREE.BoxGeometry(1, 1, 1, 6, 4, 4);
  const pos = geom.attributes.position;
  const v = new THREE.Vector3();

  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);

    const bevel = 0.1;
    const nx = Math.sign(v.x) * Math.min(Math.abs(v.x), 0.5 - bevel);
    const ny = Math.sign(v.y) * Math.min(Math.abs(v.y), 0.5 - bevel);
    const nz = Math.sign(v.z) * Math.min(Math.abs(v.z), 0.5 - bevel);

    const dx = v.x - nx;
    const dy = v.y - ny;
    const dz = v.z - nz;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len > 1e-5) {
      const r = bevel * 0.92;
      v.set(nx + (dx / len) * r, ny + (dy / len) * r, nz + (dz / len) * r);
    }

    const n1 = noise3D(v.x * 4.5 + 1.3, v.y * 4.5 - 0.7, v.z * 4.5 + 2.1);
    const n2 = noise3D(v.y * 6.0, v.z * 6.0, v.x * 6.0);
    v.x += n1 * 0.008;
    v.y += n2 * 0.006;
    v.z += noise3D(v.z * 4.8, v.x * 4.8, v.y * 4.8) * 0.008;

    if (v.y > 0) {
      v.x *= 0.955;
      v.z *= 0.965;
    }

    pos.setXYZ(i, v.x, v.y, v.z);
  }

  geom.computeVertexNormals();
  return geom;
}

/**
 * Builds staggered circular masonry courses + 4-wedge keystone crown + arched entrance tunnel
 * matching the exact masonry proportions in the reference screenshots.
 */
export function buildIglooBricks(): IglooBrickMeta[] {
  const rand = createSeededRandom(90125);
  const bricks: IglooBrickMeta[] = [];

  const domeRadius = 2.66;
  const rows = 4;
  const maxRow = rows;
  let idCounter = 0;

  for (let row = 0; row < rows; row++) {
    const t0 = row / (rows + 0.55);
    const t1 = (row + 1) / (rows + 0.55);
    const phi = THREE.MathUtils.lerp(0.12, Math.PI * 0.4, (t0 + t1) * 0.5);
    const ringRadius = Math.cos(phi) * domeRadius;
    const y = Math.sin(phi) * domeRadius * 0.96;

    const circumference = 2 * Math.PI * ringRadius;
    const targetArc = 1.06;
    const count = Math.max(5, Math.round(circumference / targetArc));
    const angleStep = (Math.PI * 2) / count;
    const stagger = (row % 2) * (angleStep * 0.5);

    for (let i = 0; i < count; i++) {
      const theta = i * angleStep + stagger;
      const sinT = Math.sin(theta);
      const cosT = Math.cos(theta);

      // Doorway cutout facing +Z (oriented lower-right by group rotation)
      const angleFromFront = Math.atan2(sinT, cosT);
      const doorwayHalfAngle = row === 0 ? 0.42 : row === 1 ? 0.34 : 0;
      if (doorwayHalfAngle > 0 && Math.abs(angleFromFront) < doorwayHalfAngle) {
        continue;
      }

      const x = sinT * ringRadius;
      const z = cosT * ringRadius;

      const basePos = new THREE.Vector3(x, y, z);
      const radialOut = new THREE.Vector3(x, y * 1.12, z).normalize();

      const tangent = new THREE.Vector3(cosT, 0, -sinT).normalize();
      const surfaceNormal = new THREE.Vector3(
        sinT * Math.cos(phi),
        Math.sin(phi),
        cosT * Math.cos(phi),
      ).normalize();
      const bitangent = new THREE.Vector3().crossVectors(surfaceNormal, tangent).normalize();

      const basis = new THREE.Matrix4().makeBasis(tangent, bitangent, surfaceNormal);
      const baseQuat = new THREE.Quaternion().setFromRotationMatrix(basis);

      const jitterQuat = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(
          (rand() - 0.5) * 0.032,
          (rand() - 0.5) * 0.032,
          (rand() - 0.5) * 0.025,
        ),
      );
      baseQuat.multiply(jitterQuat);

      const brickWidth = (circumference / count) * (0.94 + rand() * 0.04);
      const brickHeight = ((domeRadius * 1.24) / rows) * (0.91 + rand() * 0.05);
      const brickDepth = 0.56 + rand() * 0.08;

      const id = idCounter++;
      bricks.push({
        id,
        basePos,
        baseQuat,
        outwardDir: radialOut,
        scale: new THREE.Vector3(brickWidth, brickHeight, brickDepth),
        row,
        maxRow,
        isTunnel: false,
        isInteractive: row >= 1,
        seed: rand(),
        tone: rand(),
        code: STABLE_TELEMETRY_CODES[id % STABLE_TELEMETRY_CODES.length],
        wavePos: computeBrickWavePos(basePos, domeRadius),
      });
    }
  }

  // 4-wedge radial keystone crown cap at apex (visible in all 5 reference screenshots)
  const capPhi = Math.PI * 0.445;
  const capR = Math.cos(capPhi) * domeRadius * 0.78;
  const capY = Math.sin(capPhi) * domeRadius * 0.96;
  for (let w = 0; w < 4; w++) {
    const theta = (w / 4) * Math.PI * 2 + Math.PI * 0.25;
    const sinT = Math.sin(theta);
    const cosT = Math.cos(theta);
    const x = sinT * capR;
    const z = cosT * capR;
    const basePos = new THREE.Vector3(x, capY, z);
    const radialOut = new THREE.Vector3(x, capY * 1.15, z).normalize();
    const tangent = new THREE.Vector3(cosT, 0, -sinT).normalize();
    const surfaceNormal = new THREE.Vector3(
      sinT * Math.cos(capPhi),
      Math.sin(capPhi),
      cosT * Math.cos(capPhi),
    ).normalize();
    const bitangent = new THREE.Vector3().crossVectors(surfaceNormal, tangent).normalize();
    const baseQuat = new THREE.Quaternion().setFromRotationMatrix(
      new THREE.Matrix4().makeBasis(tangent, bitangent, surfaceNormal),
    );
    const id = idCounter++;
    bricks.push({
      id,
      basePos,
      baseQuat,
      outwardDir: radialOut,
      scale: new THREE.Vector3(0.95, 0.88, 0.46),
      row: rows,
      maxRow,
      isTunnel: false,
      isInteractive: true,
      seed: rand(),
      tone: rand(),
      code: STABLE_TELEMETRY_CODES[id % STABLE_TELEMETRY_CODES.length],
      wavePos: computeBrickWavePos(basePos, domeRadius),
    });
  }

  // Bold horseshoe barrel-vaulted stone entrance arch integrated flush with dome front (+Z)
  const tunnelCourses = 2;
  const archSegments = 7;
  const archRadius = 1.02;
  for (let c = 0; c < tunnelCourses; c++) {
    const zPos = 2.16 + c * 0.5;
    const courseRadius = archRadius - c * 0.015;
    for (let s = 0; s < archSegments; s++) {
      const a = THREE.MathUtils.lerp(-Math.PI * 0.48, Math.PI * 0.48, s / (archSegments - 1));
      const x = Math.sin(a) * courseRadius;
      const y = Math.cos(a) * courseRadius * 0.96 + 0.34;
      if (y < 0.02) continue;

      const radial = new THREE.Vector3(Math.sin(a), Math.cos(a), 0.08).normalize();
      const tangentZ = new THREE.Vector3(0, 0, 1);
      const archTangent = new THREE.Vector3(Math.cos(a), -Math.sin(a), 0).normalize();
      const archNormal = new THREE.Vector3().crossVectors(archTangent, tangentZ).normalize();
      const basis = new THREE.Matrix4().makeBasis(archTangent, tangentZ, archNormal);
      const baseQuat = new THREE.Quaternion().setFromRotationMatrix(basis);

      const id = idCounter++;
      const tunnelPos = new THREE.Vector3(x, y, zPos);
      bricks.push({
        id,
        basePos: tunnelPos,
        baseQuat,
        outwardDir: radial,
        scale: new THREE.Vector3(0.49, 0.5, 0.6),
        row: 0,
        maxRow,
        isTunnel: true,
        isInteractive: false,
        seed: rand(),
        tone: rand(),
        code: STABLE_TELEMETRY_CODES[id % STABLE_TELEMETRY_CODES.length],
        wavePos: computeBrickWavePos(tunnelPos, domeRadius),
      });
    }

    // Grounded vertical side pier jamb stones connecting arch curve cleanly down to bedrock
    for (const side of [-1, 1] as const) {
      const id = idCounter++;
      const jambPos = new THREE.Vector3(side * courseRadius * 0.98, 0.2, zPos);
      bricks.push({
        id,
        basePos: jambPos,
        baseQuat: new THREE.Quaternion(),
        outwardDir: new THREE.Vector3(side, 0.1, 0).normalize(),
        scale: new THREE.Vector3(0.46, 0.46, 0.58),
        row: 0,
        maxRow,
        isTunnel: true,
        isInteractive: false,
        seed: rand(),
        tone: rand(),
        code: STABLE_TELEMETRY_CODES[id % STABLE_TELEMETRY_CODES.length],
        wavePos: computeBrickWavePos(jambPos, domeRadius),
      });
    }
  }

  return bricks;
}

/**
 * Generates crisp masonry brick-outline wireframe geometry matching every block's beveled edges,
 * dome ribs, and arched entrance tunnel (visible in uploaded_media_0 & 1).
 */
export function createIglooWireframeGeometry(bricks: IglooBrickMeta[]): {
  lineGeometry: THREE.BufferGeometry;
  pointGeometry: THREE.BufferGeometry;
} {
  const lineVerts: number[] = [];
  const lineOrder: number[] = [];
  const pointVerts: number[] = [];
  const pointOrder: number[] = [];

  const pushSeg = (
    ax: number,
    ay: number,
    az: number,
    bx: number,
    by: number,
    bz: number,
    orderA: number,
    orderB: number,
  ) => {
    lineVerts.push(ax, ay, az, bx, by, bz);
    lineOrder.push(orderA, orderB);
  };

  // Individual brick front-face & outer-seam outlines (plus subtle depth edge lines)
  const c0 = new THREE.Vector3();
  const c1 = new THREE.Vector3();
  const c2 = new THREE.Vector3();
  const c3 = new THREE.Vector3();
  const b0 = new THREE.Vector3();
  const b1 = new THREE.Vector3();
  const b2 = new THREE.Vector3();
  const b3 = new THREE.Vector3();

  for (let i = 0; i < bricks.length; i++) {
    const b = bricks[i];
    const hw = b.scale.x * 0.49;
    const hh = b.scale.y * 0.49;
    const hz = b.scale.z * 0.515;

    c0.set(-hw, -hh, hz).applyQuaternion(b.baseQuat).add(b.basePos);
    c1.set(hw, -hh, hz).applyQuaternion(b.baseQuat).add(b.basePos);
    c2.set(hw, hh, hz).applyQuaternion(b.baseQuat).add(b.basePos);
    c3.set(-hw, hh, hz).applyQuaternion(b.baseQuat).add(b.basePos);

    b0.set(-hw, -hh, 0.05).applyQuaternion(b.baseQuat).add(b.basePos);
    b1.set(hw, -hh, 0.05).applyQuaternion(b.baseQuat).add(b.basePos);
    b2.set(hw, hh, 0.05).applyQuaternion(b.baseQuat).add(b.basePos);
    b3.set(-hw, hh, 0.05).applyQuaternion(b.baseQuat).add(b.basePos);

    const ord = b.isTunnel
      ? 0.42 + b.seed * 0.25
      : 0.08 + (b.row / Math.max(1, b.maxRow)) * 0.65 + b.seed * 0.06;

    // Front face masonry outline
    pushSeg(c0.x, c0.y, c0.z, c1.x, c1.y, c1.z, ord, ord + 0.04);
    pushSeg(c1.x, c1.y, c1.z, c2.x, c2.y, c2.z, ord + 0.04, ord + 0.08);
    pushSeg(c2.x, c2.y, c2.z, c3.x, c3.y, c3.z, ord + 0.06, ord + 0.08);
    pushSeg(c3.x, c3.y, c3.z, c0.x, c0.y, c0.z, ord, ord + 0.06);

    // Side seam depth lines
    pushSeg(c0.x, c0.y, c0.z, b0.x, b0.y, b0.z, ord, ord + 0.04);
    pushSeg(c1.x, c1.y, c1.z, b1.x, b1.y, b1.z, ord + 0.02, ord + 0.06);
    if (b.isTunnel || b.row >= 4) {
      pushSeg(c2.x, c2.y, c2.z, b2.x, b2.y, b2.z, ord + 0.04, ord + 0.08);
      pushSeg(c3.x, c3.y, c3.z, b3.x, b3.y, b3.z, ord + 0.04, ord + 0.08);
    }

    if (i % 2 === 0) {
      pointVerts.push(c2.x, c2.y, c2.z);
      pointOrder.push(ord + 0.05);
    }
  }

  const lineGeometry = new THREE.BufferGeometry();
  lineGeometry.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
  lineGeometry.setAttribute('aOrder', new THREE.Float32BufferAttribute(lineOrder, 1));

  const pointGeometry = new THREE.BufferGeometry();
  pointGeometry.setAttribute('position', new THREE.Float32BufferAttribute(pointVerts, 3));
  pointGeometry.setAttribute('aOrder', new THREE.Float32BufferAttribute(pointOrder, 1));

  return { lineGeometry, pointGeometry };
}
