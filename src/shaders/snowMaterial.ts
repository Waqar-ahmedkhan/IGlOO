import * as THREE from 'three';

export const snowVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uWindStrength;
  uniform float uWindOffset;
  uniform vec3 uBounds;

  attribute float aScale;
  attribute float aSeed;
  attribute float aSpeed;
  attribute float aLayer;

  varying float vAlpha;
  varying float vSeed;
  varying float vLayer;

  void main() {
    vSeed = aSeed;
    vLayer = aLayer;
    vec3 pos = position;

    // Depth-dependent horizontal wind velocity & turbulence across 3 layers (0=BG, 1=Mid, 2=FG)
    float layerHoriz = 1.0 + aLayer * 0.48;
    float fall = mod(pos.y - uTime * aSpeed * (1.05 - aLayer * 0.12) + uBounds.y, uBounds.y * 2.0) - uBounds.y;
    float swayX = sin(uTime * (0.42 + aLayer * 0.18) + aSeed * 19.0 + pos.y * 0.35) * (0.45 + uWindStrength * layerHoriz);
    float swayY = cos(uTime * 0.65 + aSeed * 23.0 + pos.x * 0.4) * (0.08 + aLayer * 0.06);
    float swayZ = cos(uTime * 0.38 + aSeed * 13.0 + pos.x * 0.25) * (0.35 + aLayer * 0.15);

    pos.x = mod(pos.x + uWindOffset * (0.42 + aSpeed * 0.28) * layerHoriz + swayX + uBounds.x, uBounds.x * 2.0) - uBounds.x;
    pos.y = fall + swayY;
    pos.z = mod(pos.z + swayZ + uBounds.z, uBounds.z * 2.0) - uBounds.z;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float dist = max(1.2, -mvPosition.z);
    float fgScaleBoost = aLayer > 1.5 ? 1.85 : (aLayer > 0.5 ? 1.15 : 0.82);
    float maxPt = aLayer > 1.5 ? 12.5 : 7.0;
    gl_PointSize = clamp((aScale * fgScaleBoost * 34.0 * uPixelRatio) / dist, 0.85, maxPt);

    // Softly fade snow near camera and far boundary + variable lifetime shimmer
    float nearFade = smoothstep(0.9, 3.8, dist);
    float farFade = 1.0 - smoothstep(22.0, 48.0, dist);
    float layerAlpha = aLayer > 1.5 ? 0.38 : (aLayer > 0.5 ? 0.68 : 0.42);
    vAlpha = nearFade * farFade * layerAlpha * (0.72 + 0.28 * sin(uTime * 0.45 + aSeed * 31.0));
  }
`;

export const snowFragmentShader = /* glsl */ `
  precision mediump float;

  uniform float uOpacity;
  varying float vAlpha;
  varying float vSeed;
  varying float vLayer;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float d = length(centered);
    if (d > 0.5) discard;

    // Foreground particles (vLayer > 1.5) have a softer, out-of-focus bokeh falloff
    float innerEdge = vLayer > 1.5 ? 0.0 : 0.08;
    float soft = pow(1.0 - smoothstep(innerEdge, 0.5, d), vLayer > 1.5 ? 1.65 : 1.1);
    vec3 col = mix(vec3(0.84, 0.90, 0.97), vec3(1.0), (1.0 - smoothstep(0.0, 0.28, d)));
    gl_FragColor = vec4(col, soft * vAlpha * uOpacity * 0.68);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

export function createSnowParticleMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: snowVertexShader,
    fragmentShader: snowFragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPixelRatio: { value: 1 },
      uWindStrength: { value: 0.45 },
      uWindOffset: { value: 0 },
      uBounds: { value: new THREE.Vector3(24, 14, 24) },
      uOpacity: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}
