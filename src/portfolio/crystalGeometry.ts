import * as THREE from 'three';
import { createSeededRandom, fbm2D } from '../utils/noise';

interface CleavePlane {
  normal: THREE.Vector3;
  dist: number;
}

interface PolyFace {
  vertices: THREE.Vector3[];
  normal: THREE.Vector3;
}

export interface CrystalGeometryBundle {
  outerGeom: THREE.BufferGeometry;
  fractureGeom: THREE.BufferGeometry;
  haloLineGeom: THREE.BufferGeometry;
  haloCrossGeom: THREE.BufferGeometry;
  dispose: () => void;
}

function createInitialBoxFaces(rx: number, ry: number, rz: number): PolyFace[] {
  const p = [
    new THREE.Vector3(-rx, -ry, -rz), // 0: ---
    new THREE.Vector3(rx, -ry, -rz),  // 1: +--
    new THREE.Vector3(rx, ry, -rz),   // 2: ++-
    new THREE.Vector3(-rx, ry, -rz),  // 3: -+-
    new THREE.Vector3(-rx, -ry, rz),  // 4: --+
    new THREE.Vector3(rx, -ry, rz),   // 5: +-+
    new THREE.Vector3(rx, ry, rz),    // 6: +++
    new THREE.Vector3(-rx, ry, rz),   // 7: -++
  ];

  // Outward CCW faces
  return [
    { vertices: [p[4].clone(), p[5].clone(), p[6].clone(), p[7].clone()], normal: new THREE.Vector3(0, 0, 1) },
    { vertices: [p[1].clone(), p[0].clone(), p[3].clone(), p[2].clone()], normal: new THREE.Vector3(0, 0, -1) },
    { vertices: [p[5].clone(), p[1].clone(), p[2].clone(), p[6].clone()], normal: new THREE.Vector3(1, 0, 0) },
    { vertices: [p[0].clone(), p[4].clone(), p[7].clone(), p[3].clone()], normal: new THREE.Vector3(-1, 0, 0) },
    { vertices: [p[7].clone(), p[6].clone(), p[2].clone(), p[3].clone()], normal: new THREE.Vector3(0, 1, 0) },
    { vertices: [p[0].clone(), p[1].clone(), p[5].clone(), p[4].clone()], normal: new THREE.Vector3(0, -1, 0) },
  ];
}

function dedupePolygon(pts: THREE.Vector3[], eps = 1e-4): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (const pt of pts) {
    if (out.length === 0 || out[out.length - 1].distanceToSquared(pt) > eps * eps) {
      out.push(pt);
    }
  }
  if (out.length > 2 && out[0].distanceToSquared(out[out.length - 1]) <= eps * eps) {
    out.pop();
  }
  return out;
}

