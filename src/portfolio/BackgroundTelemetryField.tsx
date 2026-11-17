import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const TELEMETRY_STRINGS = [
  ['(55)  DATA    00.001  22', 'PRE-LOAD  OFF/2'],
  ['01  DEFI   5.2024', '00.001  //  PORTFOLIO'],
  ['002  NON-FUNGIBLE TOKEN', 'ARCHIVE.NODE  01-02'],
  ['PRE-LOAD  OFF/2', 'THERMAL  -04.47'],
  ['SYS.IGLOO  //  VOID', 'LAYER  02.441'],
  ['CRYOGEN  00.001  22', 'IP.PROTOCOL  //  ACTIVE'],
] as const;

interface PlaquePlacement {
  texIdx: number;
  basePos: [number, number, number];
  scale: [number, number];
  driftSpeed: number;
  phase: number;
  baseOpacity: number;
}

const PLAQUES: PlaquePlacement[] = [
  { texIdx: 0, basePos: [-4.8, 0.85, -7.5], scale: [6.4, 2.1], driftSpeed: 0.14, phase: 0.2, baseOpacity: 0.42 },
  { texIdx: 1, basePos: [5.4, -1.65, -9.2], scale: [6.2, 2.0], driftSpeed: 0.11, phase: 1.4, baseOpacity: 0.36 },
  { texIdx: 2, basePos: [-5.8, -1.9, -12.5], scale: [6.8, 2.2], driftSpeed: 0.09, phase: 2.3, baseOpacity: 0.34 },
  { texIdx: 3, basePos: [4.9, 2.05, -14.2], scale: [6.4, 2.0], driftSpeed: 0.12, phase: 3.1, baseOpacity: 0.38 },
  { texIdx: 0, basePos: [-5.5, 1.4, -20.5], scale: [6.8, 2.2], driftSpeed: 0.13, phase: 0.9, baseOpacity: 0.42 },
  { texIdx: 1, basePos: [5.3, 0.25, -22.2], scale: [7.2, 2.3], driftSpeed: 0.10, phase: 4.1, baseOpacity: 0.40 },
  { texIdx: 3, basePos: [-5.2, -1.8, -24.8], scale: [6.6, 2.1], driftSpeed: 0.11, phase: 5.2, baseOpacity: 0.35 },
  { texIdx: 4, basePos: [4.4, -2.05, -27.0], scale: [6.4, 2.0], driftSpeed: 0.08, phase: 2.0, baseOpacity: 0.32 },
  { texIdx: 5, basePos: [-4.6, 1.8, -30.5], scale: [7.0, 2.2], driftSpeed: 0.12, phase: 3.8, baseOpacity: 0.36 },
  { texIdx: 2, basePos: [5.1, 1.35, -33.2], scale: [7.4, 2.3], driftSpeed: 0.09, phase: 1.1, baseOpacity: 0.32 },
  { texIdx: 4, basePos: [-4.4, -0.5, -36.5], scale: [6.8, 2.1], driftSpeed: 0.10, phase: 4.7, baseOpacity: 0.30 },
];

function createBlurredTelemetryTexture(line1: string, line2: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 240;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.filter = 'blur(6px)';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.72)';
    ctx.font = '500 38px "IBM Plex Mono", ui-monospace, monospace';
    ctx.textBaseline = 'top';
    ctx.fillText(line1, 36, 48);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.56)';
    ctx.fillText(line2, 48, 122);
    ctx.filter = 'none';
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

interface BackgroundTelemetryFieldProps {
  detailBlendRef: React.MutableRefObject<number>;
  reducedMotion: boolean;
}

/**
 * Faint oversized out-of-focus technical telemetry plaques drifting through 3D depth
 * across the pale steel-grey portfolio space.
 */
export function BackgroundTelemetryField({
  detailBlendRef,
  reducedMotion,
}: BackgroundTelemetryFieldProps) {
  const meshRefs = useRef<(THREE.Mesh | null)[]>([]);
  const matRefs = useRef<(THREE.MeshBasicMaterial | null)[]>([]);

  const textures = useMemo(
    () => TELEMETRY_STRINGS.map(([l1, l2]) => createBlurredTelemetryTexture(l1, l2)),
    [],
  );

  useEffect(() => {
    return () => {
      textures.forEach((t) => t.dispose());
    };
  }, [textures]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const detailFade = 1 - detailBlendRef.current * 0.72;

    for (let i = 0; i < PLAQUES.length; i++) {
      const p = PLAQUES[i];
      const mesh = meshRefs.current[i];
      const mat = matRefs.current[i];
      if (mesh && !reducedMotion) {
        mesh.position.x = p.basePos[0] + Math.sin(t * p.driftSpeed + p.phase) * 0.55;
        mesh.position.y = p.basePos[1] + Math.cos(t * (p.driftSpeed * 0.8) + p.phase) * 0.22;
      }
      if (mat) {
        mat.opacity = p.baseOpacity * detailFade;
      }
    }
  });

  return (
    <group>
      {PLAQUES.map((p, idx) => (
        <mesh
          key={idx}
          ref={(el) => {
            meshRefs.current[idx] = el;
          }}
          position={p.basePos}
          scale={[p.scale[0], p.scale[1], 1]}
          renderOrder={-2}
        >
          <planeGeometry args={[1, 1]} />
          <meshBasicMaterial
            ref={(el) => {
              matRefs.current[idx] = el;
            }}
            map={textures[p.texIdx]}
            transparent
            opacity={p.baseOpacity}
            depthWrite={false}
            fog
          />
        </mesh>
      ))}
    </group>
  );
}
