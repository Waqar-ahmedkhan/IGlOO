import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { clamp, fbm2D, ridgedFbm2D } from '../utils/noise';
import { introStage } from './heroStore';

interface RidgeSpec {
  id: string;
  width: number;
  depth: number;
  pos: [number, number, number];
  rotY: number;
  peakHeight: number;
  seed: number;
  peakBiasX: number;
  steepness: number;
  snowAmount: number;
}

const RIDGE_SPECS: readonly RidgeSpec[] = [
  // 1. Left sweeping mid-distance glacial shoulder (gentle slope behind left flank of igloo)
  {
    id: 'ridge-left-mid',
    width: 56,
    depth: 26,
    pos: [-20, -1.4, -22],
    rotY: 0.24,
    peakHeight: 5.2,
    seed: 3.7,
    peakBiasX: -0.25,
    steepness: 1.05,
    snowAmount: 0.68,
  },
  // 2. Right sweeping snow saddle (gentle bright snow shoulder on right)
  {
    id: 'ridge-right-mid',
    width: 58,
    depth: 26,
    pos: [22, -1.2, -25],
    rotY: -0.22,
    peakHeight: 6.4,
    seed: 14.2,
    peakBiasX: 0.22,
    steepness: 1.08,
    snowAmount: 0.7,
  },
  // 3. Broad dominant upper-left alpine snow summit rising behind IGLOO (matches uploaded_media_1794805197696)
  {
    id: 'ridge-center-main',
    width: 82,
    depth: 32,
    pos: [-8.5, -1.1, -39],
    rotY: 0.05,
    peakHeight: 11.4,
    seed: 29.5,
    peakBiasX: -0.14,
    steepness: 1.12,
    snowAmount: 0.72,
  },
  // 4. Sweeping eastern valley shelf below top-right
  {
    id: 'ridge-far-east-mid',
    width: 86,
    depth: 32,
    pos: [24, -0.9, -46],
    rotY: -0.09,
    peakHeight: 8.8,
    seed: 51.8,
    peakBiasX: 0.16,
    steepness: 1.06,
    snowAmount: 0.76,
  },
  // 5. Pale atmospheric hazy distant snow dome on top-right (uploaded_media_1794805197696)
  {
    id: 'ridge-far-horizon',
    width: 96,
    depth: 38,
    pos: [17.5, -0.4, -74],
    rotY: -0.04,
    peakHeight: 14.6,
    seed: 83.4,
    peakBiasX: 0.08,
    steepness: 1.05,
    snowAmount: 0.85,
  },
];

function createSculptedMountainGeometry(
  spec: RidgeSpec,
  segX: number,
  segZ: number,
): THREE.BufferGeometry {
  const geom = new THREE.PlaneGeometry(spec.width, spec.depth, segX, segZ);
  geom.rotateX(-Math.PI / 2);

  const pos = geom.attributes.position;
  const gullies = new Float32Array(pos.count);

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);

    const nx = x * 0.024 + spec.seed;
    const nz = z * 0.036 - spec.seed * 0.65;

    // Smooth wind-carved glacial slopes & clean single ridge spine (no jagged sawtooth spikes)
    const warpX = fbm2D(nx * 0.45, nz * 0.45, 2) * 0.85;
    const warpZ = fbm2D(nx * 0.45 + 8.1, nz * 0.45 - 5.3, 2) * 0.85;

    const broadMassif = fbm2D(nx * 0.52 + warpX * 0.3, nz * 0.52 + warpZ * 0.3, 3) * 0.5 + 0.5;
    const softRidge = ridgedFbm2D(nx * 0.72 + warpX * 0.25, nz * 0.72 + warpZ * 0.25, 3);
    const windGully = fbm2D(nx * 1.4 - 2.1, nz * 1.4 + 1.7, 2) * 0.5 + 0.5;

    const normX = x / (spec.width * 0.5);
    const normZ = z / (spec.depth * 0.5);
    const summitShape =
      0.24 +
      0.76 * Math.exp(-Math.pow((normX - spec.peakBiasX) / 0.48, 2)) +
      0.16 * Math.exp(-Math.pow((normX + 0.42) / 0.36, 2));

    const envX = Math.max(0, 1 - Math.pow(Math.abs(normX), 2.3));
    const envZ = Math.max(0, 1 - Math.pow(Math.abs(normZ), 1.8));
    const spine = Math.exp(-Math.pow(normZ * 1.2, 2));

    const hRaw = Math.pow(broadMassif * 0.62 + softRidge * 0.28 + windGully * 0.1, spec.steepness);
    const height =
      hRaw * spec.peakHeight * summitShape * envX * envZ * (0.45 + 0.55 * spine) - 0.9;

    pos.setY(i, height);
    gullies[i] = clamp(windGully, 0, 1);
  }

  geom.setAttribute('aGully', new THREE.BufferAttribute(gullies, 1));
  geom.computeVertexNormals();
  return geom;
}

