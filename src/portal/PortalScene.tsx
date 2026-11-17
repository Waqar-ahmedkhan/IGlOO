import { selection } from '../particles/social';
import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { createSeededRandom, fbm2D, smoothstep } from '../utils/noise';
import { soundController } from '../hero/SoundController';
import { getPortalAssemblyPose, getPortalProgress } from './PortalCameraPath';
import { FrostGap } from './FrostGap';
import { PORTAL_LAYOUT } from './layout';
import { PLATFORM_POSITION } from './stage';

interface PortalSceneProps {
  scrollProgressRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
}

// A real extruded annular sector: front, back, beveled edges and side walls.
function createArcGeometry(inner: number, outer: number, angle: number, depth: number, bevel = 0.055) {
  const shape = new THREE.Shape();
  shape.absarc(0, 0, outer, -angle / 2, angle / 2, false);
  shape.absarc(0, 0, inner, angle / 2, -angle / 2, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 3, curveSegments: 24, steps: 1 });
  geometry.translate(0, 0, -depth / 2);
  geometry.computeVertexNormals();
  return geometry;
}

function createFrostTexture() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  const random = createSeededRandom(307);
  for (let i = 0; i < size * size; i++) {
    const x = (i % size) / size, y = Math.floor(i / size) / size;
    const frost = fbm2D(x * 8, y * 8, 4);
    const grain = random() * 0.06;
    const value = Math.floor(180 + frost * 48 + grain * 255);
    data.set([value, value, value, 255], i * 4);
  }
  const texture = new THREE.DataTexture(data, size, size);
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(2, 2);
  texture.needsUpdate = true;
  return texture;
}

