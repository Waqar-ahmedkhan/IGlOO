import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { buildIglooBricks, createMasonryBlockGeometry } from './IglooGeometry';
import { createIglooBrickMaterial } from './IglooMaterial';
import { IglooWireframe } from './IglooWireframe';
import { IGLOO_WORLD_Z } from './ForegroundTerrain';
import { smoothstep } from '../utils/noise';
import { damp, stepSpring, type SpringState } from '../utils/damping';
import { heroStore, hudBridge, introStage, type BrickAnnotation } from './heroStore';
import { soundController } from './SoundController';
import type { HeroExitSignals } from '../experience/HeroExitAnimation';

interface IglooBrickInteractionProps {
  iglooX: number;
  pointerNdcRef: React.MutableRefObject<THREE.Vector2>;
  pointerActiveRef: React.MutableRefObject<boolean>;
  scrollProgressRef: React.MutableRefObject<number>;
  exitSignalsRef: React.MutableRefObject<HeroExitSignals>;
  reducedMotion: boolean;
}

/**
 * Instanced 3D Igloo combining:
 * - IglooWireframe geometric reveal & internal core glow
 * - IglooMaterial bottom-to-top surface materialization shader
 * - Localized upper-hemisphere cursor interaction + Phase 1 scroll activation scatter
 *   with spring-like damping, individual staggered heights, rotational wobble, and grounded base.
 */
