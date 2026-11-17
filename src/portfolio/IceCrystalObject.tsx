import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { damp } from '../utils/damping';
import { createIceCrystalMaterial } from './crystalMaterial';
import type { CrystalGeometryBundle } from './crystalGeometry';
import { getProjectById, type PortfolioProjectId } from './projects';
import { getCrystalFlowOffset } from './verticalFlow';

interface IceCrystalObjectProps {
  projectId: PortfolioProjectId;
  position: readonly [number, number, number];
  geometryBundle: CrystalGeometryBundle;
  phaseOffset: number;
  baseYaw?: number;
  pointerNdcRef: React.MutableRefObject<THREE.Vector2>;
  scrollProgressRef: React.MutableRefObject<number>;
  isHovered: boolean;
  isSelected: boolean;
  detailBlendRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
  meshRegistryRef: React.MutableRefObject<Record<string, THREE.Mesh | null>>;
  worldPosOutRef: React.MutableRefObject<Record<string, THREE.Vector3>>;
  children: ReactNode;
}

/**
 * Floating, faceted, refractive 3D ice monolith with internal fractures,
 * subtle outer vertex constellation halo, and embedded 3D volumetric sculpture.
 */
export function IceCrystalObject({
  projectId,
  position,
  geometryBundle,
  phaseOffset,
  baseYaw = 0,
  pointerNdcRef,
  scrollProgressRef,
  isHovered,
  isSelected,
  detailBlendRef,
  reducedMotion,
  meshRegistryRef,
  worldPosOutRef,
  children,
}: IceCrystalObjectProps) {
  const project = getProjectById(projectId)!;
  const rootRef = useRef<THREE.Group>(null);
  const spinGroupRef = useRef<THREE.Group>(null);
  const haloRef = useRef<THREE.Group>(null);
  const outerMeshRef = useRef<THREE.Mesh>(null);

  const { material: crystalMat, uniforms: crystalUniforms } = useMemo(
    () => createIceCrystalMaterial(),
    [],
  );

  const fractureMat = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        color: '#E6F2FF',
        roughness: 0.14,
        metalness: 0.05,
        transparent: true,
        opacity: 0.16,
        depthWrite: false,
        side: THREE.DoubleSide,
        emissive: '#BFE0FF',
        emissiveIntensity: 0.22,
      }),
    [],
  );

  const haloLineMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.44,
        depthWrite: false,
      }),
    [],
  );

  const haloCrossMat = useMemo(
    () =>
      new THREE.LineBasicMaterial({
        color: '#FFFFFF',
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
      }),
    [],
  );

  const boostRef = useRef(0);
  const tiltXRef = useRef(0);
  const tiltYRef = useRef(0);

  useEffect(() => {
    meshRegistryRef.current[projectId] = outerMeshRef.current;
    worldPosOutRef.current[projectId] = new THREE.Vector3(position[0], position[1], position[2]);
    return () => {
      meshRegistryRef.current[projectId] = null;
      crystalMat.dispose();
      fractureMat.dispose();
      haloLineMat.dispose();
      haloCrossMat.dispose();
      geometryBundle.dispose();
    };
  }, [
    projectId,
    position,
    meshRegistryRef,
    worldPosOutRef,
    crystalMat,
    fractureMat,
    haloLineMat,
    haloCrossMat,
    geometryBundle,
  ]);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.05);
    const t = state.clock.elapsedTime;
    const root = rootRef.current;
    const spin = spinGroupRef.current;
    if (!root || !spin) return;

    // Gentle floating vertical bob + subtle horizontal sway
    const floatY = reducedMotion ? 0 : Math.sin(t * 0.72 + phaseOffset) * 0.045;
    const [start, end] = project.revealRange;
    const scrollOffset = getCrystalFlowOffset(scrollProgressRef.current, start, project.focusScroll, end);
    const detailWeight = 1 - detailBlendRef.current;
    const verticalOffset = scrollOffset * detailWeight;
    const floatX = reducedMotion ? 0 : Math.cos(t * 0.44 + phaseOffset) * 0.045;
    root.position.set(position[0] + floatX, position[1] + floatY + verticalOffset, position[2]);

    if (worldPosOutRef.current[projectId]) {
      worldPosOutRef.current[projectId].copy(root.position);
    }

    // Slow rotation + subtle pointer-driven orientation response
    const pointerRangeY = isSelected ? 0.34 : isHovered ? 0.24 : 0.16;
    const pointerRangeX = isSelected ? 0.22 : isHovered ? 0.14 : 0.09;
    const targetTiltY = reducedMotion ? 0 : pointerNdcRef.current.x * pointerRangeY;
    const targetTiltX = reducedMotion ? 0 : -pointerNdcRef.current.y * pointerRangeX;

    tiltYRef.current = damp(tiltYRef.current, targetTiltY, 4.5, dt);
    tiltXRef.current = damp(tiltXRef.current, targetTiltX, 4.5, dt);

    const idleSpinY = reducedMotion ? 0 : Math.sin(t * 0.22 + phaseOffset) * 0.2;
    const idleRollZ = reducedMotion ? 0 : Math.sin(t * 0.34 + phaseOffset * 1.4) * 0.04;

    spin.rotation.set(tiltXRef.current, baseYaw + idleSpinY + tiltYRef.current, idleRollZ);

    if (haloRef.current) {
      haloRef.current.rotation.y = reducedMotion ? 0 : -idleSpinY * 0.18;
    }

    root.updateMatrixWorld(true);

    // Material luminance boost when hovered or in detail focus
    const activeDetail = isSelected ? detailBlendRef.current : 0;
    const targetBoost = (isHovered ? 0.55 : 0) + activeDetail * 0.85;
    boostRef.current = damp(boostRef.current, targetBoost, 5.2, dt);

    crystalUniforms.uTime.value = t;
    crystalUniforms.uBoost.value = boostRef.current;
    crystalUniforms.uDetailBlend.value = activeDetail;

    crystalMat.envMapIntensity = 1.35 + boostRef.current * 0.55;
    fractureMat.opacity = 0.14 + boostRef.current * 0.1;
    haloLineMat.opacity = (0.42 + (isHovered ? 0.22 : 0)) * (1 - activeDetail * 0.35);
    haloCrossMat.opacity = (0.76 + (isHovered ? 0.2 : 0)) * (1 - activeDetail * 0.35);
  }, -1);

  return (
    <group ref={rootRef} position={[position[0], position[1], position[2]]}>
      <group ref={spinGroupRef} scale={0.68}>
        {/* Embedded 3D sculpture inside the ice */}
        <group>{children}</group>

        {/* Internal faceted fracture shards around perimeter */}
        <mesh geometry={geometryBundle.fractureGeom} material={fractureMat} renderOrder={1} />

        {/* Outer faceted refractive ice monolith */}
        <mesh
          ref={outerMeshRef}
          geometry={geometryBundle.outerGeom}
          material={crystalMat}
          renderOrder={2}
          userData={{ projectId }}
        />

        {/* Delicate outer vertex constellation lines & + markers */}
        <group ref={haloRef}>
          <lineSegments geometry={geometryBundle.haloLineGeom} material={haloLineMat} />
          <lineSegments geometry={geometryBundle.haloCrossGeom} material={haloCrossMat} />
        </group>
      </group>
    </group>
  );
}
