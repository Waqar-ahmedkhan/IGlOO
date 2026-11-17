import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { createIglooWireframeGeometry, type IglooBrickMeta } from './IglooGeometry';
import { introStage } from './heroStore';
import type { HeroExitSignals } from '../experience/HeroExitAnimation';

interface IglooWireframeProps {
  bricks: IglooBrickMeta[];
  exitSignalsRef?: React.MutableRefObject<HeroExitSignals>;
}

/**
 * Renders the igloo wireframe masonry seams + arched entrance contours + the radiant white
 * dome core cap visible during construction (uploaded_media_0 -> uploaded_media_1) and activation.
 */
export function IglooWireframe({ bricks, exitSignalsRef }: IglooWireframeProps) {
  const coreLightRef = useRef<THREE.PointLight>(null);
  const coreOrbRef = useRef<THREE.Sprite>(null);
  const entranceOrbRef = useRef<THREE.Sprite>(null);
  const vestibuleRef = useRef<THREE.Mesh>(null);

  const { lineGeometry, pointGeometry } = useMemo(
    () => createIglooWireframeGeometry(bricks),
    [bricks],
  );

  const lineMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aOrder;
          varying float vOrder;
          void main() {
            vOrder = aOrder;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uReveal;
          uniform float uOpacity;
          uniform float uTime;
          varying float vOrder;
          void main() {
            if (vOrder > uReveal) discard;
            float tipGlow = smoothstep(0.12, 0.0, uReveal - vOrder);
            float flicker = 0.93 + 0.07 * sin(uTime * 15.0 + vOrder * 39.0);
            float alpha = uOpacity * (0.72 + 0.28 * tipGlow) * flicker;
            gl_FragColor = vec4(vec3(0.98, 0.99, 1.0), clamp(alpha, 0.0, 0.95));
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  const pointMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uReveal: { value: 0 },
          uOpacity: { value: 0 },
        },
        vertexShader: /* glsl */ `
          attribute float aOrder;
          uniform float uReveal;
          varying float vVisible;
          void main() {
            vVisible = step(aOrder, uReveal);
            vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mvPosition;
            gl_PointSize = clamp(24.0 / max(2.0, -mvPosition.z), 2.0, 4.8);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uOpacity;
          varying float vVisible;
          void main() {
            if (vVisible < 0.5) discard;
            vec2 c = gl_PointCoord - 0.5;
            if (length(c) > 0.5) discard;
            gl_FragColor = vec4(1.0, 1.0, 1.0, uOpacity * 0.9);
          }
        `,
        transparent: true,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  // Bright luminous white core dome cap (matches the blazing white rising top core in uploaded_media_0)
  const coreCapMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uCapOpacity: { value: 0 },
          uCutY: { value: 1.0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vLocal;
          void main() {
            vLocal = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uCapOpacity;
          uniform float uCutY;
          varying vec3 vLocal;
          void main() {
            if (uCapOpacity < 0.01) discard;
            // Bright luminous white upper dome core glow (uploaded_media_0) without masking tunnel
            float radNorm = length(vLocal.xz) / 2.26;
            float mask = smoothstep(uCutY - 0.18, uCutY + 0.12, vLocal.y) * smoothstep(1.02, 0.62, radNorm * 0.92);
            float alpha = uCapOpacity * mask;
            if (alpha < 0.01) discard;
            gl_FragColor = vec4(vec3(1.0, 1.0, 1.0), clamp(alpha, 0.0, 0.96));
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        fog: false,
      }),
    [],
  );

  // Soft interior shell glowing through seams after brick materialization
  const innerShellMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uIntensity: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: /* glsl */ `
          varying vec3 vLocal;
          void main() {
            vLocal = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          uniform float uIntensity;
          uniform float uTime;
          varying vec3 vLocal;
          void main() {
            if (vLocal.z > 1.05 && abs(vLocal.x) < 1.12 && vLocal.y < 1.38) discard;
            float phi = atan(vLocal.y, length(vLocal.xz));
            float theta = atan(vLocal.x, vLocal.z);
            float rowCoord = (phi / 1.5708) * 4.5;
            float rowIdx = floor(rowCoord);
            float stagger = mod(rowIdx, 2.0) * 0.5;
            float colCoord = (theta / 6.28318 + 0.5) * mix(13.0, 5.0, rowCoord / 4.5) + stagger;

            float seamH = 1.0 - smoothstep(0.03, 0.11, abs(fract(rowCoord) - 0.5));
            float seamV = 1.0 - smoothstep(0.03, 0.11, abs(fract(colCoord) - 0.5));
            float brickGrid = max(seamH, seamV);

            float heightGrad = smoothstep(0.0, 2.25, vLocal.y);
            float pulse = 0.95 + 0.05 * sin(uTime * 1.4);
            vec3 col = mix(vec3(0.86, 0.93, 1.0), vec3(1.0), 0.45 + brickGrid * 0.55);
            float alpha = (0.34 + heightGrad * 0.36 + brickGrid * 0.28) * uIntensity * pulse;
            gl_FragColor = vec4(col, clamp(alpha, 0.0, 0.92));
          }
        `,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  );

  const glowTexture = useMemo(() => {
    const texSize = 128;
    const data = new Uint8Array(texSize * texSize * 4);
    for (let y = 0; y < texSize; y++) {
      for (let x = 0; x < texSize; x++) {
        const dx = (x / (texSize - 1) - 0.5) * 2;
        const dy = (y / (texSize - 1) - 0.5) * 2;
        const r = Math.min(1, Math.sqrt(dx * dx + dy * dy));
        const a = Math.exp(-r * r * 4.5) * 255;
        const idx = (y * texSize + x) * 4;
        data[idx] = 238;
        data[idx + 1] = 246;
        data[idx + 2] = 255;
        data[idx + 3] = Math.round(a);
      }
    }
    const tex = new THREE.DataTexture(data, texSize, texSize, THREE.RGBAFormat);
    tex.needsUpdate = true;
    return tex;
  }, []);

  useEffect(() => {
    return () => {
      lineGeometry.dispose();
      pointGeometry.dispose();
      lineMaterial.dispose();
      pointMaterial.dispose();
      coreCapMaterial.dispose();
      innerShellMaterial.dispose();
      glowTexture.dispose();
    };
  }, [
    lineGeometry,
    pointGeometry,
    lineMaterial,
    pointMaterial,
    coreCapMaterial,
    innerShellMaterial,
    glowTexture,
  ]);

  useFrame((state) => {
    const t = state.clock.elapsedTime;
    const wireReveal = introStage.wireframeReveal;
    const wireFade = introStage.wireframeFade;
    const glow = introStage.innerGlow;
    const capBoost = introStage.coreCapBoost;
    const reconstructWire = exitSignalsRef ? exitSignalsRef.current.reconstructWireOpacity : 0;
    const activationWire = exitSignalsRef ? exitSignalsRef.current.activation * 0.34 : 0;

    const effectiveReveal = reconstructWire > 0.01 ? 1.05 : wireReveal * 1.05;
    const effectiveOpacity = Math.max(
      Math.min(1, wireReveal * 4.0) * wireFade * 0.94,
      reconstructWire,
      activationWire,
    );

    lineMaterial.uniforms.uReveal.value = effectiveReveal;
    lineMaterial.uniforms.uOpacity.value = effectiveOpacity;
    lineMaterial.uniforms.uTime.value = t;

    pointMaterial.uniforms.uReveal.value = effectiveReveal;
    pointMaterial.uniforms.uOpacity.value = effectiveOpacity * 0.94;

    // Bright upper luminous dome cap during stage 2-3 (uploaded_media_0)
    coreCapMaterial.uniforms.uCapOpacity.value = capBoost * 0.95;
    coreCapMaterial.uniforms.uCutY.value = THREE.MathUtils.lerp(1.62, 1.4, wireReveal);

    const pulse = 0.94 + 0.06 * Math.sin(t * 1.7);
    const brickPhase = Math.min(1, Math.max(0, (introStage.brickReveal - 0.2) / 0.6));
    const exitBoost = exitSignalsRef ? exitSignalsRef.current.internalGlowBoost : 0;
    innerShellMaterial.uniforms.uTime.value = t;
    innerShellMaterial.uniforms.uIntensity.value = (glow + exitBoost * 0.7) * brickPhase * 0.96;

    if (coreLightRef.current) {
      coreLightRef.current.intensity = (glow * 3.8 + exitBoost * 5.2) * pulse + capBoost * 2.2;
    }
    if (coreOrbRef.current) {
      const s = 2.4 + glow * 1.4 + capBoost * 2.2 + exitBoost * 1.6;
      coreOrbRef.current.scale.set(s, s, 1);
      coreOrbRef.current.material.opacity = Math.min(
        0.92,
        (glow * 0.22 + capBoost * 0.44 + exitBoost * 0.35) * pulse,
      );
    }
    if (entranceOrbRef.current) {
      const constructSpill = 1.0 - Math.min(1, Math.max(0, (introStage.cameraDescend - 0.1) * 1.3));
      const spillWindow = Math.min(1, introStage.brickReveal * 1.35);
      const waveDoorGlow = exitSignalsRef ? exitSignalsRef.current.activation * 0.45 : 0;
      const es = 2.4 + glow * 0.9 + waveDoorGlow * 0.8;
      entranceOrbRef.current.scale.set(es, es, 1);
      entranceOrbRef.current.material.opacity =
        (glow * spillWindow * constructSpill * 0.38 + waveDoorGlow * 0.36 + 0.08 * spillWindow) * pulse;
    }
    if (vestibuleRef.current) {
      vestibuleRef.current.visible = introStage.brickReveal > 0.35;
    }
  });

  return (
    <group>
      <lineSegments geometry={lineGeometry} material={lineMaterial} />
      <points geometry={pointGeometry} material={pointMaterial} />

      {/* Deep recessed dark interior tunnel vestibule providing genuine architectural depth */}
      <mesh
        ref={vestibuleRef}
        position={[0, 0.56, 1.92]}
        rotation={[Math.PI * 0.5, 0, 0]}
        visible={false}
      >
        <cylinderGeometry args={[0.78, 0.82, 1.15, 20, 1, false, -Math.PI * 0.52, Math.PI * 1.04]} />
        <meshStandardMaterial
          color="#090D14"
          roughness={0.96}
          metalness={0.02}
          emissive="#D8EBFA"
          emissiveIntensity={0.03}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Radiant white dome cap during wireframe phase (matches uploaded_media_0) */}
      <mesh position={[0, 0.04, 0]} material={coreCapMaterial}>
        <sphereGeometry args={[2.24, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.44]} />
      </mesh>

      {/* Luminous inner brick-lattice geodesic core (visible when bricks explode or gap) */}
      <mesh position={[0, 0.05, 0]} material={innerShellMaterial}>
        <sphereGeometry args={[2.22, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.48]} />
      </mesh>

      <pointLight
        ref={coreLightRef}
        position={[0, 1.1, 0.35]}
        color="#EDF6FF"
        intensity={0}
        distance={14}
        decay={1.6}
      />

      <sprite ref={coreOrbRef} position={[0, 1.35, 0.05]}>
        <spriteMaterial
          map={glowTexture}
          transparent
          opacity={0}
          fog={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>

      {/* Luminous glow spilling beside & out from entrance arch (matches uploaded_media_1 & 2) */}
      <sprite ref={entranceOrbRef} position={[0.45, 0.65, 2.35]}>
        <spriteMaterial
          map={glowTexture}
          transparent
          opacity={0}
          fog={false}
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </sprite>
    </group>
  );
}
