import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { fbm2D, ridgedFbm2D, smoothstep } from '../utils/noise';
import { introStage } from './heroStore';

export const IGLOO_WORLD_X_DESKTOP = 0.28;
export const IGLOO_WORLD_Z = 0.0;

/**
 * Deterministic elevation field for high-detail sculpted rocky & snow-dusted alpine terrain
 * cradling the igloo on a rocky ridge while sloping cleanly down in front so the base row
 * and lower-right arched doorway sit proudly unoccluded.
 */
export function sampleForegroundHeight(x: number, z: number, iglooX = IGLOO_WORLD_X_DESKTOP): number {
  const dx = x - iglooX;
  const dz = z - IGLOO_WORLD_Z;
  const distIgloo = Math.sqrt(dx * dx + dz * dz);

  // Subtle flat/gentle rocky pedestal beneath igloo & entrance arch
  const pedestalMask = smoothstep(2.9, 6.2, distIgloo);

  // Keep camera-to-igloo forefront corridor sloping downward (-Z/front view remains unobstructed)
  const frontValley =
    dz > 1.2
      ? smoothstep(1.2, 8.5, dz) * Math.exp(-Math.pow(dx / 9.5, 2)) * (1.25 + ridgedFbm2D(x * 0.14, z * 0.14, 3) * 0.4)
      : 0;

  // Flanking lower rocky knolls left & right matching uploaded_media_0_1794801840670.png
  const leftKnoll =
    Math.exp(-Math.pow((dx + 4.4) / 2.6, 2) - Math.pow((dz - 0.6) / 3.0, 2)) * 0.58;
  const rightCrag =
    Math.exp(-Math.pow((dx - 6.6) / 3.4, 2) - Math.pow((dz - 0.8) / 3.6, 2)) * 1.15;

  // Rugged granite ridges, scree ledges, and fractured alpine details
  const cragBroad = ridgedFbm2D(x * 0.095 + 2.4, z * 0.095 - 1.7, 4) * 1.65;
  const cragFine = ridgedFbm2D(x * 0.34 - 3.1, z * 0.34 + 4.2, 3) * 0.52;
  const driftRoll = fbm2D(x * 0.06 + 1.2, z * 0.06 - 2.3, 3) * 1.1;

  const rockyShoulderLeft =
    x < -4.2
      ? Math.pow((-x - 4.2) / 14.5, 1.35) * (1.9 + ridgedFbm2D(x * 0.16, z * 0.16, 3) * 1.6)
      : 0;
  const rockyShoulderRight =
    x > 5.4
      ? Math.pow((x - 5.4) / 14.5, 1.35) * (1.8 + ridgedFbm2D(x * 0.16 + 5.1, z * 0.16, 3) * 1.5)
      : 0;
  const backFoothill =
    z < -5.8
      ? Math.pow((-z - 5.8) / 18.5, 1.45) * (2.2 + ridgedFbm2D(x * 0.12 - 3.1, z * 0.12, 3) * 1.9)
      : 0;

  return (
    (driftRoll + cragBroad * 0.72 + rockyShoulderLeft + rockyShoulderRight + backFoothill) *
      pedestalMask +
    cragFine * (0.12 + 0.88 * pedestalMask) +
    leftKnoll +
    rightCrag -
    frontValley
  );
}

interface ForegroundTerrainProps {
  segments: number;
  iglooX: number;
}

