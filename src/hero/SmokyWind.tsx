import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { introStage } from './heroStore';
import { sampleWind } from './wind';
import { sampleForegroundHeight } from './ForegroundTerrain';

interface SmokyWindProps {
  iglooX: number;
  smokeIntensityRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
}

function createSmokyShaderMaterial(mode: 'plume' | 'wind'): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uIntensity: { value: 0 },
      uMode: { value: mode === 'plume' ? 0 : 1 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uIntensity;
      uniform float uMode;
      varying vec2 vUv;

      float sHash(vec2 p) {
        return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
      }
      float sNoise(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(sHash(i), sHash(i + vec2(1.0, 0.0)), f.x),
          mix(sHash(i + vec2(0.0, 1.0)), sHash(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }
      float sFbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * sNoise(p);
          p = p * 2.06 + vec2(1.9, -1.4);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        vec2 centered = vUv - 0.5;

        // Swirl warp creates organic smoky curl tendrils rising & drifting across wind current
        float swirl = sFbm(vUv * vec2(3.2, 2.4) + vec2(-uTime * 0.14, -uTime * 0.18));
        vec2 flowUv = vUv * vec2(2.6, 3.2) + vec2(swirl * 0.4 - uTime * mix(0.16, 0.42, uMode), -uTime * mix(0.24, 0.025, uMode));
        float wisp = sFbm(flowUv);
        float fineDetail = sFbm(flowUv * 2.2 - vec2(uTime * 0.09, 0.0));
        float smokeBody = smoothstep(0.28, 0.84, wisp * 0.72 + fineDetail * 0.28);

        // Soft feathered oval boundaries (zero hard plane edges!)
        float radialFade = (1.0 - smoothstep(0.08, 0.5, length(centered * vec2(1.05, 1.12))));
        float bottomFade = uMode < 0.5
          ? smoothstep(0.0, 0.24, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y))
          : smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.65, 1.0, vUv.y));

        float alpha = smokeBody * radialFade * bottomFade * uIntensity;
        if (alpha < 0.005) discard;

        // Cold luminous silver-white vapor out of igloo core / chilly blue-grey ambient drift
        vec3 col = mix(vec3(0.84, 0.88, 0.94), vec3(0.97, 0.98, 1.0), uMode < 0.5 ? 0.85 : 0.45);
        gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.48));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/**
 * Creative Arctic Smoky Wind & Core Vapor System:
 * - Soft luminous icy steam/smoke wisps escaping from the igloo doorway arch and separating
 *   upper brick joints (ramping smoothly during State B-C activation).
 * - Multi-layered wind-driven smoky ground & valley ribbons gliding naturally across flanks.
 */
