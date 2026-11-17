import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, fbm2D } from '../utils/noise';
import { createSnowParticleMaterial } from '../shaders/snowMaterial';
import { introStage } from './heroStore';

interface AtmosphericFogProps {
  snowCount: number;
  reducedMotion: boolean;
}

/**
 * Controlled alpine fog (kept light so mountains stay clearly visible),
 * two slow-moving valley mist layers, and gentle polar snow motes.
 */
export function AtmosphericFog({ snowCount, reducedMotion }: AtmosphericFogProps) {
  const { gl } = useThree();
  const fogRef = useRef<THREE.FogExp2>(null);
  const mist1Ref = useRef<THREE.Mesh>(null);
  const mist2Ref = useRef<THREE.Mesh>(null);

  const mistTexture = useMemo(() => {
    const size = 128;
    const data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / (size - 1);
        const v = y / (size - 1);
        const dx = (u - 0.5) * 2;
        const dy = (v - 0.5) * 2;
        const radial = Math.max(0, 1 - Math.sqrt(dx * dx + dy * dy));
        const bottomFeather = Math.min(1, v / 0.35);
        const topFeather = Math.min(1, (1 - v) / 0.32);
        const n = fbm2D(u * 4.2 + 1.4, v * 3.5 - 2.1, 3);
        const alpha = Math.max(
          0,
          Math.min(
            255,
            Math.floor(Math.pow(radial, 1.7) * bottomFeather * topFeather * (0.68 + n * 0.45) * 255),
          ),
        );
        const idx = (y * size + x) * 4;
        data[idx] = 205;
        data[idx + 1] = 212;
        data[idx + 2] = 224;
        data[idx + 3] = alpha;
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  const { snowGeom, snowMat } = useMemo(() => {
    const geom = new THREE.BufferGeometry();
    const rand = createSeededRandom(55129 + snowCount);
    const bounds = [24, 14, 22] as const;

    const positions = new Float32Array(snowCount * 3);
    const scales = new Float32Array(snowCount);
    const seeds = new Float32Array(snowCount);
    const speeds = new Float32Array(snowCount);

    for (let i = 0; i < snowCount; i++) {
      positions[i * 3] = (rand() * 2 - 1) * bounds[0];
      positions[i * 3 + 1] = (rand() * 2 - 1) * bounds[1];
      positions[i * 3 + 2] = (rand() * 2 - 1) * bounds[2];
      scales[i] = 0.4 + rand() * 0.9;
      seeds[i] = rand();
      speeds[i] = 0.45 + rand() * 0.85;
    }

    geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geom.setAttribute('aScale', new THREE.BufferAttribute(scales, 1));
    geom.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geom.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));

    const mat = createSnowParticleMaterial();
    mat.uniforms.uBounds.value.set(bounds[0], bounds[1], bounds[2]);
    return { snowGeom: geom, snowMat: mat };
  }, [snowCount]);

  useEffect(() => {
    return () => {
      mistTexture.dispose();
      snowGeom.dispose();
      snowMat.dispose();
    };
  }, [mistTexture, snowGeom, snowMat]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const emerge = introStage.mountainEmerge;

    // Keep fog restrained once mountains emerge so rocky silhouettes up to 80m remain crisp
    if (fogRef.current) {
      fogRef.current.density = THREE.MathUtils.lerp(0.032, 0.0052, emerge);
    }

    const driftScale = reducedMotion ? 0.15 : 1.0;

    // Two subtle slow-moving mist sheets hugging the valley floor below mountain crests
    if (mist1Ref.current) {
      mist1Ref.current.visible = emerge > 0.05;
      mist1Ref.current.position.x = Math.sin(t * 0.045 * driftScale) * 5.2;
      (mist1Ref.current.material as THREE.MeshBasicMaterial).opacity = emerge * 0.16;
    }
    if (mist2Ref.current) {
      mist2Ref.current.visible = emerge > 0.1;
      mist2Ref.current.position.x = Math.cos(t * 0.032 * driftScale + 1.8) * 7.5;
      (mist2Ref.current.material as THREE.MeshBasicMaterial).opacity = emerge * 0.13;
    }

    snowMat.uniforms.uTime.value = t;
    snowMat.uniforms.uPixelRatio.value = gl.getPixelRatio();
    snowMat.uniforms.uWindStrength.value = reducedMotion ? 0.15 : 0.48;
    snowMat.visible = emerge > 0.25;
  });

  return (
    <>
      <fogExp2 ref={fogRef} attach="fog" args={['#A0A5B1', 0.036]} />

      {/* Valley mist layer 1 (foreground/mid valley basin) */}
      <mesh ref={mist1Ref} position={[0, 1.5, -15]} rotation={[-0.08, 0, 0]}>
        <planeGeometry args={[52, 6.5]} />
        <meshBasicMaterial
          map={mistTexture}
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
        />
      </mesh>

      {/* Valley mist layer 2 (mid-to-far ridge separation) */}
      <mesh ref={mist2Ref} position={[0, 2.2, -31]} rotation={[-0.06, 0, 0]}>
        <planeGeometry args={[78, 8.2]} />
        <meshBasicMaterial
          map={mistTexture}
          transparent
          opacity={0}
          depthWrite={false}
          fog={false}
        />
      </mesh>

      <points geometry={snowGeom} material={snowMat} frustumCulled={false} />
    </>
  );
}
