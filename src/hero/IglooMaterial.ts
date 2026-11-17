import * as THREE from 'three';
import { createSeededRandom, fbm2D } from '../utils/noise';

let cachedFrostBump: THREE.DataTexture | null = null;
let cachedBrickRoughness: THREE.DataTexture | null = null;

export function getFrostBumpTexture(): THREE.DataTexture {
  if (cachedFrostBump) return cachedFrostBump;

  const size = 256;
  const data = new Uint8Array(size * size * 4);
  const rand = createSeededRandom(7781);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const nx = x / size;
      const ny = y / size;
      const px = Math.cos(nx * Math.PI * 2) * 2.4;
      const py = Math.sin(ny * Math.PI * 2) * 2.4;
      const f = fbm2D(px + 3.1, py + 7.4, 4);
      const grain = (rand() - 0.5) * 0.09;
      const v = Math.max(0, Math.min(255, Math.floor((0.5 + f * 0.44 + grain) * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.needsUpdate = true;
  cachedFrostBump = tex;
  return tex;
}

export function getBrickRoughnessTexture(): THREE.DataTexture {
  if (cachedBrickRoughness) return cachedBrickRoughness;

  const size = 256;
  const data = new Uint8Array(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 4.5;
      const v = (y / size) * 4.5;
      const f = fbm2D(u + 9.2, v - 3.7, 4);
      const val = Math.max(70, Math.min(210, Math.floor((0.46 + f * 0.36) * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1.5, 1.5);
  tex.needsUpdate = true;
  cachedBrickRoughness = tex;
  return tex;
}

export interface IglooMaterialUniforms {
  uTime: { value: number };
  uRevealHeight: { value: number };
  uInnerGlow: { value: number };
  uSeamBoost: { value: number };
  uWireEdge: { value: number };
}

/**
 * Weathered cold grey-blue stone/ice masonry material matching uploaded_media_1 & 2:
 * - Mid-dark weathered granite-ice block faces (#768092 -> #9BA4B4 sRGB)
 * - Bright luminous white mortar seams & beveled edges
 * - Bottom-to-top materialization reveal wipe with crystallization rim
 * - Shallow surface cracks, frost bump relief, and displacement glow
 */
export function createIglooBrickMaterial(): {
  material: THREE.MeshPhysicalMaterial;
  uniforms: IglooMaterialUniforms;
} {
  const uniforms: IglooMaterialUniforms = {
    uTime: { value: 0 },
    uRevealHeight: { value: -0.5 },
    uInnerGlow: { value: 0 },
    uSeamBoost: { value: 0 },
    uWireEdge: { value: 1 },
  };

  const bumpMap = getFrostBumpTexture();
  const roughnessMap = getBrickRoughnessTexture();

  const material = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#FFFFFF'),
    roughness: 0.85,
    roughnessMap,
    metalness: 0.04,
    clearcoat: 0.03,
    clearcoatRoughness: 0.65,
    bumpMap,
    bumpScale: 0.014,
    sheen: 0.06,
    sheenRoughness: 0.75,
    sheenColor: new THREE.Color('#B8CEE6'),
    emissive: new THREE.Color('#D5ECFF'),
    emissiveIntensity: 0.015,
  });

  material.customProgramCacheKey = () => 'igloo-masonry-physical-v8';

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uniforms.uTime;
    shader.uniforms.uRevealHeight = uniforms.uRevealHeight;
    shader.uniforms.uInnerGlow = uniforms.uInnerGlow;
    shader.uniforms.uSeamBoost = uniforms.uSeamBoost;
    shader.uniforms.uWireEdge = uniforms.uWireEdge;

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        attribute float aGlow;
        attribute float aTone;
        varying float vBrickGlow;
        varying float vBrickTone;
        varying vec3 vLocalBrickPos;
        varying float vIglooLocalY;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vBrickGlow = aGlow;
        vBrickTone = aTone;
        vLocalBrickPos = position;
        vec4 localInIgloo = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          localInIgloo = instanceMatrix * localInIgloo;
        #endif
        vIglooLocalY = localInIgloo.y;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uRevealHeight;
        uniform float uInnerGlow;
        uniform float uSeamBoost;
        uniform float uWireEdge;
        varying float vBrickGlow;
        varying float vBrickTone;
        varying vec3 vLocalBrickPos;
        varying float vIglooLocalY;

        float crackHash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }
        float crackNoise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          return mix(
            mix(crackHash(i), crackHash(i + vec2(1.0, 0.0)), f.x),
            mix(crackHash(i + vec2(0.0, 1.0)), crackHash(i + vec2(1.0, 1.0)), f.x),
            f.y
          );
        }`,
      )
      .replace(
        '#include <clipping_planes_fragment>',
        `#include <clipping_planes_fragment>
        float revealJitter = (crackNoise(vLocalBrickPos.xz * 7.5 + vBrickTone * 11.0) - 0.5) * 0.16;
        // Reveal only during construction. Finished bricks may float above this plane.
        if (uRevealHeight < 3.34 && vIglooLocalY + revealJitter > uRevealHeight) discard;`,
      )
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        // Calibrated frosted silver-slate masonry (more whitish frosted highlight, crisp seams, uploaded_media_1794805197696)
        vec3 darkStone = vec3(0.072, 0.088, 0.118);
        vec3 frostedStone = vec3(0.225, 0.255, 0.31);
        float texVar = crackNoise(vLocalBrickPos.xy * 6.5 + vBrickTone * 9.0);
        float microGrain = crackNoise(vLocalBrickPos.xy * 18.0 - vBrickTone * 5.0);
        float heightDust = smoothstep(0.08, 0.46, vLocalBrickPos.y) * 0.28;
        diffuseColor.rgb = mix(darkStone, frostedStone, clamp(vBrickTone * 0.44 + texVar * 0.34 + microGrain * 0.12 + heightDust, 0.0, 1.0));

        // Subtle stone patina cracks & weathered relief
        vec2 cUv = vLocalBrickPos.xy * 6.8 + vec2(vLocalBrickPos.z * 3.4, vBrickTone * 13.0);
        float c1 = abs(crackNoise(cUv) - 0.5);
        float c2 = abs(crackNoise(cUv * 2.7 + 4.1) - 0.5);
        float shallowCrack = (1.0 - smoothstep(0.0, 0.045, c1)) * 0.55 + (1.0 - smoothstep(0.0, 0.032, c2)) * 0.45;
        diffuseColor.rgb *= (1.0 - shallowCrack * 0.22);

        // True PERIMETER edge ridge distance (second-largest axis component -> 1.0 ONLY along 12 beveled edges!)
        vec3 ap = abs(vLocalBrickPos);
        float hiAx = max(ap.x, max(ap.y, ap.z));
        float loAx = min(ap.x, min(ap.y, ap.z));
        float edgeSecond = (ap.x + ap.y + ap.z) - hiAx - loAx;
        float fineBorder = smoothstep(0.415, 0.456, edgeSecond);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.93, 0.99), fineBorder * (0.36 + 0.48 * uWireEdge));`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#include <emissivemap_fragment>
        vec3 vDir = normalize(vViewPosition);
        float fresnel = pow(1.0 - saturate(abs(dot(normal, vDir))), 2.8);

        vec3 eAp = abs(vLocalBrickPos);
        float eHi = max(eAp.x, max(eAp.y, eAp.z));
        float eLo = min(eAp.x, min(eAp.y, eAp.z));
        float eSecond = (eAp.x + eAp.y + eAp.z) - eHi - eLo;
        float fineSeam = smoothstep(0.418, 0.458, eSecond);
        float softBevel = smoothstep(0.34, 0.45, eSecond);
        float innerFaceMask = (1.0 - smoothstep(-0.45, 0.15, vLocalBrickPos.z));

        float distReveal = uRevealHeight - vIglooLocalY;
        float revealBand = (1.0 - smoothstep(0.0, 0.28, distReveal)) * step(0.0, distReveal) * (1.0 - smoothstep(2.95, 3.3, uRevealHeight));

        // Fine hairline silver-white seams in steady state + traveling diagonal wave seam luminance
        float seamLum = fineSeam * (0.2 + uWireEdge * 0.48 + uSeamBoost * 0.28 + vBrickGlow * 0.62) + softBevel * vBrickGlow * 0.42;
        float coreLeak = (uInnerGlow + vBrickGlow * 0.45) * (innerFaceMask * 0.26 + fineSeam * 0.18);

        totalEmissiveRadiance += vec3(0.94, 0.97, 0.98) * (seamLum + coreLeak + fresnel * (0.04 + vBrickGlow * 0.36));
        totalEmissiveRadiance += vec3(1.0) * revealBand * 1.15;`,
      );
  };

  return { material, uniforms };
}
