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
  const { glowArray, toneArray, springStates, lockStates } = useMemo(() => {
    const g = new Float32Array(bricks.length);
    const tn = new Float32Array(bricks.length);
    const locks = new Uint8Array(bricks.length);
    const springs: SpringState[] = [];
    for (let i = 0; i < bricks.length; i++) {
      tn[i] = bricks[i].tone;
      springs.push({ value: 0, velocity: 0 });
    }
    return { glowArray: g, toneArray: tn, springStates: springs, lockStates: locks };
  }, [bricks]);

  const lagFollowRef = useRef(new THREE.Vector3(999, 999, 999));
  const wasHoveredRef = useRef(false);
  const previousPointer = useRef(new THREE.Vector2());
  const pointerMotion = useRef(0);
  const clickWaveRef = useRef({ active: false, strength: 0, radius: 0, point: new THREE.Vector3() });

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const tmpMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tmpPos = useMemo(() => new THREE.Vector3(), []);
  const tmpWorldPos = useMemo(() => new THREE.Vector3(), []);
  const tmpWorldNormal = useMemo(() => new THREE.Vector3(), []);
  const tmpToCam = useMemo(() => new THREE.Vector3(), []);
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

  useEffect(() => {
    let downX = 0;
    let downY = 0;
    const ndc = new THREE.Vector2();

    const onDown = (e: PointerEvent) => {
      downX = e.clientX;
      downY = e.clientY;
    };

    const onUp = (e: PointerEvent) => {
      if (scrollProgressRef.current >= 0.38) return;
      if (!heroStore.getState().introComplete && introStage.brickReveal < 0.96) return;
      const target = e.target as HTMLElement | null;
      if (target && target.closest('button, a, nav')) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 14) return;
      const proxy = proxyRef.current;
      if (!proxy) return;

      const w = Math.max(1, window.innerWidth);
      const h = Math.max(1, window.innerHeight);
      ndc.set((e.clientX / w) * 2 - 1, -(e.clientY / h) * 2 + 1);
      raycaster.setFromCamera(ndc, camera);
      const hits = raycaster.intersectObject(proxy, false);
      if (hits.length > 0) {
        clickWaveRef.current.point.copy(hits[0].point);
        clickWaveRef.current.active = true;
        clickWaveRef.current.radius = 0;
        clickWaveRef.current.strength = Math.min(1.6, clickWaveRef.current.strength + 1.0);
        soundController.playParticleClickBurst(0.75);
      }
    };

    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
    };
  }, [camera, raycaster, scrollProgressRef]);

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
    const pointerSpeed = pointerNdcRef.current.distanceTo(previousPointer.current) / Math.max(dt, 0.001);
    previousPointer.current.copy(pointerNdcRef.current);
    pointerMotion.current = damp(pointerMotion.current, Math.min(1, pointerSpeed * 0.8), 6, dt);

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

    // Periodic diagonal living wave at rest + scroll-driven diagonal structural wave (upper-left -> lower-right)
    const idleCycle = (t * 0.22) % 2.4;
    const idleWaveFront = idleCycle < 1.35 ? idleCycle / 1.35 : -1;
    const scrollWaveFront = exit.waveSweep;

    const clickWave = clickWaveRef.current;
    if (clickWave.active) {
      clickWave.radius += dt * 7.2;
      clickWave.strength = damp(clickWave.strength, 0, 2.2, dt);
      if (clickWave.strength < 0.01) {
        clickWave.active = false;
        clickWave.strength = 0;
      }
    }

    for (let i = 0; i < bricks.length; i++) {
      const brick = bricks[i];
      const rowNorm = brick.row / Math.max(1, brick.maxRow);
      const waveCoord = brick.wavePos;

      tmpWorldPos.copy(brick.basePos).applyMatrix4(group.matrixWorld);

      // Localized cursor proximity: strong within 1.0 unit, tapering from 1.0 to 3.0 units
      let cursorPush = 0;
      if (hasHit && brick.isInteractive) {
        const dist = tmpWorldPos.distanceTo(lagFollowRef.current);
        if (dist < 3.0) {
          const nearCore = 1 - smoothstep(0.0, 1.0, dist);
          const outerTail = 1 - smoothstep(1.0, 3.0, dist);
          const combined = Math.min(1, nearCore * 0.42 + outerTail * 0.68);
          cursorPush = combined * (reducedMotion ? 0.1 : 0.68) * (0.06 + pointerMotion.current * 0.94);
        }
      }

      // Click shockwave impulse radiating outward across igloo blocks
      let clickPush = 0;
      let clickGlow = 0;
      if (clickWave.active && brick.isInteractive && !reducedMotion) {
        const cDist = tmpWorldPos.distanceTo(clickWave.point);
        const ringDelta = Math.abs(cDist - clickWave.radius);
        const ringEnv = Math.exp(-(ringDelta * ringDelta) * 1.45);
        const nearEnv = Math.exp(-cDist * 0.72) * 0.55;
        clickPush = (ringEnv * 0.48 + nearEnv) * clickWave.strength * (0.65 + 0.35 * rowNorm);
        clickGlow = (ringEnv + nearEnv) * clickWave.strength * 0.95;
      }

      // Diagonal wave envelope at rest (upper-left to lower-right algorithmic architectural pulse)
      let idleWave = 0;
      let seamPreGlow = clickGlow;
      if (!reducedMotion && brick.isInteractive && introReady && idleWaveFront >= 0) {
        const dWave = idleWaveFront - waveCoord * 0.82;
        if (dWave > -0.14 && dWave < 0.36) {
          seamPreGlow = Math.max(seamPreGlow, smoothstep(-0.14, 0.04, dWave) * (1 - smoothstep(0.18, 0.36, dWave)) * 0.55);
        }
        if (dWave > 0 && dWave < 0.34) {
          const env = Math.sin((dWave / 0.34) * Math.PI);
          idleWave = env * (0.042 + 0.048 * rowNorm) * brick.scale.x;
        }
      }

      // Scroll-driven State B & C diagonal wave activation: staggered by waveCoord (normX * 0.55 + (1 - normY) * 0.45)
      const sepStrength = exit.brickSeparation;
      const waveActivation = smoothstep(waveCoord * 0.52, waveCoord * 0.52 + 0.42, scrollWaveFront);
      const waveCrestGlow =
        scrollWaveFront > 0.01
          ? smoothstep(waveCoord * 0.52 - 0.12, waveCoord * 0.52 + 0.08, scrollWaveFront) *
            (1 - smoothstep(waveCoord * 0.52 + 0.25, waveCoord * 0.52 + 0.55, scrollWaveFront))
          : 0;
      seamPreGlow = Math.max(seamPreGlow, waveCrestGlow * 0.95);

      const scrollSep =
        brick.isInteractive && sepStrength > 0.005
          ? sepStrength *
            (0.25 + 0.75 * waveActivation) *
            (0.22 + rowNorm * 0.88 * (0.52 + brick.seed * 0.78))
          : 0;

      const targetDisp = Math.max(0, cursorPush + clickPush + idleWave + scrollSep);

      // Smooth outward acceleration + slightly faster controlled deceleration for mechanical lock
      const expanding = targetDisp > springStates[i].value;
      const stiffness = expanding ? 48 : 58;
      const dampingRatio = expanding ? 9.8 : 11.2;
      let disp = Math.max(0, stepSpring(springStates[i], targetDisp, stiffness, dampingRatio, dt));
      if (targetDisp < 0.002 && disp < 0.0025) {
        disp = 0;
        springStates[i].value = 0;
        springStates[i].velocity = 0;
      }

      // Synchronized mechanical escapement ticks (activation) & tactile stone/ice locking clicks (settle)
      if (introReady && brick.isInteractive) {
        if (lockStates[i] === 0 && disp > 0.12 && expanding) {
          lockStates[i] = 1;
          soundController.playWaveTick(waveCoord, Math.min(1, disp * 1.6));
        } else if (lockStates[i] === 1 && disp < 0.022 && !expanding) {
          lockStates[i] = 0;
          soundController.playBrickLockClick(brick.tone, 0.65);
        }
      }

      if (disp > maxDisp) maxDisp = disp;
      const showExitLabel =
        (sepStrength > 0.1 || idleWave > 0.028) &&
        exit.frostProgress < 0.16 &&
        disp > 0.045 &&
        brick.id % 3 === 0;
      if (brick.isInteractive && ((hasHit && cursorPush > 0.14) || showExitLabel)) {
        activeList.push({ idx: i, disp });
      }

      tmpPos.copy(brick.basePos).addScaledVector(brick.outwardDir, disp);
      if (scrollSep > 0.02 && brick.isInteractive) {
        tmpPos.y += scrollSep * (0.25 + brick.seed * 0.42);
      }

      // Controlled 1-5 deg architectural tilt during wave/separation (no chaotic drift)
      tmpQuat.copy(brick.baseQuat);
      if (disp > 0.008 && !reducedMotion && brick.isInteractive) {
        const maxTiltRad = Math.min(0.087, disp * 0.14); // 0.087 rad = ~5 degrees
        const signA = brick.id % 2 === 0 ? 1 : -1;
        const signB = brick.id % 3 === 0 ? -1 : 1;
        tmpEuler.set(
          signA * maxTiltRad * (0.7 + 0.3 * Math.sin(t * 1.6 + brick.seed * 8.0)),
          signB * maxTiltRad * 0.55 * Math.cos(t * 1.3 + brick.seed * 6.0),
          signA * signB * maxTiltRad * 0.45,
        );
        tmpWobbleQuat.setFromEuler(tmpEuler);
        tmpQuat.multiply(tmpWobbleQuat);
      }

      const visScale = brickReveal > 0.002 ? 1 : 0;
      tmpScale.copy(brick.scale).multiplyScalar(visScale);
      tmpMatrix.compose(tmpPos, tmpQuat, tmpScale);
      mesh.setMatrixAt(i, tmpMatrix);

      glowArray[i] = Math.min(1.85, seamPreGlow * 0.85 + disp * 1.48 + exit.internalGlowBoost * 0.28);
    }

    mesh.instanceMatrix.needsUpdate = true;
    const glowAttr = brickGeom.getAttribute('aGlow') as THREE.InstancedBufferAttribute | undefined;
    if (glowAttr) glowAttr.needsUpdate = true;

    if (hasHit && maxDisp > 0.3) {
      soundController.playBrickHoverChime(Math.min(1, maxDisp));
    }

    // Project crisp crosshair + connected line telemetry on camera-facing displaced bricks with stable codes
    if (activeList.length > 0) {
      camera.updateMatrixWorld();
      camera.matrixWorldInverse.copy(camera.matrixWorld).invert();

      activeList.sort((a, b) => b.disp - a.disp);
      const out: BrickAnnotation[] = [];

      for (let k = 0; k < activeList.length && out.length < 5; k++) {
        const b = bricks[activeList[k].idx];
        const disp = activeList[k].disp;
        tmpWorldPos
          .copy(b.basePos)
          .addScaledVector(b.outwardDir, disp + 0.25)
          .applyMatrix4(group.matrixWorld);

        // Normal dot-product occlusion check: skip back-facing or silhouette-occluded blocks
        tmpWorldNormal.copy(b.outwardDir).transformDirection(group.matrixWorld).normalize();
        tmpToCam.subVectors(camera.position, tmpWorldPos).normalize();
        if (tmpWorldNormal.dot(tmpToCam) < 0.22) continue;

        tmpProj.copy(tmpWorldPos).project(camera);
        if (tmpProj.z > -1 && tmpProj.z < 1) {
          const anchorX = (tmpProj.x * 0.5 + 0.5) * size.width;
          const anchorY = (-tmpProj.y * 0.5 + 0.5) * size.height;

          out.push({
            id: b.id,
            code: b.code,
            anchorX,
            anchorY,
            tipX: anchorX,
            tipY: anchorY,
            displacement: disp,
          });
        }
      }
      // Sort by stable brick ID / screen angle so connecting polyline remains steady without frame-to-frame jumping
      out.sort((a, b) => a.anchorX - b.anchorX || a.anchorY - b.anchorY);
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
