import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { portfolioHudBridge } from './portfolioStore';

interface EmbeddedSculptureProps {
  isHighlighted: boolean;
}

/**
 * Stylized 3D Pudgy Penguin figure sculpted with real volumetric Lathe & ellipsoid forms,
 * suspended inside Ice Crystal 1 so refraction bends across its curved silhouette.
 */
export function EmbeddedPenguin({ isHighlighted }: EmbeddedSculptureProps) {
  const groupRef = useRef<THREE.Group>(null);

  const { bodyGeom, materials } = useMemo(() => {
    // Plump continuous body + head profile via LatheGeometry
    const pts: THREE.Vector2[] = [
      new THREE.Vector2(0.0, -0.58),
      new THREE.Vector2(0.22, -0.55),
      new THREE.Vector2(0.37, -0.44),
      new THREE.Vector2(0.45, -0.24),
      new THREE.Vector2(0.44, -0.02),
      new THREE.Vector2(0.37, 0.16),
      new THREE.Vector2(0.39, 0.34),
      new THREE.Vector2(0.34, 0.50),
      new THREE.Vector2(0.20, 0.60),
      new THREE.Vector2(0.0, 0.63),
    ];
    const body = new THREE.LatheGeometry(pts, 32);
    body.computeVertexNormals();

    const darkCoat = new THREE.MeshStandardMaterial({
      color: '#202838',
      roughness: 0.44,
      metalness: 0.08,
      emissive: '#101828',
      emissiveIntensity: 0.16,
    });

    const creamBelly = new THREE.MeshStandardMaterial({
      color: '#F4F0E8',
      roughness: 0.52,
      metalness: 0.02,
      emissive: '#DCE8F5',
      emissiveIntensity: 0.14,
    });

    const orangeBeak = new THREE.MeshStandardMaterial({
      color: '#ED8733',
      roughness: 0.34,
      metalness: 0.05,
      emissive: '#9B4812',
      emissiveIntensity: 0.18,
    });

    const eyeBlack = new THREE.MeshStandardMaterial({
      color: '#0A0D14',
      roughness: 0.12,
      metalness: 0.25,
    });

    const eyeCatchlight = new THREE.MeshBasicMaterial({
      color: '#FFFFFF',
    });

    const blushCheek = new THREE.MeshStandardMaterial({
      color: '#E698A2',
      roughness: 0.62,
      metalness: 0.0,
      emissive: '#9E4B58',
      emissiveIntensity: 0.1,
    });

    return {
      bodyGeom: body,
      materials: { darkCoat, creamBelly, orangeBeak, eyeBlack, eyeCatchlight, blushCheek },
    };
  }, []);

  useEffect(() => {
    return () => {
      bodyGeom.dispose();
      Object.values(materials).forEach((m) => m.dispose());
    };
  }, [bodyGeom, materials]);

  useFrame(() => {
    const boost = (isHighlighted ? 0.18 : 0) + portfolioHudBridge.detailBlend * 0.28;
    materials.darkCoat.emissiveIntensity = 0.16 + boost * 0.5;
    materials.creamBelly.emissiveIntensity = 0.14 + boost * 0.65;
    materials.orangeBeak.emissiveIntensity = 0.18 + boost * 0.55;
  });

  return (
    <group ref={groupRef} scale={[0.92, 0.92, 0.92]} position={[0, -0.02, 0]}>
      {/* Main dark slate-navy body & head */}
      <mesh geometry={bodyGeom} material={materials.darkCoat} />

      {/* Plump cream belly */}
      <mesh position={[0, -0.18, 0.22]} scale={[0.35, 0.36, 0.26]} material={materials.creamBelly}>
        <sphereGeometry args={[1, 24, 20]} />
      </mesh>

      {/* Heart-shaped cream facial lobes */}
      <mesh position={[-0.115, 0.34, 0.24]} scale={[0.20, 0.20, 0.17]} material={materials.creamBelly}>
        <sphereGeometry args={[1, 20, 16]} />
      </mesh>
      <mesh position={[0.115, 0.34, 0.24]} scale={[0.20, 0.20, 0.17]} material={materials.creamBelly}>
        <sphereGeometry args={[1, 20, 16]} />
      </mesh>
      <mesh position={[0, 0.23, 0.27]} scale={[0.24, 0.16, 0.16]} material={materials.creamBelly}>
        <sphereGeometry args={[1, 20, 16]} />
      </mesh>

      {/* Dual-lobe sculpted 3D orange beak */}
      <mesh position={[0, 0.295, 0.40]} scale={[0.105, 0.062, 0.125]} rotation={[0.18, 0, 0]} material={materials.orangeBeak}>
        <sphereGeometry args={[1, 18, 14]} />
      </mesh>
      <mesh position={[0, 0.258, 0.37]} scale={[0.082, 0.038, 0.095]} rotation={[-0.1, 0, 0]} material={materials.orangeBeak}>
        <sphereGeometry args={[1, 16, 12]} />
      </mesh>

      {/* Glossy 3D eyes + catchlights */}
      <mesh position={[-0.145, 0.385, 0.32]} scale={[0.048, 0.056, 0.042]} material={materials.eyeBlack}>
        <sphereGeometry args={[1, 14, 12]} />
      </mesh>
      <mesh position={[0.145, 0.385, 0.32]} scale={[0.048, 0.056, 0.042]} material={materials.eyeBlack}>
        <sphereGeometry args={[1, 14, 12]} />
      </mesh>
      <mesh position={[-0.132, 0.402, 0.354]} scale={0.014} material={materials.eyeCatchlight}>
        <sphereGeometry args={[1, 8, 8]} />
      </mesh>
      <mesh position={[0.158, 0.402, 0.354]} scale={0.014} material={materials.eyeCatchlight}>
        <sphereGeometry args={[1, 8, 8]} />
      </mesh>

      {/* Soft blush cheeks */}
      <mesh position={[-0.20, 0.285, 0.30]} scale={[0.055, 0.036, 0.032]} material={materials.blushCheek}>
        <sphereGeometry args={[1, 12, 10]} />
      </mesh>
      <mesh position={[0.20, 0.285, 0.30]} scale={[0.055, 0.036, 0.032]} material={materials.blushCheek}>
        <sphereGeometry args={[1, 12, 10]} />
      </mesh>

      {/* Chubby angled flippers */}
      <mesh position={[-0.43, -0.05, 0.04]} rotation={[0.12, 0.08, 0.48]} scale={[0.11, 0.28, 0.14]} material={materials.darkCoat}>
        <sphereGeometry args={[1, 16, 14]} />
      </mesh>
      <mesh position={[0.43, -0.05, 0.04]} rotation={[0.12, -0.08, -0.48]} scale={[0.11, 0.28, 0.14]} material={materials.darkCoat}>
        <sphereGeometry args={[1, 16, 14]} />
      </mesh>

      {/* Cute sculpted crown tufts */}
      <mesh position={[-0.18, 0.56, 0.01]} rotation={[0, 0, 0.35]} scale={[0.11, 0.10, 0.11]} material={materials.darkCoat}>
        <sphereGeometry args={[1, 14, 12]} />
      </mesh>
      <mesh position={[0.18, 0.56, 0.01]} rotation={[0, 0, -0.35]} scale={[0.11, 0.10, 0.11]} material={materials.darkCoat}>
        <sphereGeometry args={[1, 14, 12]} />
      </mesh>

      {/* Tucked orange feet */}
      <mesh position={[-0.16, -0.55, 0.16]} scale={[0.11, 0.055, 0.16]} material={materials.orangeBeak}>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
      <mesh position={[0.16, -0.55, 0.16]} scale={[0.11, 0.055, 0.16]} material={materials.orangeBeak}>
        <sphereGeometry args={[1, 14, 10]} />
      </mesh>
    </group>
  );
}

