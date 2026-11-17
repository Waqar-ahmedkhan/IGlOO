import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { damp } from '../utils/damping';
import { introStage } from './heroStore';
import { computeCameraPathPose } from '../experience/CameraPath';

interface HeroCameraProps {
  camera?: THREE.PerspectiveCamera;
  iglooX: number;
  pointerNdcRef: React.MutableRefObject<THREE.Vector2>;
  scrollProgressRef: React.MutableRefObject<number>;
  loopProgressRef?: React.MutableRefObject<number>;
  reducedMotion: boolean;
}

/**
 * Single unified Phase 1 perspective camera driven by CameraPath + ScrollDirector.
 */
export function HeroCamera({
  camera: explicitCamera,
  iglooX,
  pointerNdcRef,
  scrollProgressRef,
  loopProgressRef,
  reducedMotion,
}: HeroCameraProps) {
  const threeState = useThree();
  const cam = (explicitCamera ?? threeState.camera) as THREE.PerspectiveCamera;
  const size = threeState.size;

  const posRef = useRef(new THREE.Vector3(-5.6, 7.6, 8.4));
  const lookRef = useRef(new THREE.Vector3(iglooX + 0.12, 0.92, 0.45));
  const fovRef = useRef(39);

  const goalPos = useMemo(() => new THREE.Vector3(), []);
  const goalLook = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    cam.aspect = size.width / Math.max(1, size.height);
    cam.updateProjectionMatrix();
  }, [cam, size.width, size.height]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const isMobile = size.width < 768;
    const isTablet = size.width >= 768 && size.width < 1200;
    const loopP = loopProgressRef?.current ?? 0;

    const targetFov = computeCameraPathPose(
      {
        time: t,
        iglooX,
        descend: introStage.cameraDescend,
        scrollProgress: scrollProgressRef.current,
        loopProgress: loopP,
        isMobile,
        isTablet,
        pointerNdcX: pointerNdcRef.current.x,
        pointerNdcY: pointerNdcRef.current.y,
        reducedMotion,
      },
      goalPos,
      goalLook,
    );

    if (loopP > 0.001 && loopP < 0.12) {
      // Pre-align hero camera offscreen before Phase 06 mist crossfade opens
      posRef.current.copy(goalPos);
      lookRef.current.copy(goalLook);
      fovRef.current = targetFov;
    } else {
      const lambda = reducedMotion ? 14 : 8.0;
      posRef.current.lerp(goalPos, 1 - Math.exp(-lambda * dt));
      lookRef.current.lerp(goalLook, 1 - Math.exp(-lambda * dt));
      fovRef.current = damp(fovRef.current, targetFov, lambda, dt);
    }

    cam.position.copy(posRef.current);
    cam.lookAt(lookRef.current);
    if (Math.abs(cam.fov - fovRef.current) > 0.01) {
      cam.fov = fovRef.current;
      cam.updateProjectionMatrix();
    }
  });

  return null;
}
