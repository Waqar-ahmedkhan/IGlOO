import { useEffect, useMemo } from 'react';
import { Environment, Lightformer } from '@react-three/drei';
import * as THREE from 'three';

/**
 * Muted cold blue-grey sky dome gradient + subtle directional reflections.
 */
export function SkyEnvironment() {
  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: {
          uTopColor: { value: new THREE.Color('#A2A8B5') },
          uMidColor: { value: new THREE.Color('#AEB4C0') },
          uHorizonColor: { value: new THREE.Color('#C1C7D2') },
        },
        vertexShader: /* glsl */ `
          varying vec3 vWorldDir;
          void main() {
            vec4 wp = modelMatrix * vec4(position, 1.0);
            vWorldDir = normalize(position);
            gl_Position = projectionMatrix * viewMatrix * wp;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 uTopColor;
          uniform vec3 uMidColor;
          uniform vec3 uHorizonColor;
          varying vec3 vWorldDir;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(
              mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x),
              mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x),
              f.y
            );
          }

          void main() {
            float h = clamp(vWorldDir.y, -0.2, 1.0);
            vec3 col = mix(uHorizonColor, uMidColor, smoothstep(-0.02, 0.22, h));
            col = mix(col, uTopColor, smoothstep(0.22, 0.78, h));

            // Very faint atmospheric high-altitude mist bands
            float wisp = noise(vec2(vWorldDir.x * 3.5 + 1.2, vWorldDir.y * 9.0));
            col = mix(col, uHorizonColor, wisp * 0.06 * (1.0 - smoothstep(0.0, 0.45, h)));

            gl_FragColor = vec4(col, 1.0);
            #include <colorspace_fragment>
          }
        `,
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      skyMaterial.dispose();
    };
  }, [skyMaterial]);

  return (
    <>
      <color attach="background" args={['#AEB4C0']} />

      <mesh material={skyMaterial} scale={180} frustumCulled={false}>
        <sphereGeometry args={[1, 32, 20]} />
      </mesh>

      <Environment resolution={64} frames={1}>
        <color attach="background" args={['#AEB4C0']} />
        <Lightformer
          form="rect"
          intensity={2.6}
          color="#FFFFFF"
          position={[-12, 10, 8]}
          scale={[14, 8, 1]}
          target={[0, 0, 0]}
        />
        <Lightformer
          form="rect"
          intensity={1.3}
          color="#D5ECFF"
          position={[12, 5, -8]}
          scale={[14, 8, 1]}
          target={[0, 0, 0]}
        />
      </Environment>
    </>
  );
}