export function IglooBrickInteraction({
  iglooX,
  pointerNdcRef,
  pointerActiveRef,
  scrollProgressRef,
  exitSignalsRef,
  reducedMotion,
}: IglooBrickInteractionProps) {
  const { camera, size } = useThree();
  const groupRef = useRef<THREE.Group>(null);
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const proxyRef = useRef<THREE.Mesh>(null);
  const shadowMatRef = useRef<THREE.MeshBasicMaterial>(null);

  const brickGeom = useMemo(() => createMasonryBlockGeometry(), []);
  const bricks = useMemo(() => buildIglooBricks(), []);
  const { material: brickMaterial, uniforms: brickUniforms } = useMemo(
    () => createIglooBrickMaterial(),
    [],
  );

  // Feathered soft ambient occlusion under igloo base
  const shadowTexture = useMemo(() => {
    const texSize = 128;
    const data = new Uint8Array(texSize * texSize * 4);
    for (let y = 0; y < texSize; y++) {
      for (let x = 0; x < texSize; x++) {
        const dx = (x / (texSize - 1) - 0.5) * 2;
        const dy = (y / (texSize - 1) - 0.5) * 2;
        const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        const alpha = Math.pow(Math.max(0, 1 - r), 2.3) * 195;
        const idx = (y * texSize + x) * 4;
        data[idx] = 66;
        data[idx + 1] = 74;
        data[idx + 2] = 90;
        data[idx + 3] = Math.round(alpha);
      }
    }
    const tex = new THREE.DataTexture(data, texSize, texSize, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  // Per-instance attributes & spring physics states (zero per-frame heap allocations)
  const { glowArray, toneArray, springStates } = useMemo(() => {
    const g = new Float32Array(bricks.length);
    const tn = new Float32Array(bricks.length);
    const springs: SpringState[] = [];
    for (let i = 0; i < bricks.length; i++) {
      tn[i] = bricks[i].tone;
      springs.push({ value: 0, velocity: 0 });
    }
    return { glowArray: g, toneArray: tn, springStates: springs };
  }, [bricks]);

  const lagFollowRef = useRef(new THREE.Vector3(999, 999, 999));
  const wasHoveredRef = useRef(false);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const tmpMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tmpQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpWobbleQuat = useMemo(() => new THREE.Quaternion(), []);
  const tmpEuler = useMemo(() => new THREE.Euler(), []);
  const tmpScale = useMemo(() => new THREE.Vector3(), []);
  const tmpProj = useMemo(() => new THREE.Vector3(), []);
  const tmpHitPoint = useMemo(() => new THREE.Vector3(), []);
  const domeCenterWorld = useMemo(() => new THREE.Vector3(), []);
  const activeListRef = useRef<{ idx: number; disp: number }[]>([]);

  useEffect(() => {
    brickGeom.setAttribute('aGlow', new THREE.InstancedBufferAttribute(glowArray, 1));
    brickGeom.setAttribute('aTone', new THREE.InstancedBufferAttribute(toneArray, 1));
    return () => {
      brickGeom.dispose();
      brickMaterial.dispose();
      shadowTexture.dispose();
    };
  }, [brickGeom, glowArray, toneArray, brickMaterial, shadowTexture]);

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    const group = groupRef.current;
    const proxy = proxyRef.current;
    if (!mesh || !group || !proxy) return;

    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const brickReveal = introStage.brickReveal;
    const introReady = heroStore.getState().introComplete || brickReveal > 0.96;
    const heroScroll = scrollProgressRef.current;
    const exit = exitSignalsRef.current;

    // Bottom-to-top reveal shader height (-0.25 -> 3.35)
    brickUniforms.uTime.value = t;
    brickUniforms.uRevealHeight.value =
      brickReveal <= 0.001 ? -1.0 : THREE.MathUtils.lerp(-0.15, 3.35, brickReveal);
    brickUniforms.uInnerGlow.value = introStage.innerGlow + exit.internalGlowBoost;
    brickUniforms.uSeamBoost.value = heroScroll * 0.4 + exit.activation * 0.92;
    brickUniforms.uWireEdge.value = Math.max(introStage.wireframeFade, exit.activation * 0.45);

    if (shadowMatRef.current) {
      shadowMatRef.current.opacity = smoothstep(0.15, 0.85, brickReveal) * 0.48;
    }

    // Raycast pointer onto 3D igloo dome proxy once intro activates interaction
    let hasHit = false;
    if (introReady && pointerActiveRef.current) {
      raycaster.setFromCamera(pointerNdcRef.current, camera);
      const hits = raycaster.intersectObject(proxy, false);
      if (hits.length > 0) {
        tmpHitPoint.copy(hits[0].point);
        hasHit = true;
      }
    }

    if (hasHit) {
      if (!wasHoveredRef.current) {
        lagFollowRef.current.copy(tmpHitPoint);
        wasHoveredRef.current = true;
        heroStore.setState({ pointerInteractive: true });
      } else {
        lagFollowRef.current.x = damp(lagFollowRef.current.x, tmpHitPoint.x, 9.2, dt);
        lagFollowRef.current.y = damp(lagFollowRef.current.y, tmpHitPoint.y, 9.2, dt);
        lagFollowRef.current.z = damp(lagFollowRef.current.z, tmpHitPoint.z, 9.2, dt);
      }
    } else if (wasHoveredRef.current) {
      wasHoveredRef.current = false;
      lagFollowRef.current.set(999, 999, 999);
      heroStore.setState({ pointerInteractive: false });
    }

    group.getWorldPosition(domeCenterWorld);
    domeCenterWorld.y += 1.05;

    const activeList = activeListRef.current;
    activeList.length = 0;
    let maxDisp = 0;

    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i];
      const rowNorm = brick.row / Math.max(1, brick.maxRow);

      tmpWorldPos.copy(brick.basePos).applyMatrix4(group.matrixWorld);

      // Localized cursor proximity: strong within 1.0 unit, tapering from 1.0 to 3.0 units
      let cursorPush = 0;
      if (hasHit && brick.isInteractive) {
        const dist = tmpWorldPos.distanceTo(lagFollowRef.current);
        if (dist < 3.0) {
          const nearCore = 1 - smoothstep(0.0, 1.0, dist);
          const outerTail = 1 - smoothstep(1.0, 3.0, dist);
          const combined = Math.min(1, nearCore * 0.42 + outerTail * 0.68);
          cursorPush = combined * (reducedMotion ? 0.25 : 0.84);
        }
      }

      // Subtle automatic living movement on upper bricks even without cursor interaction
      const idleWave =
        !reducedMotion && brick.isInteractive && introReady
          ? Math.max(
              0,
              Math.sin(t * 1.15 + brick.basePos.x * 0.72 + brick.seed * 4.5) * 0.045 * rowNorm,
            )
          : 0;

      // Scroll-driven State B & C activation scatter: upper bricks separate at individualized staggered heights
      const sepStrength = exit.brickSeparation;
      const scrollSep =
        brick.isInteractive && sepStrength > 0.005
          ? sepStrength * (0.24 + rowNorm * 0.92 * (0.55 + brick.seed * 0.85))
          : 0;

      const targetDisp = Math.max(0, cursorPush + idleWave + scrollSep);

      // Spring-like damping for organic float & gentle return to resting position
      const stiffness = targetDisp > springStates[i].value ? 52 : 28;
      const dampingRatio = targetDisp > springStates[i].value ? 10.5 : 8.2;
      const disp = Math.max(0, stepSpring(springStates[i], targetDisp, stiffness, dampingRatio, dt));

      if (disp > maxDisp) maxDisp = disp;
      const showExitLabel = sepStrength > 0.14 && exit.frostProgress < 0.16 && disp > 0.24 && (brick.id % 5 === 0);
      if (brick.isInteractive && ((hasHit && cursorPush > 0.18) || showExitLabel)) {
        activeList.push({ idx: i, disp });
      }

      tmpPos.copy(brick.basePos).addScaledVector(brick.outwardDir, disp);
      if (scrollSep > 0.02 && brick.isInteractive) {
        tmpPos.y += scrollSep * (0.25 + brick.seed * 0.42);
      }

      tmpQuat.copy(brick.baseQuat);
      if (disp > 0.018 && !reducedMotion && brick.isInteractive) {
        const wobble = Math.min(0.28, disp * 0.22);
        tmpEuler.set(
          Math.sin(t * 2.1 + brick.seed * 12.0) * wobble,
          Math.cos(t * 1.7 + brick.seed * 9.0) * wobble,
          Math.sin(t * 1.5 + brick.seed * 7.0) * wobble * 0.7,
        );
        tmpWobbleQuat.setFromEuler(tmpEuler);
        tmpQuat.multiply(tmpWobbleQuat);
      }

      const visScale = brickReveal > 0.002 ? 1 : 0;
      tmpScale.copy(brick.scale).multiplyScalar(visScale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);

      glowArray[i] = Math.min(1.8, disp * 1.45 + exit.internalGlowBoost * 0.25);
    }

    mesh.instanceMatrix.needsUpdate = true;
    const glowAttr = brickGeom.getAttribute('aGlow') as THREE.InstancedBufferAttribute | undefined;
    if (glowAttr) glowAttr.needsUpdate = true;

    if (hasHit && maxDisp > 0.3) {
      soundController.playBrickHoverChime(Math.min(1, maxDisp));
    }

    // Project crisp crosshair + connected line telemetry on displaced upper bricks (matches uploaded_media_1_1794801840670)
    if (activeList.length > 0) {
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

      activeList.sort((a, b) => b.disp - a.disp);
      const topN = activeList.slice(0, 5);
      const out: BrickAnnotation[] = [];

      for (let k = 0; k < topN.length; k++) {
        const b = bricks[topN[k].idx];
        const disp = topN[k].disp;
        tmpWorldPos
          .copy(b.basePos)
          .addScaledVector(b.outwardDir, disp + 0.25)
          .applyMatrix4(group.matrixWorld);

        tmpProj.copy(tmpWorldPos).project(camera);
        if (tmpProj.z > -1 && tmpProj.z < 1) {
          const anchorX = (tmpProj.x * 0.5 + 0.5) * size.width;
          const anchorY = (-tmpProj.y * 0.5 + 0.5) * size.height;

          out.push({
            id: b.id,
            code: String(Math.min(99, Math.max(11, Math.round(12 + disp * 48 + (b.id % 19))))),
            anchorX,
            anchorY,
            tipX: anchorX,
            tipY: anchorY,
            displacement: disp,
          });
        }
      }
      // Sort clockwise around dome angle so connecting polyline forms a clean technical circuit
      out.sort((a, b) => a.anchorY - b.anchorY || a.anchorX - b.anchorX);
      hudBridge.brickAnnotations = out;
      hudBridge.emit();
    } else if (hudBridge.brickAnnotations.length > 0) {
      hudBridge.brickAnnotations = [];
      hudBridge.emit();
    }
  });

  // Orient entrance tunnel (+Z local) toward lower-right of viewport (+0.32 rad Y)
  return (
    <group ref={groupRef} position={[iglooX, 0.02, IGLOO_WORLD_Z]} rotation={[0, 0.34, 0]}>
      <instancedMesh
        ref={meshRef}
        args={[brickGeom, brickMaterial, bricks.length]}
        castShadow
        receiveShadow
        frustumCulled={false}
      />

      {/* Raycast interaction dome proxy */}
      <mesh ref={proxyRef} position={[0, 0.95, 0.1]}>
        <sphereGeometry args={[2.95, 24, 16]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} colorWrite={false} />
      </mesh>

      <IglooWireframe bricks={bricks} exitSignalsRef={exitSignalsRef} />

      {/* Feathered soft ground contact shadow */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.032, 0.1]}>
        <planeGeometry args={[7.4, 7.4]} />
        <meshBasicMaterial
          ref={shadowMatRef}
          map={shadowTexture}
          transparent
          opacity={0}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
