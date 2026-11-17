import * as THREE from 'three';

export const snowVertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uWindStrength;
  uniform vec3 uBounds;

  attribute float aScale;
  attribute float aSeed;
  attribute float aSpeed;

  varying float vAlpha;
  varying float vSeed;

  void main() {
    vSeed = aSeed;
    vec3 pos = position;

    // Continuous deterministic wind drift & wrap inside box volume
    float fall = mod(pos.y - uTime * aSpeed * 1.15 + uBounds.y, uBounds.y * 2.0) - uBounds.y;
    float swayX = sin(uTime * 0.45 + aSeed * 19.0 + pos.y * 0.35) * (0.45 + uWindStrength);
    float swayZ = cos(uTime * 0.38 + aSeed * 13.0 + pos.x * 0.25) * 0.4;

    pos.x = mod(pos.x + uTime * uWindStrength * (0.4 + aSpeed * 0.25) + swayX + uBounds.x, uBounds.x * 2.0) - uBounds.x;
    pos.y = fall;
    pos.z = mod(pos.z + swayZ + uBounds.z, uBounds.z * 2.0) - uBounds.z;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;

    float dist = max(1.5, -mvPosition.z);
    gl_PointSize = clamp((aScale * 38.0 * uPixelRatio) / dist, 1.5, 16.0);

    // Softly fade snow near camera and far boundary
    float nearFade = smoothstep(1.2, 4.5, dist);
    float farFade = 1.0 - smoothstep(22.0, 46.0, dist);
    vAlpha = nearFade * farFade * (0.45 + 0.4 * sin(uTime * 1.2 + aSeed * 31.0));
  }
`;

export const snowFragmentShader = /* glsl */ `
  precision mediump float;

  uniform float uOpacity;
  varying float vAlpha;
  varying float vSeed;

  void main() {
    vec2 centered = gl_PointCoord - vec2(0.5);
    float d = length(centered);
    if (d > 0.5) discard;

    float soft = smoothstep(0.5, 0.08, d);
    vec3 col = mix(vec3(0.84, 0.90, 0.97), vec3(1.0), smoothstep(0.28, 0.0, d));
    gl_FragColor = vec4(col, soft * vAlpha * uOpacity * 0.82);
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
      uBounds: { value: new THREE.Vector3(24, 14, 24) },
      uOpacity: { value: 1.0 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
}