function clipPolyhedronByPlane(faces: PolyFace[], plane: CleavePlane): PolyFace[] {
  const n = plane.normal;
  const dist = plane.dist;
  const eps = 1e-5;
  const nextFaces: PolyFace[] = [];
  const capPoints: THREE.Vector3[] = [];

  for (const face of faces) {
    const verts = face.vertices;
    const clipped: THREE.Vector3[] = [];
    const count = verts.length;

    for (let i = 0; i < count; i++) {
      const a = verts[i];
      const b = verts[(i + 1) % count];
      const da = a.dot(n) - dist;
      const db = b.dot(n) - dist;

      const aIn = da <= eps;
      const bIn = db <= eps;

      if (aIn) {
        clipped.push(a.clone());
        if (!bIn) {
          const t = da / (da - db);
          const inter = a.clone().lerp(b, t);
          clipped.push(inter);
          capPoints.push(inter.clone());
        }
      } else if (bIn) {
        const t = da / (da - db);
        const inter = a.clone().lerp(b, t);
        clipped.push(inter);
        capPoints.push(inter.clone());
      }
    }

    const clean = dedupePolygon(clipped);
    if (clean.length >= 3) {
      nextFaces.push({ vertices: clean, normal: face.normal.clone() });
    }
  }

  // Deduplicate cap points globally
  const uniqueCap: THREE.Vector3[] = [];
  for (const pt of capPoints) {
    let exists = false;
    for (const u of uniqueCap) {
      if (u.distanceToSquared(pt) < 1e-7) {
        exists = true;
        break;
      }
    }
    if (!exists) uniqueCap.push(pt);
  }

  if (uniqueCap.length >= 3) {
    const centroid = new THREE.Vector3();
    for (const pt of uniqueCap) centroid.add(pt);
    centroid.divideScalar(uniqueCap.length);

    const ref = Math.abs(n.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
    const uAxis = new THREE.Vector3().crossVectors(ref, n).normalize();
    const vAxis = new THREE.Vector3().crossVectors(n, uAxis).normalize();

    uniqueCap.sort((a, b) => {
      const da = a.clone().sub(centroid);
      const db = b.clone().sub(centroid);
      return Math.atan2(da.dot(vAxis), da.dot(uAxis)) - Math.atan2(db.dot(vAxis), db.dot(uAxis));
    });

    // Ensure CCW winding facing outward (+normal)
    const e1 = uniqueCap[1].clone().sub(uniqueCap[0]);
    const e2 = uniqueCap[2].clone().sub(uniqueCap[0]);
    if (e1.cross(e2).dot(n) < 0) {
      uniqueCap.reverse();
    }

    nextFaces.push({ vertices: uniqueCap, normal: n.clone() });
  }

  return nextFaces;
}

function buildCleavedPolyhedron(
  bounds: [number, number, number],
  planes: CleavePlane[],
): PolyFace[] {
  let faces = createInitialBoxFaces(bounds[0], bounds[1], bounds[2]);
  for (const p of planes) {
    faces = clipPolyhedronByPlane(faces, p);
  }
  return faces;
}

interface ShardSpec {
  bounds: [number, number, number];
  planes: CleavePlane[];
  offset: THREE.Vector3;
  rotation: THREE.Euler;
  frostWeight: number;
}

function appendFacesToArrays(
  faces: PolyFace[],
  transform: THREE.Matrix4,
  frostWeight: number,
  positions: number[],
  uvs: number[],
  frosts: number[],
  barycentrics: number[],
  collectedVerts: THREE.Vector3[],
): void {
  const nMat = new THREE.Matrix3().getNormalMatrix(transform);

  for (const face of faces) {
    const verts = face.vertices;
    if (verts.length < 3) continue;

    const worldNormal = face.normal.clone().applyMatrix3(nMat).normalize();
    const ax = Math.abs(worldNormal.x);
    const ay = Math.abs(worldNormal.y);
    const az = Math.abs(worldNormal.z);

    // Clearer central viewing window on front/back cleavage planes
    const isWindowFace = az > 0.65 && frostWeight < 0.4;
    const faceFrost = isWindowFace ? frostWeight * 0.35 : frostWeight;

    const worldVerts = verts.map((v) => v.clone().applyMatrix4(transform));
    for (const wv of worldVerts) {
      collectedVerts.push(wv);
    }

    // Fan triangulation
    for (let i = 1; i < worldVerts.length - 1; i++) {
      const tri = [worldVerts[0], worldVerts[i], worldVerts[i + 1]];
      const bary = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];

      for (let k = 0; k < 3; k++) {
        const p = tri[k];
        positions.push(p.x, p.y, p.z);
        frosts.push(faceFrost);
        barycentrics.push(bary[k][0], bary[k][1], bary[k][2]);

        // Seamless triplanar UVs for frost bump & roughness variation
        if (ax >= ay && ax >= az) {
          uvs.push(p.z * 0.42 + 0.5, p.y * 0.42 + 0.5);
        } else if (ay >= ax && ay >= az) {
          uvs.push(p.x * 0.42 + 0.5, p.z * 0.42 + 0.5);
        } else {
          uvs.push(p.x * 0.42 + 0.5, p.y * 0.42 + 0.5);
        }
      }
    }
  }
}

