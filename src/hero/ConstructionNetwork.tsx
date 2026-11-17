import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, fbm2D } from '../utils/noise';
import { sampleForegroundHeight } from './ForegroundTerrain';
import { hudBridge, introStage, type VertexAnnotation } from './heroStore';

interface ConstructionNetworkProps {
  iglooX: number;
}

interface LabeledNode {
  pos: THREE.Vector3;
  groupStart: number;
  weight: number;
}

/**
 * Architectural 3D construction scaffold & fine triangulated ground scan mesh:
 * - Isometric cubic wireframe cells with diagonal triangles & corner pins (uploaded_media_0/1/2)
 * - Fine radial triangulated terrain wireframe expanding beneath/around igloo (uploaded_media_1/2)
 * - Dynamic 2-digit vertex telemetry numbers (11 -> 99) synced via hudBridge
 */
export function ConstructionNetwork({ iglooX }: ConstructionNetworkProps) {
  const { camera, size } = useThree();

  const { cubeLineGeom, cubePointGeom, meshWireGeom, labeledNodes } = useMemo(() => {
    const rand = createSeededRandom(20260723);

    // ------------------------------------------------------------------
    // 1. Isometric 3D Cubic Wireframe Lattice + Diagonal Triangles
    // ------------------------------------------------------------------
    const positions: number[] = [];
    const edgeTs: number[] = [];
    const startOrders: number[] = [];
    const endOrders: number[] = [];
    const brightnesses: number[] = [];

    const ptsPos: number[] = [];
    const ptsOrder: number[] = [];
    const ptsBright: number[] = [];
    const nodes: LabeledNode[] = [];

    const pushSeg = (
      ax: number,
      ay: number,
      az: number,
      bx: number,
      by: number,
      bz: number,
      tStart: number,
      tDur: number,
      bright: number,
    ) => {
      positions.push(ax, ay, az, bx, by, bz);
      edgeTs.push(0, 1);
      startOrders.push(tStart, tStart);
      endOrders.push(tStart + tDur, tStart + tDur);
      brightnesses.push(bright, bright);
    };

    const pushNode = (v: THREE.Vector3, order: number, bright: number, labelWeight?: number) => {
      ptsPos.push(v.x, v.y, v.z);
      ptsOrder.push(order);
      ptsBright.push(bright);
      if (labelWeight !== undefined) {
        nodes.push({ pos: v.clone(), groupStart: order, weight: labelWeight });
      }
    };

    const cell = 2.65;
    const gridHalf = 5;

    for (let gx = -gridHalf; gx <= gridHalf; gx++) {
      for (let gz = -gridHalf; gz <= gridHalf; gz++) {
        const cx = iglooX + gx * cell;
        const cz = gz * cell;
        const dist = Math.hypot(cx - iglooX, cz);

        // Keep immediate igloo interior clear while surrounding igloo closely
        if (dist < 2.2 || dist > 16.5) continue;

        // Deterministic sparse coverage matching organic cluster distribution in reference screenshots
        const densityNoise = fbm2D(gx * 0.55 + 2.1, gz * 0.55 - 1.3, 2);
        if (dist > 6.5 && densityNoise < -0.14 && rand() > 0.35) continue;

        const baseH = sampleForegroundHeight(cx, cz, iglooX) + 0.15;
        const cubeH = 1.65 + (rand() < 0.35 ? 1.3 : 0);
        const radialNorm = Math.min(1, (dist - 2.2) / 14.0);
        const tBase = 0.04 + radialNorm * 0.56 + rand() * 0.12;
        const bright = 0.28 + (1 - radialNorm) * 0.62;

        const hs = cell * 0.5;
        const p000 = new THREE.Vector3(cx - hs, baseH, cz - hs);
        const p100 = new THREE.Vector3(cx + hs, baseH, cz - hs);
        const p101 = new THREE.Vector3(cx + hs, baseH, cz + hs);
        const p001 = new THREE.Vector3(cx - hs, baseH, cz + hs);

        const p010 = new THREE.Vector3(cx - hs, baseH + cubeH, cz - hs);
        const p110 = new THREE.Vector3(cx + hs, baseH + cubeH, cz - hs);
        const p111 = new THREE.Vector3(cx + hs, baseH + cubeH, cz + hs);
        const p011 = new THREE.Vector3(cx - hs, baseH + cubeH, cz + hs);

        // Top & bottom square frames (partial for organic broken-grid aesthetic)
        if (rand() < 0.85) pushSeg(p010.x, p010.y, p010.z, p110.x, p110.y, p110.z, tBase, 0.22, bright);
        if (rand() < 0.85) pushSeg(p110.x, p110.y, p110.z, p111.x, p111.y, p111.z, tBase + 0.04, 0.22, bright);
        if (rand() < 0.72) pushSeg(p111.x, p111.y, p111.z, p011.x, p011.y, p011.z, tBase + 0.06, 0.22, bright * 0.85);
        if (rand() < 0.72) pushSeg(p011.x, p011.y, p011.z, p010.x, p010.y, p010.z, tBase + 0.03, 0.22, bright * 0.85);

        if (rand() < 0.55) pushSeg(p000.x, p000.y, p000.z, p100.x, p100.y, p100.z, tBase + 0.02, 0.2, bright * 0.65);
        if (rand() < 0.55) pushSeg(p100.x, p100.y, p100.z, p101.x, p101.y, p101.z, tBase + 0.05, 0.2, bright * 0.65);

        // Vertical corner struts
        if (rand() < 0.7) pushSeg(p000.x, p000.y, p000.z, p010.x, p010.y, p010.z, tBase, 0.18, bright * 0.75);
        if (rand() < 0.75) pushSeg(p101.x, p101.y, p101.z, p111.x, p111.y, p111.z, tBase + 0.04, 0.18, bright);
        if (rand() < 0.6) pushSeg(p001.x, p001.y, p001.z, p011.x, p011.y, p011.z, tBase + 0.05, 0.18, bright * 0.8);

        // Diagonal triangular cross-braces (signature angular triangles of reference screenshots)
        if (rand() < 0.8) {
          pushSeg(p010.x, p010.y, p010.z, p111.x, p111.y, p111.z, tBase + 0.08, 0.24, bright * 0.9);
        }
        if (rand() < 0.6) {
          pushSeg(p000.x, p000.y, p000.z, p110.x, p110.y, p110.z, tBase + 0.09, 0.24, bright * 0.7);
        }
        if (rand() < 0.5) {
          pushSeg(p100.x, p100.y, p100.z, p111.x, p111.y, p111.z, tBase + 0.1, 0.24, bright * 0.72);
        }

        // Corner vertex points & occasional 2-digit telemetry labels
        const shouldLabel = nodes.length < 22 && (gx + gz * 3) % 3 === 0 && rand() < 0.58;
        pushNode(p111, tBase + 0.12, bright, shouldLabel ? 0.65 + rand() * 0.35 : undefined);
        if (rand() < 0.5) {
          const secondLabel = nodes.length < 22 && rand() < 0.22 ? 0.55 + rand() * 0.42 : undefined;
          pushNode(p010, tBase + 0.08, bright * 0.85, secondLabel);
        }
      }
    }

    const lGeom = new THREE.BufferGeometry();
    lGeom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    lGeom.setAttribute('aEdgeT', new THREE.Float32BufferAttribute(edgeTs, 1));
    lGeom.setAttribute('aStart', new THREE.Float32BufferAttribute(startOrders, 1));
    lGeom.setAttribute('aEnd', new THREE.Float32BufferAttribute(endOrders, 1));
    lGeom.setAttribute('aBright', new THREE.Float32BufferAttribute(brightnesses, 1));

    const pGeom = new THREE.BufferGeometry();
    pGeom.setAttribute('position', new THREE.Float32BufferAttribute(ptsPos, 3));
    pGeom.setAttribute('aOrder', new THREE.Float32BufferAttribute(ptsOrder, 1));
    pGeom.setAttribute('aBright', new THREE.Float32BufferAttribute(ptsBright, 1));

    // ------------------------------------------------------------------
    // 2. Fine Radial Triangulated Terrain Scan Wireframe (uploaded_media_1 & 2)
    // ------------------------------------------------------------------
    const triVerts: number[] = [];
    const triDist: number[] = [];
    const rings = 28;
    const sectors = 56;
    const maxR = 32.0;

    const gridPts: THREE.Vector3[][] = [];
    for (let rIdx = 0; rIdx <= rings; rIdx++) {
      const r = 2.4 + (rIdx / rings) * (maxR - 2.4);
      const row: THREE.Vector3[] = [];
      for (let sIdx = 0; sIdx < sectors; sIdx++) {
        const ang = (sIdx / sectors) * Math.PI * 2;
        const wx = iglooX + Math.cos(ang) * r;
        const wz = Math.sin(ang) * r;
        const wy = sampleForegroundHeight(wx, wz, iglooX) + 0.03;
        row.push(new THREE.Vector3(wx, wy, wz));
      }
      gridPts.push(row);
    }

    const pushTriEdge = (a: THREE.Vector3, b: THREE.Vector3) => {
      triVerts.push(a.x, a.y, a.z, b.x, b.y, b.z);
      triDist.push(
        Math.hypot(a.x - iglooX, a.z),
        Math.hypot(b.x - iglooX, b.z),
      );
    };

    for (let rIdx = 0; rIdx < rings; rIdx++) {
      for (let sIdx = 0; sIdx < sectors; sIdx++) {
        const nextS = (sIdx + 1) % sectors;
        const a = gridPts[rIdx][sIdx];
        const b = gridPts[rIdx][nextS];
        const c = gridPts[rIdx + 1][sIdx];
        const d = gridPts[rIdx + 1][nextS];
        pushTriEdge(a, b);
        pushTriEdge(a, c);
        pushTriEdge(a, d);
      }
    }

    const mGeom = new THREE.BufferGeometry();
    mGeom.setAttribute('position', new THREE.Float32BufferAttribute(triVerts, 3));
    mGeom.setAttribute('aDist', new THREE.Float32BufferAttribute(triDist, 1));

    return {
      cubeLineGeom: lGeom,
      cubePointGeom: pGeom,
      meshWireGeom: mGeom,
      labeledNodes: nodes,
    };
  }, [iglooX]);

  const cubeLineMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uFade: { value: 1 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aEdgeT;
          attribute float aStart;
          attribute float aEnd;
          attribute float aBright;

          uniform float uReveal;
          varying float vEdgeT;
          varying float vSegFrac;
          varying float vBright;
          varying float vStart;

          void main() {
            vEdgeT = aEdgeT;
            vBright = aBright;
            vStart = aStart;
            vSegFrac = clamp((uReveal - aStart) / max(0.01, aEnd - aStart), 0.0, 1.0);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uFade;
          uniform float uTime;
          varying float vEdgeT;
          varying float vSegFrac;
          varying float vBright;
          varying float vStart;

          void main() {
            if (vSegFrac <= 0.001 || vEdgeT > vSegFrac) discard;
            float headGlow = smoothstep(0.16, 0.0, vSegFrac - vEdgeT) * step(vSegFrac, 0.99);
            float flicker = 0.9 + 0.1 * sin(uTime * 15.0 + vStart * 47.0);
            float alpha = uFade * vBright * flicker * (0.58 + 0.42 * headGlow);
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(vec3(0.97, 0.98, 1.0), clamp(alpha, 0.0, 0.92));
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  const cubePointMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uFade: { value: 1 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aOrder;
          attribute float aBright;
          uniform float uReveal;
          varying float vVisible;
          varying float vBright;
          varying float vOrder;
          void main() {
            vOrder = aOrder;
            vBright = aBright;
            vVisible = smoothstep(aOrder - 0.04, aOrder + 0.04, uReveal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = clamp(28.0 / max(2.0, -mvPosition.z), 2.0, 5.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uFade;
          uniform float uTime;
          varying float vVisible;
          varying float vBright;
          varying float vOrder;
          void main() {
            if (vVisible < 0.05) discard;
            vec2 c = gl_PointCoord - 0.5;
            if (length(c) > 0.5) discard;
            float flicker = 0.88 + 0.12 * sin(uTime * 14.0 + vOrder * 31.0);
            float alpha = vVisible * uFade * vBright * flicker;
            gl_FragColor = vec4(1.0, 1.0, 1.0, clamp(alpha, 0.0, 0.95));
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  // Fine triangulated ground wireframe shader expanding ahead of the solid terrain circle
  const meshWireMat = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uScanInner: { value: 0 },
          uScanOuter: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aDist;
          varying float vDist;
          void main() {
            vDist = aDist;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uScanInner;
          uniform float uScanOuter;
          uniform float uOpacity;
          varying float vDist;
          void main() {
            if (vDist > uScanOuter || vDist < uScanInner) discard;
            float outerFade = 1.0 - smoothstep(uScanOuter - 2.6, uScanOuter, vDist);
            float innerFade = smoothstep(uScanInner, uScanInner + 1.2, vDist);
            float alpha = uOpacity * outerFade * innerFade * 0.24;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(vec3(0.95, 0.98, 1.0), alpha);
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  const tmpProj = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    return () => {
      cubeLineGeom.dispose();
      cubePointGeom.dispose();
      meshWireGeom.dispose();
      cubeLineMat.dispose();
      cubePointMat.dispose();
      meshWireMat.dispose();
    };
  }, [cubeLineGeom, cubePointGeom, meshWireGeom, cubeLineMat, cubePointMat, meshWireMat]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const reveal = introStage.networkReveal;
    const fade = introStage.networkFade;
    const terrR = Math.pow(Math.max(introStage.terrainRadius, 0), 2.25) * 86.0;
    const wireBuild = introStage.wireframeReveal;

    cubeLineMat.uniforms.uReveal.value = reveal;
    cubeLineMat.uniforms.uFade.value = fade;
    cubeLineMat.uniforms.uTime.value = t;

    cubePointMat.uniforms.uReveal.value = reveal;
    cubePointMat.uniforms.uFade.value = fade;
    cubePointMat.uniforms.uTime.value = t;

    // Fine ground mesh expands ahead of solid terrain circle (visible in uploaded_media_1 & 2)
    meshWireMat.uniforms.uScanOuter.value = 2.4 + wireBuild * 5.6 + terrR * 1.12;
    meshWireMat.uniforms.uScanInner.value = Math.max(0, terrR - 0.8);
    meshWireMat.uniforms.uOpacity.value = Math.min(1, wireBuild * 2.0) * fade * 1.35;

    // Project 2-digit vertex telemetry numbers (11..99)
    if (reveal > 0.08 && fade > 0.08) {
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();
      const out: VertexAnnotation[] = [];
      const pct = introStage.telemetryPct;

      for (let i = 0; i < labeledNodes.length; i++) {
        const node = labeledNodes[i];
        const vis = Math.min(1, Math.max(0, (reveal - node.groupStart) / 0.12)) * fade;
        if (vis < 0.05) continue;

        tmpProj.copy(node.pos).project(camera);
        if (tmpProj.z > -1 && tmpProj.z < 1) {
          const sx = (tmpProj.x * 0.5 + 0.5) * size.width;
          const sy = (-tmpProj.y * 0.5 + 0.5) * size.height;
          if (sx > 24 && sx < size.width - 34 && sy > 24 && sy < size.height - 24) {
            const val = Math.min(99, Math.max(11, Math.round(pct * node.weight)));
            out.push({
              code: String(val),
              screenX: sx,
              screenY: sy,
              opacity: vis * 0.88,
            });
          }
        }
      }
      hudBridge.vertexAnnotations = out;
      hudBridge.emit();
    } else if (hudBridge.vertexAnnotations.length > 0) {
      hudBridge.vertexAnnotations = [];
      hudBridge.emit();
    }
  });

  return (
    <group>
      <lineSegments geometry={cubeLineGeom} material={cubeLineMat} frustumCulled={false} />
      <points geometry={cubePointGeom} material={cubePointMat} frustumCulled={false} />
      <lineSegments geometry={meshWireGeom} material={meshWireMat} frustumCulled={false} />
    </group>
  );
}