export function SmokyWind({ iglooX, smokeIntensityRef, reducedMotion }: SmokyWindProps) {
  const crownSmokeRef = useRef<THREE.Mesh>(null);
  const archSmokeRef = useRef<THREE.Mesh>(null);
  const windStream1Ref = useRef<THREE.Mesh>(null);
  const windStream2Ref = useRef<THREE.Mesh>(null);

  const mats = useMemo(
    () => ({
      plumeCrown: createSmokyShaderMaterial('plume'),
      plumeArch: createSmokyShaderMaterial('plume'),
      windLow: createSmokyShaderMaterial('wind'),
      windMid: createSmokyShaderMaterial('wind'),
    }),
    [],
  );

  const { lowRibbonGeom, midRibbonGeom } = useMemo(() => {
    const buildRibbon = (width: number, height: number, zBase: number) => {
      const geom = new THREE.PlaneGeometry(width, height, 32, 4);
      const pos = geom.attributes.position;
      for (let i = 0; i < pos.count; i++) {
        const lx = pos.getX(i);
        const ly = pos.getY(i);
        const groundY = sampleForegroundHeight(lx, zBase, iglooX) * 0.48;
        pos.setY(i, ly + groundY);
        pos.setZ(i, Math.sin(lx * 0.18) * 0.45);
      }
      geom.computeVertexNormals();
      return geom;
    };
    return {
      lowRibbonGeom: buildRibbon(28, 3.6, 4.4),
      midRibbonGeom: buildRibbon(44, 7.2, -11.5),
    };
  }, [iglooX]);

  useEffect(() => {
    return () => {
      Object.values(mats).forEach((m) => m.dispose());
    };
  }, [mats]);

  useEffect(() => {
    return () => {
      lowRibbonGeom.dispose();
      midRibbonGeom.dispose();
    };
  }, [lowRibbonGeom, midRibbonGeom]);

  useFrame((state) => {
    const weather = sampleWind(state.clock.elapsedTime, reducedMotion);
    const t = weather.time;
    const mountainVis = introStage.mountainEmerge;
    const brickVis = introStage.brickReveal;
    const boost = smokeIntensityRef.current;

    // 1. Luminous cold vapor drifting gracefully out of crown & arch seams
    mats.plumeCrown.uniforms.uTime.value = t * 0.72;
    mats.plumeCrown.uniforms.uIntensity.value = brickVis * (0.12 + boost * 0.2);

    mats.plumeArch.uniforms.uTime.value = t * 0.85 + 7.2;
    mats.plumeArch.uniforms.uIntensity.value = brickVis * (0.24 + boost * 0.28);

    // 2. Sweeping wind-driven smoky frost ribbons across foreground ridge & mid valley
    mats.windLow.uniforms.uTime.value = t * 0.95 + 1.5;
    mats.windLow.uniforms.uIntensity.value = mountainVis * (0.2 + boost * 0.12) * (0.75 + weather.gust * 0.55);

    mats.windMid.uniforms.uTime.value = t * 0.68 - 3.4;
    mats.windMid.uniforms.uIntensity.value = mountainVis * (0.14 + boost * 0.1) * (0.8 + weather.gust * 0.4);

    if (crownSmokeRef.current) {
      crownSmokeRef.current.position.set(
        iglooX + Math.sin(t * 0.25) * 0.25,
        2.95 + Math.cos(t * 0.3) * 0.12,
        0.15,
      );
      crownSmokeRef.current.rotation.y = Math.sin(t * 0.12) * 0.22;
    }
    if (archSmokeRef.current) {
      archSmokeRef.current.position.set(
        iglooX + 1.15 + Math.sin(t * 0.32 + 1.1) * 0.18,
        1.15,
        2.55,
      );
    }
    if (windStream1Ref.current) {
      const x = Math.sin(t * 0.08) * 3.8;
      windStream1Ref.current.position.set(x, sampleForegroundHeight(x, 4.4, iglooX) + 0.6, 4.4);
    }
    if (windStream2Ref.current) {
      const x = Math.cos(t * 0.06) * 4.5 - 2;
      windStream2Ref.current.position.set(x, sampleForegroundHeight(x, -11.5, iglooX) + 0.8, -11.5);
    }
  });

  return (
    <group>
      {/* Billowing icy steam rising gently from upper igloo masonry seams */}
      <mesh ref={crownSmokeRef} material={mats.plumeCrown} renderOrder={4}>
        <planeGeometry args={[5.8, 4.2]} />
      </mesh>

      {/* Low cold vapor spilling softly from the arched stone entrance */}
      <mesh ref={archSmokeRef} material={mats.plumeArch} rotation={[0, 0.35, 0]} renderOrder={4}>
        <planeGeometry args={[4.4, 2.8]} />
      </mesh>

      {/* Forefront low drifting smoky alpine wind ribbons conforming to terrain contour */}
      <mesh
        ref={windStream1Ref}
        position={[0, 0.85, 4.4]}
        rotation={[-0.22, 0.06, 0]}
        geometry={lowRibbonGeom}
        material={mats.windLow}
        renderOrder={3}
      />

      {/* Midground swirling ridge wind-mist veil conforming to valley contour */}
      <mesh
        ref={windStream2Ref}
        position={[0, 2.6, -11.5]}
        rotation={[-0.08, -0.04, 0]}
        geometry={midRibbonGeom}
        material={mats.windMid}
        renderOrder={3}
      />
    </group>
  );
}