function finalizeShardAssembly(
  shards: ShardSpec[],
  fractureSeed: number,
  haloRadiusScale: number,
): CrystalGeometryBundle {
  const positions: number[] = [];
  const uvs: number[] = [];
  const frosts: number[] = [];
  const barycentrics: number[] = [];
  const allVerts: THREE.Vector3[] = [];
  const mat = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scaleOne = new THREE.Vector3(1, 1, 1);

  for (const shard of shards) {
    const faces = buildCleavedPolyhedron(shard.bounds, shard.planes);
    quat.setFromEuler(shard.rotation);
    mat.compose(shard.offset, quat, scaleOne);
    appendFacesToArrays(
      faces,
      mat,
      shard.frostWeight,
      positions,
      uvs,
      frosts,
      barycentrics,
      allVerts,
    );
  }

  const outerGeom = new THREE.BufferGeometry();
  outerGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  outerGeom.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  outerGeom.setAttribute('aFrost', new THREE.Float32BufferAttribute(frosts, 1));
  outerGeom.setAttribute('aBary', new THREE.Float32BufferAttribute(barycentrics, 3));
  outerGeom.computeVertexNormals();
  outerGeom.computeBoundingSphere();

  // Internal perimeter fracture planes (never blocking central Z core around sculpture)
  const rand = createSeededRandom(fractureSeed);
  const fracVerts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2 + rand() * 0.45;
    const rad = 0.42 + rand() * 0.28;
    const cy = (rand() - 0.5) * 1.45;
    const cx = Math.cos(angle) * rad;
    const cz = Math.sin(angle) * rad * 0.65;

    const p1 = new THREE.Vector3(cx, cy, cz);
    const p2 = p1.clone().add(new THREE.Vector3((rand() - 0.5) * 0.55, 0.22 + rand() * 0.42, (rand() - 0.5) * 0.35));
    const p3 = p1.clone().add(new THREE.Vector3((rand() - 0.5) * 0.55, -0.25 - rand() * 0.35, (rand() - 0.5) * 0.35));

    fracVerts.push(p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
  }
  const fractureGeom = new THREE.BufferGeometry();
  fractureGeom.setAttribute('position', new THREE.Float32BufferAttribute(fracVerts, 3));
  fractureGeom.computeVertexNormals();

  // Deduplicate outer prominent vertices for delicate technical vertex constellation halo
  const uniqueNodes: THREE.Vector3[] = [];
  for (const v of allVerts) {
    if (v.length() < 0.72) continue;
    let close = false;
    for (const u of uniqueNodes) {
      if (u.distanceToSquared(v) < 0.36) {
        close = true;
        break;
      }
    }
    if (!close) uniqueNodes.push(v.clone());
  }

  // Pick up to 14 well-spread perimeter vertices pushed subtly outward
  uniqueNodes.sort((a, b) => b.lengthSq() - a.lengthSq());
  const selectedNodes = uniqueNodes.slice(0, 14).map((v) => {
    const dir = v.clone().normalize();
    return v.clone().addScaledVector(dir, (0.11 + rand() * 0.16) * haloRadiusScale);
  });

  const haloLineVerts: number[] = [];
  for (let i = 0; i < selectedNodes.length; i++) {
    const a = selectedNodes[i];
    // Connect each node to 2 nearest neighbors for delicate faceted constellation wireframe
    const neighbors: { idx: number; d: number }[] = [];
    for (let j = 0; j < selectedNodes.length; j++) {
      if (i === j) continue;
      neighbors.push({ idx: j, d: a.distanceToSquared(selectedNodes[j]) });
    }
    neighbors.sort((x, y) => x.d - y.d);
    for (let k = 0; k < Math.min(2, neighbors.length); k++) {
      const b = selectedNodes[neighbors[k].idx];
      if (neighbors[k].idx > i && neighbors[k].d < 3.6) {
        haloLineVerts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      }
    }
  }
  const haloLineGeom = new THREE.BufferGeometry();
  haloLineGeom.setAttribute('position', new THREE.Float32BufferAttribute(haloLineVerts, 3));

  const crossVerts: number[] = [];
  const cs = 0.032;
  for (const n of selectedNodes) {
    crossVerts.push(n.x - cs, n.y, n.z, n.x + cs, n.y, n.z);
    crossVerts.push(n.x, n.y - cs, n.z, n.x, n.y + cs, n.z);
  }
  const haloCrossGeom = new THREE.BufferGeometry();
  haloCrossGeom.setAttribute('position', new THREE.Float32BufferAttribute(crossVerts, 3));

  return {
    outerGeom,
    fractureGeom,
    haloLineGeom,
    haloCrossGeom,
    dispose: () => {
      outerGeom.dispose();
      fractureGeom.dispose();
      haloLineGeom.dispose();
      haloCrossGeom.dispose();
    },
  };
}