function PortalSegments({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const segments = useRef<(THREE.Group | null)[]>([]);
  const lights = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const outer = useMemo(() => createArcGeometry(PORTAL_LAYOUT.shellInner, PORTAL_LAYOUT.shellOuter, Math.PI / 4 - 0.045, 0.62), []);
  const seam = useMemo(() => createArcGeometry(2.65, 2.76, Math.PI / 4 - 0.075, 0.035), []);
  const panel = useMemo(() => createArcGeometry(2.84, 3.12, Math.PI / 4 - 0.14, 0.045, 0.018), []);
  const lip = useMemo(() => createArcGeometry(3.15, 3.23, Math.PI / 4 - 0.07, 0.07, 0.015), []);
  const innerLip = useMemo(() => createArcGeometry(2.74, 2.8, Math.PI / 4 - 0.07, 0.07, 0.012), []);
  const frost = useMemo(createFrostTexture, []);
  useEffect(() => () => {
    outer.dispose(); seam.dispose(); panel.dispose(); lip.dispose(); innerLip.dispose(); frost.dispose();
  }, [outer, seam, panel, lip, innerLip, frost]);
  useFrame(() => {
    const p = progressRef.current;
    segments.current.forEach((segment, i) => {
      if (!segment) return;
      const angle = i * Math.PI / 4;
      const settle = smoothstep(0.08 + i * 0.018, 0.46 + i * 0.018, p);
      const spread = 1 - settle;
      segment.position.set(Math.cos(angle) * spread * (0.8 + i % 3 * 0.25), Math.sin(angle) * spread * 0.7, spread * ((i % 3) - 1) * 1.1);
      segment.rotation.set(spread * (i % 2 ? 0.32 : -0.25), spread * 0.35, angle + spread * (i % 2 ? 0.3 : -0.3));
      segment.visible = p > 0.01 + i * 0.009;
      if (lights.current[i]) lights.current[i]!.emissiveIntensity = 0.08 + smoothstep(0.48 + i * 0.025, 0.58 + i * 0.025, p) * 1.5;
    });
    // Assembly remains entirely scroll driven, including when reduced motion is enabled.
  });
  return <>{Array.from({ length: 8 }, (_, i) => <group key={i} ref={el => { segments.current[i] = el; }}>
    <mesh geometry={outer} castShadow receiveShadow><meshStandardMaterial color={i % 3 === 0 ? '#b4bfca' : '#ccd4dc'} metalness={0.14} roughness={0.8} roughnessMap={frost} bumpMap={frost} bumpScale={0.065} /></mesh>
    <mesh geometry={panel} position={[0, 0, 0.32]}>
      <meshStandardMaterial color={i % 2 ? '#a8b7c5' : '#bac7d2'} metalness={0.24} roughness={0.74} bumpMap={frost} bumpScale={0.025} />
    </mesh>
    <mesh geometry={lip} position={[0, 0, 0.35]}>
      <meshStandardMaterial color='#d1dce5' metalness={0.58} roughness={0.35} />
    </mesh>
    <mesh geometry={innerLip} position={[0, 0, 0.35]}>
      <meshStandardMaterial color='#aabcca' metalness={0.55} roughness={0.38} />
    </mesh>
    <mesh geometry={seam} position={[0, 0, 0.35]}><meshStandardMaterial ref={el => { lights.current[i] = el; }} color="#dcebf5" emissive="#c6e8ff" emissiveIntensity={0.1} /></mesh>
    {[-1, 1].map(side => <group key={side} rotation={[0, 0, side * (Math.PI / 8 - 0.035)]}>
      <mesh position={[2.98, 0, 0.355]}>
        <boxGeometry args={[0.36, 0.018, 0.03]} />
        <meshStandardMaterial color='#deeff8' emissive='#c7e8ff' emissiveIntensity={0.65} roughness={0.4} />
      </mesh>
    </group>)}
  </group>)}</>;
}

function PortalTunnel({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const shells = useRef<THREE.InstancedMesh>(null);
  const rims = useRef<THREE.InstancedMesh>(null);
  const shellMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const rimMaterial = useRef<THREE.MeshStandardMaterial>(null);
  const transform = useMemo(() => new THREE.Object3D(), []);
  const shell = useMemo(() => createArcGeometry(2.65, 3.2, Math.PI / 4 - 0.04, 0.3), []);
  const rim = useMemo(() => createArcGeometry(2.64, 2.71, Math.PI / 4 - 0.055, 0.06), []);
  const frost = useMemo(createFrostTexture, []);

  useEffect(() => () => { shell.dispose(); rim.dispose(); frost.dispose(); }, [shell, rim, frost]);
  useFrame(() => {
    if (!shells.current || !rims.current) return;
    const p = progressRef.current;
    shells.current.visible = rims.current.visible = p > 0.38;
    if (p <= 0.38) return;
    for (let ring = 0; ring < 3; ring++) {
      const settle = smoothstep(0.38 + ring * 0.03, 0.6 + ring * 0.025, p);
      const scale = 1 - ring * 0.03;
      for (let segment = 0; segment < 8; segment++) {
        const angle = segment * Math.PI / 4 + ring * 0.12;
        const spread = (1 - settle) * 0.8;
        transform.position.set(Math.cos(angle) * spread, Math.sin(angle) * spread, -(ring + 1) * 2.2);
        transform.rotation.set(0, (1 - settle) * 0.12, angle);
        transform.scale.setScalar(scale);
        transform.updateMatrix();
        shells.current.setMatrixAt(ring * 8 + segment, transform.matrix);
        transform.position.z += 0.2;
        transform.updateMatrix();
        rims.current.setMatrixAt(ring * 8 + segment, transform.matrix);
      }
    }
    shells.current.instanceMatrix.needsUpdate = true;
    rims.current.instanceMatrix.needsUpdate = true;
    const energy = smoothstep(0.52, 0.7, p);
    if (shellMaterial.current) shellMaterial.current.emissiveIntensity = energy * 0.045;
    if (rimMaterial.current) rimMaterial.current.emissiveIntensity = 0.12 + energy * 1.25;
  });

  return <>
    <instancedMesh ref={shells} args={[shell, undefined, 24]} frustumCulled={false}>
      <meshStandardMaterial ref={shellMaterial} color="#9facb9" emissive="#b8d9f2" metalness={0.4} roughness={0.68} bumpMap={frost} bumpScale={0.045} />
    </instancedMesh>
    <instancedMesh ref={rims} args={[rim, undefined, 24]} frustumCulled={false}>
      <meshStandardMaterial ref={rimMaterial} color="#d6e9f4" emissive="#ccecff" roughness={0.45} />
    </instancedMesh>
  </>;
}

function PortalEnergy({ progressRef }: { progressRef: React.MutableRefObject<number> }) {
  const particles = useRef<THREE.Points>(null);
  const particleGeometry = useMemo(() => {
    const random = createSeededRandom(715);
    const positions = new Float32Array(180 * 3);
    for (let i = 0; i < 180; i++) {
      const angle = random() * Math.PI * 2;
      const radius = 0.04 + random() * 2.1;
      positions.set([Math.cos(angle) * radius, Math.sin(angle) * radius, (random() - 0.5) * 1.5], i * 3);
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geometry;
  }, []);
  useEffect(() => () => particleGeometry.dispose(), [particleGeometry]);
  const glow = useRef<THREE.PointLight>(null);
  useFrame(({ clock }) => {
    const strength = smoothstep(0.48, 0.75, progressRef.current);
    if (particles.current) { particles.current.visible = strength > 0.01; particles.current.rotation.z = clock.elapsedTime * 0.035; }
    if (glow.current) glow.current.intensity = strength * 5;
  });
  return <><points ref={particles} geometry={particleGeometry}><pointsMaterial color="#e9f7ff" size={0.025} transparent opacity={0.55} depthWrite={false} /></points><pointLight ref={glow} color="#d4eeff" distance={9} intensity={0} /></>;
}

// Revolved, rounded track profiles give the stage real recessed channels and side walls.
function createTrack(inner: number, outer: number, top: number) {
  const bevel = 0.055;
  const profile = [
    [inner, -0.17], [outer - bevel, -0.17], [outer, -0.12],
    [outer, top - bevel], [outer - 0.016, top - 0.016], [outer - bevel, top],
    [inner + bevel, top], [inner + 0.016, top - 0.016], [inner, top - bevel], [inner, -0.17],
  ];
  return new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 160);
}

function CircularPlatform() {
  const disc = useRef<THREE.Group>(null);
  const lights = useRef<(THREE.MeshStandardMaterial | null)[]>([]);
  const frost = useMemo(createFrostTexture, []);
  const tracks = useMemo(() => [
    createTrack(0.001, 2.25, 0.46), createTrack(2.38, 3.3, 0.29),
    createTrack(3.44, 4.5, 0.2), createTrack(4.65, 5.85, 0.12), createTrack(6, 7.2, 0.04),
  ], []);
  useEffect(() => () => { frost.dispose(); tracks.forEach(track => track.dispose()); }, [frost, tracks]);
  useFrame((_, delta) => {
    if (disc.current) {
      disc.current.rotation.y = THREE.MathUtils.damp(disc.current.rotation.y, selection.index * Math.PI * 0.4, 3, delta);
      disc.current.position.y = THREE.MathUtils.damp(disc.current.position.y, selection.index * 0.025, 3, delta);
    }
    lights.current.forEach((light, index) => {
      if (light) light.emissiveIntensity = THREE.MathUtils.damp(light.emissiveIntensity, index === selection.index ? 1.5 : 0.35, 3, delta);
    });
  });
  return <group position={PLATFORM_POSITION}>
    <mesh receiveShadow position={[0, -0.2, 0]}><cylinderGeometry args={[7.2, 7.1, 0.3, 128]} /><meshStandardMaterial color="#465363" roughness={0.9} /></mesh>
    {tracks.map((geometry, index) => <group key={index} ref={index === 0 ? disc : undefined}>
      <mesh geometry={geometry} receiveShadow castShadow>
        <meshStandardMaterial color={index === 0 ? '#8995a3' : '#748191'} metalness={0.32} roughness={0.74} bumpMap={frost} bumpScale={0.045} roughnessMap={frost} />
      </mesh>
      {index > 0 && <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, [0, 0.23, 0.14, 0.06, -0.02][index], 0]}>
        <ringGeometry args={[[0, 2.38, 3.44, 4.65, 6][index] - 0.065, [0, 2.38, 3.44, 4.65, 6][index] + 0.025, 160]} />
        <meshStandardMaterial ref={el => { lights.current[index - 1] = el; }} color="#e5f2fb" emissive="#d8eeff" emissiveIntensity={index === 1 ? 1.8 : 0.75} roughness={0.35} />
      </mesh>}
      {index === 0 && Array.from({ length: 12 }, (_, i) => <mesh key={i} position={[Math.sin(i * Math.PI / 6) * 1.85, 0.461, Math.cos(i * Math.PI / 6) * 1.85]} rotation={[-Math.PI / 2, 0, -i * Math.PI / 6]}>
        <planeGeometry args={[0.008, 0.62]} /><meshBasicMaterial color="#445565" />
      </mesh>)}
    </group>)}
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.465, 0]}>
      <ringGeometry args={[1.4, 1.412, 128]} /><meshStandardMaterial color="#576879" roughness={0.8} />
    </mesh>
    {/* Overhead luminous portal crown ring framing the sculpture top */}
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5.25, 0]}>
      <torusGeometry args={[2.75, 0.12, 16, 120]} />
      <meshStandardMaterial color="#eef7ff" emissive="#e3f3ff" emissiveIntensity={1.65} roughness={0.35} />
    </mesh>
    <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 5.38, 0]}>
      <ringGeometry args={[2.55, 3.15, 120]} />
      <meshBasicMaterial color="#eaf5ff" transparent opacity={0.28} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  </group>;
}

