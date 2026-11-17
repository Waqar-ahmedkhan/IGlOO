import { useEffect, useMemo, useRef } from 'react';

import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

import { createSeededRandom, smoothstep } from '../utils/noise';
import { PORTAL_LAYOUT } from './layout';

interface FrostGapProps {
  progressRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
}

/** Frost sits on the shell surface; the annular gap stays open and uncluttered. */
export function FrostGap({ progressRef, reducedMotion }: FrostGapProps) {
  const group = useRef<THREE.Group>(null);
  const chips = useRef<THREE.InstancedMesh>(null);
  const chipMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const latticeMaterial = useRef<THREE.LineBasicMaterial>(null);
  const snowMaterial = useRef<THREE.PointsMaterial>(null);
  const snow = useRef<THREE.Points>(null);
  const { size } = useThree();
  const chipCount = size.width < 768 ? 24 : 48;
  const transform = useMemo(() => new THREE.Object3D(), []);
  const lastProgress = useRef(-1);
  const resources = useMemo(() => {
    const random = createSeededRandom(792);
    const chipGeometry = new THREE.OctahedronGeometry(1, 0);
    const specs = Array.from({ length: chipCount }, () => ({
      angle: random() * Math.PI * 2,
      radius: PORTAL_LAYOUT.surfaceFrostInner + random() * (PORTAL_LAYOUT.surfaceFrostOuter - PORTAL_LAYOUT.surfaceFrostInner),
      depth: (random() - 0.5) * 0.65,
      length: 0.018 + random() * 0.04,
      tilt: random() * Math.PI,
    }));
    const vertices: THREE.Vector3[] = [];
    for (let i = 0; i < 180; i++) {
      const angle = i / 180 * Math.PI * 2 + (random() - 0.5) * 0.018;
      const radius = PORTAL_LAYOUT.surfaceFrostInner + random() * 0.45;
      vertices.push(new THREE.Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, (random() - 0.5) * 0.2));
    }
    const edges: number[] = [];
    vertices.forEach((vertex, i) => {
      for (const offset of [1, 2]) {
        const neighbor = vertices[(i + offset) % vertices.length];
        if (vertex.distanceTo(neighbor) < 0.29) edges.push(...vertex.toArray(), ...neighbor.toArray());
      }
    });
    const lattice = new THREE.BufferGeometry();
    lattice.setAttribute('position', new THREE.Float32BufferAttribute(edges, 3));
    const snowPositions = new Float32Array((chipCount * 12) * 3);
    for (let i = 0; i < snowPositions.length / 3; i++) {
      const angle = random() * Math.PI * 2;
      const radius = PORTAL_LAYOUT.surfaceFrostInner + random() * 0.45;
      snowPositions.set([Math.cos(angle) * radius, Math.sin(angle) * radius, (random() - 0.5) * 0.8], i * 3);
    }
    const snowGeometry = new THREE.BufferGeometry();
    snowGeometry.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
    return { chipGeometry, specs, lattice, snowGeometry };
  }, [chipCount]);

  useEffect(() => {
    lastProgress.current = -1;
    return () => {
      resources.chipGeometry.dispose();
      resources.lattice.dispose();
      resources.snowGeometry.dispose();
    };
  }, [resources]);

  useFrame(({ clock }) => {
    const p = progressRef.current;
    if (!group.current || !chips.current) return;
    group.current.visible = p > 0.25;
    if (!group.current.visible) return;
    const assembled = smoothstep(0.28, 0.6, p);
    const energy = smoothstep(0.46, 0.74, p);
    if (lastProgress.current !== p) {
      resources.specs.forEach((spec, index) => {
        const radius = spec.radius + (1 - assembled) * 0.65;
        transform.position.set(Math.cos(spec.angle) * radius, Math.sin(spec.angle) * radius, spec.depth * (2 - assembled));
        transform.rotation.set(spec.tilt, spec.angle, spec.tilt + (1 - assembled) * 0.8);
        transform.scale.set(spec.length * 0.4, spec.length, spec.length * 0.25);
        transform.updateMatrix();
        chips.current!.setMatrixAt(index, transform.matrix);
      });
      chips.current.instanceMatrix.needsUpdate = true;
      lastProgress.current = p;
    }
    if (chipMaterial.current) chipMaterial.current.emissiveIntensity = 0.02 + energy * 0.045;
    if (latticeMaterial.current) latticeMaterial.current.opacity = energy * 0.045;
    if (snowMaterial.current) snowMaterial.current.opacity = assembled * (0.06 + energy * 0.1);
    if (snow.current) snow.current.rotation.z = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.12) * 0.025;
  });

  return <group ref={group}>
    <instancedMesh ref={chips} args={[resources.chipGeometry, undefined, chipCount]} frustumCulled={false}>
      <meshStandardMaterial ref={chipMaterial} color='#c5d2df' emissive='#c4e9ff' metalness={0.05} roughness={0.88} />
    </instancedMesh>
    <lineSegments geometry={resources.lattice}>
      <lineBasicMaterial ref={latticeMaterial} color='#e1f2ff' transparent opacity={0} depthWrite={false} />
    </lineSegments>
    <points ref={snow} geometry={resources.snowGeometry}>
      <pointsMaterial ref={snowMaterial} color='#effaff' size={0.013} transparent opacity={0} depthWrite={false} />
    </points>
  </group>;
}