function createRoundedRectPath(w: number, h: number, r: number): THREE.Path {
  const hw = w * 0.5;
  const hh = h * 0.5;
  const p = new THREE.Path();
  p.moveTo(-hw + r, -hh);
  p.lineTo(hw - r, -hh);
  p.quadraticCurveTo(hw, -hh, hw, -hh + r);
  p.lineTo(hw, hh - r);
  p.quadraticCurveTo(hw, hh, hw - r, hh);
  p.lineTo(-hw + r, hh);
  p.quadraticCurveTo(-hw, hh, -hw, hh - r);
  p.lineTo(-hw, -hh + r);
  p.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
  return p;
}

/**
 * Stylized 3D extruded geometric IP emblem (beveled rounded portal frame + /P mark)
 * embedded inside Ice Crystal 2 (Overpass).
 */
export function EmbeddedOverpassEmblem({ isHighlighted }: EmbeddedSculptureProps) {
  const { frameGeom, slashGeom, pGeom, frameMat, markMat } = useMemo(() => {
    // 1. Thick rounded-square portal frame
    const outerShape = new THREE.Shape();
    const hw = 0.56;
    const hh = 0.56;
    const r = 0.15;
    outerShape.moveTo(-hw + r, -hh);
    outerShape.lineTo(hw - r, -hh);
    outerShape.quadraticCurveTo(hw, -hh, hw, -hh + r);
    outerShape.lineTo(hw, hh - r);
    outerShape.quadraticCurveTo(hw, hh, hw - r, hh);
    outerShape.lineTo(-hw + r, hh);
    outerShape.quadraticCurveTo(-hw, hh, -hw, hh - r);
    outerShape.lineTo(-hw, -hh + r);
    outerShape.quadraticCurveTo(-hw, -hh, -hw + r, -hh);

    outerShape.holes.push(createRoundedRectPath(0.76, 0.76, 0.09));

    const fGeom = new THREE.ExtrudeGeometry(outerShape, {
      depth: 0.22,
      bevelEnabled: true,
      bevelThickness: 0.032,
      bevelSize: 0.025,
      bevelSegments: 3,
      curveSegments: 24,
    });
    fGeom.center();

    // 2. Left geometric slanted slash /
    const sShape = new THREE.Shape();
    sShape.moveTo(-0.24, -0.21);
    sShape.lineTo(-0.15, -0.21);
    sShape.lineTo(-0.04, 0.21);
    sShape.lineTo(-0.13, 0.21);
    sShape.closePath();

    const sGeom = new THREE.ExtrudeGeometry(sShape, {
      depth: 0.20,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.018,
      bevelSegments: 3,
    });
    sGeom.translate(0, 0, -0.10);

    // 3. Right bold geometric P
    const pShape = new THREE.Shape();
    pShape.moveTo(0.01, -0.21);
    pShape.lineTo(0.10, -0.21);
    pShape.lineTo(0.10, -0.02);
    pShape.lineTo(0.18, -0.02);
    pShape.absarc(0.17, 0.095, 0.115, -Math.PI / 2, Math.PI / 2, false);
    pShape.lineTo(0.01, 0.21);
    pShape.closePath();

    const pHole = new THREE.Path();
    pHole.moveTo(0.10, 0.055);
    pHole.lineTo(0.16, 0.055);
    pHole.absarc(0.16, 0.095, 0.04, -Math.PI / 2, Math.PI / 2, false);
    pHole.lineTo(0.10, 0.135);
    pHole.closePath();
    pShape.holes.push(pHole);

    const pEx = new THREE.ExtrudeGeometry(pShape, {
      depth: 0.20,
      bevelEnabled: true,
      bevelThickness: 0.025,
      bevelSize: 0.018,
      bevelSegments: 3,
      curveSegments: 20,
    });
    pEx.translate(0, 0, -0.10);

    const fMat = new THREE.MeshStandardMaterial({
      color: '#465265',
      roughness: 0.34,
      metalness: 0.56,
      emissive: '#1D293B',
      emissiveIntensity: 0.22,
    });

    const mMat = new THREE.MeshStandardMaterial({
      color: '#9BA9BD',
      roughness: 0.26,
      metalness: 0.48,
      emissive: '#4D688A',
      emissiveIntensity: 0.24,
    });

    return { frameGeom: fGeom, slashGeom: sGeom, pGeom: pEx, frameMat: fMat, markMat: mMat };
  }, []);

  useEffect(() => {
    return () => {
      frameGeom.dispose();
      slashGeom.dispose();
      pGeom.dispose();
      frameMat.dispose();
      markMat.dispose();
    };
  }, [frameGeom, slashGeom, pGeom, frameMat, markMat]);

  useFrame(() => {
    const boost = (isHighlighted ? 0.25 : 0) + portfolioHudBridge.detailBlend * 0.42;
    frameMat.emissiveIntensity = 0.22 + boost * 0.45;
    markMat.emissiveIntensity = 0.24 + boost * 0.65;
  });

  return (
    <group rotation={[0.04, 0.08, -0.14]} scale={[0.92, 0.92, 0.92]}>
      <mesh geometry={frameGeom} material={frameMat} />
      <mesh geometry={slashGeom} material={markMat} />
      <mesh geometry={pGeom} material={markMat} />
    </group>
  );
}