export function ForegroundTerrain({ segments, iglooX }: ForegroundTerrainProps) {
  const groupRef = useRef<THREE.Group>(null);
  const uniformsRef = useRef({
    uRadius: { value: 0 },
    uEmerge: { value: 0 },
    uIglooPos: { value: new THREE.Vector2(iglooX, IGLOO_WORLD_Z) },
  });

  // High-resolution sculpted ground mesh around the igloo (140x110m, dense segments for crisp crags)
  const terrainGeom = useMemo(() => {
    const segX = Math.max(88, Math.round(segments * 1.35));
    const segZ = Math.max(72, Math.round(segments * 1.05));
    const geom = new THREE.PlaneGeometry(135, 95, segX, segZ);
    geom.rotateX(-Math.PI / 2);
    geom.translate(0, 0, -14);

    const pos = geom.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      pos.setY(i, sampleForegroundHeight(x, z, iglooX));
    }
    geom.computeVertexNormals();
    return geom;
  }, [segments, iglooX]);

  const terrainMaterial = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      color: '#FFFFFF',
      roughness: 0.91,
      metalness: 0.04,
    });
    mat.customProgramCacheKey = () => 'hero-foreground-terrain-v3';

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uRadius = uniformsRef.current.uRadius;
      shader.uniforms.uEmerge = uniformsRef.current.uEmerge;
      shader.uniforms.uIglooPos = uniformsRef.current.uIglooPos;

      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uEmerge;
          varying vec3 vFgWorldPos;
          varying vec3 vFgWorldNormal;`,
        )
        .replace(
          '#include <worldpos_vertex>',
          `#include <worldpos_vertex>
          vFgWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
          vFgWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
        );

      shader.fragmentShader = shader.fragmentShader
        .replace(
          '#include <common>',
          `#include <common>
          uniform float uRadius;
          uniform float uEmerge;
          uniform vec2 uIglooPos;
          varying vec3 vFgWorldPos;
          varying vec3 vFgWorldNormal;

          float fgHash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
          }
          float fgNoise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(fgHash(i), fgHash(i + vec2(1.0, 0.0)), f.x),
              mix(fgHash(i + vec2(0.0, 1.0)), fgHash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }
          float fgFbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 5; i++) {
              v += a * fgNoise(p);
              p *= 2.12;
              a *= 0.5;
            }
            return v;
          }
          float fgRidged(vec2 p) {
            float v = 0.0;
            float a = 0.55;
            for (int i = 0; i < 4; i++) {
              float n = 1.0 - abs(fgNoise(p) * 2.0 - 1.0);
              v += a * n * n;
              p = p * 2.18 + vec2(3.7, -2.9);
              a *= 0.5;
            }
            return v;
          }`,
        )
        .replace(
          '#include <clipping_planes_fragment>',
          `#include <clipping_planes_fragment>
          // Radial expanding rocky terrain boundary matching uploaded_media_2
          vec2 deltaIgloo = vFgWorldPos.xz - uIglooPos;
          float radialDist = length(deltaIgloo);
          float edgeJagged = (fgFbm(vFgWorldPos.xz * 0.45) - 0.5) * 2.8 + (fgNoise(vFgWorldPos.xz * 1.65) - 0.5) * 1.1;
          float maxRad = pow(max(uRadius, 0.0), 2.25) * 86.0;
          if (radialDist + edgeJagged > maxRad) discard;`,
        )
        .replace(
          '#include <normal_fragment_maps>',
          `#include <normal_fragment_maps>
          // Crisp high-frequency faceted rocky scree micro-normals (geological foreground gravel/slate)
          float h0 = fgRidged(vFgWorldPos.xz * 2.2) * 0.6 + fgFbm(vFgWorldPos.xz * 5.6) * 0.4;
          float hx = fgRidged((vFgWorldPos.xz + vec2(0.06, 0.0)) * 2.2) * 0.6 + fgFbm((vFgWorldPos.xz + vec2(0.06, 0.0)) * 5.6) * 0.4;
          float hz = fgRidged((vFgWorldPos.xz + vec2(0.0, 0.06)) * 2.2) * 0.6 + fgFbm((vFgWorldPos.xz + vec2(0.0, 0.06)) * 5.6) * 0.4;
          vec3 fgPerturb = normalize(vec3((h0 - hx) * 3.1, 1.0, (h0 - hz) * 3.1));
          normal = normalize(normal + (fgPerturb - vec3(0.0, 1.0, 0.0)) * 0.78);`,
        )
        .replace(
          '#include <color_fragment>',
          `#include <color_fragment>
          vec2 p = vFgWorldPos.xz;
          float rockGrain = fgFbm(p * 0.58);
          float screeCrease = fgRidged(p * 1.35);
          float fineStrata = fgFbm(p * 3.1 + vec2(rockGrain * 1.4, -rockGrain));

          // Exposed cold alpine silver-grey bedrock & bright frosted whitish snow crust (uploaded_media_1794805197696)
          float slopeRock = 1.0 - smoothstep(0.56, 0.88, vFgWorldNormal.y + (screeCrease - 0.46) * 0.38);
          vec3 darkSlate = vec3(0.115, 0.132, 0.168);
          vec3 midGranite = vec3(0.23, 0.255, 0.305);
          vec3 slateRock = mix(darkSlate, midGranite, fineStrata);

          vec3 frostDust = mix(vec3(0.34, 0.37, 0.43), vec3(0.54, 0.58, 0.65), smoothstep(0.22, 0.84, rockGrain * 0.65 + screeCrease * 0.35));
          vec3 groundCol = mix(frostDust, slateRock, slopeRock * 0.72);

          // Grounded contact AO under igloo perimeter & entrance arch
          float distIgloo = length(p - uIglooPos);
          float contactAO = smoothstep(2.35, 3.8, distIgloo);
          groundCol *= mix(0.76, 1.0, contactAO);

          diffuseColor.rgb = groundCol;`,
        )
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          // Soft white-blue glow beside arch during construction scan, settling cleanly in final hero
          vec2 doorCenter = uIglooPos + vec2(0.95, 2.35);
          float doorDist = length(vFgWorldPos.xz - doorCenter);
          float constructMask = smoothstep(0.05, 0.25, uRadius) * (1.0 - smoothstep(0.48, 0.85, uRadius));
          float doorSpill = exp(-doorDist * doorDist * 0.28) * 0.42 * constructMask;

          // Crisp icy scan rim at outer boundary of radial terrain reveal (uploaded_media_2)
          float radD = length(vFgWorldPos.xz - uIglooPos);
          float jagged = (fgFbm(vFgWorldPos.xz * 0.45) - 0.5) * 2.8 + (fgNoise(vFgWorldPos.xz * 1.65) - 0.5) * 1.1;
          float distEdge = pow(max(uRadius, 0.0), 2.25) * 86.0 - (radD + jagged);
          float scanRim = smoothstep(1.9, 0.0, distEdge) * step(0.0, distEdge) * (1.0 - smoothstep(0.68, 0.94, uRadius));

          totalEmissiveRadiance += vec3(0.84, 0.92, 1.0) * (doorSpill + scanRim * 0.68);`,
        );
    };

    return mat;
  }, []);

  useEffect(() => {
    uniformsRef.current.uIglooPos.value.set(iglooX, IGLOO_WORLD_Z);
  }, [iglooX]);

  useEffect(() => {
    return () => {
      terrainGeom.dispose();
      terrainMaterial.dispose();
    };
  }, [terrainGeom, terrainMaterial]);

  useFrame(() => {
    const r = introStage.terrainRadius;
    if (groupRef.current) {
      groupRef.current.visible = r > 0.008;
    }
    uniformsRef.current.uRadius.value = r;
    uniformsRef.current.uEmerge.value = introStage.mountainEmerge;
  });

  return (
    <group ref={groupRef}>
      <mesh geometry={terrainGeom} material={terrainMaterial} receiveShadow />
    </group>
  );
}
