import * as THREE from 'three';

export interface FrostTransitionUniforms {
  [uniform: string]: THREE.IUniform;
  tFrom: { value: THREE.Texture | null };
  tTo: { value: THREE.Texture | null };
  uProgress: { value: number };
  uDirection: { value: number };
  uVelocity: { value: number };
  uTime: { value: number };
  uAspect: { value: number };
}

/**
 * Dual-RenderTarget post-composite shader implementing Phase 1 State D -> E:
 * 1. Jagged diagonal frost & ice-fog wipe rising from the lower viewport upward
 * 2. Procedural ice-fracture noise & soft frosted UV displacement
 * 3. Localized red / cyan / amber chromatic aberration along the frost frontier
 * 4. Restrained digital block-displacement near the edge
 * 5. Subtle vertical parallax between outgoing hero and incoming atmospheric scene
 */
export function createFrostTransitionMaterial(): {
  material: THREE.ShaderMaterial;
  uniforms: FrostTransitionUniforms;
} {
  const uniforms: FrostTransitionUniforms = {
    tFrom: { value: null },
    tTo: { value: null },
    uProgress: { value: 0 },
    uDirection: { value: 1 },
    uVelocity: { value: 0 },
    uTime: { value: 0 },
    uAspect: { value: 1.6 },
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position.xy, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tFrom;
      uniform sampler2D tTo;
      uniform float uProgress;
      uniform float uDirection;
      uniform float uVelocity;
      uniform float uTime;
      uniform float uAspect;

      varying vec2 vUv;

      float hash21(vec2 p) {
        p = fract(p * vec2(127.1, 311.7));
        p += dot(p, p + 41.37);
        return fract(p.x * p.y);
      }

      float noise2(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        return mix(
          mix(hash21(i), hash21(i + vec2(1.0, 0.0)), f.x),
          mix(hash21(i + vec2(0.0, 1.0)), hash21(i + vec2(1.0, 1.0)), f.x),
          f.y
        );
      }

      float fbm(vec2 p) {
        float v = 0.0;
        float a = 0.5;
        for (int i = 0; i < 4; i++) {
          v += a * noise2(p);
          p = p * 2.13 + vec2(1.7, -2.3);
          a *= 0.5;
        }
        return v;
      }

      void main() {
        float p = clamp(uProgress, 0.0, 1.0);
        float bell = sin(p * 3.14159265);
        float velBoost = clamp(abs(uVelocity) * 6.0, 0.0, 1.0);

        // Ice-fracture coordinates (rises from lower viewport upward with irregular diagonal front)
        vec2 aspectUv = vec2((vUv.x - 0.5) * uAspect, vUv.y);
        float diagField = vUv.y * 0.86 + (vUv.x - 0.5) * 0.24;
        float fracMacro = (fbm(aspectUv * 4.8 + vec2(0.0, -uTime * 0.08)) - 0.5) * 0.26;
        float fracMicro = (fbm(aspectUv * 19.0 + vec2(2.3, 1.1)) - 0.5) * 0.09;
        float crystalSurface = diagField + fracMacro + fracMicro;

        // Sweep threshold upward from below viewport (-0.24 -> 1.16)
        float frontier = mix(-0.24, 1.16, p);
        float toWeight = 1.0 - smoothstep(frontier - 0.13, frontier + 0.13, crystalSurface);

        // Concentrated activity right around the active diagonal frost edge
        float edgeBand = smoothstep(0.22, 0.0, abs(crystalSurface - frontier)) * bell;
        float outerCorner = smoothstep(0.32, 0.92, length(vUv - 0.5)) * bell;

        // Restrained digital block-displacement concentrated along the transition boundary
        vec2 blockGrid = floor(vUv * vec2(42.0, 28.0));
        float blockSeed = hash21(blockGrid + floor(uTime * 8.0) * 0.01);
        float blockMask = step(0.62, blockSeed) * (edgeBand * 0.88 + bell * 0.25);
        vec2 blockOffset = vec2(
          (hash21(blockGrid + 4.7) - 0.5) * 0.042,
          (hash21(blockGrid + 11.3) - 0.5) * 0.018
        ) * blockMask;

        // Soft frost refractive displacement along the wavy ice edge
        vec2 frostRefract = vec2(
          (fbm(aspectUv * 12.0 + 1.4) - 0.5),
          (fbm(aspectUv * 12.0 - 3.8) - 0.5)
        ) * (0.014 * edgeBand + 0.005 * bell);

        // Slight zoom + vertical parallax inside safe UV margins (zero top/bottom border clamp stretching)
        vec2 zoomedFrom = (vUv - 0.5) * (1.0 - p * 0.065) + 0.5;
        vec2 zoomedTo = (vUv - 0.5) * (1.0 - (1.0 - p) * 0.05) + 0.5;
        vec2 fromUv = clamp(zoomedFrom + blockOffset + frostRefract + vec2(0.0, -p * 0.018 * uDirection), 0.002, 0.998);
        vec2 toUv = clamp(zoomedTo + blockOffset * 0.45 + frostRefract * 0.5 + vec2(0.0, (1.0 - p) * 0.015 * uDirection), 0.002, 0.998);

        // Localized Red / Cyan / Amber chromatic aberration near the frost fog boundary
        float caAmount = (edgeBand * 0.014 + outerCorner * 0.006 + velBoost * 0.004) * bell;
        vec2 caVec = normalize((vUv - vec2(0.5, frontier)) + vec2(0.002, 0.001)) * caAmount;
        vec2 amberVec = vec2(-caVec.y, caVec.x) * 0.55;

        float rFrom = texture2D(tFrom, clamp(fromUv + caVec, 0.001, 0.999)).r;
        float gFrom = texture2D(tFrom, fromUv).g;
        float bFrom = texture2D(tFrom, clamp(fromUv - caVec, 0.001, 0.999)).b;
        float amberFrom = texture2D(tFrom, clamp(fromUv + amberVec, 0.001, 0.999)).r;
        vec3 colFrom = vec3(mix(rFrom, amberFrom, edgeBand * 0.35), gFrom * (1.0 - edgeBand * 0.04) + amberFrom * edgeBand * 0.14, bFrom);

        vec3 colTo;
        colTo.r = texture2D(tTo, clamp(toUv + caVec * 0.55, 0.001, 0.999)).r;
        colTo.g = texture2D(tTo, toUv).g;
        colTo.b = texture2D(tTo, clamp(toUv - caVec * 0.55, 0.001, 0.999)).b;

        vec3 composited = mix(colFrom, colTo, toWeight);

        // Thick pale-grey spatial ice fog billowing up across the frontier from below
        float fogWisp = fbm(aspectUv * 3.4 - vec2(uTime * 0.05, p * 1.2));
        float lowerMist = smoothstep(1.05, 0.0, vUv.y + fracMacro * 0.6) * bell;
        float mistAmount = clamp((edgeBand * 0.65 + lowerMist * 0.55) * (0.55 + fogWisp * 0.65), 0.0, 0.82);
        vec3 fogTint = vec3(0.42, 0.45, 0.51);
        composited = mix(composited, fogTint, mistAmount);

        gl_FragColor = vec4(composited, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    depthTest: false,
    depthWrite: false,
  });

  return { material, uniforms };
}