function createMountainRockShaderMaterial(snowAmount: number): {
  material: THREE.MeshStandardMaterial;
  uniforms: { uEmerge: { value: number }; uSnowAmount: { value: number } };
} {
  const uniforms = {
    uEmerge: { value: 0 },
    uSnowAmount: { value: snowAmount },
  };

  const material = new THREE.MeshStandardMaterial({
    color: '#FFFFFF',
    roughness: 0.94,
    metalness: 0.04,
  });

  material.customProgramCacheKey = () => `mountain-rock-shader-v2-${snowAmount.toFixed(2)}`;

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uEmerge = uniforms.uEmerge;
    shader.uniforms.uSnowAmount = uniforms.uSnowAmount;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aGully;
        uniform float uEmerge;
        varying vec3 vMtnWorldPos;
        varying vec3 vMtnWorldNormal;
        varying float vGully;
        varying float vLocalY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vGully = aGully;
        float distWave = clamp(uEmerge * 1.25 - (abs(position.x) * 0.004), 0.0, 1.0);
        float emergeScale = mix(0.02, 1.0, smoothstep(0.0, 1.0, distWave));
        transformed.y = (transformed.y + 0.9) * emergeScale - 0.9;
        vLocalY = transformed.y;`,
      )
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
        vMtnWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
        vMtnWorldNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uEmerge;
        uniform float uSnowAmount;
        varying vec3 vMtnWorldPos;
        varying vec3 vMtnWorldNormal;
        varying float vGully;
        varying float vLocalY;

        float mHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float mNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(mHash(i), mHash(i + vec2(1.0, 0.0)), f.x),
            mix(mHash(i + vec2(0.0, 1.0)), mHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }
        float mFbm(vec2 p) {
          float v = 0.0;
          float a = 0.5;
          for (int i = 0; i < 4; i++) {
            v += a * mNoise(p);
            p *= 2.12;
            a *= 0.5;
          }
          return v;
        }`,
      )
      .replace(
        '#include <normal_fragment_maps>',
        `#include <normal_fragment_maps>
        // Subtle rocky snow micro-normals without noisy high-frequency clutter
        float h0 = mFbm(vMtnWorldPos.xz * 0.28 + vMtnWorldPos.y * 0.14);
        float hx = mFbm((vMtnWorldPos.xz + vec2(0.32, 0.0)) * 0.28 + vMtnWorldPos.y * 0.14);
        float hz = mFbm((vMtnWorldPos.xz + vec2(0.0, 0.32)) * 0.28 + vMtnWorldPos.y * 0.14);
        vec3 rockPerturb = normalize(vec3((h0 - hx) * 1.2, 1.0, (h0 - hz) * 1.2));
        normal = normalize(normal + (rockPerturb - vec3(0.0, 1.0, 0.0)) * 0.38);`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Calibrated "somewhitish" luminous arctic snow slopes + subtle cold slate shadows (uploaded_media_1794805197696)
        float strata = mFbm(vec2(vMtnWorldPos.x * 0.14, vMtnWorldPos.y * 0.35 + vMtnWorldPos.z * 0.10));
        float detail = mFbm(vMtnWorldPos.xz * 0.55);

        vec3 coolShadowRock = vec3(0.145, 0.165, 0.205);
        vec3 midSnowSlope = vec3(0.285, 0.315, 0.368);
        vec3 baseSlope = mix(coolShadowRock, midSnowSlope, smoothstep(0.22, 0.80, strata * 0.62 + detail * 0.38));

        // Generous snow blanket across mountain slopes & shelves -> clean whitish-grey alpine palette
        float slope = vMtnWorldNormal.y;
        float elevMask = smoothstep(0.4, 4.5, vLocalY);
        float snowThreshold = 0.68 - uSnowAmount * 0.32 - vGully * 0.08;
        float snowMask = smoothstep(snowThreshold - 0.12, snowThreshold + 0.14, slope + (detail - 0.5) * 0.18) * (0.55 + 0.45 * elevMask);

        vec3 snowPatch = mix(vec3(0.38, 0.41, 0.47), vec3(0.56, 0.60, 0.67), smoothstep(0.45, 0.94, slope));
        vec3 mtnCol = mix(baseSlope, snowPatch, clamp(snowMask, 0.0, 0.92));

        // Blend smoothly out of sky mist hue during emergence
        vec3 voidCol = vec3(0.42, 0.45, 0.51);
        diffuseColor.rgb = mix(voidCol, mtnCol, smoothstep(0.04, 0.65, uEmerge));`,
      );
  };

  return { material, uniforms };
}

interface MountainTerrainProps {
  segments: number;
}

export function MountainTerrain({ segments }: MountainTerrainProps) {
  const groupRef = useRef<THREE.Group>(null);

  const ridges = useMemo(() => {
    const segX = Math.max(48, segments);
    const segZ = Math.max(22, Math.floor(segments * 0.4));
    return RIDGE_SPECS.map((spec) => {
      const geometry = createSculptedMountainGeometry(spec, segX, segZ);
      const { material, uniforms } = createMountainRockShaderMaterial(spec.snowAmount);
      return { spec, geometry, material, uniforms };
    });
  }, [segments]);

  useEffect(() => {
    return () => {
      ridges.forEach((r) => {
        r.geometry.dispose();
        r.material.dispose();
      });
    };
  }, [ridges]);

  useFrame(() => {
    const emerge = introStage.mountainEmerge;
    if (groupRef.current) {
      groupRef.current.visible = emerge > 0.01;
    }
    for (let i = 0; i < ridges.length; i++) {
      ridges[i].uniforms.uEmerge.value = emerge;
    }
  });

  return (
    <group ref={groupRef}>
      {ridges.map((r) => (
        <mesh
          key={r.spec.id}
          geometry={r.geometry}
          material={r.material}
          position={r.spec.pos}
          rotation={[0, r.spec.rotY, 0]}
          castShadow
          receiveShadow
        />
      ))}
    </group>
  );
}