function makePlane(nx: number, ny: number, nz: number, dist: number): CleavePlane {
  return {
    normal: new THREE.Vector3(nx, ny, nz).normalize(),
    dist,
  };
}

/**
 * Crystal 1 — Pudgy Penguins:
 * Tall, irregular asymmetric cleaved glacial shard monolith with sharp bottom keel,
 * angled upper shoulder peak, and rugged fused left/right stepped crystal spurs.
 */
export function createPenguinCrystalGeometry(): CrystalGeometryBundle {
  const corePlanes: CleavePlane[] = [
    // Asymmetric top crystalline crown
    makePlane(0.18, 0.94, 0.26, 1.32),
    makePlane(-0.48, 0.82, -0.30, 1.18),
    makePlane(0.56, 0.72, -0.40, 1.14),
    // Tapered sharp lower glacial keel
    makePlane(-0.34, -0.88, 0.32, 1.24),
    makePlane(0.42, -0.85, -0.28, 1.22),
    makePlane(0.05, -0.96, -0.18, 1.38),
    // Irregular lateral cleavage flanks
    makePlane(-0.92, 0.22, 0.32, 0.74),
    makePlane(-0.88, -0.28, -0.38, 0.72),
    makePlane(0.90, 0.28, -0.34, 0.78),
    makePlane(0.86, -0.35, 0.36, 0.74),
    // Chiseled angled front & back crystal windows
    makePlane(-0.18, 0.14, 0.96, 0.68),
    makePlane(0.24, -0.18, 0.95, 0.70),
    makePlane(0.14, 0.20, -0.96, 0.66),
    makePlane(-0.26, -0.14, -0.95, 0.68),
    // Corner chamfer cuts for realistic fracture silhouette
    makePlane(-0.62, 0.56, 0.54, 0.88),
    makePlane(0.64, 0.48, 0.58, 0.92),
    makePlane(-0.58, -0.60, -0.54, 0.86),
    makePlane(0.54, -0.52, 0.66, 0.90),
  ];

  // Fused asymmetric side crystal spurs for broken uneven silhouette
  const spurLeftPlanes: CleavePlane[] = [
    makePlane(-0.85, 0.4, 0.2, 0.32),
    makePlane(0.75, 0.3, -0.4, 0.36),
    makePlane(0.0, 0.92, 0.38, 0.58),
    makePlane(-0.2, -0.94, -0.25, 0.62),
    makePlane(0.2, 0.15, 0.95, 0.34),
    makePlane(-0.15, -0.2, -0.95, 0.32),
  ];

  const spurBottomPlanes: CleavePlane[] = [
    makePlane(-0.6, 0.75, 0.2, 0.42),
    makePlane(0.65, 0.65, -0.35, 0.40),
    makePlane(0.15, -0.96, 0.22, 0.58),
    makePlane(-0.85, -0.35, -0.3, 0.36),
    makePlane(0.82, -0.3, 0.42, 0.38),
  ];

  const spurCrownPlanes: CleavePlane[] = [
    makePlane(0.35, 0.92, 0.12, 0.48),
    makePlane(-0.78, 0.55, -0.28, 0.34),
    makePlane(0.82, 0.42, -0.38, 0.36),
    makePlane(-0.1, -0.95, 0.25, 0.42),
    makePlane(0.18, 0.12, 0.96, 0.30),
    makePlane(-0.2, -0.1, -0.96, 0.28),
  ];

  const shards: ShardSpec[] = [
    {
      bounds: [0.95, 1.55, 0.85],
      planes: corePlanes,
      offset: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0.03, 0.12, -0.04),
      frostWeight: 0.28,
    },
    {
      bounds: [0.46, 0.78, 0.42],
      planes: spurLeftPlanes,
      offset: new THREE.Vector3(-0.58, -0.22, 0.08),
      rotation: new THREE.Euler(0.18, 0.42, 0.26),
      frostWeight: 0.85,
    },
    {
      bounds: [0.44, 0.68, 0.44],
      planes: spurBottomPlanes,
      offset: new THREE.Vector3(0.24, -1.04, -0.08),
      rotation: new THREE.Euler(-0.16, -0.32, -0.24),
      frostWeight: 0.82,
    },
    {
      bounds: [0.40, 0.58, 0.38],
      planes: spurCrownPlanes,
      offset: new THREE.Vector3(0.16, 1.02, 0.06),
      rotation: new THREE.Euler(0.12, -0.28, -0.18),
      frostWeight: 0.78,
    },
  ];

  return finalizeShardAssembly(shards, 91041, 1.0);
}