export function PortalScene({ scrollProgressRef, reducedMotion }: PortalSceneProps) {
  const group = useRef<THREE.Group>(null);
  const progressRef = useRef(0);
  const lastStep = useRef(-1);
  const { size } = useThree();
  useFrame(({ clock }) => {
    const p = getPortalProgress(scrollProgressRef.current);
    progressRef.current = p;
    if (group.current) {
      group.current.visible = scrollProgressRef.current >= 0.92;
      const assembly = getPortalAssemblyPose(p);
      const hover = reducedMotion ? 0 : Math.sin(clock.elapsedTime * 0.35) * 0.035 * smoothstep(0.5, 0.7, p);
      group.current.position.y = assembly.y + hover;
      group.current.rotation.x = assembly.tilt;
    }
    const step = Math.floor(Math.max(0, p - 0.12) / 0.055);
    if (p > 0.12 && p < 0.52 && step > lastStep.current && lastStep.current >= 0) soundController.playConstructionTick(step / 10);
    lastStep.current = step;
  });
  return <>
    <group ref={group} position={[0, 0, -36]}>
      <PortalSegments progressRef={progressRef} />
      <PortalTunnel progressRef={progressRef} />
      <PortalEnergy progressRef={progressRef} />
      <FrostGap progressRef={progressRef} reducedMotion={reducedMotion} />
      {Array.from({ length: size.width < 768 ? 4 : 8 }, (_, i) => <mesh key={i} position={[Math.cos(i * Math.PI / 4) * 2.96, Math.sin(i * Math.PI / 4) * 2.96, 0.35]} rotation={[0, 0, i * Math.PI / 4]}><boxGeometry args={[0.17, 0.28, 0.22]} /><meshStandardMaterial color="#aab9c7" roughness={0.5} metalness={0.4} /></mesh>)}
    </group>
    <CircularPlatform />
  </>;
}
