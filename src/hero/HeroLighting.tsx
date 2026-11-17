import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { introStage } from './heroStore';

interface HeroLightingProps {
  enableShadows: boolean;
}

/**
 * Calibrated cold alpine lighting: directional sunlight casting crisp dark shadows
 * across rocky mountain faces and igloo masonry, paired with cool arctic fill.
 */
export function HeroLighting({ enableShadows }: HeroLightingProps) {
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const keyRef = useRef<THREE.DirectionalLight>(null);
  const rimRef = useRef<THREE.DirectionalLight>(null);

  useFrame(() => {
    const warmth = introStage.lightingWarmth;
    const brickVis = introStage.brickReveal;

    if (hemiRef.current) {
      hemiRef.current.intensity = 0.28 + brickVis * 0.16 + warmth * 0.12;
    }
    if (keyRef.current) {
      keyRef.current.intensity = 0.26 + brickVis * 0.48 + warmth * 0.68;
    }
    if (rimRef.current) {
      rimRef.current.intensity = 0.12 + warmth * 0.25;
    }
  });

  return (
    <>
      <hemisphereLight ref={hemiRef} args={['#E9EFF7', '#586274', 0.34]} />

      <directionalLight
        ref={keyRef}
        position={[-16, 17, 13]}
        intensity={0.26}
        color="#FAFCFF"
        castShadow={enableShadows}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-near={2}
        shadow-camera-far={65}
        shadow-camera-left={-18}
        shadow-camera-right={18}
        shadow-camera-top={16}
        shadow-camera-bottom={-14}
        shadow-bias={-0.0004}
      />

      <directionalLight
        ref={rimRef}
        position={[16, 7, -14]}
        intensity={0.15}
        color="#C9E2FF"
      />
    </>
  );
}