/**
 * Crystal 2 — Overpass:
 * Visibly different wider tilted tabular prism / glacier slab formation with serrated upper
 * fracture crown, stepped side ribs, and broad diagonal viewing facets framing the /P emblem.
 */
export function createOverpassCrystalGeometry(): CrystalGeometryBundle {
  const slabPlanes: CleavePlane[] = [
    // Jagged angled top fracture crest
    makePlane(0.22, 0.95, -0.20, 1.18),
    makePlane(-0.38, 0.88, 0.26, 1.12),
    makePlane(0.54, 0.78, 0.30, 1.15),
    // Broad uneven bottom shelf
    makePlane(-0.18, -0.94, -0.26, 1.12),
    makePlane(0.36, -0.90, 0.24, 1.16),
    // Wide slab side planes
    makePlane(-0.96, 0.14, -0.22, 0.96),
    makePlane(-0.92, -0.22, 0.30, 0.94),
    makePlane(0.95, 0.18, 0.24, 0.98),
    makePlane(0.92, -0.24, -0.28, 0.95),
    // Flatter glacial slab front & back windows
    makePlane(0.08, 0.10, 0.98, 0.62),
    makePlane(-0.16, -0.12, 0.97, 0.64),
    makePlane(-0.08, 0.12, -0.98, 0.62),
    makePlane(0.16, -0.10, -0.97, 0.64),
    // Corner chips
    makePlane(-0.68, 0.62, 0.38, 1.12),
    makePlane(0.70, -0.58, -0.40, 1.10),
    makePlane(-0.66, -0.58, 0.44, 1.08),
  ];

  // Serrated crown teeth & stepped slab flank shards
  const ridgeToothA: CleavePlane[] = [
    makePlane(-0.3, 0.94, 0.15, 0.36),
    makePlane(0.85, 0.45, -0.22, 0.32),
    makePlane(-0.82, 0.48, 0.28, 0.30),
    makePlane(0.0, -0.96, 0.2, 0.36),
    makePlane(0.15, 0.1, 0.96, 0.26),
    makePlane(-0.15, -0.1, -0.96, 0.26),
  ];

  const sideRibPlanes: CleavePlane[] = [
    makePlane(-0.92, 0.18, 0.34, 0.28),
    makePlane(0.92, -0.16, -0.34, 0.30),
    makePlane(0.12, 0.96, -0.24, 0.88),
    makePlane(-0.18, -0.95, 0.24, 0.86),
    makePlane(0.1, 0.15, 0.97, 0.36),
    makePlane(-0.1, -0.15, -0.97, 0.36),
  ];

  const shards: ShardSpec[] = [
    {
      bounds: [1.12, 1.32, 0.72],
      planes: slabPlanes,
      offset: new THREE.Vector3(0, 0, 0),
      rotation: new THREE.Euler(0.04, -0.1, -0.19),
      frostWeight: 0.30,
    },
    {
      bounds: [0.42, 0.48, 0.34],
      planes: ridgeToothA,
      offset: new THREE.Vector3(-0.22, 1.04, 0.04),
      rotation: new THREE.Euler(0.1, 0.25, -0.26),
      frostWeight: 0.86,
    },
    {
      bounds: [0.38, 0.44, 0.32],
      planes: ridgeToothA,
      offset: new THREE.Vector3(0.46, 0.98, -0.06),
      rotation: new THREE.Euler(-0.12, -0.28, -0.14),
      frostWeight: 0.88,
    },
    {
      bounds: [0.38, 0.98, 0.44],
      planes: sideRibPlanes,
      offset: new THREE.Vector3(0.84, -0.18, 0.08),
      rotation: new THREE.Euler(0.08, 0.18, -0.22),
      frostWeight: 0.84,
    },
    {
      bounds: [0.36, 0.86, 0.42],
      planes: sideRibPlanes,
      offset: new THREE.Vector3(-0.78, -0.32, -0.06),
      rotation: new THREE.Euler(-0.08, -0.14, -0.18),
      frostWeight: 0.84,
    },
  ];

  return finalizeShardAssembly(shards, 44219, 1.06);
}

/**
 * Generates shared seamless frost bump + roughness maps for crystal surface striations.
 */
let cachedCrystalBump: THREE.DataTexture | null = null;
let cachedCrystalRoughness: THREE.DataTexture | null = null;

export function getCrystalBumpTexture(): THREE.DataTexture {
  if (cachedCrystalBump) return cachedCrystalBump;
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const rand = createSeededRandom(31904);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      // Glacial striations + micro crystalline grain
      const striation = fbm2D(u * 14.0, v * 3.8 + 4.1, 4);
      const ridge = Math.abs(fbm2D(u * 7.0 + 1.5, v * 7.0 - 2.2, 3));
      const grain = (rand() - 0.5) * 0.12;
      const val = Math.max(0, Math.min(255, Math.floor((0.5 + striation * 0.34 + ridge * 0.24 + grain) * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  cachedCrystalBump = tex;
  return tex;
}

export function getCrystalRoughnessTexture(): THREE.DataTexture {
  if (cachedCrystalRoughness) return cachedCrystalRoughness;
  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      const patch = fbm2D(u * 6.5 + 8.3, v * 6.5 + 1.9, 4);
      const val = Math.max(24, Math.min(220, Math.floor((0.32 + patch * 0.42) * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.needsUpdate = true;
  cachedCrystalRoughness = tex;
  return tex;
}

/**
 * Generates soft radial mist puff texture for subtle volumetric fog layers.
 */
export function createMistSpriteTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(128, 128, 8, 128, 128, 126);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.34)');
    grad.addColorStop(0.38, 'rgba(232, 240, 250, 0.16)');
    grad.addColorStop(0.72, 'rgba(210, 220, 235, 0.05)');
    grad.addColorStop(1, 'rgba(200, 210, 225, 0.0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
